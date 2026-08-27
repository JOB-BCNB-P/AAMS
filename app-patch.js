/* ================================================================
   app-patch.js — ชั้นเชื่อมระบบเดิมเข้ากับ Supabase
   ----------------------------------------------------------------
   โหลดต่อจาก app.js เพื่อ "เขียนทับ" เฉพาะฟังก์ชันที่เกี่ยวกับ
   การเข้าสู่ระบบ / การตั้งค่าฐานข้อมูล  โดยไม่ต้องแก้ app.js
   (ไฟล์ app.js มีเกือบ 11,000 บรรทัด — การแก้ทับแบบนี้ปลอดภัยกว่า)

   สิ่งที่ทำ
     1. หน้าเข้าสู่ระบบใหม่  : บุคลากร = อีเมล+รหัสผ่าน / Google
                               นักศึกษา = เลขบัตรประชาชน
     2. บทบาทอ่านจากฐานข้อมูล (ตาราง app_user) ไม่ใช่จาก dropdown
     3. คืนสถานะอัตโนมัติเมื่อกลับเข้าหน้าเว็บ (session ยังไม่หมดอายุ)
     4. ตัวช่วย responsive: หุ้มตารางให้เลื่อนแนวนอนบนจอเล็กอัตโนมัติ
   ================================================================ */
