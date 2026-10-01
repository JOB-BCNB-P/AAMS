/* หน้าบันทึกข้อมูล สบช.โมเดล และความประพฤติ
   เน้นสามเรื่อง  ใครกรอกได้ · ค่าที่กรอกถูกหลักไหม · แก้ของคนอื่นได้หรือเปล่า */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const WB = fs.readFileSync(P + 'wellbeing.js', 'utf8');
const APPJS = fs.readFileSync(P + 'app.js', 'utf8');
const POL = fs.readFileSync(P + 'supabase/security/02_policies.sql', 'utf8');

let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
async function ta(n, f) { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

const writes = [];
function baseData() {
  const stu = (id, name, yr) => ({ student_id: id, name, year_level: yr, status: 'กำลังศึกษา' });
  return {
    student: [
      stu('6611030101', 'กนกพร เดชกล้า', '1'),
      stu('6611030102', 'ปรีชา ขยัน', '1'),
      stu('6611030201', 'มาลี สุขใจ', '2'),
      Object.assign(stu('6611030102x', 'พ้นสภาพ แล้ว', '1'), { status: 'ลาออก' })
    ],
    user: [
      { name: 'จนท.บริการวิชาการ', email: 'service@bcn.ac.th', role: 'otherStaff', can_health: '1', can_conduct: '' },
      { name: 'จนท.กิจการนักศึกษา', email: 'student@bcn.ac.th', role: 'otherStaff', can_health: '', can_conduct: '1' },
      { name: 'จนท.วิจัย', email: 'research@bcn.ac.th', role: 'otherStaff', can_health: '', can_conduct: '' },
      { name: 'ผู้ดูแลระบบ', email: 'admin@bcn.ac.th', role: 'admin', can_health: '', can_conduct: '' }
    ],
    student_health: [
      {
        __backendId: 'H1', student_id: '6611030101', semester: '1', academic_year: '2568',
        height_m: '1.65', weight_kg: '69', blood_sugar: '91', pulse: '72',
        bp_systolic: '118', bp_diastolic: '76', note: '', recorded_by: 'จนท.บริการวิชาการ'
      },
      {
        __backendId: 'H2', student_id: '6611030102', semester: '1', academic_year: '2568',
        height_m: '1.70', weight_kg: '60', recorded_by: 'คนอื่น'
      }
    ],
    student_conduct: [
      {
        __backendId: 'C1', student_id: '6611030101', conduct_date: '2568-07-15',
        semester: '1', academic_year: '2568', conduct_type: 'มาสาย',
        detail: 'มาสาย 3 ครั้ง', action_taken: 'ตักเตือนด้วยวาจา', recorded_by: 'จนท.กิจการนักศึกษา'
      },
      {
        __backendId: 'C2', student_id: '6611030201', conduct_date: '2568-08-01',
        semester: '1', academic_year: '2568', conduct_type: 'พฤติกรรมดีเด่น',
        detail: 'ช่วยงานจิตอาสา', action_taken: 'บันทึกชมเชย', recorded_by: 'คนอื่น'
      }
    ]
  };
}

function makeEnv(opts) {
  opts = opts || {};
  const DATA = opts.data || baseData();
  const els = {};
  const sb = {
    console,
    APP: {
      currentRole: opts.role || 'otherStaff',
      currentPage: opts.page || 'healthEntry',
      filters: {}, pagination: { page: 1 },
      currentUser: { name: opts.me || 'จนท.บริการวิชาการ', email: opts.email || 'service@bcn.ac.th' },
      permissions: { otherStaff: {}, admin: {} }
    },
    getDataByType: (t) => DATA[t] || [],
    htmlEsc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    isActiveStudent: (s) => String(s && s.status) === 'กำลังศึกษา',
    toBuddhistDateList: (v) => String(v || ''),
    currentAcademicYearBE: () => 2568,
    renderCurrentPage: () => { },
    navigateTo: () => { },
    showToast: (m, k) => writes.push(['toast', m, k]),
    showModal: (title, html) => { sb.__modalTitle = title; sb.__modal = html; },
    closeModal: () => { writes.push(['close']); },
    confirm: () => true,
    GSheetDB: {
      create: async (o) => { writes.push(['create', o]); return { isOk: true }; },
      update: async (o) => { writes.push(['update', o]); return { isOk: true }; },
      delete: async (o) => { writes.push(['delete', o]); return { isOk: true }; },
      refreshTab: async () => { }
    },
    document: {
      __els: els,
      body: { appendChild() { }, removeChild() { } },
      getElementById: (id) => els[id] || null,
      querySelector: (q) => (els['#' + q] || null),
      querySelectorAll: (q) => (els['*' + q] || []),
      createElement: () => ({ click() { }, set href(v) { }, set download(v) { } })
    },
    // จำลองการดาวน์โหลด เก็บเนื้อไฟล์ไว้ตรวจแทนการเขียนลงดิสก์จริง
    Blob: function (parts) { sb.__file = (sb.__file || ''); sb.__fileText = parts.join(''); },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => { } },
    setTimeout, clearTimeout, Promise
  };
  sb.window = sb;
  sb.getPageContent = () => '';
  sb.buildSidebar = () => { };
  vm.createContext(sb);
  new vm.Script(WB).runInContext(sb);
  sb.__data = DATA;
  sb.__els = els;
  return sb;
}

