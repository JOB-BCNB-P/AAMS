/* ช่วงเกรดของหน้า PLOs ต้องมี D+ และ D ครบตามที่วิทยาลัยใช้
   และต้องตรงกับช่วงเกรดที่หน้าผลการเรียนใช้อยู่ ไม่งั้นคนเดียวกันจะได้เกรดคนละอย่าง */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const P = path.join(__dirname, '..') + path.sep;
const PL = fs.readFileSync(P + 'plo.js', 'utf8');
const APP = fs.readFileSync(P + 'app.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
function grab(sig) {
  const i = PL.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = PL.indexOf('{', i + sig.length); k < PL.length; k++) {
    if (PL[k] === '{') d++; else if (PL[k] === '}') { d--; if (!d) return PL.slice(i, k + 1); }
  }
  throw new Error('อ่านไม่จบ');
}
const line = re => (PL.match(re) || [])[0] || '';
const ctx = vm.createContext({});
vm.runInContext([
  line(/var DEF_GRADES = .*;/),
  line(/var NO_D_GRADES = .*;/),
  line(/var DEF_CFG = .*;/),
  grab('function gradeOf(pct, cfg)'),
  'function curCourseCfg() { return DEF_CFG; }'
].join('\n'), ctx);
const g = p => vm.runInContext('gradeOf(' + p + ')', ctx);
const DEF = vm.runInContext('DEF_CFG.grades', ctx);
const NOD = vm.runInContext('NO_D_GRADES', ctx);

console.log('[1] ค่าตั้งต้นต้องมี D+ และ D');
t('ค่าตั้งต้นมีครบ 8 เกรด', () => {
  const names = DEF.map(x => x[0]).join(' ');
  assert.strictEqual(names, 'A B+ B C+ C D+ D F', 'ช่วงเกรดไม่ครบ · พบ ' + names);
});
t('D+ เริ่มที่ 55 และ D เริ่มที่ 50', () => {
  const m = Object.fromEntries(DEF);
  assert.strictEqual(m['D+'], 55);
  assert.strictEqual(m['D'], 50);
});
t('เรียงจากมากไปน้อย และตัวสุดท้ายเริ่มที่ 0', () => {
  for (let i = 1; i < DEF.length; i++) assert.ok(DEF[i][1] < DEF[i - 1][1], 'ลำดับผิดที่ ' + DEF[i][0]);
  assert.strictEqual(DEF[DEF.length - 1][1], 0, 'คะแนนต่ำสุดจะไม่ได้เกรดอะไรเลย');
});

console.log('\n[2] ตัดเกรดได้ถูกช่วง');
t('คะแนนในช่วง D+ และ D ได้เกรดตามนั้น ไม่ตกเป็น F', () => {
  assert.strictEqual(g(59.99), 'D+');
  assert.strictEqual(g(55), 'D+');
  assert.strictEqual(g(54.99), 'D');
  assert.strictEqual(g(50), 'D');
  assert.strictEqual(g(49.99), 'F');
});
t('ขอบบนยังถูกเหมือนเดิม', () => {
  assert.strictEqual(g(80), 'A');
  assert.strictEqual(g(79.99), 'B+');
  assert.strictEqual(g(60), 'C');
});
t('ค่าที่ไม่มีคะแนน ไม่ได้เกรด', () => assert.strictEqual(g(null), ''));

console.log('\n[3] ชุดสำเร็จรูปแบบไม่มี D');
t('ยังเลือกชุดไม่มี D+/D ได้ สำหรับรายวิชาที่ใช้เกณฑ์นั้น', () => {
  assert.strictEqual(NOD.map(x => x[0]).join(' '), 'A B+ B C+ C F');
  assert.ok(/k === 'nod' \? NO_D_GRADES : DEF_GRADES/.test(PL), 'ปุ่มชุดสำเร็จรูปไม่ได้ชี้ไปชุดที่ถูก');
});
t('ปุ่มในหน้าจอบอกชัดว่าชุดไหนมี D', () => {
  assert.ok(/มาตรฐาน A–F \(มี D\+ ≥55 · D ≥50\)/.test(PL), 'ปุ่มชุดมาตรฐานไม่ได้บอกว่ามี D');
  assert.ok(/ไม่มี D\+\/D \(ต่ำกว่า C เป็น F\)/.test(PL), 'ปุ่มชุดไม่มี D ไม่ได้บอกผลที่ตามมา');
});

console.log('\n[4] ตรงกับส่วนอื่นของระบบ');
t('ค่าคะแนนเกรดในหน้าผลการเรียนมี D+ และ D อยู่แล้ว', () => {
  const m = APP.match(/const GRADE_POINTS = \{[^}]*\}/);
  assert.ok(m, 'ไม่พบตารางค่าคะแนน');
  ['D+', 'D'].forEach(k => assert.ok(m[0].includes("'" + k + "'"), 'ขาด ' + k));
});
t('ชื่อเกรดทุกตัวในค่าตั้งต้น มีค่าคะแนนรองรับในหน้าผลการเรียน', () => {
  const m = APP.match(/const GRADE_POINTS = \{[^}]*\}/)[0];
  const miss = DEF.map(x => x[0]).filter(k => !m.includes("'" + k + "'"));
  assert.strictEqual(miss.length, 0, 'ส่งเกรดเข้าหน้าผลการเรียนแล้วคิด GPA ไม่ได้ : ' + miss.join(' '));
});
t('ป้ายเกรด D แยกสีจาก B และ C เห็นได้ว่าใกล้ตก', () =>
  assert.ok(/\/\^D\/\.test\(g\) \? 'bg-amber-50 text-amber-700'/.test(PL), 'D ใช้สีเดียวกับเกรดกลาง ๆ'));

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
