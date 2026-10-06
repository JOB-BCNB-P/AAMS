-- ตารางเก็บ "แฮช" โทเคนสำหรับ Edge Function backup-export (ไม่เก็บโทเคนจริง)
-- ใช้แล้วกับโปรเจกต์ xqpbwvbvrowsbwolxhan เมื่อ 2026-10-06 — แฮชของโทเคนจริงไม่อยู่ใน repo
create table if not exists public.backup_key (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  label text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.backup_key enable row level security;
revoke all on public.backup_key from anon, authenticated;
-- ออกโทเคนใหม่: สุ่มโทเคน แล้ว insert into backup_key(token_hash,label) values (encode(sha256('<token>'::bytea),'hex'),'...');
