/* ไฟล์แนบของหน้าติดตามการส่ง ต้องทับของเดิม ไม่สะสมเป็นไฟล์ซ้ำบนไดรฟ์ */
const fs = require('fs');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const PATCH = fs.readFileSync(P + 'app-patch.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

function grab(head) {
  const i = PATCH.indexOf(head);
  assert.ok(i >= 0, 'หาไม่เจอ: ' + head);
  let d = 0, j = PATCH.indexOf('{', i);
  for (let k = j; k < PATCH.length; k++) {
    if (PATCH[k] === '{') d++;
    else if (PATCH[k] === '}') { d--; if (!d) { j = k + 1; break; } }
  }
  return PATCH.slice(i, j);
}

console.log('[1] ต้นตอของบั๊ก — รหัสไฟล์เดิมต้องไม่หายไปก่อนใช้');
const upFn = grab('window.emsUploadTrackingFile = async function (id)');
t('จำรหัสไฟล์บนไดรฟ์ไว้ก่อนเขียนทับ rec.file_link', () => {
  const iPrev = upFn.indexOf('var prevDrive = driveIdOf(rec.file_link)');
  const iClobber = upFn.indexOf('rec.file_link = up.link');
  assert.ok(iPrev >= 0, 'ไม่ได้จำรหัสไฟล์เดิมไว้');
  assert.ok(iClobber >= 0, 'หาจุดเขียนทับไม่เจอ');
  assert.ok(iPrev < iClobber, 'จำหลังเขียนทับ ได้ค่าว่างเหมือนเดิม');
});
t('ส่งรหัสไฟล์เดิมเข้า emsDriveSync', () =>
  assert.ok(upFn.includes('emsDriveSync(rec, up.path, file.name, prevDrive)'),
    'ไม่ได้ส่งรหัสไฟล์เดิม ไดรฟ์จะสร้างไฟล์ใหม่ทุกครั้ง'));
t('emsDriveSync ใช้ค่าที่ผู้เรียกส่งมาก่อนเสมอ', () => {
  const sync = grab('async function emsDriveSync(rec, storagePath, originalName, existingId)');
  assert.ok(sync.includes("existingId != null ? String(existingId || '') : driveIdOf(rec.file_link)"),
    'ยังอ่านจาก rec.file_link เป็นหลัก');
  assert.ok(sync.includes('existingFileId: existing'), 'ไม่ได้ส่ง existingFileId ไปที่ Edge Function');
});
t('ยังส่ง mode/table/year/filename ครบเหมือนเดิม', () => {
  const sync = grab('async function emsDriveSync(rec, storagePath, originalName, existingId)');
  ["mode: 'sync'", 'table: rec.type', 'storagePath: storagePath', 'year: yr', 'filename: driveName']
    .forEach(k => assert.ok(sync.includes(k), 'ขาด ' + k));
});

console.log('\n[2] กดลบแล้วต้องหายจากไดรฟ์จริง');
const rmFn = grab('window.emsRemoveTrackingFile = async function (id)');
t('เรียก drive-sync โหมดลบ พร้อมรหัสไฟล์', () => {
  assert.ok(rmFn.includes("mode: 'remove'") && rmFn.includes("kind: 'tracking'"), 'ไม่ได้เรียกโหมดลบ');
  assert.ok(rmFn.includes('fileId: driveId'), 'ไม่ได้ส่งรหัสไฟล์ไปลบ');
});
t('ลบบนไดรฟ์ไม่สำเร็จ ต้องไม่ล้างลิงก์ทิ้ง', () => {
  const iGuard = rmFn.indexOf("if (!rmData['ลบบนไดรฟ์'])");
  const iClear = rmFn.indexOf("rec.file_link = ''");
  assert.ok(iGuard >= 0, 'ไม่ได้ตรวจผลการลบ');
  assert.ok(iGuard < iClear, 'ล้างลิงก์ก่อนรู้ผล ไฟล์จะค้างบนไดรฟ์แบบไม่มีใครอ้างถึง');
  assert.ok(/return;[\s\S]{0,40}\}[\s\S]{0,80}else \{/.test(rmFn.slice(iGuard)), 'ไม่ได้หยุดเมื่อลบไม่สำเร็จ');
});
t('ไฟล์ที่ยังอยู่ในถังของระบบ ใช้เส้นทางลบเดิม', () =>
  assert.ok(rmFn.includes('GSheetDB.deleteFile(rec.file_link)'), 'เส้นทางเดิมหาย'));
t('ไม่บอกผู้ใช้ว่า "ไฟล์ตัวจริงยังอยู่" อีกแล้ว', () =>
  assert.ok(!rmFn.includes('ไฟล์ตัวจริงยังอยู่ใน Google Drive'), 'ข้อความเดิมขัดกับพฤติกรรมใหม่'));
t('เตือนล่วงหน้าว่าไฟล์บนไดรฟ์จะถูกลบด้วย', () =>
  assert.ok(rmFn.includes('ไฟล์บน Google Drive ของวิทยาลัยจะถูกลบไปด้วย'), 'ผู้ใช้ควรรู้ก่อนกดยืนยัน'));

console.log('\n[3] ตัวช่วยและการเข้ากันได้');
t('driveIdOf คืนรหัสเฉพาะลิงก์ gd: เท่านั้น', () => {
  const src = PATCH.slice(PATCH.indexOf('function isDriveFile'), PATCH.indexOf('function driveIdOf') + 200);
  const f = new Function(src.slice(0, src.indexOf('function driveIdOf'))
    + src.slice(src.indexOf('function driveIdOf'), src.indexOf('\n', src.indexOf('function driveIdOf')))
    + '\nreturn driveIdOf;')();
  assert.strictEqual(f('gd:ABC123'), 'ABC123');
  assert.strictEqual(f('sb:tracking/57.pdf'), '');
  assert.strictEqual(f('https://drive.google.com/file/d/X/view'), '');
  assert.strictEqual(f(''), '');
  assert.strictEqual(f(null), '');
});
t('แจ้งผู้ใช้เมื่อเขียนทับไฟล์เดิม', () =>
  assert.ok(upFn.includes('เขียนทับไฟล์เดิม'), 'ไม่ได้บอกว่าทับของเดิม ผู้ใช้จะไม่มั่นใจว่าแก้แล้ว'));
t('รายงานจำนวนไฟล์ซ้ำเก่าที่ถูกเก็บกวาด', () =>
  assert.ok(upFn.includes("sync['ลบไฟล์ซ้ำทิ้งแล้ว']"), 'ไม่ได้อ่านค่าที่ Edge Function ส่งกลับ'));
t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new (require('vm').Script)(PATCH); });

console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
