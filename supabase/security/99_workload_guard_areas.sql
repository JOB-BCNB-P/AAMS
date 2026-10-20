-- ================================================================
-- 99_workload_guard_areas.sql
-- ขั้น 0 : แก้ตัวตรวจภาระงานนักศึกษาที่บล็อกการบันทึกของนักศึกษา
-- ขั้น 1 : เจ้าหน้าที่อื่นๆ ต้องได้รับมอบหมายด้านก่อน จึงจะบันทึกได้
--
-- รันครั้งเดียว ปลอดภัยต่อการรันซ้ำ (create or replace ทั้งหมด)
-- ไม่แตะข้อมูลในตารางใด ๆ เปลี่ยนเฉพาะฟังก์ชัน
-- ================================================================

-- ----------------------------------------------------------------
-- ขั้น 0 : ตัวตรวจ workload_student
--
-- ปัญหาเดิม
--   ตัวตรวจเทียบ "รายการที่วิทยาลัยกำหนด" กับแผนของชั้นปี (workload_plan)
--   เท่านั้น แต่เจ้าหน้าที่บันทึกรายการลงระเบียนรายบุคคลได้โดยตรง
--   (การบันทึกแบบกลุ่ม) รายการเหล่านั้นไม่มีในแผน ตัวตรวจจึงสรุปว่า
--   นักศึกษาไปแก้ของวิทยาลัย แล้วปฏิเสธการบันทึกทั้งแถว
--   ผลคือนักศึกษาบันทึกได้เฉพาะด้านที่ไม่มีใครเคยเขียนทับไว้
--   (ตรวจพบ 63 ระเบียนติดที่ด้านกิจการนักศึกษา และ 11 ที่ด้านบริการวิชาการ)
--
-- กติกาใหม่ — ความหมายที่ถูกต้องคือ
--   "นักศึกษาห้ามแก้หรือลบรายการที่คนอื่นบันทึก" ไม่ว่าคนนั้นจะเขียนลงแผน
--   ของชั้นปีหรือลงระเบียนรายบุคคล ฐานเปรียบเทียบจึงเป็น
--     - ถ้าช่องนั้นมีข้อมูลเก็บไว้แล้ว  -> รายการที่ไม่ใช่ของนักศึกษาเองในข้อมูลเดิม
--     - ถ้าช่องนั้นยังว่าง             -> รายการในแผนชั้นปีที่มีผลกับนักศึกษาคนนี้
--   และช่องที่ยังว่างอยู่ทั้งก่อนและหลัง ถือว่า "ใช้ตามแผนชั้นปี"
--   ไม่ใช่การลบรายการของวิทยาลัยทิ้ง
--
-- สิ่งที่ยังกันไว้เหมือนเดิมทุกประการ
--   - บันทึกภาระงานของนักศึกษารายอื่นไม่ได้
--   - ด้านวิชาการ (teaching_json) ถูกล้างทิ้งเสมอ นักศึกษาแตะไม่ได้
--   - ชั้นปียึดตามทะเบียน ไม่ใช่ค่าที่ส่งมา
--   - รายการที่บันทึกเองต้องมีชื่อ และชั่วโมงต้องอยู่ระหว่าง 0 ถึง 744
--   - จำกัด 200 รายการต่อด้าน
-- ----------------------------------------------------------------
create or replace function ems.workload_student_guard() returns trigger
  language plpgsql
  security definer
  set search_path to 'ems', 'public', 'pg_temp'
as $function$
declare
  my_sid     text;
  lvl        text;
  plan_rec   public.workload_plan%rowtype;
  plan_found boolean := false;
  fld        text;
  flds       text[] := array['research_json', 'service_json', 'student_json', 'personal_json'];
  nm         text;
  nms        text[] := array['พันธกิจด้านวิจัย', 'พันธกิจด้านบริการวิชาการ', 'พันธกิจด้านกิจการนักศึกษา', 'การใช้ชีวิตส่วนตัว'];
  i          int;
  got        jsonb;
  official   jsonb;
  base       jsonb;
  mine       jsonb;
  e          jsonb;
  hrs        numeric;
  old_raw    text;
  was_stored boolean;
