-- ============================================================================
-- 01_helpers.sql — ฟังก์ชันตัวช่วยในสกีมา ems
-- ----------------------------------------------------------------------------
-- ตัวตัดสินว่า "คนที่ล็อกอินอยู่คือใคร มีบทบาทอะไร ดูแลนักศึกษาคนไหนได้"
-- นโยบาย RLS ทุกข้อใน 02_policies.sql เรียกใช้ฟังก์ชันในไฟล์นี้
--
-- สำเนา ณ 30 ก.ย. 2569 — ดึงใหม่ได้ด้วย 90_export.sql
-- ============================================================================

create schema if not exists ems;

-- ---------------------------------------------------------------------------
-- ก. พื้นฐาน
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ems.norm(t text)
 RETURNS text LANGUAGE sql IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select lower(btrim(coalesce(t, ''))) $function$;

-- แถวบัญชีของคนที่ล็อกอินอยู่ — บัญชีที่ถูกปิดใช้งานจะไม่คืนค่า
CREATE OR REPLACE FUNCTION ems.me()
 RETURNS app_user LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.app_user
   where auth_user_id = auth.uid()
     and coalesce(is_active, '1') not in ('0', 'false', 'ปิด')
   limit 1
$function$;

-- บทบาททั้งหมดของคนที่ล็อกอิน (role + extra_roles) เก็บผลไว้ในตัวแปรเซสชัน
-- เพื่อไม่ให้ RLS ต้องยิงตาราง app_user ซ้ำทุกแถวที่ตรวจ
CREATE OR REPLACE FUNCTION ems.my_roles()
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c text; arr text[];
begin
  c := current_setting('ems.c_roles', true);
  if c is not null and c like 'v:%' then return substr(c, 3)::text[]; end if;
  select coalesce(array_agg(distinct t.r), '{}'::text[]) into arr
  from (
    select btrim(x) as r
    from public.app_user u,
         unnest(string_to_array(coalesce(u.role, '') || ',' || coalesce(u.extra_roles, ''), ',')) as x
    where u.auth_user_id = auth.uid()
      and coalesce(u.is_active, '1') not in ('0', 'false', 'ปิด')
  ) t
  where t.r <> '';
  perform set_config('ems.c_roles', 'v:' || arr::text, true);
  return arr;
end $function$;

CREATE OR REPLACE FUNCTION ems.has_role(p_role text)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ select p_role = any (ems.my_roles()) $function$;

CREATE OR REPLACE FUNCTION ems.has_any_role(p_roles text[])
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ select ems.my_roles() && p_roles $function$;

-- ---------------------------------------------------------------------------
-- ข. กลุ่มบทบาทที่ใช้ซ้ำในนโยบายสิทธิ์
-- ---------------------------------------------------------------------------
-- แก้ไขข้อมูลหลักได้ (งานทะเบียน งานวิชาการ ผู้ดูแล)
CREATE OR REPLACE FUNCTION ems.is_full()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select ems.has_any_role(array['admin','academic','registrar'])
$function$;

-- ผู้ที่ทำงานกับผลการเรียนและการติดตามงานรายวิชา
CREATE OR REPLACE FUNCTION ems.is_educator()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select ems.has_any_role(array['admin','academic','registrar','deptHead','teacher','classTeacher'])
$function$;

-- บุคลากรทั้งหมด (ไม่รวมนักศึกษา)
CREATE OR REPLACE FUNCTION ems.is_staff()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select ems.has_any_role(array['admin','academic','registrar','executive','deptHead','teacher','classTeacher'])
$function$;

-- เห็นข้อมูลนักศึกษาได้ทุกคน ไม่จำกัดเฉพาะที่ตนดูแล
CREATE OR REPLACE FUNCTION ems.sees_all_students()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select ems.has_any_role(array['admin','academic','registrar','executive','otherStaff'])
$function$;

-- ---------------------------------------------------------------------------
-- ค. ตัวตนของผู้ใช้ (เก็บผลไว้ในตัวแปรเซสชันเหมือนกัน)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ems.role_of()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c text; v text;
begin
  c := current_setting('ems.c_role', true);
  if c is not null and c like 'v:%' then return substr(c, 3); end if;
  select coalesce((ems.me()).role, 'guest') into v;
  perform set_config('ems.c_role', 'v:' || v, true);
  return v;
end $function$;

CREATE OR REPLACE FUNCTION ems.user_name()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c text; v text;
begin
  c := current_setting('ems.c_name', true);
  if c is not null and c like 'v:%' then return substr(c, 3); end if;
  select coalesce((ems.me()).name, '') into v;
  perform set_config('ems.c_name', 'v:' || v, true);
  return v;
end $function$;

CREATE OR REPLACE FUNCTION ems.my_name()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
  select coalesce(u.name,'') from public.app_user u where u.auth_user_id = auth.uid() limit 1
$function$;

