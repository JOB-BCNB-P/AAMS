-- ============================================================================
-- 96_credit_sync_preview.sql — ตรวจหน่วยกิตและประเภทรายวิชา รุ่น 78–81 เทียบกับ "ข้อมูลหลักสูตร"
-- ----------------------------------------------------------------------------
-- ไฟล์นี้ "ยังไม่แก้ข้อมูลจริง" — สร้างตารางแผนการแก้ไว้ให้ตรวจก่อน แล้วค่อยรัน 96_credit_sync_apply.sql
--
-- สิ่งที่เทียบ (ต้นทาง = curriculum_course ของหลักสูตรฉบับที่รายวิชานั้นใช้)
--   รายวิชาที่เปิดสอน (subject)  : credits · hours_theory · hours_lab · hours_self · theory_practice (ประเภท)
--   ผลการเรียน (grade)          : credits  ← ใช้คิด GPA ใบระเบียน และหน้าที่ปรึกษา
--   หน้าอื่น ๆ (ติดตามการส่ง ประเมินรายวิชา PLO) อ่านหน่วยกิตจาก subject จึงตรงตามไปเอง
--
-- ประเภทรายวิชา คิดจากชั่วโมงต่อภาคในหลักสูตร (term_theory / term_lab / term_practice)
--   มีชั่วโมงฝึกปฏิบัติ อย่างเดียว     → ปฏิบัติ
--   มีชั่วโมงฝึกปฏิบัติ + ทฤษฎี/ทดลอง  → ทฤษฎีและปฏิบัติ
--   มีชั่วโมงทดลอง                  → ทฤษฎีและทดลอง
--   มีแต่ทฤษฎี                       → ทฤษฎี
--   หลักสูตรไม่มีข้อมูลชั่วโมงต่อภาค     → ไม่แตะประเภทเดิม
--
-- หลักสูตรที่ใช้: ฉบับตาม curriculum_year ของรายวิชา → ถ้าว่าง/ไม่พบ ใช้ 2565 → ถ้ายังไม่พบ ใช้ฉบับล่าสุดที่มีรหัสนั้น
-- จับคู่รหัสวิชาแบบไม่สนช่องว่างและตัวพิมพ์ (NSBS 101 = nsbs101)
--
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run (รันซ้ำได้)
--   ตารางผลลัพธ์ท้ายไฟล์ = รายการที่จะถูกแก้ · ดูรายวิชาที่หาในหลักสูตรไม่พบได้ที่ ems._fix_credit_nomatch
-- อยากเปลี่ยนรุ่น แก้บรรทัด v_batches ด้านล่าง (ทั้งไฟล์นี้ใช้ค่าจากตาราง _fix_credit_cfg)
-- ============================================================================

drop table if exists ems._fix_credit_cfg;
create table ems._fix_credit_cfg as select array['78','79','80','81']::text[] as batches;   -- ← รุ่นที่ต้องการ

create or replace function pg_temp.fv(j jsonb, k text) returns text language sql immutable as
$$ select nullif(btrim(coalesce(nullif(j->>k, ''), j->'extra'->>k)), '') $$;
create or replace function pg_temp.nc(x text) returns text language sql immutable as
$$ select lower(regexp_replace(coalesce(x, ''), '\s', '', 'g')) $$;
create or replace function pg_temp.nn(x text) returns numeric language sql immutable as
$$ select case when btrim(coalesce(x, '')) ~ '^-?\d+(\.\d+)?$' then btrim(x)::numeric end $$;
create or replace function pg_temp.nb(x text) returns text language sql immutable as
$$ select regexp_replace(coalesce(x, ''), '\D', '', 'g') $$;

-- รายวิชาในหลักสูตร
drop table if exists ems._fix_credit_cc;
create table ems._fix_credit_cc as
select code, cy, name_th, cr, ht, hl, hs,
       case when tp > 0 and tt = 0 and tl = 0 then 'ปฏิบัติ'
            when tp > 0 then 'ทฤษฎีและปฏิบัติ'
            when tl > 0 then 'ทฤษฎีและทดลอง'
            when tt > 0 then 'ทฤษฎี'
       end as typ
from (
  select pg_temp.nc(pg_temp.fv(j, 'course_code')) code,
         pg_temp.fv(j, 'curriculum_year') cy,
         pg_temp.fv(j, 'name_th') name_th,
         pg_temp.nn(pg_temp.fv(j, 'credits')) cr,
         pg_temp.nn(pg_temp.fv(j, 'h_theory')) ht,
         pg_temp.nn(pg_temp.fv(j, 'h_lab')) hl,
         pg_temp.nn(pg_temp.fv(j, 'h_self')) hs,
         coalesce(pg_temp.nn(pg_temp.fv(j, 'term_theory')), 0) tt,
         coalesce(pg_temp.nn(pg_temp.fv(j, 'term_lab')), 0) tl,
         coalesce(pg_temp.nn(pg_temp.fv(j, 'term_practice')), 0) tp
  from (select to_jsonb(c) j from public.curriculum_course c) x
) y
where code <> '';

