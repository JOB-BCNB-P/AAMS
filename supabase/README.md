# ฐานข้อมูล Supabase — EMS-BCNB

โปรเจกต์: **EMS-BCNB** · `xqpbwvbvrowsbwolxhan` · region `ap-southeast-1` (สิงคโปร์)
โครงสร้างทั้งหมดถูกติดตั้งบนเซิร์ฟเวอร์เรียบร้อยแล้ว เอกสารนี้อธิบายว่ามีอะไรบ้าง

## ดึงไฟล์ migration ลงเครื่อง

```bash
npx supabase login
npx supabase link --project-ref xqpbwvbvrowsbwolxhan
npx supabase db pull          # ได้ไฟล์ SQL ลง supabase/migrations/
npx supabase functions download student-login
npx supabase functions download ems-admin
```

---

## 1. ตาราง (24 ตาราง + 2 ตารางเสริม)

`student` · `teacher` · `subject` · `schedule` · `grade` · `eng_result` · `leave` ·
`tracking` · `result_tracking` · `grade_tracking` · `file_tracking` · `announcement` ·
`app_user` · `doc_request` · `permission` · `teacher_directory` · `directory_summary` ·
`login_log` · `special_teacher` · `alumni` · `password_log` ·
`survey_config` · `survey_question` · `survey_response`

ตารางเสริม

| ตาราง | หน้าที่ |
|---|---|
| `student_private` | เก็บเลขบัตรประชาชนนักศึกษาแยกออกมา (PDPA) |
| `app_user.auth_user_id` | เชื่อมแถวผู้ใช้เข้ากับบัญชีใน `auth.users` |

**ทุกคอลัมน์ข้อมูลเป็นชนิด `text`** เพื่อให้พฤติกรรมตรงกับที่ระบบเคยได้จาก Google Sheets
ทุกตารางมีคอลัมน์มาตรฐาน

| คอลัมน์ | ความหมาย |
|---|---|
| `id` | รหัสแถว (แทนเลขแถวในชีต — โค้ดฝั่งหน้าเว็บเรียกว่า `__rowIndex`) |
| `created_at` / `updated_at` | เวลาสร้าง / แก้ไขล่าสุด (trigger เติมให้เอง) |
| `extra` | `jsonb` เก็บฟิลด์ที่ยังไม่ได้ประกาศเป็นคอลัมน์จริง — กันข้อมูลหาย |

---

## 2. ฟังก์ชันช่วยกำหนดสิทธิ์ (schema `ems`)

อยู่ใน schema `ems` ซึ่ง **ไม่ถูกเปิดผ่าน REST API** จึงเรียกจากภายนอกไม่ได้

| ฟังก์ชัน | คืนค่า |
|---|---|
| `ems.me()` | แถวใน `app_user` ของผู้ใช้ที่ล็อกอินอยู่ |
| `ems.role_of()` | บทบาท เช่น `admin`, `teacher`, `student` |
| `ems.student_id()` | รหัสนักศึกษาของผู้ใช้ (ถ้าเป็นนักศึกษา) |
| `ems.user_name()` | ชื่อผู้ใช้ |
| `ems.is_full()` | `admin` / `academic` / `registrar` |
| `ems.is_staff()` | บุคลากรทุกบทบาท (ไม่รวมนักศึกษา) |
| `ems.is_educator()` | บุคลากรที่แก้ไขผลการเรียน/การติดตามได้ |

## 3. RPC ที่หน้าเว็บเรียก (schema `public`, เฉพาะผู้ล็อกอินแล้ว)

| ฟังก์ชัน | ใช้ทำอะไร |
|---|---|
| `ems_whoami()` | คืนบทบาทและโปรไฟล์ของผู้ใช้ปัจจุบัน |
| `ems_schema()` | คืนรายชื่อคอลัมน์จริงของทุกตาราง (ให้ data layer แยกฟิลด์ลง `extra`) |
| `ems_row_counts()` | นับจำนวนแถวทุกตาราง (เฉพาะ `admin`/`academic`/`registrar`) |

## 4. Edge Functions

| ฟังก์ชัน | verify_jwt | หน้าที่ |
|---|---|---|
| `student-login` | ปิด | รับเลขบัตรประชาชน → ค้นหานักศึกษา → สร้าง/ผูกบัญชี Auth → คืน session |
| `ems-admin` | เปิด | งานที่ต้องใช้สิทธิ์เซิร์ฟเวอร์ — เฉพาะ `admin`/`academic` เท่านั้น |

คำสั่งของ `ems-admin`: `provision_staff` · `provision_students` · `set_password` ·
`set_national_id` · `row_counts`

---

## 5. สรุปนโยบาย RLS

| ตาราง | อ่าน | เขียน |
|---|---|---|
| `subject`, `schedule`, `announcement`, `survey_config`, `survey_question`, `permission` | ผู้ล็อกอินทุกคน | `is_full()` |
| `teacher`, `special_teacher`, `alumni`, `teacher_directory`, `directory_summary` | `is_staff()` | `is_full()` |
| `student` | `is_staff()` หรือแถวของตนเอง | `is_full()` |
| `student_private` | `is_full()` | `is_full()` |
| `grade`, `eng_result` | `is_staff()` หรือของตนเอง | `is_educator()` |
| `leave` | `is_staff()` หรือของตนเอง | เพิ่ม: ทุกคน · แก้: `is_staff()` · ลบ: `is_full()` |
| `tracking` ทั้ง 4 ตาราง | `is_staff()` | `is_educator()` |
| `doc_request` | `is_staff()` หรือของตนเอง | เพิ่ม: ทุกคน · จัดการ: `is_full()` |
| `login_log`, `password_log` | `admin` | เพิ่มได้ทุกคน |
| `app_user` | `is_full()` หรือแถวของตนเอง | `is_full()` |
| `survey_response` | `admin`/`academic`/`executive`/`deptHead` หรือของตนเอง | เพิ่มได้เมื่อแบบประเมินปีนั้น `status = 'open'` |

**กฎที่บังคับด้วยฐานข้อมูลโดยตรง**

- `uq_survey_response_once` — ดัชนี unique บน `(respondent_key, academic_year)`
  ทำให้ *ประเมินได้ครั้งเดียวต่อปีการศึกษา* โดยไม่ต้องพึ่งการตรวจฝั่งเบราว์เซอร์
- นโยบายเพิ่มคำตอบแบบประเมินตรวจสถานะ `open` จากตาราง `survey_config` ในตัว

---

## 6. คำเตือนที่เหลืออยู่ใน Advisors

Supabase จะแจ้งเตือนระดับ WARN 3 รายการ สำหรับ `ems_whoami` / `ems_schema` /
`ems_row_counts` ว่าผู้ล็อกอินเรียกได้ — **เป็นเจตนาของระบบ** เพราะหน้าเว็บต้องเรียกฟังก์ชันเหล่านี้
และแต่ละฟังก์ชันตรวจสิทธิ์ในตัวอยู่แล้ว (`ems_row_counts` ตรวจ `is_full()` ก่อนทำงาน)
