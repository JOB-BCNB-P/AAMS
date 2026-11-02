/* หน้าต่างแก้ไขภาระงานรายบุคคล (ปุ่มดินสอในหน้าสรุปผลรวม)
   จุดที่ต้องไม่พลาด : แก้ไขและลบบางรายการต้องทำได้
   ห้ามไปบล็อกการแก้ไขเพราะเข้าใจผิดว่าเป็นการลบ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const WL = fs.readFileSync(path.join(ROOT, 'workload.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

const save = WL.slice(WL.indexOf('window.wlmSave = async function ()'),
                      WL.indexOf('window.wlmSave = async function ()') + 4200);

console.log('\n[1] ด่านตรวจตอนบันทึกค่าเฉพาะราย');
t('ไม่เทียบรายการแบบตรงตัวทุกตัวอักษรอีกแล้ว', () => {
  assert.ok(!/keep\.indexOf\(JSON\.stringify\(r\)\)/.test(save),
    'ยังเทียบ JSON ทั้งก้อน ทำให้แก้ชั่วโมงแล้วถูกมองว่าเป็นการลบ');
});
t('บล็อกเฉพาะตอนลบจนไม่เหลือรายการ', () => {
  assert.ok(/if \(\(M\.data\[m\.key\] \|\| \[\]\)\.length\) return;/.test(save),
    'ไม่ได้ปล่อยผ่านเมื่อยังเหลือรายการอยู่');
  assert.ok(save.includes('blocked.push(m.short)'), 'ไม่พบการเก็บพันธกิจที่ถูกบล็อก');
});
t('ข้อความบอกสาเหตุและทางแก้', () => {
  assert.ok(save.includes('ลบรายการสุดท้ายของ'), 'ข้อความไม่ได้บอกว่าติดที่รายการสุดท้าย');
  assert.ok(save.includes('ใครเข้าร่วม'), 'ไม่ได้บอกวิธีแก้ที่แผนชั้นปี');
});
t('ยังตรวจสิทธิ์ผู้ดูแลระบบและความครบถ้วนของข้อมูลเหมือนเดิม', () => {
  assert.ok(save.includes('isAdminNow()'), 'ด่านสิทธิ์หายไป');
  assert.ok(save.includes('ชั่วโมงต้องเป็นตัวเลข 0 ขึ้นไป'), 'ด่านตรวจชั่วโมงหายไป');
  assert.ok(save.includes('ยังไม่มีการเปลี่ยนแปลงให้บันทึก'), 'ข้อความตอนไม่มีการแก้ไขหายไป');
});

console.log('\n[2] ตรรกะการตัดสิน');
function guard(missions, data, plan, sid) {
  const norm = v => String(v == null ? '' : v).trim();
  const appliesTo = (r, s) => !r.students || !r.students.length || r.students.indexOf(s) !== -1;
  const blocked = [];
  missions.forEach(m => {
    if ((data[m.key] || []).length) return;
    const fromPlan = (plan[m.key] || []).filter(r => appliesTo(r, sid));
    if (fromPlan.length) blocked.push(m.short);
  });
  return blocked;
}
const M = [{ key: 'teaching', short: 'ด้านวิชาการ' }, { key: 'student', short: 'กิจการนักศึกษา' }];
const PLAN = {
  teaching: [{ subject_name: 'การรู้ดิจิทัล', hours: 32 }],
  student: [{ activity: 'กิจกรรมปลูกจิตสำนึก', hours: 6, students: ['002'] }]
};

t('แก้ชั่วโมงของรายการที่มาจากแผน บันทึกได้', () => {
  const data = { teaching: [{ subject_name: 'การรู้ดิจิทัล', hours: 40 }] };
  assert.deepStrictEqual(guard([M[0]], data, PLAN, '002'), []);
});
t('แก้ชื่อรายการที่มาจากแผน บันทึกได้', () => {
  const data = { teaching: [{ subject_name: 'การรู้ดิจิทัล (ปรับเฉพาะราย)', hours: 32 }] };
  assert.deepStrictEqual(guard([M[0]], data, PLAN, '002'), []);
});
t('ลบบางรายการแต่ยังเหลืออยู่ บันทึกได้', () => {
  const plan2 = { teaching: [{ subject_name: 'ก', hours: 10 }, { subject_name: 'ข', hours: 20 }] };
  const data = { teaching: [{ subject_name: 'ก', hours: 10 }] };
  assert.deepStrictEqual(guard([M[0]], data, plan2, '002'), []);
});
t('ลบจนไม่เหลือ ทั้งที่แผนชั้นปีมีรายการของคนนี้ ต้องถูกบล็อก', () => {
  const data = { student: [] };
  assert.deepStrictEqual(guard([M[1]], data, PLAN, '002'), ['กิจการนักศึกษา']);
});
t('ลบจนไม่เหลือ แต่แผนชั้นปีไม่ได้ให้คนนี้เข้าร่วม บันทึกได้', () => {
  const data = { student: [] };
  assert.deepStrictEqual(guard([M[1]], data, PLAN, '999'), [],
    'คนที่ไม่ได้อยู่ในช่องผู้เข้าร่วม ไม่ควรถูกบล็อก');
});
t('ลบจนไม่เหลือ และแผนชั้นปีก็ไม่มีรายการเลย บันทึกได้', () => {
  const data = { student: [] };
  assert.deepStrictEqual(guard([M[1]], data, { student: [] }, '002'), []);
});
t('เพิ่มรายการใหม่ในพันธกิจที่แผนไม่มี บันทึกได้', () => {
  const data = { student: [{ activity: 'กิจกรรมที่นักศึกษาทำเอง', hours: 3 }] };
  assert.deepStrictEqual(guard([M[1]], data, { student: [] }, '002'), []);
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
