-- ============================================================================
-- 98b_grade77_preview.sql — ตรวจก่อนบันทึกผลการเรียน รุ่น 77 (ยังไม่แก้ข้อมูลจริง)
-- ----------------------------------------------------------------------------
-- ต้องรัน 98a_grade77_data.sql ก่อน
-- สร้างแผนการบันทึกไว้ใน ems._g77_plan / ems._g77_plan_student แล้วแสดงสรุป
--   • ข้ามนักศึกษาที่สถานะในระบบเป็น ลาออก / พ้นสภาพ / พักการเรียน
--   • ข้ามนักศึกษาที่ยังไม่มีในข้อมูลนักศึกษาของระบบ (แสดงรายชื่อให้ตรวจ)
--   • เกรดที่มีอยู่แล้ว (รหัสนักศึกษา + รหัสวิชา + ปี + ภาค ตรงกัน) → แก้แถวเดิม ไม่สร้างซ้ำ
--   • ชื่อวิชาใช้จาก "ข้อมูลหลักสูตร" ถ้ามีรหัสตรงกัน ไม่งั้นใช้ชื่อในไฟล์ Excel
-- รายละเอียดเพิ่มเติม:
--   select * from ems._g77_plan where action <> 'same';         -- รายการที่จะเพิ่ม/แก้
--   select * from ems._g77_plan_student where note <> '';        -- นักศึกษาที่ต้องดู
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run (รันซ้ำได้)
-- ============================================================================
create or replace function pg_temp.fv(j jsonb, k text) returns text language sql immutable as
$$ select nullif(btrim(coalesce(nullif(j->>k, ''), j->'extra'->>k)), '') $$;
create or replace function pg_temp.nc(x text) returns text language sql immutable as
$$ select lower(regexp_replace(coalesce(x, ''), '\s', '', 'g')) $$;
create or replace function pg_temp.sk(x text) returns text language sql immutable as
$$ select case when coalesce(x, '') ~ 'ร้อน' or btrim(coalesce(x, '')) = '3' then '3'
               else nullif(regexp_replace(coalesce(x, ''), '\D', '', 'g'), '') end $$;

do $$ begin
  if to_regclass('ems._g77_grade') is null then raise exception 'ยังไม่มีข้อมูล — รัน 98a_grade77_data.sql ก่อน'; end if;
end $$;

-- นักศึกษา
drop table if exists ems._g77_plan_student;
create table ems._g77_plan_student as
select g.*, s.id as row_id, s.status, s.honors_old,
       case when s.id is null then 'ไม่พบในข้อมูลนักศึกษาของระบบ — ข้าม'
            when coalesce(s.status, '') ~ '(ลาออก|พ้นสภาพ|พักการเรียน)' then 'สถานะ ' || s.status || ' — ข้าม'
            when abs(g.gpax_calc - g.gpax_file) >= 0.005
                 and (case when round(g.gpax_calc, 2) >= 3.60 then 'อันดับ 1' when round(g.gpax_calc, 2) >= 3.25 then 'อันดับ 2' else '' end)
                     <> g.honors_file
                 and not exists (select 1 from ems._g77_grade x where x.student_id = g.student_id and x.grade in ('D+', 'D', 'F'))
              then 'GPAX ในไฟล์ ' || round(g.gpax_file, 2) || ' แต่คำนวณจากเกรด = ' || round(g.gpax_calc, 2) || ' — ระดับเกียรตินิยมอาจต่างจากไฟล์ (บันทึกตามไฟล์)'
            when coalesce(s.honors_old, '') <> '' and g.honors = '' then 'ในระบบมีเกียรตินิยมเดิม "' || s.honors_old || '" แต่ไฟล์ไม่ได้ — ไม่แตะค่าเดิม'
            else '' end as note,
       (s.id is not null and coalesce(s.status, '') !~ '(ลาออก|พ้นสภาพ|พักการเรียน)') as ok
from ems._g77_student g
left join lateral (
  select (j->>'id')::bigint id, pg_temp.fv(j, 'status') status, pg_temp.fv(j, 'honors') honors_old
  from (select to_jsonb(x) j from public.student x) y
  where pg_temp.fv(j, 'student_id') = g.student_id
  order by (j->>'id')::bigint limit 1
) s on true;

-- เกรดเดิมของนักศึกษากลุ่มนี้
drop table if exists ems._g77_old;
create table ems._g77_old as
select (j->>'id')::bigint id, pg_temp.fv(j, 'student_id') sid, pg_temp.nc(pg_temp.fv(j, 'subject_code')) code,
       pg_temp.fv(j, 'academic_year') yr, pg_temp.sk(pg_temp.fv(j, 'semester')) sem,
       pg_temp.fv(j, 'grade') grade, pg_temp.fv(j, 'credits') credits
