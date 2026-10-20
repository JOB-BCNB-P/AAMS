/* ภาระงานนักศึกษา — ยกเลิกการบันทึกแบบกลุ่ม ใช้ไฟล์ CSV ลงแผนชั้นปีแทน
   เหตุผล : บันทึกกิจกรรมหนึ่งงานให้ทั้งชั้น สร้างระเบียนรายคน 157 ชุดของข้อมูลชุดเดียวกัน
   เป็นต้นเหตุของค่าเฉพาะรายที่บังรายการของชั้นปี และทำให้แก้ข้อมูลทีหลังแทบเป็นไปไม่ได้
   ทางที่ถูกคือ 1 กิจกรรม = 1 แถวในแผนชั้นปี แล้วระบุผู้เข้าร่วมในช่อง students */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WL = fs.readFileSync(path.join(__dirname, '..', 'workload.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = WL.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = WL.indexOf('{', i); k < WL.length; k++) {
    if (WL[k] === '{') d++;
    else if (WL[k] === '}') { d--; if (!d) return WL.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

console.log('\n[1] เลือกนักศึกษาได้ทีละคนเท่านั้น');
t('รายชื่อใช้ปุ่มวงกลม ไม่ใช่ช่องติ๊กหลายคน', () => {
  const seg = grab('function groupListBox()');
  assert.ok(seg.includes('type="radio"'), 'ยังเป็นช่องติ๊กหลายคน');
  assert.ok(!seg.includes('type="checkbox"'), 'ยังมีช่องติ๊กหลงเหลือ');
});
t('เลือกคนใหม่แทนที่คนเดิมเสมอ', () => {
  const seg = grab('window.wlGroupOne = function (sid, on)');
  assert.ok(seg.includes('st.gsel = {};'), 'ไม่ได้ล้างคนที่เลือกไว้ก่อน');
  assert.ok(seg.includes('st.draft = null;'), 'ไม่ได้ดึงค่าเดิมของคนใหม่มาตั้งต้น');
});
t('ไม่มีปุ่ม "เลือกทั้งหมด" ในรายชื่อสำหรับปรับรายบุคคล', () => {
  assert.ok(!WL.includes('wlGroupAll(1)'), 'ยังเลือกนักศึกษาทีละหลายคนได้');
  assert.ok(WL.includes('wlGroupAll(0)'), 'ควรเหลือปุ่มล้างที่เลือกไว้');
  // คนละตัวกับ wlPickAll ซึ่งใช้เลือกผู้เข้าร่วมของกิจกรรมในแผนชั้นปี — อันนั้นต้องเลือกทั้งหมดได้
  assert.ok(WL.includes('wlPickAll(1)'), 'ตัวเลือกผู้เข้าร่วมของกิจกรรมไม่ควรถูกตัดไปด้วย');
});

console.log('\n[2] ชั้นตรรกะกันการบันทึกหลายคน แม้หน้าจอจะถูกข้าม');
t('บันทึกพันธกิจเดียว ปฏิเสธเมื่อเลือกเกินหนึ่งคน', () => {
  const seg = WL.slice(WL.indexOf('window.wlSaveMission'), WL.indexOf('window.wlSaveMission') + 1600);
  assert.ok(seg.includes('sel.length > 1'), 'ไม่ได้กันการบันทึกหลายคน');
  assert.ok(seg.includes('นำเข้าไฟล์ CSV'), 'ไม่ได้บอกทางเลือกที่ถูกต้อง');
});
t('บันทึกทั้งหน้า ปฏิเสธเมื่อเลือกเกินหนึ่งคน', () => {
  const seg = WL.slice(WL.indexOf('window.wlSavePlan'), WL.indexOf('window.wlSavePlan') + 1800);
  assert.ok(seg.includes('sel.length > 1'), 'ไม่ได้กันการบันทึกหลายคน');
});
t('ไม่มีลูปเขียนรายคนแบบเดิมที่ถามยืนยันเกิน 40 คน', () => {
  assert.ok(!WL.includes('บันทึกให้นักศึกษา ' + "'" + ' + sel.length'), '');
  assert.ok(!WL.includes('ระบบจะสร้างค่าเฉพาะรายของแต่ละคน'), 'ยังมีเส้นทางบันทึกแบบกลุ่มเดิม');
});

console.log('\n[3] ไฟล์ CSV เป็นทางสำหรับกรอกทีละมาก ๆ');
t('นำเข้า CSV ลงแผนชั้นปีเท่านั้น ไม่เปิดในโหมดรายบุคคล', () => {
  assert.ok(WL.includes('function wlCsvPanel()'), 'wlCsvPanel ยังรับโหมด');
  const step3 = WL.slice(WL.indexOf('group ? groupPicker()'), WL.indexOf('group ? groupPicker()') + 200);
  assert.ok(step3.includes('wlCsvPanel()') && step3.indexOf('wlCsvPanel()') > step3.indexOf(':'),
    'แผงนำเข้า CSV ยังโผล่ในโหมดรายบุคคล');
  assert.ok(!WL.includes("wlCsvPanel(group ? 'group' : 'cohort')"), 'ยังส่งโหมดเข้าแผง CSV');
});
t('หนึ่งกิจกรรม = หนึ่งแถว พร้อมช่องผู้เข้าร่วม', () => {
  assert.ok(WL.includes("var CSV_COLS = ['mission', 'kind', 'subject_name', 'activity', 'pieces', 'hours',"),
    'คอลัมน์ CSV เปลี่ยนไป');
  assert.ok(WL.includes("'date_from', 'date_to', 'time_from', 'time_to', 'students']"), 'ไม่มีช่องผู้เข้าร่วม');
});
t('บอกผู้ใช้ว่าช่อง students เว้นว่าง = ทุกคนในชั้น', () => {
  assert.ok(WL.includes('เว้นว่าง = ทุกคนในชั้น'), 'ไม่ได้อธิบายช่องผู้เข้าร่วม');
});
t('นำเข้าแล้วยังไม่เขียนลงระบบจนกว่าจะกดบันทึก', () => {
  assert.ok(WL.includes('ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึก'), 'ไม่ได้เตือนว่าต้องกดบันทึกเอง');
});

console.log('\n[4] เลือกนักศึกษาหลายคน กรอกหลายกิจกรรม บันทึกครั้งเดียว');
t('มีกล่องเลือกกลุ่มผู้เข้าร่วมในโหมดกรอกทั้งชั้น', () => {
  const seg = grab('function partsGroupBox()');
  assert.ok(seg.includes('wlPickParts()'), 'ไม่มีปุ่มเลือกรายชื่อกลุ่ม');
  assert.ok(seg.includes('wlPartsApplyAll()'), 'ไม่มีปุ่มใส่รายชื่อให้แถวที่ยังว่าง');
  assert.ok(seg.includes('wlPartsClear()'), 'ไม่มีปุ่มล้างกลุ่ม');
  assert.ok(WL.includes('howToBox() + partsGroupBox()'), 'กล่องไม่ได้ถูกวางในขั้นที่ 3');
});
t('รายการที่เพิ่มใหม่ติดรายชื่อกลุ่มไปด้วย', () => {
  const seg = grab('window.wlRowAdd = function (mkey)');
  assert.ok(seg.includes('row.students = st0.gparts.slice()'), 'แถวใหม่ไม่ได้รับรายชื่อกลุ่ม');
  assert.ok(seg.includes('!m.subject'), 'ด้านวิชาการเก็บเป็นรายวิชา ไม่ควรมีผู้เข้าร่วม');
  assert.ok(seg.includes("st0.mode !== 'group'"), 'ไม่ควรใส่รายชื่อกลุ่มในโหมดปรับรายบุคคล');
});
t('ยังเก็บเป็นกิจกรรมละ 1 แถวในแผนชั้นปี ไม่ได้สร้างระเบียนรายคน', () => {
  // จุดสำคัญ : ตอบโจทย์ "เลือกหลายคน" โดยไม่กลับไปสร้างข้อมูลซ้ำแบบการบันทึกแบบกลุ่มเดิม
  const seg = grab('window.wlPartsApplyAll = function ()');
  assert.ok(seg.includes('r.students = g.slice()'), 'ไม่ได้เขียนรายชื่อลงแถวกิจกรรม');
  assert.ok(!seg.includes('workload_student'), 'กลับไปสร้างระเบียนรายคนอีกแล้ว');
  const add = grab('window.wlRowAdd = function (mkey)');
  assert.ok(!add.includes('workload_student'), 'กลับไปสร้างระเบียนรายคนอีกแล้ว');
});
t('เลือกครบทุกคน = ทุกคนในชั้น ไม่เก็บรายชื่อยาว ๆ ไว้เปล่า ๆ', () => {
  const seg = WL.slice(WL.indexOf("if (p.kind === 'parts')"), WL.indexOf("if (p.kind === 'parts')") + 400);
  assert.ok(seg.includes('sel.length < all0'), 'เลือกครบทุกคนแล้วยังเก็บรายชื่อทั้งหมด');
});
t('ไม่ทับรายชื่อของแถวที่ระบุผู้เข้าร่วมไว้แล้ว', () => {
  assert.ok(grab('window.wlPartsApplyAll = function ()').includes('if (partOf(r).length) return;'),
    'ทับรายชื่อเดิมที่ตั้งใจกรอกไว้');
});

console.log('\n[5] ทางเลือกที่ถูกต้องถูกบอกไว้ในหน้าจอ');
t('กล่องรายบุคคลชี้ทางไปแผนชั้นปีหรือ CSV', () => {
  const seg = grab('function groupPicker()');
  assert.ok(seg.includes('เลือกได้ทีละคนเท่านั้น'), 'ไม่ได้บอกว่าเลือกได้ทีละคน');
  assert.ok(seg.includes('CSV'), 'ไม่ได้ชี้ทางไปไฟล์ CSV');
  assert.ok(seg.includes('เฉพาะบางคน'), 'ไม่ได้ชี้ทางไปการระบุผู้เข้าร่วมในแผนชั้นปี');
});
t('การปรับรายบุคคลยังทำได้ ไม่ได้ถูกตัดทิ้ง', () => {
  // ลาพัก ย้ายเข้ากลางภาค เทียบโอน ยังต้องใช้
  assert.ok(WL.includes("wlSet(\\'mode\\',\\'group\\')"), 'ปิดทางปรับรายบุคคลไปด้วย');
  assert.ok(WL.includes("type: 'workload_student'"), 'ไม่มีทางเขียนค่าเฉพาะรายแล้ว');
});

console.log('\n[6] รายชื่อนักศึกษาเรียงตามรหัสเสมอ');
const SORT = new Function(`
  ${grab('function bySid(a, b)')}
  return bySid;
`)();
t('เรียงจากน้อยไปมากตามรหัส', () => {
  const ids = ['67101301061', '67101301004', '67101301080', '67101301021', '67101301002', '67101301001'];
  const got = ids.map(x => ({ student_id: x })).sort(SORT).map(x => x.student_id);
  assert.deepStrictEqual(got, ids.slice().sort(), 'ยังเรียงไม่ถูก');
  assert.strictEqual(got[0], '67101301001');
  assert.strictEqual(got[got.length - 1], '67101301080');
});
t('รหัสหายหรือว่างก็ไม่พัง', () => {
  const got = [{ student_id: '' }, {}, { student_id: '67101301005' }].sort(SORT);
  assert.strictEqual(got.length, 3);
});
t('ใช้กับรายชื่อทั้งสองเส้นทางของ cohortStudentsRaw', () => {
  const seg = grab('function cohortStudentsRaw(level, yr)');
  assert.strictEqual((seg.match(/sort\(bySid\)/g) || []).length, 2,
    'เส้นทางหาตามรหัสรุ่น และเส้นทางถอยไปใช้ชั้นปี ต้องเรียงทั้งคู่');
  assert.ok(seg.includes('hit.slice().sort(bySid)'), 'เรียงทับอาร์เรย์เดิมที่ใช้ร่วมกับที่อื่น');
});

console.log('\n[7] บันทึกแล้วล้างกลุ่มผู้เข้าร่วม');
t('บันทึกพันธกิจเดียวแล้วล้างกลุ่ม และบอกผู้ใช้', () => {
  const seg = WL.slice(WL.indexOf('window.wlSaveMission'), WL.indexOf('window.wlSavePlan'));
  assert.ok(seg.includes('st.gparts = [];'), 'กลุ่มเดิมยังค้างหลังบันทึก');
  assert.ok(seg.includes('ล้างกลุ่มผู้เข้าร่วมแล้ว'), 'ไม่ได้บอกผู้ใช้ว่าล้างแล้ว');
});
t('บันทึกทั้งหน้าแล้วล้างกลุ่มด้วย', () => {
  const i = WL.indexOf('window.wlSavePlan');
  const seg = WL.slice(i, i + 3000);
  assert.ok(seg.includes('st.gparts = [];'), 'กลุ่มเดิมยังค้างหลังบันทึก');
});
t('เปลี่ยนปี/ชั้นปี/ภาค/โหมด ต้องล้างกลุ่มด้วย', () => {
  assert.ok(WL.includes("if (['year', 'level', 'sem', 'mode'].indexOf(k) !== -1) { st.draft = null; st.gparts = []; }"),
    'รายชื่อของชั้นปีเดิมจะติดไปชั้นปีใหม่');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
