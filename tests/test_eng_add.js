/* เพิ่มผลสอบภาษาอังกฤษ : เลือกชั้นปีก่อน แล้วค่อยเลือกนักศึกษา
   จุดที่ต้องไม่พลาด
   1) ยังไม่เลือกชั้นปี ต้องเลือกนักศึกษาไม่ได้
   2) รายชื่อต้องเป็นของชั้นปีนั้นเท่านั้น และเฉพาะผู้ที่กำลังศึกษาอยู่
   3) สลับชั้นปีแล้วค่าที่เลือกไว้ต้องถูกล้าง ไม่ค้างเป็นคนของปีก่อน
   4) id ของช่องกรอกต้องไม่ชนกับชื่อฟังก์ชันใน oninput (เคยพังเงียบมาแล้ว) */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = APP.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = APP.indexOf('{', i); k < APP.length; k++) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

const STU = [
  { student_id: '68101', name: 'ก', year_level: '1', status: 'กำลังศึกษา' },
  { student_id: '68102', name: 'ข', year_level: '1', status: 'กำลังศึกษา' },
  { student_id: '67201', name: 'ค', year_level: '2', status: 'กำลังศึกษา' },
  { student_id: '66301', name: 'ง', year_level: '2', status: 'ลาออก' },
  { student_id: '65401', name: 'จ', year_level: 'จบ', status: 'สำเร็จการศึกษา' },
  { student_id: '', name: 'ไม่มีรหัส', year_level: '1', status: 'กำลังศึกษา' }
];
const env = {
  norm: v => String(v == null ? '' : v).trim(),
  htmlEsc: v => String(v == null ? '' : v).replace(/"/g, '&quot;'),
  getDataByType: tb => tb === 'student' ? STU : [],
  isActiveStudent: s => ['ลาออก', 'สำเร็จการศึกษา'].indexOf(String(s && s.status).trim()) === -1
    && String(s && s.year_level).trim() !== 'จบ',
  studentDisplayName: s => String(s.name || '')
};
const F = new Function(...Object.keys(env),
  [grab('function engYearLevels()'), grab('function engStudentsOf(level)'),
   grab('function engStudentOptionsHTML(level)'), grab('function engStudentPlaceholder(level)')].join('\n')
  + '; return { engYearLevels, engStudentsOf, engStudentOptionsHTML, engStudentPlaceholder };')(...Object.values(env));

console.log('\n[1] รายชื่อตามชั้นปี');
t('ชั้นปีที่ให้เลือกมีเฉพาะปีที่มีนักศึกษากำลังศึกษาอยู่', () => {
  assert.deepStrictEqual(F.engYearLevels(), ['1', '2'], 'ชั้นปี "จบ" ไม่ควรอยู่ในรายการ');
});
t('เลือกชั้นปีแล้วได้เฉพาะคนของปีนั้น', () => {
  assert.deepStrictEqual(F.engStudentsOf('1').map(x => x.student_id), ['68101', '68102']);
  assert.deepStrictEqual(F.engStudentsOf('2').map(x => x.student_id), ['67201'], 'คนที่ลาออกต้องไม่อยู่ในรายการ');
});
t('คนที่ไม่มีรหัสนักศึกษา ต้องไม่อยู่ในรายการ', () => {
  assert.ok(F.engStudentsOf('1').every(x => x.student_id), 'จะบันทึกผลสอบให้คนที่ไม่มีรหัสไม่ได้');
});
t('ยังไม่เลือกชั้นปี ต้องไม่มีรายชื่อให้ค้นหาเลย', () => {
  assert.strictEqual(F.engStudentOptionsHTML(''), '', 'รายชื่อทั้งวิทยาลัยโผล่ตั้งแต่ยังไม่เลือกชั้นปี');
  assert.ok(F.engStudentPlaceholder('').includes('เลือกชั้นปีก่อน'), 'ไม่ได้บอกว่าต้องเลือกชั้นปีก่อน');
});
t('บอกจำนวนคนในชั้นปีที่เลือก', () => {
  assert.ok(F.engStudentPlaceholder('1').includes('(2 คน)'), 'ไม่ได้บอกจำนวน');
  assert.ok(F.engStudentPlaceholder('9').includes('ไม่มีนักศึกษา'), 'ชั้นปีที่ไม่มีคนต้องบอกให้รู้');
});
t('รายการเรียงตามรหัสนักศึกษาและมีชื่อกำกับ', () => {
  const h = F.engStudentOptionsHTML('1');
  assert.ok(h.indexOf('68101') < h.indexOf('68102'), 'ไม่ได้เรียงตามรหัส');
  assert.ok(h.includes('—'), 'ไม่มีชื่อกำกับ จะเลือกผิดคนง่าย');
});

console.log('\n[2] พฤติกรรมของฟอร์ม');
t('ช่องนักศึกษาถูกปิดไว้ก่อน', () => {
  const g = grab('function showAddEngModal()');
  assert.ok(/name="student_id" required disabled/.test(g), 'เลือกนักศึกษาได้ทั้งที่ยังไม่เลือกชั้นปี');
  assert.ok(g.includes('id="addEngLevel"'), 'ไม่มีช่องเลือกชั้นปี');
});
t('สลับชั้นปีแล้วล้างค่าเดิมและโหลดรายชื่อใหม่', () => {
  const g = grab('window.engLevelChanged = function (sel)');
  assert.ok(g.includes("inp.value = ''"), 'ค้างเป็นนักศึกษาของชั้นปีก่อนหน้า');
  assert.ok(g.includes('list.innerHTML = engStudentOptionsHTML(y)'), 'รายชื่อยังเป็นของชั้นปีเดิม');
  assert.ok(g.includes('inp.disabled = !y || !engStudentsOf(y).length'), 'ชั้นปีที่ไม่มีคนยังพิมพ์ได้');
});
t('ยังคำนวณระดับผลสอบ สบช. ต่อเหมือนเดิม', () => {
  assert.ok(grab('window.engLevelChanged = function (sel)').includes('updateEngSbchLevelStatus'),
    'สลับชั้นปีแล้วค่าระดับที่คำนวณไว้ค้างของคนเดิม');
  assert.ok(grab('function showAddEngModal()').includes("updateEngSbchLevelStatus('add')"), 'ช่องนักศึกษาไม่ได้เรียกตัวคำนวณ');
});
t('ไม่มี id ซ้ำกันในฟอร์มเดียวกัน', () => {
  /* บั๊กจริงที่เคยเกิด : ตั้งช่องชั้นปีเป็น id="addEngLevel" ซึ่งซ้ำกับช่อง "ระดับผลการสอบ"
     แล้ว updateEngSbchLevelStatus() เขียนค่าว่างทับ ทำให้เลือกชั้นปีแล้วค่าหายทันที
     ไม่มี error ให้เห็น ต้องกดใช้จริงถึงจะรู้ */
  const g = grab('function showAddEngModal()');
  const ids = (g.match(/id="([A-Za-z0-9_]+)"/g) || []).map(x => x.slice(4, -1));
  const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  assert.deepStrictEqual(dup, [], 'id ซ้ำ: ' + dup.join(', '));
});
t('ช่องชั้นปีไม่ถูกตัวคำนวณระดับผลสอบเขียนทับ', () => {
  const calc = grab('function updateEngSbchLevelStatus(prefix)');
  const written = (calc.match(/getElementById\(prefix \+ '([A-Za-z]+)'\)/g) || [])
    .map(x => 'add' + x.replace(/.*'\+? ?'?/, '').replace(/'\)$/, ''));
  const g = grab('function showAddEngModal()');
  const m = /<select id="([A-Za-z0-9_]+)" onchange="engLevelChanged/.exec(g);
  assert.ok(m, 'ไม่พบช่องเลือกชั้นปี');
  assert.ok(written.indexOf(m[1]) === -1, 'ช่องชั้นปีใช้ id ' + m[1] + ' ซึ่งตัวคำนวณจะเขียนทับ');
  assert.strictEqual(m[1], 'addEngYearLevel', 'เปลี่ยน id ช่องชั้นปีแล้วต้องไม่ไปชนกับช่องอื่น');
});
t('id ของช่องกรอกไม่ชนกับชื่อฟังก์ชันใน oninput/onchange', () => {
  const g = grab('function showAddEngModal()');
  const ids = (g.match(/id="([A-Za-z0-9_]+)"/g) || []).map(x => x.slice(4, -1));
  const handlers = (g.match(/on[a-z]+="([A-Za-z0-9_]+)\(/g) || []).map(x => x.replace(/^on[a-z]+="/, '').replace(/\($/, ''));
  assert.deepStrictEqual(ids.filter(i => handlers.indexOf(i) !== -1), [],
    'id ชนกับชื่อฟังก์ชัน จะได้ element แทนฟังก์ชันแล้วพังเงียบ');
});
t('บอกว่าแสดงเฉพาะผู้ที่กำลังศึกษาอยู่', () => {
  assert.ok(grab('function showAddEngModal()').includes('เฉพาะผู้ที่กำลังศึกษาอยู่'),
    'ผู้ใช้จะงงว่าทำไมหานักศึกษาบางคนไม่เจอ');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
