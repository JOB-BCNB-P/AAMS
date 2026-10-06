# สำรองข้อมูล AAMS ไป Google Sheet อัตโนมัติ (วิธี A: Google Apps Script)

การสำรองเป็นแบบ**ทางเดียว**: Supabase ส่งข้อมูลไปที่ Google Sheet และ Google Drive ตัวระบบ AAMS จะไม่อ่านข้อมูลจาก Sheet กลับมาใช้

| รอบ | เวลา | ผลลัพธ์ |
|---|---|---|
| ทุกคืน | 02:00 น. | เขียนทับข้อมูลลงสเปรดชีต **AAMS Backup (ล่าสุด)** แยกแท็บละ 1 ตาราง และมีแท็บ `_สรุปการสำรอง` |
| ทุกวันอาทิตย์ | 03:00 น. | เก็บไฟล์ CSV ทุกตารางไว้ที่ `AAMS Backup/CSV/ปปปป-ดด-วว` ย้อนหลัง 8 สัปดาห์ |
| เมื่อล้มเหลว | ทันที | ส่งอีเมลแจ้ง `NOTIFY_EMAIL` |

ผลพลอยได้: Supabase จะถูกเรียกใช้ทุกคืน โปรเจกต์แบบฟรีจึงไม่ถูกพักการใช้งาน

## ส่วนประกอบ

- **`supabase/functions/backup-export`**: Edge Function แบบอ่านอย่างเดียว ยืนยันตัวตนด้วย header `x-backup-token` โดยตรวจกับแฮชในตาราง `backup_key` (RLS ปิดสิทธิ์ทุกคน) ส่วน service-role key จะอยู่ใน Supabase เท่านั้น ไม่ถูกส่งไปที่ Google
- **`google-apps-script/AAMS_Backup.gs`**: สคริปต์ที่วางในบัญชี Google ของวิทยาลัย

## ข้อมูลที่ไม่สำรอง (เพื่อความปลอดภัยและสอดคล้องกับ PDPA)

- **ตาราง**: `student_private` (เลขบัตรประชาชน), `counsel_session` / `counsel_student` / `counsel_log` (บันทึกการให้คำปรึกษา), `student_health`, `student_conduct`, `nid_access_log`, `drive_link`, `backup_key`, `password_log`, `line_group`
- **คอลัมน์**: `student.religion`, `teacher.bank_account`, `teacher.address`, `alumni.salary` และ auth uid ต่าง ๆ

ถ้าต้องการเพิ่มหรือลดตาราง ให้แก้ `ALLOW` และ `DROP` ใน Edge Function แล้ว deploy ใหม่

## ขั้นตอนติดตั้ง (ทำครั้งเดียว ประมาณ 5 นาที)

1. **Deploy ฟังก์ชัน** ด้วยคำสั่ง
   ```
   supabase functions deploy backup-export --no-verify-jwt --project-ref xqpbwvbvrowsbwolxhan
   ```
2. เข้าสู่ระบบ https://script.google.com ด้วย**บัญชีกลางของวิทยาลัย** (ไม่ควรใช้บัญชีส่วนตัว) แล้วกด **New project** และตั้งชื่อว่า `AAMS Backup`
3. ลบโค้ดเดิมทั้งหมด แล้ววางเนื้อหาจาก `AAMS_Backup.gs` จากนั้นกดบันทึก
4. ไปที่ **Project Settings** (รูปเฟือง) → **Script Properties** → **Add script property** แล้วเพิ่มค่าเหล่านี้

   | Property | Value |
   |---|---|
   | `AAMS_BACKUP_URL` | `https://xqpbwvbvrowsbwolxhan.supabase.co/functions/v1/backup-export` |
   | `AAMS_BACKUP_TOKEN` | โทเคนที่ได้รับ (ห้ามใส่ในโค้ดหรือใน Sheet) |
   | `NOTIFY_EMAIL` | อีเมลผู้ดูแลระบบ (ใส่หลายคนได้ โดยคั่นด้วย `,`) |

5. ไปที่ **Project Settings** → **Time zone** แล้วเลือก `(GMT+07:00) Bangkok`
6. กลับไปที่ Editor เลือกฟังก์ชัน `testConnection` แล้วกด **Run** และกดอนุญาตสิทธิ์ เมื่อสำเร็จ Log จะแสดงรายชื่อตารางพร้อมจำนวนแถว
7. เลือกฟังก์ชัน `setup` แล้วกด **Run** ระบบจะสร้างโฟลเดอร์ `AAMS Backup` และสเปรดชีต ตั้งเวลาอัตโนมัติ และสำรองข้อมูลครั้งแรกให้ทันที
8. เปิดโฟลเดอร์ `AAMS Backup` ใน Drive แล้วตรวจการแชร์ว่า**ไม่ได้ตั้งเป็น "ทุกคนที่มีลิงก์"** และแชร์ให้เฉพาะผู้ดูแลระบบเท่านั้น

## การดูแลประจำ

- **ตรวจสถานะ**: ดูที่แท็บ `_สรุปการสำรอง` (เวลาสำรองล่าสุดและจำนวนแถวของแต่ละตาราง) หรือดูที่เมนู **Executions** ใน Apps Script
- **สำรองทันที**: เลือกฟังก์ชัน `backupToSheet` (หรือ `backupCsvWeekly`) แล้วกด Run
- **เปลี่ยนเวลา**: แก้ `CFG.DAILY_HOUR` / `CFG.WEEKLY_HOUR` แล้วรัน `installTriggers` หนึ่งครั้ง
- **กรณีโทเคนรั่ว / ยกเลิกโทเคน**: รัน SQL `update backup_key set is_active=false;` แล้วออกโทเคนใหม่

## ข้อจำกัด

- Sheet เป็น**สำเนาสำหรับเปิดอ่าน** ถ้าจะกู้ข้อมูลกลับเข้าระบบ ให้ใช้ไฟล์ CSV รายสัปดาห์นำเข้าผ่าน Supabase (Table editor → Import CSV) หรือใช้สคริปต์นำเข้า
- ทุกเซลล์ถูกเก็บเป็นข้อความ เพื่อไม่ให้ Sheets แปลงวันที่หรือตัดเลข 0 นำหน้ารหัส ส่วนข้อความที่ขึ้นต้นด้วย `= + - @` จะมี `'` นำหน้าเพื่อกันสูตรแฝง
- Google Sheet รับได้ 10 ล้านเซลล์ต่อไฟล์ ปัจจุบันใช้ไม่ถึง 5% จึงยังเหลือพื้นที่อีกหลายปี
