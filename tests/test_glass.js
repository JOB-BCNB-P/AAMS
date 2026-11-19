/* ธีมกระจกโทนฟ้า-ขาว ระดับโครงหน้า — ต้องไม่ทำให้อ่านข้อมูลยากขึ้นหรือพังบนเครื่องที่ไม่รองรับ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
const HTML = fs.readFileSync(P + 'index.html', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

// ตัดบล็อกที่ขึ้นต้นด้วยหัวเรื่องออกมา (ถึงหัวเรื่องถัดไปหรือท้ายไฟล์)
const GLASS_AT = CSS.indexOf('ชั้นธีมกระจก (Glassmorphism)');

(function () {
  console.log('[1] มีชั้นธีมและวางถูกที่');
  t('มีบล็อกธีมกระจกในไฟล์เดียวกับสไตล์เดิม', () =>
    assert.ok(GLASS_AT > 0, 'ไม่พบชั้นธีมกระจก'));
  t('อยู่ก่อนบล็อกลดการเคลื่อนไหวตัวสุดท้าย', () => {
    const last = CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(last > GLASS_AT, 'แทรกท้ายไฟล์ ทำให้บล็อกลดการเคลื่อนไหวไม่ใช่ตัวสุดท้าย');
  });
  t('ไม่ได้เพิ่มบล็อกลดการเคลื่อนไหวอันใหม่', () => {
    const after = CSS.slice(GLASS_AT);
    const own = after.slice(0, after.indexOf('@media (prefers-reduced-motion'));
    assert.ok(!own.includes('prefers-reduced-motion'), 'ชั้นธีมเพิ่มบล็อกซ้ำเข้ามา');
  });

  console.log('\n[2] ฉากหลังย้ายมาอยู่หลังการ์ด');
  t('เนื้อหาไม่ทาพื้นหลังทับฉากหลังอีก', () => {
    const m = CSS.slice(GLASS_AT).match(/\.ems-main\s*\{[^}]*\}/);
    assert.ok(m, 'ไม่ได้ปรับ .ems-main');
    assert.ok(/background-color:\s*transparent/.test(m[0]), 'พื้นหลังเดิมยังทึบอยู่ การ์ดจะไม่เห็นอะไรทะลุ');
  });
  t('ก้อนสีฟุ้งกดไม่โดนและอยู่หลังสุด', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(/\.ems-body::before,\s*\n\.ems-body::after\s*\{[\s\S]*?pointer-events:\s*none/.test(g), 'ก้อนสีอาจบังการกดปุ่ม');
    assert.ok(/z-index:\s*0/.test(g), 'ไม่ได้กดให้อยู่หลังสุด');
  });
  t('เมนูและเนื้อหาถูกยกขึ้นเหนือก้อนสี', () =>
    assert.ok(/\.ems-body\s*>\s*\.sidebar[\s\S]{0,160}z-index:\s*1/.test(CSS.slice(GLASS_AT)), 'เนื้อหาอาจถูกก้อนสีทับ'));

  console.log('\n[3] อ่านออกในทุกสถานการณ์');
  t('เครื่องที่ไม่รองรับการเบลอ ได้พื้นทึบแทน', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(g.includes('@supports not'), 'ไม่มีทางถอย');
    const blk = g.slice(g.indexOf('@supports not'));
    assert.ok(/background:\s*#fff/.test(blk) && /background-color:\s*#fff/.test(blk), 'ทางถอยไม่ได้ให้พื้นทึบ');
  });
  t('ผู้ใช้ที่ตั้งค่าลดความโปร่งแสง ได้พื้นทึบและไม่มีก้อนสี', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(g.includes('prefers-reduced-transparency'), 'ไม่ได้รองรับการตั้งค่านี้');
    const blk = g.slice(g.indexOf('prefers-reduced-transparency'));
    assert.ok(/backdrop-filter:\s*none/.test(blk), 'ยังเบลออยู่');
    assert.ok(/::before,[\s\S]{0,80}display:\s*none/.test(blk), 'ก้อนสียังอยู่');
  });
  t('พิมพ์ออกกระดาษแล้วไม่เหลือความโปร่งแสง', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(g.includes('@media print'), 'ไม่มีสไตล์สำหรับพิมพ์');
    const blk = g.slice(g.indexOf('@media print'));
    assert.ok(/backdrop-filter:\s*none\s*!important/.test(blk), 'พิมพ์ออกมาอาจเป็นพื้นเทา');
  });
  t('เมนูลิ้นชักบนจอเล็กต้องทึบ', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(/max-width:\s*1023\.98px[\s\S]{0,160}\.sidebar\s*\{\s*background:\s*rgba\(255,\s*255,\s*255,\s*\.9/.test(g),
      'ลิ้นชักโปร่งเกินไป จะอ่านทะลุรายการข้างหลัง');
  });

  console.log('\n[4] ไม่ทำของเดิมพัง');
  t('หัวตารางที่ตรึงไว้ยังทึบ', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(/thead \.sticky \{\s*\n?\s*background-color:\s*#eef5ff/.test(g.replace(/,\s*\n/g, ', ')) || g.includes('thead .sticky'),
      'หัวตารางโปร่ง แถวที่เลื่อนผ่านจะทะลุขึ้นมา');
  });
  t('คอลัมน์แรกที่ตรึงไว้ยังเป็นสีขาว', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(g.includes('tbody .sticky.bg-white'), 'ตารางกรอกคะแนนคอลัมน์ชื่อจะเปลี่ยนสีหรือโปร่ง');
  });
  t('เบลอชั้นเดียว ไม่ซ้อนการ์ดในการ์ด', () => {
    const g = CSS.slice(GLASS_AT);
    assert.ok(/\.bg-white\.rounded-2xl \.bg-white\.rounded-2xl[\s\S]{0,180}backdrop-filter:\s*none/.test(g),
      'ซ้อนเบลอหลายชั้น ทั้งหนักเครื่องและอ่านยาก');
  });
  t('กล่องลอยทึบกว่าการ์ด', () => {
    const g = CSS.slice(GLASS_AT);
    const m = g.match(/#modalContainer[\s\S]{0,220}?\}/);
    assert.ok(m, 'ไม่ได้ปรับกล่องลอย');
    assert.ok(/rgba\(255,\s*255,\s*255,\s*\.8[0-9]?\)/.test(m[0]), 'กล่องลอยโปร่งเท่าการ์ด จะอ่านยาก');
  });
  t('ไม่ได้ไปแก้คลาสใน tailwind.css ที่ build ไว้แล้ว', () => {
    const tw = fs.readFileSync(P + 'tailwind.css', 'utf8');
    assert.ok(!tw.includes('ชั้นธีมกระจก'), 'ไปเขียนทับไฟล์ที่ build ไว้');
  });

  console.log('\n[5] เบราว์เซอร์โหลดไฟล์ใหม่');
  t('เลขรุ่นของ styles.css ถูกเลื่อน', () => {
    const m = HTML.match(/styles\.css\?v=([0-9a-z]+)/);
    assert.ok(m, 'ไม่พบเลขรุ่น');
    assert.ok(m[1] >= '20261119', 'ยังเป็นเลขรุ่นเดิม ผู้ใช้จะยังเห็นสไตล์เก่าจากแคช · พบ ' + m[1]);
  });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
