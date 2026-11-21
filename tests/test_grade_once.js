/* ส่งเกรดเข้าหน้าผลการเรียนได้ครั้งเดียวต่อรายวิชา/ปี/ภาค
   รายวิชาที่มีเกรดอยู่แล้ว ปุ่มต้องหายไป และเรียกจากทางอื่นก็ต้องไม่ผ่าน */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const P = path.join(__dirname, '..') + path.sep;
const PL = fs.readFileSync(P + 'plo.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
function grab(sig) {
  const i = PL.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = PL.indexOf('{', i + sig.length); k < PL.length; k++) {
    if (PL[k] === '{') d++; else if (PL[k] === '}') { d--; if (!d) return PL.slice(i, k + 1); }
  }
  throw new Error('อ่านไม่จบ');
}

let STATE = {}, ROWS = [];
const ctx = vm.createContext({
  state: () => STATE,
  get: () => ROWS,
  s: v => String(v == null ? '' : v).trim()
});
vm.runInContext([grab('function semKey(v)'), grab('function gradeKey()'), grab('function gradedCount()'),
  'var _gradeSent = {};', grab('function gradeSent()')].join('\n'), ctx);
const G = {
  count: () => vm.runInContext('gradedCount()', ctx),
  sent: () => vm.runInContext('gradeSent()', ctx),
  mark: () => vm.runInContext('_gradeSent[gradeKey()] = true', ctx),
  clear: () => vm.runInContext('_gradeSent = {}', ctx)
};
const base = { eYear: '2569', eSem: 'ภาค 1', eSubject: '0101300419' };

console.log('[1] นับเฉพาะแถวที่เป็นรายวิชา ปี และภาคเดียวกัน');
t('ตรงทุกอย่าง นับ', () => {
  STATE = { ...base };
  ROWS = [{ subject_code: '0101300419', academic_year: '2569', semester: 'ภาค 1', grade: 'B+' }];
  assert.strictEqual(G.count(), 1);
});
t('คนละรายวิชา ไม่นับ', () => {
  ROWS = [{ subject_code: '0101300420', academic_year: '2569', semester: 'ภาค 1', grade: 'A' }];
  assert.strictEqual(G.count(), 0);
});
t('คนละปีการศึกษา ไม่นับ', () => {
  ROWS = [{ subject_code: '0101300419', academic_year: '2568', semester: 'ภาค 1', grade: 'A' }];
  assert.strictEqual(G.count(), 0, 'วิชาเดียวกันคนละปี จะบล็อกการส่งของปีใหม่');
});
t('คนละภาคการศึกษา ไม่นับ', () => {
  ROWS = [{ subject_code: '0101300419', academic_year: '2569', semester: 'ภาค 2', grade: 'A' }];
  assert.strictEqual(G.count(), 0);
});
t('ภาคเขียนต่างรูปแบบ แต่เป็นภาคเดียวกัน ต้องนับ', () => {
  ROWS = [{ subject_code: '0101300419', academic_year: '2569', semester: '1', grade: 'A' }];
  assert.strictEqual(G.count(), 1, 'เก็บเป็น "1" กับ "ภาค 1" ต้องถือว่าภาคเดียวกัน');
});
t('ภาคฤดูร้อนไม่ปนกับภาค 3 ที่เขียนเป็นตัวเลข', () => {
  STATE = { ...base, eSem: 'ภาคฤดูร้อน' };
  ROWS = [{ subject_code: '0101300419', academic_year: '2569', semester: '3', grade: 'A' }];
  assert.strictEqual(G.count(), 1);
  STATE = { ...base };
});

console.log('\n[2] อ่านค่าที่เก็บใน extra ได้เหมือนตอนส่ง');
t('ปี ภาค และเกรด อยู่ใน extra ก็ยังนับ', () => {
  ROWS = [{ subject_code: '0101300419', extra: { academic_year: '2569', semester: 'ภาค 1', grade: 'C' } }];
  assert.strictEqual(G.count(), 1, 'จะมองไม่เห็นเกรดที่ส่งไปก่อนหน้า แล้วส่งซ้ำได้');
});