CREATE OR REPLACE FUNCTION ems.student_id()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c text; v text;
begin
  c := current_setting('ems.c_sid', true);
  if c is not null and c like 'v:%' then return substr(c, 3); end if;
  select coalesce((ems.me()).student_id, '') into v;
  perform set_config('ems.c_sid', 'v:' || v, true);
  return v;
end $function$;

-- รหัสนักศึกษาของคนที่ล็อกอิน — คืนค่าเฉพาะบัญชีที่บทบาทเป็น student เท่านั้น
CREATE OR REPLACE FUNCTION ems.my_student_id()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select student_id from public.app_user
  where auth_user_id = auth.uid() and coalesce(role,'') = 'student'
  limit 1
$function$;

-- ชั้นปีที่อาจารย์ประจำชั้นรับผิดชอบ
CREATE OR REPLACE FUNCTION ems.my_year()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c text; v text;
begin
  c := current_setting('ems.c_year', true);
  if c is not null and c like 'v:%' then return substr(c, 3); end if;
  select coalesce(
    nullif(btrim((ems.me()).responsible_year), ''),
    nullif(btrim((select t.responsible_year from public.teacher t
                   where ems.norm(t.email) = ems.norm((ems.me()).email)
                      or ems.norm(t.name)  = ems.norm((ems.me()).name)
                   limit 1)), ''),
    '') into v;
  perform set_config('ems.c_year', 'v:' || v, true);
  return v;
end $function$;

-- รายวิชาที่ตนเป็นผู้รับผิดชอบรายวิชา
CREATE OR REPLACE FUNCTION ems.my_subject_codes()
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c text; arr text[];
begin
  c := current_setting('ems.c_subj', true);
  if c is not null and c like 'v:%' then return substr(c, 3)::text[]; end if;
  if ems.user_name() = '' then
    arr := '{}'::text[];
  else
    select coalesce(array_agg(distinct sub.subject_code), '{}'::text[]) into arr
      from public.subject sub
     where sub.subject_code is not null
       and position(lower(btrim(ems.user_name())) in lower(coalesce(sub.coordinator, ''))) > 0;
  end if;
  perform set_config('ems.c_subj', 'v:' || arr::text, true);
  return arr;
end $function$;

