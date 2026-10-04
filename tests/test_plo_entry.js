/* ประเมินผลหลักสูตร PLOs › บันทึกข้อมูล — ตารางคะแนนเมื่อ CLO มาก และนำเข้า CSV แยก 2 ขั้น */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const PLO = fs.readFileSync(path.join(__dirname, '..', 'plo.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
t('มีมุมมอง "ทีละ CLO" และ "ทุก CLO" — CLO เกิน 6 เริ่มที่ทีละ CLO', () => {
  assert.ok(PLO.includes("var mode = st.gridMode || (rows.length > 6 ? 'one' : 'all');"));
});
t('หัวตารางตรึง + ค้นหานักศึกษา + Enter ไปคนถัดไป', () => {
  assert.ok(PLO.includes('thead class="sticky top-0') && PLO.includes('window.ploGridFilter') && PLO.includes('window.ploScoreKey'));
});
t('เปลี่ยนรายวิชาขณะมีคะแนนค้าง ต้องถามก่อน', () => assert.ok(PLO.includes('ยังมีคะแนนที่แก้ไขแต่ยังไม่ได้บันทึก')));
t('CSV แยกขั้นที่ 1 CLO และขั้นที่ 2 คะแนน', () => {
  assert.ok(PLO.includes('นำเข้า CLO ที่ผูกกับ PLO') && PLO.includes('นำเข้าคะแนนรายคน'));
  assert.ok(PLO.includes("ploCsvPick('clo')") && PLO.includes("ploCsvPick('score')"));
});
t('ขั้นที่ 2 ใช้ได้เมื่อเลือกรายวิชาและมี CLO แล้ว', () => assert.ok(PLO.includes('รายวิชานี้ยังไม่มี CLO — ทำขั้นที่ 1 ก่อน')));
t('อัปโหลดไฟล์ผิดขั้นถูกปฏิเสธ', () => assert.ok(PLO.includes('if (want && got && got !== \'all\' && got !== want)')));
console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
