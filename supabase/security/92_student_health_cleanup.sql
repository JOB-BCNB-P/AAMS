-- ============================================================
--  ข้อมูล สบช.โมเดล — เก็บกวาดคอลัมน์ของรุ่นที่บันทึกรายเดือน
--  ----------------------------------------------------------
--  ระบบเปลี่ยนมาบันทึก "ภาคการศึกษาละหนึ่งครั้งต่อนักศึกษาหนึ่งคน" แล้ว
--  หน้าจอและไฟล์ CSV ไม่อ่านและไม่เขียนสองคอลัมน์นี้อีกต่อไป
--
--  ดัชนีกันข้อมูลซ้ำถูกสร้างให้เรียบร้อยแล้ว ไฟล์นี้จึงเป็นเพียงการเก็บกวาด
--  ไม่รันก็ใช้งานได้ตามปกติ เพียงแต่จะมีคอลัมน์ว่างค้างอยู่สองคอลัมน์
--
--  วิธีใช้  เปิด Supabase > SQL Editor  วางทั้งไฟล์ แล้วกด Run
-- ============================================================

alter table public.student_health drop column if exists record_month;
alter table public.student_health drop column if exists record_year_be;

drop index if exists public.student_health_month_idx;
drop index if exists public.student_health_year_idx;   -- ซ้ำกับ student_health_term_idx

-- ---------- ตรวจผลหลังรัน ----------
-- ควรไม่เหลือคอลัมน์รายเดือน และต้องมีดัชนีกันซ้ำหนึ่งตัว
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'student_health'
       and column_name in ('record_month', 'record_year_be')) as คอลัมน์รายเดือนที่เหลือ,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'student_health_one_per_term_idx') as ดัชนีกันซ้ำ;
