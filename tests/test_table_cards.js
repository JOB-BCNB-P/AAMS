/* ตารางแบบแถวเป็นการ์ด + ตัวเลขร้อยละพร้อมแถบ
   ของเดิมต้องไม่พัง โดยเฉพาะตารางคอลัมน์ตรึงและตารางซับซ้อน */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const CSS = fs.readFileSync(P + 'styles.css', 'utf8');
const APP = fs.readFileSync(P + 'app.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
function grab(sig) {
  const i = APP.indexOf(sig);
  if (i < 0) throw new Error('ไม่พบ ' + sig);
  let d = 0;
  for (let k = APP.indexOf('{', i + sig.length); k < APP.length; k++) {
    if (APP[k] === '{') d++; else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); }
  }
  throw new Error('brace');
}
const G = new Function(grab('function pctCell(') + '\n' + grab('function statOf(') + ';return { pctCell, statOf };')();

const AT = CSS.indexOf('ตารางแบบแถวเป็นการ์ด');
const BLK = AT > 0 ? CSS.slice(AT, CSS.indexOf('/* ---- ตัวเลขร้อยละ', AT)) : '';

console.log('[1] ขอบเขตการใช้งาน');
t('มีชั้นตารางแบบแถวเป็นการ์ด', () => assert.ok(AT > 0, 'ไม่พบ'));
t('ใช้เฉพาะตารางที่ถูกตรวจแล้วว่าโครงสร้างเรียบง่าย', () => {
  assert.ok(BLK.includes('table[data-ems-cards="1"]'), 'ไม่ได้จำกัดด้วยธงที่ app-patch ตั้งให้');
  assert.ok(!/table\.w-full[^\[]*\{/.test(BLK), 'เหวี่ยงแหใส่ตารางทุกอัน ตารางคอลัมน์ตรึงจะพัง');
});
t('ตารางที่ถูกตีตรา skip ต้องไม่โดน', () =>
  assert.ok(!BLK.includes('"skip"'), 'ไปแตะตารางที่ระบบตีตราว่าไม่ปลอดภัย'));
t('ใช้บนจอตั้งแต่แท็บเล็ตขึ้นไปเท่านั้น ไม่ชนการ์ดใบละแถวบนมือถือ', () => {
  assert.ok(/@media \(min-width: 641px\)/.test(BLK), 'ไม่ได้กั้นด้วยขนาดจอ');
  const mob = CSS.indexOf('@media (max-width: 640px)');
  assert.ok(mob > 0 && mob < AT, 'ลำดับกฎอาจทับกฎมือถือ');
});

console.log('\n[2] ไม่ทำของเดิมพัง');
t('แถวที่โค้ดทาสีเองยังเห็นสีของตัวเอง', () =>
  assert.ok(/tr\[class\^="bg-"\] td/.test(BLK) && /tr\[class\*=" bg-"\] td/.test(BLK),
    'ไม่ได้เปิดทางให้แถวที่ทาสีเอง'));
t('ต้องไม่เผลอจับ hover:bg- หรือ odd:bg- ซึ่งเป็นสถานะไม่ใช่สีแถว', () =>
  assert.ok(!/tr\[class\*="bg-"\]/.test(BLK),
    'ตัวเลือกกว้างเกิน แถวที่มี hover:bg-gray-50 จะกลายเป็นพื้นใส'));
t('สถานะชี้เมาส์ทาที่ช่อง ไม่ใช่ที่แถว', () =>
  assert.ok(/tr:hover td\s*\{[^}]*background-color/.test(BLK),
    'border-collapse: separate ทำให้สีพื้นของแถวไม่ปรากฏ ต้องทาที่ช่อง'));
t('หัวตารางเป็นพื้นใส ไม่ค้างสีจากชั้นธีมกระจก', () =>
  assert.ok(/thead th \{[\s\S]{0,200}?\}/.test(BLK) && /background: transparent !important/.test(BLK),
    'หัวตารางจะเหลือพื้นสีเดิมลอยอยู่เหนือการ์ด'));
t('มุมช่องหัวท้ายโค้ง จะได้เป็นการ์ดจริง', () =>
  assert.ok(/td:first-child[\s\S]{0,160}border-top-left-radius/.test(BLK)
    && /td:last-child[\s\S]{0,160}border-top-right-radius/.test(BLK), 'แถวยังเป็นแถบเหลี่ยม'));

console.log('\n[3] ตัวเลขร้อยละพร้อมแถบ');
t('ค่าปกติแสดงตัวเลขและความกว้างแถบตรงกัน', () => {
  const h = G.pctCell(87.5, 'green');
  assert.ok(h.includes('87.5%'), 'ไม่มีตัวเลข');
  assert.ok(h.includes('width:87.5%'), 'แถบไม่ตรงกับตัวเลข');
  assert.ok(h.includes('text-green-600'), 'ไม่ได้ใช้สีที่สั่ง');
});
t('ค่าเกิน 100 หรือติดลบ ต้องไม่ทำให้แถบล้นหรือหาย', () => {
  assert.ok(G.pctCell(140, 'green').includes('width:100%'), 'แถบล้นกรอบ');
  assert.ok(G.pctCell(-20, 'red').includes('width:0%'), 'แถบติดลบ');
});
t('ค่าที่ไม่ใช่ตัวเลข ต้องไม่พังเป็น NaN ในสไตล์', () =>
  assert.ok(G.pctCell(null, 'blue').includes('width:0%'), 'ได้ width:NaN%'));
t('สีที่ไม่รู้จัก ตกมาที่ฟ้า ไม่ใช่ค่าว่าง', () => {
  const h = G.pctCell(50, 'ชมพู');
  assert.ok(h.includes('text-blue-600'), 'สีหาย ตัวเลขจะกลายเป็นสีเริ่มต้นของตาราง');
});
t('คลาสที่ใช้มีจริงใน tailwind.css ที่ build ไว้แล้ว', () => {
  const tw = fs.readFileSync(P + 'tailwind.css', 'utf8');
  ['text-green-600', 'text-amber-600', 'text-red-600', 'text-blue-600'].forEach(c =>
    assert.ok(tw.includes('.' + c + '{'), 'ไม่มีคลาส ' + c + ' ใน tailwind.css ตัวเลขจะไม่มีสี'));
});
t('มีสไตล์ของ .ems-pct รองรับ ไม่ใช่คลาสลอย', () => {
  assert.ok(/\.ems-pct \{/.test(CSS) && /\.ems-pct-bar/.test(CSS), 'ไม่มีสไตล์รองรับ');
  assert.ok(/font-variant-numeric:\s*tabular-nums/.test(CSS), 'ตัวเลขไม่ตรงหลัก อ่านเทียบกันยาก');
});

console.log('\n[4] ใช้งานจริงแล้ว');
t('ตารางอัตราคงอยู่ใช้ตัวเลขแบบมีแถบ', () =>
  assert.ok(/pctCell\(stayPct, pctTone\)/.test(APP), 'ยังเป็นตัวเลขเปล่า'));
t('ไม่เหลือตัวแปรสีเดิมที่ไม่ได้ใช้แล้ว', () =>
  assert.ok(!/const pctColor =/.test(APP), 'เหลือโค้ดตาย'));

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
