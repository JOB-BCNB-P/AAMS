/* สิทธิ์ในเมนูประเมินผลหลักสูตร
   · อาจารย์ผู้ประสานงาน กรอกได้เฉพาะวิชาตน · วิชาที่มีผู้ประสานงานหลายคน ล็อกให้คนแรกที่กรอก
   · ส่งเกรดเข้าหน้าผลการเรียนได้เฉพาะ ผู้ดูแลระบบ · งานทะเบียน · รองฯ ด้านวิชาการ
   · ประธานสาขา ดูรายวิชาในสาขาได้ถึงระดับ CLO และคะแนนรายคน แต่แก้ไม่ได้ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const SRC = fs.readFileSync(P + 'plo.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

function grab(sig) {
  const i = SRC.indexOf(sig);
  assert.ok(i >= 0, 'ไม่พบ ' + sig);
  let d = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  throw new Error('อ่าน ' + sig + ' ไม่จบ');
}

const A = 'อ.สมศรี ใจดี';       // ผู้ประสานงานคนที่ 1 — กรอกก่อน
const B = 'อ.ประเสริฐ มั่นคง';   // ผู้ประสานงานคนที่ 2
const C = 'อ.นอกวิชา ไม่เกี่ยว';

function data(opts) {
  opts = opts || {};
  const clo = (code, by, at, acl) => ({
    __backendId: code, subject_code: 'S1', academic_year: '2568', semester: '1',
    clo_code: code, created_by: by, created_at: at, sort_order: '1',
    course_acl: acl == null ? '' : JSON.stringify(acl)
  });
  return {
    subject: [
      { subject_code: 'S1', subject_name: 'วิชาร่วม', coordinator: A + ', ' + B, department: 'การพยาบาลผู้ใหญ่', academic_year: '2568', semester: '1', year_level: '3' },
      { subject_code: 'S2', subject_name: 'วิชาสาขาอื่น', coordinator: C, department: 'การพยาบาลเด็ก', academic_year: '2568', semester: '1', year_level: '3' }
    ],
    plo_clo: opts.empty ? [] : [clo('CLO1', A, '2026-01-01', opts.acl), clo('CLO2', B, '2026-02-01', opts.acl)],
    user: [{ name: 'อ.รองวิชาการ', role: 'executive', exec_area: 'วิชาการ', is_active: '1' }]
  };
}

function env(role, me, extra) {
  const D = data(extra || {});
  const sb = {
    console, Math, JSON,
    APP: { currentRole: role, _roles: [role], currentUser: Object.assign({ name: me }, (extra || {}).user || {}) },
    getDataByType: ty => D[ty] || [],
    // ลอกกติกาเดียวกับ app.js — norm() ยุบช่องว่างซ้อนให้เหลือช่องเดียวก่อนเทียบ
    subjectHasCoordinator: (su, nm) => {
      const nz = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
      const n = nz(nm);
      if (!n) return false;
      return String(su.coordinator || '').split(/[,\/]/).map(nz).filter(Boolean)
        .some(c => c === n || c.includes(n) || n.includes(c));
    },
    subjectHasDept: (su, d) => String(su.department || '').trim() === String(d || '').trim(),
    currentDept: () => String((sb.APP.currentUser || {}).department || '')
  };
  vm.createContext(sb);
  new vm.Script(`
    function s(v){return String(v==null?'':v).trim();}
    function n(v){var x=parseFloat(v);return isFinite(x)?x:0;}
    function get(t){return getDataByType(t)||[];}
    function cloRef(c){return s(c.clo_code);}
    ${grab('function canEdit()')}
    ${grab('function myRoles()')}
    ${grab('function hasRole(list)')}
    ${grab('function isAllEdit()')}
    ${grab('function isAllView()')}
    ${grab('function meName()')}
    ${grab('function isCoord(subj)')}
    ${grab('function mySubject(subj)')}
    ${grab('function canViewSubject(subj)')}
    ${grab('function canOpenEntry()')}
    ${grab('function cloSubject(c)')}
    ${grab('function cloOwner(c)')}
    ${grab('function aclReset()')}
    ${grab('function nameKeyOf(v)')}
    ${grab('function aclKey(code, year, sem)')}
    ${grab('function subjAcl(code, year, sem)')}
    ${grab('function aclOfClo(c)')}
    ${grab('function canEditSubjectAt(subj, code, year, sem)')}
    ${grab('function canEditClo(c)')}
    ${grab('function myExecArea()')}
    ${grab('function canPushGrade()')}
    var _aclCache = {};
  `).runInContext(sb);
  sb.aclReset();
  sb.S1 = D.subject[0]; sb.S2 = D.subject[1];
  sb.CLOS = D.plo_clo;
  return sb;
}

(function () {
  console.log('[1] กรอกได้เฉพาะรายวิชาที่ตนเป็นผู้ประสานงาน');
  t('ไม่ใช่ผู้ประสานงาน = กรอกไม่ได้', () => {
    const w = env('teacher', C);
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), false);
  });
  t('ยังไม่มีใครกรอก = ผู้ประสานงานทุกคนกรอกได้', () => {
    const w = env('teacher', B, { empty: true });
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), true);
  });

  console.log('\n[2] ผู้ประสานงานหลายคน — คนแรกที่กรอกเป็นเจ้าของ');
  t('เจ้าของ (กรอกก่อน) ยังกรอกได้', () => {
    const w = env('teacher', A);
    assert.strictEqual(w.subjAcl('S1', '2568', '1').owner, A);
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), true);
  });
  t('ผู้ประสานงานอีกคนที่ยังไม่เคยกรอก ถูกล็อก', () => {
    const w = env('teacher', 'อ.คนที่สาม ร่วมสอน');
    w.S1.coordinator = A + ', อ.คนที่สาม ร่วมสอน';
    w.aclReset();
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), false);
  });
  t('คนที่เคยกรอกไว้ก่อนแล้ว ยังแก้ของเดิมได้ (ไม่ล็อกข้อมูลเก่ากะทันหัน)', () => {
    const w = env('teacher', B);
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), true);
  });
  t('เจ้าของเปิดสิทธิ์ให้แล้ว อีกคนกรอกได้', () => {
    const w = env('teacher', 'อ.คนที่สาม ร่วมสอน', { acl: ['อ.คนที่สาม ร่วมสอน'] });
    w.S1.coordinator = A + ', อ.คนที่สาม ร่วมสอน';
    w.aclReset();
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), true);
  });
  t('เทียบชื่อโดยไม่สนช่องว่าง', () => {
    const w = env('teacher', 'อ.คนที่สาม  ร่วมสอน', { acl: ['อ.คนที่สาม ร่วมสอน'] });
    w.S1.coordinator = A + ', อ.คนที่สาม ร่วมสอน';
    w.aclReset();
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), true);
  });
  t('ล็อกระดับรายวิชา ไม่ใช่ราย CLO — CLO ทุกข้อถูกล็อกพร้อมกัน', () => {
    const w = env('teacher', 'อ.คนที่สาม ร่วมสอน');
    w.S1.coordinator = A + ', อ.คนที่สาม ร่วมสอน';
    w.aclReset();
    w.CLOS.forEach(c => assert.strictEqual(w.canEditClo(c), false, c.clo_code + ' ยังแก้ได้'));
  });
  t('ผู้ดูแลระบบและงานวิชาการ ข้ามการล็อกได้', () => {
    ['admin', 'academic'].forEach(r => {
      const w = env(r, 'เจ้าหน้าที่');
      assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), true, r);
    });
  });

  console.log('\n[3] ส่งเกรดเข้าหน้าผลการเรียน');
  t('ผู้ดูแลระบบและงานทะเบียน ส่งได้', () => {
    ['admin', 'registrar'].forEach(r => assert.strictEqual(env(r, 'x').canPushGrade(), true, r));
  });
  t('รองผู้อำนวยการด้านวิชาการ ส่งได้', () => {
    const w = env('executive', 'อ.รองวิชาการ', { user: { exec_area: 'วิชาการ' } });
    assert.strictEqual(w.canPushGrade(), true);
  });
  t('รองผู้อำนวยการด้านอื่น ส่งไม่ได้', () => {
    const w = env('executive', 'อ.รองกิจการ', { user: { exec_area: 'กิจการนักศึกษา' } });
    assert.strictEqual(w.canPushGrade(), false);
  });
  t('อาจารย์ · ประธานสาขา · งานวิชาการ ส่งไม่ได้', () => {
    ['teacher', 'classTeacher', 'deptHead', 'academic'].forEach(r =>
      assert.strictEqual(env(r, A).canPushGrade(), false, r + ' ยังส่งเกรดได้'));
  });
  t('ปุ่มและฟังก์ชันใช้ด่านเดียวกัน', () => {
    assert.ok(/\(canPushGrade\(\)\s*\n?\s*\?\s*'<button type="button" onclick="ploGradePush\(\)/.test(SRC)
      || SRC.replace(/\s+/g, ' ').includes('(canPushGrade() ? \'<button type="button" onclick="ploGradePush()'), 'ปุ่มยังใช้ canEdit');
    const g = grab('window.ploGradePush = async function ()');
    assert.ok(g.includes('if (!canPushGrade())'), 'ฟังก์ชันส่งเกรดไม่ได้ตรวจสิทธิ์ใหม่');
  });

  console.log('\n[4] ประธานสาขา');
  t('เห็นรายวิชาในสาขาตน', () => {
    const w = env('deptHead', 'อ.ประธาน', { user: { department: 'การพยาบาลผู้ใหญ่' } });
    assert.strictEqual(w.canViewSubject(w.S1), true);
  });
  t('ไม่เห็นรายวิชาสาขาอื่น', () => {
    const w = env('deptHead', 'อ.ประธาน', { user: { department: 'การพยาบาลผู้ใหญ่' } });
    assert.strictEqual(w.canViewSubject(w.S2), false);
  });
  t('เข้าหน้าบันทึกข้อมูลได้เพื่อดู แต่กรอกไม่ได้', () => {
    const w = env('deptHead', 'อ.ประธาน', { user: { department: 'การพยาบาลผู้ใหญ่' } });
    assert.strictEqual(w.canOpenEntry(), true, 'เข้าไม่ได้');
    assert.strictEqual(w.canEdit(), false, 'กลับกรอกได้');
    assert.strictEqual(w.canEditSubjectAt(w.S1, 'S1', '2568', '1'), false, 'กรอกได้');
    w.CLOS.forEach(c => assert.strictEqual(w.canEditClo(c), false, 'แก้ CLO ได้'));
  });
  t('อาจารย์เห็นเฉพาะวิชาตน ไม่เห็นวิชาอื่นแม้อยู่สาขาเดียวกัน', () => {
    const w = env('teacher', A);
    assert.strictEqual(w.canViewSubject(w.S1), true);
    assert.strictEqual(w.canViewSubject(w.S2), false);
  });

  console.log('\n[5] ผูกเข้ากับหน้าจอจริง');
  t('รายวิชาในหน้าบันทึกข้อมูลใช้สิทธิ์ "ดู" ไม่ใช่ "แก้"', () => {
    const g = grab('function subjectsOf(');
    assert.ok(g.includes('canViewSubject(x)'), 'ยังกรองด้วย mySubject');
  });
  t('ปุ่มนำเข้าไฟล์และฟอร์มเพิ่ม CLO ซ่อนเมื่อกรอกไม่ได้', () => {
    assert.ok(SRC.includes("canEdit() ? step(6,"), 'ขั้นนำเข้าไฟล์ยังโผล่ให้คนที่กรอกไม่ได้');
    assert.ok(SRC.includes('var form = !mayEdit ? roBanner(subj)'), 'ฟอร์มเพิ่ม CLO ยังโผล่');
  });
  t('ทางเขียนทุกทางมีด่านตรวจ', () => {
    assert.ok(grab('window.ploAddClo = async function (wholeYear)').includes('canEditSubjectAt'), 'เพิ่ม CLO ไม่ได้ตรวจ');
    assert.ok(grab('window.ploCfgSave = async function ()').includes('canEditSubjectAt'), 'ตั้งค่ารายวิชาไม่ได้ตรวจ');
    assert.ok(grab('window.ploCsvApply = async function ()').includes('canEditSubjectAt'), 'นำเข้าไฟล์ไม่ได้ตรวจ');
    assert.ok(grab('window.ploCompClear = async function ()').includes('canEditClo'), 'ยกเลิกองค์ประกอบไม่ได้ตรวจ');
  });
  t('เปิด/ปิดสิทธิ์ได้เฉพาะเจ้าของรายวิชา', () => {
    const g = grab('window.ploAclToggle = async function (nm)');
    assert.ok(g.includes('เปิดสิทธิ์ได้เฉพาะเจ้าของรายวิชา'), 'ใครก็กดเปิดสิทธิ์ได้');
    assert.ok(g.includes('course_acl'), 'ไม่ได้บันทึกรายชื่อที่เปิดสิทธิ์');
  });
  t('ค่าเดิมในเบราว์เซอร์ไม่ทับสิทธิ์ที่เพิ่งเปลี่ยน', () =>
    assert.ok(grab('function noScores(rec)').includes("k !== 'course_acl'"), 'course_acl ถูกส่งกลับไปทับได้'));
  t('ล้างแคชสิทธิ์ทุกรอบการวาดหน้า', () =>
    assert.ok(/window\.ploPage = function ploPage\(\) \{\s*\n\s*aclReset\(\);/.test(SRC), 'แคชค้าง สิทธิ์ที่เพิ่งเปลี่ยนจะไม่มีผล'));
  t('โหมดดูแทนผู้ใช้ ต้องไม่หยิบด้านของผู้ดูแลระบบมาใช้', () => {
    const g = grab('function myExecArea()');
    assert.ok(g.includes('window.__emsProfile'), 'ยังอ่านโปรไฟล์ตัวจริงก่อน');
    assert.ok(/pr\.viewAs\) return ''/.test(g), 'ดูแทนคนที่ไม่มีด้าน แล้วยังตกไปใช้ค่าของผู้ดูแล');
    const code = g.replace(/\/\*[\s\S]*?\*\//g, '');   // ตัดคำอธิบายออก เทียบเฉพาะโค้ดจริง
    const i = code.indexOf('window.__emsProfile'), j = code.indexOf('GSheetDB.profile()');
    assert.ok(i >= 0 && (j < 0 || i < j), 'ลำดับการอ่านผิด');
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(SRC); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
