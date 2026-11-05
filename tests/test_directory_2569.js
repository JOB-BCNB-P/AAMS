/* ชุดงานวันที่ 5 พ.ย. 2569
   ทำเนียบอาจารย์ (ดึงจากปีก่อน · ปกปิดเลขบัตร · ช่องใหม่ปี 2569)
   สถานะเกษียณอายุราชการ · ข้อมูลส่วนตัวของนักศึกษา · คัดลอกรายวิชา */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const PROF = fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8');
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

console.log('\n[1] เลขบัตรประชาชน — ปกปิด 3 หลักท้าย');
const maskTail = new Function(grab(APP, 'function maskNidTail(nid)') + ' return maskNidTail;')();
t('เลขครบ 13 หลัก แสดงเป็นรูปแบบบัตรและปิดท้าย xx-x', () => {
  assert.strictEqual(maskTail('1234567890123'), '1-2345-67890-xx-x');
  assert.strictEqual(maskTail('1-2345-67890-12-3'), '1-2345-67890-xx-x', 'ขีดคั่นเดิมต้องไม่ทำให้เพี้ยน');
});
t('ไม่มีเลข แสดงขีด', () => assert.strictEqual(maskTail(''), '-'));
t('เลขไม่ครบ ไม่เดาเติมให้ แต่ยังปิดท้าย', () => {
  assert.strictEqual(maskTail('12345'), '12-xx-x');
  assert.strictEqual(maskTail('12'), 'xx-x');
});
t('หน้าดูข้อมูลใช้ตัวปกปิด ไม่ใช่เลขเต็ม', () => {
  assert.ok(APP.includes("infoRow('เลขบัตรประชาชน', maskNidTail(t.national_id))"), 'ยังแสดงเลขเต็ม');
});

console.log('\n[2] สถานะเกษียณอายุราชการ');
t('มีให้เลือกในฟอร์มข้อมูลอาจารย์', () => {
  assert.ok(/TEACHER_STATUSES = \[[^\]]*'เกษียณอายุราชการ'/.test(APP), 'ไม่มีสถานะนี้');
});
t('ถือว่าไม่อยู่กับวิทยาลัยแล้ว จึงไม่ถูกนับและไม่ถูกเสนอเป็นที่ปรึกษา', () => {
  assert.ok(/TEACHER_STATUS_GONE = \[[^\]]*'เกษียณอายุราชการ'/.test(APP), 'ยังถูกนับรวมอยู่');
});
t('จำนวนอาจารย์นับเฉพาะคนที่ปฏิบัติงานอยู่', () => {
  assert.ok(APP.includes("const activeTeachers = teachers.filter(t => (t.teacher_status || 'ปฏิบัติงานอยู่') === 'ปฏิบัติงานอยู่')"),
    'การนับเปลี่ยนไป ผู้เกษียณอาจถูกนับด้วย');
});
t('บันทึกสถานะแล้วปิดบัญชีเข้าระบบให้', () => {
  const g = grab(APP, 'async function syncTeacherAccountStatus(rec)');
  assert.ok(g.includes('TEACHER_STATUS_GONE.indexOf(st)'), 'ไม่ได้ดูจากรายการสถานะที่พ้นสภาพ');
  assert.ok(g.includes("u.is_active = '0'"), 'ไม่ได้ปิดบัญชี');
  assert.ok(g.includes('u.is_active = before'), 'บันทึกพลาดแล้วหน้าจอกับฐานข้อมูลไม่ตรงกัน');
  assert.ok(APP.includes('await syncTeacherAccountStatus(after)'), 'ฟอร์มแก้ไขไม่ได้เรียกใช้');
  assert.ok(APP.includes('await syncTeacherAccountStatus(obj)'), 'ฟอร์มเพิ่มไม่ได้เรียกใช้');
});
t('จับคู่บัญชีด้วยอีเมลก่อน แล้วค่อยชื่อ และไม่แตะบัญชีที่ปิดอยู่แล้ว', () => {
  const g = grab(APP, 'async function syncTeacherAccountStatus(rec)');
  assert.ok(g.includes("key(u.email) === em"), 'ไม่ได้จับคู่ด้วยอีเมล');
  assert.ok(g.includes("'ปิด'"), 'ไม่ได้ข้ามบัญชีที่ปิดไปแล้ว');
});

