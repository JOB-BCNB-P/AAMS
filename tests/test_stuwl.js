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

console.log('\n[2] เลขบัตรประชาชน — เห็นได้เฉพาะผู้ดูแลระบบและงานทะเบียน');
const POLSQL = fs.readFileSync(P + 'supabase/security/02_policies.sql', 'utf8');
const maskSrc = APP.slice(APP.indexOf('const NID_ROLES'), APP.indexOf('const NID_ROLES') + 800);
t('หน้าจอเปิดให้เฉพาะสองบทบาท', () => {
  assert.ok(APP.includes("const NID_ROLES = ['admin', 'registrar'];"), 'รายชื่อบทบาทไม่ตรง');
  assert.ok(maskSrc.includes('canSeeNationalId()'), 'ไม่ได้ใช้ตัวตรวจสิทธิ์ร่วม');
  // ทดลองเรียกจริงทั้งสองมุม
  const mk = (role) => new Function('APP',
    maskSrc.slice(0, maskSrc.indexOf('\n}', maskSrc.indexOf('function maskNationalId')) + 2)
    + '\nreturn maskNationalId;')({ currentRole: role });
  assert.strictEqual(mk('admin')('1234567890123'), '1234567890123', 'ผู้ดูแลควรเห็นเต็มเลข');
  assert.strictEqual(mk('registrar')('1234567890123'), '1234567890123', 'งานทะเบียนควรเห็นเต็มเลข');
  assert.ok(mk('teacher')('1234567890123').includes('เฉพาะผู้ดูแลระบบและงานทะเบียน'), 'อาจารย์ไม่ควรเห็นเลข');
  assert.ok(mk('academic')('1234567890123').includes('เฉพาะ'), 'งานวิชาการไม่ควรเห็นเลข');
  assert.ok(mk('student')('1234567890123').includes('เฉพาะ'), 'นักศึกษาไม่ควรเห็นเลข');
  assert.strictEqual(mk('admin')(''), '-', 'ค่าว่างควรขึ้นขีดกลาง');
});
t('ด่านจริงอยู่ที่ฐานข้อมูล ไม่ใช่หน้าจอ', () => {
  assert.ok(POLSQL.includes('function ems.can_see_nid'), 'ไม่มีตัวตรวจสิทธิ์ในฐานข้อมูล');
  const i = POLSQL.indexOf('function ems.can_see_nid');
  assert.ok(/array\['admin','registrar'\]/.test(POLSQL.slice(i, i + 400)), 'บทบาทในฐานข้อมูลไม่ตรงกับหน้าจอ');
  // ยอมให้เว้นวรรคกี่ช่องก็ได้ จะได้ไม่พังเพราะจัดรูปแบบไฟล์ใหม่
  const m = POLSQL.match(/create policy\s+sp_read\s+on\s+public\.student_private[^;]*/);
  assert.ok(m, 'ไม่พบนโยบายอ่านตารางเลขบัตร');
  assert.ok(/ems\.can_see_nid\(\)/.test(m[0]), 'อ่านตารางตรง ๆ ยังไม่ถูกจำกัด');
  assert.ok(/to\s+authenticated/.test(m[0]), 'ควรจำกัดเฉพาะผู้ที่ล็อกอินแล้ว');
  assert.ok(POLSQL.includes('revoke all on public.student_private from anon'),
    'ผู้ไม่ได้ล็อกอินยังมีสิทธิ์ระดับตารางค้างอยู่');
});
t('ขอเลขเป็นรายคนทุกครั้ง ไม่โหลดมาทั้งก้อน', () => {
  assert.ok(APP.includes("rpc('ems_student_nid'"), 'ไม่ได้ขอผ่านฟังก์ชัน');
  assert.ok(!/SHEET_TABS[\s\S]{0,600}student_private/.test(DB), 'ยังโหลดตารางเลขบัตรเข้าเบราว์เซอร์');
});
t('มีประวัติว่าใครเปิดดูเลขของใคร', () => {
  assert.ok(POLSQL.includes('nid_access_log'), 'ไม่มีตารางบันทึกการเปิดดู');
  assert.ok(POLSQL.includes('ems.log_nid_view'), 'ไม่ได้บันทึกตอนเปิดดู');
  const i = POLSQL.indexOf('create policy nal_read');
  assert.ok(/array\['admin'\]/.test(POLSQL.slice(i, i + 200)), 'ประวัติควรอ่านได้เฉพาะผู้ดูแลระบบ');
  assert.ok(!/create policy \w+ on public\.nid_access_log for (insert|update|delete)/.test(POLSQL),
    'ต้องไม่มีนโยบายเขียน มิฉะนั้นผู้ใช้ลบประวัติตัวเองได้');
});
t('ข้อมูลยังถูกเก็บไว้ ไม่ได้ลบทิ้ง', () => {
  assert.ok(APP.includes("name=\"national_id\""), 'ช่องกรอกหายไป ข้อมูลจะบันทึกไม่ได้');
  assert.ok(APP.includes('national_id,name_en'), 'หัวตาราง CSV ไม่มีคอลัมน์นี้แล้ว');
});
t('ส่งเลขแถวจริงให้ฐานข้อมูล ไม่ใช่ข้อความ student_123', () => {
  // บั๊กที่เคยเกิด : ส่ง __backendId ซึ่งเป็นข้อความ ฟังก์ชันรับ bigint จึงปฏิเสธทุกครั้ง
  assert.ok(APP.includes('fillStudentNid(backendRowId(s))'), 'ยังส่ง __backendId ตรง ๆ อยู่');
  assert.ok(/__backendId: tableName \+ '_' \+ r\.id/.test(DB),
    'รูปแบบ __backendId เปลี่ยนไปแล้ว ต้องทบทวนตัวแปลงเลขแถว');
  const i = APP.indexOf('function backendRowId');
  assert.ok(i > 0, 'ไม่มีตัวแปลงเลขแถว');
  const fn = new Function(APP.slice(i, APP.indexOf('\n}', i) + 2) + '\nreturn backendRowId;')();
  assert.strictEqual(fn({ __backendId: 'student_123', __rowIndex: 123 }), 123, 'กรณีปกติ');
  assert.strictEqual(fn({ __backendId: 'student_123' }), 123, 'ไม่มี __rowIndex ต้องถอดจากท้ายข้อความ');
  assert.strictEqual(fn({ __backendId: 'app_user_45' }), 45, 'ชื่อตารางที่มีขีดล่างในตัวเอง');
  assert.strictEqual(fn({}), null, 'ไม่มีข้อมูลต้องได้ null ไม่ใช่ NaN');
  assert.strictEqual(fn(null), null, 'ส่ง null เข้าไปต้องไม่ระเบิด');
});
t('ไม่มีเลขอ้างอิงแล้วต้องไม่ยิงคำสั่งเปล่า', () => {
  const i = APP.indexOf('async function fillStudentNid');
  const seg = APP.slice(i, i + 700);
  assert.ok(seg.includes('rowId == null'), 'ยังยิงคำสั่งทั้งที่ไม่มีเลขอ้างอิง');
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
  // ฟอร์มเพิ่มและฟอร์มแก้ไขใช้ร่วมกันแล้ว จึงตรวจที่ตัวฟอร์ม ไม่ผูกกับรูปประโยคเดิม
  assert.ok(/var list = selfSeedRows\(mySid\(\), state\(\)\.year, sem, m\);/.test(WL),
    'ตอนบันทึกไม่ได้ตั้งต้นจากรายการเดิม');
});
t('รายการที่บันทึกเองมีป้ายกำกับ แยกจากของวิทยาลัยได้', () => {
  assert.ok(WL.includes('self: 1,'), 'ไม่ได้ติดธงว่าบันทึกเอง');
  assert.ok(WL.includes('ฉันบันทึกเอง') && WL.includes('วิทยาลัยกำหนด'), 'หน้าจอไม่ได้แยกที่มา');
});
t('ลบได้เฉพาะรายการที่ตัวเองบันทึก', () => {
  // ทั้งลบและแก้ไขชี้ตำแหน่งผ่าน selfIndexOf ซึ่งข้ามรายการที่ไม่ได้ติดป้าย self
  const i = WL.indexOf('function selfIndexOf');
  const seg = WL.slice(i, i + 400);
  assert.ok(seg.includes('if (!list[i] || !list[i].self) continue;'), 'อาจชี้ไปโดนรายการของวิทยาลัย');
  assert.ok(WL.slice(WL.indexOf('window.wlSelfRemove'), WL.indexOf('window.wlSelfRemove') + 700)
    .includes('selfIndexOf(list, rank)'), 'ตัวลบไม่ได้ใช้ตัวหาตำแหน่งที่กรองแล้ว');
  assert.ok(WL.includes('x.self\n                  ?'), 'ปุ่มจัดการต้องขึ้นเฉพาะรายการที่บันทึกเอง');
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


/* ---------------------------------------------------------------
   วาดหน้าของนักศึกษาจริง ๆ แล้วดูว่าชื่อรายการขึ้นถูกไหม
   เรื่องนี้ทดสอบด้วยการอ่านโค้ดอย่างเดียวไม่พอ เพราะข้อบกพร่องเดิมคือ
   อ่านช่อง name ซึ่ง "มีอยู่จริง" ในโค้ด แต่ไม่มีในข้อมูลที่วิทยาลัยกรอก
   --------------------------------------------------------------- */
console.log('\n[6] ชื่อรายการในหน้าของนักศึกษา');
const vm = require('vm');
function renderStudentPage() {
  const PLAN = {
    __backendId: 'PL1', academic_year: '2568', year_level: '1', semester: '1',
    teaching_json: JSON.stringify([
      { subject_code: '0101300102', subject_name: 'การพยาบาลพื้นฐาน', pieces: '6', hours: '48' }
    ]),
    research_json: JSON.stringify([
      { kind: 'กิจกรรมที่', activity: 'อบรมการสืบค้นฐานข้อมูลวิจัย', hours: '6' }
    ]),
    service_json: '[]', student_json: '[]', personal_json: '[]'
  };
  const OVR = {
    __backendId: 'OV1', student_id: '6611030101', academic_year: '2568', semester: '1',
    research_json: JSON.stringify([
      { kind: 'กิจกรรมที่', activity: 'อบรมการสืบค้นฐานข้อมูลวิจัย', hours: '6' },
      { name: 'เข้าร่วมประชุมวิชาการ', note: 'มีเกียรติบัตร', hours: '3', self: 1 }
    ])
  };
  const DATA = { workload_plan: [PLAN], workload_student: [OVR], workload_rate: [], subject: [], student: [] };
  const sb = {
    console,
    APP: {
      currentRole: 'student', currentPage: 'workload',
      currentUser: { name: 'กนกพร เดชกล้า', data: { student_id: '6611030101', year_level: '1', name: 'กนกพร เดชกล้า' } },
      filters: {}, pagination: { page: 1 }, permissions: { student: { workload: 1 } }
    },
    getDataByType: (t) => DATA[t] || [],
    norm: (v) => String(v == null ? '' : v).trim(),
    normSem: (v) => String(v == null ? '' : v).trim(),
    showModal: () => { }, closeModal: () => { }, showToast: () => { },
    renderCurrentPage: () => { }, navigateTo: () => { },
    GSheetDB: { create: async () => ({ isOk: true }), update: async () => ({ isOk: true }), refreshTab: async () => { } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute() { }, appendChild() { }, classList: { add() { } } }) },
    setTimeout, clearTimeout, Promise
  };
  sb.window = sb;
  sb.getPageContent = () => '';
  sb.buildSidebar = () => { };
  vm.createContext(sb);
  new vm.Script(WL).runInContext(sb);
  return sb.getPageContent('workload', 'student');
}
const page = renderStudentPage();

