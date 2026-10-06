// backup-export — ส่งข้อมูลออกแบบ "อ่านอย่างเดียว" ให้ Google Apps Script นำไปสำรองลง Google Sheet
// - ไม่มีการเขียน/แก้ไขข้อมูลใด ๆ ในฐานข้อมูล (ยกเว้นบันทึกเวลาใช้งานโทเคนล่าสุด)
// - ยืนยันตัวตนด้วย header  x-backup-token  (เทียบกับแฮช SHA-256 ในตาราง backup_key)
// - ส่งออกเฉพาะตารางใน ALLOW และตัดคอลัมน์อ่อนไหวตาม DROP
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ตารางที่อนุญาตให้สำรอง : ชื่อแท็บ (ภาษาไทย)
// ไม่รวม: student_private (เลขบัตร), drive_link (โทเคน Drive), backup_key, password_log,
//          nid_access_log, counsel_session/student/log (บันทึกให้คำปรึกษา), student_health,
//          student_conduct, line_group, _backup_subject_code_fix
const ALLOW: Record<string, string> = {
  student: "นักศึกษา",
  grade: "ผลการเรียน",
  subject: "รายวิชา",
  teacher: "อาจารย์",
  special_teacher: "อาจารย์พิเศษ",
  teacher_directory: "ทำเนียบอาจารย์",
  alumni: "ศิษย์เก่า",
  app_user: "ผู้ใช้งาน",
  permission: "สิทธิ์การเข้าถึง",
  schedule: "ตารางเรียน",
  tracking: "ติดตามงาน",
  file_tracking: "ติดตามไฟล์",
  grade_tracking: "ติดตามส่งเกรด",
  result_tracking: "ติดตามผลสอบ",
  eng_result: "ผลสอบภาษาอังกฤษ",
  doc_request: "คำร้องเอกสาร",
  leave: "การลา",
  announcement: "ประกาศ",
  survey_config: "ตั้งค่าแบบสำรวจ",
  survey_question: "คำถามแบบสำรวจ",
  survey_response: "คำตอบแบบสำรวจ",
  support_ticket: "แจ้งปัญหา",
  workload_rate: "เกณฑ์ภาระงาน",
  workload_plan: "แผนภาระงาน",
  workload_student: "ภาระงานรายบุคคล",
  curriculum: "หลักสูตร",
  curriculum_course: "รายวิชาในหลักสูตร",
  curriculum_plo: "PLO",
  curriculum_map: "Curriculum Map",
  plo_setting: "ตั้งค่า PLO",
  plo_band: "ระดับผล PLO",
  plo_clo: "CLO",
  plo_score: "คะแนน CLO",
  homeroom: "โฮมรูม",
  eval_itemset: "ชุดข้อประเมิน",
  eval_item: "ข้อประเมิน",
  eval_heading: "หัวข้อประเมิน",
  eval_group: "กลุ่มประเมิน",
  eval_form: "แบบประเมิน",
  eval_target: "เป้าหมายประเมิน",
  eval_response: "การตอบแบบประเมิน",
  eval_answer: "คำตอบแบบประเมิน",
  practicum_site: "แหล่งฝึก",
  counsel_option: "ตัวเลือกให้คำปรึกษา",
  user_profile: "โปรไฟล์ผู้ใช้",
  app_setting: "ตั้งค่าระบบ",
  login_log: "ประวัติเข้าระบบ",
  mail_log: "ประวัติส่งเมล",
};

// คอลัมน์อ่อนไหวที่ตัดออก
const DROP: Record<string, string[]> = {
  student: ["religion"],
  teacher: ["bank_account", "address"],
  alumni: ["salary"],
  app_user: ["auth_user_id"],
  user_profile: ["auth_user_id", "owner_uid"],
  support_ticket: ["auth_uid"],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-backup-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request) {
  const tok = (req.headers.get("x-backup-token") || "").trim();
  if (tok.length < 20) return null;
  const h = await sha256(tok);
  const { data } = await sb.from("backup_key").select("id").eq("token_hash", h).eq("is_active", true).maybeSingle();
  return data ? data.id : null;
}

const PAGE = 1000; // PostgREST ส่งได้สูงสุดครั้งละ 1000 แถว

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const keyId = await authorized(req);
  if (!keyId) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === "list") {
      await sb.from("backup_key").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
      const tables = [];
      for (const [name, label] of Object.entries(ALLOW)) {
        const { count, error } = await sb.from(name).select("id", { count: "exact", head: true });
        tables.push({ name, label, count: error ? null : count ?? 0, error: error ? error.message : undefined });
      }
      return json({ ok: true, at: new Date().toISOString(), tables });
    }

    if (body.action === "page") {
      const table = String(body.table || "");
      if (!ALLOW[table]) return json({ error: "table not allowed" }, 400);
      const offset = Math.max(0, parseInt(body.offset) || 0);
      const limit = Math.min(5000, Math.max(1, parseInt(body.limit) || 5000));
      const drop = new Set(DROP[table] || []);
      const rows: Record<string, unknown>[] = [];
      for (let o = offset; o < offset + limit; o += PAGE) {
        const end = Math.min(o + PAGE, offset + limit) - 1;
        const { data, error } = await sb.from(table).select("*").order("id", { ascending: true }).range(o, end);
        if (error) return json({ error: error.message }, 500);
        rows.push(...(data || []));
        if (!data || data.length < end - o + 1) break;
      }
      const columns: string[] = [];
      for (const r of rows) for (const k of Object.keys(r)) if (!drop.has(k) && !columns.includes(k)) columns.push(k);
      const out = rows.map((r) => columns.map((c) => {
        const v = (r as any)[c];
        return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
      }));
      return json({ ok: true, table, offset, columns, rows: out, done: rows.length < limit });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e && (e as Error).message || e) }, 500);
  }
});
