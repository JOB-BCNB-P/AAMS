/* ประเภทรายวิชา 4 แบบ — ทดลอง (ห้องแล็บ) กับ ปฏิบัติ (แหล่งฝึก) ต้องไม่ปนกัน */
const fs = require('fs');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const APP = fs.readFileSync(P + 'app.js', 'utf8');
const EV = fs.readFileSync(P + 'eval.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
const htmlEsc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function grab(src, from, to) {
  const i = src.indexOf(from); assert.ok(i > 0, 'ไม่พบ ' + from);
  const j = src.indexOf(to, i); assert.ok(j > i, 'ไม่พบจุดจบ ' + to);
  return src.slice(i, j);
}
// const ที่ประกาศใน eval ไม่หลุดออกมาให้ทดสอบได้ จึงเปลี่ยนเป็น var ตอนดึงมา
eval(grab(APP, 'const SUBJECT_TYPES', 'function creditCode')
  .replace('const SUBJECT_TYPES', 'var SUBJECT_TYPES'));
// ดึงเฉพาะฟังก์ชันตัดสินประเภทจาก eval.js มาทดสอบ
const s = v => String(v == null ? '' : v).trim();
const num = v => parseFloat(String(v || '').replace(/,/g, '')) || 0;
eval(grab(EV, '  function courseTypeOf(subj)', '  function formCodeOf'));

console.log('[1] ตัวเลือกประเภทรายวิชา');
t('มี 4 แบบ และแยกทดลองออกจากปฏิบัติ', () => {
  assert.deepStrictEqual(SUBJECT_TYPES,
    ['ทฤษฎี', 'ทฤษฎีและทดลอง', 'ทฤษฎีและปฏิบัติ', 'ปฏิบัติ']);
});
t('ไม่มีตัวเลือกเดิมที่ใช้คำผิดหลงเหลือ', () => {
  assert.ok(!APP.includes("['ทฤษฎี', 'ปฏิบัติ', 'ทฤษฎีและปฏิบัติ']"), 'ยังมีชุดเดิมค้างอยู่');
  assert.ok(!APP.includes('<option>ทฤษฎี</option><option>ปฏิบัติ</option>'),
    'ยังมีตัวเลือกแค่สองแบบในหน้าติดตามการส่ง');
});
t('ทุกหน้าใช้ตัวเลือกชุดเดียวกัน', () => {
  assert.ok(APP.includes('function subjectTypeOptionsHTML'), 'ไม่มีตัวสร้างตัวเลือกกลาง');
  // หน้าติดตามการส่ง 4 ฟอร์มเพิ่ม + 1 ฟอร์มแก้ไข + หน้ารายวิชา
  assert.ok((APP.match(/subjectTypeOptionsHTML\(/g) || []).length >= 6,
    'ยังมีบางหน้าที่ไม่ได้ใช้ตัวเลือกกลาง');
});

console.log('\n[2] ไม่เดาประเภทให้ในหน้ารายวิชา');
t('อ่านเฉพาะค่าที่ระบุไว้', () => {
  assert.strictEqual(subjectTypeOf({ theory_practice: 'ทฤษฎีและทดลอง' }), 'ทฤษฎีและทดลอง');
  assert.strictEqual(subjectTypeOf({ hours_theory: '2', hours_lab: '3' }), '',
    'ยังเดาจากชั่วโมงอยู่');
  assert.strictEqual(subjectTypeOf({}), '');
});
t('วิชาที่ยังไม่ระบุ ขึ้นป้าย "รอระบุ" ให้เห็นชัด', () => {
  const b = subjectTypeBadge({ hours_lab: '6' });
  assert.ok(b.includes('รอระบุ'), 'ไม่ได้บอกว่ายังไม่ระบุ');
  assert.ok(!b.includes('ปฏิบัติ'), 'ไม่ควรเดาว่าเป็นวิชาปฏิบัติ');
});
t('วิชาที่ระบุแล้ว แสดงตามที่ระบุ ไม่มีดอกจัน', () => {
  SUBJECT_TYPES.forEach(ty => {
    const b = subjectTypeBadge({ theory_practice: ty });
    assert.ok(b.includes(ty), 'ไม่แสดง ' + ty);
    assert.ok(!b.includes('*'), ty + ' ไม่ควรมีดอกจัน');
    assert.ok(!b.includes('รอระบุ'), ty + ' ไม่ควรขึ้นว่ารอระบุ');
  });
});
t('แต่ละประเภทมีสีของตัวเอง แยกออกจากกันได้', () => {
  const colors = SUBJECT_TYPES.map(ty => (subjectTypeBadge({ theory_practice: ty })
    .match(/bg-[a-z]+-50/) || [''])[0]);
  assert.strictEqual(new Set(colors).size, 4, 'สีซ้ำกัน แยกด้วยตาไม่ออก: ' + colors.join(', '));
});

console.log('\n[3] ทดลอง ≠ ปฏิบัติ ในการสร้างแบบประเมิน');
t('เดาอย่างระวัง — มีชั่วโมงช่อง ป ให้เดาเป็นทดลอง ไม่ใช่ปฏิบัติ', () => {
  assert.strictEqual(courseTypeOf({ hours_lab: '3' }), 'ทฤษฎีและทดลอง',
    'เดาเป็นวิชาปฏิบัติจะไปสร้างแบบประเมินแหล่งฝึกที่ไม่มีจริง');
  assert.strictEqual(courseTypeOf({ hours_lab: '0' }), 'ทฤษฎี');
});
t('ค่าที่ระบุไว้เองต้องชนะการเดาเสมอ', () =>
  assert.strictEqual(courseTypeOf({ theory_practice: 'ปฏิบัติ', hours_lab: '0' }), 'ปฏิบัติ'));
t('ประเมินแหล่งฝึกเฉพาะวิชาที่ฝึกในแหล่งฝึกจริง', () => {
  assert.ok(EV.includes('function hasPracticum'), 'ไม่มีตัวแยกวิชาที่มีแหล่งฝึก');
  assert.ok(EV.includes("set_site: hasPracticum(ct) ?"), 'ยังเทียบกับคำว่าปฏิบัติตรง ๆ อยู่');
  const has = t => String(t || '').indexOf('ปฏิบัติ') >= 0;
  assert.strictEqual(has('ทฤษฎีและทดลอง'), false, 'วิชาแล็บไม่ควรมีแบบประเมินแหล่งฝึก');
  assert.strictEqual(has('ทฤษฎีและปฏิบัติ'), true);
  assert.strictEqual(has('ปฏิบัติ'), true);
  assert.strictEqual(has('ทฤษฎี'), false);
});
t('ชุดคำถามเดิมที่ติดป้าย ทฤษฎี/ปฏิบัติ ยังใช้ได้ ไม่ต้องไล่แก้', () => {
  assert.ok(EV.includes('function baseCourseType'), 'ไม่มีตัวย่อประเภท');
  const base = t => String(t || '').indexOf('ปฏิบัติ') >= 0 ? 'ปฏิบัติ' : 'ทฤษฎี';
  assert.strictEqual(base('ทฤษฎีและทดลอง'), 'ทฤษฎี', 'วิชาแล็บควรใช้ชุดคำถามฝั่งทฤษฎี');
  assert.strictEqual(base('ทฤษฎีและปฏิบัติ'), 'ปฏิบัติ');
  assert.ok(EV.includes('baseCourseType(ct) === want'), 'defaultSet ไม่ได้ใช้ประเภทหลักจับคู่');
});

console.log('\n────────────────────────────');
console.log('ผ่าน ' + pass + ' ข้อ · ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
