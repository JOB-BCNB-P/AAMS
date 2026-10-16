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
  v_cols text;
  v_name text;
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

  -- 2) unique ที่มี clo_code แต่ไม่มี section
  for r in
    select i.indexrelid, c.relname as idx, con.conname,
           array_agg(a.attname order by k.ord) as cols,
           bool_or(k.attnum = 0) as has_expr
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      left join pg_constraint con on con.conindid = i.indexrelid and con.conrelid = i.indrelid
      cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
      left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = 'public.plo_clo'::regclass and i.indisunique and not i.indisprimary
     group by i.indexrelid, c.relname, con.conname
  loop
    if not ('clo_code' = any (r.cols)) or ('section' = any (r.cols)) then continue; end if;
    if r.has_expr then
      raise notice 'ข้าม % — เป็น unique แบบนิพจน์ ต้องแก้เอง: %', r.idx, pg_get_indexdef(r.indexrelid);
      continue;
    end if;
    select string_agg(format('%I', x), ', ') into v_cols from unnest(r.cols || array['section']::name[]) x;
    v_name := left(r.idx, 50) || '_sec';
    execute format('create unique index if not exists %I on public.plo_clo (%s)', v_name, v_cols);
    if r.conname is not null then
      execute format('alter table public.plo_clo drop constraint %I', r.conname);
    else
      execute format('drop index public.%I', r.idx);
    end if;
    raise notice 'แก้ % → % (%)', r.idx, v_name, v_cols;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 3) เงื่อนไข unique ของ plo_clo หลังแก้
select c.relname as "ชื่อ", pg_get_indexdef(i.indexrelid) as "นิยาม"
  from pg_index i join pg_class c on c.oid = i.indexrelid
 where i.indrelid = 'public.plo_clo'::regclass and i.indisunique
 order by 1;
