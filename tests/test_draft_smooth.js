/* รอบ 2026-10-05 : ถอดหน้าบันทึกการเปลี่ยนรหัสผ่าน · บันทึกการให้คำปรึกษาเลือกนักศึกษาก่อน
   · ข้อมูลที่กรอกค้างไม่หายเมื่อสลับหน้าจอ · สลับหน้าแบบนุ่ม */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const APPJS = fs.readFileSync(P + 'app.js', 'utf8');
const CS = fs.readFileSync(P + 'counsel.js', 'utf8');
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
const DB = fs.readFileSync(P + 'supabase-db.js', 'utf8');
const HTML = fs.readFileSync(P + 'index.html', 'utf8');
const DR = fs.readFileSync(P + 'draft.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('[1] ถอดหน้าบันทึกการเปลี่ยนรหัสผ่าน');
t('หน้าตั้งค่าไม่มีแท็บ/หน้าบันทึกการเปลี่ยนรหัสผ่าน', () => {
  assert.ok(!APPJS.includes("changeSettingsTab('pwlog')") && !APPJS.includes('function passwordLogSection'));
});
t('ไม่โหลดตาราง password_log ตอนเปิดระบบแล้ว', () => {
  const i = DB.indexOf('const SHEET_TABS = ['), j = DB.indexOf('];', i);
  assert.ok(!/'password_log'/.test(DB.slice(i, j)));
});

console.log('\n[2] บันทึกการให้คำปรึกษา');
const ep = CS.slice(CS.indexOf('function editPage()'), CS.indexOf('function validate(d)'));
t('เลือกนักศึกษาก่อน แล้วจึงกรอกข้อมูลทั่วไป ประเด็นปัญหา ช่องทาง ผลการให้คำปรึกษา', () => {
  const ret = ep.slice(ep.lastIndexOf('return '));
  const order = ['pickBox', 'general', 'issueBox', 'midBox', 'referBox'].map(k => ret.indexOf(k));
  order.forEach(i => assert.ok(i > 0));
  assert.deepStrictEqual(order.slice().sort((a, b) => a - b), order, 'ลำดับไม่ถูก');
});
t('ไม่มีตาราง "รายชื่อนักศึกษาที่เลือกแล้ว" ซ้ำอีกชุด', () => {
  assert.ok(!ep.includes('รายชื่อนักศึกษาที่เลือกแล้ว') && !ep.includes('specBox'));
});
t('เลือกได้หลายคน (ติ๊กรายชั้นปี + ค้นหาเพิ่ม) และเอาติ๊กออกได้ทุกคน', () => {
  assert.ok(ep.includes('yearBlock(d, y)') && ep.includes('counselAddOne()'));
  assert.ok(CS.includes('if (!c.checked && i >= 0) d.picked.splice(i, 1);'));
});
t('ร่างการให้คำปรึกษาไม่หายเมื่อสลับหน้า', () => {
  assert.ok(CS.includes("st.draft && st.dirty && st.draft.__code === s(code)"));
  assert.ok(CS.includes("sessionStorage.setItem(DRAFT_KEY"));
});

console.log('\n[3] ฟอร์มที่กรอกค้าง');
t('โหลด draft.js หลังไฟล์อื่นทั้งหมด', () => {
  const i = HTML.indexOf('src="draft.js'), j = HTML.indexOf('src="profile.js');
  assert.ok(i > j && j > 0);
});
t('ไม่เก็บรหัสผ่าน/ไฟล์/ช่องซ่อน และผูกกับผู้ใช้', () => {
  assert.ok(/SKIP_TYPES = \/\^\(file\|password\|hidden/.test(DR));
  assert.ok(DR.includes('function who()'));
});
t('บันทึกสำเร็จลบร่าง · ออกจากระบบลบร่างทั้งหมด', () => {
  assert.ok(DR.includes("if (res && res.isOk) onSaved()"));
  assert.ok(DR.includes('window.emsDraftClearAll();'));
});

console.log('\n[4] สลับหน้าแบบนุ่ม');
t('เข้าหน้าใหม่เล่นแอนิเมชัน แต่วาดซ้ำในหน้าเดิมไม่กระพริบ', () => {
  const f = APPJS.slice(APPJS.indexOf('function renderCurrentPage()'), APPJS.indexOf('function emsSwapPage'));
  assert.ok(f.includes("'ems-page-in'") && f.includes("'ems-page'") && !f.includes('fade-in'));
});
t('สลับเมนูใช้ View Transitions เมื่อรองรับ', () => {
  assert.ok(APPJS.includes('emsSwapPage(() => renderCurrentPage());'));
  assert.ok(CSS.includes('::view-transition-old(ems-main)') && CSS.includes('view-transition-name: ems-main'));
});
t('มีแอนิเมชันของแท็บ และการกางรายละเอียด', () => {
  assert.ok(CSS.includes('.ems-tab-in') && CSS.includes('details[open] > *:not(summary)'));
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
