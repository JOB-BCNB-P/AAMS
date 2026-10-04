// ============================================================
// announce-send v3 — ส่งประกาศจากระบบ AAMS ออกทาง "อีเมล" และ/หรือ "LINE" ตามที่ผู้ประกาศเลือก
//
// โหมด
//   options : คืนรายชื่อกลุ่ม LINE ที่เปิดใช้งาน และบอกว่าตั้งค่า LINE / SMTP ไว้แล้วหรือยัง
//   preview : นับผู้รับอีเมลจาก บทบาท / ชั้นปี / รายชื่อเจาะจง (ยังไม่ส่งอะไร)
//   send    : ส่งประกาศหนึ่งรายการ (announcement_id) ตามช่องทางที่เลือก
//
// หลักการ
//   • ผู้เรียกต้องเป็น ผู้ดูแลระบบ / งานวิชาการ / งานทะเบียน / ผู้บริหาร (นับรวมภาระงานเพิ่มเติม)
//   • รายชื่อผู้รับอีเมลคำนวณฝั่งเซิร์ฟเวอร์จากตัวประกาศเสมอ เบราว์เซอร์กำหนดเองไม่ได้
//   • กติกาผู้รับตรงกับกติกาการมองเห็นประกาศในระบบ (annVisibleTo)
//       - มีรายชื่อเจาะจง และไม่ได้เลือกบทบาท  → ส่งเฉพาะคนในรายชื่อ
//       - เลือกบทบาท                           → คนในบทบาท (นักศึกษาตามชั้นปีที่เลือก) + คนในรายชื่อเจาะจง
//       - ไม่เลือกอะไรเลย                       → ทุกคน
//   • ส่งอีเมลแบบ BCC ชุดละไม่เกิน 90 คน และส่งซ้ำไม่ได้ (เว้นแต่ส่ง force)
//   • LINE ส่งเฉพาะกลุ่มที่เลือก ส่วน broadcast ถึงเพื่อนทุกคนของบัญชี LINE ต้องติ๊กเองเท่านั้น
//   • อีเมลเป็นแบบแจ้งอย่างเดียว : Reply-To ชี้ไปที่ no-reply (MAIL_NO_REPLY) ตอบกลับแล้วไม่ถึงใคร
//   • หัวเรื่องอีเมลเป็นอังกฤษล้วน และเนื้ออีเมลแปลงอักษรไทยเป็นรหัส HTML (เหตุผลเดียวกับ survey-invite-mail)
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

