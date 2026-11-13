/* ผลการบรรลุรายบุคคล — ตารางนักศึกษาที่ควรกำกับติดตาม */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const SRC = fs.readFileSync(P + 'plo.js', 'utf8');
const TW = fs.readFileSync(P + 'tailwind.css', 'utf8');
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

const PLOS = [1, 2, 3].map(i => ({ curriculum_year: '2565', plo_code: 'PLO' + i, plo_no: String(i), sort_order: String(i) }));
// 2 CLO ต่อ PLO · PLO1 มี Sub-PLO เพื่อทดสอบการรวมขึ้น PLO หลัก
const CLOS = [
  { id: 1, curriculum_year: '2565', academic_year: '2569', semester: '1', subject_code: 'S1', plo_code: '1.1', clo_code: 'CLO1', pass_score: '60' },
  { id: 2, curriculum_year: '2565', academic_year: '2569', semester: '1', subject_code: 'S1', plo_code: '1.2', clo_code: 'CLO2', pass_score: '60' },
  { id: 3, curriculum_year: '2565', academic_year: '2569', semester: '1', subject_code: 'S1', plo_code: 'PLO2', clo_code: 'CLO3', pass_score: '60' },
  { id: 4, curriculum_year: '2565', academic_year: '2569', semester: '1', subject_code: 'S1', plo_code: 'PLO2', clo_code: 'CLO4', pass_score: '60' },
  { id: 5, curriculum_year: '2565', academic_year: '2569', semester: '1', subject_code: 'S2', plo_code: 'PLO3', clo_code: 'CLO5', pass_score: '60' },
  { id: 6, curriculum_year: '2565', academic_year: '2568', semester: '1', subject_code: 'S1', plo_code: 'PLO3', clo_code: 'CLOเก่า', pass_score: '60' },
  { id: 7, curriculum_year: '2565', academic_year: '2569', semester: '1', subject_code: 'S1', plo_code: 'PLO3', clo_code: 'CLOไม่มีเกณฑ์', pass_score: '' }
];
const SUBJ = [
  { subject_code: 'S1', subject_name: 'วิชาหนึ่ง', academic_year: '2569', semester: '1' },
  { subject_code: 'S2', subject_name: 'วิชาสอง', academic_year: '2569', semester: '1' }
];
const STU = [
  { student_id: 'A1', name: 'อ่อนมาก', year_level: '2', status: 'กำลังศึกษา' },
  { student_id: 'A2', name: 'ปานกลาง', year_level: '2', status: 'กำลังศึกษา' },
  { student_id: 'A3', name: 'ดี', year_level: '3', status: 'กำลังศึกษา' },
  { student_id: 'A4', name: 'พักการเรียน', year_level: '2', status: 'พักการศึกษา' }
];
// A1 ตก 4/5 · A2 ผ่าน 3/5 · A3 ผ่าน 5/5 · A4 ตกหมด (แต่พักการเรียน ต้องไม่ขึ้น)
const RAW = [];
const put = (sid, map) => Object.keys(map).forEach(k => RAW.push({ clo_id: Number(k), student_id: sid, score: map[k] }));
put('A1', { 1: '20', 2: '30', 3: '70', 4: '10', 5: '40', 7: '99' });
put('A2', { 1: '80', 2: '85', 3: '20', 4: '30', 5: '90' });
put('A3', { 1: '90', 2: '90', 3: '90', 4: '90', 5: '90' });
put('A4', { 1: '10', 2: '10', 3: '10', 4: '10', 5: '10' });
RAW.push({ clo_id: 6, student_id: 'A1', score: '10' });       // ปีการศึกษาอื่น ต้องไม่ถูกนับ
RAW.push({ clo_id: 1, student_id: 'A9', score: '' });          // ยังไม่กรอกคะแนน

function box(st, canView) {
  const sb = {
    console, Math, JSON, Object, Array, String,
    APP: { _plo: Object.assign({ curriculum: '2565', stuYear: '2569', stuSem: '1', stuLevel: '', stuSubj: '', stuWatchPct: 60 }, st || {}) },
    getDataByType: ty => (ty === 'plo_clo' ? CLOS : ty === 'student' ? STU : ty === 'curriculum_plo' ? PLOS : ty === 'subject' ? SUBJ : []),
    isActiveStudent: x => String(x.status) === 'กำลังศึกษา',
    htmlEsc: v => String(v == null ? '' : v),
    canViewSubject: canView || (() => true)
  };
  vm.createContext(sb);
  new vm.Script(`
    function s(v){return String(v==null?'':v).trim();}
    function n(v){var x=parseFloat(v);return isFinite(x)?x:0;}
    function get(t){return getDataByType(t)||[];}
    function state(){return APP._plo;}
    function cloNum(x){return x.id;}
    ${grab('function ploNo(code)')}
    ${grab('function radarAxes(cur)')}
    ${grab('function toParentPlo(code, axes)')}
    ${grab('function normSemKey(v)')}
    ${grab('function normSec(v)')}
    ${grab('function secOf(c)')}
    ${SRC.match(/var DEF_GRADES = \[[\s\S]*?\];/)[0]}
    ${SRC.match(/var DEF_CFG = \{[\s\S]*?\};/)[0]}
    ${grab('function courseCfg(clos)')}
    ${grab('function secMultOf(cfg, sec)')}
    ${grab('function secWeightOf(code, year, sem, sec)')}
    var _secWCache = {};
    ${SRC.match(/var WATCH_LEVELS = \[[\s\S]*?\];/)[0]}
    ${grab('function watchLevel(pct)')}
    ${grab('function watchCut()')}
    ${grab('function watchClos()')}
    ${grab('function watchRows(raw, clos)')}
  `).runInContext(sb);
  return sb;
}
const rowsOf = (w) => w.watchRows(RAW, w.watchClos());
const find = (rs, sid) => rs.filter(x => x.sid === sid)[0];

