-- ============================================================================
-- 03_rpc.sql — ฟังก์ชัน ems_* ที่หน้าเว็บเรียกใช้
-- ----------------------------------------------------------------------------
-- ทุกตัวเป็น SECURITY DEFINER คือทำงานด้วยสิทธิ์ของเจ้าของฐานข้อมูล ข้าม RLS ได้
-- จึงต้อง "ตรวจบทบาทเองในตัวฟังก์ชัน" ทุกตัว ไม่มีข้อยกเว้น
-- ตัวไหนไม่ตรวจ = ช่องโหว่ทันที ให้ถือเป็นรายการตรวจสอบหลักเวลารีวิวโค้ด
--
-- ทุกตัวถูก revoke จาก public และ anon แล้วค่อย grant ให้ authenticated
-- (Supabase ให้สิทธิ์ anon อัตโนมัติตอนสร้างฟังก์ชันใหม่ ถ้าลืม revoke จะเปิดทิ้งไว้)
--
-- สำเนา ณ 30 ก.ย. 2569 — ดึงใหม่ได้ด้วย 90_export.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ก. ตัวตนและโครงสร้าง
-- ---------------------------------------------------------------------------

-- "ฉันเป็นใคร" — หน้าเว็บเรียกทันทีหลังล็อกอิน เพื่อรู้บทบาทและข้อมูลนักศึกษาของตัวเอง
-- บัญชีที่ถูกปิด (is_active = 0) จะได้ found=false พร้อมเหตุผลเป็นภาษาไทย
CREATE OR REPLACE FUNCTION public.ems_whoami()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

-- โครงสร้างคอลัมน์ของทุกตาราง — ตัวอ่านข้อมูลของหน้าเว็บใช้ตัดสินว่าคอลัมน์ไหนไม่ใช่ข้อความ
-- ไม่มีข้อมูลจริงอยู่ในผลลัพธ์ จึงเปิดให้ทุกคนที่ล็อกอินเรียกได้
CREATE OR REPLACE FUNCTION public.ems_schema()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with cols as (
    select c.table_name as t, c.column_name as col, c.data_type as dt, c.ordinal_position as ord
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public'
       and tb.table_type = 'BASE TABLE'
  ),
  per_table as (
    select t, jsonb_agg(col order by ord) as names from cols group by t
  ),
  non_string as (
    select t, jsonb_agg(col order by ord) as names
      from cols
     where dt in ('numeric','integer','bigint','smallint','double precision','real',
                  'boolean','date','timestamp without time zone','timestamp with time zone',
                  'time without time zone','time with time zone','uuid','json','jsonb',
                  'interval','ARRAY')
     group by t
  )
  select coalesce((select jsonb_object_agg(t, names) from per_table), '{}'::jsonb)
         || jsonb_build_object('__nonstring',
              coalesce((select jsonb_object_agg(t, names) from non_string), '{}'::jsonb))
$function$;

-- จำนวนแถวของทุกตาราง ใช้ตรวจสุขภาพระบบ — เฉพาะงานทะเบียน/วิชาการ/ผู้ดูแล
CREATE OR REPLACE FUNCTION public.ems_row_counts()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t text; n bigint; res jsonb := '{}'::jsonb;
begin
  if not ems.is_full() then raise exception 'ไม่มีสิทธิ์'; end if;
  for t in select table_name from information_schema.tables
            where table_schema='public' and table_type='BASE TABLE' order by table_name loop
    execute format('select count(*) from public.%I', t) into n;
    res := res || jsonb_build_object(t, n);
  end loop;
  return res;
end $function$;

-- ดึงข้อมูลหลายตารางในคำขอเดียว ลดจำนวนรอบที่หน้าเว็บต้องยิง
-- ⚠️ เป็น STABLE (ไม่ใช่ SECURITY DEFINER) จึงยังถูก RLS คุมอยู่ทุกตาราง
-- รายชื่อ allowed เป็นบัญชีขาว ตารางที่ไม่อยู่ในนี้เรียกผ่านฟังก์ชันนี้ไม่ได้เลย
CREATE OR REPLACE FUNCTION public.ems_fetch(tabs text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array[
    'student','teacher','subject','grade','eng_result','leave','curriculum','curriculum_plo',
    'plo_clo','plo_score','schedule','survey','survey_response','teacher_directory','advisor',
    'special_teacher','alumni','tracking','result_tracking','grade_tracking','file_tracking',
    'user','login_log','password_log','workload','workload_plan','workload_rate','app_setting',
    'eval_itemset','eval_item','eval_form','eval_target','eval_heading','user_profile',
    'practicum_site','workload_student','eval_group'
  ];
  t text;
  out jsonb := '{}'::jsonb;
  rows jsonb;
begin
  foreach t in array coalesce(tabs, array[]::text[]) loop
    if t = any (allowed) then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t)
        into rows;
      out := out || jsonb_build_object(t, rows);
    end if;
  end loop;
  return out;
