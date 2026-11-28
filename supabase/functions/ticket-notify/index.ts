// ============================================================
// ticket-notify — แจ้งเตือนทางอีเมลเมื่อมีคนแจ้งปัญหาการใช้งานเข้ามาใหม่
//
// ทำไมเป็นอีเมล ไม่ใช่ LINE
//   LINE นับโควตาตามจำนวนผู้รับ (ส่งเข้ากลุ่ม 5 คน = 5 ข้อความ)
//   แพ็กเกจฟรีมี 300 ข้อความ/เดือน และการ broadcast จะถึงเพื่อนทุกคนของ OA
//   ซึ่งรวมนักศึกษา เรื่องแจ้งปัญหาของคนหนึ่งจะหลุดถึงคนอื่น อีเมลจึงเหมาะกว่า
//
// ความปลอดภัย
//   • ผู้เรียกต้องเป็นเจ้าของเรื่องที่แจ้ง หรือเป็นผู้ดูแลระบบ
//     กันไม่ให้ไล่เลขเรื่องของคนอื่นแล้วสั่งส่งอีเมลซ้ำ ๆ
//   • รายชื่อผู้รับคำนวณฝั่งเซิร์ฟเวอร์เสมอ เบราว์เซอร์กำหนดปลายทางไม่ได้
//   • ส่งได้ครั้งเดียวต่อหนึ่งเรื่อง จดเวลาไว้ที่ extra.notify_mail
//   • จำกัดอัตรา : ผู้แจ้งคนเดียวกันเกิน 5 เรื่องใน 10 นาที จะไม่ส่งอีเมลเพิ่ม
//   • คำตอบที่ส่งกลับเบราว์เซอร์ไม่มีเนื้อหาเรื่องและไม่มีอีเมลผู้รับ
//
// หมายเหตุเรื่องภาษาไทยในอีเมล (เหมือน survey-invite-mail)
//   หัวเรื่องเป็นอังกฤษล้วน และเนื้อหาถูกแปลงเป็นรหัสตัวเลขของ HTML ก่อนส่ง
//   เพราะตัวเข้ารหัสของ denomailer ตัดบรรทัดกลางไบต์ของอักษรไทย
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const asciiHtml = (s: string) => s.replace(/[\u0080-￿]/g, (c) => '&#' + c.charCodeAt(0) + ';')

const ROLE_LABEL: Record<string, string> = {
  admin: 'ผู้ดูแลระบบ', academic: 'เจ้าหน้าที่งานวิชาการ', registrar: 'เจ้าหน้าที่งานทะเบียน',
  deptHead: 'ประธานสาขาวิชา', executive: 'ผู้บริหาร', teacher: 'อาจารย์',
  classTeacher: 'อาจารย์ประจำชั้น', otherStaff: 'เจ้าหน้าที่งานอื่นๆ', student: 'นักศึกษา',
}

function thaiTime(v: string) {
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })
}

