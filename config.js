/* ================================================================
   config.js — ค่าตั้งต้นของระบบ AAMS / EMS-BCNB
   ----------------------------------------------------------------
   ไฟล์นี้ commit ขึ้น GitHub ได้อย่างปลอดภัย
   เพราะ "publishable key" ของ Supabase ถูกออกแบบมาให้เปิดเผยได้
   ความปลอดภัยจริงอยู่ที่ Row Level Security (RLS) ในฐานข้อมูล
   ⚠ ห้ามนำ "คีย์ลับระดับเซิร์ฟเวอร์" (secret key) ของ Supabase มาใส่ในไฟล์นี้เด็ดขาด
   ================================================================ */
window.EMS_CONFIG = {
  // --- Supabase ---
  SUPABASE_URL: 'https://xqpbwvbvrowsbwolxhan.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Rnlb_3Yd7D2Ma1XgMsRlSg_8wMj0Nfb',

  // --- โดเมนอีเมลของวิทยาลัย (บุคลากรเข้าสู่ระบบด้วยบัญชีนี้เท่านั้น) ---
  ALLOWED_DOMAIN: 'bcn.ac.th',

  // --- โดเมนภายในสำหรับบัญชีนักศึกษา (ระบบสร้างให้อัตโนมัติ ไม่ต้องมีอีเมลจริง) ---
  STUDENT_EMAIL_DOMAIN: 'student.bcnb.local',

  // --- ข้อความหัวระบบ ---
  SYSTEM_TITLE: 'ระบบบริหารจัดการงานวิชาการ (AAMs)',
  COLLEGE_NAME: 'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ',

  // --- โลโก้/รูป ---
  LOGO_URL: 'https://cdn.jsdelivr.net/gh/JOB-BCNB-P/LOGO/Logo%20Thai.png',
  LOADING_GIF: 'https://cdn.jsdelivr.net/gh/JOB-BCNB-P/picture/cat_pose_white.gif',

  // --- เปิด/ปิดปุ่มเข้าสู่ระบบด้วย Google ---
  ENABLE_GOOGLE_LOGIN: true,

  // --- เมนู "ระบบการลาของนักศึกษา" ---
  // ระบบเดิมปิดเมนูนี้ไว้เอง (แยกไปทำเป็นระบบต่างหาก)
  // เปลี่ยนเป็น true เมื่อต้องการให้กลับมาแสดงในแถบเมนู
  ENABLE_LEAVE_MENU: true
};