t('พันธกิจด้านวิชาการ หัวตารางต้องเป็น "รายวิชา"', () => {
  assert.ok(page.includes('>รายวิชา<'), 'ยังใช้หัวตารางกลาง ๆ อยู่');
});
t('พันธกิจอื่นหัวตารางเป็น "กิจกรรม"', () => {
  assert.ok(page.includes('>กิจกรรม<'), 'หัวตารางของพันธกิจอื่นไม่ถูก');
});
t('แสดงชื่อรายวิชาที่วิทยาลัยกำหนดไว้จริง', () => {
  assert.ok(page.includes('การพยาบาลพื้นฐาน'), 'ชื่อวิชาไม่ขึ้น');
  assert.ok(page.includes('0101300102'), 'รหัสวิชาไม่ขึ้น');
  assert.ok(page.includes('ชิ้นงาน 6'), 'จำนวนชิ้นงานไม่ขึ้น');
});
t('กิจกรรมของพันธกิจอื่นก็ต้องขึ้นชื่อ ไม่ใช่ขีดกลาง', () => {
  assert.ok(page.includes('อบรมการสืบค้นฐานข้อมูลวิจัย'), 'ชื่อกิจกรรมไม่ขึ้น');
});
t('รายการที่นักศึกษาเพิ่มเองยังแสดงเหมือนเดิม', () => {
  assert.ok(page.includes('เข้าร่วมประชุมวิชาการ'), 'ชื่อรายการของตัวเองหาย');
  assert.ok(page.includes('มีเกียรติบัตร'), 'หมายเหตุหาย');
});
t('ไม่มีช่องชื่อที่เป็นขีดกลางเปล่า ๆ เหลืออยู่', () => {
  assert.ok(!/<td class="px-3 py-2">-<\/td>/.test(page), 'ยังมีรายการที่แสดงเป็นขีดกลาง');
});


