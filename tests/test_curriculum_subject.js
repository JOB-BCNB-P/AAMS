/* รายวิชาต้องระบุหลักสูตร — ปีการศึกษา 2570 จะมีสองหลักสูตรใช้งานพร้อมกัน
   ถ้ารายวิชาไม่ระบุหลักสูตร สองชุดจะปนกันในปีเดียวกันโดยไม่มีอะไรบอก */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const APP = fs.readFileSync(P + 'app.js', 'utf8');

let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

/* หยิบกลุ่มฟังก์ชันเรื่องหลักสูตรออกมารันจริง ไม่ต้องยกทั้งระบบ */
function loadCurriculumFns(curriculumRows) {
  const a = APP.indexOf('function curriculumOptions()');
  const b = APP.indexOf('function subjectTypeField(s)');
  assert.ok(a > 0 && b > a, 'ไม่พบกลุ่มฟังก์ชันเรื่องหลักสูตร');
  const src = APP.slice(a, b);
  return new Function('getDataByType', 'norm', 'htmlEsc',
    src + '\nreturn { curriculumOptions, curriculumLabel, curriculumBadge, curriculumField };'
  )(
    () => curriculumRows,
    (v) => String(v == null ? '' : v).trim(),
    (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  );
}

const TWO = [
  { curriculum_year: '2565', title_th: 'หลักสูตรพยาบาลศาสตรบัณฑิต (หลักสูตรปรับปรุง พ.ศ. 2565)', curriculum_status: 'ใช้อยู่' },
  { curriculum_year: '2570', title_th: 'หลักสูตรพยาบาลศาสตรบัณฑิต (หลักสูตรปรับปรุง พ.ศ. 2570)', curriculum_status: 'ยังไม่เริ่มใช้' }
];

console.log('[1] รายชื่อหลักสูตรมาจากเมนูข้อมูลหลักสูตร');
t('อ่านหลักสูตรจากข้อมูลจริง ไม่ได้พิมพ์ตายตัวในโค้ด', () => {
  const f = loadCurriculumFns(TWO);
  const opts = f.curriculumOptions();
  assert.strictEqual(opts.length, 2, 'ควรได้สองหลักสูตร');
  assert.ok(!/['"]2570['"]/.test(APP.slice(APP.indexOf('function curriculumOptions()'), APP.indexOf('function subjectTypeField(s)'))),
    'มีการพิมพ์ปีหลักสูตรไว้ตายตัว ถ้าเพิ่มหลักสูตรใหม่จะไม่ขึ้นเอง');
});
t('เรียงหลักสูตรใหม่สุดขึ้นก่อน', () => {
  const opts = loadCurriculumFns(TWO).curriculumOptions();
  assert.strictEqual(opts[0].year, '2570', 'หลักสูตรใหม่ควรอยู่บน');
});
t('หลักสูตรซ้ำปีเดียวกันนับครั้งเดียว', () => {
  const opts = loadCurriculumFns(TWO.concat([{ curriculum_year: '2565', title_th: 'ซ้ำ' }])).curriculumOptions();
  assert.strictEqual(opts.length, 2, 'ยังมีรายการซ้ำ');
});
t('ข้ามแถวที่ไม่ได้ระบุปีหลักสูตร', () => {
  const opts = loadCurriculumFns(TWO.concat([{ curriculum_year: '', title_th: 'ไม่มีปี' }])).curriculumOptions();
  assert.strictEqual(opts.length, 2, 'แถวที่ไม่มีปีหลุดเข้ามา');
});

console.log('\n[2] ช่องเลือกหลักสูตรในฟอร์มรายวิชา');
t('เป็นช่องบังคับ และแสดงชื่อเต็มของหลักสูตร', () => {
  const h = loadCurriculumFns(TWO).curriculumField({});
  assert.ok(h.includes('name="curriculum_year"'), 'ไม่มีช่องหลักสูตร');
  assert.ok(h.includes('required'), 'ไม่ได้บังคับเลือก');
  assert.ok(h.includes('หลักสูตรปรับปรุง พ.ศ. 2570'), 'ไม่ได้แสดงชื่อเต็ม');
});
t('บอกสถานะของหลักสูตรที่ยังไม่เริ่มใช้', () => {
  const h = loadCurriculumFns(TWO).curriculumField({});
  assert.ok(h.includes('ยังไม่เริ่มใช้'), 'ไม่ได้บอกว่าหลักสูตรยังไม่เริ่มใช้');
  assert.ok(!/ใช้อยู่<\/option>/.test(h), 'หลักสูตรที่ใช้อยู่ไม่ต้องเขียนสถานะกำกับ');
});
t('แก้ไขรายวิชาแล้วเลือกหลักสูตรเดิมไว้ให้', () => {
  const h = loadCurriculumFns(TWO).curriculumField({ curriculum_year: '2565' });
  assert.ok(/value="2565" selected/.test(h), 'ไม่ได้เลือกหลักสูตรเดิมไว้');
  assert.ok(!/value="2570" selected/.test(h), 'เลือกผิดหลักสูตร');
});
t('ยังไม่มีหลักสูตรในระบบ ต้องพิมพ์เองได้ ไม่ใช่ตัน', () => {
  const h = loadCurriculumFns([]).curriculumField({});
  assert.ok(h.includes('<input name="curriculum_year"'), 'กลายเป็นช่องว่างที่เลือกอะไรไม่ได้');
  assert.ok(h.includes('ยังไม่มีหลักสูตรในระบบ'), 'ไม่ได้อธิบายว่าทำไมถึงพิมพ์เอง');
});
t('บอกทางไปเพิ่มหลักสูตรใหม่', () => {
  assert.ok(loadCurriculumFns(TWO).curriculumField({}).includes('ข้อมูลหลักสูตร'),
    'ผู้ใช้จะไม่รู้ว่าเพิ่มหลักสูตรใหม่ได้ที่ไหน');
});

console.log('\n[3] ป้ายหลักสูตรในตาราง');
t('แสดงปี และเอาเมาส์ชี้เห็นชื่อเต็ม', () => {
  const h = loadCurriculumFns(TWO).curriculumBadge('2570');
  assert.ok(h.includes('>2570<'), 'ไม่ได้แสดงปี');
  assert.ok(h.includes('หลักสูตรปรับปรุง พ.ศ. 2570'), 'ไม่มีชื่อเต็มใน title');
});
t('รายวิชาที่ยังไม่ระบุหลักสูตร ต้องเห็นว่ายังไม่ระบุ', () => {
  const h = loadCurriculumFns(TWO).curriculumBadge('');
  assert.ok(h.includes('ยังไม่ได้ระบุหลักสูตร'), 'ไม่ได้บอกว่ายังไม่ระบุ');
});
t('หลักสูตรที่ไม่มีในทะเบียน ยังแสดงปีได้ ไม่ขึ้นค่าว่าง', () => {
  assert.strictEqual(loadCurriculumFns(TWO).curriculumLabel('2599'), 'หลักสูตร 2599');
});

console.log('\n[4] การต่อเข้าหน้ารายวิชาที่เปิดสอน');
t('มีคอลัมน์หลักสูตรในตาราง', () => {
  assert.ok(APP.includes('<th class="px-4 py-3 font-semibold">หลักสูตร</th>'), 'ไม่มีหัวตาราง');
  assert.ok(APP.includes('curriculumBadge(s.curriculum_year)'), 'แถวไม่ได้แสดงหลักสูตร');
});
t('จำนวนคอลัมน์ตอนไม่มีข้อมูลต้องตรงกับหัวตาราง', () => {
  assert.ok(APP.includes('colspan="${isAdmin ? 11 : 10}"'), 'colspan ไม่ตรง ตารางจะเบี้ยวตอนไม่มีข้อมูล');
});
t('กรองตามหลักสูตรได้', () => {
  assert.ok(APP.includes('APP.filters._subjectCurriculum'), 'ไม่มีตัวกรอง');
  assert.ok(APP.includes("norm(s.curriculum_year) === curFilter"), 'ตัวกรองไม่ได้ใช้งานจริง');
  assert.ok(APP.includes('${curSelector}'), 'ไม่ได้วางตัวกรองลงหน้า');
});
t('ตัวกรองขึ้นเฉพาะเมื่อมีหลักสูตรมากกว่าหนึ่ง', () => {
  assert.ok(APP.includes('curOpts.length > 1 || usedCur.length > 1'), 'แสดงตัวกรองทั้งที่มีหลักสูตรเดียว');
});
t('เปลี่ยนหน้าแล้วตัวกรองถูกล้าง', () => {
  assert.ok(APP.includes("APP.filters._subjectCurriculum = '';"), 'ตัวกรองค้างข้ามหน้า');
});
t('ฟอร์มเพิ่มและแก้ไขมีช่องหลักสูตรทั้งคู่', () => {
  assert.ok(APP.includes('${curriculumField({})}'), 'ฟอร์มเพิ่มไม่มีช่องหลักสูตร');
  assert.ok(APP.includes('${curriculumField(s)}'), 'ฟอร์มแก้ไขไม่มีช่องหลักสูตร');
});
t('คัดลอกรายวิชาเดิมแล้วหลักสูตรต้องตามมาด้วย', () => {
  const i = APP.indexOf('function subjectCopyFrom');
  const seg = APP.slice(i, i + 1400);
  assert.ok(seg.includes('[name="curriculum_year"]'), 'คัดลอกแล้วหลักสูตรหาย');
});
t('หัวตาราง CSV มีคอลัมน์หลักสูตรเป็นคอลัมน์แรก', () => {
  assert.ok(APP.includes("csvUploadBtn('subject', 'curriculum_year,subject_code"), 'นำเข้า CSV แล้วไม่มีหลักสูตร');
});

console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
