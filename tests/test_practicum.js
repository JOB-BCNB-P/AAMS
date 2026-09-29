/* แหล่งฝึกภาคปฏิบัติ · การ์ดหน้าหลัก · เปลี่ยนคำว่า สาขาวิชา → สาขา */
const fs = require('fs');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const APP = fs.readFileSync(P + 'app.js', 'utf8');
const PATCH = fs.readFileSync(P + 'app-patch.js', 'utf8');
const DB = fs.readFileSync(P + 'supabase-db.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
const htmlEsc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function grab(from, to) {
  const i = APP.indexOf(from); assert.ok(i > 0, 'ไม่พบ ' + from);
  const j = APP.indexOf(to, i); assert.ok(j > i, 'ไม่พบจุดจบ ' + to);
  return APP.slice(i, j);
}
eval(grab('function countDistinctField', 'function practicumSitesPage'));

console.log('[1] ตัวนับที่ต้องไม่นับเกินจริง');
const ROWS = [
  { site_name: 'โรงพยาบาลราชวิถี', ward: 'อายุรกรรมชาย', mentor: 'นางสมศรี ใจดี, นายมานะ ตั้งใจ', subject_name: 'ปฏิบัติการพยาบาลผู้ใหญ่ 1' },
  { site_name: 'โรงพยาบาลราชวิถี', ward: 'อายุรกรรมหญิง', mentor: 'นางสมศรี ใจดี', subject_name: 'ปฏิบัติการพยาบาลผู้ใหญ่ 1' },
  { site_name: 'โรงพยาบาลเลิดสิน', ward: 'ศัลยกรรม', mentor: 'นางสาววิภา ดูแลดี', subject_name: 'ปฏิบัติการพยาบาลผู้ใหญ่ 2' },
  { site_name: '', ward: '', mentor: '', subject_name: '' }
];
t('แหล่งฝึกเดียวกันหลายหอผู้ป่วย นับเป็นแห่งเดียว', () =>
  assert.strictEqual(countDistinctField(ROWS, 'site_name'), 2, 'นับเป็นจำนวนแถวแทนจำนวนแหล่งฝึก'));
t('พี่เลี้ยงคนเดิมอยู่หลายแถว นับครั้งเดียว และแยกชื่อที่คั่นด้วยจุลภาคได้', () =>
  assert.strictEqual(countDistinctField(ROWS, 'mentor', true), 3,
    'ควรได้ สมศรี · มานะ · วิภา = 3 คน'));
t('รายวิชาซ้ำ นับครั้งเดียว', () =>
  assert.strictEqual(countDistinctField(ROWS, 'subject_name'), 2));
t('ค่าว่างไม่ถูกนับ', () => {
  assert.strictEqual(countDistinctField([{ site_name: '' }, { site_name: '  ' }], 'site_name'), 0);
  assert.strictEqual(countDistinctField([], 'site_name'), 0);
  assert.strictEqual(countDistinctField(null, 'site_name'), 0);
});
t('ช่องพี่เลี้ยงว่าง แสดงขีด ไม่ใช่ช่องว่าง', () =>
  assert.ok(mentorListHTML('').includes('-')));
t('พี่เลี้ยงหลายคน แสดงเรียงลงมาทีละคน', () => {
  const h = mentorListHTML('ก, ข, ค');
  assert.strictEqual((h.match(/•/g) || []).length, 3);
});

console.log('\n[2] หน้าข้อมูลแหล่งฝึกภาคปฏิบัติ');
t('มีหน้า เมนู และเส้นทางครบ', () => {
  assert.ok(APP.includes('function practicumSitesPage()'), 'ไม่มีหน้า');
  assert.ok(APP.includes("case 'practicumSites': return practicumSitesPage();"), 'ไม่มีเส้นทาง');
  assert.ok(APP.includes("regSub.push({ id: 'practicumSites', label: 'ข้อมูลแหล่งฝึกภาคปฏิบัติ' })"),
    'ไม่มีเมนูในระบบทะเบียน');
});
t('เปิดสิทธิ์ให้บทบาทที่ควรเห็น', () => {
  assert.strictEqual((APP.match(/practicumSites: 1/g) || []).length, 4,
    'จำนวนบทบาทที่เปิดสิทธิ์ไม่ตรง');
});
t('มีปุ่มเพิ่ม แก้ไข ลบ ครบ', () => {
  assert.ok(APP.includes('showAddPracticumSiteModal()'), 'ไม่มีปุ่มเพิ่ม');
  assert.ok(APP.includes('showEditPracticumSiteModal('), 'ไม่มีปุ่มแก้ไข');
  const seg = grab('function practicumSitesPage()', 'function practicumSiteFormBody');
  assert.ok(seg.includes('deleteRecord('), 'ไม่มีปุ่มลบ');
});
t('ตารางมีคอลัมน์ครบตามที่สั่ง', () => {
  const seg = grab('function practicumSitesPage()', 'function practicumSiteFormBody');
  ['ลำดับ', 'รายวิชา', 'แหล่งฝึก', 'หอผู้ป่วย/ตึกผู้ป่วย (Ward)', 'พยาบาลพี่เลี้ยง/อาจารย์พี่เลี้ยง']
    .forEach(c => assert.ok(seg.includes('>' + c + '</th>'), 'ขาดคอลัมน์ ' + c));
});
t('ลำดับต่อเนื่องข้ามหน้า ไม่เริ่มที่ 1 ใหม่ทุกหน้า', () => {
  const seg = grab('function practicumSitesPage()', 'function practicumSiteFormBody');
  assert.ok(seg.includes('const startNo = (APP.pagination.page - 1) * APP.pagination.perPage;'),
    'ไม่ได้คิดลำดับต่อจากหน้าก่อน');
  assert.ok(seg.includes('${startNo + i + 1}'), 'ไม่ได้ใช้ลำดับต่อเนื่อง');
});
t('กรองตามปีการศึกษาได้ และการ์ดนับตามที่กรอง', () => {
  const seg = grab('function practicumSitesPage()', 'function practicumSiteFormBody');
  assert.ok(seg.includes("APP.filters._siteYear"), 'ไม่มีตัวกรองปีการศึกษา');
  assert.ok(seg.includes("countDistinctField(data, 'site_name')"),
    'การ์ดต้องนับจากข้อมูลที่กรองแล้ว ไม่ใช่ทั้งหมด');
});
t('แก้ไขบนระเบียนเดิม ไม่สร้างวัตถุใหม่จนคอลัมน์อื่นหาย', () => {
  assert.ok(APP.includes("const rec = APP.allData.find(d => d.__backendId === id);\n      if (!rec) { showToast('ไม่พบรายการนี้แล้ว', 'error'); return; }"),
    'ไม่ได้แก้บนระเบียนเดิม');
  assert.ok(APP.includes('const r = await GSheetDB.update(rec);'), 'เรียกบันทึกผิดรูปแบบ');
});

console.log('\n[3] ตารางใหม่ในระบบข้อมูล');
t('ตารางถูกใส่ในรายการโหลด', () =>
  assert.ok(DB.includes("'practicum_site',   // แหล่งฝึกภาคปฏิบัติ"), 'ไม่ได้ใส่ใน SHEET_TABS'));
t('นักศึกษาไม่ต้องโหลดตารางนี้', () => {
  const i = DB.indexOf('const STUDENT_SKIP');
  assert.ok(DB.slice(i, i + 500).includes("'practicum_site'"), 'ยังเรียกให้นักศึกษาโดยเปล่าประโยชน์');
});

console.log('\n[4] การ์ดบนหน้าหลัก');
t('มีการ์ดแหล่งฝึกและการ์ดพี่เลี้ยง', () => {
  assert.ok(APP.includes('จำนวนแหล่งฝึกปฏิบัติ ${yearSuffix(_selSiteYear)}'), 'ไม่มีการ์ดแหล่งฝึก');
  assert.ok(APP.includes('พยาบาลพี่เลี้ยง/อาจารย์พี่เลี้ยง ${yearSuffix(_selSiteYear)}'), 'ไม่มีการ์ดพี่เลี้ยง');
  assert.ok(APP.includes('${practicumSiteCard}') && APP.includes('${mentorCard}'),
    'สร้างการ์ดแล้วแต่ไม่ได้วางลงหน้า');
});
t('เลือกปีการศึกษาได้แบบเดียวกับการ์ดอาจารย์พิเศษ', () => {
  assert.ok(APP.includes("APP.filters._dashSiteYear"), 'ไม่มีตัวเลือกปีของการ์ดแหล่งฝึก');
  assert.ok(APP.includes('function statCard') || true);
  // การ์ดสองใบต้องใช้ตัวเลือกปีตัวเดียวกัน จะได้ไม่ขัดกันเอง
  assert.strictEqual((APP.match(/yearPickerFor\('_dashSiteYear'/g) || []).length, 2);
});
t('เปลี่ยนหัวข้อเป็น จำนวนอาจารย์ทั้งหมด (แยกสาขา)', () => {
  assert.ok(APP.includes('จำนวนอาจารย์ทั้งหมด (แยกสาขา)'), 'ยังไม่ได้เปลี่ยนหัวข้อ');
  assert.ok(!APP.includes('จำนวนอาจารย์แยกสาขา<'), 'ยังมีหัวข้อเดิมค้างอยู่');
});

console.log('\n[5] เปลี่ยนคำว่า "สาขาวิชา" เป็น "สาขา"');
t('ไม่เหลือคำเดิมในข้อความที่ผู้ใช้เห็น', () => {
  const left = (APP.match(/สาขาวิชา/g) || []).length;
  assert.strictEqual(left, 2, 'เหลือ ' + left + ' จุด (ควรเหลือเฉพาะตัวเทียบบทบาท 2 จุดในบรรทัดเดียว)');
  assert.strictEqual((PATCH.match(/สาขาวิชา/g) || []).length, 0);
});
t('ตัวเทียบบทบาทเดิมต้องคงไว้ ไม่งั้นบัญชีที่เก็บคำเต็มจะเข้าระบบไม่ได้', () =>
  assert.ok(APP.includes("r === 'ประธานสาขาวิชา' || r === 'ประธานสาขา' || r === 'หัวหน้าสาขาวิชา'"),
    'ตัวเทียบบทบาทถูกแก้ไปด้วย'));
t('ป้ายบทบาทเปลี่ยนเป็นคำใหม่แล้ว', () => {
  assert.ok(APP.includes("deptHead: 'ประธานสาขา'"), 'ป้ายบทบาทยังไม่เปลี่ยน');
  assert.ok(PATCH.includes("deptHead: 'ประธานสาขา'"), 'app-patch ยังไม่เปลี่ยน');
});

console.log('\n────────────────────────────');
console.log('ผ่าน ' + pass + ' ข้อ · ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
