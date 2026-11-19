/* การ์ดเน้น : ต้องมีไม่เกินใบเดียวต่อหนึ่งชุดการ์ด และตัวเลขที่อ้างต้องมีฐานจริง */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
const FILES = ['app.js', 'eval.js'];

console.log('[1] ใช้พอดี ไม่เฝือ');
FILES.forEach(f => {
  const src = fs.readFileSync(P + f, 'utf8');
  const lines = src.split('\n');
  t(f + ' : การ์ดเน้นไม่ติดกันเองในชุดเดียว', () => {
    let bad = [];
    for (let i = 0; i < lines.length - 1; i++) {
      // สองบรรทัดที่เป็นสองทางของเงื่อนไขเดียวกัน (? ... : ...) เรนเดอร์ออกมาใบเดียว ไม่นับ
      const tern = /^\s*\?/.test(lines[i]) || /^\s*:/.test(lines[i + 1]);
      if (!tern && /accent: true/.test(lines[i]) && /accent: true/.test(lines[i + 1])) bad.push(i + 1);
    }
    assert.strictEqual(bad.length, 0, 'มีการ์ดเน้นติดกันที่บรรทัด ' + bad.join(', ') + ' ชุดการ์ดจะแย่งสายตากันเอง');
  });
});

console.log('\n[2] ตัวเลขที่อ้างต้องมีฐานจริง');
t('ไม่มีฐานที่ประกอบขึ้นเองแบบ a + b แทนยอดรวม', () => {
  const src = fs.readFileSync(P + 'app.js', 'utf8');
  // ฐานที่ยอมรับได้คือ ตัวแปรยอดรวม หรือผลรวมของ "ผ่าน + ไม่ผ่าน" ซึ่งครบทุกกรณีจริง
  const bad = [...src.matchAll(/statOf\([^,]+,\s*([^,]+),/g)]
    .map(m => m[1].trim())
    .filter(x => /\+/.test(x) && !/passedCount \+ notPassedCount|cols\.length \+ skipped\.length/.test(x));
  assert.strictEqual(bad.length, 0, 'ฐานน่าสงสัย : ' + bad.join(' | '));
});
t('ฐานของ GPAx คือจำนวนคนที่มี GPAx ไม่ใช่ผลรวมของสองกลุ่ม', () => {
  const src = fs.readFileSync(P + 'app.js', 'utf8');
  assert.ok(/statOf\(atRisk, withGpax\.length/.test(src), 'ฐานผิด ร้อยละจะเกินจริง');
  assert.ok(/statOf\(honor, withGpax\.length/.test(src), 'สองใบนี้ต้องใช้ฐานเดียวกันจึงเทียบกันได้');
});

console.log('\n[3] ค่าเฉลี่ยต้องบอกคะแนนเต็ม');
FILES.forEach(f => {
  const src = fs.readFileSync(P + f, 'utf8');
  t(f + ' : ทุกการ์ดที่แปลงค่าเฉลี่ยเป็นร้อยละ ระบุคะแนนเต็มไว้', () => {
    const divs = [...src.matchAll(/pct: [^}]*?\/ (\d) \* 100/g)];
    divs.forEach(m => {
      const around = src.slice(Math.max(0, m.index - 220), m.index + 40);
      assert.ok(/จากคะแนนเต็ม/.test(around), 'ไม่ได้บอกคะแนนเต็ม ผู้อ่านจะไม่รู้ว่าร้อยละคิดจากอะไร');
    });
    assert.ok(divs.length > 0 || f === 'xxx', 'ไม่พบการ์ดค่าเฉลี่ย');
  });
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
