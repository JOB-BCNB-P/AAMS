/* ไฟล์ที่ถูกแก้ ต้องเลื่อนเลขแคชในหน้า index.html ด้วย
   ไม่งั้นผู้ใช้ที่เคยเปิดระบบแล้วจะยังได้โค้ดเก่าจากแคชเบราว์เซอร์ */
const fs = require('fs'), path = require('path'), assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const HTML = fs.readFileSync(P + 'index.html', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
const refs = [...HTML.matchAll(/(?:src|href)="([\w.-]+\.(?:js|css))(\?v=([\w.-]+))?"/g)]
  .filter(m => !/^https?:/.test(m[1]));
console.log('[1] ทุกไฟล์ภายในต้องมีเลขแคช');
refs.forEach(m => t(m[1], () => assert.ok(m[3], 'ไม่มี ?v= ผู้ใช้จะติดแคชเก่าอย่างถาวร')));
console.log('\n[2] รูปแบบเลขต้องเป็นวันที่ อ่านแล้วรู้ว่าของเมื่อไร');
refs.filter(m => m[3]).forEach(m => t(m[1] + ' = ' + m[3], () =>
  assert.ok(/^20\d{6}[a-z]?$/.test(m[3]), 'ไม่ใช่รูปแบบ YYYYMMDD[a-z] · ' + m[3])));
console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
