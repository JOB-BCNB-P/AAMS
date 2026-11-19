-- ================================================================
-- AAMS · แก้เกณฑ์ผ่านของ CLO ที่กรอกผิดหน่วย
--
-- อาการ
--   ร้อยละการบรรลุ PLO ขึ้น 100% เกือบทุกข้อ ทั้งที่คะแนนจริงมีกระจาย
--
-- สาเหตุ (ตรวจแล้วตรงกัน 22 จาก 22 CLO ของปี 2569 ภาค 1)
--   ช่อง plo_clo.pass_score ถูกกรอกเป็น "น้ำหนักของ CLO" (ผลรวม weight
--   ของทุกองค์ประกอบ เช่น 5+10+5 = 20) แทนที่จะเป็น "ร้อยละที่ต้องได้จึงจะผ่าน"
--   แต่คะแนนใน plo_score เก็บเป็น "ร้อยละของน้ำหนัก CLO" (0–100) อยู่แล้ว
--   การเทียบ score >= pass_score จึงกลายเป็น "ได้เกิน 20% ก็ผ่าน" → ผ่านเกือบหมด
--
-- ผลหลังแก้เป็นเกณฑ์ 60% (คำนวณล่วงหน้าแล้ว ปี 2569 ภาค 1)
--   PLO1 94.11% · PLO3 100% · PLO4 100% · PLO7 97.92% · PLO8 100% · PLO10 96.73%
--   ภาพรวม 96.83%  (เดิมแสดง 100%)
--
-- ข้อควรรู้ก่อนรัน
--   · แก้เฉพาะแถวที่ pass_score เท่ากับผลรวม weight พอดี ซึ่งเป็นลายเซ็นของการกรอกผิด
--     CLO ที่ตั้งเกณฑ์ไว้ถูกต้องอยู่แล้ว (เช่น 60) จะไม่ถูกแตะ
--   · ค่า 60 คือค่าเริ่มต้นของระบบ ถ้าหลักสูตรกำหนดเกณฑ์ราย CLO ต่างจากนี้
--     ให้แก้ตัวเลขในบรรทัด v_cut แล้วรันใหม่ หรือแก้รายข้อในหน้าบันทึกข้อมูล ขั้นที่ 3
--   · รันแล้วตัวเลขรายงานจะเปลี่ยนทันที ไม่ต้องแก้โค้ด ไม่ต้อง deploy
--
-- ย้อนกลับ : ตาราง plo_clo_pass_backup ด้านล่างเก็บค่าเดิมไว้ให้แล้ว
--   update public.plo_clo c set pass_score = b.old_pass
--     from public.plo_clo_pass_backup b where b.id = c.id;
-- ================================================================

begin;

-- 1) สำรองค่าเดิมไว้ก่อนเสมอ
create table if not exists public.plo_clo_pass_backup (
  id          bigint primary key,
  old_pass    numeric,
  backed_up_at timestamptz not null default now()
);

with target as (
  select c.id, c.pass_score,
         (select sum((e->>'weight')::numeric)
            from jsonb_array_elements(
                   case when jsonb_typeof(c.extra->'components') = 'array'
                        then c.extra->'components'
                        else (c.extra->>'components')::jsonb end) e) as wsum
    from public.plo_clo c
   where c.extra ? 'components'
)
insert into public.plo_clo_pass_backup (id, old_pass)
select id, pass_score from target
 where wsum is not null and pass_score = wsum
on conflict (id) do nothing;

-- 2) ตั้งเกณฑ์ผ่านเป็นร้อยละ (ค่าเริ่มต้นของระบบ = 60)
with target as (
  select c.id,
         (select sum((e->>'weight')::numeric)
            from jsonb_array_elements(
                   case when jsonb_typeof(c.extra->'components') = 'array'
                        then c.extra->'components'
                        else (c.extra->>'components')::jsonb end) e) as wsum,
         c.pass_score
    from public.plo_clo c
   where c.extra ? 'components'
)
update public.plo_clo c
   set pass_score = 60,          -- v_cut : เปลี่ยนตัวเลขนี้ถ้าหลักสูตรใช้เกณฑ์อื่น
       updated_at = now()
  from target t
 where t.id = c.id
   and t.wsum is not null
   and t.pass_score = t.wsum;

-- 3) ดูผลก่อนยืนยัน
select c.academic_year, c.semester, count(*) as "CLO ที่แก้"
  from public.plo_clo c
  join public.plo_clo_pass_backup b on b.id = c.id
 group by 1, 2 order by 1, 2;

commit;