CREATE OR REPLACE FUNCTION ems.coordinates_subject(p_subject_code text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select ems.role_of() in ('teacher', 'classTeacher')
     and ems.user_name() <> ''
     and exists (
       select 1 from public.subject sub
        where sub.subject_code = p_subject_code
          and position(ems.norm(ems.user_name()) in ems.norm(sub.coordinator)) > 0)
$function$;

-- อาจารย์ที่ปรึกษาเห็นนักศึกษาในความดูแล · อาจารย์ประจำชั้นเห็นทั้งชั้นปี
CREATE OR REPLACE FUNCTION ems.owns_student(p_student_id text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select
    (ems.has_role('teacher') and exists (
       select 1 from public.student s
        where s.student_id = p_student_id
          and ems.norm(s.advisor) = ems.norm(ems.user_name())
          and ems.norm(ems.user_name()) <> ''))
    or
    (ems.has_role('classTeacher') and ems.my_year() <> '' and exists (
       select 1 from public.student s
        where s.student_id = p_student_id
          and btrim(coalesce(s.year_level, '')) = ems.my_year()))
$function$;

-- ---------------------------------------------------------------------------
-- ง. สถานะที่อนุญาตให้เข้าระบบ + ทริกเกอร์ปิดบัญชีอัตโนมัติ
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ems.student_login_allowed(p_status text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  select coalesce(btrim(p_status), '') in ('กำลังศึกษา', 'พักการศึกษา');
$function$;

CREATE OR REPLACE FUNCTION ems.teacher_login_allowed(p_status text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  select coalesce(btrim(p_status), '') not in ('ลาออก', 'โอนย้าย');
$function$;

-- เปลี่ยนสถานะนักศึกษาในทะเบียน แล้วบัญชีเข้าระบบปิด/เปิดตามทันที
CREATE OR REPLACE FUNCTION ems.student_status_sync_app_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
begin
  if coalesce(new.student_id,'') <> '' and coalesce(new.status,'') is distinct from coalesce(old.status,'') then
    update public.app_user
       set is_active = case when ems.student_login_allowed(new.status) then '1' else '0' end
     where role = 'student' and student_id = new.student_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION ems.teacher_status_sync_app_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
begin
  if coalesce(btrim(new.email),'') <> '' then
    update public.app_user
       set is_active = case when ems.teacher_login_allowed(new.teacher_status) then '1' else '0' end
     where coalesce(role,'') <> 'student'
       and lower(btrim(email)) = lower(btrim(new.email));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION ems.app_user_sync_student_active()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare v_status text;
begin
  if coalesce(new.role,'') = 'student' and coalesce(new.student_id,'') <> '' then
    select s.status into v_status
      from public.student s
     where s.student_id = new.student_id
     limit 1;
    if v_status is not null and not ems.student_login_allowed(v_status) then
      new.is_active := '0';
    end if;
  end if;
  return new;
end;
$function$;

-- ผูกบัญชี auth เข้ากับแถวใน app_user ตอนสมัคร/เข้าครั้งแรก
-- เหลือเฉพาะบัญชี Google ของวิทยาลัย — สาขาบัญชีภายใน student.bcnb.local
-- (ของเดิมที่ใช้เลขบัตรประชาชน) ถูกตัดออกเมื่อ 29 ก.ย. 2569
CREATE OR REPLACE FUNCTION ems.link_auth_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_email   text := lower(coalesce(new.email, ''));
  v_local   text := split_part(v_email, '@', 1);
  v_domain  text := split_part(v_email, '@', 2);
  v_updated int;
begin
  -- (ก) บัญชี Google ของวิทยาลัยที่เป็นรหัสนักศึกษา — บังคับบทบาทนักศึกษาเสมอ
  if v_domain = 'bcn.ac.th' and v_local ~ '^[0-9]{6,}$' then
    update public.app_user set auth_user_id = new.id
     where student_id = v_local and role = 'student';
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      -- ยังไม่มีแถวบัญชี แต่ต้องมีชื่อในทะเบียนนักศึกษาก่อนเท่านั้น
      insert into public.app_user (role, student_id, name, email, is_active, auth_user_id)
      select 'student', s.student_id, s.name, v_email, '1', new.id
        from public.student s where s.student_id = v_local limit 1;
    end if;
    return new;
  end if;

  -- (ข) บุคลากร — จับคู่ด้วยอีเมล และต้องไม่ใช่บทบาทนักศึกษา
  update public.app_user set auth_user_id = new.id
   where lower(email) = v_email and role <> 'student';

  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- จ. ภาระงานนักศึกษา
-- ---------------------------------------------------------------------------
-- พันธกิจที่เจ้าหน้าที่คนนั้นได้รับมอบหมายให้บันทึกได้
CREATE OR REPLACE FUNCTION ems.workload_missions()
 RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case
    when coalesce(btrim(u.extra->>'workload_missions'), '') = ''
      then array['service','research','student','personal']
    else (
      select coalesce(array_agg(x), '{}'::text[])
      from unnest(string_to_array(u.extra->>'workload_missions', ',')) t(x0)
      cross join lateral (select btrim(x0)) v(x)
      where btrim(x0) in ('service','research','student','personal')
    )
  end
  from public.app_user u
  where u.auth_user_id = auth.uid()
  limit 1
$function$;

-- ด้านการเรียนการสอนสงวนไว้ให้งานวิชาการเสมอ ที่เหลือดูจากที่ได้รับมอบหมาย
CREATE OR REPLACE FUNCTION ems.workload_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare
  allowed text[];
  blocked text[] := '{}'::text[];
  chk     text;
  newv    text;
  oldv    text;
  labels  jsonb := '{"teaching":"การเรียนการสอน","service":"บริการวิชาการ","research":"วิจัย/นวัตกรรม","student":"พัฒนานักศึกษา","personal":"การใช้ชีวิตส่วนตัว"}'::jsonb;
begin
  if auth.uid() is null then return new; end if;          -- งานฝั่งเซิร์ฟเวอร์
  if ems.has_any_role(array['admin','academic']) then return new; end if;
  if not ems.has_any_role(array['otherStaff']) then
    raise exception 'บัญชีของคุณไม่มีสิทธิ์แก้ไขภาระงานนักศึกษา';
  end if;

  allowed := ems.workload_missions();

  foreach chk in array array['teaching','service','research','student','personal'] loop
    if chk <> 'teaching' and chk = any (allowed) then continue; end if;

    newv := case chk
      when 'teaching' then new.teaching_json when 'service' then new.service_json
      when 'research' then new.research_json when 'student' then new.student_json
      else new.personal_json end;

    if tg_op = 'INSERT' then
      if coalesce(btrim(newv), '') not in ('', '[]') then
        blocked := array_append(blocked, labels ->> chk);
      end if;
    else
      oldv := case chk
        when 'teaching' then old.teaching_json when 'service' then old.service_json
        when 'research' then old.research_json when 'student' then old.student_json
        else old.personal_json end;
      if coalesce(newv, '') is distinct from coalesce(oldv, '') then
        blocked := array_append(blocked, labels ->> chk);
      end if;
    end if;
  end loop;

  if array_length(blocked, 1) > 0 then
    raise exception 'บัญชีของคุณไม่ได้รับมอบหมายให้บันทึกพันธกิจ: %', array_to_string(blocked, ', ');
  end if;
  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- ฉ. เบ็ดเตล็ด
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ems.touch_updated_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin new.updated_at := now(); return new; end $function$;
