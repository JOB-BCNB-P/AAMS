/* การตอบสนองของปุ่มและเมนู — ตรวจว่ากฎใน styles.css ยังครบ
   ไม่ได้ตรวจว่า "สวย" แต่ตรวจสิ่งที่เคยพังมาแล้วและจะพังซ้ำได้ถ้ามีคนแก้ทับ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const APPJS = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

console.log('[1] สิ่งที่เคยทำให้รู้สึกกระตุก ต้องไม่กลับมา');
t('เมนูด้านข้างต้องไม่สั่นบิดซ้ายขวา', () =>
  assert.ok(!/btnWobble/.test(CSS), 'พบ btnWobble กลับมาแล้ว เมนูจะสั่นตอนชี้'));
t('ปุ่มทุกปุ่มต้องไม่ถูกสั่งให้กระโดดขึ้นพร้อมกันหมด', () =>
  assert.ok(!/button:hover:not\(:disabled\):not\(\.btn-spin\)\s*\{\s*transform:\s*translateY\(-2px\)/.test(CSS),
    'ปุ่มไอคอนเล็กในตารางจะกระโดดตามไปด้วย ทั้งแถวดูสั่น'));

console.log('\n[2] การหน่วงเวลาต้องครอบคลุมสีพื้น ไม่ใช่แค่การขยับ');
t('ปุ่มและสิ่งที่กดได้มีกฎกลางครอบคลุมสีพื้น', () => {
  const i = CSS.indexOf('input[type="file"]::file-selector-button {');
  assert.ok(i > 0, 'ไม่พบกฎกลางของปุ่ม');
  const seg = CSS.slice(i, i + 400);
  ['background-color', 'border-color', 'color', 'box-shadow', 'transform']
    .forEach(k => assert.ok(seg.includes(k), 'กฎกลางขาด ' + k));
});
t('คลาสปุ่มเฉพาะของระบบก็หน่วงสีพื้นด้วย', () => {
  ['.card-stat', '.ems-btn-primary', '.ems-icon-btn'].forEach(function (cls) {
    const i = CSS.indexOf(cls + ' {');
    assert.ok(i > 0, 'ไม่พบ ' + cls);
    const seg = CSS.slice(i, CSS.indexOf('}', i));
    assert.ok(/background-color|border-color/.test(seg), cls + ' ไม่ได้หน่วงสี');
  });
});
t('ใช้ความเร็วเดียวกันทั้งระบบ 150 มิลลิวินาที', () => {
  const n = (CSS.match(/150ms cubic-bezier\(\.4, 0, \.2, 1\)/g) || []).length;
  assert.ok(n >= 10, 'พบแค่ ' + n + ' จุด ความเร็วน่าจะไม่สม่ำเสมอแล้ว');
});

console.log('\n[3] ตัวเลือกต้องตรงกับโครงสร้างจริงของหน้า');
t('อ้างถึงแถบเมนูด้วยชื่อที่มีอยู่จริง', () => {
  assert.ok(CSS.includes('#sidebarNav button'), 'ไม่ได้อ้าง #sidebarNav');
  assert.ok(APPJS.includes("getElementById('sidebarNav')"), 'หน้าไม่ได้ใช้ #sidebarNav แล้ว');
});
t('อ้างเมนูย่อยด้วยคลาสที่ระบบใช้จริง', () => {
  assert.ok(CSS.includes('.dropdown-open > .dropdown-menu'), 'ไม่ได้อ้าง .dropdown-open > .dropdown-menu');
  assert.ok(APPJS.includes("classList.toggle('dropdown-open')"), 'ระบบไม่ได้ใช้ dropdown-open แล้ว');
  assert.ok(APPJS.includes('dropdown-menu'), 'ระบบไม่ได้ใช้ dropdown-menu แล้ว');
});
t('ไม่มีตัวเลือกที่ไม่มีอยู่จริงหลงเหลือ', () => {
  assert.ok(!/\.ems-sidebar\s+button/.test(CSS), 'ems-sidebar ไม่ใช่คลาสของแถบเมนู กฎจะไม่ทำงาน');
  assert.ok(!/\[data-submenu\]/.test(CSS), 'ระบบไม่มี data-submenu กฎจะไม่ทำงาน');
});

console.log('\n[4] ปุ่มที่ถูกปิดไว้ระหว่างบันทึก');
t('ต้องไม่ยุบตามนิ้วและขึ้นเคอร์เซอร์ห้าม', () => {
  const i = CSS.indexOf('button:disabled,');
  assert.ok(i > 0, 'ไม่มีกฎของปุ่มที่ถูกปิด');
  const seg = CSS.slice(i, CSS.indexOf('}', i));
  assert.ok(seg.includes('transform: none !important'), 'ยังยุบตามนิ้วอยู่');
  assert.ok(seg.includes('cursor: not-allowed'), 'ไม่ได้บอกผู้ใช้ว่ากดไม่ได้');
});

console.log('\n[5] การเข้าถึง');
t('ผู้ใช้แป้นพิมพ์ต้องเห็นว่าอยู่ที่ปุ่มไหน', () =>
  assert.ok(/button:focus-visible/.test(CSS) && /outline:\s*2px solid/.test(CSS), 'ไม่มีขอบเรืองตอนกด Tab'));
t('เคารพการตั้งค่าลดการเคลื่อนไหวของผู้ใช้', () => {
  const i = CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(i > 0, 'ไม่ได้รองรับการตั้งค่าลดการเคลื่อนไหว');
  // บล็อกรวมที่ใช้ตัวเลือก * ต้องมีที่เดียว มิฉะนั้นจะแก้ที่หนึ่งแล้วลืมอีกที่
  // (บล็อกเฉพาะกิจข้าง ๆ แอนิเมชันของตัวมันเองไม่นับ เพราะอยู่ติดกับสิ่งที่มันคุม)
  const globals = (CSS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*(\/\*[\s\S]*?\*\/\s*)?\*,/g) || []).length;
  assert.strictEqual(globals, 1, 'บล็อกรวมของการลดการเคลื่อนไหวมี ' + globals + ' ที่ ควรมีที่เดียว');
  const seg = CSS.slice(i);   // อ่านถึงท้ายไฟล์ เพราะบล็อกนี้ยาวและมีคำอธิบายคั่น
  assert.ok(seg.includes('transition-duration: .01ms !important'), 'ไม่ได้ปิดการหน่วงเวลา');
  assert.ok(seg.includes('animation-duration: .01ms !important'), 'ไม่ได้ปิดแอนิเมชัน');
  assert.ok(/button:hover[\s\S]{0,200}transform: none !important/.test(seg), 'ยังขยับอยู่');
});
t('บนมือถือต้องไม่หน่วงการกดและไม่มีกรอบเทาทับ', () =>
  assert.ok(CSS.includes('touch-action: manipulation') && CSS.includes('-webkit-tap-highlight-color: transparent'),
    'ปุ่มจะตอบสนองช้าราว 300 มิลลิวินาทีบนมือถือ'));

console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
