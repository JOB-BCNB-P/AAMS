-- ============================================================================
-- 98c_grade77_apply.sql — บันทึกผลการเรียนและเกียรตินิยม รุ่น 77 ตามแผนจาก 98b
-- ----------------------------------------------------------------------------
-- ต้องรัน 98a และ 98b แล้วตรวจผลก่อน
--   • สำรองแถวเดิมที่จะถูกแก้ไว้ใน ems._bak_g77_grade / ems._bak_g77_student
--   • เพิ่มเกรดใหม่ / แก้เกรดเดิมตามแผน · ไม่ลบแถวใด ๆ
--   • บันทึกเกียรตินิยม ("อันดับ 1" / "อันดับ 2") เฉพาะผู้ที่ได้ — คนที่ไม่ได้ ไม่แตะค่าเดิม
--   • รองรับทั้งกรณีเก็บเป็นคอลัมน์จริง และเก็บใน extra
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run · ตารางท้ายไฟล์คือจำนวนที่บันทึก
-- ย้อนกลับ: ดูคำสั่งท้ายไฟล์
-- ============================================================================
do $$
declare
  f record; v_type text; v_cols text := ''; v_vals text := ''; v_extra text := ''; v_n int;
  m_extra boolean;
begin
  if to_regclass('ems._g77_plan') is null then raise exception 'ยังไม่มีแผน — รัน 98b_grade77_preview.sql ก่อน'; end if;

  -- สำรอง (ครั้งแรกเท่านั้น)
  if to_regclass('ems._bak_g77_grade') is null then
    create table ems._bak_g77_grade as select now() as backup_at, g.* from public.grade g
      where g.id in (select old_id from ems._g77_plan where action = 'update');
  end if;
  if to_regclass('ems._bak_g77_student') is null then
    create table ems._bak_g77_student as select now() as backup_at, s.* from public.student s
      where s.id in (select row_id from ems._g77_plan_student where ok and honors <> '');
  end if;

  -- ---------- เพิ่มเกรดใหม่ ----------
  for f in select * from (values
      ('student_id', 'p.student_id'), ('subject_code', 'p.code'), ('subject_name', 'p.subject_name'),
      ('grade', 'p.grade'), ('credits', 'p.credits::text'), ('semester', 'p.semester'),
      ('academic_year', 'p.academic_year')) t(col, expr)
  loop
    select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
     where a.attrelid = 'public.grade'::regclass and a.attname = f.col and a.attnum > 0 and not a.attisdropped;
    if v_type is not null then
      v_cols := v_cols || format('%I, ', f.col);
      v_vals := v_vals || format('(%s)::%s, ', f.expr, v_type);
    else
      v_extra := v_extra || format('%L, %s, ', f.col, f.expr);
    end if;
  end loop;
  m_extra := exists (select 1 from pg_attribute where attrelid = 'public.grade'::regclass and attname = 'extra' and not attisdropped);
  if exists (select 1 from pg_attribute where attrelid = 'public.grade'::regclass and attname = 'created_at' and not attisdropped) then
    v_cols := v_cols || 'created_at, '; v_vals := v_vals || 'now(), ';
  end if;
  if m_extra then
    v_cols := v_cols || 'extra, ';
    v_vals := v_vals || case when v_extra = '' then '''{}''::jsonb, ' else 'jsonb_build_object(' || left(v_extra, length(v_extra) - 2) || '), ' end;
  end if;
  execute format('insert into public.grade (%s) select %s from ems._g77_plan p where p.action = ''insert''',
                 left(v_cols, length(v_cols) - 2), left(v_vals, length(v_vals) - 2));
  get diagnostics v_n = row_count;
  raise notice 'เพิ่มเกรดใหม่ %', v_n;

  -- ---------- แก้เกรดเดิม ----------
  for f in select * from (values ('grade', 'p.grade'), ('credits', 'p.credits::text'), ('subject_name', 'p.subject_name')) t(col, expr)
  loop
    select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
     where a.attrelid = 'public.grade'::regclass and a.attname = f.col and a.attnum > 0 and not a.attisdropped;
    if v_type is not null then
      execute format('update public.grade t set %I = (%s)::%s from ems._g77_plan p where p.action = ''update'' and t.id = p.old_id', f.col, f.expr, v_type);
    elsif m_extra then
      execute format('update public.grade t set extra = coalesce(t.extra, ''{}''::jsonb) || jsonb_build_object(%L, %s) from ems._g77_plan p where p.action = ''update'' and t.id = p.old_id', f.col, f.expr);
    end if;
  end loop;
  select count(*) into v_n from ems._g77_plan where action = 'update';
  raise notice 'แก้เกรดเดิม %', v_n;

  -- ---------- เกียรตินิยม ----------
  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'public.student'::regclass and a.attname = 'honors' and a.attnum > 0 and not a.attisdropped;
  if v_type is not null then
    execute format('update public.student t set honors = p.honors::%s from ems._g77_plan_student p where p.ok and p.honors <> '''' and t.id = p.row_id', v_type);
  else
    update public.student t set extra = coalesce(t.extra, '{}'::jsonb) || jsonb_build_object('honors', p.honors)
      from ems._g77_plan_student p where p.ok and p.honors <> '' and t.id = p.row_id;
  end if;
  get diagnostics v_n = row_count;
  raise notice 'บันทึกเกียรตินิยม % คน', v_n;
end $$;

-- ผลลัพธ์
select 'เกรดเพิ่มใหม่' as "รายการ", count(*) as "จำนวน" from ems._g77_plan where action = 'insert'
union all select 'เกรดแก้แถวเดิม', count(*) from ems._g77_plan where action = 'update'
union all select 'เกรดตรงกันแล้ว (ไม่แตะ)', count(*) from ems._g77_plan where action = 'same'
union all select 'บันทึกเกียรตินิยม (คน)', count(*) from ems._g77_plan_student where ok and honors <> '';

-- ---------------------------------------------------------------------------
-- ย้อนกลับ (ถ้าจำเป็น) — เอาเครื่องหมาย -- ออกแล้วรันเฉพาะส่วนนี้
-- ---------------------------------------------------------------------------
-- delete from public.grade g using ems._g77_plan p
--  where p.action = 'insert' and g.student_id = p.student_id and g.subject_code = p.code
--    and g.academic_year = p.academic_year and g.semester = p.semester;      -- ลบเฉพาะแถวที่เพิ่มรอบนี้
-- update public.grade t set grade = b.grade, credits = b.credits, subject_name = b.subject_name, extra = b.extra
--   from ems._bak_g77_grade b where t.id = b.id;
-- update public.student t set honors = b.honors, extra = b.extra from ems._bak_g77_student b where t.id = b.id;
--
-- ลบตารางพักเมื่อตรวจเรียบร้อยแล้ว
-- drop table if exists ems._g77_grade, ems._g77_course, ems._g77_student, ems._g77_plan, ems._g77_plan_student,
--   ems._g77_old, ems._g77_cname, ems._bak_g77_grade, ems._bak_g77_student;
