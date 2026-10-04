/* ปฏิทินกิจกรรมวิชาการ · เลือกผู้รับประกาศ และช่องทาง (ในระบบ / อีเมล / LINE เลือกกลุ่ม) */
const fs = require('fs');
const assert = require('assert');
const P = require('path').join(__dirname, '..') + require('path').sep;
const SRC = fs.readFileSync(P + 'app.js', 'utf8');
const FN = fs.readFileSync(P + 'supabase/functions/announce-send/index.ts', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }
function grab(from, to) {
  const i = SRC.indexOf(from); assert.ok(i >= 0, 'ไม่พบ ' + from);
  const j = SRC.indexOf(to, i + from.length); assert.ok(j > i, 'ไม่พบจุดจบ ' + to);
  return SRC.slice(i, j);
}
const norm = v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim();
const APP = { currentUser: null };
const TITLE_PREFIXES = ['อ.', 'นาย', 'นาง', 'นางสาว', 'ผศ.', 'ดร.'];
eval(grab('function annParseRoles', 'function annVisibleTo').replace(/^const .*$/mg, ''));
function annParseYears(v) { return String(v || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean); }
function annYearsOf(a) { return annParseYears(a && a.yr); }
function annMyYear() { return norm(APP.currentUser && APP.currentUser.data && APP.currentUser.data.year_level); }
eval(grab('function annVisibleTo', '// ประกาศที่บทบาทผู้ใช้ปัจจุบันมีสิทธิ์เห็น'));
const as = (name, yr) => { APP.currentUser = { name, data: { year_level: yr } }; };

console.log('[1] ใครเห็นประกาศในระบบ');
const exam = { roles: 'student,teacher', yr: '2', target_names: 'อ.สมใจ ดีมาก' };
t('ผู้คุมสอบในรายชื่อเห็น แม้บทบาทไม่ได้ถูกเลือก', () => { as('สมใจ ดีมาก'); assert.ok(annVisibleTo(exam, 'registrar')); });
t('นักศึกษาชั้นปีที่เลือกเห็น (เดิมถูกซ่อนเพราะมีรายชื่อผู้คุมสอบ)', () => { as('นายเอ', '2'); assert.ok(annVisibleTo(exam, 'student')); });
t('นักศึกษาชั้นปีอื่นไม่เห็น', () => { as('นายบี', '1'); assert.ok(!annVisibleTo(exam, 'student')); });
t('บทบาทที่ไม่ได้เลือกและไม่อยู่ในรายชื่อไม่เห็น', () => { as('คนอื่น'); assert.ok(!annVisibleTo(exam, 'registrar')); });
t('ไม่เลือกบทบาท แต่มีรายชื่อ = เฉพาะคนในรายชื่อ', () => {
  const a = { roles: '', target_names: 'อ.สมใจ ดีมาก' };
  as('นายเอ', '2'); assert.ok(!annVisibleTo(a, 'student'));
  as('สมใจ ดีมาก'); assert.ok(annVisibleTo(a, 'teacher'));
});
t('ไม่เลือกอะไรเลย = ทุกคน', () => { as('ใครก็ได้', '3'); assert.ok(annVisibleTo({ roles: '' }, 'student')); });

console.log('\n[2] ฟอร์มปฏิทิน');
const form = grab('function scheduleFormBody', 'function toggleSchedNotify');
t('มีส่วนเลือกผู้รับ และช่องติ๊กผู้คุมสอบ', () => {
  assert.ok(form.includes('ประกาศให้ใครทราบ'));
  assert.ok(form.includes('id="schedNotifyProctors"'));
});
t('มีช่องทาง ในระบบ · อีเมล · LINE พร้อมเลือกกลุ่ม', () => {
  ['id="schedNotifyMail"', 'id="schedNotifyLine"', 'id="schedLineGroups"', 'id="schedLineBroadcast"'].forEach(k => assert.ok(form.includes(k), 'ขาด ' + k));
});
t('ไม่ส่ง LINE เข้าทุกกลุ่มอัตโนมัติอีกต่อไป', () => {
  const fn = grab('async function createScheduleAnnouncement', 'function showAddScheduleModal');
  assert.ok(/line_notify: ''/.test(fn));
  assert.ok(fn.includes("mode: 'send'"));
});
t('จัดหลายวัน: ส่งอีเมล/LINE ครั้งเดียว', () => {
  const add = grab('function showAddScheduleModal', '// ======================== GRADES');
  assert.ok(add.includes('i === 0 ? ch : null'));
});

