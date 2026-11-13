/* ประเมินผลหลักสูตร PLOs — แท็บ "ผลการบรรลุรวม / ผลการบรรลุรายบุคคล"
   และลำดับการเลือกใหม่ : รายวิชา → ชั้นปี → นักศึกษา พร้อมใยแมงมุมรายคน */
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
  let d = 0, j = SRC.indexOf('{', i + sig.length);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  throw new Error('อ่าน ' + sig + ' ไม่จบ');
}

const SUBJECTS = [
  { subject_code: 'S1', subject_name: 'การพยาบาลผู้ใหญ่ 1', academic_year: '2569', semester: '1', year_level: '2' },
  { subject_code: 'S2', subject_name: 'การพยาบาลเด็ก', academic_year: '2569', semester: '2', year_level: '3' },
  { subject_code: 'S3', subject_name: 'ภาคฤดูร้อน', academic_year: '2569', semester: 'ฤดูร้อน', year_level: '3' },
  { subject_code: 'S9', subject_name: 'ปีก่อน', academic_year: '2568', semester: '1', year_level: '2' }
];
const STUDENTS = [
  { student_id: '6911030101', name: 'กนกพร เดชกล้า', year_level: '1', status: 'กำลังศึกษา' },
  { student_id: '6811030102', name: 'ปรีชา ขยัน', year_level: '2', status: 'กำลังศึกษา' },
  { student_id: '6811030103', name: 'มาลี สุขใจ', year_level: '2', status: 'กำลังศึกษา' },
  { student_id: '6611030104', name: 'พักการเรียน', year_level: '2', status: 'พักการศึกษา' }
];

function box(st) {
  const sb = {
    console, Math, JSON, Object, Array, String,
    APP: { _plo: Object.assign({ curriculum: '2565', stuYear: '2569', stuSem: '1', stuLevel: '', stuSubj: '', stuQuery: '', stuResult: null }, st || {}), currentRole: 'admin', _roles: ['admin'] },
    getDataByType: ty => (ty === 'subject' ? SUBJECTS : ty === 'student' ? STUDENTS : ty === 'curriculum_plo' ? PLOS : []),
    isActiveStudent: x => String(x.status) === 'กำลังศึกษา',
    htmlEsc: v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    canViewSubject: () => true,
    renderCurrentPage: () => { }
  };
  vm.createContext(sb);
  new vm.Script(`
    function s(v){return String(v==null?'':v).trim();}
    function n(v){var x=parseFloat(v);return isFinite(x)?x:0;}
    function esc(v){return htmlEsc(v);}
    function get(t){return getDataByType(t)||[];}
    function state(){return APP._plo;}
    ${grab('function sumView()')}
    ${grab('function personSubjects()')}
    ${grab('function normSemKey(v)')}
    ${grab('function personStudents()')}
    ${grab('function personStuText(x)')}
    ${grab('function radarAxes(cur)')}
    ${grab('function toParentPlo(code, axes)')}
  `).runInContext(sb);
  return sb;
}
const PLOS = [1, 2, 3].map(i => ({ curriculum_year: '2565', plo_code: 'PLO' + i, plo_no: String(i), sort_order: String(i), statement_th: 'ข้อ ' + i }));

