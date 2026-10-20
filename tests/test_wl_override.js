/* ภาระงานนักศึกษา — ค่าเฉพาะรายที่เป็น "[]" ต้องไม่บังรายการของชั้นปี
   ที่มาของบั๊ก : บันทึกแบบกลุ่มขณะที่ร่างของพันธกิจนั้นยังว่าง จะเขียน "[]" ลงทุกคน
   ผลคือกรอกกิจกรรม (เช่น ด้านกิจการนักศึกษา) ที่ระดับชั้นปีแล้วคนเหล่านั้นขึ้น 0% ตลอด */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WL = fs.readFileSync(path.join(__dirname, '..', 'workload.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('\n[1] ตัวตัดสินว่าค่าเฉพาะรายมีผลจริง');

// ดึงฟังก์ชันจริงจากไฟล์มาทดสอบพฤติกรรม ไม่ใช่แค่ตรวจข้อความ
function build() {
  const grab = (sig) => {
    const i = WL.indexOf(sig);
    assert.ok(i > -1, 'ไม่พบ ' + sig);
    let d = 0, j = WL.indexOf('{', i);
    for (let k = j; k < WL.length; k++) {
      if (WL[k] === '{') d++;
      else if (WL[k] === '}') { d--; if (!d) return WL.slice(i, k + 1); }
    }
    throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
  };
  const stub = `
    function norm(v) { return String(v == null ? '' : v).trim(); }
    function parseRows(rec, m) { try { var a = JSON.parse(rec[m.field] || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function rows(rec, m) { return rec ? parseRows(rec, m) : []; }
  `;
  return new Function(stub + grab('function ovrApplies(ovr, m)') + grab('function fieldJson(list)')
    + 'return { ovrApplies: ovrApplies, fieldJson: fieldJson };')();
}
const F = build();
const M = { field: 'student_json' };

t('ไม่มีระเบียนค่าเฉพาะราย = ใช้ค่ามาตรฐานของชั้นปี', () => assert.strictEqual(F.ovrApplies(null, M), false));
t('ช่องว่าง = ใช้ค่ามาตรฐานของชั้นปี', () => assert.strictEqual(F.ovrApplies({ student_json: '' }, M), false));
t('"[]" ต้องไม่บังรายการของชั้นปี (บั๊กเดิม)', () => assert.strictEqual(F.ovrApplies({ student_json: '[]' }, M), false));
t('JSON เสียก็ไม่บัง', () => assert.strictEqual(F.ovrApplies({ student_json: '{oops' }, M), false));
t('มีรายการจริงจึงถือว่าปรับเฉพาะราย', () => assert.strictEqual(F.ovrApplies({ student_json: '[{"activity":"จิตอาสา","hours":"5"}]' }, M), true));

console.log('\n[2] ไม่สร้าง "[]" ขึ้นใหม่ตอนบันทึก');
t('ร่างว่างเก็บเป็นค่าว่าง ไม่ใช่ "[]"', () => {
  assert.strictEqual(F.fieldJson([]), '');
  assert.strictEqual(F.fieldJson(null), '');
  assert.strictEqual(F.fieldJson([{ hours: '5' }]), '[{"hours":"5"}]');
});
t('ทุกจุดที่เขียนตาราง workload_student ใช้ fieldJson', () => {
  assert.ok(WL.includes('p0[m.field] = fieldJson(d[mkey] || []);'), 'บันทึกพันธกิจเดียวแบบกลุ่ม');
  assert.ok(WL.includes('p0[m.field] = fieldJson(d[m.key] || []);'), 'บันทึกทั้งหน้าแบบกลุ่ม');
  assert.ok(WL.includes('p2[m.field] = fieldJson(M.data[m.key]);'), 'บันทึกจากหน้าต่างแก้ไขรายบุคคล');
  assert.ok(WL.includes('payload[m.field] = fieldJson(list);'), 'นักศึกษาบันทึกของตัวเอง');
});

console.log('\n[3] ทุกจุดที่อ่านค่าเฉพาะรายใช้ตัวตัดสินเดียวกัน');
t('ไม่มีการเทียบ "ไม่ว่าง" แบบเดิมหลงเหลือ', () => {
  const left = WL.split('\n')
    .map((l, i) => ({ l, i: i + 1 }))
    .filter(x => /norm\((ovr|base|M\.ovr)\[m\.field\]\) !== ''/.test(x.l) && !/function ovrApplies/.test(x.l));
  const inHelper = left.filter(x => !/return !!\(ovr &&/.test(x.l));
  assert.strictEqual(inHelper.length, 0, 'ยังเหลือที่บรรทัด ' + inHelper.map(x => x.i).join(', '));
});
t('คิดชั่วโมง · รายการของตัวเอง · รายละเอียดรายบุคคล · ร่าง · หน้าต่างแก้ไข ใช้ ovrApplies', () => {
  assert.strictEqual((WL.match(/ovrApplies\(/g) || []).length >= 7, true);
});
t('ป้าย "ปรับเฉพาะราย" นับเฉพาะค่าที่มีผลจริง', () => {
  assert.ok(WL.includes('if (ovr && MISSIONS.some(function (mm) { return ovrApplies(ovr, mm); })) extra = true;'));
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
