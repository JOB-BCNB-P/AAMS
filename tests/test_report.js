/* รายงาน — ผลสอบสภาการพยาบาล และการได้งานทำของศิษย์เก่า
   จุดที่ต้องไม่พลาด : การคิดร้อยละ การอ่านไฟล์ CSV และการกันข้อมูลส่วนบุคคล */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const RP = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = RP.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = RP.indexOf('{', i); k < RP.length; k++) {
    if (RP[k] === '{') d++;
    else if (RP[k] === '}') { d--; if (!d) return RP.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}
const F = new Function(`
  var PASS='ผ่าน', FAIL='ไม่ผ่าน', ABSENT='ไม่ได้เข้าสอบ';
  function n(v){ return String(v==null?'':v).trim(); }
  ${grab('function tally(list, subject)')}
  ${grab('function toIso(v)')}
  ${grab('function normResult(v)')}
  ${grab('function parseCsv(text)')}
  ${grab('function shortName(s)')}
  return { tally, toIso, normResult, parseCsv, shortName };
`)();

console.log('\n[1] การคิดร้อยละการผ่าน');
const LIST = [
  { res: { 'ก': 'ผ่าน' } }, { res: { 'ก': 'ผ่าน' } }, { res: { 'ก': 'ไม่ผ่าน' } },
  { res: { 'ก': 'ไม่ได้เข้าสอบ' } }, { res: {} }
];
t('ไม่นับผู้ที่ไม่ได้เข้าสอบเป็นตัวหาร', () => {
  const r = F.tally(LIST, 'ก');
  assert.strictEqual(r.pass, 2);
  assert.strictEqual(r.fail, 1);
  assert.strictEqual(r.absent, 1);
  assert.strictEqual(r.sat, 3, 'ผู้เข้าสอบต้องเป็น ผ่าน+ไม่ผ่าน เท่านั้น');
  assert.strictEqual(r.pct, 66.7, '2/3 = 66.7% ไม่ใช่ 2/5 = 40%');
});
t('ไม่มีใครเข้าสอบเลย ต้องไม่หารด้วยศูนย์', () => {
  const r = F.tally([{ res: { 'ก': 'ไม่ได้เข้าสอบ' } }], 'ก');
  assert.strictEqual(r.pct, 0);
  assert.ok(isFinite(r.pct));
});
t('วิชาที่ไม่มีในข้อมูลเลย ได้ศูนย์ ไม่ใช่ NaN', () => {
  const r = F.tally(LIST, 'วิชาที่ไม่มี');
  assert.strictEqual(r.sat, 0);
  assert.strictEqual(r.pct, 0);
});

console.log('\n[2] อ่านค่าผลสอบจากไฟล์');
t('รับคำว่า ผ่าน / ไม่ผ่าน / ไม่ได้เข้าสอบ', () => {
  assert.strictEqual(F.normResult('ผ่าน'), 'ผ่าน');
  assert.strictEqual(F.normResult('ไม่ผ่าน'), 'ไม่ผ่าน');
  assert.strictEqual(F.normResult('ไม่ได้เข้าสอบ'), 'ไม่ได้เข้าสอบ');
  assert.strictEqual(F.normResult('ขาดสอบ'), 'ไม่ได้เข้าสอบ');
});
t('"ไม่ผ่าน" ต้องไม่ถูกอ่านเป็น "ผ่าน"', () => {
  // ถ้าใช้ indexOf('ผ่าน') จะพังตรงนี้ เพราะ "ไม่ผ่าน" มีคำว่า "ผ่าน" อยู่ข้างใน
  assert.strictEqual(F.normResult('ไม่ผ่าน'), 'ไม่ผ่าน');
});
t('ค่าที่อ่านไม่ออกคืนค่าว่าง ไม่เดาให้', () => {
  assert.strictEqual(F.normResult('P'), '');
  assert.strictEqual(F.normResult('-'), '');
  assert.strictEqual(F.normResult(''), '');
});

console.log('\n[3] วันที่');
t('รับทั้ง ค.ศ. และ พ.ศ. ทั้งสองรูปแบบ', () => {
  assert.strictEqual(F.toIso('2025-09-15'), '2025-09-15');
  assert.strictEqual(F.toIso('15/09/2568'), '2025-09-15', 'พ.ศ. ต้องถูกแปลงเป็น ค.ศ.');
  assert.strictEqual(F.toIso('2568-09-15'), '2025-09-15');
});
t('วันที่ผิดรูปแบบคืนค่าว่าง ไม่เดา', () => {
  assert.strictEqual(F.toIso('15 ก.ย. 68'), '');
  assert.strictEqual(F.toIso('2025-13-45'), '');
  assert.strictEqual(F.toIso(''), '');
});

console.log('\n[4] อ่านไฟล์ CSV');
t('รับจุลภาคและขึ้นบรรทัดใหม่ที่อยู่ในเครื่องหมายคำพูด', () => {
  const rows = F.parseCsv('a,b\n"มี, จุลภาค","มี\nบรรทัดใหม่"\n');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][0], 'มี, จุลภาค');
  assert.strictEqual(rows[1][1], 'มี\nบรรทัดใหม่');
});
t('ข้ามบรรทัดว่าง', () => {
  assert.strictEqual(F.parseCsv('a,b\n\n1,2\n').length, 2);
});
t('ตัด BOM ที่ Excel ใส่มา', () => {
  assert.strictEqual(F.parseCsv('﻿รหัสนักศึกษา,ก\n1,2\n')[0][0], 'รหัสนักศึกษา');
});

