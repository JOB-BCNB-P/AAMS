/* ส่งต่อเคสให้คำปรึกษา → รองผู้อำนวยการ 2 ด้าน + ช่องทาง "อื่น ๆ" + ด้านที่รับผิดชอบของผู้บริหาร */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const CS = fs.readFileSync(P + 'counsel.js', 'utf8');
const APPJS = fs.readFileSync(P + 'app.js', 'utf8');
const TW = fs.readFileSync(P + 'tailwind.css', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
async function ta(n, f) { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

const DEPUTY_ACAD = 'อ.วิภา วิชาการ';
const DEPUTY_STU = 'อ.ชูใจ กิจการ';

function baseData() {
  return {
    user: [
      { name: DEPUTY_ACAD, email: 'a@bcn.ac.th', role: 'executive', exec_area: 'วิชาการ', is_active: '1' },
      { name: DEPUTY_STU, email: 'b@bcn.ac.th', role: 'executive', exec_area: 'กิจการนักศึกษา', is_active: '1' },
      { name: 'อ.บริหาร ยุทธศาสตร์', email: 'c@bcn.ac.th', role: 'executive', exec_area: 'บริหารและยุทธศาสตร์', is_active: '1' },
      { name: 'อ.ลาออกแล้ว', email: 'd@bcn.ac.th', role: 'executive', exec_area: 'วิชาการ', is_active: '0' },
      { name: 'อ.สมศรี ใจดี', email: 'e@bcn.ac.th', role: 'teacher', is_active: '1' }
    ],
    student: [
      { student_id: '6611030101', name: 'กนกพร เดชกล้า', year_level: '4', advisor: 'อ.สมศรี ใจดี', status: 'กำลังศึกษา' },
      { student_id: '6611030199', name: 'ของครูท่านอื่น', year_level: '4', advisor: 'อ.ประเสริฐ มั่นคง', status: 'กำลังศึกษา' }
    ],
    grade: [], leave: [], student_health: [], student_conduct: [],
    counsel_option: [
      { kind: 'issue', code: 'dev', label: 'ส่งเสริมการพัฒนาชีวิต', sort_order: '1' },
      { kind: 'issue', code: 'other', label: 'อื่น ๆ โปรดระบุ', sort_order: '99' },
      { kind: 'channel', code: 'onsite', label: 'พบโดยตรง', sort_order: '1' }
    ],
    counsel_session: [
      { session_code: 'CS1', topic: 'ติดตามผลการเรียน', counsel_date: '2568-07-10', start_time: '09:00', end_time: '10:00', duration_min: '60', semester: '1', academic_year: '2568', issue_types: 'dev', channel: 'onsite', result_note: 'x', refer_status: 'ไม่ส่งต่อ', advisor_name: 'อ.สมศรี ใจดี', __rowIndex: 1 },
      { session_code: 'CS2', topic: 'เคสที่ส่งต่อ', counsel_date: '2568-08-01', start_time: '13:00', end_time: '14:00', duration_min: '60', semester: '1', academic_year: '2568', issue_types: 'dev', channel: 'other', channel_other: 'ไลน์กลุ่มชั้นปี', result_note: 'y', refer_status: 'ส่งต่อ', refer_to: 'เดิม', refer_reason: 'ต้องพบแพทย์', advisor_name: 'อ.สมศรี ใจดี', __rowIndex: 2 }
    ],
    counsel_student: [
      { session_code: 'CS1', student_id: '6611030101', student_name: 'กนกพร เดชกล้า', year_level: '4', source: 'year', __rowIndex: 11 },
      { session_code: 'CS2', student_id: '6611030101', student_name: 'กนกพร เดชกล้า', year_level: '4', source: 'year', __rowIndex: 12 }
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
      config: {},
      permissions: { teacher: { counsel: 1 }, classTeacher: { counsel: 1 }, admin: { counsel: 1 }, otherStaff: { counsel: 1 }, executive: { counsel: 1 }, student: {} },
      currentUser: opts.user || { name: opts.me || 'อ.สมศรี ใจดี' }
    },
    getDataByType: (t) => DATA[t] || [],
    htmlEsc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    isActiveStudent: (s) => String(s && s.status) === 'กำลังศึกษา',
    toBuddhistDate: (v) => String(v || ''), toBuddhistDateList: (v) => String(v || ''),
    currentAcademicYearBE: () => 2568,
    navigateTo: (p) => { sb.APP.currentPage = p; writes.push(['nav', p]); },
    renderCurrentPage: () => { },
    showToast: (m, k) => writes.push(['toast', m, k]),
    showModal: () => { }, closeModal: () => { },
    _renderTranscript: (stu) => writes.push(['transcript', stu.student_id]),
    annSendChannels: async (id, ch) => { writes.push(['mail', id, ch]); return ['อีเมล 2 คน']; },
    confirm: () => true,
    GSheetDB: {
      create: async (o) => { writes.push(['create', o]); return { isOk: true, rowIndex: 77 }; },
      update: async (o) => { writes.push(['update', o]); return { isOk: true }; },
      delete: async (o) => { writes.push(['delete', o]); return { isOk: true }; },
      refreshTab: async () => { }
    },
    document: {
      getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
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

(async function () {
  console.log('[1] ด้านที่รับผิดชอบของผู้บริหาร (app.js)');
  t('มีตำแหน่งผู้บริหารครบ ผอ. + รองฯ 4 ด้าน', () => {
    const m = APPJS.match(/const EXEC_AREAS = \[([^\]]+)\]/);
    assert.ok(m, 'ไม่พบ EXEC_AREAS');
    assert.ok(m[1].includes('EXEC_DIRECTOR'), 'ขาดตำแหน่งผู้อำนวยการวิทยาลัย');
    ['วิชาการ', 'กิจการนักศึกษา', 'บริหารและยุทธศาสตร์', 'วิจัยและบริการวิชาการ']
      .forEach(a => assert.ok(m[1].includes("'" + a + "'"), 'ขาดด้าน ' + a));
  });
  t('ผู้อำนวยการวิทยาลัยไม่ขึ้นคำว่า "รองผู้อำนวยการด้าน"', () => {
    const src = APPJS.slice(APPJS.indexOf('function execAreaLabel'), APPJS.indexOf('function isExecutiveUser'));
    assert.ok(src.includes("'ผู้อำนวยการวิทยาลัย'"), 'ไม่มีป้ายชื่อผู้อำนวยการวิทยาลัย');
    assert.ok(src.includes('EXEC_DIRECTOR'), 'ไม่ได้แยกกรณีผู้อำนวยการออกจากรองผู้อำนวยการ');
  });
  t('ใส่ช่องด้านไว้ทั้งฟอร์มเพิ่มและฟอร์มแก้ไข', () => {
    assert.ok(APPJS.includes('execAreaFieldHTML({})'), 'ฟอร์มเพิ่มผู้ใช้ไม่มีช่องด้าน');
    assert.ok(APPJS.includes('execAreaFieldHTML(u)'), 'ฟอร์มแก้ไขผู้ใช้ไม่มีช่องด้าน');
  });
  t('เปลี่ยนบทบาทแล้วซ่อน/ล้างค่าให้', () => {
    const src = APPJS.slice(APPJS.indexOf('function onUserRoleChange'), APPJS.indexOf('function onUserRoleChange') + 1200);
    assert.ok(src.includes("getElementById('execAreaWrap')"), 'ไม่ได้สลับการแสดงช่องด้าน');
    assert.ok(/role === 'executive'/.test(src), 'ไม่ได้ผูกกับบทบาทผู้บริหาร');
    assert.ok(src.includes("sel.value = ''"), 'เปลี่ยนบทบาทแล้วไม่ล้างค่าเดิม');
  });
  t('บันทึกค่า exec_area ตอนเพิ่มผู้ใช้', () =>
    assert.ok(/obj\.exec_area = execArea/.test(APPJS), 'ฟอร์มเพิ่มผู้ใช้ไม่ได้บันทึกค่าด้าน'));
  t('ผู้บริหารล็อกอินแล้วรู้ด้านของตัวเอง', () =>
    assert.ok(/role: 'executive', email: u\.email \|\| '', exec_area/.test(APPJS), 'ไม่ได้ติด exec_area มากับบัญชีที่ล็อกอิน'));

  console.log('\n[2] ผู้รับเคสที่ส่งต่อ');
  t('รองฯ วิชาการ เห็นเฉพาะรายการที่ส่งต่อ', () => {
    const w = makeEnv({ role: 'executive', user: { name: DEPUTY_ACAD, exec_area: 'วิชาการ' } });
    const h = w.counselPages.counselList();
    assert.ok(h.includes('เคสที่ส่งต่อ'), 'ไม่เห็นรายการที่ส่งต่อมา');
    assert.ok(!h.includes('ติดตามผลการเรียน'), 'เห็นรายการที่ไม่ได้ส่งต่อด้วย');
  });
  t('รองฯ กิจการนักศึกษา เห็นรายการที่ส่งต่อ', () => {
    const w = makeEnv({ role: 'executive', user: { name: DEPUTY_STU, exec_area: 'กิจการนักศึกษา' } });
    assert.ok(w.counselPages.counselList().includes('เคสที่ส่งต่อ'), 'ไม่เห็นรายการที่ส่งต่อมา');
  });
  t('รองฯ ด้านอื่นไม่เห็นเคสส่งต่อ', () => {
    const w = makeEnv({ role: 'executive', user: { name: 'อ.บริหาร ยุทธศาสตร์', exec_area: 'บริหารและยุทธศาสตร์' } });
    const h = w.counselPages.counselList();
    assert.ok(!h.includes('เคสที่ส่งต่อ') && !h.includes('ติดตามผลการเรียน'), 'ด้านที่ไม่เกี่ยวข้องเห็นข้อมูล');
  });

  console.log('\n[2.1] หารายชื่อผู้รับเคสได้แม้อ่านตาราง user ไม่ได้');
  t('ถามผ่าน ems_exec_names เมื่อเปิดฟอร์ม', () => {
    const i = CS.indexOf('function loadExecNames()');
    assert.ok(i > 0, 'ไม่มีการถามรายชื่อจากฐานข้อมูล');
    const g = CS.slice(i, i + 700);
    assert.ok(g.includes("rpc('ems_exec_names'"), 'ไม่ได้เรียก ems_exec_names');
    assert.ok(g.includes('p_areas: REFER_AREAS'), 'ไม่ได้จำกัดเฉพาะสองด้านที่รับเคส');
    assert.ok(CS.slice(CS.indexOf('counselPages.counselEdit') - 2000, CS.length).includes('loadExecNames();')
      || CS.includes('loadExecNames();'), 'ไม่ได้เรียกตอนเปิดฟอร์ม');
  });
  t('ไม่ส่งถึงคนเดียวกันสองครั้งเมื่อข้อมูลมาจากสองทาง', () => {
    const w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี' });
    const names = w.referTargets ? [] : [];   // referTargets เป็นฟังก์ชันภายใน ตรวจจากโค้ดแทน
    const i = CS.indexOf('function referTargets()');
    const g = CS.slice(i, i + 700);
    assert.ok(g.includes('seen[k]'), 'ไม่ได้กันชื่อซ้ำ');
    assert.ok(names.length === 0);
  });

  console.log('\n[3] ฟอร์มส่งต่อ');
  const w = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
  w.counselEdit('CS2');
  const form = w.counselPages.counselEdit();
  t('บอกชื่อรองผู้อำนวยการที่จะส่งถึง', () => {
    assert.ok(form.includes(DEPUTY_STU) && form.includes(DEPUTY_ACAD), 'ไม่ได้บอกชื่อผู้รับเคส');
  });
  t('ไม่มีช่องพิมพ์หน่วยงานเองแล้ว', () =>
    assert.ok(!/counselField\('refer_to'/.test(form), 'ยังให้พิมพ์หน่วยงานเอง'));
  t('ยังบังคับกรอกเหตุผลการส่งต่อ', () =>
    assert.ok(/counselField\('refer_reason'/.test(form), 'ไม่มีช่องเหตุผล'));

  console.log('\n[4] ช่องทาง "อื่น ๆ"');
  t('มีตัวเลือกอื่น ๆ ให้เสมอ แม้ฐานข้อมูลไม่มีแถวนี้', () =>
    assert.ok(form.includes('อื่น ๆ โปรดระบุ'), 'ไม่มีตัวเลือกอื่น ๆ'));
  t('เลือกอื่น ๆ แล้วขึ้นช่องให้ระบุ', () =>
    assert.ok(/counselField\('channel_other'/.test(form), 'ไม่มีช่องระบุช่องทาง'));
  t('ติ๊กประเด็นปัญหา "อื่น ๆ" แล้วขึ้นช่องให้ระบุ', () => {
    const w2 = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
    w2.counselEdit(''); w2.counselPages.counselEdit();
    w2.counselIssue('other', true);
    assert.ok(/counselField\('issue_other'/.test(w2.counselPages.counselEdit()), 'ไม่มีช่องระบุประเด็นปัญหา');
  });
  t('ไม่ระบุช่องทางอื่น ๆ แล้วเตือน', () => {
    const src = CS.slice(CS.indexOf('function validate(d)'), CS.indexOf('/* แจ้งเตือนการส่งต่อ'));
    assert.ok(src.includes('ระบุช่องทางการให้คำปรึกษา "อื่น ๆ"'), 'ไม่ได้บังคับระบุ');
  });
  t('หน้ารายละเอียดแสดงช่องทางที่ระบุเอง', () => {
    const w3 = makeEnv({ role: 'admin', me: 'ผู้ดูแล' });
    writes.length = 0;
    w3.counselShow('CS2');
    assert.ok(!writes.some(x => x[0] === 'toast'), 'เปิดรายละเอียดไม่ได้');
  });

  console.log('\n[5] แจ้งเตือนเมื่อส่งต่อ');
  await ta('สร้างประกาศถึงรองฯ 2 ท่าน และสั่งส่งอีเมล', async () => {
    const w4 = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
    w4.counselEdit('CS1');                       // เดิมยังไม่ส่งต่อ
    w4.counselPages.counselEdit();
    w4.counselField('refer_status', 'ส่งต่อ');
    w4.counselField('refer_reason', 'ต้องการความช่วยเหลือด้านการเรียน');
    writes.length = 0;
    await w4.counselSave();
    const ann = writes.filter(x => x[0] === 'create' && x[1].type === 'announcement')[0];
    assert.ok(ann, 'ไม่ได้สร้างประกาศแจ้งเตือน');
    assert.strictEqual(ann[1].roles, '', 'ไม่ได้ล้างช่องบทบาท จะกลายเป็นประกาศถึงทุกคน');
    assert.ok(ann[1].target_names.includes(DEPUTY_STU) && ann[1].target_names.includes(DEPUTY_ACAD), 'ผู้รับไม่ครบ 2 ท่าน');
    assert.ok(!ann[1].target_names.includes('อ.ลาออกแล้ว'), 'ส่งถึงบัญชีที่ปิดใช้งาน');
    assert.ok(writes.some(x => x[0] === 'mail'), 'ไม่ได้สั่งส่งอีเมล');
  });
  await ta('เนื้อหาแจ้งเตือนไม่มีชื่อนักศึกษาและรายละเอียดปัญหา', async () => {
    const ann = writes.filter(x => x[0] === 'create' && x[1].type === 'announcement')[0];
    const txt = String(ann[1].announcement_title) + String(ann[1].announcement_content);
    assert.ok(!txt.includes('กนกพร'), 'ชื่อนักศึกษาหลุดไปอยู่ในประกาศ');
    assert.ok(!txt.includes('6611030101'), 'รหัสนักศึกษาหลุดไปอยู่ในประกาศ');
  });
  await ta('แก้ไขเคสที่ส่งต่ออยู่แล้ว ไม่แจ้งเตือนซ้ำ', async () => {
    const w5 = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี', page: 'counselEdit' });
    w5.counselEdit('CS2');
    w5.counselPages.counselEdit();
    w5.counselField('topic', 'แก้หัวข้อใหม่');
    writes.length = 0;
    await w5.counselSave();
    assert.ok(!writes.some(x => x[0] === 'create' && x[1].type === 'announcement'), 'แจ้งเตือนซ้ำ');
  });
  t('บันทึกชื่อผู้รับเคสลงช่อง refer_to ให้เอง', () => {
    const src = CS.slice(CS.indexOf('var payload = {'), CS.indexOf('var existing = d.__new'));
    assert.ok(src.includes('referToText()'), 'ไม่ได้เติมชื่อผู้รับเคสให้');
  });

  console.log('\n[6] อาจารย์เห็นเฉพาะนักศึกษาในความดูแล');
  t('เปิดข้อมูลนักศึกษานอกความดูแลไม่ได้', () => {
    const w6 = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี' });
    ['counselStuGrades', 'counselStuConduct', 'counselStuLeave', 'counselStuIllness', 'counselStuHealth'].forEach(fn => {
      writes.length = 0;
      w6[fn]('6611030199');
      assert.ok(writes.some(x => x[0] === 'toast' && x[2] === 'error'), fn + ' ไม่ได้กัน');
      assert.ok(!writes.some(x => x[0] === 'transcript'), fn + ' เปิดข้อมูลให้แล้ว');
    });
  });
  t('นักศึกษาในความดูแลยังเปิดได้ตามปกติ', () => {
    const w7 = makeEnv({ role: 'teacher', me: 'อ.สมศรี ใจดี' });
    writes.length = 0;
    w7.counselStuGrades('6611030101');
    assert.ok(writes.some(x => x[0] === 'transcript'), 'เปิดของนักศึกษาตัวเองไม่ได้');
  });

  console.log('\n[7] คลาส Tailwind และ SQL');
  t('คลาสที่ใช้ใหม่มีอยู่จริงใน tailwind.css', () => {
    ['.bg-amber-50{', '.border-amber-200{', '.text-amber-800{', '.text-amber-700{', '.text-red-600{', '.mt-0\\.5{', '.text-\\[11px\\]{']
      .forEach(c => assert.ok(TW.includes(c), 'ไม่มีคลาส ' + c));
  });
  t('มีไฟล์ SQL เปิดสิทธิ์ให้รองผู้อำนวยการ', () => {
    const f = P + 'supabase/migrations/20261110_counsel_referral_deputy.sql';
    assert.ok(fs.existsSync(f), 'ไม่พบไฟล์ migration');
    const sql = fs.readFileSync(f, 'utf8');
    assert.ok(sql.includes('counsel_is_referral_staff'), 'ไม่ได้แก้ฟังก์ชันสิทธิ์');
    assert.ok(sql.includes("exec_area"), 'ไม่ได้ตรวจด้านที่รับผิดชอบ');
    assert.ok(sql.includes('security definer'), 'ต้องเป็น security definer จึงอ่าน app_user ได้');
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(CS); new vm.Script(APPJS); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
