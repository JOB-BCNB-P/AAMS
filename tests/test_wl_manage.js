/* ภาระงานนักศึกษา › สรุปผลรวม — ช่องจัดการ (แก้ไข/ลบ) ทั้งตารางรายชั้นปีและรายบุคคล เฉพาะผู้ดูแลระบบ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WL = fs.readFileSync(path.join(__dirname, '..', 'workload.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
t('สิทธิ์จัดการเฉพาะบทบาทผู้ดูแลระบบ', () => {
  assert.ok(WL.includes("function isAdminNow() { return norm(APP.currentRole) === 'admin'; }"));
  assert.ok(WL.includes('function manageOn() { return isAdminNow(); }'));
  assert.ok(WL.includes('function canDelete() { return isAdminNow(); }'));
});
t('ตารางรายชั้นปีมีดินสอและถังขยะ', () => assert.ok(WL.includes("manageCell(\"wlEditPlan('") && WL.includes("wlDeletePlan('")));
t('ตารางรายบุคคลมีดินสอและถังขยะ', () => assert.ok(WL.includes("manageCell(\"wlEditPerson('") && WL.includes("wlDeletePerson('")));
t('หัวคอลัมน์ "จัดการ" ทั้งสองตาราง', () => assert.strictEqual((WL.match(/>จัดการ<\/th>/g) || []).length, 2));
t('ลบต้องถามยืนยันก่อน และฝั่งฟังก์ชันตรวจสิทธิ์ซ้ำ', () => {
  ['wlDeletePlan', 'wlDeletePerson'].forEach(fn => {
    const i = WL.indexOf('window.' + fn + ' = async function'); const seg = WL.slice(i, i + 1500);
    assert.ok(seg.includes('if (!canDelete())') && seg.includes('confirm('), fn);
  });
});
t('ลบรายบุคคลได้เฉพาะคนที่มีค่าเฉพาะราย', () => assert.ok(WL.includes('ใช้ค่ามาตรฐานของชั้นปี ไม่มีข้อมูลเฉพาะรายให้ลบ')));
console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
