/* ชื่อไอคอนทุกจุดต้องมีอยู่จริงใน lucide 0.263.0 ที่ระบบโหลด
   ถ้าชื่อไม่มี ไอคอนจะหายไปเงียบ ๆ ไม่มี error ให้เห็น จึงต้องมีตัวตรวจถาวร */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..') + path.sep;
/* อ่านรายชื่อไอคอนจากไฟล์ที่แนบมา ไม่ต้องติดตั้ง lucide เพื่อรันการทดสอบ
   ถ้าอัปเกรด lucide ให้สร้างไฟล์นี้ใหม่จากรุ่นที่ใช้ */
const have = new Set(
  fs.readFileSync(path.join(__dirname, 'lucide_0.263.0_names.txt'), 'utf8')
    .split('\n').map(x => x.trim()).filter(Boolean)
);
const FILES = ['index.html', 'app.js', 'app-patch.js', 'eval.js', 'counsel.js', 'profile.js', 'workload.js', 'curriculum.js', 'plo.js'];

let pass = 0, fail = 0, total = 0;
const missing = {};
FILES.forEach(function (f) {
  const full = P + f;
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, 'utf8');
  const ms = src.match(/data-lucide=["'][a-z0-9-]+["']/g) || [];
  ms.forEach(function (m) {
    total++;
    const name = m.replace(/.*=["']/, '').replace(/["']$/, '');
    if (!have.has(name)) (missing[name] = missing[name] || new Set()).add(f);
  });
});

console.log('ตรวจชื่อไอคอน ' + total + ' จุด จาก lucide ' + have.size + ' ชื่อ');
const bad = Object.keys(missing);
if (bad.length) {
  fail = bad.length;
  bad.forEach(n => console.log('  ✗ ไม่มีชื่อ "' + n + '" ใน lucide 0.263.0  (' + [...missing[n]].join(', ') + ')'));
} else { pass = 1; console.log('  ✓ ทุกชื่อมีอยู่จริง'); }

if (!have.has('heart-handshake')) { fail++; console.log('  ✗ ตัวตรวจเองเพี้ยน: heart-handshake ควรมีอยู่'); }
else { pass++; console.log('  ✓ ตัวตรวจทำงานถูก (รู้จัก heart-handshake)'); }
if (have.has('message-circle-heart')) { fail++; console.log('  ✗ ตัวตรวจเองเพี้ยน: message-circle-heart ไม่ควรมีในรุ่นนี้'); }
else { pass++; console.log('  ✓ ตัวตรวจทำงานถูก (ไม่รู้จักชื่อของรุ่นใหม่)'); }

console.log((fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
