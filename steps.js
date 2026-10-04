/* ================================================================
   steps.js — แบ่งฟอร์มบันทึกข้อมูลเป็นขั้นตอนมีหมายเลข ①②③ แบบเดียวกับหน้าบันทึกการให้คำปรึกษา
   ----------------------------------------------------------------
   ไม่ได้เขียนฟอร์มใหม่ทีละเมนู แต่ "จัดกลุ่ม" ช่องเดิมของฟอร์มเข้าเป็นหมวดตามตาราง STEPS ด้านล่าง
     • ช่อง ปุ่ม และโค้ดเดิมของแต่ละฟอร์มยังเป็นตัวเดิมทั้งหมด (ย้ายตำแหน่ง ไม่ได้สร้างใหม่)
       การบันทึก การเติมอัตโนมัติ และการตรวจข้อมูลของเดิมจึงทำงานเหมือนเดิม
     • แต่ละหมวดเริ่มที่ "ช่องแรกของหมวด" (anchor) ช่องถัดไปจนถึงหมวดถัดไปอยู่ในหมวดเดียวกัน
     • ปุ่มบันทึกอยู่ในขั้นสุดท้าย "ตรวจสอบแล้วกดบันทึก" เสมอ
     • เลขเป็นสีเขียวพร้อมเครื่องหมายถูก เมื่อกรอกช่องบังคับ (*) ในหมวดนั้นครบ
       หมวดที่ต้องทำต่อมีวงแหวนเน้น หมวดที่ซ่อนอยู่ (เช่น ข้อมูลการสอบ เมื่อไม่ใช่ประเภทสอบ) ไม่นับเลข
   เพิ่มฟอร์มใหม่ : เพิ่มรายการใน STEPS ด้วย id ของฟอร์ม → [ชื่อหมวด, ตัวเลือกช่องแรก, คำอธิบาย]
     ตัวเลือกช่องแรกใช้ CSS selector หรือขึ้นต้นด้วย ~ เพื่อหาจากข้อความป้ายกำกับ
   ================================================================ */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var STEPS = {
    addStudentForm: [
      ['ชื่อและรหัสนักศึกษา', '[name="title_prefix"]', 'กรอกรหัสนักศึกษาและชื่อ-สกุลก่อน'],
      ['สถานภาพและชั้นเรียน', '[name="status"]'],
      ['ข้อมูลส่วนตัวและการติดต่อ', '[name="gender"]'],
      ['อาจารย์ที่ปรึกษาและการรับเข้าศึกษา', '[name="advisor"]'],
      ['การโอนย้าย / ลาออก / พักการศึกษา', '[name="transfer_from"]', 'กรอกเฉพาะกรณีที่มี'],
      ['ข้อมูลสำหรับใบแสดงผลการเรียน', '[name="name_en"]', 'ไม่บังคับ']
    ],
    addSubjectForm: [
      ['คัดลอกจากรายวิชาที่เคยเปิดสอน', '#copyFromSubject', 'ไม่บังคับ · เลือกแล้วระบบเติมข้อมูลให้'],
      ['หลักสูตรและชื่อรายวิชา', '[name="curriculum_year"]'],
      ['ผู้ประสานงานและสาขา', '[name="coordinator"]'],
      ['ชั้นปีและกลุ่มผู้เรียน', '[name="year_level"]'],
      ['ประเภทรายวิชาและหน่วยกิต', '[name="theory_practice"]'],
      ['ภาคการศึกษาและปีการศึกษา', '[name="semester"]']
    ],
    addScheduleForm: [
      ['ประเภทกิจกรรม', '[name="schedule_type"]', 'เลือกก่อน ระบบจะแสดงช่องที่เกี่ยวข้องให้'],
      ['รายวิชา / กิจกรรม', '#schedSubjectSingleWrap'],
      ['วัน เวลา และห้อง', '[name="schedule_date"]'],
      ['ข้อมูลการสอบ', '#schedExamFields', 'ผู้คุมสอบ จำนวนนักศึกษา และห้องสอบ'],
      ['ประกาศแจ้งเตือน', '~ประกาศแจ้งเตือนจากรายการนี้', 'ไม่บังคับ · เลือกผู้รับและช่องทาง']
    ],
    addGradeForm: [
      ['เลือกนักศึกษา', '#agStudent'],
      ['ปีการศึกษา', '#agYear'],
      ['รายวิชาและเกรด', '#agRows', 'เพิ่มได้หลายวิชาพร้อมกัน']
    ],
    editGradeForm: [
      ['นักศึกษาและปีการศึกษา', '#egStudent'],
      ['รายวิชาและเกรด', '#egCode']
    ],
    addEngForm: [
      ['เลือกนักศึกษา', '[name="student_id"]'],
      ['รูปแบบและครั้งที่สอบ', '#addEngType'],
      ['คะแนนและผลสอบ', '#addEngSbch', 'ระดับและสถานะคำนวณให้อัตโนมัติ']
    ],
    editEngForm: [
      ['นักศึกษา', '[name="student_id"]'],
      ['รูปแบบและครั้งที่สอบ', '#editEngType'],
      ['คะแนนและผลสอบ', '#editEngSbch', 'ระดับและสถานะคำนวณให้อัตโนมัติ']
    ],
    createEvalFormForm: [
      ['รายวิชาและอาจารย์ผู้สอน', '[name="subject_name"]'],
      ['ภาคการศึกษาและปีการศึกษา', '[name="semester"]'],
      ['หัวข้อประเมินและสถานะ', '[name="eval_items"]']
    ],
    addPracticumSiteForm: [
      ['ปีการศึกษาและภาคการศึกษา', '[name="academic_year"]'],
      ['รายวิชา', '#siteSubjectSelect', 'เลือกจากรายวิชาที่เปิดสอน ระบบเติมรหัสและชื่อให้'],
      ['แหล่งฝึกและพี่เลี้ยง', '[name="site_name"]']
    ],
    addSpecialTeacherRegForm: [
      ['ปีการศึกษา', '[name="academic_year"]'],
      ['ข้อมูลอาจารย์พิเศษ', '[name="title_prefix"]']
    ],
    addAlumniForm: [
      ['ชื่อและรุ่น', '[name="title_prefix"]'],
      ['ข้อมูลการศึกษา', '[name="alumni_status"]'],
      ['การทำงาน', '[name="workplace"]']
    ],
    addTeacherForm: [
      ['ข้อมูลอาจารย์', '[name="name"]'],
      ['การติดต่อ', '[name="phone"]'],
      ['หน้าที่และสถานะ', '[name="responsible_year"]'],
      ['ข้อมูลเพิ่มเติม', '[name="bank_account"]', 'ไม่บังคับ']
    ],
    addTeacherDirForm: [
      ['ข้อมูลอาจารย์', '[name="title_prefix"]'],
      ['สาขา วุฒิการศึกษา ประสบการณ์ และผลงาน', '[name="nursing_branch"]'],
      ['ปีการศึกษาและประเภทอาจารย์', '[name="academic_year"]']
    ],
    addSpecialTeacherForm: [
      ['ดึงข้อมูลจากทะเบียนอาจารย์พิเศษ', '#specialRegPickerSearch', 'ไม่บังคับ · เลือกแล้วระบบเติมข้อมูลให้'],
      ['ข้อมูลอาจารย์พิเศษและรายวิชาที่สอน', '[name="title_prefix"]'],
      ['ประเภทการสอนและวุฒิ', '[name="teaching_type"]'],
      ['ปีการศึกษา', '[name="academic_year"]']
    ],
    addTicketForm: [
      ['หัวข้อและประเภทปัญหา', '[name="title"]'],
      ['รายละเอียด', '[name="detail"]']
    ],
    addTrackingForm: [
      ['รายวิชา', '[name="subject_name"]', 'เลือกแล้วระบบเติมข้อมูลรายวิชาให้'],
      ['ชั้นปีและภาคการศึกษา', '[name="theory_practice"]'],
      ['ผู้ประสานงานรายวิชา', '[name="coordinator"]']
    ],
    editTrackingForm: [
      ['รายวิชา', '[name="subject_name"]'],
      ['ชั้นปีและภาคการศึกษา', '[name="theory_practice"]'],
      ['ผู้ประสานงานและวันอนุมัติ', '[name="coordinator"]']
    ],
    addLeaveForm: [
      ['นักศึกษาและรายวิชา', '[name="name"]'],
      ['ข้อมูลการลา', '[name="leave_hours"]'],
      ['ภาคการศึกษาและเหตุผล', '[name="semester"]']
    ],
    addUserForm: [
      ['บทบาทหลัก', '[name="role"]', 'เลือกก่อน ระบบจะแสดงช่องที่ต้องกรอกตามบทบาท'],
      ['ข้อมูลเข้าสู่ระบบและชื่อ-สกุล', '#userCredFields'],
      ['ภาระงานและสิทธิ์เพิ่มเติม', '~ภาระงานเพิ่มเติม', 'ไม่บังคับ']
    ],
    editUserForm: [
      ['ชื่อและบทบาท', '[name="name"]'],
      ['ข้อมูลเข้าสู่ระบบ', '[name="student_id"]'],
      ['หน้าที่และสถานะการใช้งาน', '[name="department"]']
    ],
    addAnnForm: [
      ['เนื้อหาประกาศ', '[name="announcement_title"]'],
      ['วันที่และประเภท', '[name="announcement_date"]'],
      ['ผู้รับประกาศ', '~แจ้งให้บทบาท', 'ไม่เลือก = ทุกคน'],
      ['ช่องทางแจ้งเตือน', '#annChMail', 'ไม่บังคับ · อีเมล / LINE']
    ],
    evalSetForm: [
      ['ชื่อชุดและด้าน', '[name="set_name"]'],
      ['การใช้งาน', '[name="course_type"]'],
      ['สถานะและหมายเหตุ', '[name="status"]']
    ],
    evalItemForm: [
      ['รหัสและชนิดข้อคำถาม', '[name="item_code"]'],
      ['หมวด', '[name="section"]', 'เว้นว่างได้'],
      ['ข้อคำถาม', '[name="statement_th"]']
    ],
    evalGroupForm: [
      ['ชื่อกลุ่มและแหล่งฝึก', '[name="name"]'],
      ['อาจารย์ประจำกลุ่ม', '#evalGroupNewTeacher'],
      ['นักศึกษาในกลุ่ม', '#evalGroupCount'],
      ['หมายเหตุ', '[name="note"]', 'ไม่บังคับ']
    ],
    wlSelfForm: [
      ['ภาคการศึกษา', '[name="sem"]'],
      ['รายการภาระงาน', '[name="name"]']
    ],
    wbConductForm: [
      ['เลือกนักศึกษา', '#wbConductPick'],
      ['วันที่และภาคการศึกษา', '[name="conduct_date"]'],
      ['พฤติกรรมและรายละเอียด', '[name="conduct_type"]'],
      ['การดำเนินการ', '[name="action_taken"]', 'ไม่บังคับ']
    ]
  };
  // ฟอร์มแก้ไขที่หน้าตาเหมือนฟอร์มเพิ่ม
  STEPS.editStudentForm = STEPS.addStudentForm.slice(0);
  STEPS.editSubjectForm = STEPS.addSubjectForm.slice(1);
  STEPS.editScheduleForm = STEPS.addScheduleForm;
  STEPS.editPracticumSiteForm = STEPS.addPracticumSiteForm;
  STEPS.editSpecialTeacherRegForm = STEPS.addSpecialTeacherRegForm;
  STEPS.editAlumniForm = STEPS.addAlumniForm;
  STEPS.editTeacherForm = STEPS.addTeacherForm;
  STEPS.editTeacherDirForm = STEPS.addTeacherDirForm;
  STEPS.editSpecialTeacherForm = STEPS.addSpecialTeacherForm.slice(1);
  STEPS.addResultTrackingForm = STEPS.addTrackingForm;
  STEPS.addGradeTrackingForm = STEPS.addTrackingForm;
  STEPS.addFileTrackingForm = STEPS.addTrackingForm;
  STEPS.editLeaveForm = STEPS.addLeaveForm;
  STEPS.editAnnForm = STEPS.addAnnForm;
  var FINAL = ['ตรวจสอบความถูกต้อง แล้วกดบันทึก', ''];
  window.emsFormSteps = STEPS;

  /* ---------- หาช่องแรกของแต่ละหมวด ---------- */
  function findAnchor(form, a) {
    if (!a) return null;
    if (a.charAt(0) === '~') {
      var txt = a.slice(1);
      var els = form.querySelectorAll('label, p, h4, b, span');
      for (var i = 0; i < els.length; i++) if ((els[i].textContent || '').indexOf(txt) >= 0) return els[i];
      return null;
    }
    try { return form.querySelector(a); } catch (e) { return null; }
  }
  function childOf(container, el) {
    while (el && el.parentNode !== container) el = el.parentNode;
    return el;
  }
  function hasDirectLabel(el) {
    for (var i = 0; i < el.children.length; i++) if (el.children[i].tagName === 'LABEL') return true;
    return false;
  }

  /* ---------- จัดฟอร์มเป็นขั้นตอน ---------- */
  function decorate(form) {
    if (!form || !form.id || form.dataset.emsSteps) return;
    var def = STEPS[form.id];
    if (!def) return;
    form.dataset.emsSteps = '1';

    var steps = [], bounds = [];
    def.forEach(function (d) {
      var a = findAnchor(form, d[1]);
      if (a) { steps.push({ title: d[0], sub: d[2] || '', anchor: a }); bounds.push(a); }
    });
    if (steps.length < 2) { form.dataset.emsSteps = 'skip'; return; }
    var submit = form.querySelector('[type="submit"]');
    if (submit) { steps.push({ title: FINAL[0], sub: FINAL[1], anchor: submit, final: true }); bounds.push(submit); }

    var note = form.querySelector(':scope > .ems-draft-note');

    // แตกกล่องที่มีจุดเริ่มหมวดอยู่กลางกล่อง ให้เหลือเป็นช่องย่อยที่ย้ายไปอยู่คนละหมวดได้
    function shouldExpand(c) {
      if (c.tagName !== 'DIV' || c.id || c.children.length < 2 || hasDirectLabel(c)) return false;
      for (var i = 0; i < bounds.length; i++) {
        if (c.contains(bounds[i]) && c !== bounds[i] && childOf(c, bounds[i]) !== c.firstElementChild) return true;
      }
      return false;
    }
    var cells = [];
    (function flatten(container) {
      Array.prototype.slice.call(container.children).forEach(function (c) {
        if (c === note) return;
        if (shouldExpand(c)) flatten(c);
        else cells.push({ el: c, wrap: container });
      });
    })(form);

    var cur = 0;
    cells.forEach(function (cell) {
      for (var k = steps.length - 1; k > cur; k--) {
        if (cell.el === steps[k].anchor || cell.el.contains(steps[k].anchor)) { cur = k; break; }
      }
      cell.step = cur;
    });

    var frag = document.createDocumentFragment();
    steps.forEach(function (st, i) {
      var mine = cells.filter(function (c) { return c.step === i; });
      if (!mine.length) return;
      var sec = document.createElement('section');
      sec.className = 'ems-step' + (st.final ? ' ems-step-final' : '');
      sec.setAttribute('data-nodraft-ui', '1');
      sec.innerHTML = '<div class="ems-step-head"><span class="ems-step-no" aria-hidden="true"></span>'
        + '<div class="min-w-0"><p class="ems-step-title"></p>' + (st.sub ? '<p class="ems-step-sub"></p>' : '') + '</div></div>'
        + '<div class="ems-step-body space-y-3"></div>';
      sec.querySelector('.ems-step-title').textContent = st.title;
      if (st.sub) sec.querySelector('.ems-step-sub').textContent = st.sub;
      var body = sec.querySelector('.ems-step-body');
      var lastWrap = null, box = null;
      mine.forEach(function (c) {
        if (c.wrap === form) { body.appendChild(c.el); lastWrap = null; return; }
        if (c.wrap !== lastWrap) {
          box = document.createElement('div');
          box.className = c.wrap.className || '';
          if (c.wrap.getAttribute('style')) box.setAttribute('style', c.wrap.getAttribute('style'));
          body.appendChild(box);
          lastWrap = c.wrap;
        }
        box.appendChild(c.el);
      });
      frag.appendChild(sec);
    });
    // เหลือแต่กล่องเปล่าที่ถูกแตกออก
    Array.prototype.slice.call(form.childNodes).forEach(function (n) { if (n !== note) form.removeChild(n); });
    form.appendChild(frag);
    form.classList.add('ems-stepped');

    form._emsStepInit = snapshot(form);
    var t = null;
    var later = function () { clearTimeout(t); t = setTimeout(function () { refresh(form); }, 40); };
    // หมวดที่ไม่มีช่องบังคับ ถือว่าเสร็จเมื่อผู้ใช้กรอก/เลือกเองในหมวดนั้น (ค่าที่ระบบเติมให้ไม่นับ)
    var touch = function (e) {
      if (!e.isTrusted) return;
      var sec = e.target && e.target.closest && e.target.closest('.ems-step');
      if (sec) sec.dataset.touched = '1';
    };
    form.addEventListener('input', touch, true);
    form.addEventListener('change', touch, true);
    form.addEventListener('input', later);
    form.addEventListener('change', later);
    form.addEventListener('click', later);
    try {
      new MutationObserver(later).observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    } catch (e) { }
    // ค่าที่ระบบเติมให้เอง (ไม่ได้เกิดจากการพิมพ์) ไม่มีเหตุการณ์แจ้ง จึงตรวจซ้ำเป็นระยะขณะฟอร์มเปิดอยู่
    var iv = setInterval(function () { if (!document.contains(form)) { clearInterval(iv); return; } refresh(form); }, 1200);
    refresh(form);
  }

  /* ---------- สถานะของแต่ละขั้น ---------- */
  function controls(scope) {
    return Array.prototype.filter.call(scope.querySelectorAll('input, select, textarea'), function (el) {
      return !/^(hidden|submit|button|reset|image)$/i.test(el.type || '') && !el.disabled && visible(el);
    });
  }
  function selfShown(el, stop) {
    for (var n = el; n && n !== stop; n = n.parentElement) {
      if (n.hidden || window.getComputedStyle(n).display === 'none') return false;
    }
    return true;
  }
  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function keyOf(el, i) { return (el.name || el.id || 'x') + '#' + i; }
  function valOf(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '1' : '';
    return String(el.value || '');
  }
  function snapshot(form) {
    var o = {};
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (el, i) { o[keyOf(el, i)] = valOf(el); });
    return o;
  }
  function isRequired(el) {
    if (el.required) return true;
    var cell = el.closest('div');
    var lab = cell && cell.querySelector('label');
    return !!(lab && !lab.contains(el) && /\*/.test(lab.textContent || '') && lab.textContent.length < 120);
  }
  function filled(el, scope) {
    // ช่องเลือกแบบชิป (เลือกแล้วล้างช่อง) เก็บค่าจริงไว้ในช่องซ่อนข้าง ๆ ถือว่ากรอกแล้วถ้าช่องซ่อนมีค่า
    var cell = el.closest('div');
    var hid = cell && cell.querySelector('input[type="hidden"]');
    if (hid && String(hid.value || '').trim() !== '' && el.tagName === 'SELECT' && !String(el.value || '').trim()) return true;
    if (el.type === 'radio') return !!scope.querySelector('input[type="radio"][name="' + (window.CSS && CSS.escape ? CSS.escape(el.name) : el.name) + '"]:checked');
    if (el.type === 'checkbox') return el.checked;
    return String(el.value || '').trim() !== '';
  }
  function refresh(form) {
    if (!document.contains(form)) return;
    var init = form._emsStepInit || {};
    var all = Array.prototype.slice.call(form.querySelectorAll('input, select, textarea'));
    var secs = Array.prototype.slice.call(form.querySelectorAll(':scope > .ems-step'));
    var n = 0, activeSet = false;
    secs.forEach(function (sec) {
      var body = sec.querySelector('.ems-step-body');
      // ดูเฉพาะการซ่อนของตัวช่องเอง ไม่นับหมวดที่ถูกพับไว้ ไม่งั้นหมวดที่ซ่อนแล้วจะไม่มีวันกลับมา
      var shown = Array.prototype.some.call(body.children, function (c) {
        return !(c.tagName === 'INPUT' && c.type === 'hidden') && selfShown(c, body);
      });
      sec.classList.toggle('ems-step-off', !shown);
      if (!shown) return;
      n++;
      var no = sec.querySelector('.ems-step-no');
      if (no.textContent !== String(n)) no.textContent = String(n);
      if (sec.classList.contains('ems-step-final')) {
        sec.classList.remove('is-done');
        sec.classList.toggle('is-active', !activeSet);
        activeSet = true;
        return;
      }
      var cs = controls(body);
      var req = cs.filter(isRequired);
      var touched = sec.dataset.touched === '1' && cs.some(function (el) { var i = all.indexOf(el); return valOf(el) !== init[keyOf(el, i)]; });
      var done = req.length ? req.every(function (el) { return filled(el, body); }) : touched;
      sec.classList.toggle('is-done', done);
      var act = !done && !activeSet && (req.length > 0);
      sec.classList.toggle('is-active', act);
      if (act) activeSet = true;
    });
  }

  /* ---------- จับฟอร์มที่เพิ่งปรากฏ ----------
     MutationObserver ทำงานหลังโค้ดที่เปิดหน้าต่างทำงานจบรอบนั้นแล้ว
     ช่องที่ถูกเติมค่าเริ่มต้นทันทีหลังเปิดหน้าต่าง จึงอยู่ครบก่อนจัดเป็นขั้นตอน */
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'FORM') decorate(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('form[id]'), decorate);
  }
  var mo = new MutationObserver(function (list) {
    list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes || [], function (nd) { if (nd.nodeType === 1) scan(nd); }); });
  });
  function start() { mo.observe(document.body, { childList: true, subtree: true }); scan(document.body); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  window.__emsSteps = { decorate: decorate, refresh: refresh };
})();
