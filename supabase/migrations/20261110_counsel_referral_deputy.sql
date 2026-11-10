-- ================================================================
-- AAMS · ระบบให้คำปรึกษานักศึกษา
-- เปิดสิทธิ์อ่านรายการที่ "ส่งต่อให้งานให้คำปรึกษา" ให้รองผู้อำนวยการ 2 ด้าน
--   · รองผู้อำนวยการด้านกิจการนักศึกษา
--   · รองผู้อำนวยการด้านวิชาการ
-- ด้านที่รับผิดชอบเก็บไว้ที่ app_user.extra->>'exec_area'
-- (ตั้งค่าได้ที่เมนูจัดการผู้ใช้ ช่อง "ด้านที่รับผิดชอบ")
--
-- แก้เฉพาะฟังก์ชันเดียว ไม่ต้องแตะ policy เดิม เพราะ cs_read / cst_read
-- เรียก ems.counsel_is_referral_staff() อยู่แล้ว และยังจำกัดเฉพาะแถวที่
-- refer_status = 'ส่งต่อ' เท่านั้นเหมือนเดิม
--
-- ย้อนกลับได้ด้วยการรันนิยามเดิม :
--   create or replace function ems.counsel_is_referral_staff()
--   returns boolean language sql stable set search_path to 'public'
--   as $$ select ems.has_any_role(array['otherStaff']) $$;
-- ================================================================

create or replace function ems.counsel_is_referral_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ems.has_any_role(array['otherStaff'])
      or exists (
           select 1
           from public.app_user u
           where u.auth_user_id = auth.uid()
             and coalesce(u.is_active, '1') not in ('0', 'false', 'ปิด')
             and exists (
                   select 1
                   from unnest(string_to_array(
                          coalesce(u.role, '') || ',' || coalesce(u.extra_roles, ''), ',')) r
                   where btrim(r) = 'executive')
             and btrim(coalesce(u.extra->>'exec_area', ''))
                 in ('วิชาการ', 'กิจการนักศึกษา')
         )
$function$;

comment on function ems.counsel_is_referral_staff() is
  'ผู้รับเคสที่ส่งต่อ: เจ้าหน้าที่งานอื่นๆ และผู้บริหารที่มี exec_area = วิชาการ/กิจการนักศึกษา';
