-- ============================================================================
-- 96_credit_sync_apply.sql — แก้หน่วยกิตและประเภทรายวิชาตามแผนจาก 96_credit_sync_preview.sql
-- ----------------------------------------------------------------------------
-- ต้องรัน 96_credit_sync_preview.sql และตรวจผลก่อน (ไฟล์นี้ใช้ตาราง _fix_credit_subject / _fix_credit_grade)
--   • สำรองแถวเดิมไว้ใน _bak_subject_credit / _bak_grade_credit ก่อนแก้ (สำรองครั้งแรกเท่านั้น รันซ้ำไม่ทับ)
--   • แก้เฉพาะช่องที่หลักสูตรมีค่า — ช่องที่หลักสูตรว่างคงค่าเดิม
--   • รองรับทั้งกรณีเก็บเป็นคอลัมน์จริง และเก็บใน extra
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run · ตารางท้ายไฟล์คือจำนวนที่แก้
-- ย้อนกลับ: ดูคำสั่งท้ายไฟล์ (ใส่เครื่องหมาย -- ไว้)
-- ============================================================================
do $$
declare
  f record;
  v_type text;
  v_n int;
begin
  if to_regclass('ems._fix_credit_subject') is null or to_regclass('ems._fix_credit_grade') is null then
    raise exception 'ยังไม่มีแผนการแก้ — รัน 96_credit_sync_preview.sql ก่อน';
  end if;

  -- สำรอง
  if to_regclass('ems._bak_subject_credit') is null then
    create table ems._bak_subject_credit as
      select now() as backup_at, s.* from public.subject s where s.id in (select id from ems._fix_credit_subject);
  else
    insert into ems._bak_subject_credit
      select now(), s.* from public.subject s
       where s.id in (select id from ems._fix_credit_subject)
         and s.id not in (select id from ems._bak_subject_credit);
  end if;
  if to_regclass('ems._bak_grade_credit') is null then
    create table ems._bak_grade_credit as
      select now() as backup_at, g.* from public.grade g where g.id in (select id from ems._fix_credit_grade);
  else
    insert into ems._bak_grade_credit
      select now(), g.* from public.grade g
       where g.id in (select id from ems._fix_credit_grade)
         and g.id not in (select id from ems._bak_grade_credit);
  end if;

  -- subject : ช่อง → คอลัมน์ในแผน
  for f in select * from (values ('credits', 'new_cr'), ('hours_theory', 'new_ht'), ('hours_lab', 'new_hl'),
                                 ('hours_self', 'new_hs'), ('theory_practice', 'new_type')) t(col, pcol)
  loop
    select format_type(a.atttypid, a.atttypmod) into v_type
      from pg_attribute a
     where a.attrelid = 'public.subject'::regclass and a.attname = f.col and a.attnum > 0 and not a.attisdropped;
    if v_type is not null then
      execute format('update public.subject t set %I = p.%I::%s from ems._fix_credit_subject p where t.id = p.id and p.%I is not null',
                     f.col, f.pcol, v_type, f.pcol);
    else
      execute format('update public.subject t set extra = coalesce(t.extra, ''{}''::jsonb) || jsonb_build_object(%L, p.%I::text) '
                     || 'from ems._fix_credit_subject p where t.id = p.id and p.%I is not null', f.col, f.pcol, f.pcol);
    end if;
    get diagnostics v_n = row_count;
    raise notice 'subject.% : % แถว', f.col, v_n;
  end loop;

  -- grade : credits
  select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a
   where a.attrelid = 'public.grade'::regclass and a.attname = 'credits' and a.attnum > 0 and not a.attisdropped;
  if v_type is not null then
    execute format('update public.grade t set credits = p.new_cr::%s from ems._fix_credit_grade p where t.id = p.id', v_type);
  else
    update public.grade t set extra = coalesce(t.extra, '{}'::jsonb) || jsonb_build_object('credits', p.new_cr::text)
      from ems._fix_credit_grade p where t.id = p.id;
  end if;
  get diagnostics v_n = row_count;
  raise notice 'grade.credits : % แถว', v_n;
end $$;

-- ผลลัพธ์
select 'รายวิชาที่เปิดสอน' as "ตาราง", count(*) as "แถวที่แก้" from ems._fix_credit_subject
union all
select 'ผลการเรียน', count(*) from ems._fix_credit_grade;

-- ---------------------------------------------------------------------------
-- ย้อนกลับ (ถ้าจำเป็น) — เอาเครื่องหมาย -- ออกแล้วรันเฉพาะส่วนนี้
-- ---------------------------------------------------------------------------
-- update public.subject t set credits = b.credits, hours_theory = b.hours_theory, hours_lab = b.hours_lab,
--        hours_self = b.hours_self, theory_practice = b.theory_practice, extra = b.extra
--   from ems._bak_subject_credit b where t.id = b.id;
-- update public.grade t set credits = b.credits, extra = b.extra from ems._bak_grade_credit b where t.id = b.id;
--
-- ลบตารางชั่วคราวเมื่อตรวจเรียบร้อยแล้ว
-- drop table if exists ems._fix_credit_cfg, ems._fix_credit_cc, ems._fix_credit_sj, ems._fix_credit_subject,
--   ems._fix_credit_nomatch, ems._fix_credit_grade, ems._bak_subject_credit, ems._bak_grade_credit;