(function () {
  'use strict';

  var CFG = window.EMS_CONFIG || {};
  var ROLE_LABEL = {
    admin: 'ผู้ดูแลระบบ', academic: 'เจ้าหน้าที่งานวิชาการ', registrar: 'เจ้าหน้าที่งานทะเบียน',
    deptHead: 'ประธานสาขาวิชา', executive: 'ผู้บริหาร', teacher: 'อาจารย์',
    classTeacher: 'อาจารย์ประจำชั้น', student: 'นักศึกษา'
  };

  function el(id) { return document.getElementById(id); }
  function setErr(msg) {
    var e = el('loginError');
    if (!e) return;
    if (!msg) { e.classList.add('hidden'); return; }
    e.innerHTML = msg; e.classList.remove('hidden');
  }
  function busy(on, text) {
    var b = el('loginSubmitBtn');
    if (!b) return;
    b.disabled = !!on;
    b.textContent = on ? (text || 'กำลังตรวจสอบ...') : 'เข้าสู่ระบบ';
  }

  /* ============================================================
     1) ช่องกรอกในหน้าเข้าสู่ระบบ
     ============================================================ */
  window.updateLoginFields = function updateLoginFields() {
    var mode = el('loginRole') ? el('loginRole').value : 'staff';
    var f = el('loginFields');
    if (!f) return;

    if (mode === 'student') {
      f.innerHTML =
        '<div class="mb-4">' +
        '  <label class="block text-sm font-medium text-gray-700 mb-2">เลขบัตรประชาชน 13 หลัก</label>' +
        '  <input type="text" id="studentNID" maxlength="13" inputmode="numeric" autocomplete="off"' +
        '    class="ems-input" placeholder="กรอกเลขบัตรประชาชน 13 หลัก"' +
        '    onkeypress="if(event.key===\'Enter\')handleLogin()">' +
        '</div>' +
        '<p class="text-xs text-gray-500 -mt-2 mb-1">ระบบจะสร้างบัญชีให้อัตโนมัติในการเข้าใช้ครั้งแรก</p>';
    } else {
      f.innerHTML =
        '<div class="mb-4">' +
        '  <label class="block text-sm font-medium text-gray-700 mb-2">อีเมลของวิทยาลัย</label>' +
        '  <input type="email" id="staffEmail" autocomplete="username" class="ems-input"' +
        '    placeholder="ชื่อผู้ใช้@' + (CFG.ALLOWED_DOMAIN || 'bcn.ac.th') + '">' +
        '</div>' +
        '<div class="mb-3">' +
        '  <label class="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>' +
        '  <input type="password" id="staffPass" autocomplete="current-password" class="ems-input"' +
        '    placeholder="รหัสผ่าน" onkeypress="if(event.key===\'Enter\')handleLogin()">' +
        '</div>' +
        '<div class="text-right -mt-1 mb-1">' +
        '  <button type="button" onclick="showPasswordOtpModal(\'forgot\')" class="text-sm text-primary hover:underline">ลืมรหัสผ่าน?</button>' +
        '</div>';
    }
  };

  /* ============================================================
     2) เข้าสู่ระบบ
     ============================================================ */
  window.handleLogin = async function handleLogin() {
    var mode = el('loginRole') ? el('loginRole').value : 'staff';
    setErr('');

    if (mode === 'student') {
      var nid = (el('studentNID') && el('studentNID').value || '').trim();
      if (!/^\d{13}$/.test(nid)) { setErr('กรุณากรอกเลขบัตรประชาชน 13 หลัก'); return; }
      busy(true);
      showScreen('loadingScreen');
      var sres = await GSheetDB.studentLogin(nid);
      busy(false);
      if (!sres || !sres.isOk) {
        showScreen('loginScreen');
        setErr(sres && sres.error ? sres.error : 'ไม่พบข้อมูลนักศึกษา กรุณาตรวจสอบเลขบัตรประชาชน');
        return;
      }
      var stu = sres.student || {};
      if (norm(stu.status) === 'สำเร็จการศึกษา' || norm(stu.year_level) === 'จบ') {
        await GSheetDB.logout();
        showScreen('loginScreen');
        setErr('บัญชีนี้เป็นผู้สำเร็จการศึกษาแล้ว ไม่สามารถเข้าสู่ระบบได้');
        return;
      }
      await emsEnterApp(GSheetDB.profile() || { role: 'student', name: stu.name, student: stu });
      return;
    }

    // ---------- บุคลากร ----------
    var email = (el('staffEmail') && el('staffEmail').value || '').trim();
    var pass = (el('staffPass') && el('staffPass').value) || '';
    if (!email) { setErr('กรุณากรอกอีเมล'); return; }
    if (!pass) { setErr('กรุณากรอกรหัสผ่าน'); return; }
    if (!EMSAuth.domainOk(email)) {
      setErr('อนุญาตเฉพาะอีเมล @' + (CFG.ALLOWED_DOMAIN || 'bcn.ac.th') + ' ของวิทยาลัยเท่านั้น');
      return;
    }

    busy(true);
    var res = await GSheetDB.login({ identifier: email, password: pass });
    busy(false);
    if (!res || !res.isOk) { setErr((res && res.error) || 'เข้าสู่ระบบไม่สำเร็จ'); return; }

    showScreen('loadingScreen');
    await emsEnterApp(res.user);
  };

  /* ---------- ปุ่มเข้าสู่ระบบด้วย Google ---------- */
  window.handleGoogleLogin = async function handleGoogleLogin() {
    setErr('');
    var r = await GSheetDB.loginWithGoogle();
    if (!r.isOk) setErr('เปิดหน้าลงชื่อเข้าใช้ Google ไม่สำเร็จ: ' + r.error);
  };

  /* ============================================================
     3) เข้าสู่หน้าหลัก — ประกอบ APP.currentUser จากบทบาทในฐานข้อมูล
     ============================================================ */
  window.emsEnterApp = async function emsEnterApp(profile) {
    var role = (profile && profile.role) || 'guest';
    var nameL = String((profile && profile.name) || '').trim().toLowerCase();
    var email = String((profile && profile.email) || '').trim().toLowerCase();

    showScreen('loadingScreen');
    await GSheetDB.refresh();

    var t, dept;
    if (role === 'student') {
      var stu = (profile && profile.student) || {};
      APP.currentUser = { name: stu.name || profile.name || 'นักศึกษา', role: 'student', data: stu };
    } else if (role === 'teacher' || role === 'classTeacher') {
      t = getDataByType('teacher').find(function (x) {
        return (x.email || '').trim().toLowerCase() === email ||
               (x.name || '').trim().toLowerCase() === nameL;
      });
      APP.currentUser = t
        ? { name: t.name, role: role, data: t, email: email,
            responsible_year: t.responsible_year || profile.responsible_year || '1' }
        : { name: profile.name || email, role: role, email: email,
            responsible_year: profile.responsible_year || '1' };
    } else if (role === 'deptHead') {
      t = getDataByType('teacher').find(function (x) {
        return (x.name || '').trim().toLowerCase() === nameL || (x.email || '').trim().toLowerCase() === email;
      });
      dept = t ? norm(t.department) : '';
      if (!dept) {
        var td = getDataByType('teacher_directory').find(function (x) {
          return (x.name || '').trim().toLowerCase() === nameL;
        });
        if (td) dept = norm(td.nursing_branch);
      }
      if (!dept) dept = norm(profile.department);
      APP.currentUser = { name: profile.name || email, role: 'deptHead', department: dept, email: email };
    } else {
      APP.currentUser = { name: profile.name || email || ROLE_LABEL[role] || 'ผู้ใช้', role: role, email: email };
    }

    APP.currentRole = APP.currentUser.role;

    try {
      var ident = (APP.currentRole === 'student' && APP.currentUser.data)
        ? (APP.currentUser.data.student_id || '') : (APP.currentUser.email || '');
      logLoginEvent('login', { name: APP.currentUser.name, role: APP.currentRole, identifier: ident });
    } catch (e) { /* ignore */ }

    showScreen('mainApp');
    if (el('currentUserName')) el('currentUserName').textContent = APP.currentUser.name;
    if (el('currentUserRole')) el('currentUserRole').textContent = ROLE_LABEL[APP.currentRole] || '';
    var cpb = el('changePwBtn');
    if (cpb) cpb.classList.toggle('hidden', APP.currentRole === 'student');

    buildSidebar();
    navigateTo('dashboard');
    updateNotifBadge();
    if (window.lucide) lucide.createIcons();
  };

  /* ============================================================
     4) ออกจากระบบ
     ============================================================ */
  window.handleLogout = async function handleLogout() {
    try {
      if (APP.currentUser) {
        var ident = (APP.currentRole === 'student' && APP.currentUser.data)
          ? (APP.currentUser.data.student_id || '') : (APP.currentUser.email || '');
        logLoginEvent('logout', { name: APP.currentUser.name, role: APP.currentRole, identifier: ident });
      }
    } catch (e) { /* ignore */ }

    await GSheetDB.logout();
    APP.currentUser = null; APP.currentRole = null; APP.currentPage = 'dashboard'; APP.allData = [];
    var cpb = el('changePwBtn');
    if (cpb) cpb.classList.add('hidden');
    showScreen('loginScreen');
    setErr('');
    window.updateLoginFields();
  };

  /* ============================================================
     5) รีเฟรชข้อมูล
     ============================================================ */
  window.refreshData = async function refreshData() {
    showToast('กำลังรีเฟรชข้อมูล...');
    await GSheetDB.refresh();
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
    showToast('รีเฟรชข้อมูลสำเร็จ');
  };

  // หน้าตั้งค่า Google Sheet ไม่ใช้แล้ว
  window.saveGSheetConfig = function () { showScreen('loginScreen'); };
  window.saveAdminGSheetConfig = function () {
    if (typeof showToast === 'function') showToast('ระบบใช้ฐานข้อมูล Supabase แล้ว ไม่ต้องตั้งค่า Google Sheet', 'success');
  };

  /* ============================================================
     6) บูตระบบ — คืนสถานะถ้ายังมี session เดิม / กลับจาก Google
     ============================================================ */
  window.__emsBoot = async function __emsBoot() {
    showScreen('loadingScreen');
    var r = await GSheetDB.init({}, function (data) {
      normalizeSubjectCodes(data);
      APP.allData = data;
      loadPermissions();
      if (APP.currentUser) { buildSidebar(); renderCurrentPage(); }
      updateNotifBadge();
    });
    if (!r.isOk) {
      document.body.innerHTML =
        '<div class="min-h-screen flex flex-col items-center justify-center text-center p-6 bg-gray-50">' +
        '<h2 class="text-2xl font-bold text-red-500 mb-2">เชื่อมต่อฐานข้อมูลไม่สำเร็จ 🚨</h2>' +
        '<p class="text-gray-600">' + (r.error || 'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต') + '</p></div>';
      return;
    }

    var back = await EMSAuth.handleOAuthReturn();
    EMSAuth.cleanUrlHash();

    if (back && back.blocked) {
      showScreen('loginScreen');
      window.updateLoginFields();
      setErr(back.error);
      return;
    }
    if (back && back.profile) { await emsEnterApp(back.profile); return; }

    showScreen('loginScreen');
    window.updateLoginFields();
  };

  /* ============================================================
     7) ตัวช่วย responsive — หุ้มตารางให้เลื่อนแนวนอนได้เองบนจอเล็ก
     ============================================================ */
  function wrapTables(root) {
    (root || document).querySelectorAll('table').forEach(function (t) {
      if (t.closest('.ems-tablewrap')) return;
      var w = document.createElement('div');
      w.className = 'ems-tablewrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
  }
  window.emsWrapTables = wrapTables;

  document.addEventListener('DOMContentLoaded', function () {
    ['mainContent', 'modalContainer'].forEach(function (id) {
      var node = el(id);
      if (!node) return;
      new MutationObserver(function () { wrapTables(node); }).observe(node, { childList: true, subtree: true });
    });
    wrapTables(document);
    if (typeof window.__emsBoot === 'function') window.__emsBoot();
  });
})();
