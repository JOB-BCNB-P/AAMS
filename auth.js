/* ================================================================
   auth.js — ระบบยืนยันตัวตนด้วย Supabase Auth
   ----------------------------------------------------------------
   แทนที่ระบบเดิม (Google ID token + ตรวจรหัสผ่านในชีต) ด้วย
   Supabase Auth เต็มรูปแบบ:

     บุคลากร  : อีเมล @bcn.ac.th + รหัสผ่าน  หรือ  ปุ่ม "เข้าสู่ระบบด้วย Google"
     นักศึกษา : เลขบัตรประชาชน 13 หลัก (ตรวจฝั่งเซิร์ฟเวอร์ผ่าน Edge Function)

   สิทธิ์การเข้าถึงข้อมูลจริงบังคับที่ฐานข้อมูล (Row Level Security)
   ไฟล์เว็บเป็น public บน GitHub Pages ได้อย่างปลอดภัย
   ================================================================ */
(function (global) {
  'use strict';

  var CFG = global.EMS_CONFIG || {};
  var ALLOWED_DOMAIN = (CFG.ALLOWED_DOMAIN || 'bcn.ac.th').toLowerCase();

  function db() { return global.EMSDB; }

  /* ---------- ตรวจโดเมนอีเมลของบุคลากร ---------- */
  function domainOk(email) {
    var e = String(email || '').toLowerCase();
    if (!e) return false;
    if (e.indexOf('@' + (CFG.STUDENT_EMAIL_DOMAIN || 'student.bcnb.local')) > -1) return true; // บัญชีนักศึกษา
    return new RegExp('@' + ALLOWED_DOMAIN.replace(/\./g, '\\.') + '$').test(e);
  }

  /* ---------- คืนค่า session ปัจจุบัน (ถ้ามี) ---------- */
  async function currentUserEmail() {
    try {
      var sess = await db().currentSession();
      return sess && sess.user ? String(sess.user.email || '') : '';
    } catch (e) { return ''; }
  }

  /* ---------- ด่านเปิดระบบ ----------
     ระบบเดิมเรียก EMSAuth.showGate(cb) ก่อนเชื่อมต่อฐานข้อมูล
     ตอนนี้ไม่ต้องมีด่านซ้อน — ให้เข้าหน้าเข้าสู่ระบบของระบบเองได้เลย  */
  var _pendingBoot = null;
  function showGate(onSuccess) {
    // app.js เดิมเรียกฟังก์ชันนี้ตอนโหลดไฟล์ เพื่อขอผ่านด่าน Google ก่อนเชื่อมฐานข้อมูล
    // ระบบใหม่บูตจาก app-patch.js (หลัง DOM พร้อม) จึงเก็บ callback ไว้เฉย ๆ ไม่เรียกซ้ำ
    _pendingBoot = onSuccess || null;
  }

  /* ---------- ออกจากระบบ ---------- */
  async function signOut() {
    try { await db().logout(); } catch (e) { /* ignore */ }
  }

  /* ---------- คืนสถานะการเข้าสู่ระบบ ---------- */
  async function isSignedIn() {
    var sess = null;
    try { sess = await db().currentSession(); } catch (e) { }
    return !!sess;
  }

  /* ---------- จัดการการกลับมาจาก Google OAuth ----------
     หลังผู้ใช้เลือกบัญชี Google แล้ว Supabase จะพากลับมาที่หน้านี้
     พร้อม session — ต้องตรวจโดเมนอีเมลอีกชั้นก่อนให้ผ่าน            */
  async function handleOAuthReturn() {
    var sess = null;
    try { sess = await db().currentSession(); } catch (e) { return null; }
    if (!sess || !sess.user) return null;

    var email = String(sess.user.email || '').toLowerCase();
    if (!domainOk(email)) {
      await signOut();
      return { blocked: true, email: email,
               error: 'อนุญาตเฉพาะบัญชีอีเมล @' + ALLOWED_DOMAIN + ' ของวิทยาลัยเท่านั้น (บัญชีที่ใช้: ' + email + ')' };
    }

    await db().loadSchema();
    var profile = await db().loadProfile();
    if (!profile) {
      var why = (typeof db().authBlockReason === 'function') ? db().authBlockReason() : null;
      await signOut();
      return { blocked: true, email: email,
               error: why || ('บัญชี ' + email + ' ยังไม่ได้ถูกกำหนดสิทธิ์ในระบบ กรุณาติดต่อผู้ดูแลระบบ') };
    }
    return { blocked: false, email: email, profile: profile };
  }

  /* ---------- ล้าง #access_token ออกจาก URL หลังล็อกอิน Google ---------- */
  function cleanUrlHash() {
    if (global.location.hash && /access_token|error=/.test(global.location.hash)) {
      try { history.replaceState(null, '', global.location.pathname + global.location.search); } catch (e) { }
    }
  }

  global.EMSAuth = {
    ALLOWED_DOMAIN: ALLOWED_DOMAIN,
    showGate: showGate,
    signOut: signOut,
    isSignedIn: isSignedIn,
    domainOk: domainOk,
    currentUserEmail: currentUserEmail,
    handleOAuthReturn: handleOAuthReturn,
    cleanUrlHash: cleanUrlHash,
    signInWithGoogle: function () { return db().loginWithGoogle(); }
  };
})(window);
