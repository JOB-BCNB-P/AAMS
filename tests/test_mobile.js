/* ใช้งานบนมือถือและแท็บเล็ต (Android · iOS · iPad)
   สิ่งที่ต้องไม่เกิด : หน้าเลื่อนไปทางขวาได้ · ตัวอักษรหักกลางคำ · แถบกระจกไม่ทำงานบน Safari */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
const HTML = fs.readFileSync(P + 'index.html', 'utf8');
const PATCH = fs.readFileSync(P + 'app-patch.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('[1] iOS / Safari');
t('ทุก backdrop-filter มีคู่ -webkit- กำกับ', () => {
  const bad = [];
  const re = /(?<!-)\bbackdrop-filter\s*:/g;
  let m;
  while ((m = re.exec(CSS))) {
    if (!CSS.slice(Math.max(0, m.index - 140), m.index).includes('-webkit-backdrop-filter')) {
      bad.push(CSS.slice(Math.max(0, m.index - 50), m.index + 40).replace(/\n/g, ' '));
    }
  }
  assert.strictEqual(bad.length, 0, 'Safari จะไม่เบลอ หรือปิดเบลอไม่ได้ : ' + bad.join(' | '));
});
t('หน้าเว็บประกาศ viewport ครบ รวม viewport-fit สำหรับจอมีรอยบาก', () => {
  const m = HTML.match(/<meta name="viewport" content="([^"]+)"/);
  assert.ok(m, 'ไม่มี meta viewport หน้าจะถูกย่อทั้งหน้าบนมือถือ');
  assert.ok(/width=device-width/.test(m[1]), 'ไม่ได้ใช้ความกว้างจริงของเครื่อง');
  assert.ok(/viewport-fit=cover/.test(m[1]), 'ขอบจอโค้งของ iPhone จะมีแถบขาว');
});
t('เผื่อพื้นที่ปลอดภัยของ iPhone ไว้แล้ว', () =>
  assert.ok(/safe-area-inset/.test(CSS), 'เนื้อหาจะโดนแถบล่างของ Safari ทับ'));

console.log('\n[2] สิ่งที่เพิ่มเข้ามาใหม่ ต้องรองรับจอเล็ก');
t('กราฟแท่งแนวตั้งซ่อนบนมือถือ เพราะสิบแท่งในจอ 390px อ่านไม่ออก', () => {
  const i = CSS.indexOf('.vbar-wrap { display: none; }');
  assert.ok(i > 0, 'ยังแสดงอยู่ จะบีบจนอ่านไม่ออก');
  const before = CSS.lastIndexOf('@media', i);
  assert.ok(/max-width:\s*640px/.test(CSS.slice(before, i)), 'ซ่อนผิดช่วงจอ');
});
t('ข้อมูลไม่หายตอนซ่อนกราฟ เพราะแท่งแนวนอนยังอยู่', () => {
  const PL = fs.readFileSync(P + 'plo.js', 'utf8');
  assert.ok(/vbars\(\) \+ '<div class="mt-4">' \+ bars/.test(PL), 'ซ่อนแล้วไม่เหลืออะไรให้อ่าน');
});
t('ปุ่มเลื่อนสลับมุมมองขึ้นบรรทัดใหม่ได้ ไม่ล้นจอ', () =>
  assert.ok(/\.ems-switch \{ max-width: 100%; flex-wrap: wrap; \}/.test(CSS), 'จะล้นออกนอกจอ'));
t('การ์ดตัวเลขย่อขนาดบนมือถือ ตัวเลขไม่ดันขึ้นบรรทัดใหม่', () => {
  const i = CSS.indexOf('.card-stat .stat-value { font-size: 1.5rem; }');
  assert.ok(i > 0, 'ตัวเลขยังใหญ่เท่าจอคอมพิวเตอร์');
  assert.ok(/max-width:\s*640px/.test(CSS.slice(CSS.lastIndexOf('@media', i), i)), 'ย่อผิดช่วงจอ');
});
t('วงกลมเลขลำดับ จุดสี และเลขขั้น ไม่ถูกบีบจนเบี้ยว', () =>
  assert.ok(/\.ems-ministep, \.ems-rank, \.dnt-dot \{ flex: none; \}/.test(CSS), 'จะกลายเป็นวงรี'));

console.log('\n[3] ตารางบนมือถือ');
t('ช่องที่ข้อความยาวลงบรรทัดใหม่ ไม่หักกลางคำ', () => {
  assert.ok(/ems-cell-long/.test(PATCH), 'app-patch ไม่ได้ติดธงให้ช่องที่ข้อความยาว');
  assert.ok(/td\.ems-cell-long \{\s*\n?\s*display: block/.test(CSS), 'ไม่มีสไตล์รองรับ');
});
t('ธงติดจากความยาวจริงของข้อความ ไม่ใช่เดาจากชื่อคอลัมน์', () =>
  assert.ok(/txt\.length > 24 \|\| cells\[c\]\.querySelector\('p, div'\)/.test(PATCH), 'เงื่อนไขไม่ชัด'));
t('แถบร้อยละในตารางมีความกว้างคงที่ ไม่ยุบหายตอนเป็นการ์ด', () => {
  const PL = fs.readFileSync(P + 'plo.js', 'utf8');
  assert.ok(/class="ems-pct"/.test(PL), 'ตารางเฝ้าระวังยังใช้แถบแบบยืดเต็มช่อง');
  assert.ok(/\.ems-pct > \.ems-pct-bar \{[\s\S]{0,160}flex: none/.test(CSS), 'แถบจะถูกบีบจนหาย');
});
t('ตารางแถวเป็นการ์ดใช้เฉพาะจอตั้งแต่ 641px ไม่ชนโหมดการ์ดใบละแถว', () =>
  assert.ok(/@media \(min-width: 641px\)/.test(CSS) && /@media \(max-width: 640px\)/.test(CSS), 'ช่วงจอทับกัน'));

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
