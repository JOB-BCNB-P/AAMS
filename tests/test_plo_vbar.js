/* กราฟแท่งแนวตั้งของมุมมอง PLO และชั้นปี
   ข้อห้ามใหญ่สุด : "ยังไม่มีผลการประเมิน" ต้องไม่ดูเหมือน "มีผลแต่ 0%" */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const PL = fs.readFileSync(P + 'plo.js', 'utf8');
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
const V = PL.slice(PL.indexOf('var vbars = function'), PL.lastIndexOf("return section('อัตราการบรรลุ'"));

console.log('[1] ใช้ให้ถูกที่');
t('มีกราฟแท่งแนวตั้ง', () => assert.ok(V.length > 200, 'ไม่พบ'));
t('มุมมองราย CLO ยังเป็นแนวนอน เพราะชื่อยาววางใต้แท่งไม่ได้', () =>
  assert.ok(/st\.view === 'clo' \? cloGrouped\(rows\)/.test(PL), 'ไปใช้แนวตั้งกับชื่อที่ยาวมาก'));
t('แท่งเยอะเกินไปตกกลับไปใช้แนวนอน', () =>
  assert.ok(/rows\.length <= 14 \? vbars\(\)/.test(PL), 'แท่ง 30 อันจะบีบจนอ่านไม่ออก'));
t('ยังมีแท่งแนวนอนพร้อมรายละเอียดอยู่ใต้กราฟ ไม่ได้ตัดข้อมูลทิ้ง', () =>
  assert.ok(/vbars\(\) \+ '<div class="mt-4">' \+ bars/.test(PL),
    'ตัดจำนวนผ่าน/ทั้งหมด และเส้นเกณฑ์รายข้อทิ้งไป'));

console.log('\n[2] ไม่มีข้อมูล ต้องไม่ถูกอ่านว่าศูนย์');
t('นับจากจำนวนผลการประเมิน ไม่ได้ดูแค่ร้อยละ', () =>
  assert.ok(/var has = cnt > 0;/.test(V), 'ร้อยละ 0 กับไม่มีข้อมูลจะปนกัน'));
t('ไม่มีข้อมูลแสดงขีด ไม่ใช่ 0%', () =>
  assert.ok(/has \? fx\(pct, 0\) \+ '%' : '—'/.test(V), 'จะขึ้น 0% ทั้งที่ยังไม่ได้ประเมิน'));
t('ไม่มีข้อมูลใช้รูปทรงต่างออกไป ไม่ใช่แค่แท่งเตี้ย', () =>
  assert.ok(/vbar-none/.test(V) && /\.vbar-none \{/.test(CSS), 'ไม่มีสัญลักษณ์แยก'));
t('มีข้อมูลแต่ผ่าน 0% ยังต้องเห็นแท่ง', () =>
  assert.ok(/Math\.max\(2, Math\.min\(100, pct\)\)/.test(V), 'แท่ง 0% จะหายไปจนนึกว่าไม่มีข้อมูล'));

console.log('\n[3] เส้นเกณฑ์');
t('ลากเส้นเฉพาะตอนทุกแท่งใช้เกณฑ์เดียวกัน', () =>
  assert.ok(/crits\.every\(function \(x\) \{ return x === crits\[0\]; \}\)/.test(V),
    'เกณฑ์ต่างกันแต่ลากเส้นเดียว จะอ่านผิด'));
t('ส่งเกณฑ์เป็นสัดส่วน ไม่ใช่หน่วยร้อยละ', () =>
  assert.ok(/--critN:' \+ \(Math\.min\(100, oneCrit\) \/ 100\)/.test(V), 'หน่วยไม่ตรงกับที่ CSS ใช้'));
t('เส้นเกณฑ์อิงความสูงรางโดยตรง ไม่เดาความสูงป้ายชื่อ', () => {
  assert.ok(/\.vbar-track::after/.test(CSS), 'ยังวาดจากขอบนอก');
  const m = CSS.match(/\.vbar-wrap\.has-crit \.vbar-track::after \{[^}]*\}/);
  assert.ok(m && /bottom: calc\(var\(--critN, 0\) \* 100%\)/.test(m[0]),
    'ตำแหน่งเส้นจะเพี้ยนเมื่อผู้ใช้ขยายขนาดตัวอักษร · ' + (m && m[0]));
  assert.ok(/\.vbar-track \{[^}]*position: relative/.test(CSS), 'เส้นจะหลุดออกนอกราง');
});

console.log('\n[4] อ่านออกและใช้ได้จริง');
t('ทุกแท่งมีคำอธิบายเมื่อเอาเมาส์ชี้ บอกจำนวนผ่าน/ทั้งหมด', () =>
  assert.ok(/ผ่าน ' \+ s\(r\['ผ่าน'\]\) \+ ' จาก ' \+ cnt/.test(V), 'เห็นแต่ร้อยละ ไม่รู้ฐาน'));
t('ตัวเลขบนแท่งใช้สีตามระดับเดียวกับแท่ง', () =>
  assert.ok(/vbar-val ' \+ \(has \? b\.text : 'text-gray-400'\)/.test(V), 'สีตัวเลขไม่สอดคล้องกับแท่ง'));
t('ตัวเลขเรียงตรงหลัก และป้ายชื่อไม่ล้น', () => {
  assert.ok(/\.vbar-val[\s\S]{0,160}tabular-nums/.test(CSS), 'ตัวเลขขยับไปมา');
  assert.ok(/\.vbar-wrap \{[\s\S]{0,260}overflow-x: auto/.test(CSS), 'แท่งเยอะจะล้นการ์ด');
});
t('จอเล็กลดความสูงราง ไม่ดันเนื้อหาอื่นตก', () =>
  assert.ok(/max-width: 640px\) \{ \.vbar-track \{ height: 5\.5rem; \} \}/.test(CSS), 'ไม่ได้ปรับให้จอเล็ก'));

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
