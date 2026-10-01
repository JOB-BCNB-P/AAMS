-- ============================================================
--  ภาระงานนักศึกษา — เพิ่ม "งานทะเบียน" เป็นผู้แก้ไขได้
--  ----------------------------------------------------------
--  ต้องรันไฟล์นี้ในหน้า Supabase > SQL Editor
--  มิฉะนั้นบัญชีงานทะเบียนจะเห็นช่องกรอกบนหน้าจอ แต่กดบันทึกแล้วไม่ผ่าน
--  เพราะฐานข้อมูลยังไม่รู้จักบทบาทนี้
--
--  สรุปสิทธิ์หลังรันไฟล์นี้
--    แก้ไขได้ : ผู้ดูแลระบบ · งานวิชาการ · งานทะเบียน · เจ้าหน้าที่งานอื่นๆ
--    อ่านได้   : เพิ่มผู้บริหารเข้ามาดูภาพรวม
--    นักศึกษา  : แก้ได้เฉพาะระเบียนของตัวเอง (นโยบาย wl_*_own ไม่ถูกแตะ)
--
--  รายชื่อบทบาทรวมไว้ที่ฟังก์ชันเดียว ของเดิมพิมพ์ซ้ำอยู่ 12 ที่
--  เพิ่มหรือลดบทบาททีหนึ่งต้องไล่แก้ครบทุกที่ ตกที่ใดที่หนึ่งจะเป็นช่องโหว่เงียบ ๆ
-- ============================================================

-- ---------- 1) ฟังก์ชันรวมรายชื่อบทบาท ----------
-- (สองฟังก์ชันนี้สร้างไว้ในฐานข้อมูลแล้ว รันซ้ำได้ไม่มีผลเสีย)
create or replace function ems.wl_can_edit() returns boolean
language sql stable security definer set search_path = ems, public, pg_temp as $$
  select ems.has_any_role(array['admin','academic','registrar','otherStaff']);
$$;

create or replace function ems.wl_can_read() returns boolean
language sql stable security definer set search_path = ems, public, pg_temp as $$
  select ems.has_any_role(array['admin','academic','registrar','executive','otherStaff']);
$$;

revoke execute on function ems.wl_can_edit() from public, anon;
revoke execute on function ems.wl_can_read() from public, anon;
grant  execute on function ems.wl_can_edit() to authenticated;
grant  execute on function ems.wl_can_read() to authenticated;

-- ---------- 2) แผนภาระงานของชั้นปี ----------
drop policy if exists wl_read   on public.workload_plan;
drop policy if exists wl_insert on public.workload_plan;
drop policy if exists wl_update on public.workload_plan;
drop policy if exists wl_delete on public.workload_plan;
create policy wl_read   on public.workload_plan for select to authenticated using (ems.wl_can_read());
create policy wl_insert on public.workload_plan for insert to authenticated with check (ems.wl_can_edit());
create policy wl_update on public.workload_plan for update to authenticated
  using (ems.wl_can_edit()) with check (ems.wl_can_edit());
create policy wl_delete on public.workload_plan for delete to authenticated using (ems.wl_can_edit());

-- ---------- 3) เกณฑ์หน่วยชั่วโมง ----------
drop policy if exists wl_read   on public.workload_rate;
drop policy if exists wl_insert on public.workload_rate;
drop policy if exists wl_update on public.workload_rate;
drop policy if exists wl_delete on public.workload_rate;
create policy wl_read   on public.workload_rate for select to authenticated using (ems.wl_can_read());
create policy wl_insert on public.workload_rate for insert to authenticated with check (ems.wl_can_edit());
create policy wl_update on public.workload_rate for update to authenticated
  using (ems.wl_can_edit()) with check (ems.wl_can_edit());
create policy wl_delete on public.workload_rate for delete to authenticated using (ems.wl_can_edit());

-- ---------- 4) ภาระงานรายบุคคล ----------
-- นโยบายของนักศึกษา (wl_read_own · wl_insert_own · wl_update_own) คงไว้เหมือนเดิม
-- จำกัดด้วย student_id = ems.my_student_id() จึงแตะของคนอื่นไม่ได้
drop policy if exists wl_read   on public.workload_student;
drop policy if exists wl_insert on public.workload_student;
drop policy if exists wl_update on public.workload_student;
drop policy if exists wl_delete on public.workload_student;
create policy wl_read   on public.workload_student for select to authenticated using (ems.wl_can_read());
create policy wl_insert on public.workload_student for insert to authenticated with check (ems.wl_can_edit());
create policy wl_update on public.workload_student for update to authenticated
  using (ems.wl_can_edit()) with check (ems.wl_can_edit());
create policy wl_delete on public.workload_student for delete to authenticated using (ems.wl_can_edit());

-- ---------- 5) ตัวตรวจภาระงานที่นักศึกษาบันทึกเอง ----------
-- เปลี่ยนเฉพาะบรรทัดแรกของฟังก์ชัน ให้ยกเว้นงานทะเบียนด้วย
-- มิฉะนั้นงานทะเบียนจะถูกตรวจเหมือนเป็นนักศึกษา แล้วเขียนไม่ผ่านทุกครั้ง
create or replace function ems.workload_student_guard() returns trigger
language plpgsql security definer set search_path = ems, public, pg_temp as $$
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
  mine       jsonb;
  e          jsonb;
  hrs        numeric;
begin
  -- เดิมเขียนรายชื่อบทบาทไว้ตรงนี้ ตอนนี้ใช้ฟังก์ชันร่วมกับนโยบายข้างบน
  if ems.wl_can_edit() then
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

    if not plan_found then
      official := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(v), '[]'::jsonb) into official
      from jsonb_array_elements(
             coalesce(nullif(to_jsonb(plan_rec) ->> fld, ''), '[]')::jsonb) v
      where ems.wl_applies(v, my_sid);
    end if;

    select coalesce(jsonb_agg(v), '[]'::jsonb) into mine
    from jsonb_array_elements(got) v
    where not ems.wl_is_self(v);

    if ems.wl_fingerprint(mine) <> ems.wl_fingerprint(official) then
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
end $$;

-- ---------- 6) ตรวจผลหลังรัน ----------
-- ควรได้ครบ 12 แถว และคอลัมน์ "ใช้ฟังก์ชันใหม่" เป็น true ทั้งหมด
select tablename as ตาราง, policyname as นโยบาย, cmd as คำสั่ง,
       (qual like '%wl_can_%' or with_check like '%wl_can_%') as ใช้ฟังก์ชันใหม่
from pg_policies
where schemaname = 'public'
  and tablename in ('workload_plan', 'workload_rate', 'workload_student')
  and policyname in ('wl_read', 'wl_insert', 'wl_update', 'wl_delete')
order by tablename, policyname;
