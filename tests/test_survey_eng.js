/* แบบประเมินความพึงพอใจ เปิดเฉพาะชั้นปี · การ์ด GPAx ไม่ยุบสำหรับอาจารย์ · ตารางผลสอบภาษาอังกฤษสำหรับอาจารย์ */
const fs = require('fs');
const assert = require('assert');
const P = require('path').join(__dirname, '..') + require('path').sep;
const SRC = fs.readFileSync(P + 'app.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(from, to) {
  const i = SRC.indexOf(from); assert.ok(i >= 0, 'ไม่พบ ' + from);
  const j = SRC.indexOf(to, i + from.length); assert.ok(j > i, 'ไม่พบจุดจบ ' + to);
  return SRC.slice(i, j);
}
const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
const htmlEsc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- สภาพแวดล้อมจำลอง ----------
let CFGS = [], STUDENTS = [], ENG = [], GRADES = [], MODAL = null;
const APP = { currentRole: 'student', currentUser: null, filters: {}, _openCards: {} };
function getDataByType(tp) {
  return ({ survey_config: CFGS, student: STUDENTS, eng_result: ENG, grade: GRADES })[tp] || [];
}
function surveyConfigs() { return CFGS; }
function surveyConfigForYear(y) { return CFGS.find(c => norm(c.academic_year) === norm(y)) || null; }
function surveyParseRoles(v) { return String(v || '').split(',').map(x => x.trim()).filter(Boolean); }
function parseDate(v) {
  const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null; let y = +m[3]; if (y > 2400) y -= 543;
  return new Date(y, +m[2] - 1, +m[1]);
}
function formatDate(v) { return String(v || ''); }
function getEngLevel(s) { return s >= 70 ? 'B1' : 'A2'; }
function studentDisplayName(s) { return s.name; }
function showModal(title, body) { MODAL = { title, body }; }
const window = {};
eval(grab('function surveyIsOpenForRole', 'function surveyAllYears'));
eval(grab('function engSortKey', 'function engLatestPbriLevelMap'));

const asStudent = yr => { APP.currentRole = 'student'; APP.currentUser = { role: 'student', data: { student_id: 'S' + yr, year_level: yr } }; };

console.log('[1] แบบประเมินความพึงพอใจ เปิดเฉพาะชั้นปีที่เลือก');
t('ติ๊กชั้นปี 2,3,4 → ชั้นปี 1 ไม่เห็น ชั้นปี 2 เห็น', () => {
  CFGS = [{ academic_year: '2568', status: 'open', open_roles: 'teacher,student', open_years: '2,3,4' }];
  asStudent('1'); assert.strictEqual(surveyIsOpenForRole('2568', 'student'), false, 'ชั้นปี 1 ยังเห็นแบบประเมิน');
  asStudent('2'); assert.strictEqual(surveyIsOpenForRole('2568', 'student'), true);
  asStudent('4'); assert.strictEqual(surveyIsOpenForRole('2568', 'student'), true);
});
t('ช่องชั้นปีว่าง = ทุกชั้นปี (ข้อมูลเดิมยังทำงานเหมือนเดิม)', () => {
  CFGS = [{ academic_year: '2568', status: 'open', open_roles: 'student', open_years: '' }];
  asStudent('1'); assert.strictEqual(surveyIsOpenForRole('2568', 'student'), true);
});
t('ตัวกรองชั้นปีไม่กระทบบทบาทอื่น', () => {
  CFGS = [{ academic_year: '2568', status: 'open', open_roles: 'teacher,student', open_years: '3' }];
  APP.currentUser = { role: 'teacher', data: {} };
  assert.strictEqual(surveyIsOpenForRole('2568', 'teacher'), true);
  assert.strictEqual(surveyIsOpenForRole('2568', 'registrar'), false);
});
t('ปิดรับอยู่ → ไม่มีใครเห็น', () => {
  CFGS = [{ academic_year: '2568', status: 'closed', open_roles: '', open_years: '' }];
  asStudent('2'); assert.strictEqual(surveyIsOpenForRole('2568', 'student'), false);
});
t('หน้าตั้งค่ามีช่องติ๊กชั้นปี และบันทึกลง open_years', () => {
  const seg = grab('function surveyConfigTabHTML', 'function surveyToggleAllRoles');
  assert.ok(seg.includes('survey-open-year'), 'ไม่มีช่องติ๊กชั้นปี');
  const save = grab('async function surveySaveOpenRoles', '// ======================== ส่งอีเมลเชิญ');
  assert.ok(save.includes('open_years: openYearsStr'), 'ไม่ได้บันทึก open_years');
});
t('อีเมลเชิญจำกัดเฉพาะชั้นปีที่เปิดรับ', () => {
  const seg = grab('async function showSurveyInviteModal', 'async function surveyInviteRefresh');
  assert.ok(seg.includes('yrList.map'), 'ตัวเลือกชั้นปีในอีเมลไม่ได้จำกัดตามชั้นปีที่เปิดรับ');
});

