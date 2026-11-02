/* หน้ากรอกภาระงาน — ลำดับขั้นใหม่ 6 ขั้น และการเลือกผู้รับภาระงานจากเลขที่
   จุดที่ต้องไม่พลาด : "ล้างข้อมูล" ต้องไม่ลบของที่บันทึกไปแล้ว */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const WL = fs.readFileSync(path.join(ROOT, 'workload.js'), 'utf8');
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
const plan = grab('function planTab()');

console.log('\n[1] ลำดับขั้น 6 ขั้น');
// หัวข้อบางขั้นเขียนเป็นเงื่อนไข (group ? ... : ...) จึงต้องรับทั้งสองแบบ
const titles = [...plan.matchAll(/wlStep\((\d),\s*(?:group \? )?'([^']+)'(?:\s*:\s*'([^']+)')?/g)]
  .map(m => [Number(m[1]), m[3] || m[2]]);
t('มีครบ 6 ขั้น เรียงถูกลำดับ', () => {
  assert.deepStrictEqual(titles.map(x => x[0]), [1, 2, 3, 4, 5, 6]);
});
t('หัวข้อแต่ละขั้นตรงตามที่กำหนด', () => {
  assert.ok(titles[0][1].includes('เลือกชั้นปี'), 'ขั้น 1 ต้องเป็นเลือกชั้นปี');
  assert.ok(titles[1][1].includes('ภาคการศึกษา'), 'ขั้น 2 ต้องเป็นภาคการศึกษา');
  assert.ok(/ผู้รับภาระงาน|นักศึกษา/.test(titles[2][1]), 'ขั้น 3 ต้องเป็นการเลือกผู้รับภาระงาน');
  assert.ok(titles[3][1].includes('พันธกิจ'), 'ขั้น 4 ต้องเป็นการเลือกพันธกิจ');
  assert.ok(titles[4][1].includes('สรุป'), 'ขั้น 5 ต้องเป็นสรุป');
  assert.ok(/บันทึก.*ล้างข้อมูล.*ยกเลิก/.test(titles[5][1]), 'ขั้น 6 ต้องเป็นแถบปุ่ม');
});
t('ขั้นที่ 4 แสดงช่องกรอกทันทีในขั้นเดียวกัน', () => {
  const step4 = plan.slice(plan.indexOf("wlStep(4"), plan.indexOf("wlStep(5"));
  assert.ok(step4.includes('missionPicker()'), 'ไม่มีตัวเลือกพันธกิจ');
  assert.ok(step4.includes('missionEditors('), 'ไม่ได้แสดงช่องกรอกในขั้นเดียวกัน');
});

console.log('\n[2] นำเข้าไฟล์ CSV อยู่บนสุด');
t('แผง CSV อยู่นอกและอยู่ก่อนบล็อกขั้นตอน', () => {
  assert.ok(/var csvTop = group \? '' :[\s\S]{0,80}wlCsvPanel\(\)/.test(plan), 'ไม่พบแผง CSV ด้านบน');
  assert.ok(plan.includes('return modeBar + csvTop + steps'), 'แผง CSV ไม่ได้อยู่ก่อนขั้นตอน');
});
t('ไม่มีแผง CSV ซ้ำอยู่ในขั้นตอนอีก', () => {
  const stepsBlock = plan.slice(plan.indexOf('var steps ='), plan.indexOf("+ '</div>';", plan.indexOf('var steps =')));
  assert.ok(!stepsBlock.includes('wlCsvPanel()'), 'ยังมีแผง CSV ซ้อนอยู่ในขั้นตอน');
});

console.log('\n[3] ขอบเขตผู้รับภาระงาน');
t('มีตัวเลือกครบ ทั้งชั้นปี / sec / รายคน', () => {
  const g = grab('function partScopePicker()');
  assert.ok(g.includes("btn('all'"), 'ไม่มีตัวเลือกทั้งชั้นปี');
  assert.ok(g.includes("btn('room'"), 'ไม่มีตัวเลือกราย sec');
  assert.ok(g.includes("btn('pick'"), 'ไม่มีตัวเลือกรายคน');
});
t('sec อ่านจากช่องห้องของนักศึกษา', () => {
  const g = grab('function roomsOf(level)');
  assert.ok(g.includes('s.room'), 'ไม่ได้อ่านจากช่องห้อง');
});
t('แถวใหม่รับรายชื่อตามขอบเขตที่เลือก', () => {
  const g = grab('window.wlRowAdd = function (mkey)');
  assert.ok(g.includes('scopeStudents()'), 'แถวใหม่ไม่ได้รับขอบเขต');
  assert.ok(g.includes('if (scope.length) row.students'), 'เลือกทั้งชั้นปีแล้วไม่ควรใส่รายชื่อ');
});

