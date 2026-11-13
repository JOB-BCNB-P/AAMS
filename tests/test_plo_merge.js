/* รวมผล CLO รหัสเดียวกันที่แยกเป็นทฤษฎี/ทดลอง ให้เหลือข้อเดียว
   ทั้งในผลการบรรลุรายบุคคล ผลรวม และตารางนักศึกษาที่ควรกำกับติดตาม */
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

// รายวิชา 3(2-2-5) → ทฤษฎี ×2 ทดลอง ×1 (ตั้งไว้ใน course_cfg ของ CLO ทุกข้อ)
const CFG = JSON.stringify({ passPct: '60', grades: [['A', 80], ['F', 0]], secMult: { 'ทฤษฎี': 2, 'ทดลอง': 1 } });
const CLOS = [
  { id: 1, subject_code: 'S1', academic_year: '2569', semester: '1', clo_code: 'CLO 1.3.1', section: 'ทฤษฎี', plo_code: 'PLO1', max_score: '100', pass_score: '70', course_cfg: CFG },
  { id: 2, subject_code: 'S1', academic_year: '2569', semester: '1', clo_code: 'CLO 1.3.1', section: 'ทดลอง', plo_code: 'PLO1', max_score: '100', pass_score: '40', course_cfg: CFG },
  { id: 3, subject_code: 'S1', academic_year: '2569', semester: '1', clo_code: 'CLO 2.1.1', section: 'ทฤษฎี', plo_code: 'PLO2', max_score: '100', pass_score: '60', course_cfg: CFG },
  // รหัสเดียวกันแต่ผูกคนละ PLO — ต้องไม่รวม
  { id: 4, subject_code: 'S1', academic_year: '2569', semester: '1', clo_code: 'CLO 9.9.9', section: 'ทฤษฎี', plo_code: 'PLO8', max_score: '100', pass_score: '60', course_cfg: CFG },
  { id: 5, subject_code: 'S1', academic_year: '2569', semester: '1', clo_code: 'CLO 9.9.9', section: 'ทดลอง', plo_code: 'PLO9', max_score: '100', pass_score: '60', course_cfg: CFG }
];

function box() {
  const sb = {
    console, Math, JSON, Object, Array, String,
    APP: { _plo: { curriculum: '2565' } },
    getDataByType: ty => (ty === 'plo_clo' ? CLOS : []),
    htmlEsc: v => String(v == null ? '' : v)
  };
  vm.createContext(sb);
  new vm.Script(`
    function s(v){return String(v==null?'':v).trim();}
    function n(v){var x=parseFloat(v);return isFinite(x)?x:0;}
    function esc(v){return htmlEsc(v);}
    function get(t){return getDataByType(t)||[];}
    function state(){return APP._plo;}
    ${SRC.match(/var SEC_ORDER = \{[^}]*\};/)[0]}
    ${grab('function normSec(v)')}
    ${grab('function secOf(c)')}
    ${SRC.match(/var DEF_GRADES = \[[\s\S]*?\];/)[0]}
    ${SRC.match(/var DEF_CFG = \{[\s\S]*?\};/)[0]}
    ${grab('function courseCfg(clos)')}
    ${grab('function secMultOf(cfg, sec)')}
    var _secWCache = {};
    ${grab('function secWeightOf(code, year, sem, sec)')}
    ${grab('function mergeKeyOf(r)')}
    ${grab('function mergeGroups(rows)')}
    ${grab('function samePlo(list)')}
    ${grab('function secLabelOf(list)')}
    ${grab('function mergeStudentRows(rows)')}
  `).runInContext(sb);
  return sb;
}

const row = (clo, sec, plo, score, cut) => ({
  'รหัสวิชา': 'S1', 'รายวิชา': 'วิชาหนึ่ง', 'ปีการศึกษา': '2569', 'ภาคเรียน': '1',
  'CLO': clo, 'PLO': plo, 'คะแนน': score, 'คะแนนเต็ม': 100, 'เกณฑ์ผ่าน': cut,
  'ผ่าน': score >= cut, __sec: sec
});

