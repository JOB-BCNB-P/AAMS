/* ฟอร์มบันทึกข้อมูลแบ่งเป็นขั้นตอนมีหมายเลข (steps.js)
   ตรวจว่าทุกฟอร์มในตาราง STEPS ยังมีอยู่จริง และช่องแรกของแต่ละหมวดยังอยู่ในฟอร์มนั้น
   ถ้ามีคนเปลี่ยน name/id ของช่อง หมวดนั้นจะหายไปเงียบ ๆ ชุดทดสอบนี้จะเตือนก่อน */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const SRC = ['app.js', 'eval.js', 'workload.js', 'wellbeing.js'].map(f => fs.readFileSync(P + f, 'utf8')).join('\n');
const STEPSJS = fs.readFileSync(P + 'steps.js', 'utf8');
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
const HTML = fs.readFileSync(P + 'index.html', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

const sb = { window: {}, document: { body: null, addEventListener() { } }, MutationObserver: function () { this.observe = () => { }; } };
sb.window = sb; vm.createContext(sb);
// steps.js หยุดทำงานเองถ้าไม่มี document จริง จึงดึงเฉพาะตาราง STEPS มาประเมิน
const i = STEPSJS.indexOf('var STEPS = {'), j = STEPSJS.indexOf("var FINAL = ");
vm.runInContext(STEPSJS.slice(i, j).replace('var STEPS', 'this.STEPS'), sb);
const STEPS = sb.STEPS;

console.log('[1] ทุกฟอร์มในตาราง STEPS มีอยู่จริง');
Object.keys(STEPS).forEach(id => t(id, () => assert.ok(SRC.includes('<form id="' + id + '"'), 'ไม่พบฟอร์ม ' + id)));

console.log('\n[2] ช่องแรกของแต่ละหมวดยังมีในโค้ด');
const seen = {};
Object.keys(STEPS).forEach(id => STEPS[id].forEach(st => {
  const a = st[1]; if (seen[a]) return; seen[a] = 1;
  t(id + ' › ' + st[0], () => {
    let m;
    if (a[0] === '~') assert.ok(SRC.includes(a.slice(1)), 'ไม่พบข้อความ ' + a);
    else if ((m = a.match(/^\[name="(\w+)"\]$/))) assert.ok(SRC.includes('name="' + m[1] + '"') || SRC.includes("name=\"' + m[1]") || SRC.includes("('" + m[1] + "'"), 'ไม่พบช่อง ' + m[1]);
    else if ((m = a.match(/^#(\w+)$/))) assert.ok(SRC.includes('id="' + m[1] + '"'), 'ไม่พบ id ' + m[1]);
    else assert.fail('รูปแบบตัวเลือกไม่รองรับ ' + a);
  });
}));

console.log('\n[3] โหลดและหน้าตา');
t('โหลด steps.js ต่อจาก draft.js', () => { const a = HTML.indexOf('src="draft.js'), b = HTML.indexOf('src="steps.js'); assert.ok(a > 0 && b > a); });
t('มีสไตล์เลขขั้นตอน และอยู่ก่อนบล็อกลดการเคลื่อนไหว', () => {
  const k = CSS.indexOf('.ems-step-no {'), r = CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(k > 0 && k < r);
});
t('ใบลาของนักศึกษาและแบบประเมินที่นักศึกษาตอบ ไม่ถูกจัดซ้ำ (มีเลขข้อของตัวเองแล้ว)', () => {
  assert.ok(!STEPS.leaveForm && !STEPS.surveyForm && !STEPS.studentEvalForm);
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
