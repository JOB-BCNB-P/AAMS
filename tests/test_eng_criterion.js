/* เกณฑ์ผ่านสอบภาษาอังกฤษ สบช. — ตัดสินตามรุ่น : รุ่น 81+ ใช้ 51 · รุ่น 80 ลงไปใช้ 41 ไม่ว่าสอบปีไหน */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
const i = SRC.indexOf('function engIsNewCriterion'), j = SRC.indexOf('function getEngLevel');
const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
let STU = [];
const getDataByType = () => STU;
eval(SRC.slice(i, j));
STU = [{ student_id: 'A', batch: '80' }, { student_id: 'B', batch: '81' }, { student_id: 'C', batch: '78' }, { student_id: 'X', batch: '' }];
t('รุ่น 80 สอบปี 2569 ใช้เกณฑ์ 41 (43 คะแนนผ่าน)', () => assert.strictEqual(engPassThreshold('A', '2569'), 41));
t('รุ่น 78 สอบปี 2570 ยังใช้ 41', () => assert.strictEqual(engPassThreshold('C', '2570'), 41));
t('รุ่น 81 ใช้ 51 แม้สอบปี 2568', () => assert.strictEqual(engPassThreshold('B', '2568'), 51));
t('ไม่มีเลขรุ่น → ใช้ปีที่สอบ (2569 = 51, 2568 = 41)', () => { assert.strictEqual(engPassThreshold('X', '2569'), 51); assert.strictEqual(engPassThreshold('X', '2568'), 41); });
t('ข้อความบนหน้าจอตรงกับกฎ', () => assert.ok(SRC.includes('รุ่น 81 เป็นต้นไป → ผ่านเมื่อ ≥ 51 · รุ่น 80 ลงไป → ผ่านเมื่อ ≥ 41')));
console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
