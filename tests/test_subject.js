/* ชุดตรวจงานรอบนี้ : ประเภทรายวิชา / รหัสที่มีศูนย์นำหน้า / ตารางสรุปภาระงาน */
const fs = require('fs');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const APP = fs.readFileSync(P + 'app.js', 'utf8');
const WL = fs.readFileSync(P + 'workload.js', 'utf8');
const EV = fs.readFileSync(P + 'eval.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

// ดึงฟังก์ชันจริงออกมาทดสอบ ไม่ใช่แค่ดูว่ามีข้อความอยู่
const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
const htmlEsc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function grab(from, to) {
  const i = APP.indexOf(from); assert.ok(i > 0, 'ไม่พบ ' + from);
  const j = APP.indexOf(to, i); assert.ok(j > i, 'ไม่พบจุดจบ ' + to);
  return APP.slice(i, j);
}
eval(grab('const SUBJECT_TYPES', 'function creditCode'));
eval(grab('const CODE_WIDTHS', 'async function handleCSVUpload'));

console.log('[1] ประเภทรายวิชา (ทฤษฎี/ปฏิบัติ)');
t('ใช้คอลัมน์ theory_practice ซึ่งหน้าอื่นอ่านอยู่แล้ว', () => {
  assert.ok(APP.includes('function subjectTypeOf'), 'ไม่มีตัวอ่านประเภทรายวิชา');
  assert.ok(APP.includes("norm(s && s.theory_practice)"), 'ไม่ได้อ่านจากคอลัมน์เดียวกับหน้าอื่น');
  assert.ok(EV.includes("s(subj && subj.theory_practice)"), 'หน้าประเมินผลไม่ได้อ่านคอลัมน์นี้');
  assert.ok(APP.includes("set('theory_practice', subj.theory_practice)"),
    'หน้าติดตามการส่งไม่ได้ดึงประเภทมาเติมให้');
});
/* พฤติกรรมการเดาประเภทถูกยกเลิกตามที่ผู้ใช้สั่ง (ทดลอง ≠ ปฏิบัติ แยกจากชั่วโมงไม่ได้)
   ข้อทดสอบของพฤติกรรมใหม่อยู่ในชุด test_subjtype.js */
t('มีช่องเลือกในฟอร์มเพิ่มและแก้ไข', () => {
  assert.ok(APP.includes('function subjectTypeField'), 'ไม่มีช่องเลือก');
  assert.strictEqual((APP.match(/\$\{subjectTypeField\(/g) || []).length, 2,
    'ต้องมีทั้งฟอร์มเพิ่มและฟอร์มแก้ไข');
  const f = subjectTypeField({ theory_practice: 'ปฏิบัติ' });
  assert.ok(f.includes('value="ปฏิบัติ" selected'), 'ไม่ได้เลือกค่าเดิมไว้ให้');
});
t('แสดงเป็นคอลัมน์ในตารางรายวิชา และนับคอลัมน์ถูก', () => {
  assert.ok(APP.includes('<th class="px-4 py-3 font-semibold">ประเภท</th>'), 'ไม่มีหัวคอลัมน์');
  assert.ok(APP.includes('${subjectTypeBadge(s)}'), 'ไม่ได้แสดงค่าในแถว');
  assert.ok(APP.includes('isAdmin ? 10 : 9'), 'จำนวนคอลัมน์ตอนไม่มีข้อมูลไม่ตรง');
});
t('มีคอลัมน์ในไฟล์ CSV ตัวอย่าง', () =>
  assert.ok(/csvUploadBtn\('subject', '[^']*theory_practice/.test(APP), 'CSV ตัวอย่างไม่มีคอลัมน์นี้'));

console.log('\n[2] รหัสวิชาที่มีศูนย์นำหน้า');
const CASES = [
  ['101300035', 'subject_code', '0101300035', 'Excel กินศูนย์หน้า'],
  ['0101300035', 'subject_code', '0101300035', 'ค่าที่ถูกอยู่แล้ว'],
  ['101300035.0', 'subject_code', '0101300035', 'Excel เติมจุดศูนย์'],
  ['="0101300035"', 'subject_code', '0101300035', 'Excel ห่อด้วยเครื่องหมายเท่ากับ'],
  ['=0101300035', 'subject_code', '0101300035', 'เหลือเครื่องหมายเท่ากับหลังตัดอัญประกาศ'],
  ['GE 101', 'subject_code', 'GE 101', 'รหัสที่มีตัวอักษร ห้ามแตะ'],
  ['9101301001', 'student_id', '09101301001', 'รหัสนักศึกษา 11 หลัก'],
  ['234567890123', 'national_id', '0234567890123', 'เลขบัตร 13 หลัก'],
  ['', 'subject_code', '', 'ค่าว่าง'],
  ['สมหญิง ใจดี', 'subject_name', 'สมหญิง ใจดี', 'ช่องที่ไม่ใช่รหัส ห้ามแตะ'],
  ['12345678901234', 'national_id', '12345678901234', 'ยาวกว่ามาตรฐาน ห้ามตัดหรือเติม']
];
CASES.forEach(([inp, f, want, why]) => t(why + ' : ' + JSON.stringify(inp) + ' → ' + want,
  () => assert.strictEqual(fixLeadingZeroCode(inp, f), want)));
t('นำเข้า CSV เรียกใช้ตัวซ่อมจริง', () =>
  assert.ok(APP.includes("obj[h] = fixLeadingZeroCode(vals[idx] || '', h)"),
    'ยังเก็บค่าดิบโดยไม่ซ่อม'));

console.log('\n[3] ส่งออก CSV ต้องไม่ให้ Excel กินศูนย์');
t('มีตัวกันศูนย์หายทั้งหน้าประเมินผลและภาระงาน', () => {
  [['eval.js', EV], ['workload.js', WL]].forEach(([n, s]) => {
    assert.ok(s.includes('function csvKeepZero'), n + ' ไม่มีตัวกัน');
    assert.ok(s.includes('var keep = csvKeepZero('), n + ' ไม่ได้เรียกใช้');
  });
});
t('ห่อเฉพาะตัวเลขที่ขึ้นต้นด้วยศูนย์', () => {
  const re = /^0[0-9]{2,}$/;
  assert.ok(re.test('0101300035'));
  assert.ok(!re.test('69101301001'), 'รหัสที่ไม่ได้ขึ้นต้นด้วยศูนย์ไม่ต้องห่อ');
  assert.ok(!re.test('GE 101'), 'ข้อความไม่ต้องห่อ');
  assert.ok(!re.test('0'), 'เลขศูนย์ตัวเดียวไม่ใช่รหัส');
});

console.log('\n[4] ตารางสรุปชั่วโมงภาระงาน');
t('ตัดแถว "รวมทั้งปีการศึกษา" ออกแล้ว', () => {
  assert.ok(!WL.includes('>รวมทั้งปีการศึกษา<'), 'ยังมีแถวรวมอยู่');
  assert.ok(!/<tfoot>/.test(WL.slice(WL.indexOf('sumCard'), WL.indexOf('return sumCard'))),
    'ยังมีส่วนท้ายตารางเหลืออยู่');
});
t('ยอดรวมทั้งปียังดูได้ที่หัวการ์ด', () =>
  assert.ok(WL.includes("' ภาคการศึกษา · รวม ' + fx(grand) + ' ชม.ถ่วงน้ำหนัก"),
    'ตัดแถวรวมออกแล้วต้องยังเห็นยอดรวมที่อื่น'));
t('ตารางยังปิดแท็กครบถ้วน', () => {
  const seg = WL.slice(WL.indexOf('var sumCard ='), WL.indexOf('return sumCard'));
  assert.strictEqual((seg.match(/<tbody>/g) || []).length, 1);
  assert.strictEqual((seg.match(/<\/table>/g) || []).length, 1);
  assert.strictEqual((seg.match(/<tfoot>/g) || []).length, 0);
});

console.log('\n────────────────────────────');
console.log('ผ่าน ' + pass + ' ข้อ · ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