-- รายวิชาที่เปิดสอนของรุ่นที่เลือก
drop table if exists ems._fix_credit_sj;
create table ems._fix_credit_sj as
select (j->>'id')::bigint id,
       pg_temp.fv(j, 'subject_code') subject_code, pg_temp.nc(pg_temp.fv(j, 'subject_code')) code,
       pg_temp.fv(j, 'subject_name') subject_name, pg_temp.nb(pg_temp.fv(j, 'batch')) batch,
       pg_temp.fv(j, 'academic_year') academic_year, pg_temp.fv(j, 'semester') semester,
       pg_temp.fv(j, 'curriculum_year') cy,
       pg_temp.fv(j, 'credits') old_cr, pg_temp.fv(j, 'hours_theory') old_ht,
       pg_temp.fv(j, 'hours_lab') old_hl, pg_temp.fv(j, 'hours_self') old_hs,
       pg_temp.fv(j, 'theory_practice') old_type
from (select to_jsonb(s) j from public.subject s) x
where pg_temp.nb(pg_temp.fv(j, 'batch')) = any ((select batches from ems._fix_credit_cfg)::text[]);

-- แผนแก้ subject
drop table if exists ems._fix_credit_subject;
create table ems._fix_credit_subject as
select sj.*, m.cy as cur_used, m.cr new_cr, m.ht new_ht, m.hl new_hl, m.hs new_hs, m.typ new_type
from ems._fix_credit_sj sj
cross join lateral (
  select * from ems._fix_credit_cc cc where cc.code = sj.code
  order by (cc.cy = sj.cy) desc nulls last, (cc.cy = '2565') desc, cc.cy desc limit 1
) m
where (m.cr is not null and pg_temp.nn(sj.old_cr) is distinct from m.cr)
   or (m.ht is not null and pg_temp.nn(sj.old_ht) is distinct from m.ht)
   or (m.hl is not null and pg_temp.nn(sj.old_hl) is distinct from m.hl)
   or (m.hs is not null and pg_temp.nn(sj.old_hs) is distinct from m.hs)
   or (m.typ is not null and coalesce(sj.old_type, '') <> m.typ);

-- รายวิชาที่หาในหลักสูตรไม่พบ (ไม่ถูกแก้)
drop table if exists ems._fix_credit_nomatch;
create table ems._fix_credit_nomatch as
select batch, subject_code, subject_name, academic_year, semester, old_cr
from ems._fix_credit_sj sj
where not exists (select 1 from ems._fix_credit_cc cc where cc.code = sj.code)
order by batch, subject_code;

-- แผนแก้ grade : นักศึกษารุ่นที่เลือก ทุกแถวผลการเรียนที่รหัสวิชาตรงกับหลักสูตร
drop table if exists ems._fix_credit_grade;
create table ems._fix_credit_grade as
with st as (
  select pg_temp.fv(j, 'student_id') sid, pg_temp.nb(pg_temp.fv(j, 'batch')) batch
  from (select to_jsonb(x) j from public.student x) y
  where pg_temp.nb(pg_temp.fv(j, 'batch')) = any ((select batches from ems._fix_credit_cfg)::text[])
), g as (
  select (j->>'id')::bigint id, pg_temp.fv(j, 'student_id') sid,
         pg_temp.fv(j, 'subject_code') subject_code, pg_temp.nc(pg_temp.fv(j, 'subject_code')) code,
         pg_temp.fv(j, 'subject_name') subject_name, pg_temp.fv(j, 'credits') old_cr
  from (select to_jsonb(x) j from public.grade x) y
)
select g.*, st.batch, m.cy as cur_used, m.cr new_cr
from g
join st on st.sid = g.sid
cross join lateral (
  select cc.* from ems._fix_credit_cc cc
  where cc.code = g.code
  order by (cc.cy = (select sj.cy from ems._fix_credit_sj sj where sj.code = g.code and sj.batch = st.batch and sj.cy is not null limit 1)) desc nulls last,
           (cc.cy = '2565') desc, cc.cy desc
  limit 1
) m
where m.cr is not null and pg_temp.nn(g.old_cr) is distinct from m.cr;

-- ---------------------------------------------------------------------------
-- ผลตรวจ : รายการที่จะถูกแก้ (subject ทีละแถว · grade รวมตามรุ่นและรหัสวิชา)
-- ---------------------------------------------------------------------------
select * from (
  select 'รายวิชาที่เปิดสอน' as "ตาราง", batch as "รุ่น", subject_code as "รหัสวิชา", subject_name as "ชื่อวิชา",
         coalesce(academic_year, '') || '/' || coalesce(semester, '') as "ปี/ภาค",
         coalesce(old_cr, '-') || '(' || coalesce(old_ht, '-') || '-' || coalesce(old_hl, '-') || '-' || coalesce(old_hs, '-') || ')' as "หน่วยกิตเดิม",
         coalesce(new_cr::text, old_cr, '-') || '(' || coalesce(new_ht::text, old_ht, '-') || '-' || coalesce(new_hl::text, old_hl, '-') || '-' || coalesce(new_hs::text, old_hs, '-') || ')' as "หน่วยกิตใหม่",
         coalesce(old_type, '-') as "ประเภทเดิม", coalesce(new_type, old_type, '-') as "ประเภทใหม่",
         1 as "จำนวนแถว", cur_used as "หลักสูตร"
  from ems._fix_credit_subject
  union all
  select 'ผลการเรียน', batch, min(subject_code), min(subject_name), '',
         coalesce(old_cr, '(ว่าง)'), new_cr::text, '', '', count(*)::int, min(cur_used)
  from ems._fix_credit_grade
  group by batch, code, old_cr, new_cr
) r
order by 1 desc, 2, 3;
