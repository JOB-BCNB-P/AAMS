/* ================================================================
   smooth.js — ยุบ/ขยายแบบนุ่มทั้งระบบ
   ----------------------------------------------------------------
   เดิมการ์ดที่กดยุบ-ขยายได้ (<details>) และเมนูย่อยในแถบซ้าย "กระโดด" เปิด/ปิดทันที
   ไฟล์นี้ทำให้ค่อย ๆ กาง/หุบด้วยความสูง พร้อมจางเข้า-ออก โดยไม่ต้องแก้ทีละหน้า

   1) การ์ด <details> ทุกใบ (ภาพรวมผลการเรียน ผลสอบ ENG การลา รายชื่อ ฯลฯ)
      • กดหัวการ์ด → กาง/หุบนุ่ม ลูกศรหมุนพร้อมกัน
      • ปุ่มหรือช่องกรอกที่อยู่บนหัวการ์ดทำงานตามเดิม ไม่ทำให้การ์ดยุบ
      • ยังจำสถานะเปิด/ยุบเหมือนเดิม (เหตุการณ์ toggle ยังเกิดตามปกติ)
   2) เมนูกลุ่มในแถบซ้าย (ระบบทะเบียน ผลการศึกษา ติดตามการส่ง ภาระงาน ประเมินผลรายวิชา)
   3) ส่วนที่ซ่อน/แสดงตามตัวเลือก (เช่น ช่องข้อมูลการสอบ ช่องแจ้งเตือน รายชื่อที่ส่งแล้ว/ยังไม่ส่ง)
      เมื่อปรากฏจะค่อย ๆ กางลงมา · ส่วนที่มีปุ่มยุบเองใช้ emsSmoothToggle(el) ให้หุบนุ่มด้วย

   เคารพการตั้งค่า "ลดการเคลื่อนไหว" ของเครื่อง — ถ้าเปิดไว้จะเปิด/ปิดทันทีเหมือนเดิม
   ไม่อยากให้ส่วนไหนเคลื่อนไหว ใส่ data-no-smooth ที่ตัวนั้น
   ================================================================ */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof Element === 'undefined') return;

  var EASE = 'cubic-bezier(.4, 0, .2, 1)';
  function reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function canAnimate(el) { return !!(el && el.animate) && !reduced() && !(el.closest && el.closest('[data-no-smooth]')); }
  // ระยะไกลใช้เวลานานขึ้นเล็กน้อย แต่ไม่เกินเกือบครึ่งวินาที ให้รู้สึกไว
  function dur(px) { return Math.round(Math.max(180, Math.min(420, 160 + Math.abs(px) * 0.22))); }
  function px(v) { return (parseFloat(v) || 0); }

  /* ---------------- 1) <details> ---------------- */
  function closedHeight(det, sum) {
    var cs = getComputedStyle(det);
    return sum.offsetHeight + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  }
  function finish(det) {
    det.style.overflow = '';
    det.style.height = '';
    det.classList.remove('ems-closing');
    det._emsAnim = null;
  }
  function animateDetails(det, open) {
    var sum = det.querySelector(':scope > summary');
    if (!sum) { det.open = open; return; }
    var from = det.offsetHeight;
    if (det._emsAnim) { det._emsAnim.onfinish = null; det._emsAnim.cancel(); }
    det.style.overflow = 'hidden';
    if (open) {
      det.open = true;
      det.classList.remove('ems-closing');
      var to = det.offsetHeight;
      var a = det.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: dur(to - from), easing: EASE });
      // เนื้อหาจางเข้าเล็กน้อยระหว่างกาง
      Array.prototype.forEach.call(det.children, function (c) {
        if (c !== sum && c.animate) c.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: dur(to - from), easing: EASE });
      });
      det._emsAnim = a;
      a.onfinish = function () { finish(det); };
      a.oncancel = function () { if (det._emsAnim === a) finish(det); };
    } else {
      det.classList.add('ems-closing');
      var end = closedHeight(det, sum);
      var b = det.animate([{ height: from + 'px' }, { height: end + 'px' }], { duration: dur(from - end), easing: EASE });
      det._emsAnim = b;
      b.onfinish = function () { det.open = false; finish(det); };
      b.oncancel = function () { if (det._emsAnim === b) finish(det); };
    }
  }
  window.emsAnimateDetails = animateDetails;

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;          // ปุ่มบนหัวการ์ดที่สั่งกันการยุบไว้แล้ว
    var t = e.target;
    var sum = t && t.closest && t.closest('summary');
    if (!sum) return;
    var det = sum.parentElement;
    if (!det || det.tagName !== 'DETAILS') return;
    // คลิกปุ่ม/ลิงก์/ช่องกรอกบนหัวการ์ด ให้ทำงานแบบเดิมของมัน
    var inter = t.closest('a, button, input, select, textarea, label');
    if (inter && inter !== sum && sum.contains(inter)) return;
    if (!canAnimate(det)) return;
    e.preventDefault();
    animateDetails(det, !det.open || det.classList.contains('ems-closing'));
  });

  /* ---------------- 2) เมนูกลุ่มในแถบซ้าย ---------------- */
  var origToggle = window.toggleDropdown;
  window.toggleDropdown = function (btn) {
    var p = btn && btn.parentElement;
    var menu = p && p.querySelector(':scope > .dropdown-menu');
    if (!menu || !canAnimate(menu)) { return origToggle ? origToggle.apply(this, arguments) : undefined; }
    var opening = !p.classList.contains('dropdown-open') || p.classList.contains('ems-dd-closing');
    var chev = btn.querySelector('[data-lucide="chevron-down"], svg.lucide-chevron-down');
    if (chev) chev.style.transform = opening ? 'rotate(180deg)' : '';
    if (menu._emsAnim) { menu._emsAnim.onfinish = null; menu._emsAnim.cancel(); }
    var from = p.classList.contains('dropdown-open') ? menu.offsetHeight : 0;
    menu.style.overflow = 'hidden';
    var done = function () { menu.style.overflow = ''; menu._emsAnim = null; };
    if (opening) {
      p.classList.remove('ems-dd-closing');
      p.classList.add('dropdown-open');
      var to = menu.scrollHeight;
      var a = menu.animate([{ height: from + 'px', opacity: from ? 1 : 0 }, { height: to + 'px', opacity: 1 }], { duration: dur(to - from), easing: EASE });
      menu._emsAnim = a; a.onfinish = done; a.oncancel = done;
    } else {
      p.classList.add('ems-dd-closing');
      var b = menu.animate([{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: dur(from), easing: EASE });
      menu._emsAnim = b;
      b.onfinish = function () { p.classList.remove('dropdown-open', 'ems-dd-closing'); done(); };
      b.oncancel = done;
    }
  };

  /* ---------------- 3) ส่วนที่ซ่อน/แสดงด้วยคลาส hidden ---------------- */
  function slideIn(el) {
    if (!canAnimate(el) || el._emsAnim) return;
    var h = el.offsetHeight;
    if (!h || h > 1600) return;          // ก้อนใหญ่มาก (ตารางยาว) ให้โผล่ทันที ไม่ให้รู้สึกหน่วง
    var prev = el.style.overflow;
    el.style.overflow = 'hidden';
    var a = el.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: dur(h), easing: EASE });
    el._emsAnim = a;
    var end = function () { el.style.overflow = prev; el._emsAnim = null; };
    a.onfinish = end; a.oncancel = end;
  }
  // หุบนุ่มแล้วค่อยซ่อน — ใช้กับปุ่มที่ผู้ใช้กดยุบเอง
  window.emsSmoothToggle = function (el) {
    if (!el) return;
    if (el.classList.contains('hidden')) { el.classList.remove('hidden'); return; }   // ตัวเฝ้าดูด้านล่างจะกางให้
    if (!canAnimate(el)) { el.classList.add('hidden'); return; }
    var h = el.offsetHeight, prev = el.style.overflow;
    el.style.overflow = 'hidden';
    var a = el.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: dur(h), easing: EASE });
    el._emsAnim = a;
    a.onfinish = function () { el.classList.add('hidden'); el.style.overflow = prev; el._emsAnim = null; };
    a.oncancel = function () { el.style.overflow = prev; el._emsAnim = null; };
  };

  function hadHidden(old) { return (' ' + (old || '') + ' ').indexOf(' hidden ') >= 0; }
  var mo = new MutationObserver(function (list) {
    list.forEach(function (m) {
      var el = m.target;
      if (m.attributeName !== 'class' || !hadHidden(m.oldValue) || el.classList.contains('hidden')) return;
      if (el.id === 'modalContainer' || el.closest('#sidebar, .ems-notif-panel, .dropdown-menu')) return;
      if (!el.closest('#mainContent, #modalContainer')) return;
      slideIn(el);
    });
  });
  function start() {
    ['mainContent', 'modalContainer'].forEach(function (id) {
      var root = document.getElementById(id);
      if (root) mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
  }
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
