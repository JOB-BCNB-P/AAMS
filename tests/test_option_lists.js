/* ตั้งค่าระบบ : รายการตัวเลือกที่ผู้ดูแลแก้ได้เอง
   ประเภทการสอบภาษาอังกฤษ · ประเภทกิจกรรมในปฏิทินกิจกรรมวิชาการ
   จุดที่ต้องไม่พลาด
   1) บันทึกค่าว่างแล้วฟอร์มต้องไม่เหลือตัวเลือกเป็นศูนย์
   2) ถอดตัวเลือกที่มีข้อมูลใช้อยู่ ต้องเตือนก่อน และข้อมูลเดิมต้องไม่หาย
   3) ค่าที่บันทึกไว้แล้วในระเบียน ต้องยังเห็นในช่องเลือกของระเบียนนั้น */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(sig) {
  const i = APP.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = APP.indexOf('{', i); k < APP.length; k++) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); }
  }
  throw new Error('อ่านฟังก์ชันไม่จบ: ' + sig);
}

let SETTINGS = [];
const env = {
  norm: v => String(v == null ? '' : v).trim(),
  htmlEsc: v => String(v == null ? '' : v).replace(/"/g, '&quot;'),
  getDataByType: tb => tb === 'app_setting' ? SETTINGS : []
};
const SRC = [grab('function optionList(key, fallback)'), grab('function appSetting(key, def)'),
  grab('function engTypeList()'), grab('function engTypeOptions(selected)'), grab('function scheduleTypeList()')].join('\n')
  + '\nconst ENG_TYPES_DEFAULT = ' + JSON.stringify(['สบช.', 'TOEIC', 'CU-TEP'])
  + ';\nconst SCHEDULE_TYPES_DEFAULT = ' + JSON.stringify(['สอบกลางภาค', 'กิจกรรม']) + ';';
const R = new Function(...Object.keys(env), SRC + '; return { optionList, engTypeList, scheduleTypeList, engTypeOptions };')(...Object.values(env));

console.log('\n[1] การอ่านรายการ');
t('ยังไม่เคยตั้งค่า ใช้ค่าตั้งต้นของระบบ', () => {
  SETTINGS = [];
  assert.deepStrictEqual(R.engTypeList(), ['สบช.', 'TOEIC', 'CU-TEP']);
  assert.deepStrictEqual(R.scheduleTypeList(), ['สอบกลางภาค', 'กิจกรรม']);
});
t('ตัดช่องว่างและค่าซ้ำออก คงลำดับที่ตั้งไว้', () => {
  SETTINGS = [{ setting_key: 'eng_types', setting_value: 'TOEIC|| IELTS ||TOEIC||  ||สบช.' }];
  assert.deepStrictEqual(R.engTypeList(), ['TOEIC', 'IELTS', 'สบช.']);
});
t('เผลอบันทึกเป็นค่าว่าง ต้องกลับไปใช้ค่าตั้งต้น ไม่ใช่ไม่มีตัวเลือกเลย', () => {
  SETTINGS = [{ setting_key: 'eng_types', setting_value: '   ' }];
  assert.deepStrictEqual(R.engTypeList(), ['สบช.', 'TOEIC', 'CU-TEP']);
  SETTINGS = [{ setting_key: 'eng_types', setting_value: '|| ||' }];
  assert.deepStrictEqual(R.engTypeList(), ['สบช.', 'TOEIC', 'CU-TEP']);
});
t('รายการของคนละคีย์ไม่ปนกัน', () => {
  SETTINGS = [{ setting_key: 'schedule_types', setting_value: 'วิพากษ์' }];
  assert.deepStrictEqual(R.scheduleTypeList(), ['วิพากษ์']);
  assert.deepStrictEqual(R.engTypeList(), ['สบช.', 'TOEIC', 'CU-TEP'], 'ไปหยิบค่าของอีกคีย์มา');
});

console.log('\n[2] ไม่ทำข้อมูลเดิมพัง');
t('ค่าที่บันทึกไว้ในระเบียน ยังเห็นในช่องเลือกแม้ถูกถอดออกจากรายการ', () => {
  SETTINGS = [{ setting_key: 'eng_types', setting_value: 'TOEIC' }];
  const h = R.engTypeOptions('CU-TEP');
  assert.ok(h.includes('CU-TEP'), 'เปิดแก้ไขระเบียนเดิมแล้วค่าหาย จะถูกบันทึกทับเป็นค่าว่าง');
  assert.ok(h.includes('selected'), 'ค่าเดิมไม่ได้ถูกเลือกไว้');
});
t('เตือนก่อนถอดตัวเลือกที่ยังมีข้อมูลใช้อยู่', () => {
  const g = grab('window.optionSave = async function (key)');
  assert.ok(g.includes('optionCount(key)'), 'ไม่ได้นับการใช้งานจริง');
  assert.ok(g.includes('ข้อมูลเดิมไม่ถูกลบ'), 'ไม่ได้บอกว่าข้อมูลเดิมปลอดภัย');
  assert.ok(g.includes('confirm('), 'ถอดออกได้เลยโดยไม่ถาม');
});
t('เตือนเป็นพิเศษเมื่อถอดค่าที่ระบบอ้างอิงตรงตัว', () => {
  const g = grab('window.optionSave = async function (key)');
  assert.ok(g.includes('cfg.locked'), 'ไม่ได้ตรวจค่าที่ล็อกไว้');
  assert.ok(APP.includes("locked: ['สบช.']"), 'ไม่ได้ล็อก สบช. ซึ่งสถิติทั้งระบบอ้างอิงอยู่');
  assert.ok(APP.includes('ถอดออกแล้วตัวเลขจะเพี้ยน'), 'ไม่ได้อธิบายผลกระทบ');
});
t('บันทึกรายการว่างไม่ได้', () => {
  const g = grab('window.optionSave = async function (key)');
  assert.ok(g.includes('ต้องมีอย่างน้อย 1 ตัวเลือก'), 'บันทึกจนไม่เหลือตัวเลือกได้');
});
t('เก็บลง app_setting ไม่ได้ไปแก้ข้อมูลจริง', () => {
  const g = grab('window.optionSave = async function (key)');
  assert.ok(g.includes("type: 'app_setting'"), 'เก็บผิดที่');
  assert.ok(!/getDataByType\('eng_result'\)|getDataByType\('schedule'\)/.test(g.replace(/optionCount\(key\)/g, '')),
    'ไปแตะข้อมูลผลสอบหรือปฏิทินโดยตรง');
});
t('คืนค่าเริ่มต้นยังไม่บันทึกจนกว่าจะกดบันทึก', () => {
  const g = grab('window.optionReset = function (key)');
  assert.ok(!/GSheetDB\.(create|update)/.test(g), 'กดคืนค่าแล้วเขียนทับทันที');
  assert.ok(g.includes('กดบันทึกเพื่อใช้งานจริง'), 'ไม่ได้บอกว่าต้องกดบันทึกต่อ');
});

console.log('\n[3] เมนูและเส้นทาง');
t('มีเมนูย่อยทั้งสองรายการ', () => {
  assert.ok(APP.includes("{ id: 'settingsEngTypes', label: 'ประเภทการสอบภาษาอังกฤษ' }"), 'ไม่มีเมนูประเภทการสอบ');
  assert.ok(APP.includes("{ id: 'settingsSchedTypes', label: 'ประเภทกิจกรรม (ปฏิทิน)' }"), 'ไม่มีเมนูประเภทกิจกรรม');
  assert.ok(APP.includes("case 'settingsEngTypes':") && APP.includes("case 'settingsSchedTypes':"), 'ไม่มีเส้นทางหน้า');
});
t('ฟอร์มจริงดึงรายการจากค่าตั้งค่า ไม่ใช่ค่าตายตัว', () => {
  assert.ok(grab('function engTypeOptions(selected)').includes('engTypeList()'), 'ช่องรูปแบบการสอบยังใช้ค่าตายตัว');
  assert.ok(grab('function scheduleTypeInput(name, selectedValue)').includes('scheduleTypeList()'), 'ช่องประเภทกิจกรรมยังใช้ค่าตายตัว');
});
t('ปฏิทินยังรวมประเภทที่เคยใช้จริงมาแสดงด้วย', () => {
  const g = grab('function scheduleTypeInput(name, selectedValue)');
  assert.ok(g.includes('existing'), 'ประเภทที่เคยพิมพ์เองจะหายไปจากรายการ');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