end;
$function$;

-- ---------------------------------------------------------------------------
-- ข. ข้อมูลอ่อนไหว
-- ---------------------------------------------------------------------------

-- เลขบัตรประชาชนที่เก็บไว้เป็นประวัติ (ตาราง student_private)
-- เห็นเฉพาะผู้ดูแลระบบ และปิดบังสามตัวท้ายมาจากฐานข้อมูลแล้ว
-- เลขเต็มจึงไม่เคยออกจากเซิร์ฟเวอร์เลย แม้ผู้ดูแลเองก็ไม่เห็น
CREATE OR REPLACE FUNCTION public.ems_student_nid(p_student_ref bigint)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
  select case
    when not ems.has_any_role(array['admin']) then null
    when coalesce(sp.national_id, '') = '' then ''
    when length(btrim(sp.national_id)) <= 3 then 'xxx'
    else left(btrim(sp.national_id), length(btrim(sp.national_id)) - 3) || 'xxx'
  end
  from public.student_private sp
  where sp.student_ref = p_student_ref
  limit 1
$function$;

-- หา auth uid จากรหัสนักศึกษา/อีเมล/ชื่อผู้ใช้ — ใช้ตอนผู้ดูแลตั้งค่าบัญชีให้คนอื่น
CREATE OR REPLACE FUNCTION public.ems_user_uid(p_key text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select u.auth_user_id::text
    from public.app_user u
   where ems.has_any_role(array['admin'])
     and u.auth_user_id is not null
     and lower(btrim(coalesce(p_key, ''))) <> ''
     and lower(btrim(p_key)) in (
           lower(coalesce(u.student_id, '\x01')),
           lower(coalesce(u.email, '\x01')),
           lower(coalesce(u.username, '\x01'))
         )
   limit 1
$function$;

-- ---------------------------------------------------------------------------
-- ค. ทริกเกอร์ผูกบัญชี (ไม่ได้ให้หน้าเว็บเรียก)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ems_link_app_user_to_auth()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare uid uuid;
begin
  if new.auth_user_id is null and nullif(btrim(coalesce(new.email, '')), '') is not null then
    select a.id into uid
      from auth.users a
     where lower(btrim(a.email)) = lower(btrim(new.email))
     order by a.created_at
     limit 1;
    if uid is not null then new.auth_user_id := uid; end if;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.ems_link_new_auth_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  update public.app_user
     set auth_user_id = new.id,
         updated_at   = now()
   where auth_user_id is null
     and new.email is not null
     and lower(btrim(email)) = lower(btrim(new.email))
     and coalesce(is_active, '1') not in ('0', 'false', 'ปิด');
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- ง. ระบบประเมินผลรายวิชา — จุดที่กติกาความเป็นส่วนตัวถูกบังคับจริง
-- ---------------------------------------------------------------------------
-- กติกาสามข้อที่ทุกฟังก์ชันในหมวดนี้ยึดเหมือนกัน
--   1. ผู้ตอบขั้นต่ำ (min_respondents) ไม่ถึงเกณฑ์ = ไม่คืนตัวเลขใด ๆ
--      เพื่อไม่ให้ย้อนกลับไปเดาได้ว่าใครให้คะแนนเท่าไร
--   2. อาจารย์เห็นผลได้ต่อเมื่องานวิชาการกด "ส่งผล" (released) แล้วเท่านั้น
--   3. อาจารย์เห็นเฉพาะค่าเฉลี่ยรายด้านและของตนเอง ไม่เห็นรายข้อ ไม่เห็นของอาจารย์ท่านอื่น

-- สรุปผลของแบบประเมินหนึ่งวิชา
-- เจ้าหน้าที่ได้รายละเอียดครบ · อาจารย์ได้เฉพาะค่าเฉลี่ยรายด้าน + ของตนเอง
CREATE OR REPLACE FUNCTION public.ems_eval_summary(p_form text, p_teacher text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare
  f public.eval_form%rowtype;
  n_resp int; min_n int;
  me text; v_full boolean; v_teach boolean; v_coord boolean; v_released boolean;
  samp boolean; scope text;
begin
  select * into f from public.eval_form where form_code = p_form;
  if not found then return jsonb_build_object('error','not_found'); end if;

  me := ems.my_name();
  v_full := ems.has_any_role(array['admin','academic','registrar','executive','deptHead']);
  v_released := coalesce(f.released,'') <> '';

  v_teach := (not v_full) and ems.has_any_role(array['teacher','classTeacher'])
             and me <> '' and exists (
               select 1 from public.eval_target t
               where t.form_code = p_form and t.target_kind = 'teacher' and t.target_name = me);
  v_coord := (not v_full) and ems.has_any_role(array['teacher','classTeacher'])
             and me <> '' and coalesce(f.coordinator,'') = me;

  if not (v_full or v_teach or v_coord) then return jsonb_build_object('error','forbidden'); end if;
  if (not v_full) and (not v_released) then
    return jsonb_build_object('form_code', p_form, 'visible', false, 'released', false, 'n', 0, 'min', 0);
  end if;

  select count(*) into n_resp
    from public.eval_response r where r.form_code = p_form and r.status = 'ส่งแล้ว';
  min_n := greatest(1, coalesce(nullif(f.min_respondents,'')::int, 5));
  if n_resp < min_n then
    return jsonb_build_object('form_code', p_form, 'n', n_resp, 'min', min_n,
                              'visible', false, 'released', v_released);
  end if;

  samp  := coalesce(f.sd_mode,'sample') <> 'population';
  scope := case when v_full then 'all' when v_teach then 'teacher' else 'coordinator' end;

  -- อาจารย์และผู้ประสานงาน: คืนเฉพาะค่าเฉลี่ยรายด้าน (และของตนเองสำหรับผู้สอน)
  if not v_full then
    return (
      with a as (select * from public.eval_answer where form_code = p_form and score is not null),
      per_dim as (
        select dimension, count(*) n, avg(score) mean,
               case when samp then stddev_samp(score) else stddev_pop(score) end sd
        from a group by 1),
      own as (
        select count(*) n, avg(score) mean,
               case when samp then stddev_samp(score) else stddev_pop(score) end sd
        from a where dimension = 'teacher' and target_name = me),
      ov as (
        select count(*) n, avg(score) mean,
               case when samp then stddev_samp(score) else stddev_pop(score) end sd
        from a)
      select jsonb_build_object(
        'form_code', p_form, 'visible', true, 'released', true, 'n', n_resp, 'min', min_n,
        'sd_mode', coalesce(f.sd_mode,'sample'), 'mean_mode', coalesce(f.mean_mode,'item'),
        'scope', scope,
        'dimensions', (select coalesce(jsonb_agg(jsonb_build_object(
            'dimension',dimension,'n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
            order by dimension),'[]'::jsonb) from per_dim),
        'own', (select case when n > 0 then jsonb_build_object(
            'name', me, 'n', n, 'mean', round(mean,4), 'sd', round(coalesce(sd,0),4)) else null end from own),
        'overall_item', (select jsonb_build_object('n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4)) from ov),
        'overall_dim', (select jsonb_build_object('mean', round(avg(mean),4), 'k', count(*)) from per_dim),
        'items', '[]'::jsonb, 'items_all', '[]'::jsonb, 'targets', '[]'::jsonb, 'sections', '[]'::jsonb
      )
    );
  end if;

  -- เจ้าหน้าที่: รายละเอียดครบ
  return (
    with a as (select * from public.eval_answer where form_code = p_form and score is not null),
    it as (select set_code, item_code, max(section) section, max(statement_th) stmt, min(sort_order) so
           from public.eval_item group by 1,2),
    per_item as (
      select a.dimension, coalesce(a.target_kind,'') tk, coalesce(a.target_name,'') tn,
             a.item_code, coalesce(it.section,'') section, coalesce(it.stmt,'') stmt, coalesce(it.so,0) so,
             count(*) n, avg(a.score) mean,
             case when samp then stddev_samp(a.score) else stddev_pop(a.score) end sd
      from a left join it on it.set_code = a.set_code and it.item_code = a.item_code
      group by 1,2,3,4,5,6,7),
    per_item_all as (
      select a.dimension, a.item_code, coalesce(it.section,'') section, coalesce(it.stmt,'') stmt,
             coalesce(it.so,0) so, count(*) n, avg(a.score) mean,
             case when samp then stddev_samp(a.score) else stddev_pop(a.score) end sd
      from a left join it on it.set_code = a.set_code and it.item_code = a.item_code
      group by 1,2,3,4,5),
    per_target as (
      select a.dimension, coalesce(a.target_kind,'') tk, coalesce(a.target_name,'') tn,
             count(*) n, avg(a.score) mean,
             case when samp then stddev_samp(a.score) else stddev_pop(a.score) end sd
      from a where coalesce(a.target_name,'') <> '' group by 1,2,3),
    per_section as (
      select a.dimension, coalesce(a.target_kind,'') tk, coalesce(a.target_name,'') tn,
             coalesce(it.section,'') section, count(*) n, avg(a.score) mean,
             case when samp then stddev_samp(a.score) else stddev_pop(a.score) end sd
      from a left join it on it.set_code = a.set_code and it.item_code = a.item_code
      where coalesce(it.section,'') <> '' group by 1,2,3,4),
    per_dim as (
      select a.dimension, count(*) n, avg(a.score) mean,
             case when samp then stddev_samp(a.score) else stddev_pop(a.score) end sd
      from a group by 1),
    ov as (
      select count(*) n, avg(a.score) mean,
             case when samp then stddev_samp(a.score) else stddev_pop(a.score) end sd
      from a)
    select jsonb_build_object(
      'form_code', p_form, 'visible', true, 'released', v_released, 'n', n_resp, 'min', min_n,
      'sd_mode', coalesce(f.sd_mode,'sample'), 'mean_mode', coalesce(f.mean_mode,'item'), 'scope', 'all',
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'dimension',dimension,'target_kind',tk,'target_name',tn,'item_code',item_code,
          'section',section,'text',stmt,'n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
          order by dimension, tn, so, item_code),'[]'::jsonb) from per_item),
      'items_all', (select coalesce(jsonb_agg(jsonb_build_object(
          'dimension',dimension,'item_code',item_code,'section',section,'text',stmt,'n',n,
          'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
          order by dimension, so, item_code),'[]'::jsonb) from per_item_all),
      'targets', (select coalesce(jsonb_agg(jsonb_build_object(
          'dimension',dimension,'kind',tk,'name',tn,'n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
          order by dimension, mean desc),'[]'::jsonb) from per_target),
      'sections', (select coalesce(jsonb_agg(jsonb_build_object(
          'dimension',dimension,'kind',tk,'target_name',tn,'section',section,'n',n,
          'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
          order by dimension, tn, section),'[]'::jsonb) from per_section),
      'dimensions', (select coalesce(jsonb_agg(jsonb_build_object(
          'dimension',dimension,'n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
          order by dimension),'[]'::jsonb) from per_dim),
      'dimensions_all', (select coalesce(jsonb_agg(jsonb_build_object(
          'dimension',dimension,'n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4))
          order by dimension),'[]'::jsonb) from per_dim),
      'overall_item', (select jsonb_build_object('n',n,'mean',round(mean,4),'sd',round(coalesce(sd,0),4)) from ov),
      'overall_dim', (select jsonb_build_object('mean', round(avg(mean),4), 'k', count(*)) from per_dim)
    )
  );
end $function$;

-- ข้อเสนอแนะปลายเปิดของแบบประเมินหนึ่งวิชา
-- อาจารย์อ่านของตัวเองได้ต่อเมื่อส่งผลแล้ว และเปิดสวิตช์ show_comment_teacher ไว้
CREATE OR REPLACE FUNCTION public.ems_eval_comments(p_form text, p_teacher text DEFAULT NULL::text)
 RETURNS TABLE(dimension text, target_kind text, target_name text, item_code text, text_answer text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare
  f public.eval_form%rowtype;
  n_resp int; min_n int; me text;
  v_full boolean; v_own boolean;
begin
  select * into f from public.eval_form where form_code = p_form;
  if not found then return; end if;
  me := ems.my_name();

  v_full := ems.has_any_role(array['admin','academic','registrar','executive']);
  v_own  := (not v_full) and ems.has_any_role(array['teacher','classTeacher'])
            and coalesce(f.released,'') <> ''
            and coalesce(f.show_comment_teacher,'') <> ''
            and me <> '' and exists (
              select 1 from public.eval_target t
              where t.form_code = p_form and t.target_kind = 'teacher' and t.target_name = me);
  if not (v_full or v_own) then return; end if;

  select count(*) into n_resp
    from public.eval_response r where r.form_code = p_form and r.status = 'ส่งแล้ว';
  min_n := greatest(1, coalesce(nullif(f.min_respondents,'')::int, 5));
  if n_resp < min_n then return; end if;

  return query
    select x.dimension, coalesce(x.target_kind,''), coalesce(x.target_name,''),
           coalesce(x.item_code,''), x.text_answer
    from public.eval_answer x
    where x.form_code = p_form
      and x.text_answer is not null
      and btrim(x.text_answer) not in ('','-','_','.','..','...','ไม่มี','ไม่มีค่ะ','ไม่มีครับ')
      and (v_full or (x.dimension = 'teacher' and x.target_name = me))
    order by x.dimension, coalesce(x.target_name,''), x.id;
end $function$;

-- สรุปผลของ "อาจารย์หรือแหล่งฝึกรายหนึ่ง" ข้ามทุกรายวิชาในปี/ภาคที่เลือก
-- ใช้ในรายงานของผู้ดูแล/ทะเบียน/ผู้บริหาร — อาจารย์เรียกไม่ได้
CREATE OR REPLACE FUNCTION public.ems_eval_by_target(
  p_year text, p_sem text, p_kind text, p_target text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare
  v_full boolean;
begin
  v_full := ems.has_any_role(array['admin','academic','registrar','executive','deptHead']);
  if not v_full then return jsonb_build_object('error','forbidden'); end if;
  if coalesce(p_kind,'') not in ('teacher','site') then
    return jsonb_build_object('error','bad_kind');
  end if;

  return (
    with f as (
      select * from public.eval_form
      where coalesce(academic_year,'') = coalesce(p_year,'')
        and coalesce(semester,'')      = coalesce(p_sem,'')
    ),
    resp as (
      select r.form_code, count(*) n
      from public.eval_response r
      where r.status = 'ส่งแล้ว' group by 1
    ),
    a as (
      select x.* from public.eval_answer x
      join f on f.form_code = x.form_code
      where x.score is not null
        and coalesce(x.target_kind,'') = p_kind
        and coalesce(x.target_name,'') = coalesce(p_target,'')
    ),
    per_form as (
      select f.form_code, f.subject_code, f.subject_name, f.year_level, f.batch,
             f.course_type, f.coordinator,
             coalesce(resp.n,0) as n_resp,
             greatest(1, coalesce(nullif(f.min_respondents,'')::int, 5)) as min_n,
             count(a.id) as n,
             avg(a.score) as mean,
             case when coalesce(f.sd_mode,'sample') <> 'population'
                  then stddev_samp(a.score) else stddev_pop(a.score) end as sd
      from f
      left join resp on resp.form_code = f.form_code
      left join a on a.form_code = f.form_code
      group by f.form_code, f.subject_code, f.subject_name, f.year_level, f.batch,
               f.course_type, f.coordinator, resp.n, f.min_respondents, f.sd_mode
      having count(a.id) > 0
    ),
    ok as (select * from per_form where n_resp >= min_n),
    av as (select x.* from a x join ok on ok.form_code = x.form_code),
    -- แยกรายกลุ่มย่อย : นับผู้ตอบเฉพาะคนที่ประเมินเป้าหมายนี้ในกลุ่มนี้
    per_group as (
      select f.subject_code, f.subject_name, f.year_level,
             coalesce(a.target_group,'') as group_name,
             greatest(1, coalesce(nullif(f.min_respondents,'')::int, 5)) as min_n,
             count(distinct a.response_key) as n_resp,
             count(*) as n, avg(a.score) as mean,
             case when coalesce(f.sd_mode,'sample') <> 'population'
                  then stddev_samp(a.score) else stddev_pop(a.score) end as sd
      from a join f on f.form_code = a.form_code
      where coalesce(a.target_group,'') <> ''
      group by f.subject_code, f.subject_name, f.year_level,
               a.target_group, f.min_respondents, f.sd_mode
    ),
    per_section as (
      select coalesce(it.section,'') section, count(*) n, avg(av.score) mean,
             stddev_samp(av.score) sd
      from av
      left join (select set_code, item_code, max(section) section
                 from public.eval_item group by 1,2) it
        on it.set_code = av.set_code and it.item_code = av.item_code
      where coalesce(it.section,'') <> ''
      group by 1
    ),
    per_item as (
      select av.set_code, av.item_code, coalesce(it.section,'') section,
             coalesce(it.statement_th,'') text, min(it.sort_order) sort_order,
             count(*) n, avg(av.score) mean, stddev_samp(av.score) sd
      from av
      left join (select set_code, item_code, max(section) section,
                        max(statement_th) statement_th, min(sort_order) sort_order
                 from public.eval_item group by 1,2) it
        on it.set_code = av.set_code and it.item_code = av.item_code
      group by av.set_code, av.item_code, it.section, it.statement_th
    ),
    ov as (select count(*) n, avg(score) mean, stddev_samp(score) sd from av)
    select jsonb_build_object(
      'kind', p_kind, 'target', p_target, 'year', p_year, 'semester', p_sem,
      'rows', (select coalesce(jsonb_agg(jsonb_build_object(
          'form_code', form_code, 'subject_code', subject_code, 'subject_name', subject_name,
          'year_level', year_level, 'batch', batch, 'course_type', course_type,
          'coordinator', coordinator,
          'n_resp', n_resp, 'min', min_n,
          'visible', n_resp >= min_n,
          'n', case when n_resp >= min_n then n else 0 end,
          'mean', case when n_resp >= min_n then round(mean,4) else null end,
          'sd',   case when n_resp >= min_n then round(coalesce(sd,0),4) else null end)
          order by year_level, subject_code), '[]'::jsonb) from per_form),
      'groups', (select coalesce(jsonb_agg(jsonb_build_object(
          'subject_code', subject_code, 'subject_name', subject_name,
          'year_level', year_level, 'group_name', group_name,
          'n_resp', n_resp, 'min', min_n,
          'visible', n_resp >= min_n,
          'n', case when n_resp >= min_n then n else 0 end,
          'mean', case when n_resp >= min_n then round(mean,4) else null end,
          'sd',   case when n_resp >= min_n then round(coalesce(sd,0),4) else null end)
          order by year_level, subject_code, group_name), '[]'::jsonb) from per_group),
      'sections', (select coalesce(jsonb_agg(jsonb_build_object(
          'section', section, 'n', n, 'mean', round(mean,4), 'sd', round(coalesce(sd,0),4))
          order by section), '[]'::jsonb) from per_section),
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'item_code', item_code, 'section', section, 'text', text,
          'n', n, 'mean', round(mean,4), 'sd', round(coalesce(sd,0),4))
          order by sort_order nulls last, item_code), '[]'::jsonb) from per_item),
      'overall', (select jsonb_build_object(
          'n', coalesce(n,0), 'mean', round(mean,4), 'sd', round(coalesce(sd,0),4)) from ov),
      'courses', (select count(*) from ok),
      'hidden',  (select count(*) from per_form where n_resp < min_n)
    )
  );
end $function$;

-- ข้อเสนอแนะปลายเปิดที่เขียนถึงอาจารย์หรือแหล่งฝึกรายหนึ่ง รวมทุกรายวิชา
CREATE OR REPLACE FUNCTION public.ems_eval_comments_by_target(
  p_year text, p_sem text, p_kind text, p_target text)
 RETURNS TABLE(subject_code text, subject_name text, dimension text, item_code text, text_answer text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
begin
  if not ems.has_any_role(array['admin','academic','registrar','executive','deptHead']) then return; end if;
  if coalesce(p_kind,'') not in ('teacher','site') then return; end if;

  return query
    with f as (
      select ef.*, greatest(1, coalesce(nullif(ef.min_respondents,'')::int, 5)) as min_n,
             (select count(*) from public.eval_response r
               where r.form_code = ef.form_code and r.status = 'ส่งแล้ว') as n_resp
      from public.eval_form ef
      where coalesce(ef.academic_year,'') = coalesce(p_year,'')
        and coalesce(ef.semester,'')      = coalesce(p_sem,'')
    )
    select coalesce(f.subject_code,''), coalesce(f.subject_name,''),
           x.dimension, coalesce(x.item_code,''), x.text_answer
    from public.eval_answer x
    join f on f.form_code = x.form_code
    where f.n_resp >= f.min_n
      and coalesce(x.target_kind,'') = p_kind
      and coalesce(x.target_name,'') = coalesce(p_target,'')
      and x.text_answer is not null
      and btrim(x.text_answer) not in ('','-','_','.','..','...','ไม่มี','ไม่มีค่ะ','ไม่มีครับ')
    order by coalesce(f.subject_code,''), x.id;
end $function$;

-- ค่าเฉลี่ยรายกลุ่มย่อยของอาจารย์เจ้าตัว
-- คืนเฉพาะกลุ่มที่ตนสอน เฉพาะค่าเฉลี่ย และเฉพาะกลุ่มที่ผู้ตอบถึงเกณฑ์ขั้นต่ำ
CREATE OR REPLACE FUNCTION public.ems_eval_group_scores(p_form text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare
  f public.eval_form%rowtype;
  me text; min_n int; v_full boolean; v_own boolean;
begin
  select * into f from public.eval_form where form_code = p_form;
  if not found then return jsonb_build_object('error','not_found'); end if;

  me := ems.my_name();
  if coalesce(me,'') = '' then return jsonb_build_object('error','no_name'); end if;

  v_full := ems.has_any_role(array['admin','academic','registrar','executive','deptHead']);
  v_own  := (not v_full)
            and ems.has_any_role(array['teacher','classTeacher'])
            and coalesce(f.released,'') <> ''
            and exists (select 1 from public.eval_target t
                        where t.form_code = p_form
                          and t.target_kind = 'teacher' and t.target_name = me);
  if not (v_full or v_own) then return jsonb_build_object('error','forbidden'); end if;

  min_n := greatest(1, coalesce(nullif(f.min_respondents,'')::int, 5));

  return (
    with a as (
      select coalesce(x.target_group,'') grp, x.response_key, x.score
      from public.eval_answer x
      join public.eval_response r
        on r.response_key = x.response_key and r.status = 'ส่งแล้ว'
      where x.form_code = p_form
        and x.target_kind = 'teacher'
        and x.target_name = me
        and x.score is not null
    ),
    g as (
      select grp, count(distinct response_key) n_resp, count(*) n, avg(score) mean
      from a group by grp
    )
    select jsonb_build_object(
      'form_code', p_form, 'teacher', me, 'min', min_n,
      'released', coalesce(f.released,'') <> '',
      'rows', (select coalesce(jsonb_agg(jsonb_build_object(
          'group_name', grp,
          'n_resp', n_resp,
          'visible', n_resp >= min_n,
          'n', case when n_resp >= min_n then n else 0 end,
          'mean', case when n_resp >= min_n then round(mean,4) else null end)
          order by grp), '[]'::jsonb) from g)
    )
  );
end $function$;

-- นักศึกษาถามว่าตัวเองอยู่กลุ่มย่อยไหนของแบบประเมินไหน
-- ตอบเฉพาะกลุ่มของตัวเอง ไม่เห็นรายชื่อเพื่อนหรือกลุ่มอื่น
CREATE OR REPLACE FUNCTION public.ems_eval_my_groups()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
  select coalesce(jsonb_object_agg(g.form_code, g.group_name), '{}'::jsonb)
  from public.eval_group g
  where ems.my_student_id() is not null
    and ems.my_student_id() <> ''
    and position(',' || ems.my_student_id() || ','
                 in ',' || replace(coalesce(g.students, ''), ' ', '') || ',') > 0
$function$;

-- รายวิชาที่ตนเป็นผู้สอนหรือผู้ประสานงาน (ใช้ในหน้า "ผลประเมินของฉัน")
CREATE OR REPLACE FUNCTION public.ems_eval_my_forms()
 RETURNS TABLE(form_code text, academic_year text, semester text, subject_code text,
               subject_name text, status text, released text, released_at text,
               my_role text, n_submitted bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
  select f.form_code, f.academic_year, f.semester, f.subject_code, f.subject_name, f.status,
         coalesce(f.released,''), coalesce(f.released_at,''),
         case when coalesce(f.coordinator,'') = ems.my_name() then 'coordinator' else 'teacher' end,
         (select count(*) from public.eval_response r
           where r.form_code = f.form_code and r.status = 'ส่งแล้ว')
  from public.eval_form f
  where ems.has_any_role(array['teacher','classTeacher','admin','academic','registrar','executive'])
    and ems.my_name() <> ''
    and (coalesce(f.coordinator,'') = ems.my_name()
         or exists (select 1 from public.eval_target t
                     where t.form_code = f.form_code and t.target_kind = 'teacher'
                       and t.target_name = ems.my_name()))
  order by f.academic_year desc, f.semester desc, f.subject_code
$function$;

-- อัตราการตอบรายวิชา (ไม่บอกว่าใครตอบอะไร บอกแค่จำนวน)
CREATE OR REPLACE FUNCTION public.ems_eval_counts(p_year text, p_sem text)
 RETURNS TABLE(form_code text, n_submitted bigint, n_draft bigint, n_import bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
  select f.form_code,
         count(*) filter (where r.status = 'ส่งแล้ว'),
         count(*) filter (where coalesce(r.status,'') <> 'ส่งแล้ว'),
         count(*) filter (where coalesce(r.source,'') = 'import')
  from public.eval_form f
  left join public.eval_response r on r.form_code = f.form_code
  where f.academic_year = p_year and f.semester = p_sem
    and ems.has_any_role(array['admin','academic','registrar','executive','deptHead','teacher','classTeacher'])
  group by f.form_code
$function$;

-- รายชื่อผู้ที่ตอบแล้ว/ยังไม่ตอบ ใช้ติดตามให้ครบ — ไม่ผูกกับคำตอบรายข้อ
CREATE OR REPLACE FUNCTION public.ems_eval_respondents(p_form text)
 RETURNS TABLE(student_id text, status text, submitted_at text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
  select r.student_id, r.status, r.submitted_at
  from public.eval_response r
  where r.form_code = p_form
    and ems.has_any_role(array['admin','academic','registrar','executive','teacher','classTeacher'])
$function$;

-- ล้างคำตอบที่นำเข้าจากไฟล์เดิม (ไม่แตะคำตอบที่นักศึกษาตอบในระบบ)
CREATE OR REPLACE FUNCTION public.ems_eval_import_clear(p_form text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'ems'
AS $function$
declare n int;
begin
  if not ems.is_full() then return jsonb_build_object('error','forbidden'); end if;
  delete from public.eval_answer a
   using public.eval_response r
   where r.response_key = a.response_key and r.form_code = p_form and coalesce(r.source,'') = 'import';
  delete from public.eval_response r where r.form_code = p_form and coalesce(r.source,'') = 'import';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end $function$;

-- ---------------------------------------------------------------------------
-- จ. สิทธิ์การเรียกใช้
-- ---------------------------------------------------------------------------
-- ถอนจาก public และ anon ก่อนเสมอ แล้วค่อยให้เฉพาะผู้ที่ล็อกอินแล้ว
-- (ฟังก์ชันตรวจบทบาทในตัวอยู่แล้ว แต่ไม่มีเหตุผลให้เปิดประตูทิ้งไว้)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'ems\_%' and p.prokind = 'f'
       and p.proname not in ('ems_link_app_user_to_auth', 'ems_link_new_auth_user')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ฉ. ฟังก์ชันคำนวณรายงานที่ไม่ได้อยู่ในไฟล์นี้
-- ---------------------------------------------------------------------------
-- สามตัวนี้เป็นการคำนวณล้วน ๆ (ยาวมากและแก้บ่อยตามสูตรรายงาน)
-- ไม่ได้ตัดสินสิทธิ์อะไรเพิ่มจากที่ไฟล์นี้กำหนดไว้แล้ว
--   public.ems_plo_summary()   สรุปผล PLO รายหลักสูตร
--   public.ems_plo_student()   ผล PLO รายบุคคล
--   public.ems_eval_import()   นำเข้าคำตอบแบบประเมินจากไฟล์เดิม
-- ดึงตัวเต็มได้จาก 90_export.sql ส่วนที่ 3
