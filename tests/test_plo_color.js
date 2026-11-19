/* สีสันและตัวควบคุมในหน้า PLO : การ์ดเน้น ปุ่มเลื่อน ชิปส่วนย่อย เลขลำดับ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const PL = fs.readFileSync(P + 'plo.js', 'utf8');
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

console.log('[1] การ์ดเน้น');
t('สีมาจากระดับการบรรลุ ไม่ใช่สีตายตัว', () => {
  assert.ok(/--g1:' \+ b\.g1 \+ ';--g2:' \+ b\.g2/.test(PL), 'ใช้สีตายตัว การ์ดจะไม่บอกสถานะ');
  ['red', 'amber', 'sky', 'emerald'].forEach(k =>
    assert.ok(new RegExp(k + ":[\\s\\S]{0,200}?g1: '#").test(PL), 'ระดับ ' + k + ' ไม่มีคู่สี'));
});
t('ระดับที่ไม่รู้จักยังมีคู่สี ไม่หลุดเป็นสีเริ่มต้นของเบราว์เซอร์', () =>
  assert.ok(/var GREY = \{[^}]*g1: '#/.test(PL), 'ไม่มีคู่สีสำรอง'));
t('ตัวอักษรบนพื้นเข้มเป็นสีขาว', () =>
  assert.ok(/\.ems-accent p \{ color: #fff; \}/.test(CSS), 'ตัวอักษรจะจมไปกับพื้น'));
t('มีแถบแสดงร้อยละ และไม่ล้นกรอบ', () => {
  assert.ok(/ems-accent-bar/.test(PL) && /\.ems-accent-bar/.test(CSS), 'ไม่มีแถบ');
  assert.ok(/Math\.max\(0, Math\.min\(100, pct\)\)/.test(PL), 'ค่าเกิน 100 จะดันแถบล้น');
});

console.log('\n[2] ปุ่มเลื่อนสลับมุมมอง');
t('รวมอยู่ในกรอบเดียว บอกว่าเป็นตัวเลือกชุดเดียวกัน', () =>
  assert.ok(/class="ems-switch" role="group"/.test(PL) && /\.ems-switch \{/.test(CSS), 'ยังเป็นปุ่มแยก'));
t('บอกสถานะให้โปรแกรมอ่านหน้าจอด้วย ไม่ใช่แค่เปลี่ยนสี', () =>
  assert.ok(/aria-pressed="' \+ \(on \? 'true' : 'false'\)/.test(PL), 'ไม่มี aria-pressed'));
t('ปุ่มที่เลือกอยู่ต่างชัดเจน ไม่ใช่แค่เข้มขึ้นนิดเดียว', () => {
  const m = CSS.match(/\.ems-switch-btn\.is-on \{[^}]*\}/);
  assert.ok(m && /background: #fff/.test(m[0]) && /font-weight: 600/.test(m[0]), 'แยกยาก · ' + (m && m[0]));
});
t('มีกรอบโฟกัสสำหรับคนใช้แป้นพิมพ์', () =>
  assert.ok(/\.ems-switch-btn:focus-visible/.test(CSS), 'กดด้วย Tab แล้วไม่รู้ว่าอยู่ปุ่มไหน'));
t('เป็น type=button ไม่ไปส่งฟอร์มโดยไม่ตั้งใจ', () =>
  assert.ok(/<button type="button" onclick="ploSet\(/.test(PL), 'อยู่ในฟอร์มแล้วจะกลายเป็นปุ่มส่ง'));

console.log('\n[3] ชิปส่วนย่อยและเลขลำดับ');
t('ไม่ใช้คลาสสีที่ไม่มีใน tailwind.css ที่ build ไว้', () =>
  assert.ok(!/'[^']*bg-violet-\d/.test(PL), 'ชิปจะไม่มีสีเลย'));
t('ทฤษฎี ทดลอง และที่รวมกัน ใช้สีต่างกันทั้งสามแบบ', () => {
  assert.ok(/'bg-sky-50 text-sky-700/.test(PL), 'ไม่มีสีของทฤษฎี');
  assert.ok(/'bg-rose-50 text-rose-700/.test(PL), 'ไม่มีสีของทดลอง');
  assert.ok(/bg-indigo-50 text-indigo-700/.test(PL), 'ชิปที่รวมผลแล้วยังเป็นเทา แยกไม่ออก');
});
t('เลขลำดับใช้สีตามระดับความรุนแรง และบอกระดับด้วยข้อความกำกับ', () => {
  assert.ok(/class="ems-rank" style="background:' \+ lvl\.bar/.test(PL), 'ยังเป็นเลขเทา');
  assert.ok(/title="' \+ esc\(lvl\.label\)/.test(PL), 'สีอย่างเดียวบอกไม่ได้ว่าเร่งด่วนหรือควรติดตาม');
});
t('วงกลมเลขลำดับขนาดคงที่ ตัวเลขสองหลักไม่ทำให้เบี้ยว', () => {
  const m = CSS.match(/\.ems-rank \{[^}]*\}/);
  assert.ok(m && /width: 1\.375rem/.test(m[0]) && /height: 1\.375rem/.test(m[0]), 'ขนาดไม่คงที่');
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
