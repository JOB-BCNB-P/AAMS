/* ถ่วงน้ำหนักรายส่วน (ทฤษฎี/ทดลอง) ตามหน่วยกิต — หน้าจอ · CSV · ไฟล์ Excel */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const SRC = fs.readFileSync(P + 'plo.js', 'utf8');
const TW = fs.readFileSync(P + 'tailwind.css', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

/* ดึงฟังก์ชันออกมาทดสอบตรง ๆ ด้วยการนับวงเล็บปีกกา */
function grab(sig) {
  const i = SRC.indexOf(sig);
  assert.ok(i >= 0, 'ไม่พบ ' + sig);
  let d = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  throw new Error('อ่าน ' + sig + ' ไม่จบ');
}
const helpers = `
  function s(v){return String(v==null?'':v).trim();}
  function n(v){var x=parseFloat(v);return isFinite(x)?x:0;}
  function f2(v){return v==null?'':(Math.round(v*100)/100).toString();}
`;
const sandbox = {};
vm.createContext(sandbox);
new vm.Script(helpers
  + grab('function secMultOf(cfg, sec)')
  + grab('function hasSecMult(cfg, secs)')
  + grab('function suggestSecMult(subj, secs)')
  + grab('function creditText(subj)')
).runInContext(sandbox);
const { secMultOf, hasSecMult, suggestSecMult, creditText } = sandbox;

const SECS = ['ทฤษฎี', 'ทดลอง'];
/* คิดร้อยละแบบเดียวกับในโค้ดจริง
   ตั้งตัวคูณ  : คิดแต่ละส่วนเป็นร้อยละ 100 ก่อน แล้ว Σ(ร้อยละส่วน × ตัวคูณ) ÷ Σตัวคูณ
   ไม่ตั้ง     : สูตรเดิม คะแนนรวม ÷ น้ำหนักรวม (ผลของรายวิชาเดิมต้องไม่เปลี่ยน) */
function pctOf(cfg, bySec, secW) {
  const use = hasSecMult(cfg, SECS);
  if (!use) {
    let tot = 0, W = 0;
    SECS.forEach(x => { tot += bySec[x]; W += secW[x]; });
    return W > 0 ? Math.round(tot / W * 10000) / 100 : null;
  }
  let num = 0, mSum = 0;
  SECS.forEach(x => {
    const m = secMultOf(cfg, x);
    num += (secW[x] > 0 ? bySec[x] / secW[x] * 100 : 0) * m;
    mSum += m;
  });
  return mSum > 0 ? Math.round(num / (mSum * 100) * 10000) / 100 : null;
}

(function () {
  console.log('[1] ตัวคูณที่แนะนำจากหน่วยกิต');
  t('3(2-2-5) → ทฤษฎี 2 ทดลอง 1', () => {
    const m = suggestSecMult({ credits: '3', hours_theory: '2', hours_lab: '2', hours_self: '5' }, SECS);
    assert.strictEqual(m['ทฤษฎี'], 2); assert.strictEqual(m['ทดลอง'], 1);
  });
  t('3(1-4-4) → ทฤษฎี 1 ทดลอง 2', () => {
    const m = suggestSecMult({ credits: '3', hours_theory: '1', hours_lab: '4', hours_self: '4' }, SECS);
    assert.strictEqual(m['ทฤษฎี'], 1); assert.strictEqual(m['ทดลอง'], 2);
  });
  t('2(1-2-3) → เท่ากัน 1:1', () => {
    const m = suggestSecMult({ credits: '2', hours_theory: '1', hours_lab: '2', hours_self: '3' }, SECS);
    assert.strictEqual(m['ทฤษฎี'], 1); assert.strictEqual(m['ทดลอง'], 1);
  });
  t('ไม่มีข้อมูลหน่วยกิต → ใช้เกณฑ์ปกติ ทฤษฎี 2 ทดลอง 1', () => {
    const m = suggestSecMult({}, SECS);
    assert.strictEqual(m['ทฤษฎี'], 2); assert.strictEqual(m['ทดลอง'], 1);
  });
  t('หน่วยกิตเท่ากับชั่วโมงทฤษฎี (ไม่สมเหตุผล) → ไม่คืนค่า 0 หรือติดลบ', () => {
    const m = suggestSecMult({ credits: '3', hours_theory: '3' }, SECS);
    SECS.forEach(x => assert.ok(m[x] > 0, x + ' ได้ ' + m[x]));
  });
  t('แสดงหน่วยกิตเป็น 3(2-2-5)', () =>
    assert.strictEqual(creditText({ credits: '3', hours_theory: '2', hours_lab: '2', hours_self: '5' }), '3(2-2-5)'));

  console.log('\n[2] อ่านค่าตัวคูณ');
  t('ไม่ตั้งค่า = 1 ทุกส่วน', () => {
    assert.strictEqual(secMultOf({}, 'ทฤษฎี'), 1);
    assert.strictEqual(secMultOf({ secMult: {} }, 'ทดลอง'), 1);
    assert.strictEqual(hasSecMult({}, SECS), false);
  });
  t('ค่าศูนย์/ติดลบ/ขยะ ไม่ทำให้คะแนนหาย — ตกกลับเป็น 1', () => {
    assert.strictEqual(secMultOf({ secMult: { 'ทฤษฎี': 0 } }, 'ทฤษฎี'), 1);
    assert.strictEqual(secMultOf({ secMult: { 'ทฤษฎี': -2 } }, 'ทฤษฎี'), 1);
    assert.strictEqual(secMultOf({ secMult: { 'ทฤษฎี': 'abc' } }, 'ทฤษฎี'), 1);
  });
  t('ตั้งค่าแล้วรู้ว่ามีการถ่วงน้ำหนัก', () =>
    assert.strictEqual(hasSecMult({ secMult: { 'ทฤษฎี': 2, 'ทดลอง': 1 } }, SECS), true));

  console.log('\n[3] ร้อยละที่คำนวณได้');
  const secW = { 'ทฤษฎี': 100, 'ทดลอง': 100 };
  const row = { 'ทฤษฎี': 63.60, 'ทดลอง': 68.67 };   // ตัวเลขจากแบบบันทึกคะแนนจริง
  t('ไม่ตั้งตัวคูณ → ได้ผลเท่าเดิมทุกประการ (เฉลี่ย 50:50)', () =>
    assert.strictEqual(pctOf({}, row, secW), 66.14));
  t('ทฤษฎี×2 ทดลอง×1 → (63.60×2 + 68.67) ÷ 3', () => {
    const want = Math.round((63.60 * 2 + 68.67) / 3 * 100) / 100;
    assert.strictEqual(pctOf({ secMult: { 'ทฤษฎี': 2, 'ทดลอง': 1 } }, row, secW), want);
  });
  t('ทฤษฎี×1 ทดลอง×2 → (63.60 + 68.67×2) ÷ 3', () => {
    const want = Math.round((63.60 + 68.67 * 2) / 3 * 100) / 100;
    assert.strictEqual(pctOf({ secMult: { 'ทฤษฎี': 1, 'ทดลอง': 2 } }, row, secW), want);
  });
  t('น้ำหนัก CLO ของส่วนไม่ครบ 100 ก็ยังคิดถูก', () => {
    const w = { 'ทฤษฎี': 80, 'ทดลอง': 100 };
    const r = { 'ทฤษฎี': 40, 'ทดลอง': 70 };          // ทฤษฎี 50% · ทดลอง 70%
    const want = Math.round((50 * 2 + 70 * 1) / 3 * 100) / 100;
    assert.strictEqual(pctOf({ secMult: { 'ทฤษฎี': 2, 'ทดลอง': 1 } }, r, w), want);
  });

  console.log('\n[4] ผูกเข้ากับหน้าจอ · CSV · Excel');
  t('เก็บค่าใน course_cfg ไม่ได้สร้างตารางใหม่', () => {
    const save = SRC.slice(SRC.indexOf('window.ploCfgSave'), SRC.indexOf('window.ploCfgSave') + 1600);
    assert.ok(/JSON\.stringify\(\{\s*passPct[^}]*secMult: sm/.test(save.replace(/\s+/g, ' ')), 'ไม่ได้บันทึก secMult');
    assert.ok(save.includes('course_cfg'), 'ไม่ได้เขียนลง course_cfg');
  });
  t('ตารางสรุปใช้ตัวคูณคิดร้อยละ', () => {
    const g = grab('function courseGradeTable(subj)');
    assert.ok(g.includes('secMultOf(cfg, x)'), 'ไม่ได้อ่านตัวคูณ');
    assert.ok(g.includes('Weff') && g.includes('totEff'), 'ไม่ได้คิดคะแนนถ่วงน้ำหนัก');
    assert.ok(g.includes('bySec[x] / secW[x] * 100'), 'ไม่ได้คิดแต่ละส่วนเป็นร้อยละ 100 ก่อน');
    assert.ok(/useMult\s*\n?\s*\? \(Weff > 0/.test(g) || g.replace(/\s+/g, ' ').includes('useMult ? (Weff > 0'), 'ไม่ได้แยกสูตรเดิม/สูตรถ่วงน้ำหนัก');
    assert.ok(g.replace(/\s+/g, ' ').includes(': (W > 0 ? Math.round(tot / W'), 'ไม่ตั้งตัวคูณแล้วต้องใช้สูตรเดิม');
  });
  t('CSV ส่งออกค่าถ่วงน้ำหนักเดียวกับหน้าจอ', () => {
    const i0 = SRC.indexOf('window.ploGradeCsv');
    const c = SRC.slice(i0, SRC.indexOf('window.ploGradePush', i0));
    assert.ok(c.includes('g.useMult ? r.totEff : r.tot'), 'CSV ยังใช้คะแนนรวมแบบเดิม');
    assert.ok(c.indexOf('×') >= 0, 'หัวคอลัมน์ไม่ได้บอกตัวคูณ');
  });
  t('ไฟล์ Excel คิดเลขตรงกับหน้าจอ', () => {
    const g = grab('function gradeBook(m)');
    assert.ok(g.includes('secMultOf(cfg, x.sec)'), 'Excel ไม่ได้อ่านตัวคูณ');
    assert.ok(g.includes("'*100*' + f2(x.m)"), 'สูตรรวมใน Excel ไม่ได้คิดร้อยละ 100 ต่อส่วนแล้วคูณ');
    assert.ok(g.includes('useMult ? Weff : W'), 'สูตรร้อยละใน Excel ยังหารด้วยน้ำหนักเดิม');
    assert.ok(g.includes('mSum * 100'), 'ตัวหารของ Excel ไม่ตรงกับหน้าจอ');
  });
  t('มีปุ่มใช้ตามหน่วยกิต และปุ่มเท่ากันทุกส่วน', () => {
    const f = grab('function secMultFieldHTML(d)');
    assert.ok(f.includes("ploCfgMultPreset('credit')".replace(/'/g, "\\'")) || f.includes('ploCfgMultPreset'), 'ไม่มีปุ่มตั้งค่าอัตโนมัติ');
    assert.ok(f.includes('ใช้ตามหน่วยกิต') && f.includes('เท่ากันทุกส่วน'), 'ปุ่มไม่ครบ');
    assert.ok(f.includes('ถ้าส่งเกรดเข้าหน้าผลการเรียนไปแล้ว'), 'ไม่ได้เตือนผลกระทบต่อเกรดที่ส่งไปแล้ว');
  });
  t('ช่องตัวคูณใช้ onchange ไม่ใช่ oninput (ไม่งั้นพิมพ์แล้วเคอร์เซอร์เด้ง)', () => {
    const f = grab('function secMultFieldHTML(d)');
    assert.ok(f.includes('onchange="ploCfgMult'), 'ยังเป็น oninput');
  });
  t('รายวิชาที่ไม่แยกส่วน ไม่ต้องขึ้นช่องนี้', () => {
    const f = grab('function secMultFieldHTML(d)');
    assert.ok(/secs\.length < 2\) return ''/.test(f), 'ไม่ได้ซ่อนในวิชาทฤษฎีล้วน');
  });

  console.log('\n[5] คลาสและไอคอน');
  t('คลาส Tailwind ที่ใช้ใหม่มีอยู่จริง', () => {
    ['.bg-blue-50{', '.border-blue-100{', '.w-20{', '.text-\\[11px\\]{', '.gap-1\\.5{', '.w-3\\.5{']
      .forEach(c => assert.ok(TW.includes(c), 'ไม่มีคลาส ' + c));
    assert.ok(!SRC.includes('bg-blue-50/60'), 'ใช้คลาสโปร่งแสงที่ tailwind.css ไม่ได้สร้างไว้');
  });
  t('ไอคอนที่ใช้มีอยู่ในชุด lucide ที่ติดตั้ง', () => {
    const names = fs.readFileSync(P + 'tests/lucide_0.263.0_names.txt', 'utf8').split(/\r?\n/).map(x => x.trim());
    assert.ok(names.indexOf('scale') >= 0, 'ไม่มีไอคอน scale');
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(SRC); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