console.log('\n[5] จับคู่คอลัมน์ด้วยชื่อ ไม่ใช่ลำดับ');
t('ข้ามคอลัมน์ที่ Google ใส่มาเอง', () => {
  assert.ok(RP.includes('function findCol'), 'ไม่มีตัวจับคู่หัวคอลัมน์');
  assert.ok(!RP.includes('line[0]') && !RP.includes('line[1]'), 'ยังอ่านด้วยลำดับคอลัมน์');
});
t('บังคับรหัสนักศึกษา 11 หลัก และต้องมีครั้งที่สอบ', () => {
  const seg = RP.slice(RP.indexOf('function repCsvPlan'));
  assert.ok(seg.includes('/^\\d{11}$/'), 'ไม่ได้ตรวจรูปแบบรหัสนักศึกษา');
  assert.ok(seg.includes("if (!round)"), 'ไม่ได้ตรวจครั้งที่สอบ');
});
t('กุญแจคือ รหัสนักศึกษา + ครั้งที่สอบ นำเข้าซ้ำแล้วทับของเดิม', () => {
  assert.ok(RP.includes("x.sid + '|' + x.round"), 'ไม่ได้ใช้กุญแจคู่');
  const seg = RP.slice(RP.indexOf('window.repCsvApply'));
  assert.ok(seg.includes('x.cur ? await GSheetDB.update') && seg.includes('GSheetDB.create'),
    'ไม่ได้แยกกรณีทับของเดิมกับเพิ่มใหม่');
});
t('ต้องให้ตรวจก่อน ยังไม่เขียนทันทีที่เลือกไฟล์', () => {
  const seg = grab('function repCsvPlan(rows, fname)');
  assert.ok(!seg.includes('GSheetDB'), 'เขียนลงฐานข้อมูลตั้งแต่ยังไม่ได้ยืนยัน');
  assert.ok(seg.includes('showModal'), 'ไม่มีหน้าสรุปให้ตรวจ');
});

console.log('\n[6] กันข้อมูลส่วนบุคคล');
t('ตารางรายบุคคลจำกัดเฉพาะ admin วิชาการ ทะเบียน', () => {
  assert.ok(RP.includes("var DETAIL_ROLES = ['admin', 'academic', 'registrar']"), 'ขอบเขตสิทธิ์เปลี่ยนไป');
  assert.ok(grab('function personTable(list)').includes('if (!canSeeDetail())'), 'ตารางผลสอบไม่ได้กันสิทธิ์');
  assert.ok(grab('function jobPage()').includes('canSeeDetail()'), 'ตารางเงินเดือนไม่ได้กันสิทธิ์');
});
t('ผู้บริหารและประธานสาขาเห็นกราฟได้ แต่ไม่เห็นรายคน', () => {
  assert.ok(RP.includes("'executive', 'deptHead'"), 'ไม่ได้ให้สิทธิ์ดูภาพรวม');
  assert.ok(RP.includes('กราฟและภาพรวมด้านบนแสดงข้อมูลครบถ้วนแล้ว'), 'ไม่ได้อธิบายให้ผู้ใช้เข้าใจ');
});
t('นำเข้าข้อมูลได้เฉพาะผู้มีสิทธิ์ ตรวจซ้ำตอนกดยืนยัน', () => {
  assert.ok(grab('window.repCsvApply = async function ()').includes('if (!canSeeDetail())'),
    'ข้ามการตรวจสิทธิ์ตอนเขียนจริง');
});

console.log('\n[7] เมนูและการตั้งค่า');
t('เมนูรายงานแทรกถัดจากบริการอื่นๆ', () => {
  assert.ok(RP.includes("insertAfter(nav, box, '[data-page=\"services\"]')"), 'ตำแหน่งเมนูไม่ถูก');
  assert.ok(RP.includes("['reportExam', 'ผลสอบสภาฯ']") && RP.includes("['reportJob', 'การได้งานทำของศิษย์เก่า']"));
});
t('รายวิชาและสาขาอ่านจากค่าตั้ง แก้ได้โดยไม่ต้องแก้โค้ด', () => {
  const seg = grab('function cfg()');
  assert.ok(seg.includes("'council_exam_config'"), 'ไม่ได้อ่านจากค่าตั้ง');
  assert.ok(seg.includes('FALLBACK'), 'ไม่มีค่าสำรองเมื่อยังไม่ได้ตั้งค่า');
});
t('index.html โหลด report.js แล้ว', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/report\.js\?v=/.test(html), 'ยังไม่ได้ใส่ไฟล์ในหน้าเว็บ');
});
t('ชั้นโหลดข้อมูลรู้จักตาราง council_exam และนักศึกษาไม่ต้องโหลด', () => {
  const db = fs.readFileSync(path.join(ROOT, 'supabase-db.js'), 'utf8');
  assert.ok(db.includes("'council_exam'"), 'ไม่ได้ลงทะเบียนตาราง');
  const skip = db.slice(db.indexOf('STUDENT_SKIP'), db.indexOf('STUDENT_SKIP') + 600);
  assert.ok(skip.includes('council_exam'), 'นักศึกษายังโหลดตารางผลสอบอยู่');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
