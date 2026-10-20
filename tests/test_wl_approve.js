/* ภาระงานนักศึกษา — รายการที่นักศึกษาบันทึกเองต้องได้รับอนุมัติก่อนจึงนับชั่วโมง
   ผู้อนุมัติ = เจ้าหน้าที่ด้านนั้น หรือผู้ดูแลระบบ
   ฐานข้อมูลบังคับซ้ำใน ems.workload_student_guard() (ดู supabase/security/99_*.sql) */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const WL = fs.readFileSync(path.join(ROOT, 'workload.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

// ดึงฟังก์ชันจริงจากไฟล์มาทดสอบพฤติกรรม ไม่ใช่แค่ตรวจข้อความ
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
const F = new Function(`
  function norm(v) { return String(v == null ? '' : v).trim(); }
  var ST_PENDING='pending', ST_APPROVED='approved', ST_REJECTED='rejected';
  ${grab('function isSelfRow(r)')}
  ${grab('function rowStatus(r)')}
  ${grab('function rowCounts(r)')}
  return { isSelfRow, rowStatus, rowCounts, ST_PENDING, ST_APPROVED, ST_REJECTED };
`)();

console.log('\n[1] รายการไหนถูกนับเป็นชั่วโมง');
t('รายการของวิทยาลัยนับทันที ไม่ต้องอนุมัติ', () => {
  assert.strictEqual(F.rowCounts({ name: 'พิธีไหว้ครู', hours: '4' }), true);
});
t('รายการที่นักศึกษาเพิ่งบันทึก ยังไม่นับ', () => {
  assert.strictEqual(F.rowCounts({ name: 'จิตอาสา', hours: '5', self: 1, status: 'pending' }), false);
});
t('ไม่มีช่อง status ถือว่ารออนุมัติ (ข้อมูลก่อนมีระบบอนุมัติ)', () => {
  assert.strictEqual(F.rowStatus({ name: 'เก่า', hours: '2', self: 1 }), F.ST_PENDING);
  assert.strictEqual(F.rowCounts({ name: 'เก่า', hours: '2', self: 1 }), false);
});
t('อนุมัติแล้วจึงนับ', () => {
  assert.strictEqual(F.rowCounts({ hours: '5', self: 1, status: 'approved' }), true);
});
t('ไม่อนุมัติ = ไม่นับ', () => {
  assert.strictEqual(F.rowCounts({ hours: '5', self: 1, status: 'rejected' }), false);
});
t('สถานะที่อ่านไม่ออกถือว่ารออนุมัติ ไม่ใช่ปล่อยผ่าน', () => {
  ['', 'APPROVED ', 'ok', 'อนุมัติ', null].forEach(v => {
    assert.strictEqual(F.rowCounts({ hours: '9', self: 1, status: v }), false, String(v));
  });
});

console.log('\n[2] การคิดชั่วโมงใช้ตัวตัดสินเดียวกัน');
t('calc() กรองรายการที่ยังไม่อนุมัติออก', () => {
  assert.ok(WL.includes('return appliesTo(r, sid) && rowCounts(r);'), 'calc ยังนับรายการที่รออนุมัติ');
});
t('หน้าของนักศึกษา ชั่วโมงรวมนับเฉพาะที่อนุมัติแล้ว และบอกยอดที่รออยู่', () => {
  assert.ok(WL.includes('if (rowCounts(r)) grand += n(r.hours);'), 'ยอดรวมยังนับรายการที่รออนุมัติ');
  assert.ok(WL.includes("rowStatus(x.r) === ST_PENDING ? n(x.r.hours) : 0"), 'ไม่ได้แยกยอดที่รออนุมัติ');
  assert.ok(WL.includes('รออนุมัติอีก '), 'ไม่ได้บอกนักศึกษาว่ามีชั่วโมงค้างอยู่');
});

console.log('\n[3] นักศึกษาตั้งสถานะเองไม่ได้');
t('รายการใหม่ถูกตั้งเป็นรออนุมัติเสมอ', () => {
  const i = WL.indexOf('list.push({', WL.indexOf('function selfForm'));
  assert.ok(WL.slice(i, i + 420).includes('status: ST_PENDING'), 'รายการใหม่ไม่ได้ตั้งเป็นรออนุมัติ');
});
t('แก้ไขแล้วกลับไปรออนุมัติใหม่ และล้างผู้อนุมัติเดิม', () => {
  const i = WL.indexOf('if (editing) {', WL.indexOf('function selfForm'));
  const seg = WL.slice(i, i + 700);
  assert.ok(seg.includes('status: ST_PENDING'), 'แก้แล้วยังคงสถานะอนุมัติเดิม');
  assert.ok(seg.includes("appr_by: ''") && seg.includes("appr_note: ''"), 'ไม่ได้ล้างชื่อผู้อนุมัติเดิม');
});
t('แก้ไขหรือลบรายการที่อนุมัติแล้วไม่ได้', () => {
  ['window.wlSelfEdit', 'window.wlSelfRemove'].forEach(fn => {
    const seg = WL.slice(WL.indexOf(fn), WL.indexOf(fn) + 900);
    assert.ok(seg.includes('rowStatus(list['), fn + ' ไม่ได้ตรวจสถานะอนุมัติ');
  });
});
t('ฐานข้อมูลกันซ้ำอีกชั้น ไม่พึ่งหน้าเว็บอย่างเดียว', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'security', '99_workload_guard_areas.sql'), 'utf8');
  assert.ok(sql.includes('ตั้งสถานะอนุมัติเองไม่ได้'), 'migration ไม่ได้กันการตั้งสถานะเอง');
  assert.ok(sql.includes('แก้ไขหรือลบไม่ได้'), 'migration ไม่ได้กันการแก้รายการที่อนุมัติแล้ว');
});

