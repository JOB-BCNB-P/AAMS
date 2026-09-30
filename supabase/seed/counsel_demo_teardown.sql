-- ============================================================
--  ลบข้อมูลจำลองของระบบให้คำปรึกษาออกทั้งหมด
--  เงื่อนไขการลบผูกกับรหัสจำลอง 99000% และรหัสรายการ DEMO-CS%
--  จึงไม่แตะข้อมูลจริงแม้แต่แถวเดียว
-- ============================================================
begin;
delete from public.counsel_log     where session_code like 'DEMO-CS%';
delete from public.counsel_student where session_code like 'DEMO-CS%' or student_id like '99000%';
delete from public.counsel_session where session_code like 'DEMO-CS%';
delete from public.student_health  where student_id like '99000%';
delete from public.student_conduct where student_id like '99000%';
delete from public.leave           where student_id like '99000%';
delete from public.grade           where student_id like '99000%';
delete from public.student         where student_id like '99000%';
commit;

select 'เหลือข้อมูลจำลอง' as สถานะ,
       (select count(*) from public.student where student_id like '99000%')
     + (select count(*) from public.counsel_session where session_code like 'DEMO-CS%') as จำนวน;
