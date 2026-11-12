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

console.log('\n[2.1] ช่องเลือกปีการศึกษา — ต้องไม่รกเมื่อปีเยอะขึ้น');
const yearPicker = new Function('esc', 's', 'RADAR_COLORS', 'RADAR_MAX_YEARS', 'RADAR_CHIPS',
  grab('function yearPicker(years, rs)') + ' return yearPicker;')(
  v => String(v == null ? '' : v), s, ['#1', '#2', '#3', '#4', '#5'], 5, 6);
const YEARS = ['2574', '2573', '2572', '2571', '2570', '2569', '2568', '2567', '2566'];
function chips(html) {
  const out = [], re = /onclick="ploRadarYear\('(\d+)'/g;
  let m; while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

t('โชว์เป็นปุ่มไม่เกิน 6 ปี ที่เหลือไปอยู่ในช่องเลือก', () => {
  const h = yearPicker(YEARS, { years: [] });
  assert.strictEqual(chips(h).length, 6, 'ปุ่มยาวเป็นพรืด');
  assert.ok(h.includes('+ ปีก่อนหน้า (3)'), 'ปีที่เหลือหายไปเลย เลือกไม่ได้');
});
t('ปีล่าสุดอยู่ก่อน', () => {
  assert.deepStrictEqual(chips(yearPicker(YEARS, { years: [] })), ['2574', '2573', '2572', '2571', '2570', '2569']);
});
t('ปีเก่าที่เลือกไว้ ต้องโชว์เป็นปุ่มเสมอ ไม่ซ่อนในช่องเลือก', () => {
  const h = yearPicker(YEARS, { years: ['2566'] });
  assert.ok(chips(h).indexOf('2566') !== -1, 'เลือกไว้แล้วแต่มองไม่เห็นว่าเลือกอะไรอยู่');
  assert.ok(h.includes('+ ปีก่อนหน้า (2)'), 'จำนวนในช่องเลือกไม่ลดลงตาม');
});
t('ปีที่เลือกมีสีตรงกับเส้นในกราฟ', () => {
  const h = yearPicker(YEARS, { years: ['2569', '2568'] });
  assert.ok(h.includes('style="background:#1"') && h.includes('style="background:#2"'),
    'สีปุ่มไม่ตรงกับสีเส้น ผู้ใช้จะเทียบไม่ถูกว่าเส้นไหนคือปีไหน');
});
t('ปีเดียวไม่ต้องมีปุ่มล้าง', () => {
  assert.ok(!yearPicker(YEARS, { years: ['2569'] }).includes('ploRadarYearClear'), 'ปุ่มล้างโผล่ทั้งที่ไม่จำเป็น');
  assert.ok(yearPicker(YEARS, { years: ['2569', '2568'] }).includes('ploRadarYearClear'), 'เลือกหลายปีแล้วไม่มีทางล้าง');
});
t('ยังไม่มีข้อมูลปีไหนเลย บอกว่าต้องทำอะไรต่อ', () => {
  const h = yearPicker([], { years: [] });
  assert.ok(h.includes('ยังไม่มีปีการศึกษา') && h.includes('กำหนด CLO'), 'ไม่ได้บอกทางไปต่อ');
});
t('เพดานเท่าจำนวนสีที่เตรียมไว้ ไม่ใช่เลขที่ตั้งลอย ๆ', () => {
  assert.ok(/RADAR_MAX_YEARS = RADAR_COLORS\.length/.test(PL),
    'ถ้าเพิ่มสีแล้วเพดานไม่ขยับตาม จะเลือกได้น้อยกว่าที่ระบบรองรับ');
});
t('สีของแต่ละปีต่างกันพอให้แยกออกจริง', () => {
  const m = PL.match(/RADAR_COLORS = \[([^\]]+)\]/);
  assert.ok(m, 'ไม่พบชุดสี');
  const cols = m[1].match(/#[0-9a-f]{6}/gi) || [];
  assert.ok(cols.length >= 3, 'สีน้อยเกินไป');
  assert.strictEqual(new Set(cols.map(c => c.toLowerCase())).size, cols.length, 'มีสีซ้ำกัน');
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  // ระยะสีแบบถ่วงน้ำหนักสายตา — จับกรณี "น้ำเงินสองเฉด" ที่ของเดิมแยกไม่ออก
  const dist = (a, b) => {
    const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b), rm = (r1 + r2) / 2;
    return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
  };
  for (let i = 0; i < cols.length; i++)
    for (let j = i + 1; j < cols.length; j++)
      assert.ok(dist(cols[i], cols[j]) > 150, 'สี ' + cols[i] + ' กับ ' + cols[j] + ' ใกล้กันเกินไป (' + Math.round(dist(cols[i], cols[j])) + ')');
});
t('มีลายเส้นต่างกันรายปี เผื่อแยกสีไม่ได้หรือพิมพ์ขาวดำ', () => {
  const d = PL.match(/RADAR_DASH = \[([^\]]+)\]/);
  const c = PL.match(/RADAR_COLORS = \[([^\]]+)\]/);
  assert.ok(d, 'ไม่มีลายเส้นประ');
  const dashes = d[1].split(',').map(x => x.trim());
  const cols = (c[1].match(/#[0-9a-f]{6}/gi) || []);
  assert.strictEqual(dashes.length, cols.length, 'จำนวนลายเส้นไม่เท่าจำนวนสี');
  assert.strictEqual(new Set(dashes).size, dashes.length, 'มีลายเส้นซ้ำกัน');
  assert.ok(PL.includes('stroke-dasharray="' + "' + dash + '" + '"'), 'กราฟไม่ได้ใช้ลายเส้น');
});
t('ป้ายกำกับและหัวตารางใช้ตัวอย่างเส้นชุดเดียวกับกราฟ', () => {
  assert.ok(/function radarSwatch\(i\)/.test(PL), 'ไม่มีตัวอย่างเส้น');
  assert.ok((PL.match(/radarSwatch\(i\)/g) || []).length >= 3, 'ใช้ไม่ครบทั้งป้ายกำกับและหัวตาราง');
});
t('เลือกเกินเพดาน ปล่อยปีเก่าสุดออกให้เอง', () => {
  const g = grab('window.ploRadarYear = function (y, on)');
  assert.ok(g.includes('while (ys.length > RADAR_MAX_YEARS) ys.shift()'), 'เลือกได้ไม่จำกัด สีจะวนซ้ำจนแยกไม่ออก');
  let ys = ['2565', '2566', '2567', '2568', '2569'];
  const add = y => { ys = ys.filter(x => x !== y); ys.push(y); ys.sort(); while (ys.length > 5) ys.shift(); };
  add('2574');
  assert.deepStrictEqual(ys, ['2566', '2567', '2568', '2569', '2574'], 'ปีที่เก่าที่สุดควรถูกปล่อยออก');
});
t('ยิ่งเลือกหลายปี พื้นในเส้นยิ่งจาง จะได้ยังอ่านออก', () => {
  const g = grab('function radarSvg(axes, series, fixedMax)');
  assert.ok(g.includes('var fillOp ='), 'พื้นทึบเท่ากันหมด เส้นล่างจะถูกบัง');
  assert.ok(g.includes("fill-opacity=\"' + fillOp"), 'คำนวณไว้แต่ไม่ได้ใช้');
});
t('ทุกคลาสที่ใช้มีอยู่ใน tailwind.css ที่ build ไว้แล้ว', () => {
  // ไฟล์ CSS ถูก build ไว้ล่วงหน้า คลาสที่ไม่เคยถูกใช้ที่ไหนเลยจะไม่มีในไฟล์ และหน้าจะเพี้ยนเงียบ ๆ
  const CSS = fs.readFileSync(path.join(ROOT, 'tailwind.css'), 'utf8');
  const seg = grab('function yearPicker(years, rs)');
  const used = new Set();
  seg.replace(/class="([^"]+)"/g, (m, g) => g.split(/\s+/).forEach(c => {
    if (c && /^[a-z0-9:\[\]./_-]+$/i.test(c) && c !== ':') used.add(c);
  }));
  const esc = c => '.' + c.replace(/([.:[\]/])/g, '\\$1');
  const miss = [...used].filter(c => !CSS.includes(esc(c) + '{') && !CSS.includes(esc(c) + ':hover{') && !CSS.includes(esc(c) + ','));
  assert.deepStrictEqual(miss, [], 'คลาสเหล่านี้ไม่มีในไฟล์ CSS จะไม่มีผลกับหน้าจอ');
});