console.log('\n[4] คิวรออนุมัติของเจ้าหน้าที่');
t('เห็นเฉพาะด้านที่ตนได้รับมอบหมาย', () => {
  const seg = grab('function pendingRows(year)');
  assert.ok(seg.includes('myMissions()'), 'ไม่ได้กรองตามด้านที่รับผิดชอบ');
  assert.ok(seg.includes('if (mine.indexOf(m.key) < 0) return;'), 'ไม่ได้กรองตามด้านที่รับผิดชอบ');
  assert.ok(seg.includes('if (rowStatus(r) === ST_APPROVED) return;'), 'คิวต้องไม่มีรายการที่อนุมัติแล้ว');
});
t('ลำดับรายการนับเฉพาะรายการที่นักศึกษาบันทึกเอง', () => {
  // ต้องตรงกับ selfIndexOf ตอนบันทึก ไม่งั้นจะอนุมัติผิดรายการ
  assert.ok(grab('function pendingRows(year)').includes('var rk = rank++;'));
  assert.ok(WL.slice(WL.indexOf('async function setRowStatus'), WL.indexOf('async function setRowStatus') + 1200)
    .includes('selfIndexOf(list, rank)'), 'ตัวบันทึกผลไม่ได้ใช้ตัวหาตำแหน่งตัวเดียวกัน');
});
t('บันทึกผลการพิจารณาตรวจสิทธิ์ซ้ำ และดึงข้อมูลล่าสุดก่อนเขียน', () => {
  const seg = WL.slice(WL.indexOf('async function setRowStatus'), WL.indexOf('async function setRowStatus') + 1400);
  assert.ok(seg.includes('if (!canEditMission(mkey))'), 'ไม่ได้ตรวจสิทธิ์ก่อนบันทึก');
  assert.ok(seg.includes("refreshTab('workload_student')"), 'ไม่ได้ดึงข้อมูลล่าสุด อาจทับงานคนอื่น');
  assert.ok(seg.includes('appr_by') && seg.includes('appr_at'), 'ไม่ได้บันทึกว่าใครอนุมัติเมื่อไร');
});
t('ไม่อนุมัติต้องระบุเหตุผล และนักศึกษาเห็นเหตุผลนั้น', () => {
  const seg = WL.slice(WL.indexOf('window.wlReject'), WL.indexOf('window.wlReject') + 500);
  assert.ok(seg.includes('กรุณาระบุเหตุผล'), 'ไม่อนุมัติได้โดยไม่บอกเหตุผล');
  assert.ok(WL.includes('esc(r.appr_note)'), 'นักศึกษาไม่เห็นเหตุผลที่ไม่อนุมัติ');
});
t('มีเมนูย่อยและหน้าคิวรออนุมัติ', () => {
  assert.ok(WL.includes("workloadApprove: 'approve'"), 'ไม่ได้ผูกชื่อหน้า');
  assert.ok(WL.includes("['workloadApprove', 'อนุมัติภาระงาน']"), 'ไม่มีเมนูย่อย');
  assert.ok(WL.includes("st.tab === 'approve' ? approveTab()"), 'เมนูไม่ได้ชี้ไปที่หน้าคิว');
});
t('เจ้าหน้าที่ที่ยังไม่ได้รับมอบหมายด้าน เห็นคำอธิบาย ไม่ใช่หน้าว่าง', () => {
  assert.ok(grab('function approveTab()').includes('ยังไม่ได้รับมอบหมายพันธกิจใดเลย'));
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