console.log('\n[7] แก้ไขรายการของตัวเอง');
t('มีปุ่มแก้ไขเฉพาะรายการที่บันทึกเอง', () => {
  const edits = (page.match(/wlSelfEdit\(/g) || []).length;
  const dels = (page.match(/wlSelfRemove\(/g) || []).length;
  assert.strictEqual(edits, 1, 'ควรมีปุ่มแก้ไขเท่าจำนวนรายการที่บันทึกเอง แต่พบ ' + edits);
  assert.strictEqual(edits, dels, 'ปุ่มแก้ไขกับปุ่มลบต้องขึ้นคู่กันเสมอ');
});
t('รายการที่วิทยาลัยกำหนดต้องไม่มีปุ่มแก้ไข', () => {
  // ในข้อมูลทดสอบมีรายการของวิทยาลัย 2 แถว (วิชาการ 1 · วิจัย 1) และของตัวเอง 1 แถว
  assert.ok(!/wlSelfEdit\('teaching'/.test(page), 'ด้านวิชาการไม่ควรแก้ได้เลย');
});
t('แก้ไขใช้ฟอร์มเดียวกับการเพิ่ม ไม่เขียนสองชุด', () => {
  assert.ok(WL.includes('function selfForm(mkey, opts)'), 'ไม่มีฟอร์มที่ใช้ร่วมกัน');
  assert.ok(WL.includes('window.wlSelfAdd = function (mkey) { selfForm(mkey, {}); };'), 'เพิ่มไม่ได้ใช้ฟอร์มร่วม');
  assert.ok(WL.includes('selfForm(mkey, { editing: true'), 'แก้ไขไม่ได้ใช้ฟอร์มร่วม');
});
t('แก้ไขแล้วคงป้าย "บันทึกเอง" ไว้ ไม่กลายเป็นของวิทยาลัย', () => {
  const i = WL.indexOf('if (editing) {', WL.indexOf('function selfForm'));
  const seg = WL.slice(i, i + 420);
  assert.ok(seg.includes('Object.assign({}, list[target]'), 'เขียนทับทั้งก้อน ข้อมูลเดิมจะหาย');
  assert.ok(seg.includes('self: 1'), 'ป้ายบันทึกเองหลุด');
});
t('ย้ายภาคการศึกษาตอนแก้ไขไม่ได้ เพราะ rank ผูกกับภาค', () => {
  const i = WL.indexOf('function selfForm');
  const seg = WL.slice(i, i + 2200);
  assert.ok(seg.includes("editing ? ' disabled' : ''"), 'ยังเปลี่ยนภาคได้ จะชี้รายการผิดตัว');
});
t('ลบกับแก้ไขใช้ตัวหาตำแหน่งตัวเดียวกัน', () => {
  assert.ok(WL.includes('function selfIndexOf(list, rank)'), 'ไม่มีตัวหาตำแหน่งร่วม');
  const del = WL.slice(WL.indexOf('window.wlSelfRemove'), WL.indexOf('window.wlSelfRemove') + 700);
  assert.ok(del.includes('selfIndexOf(list, rank)'), 'ตัวลบยังนับเอง เสี่ยงนับคนละแบบกับตัวแก้');
});
t('จำกัดชั่วโมงต่อรายการไม่ให้เกินจริง', () => {
  const i = WL.indexOf('function selfForm');
  const seg = WL.slice(i, i + 3000);
  assert.ok(seg.includes('hours > 744'), 'ไม่ได้จำกัดเพดานชั่วโมง');
});

console.log('\n[8] ตัวตรวจฝั่งฐานข้อมูล (ไฟล์นโยบาย)');
const POL = fs.readFileSync(P + 'supabase/security/02_policies.sql', 'utf8');
t('มีตัวตรวจภาระงานของนักศึกษาในไฟล์', () => {
  assert.ok(POL.includes('ems.workload_student_guard'), 'ไฟล์ยังไม่มีตัวตรวจ');
  assert.ok(POL.includes('create trigger workload_student_guard'), 'ไม่ได้ผูกตัวตรวจกับตาราง');
});
t('ตัวตรวจล้างด้านวิชาการและยึดชั้นปีจากทะเบียน', () => {
  const i = POL.indexOf('function ems.workload_student_guard');
  const seg = POL.slice(i, POL.indexOf('drop trigger if exists workload_student_guard', i));
  assert.ok(seg.includes('new.teaching_json := null'), 'ไม่ได้ล้างด้านวิชาการ');
  assert.ok(seg.includes('new.year_level := lvl'), 'ไม่ได้ยึดชั้นปีจากทะเบียน');
  assert.ok(seg.includes('บันทึกภาระงานของนักศึกษารายอื่นไม่ได้'), 'ไม่ได้กันการเขียนข้ามคน');
  assert.ok(seg.includes('แก้ไขหรือลบรายการที่วิทยาลัยกำหนด'), 'ไม่ได้เทียบกับแผนของวิทยาลัย');
});

console.log('\n────────────────────────────');
console.log('ผ่าน ' + pass + ' ข้อ · ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
