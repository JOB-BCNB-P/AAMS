-- ============================================================================
-- 97_plo_clo_section_unique.sql — ให้ CLO รหัสเดียวกันอยู่ได้ทั้งส่วนทฤษฎีและทดลอง
-- ----------------------------------------------------------------------------
-- อาการ: เพิ่ม CLO 1.1.2 ส่วนทดลอง (มี CLO 1.1.2 ส่วนทฤษฎีอยู่แล้ว) แต่ไม่ขึ้นในรายการ
-- สาเหตุที่เป็นไปได้: ตาราง plo_clo มีเงื่อนไข "ห้ามรหัส CLO ซ้ำในรายวิชาเดียวกัน" (unique) ที่ไม่ได้รวมช่อง section
--
-- ไฟล์นี้
--   1) เพิ่มคอลัมน์ section (ถ้ายังไม่มี) และย้ายค่าที่เคยเก็บใน extra มาไว้ในคอลัมน์
--   2) หา unique ที่มี clo_code แต่ไม่มี section → สร้างใหม่โดยเพิ่ม section เข้าไป แล้วลบของเดิม
--      (ยังกันซ้ำเหมือนเดิม แต่ "CLO 1.1.2 ทฤษฎี" กับ "CLO 1.1.2 ทดลอง" ถือเป็นคนละรายการ)
--   3) แสดงเงื่อนไข unique ของตารางหลังแก้
-- ไม่ลบหรือแก้ข้อมูล CLO/คะแนนเดิม · รันซ้ำได้
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================================
do $$
declare
  r record;
  v_name text;
  v_def text;
  v_pos int; v_open int; v_close int; v_depth int; v_i int;
begin
  -- 1) คอลัมน์ section
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'plo_clo' and column_name = 'section') then
    alter table public.plo_clo add column section text not null default '';
    raise notice 'เพิ่มคอลัมน์ section แล้ว';
  end if;
  update public.plo_clo
     set section = coalesce(nullif(btrim(extra->>'section'), ''), section),
         extra = extra - 'section'
   where extra ? 'section';
  update public.plo_clo set section = '' where section is null;

  -- 2) unique ที่กันรหัส CLO ซ้ำแต่ยังไม่นับ section (รวมถึง plo_clo_key ที่ระบบแจ้ง)
  --    รองรับทั้งแบบคอลัมน์และแบบนิพจน์ — เอานิยามเดิมมาเติม section ต่อท้ายรายการคอลัมน์
  for r in
    select i.indexrelid, c.relname as idx, con.conname, pg_get_indexdef(i.indexrelid) as def
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      left join pg_constraint con on con.conindid = i.indexrelid and con.conrelid = i.indrelid
     where i.indrelid = 'public.plo_clo'::regclass and i.indisunique and not i.indisprimary
  loop
    raise notice 'พบ unique: % = %', coalesce(r.conname, r.idx), r.def;
    if r.def ~* '\msection\M' then continue; end if;
    if not (r.def ~* 'clo_code' or r.idx = 'plo_clo_key' or r.conname = 'plo_clo_key') then continue; end if;
    -- หาวงเล็บรายการคอลัมน์หลัง USING xxx (
    v_pos := position(' USING ' in r.def);
    v_open := v_pos + position('(' in substr(r.def, v_pos)) - 1;
    v_depth := 0;
    for v_i in v_open .. length(r.def) loop
      if substr(r.def, v_i, 1) = '(' then v_depth := v_depth + 1;
      elsif substr(r.def, v_i, 1) = ')' then
        v_depth := v_depth - 1;
        if v_depth = 0 then v_close := v_i; exit; end if;
      end if;
    end loop;
    v_name := left(r.idx, 50) || '_sec';
    v_def := 'CREATE UNIQUE INDEX IF NOT EXISTS ' || quote_ident(v_name) || ' ON public.plo_clo '
             || substr(r.def, v_pos + 1, v_close - v_pos - 1) || ', section)' || substr(r.def, v_close + 1);
    execute v_def;
    if r.conname is not null then
      execute format('alter table public.plo_clo drop constraint %I', r.conname);
    else
      execute format('drop index public.%I', r.idx);
    end if;
    raise notice 'แก้ % → %', coalesce(r.conname, r.idx), v_def;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 3) เงื่อนไข unique ของ plo_clo หลังแก้
select c.relname as "ชื่อ", pg_get_indexdef(i.indexrelid) as "นิยาม"
  from pg_index i join pg_class c on c.oid = i.indexrelid
 where i.indrelid = 'public.plo_clo'::regclass and i.indisunique
 order by 1;
