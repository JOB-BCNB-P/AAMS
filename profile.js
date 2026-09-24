/* ================================================================
   profile.js — ข้อมูลส่วนตัวของผู้ใช้ (ทุกบทบาทแก้ของตัวเองได้)
   ----------------------------------------------------------------
   ทำ 3 อย่าง
     1) เมนูดรอปดาวน์ที่ชื่อผู้ใช้มุมบนขวา
     2) หน้า "ตั้งค่าข้อมูลส่วนตัว" — คำนำหน้า ชื่อ-สกุล เบอร์โทร รูปโปรไฟล์ ลายเซ็น
     3) การ์ดข้อมูลส่วนบุคคลในหน้าหลัก

   ทำไมเก็บแยกจากทะเบียนกลาง
     ตาราง student / teacher เป็นข้อมูลราชการที่งานทะเบียนดูแล
     ถ้าให้เจ้าตัวเขียนทับได้ ชื่อในใบรายงานผลการเรียนกับในทะเบียนจะเพี้ยนกัน
     ตาราง user_profile จึงเป็น "ข้อมูลที่เจ้าตัวดูแลเอง" ใช้แสดงผลและใช้ในใบลา
     ส่วนทะเบียนกลางยังเป็นของงานทะเบียนเหมือนเดิม

   ไฟล์รูปและลายเซ็น
     เก็บที่ Supabase Storage ถังปิด profile-files  เส้นทาง <รหัสผู้ใช้>/profile.png
     ชื่อโฟลเดอร์คือรหัสผู้ใช้ ฐานข้อมูลจึงบังคับได้เองว่าเขียนได้เฉพาะของตัวเอง
     แล้วสำเนาขึ้น Google Drive โฟลเดอร์ profile / signature ผ่าน drive-sync
     ต่างจากใบลาตรงที่ "ไม่ลบไฟล์ต้นทาง" เพราะหน้าเว็บต้องอ่านมาแสดงตลอดเวลา
   ================================================================ */
