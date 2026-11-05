/* ประเมินผลหลักสูตร : โหลดอัตโนมัติ + ใยแมงมุมจำนวนรายวิชาตาม PLO
   จุดที่ต้องไม่พลาด
   1) เปลี่ยนตัวกรองแล้วต้องคำนวณให้เอง แต่ต้องไม่ยิงฐานข้อมูลรัวทุกครั้งที่ขยับ
   2) รหัสย่อย 1.1 ต้องนับรวมเข้า PLO 1 ไม่งั้นแกนจะว่างทั้งที่มีข้อมูล
   3) นับเป็นจำนวนรายวิชาที่ไม่ซ้ำ ไม่ใช่จำนวนแถว */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const PL = fs.readFileSync(path.join(ROOT, 'plo.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = PL.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = PL.indexOf('{', i); k < PL.length; k++) {
    if (PL[k] === '{') d++;
    else if (PL[k] === '}') { d--; if (!d) return PL.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

console.log('\n[1] เลือกตัวกรองแล้วแสดงผลเลย');
t('เปลี่ยนตัวกรองแล้วสั่งคำนวณเอง', () => {
  const g = grab('window.ploSet = function (k, v)');
  assert.ok(g.includes('ploAutoLoad()'), 'ยังต้องกดปุ่มเอง');
});
t('เปิดหน้ามาครั้งแรกก็คำนวณให้', () => {
  const g = grab('function summaryTab()');
  assert.ok(g.includes('ploAutoLoad()'), 'เปิดหน้ามาแล้วยังว่างจนกว่าจะกดปุ่ม');
  assert.ok(!g.includes('กด "โหลดข้อมูล"'), 'ยังมีข้อความให้กดปุ่มค้างอยู่');
});
t('หน่วงไว้ก่อน ไม่ยิงฐานข้อมูลทุกครั้งที่ขยับ dropdown', () => {
  const g = grab('function ploAutoLoad()');
  assert.ok(g.includes('clearTimeout') && g.includes('setTimeout'), 'ไม่ได้หน่วง เปลี่ยน 4 ช่องจะยิง 4 ครั้ง');
  assert.ok(g.includes('st.loading') && g.includes('st.summary'), 'ไม่ได้กันการเรียกซ้อน');
  assert.ok(g.includes("st.tab === 'entry'"), 'อยู่แท็บบันทึกข้อมูลก็ยังไปคำนวณ');
});
t('โหมดอัตโนมัติไม่เด้งข้อความรบกวน', () => {
  const g = grab('window.ploLoad = async function (quiet)');
  assert.ok(/if \(!quiet && typeof showToast/.test(g), 'เปลี่ยนตัวกรองทีเด้ง toast ที');
});
t('ยังมีปุ่มคำนวณใหม่ไว้ใช้หลังบันทึกคะแนน', () => {
  assert.ok(PL.includes('คำนวณใหม่'), 'ถอดปุ่มออกหมด กรอกคะแนนแล้วสั่งคำนวณซ้ำไม่ได้');
});

console.log('\n[2] ตรรกะการนับของใยแมงมุม');
const s = v => String(v == null ? '' : v).trim();
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const esc = v => String(v == null ? '' : v);
const AXES = [...Array(10)].map((_, i) => ({ code: 'PLO' + (i + 1), no: String(i + 1), stmt: '' }));
const toParent = new Function('s', grab('function toParentPlo(') + ' return toParentPlo;')(s);

t('รหัสย่อย 1.1 และ 1.3 นับรวมเข้า PLO 1', () => {
  assert.strictEqual(toParent('1.1', AXES), 'PLO1');
  assert.strictEqual(toParent('1.3', AXES), 'PLO1');
  assert.strictEqual(toParent('10.2', AXES), 'PLO10', 'PLO10 ต้องไม่ถูกตัดเหลือ PLO1');
});
t('รหัสเต็ม PLO7 ยังเป็น PLO7', () => {
  assert.strictEqual(toParent('PLO7', AXES), 'PLO7');
});
t('รหัสที่ไม่รู้จัก ต้องไม่ถูกยัดเข้าแกนใดแกนหนึ่ง', () => {
  assert.strictEqual(toParent('ZZ', AXES), '');
  assert.strictEqual(toParent('', AXES), '');
  assert.strictEqual(toParent('99.1', AXES), '', 'PLO99 ไม่มีอยู่จริง');
});

function series(mode, years, data) {
  let st = { curriculum: '2565', radar: { mode, years } };
  const env = {
    get: tb => data[tb] || [], s, n, esc, state: () => st,
    MAP_LEVELS: [['I', 'เริ่มเรียนรู้ (I)'], ['R', 'ฝึกซ้ำ (R)'], ['M', 'ชำนาญ (M)'], ['P', 'ปฏิบัติจริง (P)']]
  };
  const src = grab('function toParentPlo(') + grab('function radarState(') + grab('function radarYears(') + grab('function radarSeries(');
  const f = new Function(...Object.keys(env), src + ' return radarSeries;')(...Object.values(env));
  return f(AXES);
}

t('นับจำนวนรายวิชาที่ไม่ซ้ำ ไม่ใช่จำนวนแถว', () => {
  const data = { plo_clo: [
    { academic_year: '2569', plo_code: 'PLO1', subject_code: 'X' },
    { academic_year: '2569', plo_code: 'PLO1', subject_code: 'X' },   // วิชาเดิม คนละ CLO
    { academic_year: '2569', plo_code: 'PLO1', subject_code: 'Y' }
  ] };
  assert.strictEqual(series('year', ['2569'], data)[0].values[0], 2, 'นับซ้ำเป็น 3');
});
t('แยกเส้นตามปีการศึกษาที่เลือก', () => {
  const data = { plo_clo: [
    { academic_year: '2568', plo_code: 'PLO1', subject_code: 'A' },
    { academic_year: '2569', plo_code: 'PLO1', subject_code: 'A' },
    { academic_year: '2569', plo_code: 'PLO3', subject_code: 'B' }
  ] };
  const se = series('year', ['2568', '2569'], data);
  assert.strictEqual(se.length, 2, 'ควรได้ 2 เส้น');
  assert.strictEqual(se[0].values[0], 1);
  assert.strictEqual(se[1].values[2], 1, 'PLO3 ของปี 2569 ไม่ถูกนับ');
});
t('ข้ามข้อมูลของหลักสูตรอื่น', () => {
  const data = { plo_clo: [
    { academic_year: '2569', curriculum_year: '2560', plo_code: 'PLO1', subject_code: 'A' },
    { academic_year: '2569', curriculum_year: '2565', plo_code: 'PLO1', subject_code: 'B' }
  ] };
  assert.strictEqual(series('year', ['2569'], data)[0].values[0], 1, 'เอาหลักสูตรอื่นมาปนด้วย');
});
t('มุมมองแผนที่หลักสูตร แยกเส้นตามระดับ I R M P', () => {
  const data = { curriculum_map: [
    { curriculum_year: '2565', level: 'I', plo_code: '1.1', course_code: 'A' },
    { curriculum_year: '2565', level: 'I', plo_code: '1.3', course_code: 'A' },   // วิชาเดิม PLO เดิม
    { curriculum_year: '2565', level: 'R', plo_code: '9.1', course_code: 'C' }
  ] };
  const se = series('map', null, data);
  assert.strictEqual(se.length, 4, 'ควรได้ 4 ระดับ');
  assert.strictEqual(se[0].values[0], 1, 'วิชาเดียวผูก 1.1 และ 1.3 ต้องนับเป็น 1');
  assert.strictEqual(se[1].values[8], 1, 'ระดับ R ของ PLO9 ไม่ถูกนับ');
});

console.log('\n[3] การแสดงผล');
t('วาดเป็น SVG เอง ไม่ต้องพึ่งไลบรารีภายนอก', () => {
  const g = grab('function radarSvg(');
  assert.ok(g.includes('<polygon') && g.includes('viewBox'), 'ไม่ได้วาดเป็น SVG');
  assert.ok(!/cdn|script src/i.test(g), 'ไปดึงไลบรารีจากภายนอก จะใช้ไม่ได้ตอนเน็ตมีปัญหา');
});
t('มีป้ายชื่อแกนทุก PLO และมีตารางตัวเลขกำกับ', () => {
  assert.ok(/>PLO ' \+ esc\(axes\[a\]\.no\)/.test(grab('function radarSvg(')), 'ไม่มีป้ายแกน');
  assert.ok(grab('function radarCard()').includes('<table'), 'ไม่มีตารางตัวเลข อ่านค่าที่แน่นอนไม่ได้');
});
t('เตือนเมื่อมี PLO ที่ยังไม่มีรายวิชาครอบคลุม', () => {
  const g = grab('function radarCard()');
  assert.ok(g.includes('ยังไม่มีรายวิชาครอบคลุม'), 'ช่องว่างของหลักสูตรจะถูกมองข้าม');
});
t('การ์ดอยู่ในหน้าสรุปผลรวม และไม่ต้องรอผลการบรรลุ', () => {
  assert.ok(PL.includes('return filterBar() + radarCard() + body;'),
    'การ์ดไม่ได้ถูกวางในหน้าสรุป หรือไปอยู่หลังเงื่อนไขที่ต้องมีคะแนนก่อน');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
