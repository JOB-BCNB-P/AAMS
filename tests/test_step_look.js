/* หน้าตาของฟอร์มแบบขั้นตอน
   หัวใจคือ ขั้นที่ยังไม่ถึงต้องยังอ่านออก และสถานะทั้งสามต้องแยกกันได้โดยไม่ต้องพึ่งสีอย่างเดียว */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
const EV = fs.readFileSync(P + 'eval.js', 'utf8');
const PL = fs.readFileSync(P + 'plo.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

console.log('[1] ขั้นที่ยังไม่ถึง ต้องอ่านออก');
t('เลิกใช้ opacity ลดความคมทั้งบล็อก', () => {
  [['eval.js', EV], ['plo.js', PL]].forEach(([n, src]) =>
    assert.ok(!/opacity:\.6/.test(src), n + ' ยังหรี่ทั้งบล็อก ตัวอักษรคอนทราสต์ต่ำกว่าเกณฑ์'));
});
t('ทั้งสองไฟล์ติดสถานะ is-wait ให้ขั้นที่ยังไม่ถึง', () => {
  [['eval.js', EV], ['plo.js', PL]].forEach(([n, src]) =>
    assert.ok(/'wait' \? ' is-wait'/.test(src), n + ' ไม่ได้ติดสถานะ'));
});
t('มีสไตล์ของ is-wait รองรับ ไม่งั้นขั้นที่ยังไม่ถึงจะดูเหมือนขั้นที่กำลังทำ', () => {
  assert.ok(/\.ems-step\.is-wait \.ems-step-no/.test(CSS), 'วงกลมไม่เปลี่ยนสี');
  assert.ok(/\.ems-step\.is-wait \.ems-step-title/.test(CSS), 'หัวข้อไม่เปลี่ยนสี');
});
t('สีตัวอักษรของขั้นที่ยังไม่ถึงยังเข้มพอ (ไม่ใช่เทาจางระดับ #cbd5e1)', () => {
  const m = CSS.match(/\.ems-step\.is-wait \.ems-step-title \{[^}]*\}/);
  assert.ok(m, 'ไม่พบ');
  assert.ok(/#64748b/.test(m[0]), 'ใช้สีจางเกินไป · ' + m[0]);
});

console.log('\n[2] สามสถานะแยกกันได้ ไม่พึ่งสีอย่างเดียว');
t('ขั้นที่ทำแล้วเป็นเครื่องหมายถูก ไม่ใช่แค่เปลี่ยนเป็นสีเขียว', () =>
  assert.ok(/\.ems-step\.is-done \.ems-step-no::after[\s\S]{0,200}border-width/.test(CSS),
    'คนตาบอดสีจะแยกไม่ออกระหว่างทำแล้วกับกำลังทำ'));
t('ขั้นที่กำลังทำมีวงแหวนรอบเลข', () =>
  assert.ok(/\.ems-step\.is-active \.ems-step-no \{[\s\S]{0,260}box-shadow: 0 0 0 4px/.test(CSS), 'ไม่มีวงแหวน'));
t('เส้นเชื่อมของขั้นที่ทำแล้วเปลี่ยนสี บอกความคืบหน้า', () =>
  assert.ok(/\.ems-step\.is-done::before \{[^}]*background/.test(CSS), 'เส้นเชื่อมไม่บอกอะไรเลย'));

console.log('\n[3] เลขขั้นเล็กหน้าช่องตัวกรอง');
t('เลือกค่าแล้วเปลี่ยนเป็นเครื่องหมายถูก', () => {
  assert.ok(/\.ems-ministep\.is-done::after/.test(CSS), 'ไม่มีเครื่องหมายถูก');
  assert.ok(/stepLabel\(no, label, note, !!s\(st\[key\]\)\)/.test(PL), 'ตัวกรองหลักไม่ได้ส่งสถานะเข้าไป');
  assert.ok(/stepLabel\(no, label, '', !!s\(st\[key\]\)\)/.test(PL), 'ตัวกรองรายบุคคลไม่ได้ส่งสถานะเข้าไป');
});
t('ยังไม่เลือกต้องเห็นเลขขั้น เลือกแล้วเลขหายไปแทนด้วยเครื่องหมายถูก', () =>
  assert.ok(/\(done \? '' : no\)/.test(PL), 'เลขกับเครื่องหมายถูกจะซ้อนกัน'));
t('มีขนาดคงที่ ไม่ถูกบีบจนเบี้ยวเมื่อชื่อยาว', () => {
  const m = CSS.match(/\.ems-ministep \{[^}]*\}/);
  assert.ok(m && /flex: none/.test(m[0]), 'วงกลมจะถูกบีบเป็นวงรี');
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
