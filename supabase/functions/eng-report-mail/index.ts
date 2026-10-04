// ============================================================
// eng-report-mail v2 — ส่งรายงาน "นักศึกษาที่ยังไม่ผ่านภาษาอังกฤษ" ถึงอาจารย์ที่ปรึกษา
//
// v2
//   • จับคู่ชื่ออาจารย์โดยตัดคำนำหน้าออกก่อน (อ. / ดร. / ผศ.ดร. ฯลฯ)
//     เดิมเทียบชื่อทั้งสตริง ช่อง advisor ในทะเบียนนักศึกษาเขียน "อ.ปภาวดี ทวีสุข"
//     แต่ทะเบียนอาจารย์เขียน "ดร.ปภาวดี ทวีสุข" จึงหาอีเมลไม่เจอทั้งที่มีอีเมลอยู่
//     และอาจารย์ท่านเดียวที่เขียนคำนำหน้าสองแบบ จะได้รับอีเมลฉบับเดียวรวมนักศึกษาครบ
//   • หาอีเมลจากทะเบียนอาจารย์ก่อน ไม่มีจึงใช้บัญชีผู้ใช้ (app_user) ที่ไม่ใช่นักศึกษา
//   • preview คืนรายชื่ออาจารย์พร้อมสาขา ให้หน้าจอเลือกส่งเฉพาะบางท่านได้
//   • send / test รับ advisors: [key,...] — ส่งเฉพาะที่เลือก (ไม่ส่ง = ทุกท่าน)
//
// หมายเหตุ: "หัวเรื่อง" ต้องเป็นอักษรอังกฤษล้วน
//   หัวเรื่องภาษาไทยที่ยาวจะถูกเข้ารหัสแล้วเกินความยาวที่มาตรฐานกำหนด ทำให้ส่วนหัวของอีเมลเสียทั้งฉบับ
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

