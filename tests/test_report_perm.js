/* เมนูรายงาน — ต้องปรากฏในตารางสิทธิ์การเข้าถึงระบบ และปรับได้จริง
   จุดที่ต้องไม่พลาด : ตารางรายบุคคล/เงินเดือน ต้องไม่เปิดตามตารางสิทธิ์ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const RP = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('\n[1] ตารางสิทธิ์ในหน้าตั้งค่าระบบ');
const seg = APP.slice(APP.indexOf('function settingsPage()'), APP.indexOf('function settingsPage()') + 4000);
t('มีโมดูล report ในรายการ', () => {
  assert.ok(/const modules = \[[^\]]*'report'/.test(seg), 'ไม่มีแถวรายงานในตารางสิทธิ์');
});
t('มีชื่อภาษาไทยกำกับ', () => {
  assert.ok(seg.includes("report: 'รายงาน"), 'ไม่มีชื่อโมดูลภาษาไทย');
});
t('วางอยู่ถัดจากบริการอื่นๆ ให้ตรงกับลำดับเมนูจริง', () => {
  const m = /const modules = \[([^\]]*)\]/.exec(seg);
  assert.ok(m, 'อ่านรายการโมดูลไม่ได้');
  const list = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
  assert.strictEqual(list[list.indexOf('report') - 1], 'services', 'ลำดับไม่ตรงกับเมนูจริง');
});

console.log('\n[2] ค่าตั้งต้นของสิทธิ์');
const perms = APP.slice(APP.indexOf('permissions: {'), APP.indexOf('filters: {'));
t('บทบาทที่เคยเห็นเมนูรายงาน ได้สิทธิ์ตั้งต้น', () => {
  ['admin', 'academic', 'registrar', 'deptHead', 'executive'].forEach(r => {
    const i = perms.indexOf(r + ': {');
    assert.ok(i > -1, 'ไม่พบบทบาท ' + r);
    const body = perms.slice(i, perms.indexOf('}', i));
    assert.ok(/\breport: 1\b/.test(body), 'บทบาท ' + r + ' ไม่ได้สิทธิ์รายงานตั้งต้น');
  });
});
t('บทบาทที่ไม่เคยเห็น ต้องไม่ได้สิทธิ์ตั้งต้น', () => {
  ['teacher', 'classTeacher', 'student', 'otherStaff'].forEach(r => {
    const i = perms.indexOf(r + ': {');
    const body = perms.slice(i, perms.indexOf('}', i));
    assert.ok(!/\breport: 1\b/.test(body), 'บทบาท ' + r + ' ได้สิทธิ์รายงานเกินมา');
  });
});

console.log('\n[3] เมนูรายงานอ่านค่าจากตารางสิทธิ์');
const cv = RP.slice(RP.indexOf('function canView()'), RP.indexOf('function canSeeDetail()'));
t('อ่านค่า report จาก APP.permissions', () => {
  assert.ok(cv.includes('APP.permissions') && cv.includes("'report'"),
    'ยังไม่ได้ผูกกับตารางสิทธิ์ ติ๊กแล้วจะไม่มีผล');
});
t('บทบาทที่ยังไม่เคยตั้งค่า ใช้ค่าเดิม ไม่ใช่ปิดทั้งหมด', () => {
  assert.ok(cv.includes('VIEW_ROLES'), 'ไม่มีค่าสำรอง อาจทำให้เมนูหายไปทั้งระบบ');
  assert.ok(cv.includes('hasOwnProperty'), 'ไม่ได้แยกกรณี "ยังไม่ตั้งค่า" ออกจาก "ตั้งค่าให้ปิด"');
});
t('ตั้งค่าให้ปิดแล้ว ต้องปิดจริง ไม่ถอยไปใช้ค่าเดิม', () => {
  assert.ok(/decided/.test(cv), 'ไม่มีตัวแยกว่าเคยตั้งค่าแล้วหรือยัง');
});

console.log('\n[4] ข้อมูลส่วนบุคคลต้องไม่เปิดตามตารางสิทธิ์');
t('ตารางรายบุคคลและเงินเดือนยังคุมด้วยบทบาทตายตัว', () => {
  const cd = RP.slice(RP.indexOf('function canSeeDetail()'), RP.indexOf('function canSeeDetail()') + 200);
  assert.ok(cd.includes('DETAIL_ROLES'), 'ขอบเขตสิทธิ์ดูข้อมูลรายบุคคลเปลี่ยนไป');
  assert.ok(!cd.includes('APP.permissions'), 'ข้อมูลรายบุคคลไม่ควรเปิดได้ด้วยการติ๊กในตารางสิทธิ์');
  assert.ok(RP.includes("var DETAIL_ROLES = ['admin', 'academic', 'registrar']"), 'รายชื่อบทบาทเปลี่ยนไป');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