(function () {
  const w = box();

  console.log('[1] น้ำหนักของแต่ละส่วน');
  t('อ่านตัวคูณจากค่าตั้งรายวิชา', () => {
    assert.strictEqual(w.secWeightOf('S1', '2569', '1', 'ทฤษฎี'), 2);
    assert.strictEqual(w.secWeightOf('S1', '2569', '1', 'ทดลอง'), 1);
  });
  t('รายวิชาที่ไม่ได้ตั้งตัวคูณ ใช้ 1 เท่ากันทุกส่วน', () =>
    assert.strictEqual(w.secWeightOf('ไม่มีวิชานี้', '2569', '1', 'ทฤษฎี'), 1));

  console.log('\n[2] รวมผลรายบุคคล');
  t('CLO รหัสเดียวกันสองส่วน ยุบเหลือแถวเดียว', () => {
    const r = w.mergeStudentRows([row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 80, 70), row('CLO 1.3.1', 'ทดลอง', 'PLO1', 50, 40)]);
    assert.strictEqual(r.length, 1, 'ยังเป็นสองแถว');
    assert.strictEqual(r[0]['CLO'], 'CLO 1.3.1');
  });
  t('คะแนนถ่วงตามตัวคูณ ไม่ใช่เฉลี่ยธรรมดา', () => {
    const r = w.mergeStudentRows([row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 80, 70), row('CLO 1.3.1', 'ทดลอง', 'PLO1', 50, 40)])[0];
    assert.strictEqual(r['คะแนน'], 70, '(80×2 + 50×1) ÷ 3 = 70');
    assert.notStrictEqual(r['คะแนน'], 65, 'เผลอเฉลี่ยธรรมดา');
  });
  t('เกณฑ์ผ่านถ่วงด้วยน้ำหนักเดียวกัน เพราะแต่ละส่วนตั้งไม่เท่ากัน', () => {
    const r = w.mergeStudentRows([row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 80, 70), row('CLO 1.3.1', 'ทดลอง', 'PLO1', 50, 40)])[0];
    assert.strictEqual(r['เกณฑ์ผ่าน'], 60, '(70×2 + 40×1) ÷ 3 = 60');
    assert.strictEqual(r['ผ่าน'], true, '70 ≥ 60 ต้องผ่าน');
  });
  t('ผ่านทฤษฎีแต่ตกทดลองหนัก ตัดสินเป็นไม่ผ่านได้', () => {
    const r = w.mergeStudentRows([row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 72, 70), row('CLO 1.3.1', 'ทดลอง', 'PLO1', 0, 40)])[0];
    assert.strictEqual(r['คะแนน'], 48, '(72×2 + 0) ÷ 3 = 48');
    assert.strictEqual(r['ผ่าน'], false);
  });
  t('บอกไว้ว่าแถวนี้เป็นผลรวมของส่วนไหนบ้าง', () => {
    const r = w.mergeStudentRows([row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 80, 70), row('CLO 1.3.1', 'ทดลอง', 'PLO1', 50, 40)])[0];
    assert.strictEqual(r.__merged, 'ทฤษฎี + ทดลอง');
    assert.strictEqual(r.__sec, '', 'ยังติดป้ายส่วนเดิมอยู่ จะอ่านว่าเป็นคะแนนของส่วนเดียว');
  });
  t('ผูกคนละ PLO ไม่รวม', () => {
    const r = w.mergeStudentRows([row('CLO 9.9.9', 'ทฤษฎี', 'PLO8', 80, 60), row('CLO 9.9.9', 'ทดลอง', 'PLO9', 20, 60)]);
    assert.strictEqual(r.length, 2, 'รวมข้ามคนละ PLO');
  });
  t('CLO ส่วนเดียวไม่ถูกแตะ', () => {
    const one = row('CLO 2.1.1', 'ทฤษฎี', 'PLO2', 55, 60);
    const r = w.mergeStudentRows([one]);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].__merged, undefined, 'ติดป้ายรวมทั้งที่มีส่วนเดียว');
    assert.strictEqual(r[0].__sec, 'ทฤษฎี', 'ป้ายส่วนหาย');
  });
  t('คนละรายวิชา/คนละภาค ที่รหัส CLO ซ้ำกัน ต้องไม่รวมข้ามกัน', () => {
    const a = row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 80, 70);
    const b = Object.assign({}, row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 20, 70), { 'ภาคเรียน': '2' });
    assert.strictEqual(w.mergeStudentRows([a, b]).length, 2);
  });
  t('คะแนนเต็มไม่ใช่ 100 ก็คิดเป็นร้อยละก่อนรวม', () => {
    const a = Object.assign(row('CLO 1.3.1', 'ทฤษฎี', 'PLO1', 11, 11), { 'คะแนนเต็ม': 22 });  // 50%
    const b = row('CLO 1.3.1', 'ทดลอง', 'PLO1', 80, 40);                                      // 80%
    const r = w.mergeStudentRows([a, b])[0];
    assert.strictEqual(r['คะแนน'], 60, '(50×2 + 80×1) ÷ 3 = 60');
    assert.strictEqual(r['คะแนนเต็ม'], 100, 'ไม่ได้ปรับฐานเป็นร้อยละ');
  });

  console.log('\n[3] ผูกเข้ากับหน้าจอ');
  t('ผลรายบุคคลรวมส่วนก่อนนำไปคิดทุกตัวเลข', () => {
    const g = grab('window.ploFindStudent = async function (q)');
    assert.ok(g.includes('mergeStudentRows('), 'ไม่ได้รวมส่วน');
    assert.ok(g.indexOf('tagStudentSections') < g.indexOf('mergeStudentRows'), 'รวมก่อนรู้ว่าแถวไหนเป็นส่วนไหน');
  });
  t('หน้าผลรวมก็รวมส่วนเช่นกัน', () => {
    const g = grab('window.ploLoad = async function (quiet)');
    assert.ok(g.includes("mergeSummaryRows(st.summary['ราย CLO']"), 'ตาราง CLO ยังนับสองครั้ง');
    assert.ok(g.includes("mergeSummaryRows(st.summary['รายวิชาที่ต้องติดตาม']"), 'ตารางวิชาที่ต้องติดตามยังนับสองครั้ง');
  });
  t('ผลรวมตัดสินรายคนจากคะแนนดิบ ไม่ใช่เฉลี่ยร้อยละของสองส่วน', () => {
    const g = grab('async function mergeSummaryRows(rows)');
    assert.ok(g.includes("rpcTry('ems_plo_scores'"), 'ไม่ได้ดึงคะแนนดิบ');
    assert.ok(g.includes('stuSet[sid] < cands.length'), 'ไม่ได้กันคนที่มีคะแนนไม่ครบทุกส่วน');
    assert.ok(g.includes('secWeightOf('), 'ไม่ได้ถ่วงตามตัวคูณ');
  });
  t('ตารางควรกำกับติดตามก็ยุบส่วนก่อนนับ', () => {
    const g = grab('function watchRows(raw, clos)');
    assert.ok(g.includes('cell['), 'ยังนับทีละแถว ทำให้วิชาทฤษฎีและทดลองถูกนับสองเท่า');
    assert.ok(g.includes('secWeightOf('), 'ไม่ได้ถ่วงตามตัวคูณ');
    assert.ok(g.includes('plos.every('), 'ไม่ได้กันกรณีผูกคนละ PLO');
  });
  t('มีป้ายบอกผู้อ่านว่าตัวเลขนี้รวมสองส่วนแล้ว', () => {
    const g = grab('function secBadge(r)');
    assert.ok(g.includes('__merged'), 'ไม่ได้แสดงว่าเป็นผลรวม');
    assert.ok((SRC.match(/secBadge\(r\)/g) || []).length >= 3, 'ยังมีตารางที่ใช้ป้ายเดิมอยู่');
  });
  console.log('\n[4] แถบร้อยละที่ 0% ต้องไม่หายไป');
  const w2 = (() => {
    const sb = { Math, String };
    vm.createContext(sb);
    new vm.Script(`
      function n(v){var x=parseFloat(v);return isFinite(x)?x:0;}
      function fx(v,d){return n(v).toFixed(d==null?2:d);}
      function esc(v){return String(v==null?'':v);}
      ${grab('function barHTML(p, crit, b, w, critLabel)')}
    `).runInContext(sb);
    return sb;
  })();
  const B = { bar: '#ef4444' };
  t('0% ยังเห็นหัวแถบ ไม่ใช่เส้นว่าง', () => {
    const h = w2.barHTML(0, null, B, null, 'เกณฑ์ผ่าน');
    assert.ok(h.includes('width:6px'), 'แถบหายไปทั้งเส้นเมื่อได้ 0%');
    assert.ok(h.includes('มีผลการประเมินแล้ว แต่ยังไม่ผ่านเลย'), 'ไม่ได้อธิบายว่า 0% ต่างจากไม่มีข้อมูล');
  });
  t('ค่าน้อย ๆ ก็ยังมองเห็น', () =>
    assert.ok(w2.barHTML(0.4, null, B).includes('min-width:6px'), 'ค่า 0.4% มองไม่เห็น'));
  t('ค่าปกติยังกว้างตามจริง', () => {
    const h = w2.barHTML(70, null, B);
    assert.ok(h.includes('width:70%'), 'ความกว้างเพี้ยน');
  });
  t('เกินขอบเขตถูกตัดให้อยู่ใน 0–100', () => {
    assert.ok(w2.barHTML(150, null, B).includes('width:100%'));
    assert.ok(w2.barHTML(-5, null, B).includes('width:6px'), 'ค่าติดลบต้องถือเป็น 0');
  });
  t('ทั้งสองตารางใช้แถบชุดเดียวกัน', () =>
    assert.ok((SRC.match(/barHTML\(/g) || []).length >= 3, 'ยังมีที่วาดแถบเองอยู่'));

  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(SRC); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
