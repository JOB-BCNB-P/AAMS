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
t('มีจุดบันทึกเดียว ไม่มีปุ่มบันทึกรายพันธกิจแล้ว', () => {
  assert.ok(!WL.includes('บันทึกพันธกิจนี้</button>'), 'ยังมีปุ่มบันทึกในหัวกล่องพันธกิจ');
  assert.ok(!WL.includes('window.wlSaveMission = '), 'ยังเหลือตัวบันทึกรายพันธกิจที่ไม่มีใครเรียก');
  assert.ok(WL.includes('window.wlSavePlan'), 'ไม่มีตัวบันทึกหลัก');
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

console.log('\n[4] เลือกผู้เข้าร่วมได้ตั้งแต่ตอนเพิ่มกิจกรรม');
t('ทุกแถวมีช่อง "ใครเข้าร่วม" ของตัวเอง', () => {
  const seg = grab('function partLine(mkey, i, r, readonly)');
  assert.ok(seg.includes('ใครเข้าร่วม:'), 'ไม่มีช่องเลือกผู้เข้าร่วมในแถว');
  assert.ok(seg.includes('wlClearStudents(') && seg.includes('wlPickStudents('),
    'ต้องเลือกได้ทั้ง "ทุกคนในชั้น" และ "เฉพาะบางคน"');
});
t('แถวใหม่เริ่มที่ "ทุกคนในชั้น" เสมอ ไม่มีรายชื่อติดมาเอง', () => {
  const seg = grab('window.wlRowAdd = function (mkey)');
  assert.ok(!seg.includes('students'), 'แถวใหม่ถูกกำหนดผู้เข้าร่วมล่วงหน้า');
});
t('ไม่มีกล่องกลุ่มผู้เข้าร่วมแยกต่างหากแล้ว', () => {
  // เคยมีกล่องที่เลือกรายชื่อไว้ล่วงหน้า แล้วใส่ให้หลายแถวทีเดียว
  // ถอดออกเพราะทำให้กิจกรรมที่ตั้งใจให้ทั้งชั้นติดรายชื่อกลุ่มโดยไม่รู้ตัว
  ['partsGroupBox', 'wlPickParts', 'wlPartsApplyAll', 'wlPartsClear', 'gparts'].forEach(k => {
    assert.ok(!WL.includes(k), 'ยังเหลือ ' + k);
  });
});
t('ยังเก็บเป็นกิจกรรมละ 1 แถวในแผนชั้นปี', () => {
  assert.ok(!grab('window.wlRowAdd = function (mkey)').includes('workload_student'),
    'กลับไปสร้างระเบียนรายคนอีกแล้ว');
});

console.log('\n[4ข] หน้าต่างเพิ่มกิจกรรมให้กลุ่ม');
t('เลือกรายชื่อครั้งเดียว กรอกได้หลายกิจกรรม', () => {
  assert.ok(WL.includes('window.wlBatchOpen'), 'ไม่มีหน้าต่างเพิ่มกิจกรรมให้กลุ่ม');
  const body = grab('function batchBody()');
  assert.ok(body.includes('1. เลือกรายชื่อ') && body.includes('2. กรอกกิจกรรม'), 'ลำดับขั้นในหน้าต่างไม่ครบ');
  assert.ok(WL.includes('window.wlBatchRowAdd'), 'เพิ่มกิจกรรมหลายรายการไม่ได้');
});
t('รายชื่อติดเฉพาะแถวที่เพิ่มจากหน้าต่างนี้', () => {
  const seg = grab('window.wlBatchApply = function ()');
  assert.ok(seg.includes('row.students = parts.slice()'), 'ไม่ได้ใส่รายชื่อให้แถวที่เพิ่ม');
  // แถวปกติต้องไม่ถูกแตะ — กันไม่ให้รายชื่อรั่วไปกิจกรรมของทั้งชั้นเหมือนรอบก่อน
  assert.ok(!grab('window.wlRowAdd = function (mkey)').includes('students'),
    'แถวปกติยังถูกกำหนดผู้เข้าร่วมล่วงหน้า');
});
t('บังคับให้เลือกคนและกรอกชั่วโมงก่อนเพิ่ม', () => {
  const seg = grab('window.wlBatchApply = function ()');
  assert.ok(seg.includes('if (!sel.length)'), 'เพิ่มได้ทั้งที่ยังไม่เลือกใคร');
  assert.ok(seg.includes('canEditMission(b.mkey)'), 'ไม่ได้ตรวจสิทธิ์พันธกิจ');
  assert.ok(seg.includes('n(r.hours) > 0'), 'ปล่อยให้เพิ่มรายการที่ไม่มีชั่วโมง');
  assert.ok(seg.includes("norm(r.activity) !== ''"), 'ปล่อยให้เพิ่มรายการที่ไม่มีชื่อ');
});
t('เลือกครบทุกคน = ทุกคนในชั้น', () => {
  assert.ok(grab('window.wlBatchApply = function ()').includes('(sel.length < all) ? sel.slice() : []'),
    'เลือกครบทุกคนแล้วยังเก็บรายชื่อทั้งหมด');
});
t('เพิ่มแล้วยังไม่เขียนลงระบบ ต้องไปบันทึกที่ขั้นที่ 4', () => {
  const seg = grab('window.wlBatchApply = function ()');
  assert.ok(seg.includes('d[m.key].push(row)'), 'ไม่ได้ใส่ลงในช่องกรอก');
  assert.ok(!seg.includes('GSheetDB'), 'เขียนลงฐานข้อมูลทันที ข้ามขั้นตรวจสอบ');
  assert.ok(seg.includes('ขั้นที่ 4'), 'ไม่ได้บอกผู้ใช้ว่าต้องไปกดบันทึก');
});
t('ปุ่มเปิดหน้าต่างอยู่ในขั้นที่ 3', () => {
  assert.ok(grab('function howToBox()').includes('wlBatchOpen()'), 'ไม่มีปุ่มเปิดหน้าต่าง');
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

console.log('\n[7] บันทึกครั้งเดียวต้องไม่ทับงานคนอื่น');
t('ดึงข้อมูลล่าสุดก่อนเขียนแผนชั้นปี', () => {
  // เดิมการดึงข้อมูลล่าสุดอยู่ที่ปุ่มบันทึกรายพันธกิจ พอย้ายมาบันทึกที่เดียว
  // ต้องย้ายมาด้วย ไม่งั้นด้านที่คนอื่นเพิ่งบันทึกจะถูกเขียนทับด้วยค่าเก่าในเครื่อง
  const i = WL.indexOf('window.wlSavePlan');
  const seg = WL.slice(i, i + 4000);
  const refresh = seg.indexOf("refreshTab('workload_plan')");
  const write = seg.indexOf('GSheetDB.update(Object.assign({}, plan, payload))');
  assert.ok(refresh > -1, 'ไม่ได้ดึงข้อมูลล่าสุดก่อนบันทึกแผนชั้นปี');
  assert.ok(write > -1 && refresh < write, 'ดึงข้อมูลล่าสุดหลังเขียนแล้ว ไม่ทันการณ์');
});
t('บันทึกเฉพาะพันธกิจที่บัญชีนี้มีสิทธิ์', () => {
  const seg = WL.slice(WL.indexOf('window.wlSavePlan'), WL.indexOf('window.wlSavePlan') + 1200);
  assert.ok(seg.includes('canEditMission(m.key)'), 'ไม่ได้กรองพันธกิจตามสิทธิ์');
  assert.ok(seg.includes('if (st.mission)'), 'เลือกกรอกพันธกิจเดียวแล้วต้องบันทึกเฉพาะพันธกิจนั้น');
});

console.log('\n[8] บันทึกทีละกลุ่ม แล้วเริ่มกลุ่มใหม่');
t('บันทึกเสร็จแล้วล้างฟอร์ม ไม่ใช่โหลดของเดิมกลับมา', () => {
  const i = WL.indexOf('window.wlSavePlan');
  const seg = WL.slice(i, i + 5000);
  assert.ok(seg.includes('st.draft = emptyDraft()'), 'ฟอร์มยังไม่ถูกล้างหลังบันทึก');
  assert.ok(seg.includes('st.addMode = true'), 'ไม่ได้เข้าสู่รอบเพิ่มกลุ่มใหม่');
});
t('รอบเพิ่มกลุ่มใหม่ต้องต่อท้าย ไม่ใช่เขียนทับของเดิม', () => {
  // จุดตายของฟีเจอร์นี้ : ถ้าเขียนทับ กลุ่มที่เพิ่งบันทึกไปจะหายทันทีที่บันทึกกลุ่มถัดไป
  const i = WL.indexOf('window.wlSavePlan');
  const seg = WL.slice(i, i + 5000);
  assert.ok(seg.includes('st.addMode ? rows(plan, m).concat(add) : add'), 'บันทึกทับของเดิม');
  const refresh = seg.indexOf("refreshTab('workload_plan')");
  const read = seg.indexOf('rows(plan, m).concat(add)');
  assert.ok(refresh > -1 && refresh < read, 'อ่านของเดิมจากข้อมูลค้างในเครื่อง ไม่ใช่ของสดจากฐานข้อมูล');
});
t('ยังกลับไปแก้ไขของที่บันทึกแล้วได้', () => {
  const seg = grab('window.wlShowAll = function ()');
  assert.ok(seg.includes('st.draft = null') && seg.includes('st.addMode = false'),
    'ออกจากรอบเพิ่มกลุ่มไม่ได้');
  assert.ok(grab('function addModeBar()').includes('wlShowAll()'), 'ไม่มีทางกลับไปแก้ของเดิม');
});
t('บอกผู้ใช้ว่าของเดิมยังอยู่ ไม่ได้หายไป', () => {
  const seg = grab('function addModeBar()');
  assert.ok(seg.includes('ไม่แสดงในฟอร์มรอบนี้ แต่ไม่ถูกลบ'), 'ผู้ใช้จะเข้าใจว่าข้อมูลหาย');
  assert.ok(WL.includes('function savedCount()'), 'ไม่ได้นับรายการที่อยู่ในแผนแล้ว');
});
t('เปลี่ยนปี/ชั้นปี/ภาค/โหมด ต้องออกจากรอบเพิ่มกลุ่ม', () => {
  // ไม่งั้นจะไปต่อท้ายแผนของขอบเขตใหม่ด้วยข้อมูลที่ตั้งใจลงให้ขอบเขตเดิม
  assert.ok(WL.includes("{ st.draft = null; st.addMode = false; }"), 'ยังค้างสถานะข้ามขอบเขต');
});
t('ปุ่มบันทึกบอกว่ากำลังเพิ่มเข้าแผน', () => {
  assert.ok(WL.includes("'เพิ่มเข้าแผน'"), 'ปุ่มยังบอกว่า "บันทึก" ทั้งที่เป็นการเพิ่มต่อท้าย');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