/* ช่วยจำลองช่องกรอกในตารางหนึ่งแถว */
function setRow(w, sid, fields) {
  const list = Object.keys(fields).map(f => ({ getAttribute: () => f, value: fields[f], __f: f }));
  list.forEach(el => { el.getAttribute = (k) => (k === 'data-f' ? el.__f : null); });
  w.__els['*[data-wb="' + sid + '"]'] = list;
}

(async function () {
  console.log('[1] ใครเห็นหน้าอะไร');
  t('เจ้าหน้าที่ที่ได้สิทธิ์ สบช.โมเดล เข้าหน้านั้นได้', () => {
    const w = makeEnv({ me: 'จนท.บริการวิชาการ', email: 'service@bcn.ac.th' });
    const h = w.wellbeingPages.healthEntry();
    assert.ok(h.includes('ข้อมูล สบช.โมเดล'), 'ไม่เห็นหน้า');
    assert.ok(!h.includes('ยังไม่ได้รับสิทธิ์'), 'ถูกกันทั้งที่มีสิทธิ์');
  });
  t('คนเดียวกันเข้าหน้าความประพฤติไม่ได้', () => {
    const w = makeEnv({ me: 'จนท.บริการวิชาการ', email: 'service@bcn.ac.th' });
    assert.ok(w.wellbeingPages.conductEntry().includes('ยังไม่ได้รับสิทธิ์'), 'เข้าได้ทั้งที่ไม่มีสิทธิ์');
  });
  t('เจ้าหน้าที่กิจการนักศึกษาเข้าได้เฉพาะหน้าความประพฤติ', () => {
    const w = makeEnv({ me: 'จนท.กิจการนักศึกษา', email: 'student@bcn.ac.th' });
    assert.ok(!w.wellbeingPages.conductEntry().includes('ยังไม่ได้รับสิทธิ์'), 'ถูกกันทั้งที่มีสิทธิ์');
    assert.ok(w.wellbeingPages.healthEntry().includes('ยังไม่ได้รับสิทธิ์'), 'เข้าหน้าสุขภาพได้ทั้งที่ไม่มีสิทธิ์');
  });
  t('เจ้าหน้าที่ที่ยังไม่ได้ติ๊กสิทธิ์ เข้าไม่ได้ทั้งสองหน้า', () => {
    const w = makeEnv({ me: 'จนท.วิจัย', email: 'research@bcn.ac.th' });
    assert.ok(w.wellbeingPages.healthEntry().includes('ยังไม่ได้รับสิทธิ์'), 'เข้าหน้าสุขภาพได้');
    assert.ok(w.wellbeingPages.conductEntry().includes('ยังไม่ได้รับสิทธิ์'), 'เข้าหน้าความประพฤติได้');
  });
  t('บอกทางไปขอสิทธิ์ ไม่ใช่ขึ้นว่าห้ามเฉย ๆ', () => {
    const w = makeEnv({ me: 'จนท.วิจัย', email: 'research@bcn.ac.th' });
    assert.ok(w.wellbeingPages.healthEntry().includes('ตั้งค่าระบบ'), 'ไม่ได้บอกว่าต้องไปขอที่ไหน');
  });
  t('ผู้ดูแลระบบเข้าได้ทั้งสองหน้าโดยไม่ต้องติ๊ก', () => {
    const w = makeEnv({ role: 'admin', me: 'ผู้ดูแลระบบ', email: 'admin@bcn.ac.th' });
    assert.ok(!w.wellbeingPages.healthEntry().includes('ยังไม่ได้รับสิทธิ์'), 'ผู้ดูแลถูกกัน');
    assert.ok(!w.wellbeingPages.conductEntry().includes('ยังไม่ได้รับสิทธิ์'), 'ผู้ดูแลถูกกัน');
  });

  console.log('\n[2] ตารางกรอก สบช.โมเดล');
  let w = makeEnv({ me: 'จนท.บริการวิชาการ', email: 'service@bcn.ac.th' });
  let h = w.wellbeingPages.healthEntry();
  t('แสดงเฉพาะนักศึกษาที่ยังศึกษาอยู่', () => {
    assert.ok(h.includes('6611030101') && h.includes('6611030102'), 'ไม่ครบ');
    assert.ok(!h.includes('พ้นสภาพ แล้ว'), 'คนที่ลาออกยังขึ้นอยู่');
  });
  t('แสดงเฉพาะชั้นปีที่เลือก', () =>
    assert.ok(!h.includes('6611030201'), 'นักศึกษาชั้นปีอื่นหลุดมา'));
  t('คำนวณ BMI จากค่าที่บันทึกไว้', () =>
    assert.ok(h.includes('25.34'), 'BMI ไม่ตรง (69 ÷ 1.65² = 25.34)'));
  t('บอกเกณฑ์ BMI เป็นคำ ไม่ใช่ตัวเลขลอย ๆ', () =>
    assert.ok(h.includes('ท้วม') || h.includes('อ้วน'), 'ไม่ได้แปลผล'));
  t('นับว่ากรอกไปแล้วกี่คน', () =>
    assert.ok(/กรอกแล้ว[\s\S]{0,80}2<\/span>\s*จาก 2 คน/.test(h) || h.includes('จาก 2 คน'), 'ไม่ได้บอกความคืบหน้า'));
  t('แถวที่คนอื่นกรอก ต้องล็อกไว้', () => {
    assert.ok(h.includes('คนอื่น เป็นผู้กรอก'), 'ไม่ได้บอกว่าใครกรอก');
    assert.ok(h.includes('แก้ไม่ได้'), 'ไม่ได้ล็อกแถวของคนอื่น');
    assert.ok(h.includes('disabled'), 'ช่องกรอกยังแก้ได้');
  });
  t('แถวของตัวเองแก้และลบได้', () => {
    assert.ok(h.includes("wbHealthSaveOne('6611030101')"), 'ไม่มีปุ่มบันทึกรายแถว');
    assert.ok(h.includes("wbHealthDelete('6611030101')"), 'ไม่มีปุ่มลบ');
  });
  t('มีปุ่มบันทึกทั้งชั้นปี', () => assert.ok(h.includes('wbHealthSaveAll()'), 'ไม่มีปุ่มบันทึกรวด'));
  t('ผู้ดูแลระบบแก้ของคนอื่นได้', () => {
    const a = makeEnv({ role: 'admin', me: 'ผู้ดูแลระบบ', email: 'admin@bcn.ac.th' }).wellbeingPages.healthEntry();
    // ดูที่ช่องกรอกจริง ไม่ใช่คำว่า "แก้ไม่ได้" ซึ่งมีอยู่ในคำอธิบายหัวตารางเสมอ
    assert.ok(!a.includes('disabled'), 'ช่องกรอกของแถวคนอื่นยังถูกปิด');
    assert.ok(a.includes("wbHealthSaveOne('6611030102')"), 'ผู้ดูแลไม่มีปุ่มบันทึกแถวที่คนอื่นกรอก');
    assert.ok(a.includes("wbHealthDelete('6611030102')"), 'ผู้ดูแลลบแถวที่คนอื่นกรอกไม่ได้');
  });

  console.log('\n[3] ตรวจค่าก่อนบันทึก');
  const seg = WB.slice(WB.indexOf('function rowError'), WB.indexOf('function existingHealth'));
  t('ส่วนสูงต้องเป็นเมตร ไม่ใช่เซนติเมตร', () =>
    assert.ok(seg.includes('ส่วนสูงต้องเป็นหน่วยเมตร'), 'กรอก 165 แทน 1.65 แล้ว BMI จะเพี้ยนมหาศาล'));
  t('น้ำหนักต้องอยู่ในช่วงที่เป็นไปได้', () =>
    assert.ok(seg.includes('น้ำหนักอยู่นอกช่วง'), 'ไม่ได้ตรวจ'));
  t('ความดันบนต้องมากกว่าความดันล่าง', () =>
    assert.ok(seg.includes('ความดันบนต้องมากกว่าความดันล่าง'), 'สลับช่องแล้วไม่มีใครรู้'));

  w = makeEnv({ me: 'จนท.บริการวิชาการ', email: 'service@bcn.ac.th' });
  await ta('กรอกส่วนสูงเป็นเซนติเมตร ต้องไม่ยอมบันทึก', async () => {
    setRow(w, '6611030102', { height_m: '170', weight_kg: '60' });
    writes.length = 0;
    await w.wbHealthSaveOne('6611030102');
    assert.ok(!writes.some(x => x[0] === 'create' || x[0] === 'update'), 'บันทึกค่าที่ผิดหน่วยลงไปแล้ว');
    assert.ok(writes.some(x => x[0] === 'toast' && /เมตร/.test(x[1])), 'ไม่ได้บอกว่าผิดตรงไหน');
  });
  await ta('แถวว่างทั้งแถว ไม่ต้องสร้างแถวเปล่าในฐานข้อมูล', async () => {
    setRow(w, '6611030102', { height_m: '', weight_kg: '', blood_sugar: '', pulse: '', bp_systolic: '', bp_diastolic: '', note: '' });
    writes.length = 0;
    await w.wbHealthSaveOne('6611030102');
    assert.ok(!writes.some(x => x[0] === 'create'), 'สร้างแถวเปล่า');
  });
  await ta('ค่าถูกต้องแล้วบันทึกได้ พร้อมลงชื่อผู้กรอก', async () => {
    setRow(w, '6611030102', { height_m: '1.70', weight_kg: '60', blood_sugar: '90', pulse: '70', bp_systolic: '115', bp_diastolic: '70', note: '' });
    writes.length = 0;
    await w.wbHealthSaveOne('6611030102');
    const up = writes.find(x => x[0] === 'update' || x[0] === 'create');
    assert.ok(up, 'ไม่ได้บันทึก');
    assert.strictEqual(up[1].recorded_by, 'จนท.บริการวิชาการ', 'ไม่ได้ลงชื่อผู้กรอก');
    assert.strictEqual(up[1].semester, '1', 'ไม่ได้ผูกกับภาคการศึกษาที่เลือก');
    assert.strictEqual(up[1].academic_year, '2568', 'ไม่ได้ผูกกับปีการศึกษา');
  });
  await ta('มีข้อมูลเดิมในภาคนั้นแล้ว ต้องแก้ของเดิม ไม่ใช่เพิ่มแถวใหม่', async () => {
    setRow(w, '6611030101', { height_m: '1.65', weight_kg: '70', blood_sugar: '', pulse: '', bp_systolic: '', bp_diastolic: '', note: '' });
    writes.length = 0;
    await w.wbHealthSaveOne('6611030101');
    assert.ok(writes.some(x => x[0] === 'update'), 'ไม่ได้แก้ของเดิม');
    assert.ok(!writes.some(x => x[0] === 'create'), 'สร้างซ้ำอีกแถว');
  });
  t('ไม่เก็บ BMI ลงฐานข้อมูล คำนวณตอนแสดงผลอย่างเดียว', () => {
    const save = WB.slice(WB.indexOf('async function saveHealthRow'), WB.indexOf('var busy = false'));
    assert.ok(!/bmi/i.test(save), 'เก็บ BMI ซ้ำ ถ้าแก้น้ำหนักแล้วลืมแก้ BMI จะไม่ตรงกัน');
  });

  console.log('\n[4] บันทึกความประพฤติ');
  w = makeEnv({ me: 'จนท.กิจการนักศึกษา', email: 'student@bcn.ac.th', page: 'conductEntry' });
  const c = w.wellbeingPages.conductEntry();
  t('เห็นรายการของทุกคน เพราะต้องดูภาพรวมได้', () =>
    assert.ok(c.includes('มาสาย') && c.includes('พฤติกรรมดีเด่น'), 'เห็นไม่ครบ'));
  t('แก้/ลบได้เฉพาะของที่ตนบันทึก', () => {
    assert.ok(c.includes("wbConductEdit('C1')"), 'แก้ของตัวเองไม่ได้');
    assert.ok(!c.includes("wbConductEdit('C2')"), 'แก้ของคนอื่นได้');
    assert.ok(c.includes('ของผู้อื่น'), 'ไม่ได้บอกว่าทำไมแก้ไม่ได้');
  });
  t('แยกสีพฤติกรรมดีเด่นออกจากเรื่องที่ต้องตักเตือน', () =>
    assert.ok(c.includes('bg-green-50') && c.includes('bg-amber-50'), 'ดูไม่ออกว่าอันไหนเรื่องดี'));
  t('กดแก้ของคนอื่นตรง ๆ ก็ยังถูกปฏิเสธ', () => {
    writes.length = 0;
    w.wbConductEdit('C2');
    assert.ok(writes.some(x => x[0] === 'toast' && /เฉพาะรายการที่ตนบันทึก/.test(x[1])), 'ยอมให้แก้');
  });

  w.wbConductNew();
  t('หน้าต่างเพิ่มบันทึกเปิดพร้อมค่าตั้งต้น', () => {
    assert.ok(/เพิ่มบันทึกความประพฤติ/.test(w.__modalTitle), 'ชื่อหน้าต่างผิด');
    assert.ok(w.__modal.includes('เลือกได้หลายคนถ้าเป็นเหตุการณ์เดียวกัน'), 'ไม่ได้บอกว่าเลือกได้หลายคน');
  });
  t('เลือกนักศึกษาซ้ำไม่ได้', () => {
    w.APP._wbConduct.draft.students = ['6611030101'];
    w.__els.wbConductPick = { value: '6611030101' };
    writes.length = 0;
    w.wbConductAdd();
    assert.ok(writes.some(x => x[0] === 'toast' && /ถูกเลือกไว้แล้ว/.test(x[1])), 'ไม่ได้เตือน');
    assert.strictEqual(w.APP._wbConduct.draft.students.length, 1, 'มีชื่อซ้ำ');
  });
  t('ตรวจครบทุกช่องที่จำเป็น', () => {
    const v = WB.slice(WB.indexOf('function validateConduct'), WB.indexOf('var savingC'));
    ['เลือกนักศึกษาอย่างน้อยหนึ่งคน', 'ระบุวันที่เกิดเหตุ', 'เลือกภาคการศึกษา',
      'ระบุปีการศึกษา', 'เลือกประเภทพฤติกรรม', 'กรอกรายละเอียด'].forEach(k =>
        assert.ok(v.includes(k), 'ไม่ได้ตรวจ: ' + k));
  });
  await ta('กรอกไม่ครบแล้วไม่เขียนลงฐานข้อมูล', async () => {
    w.APP._wbConduct.draft = { students: [], conduct_date: '', semester: '', academic_year: '', conduct_type: '', detail: '', action_taken: '', note: '' };
    writes.length = 0;
    await w.wbConductSave(false);
    assert.ok(!writes.some(x => x[0] === 'create'), 'เขียนทั้งที่กรอกไม่ครบ');
    assert.ok(writes.some(x => x[0] === 'toast' && /ยังกรอกไม่ครบ/.test(x[1])), 'ไม่ได้เตือน');
  });
  await ta('เหตุการณ์เดียวเลือกสามคน ต้องได้สามแถว', async () => {
    w.APP._wbConduct.draft = {
      students: ['6611030101', '6611030102', '6611030201'],
      conduct_date: '2568-09-01', semester: '1', academic_year: '2568',
      conduct_type: 'มาสาย', detail: 'มาสายพร้อมกัน', action_taken: 'ตักเตือนด้วยวาจา', note: ''
    };
    writes.length = 0;
    await w.wbConductSave(false);
    const made = writes.filter(x => x[0] === 'create');
    assert.strictEqual(made.length, 3, 'ได้ ' + made.length + ' แถว');
    assert.deepStrictEqual(made.map(x => x[1].student_id).sort(),
      ['6611030101', '6611030102', '6611030201'], 'รหัสนักศึกษาไม่ตรง');
    assert.ok(made.every(x => x[1].recorded_by === 'จนท.กิจการนักศึกษา'), 'ไม่ได้ลงชื่อผู้บันทึก');
    assert.ok(made.every(x => x[1].detail === 'มาสายพร้อมกัน'), 'รายละเอียดไม่ตรงกัน');
  });
  t('ปิดปุ่มระหว่างบันทึกกันกดซ้ำ', () => {
    const src = WB.slice(WB.indexOf('window.wbConductSave'), WB.indexOf('window.wbConductDelete'));
    assert.ok(src.includes('if (savingC) return;'), 'ไม่ได้กันกดซ้ำ');
    assert.ok(src.includes('btn.disabled = true'), 'ไม่ได้ปิดปุ่ม');
  });
  t('กดเพิ่มรายชื่อแล้วข้อความที่พิมพ์ไว้ต้องไม่หาย', () => {
    assert.ok(WB.includes('function keepForm()'), 'ไม่มีการเก็บค่าที่พิมพ์ไว้');
    const add = WB.slice(WB.indexOf('window.wbConductAdd'), WB.indexOf('window.wbConductDrop'));
    assert.ok(add.includes('keepForm()'), 'ไม่ได้เก็บก่อนวาดใหม่');
  });

  console.log('\n[4.5] แบบฟอร์ม · นำเข้า · ส่งออก');
  w = makeEnv({ me: 'จนท.บริการวิชาการ', email: 'service@bcn.ac.th' });
  t('หน้ามีปุ่มครบทั้งสามอย่างที่ขอ', () => {
    const h = w.wellbeingPages.healthEntry();
    assert.ok(h.includes('wbHealthForm()'), 'ไม่มีปุ่มดาวน์โหลดแบบฟอร์ม');
    assert.ok(h.includes('wbHealthPickFile()'), 'ไม่มีปุ่มอัปโหลด');
    assert.ok(h.includes('wbHealthExport()'), 'ไม่มีปุ่มดาวน์โหลดข้อมูล');
    assert.ok(h.includes("wbHealthExport('all')"), 'ไม่มีปุ่มดาวน์โหลดทั้งหมด');
    assert.ok(h.includes('id="wbHealthFile"'), 'ไม่มีช่องรับไฟล์');
  });
  t('แบบฟอร์มมีรายชื่อนักศึกษาของชั้นปีนั้นมาให้ครบ', () => {
    w.wbHealthForm();
    const f = w.__fileText;
    assert.ok(f.includes('รหัสนักศึกษา') && f.includes('ส่วนสูง (เมตร)'), 'หัวตารางไม่ครบ');
    assert.ok(f.includes('6611030101') && f.includes('6611030102'), 'ไม่มีรายชื่อนักศึกษา');
    assert.ok(!f.includes('6611030201'), 'มีนักศึกษาชั้นปีอื่นปนมา');
    assert.ok(!f.includes('พ้นสภาพ แล้ว'), 'มีคนที่ลาออกปนมา');
  });
  t('แบบฟอร์มเติมค่าที่เคยบันทึกไว้มาด้วย จะได้ใช้แก้ของเดิมได้', () => {
    assert.ok(/6611030101,[^\n]*1\.65,69/.test(w.__fileText), 'ไม่ได้เติมค่าเดิม');
  });
  t('แบบฟอร์มผูกภาคและปีการศึกษาไว้ในไฟล์', () => {
    const line = w.__fileText.split('\r\n')[1];
    assert.ok(line.includes(',1,2568,'), 'ไม่ได้ระบุภาค/ปี กรอกกลับมาแล้วจะไม่รู้ว่าของภาคไหน');
  });
  t('ส่งออกข้อมูลพร้อม BMI และการแปลผล ไม่ต้องไปคำนวณเอง', () => {
    w.wbHealthExport();
    const f = w.__fileText;
    assert.ok(f.includes('BMI') && f.includes('แปลผล BMI'), 'ไม่มีคอลัมน์ BMI');
    assert.ok(f.includes('25.34'), 'ไม่ได้คำนวณ BMI');
    assert.ok(f.includes('ผู้บันทึก'), 'ไม่รู้ว่าใครกรอก');
  });
  t('ส่งออกเฉพาะภาคที่เลือก กับส่งออกทั้งหมด ได้ผลต่างกัน', () => {
    w.APP._wbHealth.semester = '2';
    writes.length = 0;
    w.wbHealthExport();
    assert.ok(writes.some(x => x[0] === 'toast' && /ยังไม่มีข้อมูลในภาค/.test(x[1])), 'ไม่ได้กรองตามภาค');
    w.wbHealthExport('all');
    assert.ok(w.__fileText.includes('6611030101'), 'ส่งออกทั้งหมดแล้วยังว่าง');
    w.APP._wbHealth.semester = '1';
  });

  console.log('\n[4.6] อ่านไฟล์ที่กรอกกลับมา');
  function upload(text) {
    return w.wbHealthUpload({ target: { files: [{ text: async () => text }], value: '' } });
  }
  const HEAD = 'รหัสนักศึกษา,ชื่อ-สกุล,ชั้นปี,ภาคการศึกษา,ปีการศึกษา,ส่วนสูง (เมตร),น้ำหนัก (กก.),น้ำตาลในเลือด,ชีพจร,ความดันบน,ความดันล่าง,หมายเหตุ';

  await ta('ไฟล์ที่ไม่มีคอลัมน์รหัสนักศึกษา ต้องปฏิเสธ', async () => {
    writes.length = 0;
    await upload('ชื่อ,น้ำหนัก\nก,50');
    assert.ok(writes.some(x => x[0] === 'toast' && /รหัสนักศึกษา/.test(x[1])), 'ไม่ได้เตือน');
  });
  await ta('อ่านแล้วยังไม่เขียนอะไร แค่สรุปให้ดูก่อน', async () => {
    writes.length = 0;
    // ใช้ 6611030201 เพราะยังไม่มีข้อมูลเดิม ส่วน 6611030102 เป็นของผู้อื่น จะถูกกันไว้
    await upload(HEAD + '\n6611030201,มาลี สุขใจ,2,1,2568,1.58,48,90,70,115,70,\n');
    assert.ok(!writes.some(x => x[0] === 'create' || x[0] === 'update'), 'เขียนทันทีโดยไม่ถาม');
    assert.ok(/ตรวจก่อนนำเข้า/.test(w.__modalTitle), 'ไม่ได้แสดงสรุป');
    assert.ok(w.__modal.includes('wbHealthImportConfirm()'), 'ไม่มีปุ่มยืนยัน');
  });
  await ta('แยกได้ว่าอันไหนเพิ่มใหม่ อันไหนแก้ของเดิม', async () => {
    await upload(HEAD
      + '\n6611030101,กนกพร เดชกล้า,1,1,2568,1.65,70,,,,,'      // มีอยู่แล้ว ของตัวเอง → แก้
      + '\n6611030201,มาลี สุขใจ,2,1,2568,1.58,48,,,,,'          // ยังไม่มี → เพิ่ม
      + '\n');
    const plan = w.APP._wbHealth.importPlan;
    assert.strictEqual(plan.edit.length, 1, 'นับรายการแก้ผิด');
    assert.strictEqual(plan.add.length, 1, 'นับรายการเพิ่มผิด');
  });
  await ta('รหัสที่ไม่มีในทะเบียน ต้องไม่ถูกสร้างเป็นข้อมูลลอย', async () => {
    await upload(HEAD + '\n9999999999,ไม่มีตัวตน,1,1,2568,1.60,55,,,,,\n');
    const plan = w.APP._wbHealth.importPlan;
    assert.strictEqual(plan.add.length + plan.edit.length, 0, 'ยอมรับรหัสที่ไม่มีจริง');
    assert.ok(/ไม่พบรหัสนี้ในทะเบียน/.test(plan.error[0].why), 'เหตุผลไม่ชัด');
  });
  await ta('กรอกส่วนสูงเป็นเซนติเมตรในไฟล์ ก็ต้องจับได้เหมือนกรอกในหน้าจอ', async () => {
    await upload(HEAD + '\n6611030102,ปรีชา ขยัน,1,1,2568,170,60,,,,,\n');
    const plan = w.APP._wbHealth.importPlan;
    assert.strictEqual(plan.add.length, 0, 'ยอมรับค่าที่ผิดหน่วย');
    assert.ok(/เมตร/.test(plan.error[0].why), 'ไม่ได้บอกว่าผิดหน่วย');
  });
  await ta('แถวที่คนอื่นกรอกไว้ ไฟล์เขียนทับไม่ได้', async () => {
    await upload(HEAD + '\n6611030102,ปรีชา ขยัน,1,1,2568,1.75,65,,,,,\n');
    const plan = w.APP._wbHealth.importPlan;
    assert.strictEqual(plan.edit.length, 0, 'ทับข้อมูลของคนอื่นได้');
    assert.ok(/คนอื่น/.test(plan.error[0].why), 'ไม่ได้บอกว่าใครเป็นเจ้าของ');
  });
  await ta('แถวที่เว้นว่างไว้ ให้ข้าม ไม่ใช่ล้างข้อมูลเดิมทิ้ง', async () => {
    await upload(HEAD + '\n6611030101,กนกพร เดชกล้า,1,1,2568,,,,,,,\n');
    const plan = w.APP._wbHealth.importPlan;
    assert.strictEqual(plan.skip.length, 1, 'ไม่ได้ข้าม');
    assert.strictEqual(plan.edit.length, 0, 'เอาค่าว่างไปทับของเดิม');
  });
  await ta('ชื่อหรือหมายเหตุที่มีจุลภาค ต้องไม่ทำให้คอลัมน์เลื่อน', async () => {
    await upload(HEAD + '\n6611030201,"สุขใจ, มาลี",2,1,2568,1.58,48,,,,,"ตรวจซ้ำ, นัดใหม่"\n');
    const plan = w.APP._wbHealth.importPlan;
    assert.strictEqual(plan.add.length, 1, 'อ่านแถวนี้ไม่ได้');
    assert.strictEqual(plan.add[0].d.weight_kg, '48', 'คอลัมน์เลื่อน น้ำหนักกลายเป็น ' + plan.add[0].d.weight_kg);
    assert.strictEqual(plan.add[0].d.note, 'ตรวจซ้ำ, นัดใหม่', 'หมายเหตุเพี้ยน');
  });
  await ta('กดยืนยันแล้วจึงเขียนลงระบบ พร้อมลงชื่อผู้นำเข้า', async () => {
    await upload(HEAD + '\n6611030201,มาลี สุขใจ,2,1,2568,1.58,48,88,78,108,70,\n');
    writes.length = 0;
    await w.wbHealthImportConfirm();
    const made = writes.filter(x => x[0] === 'create');
    assert.strictEqual(made.length, 1, 'ไม่ได้บันทึก');
    assert.strictEqual(made[0][1].recorded_by, 'จนท.บริการวิชาการ', 'ไม่ได้ลงชื่อ');
    assert.strictEqual(made[0][1].semester, '1', 'ภาคการศึกษาไม่ตรงกับในไฟล์');
    assert.ok(writes.some(x => x[0] === 'close'), 'ไม่ได้ปิดหน้าต่างหลังนำเข้า');
  });
  t('ไฟล์ที่ดาวน์โหลดมีเครื่องหมายให้ Excel อ่านภาษาไทยถูก', () => {
    const src = WB.slice(WB.indexOf('function saveFile'), WB.indexOf('function saveFile') + 400);
    assert.ok(src.includes('0xFEFF'), 'ไม่มี BOM ภาษาไทยจะเป็นต่างด้าวใน Excel');
  });

  console.log('\n[5] สิทธิ์ที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม');
  t('เขียนได้เฉพาะผู้ที่ถูกติ๊กสิทธิ์', () => {
    assert.ok(/create policy sh_insert[\s\S]{0,200}ems\.can_enter_health\(\)/.test(POL), 'สุขภาพไม่ได้กันที่ฐานข้อมูล');
    assert.ok(/create policy sc_insert[\s\S]{0,200}ems\.can_enter_conduct\(\)/.test(POL), 'ความประพฤติไม่ได้กันที่ฐานข้อมูล');
  });
  t('แก้และลบได้เฉพาะแถวที่ตนกรอก', () => {
    ['sh_update', 'sh_delete', 'sc_update', 'sc_delete'].forEach(p => {
      const m = POL.match(new RegExp('create policy ' + p + '[^;]*'));
      assert.ok(m, 'ไม่พบนโยบาย ' + p);
      assert.ok(/ems\.owns_record\(recorded_uid\)/.test(m[0]), p + ' ไม่ได้ผูกกับเจ้าของแถว');
    });
  });
  t('เจ้าของแถวดูจากตัวตนที่ปลอมไม่ได้ ไม่ใช่ชื่อที่พิมพ์เอง', () => {
    assert.ok(/recorded_uid/.test(POL), 'ยังใช้ชื่อเป็นตัวชี้เจ้าของ');
    assert.ok(!/owns_record\(recorded_by\)/.test(POL), 'ผูกกับชื่อ ซึ่งผู้ใช้แก้เองได้');
  });
  t('อาจารย์ที่ปรึกษายังอ่านข้อมูลนักศึกษาของตนได้', () => {
    ['sh_read', 'sc_read'].forEach(p => {
      const m = POL.match(new RegExp('create policy ' + p + '[^;]*'));
      assert.ok(m && /ems\.owns_student\(student_id\)/.test(m[0]), p + ' ตัดอาจารย์ที่ปรึกษาออก');
    });
  });

  console.log('\n[6] การต่อเข้าระบบเดิม');
  t('ผู้ดูแลติ๊กสิทธิ์ให้ได้ในหน้าจัดการผู้ใช้', () => {
    assert.ok(APPJS.includes('DATA_ENTRY_RIGHTS'), 'ไม่มีรายการสิทธิ์');
    assert.ok(APPJS.includes("['can_health'"), 'ไม่มีสิทธิ์สุขภาพ');
    assert.ok(APPJS.includes("['can_conduct'"), 'ไม่มีสิทธิ์ความประพฤติ');
    assert.ok(APPJS.includes('dataEntryRightsFieldHTML(u)'), 'ไม่ได้แสดงในหน้าต่างแก้ไข');
    assert.ok(APPJS.includes('dataEntryRightsFieldHTML({})'), 'ไม่ได้แสดงในหน้าต่างเพิ่มผู้ใช้');
  });
  t('ติ๊กแล้วค่าถูกเก็บจริงทั้งตอนเพิ่มและตอนแก้', () => {
    assert.ok(APPJS.includes("Object.assign(rec, collectDataEntryRights('editUserForm'))"), 'แก้แล้วไม่ได้เก็บ');
    assert.ok(APPJS.includes("collectDataEntryRights('addUserForm')"), 'เพิ่มแล้วไม่ได้เก็บ');
  });
  t('นักศึกษาไม่มีช่องสิทธิ์นี้ให้ติ๊ก', () => {
    assert.ok(APPJS.includes("${isStudent ? '' : dataEntryRightsFieldHTML(u)}"), 'ขึ้นให้บัญชีนักศึกษาด้วย');
  });
  t('หน้าตั้งค่าสิทธิ์มีแถวสิทธิ์บันทึกข้อมูลนักศึกษา', () => {
    assert.ok(APPJS.includes('function dataEntryRightsSection()'), 'ไม่มีการ์ดสิทธิ์ในหน้าตั้งค่า');
    assert.ok(APPJS.includes('${dataEntryRightsSection()}'), 'สร้างไว้แต่ไม่ได้เรียกใช้');
    assert.ok(APPJS.includes('async function toggleDataEntryRight'), 'ติ๊กแล้วไม่มีตัวบันทึก');
  });
  t('ติ๊กพลาดแล้วคืนค่าเดิม ไม่ให้หน้าจอกับฐานข้อมูลไม่ตรงกัน', () => {
    const src = APPJS.slice(APPJS.indexOf('async function toggleDataEntryRight'), APPJS.indexOf('async function toggleDataEntryRight') + 1200);
    assert.ok(src.includes('u[field] = before'), 'บันทึกไม่สำเร็จแล้วช่องยังติ๊กค้างอยู่');
  });
  t('ผู้ที่ได้รับสิทธิ์ไว้แล้วต้องไม่หายจากตาราง แม้ไม่ใช่กลุ่มสำนักงาน', () => {
    const src = APPJS.slice(APPJS.indexOf('function dataEntryRightsSection()'), APPJS.indexOf('async function toggleDataEntryRight'));
    assert.ok(/on\(u, 'can_health'\) \|\| on\(u, 'can_conduct'\)/.test(src), 'สิทธิ์ที่ให้อาจารย์ไว้จะกลายเป็นสิทธิ์ค้างที่มองไม่เห็น');
  });

  console.log('\n[7] สิทธิ์ระบบให้คำปรึกษาในหน้าตั้งค่า');
  t('มีแถว "ระบบให้คำปรึกษานักศึกษา" ให้ติ๊กตามบทบาท', () => {
    assert.ok(/const modules = \[[^\]]*'counsel'/.test(APPJS), 'ไม่มี counsel ในรายการโมดูล');
    assert.ok(APPJS.includes("counsel: 'ระบบให้คำปรึกษานักศึกษา'"), 'ไม่มีป้ายชื่อภาษาไทย');
  });
  t('ติ๊กในตารางแล้วบันทึกลงตาราง permission ได้จริง', () => {
    const src = APPJS.slice(APPJS.indexOf('async function togglePermission'), APPJS.indexOf('async function togglePermission') + 900);
    assert.ok(src.includes("type: 'permission'"), 'ไม่ได้เขียนลงตารางสิทธิ์');
    assert.ok(src.includes('buildSidebar()'), 'ติ๊กแล้วเมนูไม่อัปเดตทันที');
  });

  console.log('\n[8] การต่อเข้าระบบเดิม (เพิ่มเติม)');
  t('เมนูวางต่อจากระบบให้คำปรึกษา', () => {
    const m = WB.slice(WB.indexOf('function addMenu()'));
    assert.ok(m.includes("nav.querySelector('[data-counsel-menu]')"), 'ไม่ได้อ้างอิงเมนูให้คำปรึกษา');
    assert.ok(m.includes('nav.insertBefore(node, after.nextSibling)'), 'ไม่ได้วางต่อท้าย');
  });
  t('คนที่มีสิทธิ์ข้อเดียว เมนูไม่ต้องเป็นเมนูย่อย', () => {
    const m = WB.slice(WB.indexOf('function addMenu()'));
    assert.ok(m.includes('if (canHealth()) subs.push'), 'ไม่ได้แยกตามสิทธิ์');
    assert.ok(m.includes('var only = subs[0];'), 'ไม่มีกรณีเมนูเดี่ยว');
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(WB); });

  console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