console.log('\n[3] แถวที่ยังไม่มีเกรด ไม่ถือว่าส่งแล้ว');
t('มีแถวแต่เกรดว่าง ต้องยังส่งได้', () => {
  ROWS = [{ subject_code: '0101300419', academic_year: '2569', semester: 'ภาค 1', grade: '' }];
  assert.strictEqual(G.count(), 0, 'แถวเปล่าจะบล็อกการส่งทั้งที่ยังไม่มีเกรด');
  assert.strictEqual(G.sent(), false);
});
t('ยังไม่เลือกรายวิชา ต้องไม่นับอะไรเลย', () => {
  STATE = { ...base, eSubject: '' };
  ROWS = [{ subject_code: '', academic_year: '2569', semester: 'ภาค 1', grade: 'A' }];
  assert.strictEqual(G.count(), 0);
  STATE = { ...base };
});

console.log('\n[4] ธงของรอบนี้');
t('เพิ่งส่งสำเร็จ ถือว่าส่งแล้วทันที ไม่ต้องรอโหลดข้อมูลใหม่', () => {
  ROWS = [];
  G.clear();
  assert.strictEqual(G.sent(), false);
  G.mark();
  assert.strictEqual(G.sent(), true);
});
t('ธงผูกกับรายวิชา ปี ภาค ไม่ลามไปวิชาอื่น', () => {
  STATE = { ...base, eSubject: '0101300420' };
  assert.strictEqual(G.sent(), false, 'ส่งวิชาหนึ่งแล้วไปบล็อกอีกวิชา');
  STATE = { ...base };
  assert.strictEqual(G.sent(), true);
  G.clear();
});

console.log('\n[5] ส่วนที่แสดงผลและด่านกันซ้ำ');
t('ส่งแล้วแสดงสถานะแทนปุ่ม', () => {
  assert.ok(/\+ \(gradeSent\(\)\n\s*\? '<span class="inline-flex[^']*bg-emerald-50/.test(PL),
    'ยังขึ้นปุ่มให้กดซ้ำ');
  assert.ok(/ส่งเกรดเข้าหน้าผลการเรียนแล้ว/.test(PL), 'ไม่มีข้อความบอกสถานะ');
});
t('ปุ่มจะขึ้นก็ต่อเมื่อยังไม่ส่ง และมีสิทธิ์', () => {
  const i = PL.indexOf('+ (gradeSent()');
  const seg = PL.slice(i, i + 900);
  assert.ok(seg.indexOf('canPushGrade()') > seg.indexOf('ส่งเกรดเข้าหน้าผลการเรียนแล้ว'),
    'ลำดับเงื่อนไขผิด คนไม่มีสิทธิ์อาจเห็นปุ่ม');
  assert.ok(/ploGradePush\(\)/.test(seg), 'ไม่มีปุ่มส่งเหลืออยู่เลย');
});
t('เรียกฟังก์ชันส่งตรง ๆ ก็ต้องถูกปฏิเสธ', () => {
  const fn = grab('window.ploGradePush = async function ()');
  assert.ok(/if \(gradeSent\(\)\)/.test(fn), 'ด่านกันซ้ำอยู่ที่ปุ่มอย่างเดียว เรียกจากคอนโซลยังส่งซ้ำได้');
  assert.ok(fn.indexOf('if (gradeSent())') < fn.indexOf("from('grade')"),
    'ตรวจหลังยิงฐานข้อมูลแล้ว ควรตรวจก่อน');
});
t('ติดธงเฉพาะเมื่อส่งสำเร็จอย่างน้อยหนึ่งรายการ', () => {
  const fn = grab('window.ploGradePushRun = async function ()');
  assert.ok(/if \(ok > 0\) _gradeSent\[gradeKey\(\)\] = true;/.test(fn),
    'ส่งไม่สำเร็จเลยแต่ปุ่มหาย จะส่งใหม่ไม่ได้');
  assert.ok(/if \(ok > 0 && typeof renderCurrentPage/.test(fn), 'ปุ่มไม่หายจนกว่าจะโหลดหน้าใหม่');
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
