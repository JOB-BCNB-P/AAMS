/* ระบบการลาของนักศึกษา — รายวิชาที่ให้เลือกต้องเป็นของปีการศึกษาปัจจุบันเท่านั้น
   จุดที่ต้องไม่พลาด : ถ้าหลุดรายวิชาของปีเก่าเข้ามา สถิติการลารายวิชาจะเพี้ยน */
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

const F = new Function(`${grab('function currentAcademicYearBE()')} return currentAcademicYearBE;`)();

console.log('\n[1] ปีการศึกษาปัจจุบัน');
t('เดือนมิถุนายนเป็นต้นไป นับเป็นปีการศึกษาของปีนั้น', () => {
  const real = Date;
  global.Date = class extends real { constructor() { super('2026-10-26T00:00:00Z'); } getFullYear() { return 2026; } getMonth() { return 9; } };
  assert.strictEqual(F(), '2569');
  global.Date = real;
});
t('ก่อนเดือนมิถุนายน ยังนับเป็นปีการศึกษาก่อนหน้า', () => {
  const real = Date;
  global.Date = class extends real { constructor() { super('2026-02-10T00:00:00Z'); } getFullYear() { return 2026; } getMonth() { return 1; } };
  assert.strictEqual(F(), '2568');
  global.Date = real;
});

console.log('\n[2] ตัวกรองรายวิชาในแบบฟอร์มบันทึกการลา');
const form = APP.slice(APP.indexOf('const allSubjects = getDataByType(\'subject\')'),
                       APP.indexOf('const leaveFormCard'));
t('กรองรายวิชาด้วยปีการศึกษาปัจจุบัน', () => {
  assert.ok(form.includes('currentAcademicYearBE()'), 'ไม่ได้อ่านปีการศึกษาปัจจุบัน');
  assert.ok(/subjects\s*=\s*subjects\.filter\(.*academic_year.*_leaveAcadYear/.test(form),
    'ไม่พบการกรองรายวิชาตามปีการศึกษา');
});
t('กรองหลังจากคัดตามรุ่นและชั้นปีแล้ว', () => {
  const a = form.indexOf('norm(s.year_level) === norm(stuYearLevel)');
  const b = form.indexOf('_leaveAcadYear');
  assert.ok(a > -1 && b > -1 && a < b, 'ลำดับการกรองเปลี่ยนไป อาจกรองผิดชุดข้อมูล');
});
t('ตรรกะการกรองทำงานถูกต้อง', () => {
  const rows = [
    { subject_name: 'ก', academic_year: '2569' },
    { subject_name: 'ข', academic_year: '2568' },
    { subject_name: 'ค', academic_year: '2567' },
    { subject_name: 'ง', academic_year: '' },
    { subject_name: 'จ', academic_year: ' 2569 ' }
  ];
  const norm = v => String(v == null ? '' : v).trim();
  const got = rows.filter(s => norm(s.academic_year) === '2569').map(s => s.subject_name);
  assert.deepStrictEqual(got, ['ก', 'จ'], 'ต้องเหลือเฉพาะรายวิชาปี 2569 และต้องตัดช่องว่างหน้าหลังให้ด้วย');
});

console.log('\n[3] สื่อสารกับผู้ใช้');
const card = APP.slice(APP.indexOf('const leaveFormCard'), APP.indexOf('const leaveFormCard') + 9000);
t('บอกบนหน้าจอว่ารายการนี้เป็นของปีการศึกษาใด', () => {
  assert.ok(card.includes('แสดงเฉพาะรายวิชาปีการศึกษา'), 'ไม่ได้บอกผู้ใช้ว่ากรองตามปีการศึกษา');
});
t('ข้อความตอนไม่มีรายวิชา บอกปีการศึกษาและทางแก้', () => {
  assert.ok(card.includes('ในปีการศึกษา ${_leaveAcadYear}'), 'ข้อความไม่ได้ระบุปีการศึกษา');
  assert.ok(card.includes('แจ้งงานวิชาการ'), 'ไม่ได้บอกว่าควรทำอย่างไรต่อ');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