console.log('\n[2] การ์ดภาพรวมผลการเรียน (อาจารย์) ไม่ต้องยุบ-ขยาย');
t('อาจารย์และอาจารย์ประจำชั้นได้การ์ดแบบเปิดตายตัว บทบาทอื่นยังพับได้', () => {
  const seg = grab('function gpaxByStudentCardHTML', 'function gradeOverviewCardsHTML');
  assert.ok(/fixedOpen = \['teacher', 'classTeacher'\]/.test(seg));
  assert.ok(seg.includes("${fixedOpen ? '</div>' : '</details>'}"), 'ปิดแท็กไม่ตรงกัน');
});

console.log('\n[3] ตารางผลสอบภาษาอังกฤษในการ์ดสรุป (อาจารย์)');
STUDENTS = [
  { student_id: '6701', name: 'ก ไก่', year_level: '2', room: 'A' },
  { student_id: '6702', name: 'ข ไข่', year_level: '2', room: 'B' },
  { student_id: '6703', name: 'ค ควาย', year_level: '2', room: 'A' }
];
ENG = [
  { student_id: '6701', eng_type: 'สบช.', eng_score: '55', eng_attempt: '1', eng_date: '10/01/2568', eng_status: 'ไม่ผ่าน', academic_year: '2567' },
  { student_id: '6701', eng_type: 'สบช.', eng_score: '72', eng_attempt: '2', eng_date: '15/06/2568', eng_status: 'ผ่าน', academic_year: '2568' },
  { student_id: '6702', eng_type: 'TOEIC', eng_score: '400', eng_attempt: '1', eng_date: '01/02/2568', eng_status: 'ไม่ผ่าน', academic_year: '2567' }
];
const sc = { students: STUDENTS, allEng: ENG, passedIds: new Set(['6701']) };
const html = engStudentTableHTML(sc);
t('มีคอลัมน์ครบตามที่ขอ', () => {
  ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-สกุล', 'ชั้นปี', 'ผลสอบครั้งล่าสุด', 'ผลสอบภาษาอังกฤษ']
    .forEach(c => assert.ok(html.includes('>' + c + '</th>'), 'ขาดคอลัมน์ ' + c));
});
t('ครั้งล่าสุดเลือกจากวันที่สอบ (72 คะแนน ไม่ใช่ 55)', () => {
  const row = html.split('6701')[1].split('</tr>')[0];
  assert.ok(row.includes('72 คะแนน'), 'ไม่ได้แสดงผลครั้งล่าสุด');
  assert.ok(!row.includes('55 คะแนน'));
});
t('มีปุ่มดูผลสอบเฉพาะคนที่มีผล', () => {
  assert.ok(html.includes("showStudentEngSheet('6701')"));
  assert.ok(html.includes("showStudentEngSheet('6702')"));
  assert.ok(!html.includes("showStudentEngSheet('6703')"), 'คนที่ไม่มีผลไม่ควรมีปุ่ม');
});
t('หน้าต่างผลสอบแสดงทุกครั้ง เรียงล่าสุดก่อน และสรุปว่าผ่านแล้ว', () => {
  showStudentEngSheet('6701');
  assert.ok(MODAL && MODAL.body.includes('สอบผ่านแล้ว'));
  assert.ok(MODAL.body.indexOf('>72<') < MODAL.body.indexOf('>55<'), 'ไม่ได้เรียงจากล่าสุด');
  assert.ok(MODAL.body.includes('เข้าสอบทั้งหมด 2 ครั้ง'));
});
t('การ์ดสรุปผลสอบเปิดตายตัวและแสดงตารางเฉพาะอาจารย์/อาจารย์ประจำชั้น', () => {
  const seg = grab('function engResultsPage', '// ---- Eng helpers ----');
  assert.ok(seg.includes("engFixed = ['teacher', 'classTeacher']"));
  assert.ok(seg.includes("${engFixed ? engStudentTableHTML(_sc) : ''}"));
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