function buildHtml(t: Record<string, unknown>, link: string, college: string, system: string) {
  const row = (k: string, v: string) =>
    v ? `<tr><td style="padding:6px 10px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td>
          <td style="padding:6px 0;color:#1f2937">${esc(v)}</td></tr>` : ''
  const role = ROLE_LABEL[String(t.reporter_role ?? '')] ?? String(t.reporter_role ?? '')
  const detail = String(t.detail ?? '').slice(0, 1500)
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:16px;background:#f5f8fc;font-family:'Sarabun','Segoe UI',Tahoma,sans-serif;color:#1f2937">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:14px;padding:24px">
<h2 style="margin:0 0 4px;font-size:19px;color:#1e6fba">มีเรื่องแจ้งปัญหาการใช้งานใหม่</h2>
<p style="margin:0 0 18px;font-size:13px;color:#6b7280">${esc(system)} · ${esc(college)}</p>
<p style="font-size:16px;font-weight:600;margin:0 0 12px">${esc(String(t.title ?? ''))}</p>
<table style="font-size:14px;line-height:1.7;border-collapse:collapse;margin-bottom:16px">
${row('ประเภทปัญหา', String(t.category ?? ''))}
${row('ผู้แจ้ง', norm(t.reporter_name) + (role ? ' (' + role + ')' : ''))}
${row('เวลาที่แจ้ง', thaiTime(String(t.created_at ?? '')))}
${row('เลขที่เรื่อง', '#' + String(t.id ?? ''))}
</table>
${detail ? `<div style="background:#f0f7ff;border:1px solid #dbeafe;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.8;white-space:pre-wrap">${esc(detail)}</div>` : ''}
<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#1e6fba;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-size:15px;font-weight:600">เปิดดูและตอบในระบบ</a></p>
<p style="font-size:12px;color:#6b7280;line-height:1.8;border-top:1px solid #eef2f7;padding-top:12px;margin-top:18px">
ตอบเรื่องได้ที่เมนู <b>บริการอื่นๆ</b> ในระบบ · อีเมลฉบับนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ</p>
</div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const ALLOWED_DOMAIN = (Deno.env.get('MAIL_ALLOWED_DOMAIN') ?? 'bcn.ac.th').toLowerCase()
  const COLLEGE = Deno.env.get('COLLEGE_NAME') ?? 'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ'
  const SYSTEM = Deno.env.get('SYSTEM_TITLE') ?? 'ระบบบริหารจัดการงานวิชาการ (AAMs)'
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://job-bcnb-p.github.io/AAMS/'
  // บทบาทที่จะได้รับอีเมล ตั้งเพิ่มได้ที่ Secrets เช่น "admin,academic"
  const NOTIFY_ROLES = (Deno.env.get('TICKET_NOTIFY_ROLES') ?? 'admin')
    .split(',').map((x) => x.trim()).filter(Boolean)

  const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? ''
  const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
  const SMTP_USER = Deno.env.get('SMTP_USER') ?? ''
  const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? ''
  const MAIL_FROM_RAW = Deno.env.get('MAIL_FROM') ?? SMTP_USER
  const MAIL_FROM = (MAIL_FROM_RAW.match(/<([^>]+)>/)?.[1] ?? MAIL_FROM_RAW).trim()

  // ---------- ตรวจสิทธิ์ผู้เรียก ----------
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return json({ isOk: false, error: 'กรุณาเข้าสู่ระบบ' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: me } = await admin.from('app_user')
    .select('role, extra_roles, name, email, is_active').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!me || ['0', 'false', 'ปิด'].includes(String(me.is_active ?? '1').trim())) {
    return json({ isOk: false, error: 'บัญชีนี้ถูกปิดการใช้งาน' }, 403)
  }
  const myRoles = `${me.role ?? ''},${me.extra_roles ?? ''}`.split(',').map((x) => x.trim())
  const iAmAdmin = myRoles.includes('admin')
  const myEmail = norm(me.email ?? userData.user.email ?? '').toLowerCase()

  const body = await req.json().catch(() => ({}))
  const id = Number(body.ticket_id ?? 0)
  if (!id) return json({ isOk: false, error: 'ไม่พบเลขที่เรื่อง' }, 400)

  // ---------- อ่านเรื่องที่แจ้ง ----------
  const { data: tk, error: tkErr } = await admin.from('support_ticket')
    .select('id, created_at, auth_uid, reporter_name, reporter_role, reporter_email, category, title, detail, extra')
    .eq('id', id).maybeSingle()
  if (tkErr) return json({ isOk: false, error: tkErr.message }, 500)
  if (!tk) return json({ isOk: false, error: 'ไม่พบเรื่องนี้' }, 404)

  // เจ้าของเรื่องเท่านั้น หรือผู้ดูแลระบบ — กันการไล่เลขเรื่องของคนอื่นแล้วสั่งส่งซ้ำ
  const mine = (tk.auth_uid && String(tk.auth_uid) === String(userData.user.id))
    || (myEmail && norm(tk.reporter_email).toLowerCase() === myEmail)
  if (!mine && !iAmAdmin) return json({ isOk: false, error: 'ไม่มีสิทธิ์แจ้งเตือนเรื่องนี้' }, 403)

  // ---------- ส่งได้ครั้งเดียวต่อเรื่อง ----------
  const extra = (tk.extra ?? {}) as Record<string, unknown>
  if (norm(extra.notify_mail)) return json({ isOk: true, skipped: 'เรื่องนี้แจ้งเตือนไปแล้ว' })

  // ---------- จำกัดอัตรา กันการแจ้งรัว ----------
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: recent } = await admin.from('support_ticket')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_email', tk.reporter_email ?? '')
    .gte('created_at', since)
  if ((recent ?? 0) > 5) {
    await admin.from('support_ticket')
      .update({ extra: { ...extra, notify_mail: 'ข้ามเพราะแจ้งถี่เกินกำหนด' } }).eq('id', id)
    return json({ isOk: true, skipped: 'แจ้งถี่เกินกำหนด จึงไม่ส่งอีเมลเพิ่ม' })
  }

  // ---------- รายชื่อผู้รับ คำนวณฝั่งเซิร์ฟเวอร์ ----------
  const { data: users } = await admin.from('app_user')
    .select('name, email, role, extra_roles, is_active')
  const seen = new Set<string>()
  const to: string[] = []
  for (const u of users ?? []) {
    if (['0', 'false', 'ปิด'].includes(String(u.is_active ?? '1').trim())) continue
    const email = norm(u.email).toLowerCase()
    if (!email || !email.endsWith('@' + ALLOWED_DOMAIN) || seen.has(email)) continue
    const roles = `${u.role ?? ''},${u.extra_roles ?? ''}`.split(',').map((x) => x.trim())
    if (!roles.some((r) => NOTIFY_ROLES.includes(r))) continue
    seen.add(email); to.push(email)
  }
  if (!to.length) return json({ isOk: false, error: 'ไม่มีผู้ดูแลระบบที่มีอีเมลของวิทยาลัยให้แจ้ง' }, 400)

  if (!(SMTP_HOST && SMTP_USER && SMTP_PASS)) {
    return json({ isOk: false, error: 'ยังไม่ได้ตั้งค่า SMTP ใน Supabase (Edge Functions → Secrets)' }, 500)
  }

  const subject = `[AAMs] New support ticket #${tk.id}`
  const html = asciiHtml(buildHtml(tk as Record<string, unknown>, APP_URL, COLLEGE, SYSTEM))
  const text = `AAMs - new support ticket #${tk.id}\r\n\r\n${APP_URL}\r\n\r\n`
    + 'Please view this message in HTML to read the Thai content.'

  const smtp = new SMTPClient({
    connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: SMTP_PORT === 465, auth: { username: SMTP_USER, password: SMTP_PASS } },
  })
  let ok = false, errMsg = ''
  try {
    await smtp.send({ from: MAIL_FROM, to: MAIL_FROM, bcc: to, subject, html, content: text })
    ok = true
  } catch (e) {
    errMsg = String((e as Error)?.message ?? e).slice(0, 300)
  }
  try { await smtp.close() } catch (_) { /* ignore */ }

  await admin.from('mail_log').insert({
    kind: 'support_ticket',
    sent_by: 'ระบบ (อัตโนมัติ)', sent_by_email: norm(tk.reporter_email).toLowerCase(),
    recipient: `BCC ${to.length} รายการ`, recipient_name: `เรื่องแจ้งปัญหา #${tk.id}`,
    subject, student_count: to.length,
    status: ok ? 'สำเร็จ' : 'ไม่สำเร็จ', error: errMsg || null,
  })

  // จดว่าแจ้งแล้วเฉพาะตอนส่งสำเร็จ ส่งพลาดจะได้ลองใหม่ได้
  if (ok) {
    const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    await admin.from('support_ticket')
      .update({ extra: { ...extra, notify_mail: `✓ ${stamp} (${to.length} คน)` } }).eq('id', id)
  }

  // ไม่ส่งเนื้อหาเรื่องหรืออีเมลผู้รับกลับไปที่เบราว์เซอร์
  return json({ isOk: ok, ผู้รับ: to.length, error: ok ? undefined : ('ส่งอีเมลไม่สำเร็จ: ' + errMsg) })
})
