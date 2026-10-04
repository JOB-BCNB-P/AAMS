/* แจ้งผลสอบภาษาอังกฤษถึงอาจารย์ที่ปรึกษา — จับคู่ชื่อโดยตัดคำนำหน้า และเลือกอาจารย์ที่จะส่งได้ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const FN = fs.readFileSync(P + 'supabase/functions/eng-report-mail/index.ts', 'utf8');
const APPJS = fs.readFileSync(P + 'app.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

// ดึงฟังก์ชัน nameKey จากไฟล์ TypeScript มาทดสอบจริง (ตัดชนิดข้อมูลออก)
const seg = FN.slice(FN.indexOf('const TITLES'), FN.indexOf('const TH_MONTHS'))
  .replace('function nameKey(v: unknown): string', 'function nameKey(v)');
const norm = (v) => String(v ?? '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
const nameKey = new Function('norm', seg + '; return nameKey;')(norm);

console.log('[1] จับคู่ชื่ออาจารย์');
[['อ.ปภาวดี ทวีสุข', 'ดร.ปภาวดี ทวีสุข'], ['อ.วัฒนา เตจาคำ', 'ดร.วัฒนา เตจาคำ'],
 ['ผศ.ดร.เจียมใจ ศรีชัยรัตนกูล', 'ดร.เจียมใจ ศรีชัยรัตนกูล'], ['อาจารย์ สมศรี  ใจดี', 'นางสมศรี ใจดี']]
  .forEach(([a, b]) => t(a + ' = ' + b, () => assert.strictEqual(nameKey(a), nameKey(b))));
t('คนละคนไม่ปนกัน', () => assert.notStrictEqual(nameKey('อ.สมศรี ใจดี'), nameKey('อ.สมใจ ใจดี')));

console.log('\n[2] ฝั่งเซิร์ฟเวอร์');
t('จัดกลุ่มด้วย nameKey และหาอีเมลจากบัญชีผู้ใช้สำรอง', () => {
  assert.ok(FN.includes('const k = nameKey(adv)') && FN.includes("admin.from('app_user').select('name, email, role')"));
});
t('preview ส่งรายชื่ออาจารย์พร้อมสาขา', () => assert.ok(FN.includes('department: x.dept')));
t('ส่งเฉพาะอาจารย์ที่เลือก', () => assert.ok(FN.includes('pick ? sendable.filter((x) => pick.includes(x.key))')));
t('อีเมลตอบกลับไม่ได้', () => assert.ok(FN.includes('replyTo: NO_REPLY')));

console.log('\n[3] หน้าต่างเลือกอาจารย์');
t('ค้นหาชื่อ-สกุล และกรองสาขา', () => assert.ok(APPJS.includes('id="engMailQ"') && APPJS.includes('id="engMailDept"')));
t('เลือก/ยกเลิกทั้งหมดที่แสดง', () => assert.ok(APPJS.includes('engMailPickShown(true)') && APPJS.includes('engMailPickShown(false)')));
t('ส่งรายชื่อที่เลือกไปเซิร์ฟเวอร์', () => assert.ok(APPJS.includes("engMailCall(mode, { advisors: keys })")));

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