(function () {
  console.log('[1] แท็บสองมุมมอง');
  t('ชื่อแท็บตรงตามที่กำหนด และไม่เหลือ "สรุปผลรวม/ไปที่บันทึกข้อมูล" เป็นแท็บ', () => {
    const g = grab('window.ploPage = function ploPage()');
    assert.ok(g.includes("'ผลการบรรลุรวม'"), 'ไม่มีแท็บผลการบรรลุรวม');
    assert.ok(g.includes("'ผลการบรรลุรายบุคคล'"), 'ไม่มีแท็บผลการบรรลุรายบุคคล');
    assert.ok(!g.includes("'สรุปผลรวม'"), 'ยังเหลือแท็บเดิม');
    assert.ok(!g.includes('ไปที่บันทึกข้อมูล'), 'ยังมีลิงก์ไปบันทึกข้อมูล ทั้งที่อยู่ในเมนูย่อยแล้ว');
  });
  t('สลับแท็บแล้วจำค่าไว้', () => {
    const w = box();
    assert.strictEqual(w.sumView(), 'all', 'ค่าเริ่มต้นต้องเป็นภาพรวม');
    w.APP._plo.sumView = 'person';
    assert.strictEqual(w.sumView(), 'person');
    w.APP._plo.sumView = 'อะไรก็ไม่รู้';
    assert.strictEqual(w.sumView(), 'all', 'ค่าแปลก ๆ ต้องตกกลับเป็นภาพรวม');
  });
  t('หน้าบันทึกข้อมูลยังเข้าได้ แต่ไม่โชว์แท็บสองอันนี้', () => {
    const g = grab('window.ploPage = function ploPage()');
    assert.ok(g.includes('isEntry') && /navigateTo\(\\'ploSummary\\'\)/.test(g), 'กลับจากหน้าบันทึกข้อมูลไม่ได้');
  });
  t('กล่องรายบุคคลออกจากหน้าภาพรวมแล้ว ไม่แสดงซ้ำสองที่', () => {
    const g = grab('function summaryTab()');
    assert.ok(!g.includes('studentBox()'), 'ยังแปะอยู่ท้ายหน้าภาพรวม');
  });

  console.log('\n[2] เลือกรายวิชาก่อน');
  t('รายวิชามาจากตารางรายวิชา ไม่ต้องค้นหานักศึกษาก่อน', () => {
    const w = box({ stuYear: '2569', stuSem: '1' });
    const o = w.personSubjects();
    assert.strictEqual(o.length, 1, 'ควรได้เฉพาะวิชาปี 2569 ภาค 1');
    assert.strictEqual(o[0][0], 'S1');
    assert.ok(o[0][1].includes('การพยาบาลผู้ใหญ่ 1'));
  });
  t('ภาคฤดูร้อนเทียบได้ทั้ง "3" และ "ฤดูร้อน"', () => {
    const w = box({ stuYear: '2569', stuSem: '3' });
    const o = w.personSubjects();
    assert.strictEqual(o.length, 1);
    assert.strictEqual(o[0][0], 'S3');
  });
  t('ไม่เลือกปี/ภาค = เห็นทุกรายวิชาที่มีสิทธิ์ดู', () => {
    const w = box({ stuYear: '', stuSem: '' });
    assert.strictEqual(w.personSubjects().length, 4);
  });
  t('กรองตามสิทธิ์การดูรายวิชา', () => {
    const w = box({ stuYear: '', stuSem: '' });
    w.canViewSubject = su => su.subject_code === 'S2';
    assert.strictEqual(w.personSubjects().length, 1);
  });

  console.log('\n[3] กรองชั้นปี แล้วเลือกจากรายชื่อ');
  t('ไม่เลือกชั้นปี = ทุกคนที่กำลังศึกษา', () => {
    const w = box();
    const r = w.personStudents();
    assert.strictEqual(r.length, 3, 'ต้องตัดคนที่พักการศึกษาออก');
  });
  t('เลือกชั้นปีแล้วเหลือเฉพาะชั้นปีนั้น', () => {
    const w = box({ stuLevel: '2' });
    const r = w.personStudents();
    assert.strictEqual(r.length, 2);
    assert.ok(r.every(x => x.year_level === '2'));
  });
  t('เรียงตามรหัสนักศึกษา', () => {
    const w = box({ stuLevel: '2' });
    const r = w.personStudents();
    assert.ok(r[0].student_id < r[1].student_id, 'ไม่ได้เรียง');
  });
  t('ข้อความในรายการขึ้นต้นด้วยรหัส เพื่อตัดกลับเป็นรหัสได้', () => {
    const w = box();
    const txt = w.personStuText(STUDENTS[0]);
    assert.ok(txt.indexOf('6911030101') === 0, 'ไม่ได้ขึ้นต้นด้วยรหัส');
    assert.ok(txt.includes('กนกพร') && txt.includes('ชั้นปี 1'));
  });
  t('เลือกจากรายการแล้วระบบตัดเอาเฉพาะรหัสไปค้นหา', () => {
    const g = grab('window.ploFindStudent = async function (q)');
    assert.ok(g.includes("q.split('·')[0]"), 'ส่งข้อความทั้งก้อนไปค้นหา จะหาไม่เจอ');
  });
  t('เปลี่ยนชั้นปีแล้ววาดรายชื่อใหม่ ไม่ยิงค้นหาซ้ำ', () => {
    const g = grab('window.ploStuSet = function (k, v)');
    assert.ok(g.includes("k === 'stuLevel'"), 'ไม่ได้รองรับตัวกรองชั้นปี');
  });

  console.log('\n[4] ใยแมงมุมรายคน');
  const pr = grab('function personRadar(rows)');
  t('คิดเป็นร้อยละของ CLO ที่ผ่านในแต่ละ PLO', () => {
    assert.ok(pr.includes('g.pass / g.tot * 10000'), 'ไม่ได้คิดเป็นร้อยละ');
    assert.ok(pr.includes('radarSvg(axes, series, 100)'), 'ไม่ได้ตรึงสเกล 0–100');
  });
  t('รวม Sub-PLO เข้า PLO หลัก', () =>
    assert.ok(pr.includes('toParentPlo'), 'CLO ที่ผูกกับ 1.1 จะตกหล่นจากแกน PLO 1'));
  t('บอกด้วยว่า PLO ไหนยังไม่มีผลการประเมิน', () =>
    assert.ok(pr.includes('ยังไม่มีผลการประเมินใน'), 'แกนที่เป็นศูนย์จะอ่านว่า "ไม่ผ่าน" ทั้งที่ยังไม่มีข้อมูล'));
  t('ไม่มีข้อมูลเลยก็ไม่วาดกราฟเปล่า', () => {
    assert.ok(/if \(!covered\) return '';/.test(pr), 'วาดกราฟว่างเปล่า');
    assert.ok(/if \(!axes\.length \|\| !rows\.length\) return '';/.test(pr), 'ไม่ได้กันกรณีไม่มีแถว');
  });
  t('ใยแมงมุมอยู่ในผลรายบุคคลจริง', () => {
    const g = grab('function studentBox(standalone)');
    assert.ok(g.includes('personRadar(rows)'), 'ไม่ได้เรียกใช้');
    assert.ok(g.indexOf('personRadar(rows)') > g.indexOf('cards'), 'ควรอยู่ใต้การ์ดสรุป');
  });

  console.log('\n[5] ลำดับขั้นบนหน้าจอ');
  t('เลขขั้นเรียง ปี → ภาค → รายวิชา → ชั้นปี → นักศึกษา', () => {
    const g = grab('function studentBox(standalone)');
    const seq = ["'stuYear'", "'stuSem'", "step(3, 'รายวิชา'", "step(4, 'ชั้นปี'", "step(5, 'นักศึกษา'"];
    let at = -1;
    seq.forEach(x => { const i = g.indexOf(x); assert.ok(i > at, 'ลำดับผิดที่ ' + x); at = i; });
    assert.ok(/sel\('ปีการศึกษา', 'stuYear',[\s\S]*?'ทุกปี', 1\)/.test(g), 'ปีการศึกษาไม่ใช่ขั้นที่ 1');
    assert.ok(/sel\('ภาคการศึกษา', 'stuSem',[\s\S]*?'ทุกภาค', 2\)/.test(g), 'ภาคการศึกษาไม่ใช่ขั้นที่ 2');
  });
  t('แท็บผลการบรรลุรวมก็มีเลขขั้นชุดเดียวกัน', () => {
    const g = grab('function filterBar()');
    assert.ok(g.includes('stepLabel'), 'ไม่ได้ใช้ป้ายเลขขั้นชุดเดียวกัน');
    assert.ok(/'หลักสูตร', 'curriculum',[\s\S]*?, '', 1\)/.test(g), 'หลักสูตรไม่ใช่ขั้นที่ 1');
    assert.ok(/'ปีการศึกษา', 'year',[\s\S]*?'ทุกปี', 2\)/.test(g), 'ปีการศึกษาไม่ใช่ขั้นที่ 2');
    assert.ok(/'ภาคการศึกษา', 'sem',[\s\S]*?'ทุกภาค', 3\)/.test(g), 'ภาคการศึกษาไม่ใช่ขั้นที่ 3');
    assert.ok(grab('function summarySubjSelect()').includes("stepLabel(4, 'รายวิชา')"), 'รายวิชาไม่ใช่ขั้นที่ 4');
  });
  t('ช่องที่ไม่บังคับไม่ใส่เลข จะได้ไม่เข้าใจผิดว่าต้องเลือก', () => {
    const g = grab('function filterBar()');
    assert.ok(/'รุ่นนักศึกษา'[\s\S]*?'ทุกรุ่น', 0, '\(ไม่บังคับ\)'\)/.test(g), 'รุ่นนักศึกษายังถูกนับเป็นขั้น');
    assert.ok(g.indexOf("'รุ่นนักศึกษา'") > g.indexOf('summarySubjSelect()'), 'ควรอยู่ท้ายสุด ไม่แทรกกลางเลขขั้น');
  });
  t('ป้ายเลขขั้นใช้ฟังก์ชันเดียว ไม่เขียนซ้ำสองที่', () => {
    const g = grab('function stepLabel(no, label, note)');
    assert.ok(g.includes('no ?'), 'ไม่รองรับช่องที่ไม่มีเลข');
    assert.ok((SRC.match(/stepLabel\(/g) || []).length >= 4, 'ยังมีที่เขียนป้ายเองอยู่');
  });
  t('ไม่บังคับให้ค้นหานักศึกษาก่อนจึงจะเลือกรายวิชาได้', () => {
    const g = grab('function studentBox(standalone)');
    assert.ok(!g.includes('ค้นหานักศึกษาก่อน'), 'ยังล็อกช่องรายวิชาไว้');
    assert.ok(!/disabled title="เลือกปีการศึกษาและภาคการศึกษาก่อน"[\s\S]{0,400}stuSubj/.test(g), 'ช่องรายวิชายังถูกปิด');
  });
  t('ลบช่องค้นหาแบบเดิมที่ไม่ได้ใช้แล้ว', () =>
    assert.ok(!SRC.includes('studentDatalist'), 'ยังมีโค้ดเดิมค้างอยู่'));
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(SRC); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