(function () {
  'use strict';

  /* ---------------- เครื่องมือพื้นฐาน ---------------- */
  function s(v) { return String(v == null ? '' : v).trim(); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function client() {
    return (window.GSheetDB && typeof GSheetDB.client === 'function') ? GSheetDB.client() : null;
  }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }

  var BUCKET = 'profile-files';
  var PREFIX = 'sbp:';
  var MAX_BYTES = 5 * 1024 * 1024;
  var OK_EXT = ['png', 'jpg', 'jpeg', 'svg', 'pdf'];
  var MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    svg: 'image/svg+xml', pdf: 'application/pdf'
  };
  // นามสกุลที่เบราว์เซอร์แสดงเป็นรูปได้ — pdf แนบเก็บได้ แต่เอาไปวางในใบลาไม่ได้
  var VIEWABLE = ['png', 'jpg', 'jpeg', 'svg'];

  function extOf(n) { return s(n).split('.').pop().toLowerCase(); }
  function isProfileFile(link) { return s(link).indexOf(PREFIX) === 0; }
  function pathOf(link) { return isProfileFile(link) ? s(link).slice(PREFIX.length) : ''; }
  function canShow(link) { return isProfileFile(link) && VIEWABLE.indexOf(extOf(link)) >= 0; }

  var ROLE_LABEL = {
    admin: 'ผู้ดูแลระบบ', academic: 'เจ้าหน้าที่งานวิชาการ', registrar: 'เจ้าหน้าที่งานทะเบียน',
    teacher: 'อาจารย์', classTeacher: 'อาจารย์ประจำชั้น', executive: 'ผู้บริหาร',
    deptHead: 'ประธานสาขาวิชา', student: 'นักศึกษา', otherStaff: 'บุคลากรอื่น'
  };

  /* ---------------- ตัวตนของผู้ใช้ปัจจุบัน ----------------
     กุญแจจับคู่โปรไฟล์ : นักศึกษาใช้รหัสนักศึกษา บุคลากรใช้อีเมลหรือชื่อผู้ใช้
     เก็บเป็นตัวพิมพ์เล็กเสมอ จะได้ไม่พลาดเพราะพิมพ์ใหญ่เล็กไม่ตรงกัน */
  /* รหัสผู้ใช้จริงจากระบบยืนยันตัวตน — กุญแจหลักที่ใช้หาโปรไฟล์ของตัวเอง
     ขอครั้งเดียวตอนเปิดหน้า แล้วจำไว้ เพราะการขอเป็นงานแบบรอผล
     แต่จุดที่ต้องใช้ (วาดหน้า/วาดเอกสาร) ต้องได้คำตอบทันที */
  var MY_UID = '';

  /* โหมด "ดูแทนผู้ใช้" — ผู้ดูแลระบบเปิดดูหน้าจอในมุมมองของคนอื่น
     บัญชีที่ล็อกอินยังเป็นของผู้ดูแล แต่สิ่งที่ต้องแสดงคือข้อมูลของคนที่ถูกดูแทน
     ทุกจุดที่หาโปรไฟล์จึงต้องแยกสองกรณีนี้ออกจากกัน */
  function viewingAs() { return !!(window.APP && APP._viewAs); }

  /* บัญชีของคนที่ถูกดูแทน
     APP._viewAs.id คือรหัสแถวในตารางบัญชีผู้ใช้ จึงชี้ตัวได้ตรง ๆ ไม่ต้องเดาจากชื่อ
     เทียบด้วยชื่อเป็นตัวสำรองไว้เผื่อรหัสแถวเปลี่ยนหลังโหลดข้อมูลใหม่ */
  function viewAsUserRow() {
    var v = (window.APP && APP._viewAs) || null;
    if (!v) return null;
    var rows = get('user');
    return rows.find(function (x) { return String(x.__backendId) === String(v.id); })
      || rows.find(function (x) { return s(x.name).toLowerCase() === s(v.name).toLowerCase(); })
      || null;
  }

  /* ระเบียนในทะเบียนของผู้ใช้ที่กำลังแสดงอยู่
     ปกติ APP.currentUser.data มีให้อยู่แล้ว แต่บางทางเข้าจะว่าง
     โดยเฉพาะโหมดดูแทนผู้ใช้ที่จับคู่ระเบียนไม่เจอ จึงค้นจากทะเบียนให้อีกชั้นหนึ่ง
     ไม่งั้นการ์ดข้อมูลจะว่างเปล่าทั้งที่ข้อมูลมีอยู่ */
  function findInRegistry(sid, em, nm) {
    var table = (APP.currentRole === 'student') ? 'student' : 'teacher';
    return get(table).find(function (x) {
      return (sid && s(x.student_id).toLowerCase() === sid)
        || (em && s(x.email).toLowerCase() === em)
        || (nm && s(x.name).toLowerCase() === nm);
    }) || null;
  }

  function myRecord() {
    var u = (window.APP && APP.currentUser) || {};
    if (viewingAs()) {
      // ห้ามใช้ u.data ของโหมดดูแทน เพราะบางครั้งว่าง และห้ามตกไปใช้ของผู้ดูแลเด็ดขาด
      var au = viewAsUserRow() || {};
      var v = (APP._viewAs) || {};
      var hit = findInRegistry(s(au.student_id).toLowerCase(),
        s(au.email).toLowerCase(), s(au.name || v.name || u.name).toLowerCase());
      return hit || { name: s(au.name) || s(v.name) || s(u.name), email: s(au.email),
        student_id: s(au.student_id) };
    }
    if (u.data && Object.keys(u.data).length) return u.data;
    var d = findInRegistry(s(u.student_id).toLowerCase(),
      s(u.email).toLowerCase(), s(u.name).toLowerCase());
    return d || { name: u.name, email: u.email };
  }

  function myKey() {
    if (viewingAs()) {
      var au = viewAsUserRow() || {};
      var v = (APP._viewAs) || {};
      return s(au.student_id || au.email || au.username || v.identifier || v.name).toLowerCase();
    }
    var u = (window.APP && APP.currentUser) || {}, d = myRecord();
    return s(d.student_id || u.email || d.email || u.username || u.name).toLowerCase();
  }
  function keyOfRecord(rec) {
    rec = rec || {};
    return s(rec.student_id || rec.email || rec.username || rec.name).toLowerCase();
  }
  /* ชื่อคนไทยมีคำนำหน้าติดมาบ้างไม่ติดบ้าง แล้วแต่ว่าเก็บมาจากที่ไหน
     "นางสาวอรณิช รักตะวัต" กับ "อรณิช รักตะวัต" คือคนเดียวกัน
     ถ้าเทียบดิบ ๆ จะกลายเป็นคนละคน แล้วโปรไฟล์ของตัวเองหายไปเลย */
  var NAME_PREFIX = [
    'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'นางสาว', 'นาย', 'นาง',
    'ศาสตราจารย์', 'รองศาสตราจารย์', 'ผู้ช่วยศาสตราจารย์',
    'ดร.', 'ผศ.ดร.', 'รศ.ดร.', 'ศ.ดร.', 'ผศ.', 'รศ.', 'ศ.', 'น.ส.', 'อาจารย์', 'อ.'
  ];
  function normName(v) {
    var x = s(v).toLowerCase().replace(/\s+/g, ' ').trim();
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < NAME_PREFIX.length; i++) {
        var pre = NAME_PREFIX[i].toLowerCase();
        if (x.indexOf(pre) === 0) { x = x.slice(pre.length).trim(); changed = true; break; }
      }
    }
    return x.replace(/\s+/g, '');
  }

  function allProfiles() { return get('user_profile'); }
  function profileByKey(key) {
    var k = s(key).toLowerCase();
    if (!k) return null;
    var list = allProfiles();
    var hit = list.find(function (p) { return s(p.owner_key).toLowerCase() === k; });
    if (hit) return hit;
    /* ค้นด้วยชื่อได้ด้วย เพราะใบลาส่งชื่อผู้อนุมัติมา ไม่ได้ส่งอีเมล
       และชื่อที่ส่งมาอาจมีคำนำหน้าติดมาหรือไม่มีก็ได้ */
    var n = normName(key);
    if (!n) return null;
    return list.find(function (p) {
      return normName(p.owner_name) === n || normName(p.full_name) === n;
    }) || null;
  }
  function profileByName(name) {
    var n = s(name).toLowerCase();
    if (!n) return null;
    return allProfiles().find(function (p) {
      return s(p.owner_name).toLowerCase() === n || s(p.full_name).toLowerCase() === n;
    }) || null;
  }
  function profileByUid(uid) {
    var u = s(uid);
    if (!u) return null;
    return allProfiles().find(function (p) { return s(p.owner_uid) === u; }) || null;
  }
  /* กุญแจของ "บัญชีที่ล็อกอินอยู่จริง" — ไม่ใช่คนที่หน้าจอกำลังแสดง
     app-patch.js เก็บโปรไฟล์จริงไว้ตั้งแต่ตอนเข้าระบบ ใช้เทียบได้ว่าตอนนี้แสดงตัวเองอยู่ไหม */
  function realAccountKey() {
    var rp = window.__emsRealProfile || null;
    if (!rp) return '';
    return s(rp.student_id || rp.email || rp.username || rp.name).toLowerCase();
  }

  /* หน้าจอกำลังแสดง "ตัวเอง" อยู่หรือเปล่า
     เทียบตัวตนตรง ๆ ไม่พึ่งธงบอกสถานะ เพราะทางเข้ามีหลายทาง
     (โหมดดูแทนผู้ใช้ / สลับมุมมองบทบาท) และบางทางไม่ได้ตั้งธงไว้
     สลับมุมมองบทบาทของคนเดิม ยังถือว่าเป็นตัวเอง — รูปและลายเซ็นจึงยังขึ้นตามปกติ */
  function showingSelf() {
    if (viewingAs()) return false;
    var k = myKey();
    if (!k) return true;             // ไม่มีตัวตนให้เทียบ ถือว่าเป็นตัวเอง
    var rk = realAccountKey();
    if (rk) return rk === k;
    /* บางทางเข้าไม่ได้เก็บโปรไฟล์จริงไว้ให้เทียบ
       ใช้แถวโปรไฟล์ของบัญชีที่ล็อกอินแทน — กุญแจในแถวนั้นคือตัวตนของเจ้าของบัญชี
       แต่ถ้ากุญแจเป็นรหัสผู้ใช้ (ค่าสำรองตอนหาตัวตนไม่เจอ) เอามาเทียบไม่ได้ */
    var mine = MY_UID ? profileByUid(MY_UID) : null;
    var mk = mine ? s(mine.owner_key).toLowerCase() : '';
    if (mk && mk !== s(MY_UID).toLowerCase()) return mk === k;
    return true;                     // ไม่มีอะไรให้เทียบเลย ถือว่าเข้าระบบมาตามปกติ
  }

  /* ตัวระบุทุกแบบของ "คนที่หน้าจอกำลังแสดง"
     เก็บมาให้ครบทุกทาง แล้วค่อยจับคู่ แทนที่จะเดาว่าจะใช้ตัวไหนเป็นกุญแจ
     การเดาผิดตัวเดียวเคยทำให้ตกไปหยิบโปรไฟล์ของผู้ดูแลมาแสดงแทน */
  function idsOfShown() {
    var out = [];
    var add = function (v) {
      var x = s(v).toLowerCase();
      if (x && out.indexOf(x) < 0) out.push(x);
      var n = normName(v);
      if (n && out.indexOf(n) < 0) out.push(n);
    };
    if (viewingAs()) {
      var au = viewAsUserRow() || {}, v = (window.APP && APP._viewAs) || {};
      [au.student_id, au.email, au.username, au.name, v.identifier, v.name].forEach(add);
    }
    var u = (window.APP && APP.currentUser) || {}, d = myRecord() || {};
    [d.student_id, d.email, d.name, u.student_id, u.email, u.username, u.name].forEach(add);
    return out;
  }

  // แถวโปรไฟล์ที่ "ตรงกับคนที่แสดงอยู่จริง" เท่านั้น ไม่ตรงก็คือไม่มี
  function profileOfShown() {
    var ids = idsOfShown();
    if (!ids.length) return null;
    var hit = function (v) {
      return !!s(v) && (ids.indexOf(s(v).toLowerCase()) >= 0 || ids.indexOf(normName(v)) >= 0);
    };
    return allProfiles().find(function (p) {
      return hit(p.owner_key) || hit(p.owner_name) || hit(p.full_name);
    }) || null;
  }

  /* หาโปรไฟล์ของผู้ใช้ที่หน้าจอกำลังแสดง
     ตัดสินจาก "ตัวตนที่ตรงกัน" อย่างเดียว ไม่พึ่งธงบอกสถานะใด ๆ อีก
     เพราะธงดูแทนผู้ใช้ถูกล้างได้ระหว่างทาง (เช่นโหลดข้อมูลใหม่) ทั้งที่หน้าจอยังแสดงคนอื่นอยู่
     พอเชื่อธงแล้วเข้าใจผิดว่าเป็นตัวเอง รูปและลายเซ็นของผู้ดูแลจึงไปขึ้นแทน */
  function myProfile() {
    var p = profileOfShown();
    if (p) return p;

    /* ไม่มีแถวไหนตรงกับคนบนหน้าจอเลย
       จะใช้แถวของบัญชีที่ล็อกอินได้ ก็ต่อเมื่อแถวนั้น "ไม่มีตัวตนที่ขัดกัน"
       เช่นบัญชีที่ไม่มีชื่อ/อีเมลตอนบันทึก แถวจึงไม่มีอะไรให้เทียบ
       ถ้าแถวระบุตัวตนไว้ชัดแต่ไม่ตรงกับคนบนหน้าจอ = คนละคน ต้องไม่หยิบมาใช้ */
    var mine = MY_UID ? profileByUid(MY_UID) : null;
    if (!mine) return null;
    var mk = s(mine.owner_key).toLowerCase();
    var hasOwnIdentity = (mk && mk !== s(MY_UID).toLowerCase())
      || !!s(mine.owner_name) || !!s(mine.full_name);
    if (hasOwnIdentity) return null;   // แถวระบุตัวตนไว้ชัด แต่ไม่ตรงกับคนบนหน้าจอ = คนละคน
    return mine;
  }

  /* ตัวช่วยตรวจอาการเวลาหน้าจอแสดงข้อมูลผิดคน
     เปิด Console แล้วพิมพ์  profileDebug()  จะเห็นว่าระบบมองเห็นอะไรอยู่ */
  window.profileDebug = function () {
    var u = (window.APP && APP.currentUser) || {};
    var p = myProfile();
    return {
      เวอร์ชัน: window.__APP_VER || '',
      บทบาทที่ใช้อยู่: s(APP.currentRole),
      กำลังดูแทน: !!viewingAs(),
      ธงดูแทน: (window.APP && APP._viewAs) || null,
      บัญชีที่แสดง: { ชื่อ: s(u.name), อีเมล: s(u.email), มีระเบียนแนบมา: !!(u.data && Object.keys(u.data).length) },
      บัญชีในตารางผู้ใช้: viewAsUserRow() || null,
      ระเบียนที่ใช้: myRecord() || null,
      ตัวระบุที่จับคู่: idsOfShown(),
      แสดงตัวเองอยู่: showingSelf(),
      กุญแจของบัญชีจริง: realAccountKey(),
      รหัสผู้ใช้ที่ล็อกอิน: MY_UID,
      โปรไฟล์ที่เลือกได้: p ? { owner_key: p.owner_key, owner_name: p.owner_name, owner_uid: p.owner_uid } : null,
      จำนวนโปรไฟล์ทั้งหมด: allProfiles().length
    };
  };

  // ค่าที่ควรใช้แสดงผล — โปรไฟล์ของเจ้าตัวมาก่อน ไม่มีค่อยถอยไปใช้ทะเบียน
  function displayOf(rec, prof) {
    rec = rec || {}; prof = prof || null;
    return {
      title_prefix: s(prof && prof.title_prefix) || s(rec.title_prefix),
      name: s(prof && prof.full_name) || s(rec.name),
      phone: s(prof && prof.phone) || s(rec.phone),
      photo_link: s(prof && prof.photo_link),
      signature_link: s(prof && prof.signature_link)
    };
  }
  function myDisplay() {
    var u = (window.APP && APP.currentUser) || {};
    var d = displayOf(myRecord(), myProfile());
    if (!d.name) d.name = s(u.name);
    return d;
  }
  window.profileMy = myDisplay;
  window.profileByName = profileByName;
  window.profileByKey = profileByKey;

  /* ---------------- ลิงก์รูปแบบเปิดได้ชั่วคราว ----------------
     ไฟล์อยู่ในถังปิด จึงต้องขอลิงก์ชั่วคราวก่อนถึงจะแสดงได้
     ขอแล้วจำไว้ และเติม src ให้ <img> ที่รออยู่ — ไม่วาดหน้าใหม่
     เพราะผู้ใช้อาจกำลังพิมพ์ฟอร์มอยู่ วาดใหม่แล้วสิ่งที่พิมพ์จะหาย */
  var URL_CACHE = {};
  var ASKED = {};

  function fillWaiting(link) {
    var url = URL_CACHE[link] || '';
    var nodes = document.querySelectorAll('[data-prof-link="' + link.replace(/"/g, '') + '"]');
    Array.prototype.forEach.call(nodes, function (el) {
      if (url) { el.src = url; el.classList.remove('hidden'); }
      else el.classList.add('hidden');
    });
  }

  function askUrl(link) {
    if (ASKED[link]) return;
    ASKED[link] = 1;
    var c = client();
    if (!c) { URL_CACHE[link] = ''; return; }
    c.storage.from(BUCKET).createSignedUrl(pathOf(link), 3600).then(function (r) {
      URL_CACHE[link] = (r && r.data && r.data.signedUrl) || '';
      if (!URL_CACHE[link]) {
        console.warn('[โปรไฟล์] เปิดไฟล์ไม่ได้:', link, (r && r.error && r.error.message) || 'ไม่ทราบสาเหตุ');
      }
      fillWaiting(link);
    }).catch(function (e) {
      console.warn('[โปรไฟล์] เปิดไฟล์ไม่ได้:', link, e && e.message);
      URL_CACHE[link] = ''; fillWaiting(link);
    });
  }

  // คืนลิงก์ที่ใช้ได้ทันทีถ้าเคยขอไว้แล้ว ถ้ายังไม่เคยก็ขอให้แล้วคืนค่าว่างไปก่อน
  function imgUrl(link) {
    if (!canShow(link)) return '';
    if (URL_CACHE[link] !== undefined) return URL_CACHE[link];
    askUrl(link);
    return '';
  }
  window.profileImgUrl = imgUrl;

  // แท็กรูปที่เติม src ให้เองเมื่อลิงก์พร้อม
  function imgTag(link, cls, alt, style) {
    if (!canShow(link)) return '';
    var url = imgUrl(link);
    return '<img data-prof-link="' + esc(link) + '" src="' + esc(url) + '"'
      + ' class="' + esc(cls || '') + (url ? '' : ' hidden') + '"'
      + (style ? ' style="' + esc(style) + '"' : '')
      + ' alt="' + esc(alt || '') + '">';
  }
  window.profileImgTag = imgTag;

  /* ลายเซ็นของคนคนหนึ่ง ใช้ในใบลา
     รับได้ทั้งชื่อคนและกุญแจ เพราะเอกสารบางที่เก็บไว้เป็นชื่อล้วน */
  function signatureLinkOf(nameOrKey) {
    var p = profileByKey(nameOrKey) || profileByName(nameOrKey);
    return p ? s(p.signature_link) : '';
  }
  window.profileSignatureTag = function (nameOrKey, cls) {
    return imgTag(signatureLinkOf(nameOrKey), cls || 'inline-block', 'ลายเซ็น');
  };
  window.profileHasSignature = function (nameOrKey) { return canShow(signatureLinkOf(nameOrKey)); };

  /* ขอลิงก์ลายเซ็นของหลายคนให้พร้อมก่อน แล้วค่อยเรียกกลับ
     ใช้ตอนสั่งพิมพ์ เพราะหน้าต่างพิมพ์เป็นเอกสารคนละใบ เติม src ย้อนหลังให้ไม่ได้ */
  window.profileWarmSignatures = function (names, done) {
    var links = (names || []).map(signatureLinkOf).filter(canShow);
    var todo = links.filter(function (l) { return URL_CACHE[l] === undefined; });
    if (!todo.length || !client()) { if (done) done(); return; }
    var left = todo.length;
    var tick = function () { if (--left <= 0 && done) done(); };
    todo.forEach(function (l) {
      ASKED[l] = 1;
      client().storage.from(BUCKET).createSignedUrl(pathOf(l), 3600).then(function (r) {
        URL_CACHE[l] = (r && r.data && r.data.signedUrl) || '';
        fillWaiting(l);
      }).catch(function () { URL_CACHE[l] = ''; }).then(tick, tick);
    });
  };

  /* ---------------- อัปโหลดไฟล์ ---------------- */
  async function authId() {
    var c = client();
    if (!c) return '';
    var r = await c.auth.getUser();
    return (r && r.data && r.data.user && r.data.user.id) || '';
  }

  /* target = { uid, name } ของคนที่จะตั้งรูปให้ ไม่ส่งมา = ของตัวเอง
     ผู้ดูแลระบบเท่านั้นที่ตั้งให้คนอื่นได้ และฐานข้อมูลบังคับซ้ำอีกชั้นหนึ่ง
     ถึงแม้หน้าเว็บจะถูกดัดแปลง ก็เขียนแทนคนอื่นไม่ได้ถ้าไม่ใช่ผู้ดูแล */
  /* คอลัมน์ของแต่ละงาน รวมไว้ที่เดียว จะได้ไม่พิมพ์ชื่อผิดกระจายหลายที่ */
  function linkField(kind) { return kind === 'signature' ? 'signature_link' : 'photo_link'; }
  function driveField(kind) { return kind === 'signature' ? 'signature_drive_id' : 'photo_drive_id'; }

  /* ชุดค่าที่จะบันทึกหลังอัปโหลดสำเร็จ — เก็บรหัสไฟล์บนไดรฟ์ไว้ด้วย
     ครั้งต่อไปจะได้เขียนทับไฟล์เดิม ไม่ทิ้งของเก่าค้างไว้บนไดรฟ์ */
  function linkPatch(kind, r) {
    var patch = {};
    patch[linkField(kind)] = s(r && r.link);
    patch[driveField(kind)] = s(r && r.driveId);
    return patch;
  }

  /* ลบไฟล์เดิมทิ้งให้หมด ทั้งในถังไฟล์และบนไดรฟ์ */
  async function purgeOld(kind, uid, driveId, keepPath) {
    var c = client();
    if (!c || !uid) return;
    var paths = OK_EXT.map(function (e) { return uid + '/' + kind + '.' + e; })
      .filter(function (x) { return x !== keepPath; });
    try { await c.storage.from(BUCKET).remove(paths); } catch (e) { /* ไม่มีก็ไม่เป็นไร */ }
    paths.forEach(function (x) { var l = PREFIX + x; delete URL_CACHE[l]; delete ASKED[l]; });
    if (!s(driveId)) return;
    try {
      await c.functions.invoke('drive-sync', {
        body: { mode: 'remove', kind: kind, fileId: s(driveId), storagePath: uid + '/' + kind + '.png' }
      });
    } catch (e) { /* ลบสำเนาบนไดรฟ์ไม่สำเร็จ ไม่กระทบการใช้งาน */ }
  }

  async function uploadProfileFile(file, kind, target) {
    // กำลังแสดงคนอื่นอยู่ (ดูแทนผู้ใช้) — ไฟล์จะไปลงบัญชีที่ล็อกอินอยู่ ไม่ใช่ของคนที่ดูแทน
    if (!target && !showingSelf()) {
      return { isOk: false, error: 'โหมดดูแทนผู้ใช้: อ่านอย่างเดียว อัปโหลดไฟล์ไม่ได้' };
    }
    if (!file || !file.name) return { isOk: false, error: 'ยังไม่ได้เลือกไฟล์' };
    var ext = extOf(file.name);
    if (OK_EXT.indexOf(ext) < 0) {
      return { isOk: false, error: 'รองรับเฉพาะ .png .jpg .jpeg .svg และ .pdf เท่านั้น' };
    }
    if (file.size > MAX_BYTES) {
      return { isOk: false, error: 'ไฟล์ใหญ่เกิน 5 MB (ไฟล์นี้ ' + (file.size / 1048576).toFixed(1) + ' MB)' };
    }
    var uid = (target && s(target.uid)) || await authId();
    if (!uid) return { isOk: false, error: 'ยังไม่ได้เข้าสู่ระบบ จึงอัปโหลดไม่ได้' };

    var c = client();
    var path = uid + '/' + kind + '.' + ext;
    var up = await c.storage.from(BUCKET)
      .upload(path, file, { upsert: true, contentType: MIME[ext] || file.type, cacheControl: '0' });
    if (up.error) {
      var m = s(up.error.message);
      if (/row-level security|not authorized|Unauthorized/i.test(m)) {
        return { isOk: false, error: 'บัญชีของคุณไม่มีสิทธิ์อัปโหลดไฟล์นี้' };
      }
      return { isOk: false, error: m };
    }

    // ของเก่านามสกุลอื่นต้องไม่ค้างอยู่ในถัง เก็บไว้ไฟล์เดียวต่อคนต่องาน
    var stale = OK_EXT.filter(function (e) { return e !== ext; })
      .map(function (e) { return uid + '/' + kind + '.' + e; });
    try { await c.storage.from(BUCKET).remove(stale); } catch (e) { /* ไม่มีก็ไม่เป็นไร */ }
    stale.forEach(function (x) { var l = PREFIX + x; delete URL_CACHE[l]; delete ASKED[l]; });

    var link = PREFIX + path;
    delete URL_CACHE[link]; delete ASKED[link];

    /* สำเนาขึ้น Google Drive — ล้มเหลวก็ยังใช้งานได้ ไฟล์หลักอยู่ในระบบแล้ว
       ส่งรหัสไฟล์เดิมไปด้วย ไดรฟ์จะได้เขียนทับไฟล์เดิม ไม่สร้างไฟล์ใหม่ซ้อนขึ้นเรื่อย ๆ */
    var prevRow = profileByUid(uid) || {};
    var prevDriveId = s(prevRow[driveField(kind)]);
    var driveId = prevDriveId;
    try {
      var who = (target && s(target.name)) || myDisplay().name || uid;
      var nice = who + ' - ' + (kind === 'signature' ? 'ลายเซ็น' : 'รูปโปรไฟล์') + '.' + ext;
      var sync = await c.functions.invoke('drive-sync', {
        body: {
          mode: 'sync', kind: kind, storagePath: path, filename: nice,
          existingFileId: prevDriveId
        }
      });
      var got = s(sync && sync.data && sync.data.fileId);
      if (got) driveId = got;
    } catch (e) { /* เก็บสำเนาไม่สำเร็จ ไม่กระทบการใช้งาน */ }

    return { isOk: true, link: link, driveId: driveId };
  }
  window.emsUploadProfileFile = uploadProfileFile;

  /* ---------------- บันทึกโปรไฟล์ ----------------
     เขียนตรงไปที่ตาราง ไม่ผ่านตัวอ่านข้อมูลกลาง
     เพราะตัวกลางตัดคอลัมน์ auth_user_id ทิ้ง (ถือเป็นคอลัมน์ระบบ)
     แต่คอลัมน์นี้คือกุญแจที่ฐานข้อมูลใช้ตรวจว่าเป็นแถวของเราจริง */
  async function saveProfile(fields, target) {
    if (!target && !showingSelf()) {
      return { isOk: false, error: 'โหมดดูแทนผู้ใช้: อ่านอย่างเดียว แก้ข้อมูลไม่ได้' };
    }
    var c = client();
    if (!c) return { isOk: false, error: 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' };
    var mine = await authId();
    if (!mine) return { isOk: false, error: 'ยังไม่ได้เข้าสู่ระบบ' };
    MY_UID = mine;
    var forOther = !!(target && s(target.uid) && s(target.uid) !== mine);
    var uid = forOther ? s(target.uid) : mine;
    var u = (window.APP && APP.currentUser) || {}, d = u.data || {};
    var row = Object.assign({
      auth_user_id: uid,
      owner_uid: uid,
      owner_key: forOther ? s(target.key) : myKey(),
      owner_name: forOther ? s(target.name) : s(u.name),
      owner_role: forOther ? s(target.role) : s(APP.currentRole)
    }, fields || {});
    /* กุญแจและชื่อต้องไม่ว่าง ไม่งั้นเอกสารจะหาลายเซ็นของคนนี้ไม่เจอ
       ไล่หาจากที่พอมี แล้วสุดท้ายถอยไปใช้รหัสผู้ใช้ ซึ่งไม่ซ้ำกันแน่นอน */
    var prev = profileByUid(uid) || {};
    row.owner_name = s(row.owner_name) || s(row.full_name) || s(prev.owner_name) || s(prev.full_name)
      || (forOther ? '' : (s(d.name) || s(u.email) || s(u.username)));
    row.owner_key = s(row.owner_key) || s(prev.owner_key)
      || (forOther ? '' : (s(d.student_id) || s(u.email).toLowerCase())) || uid;
    var r = await c.from('user_profile').upsert(row, { onConflict: 'auth_user_id' });
    if (r.error) return { isOk: false, error: s(r.error.message) };
    // โหลดตารางโปรไฟล์ใหม่ก่อนคืนค่า ไม่งั้นหน้าจอจะวาดจากข้อมูลชุดเก่าแล้วดูเหมือนไม่มีอะไรเปลี่ยน
    try {
      await GSheetDB.refreshTab('user_profile');
    } catch (e) {
      console.warn('[โปรไฟล์] โหลดข้อมูลใหม่ไม่สำเร็จ:', e && e.message);
      return { isOk: true, stale: true };
    }
    return { isOk: true };
  }
  window.emsSaveProfile = saveProfile;

  /* ---------------- เมนูดรอปดาวน์ที่ชื่อผู้ใช้ ---------------- */
  window.toggleUserMenu = function () {
    var m = document.getElementById('userMenu'), b = document.getElementById('userMenuBtn');
    if (!m) return;
    var open = m.classList.contains('hidden');
    m.classList.toggle('hidden', !open);
    if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  window.closeUserMenu = function () {
    var m = document.getElementById('userMenu'), b = document.getElementById('userMenuBtn');
    if (m) m.classList.add('hidden');
    if (b) b.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', function (e) {
    var wrap = document.getElementById('userMenuWrap');
    if (wrap && !wrap.contains(e.target)) window.closeUserMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeUserMenu();
  });

  // รูปเล็กบนหัวเรื่อง — เรียกซ้ำได้ ไม่สร้างของซ้อน
  function refreshAvatar() {
    var box = document.getElementById('userAvatar');
    if (!box) return;
    var d = myDisplay();
    var url = imgUrl(d.photo_link);
    if (canShow(d.photo_link)) {
      box.innerHTML = '<img data-prof-link="' + esc(d.photo_link) + '" src="' + esc(url) + '"'
        + ' class="w-full h-full object-cover" alt="รูปโปรไฟล์">';
    } else {
      box.innerHTML = '<i data-lucide="user" class="w-4 h-4 text-white"></i>';
      if (window.lucide) lucide.createIcons();
    }
    var n = document.getElementById('userMenuName'), r = document.getElementById('userMenuRole');
    if (n) n.textContent = d.name || s(APP.currentUser && APP.currentUser.name);
    if (r) r.textContent = ROLE_LABEL[APP.currentRole] || '';
  }
  window.profileRefreshAvatar = refreshAvatar;

  // กดที่รูปแล้วดูขนาดเต็ม 640×640 เหมือนเปิดรูปโปรไฟล์ใน LINE
  window.profileViewPhoto = function (link) {
    var l = s(link) || s(myDisplay().photo_link);
    if (!canShow(l)) return;
    var old = document.getElementById('profilePhotoViewer');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'profilePhotoViewer';
    box.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4';
    box.setAttribute('onclick', 'this.remove()');
    box.innerHTML = '<div class="bg-white rounded-2xl p-3 shadow-xl">'
      + imgTag(l, 'block rounded-xl', 'รูปโปรไฟล์',
        'width:' + OUT + 'px;height:' + OUT + 'px;max-width:80vw;max-height:80vh;object-fit:cover')
      + '<p class="text-[11px] text-gray-400 text-center mt-2">กดที่ใดก็ได้เพื่อปิด</p></div>';
    document.body.appendChild(box);
  };

  /* ขอรหัสผู้ใช้ตั้งแต่เปิดหน้า แล้ววาดรูปโปรไฟล์ซ้ำให้อีกรอบเมื่อได้คำตอบ
     ก่อนหน้านั้นการหาโปรไฟล์จะถอยไปใช้ชื่อ/อีเมลตามเดิม จึงไม่มีจังหวะที่หน้าจอพัง */
  function initAuthUid() {
    authId().then(function (uid) {
      if (!uid || uid === MY_UID) return;
      MY_UID = uid;
      try {
        refreshAvatar();
        if (typeof renderCurrentPage === 'function' && APP && APP.currentPage) renderCurrentPage();
      } catch (e) { /* ยังไม่เข้าสู่ระบบ ไม่ต้องทำอะไร */ }
    }).catch(function () { /* ยังไม่เข้าสู่ระบบ */ });
  }
  window.profileInitUid = initAuthUid;

  /* ================= หน้าตั้งค่าข้อมูลส่วนตัว ================= */
  function fileBox(kind, link, label, hint, forOther) {
    // รูปโปรไฟล์แสดงตัวอย่างเป็นกรอบจัตุรัสเท่าของจริง ลายเซ็นเป็นแถบกว้าง
    var isPhoto = kind === 'profile';
    var shown = canShow(link)
      ? (isPhoto
        ? '<button type="button" onclick="profileViewPhoto(\'' + esc(link) + '\')" title="ดูรูปขนาดเต็ม"'
          + ' class="w-40 h-40 rounded-2xl overflow-hidden border border-gray-200 bg-white'
          + ' flex items-center justify-center">'
          + imgTag(link, 'w-full h-full object-cover', label) + '</button>'
        : imgTag(link, 'max-h-28 max-w-full object-contain', label, 'background:#fff'))
      : (isProfileFile(link)
        ? '<p class="text-xs text-amber-600">เก็บไฟล์ไว้แล้ว แต่เป็นไฟล์ PDF จึงแสดงตัวอย่างไม่ได้</p>'
        : '<p class="text-xs text-gray-400">ยังไม่มี' + esc(label) + '</p>');
    return '<div class="border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50">'
      + '<div class="' + (isPhoto ? 'min-h-[168px]' : 'min-h-[72px]')
      + ' flex items-center justify-center mb-2">' + shown + '</div>'
      + '<input type="file" accept=".png,.jpg,.jpeg,.svg,.pdf" class="w-full text-xs"'
      + ((forOther || showingSelf()) ? '' : ' disabled')
      + ' onchange="profilePickFile(this, \'' + kind + '\', ' + (forOther ? 'true' : 'false') + ')">'
      + '<p class="text-[11px] text-gray-400 mt-1">' + esc(hint) + '</p>'
      + (isProfileFile(link)
        ? '<button type="button" onclick="profileClearFile(\'' + kind + '\', '
          + (forOther ? 'true' : 'false') + ')"'
          + ' class="mt-2 text-xs text-red-600 hover:underline">ลบ' + esc(label) + '</button>'
        : '')
      + '</div>';
  }

  function profilePage() {
    var u = (window.APP && APP.currentUser) || {};
    var rec = myRecord();
    var prof = myProfile();
    var d = displayOf(rec, prof);
    var isStudent = APP.currentRole === 'student';
    var RO = showingSelf() ? '' : ' disabled';   // อ่านอย่างเดียวเมื่อกำลังแสดงคนอื่น

    // ข้อมูลจากทะเบียนกลาง แสดงให้เห็นว่าอะไรแก้เองไม่ได้
    var fixed = [];
    if (isStudent) {
      fixed = [['รหัสนักศึกษา', rec.student_id], ['รุ่นที่', rec.batch],
        ['ชั้นปี', rec.year_level], ['สถานภาพ', rec.status]];
    } else {
      fixed = [['อีเมล', u.email || rec.email], ['สาขาวิชา', rec.department || u.department],
        ['ชั้นปีที่รับผิดชอบ', u.responsible_year || rec.responsible_year]];
    }
    fixed = fixed.filter(function (x) { return s(x[1]); });

    return '<h2 class="text-xl font-bold text-gray-800 mb-4">'
      + '<i data-lucide="user-cog" class="w-6 h-6 inline mr-2"></i>ตั้งค่าข้อมูลส่วนตัว</h2>'
      + (!showingSelf()
        ? '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 text-sm text-amber-800">'
          + '<i data-lucide="eye" class="w-4 h-4 inline mr-1"></i>'
          + 'กำลังดูแทนผู้ใช้ — หน้านี้แสดงข้อมูลของ <b>'
          + esc(s(u.name)) + '</b> แบบอ่านอย่างเดียว แก้ไขหรืออัปโหลดไฟล์ไม่ได้</div>'
        : '')

      + '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">'

      + '<form id="profileForm" class="bg-white rounded-2xl p-5 border border-blue-100 space-y-4"'
      + ' onsubmit="return profileSubmit(event)">'
      + '<h3 class="font-bold flex items-center gap-2">'
      + '<i data-lucide="id-card" class="w-5 h-5 text-primary"></i>ข้อมูลที่คุณแก้เองได้</h3>'
      + '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">'
      + '<div><label class="block text-xs text-gray-600 mb-1">คำนำหน้า</label>'
      + '<input name="title_prefix" value="' + esc(d.title_prefix) + '" placeholder="เช่น นางสาว"' + RO
      + ' class="w-full border rounded-xl px-3 py-2 text-sm"></div>'
      + '<div class="sm:col-span-2"><label class="block text-xs text-gray-600 mb-1">ชื่อ-สกุล</label>'
      + '<input name="full_name" value="' + esc(d.name) + '"' + RO
      + ' class="w-full border rounded-xl px-3 py-2 text-sm"></div>'
      + '</div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">เบอร์โทรศัพท์</label>'
      + '<input name="phone" value="' + esc(d.phone) + '" inputmode="tel" placeholder="เช่น 08x-xxx-xxxx"' + RO
      + ' class="w-full border rounded-xl px-3 py-2 text-sm"></div>'
      + '<p class="text-xs text-gray-400">ชื่อที่แก้ตรงนี้ใช้แสดงในระบบและในเอกสารของคุณ '
      + 'ทะเบียนกลางที่งานทะเบียนดูแลยังเป็นชื่อเดิม — ถ้าต้องการเปลี่ยนชื่อในทะเบียน กรุณาแจ้งงานทะเบียน</p>'

      + (fixed.length
        ? '<div class="pt-2 border-t border-gray-100">'
          + '<p class="text-xs font-semibold text-gray-600 mb-2">ข้อมูลจากทะเบียน (แก้เองไม่ได้)</p>'
          + '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">'
          + fixed.map(function (x) {
            return '<div class="bg-gray-50 rounded-xl px-3 py-2">'
              + '<p class="text-[11px] text-gray-500">' + esc(x[0]) + '</p>'
              + '<p class="text-sm text-gray-800">' + esc(x[1]) + '</p></div>';
          }).join('')
          + '</div></div>'
        : '')

      + '<button type="submit"' + RO
      + ' class="w-full bg-primary text-white py-2.5 rounded-xl hover:bg-primaryDark'
      + ' disabled:opacity-50 flex items-center justify-center gap-2">'
      + '<i data-lucide="save" class="w-4 h-4"></i>บันทึกข้อมูลส่วนตัว</button>'
      + '</form>'

      + '<div class="space-y-4">'
      + '<div class="bg-white rounded-2xl p-5 border border-blue-100">'
      + '<h3 class="font-bold mb-3 flex items-center gap-2">'
      + '<i data-lucide="image" class="w-5 h-5 text-primary"></i>รูปโปรไฟล์</h3>'
      + fileBox('profile', d.photo_link, 'รูปโปรไฟล์',
        'เลือกไฟล์ .png .jpg .jpeg แล้วครอปให้พอดีกรอบก่อนบันทึก · รองรับ .svg .pdf ด้วย '
        + '(อัปโหลดตามเดิม ครอปไม่ได้) — ไม่เกิน 5 MB')
      + '</div>'

      + '<div class="bg-white rounded-2xl p-5 border border-blue-100">'
      + '<h3 class="font-bold mb-1 flex items-center gap-2">'
      + '<i data-lucide="pen-tool" class="w-5 h-5 text-primary"></i>ลายเซ็น</h3>'
      + '<p class="text-xs text-gray-500 mb-3">ใช้แสดงในใบลาตรงช่องลงนามของบทบาทคุณ '
      + 'แนะนำไฟล์ .png พื้นหลังโปร่งใส หรือวาดเองด้านล่าง</p>'
      + '<div class="mb-3">'
      + '<p class="text-xs font-semibold text-gray-600 mb-1">วาดลายเซ็นเอง</p>'
      + '<canvas id="sigPad" width="600" height="200"'
      + ' class="w-full border border-gray-300 rounded-xl bg-white touch-none cursor-crosshair"></canvas>'
      + '<div class="flex flex-wrap gap-2 mt-2">'
      + '<button type="button" onclick="profileSigClear()"'
      + ' class="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-surface">ล้าง</button>'
      + '<button type="button" onclick="profileSigSave()"'
      + ' class="px-3 py-1.5 bg-primary text-white rounded-xl text-xs hover:bg-primaryDark">'
      + 'บันทึกลายเซ็นที่วาด</button>'
      + '</div></div>'
      + '<p class="text-xs font-semibold text-gray-600 mb-1">หรืออัปโหลดไฟล์ลายเซ็น</p>'
      + fileBox('signature', d.signature_link, 'ลายเซ็น',
        'รองรับ .png .jpg .jpeg .svg .pdf — ไม่เกิน 5 MB')
      + '</div>'
      + '</div>'

      + '</div>'
      + (isAdmin() ? '<div class="mt-4">' + adminCard() + '</div>' : '');
  }

  /* ---------------- ตัวช่วยของหน้าตั้งค่า ---------------- */
  window.profileSubmit = function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var f = document.getElementById('profileForm');
    if (!f) return false;
    var g = function (n) { var e = f.querySelector('[name="' + n + '"]'); return e ? s(e.value) : ''; };
    var run = async function () {
      var r = await saveProfile({
        title_prefix: g('title_prefix'), full_name: g('full_name'), phone: g('phone')
      });
      if (!r.isOk) { toast('บันทึกไม่สำเร็จ: ' + r.error, 'error'); return; }
      toast('บันทึกข้อมูลส่วนตัวแล้ว');
      refreshAvatar();
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    };
    if (typeof withLoading === 'function') withLoading(f, run); else run();
    return false;
  };

  window.profilePickFile = function (input, kind, forOther) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    var tg = forOther ? currentTarget() : null;
    if (forOther && !tg) { toast('ยังไม่ได้เลือกผู้ใช้', 'error'); input.value = ''; return; }
    // รูปโปรไฟล์ให้ครอปเป็นสี่เหลี่ยมจัตุรัสก่อน จะได้พอดีกรอบวงกลมที่ใช้แสดงจริง
    // ไฟล์ .svg และ .pdf ครอปด้วยผืนผ้าใบไม่ได้ จึงอัปโหลดตามเดิม
    if (kind === 'profile' && CROPPABLE.indexOf(extOf(file.name)) >= 0) {
      openCropper(file, tg);
      input.value = '';
      return;
    }
    toast('กำลังอัปโหลด...', 'loading');
    uploadProfileFile(file, kind, tg).then(function (r) {
      var t = document.getElementById('loadingToast'); if (t) t.remove();
      if (!r.isOk) { toast(r.error, 'error'); input.value = ''; return; }
      saveProfile(linkPatch(kind, r), tg).then(function (sv) {
        if (!sv.isOk) { toast('อัปโหลดแล้วแต่บันทึกไม่สำเร็จ: ' + sv.error, 'error'); return; }
        toast(kind === 'signature' ? 'บันทึกลายเซ็นแล้ว' : 'บันทึกรูปโปรไฟล์แล้ว');
        refreshAvatar();
        if (typeof renderCurrentPage === 'function') renderCurrentPage();
      });
    });
  };

  window.profileClearFile = async function (kind, forOther) {
    var tg = forOther ? currentTarget() : null;
    if (forOther && !tg) return;
    var uid = (tg && s(tg.uid)) || MY_UID || await authId();
    var prev = profileByUid(uid) || {};

    // ล้างในฐานข้อมูลก่อน หน้าจอจะได้ไม่ค้างชี้ไปยังไฟล์ที่กำลังจะหาย
    var patch = {};
    patch[linkField(kind)] = '';
    patch[driveField(kind)] = '';
    var r = await saveProfile(patch, tg);
    if (!r.isOk) { toast('ลบไม่สำเร็จ: ' + r.error, 'error'); return; }

    // แล้วค่อยลบไฟล์จริงทิ้งทั้งในถังไฟล์และบนไดรฟ์ ไม่เก็บของเดิมไว้
    await purgeOld(kind, uid, s(prev[driveField(kind)]), '');
    toast('ลบแล้ว');
    refreshAvatar();
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  /* ---------------- ครอปรูปโปรไฟล์ก่อนบันทึก ----------------
     รูปที่ผู้ใช้เลือกมามีสัดส่วนไม่แน่นอน แต่ที่แสดงจริงเป็นกรอบจัตุรัส/วงกลม
     ถ้าอัปโหลดดิบ ๆ เบราว์เซอร์จะครอปกลางภาพให้เอง ซึ่งมักตัดหัวหรือตัดคางขาด
     จึงให้เลือกเองว่าจะเอาส่วนไหน แล้วส่งขึ้นเป็นรูปจัตุรัสที่ครอปแล้ว */
  var CROPPABLE = ['png', 'jpg', 'jpeg'];
  var VIEW = 320;        // ขนาดกรอบที่เห็นบนจอตอนครอป
  var OUT = 640;         // ขนาดไฟล์ที่บันทึกจริง เท่ากับรูปโปรไฟล์ของ LINE
  var crop = null;       // { img, url, scale, base, x, y }
  var cropTarget = null; // คนที่จะตั้งรูปให้ — ว่าง = ของตัวเอง

  function cropDraw() {
    if (!crop) return;
    var cv = document.getElementById('profileCropCanvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var w = crop.img.width * crop.scale, h = crop.img.height * crop.scale;
    // ไม่ให้ลากจนเห็นขอบว่าง — รูปต้องคลุมกรอบไว้เสมอ
    crop.x = Math.min(0, Math.max(VIEW - w, crop.x));
    crop.y = Math.min(0, Math.max(VIEW - h, crop.y));
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0, 0, VIEW, VIEW);
    ctx.drawImage(crop.img, crop.x, crop.y, w, h);
  }

  function openCropper(file, target) {
    cropTarget = target || null;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { buildCropUI(img, url); };
    img.onerror = function () { URL.revokeObjectURL(url); toast('อ่านไฟล์รูปนี้ไม่ได้', 'error'); };
    img.src = url;
  }

  function buildCropUI(img, url) {
    closeCropper();
    var base = Math.max(VIEW / img.width, VIEW / img.height);   // ย่อ/ขยายให้พอดีคลุมกรอบ
    crop = { img: img, url: url, base: base, scale: base, x: 0, y: 0 };
    crop.x = (VIEW - img.width * base) / 2;
    crop.y = (VIEW - img.height * base) / 2;

    var wrap = document.createElement('div');
    wrap.id = 'profileCropModal';
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    wrap.innerHTML = '<div class="bg-white rounded-2xl p-5 w-full max-w-sm">'
      + '<h3 class="font-bold mb-1">ครอปรูปโปรไฟล์</h3>'
      + '<p class="text-xs text-gray-500 mb-3">ลากรูปเพื่อเลื่อน และเลื่อนแถบด้านล่างเพื่อย่อ-ขยาย '
      + 'ส่วนที่อยู่ในวงกลมคือส่วนที่จะแสดงจริง · บันทึกเป็นรูป ' + OUT + '×' + OUT + ' พิกเซล</p>'
      // ขยายจากต้นฉบับที่เล็กกว่านี้ รูปจะเบลอ บอกไว้ก่อนดีกว่าให้ไปเห็นตอนบันทึกแล้ว
      + (Math.min(img.width, img.height) < OUT
        ? '<p class="text-xs text-amber-600 mb-3">รูปต้นฉบับมีขนาด ' + img.width + '×' + img.height
          + ' พิกเซล เล็กกว่า ' + OUT + '×' + OUT + ' ที่ระบบเก็บ รูปที่ได้อาจไม่คมชัดนัก</p>'
        : '')
      + '<div class="relative mx-auto overflow-hidden rounded-xl" style="width:' + VIEW + 'px;height:' + VIEW + 'px">'
      + '<canvas id="profileCropCanvas" width="' + VIEW + '" height="' + VIEW + '"'
      + ' class="block touch-none cursor-move"></canvas>'
      + '<div class="absolute inset-0 pointer-events-none" style="border-radius:9999px;'
      + 'box-shadow:0 0 0 9999px rgba(255,255,255,.62);outline:1px solid rgba(30,111,186,.5)"></div>'
      + '</div>'
      + '<div class="flex items-center gap-2 mt-3">'
      + '<i data-lucide="zoom-out" class="w-4 h-4 text-gray-400"></i>'
      + '<input id="profileCropZoom" type="range" min="1" max="4" step="0.01" value="1" class="flex-1">'
      + '<i data-lucide="zoom-in" class="w-4 h-4 text-gray-400"></i>'
      + '</div>'
      + '<div class="flex gap-2 mt-4">'
      + '<button type="button" onclick="profileCropCancel()"'
      + ' class="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600 hover:bg-surface">ยกเลิก</button>'
      + '<button type="button" onclick="profileCropApply()"'
      + ' class="flex-1 bg-primary text-white rounded-xl py-2 text-sm hover:bg-primaryDark">ใช้รูปนี้</button>'
      + '</div></div>';
    document.body.appendChild(wrap);
    if (window.lucide) lucide.createIcons();

    var cv = document.getElementById('profileCropCanvas');
    var dragging = false, lastX = 0, lastY = 0;
    cv.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      e.preventDefault();
      crop.x += e.clientX - lastX; crop.y += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cropDraw();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      cv.addEventListener(ev, function () { dragging = false; });
    });

    var zoom = document.getElementById('profileCropZoom');
    zoom.addEventListener('input', function () {
      var mul = parseFloat(zoom.value) || 1;
      var old = crop.scale;
      crop.scale = crop.base * mul;
      // ย่อ-ขยายโดยยึดจุดกึ่งกลางกรอบไว้ ไม่ให้ภาพวิ่งหนี
      var k = crop.scale / old;
      crop.x = VIEW / 2 - (VIEW / 2 - crop.x) * k;
      crop.y = VIEW / 2 - (VIEW / 2 - crop.y) * k;
      cropDraw();
    });

    cropDraw();
  }

  function closeCropper() {
    var m = document.getElementById('profileCropModal');
    if (m) m.remove();
    if (crop && crop.url) URL.revokeObjectURL(crop.url);
    crop = null;
  }
  window.profileCropCancel = closeCropper;

  window.profileCropApply = function () {
    if (!crop) return;
    var out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    var ctx = out.getContext('2d');
    var k = OUT / VIEW;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(crop.img, crop.x * k, crop.y * k,
      crop.img.width * crop.scale * k, crop.img.height * crop.scale * k);
    closeCropper();
    toast('กำลังอัปโหลด...', 'loading');
    out.toBlob(function (blob) {
      if (!blob) {
        var t0 = document.getElementById('loadingToast'); if (t0) t0.remove();
        toast('ครอปรูปไม่สำเร็จ', 'error'); return;
      }
      var file = new File([blob], 'profile.png', { type: 'image/png' });
      var tg = cropTarget; cropTarget = null;
      uploadProfileFile(file, 'profile', tg).then(function (r) {
        var t = document.getElementById('loadingToast'); if (t) t.remove();
        if (!r.isOk) { toast(r.error, 'error'); return; }
        saveProfile(linkPatch('profile', r), tg).then(function (sv) {
          if (!sv.isOk) { toast('อัปโหลดแล้วแต่บันทึกไม่สำเร็จ: ' + sv.error, 'error'); return; }
          toast('บันทึกรูปโปรไฟล์แล้ว');
          refreshAvatar();
          if (typeof renderCurrentPage === 'function') renderCurrentPage();
        });
      });
    }, 'image/png');
  };

  /* ---------------- กระดานวาดลายเซ็น ----------------
     รองรับทั้งเมาส์และนิ้ว ใช้ Pointer Events ตัวเดียวจบ
     ปรับความละเอียดตามหน้าจอ ลายเซ็นบนจอความละเอียดสูงจะได้ไม่แตก */
  var sigDirty = false;
  function setupSigPad() {
    var cv = document.getElementById('sigPad');
    if (!cv || cv.dataset.ready === '1') return;
    cv.dataset.ready = '1';
    sigDirty = false;
    var ratio = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    if (rect.width) {
      cv.width = Math.round(rect.width * ratio);
      cv.height = Math.round(200 * ratio);
    }
    var ctx = cv.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
    var drawing = false;
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    cv.addEventListener('pointerdown', function (e) {
      drawing = true; sigDirty = true;
      cv.setPointerCapture(e.pointerId);
      var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      cv.addEventListener(ev, function () { drawing = false; });
    });
  }
  window.profileSetupSigPad = setupSigPad;

  window.profileSigClear = function () {
    var cv = document.getElementById('sigPad');
    if (!cv) return;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    sigDirty = false;
  };

  window.profileSigSave = function () {
    var cv = document.getElementById('sigPad');
    if (!cv) return;
    if (!sigDirty) { toast('ยังไม่ได้วาดลายเซ็น', 'error'); return; }
    toast('กำลังบันทึกลายเซ็น...', 'loading');
    cv.toBlob(function (blob) {
      if (!blob) {
        var t0 = document.getElementById('loadingToast'); if (t0) t0.remove();
        toast('บันทึกลายเซ็นไม่สำเร็จ', 'error'); return;
      }
      var file = new File([blob], 'signature.png', { type: 'image/png' });
      uploadProfileFile(file, 'signature').then(function (r) {
        var t = document.getElementById('loadingToast'); if (t) t.remove();
        if (!r.isOk) { toast(r.error, 'error'); return; }
        saveProfile(linkPatch('signature', r)).then(function (sv) {
          if (!sv.isOk) { toast('บันทึกไม่สำเร็จ: ' + sv.error, 'error'); return; }
          toast('บันทึกลายเซ็นแล้ว');
          if (typeof renderCurrentPage === 'function') renderCurrentPage();
        });
      });
    }, 'image/png');
  };

  /* ================= ผู้ดูแลระบบตั้งรูป/ลายเซ็นให้ผู้อื่น =================
     เปิดเฉพาะบทบาท admin และฐานข้อมูลบังคับซ้ำอีกชั้น
     บทบาทอื่นถึงจะแก้หน้าเว็บให้ปุ่มโผล่ ก็เขียนของคนอื่นไม่ได้อยู่ดี */
  function isAdmin() { return (window.APP && APP.currentRole) === 'admin'; }

  // รายชื่อผู้ใช้ที่มีบัญชีเข้าระบบ — โปรไฟล์ผูกกับบัญชี จึงตั้งให้คนที่ไม่มีบัญชีไม่ได้
  function manageableUsers() {
    var seen = {};
    return get('user').filter(function (u) {
      if (s(u.is_active) === '0' || s(u.is_active) === 'ปิด') return false;
      var k = keyOfRecord(u);
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    }).sort(function (a, b) { return s(a.name).localeCompare(s(b.name)); });
  }

  function currentTarget() {
    var key = s(window.APP && APP._profileTarget);
    if (!key) return null;
    var u = manageableUsers().find(function (x) { return keyOfRecord(x) === key; });
    if (!u) return null;
    var uid = s(window.APP && APP._profileTargetUid);
    if (!uid) return null;
    return { uid: uid, key: key, name: s(u.name), role: s(u.role) };
  }

  // ขอรหัสผู้ใช้ของเป้าหมายจากฐานข้อมูล (เปิดให้เฉพาะผู้ดูแลระบบ)
  window.profileSetTarget = function (key) {
    APP._profileTarget = s(key);
    APP._profileTargetUid = '';
    if (!APP._profileTarget) { renderCurrentPage(); return; }
    var c = client();
    if (!c) return;
    c.rpc('ems_user_uid', { p_key: APP._profileTarget }).then(function (r) {
      APP._profileTargetUid = s(r && r.data);
      if (!APP._profileTargetUid) toast('ผู้ใช้รายนี้ยังไม่มีบัญชีเข้าระบบ จึงตั้งรูปให้ไม่ได้', 'error');
      renderCurrentPage();
    }).catch(function (e) {
      toast('ค้นบัญชีไม่สำเร็จ: ' + (e && e.message), 'error');
    });
  };

  function adminCard() {
    if (!isAdmin()) return '';
    var users = manageableUsers();
    var key = s(window.APP && APP._profileTarget);
    var uid = s(window.APP && APP._profileTargetUid);
    var prof = uid ? profileByUid(uid) : null;
    var picked = users.find(function (x) { return keyOfRecord(x) === key; });

    var body;
    if (!key) {
      body = '<p class="text-sm text-gray-400 text-center py-6">เลือกผู้ใช้ด้านบนก่อน</p>';
    } else if (!uid) {
      body = '<p class="text-sm text-amber-600 text-center py-6">กำลังค้นบัญชีของผู้ใช้รายนี้ '
        + 'หรือผู้ใช้รายนี้ยังไม่มีบัญชีเข้าระบบ</p>';
    } else {
      body = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'
        + '<div><p class="text-xs font-semibold text-gray-600 mb-1">รูปโปรไฟล์</p>'
        + fileBox('profile', s(prof && prof.photo_link), 'รูปโปรไฟล์',
          'เลือกไฟล์รูปแล้วครอปให้พอดีกรอบ · บันทึกเป็น ' + OUT + '×' + OUT + ' พิกเซล', true) + '</div>'
        + '<div><p class="text-xs font-semibold text-gray-600 mb-1">ลายเซ็น</p>'
        + fileBox('signature', s(prof && prof.signature_link), 'ลายเซ็น',
          'รองรับ .png .jpg .jpeg .svg .pdf — ไม่เกิน 5 MB', true) + '</div>'
        + '</div>';
    }

    return '<div class="bg-white rounded-2xl p-5 border border-amber-200">'
      + '<h3 class="font-bold mb-1 flex items-center gap-2">'
      + '<i data-lucide="users-round" class="w-5 h-5 text-amber-600"></i>'
      + 'ตั้งรูปโปรไฟล์และลายเซ็นให้ผู้อื่น</h3>'
      + '<p class="text-xs text-gray-500 mb-3">เฉพาะผู้ดูแลระบบ · '
      + 'ลายเซ็นที่ตั้งให้จะถูกนำไปขึ้นในเอกสารแทนเจ้าตัว '
      + 'ควรทำเมื่อได้รับความยินยอมจากเจ้าของลายเซ็นแล้วเท่านั้น</p>'
      + '<label class="block text-xs text-gray-600 mb-1">เลือกผู้ใช้</label>'
      + '<select onchange="profileSetTarget(this.value)"'
      + ' class="w-full sm:max-w-lg border rounded-xl px-3 py-2 text-sm mb-3">'
      + '<option value="">-- เลือกผู้ใช้ --</option>'
      + users.map(function (u) {
        var k = keyOfRecord(u);
        return '<option value="' + esc(k) + '"' + (k === key ? ' selected' : '') + '>'
          + esc(s(u.name) || k) + ' — ' + esc(ROLE_LABEL[s(u.role)] || s(u.role)) + '</option>';
      }).join('')
      + '</select>'
      + (picked && uid
        ? '<p class="text-xs text-gray-500 mb-2">กำลังตั้งให้ <b>' + esc(s(picked.name) || key) + '</b></p>'
        : '')
      + body
      + '</div>';
  }

  /* ================= การ์ดข้อมูลส่วนบุคคลในหน้าหลัก ================= */
  function myInfoCard() {
    var u = (window.APP && APP.currentUser) || {};
    var rec = myRecord();
    var d = displayOf(rec, myProfile());
    var full = d.title_prefix && d.name.indexOf(d.title_prefix) !== 0
      ? d.title_prefix + d.name : d.name;
    var rows = [];
    if (APP.currentRole === 'student') {
      rows = [['รหัสนักศึกษา', rec.student_id], ['รุ่นที่', rec.batch],
        ['ชั้นปี', rec.year_level ? 'ชั้นปีที่ ' + rec.year_level : ''],
        ['ห้อง', rec.room], ['อาจารย์ที่ปรึกษา', rec.advisor],
        ['เบอร์โทรศัพท์', d.phone], ['อีเมล', rec.email]];
    } else {
      rows = [['อีเมล', u.email || rec.email], ['สาขาวิชา', rec.department || u.department],
        ['ตำแหน่ง', rec.position], ['เบอร์โทรศัพท์', d.phone],
        ['ชั้นปีที่รับผิดชอบ', (u.responsible_year || rec.responsible_year)
          ? 'ชั้นปีที่ ' + (u.responsible_year || rec.responsible_year) : ''],
        ['ห้องเรียนประจำ', rec.homeroom]];
    }
    rows = rows.filter(function (x) { return s(x[1]); });

    /* กรอบรูปใหญ่แบบโปรไฟล์ LINE — กำหนดขนาดไว้ที่กรอบ ไม่ใช่ที่ตัวรูป
       รูปโหลดทีหลัง ถ้าขนาดอยู่ที่ตัวรูป หน้าจอจะกระตุกตอนรูปมาถึง */
    var FRAME = 'w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden flex-shrink-0'
      + ' flex items-center justify-center';
    var avatar = canShow(d.photo_link)
      ? '<button type="button" onclick="profileViewPhoto()" title="ดูรูปขนาดเต็ม"'
        + ' class="' + FRAME + ' border border-blue-100 bg-surface">'
        + imgTag(d.photo_link, 'w-full h-full object-cover', 'รูปโปรไฟล์') + '</button>'
      : '<div class="' + FRAME + ' bg-primaryLight">'
        + '<i data-lucide="user" class="w-12 h-12 text-primary"></i></div>';

    return '<div class="bg-white rounded-2xl p-5 border border-blue-100 mb-4">'
      + '<div class="flex items-start gap-4 flex-wrap">'
      + avatar
      + '<div class="flex-1 min-w-[180px]">'
      + '<p class="text-xl sm:text-2xl font-bold text-gray-800">' + esc(full || 'ผู้ใช้') + '</p>'
      + '<p class="text-xs text-gray-500">' + esc(ROLE_LABEL[APP.currentRole] || '') + '</p>'
      + '</div>'
      + '<button onclick="navigateTo(\'profile\')"'
      + ' class="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-xl text-xs'
      + ' text-gray-600 hover:bg-surface"><i data-lucide="settings" class="w-3.5 h-3.5"></i>'
      + 'ตั้งค่าข้อมูลส่วนตัว</button>'
      + '</div>'
      + (rows.length
        ? '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">'
          + rows.map(function (x) {
            return '<div class="bg-surface rounded-xl px-3 py-2">'
              + '<p class="text-[11px] text-gray-500">' + esc(x[0]) + '</p>'
              + '<p class="text-sm text-gray-800 break-words">' + esc(x[1]) + '</p></div>';
          }).join('')
          + '</div>'
        : '<p class="text-xs text-gray-400 mt-3">ยังไม่มีข้อมูลเพิ่มเติมในระบบ</p>')
      + '</div>';
  }
  window.profileMyInfoCard = myInfoCard;

  /* ================= ต่อเข้ากับระบบเดิม ================= */
  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (page === 'profile') return profilePage();
      var html = orig.apply(this, arguments);
      // หน้าหลักของทุกบทบาท ขึ้นต้นด้วยการ์ดข้อมูลของตัวเอง
      if (page === 'dashboard') return myInfoCard() + html;
      return html;
    };
  })();

  (function () {
    var orig = window.renderCurrentPage;
    if (typeof orig !== 'function') return;
    window.renderCurrentPage = function () {
      orig.apply(this, arguments);
      try {
        if (!MY_UID) initAuthUid();
        refreshAvatar();
        // โหมดดูแทนผู้ใช้ไม่ต้องเปิดกระดานวาด เพราะบันทึกไม่ได้อยู่แล้ว
        if (APP.currentPage === 'profile' && showingSelf()) setupSigPad();
      } catch (e) { console.warn('เตรียมหน้าโปรไฟล์ไม่สำเร็จ:', e); }
    };
  })();
})();