console.log('\n[2.2] มุมมองร้อยละการบรรลุ PLO (จากคะแนน CLO)');
t('เปิดหน้ามาเห็นผลสัมฤทธิ์ก่อน ไม่ใช่จำนวนรายวิชา', () => {
  assert.ok(/st\.radar = \{ mode: 'score'/.test(PL), 'ค่าเริ่มต้นยังเป็นมุมมองจำนวนรายวิชา');
});
t('รวม CLO ขึ้นเป็น PLO ด้วยการเฉลี่ยค่าราย CLO ไม่ใช่กองรวม', () => {
  /* จุดสำคัญเชิงวิธีวิทยา : ถ้ากองรวมทุกผลการประเมิน CLO ที่มีนักศึกษาเยอะจะครอบงำค่าของ PLO
     เช่น CLO หนึ่ง 600 คนผ่าน 100% กับอีก CLO 30 คนผ่าน 40%
     กองรวมได้ 97.14% แต่เฉลี่ยราย CLO ได้ 70% ซึ่งสะท้อนความจริงกว่า */
  const g = grab('async function loadScoreYear(year)');
  assert.ok(g.includes("'mean'"), 'ยังใช้วิธีกองรวม');
  assert.ok(g.includes("sum['ราย CLO']"), 'ไม่ได้คิดจากคะแนนราย CLO');
  assert.ok(g.includes('toParentPlo'), 'รหัสย่อย เช่น 1.1 จะไม่ถูกนับเข้า PLO 1');
});
t('ตรรกะการเฉลี่ยทำงานถูก', () => {
  const agg = new Function('n', grab('function cloTot(r)') + grab('function aggRows(rows, keyFn, mode)') + ' return aggRows;')(
    v => { const x = parseFloat(v); return isFinite(x) ? x : 0; });
  const rows = [
    { PLO: 'PLO1', 'ร้อยละบรรลุ': 100, 'ผ่าน': 600, 'ผลการประเมิน': 600 },
    { PLO: 'PLO1', 'ร้อยละบรรลุ': 40, 'ผ่าน': 12, 'ผลการประเมิน': 30 }
  ];
  const kf = r => r.PLO;
  assert.strictEqual(agg(rows, kf, 'mean')[0].pct, 70, 'เฉลี่ยราย CLO ต้องได้ 70');
  assert.strictEqual(agg(rows, kf, 'pool')[0].pct, 97.14, 'วิธีกองรวมเดิมได้ 97.14');
});
t('เรียกสรุปแยกรายปี และจำผลไว้ไม่เรียกซ้ำ', () => {
  const g = grab('async function loadScoreYear(year)');
  assert.ok(g.includes("rpc('ems_plo_summary'"), 'ไม่ได้เรียกตัวคำนวณของฐานข้อมูล');
  assert.ok(g.includes('p_year: s(year)'), 'ไม่ได้แยกตามปีการศึกษา');
  assert.ok(g.includes('if (cache[k]) return;'), 'เรียกซ้ำทุกครั้งที่วาดหน้าใหม่');
  assert.ok(g.includes('scoreKey(') && /scoreKey\(year\) \{[\s\S]*curriculum/.test(PL),
    'คีย์แคชไม่ได้รวมหลักสูตร สลับหลักสูตรแล้วจะได้ค่าของหลักสูตรเดิม');
});
t('โหลดไม่สำเร็จต้องบอก ไม่ใช่เงียบ', () => {
  const g = grab('async function loadScoreYear(year)');
  assert.ok(g.includes('err: String(e.message || e)'), 'กลืนข้อผิดพลาด');
  assert.ok(grab('function radarCard()').includes('โหลดไม่สำเร็จ'), 'ไม่ได้แสดงข้อผิดพลาดบนหน้าจอ');
});
t('สเกลตรึง 0-100 ในโหมดร้อยละ', () => {
  // ถ้าปล่อยให้สเกลยืดตามค่าสูงสุด ปีที่บรรลุ 40% จะดูเต็มวงเท่าปีที่บรรลุ 95%
  const g = grab('function radarSvg(axes, series, fixedMax)');
  assert.ok(g.includes('if (fixedMax)'), 'ไม่ได้ตรึงสเกล');
  assert.ok(grab('function radarCard()').includes("rs.mode === 'score' ? 100 : 0"), 'ไม่ได้ส่งสเกล 100 ให้กราฟ');
});
t('ตารางแสดงเป็นร้อยละ ไม่ใช่จำนวนดิบ', () => {
  assert.ok(grab('function radarCard()').includes("x.unit === '%'"), 'หน่วยในตารางไม่ถูก');
});
t('ปีที่ยังไม่มีคะแนน ต้องบอกให้ไปกรอกคะแนนก่อน', () => {
  assert.ok(grab('function radarCard()').includes('ยังไม่มีคะแนน CLO ที่บันทึกไว้'), 'ขึ้นว่าไม่มีข้อมูลเฉย ๆ');
});
t('สลับได้ 3 มุมมอง', () => {
  const g = grab('function radarCard()');
  ['ร้อยละการบรรลุ', 'จำนวนรายวิชา', 'แผนที่หลักสูตร'].forEach(x =>
    assert.ok(g.includes(x), 'ไม่มีปุ่ม ' + x));
  assert.ok(grab('window.ploRadarMode = function (v)').includes("v === 'score'"), 'สลับไปโหมดร้อยละไม่ได้');
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