from (select to_jsonb(x) j from public.grade x) y
where pg_temp.fv(j, 'student_id') in (select student_id from ems._g77_student);

-- ชื่อวิชาจากข้อมูลหลักสูตร
drop table if exists ems._g77_cname;
create table ems._g77_cname as
select distinct on (code) code, name_th from (
  select pg_temp.nc(pg_temp.fv(j, 'course_code')) code, pg_temp.fv(j, 'name_th') name_th, pg_temp.fv(j, 'curriculum_year') cy
  from (select to_jsonb(c) j from public.curriculum_course c) x
) y where code <> '' and name_th is not null
order by code, (cy = '2565') desc, cy desc;

-- แผน
drop table if exists ems._g77_plan;
create table ems._g77_plan as
select g.student_id, c.code, coalesce(cn.name_th, c.name_th) as subject_name, c.credits, g.grade, g.semester, g.academic_year,
       o.id as old_id, o.grade as old_grade, o.credits as old_credits, (cn.code is not null) as in_curriculum,
       case when o.id is null then 'insert'
            when coalesce(o.grade, '') <> g.grade
              or coalesce(nullif(regexp_replace(coalesce(o.credits, ''), '[^0-9.]', '', 'g'), '')::numeric, -1) <> c.credits then 'update'
            else 'same' end as action
from ems._g77_grade g
join ems._g77_course c on c.code = g.code
join ems._g77_plan_student ps on ps.student_id = g.student_id and ps.ok
left join ems._g77_cname cn on cn.code = pg_temp.nc(c.code)
left join lateral (
  select * from ems._g77_old o
  where o.sid = g.student_id and o.code = pg_temp.nc(g.code) and o.yr = g.academic_year and o.sem = g.semester
  order by (o.grade is null) desc, o.id limit 1
) o on true;

-- ---------------------------------------------------------------------------
-- สรุปผลตรวจ
-- ---------------------------------------------------------------------------
select * from (
  select 1 as "ลำดับ", 'นักศึกษาในไฟล์ (ผู้สำเร็จการศึกษา)' as "หัวข้อ", count(*)::text as "จำนวน", '' as "รายละเอียด" from ems._g77_plan_student
  union all
  select 2, 'นักศึกษาที่จะบันทึก', count(*)::text, '' from ems._g77_plan_student where ok
  union all
  select 3, 'ข้าม: ไม่พบในระบบ / ลาออก / พ้นสภาพ', count(*)::text,
         coalesce(string_agg(student_id || ' ' || name || ' (' || note || ')', ' · '), '') from ems._g77_plan_student where not ok
  union all
  select 4, 'เกรด: เพิ่มใหม่', count(*)::text, '' from ems._g77_plan where action = 'insert'
  union all
  select 5, 'เกรด: แก้แถวเดิม (เกรดว่าง/ต่าง หรือหน่วยกิตต่าง)', count(*)::text,
         coalesce(string_agg(case when old_grade is not null and old_grade <> grade then student_id || ' ' || code || ' ' || old_grade || '→' || grade end, ' · '), '')
    from ems._g77_plan where action = 'update'
  union all
  select 6, 'เกรด: ตรงกันแล้ว (ข้าม)', count(*)::text, '' from ems._g77_plan where action = 'same'
  union all
  select 7, 'รายวิชาที่ไม่พบรหัสใน "ข้อมูลหลักสูตร" (ใช้ชื่อจาก Excel)', count(distinct code)::text,
         coalesce(string_agg(distinct code || ' ' || subject_name, ' · '), '') from ems._g77_plan where not in_curriculum
  union all
  select 8, 'เกียรตินิยมที่จะบันทึก', count(*)::text,
         'อันดับ 1 = ' || count(*) filter (where honors = 'อันดับ 1') || ' · อันดับ 2 = ' || count(*) filter (where honors = 'อันดับ 2')
    from ems._g77_plan_student where ok and honors <> ''
  union all
  select 9, 'ไม่ได้รับเกียรตินิยม เพราะมีเกรดต่ำกว่า C (คอลัมน์ "ไม่ได้" ในไฟล์)', count(*)::text, '' from ems._g77_plan_student where honors_blocked
  union all
  select 10, 'ควรตรวจ', count(*)::text, coalesce(string_agg(student_id || ' ' || name || ': ' || note, ' · '), '')
    from ems._g77_plan_student where ok and note <> ''
) r order by 1;
