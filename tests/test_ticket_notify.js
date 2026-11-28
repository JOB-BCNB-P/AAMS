/* แจ้งเตือนทางอีเมลเมื่อมีเรื่องแจ้งปัญหาใหม่
   สิ่งที่ต้องไม่พลาด : อีเมลล้มต้องไม่ทำให้เรื่องหาย · ปลายทางต้องมาจากเซิร์ฟเวอร์
   · ส่งซ้ำไม่ได้ · ไม่เผยเนื้อหาเรื่องกลับมาที่เบราว์เซอร์ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const APP = fs.readFileSync(P + 'app.js', 'utf8');
const FN = fs.readFileSync(P + 'supabase/functions/ticket-notify/index.ts', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
function grab(src, sig) {
  const i = src.indexOf(sig);
  assert.ok(i > -1, 'ไม่พบ ' + sig);
  let d = 0;
  for (let k = src.indexOf('{', i + sig.length); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('อ่านไม่จบ');
}

console.log('[1] ฝั่งหน้าเว็บ');
const H = grab(APP, 'async function notifyTicketMail(ticketId)');
t('เรียกฟังก์ชันฝั่งเซิร์ฟเวอร์ ส่งไปแค่เลขที่เรื่อง', () => {
  assert.ok(/functions\.invoke\('ticket-notify'/.test(H), 'ไม่ได้เรียก ticket-notify');
  assert.ok(/body: \{ ticket_id: ticketId \}/.test(H), 'ส่งข้อมูลเกินจำเป็นไปให้เซิร์ฟเวอร์');
  assert.ok(!/email|recipient|to:/i.test(H.replace(/\/\/.*/g, '')),
    'หน้าเว็บกำหนดผู้รับเองได้ ซึ่งแก้จากคอนโซลแล้วส่งถึงใครก็ได้');
});
t('อีเมลล้มเหลวต้องไม่ทำให้เรื่องที่แจ้งหายไป', () => {
  const sub = APP.slice(APP.indexOf('const r = await GSheetDB.create(obj);', APP.indexOf('showAddTicketModal')));
  const seg = sub.slice(0, 700);
  assert.ok(/if \(r\.isOk\)/.test(seg), 'ไม่พบเงื่อนไขบันทึกสำเร็จ');
  assert.ok(/closeModal\(\); renderCurrentPage\(\);/.test(seg), 'ไม่ได้ปิดหน้าต่างเมื่อบันทึกสำเร็จ');
  assert.ok(!/throw|return;/.test(seg.slice(0, seg.indexOf('closeModal'))), 'อาจหลุดออกก่อนปิดงาน');
});
t('ตัวเรียกดักข้อผิดพลาดเองทั้งหมด ไม่โยนต่อ', () => {
  assert.ok(/try \{/.test(H) && /catch \(e\)/.test(H), 'ไม่มีการดักข้อผิดพลาด');
  assert.ok(/return \{ isOk: false/.test(H), 'ไม่ได้คืนผลเป็นค่าปกติ');
});

console.log('\n[2] สิทธิ์และการกันใช้ผิดทาง');
t('ผู้เรียกต้องเข้าสู่ระบบ', () =>
  assert.ok(/if \(!userData\?\.user\) return json\(\{ isOk: false/.test(FN), 'คนไม่ล็อกอินก็สั่งส่งได้'));
t('ต้องเป็นเจ้าของเรื่อง หรือผู้ดูแลระบบเท่านั้น', () => {
  assert.ok(/const mine = \(tk\.auth_uid/.test(FN), 'ไม่ได้ตรวจความเป็นเจ้าของ');
  assert.ok(/if \(!mine && !iAmAdmin\) return json/.test(FN), 'ใครก็ไล่เลขเรื่องแล้วสั่งส่งอีเมลได้');
});
t('ผู้รับคำนวณจากฐานข้อมูลฝั่งเซิร์ฟเวอร์ ไม่ได้รับมาจากคำขอ', () => {
  assert.ok(/from\('app_user'\)/.test(FN), 'ไม่ได้ดึงรายชื่อจากฐานข้อมูล');
  assert.ok(!/body\.(to|recipients?|email)/.test(FN), 'รับปลายทางมาจากเบราว์เซอร์');
});
t('ส่งเฉพาะอีเมลโดเมนของวิทยาลัย และเฉพาะบัญชีที่เปิดใช้งาน', () => {
  assert.ok(/endsWith\('@' \+ ALLOWED_DOMAIN\)/.test(FN), 'ส่งออกนอกโดเมนได้');
  assert.ok(/is_active/.test(FN), 'ส่งถึงบัญชีที่ถูกปิดใช้งานด้วย');
});
t('ส่งได้ครั้งเดียวต่อเรื่อง', () =>
  assert.ok(/if \(norm\(extra\.notify_mail\)\) return json\(\{ isOk: true, skipped/.test(FN),
    'กดซ้ำหรือเรียกซ้ำแล้วอีเมลจะถล่มผู้ดูแล'));
t('จดว่าแจ้งแล้วเฉพาะตอนส่งสำเร็จ', () => {
  const i = FN.indexOf('if (ok) {');
  assert.ok(i > 0 && /notify_mail: `✓/.test(FN.slice(i, i + 300)),
    'ส่งพลาดแล้วถูกตีตราว่าแจ้งแล้ว จะลองใหม่ไม่ได้');
});
t('มีเพดานกันการแจ้งรัวจากคนเดียวกัน', () => {
  assert.ok(/10 \* 60 \* 1000/.test(FN) && /\(recent \?\? 0\) > 5/.test(FN), 'ไม่มีเพดาน');
});

console.log('\n[3] ความเป็นส่วนตัวและความถูกต้องของอีเมล');
t('คำตอบที่ส่งกลับเบราว์เซอร์ไม่มีเนื้อหาเรื่องและไม่มีอีเมลผู้รับ', () => {
  const last = FN.slice(FN.lastIndexOf('return json('));
  assert.ok(!/detail|title|to\b(?!\.length)/.test(last.replace(/\/\/.*/g, '')),
    'คำตอบเผยข้อมูลที่ไม่ควรกลับไปหน้าเว็บ · ' + last.slice(0, 120));
  assert.ok(/to\.length/.test(last), 'ไม่ได้บอกจำนวนผู้รับ');
});
t('ส่งแบบ BCC ผู้รับจึงไม่เห็นอีเมลของกันและกัน', () =>
  assert.ok(/bcc: to/.test(FN) && /to: MAIL_FROM/.test(FN), 'อีเมลผู้ดูแลทุกคนจะถูกเปิดเผยในหัวจดหมาย'));
t('ตัดความยาวรายละเอียดกันอีเมลบวม', () =>
  assert.ok(/\.slice\(0, 1500\)/.test(FN), 'เนื้อหายาวมากจะทำให้อีเมลส่งไม่ผ่าน'));
t('หัวเรื่องเป็นอังกฤษล้วน และเนื้อหาไทยถูกแปลงเป็นรหัส HTML ก่อนส่ง', () => {
  const m = FN.match(/const subject = `\[AAMs\][^`]*`/);
  assert.ok(m, 'ไม่พบหัวเรื่อง');
  assert.ok(!/[฀-๿]/.test(m[0]), 'หัวเรื่องภาษาไทยยาวจะทำให้ส่วนหัวอีเมลเสีย · ' + m[0]);
  assert.ok(/asciiHtml\(buildHtml\(/.test(FN), 'อักษรไทยในเนื้ออีเมลจะเพี้ยนที่ปลายทาง');
});
t('ข้อความทุกส่วนที่มาจากผู้ใช้ถูก escape ก่อนใส่ใน HTML', () => {
  const b = grab(FN, 'function buildHtml(t: Record<string, unknown>, link: string, college: string, system: string)');
  const raw = b.match(/\$\{(?!esc\(|row\(|detail \?)[^}]*\}/g) || [];
  assert.strictEqual(raw.length, 0, 'มีค่าที่ไม่ผ่าน esc : ' + raw.join(' '));
});
t('บันทึกลงสมุดส่งอีเมลทุกครั้ง ทั้งสำเร็จและไม่สำเร็จ', () => {
  assert.ok(/from\('mail_log'\)\.insert/.test(FN), 'ไม่มีร่องรอยให้ตรวจย้อนหลัง');
  assert.ok(/status: ok \? 'สำเร็จ' : 'ไม่สำเร็จ'/.test(FN), 'ไม่ได้บันทึกผล');
});

console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
