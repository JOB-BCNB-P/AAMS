-- ================================================================
-- AAMS · สิทธิ์ที่อิง "ด้านที่รับผิดชอบของผู้บริหาร" (app_user.extra->>'exec_area')
--
-- ทำไมต้องรัน
--   ตาราง app_user เปิดให้อ่านเฉพาะ ems.is_full() (ผู้ดูแลระบบ · งานวิชาการ · งานทะเบียน)
--   กับแถวของตัวเองเท่านั้น  ฝั่งหน้าเว็บจึงมองไม่เห็นว่าใครเป็นรองผู้อำนวยการด้านไหน
--   ทำให้สองอย่างนี้เงียบไปโดยไม่มี error
--     1) รองผู้อำนวยการด้านวิชาการ กดปุ่ม "ส่งเกรดเข้าหน้าผลการเรียน" ไม่ได้
--     2) การส่งต่อเคสในระบบให้คำปรึกษา หาผู้รับไม่เจอ จึงไม่มีอีเมลแจ้งเตือน
--
-- ไฟล์นี้แก้สองอย่าง ไม่แตะ RLS ของ app_user และไม่เปิดเผยอีเมลหรือข้อมูลอื่น
--   ก) ems_whoami() ส่ง exec_area ของผู้ใช้เองกลับมาด้วย
--   ข) ems_exec_names() คืน "ชื่อ" ของผู้บริหารตามด้านที่ขอ (security definer)
-- ================================================================

-- ---------- ก) ให้ผู้ใช้รู้ด้านของตัวเอง ----------
create or replace function public.ems_whoami()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  u public.app_user;
  s public.student;
  out_json jsonb;
  all_roles text[];
  v_status text;
begin
  select * into u from public.app_user where auth_user_id = auth.uid() limit 1;
  if u.id is null then
    return jsonb_build_object('found', false, 'email', coalesce(auth.jwt() ->> 'email', ''));
  end if;

  if coalesce(btrim(u.is_active), '1') in ('0', 'false', 'ปิด') then
    v_status := null;
    if coalesce(u.role,'') = 'student' and coalesce(u.student_id,'') <> '' then
      select status into v_status from public.student where student_id = u.student_id limit 1;
    end if;
    return jsonb_build_object(
      'found', false, 'blocked', true,
      'email', coalesce(u.email, auth.jwt() ->> 'email', ''),
      'reason', case
        when v_status = 'สำเร็จการศึกษา' then 'บัญชีนี้สำเร็จการศึกษาแล้ว จึงไม่สามารถเข้าสู่ระบบได้'
        when v_status is not null and v_status <> '' then 'บัญชีนี้มีสถานะ "' || v_status || '" จึงไม่สามารถเข้าสู่ระบบได้'
        else 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
      end);
  end if;

  select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x) <> ''), '{}'::text[])
    into all_roles
    from unnest(string_to_array(coalesce(u.role, '') || ',' || coalesce(u.extra_roles, ''), ',')) as x;

  out_json := jsonb_build_object(
    'found', true,
    'role', u.role,
    'roles', to_jsonb(all_roles),
    'name', u.name,
    'email', u.email,
    'username', u.username,
    'department', u.department,
    'responsible_year', u.responsible_year,
    'student_id', u.student_id,
    -- ด้านที่รับผิดชอบของผู้บริหาร (ว่าง = ไม่ใช่ผู้บริหาร หรือยังไม่ได้กำหนด)
    'exec_area', btrim(coalesce(u.extra->>'exec_area', '')),
    -- พันธกิจภาระงานนักศึกษาที่บัญชีนี้ได้รับมอบหมายให้บันทึก
    'workload_missions', to_jsonb(ems.workload_missions())
  );

  if u.role = 'student' and coalesce(u.student_id, '') <> '' then
    select * into s from public.student where student_id = u.student_id limit 1;
    if s.id is not null then
      out_json := out_json || jsonb_build_object(
        'student', to_jsonb(s) - 'extra' || coalesce(s.extra, '{}'::jsonb));
    end if;
  end if;

  return out_json;
end $function$;

-- ---------- ข) รายชื่อผู้บริหารตามด้าน ----------
-- คืนเฉพาะ "ชื่อ" กับ "ด้าน" ไม่คืนอีเมล รหัสผู้ใช้ หรือข้อมูลอื่น
-- ใช้ตอนระบบให้คำปรึกษาส่งต่อเคส เพื่อเติมชื่อผู้รับและแจ้งเตือน
create or replace function public.ems_exec_names(p_areas text[] default null)
returns table (name text, exec_area text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select u.name,
         btrim(coalesce(u.extra->>'exec_area', '')) as exec_area
  from public.app_user u
  where coalesce(u.is_active, '1') not in ('0', 'false', 'ปิด')
    and coalesce(btrim(u.name), '') <> ''
    and exists (
          select 1
          from unnest(string_to_array(
                 coalesce(u.role, '') || ',' || coalesce(u.extra_roles, ''), ',')) r
          where btrim(r) = 'executive')
    and btrim(coalesce(u.extra->>'exec_area', '')) <> ''
    and (p_areas is null
         or btrim(coalesce(u.extra->>'exec_area', '')) = any (p_areas))
  order by u.name
$function$;

revoke all on function public.ems_exec_names(text[]) from public;
grant execute on function public.ems_exec_names(text[]) to authenticated;

comment on function public.ems_exec_names(text[]) is
  'ชื่อผู้บริหารที่เปิดใช้งานอยู่ แยกตามด้านที่รับผิดชอบ (ไม่คืนอีเมล) — ใช้ตอนส่งต่อเคสให้คำปรึกษา';
