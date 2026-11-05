/* ตั้งค่าระบบ — แยกแต่ละหัวข้อเป็นเมนูย่อย
   จุดที่ต้องไม่พลาด
   1) ลิงก์เดิมที่ชี้มาที่ settings ต้องยังใช้ได้
   2) ทุกหัวข้อเดิมต้องมีที่อยู่ใหม่ครบ ไม่มีอันไหนหายไป
   3) กล่อง Drive และ LINE ต้องยังถูกวาด ทั้งที่ย้ายหน้าแล้ว */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
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
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

const SUBS = [
  ['settingsUsers', 'จัดการผู้ใช้งาน'],
  ['settingsPerm', 'สิทธิ์การเข้าถึงระบบ'],
  ['settingsEntry', 'สิทธิ์บันทึกข้อมูลนักศึกษา'],
  ['settingsLeave', 'ค่าตั้งการคิดร้อยละการลา'],
  ['settingsLink', 'เชื่อมต่อ Drive และ LINE']
];

console.log('\n[1] เมนูข้าง');
t('ตั้งค่าระบบกลายเป็นกลุ่มที่มีเมนูย่อย', () => {
  const i = APP.indexOf("p.settings) {");
  assert.ok(i > -1, 'ยังเป็นเมนูเดี่ยวอยู่');
  const seg = APP.slice(i, i + 900);
  SUBS.forEach(([id, label]) => {
    assert.ok(seg.includes("id: '" + id + "'"), 'ไม่มีเมนูย่อย ' + label);
    assert.ok(seg.includes(label), 'ไม่มีชื่อเมนู ' + label);
  });
});
t('ยังจำกัดเฉพาะผู้ดูแลระบบและงานวิชาการเหมือนเดิม', () => {
  assert.ok(APP.includes("if ((r === 'admin' || r === 'academic') && p.settings)"),
    'เงื่อนไขสิทธิ์เปลี่ยนไป บทบาทอื่นอาจเห็นเมนูตั้งค่า');
});

console.log('\n[2] เส้นทางหน้า');
t('ลิงก์เดิม settings ยังใช้ได้ ไม่ตกหล่น', () => {
  assert.ok(APP.includes("case 'settings': return settingsUsersPage();"),
    'ลิงก์เดิมจะพาไปหน้าว่าง');
});
t('ทุกเมนูย่อยมีหน้าของตัวเอง', () => {
  SUBS.forEach(([id]) => {
    assert.ok(APP.includes("case '" + id + "':"), 'ไม่มีเส้นทางของ ' + id);
  });
});
t('ทุกหน้ามีฟังก์ชันจริง', () => {
  ['settingsUsersPage', 'settingsPermPage', 'settingsEntryPage', 'settingsLeavePage', 'settingsLinkPage']
    .forEach(fn => assert.ok(APP.includes('function ' + fn + '('), 'ไม่พบฟังก์ชัน ' + fn));
});

console.log('\n[3] เนื้อหาเดิมต้องอยู่ครบ');
t('จัดการผู้ใช้งาน ยังมีปุ่มเพิ่ม แก้ไข ลบ และดูแทนผู้ใช้', () => {
  const g = grab('function settingsUsersPage()');
  ['showAddUserModal()', 'showEditUserModal(', 'deleteRecord(', 'emsViewAsUser('].forEach(x =>
    assert.ok(g.includes(x), 'หายไป: ' + x));
  assert.ok(g.includes('paginationHTML('), 'การแบ่งหน้าหายไป');
});
t('ตารางสิทธิ์ยังครบทุกโมดูลและทุกบทบาท', () => {
  const g = grab('function settingsPermPage()');
  assert.ok(g.includes('togglePermission('), 'ติ๊กสิทธิ์ไม่ได้แล้ว');
  assert.ok(g.includes("'evalCourse'") && g.includes("'reportExam'") && g.includes("'counsel'"),
    'รายการโมดูลขาดไป');
  assert.ok(g.includes("surveyManage"), 'กติกาพิเศษของแบบประเมินหายไป');
});
t('สิทธิ์บันทึกข้อมูลนักศึกษา ยังเรียกการ์ดเดิม', () => {
  assert.ok(grab('function settingsEntryPage()').includes('dataEntryRightsSection()'), 'การ์ดหายไป');
  assert.ok(APP.includes('function dataEntryRightsSection()'), 'ฟังก์ชันเดิมถูกลบ');
});
t('ค่าตั้งการลา ยังบันทึกได้', () => {
  const g = grab('function settingsLeavePage()');
  assert.ok(g.includes('leaveWeeksInput') && g.includes('saveLeaveWeeks()'), 'ช่องกรอกหรือปุ่มบันทึกหายไป');
});
t('กล่อง Drive และ LINE ย้ายมาหน้าเชื่อมต่อ', () => {
  const g = grab('function settingsLinkPage()');
  assert.ok(g.includes('driveLinkBox') && g.includes('lineGroupBox'), 'กล่องหายไป');
  const others = ['settingsUsersPage', 'settingsPermPage', 'settingsLeavePage']
    .filter(fn => /driveLinkBox|lineGroupBox/.test(grab('function ' + fn + '()')));
  assert.deepStrictEqual(others, [], 'กล่องซ้ำอยู่หลายหน้า จะวาดทับกัน');
});
t('ตัววาดกล่อง LINE ไม่ผูกกับชื่อหน้าเดิมแล้ว', () => {
  const g = grab('function initPageScripts(page)');
  assert.ok(!/page === 'settings' && document\.getElementById\('lineGroupBox'\)/.test(g),
    'ยังเช็กชื่อหน้าเดิม กล่อง LINE จะไม่ถูกวาดในหน้าใหม่');
  assert.ok(g.includes("document.getElementById('lineGroupBox')"), 'ไม่ได้เรียกวาดกล่อง LINE เลย');
});
t('ไม่เหลือการเรียก settingsPage() ที่ถูกลบไปแล้ว', () => {
  assert.ok(!APP.includes('settingsPage()'), 'ยังมีการเรียกฟังก์ชันที่ไม่มีอยู่จริง หน้าจะพัง');
});
t('ชื่อบทบาทเก็บไว้ที่เดียว ใช้ร่วมกันทุกหน้า', () => {
  assert.ok(APP.includes('const SETTINGS_ROLE_LABELS'), 'ไม่ได้รวมชื่อบทบาทไว้ที่เดียว');
  assert.ok(grab('function settingsUsersPage()').includes('SETTINGS_ROLE_LABELS'),
    'หน้าผู้ใช้จะขึ้น undefined ตรงช่องบทบาท');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