console.log('\n[3] ทำเนียบอาจารย์ — ดึงจากปีก่อนหน้า');
t('มีปุ่มเฉพาะเมื่อเลือกปีปลายทางแล้ว', () => {
  assert.ok(APP.includes('showDirectoryCopyYearModal()'), 'ไม่มีปุ่ม');
  assert.ok(/selectedYear \? `<button onclick="showDirectoryCopyYearModal\(\)/.test(APP),
    'ปุ่มโผล่ทั้งที่ยังไม่ได้เลือกปี จะไม่รู้ว่าจะดึงไปไหน');
});
t('เลือกได้ว่าจะดึงประเภทไหนบ้าง ครบทั้ง 5 ประเภท', () => {
  const g = grab(APP, 'window.showDirectoryCopyYearModal = function ()');
  assert.ok(g.includes('TEACHER_CATEGORIES.map'), 'ไม่ได้ให้เลือกประเภท');
  assert.ok(g.includes('dirCopyCat'), 'ไม่มีช่องติ๊กประเภท');
});
function plan(all, target, from, cats) {
  const norm = v => String(v == null ? '' : v).trim();
  const key = v => norm(v).toLowerCase();
  const already = {};
  all.forEach(d => { if (norm(d.academic_year) === target) already[key(d.name) + '|' + norm(d.teacher_category)] = 1; });
  const src = all.filter(d => norm(d.academic_year) === from && norm(d.name));
  const pick = src.filter(d => cats.indexOf(norm(d.teacher_category)) !== -1);
  const todo = pick.filter(d => !already[key(d.name) + '|' + norm(d.teacher_category)]);
  return { todo: todo.map(x => x.name), skipped: pick.length - todo.length };
}
const ALL = [
  { name: 'ก', academic_year: '2568', teacher_category: 'อาจารย์ประจำ' },
  { name: 'ข', academic_year: '2568', teacher_category: 'อาจารย์ประจำหลักสูตร' },
  { name: 'ค', academic_year: '2568', teacher_category: 'อาจารย์พิเศษ' },
  { name: 'ก', academic_year: '2569', teacher_category: 'อาจารย์ประจำ' }
];
t('ดึงเฉพาะประเภทที่ติ๊ก', () => {
  assert.deepStrictEqual(plan(ALL, '2569', '2568', ['อาจารย์ประจำหลักสูตร']).todo, ['ข']);
});
t('คนที่มีอยู่ในปีปลายทางแล้ว ต้องถูกข้าม ไม่สร้างซ้ำ', () => {
  const r = plan(ALL, '2569', '2568', ['อาจารย์ประจำ']);
  assert.deepStrictEqual(r.todo, [], 'สร้างซ้ำ');
  assert.strictEqual(r.skipped, 1);
});
t('คนละประเภทกัน ถือเป็นคนละระเบียน ไม่นับว่าซ้ำ', () => {
  const r = plan(ALL, '2569', '2568', ['อาจารย์ประจำหลักสูตร', 'อาจารย์พิเศษ']);
  assert.deepStrictEqual(r.todo.sort(), ['ข', 'ค']);
});
t('คัดลอกเป็นระเบียนใหม่ ไม่ไปทับของปีเดิม', () => {
  const g = grab(APP, 'window.directoryCopyRun = async function ()');
  assert.ok(g.includes("'__backendId'") && g.includes("'__rowIndex'"), 'ไม่ได้ตัดรหัสระเบียนเดิมออก จะกลายเป็นแก้ของเดิม');
  assert.ok(g.includes('o.academic_year = pl.target'), 'ไม่ได้เปลี่ยนปีการศึกษาเป็นปีปลายทาง');
  assert.ok(g.includes('confirm('), 'ไม่ได้ถามยืนยันก่อนสร้างข้อมูลจำนวนมาก');
  assert.ok(g.includes('GSheetDB.createMany'), 'ไม่ได้สร้างทีเดียว จะยิงทีละคน');
});

console.log('\n[4] ทำเนียบอาจารย์ — ช่องใหม่ปี 2569');
const tcParse = new Function(grab(APP, 'function tcParse(values)') + ' return tcParse;')();
t('แปลงรายวิชาที่สอนเป็น 3 ส่วนได้ถูกต้อง', () => {
  const r = tcParse('การพยาบาลผู้ใหญ่ ~ ระบบหัวใจ ~ ภาคทฤษฎี || การรู้ดิจิทัล ~ AI ~ ภาคทดลอง');
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], { subject: 'การพยาบาลผู้ใหญ่', topic: 'ระบบหัวใจ', form: 'ภาคทฤษฎี' });
  assert.strictEqual(r[1].form, 'ภาคทดลอง');
});
t('ค่าว่างต้องไม่กลายเป็นแถวเปล่า', () => {
  assert.deepStrictEqual(tcParse(''), []);
  assert.deepStrictEqual(tcParse(' ~  ~ '), []);
});
t('มีเฉพาะภาคทฤษฎีกับภาคทดลอง ไม่มีภาคปฏิบัติให้เลือก', () => {
  assert.ok(/TEACH_FORMS = \['ภาคทฤษฎี', 'ภาคทดลอง'\]/.test(APP), 'ตัวเลือกรูปแบบการสอนไม่ตรงที่ตกลง');
  const g = grab(APP, 'function teachingCoursesField(values)');
  assert.ok(g.includes('ภาคปฏิบัติไม่ต้องกรอก'), 'ไม่ได้บอกว่าวิชาภาคปฏิบัติไม่ต้องกรอก');
});
t('ช่องใหม่อยู่ทั้งฟอร์มเพิ่มและฟอร์มแก้ไข และถูกเก็บค่า', () => {
  assert.strictEqual((APP.match(/dirNewFieldsHTML\(/g) || []).length, 3, 'ต้องมีนิยาม 1 และถูกเรียก 2 ฟอร์ม');
  // นับเฉพาะที่ "ถูกเรียกใช้" ไม่นับบรรทัดนิยามฟังก์ชัน
  assert.strictEqual((APP.match(/= collectTeachingCourses\(form\)/g) || []).length, 2, 'เก็บค่าไม่ครบทั้งสองฟอร์ม');
  assert.strictEqual((APP.match(/\.faculty_practice = norm\(/g) || []).length, 2, 'Faculty practice ไม่ถูกเก็บ');
  assert.strictEqual((APP.match(/\.sort_no = norm\(/g) || []).length, 2, 'ลำดับไม่ถูกเก็บ');
});
t('ลำดับที่กำหนดเองมาก่อน ที่ไม่ได้ใส่เรียงตามชื่อต่อท้าย', () => {
  const rows = [{ sort_no: '', name: 'ข' }, { sort_no: '2', name: 'ค' }, { sort_no: '', name: 'ก' }, { sort_no: '1', name: 'ง' }];
  const norm = v => String(v == null ? '' : v).trim();
  const out = rows.slice().sort((a, b) => {
    const na = parseInt(norm(a.sort_no), 10), nb = parseInt(norm(b.sort_no), 10);
    const ha = isFinite(na), hb = isFinite(nb);
    if (ha && hb && na !== nb) return na - nb;
    if (ha !== hb) return ha ? -1 : 1;
    return norm(a.name).localeCompare(norm(b.name), 'th');
  }).map(x => x.name);
  assert.deepStrictEqual(out, ['ง', 'ค', 'ก', 'ข']);
  assert.ok(APP.includes('parseInt(norm(a.sort_no), 10)'), 'หน้าจริงไม่ได้เรียงแบบนี้');
});
t('ตารางรายชื่อมีคอลัมน์ลำดับ และ colspan ตามจำนวนคอลัมน์จริง', () => {
  assert.ok(APP.includes('font-semibold w-14">ลำดับ'), 'ไม่มีคอลัมน์ลำดับ');
  assert.ok(APP.includes("const colspan = isSpecialTab ? 5 : 5;"), 'colspan ไม่ตรง แถว "ไม่มีข้อมูล" จะเพี้ยน');
});
t('หน้าดูข้อมูลแสดงช่องใหม่เฉพาะเมื่อมีข้อมูล', () => {
  const g = grab(APP, 'function teachingCoursesDetailHTML(values)');
  assert.ok(g.includes("if (!items.length) return '';"), 'ไม่มีข้อมูลแล้วยังขึ้นตารางเปล่า');
  assert.ok(APP.includes("norm(t.faculty_practice) ?"), 'Faculty practice ขึ้นทั้งที่ว่าง');
});

console.log('\n[5] นักศึกษา — ตั้งค่าข้อมูลส่วนตัว');
t('นักศึกษาแก้ชื่อและเบอร์โทรไม่ได้', () => {
  assert.ok(PROF.includes("var RO = (showingSelf() && !isStudent) ? '' : ' disabled';"), 'ยังแก้ได้อยู่');
});
t('ไม่มีปุ่มบันทึกให้นักศึกษา และกันไว้ที่ตัวบันทึกอีกชั้น', () => {
  assert.ok(/isStudent \? ''\s*\n\s*: '<button type="submit"/.test(PROF), 'ยังมีปุ่มบันทึก');
  const g = grab(PROF, 'window.profileSubmit = function (ev)');
  assert.ok(g.includes("=== 'student'"), 'แก้หน้าเว็บให้ปุ่มโผล่แล้วบันทึกได้');
});
t('ไม่มีการ์ดลายเซ็นสำหรับนักศึกษา', () => {
  assert.ok(/isStudent \? '' :\s*\n\s*'<div class="bg-white rounded-2xl p-5 border border-blue-100>?'?[\s\S]{0,120}ลายเซ็น/.test(PROF)
    || PROF.includes("(isStudent ? '' :"), 'การ์ดลายเซ็นยังขึ้นให้นักศึกษา');
});
t('ยังเปลี่ยนรูปโปรไฟล์ได้', () => {
  assert.ok(PROF.includes("fileBox('profile'"), 'กล่องอัปโหลดรูปหายไป');
  const i = PROF.indexOf("fileBox('profile'");
  assert.ok(!PROF.slice(i - 400, i).includes("isStudent ? ''"), 'กล่องรูปถูกซ่อนจากนักศึกษาด้วย');
});

console.log('\n[5.1] อาจารย์พิเศษ (ทะเบียน) — กรอกรายวิชาที่สอนได้');
const spReg = new Function('norm', grab(APP, 'function spRegSubjects(t)') + ' return spRegSubjects;')(
  v => String(v == null ? '' : v).trim());
t('ฟอร์มเพิ่ม/แก้ไข มีช่องรายวิชาที่สอน', () => {
  const g = grab(APP, 'function specialTeacherRegFormBody(t)');
  assert.ok(g.includes("multiSubjectField('subjects'"), 'ยังไม่มีช่องรายวิชา');
  assert.ok(!g.includes('ย้ายไปอยู่ที่ระบบทำเนียบอาจารย์'), 'ยังมีข้อความเดิมที่บอกให้ไปกรอกที่อื่น');
});
t('แปลงค่าเดิมที่เก็บด้วยจุลภาค มาใส่ช่องกรอกได้', () => {
  assert.strictEqual(spReg({ subjects: 'ก, ข , ค' }), 'ก||ข||ค');
  assert.strictEqual(spReg({}), '', 'ไม่มีข้อมูลต้องได้ค่าว่าง ไม่ใช่ช่องเปล่าที่มีขีด');
  assert.strictEqual(spReg({ subjects: 'ก,,ข' }), 'ก||ข', 'ค่าว่างระหว่างกลางต้องถูกตัด');
});
t('บันทึกกลับเป็นจุลภาคตามรูปแบบเดิมของตาราง', () => {
  const g = grab(APP, 'function collectSpecialTeacherReg(form, obj)');
  assert.ok(g.includes("collectMultiInputs(form, 'subjects')"), 'ไม่ได้เก็บค่าช่องรายวิชา');
  assert.ok(g.includes("join(', ')"), 'เก็บผิดรูปแบบ ตารางจะแสดงรวมกันเป็นบรรทัดเดียว');
});
t('ตารางยังรวมรายวิชาจากทำเนียบอาจารย์มาแสดงด้วย ไม่ต้องกรอกซ้ำ', () => {
  const g = grab(APP, 'function specialTaughtOf(t)');
  assert.ok(g.includes('subjects_taught'), 'ไม่ได้ดึงจากทำเนียบ');
  assert.ok(g.includes("String(t.subjects || '').split(',')"), 'ไม่ได้อ่านรายวิชาที่กรอกในทะเบียน');
  assert.ok(g.includes('seen.has(k)'), 'กรอกทั้งสองที่แล้วจะขึ้นซ้ำ');
});

console.log('\n[6] เพิ่มรายวิชา — เลือกหลักสูตรก่อน แล้วเลือกรายวิชาจากหลักสูตร');
const curEnv2 = {
  norm: v => String(v == null ? '' : v).trim(),
  htmlEsc: v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  getDataByType: tb => tb === 'curriculum_course' ? [
    { curriculum_year: '2565', course_code: 'GE 104', name_th: 'ภาษาอังกฤษ', name_en: 'English', credits: '3', h_theory: '2', h_lab: '2', h_self: '5' },
    { curriculum_year: '2565', course_code: '0101300035', name_th: 'การพัฒนาบุคลิกภาพ', name_en: 'Personality', credits: '2' },
    { curriculum_year: '2560', course_code: 'OLD 101', name_th: 'วิชาหลักสูตรเก่า', name_en: 'Old' }
  ] : []
};
const CUR2 = new Function(...Object.keys(curEnv2),
  grab(APP, 'function curCoursesOf(curYear)') + grab(APP, 'function curCourseLabel(c)')
  + grab(APP, 'function curCourseOptionsHTML(curYear)')
  + '; return { curCoursesOf, curCourseLabel, curCourseOptionsHTML };')(...Object.values(curEnv2));

t('ยังไม่เลือกหลักสูตร ต้องยังเลือกรายวิชาไม่ได้', () => {
  const h = CUR2.curCourseOptionsHTML('');
  assert.ok(h.includes('เลือกหลักสูตรก่อน'), 'ปล่อยให้เลือกรายวิชาข้ามหลักสูตรได้');
  assert.ok(!h.includes('GE 104'), 'รายวิชาโผล่ทั้งที่ยังไม่เลือกหลักสูตร');
});
t('เลือกหลักสูตรแล้ว ขึ้นเฉพาะรายวิชาของหลักสูตรนั้น', () => {
  const h = CUR2.curCourseOptionsHTML('2565');
  assert.ok(h.includes('GE 104 ภาษาอังกฤษ'), 'ไม่มีรายวิชาของหลักสูตรที่เลือก');
  assert.ok(!h.includes('OLD 101'), 'รายวิชาของหลักสูตรอื่นปนมาด้วย');
  assert.ok(h.includes('(2 วิชา)'), 'ไม่ได้บอกจำนวนรายวิชา');
});
t('แสดงแค่รหัสวิชาและชื่อวิชา ไม่มีปี ภาค ชั้นปี', () => {
  const lb = CUR2.curCourseLabel({ course_code: 'GE 104', name_th: 'ภาษาอังกฤษ' });
  assert.strictEqual(lb, 'GE 104 ภาษาอังกฤษ');
  const h = CUR2.curCourseOptionsHTML('2565');
  assert.ok(!/ปีการศึกษา|ภาค |ชั้นปี/.test(h), 'ยังมีปี ภาค หรือชั้นปีในรายการ');
});
t('หลักสูตรที่ยังไม่มีรายวิชา ต้องบอกให้รู้', () => {
  assert.ok(CUR2.curCourseOptionsHTML('2599').includes('ยังไม่มีรายวิชา'), 'ขึ้นรายการเปล่าเฉย ๆ');
});
t('เรียงตามรหัสวิชา', () => {
  const codes = CUR2.curCoursesOf('2565').map(c => c.course_code);
  assert.deepStrictEqual(codes, ['0101300035', 'GE 104']);
});
t('เปลี่ยนหลักสูตรแล้วรายการรายวิชาต้องโหลดใหม่', () => {
  assert.ok(APP.includes('onchange="if(window.curCourseReload)curCourseReload(this)"'),
    'เปลี่ยนหลักสูตรแล้วยังค้างรายวิชาของหลักสูตรเดิม');
  const g = grab(APP, 'window.curCourseReload = function (sel)');
  assert.ok(g.includes("pick.value = ''"), 'ไม่ได้ล้างค่าที่เลือกไว้ จะค้างรายวิชาของหลักสูตรเดิม');
});
t('เลือกรายวิชาแล้วเติมข้อมูลจากหลักสูตร และไม่ทับที่พิมพ์เอง', () => {
  const g = grab(APP, 'window.curCoursePick = function (sel)');
  ['subject_code', 'subject_name', 'subject_name_en', 'credits', 'hours_theory', 'hours_lab', 'hours_self']
    .forEach(k => assert.ok(g.includes("set('" + k + "'"), 'ไม่ได้เติม ' + k));
  assert.ok(g.includes('!norm(f.value)'), 'ทับค่าที่ผู้ใช้พิมพ์เอง');
});
t('ไม่เติมปีการศึกษา ภาคการศึกษา และชั้นปีให้', () => {
  const g = grab(APP, 'window.curCoursePick = function (sel)');
  ['academic_year', 'semester', 'year_level'].forEach(k =>
    assert.ok(!g.includes("set('" + k + "'"), 'ไม่ควรเติม ' + k + ' เพราะหลักสูตรไม่ได้ผูกกับปีการศึกษา'));
  assert.ok(g.includes('อย่าลืมเลือกปีการศึกษา'), 'ไม่ได้เตือนให้เลือกเอง');
});
t('ตัวเลือกเดิมที่ดึงจากรายวิชาที่เคยเปิดสอน ถูกถอดออกหมดแล้ว', () => {
  ['subjectCopyFrom', 'subjectCopyDatalistHTML', 'subjectCopyLabel', 'subjectCopyFind', 'curriculumNameDatalistHTML']
    .forEach(fn => assert.ok(!APP.includes(fn), 'ยังเหลือโค้ดเดิม ' + fn + ' ที่ไม่มีใครเรียกใช้'));
});
t('ขั้นตอนในฟอร์มตรงกับโครงใหม่', () => {
  const ST = fs.readFileSync(path.join(ROOT, 'steps.js'), 'utf8');
  assert.ok(ST.includes("['เลือกหลักสูตรและรายวิชา', '[name=\"curriculum_year\"]'"), 'ขั้นที่ 1 ยังเป็นของเดิม');
  assert.ok(ST.includes("STEPS.editSubjectForm = [['หลักสูตรและชื่อรายวิชา'"),
    'ฟอร์มแก้ไขจะมีช่องหลักสูตรหลุดออกนอกขั้นตอน');
});

console.log('\n[7] เพิ่มรายวิชา — ดึงชื่อภาษาอังกฤษจากหลักสูตร');
const CUR = fs.readFileSync(path.join(ROOT, 'curriculum.js'), 'utf8');
const curSrc = ['function curNormCode(v)', 'function curNormName(v)',
  'window.curFindCourse = function (code, nameTh)', 'window.curFillFromCurriculum = function (input)']
  .map(x => grab(CUR, x)).join('\n').replace('window.curFindCourse =', 'var curFindCourse = window.curFindCourse =');
const COURSES = [
  { course_code: '0101300035', name_th: 'การพัฒนาบุคลิกภาพ', name_en: 'Personality Development', credits: '2', h_theory: '2', h_lab: '0', h_self: '4' },
  { course_code: 'GE 104', name_th: 'ภาษาอังกฤษเพื่อการสื่อสาร', name_en: 'English for Communication', credits: '3', h_theory: '2', h_lab: '2', h_self: '5' }
];
const curEnv = { s: v => String(v == null ? '' : v).trim(), get: () => COURSES, window: {} };
const CUR_FN = new Function(...Object.keys(curEnv), curSrc + '; return window.curFillFromCurriculum;')(...Object.values(curEnv));
function fill(vals, trigger) {
  const o = {}; Object.keys(vals).forEach(k => o[k] = { value: vals[k] });
  const form = { querySelector: n => { const m = /name="(.+?)"/.exec(n); return o[m[1]] || null; } };
  CUR_FN({ value: vals[trigger], form });
  return Object.keys(o).reduce((a, k) => (a[k] = o[k].value, a), {});
}
const BLANK = { subject_code: '', subject_name: '', subject_name_en: '', credits: '', hours_theory: '', hours_lab: '', hours_self: '' };

t('กรอกรหัสวิชา ได้ชื่อไทย ชื่ออังกฤษ และหน่วยกิต', () => {
  const r = fill(Object.assign({}, BLANK, { subject_code: '0101300035' }), 'subject_code');
  assert.strictEqual(r.subject_name_en, 'Personality Development');
  assert.strictEqual(r.subject_name, 'การพัฒนาบุคลิกภาพ');
  assert.strictEqual(r.credits, '2');
});
t('กรอกชื่อวิชาไทยอย่างเดียว ก็ได้ชื่ออังกฤษและรหัสวิชา', () => {
  // จุดที่พลาดบ่อย : ผู้ใช้หลายคนกรอกชื่อวิชาก่อนรหัส ของเดิมจึงไม่เติมให้
  const r = fill(Object.assign({}, BLANK, { subject_name: 'ภาษาอังกฤษเพื่อการสื่อสาร' }), 'subject_name');
  assert.strictEqual(r.subject_name_en, 'English for Communication');
  assert.strictEqual(r.subject_code, 'GE 104');
});
t('รหัสวิชาเว้นวรรคหรือตัวพิมพ์ต่างกัน ยังหาเจอ', () => {
  assert.strictEqual(fill(Object.assign({}, BLANK, { subject_code: 'ge104' }), 'subject_code').subject_name_en,
    'English for Communication');
});
t('รหัสผิดแต่ชื่อวิชาถูก ยังเติมให้', () => {
  const r = fill(Object.assign({}, BLANK, { subject_code: 'ZZ', subject_name: 'ภาษาอังกฤษเพื่อการสื่อสาร' }), 'subject_name');
  assert.strictEqual(r.subject_name_en, 'English for Communication');
});
t('ไม่ทับค่าที่ผู้ใช้พิมพ์เอง', () => {
  const r = fill(Object.assign({}, BLANK, { subject_code: 'GE 104', subject_name_en: 'ชื่อที่พิมพ์เอง' }), 'subject_code');
  assert.strictEqual(r.subject_name_en, 'ชื่อที่พิมพ์เอง');
});
t('ไม่มีในหลักสูตร ต้องไม่เดาใส่ให้', () => {
  assert.strictEqual(fill(Object.assign({}, BLANK, { subject_code: 'ZZZ999' }), 'subject_code').subject_name_en, '');
});
t('ช่องชื่อวิชาในฟอร์มเพิ่ม เรียกตัวเติมอัตโนมัติและมีรายการให้เลือก', () => {
  const i = APP.indexOf('name="subject_name" required');
  assert.ok(i > -1, 'ไม่พบช่องชื่อรายวิชา');
  const seg = APP.slice(i, i + 260);
  assert.ok(seg.includes('curFillFromCurriculum'), 'กรอกชื่อวิชาแล้วไม่เติมให้');
  // ไม่มี datalist ที่ช่องชื่อแล้ว เพราะเลือกรายวิชาจากหลักสูตรในขั้นที่ 1 แทน
  assert.ok(APP.includes('curCoursePickerHTML()'), 'ไม่มีตัวเลือกรายวิชาจากหลักสูตร');
});
t('เลือกรายวิชาจากหลักสูตร ได้ชื่ออังกฤษมาด้วย', () => {
  const g = grab(APP, 'window.curCoursePick = function (sel)');
  assert.ok(g.includes("set('subject_name_en', hit.name_en)"), 'เลือกแล้วชื่ออังกฤษยังว่าง');
});
t('ผู้ประสานงานและสาขาดึงจากครั้งล่าสุดที่เคยเปิดสอน', () => {
  const g = grab(APP, 'window.curCoursePick = function (sel)');
  assert.ok(g.includes("getDataByType('subject')"), 'ไม่ได้ดึงจากรายวิชาที่เคยเปิดสอน');
  assert.ok(g.includes('addSubjectCoord'), 'ไม่ได้เติมผู้ประสานงาน');
  assert.ok(/sort\(\(a, b\) => norm\(b\.academic_year\)/.test(g), 'ไม่ได้เลือกครั้งล่าสุด');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
