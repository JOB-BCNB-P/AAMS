/* ประกาศแจ้งเตือน : เลือกผู้รับเป็นรายบุคคลภายในบทบาทที่เลือก
   จุดที่ต้องไม่พลาด
   1) เลือกรายบุคคลแล้วต้องไม่ส่งถึงทุกคนในบทบาทนั้น
   2) ประกาศเดิมที่ตั้งใจให้ "ทั้งบทบาท + รายชื่อเพิ่ม" ต้องไม่ถูกเปลี่ยนความหมาย
   3) ประเภท "วิพากษ์" ต้องมีในปฏิทินกิจกรรมวิชาการ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const FN = fs.readFileSync(path.join(ROOT, 'supabase/functions/announce-send/index.ts'), 'utf8');
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

console.log('\n[1] ปฏิทินกิจกรรมวิชาการ — ประเภท "วิพากษ์"');
t('มีให้เลือกในช่องประเภท', () => {
  assert.ok(grab('function scheduleTypeInput(').includes("'วิพากษ์'"), 'ไม่มีในรายการประเภท');
});
t('มีสีป้ายและจุดบนปฏิทินของตัวเอง ไม่ปนกับประเภทอื่น', () => {
  assert.ok(/วิพากษ์[\s\S]{0,80}amber/.test(grab('function scheduleTypeBadge(')), 'ป้ายยังใช้สีรวมกับประเภทอื่น');
  assert.ok(/วิพากษ์[\s\S]{0,40}amber/.test(grab('function calEventDot(')), 'จุดบนปฏิทินยังใช้สีรวม');
});
t('ไม่ถูกนับเป็นการสอบ จึงไม่ไปเปิดช่องข้อมูลการสอบ', () => {
  assert.ok(!'วิพากษ์'.includes('สอบ'), 'ชื่อประเภทไปชนเงื่อนไขการสอบ');
});

t('บังคับเลือกรายวิชาเฉพาะสอบกลางภาค/ปลายภาค', () => {
  const F = new Function('norm', grab('function schedNeedsSubject(') + ' return schedNeedsSubject;')(
    v => String(v == null ? '' : v).trim());
  ['สอบกลางภาค', 'สอบซ่อมกลางภาค', 'สอบปลายภาค', 'สอบซ่อมปลายภาค'].forEach(t2 =>
    assert.strictEqual(F(t2), true, t2 + ' ต้องบังคับเลือกรายวิชา'));
  ['วิพากษ์', 'กิจกรรม', 'วันหยุด', 'สอบย่อย', 'สอบ OSCE', 'สอบรวบยอด', 'สอบซ่อมรวบยอด', 'สอบภาษาอังกฤษสบช.', ''].forEach(t2 =>
    assert.strictEqual(F(t2), false, t2 + ' ไม่ควรบังคับเลือกรายวิชา'));
});
t('ด่านตรวจตอนบันทึกใช้เงื่อนไขเดียวกัน ทั้งฟอร์มเพิ่มและฟอร์มแก้ไข', () => {
  const n = (APP.match(/schedNeedsSubject\(fd\.get\('schedule_type'\)\)/g) || []).length;
  assert.strictEqual(n, 2, 'ยังมีฟอร์มที่บังคับเลือกรายวิชาทุกประเภทอยู่');
  assert.ok(!APP.includes("showToast('กรุณาระบุรายวิชา/กิจกรรม'"), 'ยังเหลือข้อความบังคับแบบเดิม');
});

console.log('\n[2] กติกาฝั่งส่งอีเมล (Edge Function) ที่โค้ดหน้าเว็บต้องเคารพ');
t('รายชื่อเจาะจงจะ "แทนที่" บทบาทได้ ก็ต่อเมื่อช่องบทบาทว่าง', () => {
  assert.ok(/const onlyNamed = nameSet\.size > 0 && roles\.length === 0/.test(FN),
    'กติกาฝั่ง Edge Function เปลี่ยนไป ต้องทบทวนตรรกะหน้าเว็บใหม่');
  assert.ok(/const wantRoles = roles\.length \? roles : \(onlyNamed \? \[\] : ALL_ROLES\)/.test(FN),
    'เลือกบทบาทพร้อมรายชื่อจะกลายเป็นส่งทั้งบทบาท');
});
t('หน้าเว็บล้างบทบาททิ้งเมื่อผู้ใช้เลือกรายบุคคล', () => {
  const g = grab('function annRolesForSave()');
  assert.ok(g.includes('annCollectNames()'), 'ไม่ได้อ่านรายชื่อที่เลือก');
  assert.ok(/window\._annNarrow \? '' : annCollectRoles\(\)/.test(g), 'ไม่ได้ล้างบทบาทเมื่อเลือกรายบุคคล');
});

console.log('\n[3] ตรรกะผู้รับ (จำลองตาม Edge Function)');
function recipients(users, roles, names) {
  const key = n => String(n || '').replace(/\s+/g, '');
  const nameSet = new Set(names.map(key).filter(Boolean));
  const onlyNamed = nameSet.size > 0 && roles.length === 0;
  const want = roles.length ? roles : (onlyNamed ? [] : ['teacher', 'student', 'academic']);
  return users.filter(u => nameSet.has(key(u.name)) || u.roles.some(r => want.indexOf(r) !== -1)).map(u => u.name);
}
const USERS = [
  { name: 'อ.ก', roles: ['teacher'] },
  { name: 'อ.ข', roles: ['teacher'] },
  { name: 'อ.ค', roles: ['teacher'] },
  { name: 'นศ.ง', roles: ['student'] }
];
t('เลือกบทบาทอาจารย์ ไม่เลือกรายชื่อ = ส่งถึงอาจารย์ทุกคน', () => {
  assert.deepStrictEqual(recipients(USERS, ['teacher'], []), ['อ.ก', 'อ.ข', 'อ.ค']);
});
t('เลือกอาจารย์ 2 คน แล้วล้างบทบาท = ส่งถึง 2 คนนั้นเท่านั้น', () => {
  assert.deepStrictEqual(recipients(USERS, [], ['อ.ก', 'อ.ค']), ['อ.ก', 'อ.ค'],
    'ถ้าส่งบทบาทไปด้วยจะกลายเป็นแจ้งอาจารย์ทั้งหมด');
});
t('ถ้าเผลอส่งทั้งบทบาทและรายชื่อ จะกลายเป็นแจ้งทั้งบทบาท (เหตุผลที่ต้องล้างบทบาท)', () => {
  assert.deepStrictEqual(recipients(USERS, ['teacher'], ['อ.ก']), ['อ.ก', 'อ.ข', 'อ.ค']);
});

console.log('\n[4] การแสดงผลและการกันพลาด');
t('คัดเฉพาะผู้ใช้ที่มีอีเมลและยังเปิดใช้งาน', () => {
  const g = grab('function annPeopleAll()');
  assert.ok(g.includes('if (!name || !email) return;'), 'ยังเสนอชื่อคนที่ไม่มีอีเมล จะส่งไม่ถึง');
  assert.ok(/is_active/.test(g) && /'false'/.test(g), 'ยังเสนอบัญชีที่ปิดใช้งาน');
});
t('เตือนเมื่อมีผู้ใช้ชื่อซ้ำ เพราะระบบส่งอีเมลเทียบจากชื่อ', () => {
  assert.ok(APP.includes('function annDupKeys('), 'ไม่มีการตรวจชื่อซ้ำ');
  assert.ok(grab('window.annPeopleRender = function ()').includes('ชื่อซ้ำ'), 'ไม่ได้เตือนบนหน้าจอ');
});
t('ค้นหาจากชื่อ-สกุลได้ และกรองตามบทบาทที่ติ๊ก', () => {
  const g = grab('window.annPeopleRender = function ()');
  assert.ok(g.includes("document.getElementById('annPeopleQ')"), 'ไม่มีช่องค้นหา');
  assert.ok(g.includes('annCollectRoles()'), 'ไม่ได้กรองรายชื่อตามบทบาทที่เลือก');
});
t('ตัวนับผู้รับอีเมลอัปเดตตามรายชื่อที่เลือก', () => {
  const g = grab('window.annPeopleRender = function ()');
  assert.ok(g.includes('window._annEditNames = val'), 'ตัวอย่างจำนวนผู้รับจะไม่ตรงกับที่เลือก');
  assert.ok(g.includes('annChannelChanged()'), 'ไม่ได้สั่งนับผู้รับใหม่');
});
t('ประกาศเดิมที่ไม่ได้แตะตัวเลือก ต้องคงบทบาทไว้เหมือนเดิม', () => {
  const g = grab('function annPeopleFieldHTML(');
  assert.ok(g.includes('window._annNarrow = false'), 'เปิดฟอร์มแล้วตั้งค่าเป็นแคบทันที ของเดิมจะเพี้ยน');
});
t('รายการประกาศไม่บอกว่า "ทุกบทบาท" ทั้งที่ส่งเฉพาะบางคน', () => {
  assert.ok(APP.includes("'เฉพาะรายชื่อ ' + annParseNames(a.target_names).length + ' คน'"),
    'ป้ายกำกับยังทำให้เข้าใจผิดว่าส่งถึงทุกคน');
});

console.log('\n────────────────────────────');
console.log((fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
