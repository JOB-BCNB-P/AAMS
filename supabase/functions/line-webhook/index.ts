// ============================================================
// line-webhook v1 — รับเหตุการณ์จาก LINE แล้วเพิ่ม/ปิดกลุ่มในตาราง line_group ให้อัตโนมัติ
//
//   • บอทถูกเชิญเข้ากลุ่ม (join)      → เพิ่มกลุ่มพร้อมชื่อจริงจาก LINE สถานะ "รออนุมัติ"
//                                      แล้วตอบในกลุ่มว่าเชื่อมแล้ว รอผู้ดูแลระบบอนุมัติ
//   • บอทถูกเชิญออก/ออกจากกลุ่ม (leave) → ปิดใช้งานกลุ่มนั้น
//   • กลุ่มที่เคยอนุมัติไว้แล้ว เชิญบอทกลับเข้าใหม่ → เปิดใช้งานคืนทันที (เคยอนุมัติแล้ว)
//
// ทำไมต้องรออนุมัติ : ใครก็ตามที่เป็นเพื่อนกับบอทเชิญบอทเข้ากลุ่มใดก็ได้
// ถ้าเปิดใช้งานทันที ประกาศของวิทยาลัยจะหลุดไปกลุ่มภายนอกได้
//
// ความปลอดภัย : ไม่ใช้ JWT (LINE ส่งมาเอง) แต่ตรวจลายเซ็น x-line-signature
// ด้วย LINE_CHANNEL_SECRET ทุกครั้ง คำขอที่ลายเซ็นไม่ตรงจะถูกปฏิเสธ
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const enc = new TextEncoder()
function b64(buf: ArrayBuffer) {
  let s = ''
  const a = new Uint8Array(buf)
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i])
  return btoa(s)
}
async function validSignature(secret: string, body: string, sig: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = b64(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  if (mac.length !== sig.length) return false
  let d = 0
  for (let i = 0; i < mac.length; i++) d |= mac.charCodeAt(i) ^ sig.charCodeAt(i)
  return d === 0
}
const stamp = () => new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? ''
  const TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
  if (!SECRET) return new Response('LINE_CHANNEL_SECRET is not set', { status: 500 })

  const raw = await req.text()
  const sig = req.headers.get('x-line-signature') ?? ''
  if (!sig || !(await validSignature(SECRET, raw, sig))) return new Response('bad signature', { status: 401 })

  let body: any = {}
  try { body = JSON.parse(raw) } catch (_) { return new Response('ok') }
  const events: any[] = Array.isArray(body.events) ? body.events : []
  if (!events.length) return new Response('ok')   // ปุ่ม Verify ใน LINE Developers ส่งมาแบบว่าง

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const h = { Authorization: 'Bearer ' + TOKEN }

  for (const ev of events) {
    const src = ev?.source ?? {}
    const gid = norm(src.groupId || src.roomId)
    if (!gid) continue

    if (ev.type === 'join') {
      let name = ''
      if (TOKEN && src.groupId) {
        const s = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(gid)}/summary`, { headers: h })
          .then((r) => r.ok ? r.json() : null).catch(() => null)
        name = norm(s?.groupName)
      }
      const { data: cur } = await admin.from('line_group').select('id, name, is_active, note').eq('group_id', gid).maybeSingle()
      let reply = ''
      if (!cur) {
        await admin.from('line_group').insert({
          group_id: gid, name: name || ('กลุ่มใหม่ ' + gid.slice(-6)), is_active: '0',
          note: `รออนุมัติ — บอทถูกเชิญเข้ากลุ่มเมื่อ ${stamp()}`,
        })
        reply = `เชื่อมกลุ่ม${name ? ' “' + name + '”' : 'นี้'} กับระบบ AAMs แล้ว\nรอผู้ดูแลระบบอนุมัติในเมนู ตั้งค่าระบบ › กลุ่ม LINE ที่รับประกาศ ก่อนจึงจะได้รับประกาศ`
      } else {
        const approvedBefore = norm(cur.is_active) === '1' || /^(เคยอนุมัติ|อนุมัติแล้ว)/.test(norm(cur.note))
        const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (name) upd.name = name
        if (approvedBefore) {
          upd.is_active = '1'
          upd.note = `อนุมัติแล้ว — บอทกลับเข้ากลุ่มเมื่อ ${stamp()}`
          reply = `เชื่อมกลุ่ม${name ? ' “' + name + '”' : 'นี้'} กับระบบ AAMs อีกครั้งแล้ว กลุ่มนี้จะได้รับประกาศตามเดิม`
        } else {
          upd.is_active = '0'
          upd.note = `รออนุมัติ — บอทถูกเชิญเข้ากลุ่มเมื่อ ${stamp()}`
          reply = `เชื่อมกลุ่ม${name ? ' “' + name + '”' : 'นี้'} กับระบบ AAMs แล้ว\nรอผู้ดูแลระบบอนุมัติก่อนจึงจะได้รับประกาศ`
        }
        await admin.from('line_group').update(upd).eq('id', cur.id)
      }
      if (TOKEN && ev.replyToken && reply) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ replyToken: ev.replyToken, messages: [{ type: 'text', text: reply }] }),
        }).catch(() => null)
      }
    } else if (ev.type === 'leave') {
      const { data: cur } = await admin.from('line_group').select('id, note, is_active').eq('group_id', gid).maybeSingle()
      if (cur) {
        const wasApproved = norm(cur.is_active) === '1' || /^(เคยอนุมัติ|อนุมัติแล้ว)/.test(norm(cur.note))
        await admin.from('line_group').update({
          is_active: '0', updated_at: new Date().toISOString(),
          note: (wasApproved ? 'เคยอนุมัติ — ' : '') + `บอทออกจากกลุ่ม/ถูกเชิญออกเมื่อ ${stamp()}`,
        }).eq('id', cur.id)
      }
    }
  }
  return new Response('ok')
})
