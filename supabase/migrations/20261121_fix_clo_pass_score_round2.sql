-- ================================================================
-- AAMS · แก้เกณฑ์ผ่านของ CLO ที่กรอกผิดหน่วย (รอบที่ 2)
--
-- ทำไมต้องมีรอบ 2
--   ไฟล์ 20261119_fix_clo_pass_score.sql รันไปแล้ว แก้ได้ 38 แถว
--   แต่รายวิชาที่บันทึกเข้ามา "หลังจากนั้น" ยังกรอกแบบเดิมอยู่
--   (GE 102 · GE 209 · GE 302 · GE 305 ปีการศึกษา 2568 ภาค 1 รวม 23 แถว)
--   ไฟล์นี้จึงเขียนให้รันซ้ำได้เรื่อย ๆ รันแล้วไม่มีอะไรให้แก้ก็ไม่ทำอะไร
--
-- อาการที่เห็นหน้าจอ
--   · GE 102 CLO 1.3.1 ขึ้น 0.00% ทั้งที่คะแนนเฉลี่ย 72.64
--     เพราะเกณฑ์ผ่านถูกตั้งไว้ 100 (คะแนนสูงสุดจริงคือ 86.68 จึงไม่มีใครผ่าน)
--   · CLO อื่นขึ้น 100% เกือบหมด เพราะเกณฑ์ถูกตั้งไว้ 10–50
--
-- ผลหลังแก้เป็น 60% (คำนวณล่วงหน้าแล้วจากคะแนนจริง)
--   GE 102  CLO 1.3.1   0.00% → 96.53%
--   GE 102  CLO 7.1.5 100.00% → 45.83%   ← ข้อนี้คือจุดที่ต้องกำกับติดตามจริง
--   GE 209  CLO 6.2.1 100.00% → 97.92%
--   GE 305  CLO 10.1.1 100.00% → 98.61%
--   GE 305  CLO 8.1.2 100.00% → 99.31%
--   ที่เหลืออีก 18 ข้อ ยังคง 100.00% เท่าเดิม
--
-- ย้อนกลับ : ค่าเดิมถูกเก็บไว้ในตาราง plo_clo_pass_backup
--   update public.plo_clo c set pass_score = b.old_pass
--     from public.plo_clo_pass_backup b where b.id = c.id;
-- ================================================================

begin;

create table if not exists public.plo_clo_pass_backup (
  id           bigint primary key,
  old_pass     numeric,
  backed_up_at timestamptz not null default now()
);

-- แถวที่เข้าข่าย : เกณฑ์ผ่านเท่ากับผลรวมน้ำหนักขององค์ประกอบพอดี
-- ซึ่งเป็นลายเซ็นของการกรอกน้ำหนักลงช่องเกณฑ์ผ่าน
create temporary table _target on commit drop as
select c.id, c.pass_score::numeric as old_pass
  from public.plo_clo c
  join lateral (
    select sum((e->>'weight')::numeric) as wsum
      from jsonb_array_elements(
             case when jsonb_typeof(c.extra->'components') = 'array'
                  then c.extra->'components'
                  else (c.extra->>'components')::jsonb end) e) t on true
 where c.extra ? 'components'
   and t.wsum is not null
   and c.pass_score is not null
   and c.pass_score::numeric = t.wsum;

insert into public.plo_clo_pass_backup (id, old_pass)
select id, old_pass from _target
on conflict (id) do nothing;

update public.plo_clo c
   set pass_score = 60,          -- เปลี่ยนตัวเลขนี้ถ้าหลักสูตรใช้เกณฑ์อื่น
       updated_at = now()
  from _target t
 where t.id = c.id;

-- สรุปให้ดูก่อนยืนยัน
select c.academic_year, c.semester, c.subject_code, count(*) as "CLO ที่แก้รอบนี้"
  from public.plo_clo c join _target t on t.id = c.id
 group by 1, 2, 3 order by 1, 2, 3;

commit;
