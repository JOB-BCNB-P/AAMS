/* ตรวจว่าไฟล์สำเนานโยบายสิทธิ์ตรงกับของจริงในฐานข้อมูล
   ไฟล์ supabase/security/02_policies.sql ต้องสร้างนโยบายชุดเดียวกับที่ใช้งานอยู่จริง
   ถ้าไม่ตรง แปลว่าสำเนาเก่าไปแล้ว ต้องรัน 90_export.sql เอาของใหม่มาทับ */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const SQL = fs.readFileSync(P + 'supabase/security/02_policies.sql', 'utf8');
const LIVE = fs.readFileSync(path.join(__dirname, 'rls_live.txt'), 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

/* อ่านไฟล์ SQL แล้วแจกแจงว่าจะได้นโยบายอะไรบ้าง
   รองรับทั้งแบบเขียนตรง ๆ และแบบวนลูป do $$ ... foreach ... execute format() */
function policiesFromSql(sql) {
  const out = new Set();
  const add = (tbl, name, cmd, roles) => out.add([tbl, name, cmd, roles].join('|'));

  // ก. คำสั่งที่เขียนตรง ๆ
  // จับเฉพาะชื่อบทบาท ไม่ให้เลยไปกิน using / with check ที่อยู่บรรทัดเดียวกัน
  const direct = /create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(select|insert|update|delete|all)\s+to\s+(\w+(?:\s*,\s*\w+)*)/gi;
  for (const m of sql.matchAll(direct)) {
    add(m[2], m[1], m[3].toLowerCase(), m[4].trim().split(/\s*,\s*/).sort().join('+'));
  }

  // ข. บล็อกวนลูป — เอารายชื่อตารางจาก array[...] แล้วขยาย %I ในแต่ละ execute format
  const blocks = sql.match(/do \$\$[\s\S]*?end \$\$;/g) || [];
  for (const b of blocks) {
    const arr = /foreach t in array array\[([^\]]+)\]/i.exec(b);
    if (!arr) continue;
    const tables = arr[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    const inner = /create policy (\w+) on public\.%I for (select|insert|update|delete|all)\s+to\s+(\w+)/gi;
    for (const m of b.matchAll(inner)) {
      tables.forEach(tb => add(tb, m[1], m[2].toLowerCase(), m[3]));
    }
  }
  return out;
}

const mine = policiesFromSql(SQL);
const live = new Set(LIVE.split('\n').map(x => x.trim()).filter(Boolean));

console.log('[1] จำนวนนโยบาย');
t('ไฟล์สำเนามีนโยบายครบเท่าของจริง', () => {
  assert.ok(mine.size > 100, 'อ่านไฟล์ได้แค่ ' + mine.size + ' นโยบาย — ตัวแยกคำน่าจะพัง');
  assert.strictEqual(mine.size, live.size,
    'ในไฟล์ ' + mine.size + ' · ในฐานข้อมูล ' + live.size);
});

console.log('\n[2] เทียบทีละนโยบาย (ตาราง · ชื่อ · คำสั่ง · บทบาท)');
t('ไม่มีนโยบายที่มีในฐานข้อมูลแต่หายไปจากไฟล์', () => {
  const miss = [...live].filter(x => !mine.has(x));
  assert.strictEqual(miss.length, 0, 'ขาด ' + miss.length + ' ข้อ:\n      ' + miss.join('\n      '));
});
t('ไม่มีนโยบายส่วนเกินที่ไฟล์สร้างแต่ของจริงไม่มี', () => {
  const extra = [...mine].filter(x => !live.has(x));
  assert.strictEqual(extra.length, 0, 'เกิน ' + extra.length + ' ข้อ:\n      ' + extra.join('\n      '));
});

console.log('\n[3] ข้อกำหนดที่ห้ามหลุด');
t('ทุกตารางที่มีนโยบาย ต้องมีคำสั่งเปิด RLS ในไฟล์ด้วย', () => {
  const tables = new Set([...live].map(x => x.split('|')[0]));
  const missing = [...tables].filter(tb =>
    !new RegExp('alter table public\\.' + tb + ' enable row level security', 'i').test(SQL));
  assert.strictEqual(missing.length, 0, 'ไม่ได้สั่งเปิด RLS: ' + missing.join(', '));
});
t('drive_link เปิด RLS แต่ต้องไม่มีนโยบายใดเลย', () => {
  assert.ok(/alter table public\.drive_link enable row level security/i.test(SQL), 'ไม่ได้เปิด RLS');
  assert.ok(!/create policy\s+\w+\s+on public\.drive_link/i.test(SQL),
    'มีนโยบายให้ drive_link — ตารางนี้เก็บ refresh token ห้ามให้ใครอ่านผ่าน API');
  assert.ok(![...live].some(x => x.startsWith('drive_link|')), 'ฐานข้อมูลมีนโยบายให้ drive_link แล้ว');
});
t('เลขบัตรประชาชนอ่านได้เฉพาะผู้ดูแลระบบและงานทะเบียน', () => {
  const rd = SQL.match(/create policy\s+sp_read\s+on\s+public\.student_private[^;]*/);
  assert.ok(rd && /ems\.can_see_nid\(\)/.test(rd[0]), 'การอ่านไม่ได้จำกัดด้วย can_see_nid()');
  const def = SQL.match(/function ems\.can_see_nid[\s\S]{0,300}/);
  assert.ok(def && /array\['admin','registrar'\]/.test(def[0]), 'รายชื่อบทบาทไม่ตรง');
  // เขียนได้กว้างกว่าอ่านโดยตั้งใจ งานวิชาการเพิ่มนักศึกษาใหม่ได้แต่เปิดดูย้อนหลังไม่ได้
  const ins = SQL.match(/create policy\s+sp_insert\s+on\s+public\.student_private[^;]*/);
  assert.ok(ins && /ems\.is_full\(\)/.test(ins[0]), 'นโยบายบันทึกหายไป');
  assert.ok(!/create policy\s+p_all\s+on\s+public\.student_private/.test(SQL),
    'ยังมีนโยบายเก่าที่ครอบทั้งอ่านและเขียนค้างอยู่');
});
t('คำตอบรายข้อของแบบประเมิน อาจารย์ผู้สอนอ่านตรง ๆ ไม่ได้', () => {
  const i = SQL.indexOf('create policy ev_ans_read on public.eval_answer');
  const seg = SQL.slice(i, i + 400);
  assert.ok(!/teacher/.test(seg), 'อาจารย์อ่านคำตอบรายข้อได้ — ต้องเห็นผ่านตัวสรุปเท่านั้น');
  assert.ok(/'admin'.*'academic'.*'registrar'.*'executive'/s.test(seg), 'รายชื่อบทบาทไม่ตรง');
});
t('นักศึกษาแก้คำตอบไม่ได้หลังกดส่งแล้ว', () => {
  ['ev_resp_update', 'ev_ans_insert', 'ev_ans_delete'].forEach(p => {
    const i = SQL.indexOf('create policy ' + p + ' on');
    const seg = SQL.slice(i, i + 500);
    assert.ok(seg.includes('ส่งแล้ว'), p + ' ไม่ได้กันการแก้หลังส่ง');
  });
});
t('กลุ่มย่อยของแบบประเมิน นักศึกษาอ่านไม่ได้', () => {
  // ยอมให้เว้นวรรคกี่ช่องก็ได้ ไม่งั้นจัดรูปแบบไฟล์ใหม่แล้วการทดสอบพังทั้งที่นโยบายถูก
  const m = SQL.match(/create policy\s+eg_read\s+on\s+public\.eval_group[^;]*/);
  assert.ok(m, 'ไม่พบนโยบาย eg_read ในไฟล์');
  assert.ok(/ems\.is_staff\(\)/.test(m[0]), 'ไม่ได้จำกัดด้วย is_staff()');
  assert.ok(/to\s+authenticated/.test(m[0]), 'ควรจำกัดเฉพาะผู้ที่ล็อกอินแล้ว');
});

console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
