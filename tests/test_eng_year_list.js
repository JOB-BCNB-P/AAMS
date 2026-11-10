/* สรุปผลสอบภาษาอังกฤษ : การ์ดแยกรายชั้นปีกดดูรายชื่อได้
   จุดที่ต้องไม่พลาด
   1) ตัวเลขบนการ์ดรายชั้นปี ต้องมาจากขอบเขตเดียวกับการ์ดใหญ่ ไม่งั้นกดแล้วรายชื่อไม่ตรงกับเลข
   2) ชั้นปีที่ไม่มีคน ต้องกดไม่ได้ ไม่ใช่เปิดหน้าต่างเปล่า
   3) หัวข้อหน้าต่างต้องบอกว่าเป็นชั้นปีไหน */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'tailwind.css'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = APP.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = APP.indexOf('{', i); k < APP.length; k++) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); }
  }
  throw new Error('อ่านไม่จบ: ' + sig);
}
const LIST = grab('function showEngStudentList(kind, yearLevel)');

console.log('\n[1] ตัวเลขกับรายชื่อต้องมาจากชุดเดียวกัน');
t('การ์ดรายชั้นปีนับจาก _sc เหมือนการ์ดใหญ่ ไม่ใช่นักศึกษาทั้งวิทยาลัย', () => {
  const i = APP.indexOf('const yrCards = [1, 2, 3, 4].map');
  assert.ok(i > -1, 'ไม่พบการ์ดรายชั้นปี');
  const seg = APP.slice(i, i + 700);
  assert.ok(seg.includes('_sc.passed.filter') && seg.includes('_sc.notPassed.filter'),
    'ยังนับจากชุดอื่น ตัวเลขจะไม่ตรงกับรายชื่อเมื่อกรองด้วยอาจารย์ที่ปรึกษาหรือรุ่น');
  assert.ok(!seg.includes('activeStudents(getDataByType'), 'ยังดึงนักศึกษาทั้งวิทยาลัยมานับ');
});
t('จำนวนรวมบนการ์ดคือผ่านบวกไม่ผ่าน', () => {
  const i = APP.indexOf('const yrCards = [1, 2, 3, 4].map');
  assert.ok(APP.slice(i, i + 700).includes('const tot = p + f'),
    'ถ้านับจากจำนวนนักศึกษาทั้งหมดของชั้นปี จะไม่ตรงกับผลรวมของสองปุ่ม');
});
t('หน้าต่างรายชื่อกรองต่อด้วยชั้นปีจากขอบเขตเดิม', () => {
  assert.ok(LIST.includes('sc.passed') && LIST.includes('sc.notPassed'), 'ไม่ได้ใช้ engSummaryScope()');
  assert.ok(/filter\(s => !yr \|\| norm\(s\.year_level\) === yr\)/.test(LIST), 'ไม่ได้กรองตามชั้นปี');
});
t('ไม่ส่งชั้นปีมา ต้องได้รายชื่อทั้งหมดเหมือนเดิม', () => {
  const f = new Function('norm', 'return function (list, yr) { return list.filter(s => !yr || norm(s.year_level) === yr); };')(
    v => String(v == null ? '' : v).trim());
  const L = [{ year_level: '1' }, { year_level: '2' }, { year_level: '2' }];
  assert.strictEqual(f(L, '').length, 3, 'การ์ดใหญ่ต้องยังเห็นครบ');
  assert.strictEqual(f(L, '2').length, 2);
  assert.strictEqual(f(L, '9').length, 0);
});

console.log('\n[2] ปุ่มบนการ์ด');
t('มีปุ่มทั้งผ่านและไม่ผ่าน ส่งชั้นปีไปด้วย', () => {
  const i = APP.indexOf('const chip = (kind, label, n, cls, hov)');
  const seg = APP.slice(i, i + 600);
  assert.ok(/showEngStudentList\('\$\{kind\}','\$\{y\}'\)/.test(seg), 'ไม่ได้ส่งชั้นปีไปที่หน้าต่างรายชื่อ');
  assert.ok(seg.includes("chip('pass'") || APP.includes("chip('pass', 'ผ่าน'"), 'ไม่มีปุ่มผ่าน');
  assert.ok(APP.includes("chip('fail', 'ไม่ผ่าน'"), 'ไม่มีปุ่มไม่ผ่าน');
});
t('ชั้นปีที่ไม่มีคน กดไม่ได้', () => {
  const i = APP.indexOf('const chip = (kind, label, n, cls, hov)');
  const seg = APP.slice(i, i + 600);
  assert.ok(/: `<span /.test(seg), 'ยังเป็นปุ่มกดได้ทั้งที่ไม่มีคน จะเปิดหน้าต่างเปล่า');
});
t('บอกผู้ใช้ว่าคลิกได้', () => {
  assert.ok(APP.includes('คลิกตัวเลขเพื่อดูรายชื่อ'), 'ไม่มีใครรู้ว่ากดได้');
  const i = APP.indexOf('const chip = (kind, label, n, cls, hov)');
  assert.ok(APP.slice(i, i + 600).includes('title="คลิกเพื่อดูรายชื่อ'), 'ไม่มีคำอธิบายตอนชี้เมาส์');
});
t('ใช้เฉพาะคลาสที่มีอยู่จริงใน tailwind.css', () => {
  const i = APP.indexOf('const chip = (kind, label, n, cls, hov)');
  const seg = APP.slice(i - 900, i + 900);
  const used = new Set();
  seg.replace(/class="([^"]+)"/g, (m, g) => g.split(/\s+/).forEach(c => {
    if (c && /^[a-z0-9:[\]./_-]+$/i.test(c)) used.add(c);
  }));
  const esc = c => '.' + c.replace(/([.:[\]/])/g, '\\$1');
  const miss = [...used].filter(c => !CSS.includes(esc(c) + '{') && !CSS.includes(esc(c) + ':')
    && !CSS.includes(esc(c) + ',') && !CSS.includes(esc(c) + '>'));
  assert.deepStrictEqual(miss, [], 'คลาสเหล่านี้ไม่มีในไฟล์ CSS จะไม่มีผลกับหน้าจอ');
});

console.log('\n[3] หน้าต่างรายชื่อ');
t('หัวข้อบอกชั้นปีที่กำลังดู', () => {
  assert.ok(LIST.includes("' — ชั้นปีที่ ' + htmlEsc(yr)"), 'เปิดจากการ์ดรายชั้นปีแล้วไม่รู้ว่าปีไหน');
});
t('ยังแสดงคอลัมน์เดิมครบ', () => {
  ['รหัสนักศึกษา', 'ชื่อ-สกุล', 'ชั้นปี', 'ห้อง'].forEach(c =>
    assert.ok(LIST.includes(c), 'คอลัมน์ ' + c + ' หายไป'));
  assert.ok(LIST.includes('เข้าสอบไปแล้ว'), 'ข้อมูลจำนวนครั้งที่สอบของคนที่ยังไม่ผ่านหายไป');
});
t('ไม่มีใครในกลุ่ม ต้องขึ้นข้อความ ไม่ใช่ตารางเปล่า', () => {
  assert.ok(LIST.includes('ไม่มีนักศึกษาในกลุ่มนี้'), 'ตารางเปล่าโดยไม่มีคำอธิบาย');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