console.log('\n[4] แปลงข้อความเลขที่');
const P = new Function(`${grab('function parseSeats(text, max)')} return parseSeats;`)();
t('เลขเดี่ยวและช่วงผสมกันได้', () => {
  assert.deepStrictEqual(P('1-5, 12, 20', 50).seats, [1, 2, 3, 4, 5, 12, 20]);
});
t('ช่วงกลับหัวกลับหางก็อ่านได้', () => {
  assert.deepStrictEqual(P('9-7', 50).seats, [7, 8, 9]);
});
t('ตัดเลขซ้ำและเรียงให้', () => {
  assert.deepStrictEqual(P('5, 1, 5, 3', 50).seats, [1, 3, 5]);
});
t('เลขเกินจำนวนคนในชั้น ถูกคัดออกและรายงานกลับ', () => {
  const r = P('1, 99', 10);
  assert.deepStrictEqual(r.seats, [1]);
  assert.deepStrictEqual(r.bad, ['99']);
});
t('เลข 0 และค่าว่างไม่ถูกนับ', () => {
  assert.deepStrictEqual(P('0', 10).seats, []);
  assert.deepStrictEqual(P('', 10).seats, []);
  assert.deepStrictEqual(P('   ', 10).seats, []);
});
t('คั่นด้วยช่องว่าง จุด หรือจุลภาคก็ได้', () => {
  assert.deepStrictEqual(P('1 2.3,4', 10).seats, [1, 2, 3, 4]);
});

console.log('\n[5] ปุ่มขั้นที่ 6 ต้องไม่ทำลายข้อมูล');
t('ล้างข้อมูลถามยืนยันและบอกว่าไม่ลบของที่บันทึกแล้ว', () => {
  const g = grab('window.wlClearForm = function ()');
  assert.ok(g.includes('confirm('), 'ไม่ได้ถามยืนยันก่อนล้าง');
  assert.ok(g.includes('ไม่ถูกลบ'), 'ไม่ได้บอกผู้ใช้ว่าข้อมูลที่บันทึกแล้วปลอดภัย');
  assert.ok(!/GSheetDB\.(update|create|delete)/.test(g), 'ล้างฟอร์มต้องไม่เขียนหรือลบในฐานข้อมูล');
});
t('ล้างข้อมูลเพียงรีเซ็ตฟอร์มในหน้าจอ', () => {
  const g = grab('window.wlClearForm = function ()');
  assert.ok(g.includes('st.draft = st.addMode ? emptyDraft() : null'),
    'วิธีล้างเปลี่ยนไป อาจกลายเป็นล้างของที่บันทึกแล้ว');
});
t('ยกเลิกถามยืนยันแล้วกลับหน้าสรุปผลรวม', () => {
  const g = grab('window.wlCancelForm = function ()');
  assert.ok(g.includes('confirm('), 'ไม่ได้ถามยืนยัน');
  assert.ok(g.includes("navigateTo('workloadSummary')"), 'ไม่ได้กลับหน้าสรุปผลรวม');
  assert.ok(!/GSheetDB\./.test(g), 'ยกเลิกต้องไม่แตะฐานข้อมูล');
});
t('ปุ่มบันทึกมีที่เดียว ไม่ซ้ำกับการ์ดสรุป', () => {
  const step5 = plan.slice(plan.indexOf("wlStep(5"), plan.indexOf("wlStep(6"));
  assert.ok(step5.includes('grandCard(group, true)'), 'การ์ดสรุปยังมีปุ่มบันทึกของตัวเอง');
  const bar = grab('function actionBar(group)');
  assert.ok(bar.includes('wlSavePlan()'), 'แถบปุ่มไม่มีปุ่มบันทึก');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
