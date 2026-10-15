-- ============================================================================
-- 93_leave_resubmit.sql — นักศึกษายื่นใบลาที่ "ไม่อนุมัติ" อีกครั้ง
-- ----------------------------------------------------------------------------
-- นักศึกษาไม่มีสิทธิ์ UPDATE ตาราง leave โดยตรง (p_update = เฉพาะบุคลากร)
-- จึงให้ยื่นซ้ำผ่านฟังก์ชันนี้ ซึ่งทำงานด้วย SECURITY DEFINER และตรวจเองว่า
--   1) ผู้เรียกเป็นเจ้าของใบลา (รหัสนักศึกษาหรือชื่อตรงกัน) หรือเป็นบุคลากร
--   2) ใบลาอยู่ในสถานะ "ปฏิเสธ"
-- แล้วรีเซ็ต "เฉพาะขั้นที่ปฏิเสธ" กลับเป็น "รอ" — ขั้นที่อนุมัติไปแล้วคงไว้
-- ข้อความชี้แจงและประวัติการไม่อนุมัติครั้งล่าสุดเก็บในคอลัมน์ extra
--
-- วิธีติดตั้ง: Supabase → SQL Editor → วางทั้งไฟล์ → Run (รันซ้ำได้)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ems_leave_resubmit(p_id bigint, p_note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  r public.leave;
  v_stage text;
  v_label text;
  v_by text;
  v_reason text;
  v_count int;
  v_extra jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'กรุณาเข้าสู่ระบบ');
  end if;
  if coalesce(btrim(p_note), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'กรุณาระบุข้อความชี้แจง');
  end if;

  select * into r from public.leave where id = p_id for update;
  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'ไม่พบใบลา');
  end if;

  -- ตรวจความเป็นเจ้าของ
  if not (
       ems.is_staff()
    or (coalesce(ems.student_id(), '') <> '' and ems.norm(r.student_id) = ems.norm(ems.student_id()))
    or (coalesce(ems.user_name(), '') <> '' and ems.norm(r.name) = ems.norm(ems.user_name()))
  ) then
    return jsonb_build_object('ok', false, 'error', 'ไม่มีสิทธิ์ยื่นใบลานี้');
  end if;

  if coalesce(r.leave_status, '') <> 'ปฏิเสธ' then
    return jsonb_build_object('ok', false, 'error', 'ใบลานี้ไม่ได้อยู่ในสถานะไม่อนุมัติ');
  end if;

  v_extra := coalesce(r.extra, '{}'::jsonb);

  if coalesce(r.coordinator_approval, '') = 'ปฏิเสธ' then
    v_stage := 'coordinator_approval';   v_label := 'อาจารย์ผู้ประสานงานรายวิชา';
  elsif coalesce(r.class_teacher_approval, '') = 'ปฏิเสธ' then
    v_stage := 'class_teacher_approval'; v_label := 'อาจารย์ประจำชั้น';
  elsif coalesce(r.deputy_approval, '') = 'ปฏิเสธ' then
    v_stage := 'deputy_approval';        v_label := 'รองผู้อำนวยการด้านวิชาการ';
  else
    -- สถานะปฏิเสธแต่ไม่มีขั้นไหนบันทึกไว้ (ข้อมูลเก่า) → เริ่มจากขั้นแรกที่ยังไม่อนุมัติ
    v_stage := coalesce(nullif(v_extra ->> 'rejected_stage', ''),
      case when coalesce(r.coordinator_approval, '') <> 'อนุมัติ' then 'coordinator_approval'
           when coalesce(r.class_teacher_approval, '') <> 'อนุมัติ' then 'class_teacher_approval'
           else 'deputy_approval' end);
    v_label := case v_stage when 'coordinator_approval' then 'อาจารย์ผู้ประสานงานรายวิชา'
                            when 'class_teacher_approval' then 'อาจารย์ประจำชั้น'
                            else 'รองผู้อำนวยการด้านวิชาการ' end;
  end if;

  v_by := coalesce(v_extra ->> 'rejected_by', '');
  v_reason := coalesce(v_extra ->> 'rejected_reason', '');
  v_count := coalesce(nullif(v_extra ->> 'resubmit_count', '')::int, 0) + 1;

  update public.leave set
    coordinator_approval   = case when v_stage = 'coordinator_approval'   then 'รอ' else coordinator_approval end,
    class_teacher_approval = case when v_stage = 'class_teacher_approval' then 'รอ' else class_teacher_approval end,
    deputy_approval        = case when v_stage = 'deputy_approval'        then 'รอ' else deputy_approval end,
    leave_status = 'รออนุมัติ',
    extra = (v_extra - 'rejected_stage' - 'rejected_by' - 'rejected_reason' - 'rejected_at')
      || jsonb_build_object(
           'resubmit_count', v_count::text,
           'resubmit_note', btrim(p_note),
           'resubmitted_at', to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS'),
           'last_rejected_stage', v_stage,
           'last_rejected_by', v_by,
           'last_rejected_reason', v_reason)
  where id = p_id;

  return jsonb_build_object('ok', true, 'stage', v_stage, 'stage_label', v_label, 'resubmit_count', v_count);
end $function$;

REVOKE ALL ON FUNCTION public.ems_leave_resubmit(bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ems_leave_resubmit(bigint, text) TO authenticated;
