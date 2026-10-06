/* ผลสอบภาษาอังกฤษ › ผลสอบรายรอบ — กรองใครผ่าน/ไม่ผ่านในแต่ละรอบ (ผู้ดูแลระบบ ผู้บริหาร งานวิชาการ งานทะเบียน) */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
t('แสดงเฉพาะ 4 บทบาท', () => assert.ok(SRC.includes("${['admin', 'academic', 'registrar', 'executive'].includes(APP.currentRole) ? engRoundCardHTML() : ''}")));
t('รอบสอบ = ครั้งที่ + วันที่สอบ (สบช.) · วันที่ต่างรูปแบบรวมเป็นวันเดียว', () => {
  const i = SRC.indexOf('function engRoundDateKey'), j = SRC.indexOf('function engRoundLabel');
  const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
  const pd = SRC.slice(SRC.indexOf('function parseDate(v)'), SRC.indexOf('\n}\n', SRC.indexOf('function parseDate(v)')) + 2);
  const f = new Function('norm', pd + SRC.slice(i, j) + '; return { engRoundDateKey, engRoundKeyOf };')(norm);
  assert.strictEqual(f.engRoundDateKey('02/08/2025'), f.engRoundDateKey('2025-08-02'));
  assert.strictEqual(f.engRoundKeyOf({ eng_type: 'สบช.', eng_attempt: '1', eng_date: '02/08/2025' }), '1|2025-08-02');
  assert.strictEqual(f.engRoundKeyOf({ eng_type: 'TOEIC', eng_date: '' }), '|');
});
t('กรองสถานะ ผ่าน / ไม่ผ่าน / ไม่เข้าสอบ และส่งออก CSV', () => {
  assert.ok(SRC.includes("chip('ผ่าน', 'ผ่าน'") && SRC.includes("chip('ไม่ผ่าน', 'ไม่ผ่าน'") && SRC.includes('function engRoundCsv()'));
});
t('ส่งออก PDF ทั้งสรุปผลสอบและผลสอบรายรอบ เฉพาะผู้ดูแลระบบ งานวิชาการ งานทะเบียน', () => {
  assert.ok(SRC.includes("function engPdfAllowed() { return ['admin', 'academic', 'registrar'].includes(APP.currentRole); }"));
  assert.ok(SRC.includes('function engSummaryPdf()') && SRC.includes('function engRoundPdf()'));
  assert.ok(SRC.includes('onclick="engSummaryPdf()"') && SRC.includes('onclick="engRoundPdf()"'));
});
console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
