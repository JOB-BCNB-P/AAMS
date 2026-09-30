/* ระบบให้คำปรึกษานักศึกษา — ใครเห็นอะไร คำนวณเวลาถูกไหม กันชื่อซ้ำได้ไหม */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const CS = fs.readFileSync(P + 'counsel.js', 'utf8');
const APPJS = fs.readFileSync(P + 'app.js', 'utf8');
const DB = fs.readFileSync(P + 'supabase-db.js', 'utf8');
let pass = 0, fail = 0;
async function ta(n, f) { try { await f(); pass++; console.log('  \u2713 ' + n); } catch (e) { fail++; console.log('  \u2717 ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

// ---------------- ข้อมูลปลอม ----------------
function baseData() {
  const stu = (id, name, yr, adv) => ({ student_id: id, name, year_level: yr, advisor: adv, status: 'กำลังศึกษา' });
  return {
    student: [
      stu('6611030101', 'กนกพร เดชกล้า', '4', 'อ.สมศรี ใจดี'),
      stu('6611030102', 'ปรีชา ขยัน', '4', 'อ.สมศรี ใจดี'),
      stu('6611030103', 'มาลี สุขใจ', '3', 'อ.สมศรี ใจดี'),
      stu('6611030104', 'วีระ กล้าหาญ', '2', 'อ.สมศรี ใจดี'),
      stu('6611030105', 'นภา งามตา', '1', 'อ.สมศรี ใจดี'),
      stu('6611030199', 'ของครูท่านอื่น', '4', 'อ.ประเสริฐ มั่นคง')
    ],
    grade: [
      { student_id: '6611030101', subject_code: 'X1', grade: 'B+', credits: '3', academic_year: '2568', semester: '1' },
      { student_id: '6611030101', subject_code: 'X2', grade: 'C', credits: '2', academic_year: '2568', semester: '1' }
    ],
    leave: [
      { student_id: '6611030101', name: 'กนกพร เดชกล้า', leave_type: 'ลาป่วย', subject_name: 'วิชา ก', leave_hours: '3', semester: '1', academic_year: '2568', leave_date: '2568-07-01' },
      { student_id: '6611030101', name: 'กนกพร เดชกล้า', leave_type: 'ลากิจ', subject_name: 'วิชา ข', leave_hours: '2', semester: '1', academic_year: '2568', leave_date: '2568-08-01' }
    ],
    student_health: [
      { student_id: '6611030101', record_date: '2567-01-10', semester: '2', academic_year: '2566', height_m: '1.65', weight_kg: '69', blood_sugar: '91', pulse: '0', bp_systolic: '0', bp_diastolic: '0' },
      { student_id: '6611030101', record_date: '2568-02-25', semester: '2', academic_year: '2567', height_m: '1.64', weight_kg: '89', blood_sugar: '105', pulse: '86', bp_systolic: '117', bp_diastolic: '66' }
    ],
    student_conduct: [],
    counsel_option: [
      { kind: 'issue', code: 'dev', label: 'ส่งเสริมการพัฒนาชีวิต', sort_order: '1' },
      { kind: 'issue', code: 'health', label: 'ปัญหาสุขภาพ', sort_order: '5' },
      { kind: 'issue', code: 'other', label: 'อื่น ๆ โปรดระบุ', sort_order: '99' },
      { kind: 'channel', code: 'onsite', label: 'พบโดยตรง', sort_order: '1' },
      { kind: 'channel', code: 'phone', label: 'โทรศัพท์', sort_order: '2' }
    ],
    counsel_session: [
      { session_code: 'CS1', topic: 'ติดตามผลการเรียน', counsel_date: '2568-07-10', start_time: '09:00', end_time: '10:30', duration_min: '90', semester: '1', academic_year: '2568', issue_types: 'dev', channel: 'onsite', result_note: 'พูดคุยแล้ว', refer_status: 'ไม่ส่งต่อ', advisor_name: 'อ.สมศรี ใจดี', __rowIndex: 1 },
      { session_code: 'CS2', topic: 'ปัญหาสุขภาพ', counsel_date: '2568-08-01', start_time: '13:00', end_time: '14:00', duration_min: '60', semester: '1', academic_year: '2568', issue_types: 'health', channel: 'phone', result_note: 'ส่งต่อแล้ว', refer_status: 'ส่งต่อ', refer_to: 'งานกิจการนักศึกษา', refer_reason: 'ต้องพบแพทย์', advisor_name: 'อ.สมศรี ใจดี', __rowIndex: 2 },
      { session_code: 'CS9', topic: 'ของครูท่านอื่น', counsel_date: '2568-07-20', start_time: '09:00', end_time: '10:00', duration_min: '60', semester: '1', academic_year: '2568', issue_types: 'dev', channel: 'onsite', result_note: 'x', refer_status: 'ไม่ส่งต่อ', advisor_name: 'อ.ประเสริฐ มั่นคง', __rowIndex: 3 }
    ],
    counsel_student: [
      { session_code: 'CS1', student_id: '6611030101', student_name: 'กนกพร เดชกล้า', year_level: '3', source: 'year', __rowIndex: 11 },
      { session_code: 'CS2', student_id: '6611030103', student_name: 'มาลี สุขใจ', year_level: '3', source: 'specific', __rowIndex: 12 },
      { session_code: 'CS9', student_id: '6611030199', student_name: 'ของครูท่านอื่น', year_level: '4', source: 'year', __rowIndex: 13 }
    ]
  };
}

const writes = [];
function makeEnv(opts) {
  opts = opts || {};
  const DATA = opts.data || baseData();
  const sb = {
    console,
    APP: {
      currentRole: opts.role || 'teacher',
      currentPage: opts.page || 'counselList',
      filters: {}, pagination: { page: 1 },
      config: { college_name: 'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ' },
      permissions: {
        teacher: { counsel: 1 }, classTeacher: { counsel: 1 },
        admin: { counsel: 1 }, otherStaff: { counsel: 1 }, student: {}
      },
      currentUser: { name: opts.me || 'อ.สมศรี ใจดี' }
    },
    getDataByType: (t) => DATA[t] || [],
    htmlEsc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    isActiveStudent: (s) => String(s && s.status) === 'กำลังศึกษา',
    toBuddhistDate: (v) => String(v || ''),
    toBuddhistDateList: (v) => String(v || ''),
    currentAcademicYearBE: () => 2568,
    navigateTo: (p) => { sb.APP.currentPage = p; writes.push(['nav', p]); },
    renderCurrentPage: () => { },
    showToast: (m, k) => writes.push(['toast', m, k]),
    showModal: (title, html) => { sb.__modalTitle = title; sb.__modal = html; writes.push(['modal', title]); },
    closeModal: () => { },
    _renderTranscript: (stu) => writes.push(['transcript', stu.student_id]),
    confirm: () => true,
    GSheetDB: {
      create: async (o) => { writes.push(['create', o]); return { isOk: true }; },
      update: async (o) => { writes.push(['update', o]); return { isOk: true }; },
      delete: async (o) => { writes.push(['delete', o]); return { isOk: true }; },
      refreshTab: async () => { }
    },
    document: {
      getElementById: (id) => (sb.__els || {})[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({ setAttribute() { }, classList: { add() { } }, appendChild() { } })
    },
    setTimeout, clearTimeout, Promise
  };
  sb.window = sb;
  sb.getPageContent = () => '';
  sb.buildSidebar = () => { };
  vm.createContext(sb);
  new vm.Script(CS).runInContext(sb);
  sb.__data = DATA;
  return sb;
}
const flush = () => new Promise(r => setTimeout(r, 0));

(async function () {
  console.log('[1] อาจารย์เห็นเฉพาะของตัวเอง');
  let w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี' });
  let html = w.counselPages.counselList();
  t('เห็นบันทึกของตัวเองครบ', () => {
    assert.ok(html.includes('ติดตามผลการเรียน'), 'ไม่เห็นรายการของตัวเอง');
    assert.ok(html.includes('ปัญหาสุขภาพ'), 'ไม่เห็นรายการที่สอง');
  });
  t('ไม่เห็นบันทึกของอาจารย์ท่านอื่น', () =>
    assert.ok(!html.includes('ของครูท่านอื่น'), 'บันทึกของอาจารย์ท่านอื่นหลุดมา'));
  t('บอกจำนวนนักศึกษาในที่ปรึกษาของตน', () =>
    assert.ok(html.includes('ในที่ปรึกษาของคุณ (5 คน)'), 'นับนักศึกษาผิด'));

  console.log('\n[2] ผู้ดูแลระบบเห็นทั้งหมด · เจ้าหน้าที่เห็นเฉพาะที่ส่งต่อ');
  t('ผู้ดูแลเห็นของทุกคน', () => {
    const a = makeEnv({ role: 'admin', me: 'ผู้ดูแล' }).counselPages.counselList();
    assert.ok(a.includes('ติดตามผลการเรียน') && a.includes('ของครูท่านอื่น'), 'ผู้ดูแลเห็นไม่ครบ');
  });
  t('เจ้าหน้าที่งานอื่นๆ เห็นเฉพาะรายการที่ส่งต่อ', () => {
    const o = makeEnv({ role: 'otherStaff', me: 'จนท.กิจการนักศึกษา' }).counselPages.counselList();
    assert.ok(o.includes('ปัญหาสุขภาพ'), 'ไม่เห็นรายการที่ส่งต่อ');
    assert.ok(!o.includes('ติดตามผลการเรียน'), 'เห็นรายการที่ไม่ได้ส่งต่อถึงตน');
    assert.ok(!o.includes('ของครูท่านอื่น'), 'เห็นรายการที่ไม่ได้ส่งต่อ');
  });
  t('เจ้าหน้าที่ไม่มีปุ่มเพิ่มการให้คำปรึกษา', () => {
    const o = makeEnv({ role: 'otherStaff', me: 'จนท.' }).counselPages.counselList();
    assert.ok(!o.includes('เพิ่มการให้คำปรึกษา'), 'ไม่ควรมีปุ่มเพิ่ม');
  });
  t('นักศึกษาเข้าหน้านี้ไม่ได้', () => {
    const st = makeEnv({ role: 'student', me: 'นศ' }).counselPages.counselList();
    assert.ok(st.includes('ไม่มีสิทธิ์'), 'นักศึกษาเข้าได้');
  });

  console.log('\n[3] เลือกนักศึกษาได้เฉพาะในที่ปรึกษาของตน');
  w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
  w.counselEdit('');
  const edit = w.counselPages.counselEdit();
  t('แสดงครบทั้งสี่ชั้นปี', () =>
    ['ชั้นปีที่ 1', 'ชั้นปีที่ 2', 'ชั้นปีที่ 3', 'ชั้นปีที่ 4'].forEach(y =>
      assert.ok(edit.includes(y), 'ขาด ' + y)));
  t('เห็นเฉพาะนักศึกษาของตน ไม่เห็นของครูท่านอื่น', () => {
    assert.ok(edit.includes('6611030101'), 'ไม่เห็นนักศึกษาของตน');
    assert.ok(!edit.includes('6611030199'), 'นักศึกษาของครูท่านอื่นหลุดมา');
  });
  t('มีปุ่มเลือกทั้งหมด/ยกเลิกทั้งหมด รายชั้นปี', () => {
    assert.ok(edit.includes("counselPickAll('4',true)"), 'ไม่มีปุ่มเลือกทั้งหมด');
    assert.ok(edit.includes("counselPickAll('4',false)"), 'ไม่มีปุ่มยกเลิกทั้งหมด');
  });
  t('มีคอลัมน์ข้อมูลประกอบครบทั้งห้า พร้อมรูป', () => {
    ['ข้อมูลผลการศึกษา', 'ข้อมูลความประพฤติ', 'ข้อมูลการลา/ขาดเรียน รายบุคคล',
      'ข้อมูลการเจ็บป่วย', 'ข้อมูล สบช.โมเดล', 'รูป'].forEach(c =>
        assert.ok(edit.includes(c), 'ขาดคอลัมน์ ' + c));
  });
  t('มีปุ่มบันทึกทั้งบนและล่าง เรียกฟังก์ชันเดียวกัน', () => {
    const n = (edit.match(/counselSave\(\)/g) || []).length;
    assert.ok(n >= 2, 'พบปุ่มบันทึกแค่ ' + n + ' จุด');
  });

  console.log('\n[4] คำนวณเวลา');
  t('90 นาที = 1.50 ชั่วโมง', () => {
    assert.ok(html.includes('1.50 ชม.'), 'แปลงนาทีเป็นชั่วโมงผิด');
    assert.ok(html.includes('1.00 ชม.'), 'แปลง 60 นาทีผิด');
  });
  t('เวลาสิ้นสุดน้อยกว่าเวลาเริ่ม ต้องไม่ผ่านการตรวจ', () => {
    const i = CS.indexOf('function validate(d)');
    const src = CS.slice(i, i + 1600);
    assert.ok(src.includes('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม'), 'ไม่ได้ตรวจลำดับเวลา');
    assert.ok(/m <= 0/.test(src), 'เงื่อนไขตรวจเวลาไม่ถูก');
  });
  t('เก็บเป็นนาที ไม่ใช่ชั่วโมงทศนิยม', () =>
    assert.ok(CS.includes("duration_min: String(mins)"), 'ไม่ได้เก็บเป็นนาที'));

  console.log('\n[5] กันรายชื่อซ้ำ');
  w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
  w.counselEdit(''); w.counselPages.counselEdit();
  t('เพิ่มเฉพาะรายซ้ำกับที่เลือกจากชั้นปีไม่ได้', () => {
    const d = w.APP._counsel.draft;
    d.picked.push({ student_id: '6611030101', source: 'year', private_note: '' });
    w.__els = { csAddStudent: { value: '6611030101' } };
    writes.length = 0;
    w.counselAddOne();
    assert.ok(writes.some(x => x[0] === 'toast' && /ถูกเลือกไว้แล้ว/.test(x[1])), 'ไม่ได้เตือนว่าซ้ำ');
    assert.strictEqual(d.picked.filter(p => p.student_id === '6611030101').length, 1, 'มีชื่อซ้ำในรายการ');
  });
  t('เพิ่มนักศึกษาที่ไม่ใช่ของตนไม่ได้', () => {
    const d = w.APP._counsel.draft;
    w.__els = { csAddStudent: { value: '6611030199' } };
    writes.length = 0;
    w.counselAddOne();
    assert.ok(writes.some(x => x[0] === 'toast' && /ไม่พบนักศึกษา/.test(x[1])), 'ยอมให้เพิ่มนักศึกษาของครูท่านอื่น');
    assert.ok(!d.picked.some(p => p.student_id === '6611030199'), 'เพิ่มเข้าไปแล้ว');
  });
  t('ตัวตรวจก่อนบันทึกจับชื่อซ้ำได้อีกชั้น', () => {
    const src = CS.slice(CS.indexOf('function validate(d)'), CS.indexOf('var saving = false'));
    assert.ok(src.includes('มีรายชื่อนักศึกษาซ้ำ'), 'ไม่มีการกันซ้ำในตัวตรวจ');
  });

  console.log('\n[6] ตรวจข้อมูลก่อนบันทึก');
  t('ตรวจครบทั้งแปดข้อตามที่กำหนด', () => {
    const src = CS.slice(CS.indexOf('function validate(d)'), CS.indexOf('var saving = false'));
    ['ระบุวันที่ให้คำปรึกษา', 'ระบุเวลาเริ่ม', 'ระบุเวลาสิ้นสุด', 'เลือกภาคการศึกษา',
      'ระบุปีการศึกษา', 'ระบุเรื่องที่ให้คำปรึกษา', 'เลือกประเภทประเด็นปัญหา',
      'เลือกช่องทางการให้คำปรึกษา', 'กรอกผลการให้คำปรึกษา', 'เลือกสถานะการจัดการปัญหา',
      'เลือกนักศึกษาอย่างน้อยหนึ่งคน'].forEach(k =>
        assert.ok(src.includes(k), 'ไม่ได้ตรวจ: ' + k));
  });
  t('เลือก "อื่น ๆ" แล้วบังคับระบุรายละเอียด', () => {
    const src = CS.slice(CS.indexOf('function validate(d)'), CS.indexOf('var saving = false'));
    assert.ok(src.includes("d.issues.indexOf('other') >= 0 && !s(d.issue_other)"), 'ไม่ได้บังคับ');
  });
  t('ส่งต่อแล้วบังคับระบุหน่วยงานและเหตุผล', () => {
    const src = CS.slice(CS.indexOf('function validate(d)'), CS.indexOf('var saving = false'));
    assert.ok(src.includes('ระบุหน่วยงาน/ผู้รับผิดชอบที่ส่งต่อ') && src.includes('ระบุเหตุผลการส่งต่อ'), 'ไม่ได้บังคับ');
  });
  await ta('กรอกไม่ครบแล้วไม่เขียนอะไรลงฐานข้อมูล', async () => {
    const w2 = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
    w2.counselEdit(''); w2.counselPages.counselEdit();
    writes.length = 0;
    await w2.counselSave();
    assert.ok(!writes.some(x => x[0] === 'create' || x[0] === 'update'), 'เขียนลงฐานข้อมูลทั้งที่ยังกรอกไม่ครบ');
    assert.ok(writes.some(x => x[0] === 'toast' && /ยังกรอกไม่ครบ/.test(x[1])), 'ไม่ได้เตือน');
  });
  t('ปิดปุ่มระหว่างบันทึกกันกดซ้ำ', () => {
    const src = CS.slice(CS.indexOf('window.counselSave'), CS.indexOf('window.counselEdit'));
    assert.ok(src.includes('if (saving) return;'), 'ไม่ได้กันกดซ้ำ');
    assert.ok(src.includes('b.disabled = true'), 'ไม่ได้ปิดปุ่ม');
    assert.ok(src.includes('b.disabled = false'), 'ไม่ได้เปิดปุ่มคืน');
  });
  t('บันทึกล้มเหลวต้องไม่ล้างข้อมูลที่กรอกไว้', () => {
    const src = CS.slice(CS.indexOf('window.counselSave'), CS.indexOf('window.counselEdit'));
    const iCatch = src.indexOf('} catch (e) {');
    const seg = src.slice(iCatch, iCatch + 300);
    assert.ok(!/st\.draft = null/.test(seg), 'ล้างร่างทิ้งตอนบันทึกล้มเหลว');
  });
  t('กดกลับขณะมีข้อมูลค้าง ต้องถามยืนยัน', () => {
    const src = CS.slice(CS.indexOf('window.counselBack'), CS.indexOf('window.counselBack') + 400);
    assert.ok(src.includes('st.dirty') && src.includes('confirm('), 'ไม่ได้ถามยืนยัน');
  });

  console.log('\n[7] บันทึกจริง');
  w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
  w.counselEdit(''); w.counselPages.counselEdit();
  Object.assign(w.APP._counsel.draft, {
    counsel_date: '2568-09-01', start_time: '09:00', end_time: '10:30',
    semester: '1', academic_year: '2568', topic: 'เรื่องทดสอบ',
    issues: ['dev'], channel: 'onsite', result_note: 'ผลการให้คำปรึกษา',
    refer_status: 'ไม่ส่งต่อ',
    picked: [{ student_id: '6611030101', source: 'year', private_note: '' }]
  });
  writes.length = 0;
  await w.counselSave();
  await flush();
  const created = writes.filter(x => x[0] === 'create').map(x => x[1]);
  t('สร้างรายการพร้อมระยะเวลาเป็นนาที', () => {
    const sess = created.find(x => x.type === 'counsel_session');
    assert.ok(sess, 'ไม่ได้สร้างรายการ');
    assert.strictEqual(sess.duration_min, '90', 'คำนวณนาทีผิด: ' + sess.duration_min);
    assert.strictEqual(sess.advisor_name, 'อ.สมศรี ใจดี', 'ไม่ได้ลงชื่อผู้บันทึก');
  });
  t('บันทึกชั้นปี ณ วันให้คำปรึกษาไว้ในตารางเชื่อม', () => {
    const m = created.find(x => x.type === 'counsel_student');
    assert.ok(m, 'ไม่ได้สร้างรายชื่อนักศึกษา');
    assert.strictEqual(m.year_level, '4', 'ไม่ได้เก็บชั้นปี ณ ตอนนั้น');
    assert.strictEqual(m.student_name, 'กนกพร เดชกล้า', 'ไม่ได้เก็บสำเนาชื่อ');
  });
  t('เขียนประวัติการเปลี่ยนแปลง', () =>
    assert.ok(created.some(x => x.type === 'counsel_log' && x.action === 'สร้าง'), 'ไม่มีประวัติ'));
  t('บันทึกสำเร็จแล้วกลับไปหน้ารายการ', () =>
    assert.ok(writes.some(x => x[0] === 'nav' && x[1] === 'counselList'), 'ไม่ได้กลับหน้ารายการ'));

  console.log('\n[8] หน้าต่างข้อมูลประกอบ');
  w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี' });
  t('ผลการศึกษาเรียกใบแสดงผลการเรียนตัวเดิมของระบบ', () => {
    writes.length = 0;
    w.counselStuGrades('6611030101');
    assert.ok(writes.some(x => x[0] === 'transcript'), 'ไม่ได้เรียกของเดิม — จะกลายเป็นเขียนซ้ำ');
  });
  t('สบช.โมเดล คำนวณ BMI ถูกต้อง', () => {
    w.counselStuHealth('6611030101');
    const h = w.__modal;
    assert.ok(h.includes('1.65/69/25.34'), 'BMI แถวแรกผิด');
    assert.ok(h.includes('1.64/89/33.09'), 'BMI แถวสองผิด');
    assert.ok(h.includes('117/66'), 'ความดันไม่ขึ้น');
    assert.ok(h.includes('2 รายการ'), 'นับรายการผิด');
  });
  t('การเจ็บป่วยดึงจากใบลาป่วย ไม่เก็บซ้ำ', () => {
    w.counselStuIllness('6611030101');
    const h = w.__modal;
    assert.ok(h.includes('ลาป่วย'), 'ไม่ดึงใบลาป่วย');
    assert.ok(!h.includes('ลากิจ'), 'ลากิจไม่ควรนับเป็นการเจ็บป่วย');
    assert.ok(h.includes('1 รายการ'), 'นับผิด');
  });
  t('การลา/ขาดเรียนดึงใบลาทุกประเภท', () => {
    w.counselStuLeave('6611030101');
    assert.ok(w.__modal.includes('2 รายการ'), 'ควรเห็นทั้งลาป่วยและลากิจ');
  });
  t('คอลัมน์ที่ยังไม่มีข้อมูล ขึ้นว่าไม่มีข้อมูล ไม่ใช่หน้าว่าง', () => {
    w.counselStuConduct('6611030101');
    assert.ok(w.__modal.includes('ไม่มีข้อมูลความประพฤติ'), 'ไม่ได้บอกว่ายังไม่มีข้อมูล');
    assert.ok(w.__modal.includes('0 รายการ'), 'ไม่ได้นับเป็นศูนย์');
  });

  console.log('\n[9] การต่อเข้าระบบเดิม');
  t('เปิดสิทธิ์ให้อาจารย์ ประจำชั้น ผู้ดูแล และเจ้าหน้าที่งานอื่นๆ', () => {
    ['teacher', 'classTeacher', 'admin', 'otherStaff'].forEach(r =>
      assert.ok(new RegExp(r + ': \\{[^}]*counsel: 1').test(APPJS), 'ยังไม่เปิดสิทธิ์ให้ ' + r));
  });
  t('นักศึกษาและผู้บริหารไม่มีสิทธิ์', () => {
    ['student', 'executive'].forEach(r =>
      assert.ok(!new RegExp(r + ': \\{[^}]*counsel: 1').test(APPJS), r + ' ไม่ควรมีสิทธิ์'));
  });
  t('เมนูวางต่อจากระบบการลาของนักศึกษา', () => {
    const src = CS.slice(CS.indexOf('function addMenu()'));
    assert.ok(src.includes("nav.querySelector('[data-leave-menu]')"), 'ไม่ได้อ้างอิงเมนูการลา');
    assert.ok(src.includes('nav.insertBefore(node, after.nextSibling)'), 'ไม่ได้วางต่อท้ายเมนูการลา');
  });
  t('โหลดตารางใหม่เข้าระบบแล้ว', () => {
    const i = DB.indexOf('SHEET_TABS');
    const seg = DB.slice(i, DB.indexOf('];', i));
    ['counsel_session', 'counsel_student', 'counsel_option', 'student_health', 'student_conduct']
      .forEach(tb => assert.ok(seg.includes("'" + tb + "'"), 'ขาด ' + tb));
  });
  t('นักศึกษาไม่โหลดตารางบันทึกคำปรึกษา', () => {
    const i = DB.indexOf('STUDENT_SKIP');
    const seg = DB.slice(i, DB.indexOf(']);', i));
    ['counsel_session', 'counsel_student'].forEach(tb =>
      assert.ok(seg.includes("'" + tb + "'"), 'นักศึกษายังโหลด ' + tb + ' ได้'));
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(CS); });

  console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
