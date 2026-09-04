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

  // ผู้ใช้กดลิงก์ "Reset password" ในอีเมล → กลับมาที่หน้านี้พร้อม #type=recovery
  // ต้องอ่านค่าไว้ตั้งแต่ตอนโหลดสคริปต์ เพราะไลบรารี Supabase จะล้าง hash ทิ้งหลังสร้าง session
  var IS_RECOVERY = /[#&]type=recovery/.test(window.location.hash || '');
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

    var btn = el('loginSubmitBtn');
    var divider = el('loginOrDivider');
    var gbox = el('googleLoginBox');

    if (mode === 'student') {
      /* ---------- นักศึกษา: เลขบัตรประชาชน 13 หลัก ---------- */
      f.innerHTML =
        '<div class="mb-4">' +
        '  <label class="block text-sm font-medium text-gray-700 mb-2">เลขบัตรประชาชน 13 หลัก</label>' +
        '  <input type="text" id="studentNID" maxlength="13" inputmode="numeric" autocomplete="off"' +
        '    class="ems-input" placeholder="กรอกเลขบัตรประชาชน 13 หลัก"' +
        '    onkeypress="if(event.key===\'Enter\')handleLogin()">' +
        '</div>' +
        '<div class="bg-blue-50 border border-blue-100 rounded-xl p-3 -mt-1 mb-1">' +
        '  <p class="text-xs text-gray-600">ระบบจะสร้างบัญชีให้อัตโนมัติในการเข้าใช้ครั้งแรก</p>' +
        '  <p class="text-xs text-gray-600 mt-1">หรือกดปุ่ม <b>เข้าสู่ระบบด้วย Google</b> ด้านล่าง ' +
        '     ด้วยบัญชีของวิทยาลัย (<b>รหัสนักศึกษา@' + (CFG.ALLOWED_DOMAIN || 'bcn.ac.th') + '</b>)</p>' +
        '  <p class="text-xs text-gray-500 mt-1">หากเข้าสู่ระบบไม่ได้ กรุณาติดต่องานทะเบียนเพื่อตรวจสอบข้อมูล</p>' +
        '</div>';
      if (btn) { btn.classList.remove('hidden'); btn.style.display = ''; }
      if (divider) divider.classList.remove('hidden');
      if (gbox) gbox.classList.remove('hidden');   // นักศึกษาเลือกได้ทั้งเลขบัตรประชาชนและ Google
    } else {
      /* ---------- บุคลากร/อาจารย์: เข้าสู่ระบบด้วย Google เท่านั้น ---------- */
      f.innerHTML =
        '<div class="bg-blue-50 border border-blue-100 rounded-xl p-4">' +
        '  <p class="text-sm text-gray-700 font-medium mb-1">เข้าสู่ระบบด้วยบัญชี Google ของวิทยาลัย</p>' +
        '  <p class="text-xs text-gray-600">ใช้อีเมล <b>@' + (CFG.ALLOWED_DOMAIN || 'bcn.ac.th') + '</b> ' +
        '     กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ ไม่ต้องจำรหัสผ่านแยกอีกต่อไป</p>' +
        '</div>';
      if (btn) { btn.classList.add('hidden'); btn.style.display = 'none'; }
      if (divider) divider.classList.add('hidden');
      if (gbox) gbox.classList.remove('hidden');
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

    // ---------- บุคลากร/อาจารย์: Google เท่านั้น ----------
    if (typeof window.handleGoogleLogin === 'function') { window.handleGoogleLogin(); return; }

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
  // ประกอบ APP.currentUser ตาม "บทบาทที่กำลังใช้งาน" — แยกออกมาเพื่อให้สลับมุมมองได้
  function emsApplyRole(role, profile) {
    var nameL = String((profile && profile.name) || '').trim().toLowerCase();
    var email = String((profile && profile.email) || '').trim().toLowerCase();
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
  }

  window.emsEnterApp = async function emsEnterApp(profile) {
    var role = (profile && profile.role) || 'guest';

    showScreen('loadingScreen');
    await GSheetDB.refresh();

    // บทบาททั้งหมดที่ผู้ใช้คนนี้ถืออยู่ (สิทธิ์ในฐานข้อมูลเป็นผลรวมของทุกบทบาทเสมอ
    // ส่วนตัวเลือกนี้เปลี่ยนแค่ "มุมมอง" ว่าจะทำงานในฐานะบทบาทไหน)
    window.__emsProfile = profile;
    window.__emsRealProfile = profile;   // โปรไฟล์จริง (ใช้ตอนออกจากโหมดดูแทนผู้ใช้)
    APP._viewAs = null;
    APP._roles = (profile && Array.isArray(profile.roles) && profile.roles.length)
      ? profile.roles.slice() : [role];
    APP._roles.sort(function (a, b) { return (a === role ? -1 : 0) - (b === role ? -1 : 0); });

    emsApplyRole(role, profile);

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
    emsRenderRoleSwitcher();
    if (window.lucide) lucide.createIcons();
  };

  /* ---------- สลับมุมมองบทบาท (สำหรับผู้ที่มีหลายบทบาท) ----------
     เปลี่ยนเฉพาะหน้าจอที่เห็น ไม่ได้เปลี่ยนสิทธิ์ — สิทธิ์ถูกกำหนดไว้ในฐานข้อมูล
     เป็นผลรวมของทุกบทบาทอยู่แล้ว จึงปลอมแปลงจากฝั่งเบราว์เซอร์ไม่ได้            */
  window.emsSwitchRole = function emsSwitchRole(r) {
    if (!r || r === APP.currentRole || !window.__emsProfile) return;
    emsApplyRole(r, window.__emsProfile);
    if (el('currentUserRole')) el('currentUserRole').textContent = ROLE_LABEL[APP.currentRole] || '';
    var cpb = el('changePwBtn');
    if (cpb) cpb.classList.toggle('hidden', APP.currentRole === 'student');
    buildSidebar();
    navigateTo('dashboard');
    emsRenderRoleSwitcher();
    if (window.lucide) lucide.createIcons();
    if (window.showToast) showToast('มุมมอง: ' + (ROLE_LABEL[APP.currentRole] || APP.currentRole));
  };

  function emsRenderRoleSwitcher() {
    var host = document.querySelector('.ems-header-actions');
    if (!host) return;
    var sel = el('emsRoleSwitch');
    if (!APP._roles || APP._roles.length < 2) { if (sel) sel.remove(); return; }
    if (!sel) {
      sel = document.createElement('select');
      sel.id = 'emsRoleSwitch';
      sel.title = 'สลับมุมมองบทบาท';
      sel.setAttribute('aria-label', 'สลับมุมมองบทบาท');
      sel.className = 'text-xs border border-gray-200 rounded-xl px-2 py-1.5 bg-white text-gray-700 max-w-[9rem] truncate';
      sel.setAttribute('onchange', 'emsSwitchRole(this.value)');
      host.insertBefore(sel, host.firstChild);
    }
    sel.innerHTML = APP._roles.map(function (r) {
      return '<option value="' + r + '"' + (r === APP.currentRole ? ' selected' : '') +
             '>' + (ROLE_LABEL[r] || r) + '</option>';
    }).join('');
  }

  /* ============================================================
     4) ออกจากระบบ
     ============================================================ */
  window.handleLogout = async function handleLogout() {
    // ออกจากโหมดดูแทนผู้ใช้ก่อนเสมอ เพื่อไม่ให้บันทึก log ในชื่อคนอื่น
    if (APP._viewAs) {
      logViewAs('view_as_exit', APP._viewAs);
      APP._viewAs = null;
      viewAsBanner();
      if (window.__emsRealProfile) {
        window.__emsProfile = window.__emsRealProfile;
        emsApplyRole(window.__emsRealProfile.role, window.__emsRealProfile);
      }
    }
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
     5.5) ลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน
     ------------------------------------------------------------
     Supabase ส่ง "ลิงก์" ทางอีเมล (ไม่ใช่รหัส 6 หลักแบบระบบเดิม)
     ผู้ใช้กดลิงก์ → กลับมาที่หน้านี้พร้อมสิทธิ์ตั้งรหัสใหม่ชั่วคราว
     ============================================================ */
  window.showPasswordOtpModal = function showPasswordOtpModal(mode) {
    // นักศึกษาเปลี่ยน/ตั้งรหัสผ่านใหม่ไม่ได้ (ใช้เลขบัตรประชาชนเป็นรหัสผ่าน)
    if (APP.currentRole === 'student') {
      if (typeof showToast === 'function') {
        showToast('นักศึกษาเข้าสู่ระบบด้วยเลขบัตรประชาชน จึงไม่มีรหัสผ่านให้เปลี่ยน', 'error');
      }
      return;
    }
    if (mode === 'change') {
      showModal('เปลี่ยนรหัสผ่าน',
        '<div class="space-y-3">' +
        '  <div><label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่</label>' +
        '    <input id="pwNew1" type="password" class="ems-input" placeholder="อย่างน้อย 8 ตัวอักษร" autocomplete="new-password"></div>' +
        '  <div><label class="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่านใหม่</label>' +
        '    <input id="pwNew2" type="password" class="ems-input" placeholder="พิมพ์ซ้ำอีกครั้ง" autocomplete="new-password"></div>' +
        '  <div id="pwMsg" class="hidden text-sm rounded-xl p-3"></div>' +
        '</div>',
        window.emsSubmitNewPassword);
      return;
    }

    showModal('ลืมรหัสผ่าน',
      '<div class="space-y-3">' +
      '  <p class="text-sm text-gray-600">กรอกอีเมลของวิทยาลัย ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p>' +
      '  <input id="pwEmail" type="email" class="ems-input" placeholder="ชื่อผู้ใช้@' + (CFG.ALLOWED_DOMAIN || 'bcn.ac.th') + '" autocomplete="username">' +
      '  <div id="pwMsg" class="hidden text-sm rounded-xl p-3"></div>' +
      '  <p class="text-xs text-gray-500">เมื่อได้รับอีเมลแล้วให้กดปุ่ม <b>Reset password</b> ในอีเมล ' +
      '     ระบบจะพากลับมาที่หน้านี้เพื่อตั้งรหัสใหม่</p>' +
      '</div>',
      window.emsSendRecoveryEmail);
  };

  function pwMsg(text, kind) {
    var box = el('pwMsg');
    if (!box) return;
    box.textContent = text;
    box.className = (kind === 'err')
      ? 'text-sm rounded-xl p-3 bg-red-50 border border-red-200 text-red-700'
      : 'text-sm rounded-xl p-3 bg-emerald-50 border border-emerald-200 text-emerald-800';
  }

  window.emsSendRecoveryEmail = async function () {
    var email = (el('pwEmail') && el('pwEmail').value || '').trim().toLowerCase();
    if (!email) { pwMsg('กรุณากรอกอีเมล', 'err'); return; }
    var r = await GSheetDB.requestPasswordOtp(email);
    if (r.isOk) pwMsg('ส่งอีเมลแล้ว — กรุณาเปิดกล่องจดหมายและกดลิงก์ในอีเมลภายใน 1 ชั่วโมง', 'ok');
    else pwMsg(r.error || 'ส่งอีเมลไม่สำเร็จ', 'err');
  };

  window.emsSubmitNewPassword = async function () {
    var a = (el('pwNew1') && el('pwNew1').value) || '';
    var b = (el('pwNew2') && el('pwNew2').value) || '';
    if (a.length < 8) { pwMsg('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร', 'err'); return; }
    if (a !== b) { pwMsg('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'err'); return; }
    var r = await GSheetDB.changePassword(a);
    if (!r.isOk) { pwMsg(r.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ', 'err'); return; }
    pwMsg('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'ok');
    setTimeout(function () { closeModal(); if (typeof showToast === 'function') showToast('เปลี่ยนรหัสผ่านเรียบร้อย'); }, 900);
  };

  // หน้าตั้งรหัสผ่านใหม่ หลังกดลิงก์จากอีเมล
  async function showRecoveryScreen() {
    showScreen('loginScreen');
    window.updateLoginFields();
    setErr('');
    showModal('ตั้งรหัสผ่านใหม่',
      '<div class="space-y-3">' +
      '  <p class="text-sm text-gray-600">ยืนยันตัวตนจากอีเมลเรียบร้อยแล้ว กรุณาตั้งรหัสผ่านใหม่</p>' +
      '  <div><label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่</label>' +
      '    <input id="pwNew1" type="password" class="ems-input" placeholder="อย่างน้อย 8 ตัวอักษร" autocomplete="new-password"></div>' +
      '  <div><label class="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่านใหม่</label>' +
      '    <input id="pwNew2" type="password" class="ems-input" placeholder="พิมพ์ซ้ำอีกครั้ง" autocomplete="new-password"></div>' +
      '  <div id="pwMsg" class="hidden text-sm rounded-xl p-3"></div>' +
      '</div>',
      async function () {
        var a = (el('pwNew1') && el('pwNew1').value) || '';
        var b = (el('pwNew2') && el('pwNew2').value) || '';
        if (a.length < 8) { pwMsg('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร', 'err'); return; }
        if (a !== b) { pwMsg('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'err'); return; }
        var r = await GSheetDB.changePassword(a);
        if (!r.isOk) { pwMsg(r.error || 'ตั้งรหัสผ่านไม่สำเร็จ', 'err'); return; }
        pwMsg('ตั้งรหัสผ่านใหม่เรียบร้อย กำลังพาเข้าสู่ระบบ...', 'ok');
        setTimeout(async function () {
          closeModal();
          var p = await GSheetDB.loadProfile();
          if (p) await emsEnterApp(p);
        }, 900);
      });
  }

  /* ============================================================
     6) บูตระบบ — คืนสถานะถ้ายังมี session เดิม / กลับจาก Google
     ============================================================ */
  window.__emsBoot = async function __emsBoot() {
    // ชื่อระบบ/ชื่อวิทยาลัยมาจาก config.js ที่เดียว (ใช้ในใบรายงานผลและหน้าพิมพ์ด้วย)
    APP.config = APP.config || {};
    if (CFG.SYSTEM_TITLE) APP.config.system_title = CFG.SYSTEM_TITLE;
    if (CFG.COLLEGE_NAME) APP.config.college_name = CFG.COLLEGE_NAME;

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

    // กลับมาจากลิงก์ตั้งรหัสผ่านใหม่ในอีเมล
    if (IS_RECOVERY) {
      var rsess = await GSheetDB.currentSession();
      EMSAuth.cleanUrlHash();
      if (rsess) { await showRecoveryScreen(); return; }
      showScreen('loginScreen');
      window.updateLoginFields();
      setErr('ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว กรุณากด "ลืมรหัสผ่าน?" เพื่อขอลิงก์ใหม่');
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
     6.5) เมนู "ระบบการลาของนักศึกษา"
     ------------------------------------------------------------
     app.js เดิมปิดเมนูนี้ไว้ (คอมเมนต์ทิ้งไว้ในฟังก์ชัน buildSidebar)
     ที่นี่จึงแทรกกลับเข้าไปเมื่อเปิดสวิตช์ ENABLE_LEAVE_MENU ใน config.js
     โดยไม่ต้องแก้ app.js
     ============================================================ */
  (function () {
    var original = window.buildSidebar;
    if (typeof original !== 'function') return;
    window.buildSidebar = function () {
      original.apply(this, arguments);
      if (!CFG.ENABLE_LEAVE_MENU) return;
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.leave) return;
      var nav = el('sidebarNav');
      if (!nav || nav.querySelector('[data-page="leave"]')) return;
      var btn = document.createElement('button');
      btn.setAttribute('onclick', "navigateTo('leave')");
      btn.setAttribute('data-page', 'leave');
      btn.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
      btn.innerHTML = '<i data-lucide="calendar-off" class="w-5 h-5 flex-shrink-0"></i>ระบบการลาของนักศึกษา';
      // วางไว้ก่อนเมนู "แบบประเมินความพึงพอใจ" ถ้ามี ไม่งั้นต่อท้าย
      var before = nav.querySelector('[data-page="survey"], [data-page="surveyManage"], [data-page="services"]');
      if (before) nav.insertBefore(btn, before); else nav.appendChild(btn);
      if (window.lucide) lucide.createIcons();
    };
  })();

  /* ============================================================
     6.7) แนบไฟล์ PDF ในหน้าติดตามการส่ง (ใช้ร่วมกันทั้ง 4 หน้า)
     ------------------------------------------------------------
     เดิมเป็นการ "วางลิงก์" Google Drive — เปลี่ยนเป็น "อัปโหลดไฟล์"
     ไฟล์เก็บใน Supabase Storage ถังปิด ตั้งชื่อตามรหัสแถว
     อัปโหลดใหม่จึงทับไฟล์เดิมทันที ไม่ต้องลบเอง
     ============================================================ */
  // ไฟล์ที่ย้ายไป Google Drive แล้วเก็บเป็นข้อความ  gd:<รหัสไฟล์>
  // เก็บเป็น "รหัสไฟล์" ไม่ใช่ที่อยู่ ลิงก์จึงไม่เสียแม้มีคนเปลี่ยนชื่อหรือย้ายโฟลเดอร์ใน Drive
  function isDriveFile(link) { return typeof link === 'string' && link.indexOf('gd:') === 0; }
  function driveViewUrl(link) { return 'https://drive.google.com/file/d/' + String(link).slice(3) + '/view'; }
  window.emsIsDriveFile = isDriveFile;
  window.emsDriveViewUrl = driveViewUrl;

  window.promptTrackingFileLink = function promptTrackingFileLink(id) {
    var rec = APP.allData.find(function (d) { return d.__backendId === id; });
    if (!rec) return;

    var stored = GSheetDB.isStoredFile(rec.file_link) || isDriveFile(rec.file_link);
    var hasLink = !!(rec.file_link || '').trim();
    var currentHtml = '';
    if (stored) {
      currentHtml =
        '<div class="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">' +
        '  <div class="min-w-0">' +
        '    <p class="text-sm font-medium text-emerald-800">มีไฟล์แนบอยู่แล้ว</p>' +
        '    <p class="text-xs text-emerald-700 truncate">' + (rec.file_name || 'ไฟล์ PDF') + '</p>' +
        '    <p class="text-[11px] text-emerald-600 mt-0.5">เก็บที่ ' + (isDriveFile(rec.file_link) ? 'Google Drive ของวิทยาลัย' : 'พื้นที่จัดเก็บของระบบ') + '</p>' +
        '  </div>' +
        '  <div class="flex gap-2 flex-shrink-0">' +
        '    <button type="button" onclick="emsOpenTrackingFile(\'' + id + '\')" class="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-xs">เปิดดู</button>' +
        '    <button type="button" onclick="emsRemoveTrackingFile(\'' + id + '\')" class="px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs">ลบไฟล์</button>' +
        '  </div>' +
        '</div>';
    } else if (hasLink) {
      currentHtml =
        '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">' +
        '  <p class="font-medium text-amber-800 mb-1">ตอนนี้เป็นลิงก์ภายนอก (ของเดิม)</p>' +
        '  <a href="' + rec.file_link + '" target="_blank" rel="noopener" class="text-xs text-amber-700 underline break-all">' + rec.file_link + '</a>' +
        '  <p class="text-xs text-amber-700 mt-2">อัปโหลดไฟล์ด้านล่างเพื่อเปลี่ยนมาเก็บในระบบแทน</p>' +
        '</div>';
    }

    showModal('ไฟล์ PDF ของรายวิชา',
      '<div class="space-y-3">' +
      '  <div class="bg-blue-50 rounded-xl p-3 text-sm space-y-1">' +
      '    <p><span class="text-gray-500">รายวิชา:</span> <strong>' + (rec.subject_name || '-') + '</strong></p>' +
      '    <p><span class="text-gray-500">ภาค/ปี:</span> <strong>' + semLabel(rec.semester) + '/' + (rec.academic_year || '') + '</strong></p>' +
      '  </div>' +
      currentHtml +
      '  <div>' +
      '    <label class="block text-sm font-medium text-gray-700 mb-1">' + (stored ? 'อัปโหลดไฟล์ใหม่ทับไฟล์เดิม' : 'เลือกไฟล์ PDF') + '</label>' +
      '    <input type="file" id="emsPdfInput" accept="application/pdf,.pdf" class="ems-input !py-2">' +
      '    <p class="text-xs text-gray-500 mt-1">รองรับเฉพาะไฟล์ PDF ขนาดไม่เกิน 20 MB</p>' +
      '  </div>' +
      '  <div id="emsPdfMsg" class="hidden text-sm rounded-xl p-3"></div>' +
      '  <button type="button" id="emsPdfBtn" onclick="emsUploadTrackingFile(\'' + id + '\')" class="ems-btn-primary w-full inline-flex items-center justify-center">' +
      (stored ? 'อัปโหลดทับไฟล์เดิม' : 'อัปโหลดไฟล์') + '</button>' +
      '</div>');
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 50);
  };

  function pdfMsg(text, kind) {
    var box = el('emsPdfMsg');
    if (!box) return;
    box.textContent = text;
    box.className = (kind === 'err')
      ? 'text-sm rounded-xl p-3 bg-red-50 border border-red-200 text-red-700'
      : 'text-sm rounded-xl p-3 bg-emerald-50 border border-emerald-200 text-emerald-800';
  }

  // เรียก Edge Function "drive-sync" ให้ย้ายไฟล์จากพื้นที่พักไปยังไดรฟ์ที่แชร์ของวิทยาลัย
  async function emsDriveSync(rec, storagePath, originalName) {
    try {
      var code = String(rec.subject_code || '').trim();
      var name = String(rec.subject_name || '').trim();
      var nice = [code, name].filter(Boolean).join(' ');
      var sem = String(rec.semester || '').trim();
      var yr = String(rec.academic_year || '').trim();
      var suffix = (sem ? ' ภาค' + sem : '') + (yr ? '-' + yr : '');
      var driveName = nice ? (nice + suffix + '.pdf') : originalName;
      var existing = (String(rec.file_link || '').indexOf('gd:') === 0)
        ? String(rec.file_link).slice(3) : '';

      var res = await GSheetDB.client().functions.invoke('drive-sync', {
        body: {
          mode: 'sync', table: rec.type, storagePath: storagePath,
          year: yr, filename: driveName, existingFileId: existing
        }
      });
      if (res.error) {
        var detail = (res.error && res.error.message) || 'เชื่อมต่อ Google Drive ไม่สำเร็จ';
        try { var j = await res.error.context.json(); if (j && j.error) detail = j.error; } catch (e) { }
        return { isOk: false, error: detail };
      }
      return res.data || { isOk: false, error: 'ไม่มีข้อมูลตอบกลับ' };
    } catch (err) {
      return { isOk: false, error: String(err) };
    }
  }
  window.emsDriveSync = emsDriveSync;

  // ตรวจการเชื่อมต่อ Google Drive (ใช้หลังตั้งค่า Secrets เสร็จ) — เรียกจาก Console ได้
  window.emsDriveCheck = async function emsDriveCheck() {
    var res = await GSheetDB.client().functions.invoke('drive-sync', { body: { mode: 'check' } });
    if (res.error) {
      var detail = (res.error && res.error.message) || 'เชื่อมต่อไม่สำเร็จ';
      try { var j = await res.error.context.json(); if (j && j.error) detail = j.error; } catch (e) { }
      console.error('Drive:', detail);
      if (window.showToast) showToast(detail, 'error');
      return { isOk: false, error: detail };
    }
    console.log('Drive:', res.data);
    if (window.showToast) showToast(res.data && res.data.isOk
      ? 'เชื่อมต่อ Google Drive สำเร็จ: ' + res.data['ไดรฟ์ที่แชร์']
      : (res.data && res.data.error) || 'ตรวจไม่สำเร็จ', res.data && res.data.isOk ? 'success' : 'error');
    return res.data;
  };

  window.emsUploadTrackingFile = async function (id) {
    var rec = APP.allData.find(function (d) { return d.__backendId === id; });
    if (!rec) return;
    var input = el('emsPdfInput');
    var file = input && input.files && input.files[0];
    if (!file) { pdfMsg('กรุณาเลือกไฟล์ PDF ก่อน', 'err'); return; }

    var btn = el('emsPdfBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...'; }
    pdfMsg('กำลังอัปโหลด ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)');

    var up = await GSheetDB.uploadFile(rec.type, rec.__rowIndex, file);
    if (!up.isOk) {
      pdfMsg(up.error, 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'อัปโหลดไฟล์'; }
      return;
    }

    rec.file_link = up.link;
    rec.file_name = file.name;

    // ---- ย้ายต่อไปเก็บที่ Google Drive ของวิทยาลัย (แยกปีการศึกษา/หมวดเอกสาร) ----
    // ถ้าย้ายไม่สำเร็จ ไฟล์ยังอยู่ในพื้นที่จัดเก็บของระบบและใช้งานได้ตามปกติ
    pdfMsg('กำลังย้ายไฟล์ไปเก็บที่ Google Drive...');
    var sync = await emsDriveSync(rec, up.path, file.name);
    if (sync.isOk) {
      rec.file_link = 'gd:' + sync.fileId;
    }

    var r = await GSheetDB.update(rec);
    if (btn) { btn.disabled = false; btn.textContent = 'อัปโหลดไฟล์'; }
    if (!r.isOk) { pdfMsg('อัปโหลดไฟล์สำเร็จ แต่บันทึกลงฐานข้อมูลไม่สำเร็จ: ' + r.error, 'err'); return; }

    pdfMsg(sync.isOk
      ? 'เก็บไว้ที่ Google Drive แล้ว — โฟลเดอร์ ' + (sync['โฟลเดอร์'] || '')
      : 'อัปโหลดเรียบร้อยแล้ว (เก็บในพื้นที่ของระบบ — ' + (sync.error || 'ยังไม่ได้เชื่อม Google Drive') + ')');
    setTimeout(function () {
      closeModal();
      if (typeof showToast === 'function') showToast('แนบไฟล์ PDF เรียบร้อย');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    }, 700);
  };

  window.emsOpenTrackingFile = async function (id) {
    var rec = APP.allData.find(function (d) { return d.__backendId === id; });
    if (!rec) return;
    await emsOpenStoredFile(rec.file_link);
  };

  window.emsRemoveTrackingFile = async function (id) {
    var rec = APP.allData.find(function (d) { return d.__backendId === id; });
    if (!rec) return;
    var onDrive = isDriveFile(rec.file_link);
    if (!confirm(onDrive
      ? 'นำไฟล์ออกจากรายวิชานี้?\n\nไฟล์ตัวจริงยังอยู่ใน Google Drive ของวิทยาลัย ลบได้ที่ไดรฟ์โดยตรงหากต้องการ'
      : 'ยืนยันการลบไฟล์ PDF ของรายวิชานี้?')) return;
    if (!onDrive) {
      var d = await GSheetDB.deleteFile(rec.file_link);
      if (!d.isOk) { pdfMsg('ลบไฟล์ไม่สำเร็จ: ' + d.error, 'err'); return; }
    }
    rec.file_link = '';
    rec.file_name = '';
    await GSheetDB.update(rec);
    closeModal();
    if (typeof showToast === 'function') showToast('ลบไฟล์เรียบร้อย');
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  // เปิดไฟล์ที่เก็บในระบบด้วยลิงก์ชั่วคราว
  async function emsOpenStoredFile(link) {
    if (isDriveFile(link)) { window.open(driveViewUrl(link), '_blank', 'noopener'); return; }
    if (typeof showToast === 'function') showToast('กำลังเปิดไฟล์...', 'loading');
    var r = await GSheetDB.fileUrl(link);
    var t = el('loadingToast'); if (t) t.remove();
    if (!r.isOk) {
      if (typeof showToast === 'function') showToast('เปิดไฟล์ไม่สำเร็จ: ' + r.error, 'error');
      return;
    }
    window.open(r.url, '_blank', 'noopener');
  }
  window.emsOpenStoredFile = emsOpenStoredFile;

  // ตารางในระบบเดิมสร้างลิงก์เป็น <a href="..."> ตรง ๆ
  // ไฟล์ที่เก็บในระบบใช้ข้อความ sb:... ซึ่งเปิดตรงไม่ได้
  // จึงดักการคลิกไว้แล้วเปลี่ยนเป็นลิงก์ชั่วคราวให้อัตโนมัติ (ไม่ต้องแก้ app.js)
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest
      ? (ev.target.closest('a[href^="sb:"]') || ev.target.closest('a[href^="gd:"]')) : null;
    if (!a) return;
    ev.preventDefault();
    emsOpenStoredFile(a.getAttribute('href'));
  }, true);

  /* ============================================================
     6.9) ย่อชื่อระบบให้พอดีบรรทัดเดียวเสมอ
     ------------------------------------------------------------
     การกำหนดขนาดตัวอักษรด้วย CSS ล่วงหน้าไม่แม่นพอ เพราะความกว้างจริง
     ขึ้นกับฟอนต์ที่โหลดได้ในเครื่องนั้น ถ้าเดาพลาดข้อความจะล้นแล้วถูกตัดหาย
     วิธีนี้จึง "วัดของจริงแล้วย่อจนพอดี" หลังฟอนต์โหลดเสร็จ
     ============================================================ */
  function fitOneLine(node, maxPx, minPx) {
    if (!node || !node.offsetParent) return;
    node.style.whiteSpace = 'nowrap';
    var size = maxPx;
    node.style.fontSize = size + 'px';
    var guard = 0;
    while (node.scrollWidth > node.clientWidth && size > minPx && guard++ < 80) {
      size -= 0.5;
      node.style.fontSize = size + 'px';
    }
  }

  function fitTitles() {
    fitOneLine(el('loginTitle'), 22, 11);
    fitOneLine(el('headerTitle'), 15, 9);
  }
  window.emsFitTitles = fitTitles;

  // เรียกซ้ำในทุกจังหวะที่ความกว้างหรือฟอนต์อาจเปลี่ยน
  function scheduleFit() { requestAnimationFrame(function () { setTimeout(fitTitles, 0); }); }
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(scheduleFit);
  }
  setTimeout(scheduleFit, 400);
  setTimeout(scheduleFit, 1500);

  // ทุกครั้งที่สลับหน้าจอ (โหลด → เข้าสู่ระบบ → หน้าหลัก) ต้องวัดใหม่
  (function () {
    var originalShowScreen = window.showScreen;
    if (typeof originalShowScreen !== 'function') return;
    window.showScreen = function (id) {
      originalShowScreen.apply(this, arguments);
      scheduleFit();
    };
  })();

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

  /* ============================================================
     8) โหมด "ดูแทนผู้ใช้" (View as) — เฉพาะผู้ดูแลระบบ / อ่านอย่างเดียว
     ------------------------------------------------------------
     ผู้ดูแลระบบเลือกผู้ใช้จากหน้า "จัดการผู้ใช้งาน" แล้วระบบจะจำลอง
     หน้าจอ (เมนู/ตัวกรอง/ข้อมูลที่มองเห็น) ให้เหมือนที่คนนั้นเห็น
     โดยยังใช้บัญชีของผู้ดูแลระบบเดิม ไม่มีการสร้าง session ของคนอื่น
     ระหว่างอยู่ในโหมดนี้ ระบบจะปิดการบันทึกข้อมูลทุกชนิด
     ============================================================ */
  APP._viewAs = null;

  function realRoles() {
    var p = window.__emsRealProfile || window.__emsProfile;
    return (p && Array.isArray(p.roles) && p.roles.length) ? p.roles : (p && p.role ? [p.role] : []);
  }
  window.emsCanViewAs = function emsCanViewAs() {
    return realRoles().indexOf('admin') >= 0;
  };

  /* ---------- ปิดการเขียนข้อมูลทั้งหมดขณะอยู่ในโหมดดูแทน ---------- */
  var RAW = {};
  (function guardWrites() {
    if (!window.GSheetDB) return;
    ['create', 'createMany', 'update', 'updateMany', 'delete', 'appendNoRefresh',
     'uploadFile', 'deleteFile', 'surveySubmit', 'changePassword',
     'requestPasswordOtp', 'resetPasswordOtp', 'sendLineNow'].forEach(function (n) {
      var orig = GSheetDB[n];
      if (typeof orig !== 'function') return;
      RAW[n] = orig;
      GSheetDB[n] = function () {
        if (APP._viewAs) {
          if (window.showToast) showToast('โหมดดูแทนผู้ใช้: อ่านอย่างเดียว บันทึกข้อมูลไม่ได้', 'error');
          return Promise.resolve({ isOk: false, error: 'โหมดดูแทนผู้ใช้ (อ่านอย่างเดียว)' });
        }
        return orig.apply(GSheetDB, arguments);
      };
    });
  })();

  /* ---------- บันทึกร่องรอยการใช้งาน (ใช้ฟังก์ชันดิบ เลี่ยงตัวกั้นด้านบน) ---------- */
  function logViewAs(eventType, target) {
    try {
      var w = RAW.appendNoRefresh || RAW.create;
      if (typeof w !== 'function') return;
      var now = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var admin = window.__emsRealProfile || {};
      Promise.resolve(w.call(GSheetDB, {
        type: 'login_log',
        event_type: eventType,                    // 'view_as' | 'view_as_exit'
        user_name: (admin.name || '') + ' → ' + ((target && target.name) || '-'),
        role: (target && target.role) || '-',
        role_label: 'ดูแทนผู้ใช้',
        identifier: (admin.email || '') + ' | ' + ((target && target.identifier) || ''),
        user_agent: navigator && navigator.userAgent ? String(navigator.userAgent).slice(0, 250) : '',
        timestamp: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' +
                   pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()),
        created_at: now.toISOString()
      })).catch(function () { });
    } catch (e) { /* ไม่ให้ log ล้มแล้วพังทั้งฟีเจอร์ */ }
  }

  /* ---------- แถบแจ้งเตือนด้านล่างจอ ---------- */
  function viewAsBanner() {
    var bar = el('emsViewAsBar');
    if (!APP._viewAs) { if (bar) bar.remove(); document.body.classList.remove('ems-viewas'); return; }
    document.body.classList.add('ems-viewas');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'emsViewAsBar';
      bar.className = 'fixed bottom-0 left-0 right-0 z-40 bg-amber-500 text-white px-4 py-2 ' +
                      'flex items-center gap-3 text-sm shadow-lg';
      document.body.appendChild(bar);
    }
    var v = APP._viewAs;
    bar.innerHTML =
      '<span class="font-semibold whitespace-nowrap">👁 กำลังดูแทนผู้ใช้</span>' +
      '<span class="truncate">' + v.name + ' — ' + (ROLE_LABEL[v.role] || v.role) + '</span>' +
      '<span class="hidden sm:inline text-white/80 text-xs whitespace-nowrap">(อ่านอย่างเดียว)</span>' +
      '<button onclick="emsExitViewAs()" class="ml-auto mr-16 sm:mr-20 bg-white/20 hover:bg-white/30 ' +
      'rounded-lg px-3 py-1 font-medium whitespace-nowrap">ออกจากโหมดดูแทน</button>';
  }

  /* ---------- ประกอบโปรไฟล์จำลองจากแถวผู้ใช้ในตาราง app_user ---------- */
  function fakeProfileOf(u) {
    var roles = [String(u.role || '').trim()]
      .concat(String(u.extra_roles || '').split(',').map(function (x) { return x.trim(); }))
      .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var prof = {
      found: true, viewAs: true,
      role: roles[0] || 'guest', roles: roles,
      name: u.name || '', email: u.email || '', username: u.username || '',
      department: u.department || '', responsible_year: u.responsible_year || '',
      student_id: u.student_id || ''
    };
    if (prof.role === 'student' && u.student_id) {
      var st = getDataByType('student').find(function (s) {
        return String(s.student_id || '').trim() === String(u.student_id).trim();
      });
      if (st) prof.student = st;
    }
    return prof;
  }

  window.emsViewAsUser = function emsViewAsUser(id) {
    if (!window.emsCanViewAs()) {
      if (window.showToast) showToast('เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้โหมดนี้ได้', 'error');
      return;
    }
    var u = getDataByType('user').find(function (x) { return String(x.__backendId) === String(id); });
    if (!u) { if (window.showToast) showToast('ไม่พบผู้ใช้รายนี้', 'error'); return; }

    var prof = fakeProfileOf(u);
    if (!prof.role || prof.role === 'guest') {
      if (window.showToast) showToast('ผู้ใช้รายนี้ยังไม่ได้กำหนดบทบาท', 'error');
      return;
    }

    APP._viewAs = {
      id: id, name: prof.name || prof.email || prof.student_id, role: prof.role,
      identifier: prof.email || prof.student_id || ''
    };
    logViewAs('view_as', APP._viewAs);

    window.__emsProfile = prof;
    APP._roles = prof.roles.slice();
    emsApplyRole(prof.role, prof);

    if (el('currentUserName')) el('currentUserName').textContent = APP.currentUser.name;
    if (el('currentUserRole')) el('currentUserRole').textContent = ROLE_LABEL[APP.currentRole] || '';
    var cpb = el('changePwBtn');
    if (cpb) cpb.classList.add('hidden');      // เปลี่ยนรหัสผ่านแทนคนอื่นไม่ได้

    buildSidebar();
    navigateTo('dashboard');
    updateNotifBadge();
    emsRenderRoleSwitcher();
    viewAsBanner();
    if (window.lucide) lucide.createIcons();
    if (window.showToast) showToast('กำลังดูในมุมมองของ ' + APP._viewAs.name);
  };

  window.emsExitViewAs = function emsExitViewAs() {
    if (!APP._viewAs) return;
    logViewAs('view_as_exit', APP._viewAs);
    APP._viewAs = null;

    var prof = window.__emsRealProfile;
    if (!prof) { window.location.reload(); return; }
    window.__emsProfile = prof;
    APP._roles = (Array.isArray(prof.roles) && prof.roles.length) ? prof.roles.slice() : [prof.role];
    emsApplyRole(prof.role, prof);

    if (el('currentUserName')) el('currentUserName').textContent = APP.currentUser.name;
    if (el('currentUserRole')) el('currentUserRole').textContent = ROLE_LABEL[APP.currentRole] || '';
    var cpb = el('changePwBtn');
    if (cpb) cpb.classList.toggle('hidden', APP.currentRole === 'student');

    buildSidebar();
    navigateTo('settings');
    updateNotifBadge();
    emsRenderRoleSwitcher();
    viewAsBanner();
    if (window.lucide) lucide.createIcons();
    if (window.showToast) showToast('กลับสู่บัญชีผู้ดูแลระบบแล้ว');
  };


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
