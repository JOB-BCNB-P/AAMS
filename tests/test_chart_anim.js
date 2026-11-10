/* อนิเมชันของกราฟวงกลม กราฟแท่ง การ์ดตัวเลข และใยแมงมุม
   จุดที่ต้องไม่พลาด
   1) ค่าสุดท้ายต้องถูกเสมอ ต่อให้สคริปต์นับตัวเลขไม่ทำงาน
   2) ต้องไม่ไปลบ HTML ข้างในของ element ที่ไม่ใช่ตัวเลขล้วน
   3) เครื่องที่ตั้งค่าลดการเคลื่อนไหว ต้องไม่มีอะไรขยับ
   4) บล็อกลดการเคลื่อนไหวรวมต้องยังเป็นบล็อกสุดท้ายของไฟล์ CSS */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const SM = fs.readFileSync(path.join(ROOT, 'smooth.js'), 'utf8');
const PL = fs.readFileSync(path.join(ROOT, 'plo.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('อ่านไม่จบ: ' + sig);
}

console.log('\n[1] ค่าที่แสดงต้องถูกต้องเสมอ');
const env = {
  norm: v => String(v == null ? '' : v).trim(),
  htmlEsc: v => String(v == null ? '' : v).replace(/"/g, '&quot;')
};
const G = new Function(...Object.keys(env),
  [grab(APP, 'function svgDonut(segments, centerLabel)'), grab(APP, 'function animBarRows(items)'),
   grab(APP, 'function statCard(icon, label, value, unit, color)')].join('\n')
  + '; return { svgDonut, animBarRows, statCard };')(...Object.values(env));

t('การ์ดตัวเลข : ข้อความที่เรนเดอร์ออกมาเป็นค่าจริง ไม่ใช่ศูนย์', () => {
  const h = G.statCard('users', 'นักศึกษา', 636, 'คน', 'bg-blue-500');
  assert.ok(h.includes('>636</span>'), 'ค่าที่แสดงไม่ใช่ค่าจริง');
  assert.ok(h.includes('data-count-up="636"'), 'ไม่ได้สั่งให้นับขึ้น');
});
t('การ์ดตัวเลข : ค่าทศนิยมและค่าที่มีเครื่องหมาย ต้องไม่เพี้ยน', () => {
  assert.ok(G.statCard('a', 'b', 87.5, '%', 'c').includes('data-count-up="87.5"'));
  assert.ok(G.statCard('a', 'b', '1,250', 'คน', 'c').includes('data-count-up="1250"'),
    'ตัวคั่นหลักพันต้องถูกตัดออกก่อนส่งให้ตัวนับ');
});
t('โดนัท : ส่งความยาวเส้นสุดท้ายและเส้นรอบวงให้ CSS', () => {
  const h = G.svgDonut([{ label: 'ผ่าน', value: 3, color: '#0a0' }, { label: 'ไม่ผ่าน', value: 1, color: '#a00' }], 'คน');
  assert.ok(/--dash:[\d.]+ [\d.]+/.test(h), 'ไม่มีค่าความยาวเส้นให้ CSS ใช้ลาก');
  assert.ok(/--dc:[\d.]+/.test(h), 'ไม่มีเส้นรอบวง');
  assert.ok(/stroke-dasharray="[\d.]+ [\d.]+"/.test(h), 'ค่าจริงบน attribute หายไป ถ้า CSS ไม่ทำงานวงจะเพี้ยน');
});
t('โดนัท : ไม่มีข้อมูลต้องไม่พัง', () => {
  const h = G.svgDonut([], 'คน');
  assert.ok(h.includes('stroke="#e5e7eb"'), 'ไม่มีวงสีเทาตอนไม่มีข้อมูล');
  assert.ok(!h.includes('--dash'), 'วงเปล่าไม่ควรมีอนิเมชันลากเส้น');
});
t('กราฟแท่ง : ความกว้างสุดท้ายยังอยู่ใน --tw และมีคลาสแถวให้ไล่จังหวะ', () => {
  const h = G.animBarRows([{ label: 'ก', value: 10, color: '#111' }, { label: 'ข', value: 5 }]);
  assert.ok(h.includes('--tw:100%'), 'แถวที่มากที่สุดต้องเต็ม 100%');
  assert.ok(h.includes('--tw:50%'), 'คำนวณสัดส่วนผิด');
  assert.strictEqual((h.match(/class="bar-row"/g) || []).length, 2, 'ไม่มีคลาสแถว การไล่จังหวะจะไม่ทำงาน');
});
t('กราฟแท่ง : ค่าที่ไม่ใช่ตัวเลข ต้องไม่ถูกสั่งให้นับ', () => {
  const h = G.animBarRows([{ label: 'ก', value: '-' }]);
  assert.ok(!h.includes('data-count-up'), 'ค่าที่ไม่ใช่ตัวเลขจะถูกแปลงเป็น NaN');
});

console.log('\n[2] ตัวนับตัวเลข');
t('จบที่ข้อความเดิมเสมอ', () => {
  const g = grab(SM, 'function run(el)');
  assert.ok(g.includes('var finalText = el.textContent'), 'ไม่ได้เก็บข้อความเดิมไว้');
  assert.ok(g.includes('el.textContent = finalText'), 'จบแล้วอาจค้างเป็นเลขที่ปัดแล้ว ไม่ตรงกับค่าจริง');
});
t('ไม่แตะ element ที่มี HTML ข้างใน', () => {
  assert.ok(grab(SM, 'function run(el)').includes('el.children.length'), 'จะลบ HTML ข้างในทิ้ง');
});
t('เครื่องที่ลดการเคลื่อนไหว ไม่นับ ปล่อยเป็นค่าสุดท้าย', () => {
  const g = grab(SM, 'function run(el)');
  assert.ok(g.includes('reducedMotion()'), 'ไม่ได้เคารพการตั้งค่าของเครื่อง');
  assert.ok(/reducedMotion\(\) \|\| Math\.abs\(target\) <= 3/.test(g), 'เลขน้อย ๆ ไม่ควรนับ');
});
t('นับครั้งเดียวต่อ element ไม่นับซ้ำทุกครั้งที่วาดหน้าใหม่', () => {
  const g = grab(SM, 'function run(el)');
  assert.ok(g.includes('el.__cuDone'), 'จะนับใหม่ทุกครั้งที่ DOM ขยับ');
});
t('หยุดเมื่อ element ถูกถอดออกจากหน้า', () => {
  assert.ok(grab(SM, 'function run(el)').includes('el.isConnected'), 'ลูปจะวิ่งต่อทั้งที่ element หายไปแล้ว');
});

console.log('\n[3] CSS');
t('มีอนิเมชันครบทั้งสี่อย่าง', () => {
  ['donutDraw', 'growBar', 'radarPop', 'cardRise'].forEach(k =>
    assert.ok(CSS.includes('@keyframes ' + k), 'ไม่มี ' + k));
});
t('เส้นโดนัทที่ไม่มีค่าความยาว ต้องไม่ถูกทำให้หายไป', () => {
  assert.ok(CSS.includes('.donut-seg[style*="--dash"]'),
    'ถ้าใส่อนิเมชันกับทุกเส้น เส้นที่ไม่มีค่าจะเริ่มจาก 0 แล้วไม่มีปลายทาง กลายเป็นวงเปล่า');
});
t('ตอนชี้เมาส์ อนิเมชันตอนปรากฏต้องไม่ค้างทับ', () => {
  assert.ok(/\.card-stat:hover,\s*\n\s*\.card-stat:active \{ animation: none; \}/.test(CSS),
    'transform ของ hover จะถูกอนิเมชันเขียนทับ การ์ดจะไม่ยกขึ้น');
});
t('บล็อกลดการเคลื่อนไหวรวม ยังเป็นบล็อกสุดท้ายของไฟล์', () => {
  // เพิ่มบล็อกใหม่ท้ายไฟล์แล้วบล็อกรวมจะไม่ครอบของใหม่ และตัวตรวจของ test_smooth จะพลาด
  const last = CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  const seg = CSS.slice(last);
  assert.ok(seg.includes('animation-duration: .01ms !important'), 'บล็อกสุดท้ายไม่ใช่บล็อกรวม');
  assert.ok(CSS.indexOf('@keyframes cardRise') < last, 'อนิเมชันใหม่อยู่หลังบล็อกรวม จะไม่ถูกคุม');
});

console.log('\n[4] ใยแมงมุม');
t('เส้นข้อมูลและจุดมีคลาสอนิเมชัน', () => {
  const g = grab(PL, 'function radarSvg(axes, series, fixedMax)');
  assert.ok(g.includes('class="radar-poly"'), 'เส้นข้อมูลไม่มีอนิเมชัน');
  assert.ok(g.includes('class="radar-dot"'), 'จุดไม่มีอนิเมชัน');
  assert.ok(g.includes('--cx:') && g.includes('--cy:'), 'ไม่ได้ส่งจุดกึ่งกลาง เส้นจะขยายจากมุมซ้ายบน');
});
t('วงแหวนพื้นหลังต้องไม่ขยับ', () => {
  assert.ok(!/polygon class="radar-poly"[^>]*fill="none"/.test(grab(PL, 'function radarSvg(axes, series, fixedMax)')),
    'วงแหวนอ้างอิงไม่ควรเคลื่อนไหว');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