const NON_ACTIVE = ['สำเร็จการศึกษา', 'พักการศึกษา', 'ลาออก', 'ขอโอนย้ายสถานศึกษา']
const norm = (v: unknown) => String(v ?? '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim()
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ตัดคำนำหน้า/ตำแหน่งวิชาการออก แล้วตัดช่องว่างทั้งหมด — ใช้กฎเดียวกับหน้า "ข้อมูลอาจารย์ที่ปรึกษา"
const TITLES = ['ผศ.ดร.', 'รศ.ดร.', 'ศ.ดร.', 'ผศ.', 'รศ.', 'ศ.', 'ดร.', 'อ.', 'อาจารย์',
  'ว่าที่ร.ต.', 'ว่าที่ร้อยตรี', 'น.ส.', 'นางสาว', 'นาง', 'นาย', 'นพ.', 'พญ.']
function nameKey(v: unknown): string {
  let n = norm(v).toLowerCase().replace(/\s+/g, '')
  let go = true
  while (go) {
    go = false
    for (const t of TITLES) {
      const p = t.toLowerCase().replace(/\s+/g, '')
      if (p && n.startsWith(p) && n.length > p.length) { n = n.slice(p.length); go = true; break }
    }
  }
  return n
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function thaiDate(v: unknown): string {
  const raw = norm(v)
  if (!raw) return '-'
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${+m[3]} ${TH_MONTHS[+m[2] - 1] ?? ''} ${+m[1] + 543}`
  const d = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (d) { const y = +d[3]; return `${+d[1]}/${+d[2]}/${y < 2500 ? y + 543 : y}` }
  return raw
}

interface Row { student: Record<string, unknown>; attempts: Record<string, unknown>[] }

function buildHtml(advisor: string, rows: Row[], collegeName: string, systemTitle: string) {
  const td = 'border:1px solid #d7e3f0;padding:6px 8px'
  const body = rows.map((r) => {
    const s = r.student
    const name = `${norm(s.title_prefix)}${norm(s.name)}`
    const list = r.attempts.length ? r.attempts : [{}]
    return list.map((a, i) => `<tr>${i === 0
      ? `<td rowspan="${list.length}" style="${td};font-family:monospace">${esc(norm(s.student_id))}</td><td rowspan="${list.length}" style="${td}">${esc(name)}</td>`
      : ''}<td style="${td}">${esc(norm(a.eng_type) || 'ยังไม่เคยเข้าสอบ')}</td><td style="${td};text-align:center">${esc(norm(a.eng_score) || '-')}</td><td style="${td};text-align:center">${esc(norm(a.eng_attempt) || '-')}</td><td style="${td};text-align:center">${esc(thaiDate(a.eng_date))}</td><td style="${td};text-align:center">${esc(norm(a.academic_year) || '-')}</td><td style="${td};text-align:center;color:#b91c1c">${esc(norm(a.eng_status) || 'ไม่มีผลสอบ')}</td></tr>`).join('')
  }).join('')

  const th = 'border:1px solid #d7e3f0;padding:6px 8px'
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:16px;background:#f5f8fc;font-family:'Sarabun','Segoe UI',Tahoma,sans-serif;color:#1f2937">
<div style="max-width:900px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:14px;padding:20px">
<h2 style="margin:0 0 4px;font-size:18px;color:#1e6fba">รายงานนักศึกษาที่ยังไม่ผ่านเกณฑ์ภาษาอังกฤษ</h2>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280">${esc(systemTitle)} · ${esc(collegeName)}</p>
<p style="font-size:14px">เรียน <b>${esc(advisor)}</b></p>
<p style="font-size:14px;line-height:1.7">นักศึกษาในความดูแลของท่านที่ <b style="color:#b91c1c">ยังไม่ผ่านเกณฑ์ภาษาอังกฤษ</b> มีจำนวน <b>${rows.length}</b> คน รายละเอียดดังตาราง</p>
<table style="border-collapse:collapse;width:100%;font-size:13px">
<thead><tr style="background:#eff6ff">
<th style="${th};text-align:left">รหัสนักศึกษา</th><th style="${th};text-align:left">ชื่อ-สกุล</th><th style="${th};text-align:left">รูปแบบการสอบ</th><th style="${th}">คะแนน</th><th style="${th}">ครั้งที่</th><th style="${th}">วันที่สอบ</th><th style="${th}">ปีการศึกษา</th><th style="${th}">สถานะ</th>
</tr></thead>
<tbody>${body}</tbody></table>
<p style="font-size:12px;color:#6b7280;margin-top:16px;line-height:1.7">อีเมลฉบับนี้ส่งอัตโนมัติจากระบบเพื่อแจ้งข่าวเท่านั้น ไม่สามารถตอบกลับได้<br>
<b style="color:#b45309">ข้อมูลนี้เป็นข้อมูลส่วนบุคคลของนักศึกษา</b> โปรดใช้เพื่อการให้คำปรึกษาเท่านั้น และไม่เผยแพร่ต่อ</p>
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

  const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
  const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? ''
  const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
  const SMTP_USER = Deno.env.get('SMTP_USER') ?? ''
  const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? ''
  const MAIL_FROM_RAW = Deno.env.get('MAIL_FROM') ?? SMTP_USER
  // ตัดชื่อภาษาไทยหน้าอีเมลออก เหลือเฉพาะอีเมล — กันหัว From เสียด้วยเหตุเดียวกัน
  const MAIL_FROM = (MAIL_FROM_RAW.match(/<([^>]+)>/)?.[1] ?? MAIL_FROM_RAW).trim()
  const DOMAIN = MAIL_FROM.split('@')[1] ?? ALLOWED_DOMAIN
  const NO_REPLY = (Deno.env.get('MAIL_NO_REPLY') ?? ('no-reply@' + DOMAIN)).trim()

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return json({ isOk: false, error: 'กรุณาเข้าสู่ระบบ' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: me } = await admin.from('app_user')
    .select('role, extra_roles, name, email').eq('auth_user_id', userData.user.id).maybeSingle()

  const myRoles = String(`${me?.role ?? ''},${me?.extra_roles ?? ''}`).split(',').map((x) => x.trim())
  if (!myRoles.some((r) => ['admin', 'academic', 'registrar'].includes(r))) {
    return json({ isOk: false, error: 'บัญชีของคุณไม่มีสิทธิ์ส่งรายงานนี้' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const mode = String(body.mode ?? 'preview')
  const pick: string[] | null = Array.isArray(body.advisors) ? body.advisors.map((x: unknown) => String(x)) : null

  const { data: students } = await admin.from('student')
    .select('student_id, name, title_prefix, advisor, status, year_level')
  const { data: engs } = await admin.from('eng_result')
    .select('student_id, eng_type, eng_score, eng_attempt, eng_date, eng_status, academic_year')
  const { data: teachers } = await admin.from('teacher').select('name, email, department')
  const { data: users } = await admin.from('app_user').select('name, email, role')

  const active = (students ?? []).filter((s) =>
    !NON_ACTIVE.includes(norm(s.status)) && norm(s.year_level) !== 'จบ')
  const passed = new Set((engs ?? []).filter((e) => norm(e.eng_status) === 'ผ่าน').map((e) => norm(e.student_id)))
  const failing = active.filter((s) => !passed.has(norm(s.student_id)))

  const attemptsBy = new Map<string, Record<string, unknown>[]>()
  for (const e of engs ?? []) {
    const id = norm(e.student_id)
    if (!attemptsBy.has(id)) attemptsBy.set(id, [])
    attemptsBy.get(id)!.push(e)
  }
  const attNum = (e: Record<string, unknown>) => parseInt(norm(e.eng_attempt), 10) || 0

  // จัดกลุ่มตามชื่ออาจารย์ที่ตัดคำนำหน้าแล้ว
  const byAdvisor = new Map<string, { spellings: Map<string, number>; rows: Row[] }>()
  for (const s of failing) {
    const adv = norm(s.advisor)
    const k = nameKey(adv)
    if (!k) continue
    const list = (attemptsBy.get(norm(s.student_id)) ?? []).slice()
      .sort((a, b) => attNum(a) - attNum(b) || norm(a.eng_date).localeCompare(norm(b.eng_date)))
    if (!byAdvisor.has(k)) byAdvisor.set(k, { spellings: new Map(), rows: [] })
    const g = byAdvisor.get(k)!
    g.spellings.set(adv, (g.spellings.get(adv) ?? 0) + 1)
    g.rows.push({ student: s, attempts: list })
  }

  // อีเมลและสาขา : ทะเบียนอาจารย์ก่อน แล้วจึงบัญชีผู้ใช้ที่ไม่ใช่นักศึกษา
  const info = new Map<string, { name: string; email: string; dept: string }>()
  for (const t of teachers ?? []) {
    const k = nameKey(t.name)
    if (!k) continue
    const cur = info.get(k)
    const em = norm(t.email).toLowerCase()
    if (!cur || (!cur.email && em)) info.set(k, { name: norm(t.name), email: em, dept: norm(t.department) })
  }
  for (const u of users ?? []) {
    if (norm(u.role) === 'student') continue
    const k = nameKey(u.name)
    const em = norm(u.email).toLowerCase()
    if (!k || !em) continue
    const cur = info.get(k)
    if (!cur) info.set(k, { name: norm(u.name), email: em, dept: '' })
    else if (!cur.email) cur.email = em
  }

  const all: { key: string; advisor: string; email: string; dept: string; rows: Row[]; reason: string }[] = []
  for (const [k, g] of byAdvisor) {
    const inf = info.get(k)
    // ชื่อที่แสดง : ชื่อในทะเบียนอาจารย์ ไม่มีจึงใช้แบบที่เขียนบ่อยที่สุดในทะเบียนนักศึกษา
    const common = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const em = inf?.email ?? ''
    let reason = ''
    if (!em) reason = 'ไม่พบอีเมลในทะเบียนอาจารย์และบัญชีผู้ใช้'
    else if (!em.endsWith('@' + ALLOWED_DOMAIN)) reason = 'อีเมลไม่ใช่โดเมนของวิทยาลัย'
    g.rows.sort((a, b) => norm(a.student.student_id).localeCompare(norm(b.student.student_id)))
    all.push({ key: k, advisor: inf?.name || common, email: em, dept: inf?.dept ?? '', rows: g.rows, reason })
  }
  all.sort((a, b) => a.advisor.localeCompare(b.advisor, 'th'))

  const sendable = all.filter((x) => !x.reason)
  const skipped = all.filter((x) => x.reason)
    .map((x) => ({ advisor: x.advisor, reason: x.reason, students: x.rows.length }))
  const targets = pick ? sendable.filter((x) => pick.includes(x.key)) : sendable

  const summary = {
    นักศึกษาที่กำลังศึกษา: active.length,
    ยังไม่ผ่าน: failing.length,
    อาจารย์ที่จะได้รับอีเมล: sendable.length,
    ข้ามไป: skipped,
    ไม่มีอาจารย์ที่ปรึกษา: failing.filter((s) => !norm(s.advisor)).length,
    อาจารย์: all.map((x) => ({
      key: x.key, name: x.advisor, email: x.email, department: x.dept,
      students: x.rows.length, ok: !x.reason, reason: x.reason,
    })),
  }

  if (mode === 'preview') return json({ isOk: true, mode, ...summary })

  if (pick && !targets.length) return json({ isOk: false, error: 'ยังไม่ได้เลือกอาจารย์ที่จะส่ง' }, 400)

  const useResend = !!RESEND
  const useSmtp = !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
  if (!useResend && !useSmtp) {
    return json({
      isOk: false,
      error: 'ยังไม่ได้ตั้งค่าการส่งอีเมล — ตั้ง SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM หรือ RESEND_API_KEY ใน Supabase (Edge Functions → Secrets)',
    }, 500)
  }

  let queue = targets.map((t) => ({ advisor: t.advisor, email: t.email, rows: t.rows }))
  const myEmail = norm(me?.email ?? userData.user.email ?? '').toLowerCase()
  if (mode === 'test') {
    if (!myEmail.endsWith('@' + ALLOWED_DOMAIN)) {
      return json({ isOk: false, error: 'อีเมลของคุณไม่ใช่โดเมนของวิทยาลัย จึงส่งทดสอบไม่ได้' }, 400)
    }
    const first = queue[0]
    if (!first) return json({ isOk: false, error: 'ไม่มีข้อมูลให้ส่ง' }, 400)
    queue = [{ advisor: first.advisor, email: myEmail, rows: first.rows }]
  }

  let smtp: SMTPClient | null = null
  if (!useResend) {
    smtp = new SMTPClient({
      connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: SMTP_PORT === 465, auth: { username: SMTP_USER, password: SMTP_PASS } },
    })
  }

  const results: Record<string, unknown>[] = []
  let okCount = 0

  for (const t of queue) {
    const subject = `[AAMs] English exam follow-up: ${t.rows.length} student(s) need attention`
    const html = buildHtml(t.advisor, t.rows, COLLEGE, SYSTEM)
    const text = `AAMs - English exam follow-up report\r\n`
      + `Advisor: ${t.advisor}\r\n`
      + `Students who have not passed: ${t.rows.length}\r\n\r\n`
      + `กรุณาเปิดอีเมลแบบ HTML เพื่อดูตารางรายชื่อนักศึกษา`
    let ok = false, errMsg = ''
    try {
      if (useResend) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: MAIL_FROM_RAW, to: [t.email], reply_to: NO_REPLY, subject, html, text }),
        })
        ok = r.ok
        if (!ok) errMsg = (await r.text()).slice(0, 300)
      } else {
        await smtp!.send({ from: MAIL_FROM, to: t.email, replyTo: NO_REPLY, subject, html, content: text })
        ok = true
      }
    } catch (e) {
      errMsg = String((e as Error)?.message ?? e).slice(0, 300)
    }
    if (ok) okCount++
    results.push({ อาจารย์: t.advisor, อีเมล: t.email, นักศึกษา: t.rows.length, สำเร็จ: ok, สาเหตุ: errMsg })

    await admin.from('mail_log').insert({
      kind: mode === 'test' ? 'eng_report_test' : 'eng_report',
      sent_by: me?.name ?? '', sent_by_email: myEmail,
      recipient: t.email, recipient_name: t.advisor,
      subject, student_count: t.rows.length,
      status: ok ? 'สำเร็จ' : 'ไม่สำเร็จ', error: errMsg || null,
    })
  }

  try { await smtp?.close() } catch (_) { /* ignore */ }

  return json({
    isOk: okCount > 0, mode, ส่งสำเร็จ: okCount, ทั้งหมด: queue.length,
    ช่องทาง: useResend ? 'Resend API' : 'SMTP ' + SMTP_HOST,
    ...summary, รายละเอียด: results,
  })
})