const norm = (v: unknown) => String(v ?? '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim()
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const listOf = (v: unknown) => String(v ?? '').split(/[,;|]/).map((x) => x.trim()).filter(Boolean)
const asciiHtml = (s: string) => s.replace(/[^\x00-\x7F]/gu, (c) => '&#' + c.codePointAt(0) + ';')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const off = (v: unknown) => ['0', 'false', 'ปิด'].includes(String(v ?? '1').trim())

const SENDER_ROLES = ['admin', 'academic', 'registrar', 'executive']
const ALL_ROLES = ['admin', 'academic', 'registrar', 'deptHead', 'executive', 'teacher', 'classTeacher', 'otherStaff', 'student']
const ROLE_LABEL: Record<string, string> = {
  admin: 'ผู้ดูแลระบบ', academic: 'งานวิชาการ', registrar: 'งานทะเบียน', deptHead: 'ประธานสาขา',
  executive: 'ผู้บริหาร', teacher: 'อาจารย์', classTeacher: 'อาจารย์ประจำชั้น', otherStaff: 'เจ้าหน้าที่งานอื่นๆ', student: 'นักศึกษา',
}
const NON_ACTIVE = ['สำเร็จการศึกษา', 'พักการศึกษา', 'ลาออก', 'ขอโอนย้ายสถานศึกษา']
const TITLES = ['ผู้ช่วยศาสตราจารย์', 'รองศาสตราจารย์', 'ศาสตราจารย์', 'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'ว่าที่ร.ต.',
  'ผศ.ดร.', 'รศ.ดร.', 'ศ.ดร.', 'ผศ.', 'รศ.', 'ศ.', 'ดร.', 'อาจารย์', 'อ.', 'นางสาว', 'น.ส.', 'นาง', 'นาย', 'นพ.', 'พญ.']
function nameKey(v: unknown) {
  let n = norm(v).toLowerCase().replace(/\s+/g, '')
  let changed = true
  while (changed) {
    changed = false
    for (const t of TITLES) {
      const k = t.toLowerCase().replace(/\s+/g, '')
      if (k && n.startsWith(k) && n.length > k.length) { n = n.slice(k.length); changed = true }
    }
  }
  return n
}

const BATCH = 90
const PAUSE_MS = 1200

interface Target { email: string; why: string; year: string }

async function recipients(admin: any, roles: string[], years: string[], names: string[], domain: string) {
  const { data: users } = await admin.from('app_user').select('name, email, role, extra_roles, student_id, is_active')
  const { data: students } = await admin.from('student').select('student_id, year_level, status')
  const stu = new Map<string, { yr: string; active: boolean }>()
  for (const s of students ?? []) {
    stu.set(norm(s.student_id), { yr: norm(s.year_level), active: !NON_ACTIVE.includes(norm(s.status)) && norm(s.year_level) !== 'จบ' })
  }
  const nameSet = new Set(names.map(nameKey).filter(Boolean))
  const onlyNamed = nameSet.size > 0 && roles.length === 0
  const wantRoles = roles.length ? roles : (onlyNamed ? [] : ALL_ROLES)

  const seen = new Set<string>()
  const out: Target[] = []
  for (const u of users ?? []) {
    if (off(u.is_active)) continue
    const email = norm(u.email).toLowerCase()
    if (!email || !email.endsWith('@' + domain) || seen.has(email)) continue
    const rs = `${u.role ?? ''},${u.extra_roles ?? ''}`.split(',').map((x) => x.trim()).filter(Boolean)
    let why = ''
    if (nameSet.has(nameKey(u.name))) why = 'named'
    if (!why) {
      for (const r of rs) {
        if (!wantRoles.includes(r)) continue
        if (r === 'student') {
          const s = stu.get(norm(u.student_id))
          if (!s || !s.active) continue
          if (years.length && !years.includes(s.yr)) continue
        }
        why = r; break
      }
    }
    if (!why) continue
    seen.add(email)
    const s = stu.get(norm(u.student_id))
    out.push({ email, why, year: why === 'student' && s ? s.yr : '' })
  }
  const byGroup: Record<string, number> = {}
  for (const t of out) {
    const k = t.why === 'named' ? 'รายชื่อเจาะจง' : t.why === 'student' ? 'นักศึกษาชั้นปีที่ ' + (t.year || '-') : (ROLE_LABEL[t.why] ?? t.why)
    byGroup[k] = (byGroup[k] ?? 0) + 1
  }
  return { targets: out, byGroup, onlyNamed }
}

function mailHtml(title: string, content: string, date: string, link: string, college: string, system: string) {
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:16px;background:#f5f8fc;font-family:'Sarabun','Segoe UI',Tahoma,sans-serif;color:#1f2937">
<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:14px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:#6b7280">${esc(system)} · ${esc(college)}</p>
<h2 style="margin:0 0 6px;font-size:19px;color:#1e6fba">${esc(title)}</h2>
${date ? `<p style="margin:0 0 14px;font-size:13px;color:#374151">วันที่: <b>${esc(date)}</b></p>` : ''}
<div style="background:#f0f7ff;border:1px solid #dbeafe;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.9;white-space:pre-wrap">${esc(content)}</div>
<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#1e6fba;color:#fff;text-decoration:none;padding:11px 24px;border-radius:10px;font-size:14px;font-weight:600">เปิดระบบ AAMs</a></p>
<p style="font-size:12px;color:#6b7280;margin-top:18px;line-height:1.8;border-top:1px solid #eef2f7;padding-top:12px">
อีเมลฉบับนี้ส่งอัตโนมัติจากระบบเพื่อแจ้งข่าวเท่านั้น ไม่สามารถตอบกลับได้ หากมีข้อสงสัยกรุณาติดต่องานวิชาการ</p>
</div></body></html>`
}

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
function thaiDate(v: string) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(v || '')
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`
}

async function linePush(token: string, to: string | null, text: string) {
  const r = await fetch('https://api.line.me/v2/bot/message/' + (to ? 'push' : 'broadcast'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(to ? { to, messages: [{ type: 'text', text }] } : { messages: [{ type: 'text', text }] }),
  })
  return { ok: r.ok, status: r.status, detail: r.ok ? '' : (await r.text()).slice(0, 200) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const DOMAIN = (Deno.env.get('MAIL_ALLOWED_DOMAIN') ?? 'bcn.ac.th').toLowerCase()
  const COLLEGE = Deno.env.get('COLLEGE_NAME') ?? 'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ'
  const SYSTEM = Deno.env.get('SYSTEM_TITLE') ?? 'ระบบบริหารจัดการงานวิชาการ (AAMs)'
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://job-bcnb-p.github.io/AAMS/'
  const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
  const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? ''
  const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
  const SMTP_USER = Deno.env.get('SMTP_USER') ?? ''
  const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? ''
  const FROM_RAW = Deno.env.get('MAIL_FROM') ?? SMTP_USER
  const MAIL_FROM = (FROM_RAW.match(/<([^>]+)>/)?.[1] ?? FROM_RAW).trim()
  const hasSmtp = !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
  const NO_REPLY = (Deno.env.get('MAIL_NO_REPLY') ?? ('no-reply@' + DOMAIN)).trim()

  // ---------- ตรวจสิทธิ์ผู้เรียก ----------
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return json({ isOk: false, error: 'กรุณาเข้าสู่ระบบ' }, 401)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: me } = await admin.from('app_user')
    .select('role, extra_roles, name, email, is_active').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!me || off(me.is_active)) return json({ isOk: false, error: 'บัญชีนี้ถูกปิดการใช้งาน' }, 403)
  const myRoles = `${me.role ?? ''},${me.extra_roles ?? ''}`.split(',').map((x) => x.trim())
  if (!myRoles.some((r) => SENDER_ROLES.includes(r))) {
    return json({ isOk: false, error: 'บัญชีของคุณไม่มีสิทธิ์ส่งประกาศทางอีเมลหรือ LINE' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const mode = String(body.mode ?? 'preview')

  // ---------- options ----------
  const { data: groupsRaw } = await admin.from('line_group').select('id, name, group_id, is_active')
  const groups = (groupsRaw ?? []).filter((g: any) => !off(g.is_active))
  if (mode === 'options') {
    // ดึงชื่อจริงและจำนวนสมาชิกของแต่ละกลุ่มจาก LINE
    // ชื่อที่ยังเป็นค่าตั้งต้น ("กลุ่ม 1" ฯลฯ) หรือว่าง จะถูกแทนด้วยชื่อกลุ่มจริงใน LINE ให้อัตโนมัติ
    const info = await Promise.all(groups.map(async (g: any) => {
      if (!LINE_TOKEN) return { name: '', count: null as number | null }
      const gid = encodeURIComponent(String(g.group_id))
      const h = { Authorization: 'Bearer ' + LINE_TOKEN }
      const [s, c] = await Promise.all([
        fetch(`https://api.line.me/v2/bot/group/${gid}/summary`, { headers: h }).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`https://api.line.me/v2/bot/group/${gid}/members/count`, { headers: h }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ])
      return { name: norm(s?.groupName), count: typeof c?.count === 'number' ? c.count : null }
    }))
    const list = []
    for (let i = 0; i < groups.length; i++) {
      const g: any = groups[i]
      let name = norm(g.name)
      const live = info[i].name
      if (live && live !== name && (!name || /^กลุ่ม\s*\d+$/.test(name))) {
        await admin.from('line_group').update({ name: live, updated_at: new Date().toISOString() }).eq('id', g.id)
        name = live
      }
      list.push({ id: g.id, name: name || ('กลุ่ม ' + g.id), lineName: live, members: info[i].count, reachable: !!live })
    }
    return json({ isOk: true, hasLine: !!LINE_TOKEN, hasSmtp, lineGroups: list })
  }

  // ---------- preview ----------
  if (mode === 'preview') {
    const r = await recipients(admin, listOf(body.roles), listOf(body.years), listOf(body.names), DOMAIN)
    return json({ isOk: true, ผู้รับทั้งหมด: r.targets.length, แยกกลุ่ม: r.byGroup, เฉพาะรายชื่อ: r.onlyNamed, hasSmtp })
  }

  if (mode !== 'send') return json({ isOk: false, error: 'โหมดไม่ถูกต้อง' }, 400)

  // ---------- send ----------
  const annId = Number(body.announcement_id ?? 0)
  if (!annId) return json({ isOk: false, error: 'ไม่พบรหัสประกาศ' }, 400)
  const { data: ann } = await admin.from('announcement').select('*').eq('id', annId).maybeSingle()
  if (!ann) return json({ isOk: false, error: 'ไม่พบประกาศนี้' }, 404)
  const extra = (ann.extra && typeof ann.extra === 'object') ? ann.extra : {}
  const force = body.force === true

  const title = norm(ann.announcement_title)
  const content = String(ann.announcement_content ?? '').trim()
  const dateTxt = thaiDate(norm(ann.announcement_date))
  const out: Record<string, unknown> = { isOk: true }
  const myEmail = norm(me.email ?? userData.user.email ?? '').toLowerCase()

  // ----- อีเมล -----
  if (body.email === true) {
    if (!hasSmtp) out.อีเมล = { isOk: false, error: 'ยังไม่ได้ตั้งค่า SMTP ใน Supabase' }
    else if (!force && norm(extra.mail_sent)) out.อีเมล = { isOk: true, skipped: 'ประกาศนี้ส่งอีเมลไปแล้ว' }
    else {
      const yrs = listOf(ann.yr).length ? listOf(ann.yr) : listOf(ann.year_level)
      const r = await recipients(admin, listOf(ann.roles), yrs, listOf(ann.target_names), DOMAIN)
      const test = body.test === true
      const queue: string[][] = []
      if (test) queue.push([myEmail])
      else for (let i = 0; i < r.targets.length; i += BATCH) queue.push(r.targets.slice(i, i + BATCH).map((t) => t.email))
      if (!queue.length) out.อีเมล = { isOk: false, error: 'ไม่มีผู้รับอีเมลตามกลุ่มที่เลือก' }
      else {
        const subject = `[AAMs] Announcement ${norm(ann.announcement_date)}`.trim()
        const html = asciiHtml(mailHtml(title, content, dateTxt, norm(body.url) || APP_URL, COLLEGE, SYSTEM))
        const text = `AAMs announcement ${norm(ann.announcement_date)}\r\n\r\n${norm(body.url) || APP_URL}\r\n\r\nPlease view this message in HTML to read the Thai content.`
        const smtp = new SMTPClient({ connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: SMTP_PORT === 465, auth: { username: SMTP_USER, password: SMTP_PASS } } })
        let okN = 0, failN = 0
        for (let i = 0; i < queue.length; i++) {
          let ok = false, err = '', tries = 0
          while (!ok && tries < 2) {
            tries++
            try {
              const mail: Record<string, unknown> = { from: MAIL_FROM, to: MAIL_FROM, bcc: queue[i], subject, html, content: text, replyTo: NO_REPLY }
              // ครั้งแรกใส่หัวอีเมลแบบ "ส่งอัตโนมัติ" ด้วย ถ้าตัวส่งไม่รับ ครั้งที่สองส่งแบบไม่มีหัวนี้
              if (tries === 1) mail.headers = { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' }
              await smtp.send(mail as any)
              ok = true
            }
            catch (e) { err = String((e as Error)?.message ?? e).slice(0, 300); if (tries < 2) await sleep(2500) }
          }
          if (ok) okN += queue[i].length; else failN++
          await admin.from('mail_log').insert({
            kind: test ? 'announcement_test' : 'announcement', sent_by: me.name ?? '', sent_by_email: myEmail,
            recipient: `BCC ${queue[i].length} รายการ (ชุดที่ ${i + 1}/${queue.length})`,
            recipient_name: title.slice(0, 200), subject, student_count: queue[i].length,
            status: ok ? 'สำเร็จ' : 'ไม่สำเร็จ', error: err || null,
          })
          if (i < queue.length - 1) await sleep(PAUSE_MS)
        }
        try { await smtp.close() } catch (_) { /* ignore */ }
        if (!test && okN > 0) {
          const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
          extra.mail_sent = `✓ ${stamp} (${okN} คน)`
          await admin.from('announcement').update({ extra }).eq('id', annId)
        }
        out.อีเมล = { isOk: okN > 0, ส่งถึง: okN, ชุดที่ไม่สำเร็จ: failN, ทดสอบ: test, แยกกลุ่ม: r.byGroup }
      }
    }
  }

  // ----- LINE -----
  if (body.line === true && body.test !== true) {
    if (!LINE_TOKEN) out.LINE = { isOk: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Supabase' }
    else if (!force && norm(ann.line_sent)) out.LINE = { isOk: true, skipped: 'ประกาศนี้ส่งเข้า LINE ไปแล้ว' }
    else {
      const wantIds = (Array.isArray(body.line_groups) ? body.line_groups : []).map((x: unknown) => Number(x))
      const pick = groups.filter((g: any) => wantIds.includes(Number(g.id)))
      const broadcast = body.broadcast === true
      if (!pick.length && !broadcast) out.LINE = { isOk: false, error: 'ยังไม่ได้เลือกกลุ่ม LINE' }
      else {
        const msg = '📢 ประกาศ\n\n' + title + (dateTxt ? '\n🗓 ' + dateTxt : '') + (content ? '\n\n' + content : '')
        const res: Record<string, unknown>[] = []
        let n = 0
        for (const g of pick) {
          const r = await linePush(LINE_TOKEN, String(g.group_id), msg)
          if (r.ok) n++
          res.push({ กลุ่ม: norm(g.name), สำเร็จ: r.ok, สาเหตุ: r.detail })
        }
        if (broadcast) {
          const r = await linePush(LINE_TOKEN, null, msg)
          if (r.ok) n++
          res.push({ กลุ่ม: 'เพื่อนทุกคนของบัญชี LINE', สำเร็จ: r.ok, สาเหตุ: r.detail })
        }
        if (n > 0) {
          const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
          extra.line_groups = pick.map((g: any) => norm(g.name)).concat(broadcast ? ['broadcast'] : []).join(', ')
          await admin.from('announcement').update({ line_notify: '✓', line_sent: `✓ ${stamp} (${n} ช่องทาง)`, extra }).eq('id', annId)
        }
        out.LINE = { isOk: n > 0, ส่งสำเร็จ: n, รายละเอียด: res }
      }
    }
  }

  const parts = ['อีเมล', 'LINE'].map((k) => out[k] as any).filter(Boolean)
  out.isOk = parts.every((p) => p.isOk)
  return json(out)
})
