/* คลาสสีของ Tailwind ที่โค้ดใช้ ต้องมีอยู่จริงใน tailwind.css ที่ build ไว้แล้ว
   ไฟล์นี้ build มาก่อนแล้วและไม่มีขั้นตอน build ในระบบ คลาสที่ไม่เคยถูกใช้ตอน build
   จะไม่มีอยู่ เขียนไปก็ไม่มีสี และไม่มีอะไรฟ้อง — เคยเกิดกับ bg-violet-* มาแล้ว */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const TW = fs.readFileSync(P + 'tailwind.css', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
const sel = c => '.' + c.replace(/([.:/[\]])/g, '\\$1') + '{';
// ตัวดัดแปลงตามสถานะ (hover: focus: ฯลฯ) ตรวจแยกไม่ได้ด้วยวิธีนี้ จึงข้าม
const FILES = ['plo.js', 'app.js', 'eval.js', 'counsel.js', 'workload.js', 'report.js',
  'curriculum.js', 'wellbeing.js', 'profile.js', 'app-patch.js'];

console.log('[1] คลาสสีที่ใช้ตรง ๆ ต้องมีจริง');
FILES.forEach(f => {
  let src;
  try { src = fs.readFileSync(P + f, 'utf8'); } catch (e) { return; }
  const toks = new Set();
  for (const m of src.matchAll(/\b(?:bg|text|border|ring|fill|stroke)-[a-z]+-\d{2,3}\b/g)) {
    // ข้ามตัวที่มีตัวดัดแปลงนำหน้า เช่น hover:bg-red-50
    const at = m.index;
    if (at > 0 && src[at - 1] === ':') continue;
    toks.add(m[0]);
  }
  t(f + ' (' + toks.size + ' คลาส)', () => {
    const miss = [...toks].filter(c => !TW.includes(sel(c)));
    assert.strictEqual(miss.length, 0, 'คลาสเหล่านี้ไม่มีใน tailwind.css จึงไม่มีสี : ' + miss.join(' '));
  });
});

console.log('\n[2] คลาสของระบบเองที่ใช้บ่อย');
t('สีหลักของระบบมีครบ', () => {
  ['bg-primary', 'text-primary', 'bg-primaryLight', 'bg-surface'].forEach(c =>
    assert.ok(TW.includes(sel(c)), 'ไม่มี ' + c));
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
