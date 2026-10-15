-- ============================================================================
-- 94_plo_score_part.sql — คะแนนดิบรายองค์ประกอบของ CLO
-- ----------------------------------------------------------------------------
-- CLO หนึ่งข้อแบ่งเป็นหลายการประเมินได้ (สอบกลางภาค / สอบซ่อม / ปลายภาค / งาน)
-- นิยามองค์ประกอบเก็บใน plo_clo.components (JSON ใน extra)
-- ตารางนี้เก็บ "คะแนนดิบที่อาจารย์กรอก" ต่อ CLO ต่อนักศึกษา เป็น JSON เช่น
--   {"c1":{"s":"18","r":"30"},"c2":{"s":"20"},"c3":{"s":"16"}}
-- ร้อยละรวมของ CLO ยังเก็บใน plo_score.score เหมือนเดิม หน้าสรุปผลจึงไม่ต้องแก้
-- แยกตารางไว้ เพื่อบันทึกระหว่างทางได้ (เช่น มีแต่คะแนนกลางภาค) โดยไม่กระทบผลสรุป
--
-- วิธีติดตั้ง: Supabase → SQL Editor → วางทั้งไฟล์ → Run (รันซ้ำได้)
-- ============================================================================
create table if not exists public.plo_score_part (
  clo_id      bigint      not null,
  student_id  text        not null,
  detail      jsonb       not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (clo_id, student_id)
);

-- ลบ CLO แล้วคะแนนดิบของ CLO นั้นหายตาม (ถ้า plo_clo.id เป็น bigint)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plo_score_part_clo_fk') then
    begin
      alter table public.plo_score_part
        add constraint plo_score_part_clo_fk foreign key (clo_id) references public.plo_clo(id) on delete cascade;
    exception when others then
      raise notice 'ข้ามการผูก foreign key: %', sqlerrm;
    end;
  end if;
end $$;

create or replace function ems.plo_score_part_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists plo_score_part_touch on public.plo_score_part;
create trigger plo_score_part_touch before update on public.plo_score_part
  for each row execute function ems.plo_score_part_touch();

-- สิทธิ์ชุดเดียวกับตาราง PLO อื่น — นักศึกษาอ่านไม่ได้
alter table public.plo_score_part enable row level security;
drop policy if exists plo_read on public.plo_score_part;
drop policy if exists plo_write on public.plo_score_part;
drop policy if exists plo_update on public.plo_score_part;
drop policy if exists plo_delete on public.plo_score_part;
create policy plo_read on public.plo_score_part for select to authenticated
  using (ems.has_any_role(array['admin','academic','registrar','executive','teacher','classTeacher','deptHead']));
create policy plo_write on public.plo_score_part for insert to authenticated
  with check (ems.has_any_role(array['admin','academic','teacher','classTeacher']));
create policy plo_update on public.plo_score_part for update to authenticated
  using (ems.has_any_role(array['admin','academic','teacher','classTeacher']))
  with check (ems.has_any_role(array['admin','academic','teacher','classTeacher']));
create policy plo_delete on public.plo_score_part for delete to authenticated
  using (ems.has_any_role(array['admin','academic']));

revoke all on public.plo_score_part from anon;
grant select, insert, update, delete on public.plo_score_part to authenticated;
