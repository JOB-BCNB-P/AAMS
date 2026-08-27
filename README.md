# AAMS — ระบบบริหารจัดการงานวิชาการ (EMS-BCNB)

วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ · Academic Affairs Management System

เว็บแอปพลิเคชันแบบ **responsive** ทำงานบนฐานข้อมูล **Supabase (PostgreSQL)**
และเผยแพร่ผ่าน **GitHub Pages** อัตโนมัติ

---

## 1. ภาพรวมสถาปัตยกรรม

```
ผู้ใช้ (มือถือ / แท็บเล็ต / คอมพิวเตอร์)
        │
        ▼
GitHub Pages  ── ไฟล์เว็บแบบ static (HTML / CSS / JS)
        │              ไม่มีความลับอยู่ในไฟล์เหล่านี้
        ▼
Supabase
   ├── Auth        : ยืนยันตัวตน (อีเมลวิทยาลัย / Google / เลขบัตรนักศึกษา)
   ├── PostgreSQL  : ข้อมูลทั้งหมด + Row Level Security กำหนดสิทธิ์รายบทบาท
   └── Edge Function: งานที่ต้องใช้สิทธิ์ระดับเซิร์ฟเวอร์ (สร้างบัญชี, ล็อกอินนักศึกษา)
```

**หลักการสำคัญ:** สิทธิ์การเข้าถึงข้อมูลถูกบังคับที่ **ฐานข้อมูล** ไม่ใช่ที่เบราว์เซอร์
ต่อให้มีคนเปิดซอร์สโค้ดของหน้าเว็บดูทั้งหมด ก็ไม่สามารถดึงข้อมูลที่ตนไม่มีสิทธิ์ได้

---

## 2. โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้าเว็บ + หน้าเข้าสู่ระบบ (responsive) |
| `config.js` | ค่าเชื่อมต่อ Supabase (เปิดเผยได้ ปลอดภัย) |
| `supabase-db.js` | เลเยอร์ฐานข้อมูล — มี API หน้าตาเหมือน `GSheetDB` เดิมทุกฟังก์ชัน |
| `auth.js` | ยืนยันตัวตนด้วย Supabase Auth |
| `app.js` | ตรรกะและการแสดงผลทุกหน้า (ไฟล์เดิม ไม่ได้แก้) |
| `app-patch.js` | เขียนทับเฉพาะฟังก์ชันเข้าสู่ระบบ/ตั้งค่า + ตัวช่วย responsive |
| `grad-images.js` | รูปอินโฟกราฟิกบัณฑิต |
| `styles.css` | สไตล์ + จุดตัดหน้าจอ (responsive breakpoints) |
| `admin/migrate.html` | เครื่องมือย้ายข้อมูลจาก Google Sheets เข้า Supabase |
| `.github/workflows/deploy.yml` | เผยแพร่ขึ้น GitHub Pages อัตโนมัติ |

> `app.js` ยังคงเรียก `GSheetDB.*` เหมือนเดิม เพราะ `supabase-db.js`
> ประกาศตัวเองเป็น `window.GSheetDB` — จึงไม่ต้องแก้ไฟล์ขนาด 9 แสนตัวอักษรนี้เลย

---

## 3. การนำขึ้น GitHub Pages

### 3.1 push โค้ดขึ้น repo

เปิด Command Prompt / PowerShell ที่โฟลเดอร์นี้ แล้วรัน

```bash
git init
git add .
git commit -m "ระบบ AAMS: ย้ายฐานข้อมูลไป Supabase + ปรับเป็น responsive web app"
git branch -M main
git remote add origin https://github.com/JOB-BCNB-P/AAMS.git
git push -u origin main
```

### 3.2 เปิด GitHub Pages

1. ไปที่ repo → **Settings** → **Pages**
2. หัวข้อ *Build and deployment* → **Source** เลือก **GitHub Actions**
3. รอ workflow ทำงานเสร็จ (แท็บ **Actions**)
4. เว็บจะขึ้นที่ **https://job-bcnb-p.github.io/AAMS/**

### 3.3 ตั้งค่า URL ที่อนุญาตใน Supabase

Supabase → **Authentication → URL Configuration**

| ช่อง | ค่า |
|---|---|
| Site URL | `https://job-bcnb-p.github.io/AAMS/` |
| Redirect URLs | `https://job-bcnb-p.github.io/AAMS/` และ `http://localhost:*` |

ถ้าไม่ตั้งค่านี้ การเข้าสู่ระบบด้วย Google จะเด้งกลับไม่ถูกหน้า

---

## 4. การตั้งค่า Supabase (ทำครั้งเดียว)

โปรเจกต์: **EMS-BCNB** · `xqpbwvbvrowsbwolxhan` · region Singapore

### 4.1 เปิดใช้ Google Sign-In

**Authentication → Sign In / Providers → Google**
ใส่ Client ID และ Client Secret จาก Google Cloud Console
(ใช้โปรเจกต์ OAuth เดิมได้ — เพิ่ม Authorized redirect URI เป็น
`https://xqpbwvbvrowsbwolxhan.supabase.co/auth/v1/callback`)

### 4.2 ตั้งค่าอีเมล (จำเป็นสำหรับ "ลืมรหัสผ่าน")

1. **Authentication → Emails → SMTP Settings** — ตั้งค่า SMTP ของวิทยาลัย
   (SMTP ที่ Supabase แถมให้ส่งได้จำกัดมาก ใช้จริงไม่พอ)
2. **Authentication → Emails → Reset Password**
   แก้เทมเพลตให้แสดงรหัส 6 หลักด้วยการใส่ `{{ .Token }}` ลงในเนื้อหาอีเมล
   เช่น

   ```
   รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่ของคุณคือ {{ .Token }}
   รหัสนี้ใช้ได้ภายใน 60 นาที
   ```