(function () {
  console.log('[1] ขอบเขตข้อมูลที่นำมาคิด');
  t('นับเฉพาะ CLO ในปี/ภาคที่เลือก', () => {
    const w = box();
    const ids = w.watchClos().map(c => c.id);
    assert.ok(ids.indexOf(6) < 0, 'เอา CLO ของปีการศึกษาอื่นมาคิดด้วย');
  });
  t('เลือกรายวิชาแล้วคิดเฉพาะวิชานั้น', () => {
    const w = box({ stuSubj: 'S2' });
    assert.deepStrictEqual(w.watchClos().map(c => c.id).join(','), '5');
  });
  t('กรองตามสิทธิ์ดูรายวิชา', () => {
    const w = box({}, su => su.subject_code === 'S2');
    assert.deepStrictEqual(w.watchClos().map(c => c.id).join(','), '5');
  });
  t('CLO ที่ยังไม่ตั้งเกณฑ์ผ่าน ไม่ถูกนับ', () => {
    const r = find(rowsOf(box()), 'A1');
    assert.strictEqual(r.tot, 5, 'นับ CLO ที่ไม่มีเกณฑ์ผ่านเข้ามาด้วย');
  });
  t('ช่องคะแนนว่าง ไม่ถือว่าตก', () => {
    const rs = rowsOf(box());
    assert.ok(!find(rs, 'A9'), 'คนที่ยังไม่มีคะแนนเลยกลับขึ้นรายการ');
  });
  t('นักศึกษาที่ไม่ได้กำลังศึกษา ไม่ขึ้นรายการ', () =>
    assert.ok(!find(rowsOf(box()), 'A4'), 'คนพักการเรียนขึ้นมาด้วย'));
  t('กรองชั้นปีได้', () => {
    const rs = rowsOf(box({ stuLevel: '3' }));
    assert.strictEqual(rs.length, 1);
    assert.strictEqual(rs[0].sid, 'A3');
  });

  console.log('\n[2] การคิดร้อยละและ PLO ที่ยังไม่บรรลุ');
  const rs = rowsOf(box());
  t('ร้อยละ = CLO ที่ผ่าน ÷ CLO ที่มีคะแนน', () => {
    assert.strictEqual(find(rs, 'A1').pct, 20);   // ผ่าน 1 จาก 5
    assert.strictEqual(find(rs, 'A2').pct, 60);   // ผ่าน 3 จาก 5
    assert.strictEqual(find(rs, 'A3').pct, 100);
  });
  t('เรียงคนที่ผ่านน้อยที่สุดขึ้นก่อน', () =>
    assert.deepStrictEqual(rs.map(x => x.sid).join(','), 'A1,A2,A3'));
  t('Sub-PLO 1.1 / 1.2 รวมขึ้น PLO1', () => {
    const a2 = find(rs, 'A2');
    assert.ok(a2.plo['PLO1'] && a2.plo['PLO1'].tot === 2, 'ไม่ได้รวม Sub-PLO เข้า PLO หลัก');
    assert.ok(a2.badPlo.indexOf('PLO1') < 0, 'PLO1 ผ่านครบแต่ถูกขึ้นว่าไม่บรรลุ');
  });
  t('PLO ที่ยังไม่บรรลุ คิดจากเกณฑ์เดียวกัน', () => {
    const a2 = find(rs, 'A2');
    assert.deepStrictEqual(a2.badPlo.join(','), 'PLO2', 'A2 ตกเฉพาะ PLO2');
    assert.deepStrictEqual(find(rs, 'A3').badPlo.join(','), '', 'คนที่ผ่านหมดต้องไม่มี PLO ค้าง');
  });
  t('เรียงรหัส PLO ตามตัวเลข ไม่ใช่ตามตัวอักษร', () => {
    const a1 = find(rs, 'A1');
    assert.deepStrictEqual(a1.badPlo.join(','), 'PLO1,PLO2,PLO3');
  });

  console.log('\n[3] เส้นเกณฑ์ปรับได้');
  t('ค่าเริ่มต้น 60% เท่าเกณฑ์ผ่านรายวิชา', () => assert.strictEqual(box({ stuWatchPct: 0 }).watchCut(), 60));
  t('เปลี่ยนเกณฑ์แล้วรายชื่อเปลี่ยนตาม', () => {
    const at50 = rowsOf(box({ stuWatchPct: 50 })).filter(x => x.pct < 50);
    const at70 = rowsOf(box({ stuWatchPct: 70 })).filter(x => x.pct < 70);
    assert.strictEqual(at50.length, 1, 'เกณฑ์ 50% ควรเหลือ A1 คนเดียว');
    assert.strictEqual(at70.length, 2, 'เกณฑ์ 70% ควรได้ A1 และ A2');
  });
  t('เปลี่ยนเกณฑ์ไม่ต้องโหลดข้อมูลใหม่', () => {
    const g = grab('window.ploWatchCut = function (v)');
    assert.ok(!g.includes('loadWatch') && !/_watch\s*=\s*\{\}/.test(g), 'ล้างแคชทิ้งทุกครั้งที่เลื่อนเกณฑ์');
  });
  t('ระดับความเร่งด่วนแบ่งที่ 50%', () => {
    const w = box();
    assert.strictEqual(w.watchLevel(49.9).key, 'urgent');
    assert.strictEqual(w.watchLevel(50).key, 'watch');
  });

  console.log('\n[4] การแสดงผลสำหรับผู้บริหาร');
  const pn = grab('function watchPanel()');
  t('มีแถบสรุปสามตัวเลขก่อนตาราง', () => {
    ['นักศึกษาที่มีผล', 'ควรกำกับติดตาม', 'เร่งด่วน'].forEach(x =>
      assert.ok(pn.includes(x), 'ขาดตัวเลข ' + x));
    assert.ok(pn.indexOf('sum') < pn.indexOf('table'), 'ตารางมาก่อนแถบสรุป');
  });
  t('ย่อรายการไว้ 10 คนแรก ไม่ถมหน้าจอ', () => {
    assert.ok(pn.includes('bad.slice(0, 10)'), 'แสดงทั้งหมดทันที');
    assert.ok(pn.includes('ดูทั้งหมด'), 'ไม่มีปุ่มขยาย');
  });
  t('ไม่มีใครต่ำกว่าเกณฑ์ ก็บอกให้ชัด ไม่ใช่ตารางว่าง', () =>
    assert.ok(pn.includes('ไม่มีนักศึกษาที่ต่ำกว่าเกณฑ์'), 'ตารางว่างโดยไม่อธิบาย'));
  t('อธิบายวิธีนับไว้ท้ายตาราง', () => {
    assert.ok(pn.includes('นับเฉพาะ CLO ที่กรอกคะแนนแล้วและมีเกณฑ์ผ่าน'), 'ไม่ได้บอกว่านับอะไรบ้าง');
    assert.ok(pn.includes('"PLO ที่ยังไม่บรรลุ" คือ'), 'ไม่ได้นิยามคำที่ใช้');
  });
  t('กดดูรายคนแล้วเปิดผลของคนนั้นต่อได้', () => {
    assert.ok(pn.includes('ploWatchOpen('), 'ไม่มีปุ่มเชื่อมไปผลรายคน');
    assert.ok(grab('window.ploWatchOpen = function (sid)').includes('ploFindStudent'), 'ปุ่มไม่ได้โหลดผลรายคน');
  });
  t('แผงนี้อยู่เฉพาะแท็บรายบุคคล ไม่ไปโผล่ในหน้าภาพรวม', () => {
    const g = grab('function studentBox(standalone)');
    assert.ok(g.includes('standalone ? watchPanel() : \'\''), 'ไม่ได้จำกัดเฉพาะแท็บรายบุคคล');
    assert.ok(!grab('function summaryTab()').includes('watchPanel'), 'ไปโผล่ในหน้าภาพรวมด้วย');
  });
  t('โหลดพลาดแล้วลองใหม่ได้ ไม่ค้างเงียบ', () => {
    assert.ok(pn.includes('ploWatchRetry()'), 'ไม่มีปุ่มลองใหม่');
    assert.ok(grab('async function loadWatch(key, clos)').includes("rpcTry('ems_plo_scores'"), 'ไม่ได้ใช้ตัวเรียกที่ลองซ้ำได้');
  });

  console.log('\n[5] คลาสและไอคอน');
  t('คลาส Tailwind ที่ใช้มีอยู่จริง', () => {
    ['.bg-red-50{', '.border-red-200{', '.bg-amber-50{', '.border-amber-200{', '.bg-emerald-50{', '.border-emerald-200{', '.rounded-md{', '.tabular-nums{']
      .forEach(c => assert.ok(TW.includes(c), 'ไม่มีคลาส ' + c));
  });
  t('ไอคอนมีอยู่ในชุด lucide ที่ติดตั้ง', () => {
    const names = fs.readFileSync(P + 'tests/lucide_0.263.0_names.txt', 'utf8').split(/\r?\n/).map(x => x.trim());
    assert.ok(names.indexOf('user-x') >= 0, 'ไม่มีไอคอน user-x');
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(SRC); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
