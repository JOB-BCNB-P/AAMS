-- ============================================================================
-- 90_export.sql — ดึงสำเนาชั้นความปลอดภัยชุดใหม่ออกมาจากฐานข้อมูล
-- ----------------------------------------------------------------------------
-- วิธีใช้
--   1. เปิด Supabase → SQL Editor → วางไฟล์นี้ทั้งไฟล์ → Run
--   2. คัดลอกผลลัพธ์ของแต่ละส่วน ไปวางทับไฟล์ 01_ / 02_ / 03_
--   3. commit ขึ้น git — diff จะบอกเองว่าสิทธิ์อะไรเปลี่ยนไปบ้าง
--
-- ควรทำทุกครั้งที่เพิ่มตารางใหม่ หรือแก้นโยบายสิทธิ์
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ส่วนที่ 0 — รายการตรวจ ควรดูก่อนอย่างอื่น
-- ---------------------------------------------------------------------------
-- (0.1) ตารางที่ยังไม่เปิด RLS — ผลลัพธ์ต้องว่างเสมอ ถ้ามีแถวขึ้นมาคือรูรั่ว
select 'ตารางที่ยังไม่เปิด RLS' as ตรวจ, c.relname as ตาราง
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
 order by 2;

-- (0.2) ตารางที่เปิด RLS แต่ไม่มีนโยบายเลย
-- drive_link ต้องอยู่ในรายการนี้ (ตั้งใจ — เก็บ refresh token ของ Google)
-- ตารางอื่นที่โผล่มาคือลืมใส่นโยบาย = ไม่มีใครอ่านได้ หน้าเว็บจะพัง
select 'เปิด RLS แต่ไม่มีนโยบาย' as ตรวจ, c.relname as ตาราง
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
 order by 2;

-- (0.3) ฟังก์ชันที่ผู้ยังไม่ล็อกอิน (anon) เรียกได้ — ควรว่าง
select 'anon เรียกได้' as ตรวจ, p.oid::regprocedure::text as ฟังก์ชัน
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and has_function_privilege('anon', p.oid, 'execute')
 order by 2;

-- (0.4) ฟังก์ชันที่ยังไม่ได้ตั้ง search_path — ควรว่าง
select 'ไม่ได้ตั้ง search_path' as ตรวจ, p.oid::regprocedure::text as ฟังก์ชัน
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','ems') and p.proconfig is null
 order by 2;

-- ---------------------------------------------------------------------------
-- ส่วนที่ 1 — เนื้อไฟล์ 01_helpers.sql
-- ---------------------------------------------------------------------------
select string_agg(pg_get_functiondef(p.oid) || E';\n', E'\n' order by p.proname) as "01_helpers.sql"
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'ems' and p.prokind in ('f','p');

-- ---------------------------------------------------------------------------
-- ส่วนที่ 2 — เนื้อไฟล์ 02_policies.sql
-- ---------------------------------------------------------------------------
select string_agg(line, E'\n' order by tbl, ord, polname) as "02_policies.sql"
from (
  select c.relname as tbl, 1 as ord, '' as polname,
         'alter table public.' || quote_ident(c.relname) || ' enable row level security;' as line
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  union all
  select c.relname, 2, p.polname,
         'drop policy if exists ' || quote_ident(p.polname)
         || ' on public.' || quote_ident(c.relname) || ';'
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
  union all
  select c.relname, 3, p.polname,
         'create policy ' || quote_ident(p.polname) || ' on public.' || quote_ident(c.relname)
      || case when p.polpermissive then '' else ' as restrictive' end
      || ' for ' || (case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                                   when 'w' then 'update' when 'd' then 'delete' else 'all' end)
      || ' to ' || coalesce((select string_agg(quote_ident(r.rolname), ', ' order by r.rolname)
                               from unnest(p.polroles) rid join pg_roles r on r.oid = rid), 'public')
      || coalesce(E'\n  using (' || pg_get_expr(p.polqual, p.polrelid) || ')', '')
      || coalesce(E'\n  with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')', '')
      || ';'
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
) x;

-- ---------------------------------------------------------------------------
-- ส่วนที่ 3 — เนื้อไฟล์ 03_rpc.sql
-- ---------------------------------------------------------------------------
select string_agg(pg_get_functiondef(p.oid) || E';\n', E'\n' order by p.proname) as "03_rpc.sql"
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'ems\_%';

-- ---------------------------------------------------------------------------
-- ส่วนที่ 4 — ข้อมูลสำหรับชุดทดสอบ tests/rls_live.txt
-- ---------------------------------------------------------------------------
-- คัดลอกผลลัพธ์ไปวางทับ tests/rls_live.txt แล้วรัน node tests/test_rls_snapshot.js
-- เพื่อยืนยันว่าไฟล์ 02_policies.sql ตรงกับของจริงทุกข้อ
select string_agg(
  c.relname || '|' || p.polname || '|' ||
  (case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                 when 'w' then 'update' when 'd' then 'delete' else 'all' end) || '|' ||
  coalesce((select string_agg(r.rolname, '+' order by r.rolname)
              from unnest(p.polroles) rid join pg_roles r on r.oid = rid), 'public'),
  E'\n' order by c.relname, p.polname) as "tests/rls_live.txt"
from pg_policy p join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public';