### 4.3 นโยบายรหัสผ่าน

**Authentication → Policies** → ตั้งความยาวขั้นต่ำ **8 ตัวอักษร** ขึ้นไป
และเปิด *Leaked password protection*

---

## 5. การย้ายข้อมูลจาก Google Sheets

1. เปิด Google Sheet เดิม → เลือกแท็บ → **File → Download → CSV**
   ทำให้ครบทุกแท็บที่ต้องการย้าย (ตั้งชื่อไฟล์ตามชื่อแท็บ เช่น `student.csv`)
2. เปิด `https://job-bcnb-p.github.io/AAMS/admin/migrate.html`
3. เข้าสู่ระบบด้วยบัญชี **admin** หรือ **academic**
4. ลากไฟล์ CSV ทั้งหมดมาวาง → ตรวจตารางปลายทาง → กด **เริ่มนำเข้าข้อมูล**
5. กด **สร้างบัญชีบุคลากร** และ **สร้างบัญชีนักศึกษา**
6. กด **ตรวจนับจำนวนแถวทุกตาราง** เพื่อเทียบกับจำนวนแถวในชีตเดิม

**ลำดับที่แนะนำ:** `student` → `teacher` → `subject` → ตารางอื่น ๆ

> คอลัมน์ที่ยังไม่มีในฐานข้อมูลจะถูกเก็บลงช่อง `extra` (JSON) อัตโนมัติ
> ข้อมูลจึงไม่หายแม้ชีตจะมีคอลัมน์ที่ระบบยังไม่รู้จัก

---

## 6. บัญชีผู้ใช้และการเข้าสู่ระบบ

| กลุ่ม | วิธีเข้าสู่ระบบ | รหัสผ่านตั้งต้น |
|---|---|---|
| บุคลากร / อาจารย์ | อีเมล `@bcn.ac.th` + รหัสผ่าน หรือปุ่ม **Google** | สุ่มให้ตอนสร้าง → ให้ผู้ใช้กด “ลืมรหัสผ่าน?” ตั้งเอง |
| นักศึกษา | เลขบัตรประชาชน 13 หลัก | ระบบสร้างบัญชีให้อัตโนมัติครั้งแรก |

**บทบาทมาจากตาราง `app_user` ในฐานข้อมูล ไม่ใช่จากช่องที่ผู้ใช้เลือก**
การเพิ่ม/แก้บทบาทให้ทำที่หน้า “ตั้งค่าระบบ → ผู้ใช้” หรือแก้ตาราง `app_user` โดยตรง

---

## 7. สิทธิ์การเข้าถึงข้อมูล (RLS)

| บทบาท | สิทธิ์ |
|---|---|
| `admin`, `academic`, `registrar` | อ่าน/เขียนได้ทุกตาราง |
| `executive` | อ่านข้อมูลภาพรวมทั้งหมด |
| `deptHead`, `teacher`, `classTeacher` | อ่านข้อมูลบุคลากร/นักศึกษา · เขียนได้เฉพาะผลการเรียน ผลสอบ การลา และตารางติดตามการส่ง |
| `student` | เห็นเฉพาะข้อมูลของตนเอง + รายวิชา ปฏิทิน ประกาศ |

**ข้อมูลอ่อนไหว**

- เลขบัตรประชาชนนักศึกษาแยกไว้ในตาราง `student_private` — เห็นได้เฉพาะ `admin` / `academic` / `registrar`
- รหัสผ่านไม่ถูกเก็บในตารางของระบบอีกต่อไป Supabase Auth เก็บเป็นแฮช bcrypt ให้
- ระบบเดิมเคยบันทึกรหัสผ่านใหม่แบบอ่านได้ลงชีต `password_log` — **ยกเลิกแล้ว**

---

## 8. การพัฒนาต่อ

### เพิ่มฟิลด์ใหม่

เพิ่ม `name="ชื่อฟิลด์"` ในฟอร์มได้เลย ระบบจะเก็บลง `extra` ให้อัตโนมัติ
เมื่อต้องการให้ค้นหา/เรียงลำดับได้ ค่อยเลื่อนขึ้นเป็นคอลัมน์จริง:

```sql
alter table public.student add column if not exists ชื่อฟิลด์ text;
update public.student set ชื่อฟิลด์ = extra->>'ชื่อฟิลด์' where extra ? 'ชื่อฟิลด์';
update public.student set extra = extra - 'ชื่อฟิลด์';
```

### ทดสอบบนเครื่องตัวเอง

```bash
npx serve .          # หรือ  python -m http.server 8080
```

แล้วเพิ่ม `http://localhost:8080` ใน Redirect URLs ของ Supabase

### ตรวจสอบความปลอดภัย

Supabase → **Advisors → Security** ควรไม่มีคำเตือนสีแดงค้างอยู่

---

## 9. ข้อควรระวัง

- ❌ **ห้าม** นำคีย์ `service_role` มาใส่ในไฟล์ใด ๆ ใน repo นี้
  (workflow มีด่านตรวจ ถ้าพบจะหยุด deploy ทันที)
- ✅ คีย์ที่อยู่ใน `config.js` เป็น *publishable key* ออกแบบมาให้เปิดเผยได้
- เมื่อบุคลากรลาออก ให้ตั้ง `is_active = '0'` ในตาราง `app_user`
  บัญชีนั้นจะเข้าระบบได้แต่มองไม่เห็นข้อมูลใด ๆ ทันที

---

พัฒนาระบบโดย **Oranit.R** นักวิชาการศึกษา · วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
