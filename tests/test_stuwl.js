/* นักศึกษาบันทึกและดูภาระงานของตนเอง · เข้าระบบด้วยอีเมล · เลขบัตรเห็นเฉพาะผู้ดูแล */
const fs = require('fs');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const APP = fs.readFileSync(P + 'app.js', 'utf8');
const WL = fs.readFileSync(P + 'workload.js', 'utf8');
const PATCH = fs.readFileSync(P + 'app-patch.js', 'utf8');
const DB = fs.readFileSync(P + 'supabase-db.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('[1] เข้าระบบด้วยอีเมล');
t('ไม่มีช่องเลขบัตรประชาชนในหน้าเข้าสู่ระบบแล้ว', () => {
  assert.ok(!PATCH.includes("id=\"studentNID\""), 'ยังมีช่องเลขบัตรอยู่');
  assert.ok(!PATCH.includes('GSheetDB.studentLogin'), 'ยังมีเส้นทางเข้าระบบด้วยเลขบัตร');
});
t('นักศึกษาใช้ Google อีเมลของวิทยาลัยเหมือนบุคลากร', () => {
  const i = PATCH.indexOf("if (mode === 'student')");
  const seg = PATCH.slice(i, i + 900);
  assert.ok(seg.includes('เข้าสู่ระบบด้วยบัญชี Google ของวิทยาลัย'), 'ไม่ได้บอกให้ใช้ Google');
  assert.ok(seg.includes('รหัสนักศึกษา@'), 'ไม่ได้บอกรูปแบบอีเมล');
  assert.ok(seg.includes("btn.classList.add('hidden')"), 'ยังมีปุ่มกรอกเองค้างอยู่');
});

console.log('\n[2] เลขบัตรประชาชน เก็บไว้แต่ปิดบัง');
const maskSrc = APP.slice(APP.indexOf('function maskNationalId'), APP.indexOf('function maskNationalId') + 700);
t('เห็นเฉพาะผู้ดูแลระบบ', () =>
  assert.ok(maskSrc.includes("APP.currentRole !== 'admin'"), 'บทบาทอื่นยังเห็นเลข'));
t('ปิดบังสามตัวท้ายด้วย xxx', () => {
  assert.ok(maskSrc.includes("s.length - 3) + 'xxx'"), 'ไม่ได้ปิดสามตัวท้าย');
  assert.ok(!maskSrc.includes("'xxxx'"), 'ยังปิดสี่ตัวแบบเดิม');
  // ทดลองเรียกจริง
  const APPobj = { currentRole: 'admin' };
  const fn = new Function('APP', maskSrc.slice(0, maskSrc.indexOf('\n}') + 2) + '\nreturn maskNationalId;')(APPobj);
  assert.strictEqual(fn('1234567890123'), '1234567890xxx');
  assert.strictEqual(fn(''), '-');
  const fn2 = new Function('APP', maskSrc.slice(0, maskSrc.indexOf('\n}') + 2) + '\nreturn maskNationalId;')({ currentRole: 'teacher' });
  assert.ok(fn2('1234567890123').includes('เฉพาะผู้ดูแลระบบ'), 'บทบาทอื่นไม่ควรเห็นตัวเลขเลย');
});
t('ข้อมูลยังถูกเก็บไว้ ไม่ได้ลบทิ้ง', () => {
  assert.ok(APP.includes("name=\"national_id\""), 'ช่องกรอกหายไป ข้อมูลจะบันทึกไม่ได้');
  assert.ok(APP.includes('national_id,name_en'), 'หัวตาราง CSV ไม่มีคอลัมน์นี้แล้ว');
});

console.log('\n[3] นักศึกษาเห็นและบันทึกภาระงานของตนเอง');
t('เปิดสิทธิ์เข้าหน้าภาระงานให้นักศึกษา', () =>
  assert.ok(/student: \{[^}]*workload: 1/.test(APP), 'ยังไม่ได้เปิดสิทธิ์'));
t('มีหน้าเฉพาะของนักศึกษา แยกจากหน้าเจ้าหน้าที่', () => {
  assert.ok(WL.includes('function studentWorkloadPage()'), 'ไม่มีหน้าของนักศึกษา');
  assert.ok(WL.includes('if (isStudentView()) return studentWorkloadPage();'), 'ไม่ได้แยกเส้นทาง');
});
t('บันทึกได้เฉพาะ 4 ด้าน ไม่รวมด้านวิชาการ', () => {
  assert.ok(WL.includes("var STUDENT_MISSIONS = ['research', 'service', 'student', 'personal'];"),
    'รายการพันธกิจไม่ตรง');
  assert.ok(!/STUDENT_MISSIONS = \[[^\]]*teaching/.test(WL), 'ด้านวิชาการต้องไม่ให้นักศึกษาแก้');
  assert.ok(WL.includes('if (isStudentView()) return mySid() ? STUDENT_MISSIONS.slice() : [];'),
    'ไม่ได้จำกัดพันธกิจของนักศึกษา');
});
t('ไม่มีรหัสนักศึกษา ต้องไม่ให้บันทึก', () =>
  assert.ok(WL.includes('if (isStudentView()) return !!mySid();'), 'บัญชีที่ไม่มีรหัสยังบันทึกได้'));
t('กรองดูตามปีการศึกษาได้', () => {
  const i = WL.indexOf('function studentWorkloadPage()');
  const seg = WL.slice(i, i + 3000);
  assert.ok(seg.includes("wlSet(\\'year\\'") || seg.includes("wlSet('year'"), 'ไม่มีตัวเลือกปีการศึกษา');
});
t('รายการที่วิทยาลัยกำหนดต้องไม่หายเมื่อนักศึกษาเพิ่มรายการแรก', () => {
  // จุดพลาดที่ร้ายแรงที่สุดของงานนี้ : แถวของตัวเองจะแทนที่แผนของชั้นปี
  assert.ok(WL.includes('function selfSeedRows'), 'ไม่มีตัวคัดลอกรายการเดิมมาตั้งต้น');
  const i = WL.indexOf('function selfSeedRows');
  const seg = WL.slice(i, i + 700);
  assert.ok(seg.includes('planOf(year, myLevel(), sem)'), 'ไม่ได้ดึงแผนของชั้นปีมา');
  assert.ok(seg.includes('appliesTo(r, sid)'), 'ไม่ได้กรองเฉพาะรายการที่มีผลกับคนนี้');
  assert.ok(WL.includes('var list = selfSeedRows(mySid(), state().year, sem, missionOf(mkey));'),
    'ตอนเพิ่มไม่ได้ตั้งต้นจากรายการเดิม');
});
t('รายการที่บันทึกเองมีป้ายกำกับ แยกจากของวิทยาลัยได้', () => {
  assert.ok(WL.includes('self: 1,'), 'ไม่ได้ติดธงว่าบันทึกเอง');
  assert.ok(WL.includes('ฉันบันทึกเอง') && WL.includes('วิทยาลัยกำหนด'), 'หน้าจอไม่ได้แยกที่มา');
});
t('ลบได้เฉพาะรายการที่ตัวเองบันทึก', () => {
  const i = WL.indexOf('window.wlSelfRemove');
  const seg = WL.slice(i, i + 900);
  assert.ok(seg.includes('if (!list[i] || !list[i].self) continue;'), 'อาจลบรายการของวิทยาลัยได้');
  assert.ok(WL.includes("x.self ? '<button onclick=\"wlSelfRemove"), 'ปุ่มลบขึ้นกับรายการที่ลบไม่ได้');
});
t('เขียนลงแถวของตัวเองเท่านั้น', () => {
  const i = WL.indexOf('async function selfSave');
  const seg = WL.slice(i, i + 900);
  assert.ok(seg.includes("student_id: sid"), 'ไม่ได้ผูกกับรหัสนักศึกษาของตัวเอง');
  assert.ok(seg.includes("type: 'workload_student'"), 'เขียนผิดตาราง');
  assert.ok(!seg.includes("type: 'workload_plan'"), 'ห้ามเขียนทับแผนของทั้งชั้นปี');
});
t('นักศึกษาเห็นเมนูเดียว ไม่เห็นเมนูของเจ้าหน้าที่', () => {
  assert.ok(WL.includes("norm(APP.currentRole) === 'student'"), 'ไม่ได้แยกเมนูตามบทบาท');
  assert.ok(WL.includes('ภาระงานของฉัน'), 'ไม่มีเมนูของนักศึกษา');
});
t('นักศึกษาโหลดตารางภาระงานได้แล้ว', () => {
  const i = DB.indexOf('const STUDENT_SKIP');
  const seg = DB.slice(i, i + 400);
  assert.ok(!seg.includes('workload_plan'), 'ยังข้ามตารางแผนอยู่ นักศึกษาจะไม่เห็นข้อมูล');
  assert.ok(!seg.includes('workload_student'), 'ยังข้ามตารางของตัวเองอยู่');
});

console.log('\n────────────────────────────');
console.log('ผ่าน ' + pass + ' ข้อ · ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