begin
  if ems.has_any_role(array['admin', 'academic', 'otherStaff']) then
    return new;
  end if;

  my_sid := ems.my_student_id();
  if coalesce(my_sid, '') = '' or new.student_id is distinct from my_sid then
    raise exception 'บันทึกภาระงานของนักศึกษารายอื่นไม่ได้';
  end if;

  select s.year_level into lvl from public.student s where s.student_id = my_sid limit 1;
  if coalesce(lvl, '') <> '' then new.year_level := lvl; end if;

  new.teaching_json := null;

  select * into plan_rec from public.workload_plan p
   where p.academic_year = new.academic_year
     and p.year_level    = new.year_level
     and p.semester      = new.semester
   limit 1;
  plan_found := found;

  for i in 1 .. array_length(flds, 1) loop
    fld := flds[i];
    nm  := nms[i];

    begin
      got := coalesce(nullif(to_jsonb(new) ->> fld, ''), '[]')::jsonb;
    exception when others then
      raise exception 'ข้อมูล % ไม่ใช่รูปแบบที่ระบบรองรับ', nm;
    end;
    if jsonb_typeof(got) <> 'array' then
      raise exception 'ข้อมูล % ต้องเป็นรายการ', nm;
    end if;
    if jsonb_array_length(got) > 200 then
      raise exception '% มีรายการมากเกินไป', nm;
    end if;

    -- รายการในแผนของชั้นปีที่มีผลกับนักศึกษาคนนี้
    if not plan_found then
      official := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(v), '[]'::jsonb) into official
      from jsonb_array_elements(
             coalesce(nullif(to_jsonb(plan_rec) ->> fld, ''), '[]')::jsonb) v
      where ems.wl_applies(v, my_sid);
    end if;

    -- ข้อมูลเดิมของช่องนี้ (มีเฉพาะตอนแก้ไขระเบียนที่มีอยู่แล้ว)
    old_raw    := case when tg_op = 'UPDATE'
                       then coalesce(btrim(to_jsonb(old) ->> fld), '') else '' end;
    was_stored := old_raw not in ('', '[]');

    -- ยังไม่เคยเก็บอะไรไว้ และยังไม่ส่งอะไรมา = ใช้ตามแผนชั้นปี ไม่ต้องตรวจ
    if jsonb_array_length(got) = 0 and not was_stored then
      continue;
    end if;

    if was_stored then
      select coalesce(jsonb_agg(v), '[]'::jsonb) into base
      from jsonb_array_elements(old_raw::jsonb) v
      where not ems.wl_is_self(v);
    else
      base := official;
    end if;

    select coalesce(jsonb_agg(v), '[]'::jsonb) into mine
    from jsonb_array_elements(got) v
    where not ems.wl_is_self(v);

    if ems.wl_fingerprint(mine) <> ems.wl_fingerprint(base) then
      raise exception 'แก้ไขหรือลบรายการที่วิทยาลัยกำหนดใน % ไม่ได้', nm;
    end if;

    for e in select v from jsonb_array_elements(got) v where ems.wl_is_self(v) loop
      if coalesce(btrim(e ->> 'name'), '') = '' then
        raise exception 'รายการที่บันทึกเองใน % ต้องมีชื่อรายการ', nm;
      end if;
      begin
        hrs := (e ->> 'hours')::numeric;
      exception when others then
        hrs := null;
      end;
      if hrs is null or hrs <= 0 or hrs > 744 then
        raise exception 'จำนวนชั่วโมงของ "%" ใน % ไม่ถูกต้อง', coalesce(e ->> 'name', ''), nm;
      end if;
    end loop;
  end loop;

  return new;
end $function$;

revoke execute on function ems.workload_student_guard() from public, anon;

-- ----------------------------------------------------------------
-- ขั้น 1 : เจ้าหน้าที่อื่นๆ ต้องได้รับมอบหมายด้านก่อน
--
-- ของเดิม : ไม่ระบุด้าน = บันทึกได้ทั้ง 4 ด้าน (อนุญาตโดยปริยาย)
-- ของใหม่ : ไม่ระบุด้าน = บันทึกไม่ได้เลย (ปฏิเสธโดยปริยาย)
--
-- ผู้ใช้ปัจจุบันระบุด้านไว้ครบทุกคนแล้ว จึงไม่มีใครเสียสิทธิ์จากการแก้นี้
-- แต่บัญชีเจ้าหน้าที่อื่นๆ ที่สร้างใหม่ จะต้องถูกกำหนดด้านก่อนเสมอ
-- กำหนดได้ที่ ตั้งค่า > ผู้ใช้งาน > แก้ไข > พันธกิจภาระงานที่รับผิดชอบ
-- ----------------------------------------------------------------
create or replace function ems.workload_missions() returns text[]
  language sql
  stable security definer
  set search_path to 'public'
as $function$
  select coalesce((
    select array_agg(v.x)
    from unnest(string_to_array(coalesce(u.extra ->> 'workload_missions', ''), ',')) t(x0)
    cross join lateral (select btrim(x0)) v(x)
    where v.x in ('service', 'research', 'student', 'personal')
  ), '{}'::text[])
  from public.app_user u
  where u.auth_user_id = auth.uid()
  limit 1
$function$;

revoke execute on function ems.workload_missions() from public, anon;

-- ----------------------------------------------------------------
-- ขั้น 0 (เพิ่มเติม) : ปลดบล็อกที่ตัวตรวจของเจ้าหน้าที่
--
-- พบระหว่างทดสอบ : ems.workload_guard() ซึ่งติดอยู่บนทั้ง workload_plan
-- และ workload_student ปฏิเสธทุกคนที่ไม่ใช่ admin / academic / otherStaff
-- จึงรวมถึงนักศึกษาด้วย และ trigger ตัวนี้ทำงานก่อน workload_student_guard
-- (เรียงตามชื่อ trg_... มาก่อน workload_...) นักศึกษาจึงบันทึกภาระงาน
-- ของตัวเองไม่ได้เลยแม้แต่ด้านเดียว — ยืนยันจากข้อมูลจริง : ไม่มีรายการที่
-- ติดธง self แม้แต่รายการเดียวในฐานข้อมูล
--
-- แก้โดยให้นักศึกษาผ่าน trigger นี้เฉพาะตาราง workload_student แล้วส่งต่อให้
-- ems.workload_student_guard() ตรวจตามกติกาของนักศึกษา
-- ที่ตาราง workload_plan นักศึกษายังถูกปฏิเสธเหมือนเดิม
-- ----------------------------------------------------------------
create or replace function ems.workload_guard() returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'ems'
as $function$
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

  -- นักศึกษาบันทึกภาระงานของตัวเอง ส่งต่อให้ ems.workload_student_guard() ตรวจ
  if tg_table_name = 'workload_student'
     and ems.has_any_role(array['student'])
     and coalesce(ems.my_student_id(), '') <> '' then
    return new;
  end if;

  if not ems.has_any_role(array['otherStaff']) then
    raise exception 'บัญชีของคุณไม่มีสิทธิ์แก้ไขภาระงานนักศึกษา';
  end if;

  -- การเรียนการสอนสงวนไว้เสมอ ส่วนที่เหลือดูจากที่ได้รับมอบหมาย
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

revoke execute on function ems.workload_guard() from public, anon;