console.log('\n[3] Edge Function announce-send');
t('ตรวจสิทธิ์ผู้ส่ง และคำนวณผู้รับจากตัวประกาศฝั่งเซิร์ฟเวอร์', () => {
  assert.ok(FN.includes("SENDER_ROLES = ['admin', 'academic', 'registrar', 'executive']"));
  assert.ok(FN.includes('listOf(ann.roles)') && FN.includes('listOf(ann.target_names)'));
});
t('อีเมลส่งแบบ BCC และกันส่งซ้ำ', () => { assert.ok(FN.includes('bcc: queue[i]')); assert.ok(FN.includes('extra.mail_sent')); });
t('LINE ส่งเฉพาะกลุ่มที่เลือก broadcast ต้องติ๊กเอง', () => { assert.ok(FN.includes('wantIds.includes')); assert.ok(FN.includes('body.broadcast === true')); });

console.log('\n[4] บริการอื่นๆ › ข่าวสาร/แจ้งเตือน');
const addAnn = grab('function showAddAnnouncementModal', 'function annChannelFieldHTML');
const edAnn = grab('function showEditAnnouncementModal', 'function showEditTrackingModal');
const chf = grab('function annChannelFieldHTML', 'function annChannelOpts');
t('ฟอร์มเพิ่ม/แก้ไขมีช่องเลือกผู้รับ และช่องทาง อีเมล + LINE', () => {
  [addAnn, edAnn].forEach(f => { assert.ok(f.includes('annRolesFieldHTML(')); assert.ok(f.includes('annYearFieldHTML(')); assert.ok(f.includes('annChannelFieldHTML(')); });
  assert.ok(chf.includes('id="annChMail"') && chf.includes('id="annChLine"'));
});
t('LINE ไม่ต้องเลือกกลุ่ม: ส่งทุกกลุ่มที่ติดต่อได้ และไม่ broadcast', () => {
  const f = grab('async function annSendChannels', 'function showEditAnnouncementModal');
  assert.ok(f.includes('annAllLineGroupIds()') && f.includes('broadcast: false'));
  assert.ok(!chf.includes('sched-line-grp'), 'ไม่ควรมีช่องเลือกกลุ่ม');
});
t('บันทึกประกาศไม่สั่ง LINE แบบเดิมเอง', () => {
  assert.ok(addAnn.includes("obj.line_notify = ''"));
  assert.ok(edAnn.includes("a.line_notify = ''"));
});
t('ช่องทางที่ส่งไปแล้วถูกล็อกไว้ ไม่ส่งซ้ำ', () => { assert.ok(chf.includes("mailSent ? 'disabled'") && chf.includes("lineSent ? 'disabled'")); });

console.log('\n[5] เพิ่มกลุ่ม LINE อัตโนมัติ');
const HOOK = fs.readFileSync(P + 'supabase/functions/line-webhook/index.ts', 'utf8');
eval(grab('function lineGroupStatus', 'async function renderLineGroupBox'));
t('ตรวจลายเซ็น LINE ทุกคำขอ', () => { assert.ok(HOOK.includes('validSignature(SECRET, raw, sig)')); });
t('กลุ่มใหม่เข้ามาเป็น "รออนุมัติ" ไม่รับประกาศทันที', () => {
  assert.ok(/is_active: '0',\s*\n\s*note: `รออนุมัติ/.test(HOOK));
  assert.strictEqual(lineGroupStatus({ is_active: '0', note: 'รออนุมัติ — x' }).k, 'pending');
});
t('บอทออกจากกลุ่ม → ปิดกลุ่ม', () => {
  assert.ok(HOOK.includes("ev.type === 'leave'"));
  assert.strictEqual(lineGroupStatus({ is_active: '0', note: 'เคยอนุมัติ — บอทออกจากกลุ่ม/ถูกเชิญออกเมื่อ x' }).k, 'left');
});
t('กลุ่มเดิมที่ใช้อยู่ยังรับประกาศ', () => { assert.strictEqual(lineGroupStatus({ is_active: '1', note: null }).k, 'on'); });
t('หน้าตั้งค่ามีส่วนอนุมัติกลุ่ม', () => { assert.ok(SRC.includes('id="lineGroupBox"') && SRC.includes("lineGroupSet(${g.id},'1')")); });

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
