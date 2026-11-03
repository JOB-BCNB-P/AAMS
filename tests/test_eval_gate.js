/* ประตูกั้นผลการเรียนด้วยการประเมินรายวิชา
   จุดที่ต้องไม่พลาด
   1) ตัวบังคับจริงต้องอยู่ที่ฐานข้อมูล ไม่ใช่แค่ซ่อนที่หน้าเว็บ
   2) คนที่ระบบไม่ได้ให้ประเมิน ต้องไม่ถูกล็อกจนไม่มีทางปลด
   3) นักศึกษาต้องรู้เหตุผลและกดไปทำแบบประเมินได้ ไม่ใช่เห็นตารางขาดไปเฉย ๆ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const EV = fs.readFileSync(path.join(ROOT, 'eval.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

console.log('\n[1] ตรรกะการล็อก (จำลองตามฟังก์ชัน ems.grade_locked)');
function locked(stu, form, responses, exempt) {
  const b = v => String(v == null ? '' : v).trim();
  if (b(stu.status) !== 'กำลังศึกษา') return false;          // จบ/พ้นสภาพ/ลาพัก = ยกเว้น
  if (b(stu.year_level) === 'จบ') return false;
  if (exempt.indexOf(b(stu.student_id)) !== -1) return false; // ผู้ดูแลปลดล็อกให้
  if (!form) return false;
  if (b(form.status) !== 'เปิด') return false;
  const owns = b(form.batch)
    ? b(form.batch) === b(stu.batch)
    : (!!b(form.year_level) && b(form.year_level) === b(stu.year_level));
  if (!owns) return false;
  return !responses.some(r => b(r.form_code) === b(form.form_code)
    && b(r.student_id) === b(stu.student_id) && b(r.status) === 'ส่งแล้ว');
}
const STU = { student_id: '001', status: 'กำลังศึกษา', year_level: '2', batch: '36' };
const F = { form_code: 'EV1', status: 'เปิด', batch: '36', year_level: '2' };

t('เปิดให้ประเมินแล้วยังไม่ส่ง = ล็อก', () => {
  assert.strictEqual(locked(STU, F, [], []), true);
});
t('ส่งแบบประเมินแล้ว = ปลดทันที', () => {
  assert.strictEqual(locked(STU, F, [{ form_code: 'EV1', student_id: '001', status: 'ส่งแล้ว' }], []), false);
});
t('บันทึกร่างค้างไว้ ยังไม่ถือว่าส่ง', () => {
  assert.strictEqual(locked(STU, F, [{ form_code: 'EV1', student_id: '001', status: 'ร่าง' }], []), true);
});
t('แบบประเมินยังเป็นร่าง ไม่ล็อกใคร', () => {
  assert.strictEqual(locked(STU, Object.assign({}, F, { status: 'ร่าง' }), [], []), false);
});
t('คนละรุ่นกับแบบประเมิน ต้องไม่ถูกล็อก', () => {
  // จุดตาย : ถ้าล็อกคนที่ไม่มีแบบประเมินให้ทำ เขาจะไม่มีทางปลดล็อกได้เลย
  const other = Object.assign({}, STU, { student_id: '002', batch: '35' });
  assert.strictEqual(locked(other, F, [], []), false);
});
t('แบบประเมินไม่ระบุรุ่น ใช้ชั้นปีแทน', () => {
  const f2 = { form_code: 'EV2', status: 'เปิด', batch: '', year_level: '3' };
  assert.strictEqual(locked(STU, f2, [], []), false, 'ชั้นปีไม่ตรง ไม่ควรล็อก');
  assert.strictEqual(locked(Object.assign({}, STU, { year_level: '3' }), f2, [], []), true);
});
t('ผู้สำเร็จการศึกษาและผู้พ้นสภาพ ขอ Transcript ได้เสมอ', () => {
  assert.strictEqual(locked(Object.assign({}, STU, { status: 'สำเร็จการศึกษา' }), F, [], []), false);
  assert.strictEqual(locked(Object.assign({}, STU, { status: 'ลาออก' }), F, [], []), false);
  assert.strictEqual(locked(Object.assign({}, STU, { year_level: 'จบ' }), F, [], []), false);
});
t('นักศึกษาลาพักการศึกษา ไม่ถูกล็อก', () => {
  assert.strictEqual(locked(Object.assign({}, STU, { status: 'พักการศึกษา' }), F, [], []), false);
});
t('ผู้ดูแลปลดล็อกรายคนได้', () => {
  assert.strictEqual(locked(STU, F, [], ['001']), false);
});

console.log('\n[2] หน้าเว็บต้องอธิบาย ไม่ใช่ซ่อนเงียบ ๆ');
t('หน้าผลการเรียนของนักศึกษามีแถบบอกเหตุผล', () => {
  assert.ok(APP.includes('gradeGateNoticeHTML()'), 'ไม่ได้เรียกแถบแจ้งเตือนในหน้าผลการเรียน');
  const g = grab(APP, 'async function renderGradeGateNotice()');
  assert.ok(g.includes('evalGateSubjects'), 'ไม่ได้อ่านรายวิชาที่ยังไม่ประเมิน');
  assert.ok(g.includes('evalGoTo('), 'ไม่มีปุ่มพาไปทำแบบประเมิน');
});
t('แถบนี้ขึ้นเฉพาะนักศึกษา ไม่รบกวนเจ้าหน้าที่', () => {
  assert.ok(APP.includes("isStudent ? gradeGateNoticeHTML() : gradeOverviewCardsHTML()"),
    'แถบไปโผล่ในมุมมองเจ้าหน้าที่');
});
t('บอกด้วยว่าคำตอบไม่ผูกกับชื่อผู้ตอบ', () => {
  const g = grab(APP, 'async function renderGradeGateNotice()');
  assert.ok(g.includes('ไม่ผูกกับชื่อผู้ตอบ'), 'นักศึกษาจะกลัวว่าประเมินแล้วอาจารย์รู้ว่าใครให้คะแนนเท่าไร');
  assert.ok(g.includes('ติดต่องานวิชาการ'), 'ไม่ได้บอกทางออกสำหรับคนที่ทำประเมินไม่ได้');
});
t('ไม่มีแบบประเมินค้าง ต้องไม่ขึ้นแถบ', () => {
  const g = grab(APP, 'async function renderGradeGateNotice()');
  assert.ok(/if \(!list\.length\) \{ box\.innerHTML = ''; return; \}/.test(g), 'แถบจะค้างทั้งที่ทำครบแล้ว');
});

console.log('\n[3] เครื่องมือของผู้ดูแล');
t('ปุ่มปลดล็อกรายคนอยู่ในหน้าติดตามอัตราการตอบ', () => {
  assert.ok(EV.includes('window.evalGateUnlock'), 'ไม่มีปุ่มปลดล็อก');
  assert.ok(EV.includes('gateBtnHTML(sid'), 'ปุ่มไม่ได้ถูกวางในรายชื่อผู้ที่ยังไม่ประเมิน');
});
t('ยังไม่ได้ติดตั้งตารางก็ต้องไม่ทำให้หน้าพัง', () => {
  const g = grab(EV, 'async function gateExemptSet()');
  assert.ok(g.includes('catch (e) { return null; }'), 'ตารางยังไม่มีแล้วหน้าจะพัง');
  assert.ok(EV.includes("exempt === null"), 'ไม่ได้แจ้งว่ายังไม่ได้ติดตั้ง');
});
t('ปลดล็อกแล้วยกเลิกได้ ไม่ใช่ทางเดียว', () => {
  const g = grab(EV, 'window.evalGateUnlock = async function (sid, on)');
  assert.ok(g.includes('.upsert(') && g.includes('.delete()'), 'ยกเลิกการปลดล็อกไม่ได้');
  assert.ok(g.includes('created_by: who()'), 'ไม่ได้บันทึกว่าใครเป็นคนปลดล็อก');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
