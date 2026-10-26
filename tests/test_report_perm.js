/* เมนูรายงาน — สิทธิ์แยกกันระหว่างผลสอบสภาฯ กับการได้งานทำของศิษย์เก่า
   จุดที่ต้องไม่พลาด : ตารางรายบุคคล/เงินเดือน ต้องไม่เปิดตามตารางสิทธิ์ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const RP = fs.readFileSync(path.join(ROOT, 'report.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

console.log('\n[1] ตารางสิทธิ์ในหน้าตั้งค่าระบบ');
const seg = APP.slice(APP.indexOf('function settingsPage()'), APP.indexOf('function settingsPage()') + 4000);
t('มีสองโมดูลแยกกัน', () => {
  assert.ok(/const modules = \[[^\]]*'reportExam'/.test(seg), 'ไม่มีแถวผลสอบสภาฯ');
  assert.ok(/const modules = \[[^\]]*'reportJob'/.test(seg), 'ไม่มีแถวการได้งานทำ');
  assert.ok(!/const modules = \[[^\]]*'report'[,\s]/.test(seg), 'ยังมีแถวรวมเดิมค้างอยู่');
});
t('มีชื่อภาษาไทยกำกับทั้งสองแถว', () => {
  assert.ok(seg.includes("reportExam: 'รายงาน — ผลสอบสภาการพยาบาล'"), 'ชื่อแถวผลสอบสภาฯ ไม่ถูก');
  assert.ok(seg.includes("reportJob: 'รายงาน — การได้งานทำของศิษย์เก่า'"), 'ชื่อแถวการได้งานทำไม่ถูก');
});
t('วางต่อจากบริการอื่นๆ และเรียงติดกัน', () => {
  const m = /const modules = \[([^\]]*)\]/.exec(seg);
  const list = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
  const i = list.indexOf('reportExam');
  assert.strictEqual(list[i - 1], 'services', 'ลำดับไม่ตรงกับเมนูจริง');
  assert.strictEqual(list[i + 1], 'reportJob', 'สองแถวรายงานไม่ได้อยู่ติดกัน');
});

console.log('\n[2] ค่าตั้งต้นของสิทธิ์');
const perms = APP.slice(APP.indexOf('permissions: {'), APP.indexOf('filters: {'));
t('บทบาทที่เคยเห็นเมนูรายงาน ได้สิทธิ์ตั้งต้นทั้งสองรายงาน', () => {
  ['admin', 'academic', 'registrar', 'deptHead', 'executive'].forEach(r => {
    const i = perms.indexOf(r + ': {');
    assert.ok(i > -1, 'ไม่พบบทบาท ' + r);
    const body = perms.slice(i, perms.indexOf('}', i));
    assert.ok(/\breportExam: 1\b/.test(body), 'บทบาท ' + r + ' ไม่ได้สิทธิ์ผลสอบสภาฯ');
    assert.ok(/\breportJob: 1\b/.test(body), 'บทบาท ' + r + ' ไม่ได้สิทธิ์การได้งานทำ');
  });
});
t('บทบาทที่ไม่เคยเห็น ต้องไม่ได้สิทธิ์ตั้งต้น', () => {
  ['teacher', 'classTeacher', 'student', 'otherStaff'].forEach(r => {
    const i = perms.indexOf(r + ': {');
    const body = perms.slice(i, perms.indexOf('}', i));
    assert.ok(!/\breport(Exam|Job): 1\b/.test(body), 'บทบาท ' + r + ' ได้สิทธิ์รายงานเกินมา');
  });
});

console.log('\n[3] ตรรกะการตัดสินสิทธิ์');
const VIEW_ROLES = ['admin', 'academic', 'registrar', 'executive', 'deptHead'];
function mk(APPX) {
  function roles() { return (APPX._roles && APPX._roles.length) ? APPX._roles : [APPX.currentRole]; }
  function hasRole(l) { return roles().some(r => l.indexOf(r) !== -1); }
  function permAllows(key) {
    var perms = (APPX && APPX.permissions) || {}, decided = false;
    var allowed = roles().some(function (r) {
      var p = perms[r] || {};
      var k = Object.prototype.hasOwnProperty.call(p, key) ? key
            : (Object.prototype.hasOwnProperty.call(p, 'report') ? 'report' : '');
      if (!k) return false;
      decided = true;
      return !!p[k];
    });
    if (allowed) return true;
    if (decided) return false;
    return hasRole(VIEW_ROLES);
  }
  return { exam: () => permAllows('reportExam'), job: () => permAllows('reportJob') };
}
t('เปิดผลสอบสภาฯ อย่างเดียว การได้งานทำต้องปิด', () => {
  const f = mk({ currentRole: 'deptHead', permissions: { deptHead: { reportExam: 1, reportJob: 0 } } });
  assert.strictEqual(f.exam(), true);
  assert.strictEqual(f.job(), false);
});
t('เปิดการได้งานทำอย่างเดียว ผลสอบสภาฯ ต้องปิด', () => {
  const f = mk({ currentRole: 'executive', permissions: { executive: { reportExam: 0, reportJob: 1 } } });
  assert.strictEqual(f.exam(), false);
  assert.strictEqual(f.job(), true);
});
t('ปิดทั้งสอง ต้องไม่เห็นอะไรเลย', () => {
  const f = mk({ currentRole: 'admin', permissions: { admin: { reportExam: 0, reportJob: 0 } } });
  assert.strictEqual(f.exam(), false);
  assert.strictEqual(f.job(), false);
});
t('ยังไม่เคยตั้งค่าเลย ใช้ค่าตั้งต้นเดิม', () => {
  const a = mk({ currentRole: 'executive', permissions: {} });
  assert.strictEqual(a.exam(), true);
  assert.strictEqual(a.job(), true);
  const b = mk({ currentRole: 'teacher', permissions: {} });
  assert.strictEqual(b.exam(), false);
  assert.strictEqual(b.job(), false);
});
t('ค่ารวม report ของรุ่นก่อน ยังใช้ได้ทั้งสองรายงาน', () => {
  const on = mk({ currentRole: 'teacher', permissions: { teacher: { report: 1 } } });
  assert.strictEqual(on.exam(), true);
  assert.strictEqual(on.job(), true);
  const off = mk({ currentRole: 'admin', permissions: { admin: { report: 0 } } });
  assert.strictEqual(off.exam(), false);
  assert.strictEqual(off.job(), false);
});
t('ค่าของรายงานนั้นเอง ต้องชนะค่ารวมของรุ่นก่อน', () => {
  const f = mk({ currentRole: 'admin', permissions: { admin: { report: 1, reportJob: 0 } } });
  assert.strictEqual(f.exam(), true, 'ผลสอบสภาฯ ไม่มีค่าเฉพาะ จึงใช้ค่ารวม');
  assert.strictEqual(f.job(), false, 'การได้งานทำมีค่าเฉพาะว่าปิด ต้องชนะค่ารวม');
});
t('หลายบทบาท บทบาทใดบทบาทหนึ่งมีสิทธิ์ก็เห็นได้', () => {
  const f = mk({ currentRole: 'teacher', _roles: ['teacher', 'registrar'],
                 permissions: { teacher: { reportExam: 0 }, registrar: { reportExam: 1 } } });
  assert.strictEqual(f.exam(), true);
});

console.log('\n[4] หน้าจอและเมนูใช้สิทธิ์ของตัวเอง');
t('หน้าผลสอบสภาฯ ตรวจสิทธิ์ของตัวเอง', () => {
  const g = grab(RP, 'function examPage()');
  assert.ok(g.includes('canExam()'), 'ยังใช้สิทธิ์รวม');
  assert.ok(g.includes('ผลสอบสภาการพยาบาล'), 'ข้อความปฏิเสธไม่บอกว่าเป็นรายงานใด');
});
t('หน้าการได้งานทำ ตรวจสิทธิ์ของตัวเอง', () => {
  const g = grab(RP, 'function jobPage()');
  assert.ok(g.includes('canJob()'), 'ยังใช้สิทธิ์รวม');
  assert.ok(g.includes('การได้งานทำของศิษย์เก่า'), 'ข้อความปฏิเสธไม่บอกว่าเป็นรายงานใด');
});
t('เมนูแสดงเฉพาะรายงานที่มีสิทธิ์', () => {
  const g = grab(RP, 'function addItem()');
  assert.ok(g.includes('SUB.filter'), 'ไม่ได้คัดเมนูย่อยตามสิทธิ์');
  assert.ok(g.includes('if (!subs.length) return;'), 'ไม่มีสิทธิ์สักอันแต่ยังขึ้นกลุ่มเมนู');
  assert.ok(g.includes('subs.length === 1'), 'เหลือรายงานเดียวแล้วยังทำเป็นกลุ่มพับ');
  assert.ok(!/\bSUB\.map\b/.test(g), 'ยังวาดเมนูย่อยจากรายการเต็ม ไม่ใช่รายการที่คัดแล้ว');
});

console.log('\n[5] ข้อมูลส่วนบุคคลต้องไม่เปิดตามตารางสิทธิ์');
t('ตารางรายบุคคลและเงินเดือนยังคุมด้วยบทบาทตายตัว', () => {
  const cd = RP.slice(RP.indexOf('function canSeeDetail()'), RP.indexOf('function canSeeDetail()') + 200);
  assert.ok(cd.includes('DETAIL_ROLES'), 'ขอบเขตสิทธิ์ดูข้อมูลรายบุคคลเปลี่ยนไป');
  assert.ok(!cd.includes('permAllows'), 'ข้อมูลรายบุคคลไม่ควรเปิดได้ด้วยการติ๊กในตารางสิทธิ์');
  assert.ok(RP.includes("var DETAIL_ROLES = ['admin', 'academic', 'registrar']"), 'รายชื่อบทบาทเปลี่ยนไป');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
