/* เข้าสู่ระบบด้วยรหัสผ่านสำหรับ "บัญชีทดสอบ"
   จุดที่ต้องไม่พลาด : ต้องใช้ช่องทางนี้กับบัญชีจริงไม่ได้ และต้องไม่ไปแตะโหมดดูแทนผู้ใช้ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const AP = fs.readFileSync(path.join(ROOT, 'app-patch.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = AP.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = AP.indexOf('{', i); k < AP.length; k++) {
    if (AP[k] === '{') d++;
    else if (AP[k] === '}') { d--; if (!d) return AP.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

const F = new Function(`
  var CFG = {};
  ${grab('function isTestEmail(email)')}
  var TEST_PREFIX = 'test.';
  return { isTestEmail: isTestEmail };
`.replace("var TEST_PREFIX = 'test.';", '')
 .replace('function isTestEmail', "var TEST_PREFIX='test.';\n  function isTestEmail"))();

console.log('\n[1] คัดกรองว่าเป็นบัญชีทดสอบหรือไม่');
t('อีเมลที่ขึ้นต้นด้วย test. ผ่าน', () => {
  assert.strictEqual(F.isTestEmail('test.teacher@bcn.ac.th'), true);
  assert.strictEqual(F.isTestEmail('test.registrar@bcn.ac.th'), true);
});
t('ไม่สนใจตัวพิมพ์ใหญ่เล็กและช่องว่างหน้าหลัง', () => {
  assert.strictEqual(F.isTestEmail('  TEST.Student@bcn.ac.th '), true);
});
t('อีเมลบุคลากรและนักศึกษาตัวจริงต้องไม่ผ่าน', () => {
  assert.strictEqual(F.isTestEmail('somchai.j@bcn.ac.th'), false);
  assert.strictEqual(F.isTestEmail('65101301001@bcn.ac.th'), false);
});
t('คำว่า test ที่ไม่ได้อยู่ต้นอีเมล ต้องไม่ผ่าน', () => {
  assert.strictEqual(F.isTestEmail('nottest.teacher@bcn.ac.th'), false);
  assert.strictEqual(F.isTestEmail('teacher.test@bcn.ac.th'), false);
});
t('ค่าว่างหรือไม่มีเครื่องหมาย @ ต้องไม่ผ่าน', () => {
  assert.strictEqual(F.isTestEmail(''), false);
  assert.strictEqual(F.isTestEmail('test.teacher'), false);
});

console.log('\n[2] ลำดับการตรวจก่อนส่งรหัสผ่าน');
const body = grab('window.emsPwLogin = async function emsPwLogin()');
t('ตรวจโดเมนของวิทยาลัยก่อน', () => {
  assert.ok(body.includes('EMSAuth.domainOk'), 'ไม่ได้ตรวจโดเมน');
});
t('ปฏิเสธบัญชีที่ไม่ใช่บัญชีทดสอบ ก่อนเรียกตรวจรหัสผ่าน', () => {
  const a = body.indexOf('isTestEmail(email)');
  const b = body.indexOf('GSheetDB.login');
  assert.ok(a > -1, 'ไม่ได้ตรวจว่าเป็นบัญชีทดสอบ');
  assert.ok(b > -1, 'ไม่พบการเรียกเข้าสู่ระบบ');
  assert.ok(a < b, 'ส่งรหัสผ่านไปตรวจก่อนคัดกรองบัญชี — ใช้เดารหัสผ่านบัญชีจริงได้');
});
t('เข้าสู่หน้าหลักผ่านทางเดียวกับการเข้าสู่ระบบปกติ', () => {
  assert.ok(body.includes('emsEnterApp'), 'ไม่ได้เรียก emsEnterApp จึงอาจข้ามการตั้งค่าบทบาท');
});

console.log('\n[3] ทางเข้าและแถบเตือน');
t('มีลิงก์เปิดช่องรหัสผ่านในหน้าเข้าสู่ระบบของบุคลากร', () => {
  assert.ok(AP.includes('emsShowPwLogin()'), 'ไม่มีปุ่มเปิดช่องกรอก');
  assert.ok(AP.includes('เข้าสู่ระบบด้วยรหัสผ่าน (บัญชีทดสอบ)'), 'ข้อความบนลิงก์เปลี่ยนไป');
});
t('ช่องกรอกไม่แสดงตั้งแต่แรก ต้องกดลิงก์ก่อน', () => {
  const box = grab('window.emsShowPwLogin = function emsShowPwLogin()');
  assert.ok(box.includes("el('emsPwBox')") && box.includes('createElement'),
    'ช่องกรอกไม่ได้ถูกสร้างตอนกด แปลว่าอาจแสดงค้างไว้ตลอด');
});
t('มีแถบเตือนขณะใช้บัญชีทดสอบ และถูกเรียกตอนเข้าสู่ระบบ', () => {
  assert.ok(AP.includes('function emsTestBanner()'), 'ไม่มีแถบเตือน');
  assert.ok(/emsTestBanner\(\);\s*\/\//.test(AP) || AP.includes('emsTestBanner();'),
    'ไม่ได้เรียกแถบเตือนหลังเข้าสู่ระบบ');
  const enter = grab('window.emsEnterApp = async function emsEnterApp(profile)');
  assert.ok(enter.includes('emsTestBanner()'), 'ไม่ได้เรียกแถบเตือนใน emsEnterApp');
});
t('แถบเตือนบอกว่าข้อมูลถูกบันทึกลงระบบจริง', () => {
  const b = grab('function emsTestBanner()');
  assert.ok(b.includes('บัญชีทดสอบ') && b.includes('จริง'), 'ข้อความเตือนไม่ชัดพอ');
});

console.log('\n[4] ของเดิมต้องไม่ถูกกระทบ');
t('โหมดดูแทนผู้ใช้ยังบันทึกข้อมูลไม่ได้เหมือนเดิม', () => {
  assert.ok(AP.includes('โหมดดูแทนผู้ใช้: อ่านอย่างเดียว บันทึกข้อมูลไม่ได้'),
    'ตัวกั้นการเขียนของโหมดดูแทนผู้ใช้หายไป');
  assert.ok(AP.includes('window.emsViewAsState'), 'ตัวอ่านสถานะดูแทนผู้ใช้หายไป');
});
t('ปุ่มเข้าสู่ระบบด้วย Google ยังเป็นช่องทางหลัก', () => {
  assert.ok(AP.includes('window.handleGoogleLogin'), 'ปุ่ม Google หายไป');
  const hl = grab('window.handleLogin = async function handleLogin()');
  assert.ok(hl.includes('handleGoogleLogin'), 'ปุ่มเข้าสู่ระบบหลักไม่ได้ชี้ไปที่ Google แล้ว');
});
t('ไม่มีรหัสผ่านหรือคีย์ฝังอยู่ในโค้ดส่วนนี้', () => {
  const seg = AP.slice(AP.indexOf('2.5) เข้าสู่ระบบด้วยรหัสผ่าน'), AP.indexOf('window.emsTestBanner'));
  assert.ok(!/password\s*[:=]\s*['"][^'"]{3,}/i.test(seg), 'พบค่ารหัสผ่านเขียนไว้ในโค้ด');
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(seg), 'พบโทเคนเขียนไว้ในโค้ด');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
