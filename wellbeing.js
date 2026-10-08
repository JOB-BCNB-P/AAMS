/* ================================================================
   wellbeing.js — หน้าบันทึก "ข้อมูล สบช.โมเดล" และ "ข้อมูลความประพฤติ"
   ----------------------------------------------------------------
   สองตารางนี้เป็นของใหม่ที่ยังไม่มีที่กรอก ระบบให้คำปรึกษาจึงอ่านได้แต่ว่างเปล่า
   ไฟล์นี้เติมฝั่งกรอกให้ครบ

   สิทธิ์  ไม่ผูกกับชื่อหน่วยงาน เพราะเจ้าหน้าที่ย้ายงานกันได้
          ผู้ดูแลระบบติ๊กให้เป็นรายคนในหน้า ตั้งค่าระบบ > จัดการผู้ใช้งาน
          ฐานข้อมูลบังคับซ้ำอีกชั้นด้วย ems.can_enter_health() / can_enter_conduct()
          แก้ไขและลบได้เฉพาะแถวที่ตนเป็นคนกรอก (เทียบจาก recorded_uid ไม่ใช่ชื่อ)

   วิธีกรอก  สบช.โมเดล  เป็นค่าที่วัดทั้งชั้นปีในคราวเดียว จึงทำเป็นตารางกรอกรวด
                        กรอกทีละคนก็ได้ ใช้ตารางเดียวกัน กดบันทึกเฉพาะแถวนั้น
             ความประพฤติ เป็นเหตุการณ์รายครั้ง จึงเป็นรายการ + หน้าต่างเพิ่มบันทึก
                        เลือกนักศึกษาได้หลายคนในเหตุการณ์เดียวกัน เช่น มาสายพร้อมกัน
   ================================================================ */
(function () {
  'use strict';

  /* ---------------- เครื่องมือพื้นฐาน ---------------- */
  function s(v) { return String(v == null ? '' : v).trim(); }
  function esc(v) { return (typeof htmlEsc === 'function') ? htmlEsc(v) : s(v); }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function me() { return s(APP.currentUser && APP.currentUser.name); }
  function toast(m, k) { if (typeof showToast === 'function') showToast(m, k); }

  var SEMS = [['1', 'ภาคการศึกษาที่ 1'], ['2', 'ภาคการศึกษาที่ 2'], ['3', 'ภาคฤดูร้อน']];
  var YEARS = ['1', '2', '3', '4'];

  /* ข้อมูล สบช.โมเดล บันทึกภาคการศึกษาละหนึ่งครั้งต่อนักศึกษาหนึ่งคน
     ตรวจรอบใดในภาคก็ได้ แต่เก็บเป็นผลของภาคนั้น จึงไม่ต้องระบุเดือน
     ระบบไม่เดาภาคการศึกษาให้ ผู้กรอกเลือกเองทุกครั้ง เพราะปฏิทินของวิทยาลัยเปลี่ยนได้ */
  function semName(x) {
    for (var i = 0; i < SEMS.length; i++) if (SEMS[i][0] === s(x)) return SEMS[i][1];
    return s(x);
  }

  var CONDUCT_TYPES = [
    'มาสาย', 'ขาดเรียน', 'แต่งกายผิดระเบียบ', 'ใช้โทรศัพท์ในเวลาเรียน',
    'ไม่ส่งงานตามกำหนด', 'ประพฤติผิดระเบียบหอพัก', 'พฤติกรรมดีเด่น', 'อื่น ๆ'
  ];
  var CONDUCT_ACTIONS = [
    'ตักเตือนด้วยวาจา', 'ตักเตือนเป็นลายลักษณ์อักษร', 'แจ้งอาจารย์ที่ปรึกษา',
    'แจ้งผู้ปกครอง', 'ทำกิจกรรมบำเพ็ญประโยชน์', 'บันทึกชมเชย', 'อยู่ระหว่างพิจารณา'
  ];

  /* ---------------- สิทธิ์ ----------------
     ค่าที่ติ๊กไว้อยู่ในตาราง app_user ซึ่งโหลดมาเป็น type 'user'
     หาแถวของตัวเองด้วยอีเมลก่อน เพราะอีเมลไม่ซ้ำ ชื่ออาจซ้ำได้ */
  function myUser() {
    var email = s(APP.currentUser && APP.currentUser.email).toLowerCase();
    var name = s(me()).toLowerCase();
    var us = get('user');
    var hit = null;
    for (var i = 0; i < us.length; i++) {
      if (email && s(us[i].email).toLowerCase() === email) { hit = us[i]; break; }
      if (!hit && name && s(us[i].name).toLowerCase() === name) hit = us[i];
    }
    return hit || {};
  }
  function flagOn(v) { return ['1', 'true', 'ใช่'].indexOf(s(v)) >= 0; }
  function isAdmin() { return APP.currentRole === 'admin'; }
  function canHealth() { return isAdmin() || flagOn(myUser().can_health); }
  function canConduct() { return isAdmin() || flagOn(myUser().can_conduct); }
  function canSeeMenu() { return canHealth() || canConduct(); }

  /* เจ้าของแถว — ฝั่งหน้าจอเทียบด้วย recorded_by เพื่อซ่อนปุ่ม
     ฝั่งฐานข้อมูลเทียบ recorded_uid ซึ่งปลอมไม่ได้ ถึงจะกดผ่านหน้าจอมาได้ก็เขียนไม่สำเร็จ */
  function ownsRow(row) {
    if (isAdmin()) return true;
    return s(row && row.recorded_by).toLowerCase() === s(me()).toLowerCase();
  }

  /* ---------------- ข้อมูล ---------------- */
  function activeStudents() {
    return get('student').filter(function (x) {
      return (typeof isActiveStudent === 'function') ? isActiveStudent(x) : s(x.status) === 'กำลังศึกษา';
    });
  }
  function studentsOfYear(y) {
    return activeStudents()
      .filter(function (x) { return s(x.year_level) === s(y); })
      .sort(function (a, b) { return s(a.student_id).localeCompare(s(b.student_id)); });
  }
  function studentById(sid) {
    var all = get('student');
    for (var i = 0; i < all.length; i++) if (s(all[i].student_id) === s(sid)) return all[i];
    return null;
  }
  function curYear() {
    return String((typeof currentAcademicYearBE === 'function') ? currentAcademicYearBE() : 2568);
  }
  function bmiOf(h, w) {
    var hh = num(h), ww = num(w);
    if (hh <= 0 || ww <= 0) return '';
    return (ww / (hh * hh)).toFixed(2);
  }
  function bmiBand(v) {
    var x = num(v);
    if (!x) return ['', ''];
    if (x < 18.5) return ['ต่ำกว่าเกณฑ์', 'text-amber-600'];
    if (x < 23) return ['ปกติ', 'text-green-600'];
    if (x < 25) return ['ท้วม', 'text-amber-600'];
    if (x < 30) return ['อ้วน', 'text-orange-600'];
    return ['อ้วนมาก', 'text-red-600'];
  }

  /* ---------------- สถานะหน้าจอ ---------------- */
  function hState() {
    if (!APP._wbHealth) {
      APP._wbHealth = {
        year: '1',                 // ชั้นปีของนักศึกษา
        semester: '1',             // ภาคการศึกษาที่ผู้กรอกเลือกเอง
        academicYear: curYear(),   // ปีการศึกษา
        search: '', dirty: {}
      };
    }
    return APP._wbHealth;
  }
  function cState() {
    if (!APP._wbConduct) {
      APP._wbConduct = {
        year: '', semester: '', academicYear: '', search: '', page: 1, perPage: 20,
        draft: null, editId: ''
      };
    }
    return APP._wbConduct;
  }

  function noRight(what) {
    return '<div class="bg-white rounded-2xl border border-amber-200 p-8 text-center">'
      + '<i data-lucide="lock" class="w-10 h-10 mx-auto text-amber-400 mb-3"></i>'
      + '<p class="font-semibold text-gray-800 mb-1">ยังไม่ได้รับสิทธิ์บันทึก' + esc(what) + '</p>'
      + '<p class="text-sm text-gray-500">ผู้ดูแลระบบเปิดสิทธิ์ให้ได้ที่ ตั้งค่าระบบ &gt; จัดการผู้ใช้งาน &gt; แก้ไขผู้ใช้</p>'
      + '</div>';
  }

  /* ================================================================
     หน้าที่ 1 · ข้อมูล สบช.โมเดล — ตารางกรอกรวดทั้งชั้นปี
     ================================================================ */
  function healthPage() {
    if (!canHealth()) return noRight('ข้อมูล สบช.โมเดล');
    return headerBox() + entryView();
  }

  /* หัวเรื่องและแถบเลือก */
  function headerBox() {
    var st = hState();

    var yearTabs = YEARS.map(function (y) {
      var on = s(st.year) === y;
      var n = studentsOfYear(y).length;
      return '<button onclick="wbHealthSet(\'year\',\'' + y + '\')" class="px-4 py-2 rounded-xl text-sm font-medium '
        + (on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '">'
        + 'ชั้นปีที่ ' + y + ' <span class="text-xs opacity-75">(' + n + ')</span></button>';
    }).join('');

    /* ภาคการศึกษาและปีการศึกษาคือกุญแจของข้อมูล ค่าที่เลือกตรงนี้คือค่าที่จะถูกบันทึก */
    var pickers =
      '<div><label class="block text-xs text-gray-600 mb-1">ภาคการศึกษา <span class="text-red-500">*</span></label>'
      + '<select onchange="wbHealthSet(\'semester\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + SEMS.map(function (x) {
        return '<option value="' + x[0] + '"' + (s(st.semester) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ปีการศึกษา (พ.ศ.) <span class="text-red-500">*</span></label>'
      + '<input value="' + esc(st.academicYear) + '" onchange="wbHealthSet(\'academicYear\',this.value)" inputmode="numeric" '
      + 'class="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>';

    return '<div class="mb-5">'
      + '<h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">'
      + '<i data-lucide="heart-pulse" class="w-6 h-6"></i>ข้อมูล สบช.โมเดล</h2>'
      + '<p class="text-sm text-gray-500 mt-1">บันทึกผลการตรวจสุขภาพ <b>ภาคการศึกษาละหนึ่งครั้ง</b> ของนักศึกษาแต่ละชั้นปี · '
      + 'กรอกซ้ำภาคเดิมคือการแก้ของเดิม ไม่เกิดแถวซ้ำ · '
      + 'ค่าดัชนีมวลกาย (BMI) ระบบคำนวณให้เอง ไม่ต้องกรอก</p>'
      + '</div>'

      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<div class="flex flex-wrap gap-2 mb-3 pb-3 border-b border-gray-100">' + yearTabs + '</div>'
      + '<div class="flex flex-wrap items-end gap-3">'
      + pickers
      + '<div class="flex-1 min-w-[12rem]"><label class="block text-xs text-gray-600 mb-1">ค้นหารหัสหรือชื่อ</label>'
      + '<input value="' + esc(st.search) + '" oninput="wbHealthSearch(this.value)" '
      + 'placeholder="พิมพ์เพื่อกรองรายชื่อ" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '<button onclick="wbHealthSaveAll()" class="px-4 py-2 rounded-xl bg-primary text-white text-sm flex items-center gap-2">'
      + '<i data-lucide="save" class="w-4 h-4"></i>บันทึกทั้งชั้นปี</button>'
      + '</div>'

      /* แถวปุ่มไฟล์ — แยกบรรทัดจากปุ่มบันทึก เพราะเป็นงานคนละจังหวะกัน
         กรอกในหน้าจอคือทำตรงนี้เดี๋ยวนี้ ส่วนไฟล์คือเอาออกไปทำข้างนอกแล้วค่อยกลับมา */
      + '<div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">'
      + '<span class="text-xs text-gray-500 mr-1">ทำงานผ่านไฟล์ :</span>'
      + '<button onclick="wbHealthForm()" class="px-3 py-2 rounded-xl border border-emerald-500 text-emerald-600 text-sm flex items-center gap-2 hover:bg-emerald-50" '
      + 'title="ได้ไฟล์ที่มีรายชื่อนักศึกษาชั้นปีนี้ครบแล้ว พร้อมค่าที่เคยบันทึกไว้ของภาคที่เลือก">'
      + '<i data-lucide="file-down" class="w-4 h-4"></i>ดาวน์โหลดแบบฟอร์มภาคนี้</button>'
      + '<button onclick="wbHealthPickFile()" class="px-3 py-2 rounded-xl border border-primary text-primary text-sm flex items-center gap-2 hover:bg-primaryLight" '
      + 'title="อัปโหลดแบบฟอร์มที่กรอกแล้ว ระบบจะสรุปให้ดูก่อนบันทึก">'
      + '<i data-lucide="upload" class="w-4 h-4"></i>อัปโหลดไฟล์ที่กรอกแล้ว</button>'
      + '<input type="file" id="wbHealthFile" accept=".csv,text/csv" class="hidden" onchange="wbHealthUpload(event)">'
      + '<span class="w-px h-6 bg-gray-200 mx-1"></span>'
      + '<button onclick="wbHealthExport()" class="px-3 py-2 rounded-xl border border-gray-300 text-gray-600 text-sm flex items-center gap-2 hover:bg-gray-50" '
      + 'title="เฉพาะภาคการศึกษาที่เลือกอยู่">'
      + '<i data-lucide="download" class="w-4 h-4"></i>ดาวน์โหลดข้อมูลภาคนี้</button>'
      + '<button onclick="wbHealthExport(\'all\')" class="px-3 py-2 rounded-xl border border-gray-300 text-gray-600 text-sm flex items-center gap-2 hover:bg-gray-50" '
      + 'title="ทุกภาคการศึกษาทุกปีที่มีในระบบ">'
      + '<i data-lucide="database" class="w-4 h-4"></i>ดาวน์โหลดทั้งหมด</button>'
      + '</div>'
      + '<p class="text-[11px] text-gray-400 mt-2">ไฟล์เป็นชนิด CSV เปิดด้วย Excel หรือ Google ชีต ได้ทันที '
      + '· แบบฟอร์มผูกกับภาคการศึกษาและปีการศึกษาที่เลือกไว้ และมีค่าที่เคยบันทึกไว้มาด้วย จึงใช้แก้ของเดิมได้ '
      + '· อัปโหลดแล้วระบบจะสรุปให้ดูก่อนว่าจะเพิ่มกี่คน แก้กี่คน ยังไม่เขียนอะไรจนกว่าจะกดยืนยัน</p>'
      + '</div>';
  }

  /* นักศึกษาของชั้นปีที่เลือก หลังกรองด้วยคำค้น */
  function shownStudents() {
    var st = hState();
    var studs = studentsOfYear(st.year);
    var kw = s(st.search).toLowerCase();
    if (!kw) return studs;
    return studs.filter(function (x) {
      return (s(x.student_id) + ' ' + s(x.name)).toLowerCase().indexOf(kw) >= 0;
    });
  }

  /* ---------------- ตารางกรอกของภาคการศึกษาที่เลือก ----------------
     หนึ่งนักศึกษามีได้หนึ่งแถวต่อหนึ่งภาคการศึกษา จึงกรอกและแก้ได้ในตารางเดียว
     ไม่ต้องมีมุมมองแยกสำหรับดูย้อนหลังอีก เพราะเปลี่ยนภาคด้านบนก็เห็นของภาคนั้นทันที */
  function entryView() {
    var st = hState();
    var studs = shownStudents();
    var filled = 0;

    var rows = studs.map(function (stu, i) {
      var r = existingHealthFor(stu.student_id, st.semester, st.academicYear) || {};
      if (r.__backendId) filled++;
      var sid = esc(s(stu.student_id));
      var locked = r.__backendId && !ownsRow(r);
      var dis = locked ? ' disabled' : '';
      function cell(field, val, ph, w) {
        return '<td class="px-1 py-1"><input value="' + esc(s(val)) + '" ' + dis
          + ' oninput="wbHealthTouch(\'' + sid + '\')" data-wb="' + sid + '" data-f="' + field + '" '
          + 'placeholder="' + ph + '" inputmode="decimal" '
          + 'class="w-' + w + ' border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center'
          + (locked ? ' bg-gray-50 text-gray-400' : '') + '"></td>';
      }
      var b = bmiOf(r.height_m, r.weight_kg), band = bmiBand(b);
      return '<tr class="border-t" data-row="' + sid + '">'
        + '<td class="px-2 py-1 text-gray-400 text-xs">' + (i + 1) + '</td>'
        + '<td class="px-2 py-1 font-mono text-xs">' + sid + '</td>'
        + '<td class="px-2 py-1 text-sm whitespace-nowrap">' + esc(s(stu.name))
        + (locked ? '<span class="block text-[11px] text-gray-400">' + esc(s(r.recorded_by)) + ' เป็นผู้กรอก</span>' : '')
        + '</td>'
        + cell('height_m', r.height_m, 'ม.', '16')
        + cell('weight_kg', r.weight_kg, 'กก.', '16')
        + '<td class="px-1 py-1 text-center text-sm" data-bmi="' + sid + '">'
        + (b ? '<span class="font-semibold">' + b + '</span><span class="block text-[11px] ' + band[1] + '">' + band[0] + '</span>' : '<span class="text-gray-300">—</span>')
        + '</td>'
        + cell('blood_sugar', r.blood_sugar, 'mg/dL', '20')
        + cell('pulse', r.pulse, 'ครั้ง/นาที', '20')
        + cell('bp_systolic', r.bp_systolic, 'บน', '14')
        + cell('bp_diastolic', r.bp_diastolic, 'ล่าง', '14')
        + '<td class="px-1 py-1"><input value="' + esc(s(r.note)) + '"' + dis
        + ' oninput="wbHealthTouch(\'' + sid + '\')" data-wb="' + sid + '" data-f="note" placeholder="หมายเหตุ" '
        + 'class="w-40 border border-gray-200 rounded-lg px-2 py-1.5 text-sm' + (locked ? ' bg-gray-50 text-gray-400' : '') + '"></td>'
        + '<td class="px-1 py-1 text-center">'
        + (locked
          ? '<span class="text-[11px] text-gray-400">แก้ไม่ได้</span>'
          : '<button onclick="wbHealthSaveOne(\'' + sid + '\')" class="px-2 py-1 rounded-lg bg-primaryLight text-primary text-xs hover:bg-primary hover:text-white">บันทึก</button>'
          + (r.__backendId ? '<button onclick="wbHealthDelete(\'' + sid + '\')" class="ml-1 px-2 py-1 rounded-lg text-red-500 text-xs hover:bg-red-50">ลบ</button>' : ''))
        + '</td>'
        + '</tr>';
    }).join('');

    return '<p class="text-xs text-gray-500 mb-2">กรอกแล้ว <span class="font-semibold text-primary">' + filled + '</span> จาก '
      + studs.length + ' คน ใน<b>' + esc(semName(st.semester)) + ' ปีการศึกษา ' + esc(st.academicYear) + '</b> '
      + 'ของชั้นปีที่ ' + esc(st.year) + ' '
      + '· แถวที่คนอื่นเป็นผู้กรอกจะแก้ไม่ได้ ต้องให้ผู้กรอกเดิมหรือผู้ดูแลระบบแก้</p>'

      + '<div class="bg-white rounded-2xl border border-blue-100 overflow-x-auto">'
      + '<table class="w-full">'
      + '<thead><tr class="bg-surface text-left text-xs">'
      + '<th class="px-2 py-3">#</th><th class="px-2 py-3">รหัสนักศึกษา</th><th class="px-2 py-3">ชื่อ–สกุล</th>'
      + '<th class="px-1 py-3 text-center">ส่วนสูง (ม.)</th><th class="px-1 py-3 text-center">น้ำหนัก (กก.)</th>'
      + '<th class="px-1 py-3 text-center">BMI</th>'
      + '<th class="px-1 py-3 text-center">น้ำตาลในเลือด</th><th class="px-1 py-3 text-center">ชีพจร</th>'
      + '<th class="px-1 py-3 text-center">ความดันบน</th><th class="px-1 py-3 text-center">ความดันล่าง</th>'
      + '<th class="px-1 py-3 text-center">หมายเหตุ</th><th class="px-1 py-3 text-center">จัดการ</th>'
      + '</tr></thead><tbody>'
      + (rows || '<tr><td colspan="12" class="px-4 py-10 text-center text-gray-400">ไม่พบนักศึกษาตามเงื่อนไขที่เลือก</td></tr>')
      + '</tbody></table></div>';
  }


  window.wbHealthSet = function (k, v) {
    var st = hState();
    st[k] = s(v);
    st.dirty = {};
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };
  window.wbHealthSearch = function (v) {
    var st = hState();
    st.search = s(v);
    clearTimeout(st._t);
    st._t = setTimeout(function () { if (typeof renderCurrentPage === 'function') renderCurrentPage(); }, 300);
  };
  window.wbHealthTouch = function (sid) {
    hState().dirty[s(sid)] = 1;
    // คำนวณ BMI สดตอนพิมพ์ ไม่ต้องรอบันทึก
    var h = document.querySelector('[data-wb="' + sid + '"][data-f="height_m"]');
    var w = document.querySelector('[data-wb="' + sid + '"][data-f="weight_kg"]');
    var box = document.querySelector('[data-bmi="' + sid + '"]');
    if (!h || !w || !box) return;
    var b = bmiOf(h.value, w.value), band = bmiBand(b);
    box.innerHTML = b
      ? '<span class="font-semibold">' + b + '</span><span class="block text-[11px] ' + band[1] + '">' + band[0] + '</span>'
      : '<span class="text-gray-300">—</span>';
  };

  function readRow(sid) {
    var out = {};
    var els = document.querySelectorAll('[data-wb="' + sid + '"]');
    for (var i = 0; i < els.length; i++) out[els[i].getAttribute('data-f')] = s(els[i].value);
    return out;
  }
  function rowEmpty(d) {
    return !s(d.height_m) && !s(d.weight_kg) && !s(d.blood_sugar)
      && !s(d.pulse) && !s(d.bp_systolic) && !s(d.bp_diastolic) && !s(d.note);
  }
  /* ภาคการศึกษาและปีการศึกษาคือกุญแจของข้อมูล ต้องใช้ได้จริงทั้งคู่
     ถ้าปล่อยให้ผิด ข้อมูลจะไปกองอยู่ในภาคที่ไม่มีอยู่ แล้วหาไม่เจอทั้งที่บันทึกสำเร็จ */
  function periodError(sem, ay) {
    var y = num(ay);
    var okSem = SEMS.some(function (x) { return x[0] === s(sem); });
    if (!okSem) return 'ภาคการศึกษาต้องเป็น 1, 2 หรือ 3 (ภาคฤดูร้อน)';
    if (!/^[0-9]{4}$/.test(s(ay)) || y < 2500 || y > 2700) return 'ปีการศึกษาต้องเป็น พ.ศ. สี่หลัก เช่น 2568';
    return '';
  }

  function rowError(d) {
    if (s(d.height_m) && (num(d.height_m) < 1 || num(d.height_m) > 2.5)) return 'ส่วนสูงต้องเป็นหน่วยเมตร เช่น 1.65';
    if (s(d.weight_kg) && (num(d.weight_kg) < 20 || num(d.weight_kg) > 250)) return 'น้ำหนักอยู่นอกช่วงที่เป็นไปได้';
    if (s(d.bp_systolic) && s(d.bp_diastolic)
      && num(d.bp_systolic) > 0 && num(d.bp_diastolic) > 0
      && num(d.bp_systolic) <= num(d.bp_diastolic)) return 'ความดันบนต้องมากกว่าความดันล่าง';
    return '';
  }

  /* หาแถวของนักศึกษาในภาคการศึกษา/ปีการศึกษาที่ระบุ
     หนึ่งคนมีได้หนึ่งแถวต่อหนึ่งภาค กรอกซ้ำภาคเดิมคือการแก้ของเดิม
     แยกพารามิเตอร์ออกมาเพราะการนำเข้าไฟล์ใช้ค่าจากในไฟล์ ไม่ใช่จากหน้าจอ */
  function existingHealthFor(sid, sem, ay) {
    var recs = get('student_health');
    for (var i = 0; i < recs.length; i++) {
      if (s(recs[i].student_id) === s(sid)
        && s(recs[i].semester) === s(sem)
        && s(recs[i].academic_year) === s(ay)) return recs[i];
    }
    return null;
  }
  function existingHealth(sid) {
    var st = hState();
    return existingHealthFor(sid, st.semester, st.academicYear);
  }

  async function saveHealthRow(sid, quiet) {
    var st = hState();
    var d = readRow(sid);
    var err = rowError(d);
    if (err) { if (!quiet) toast(sid + ' · ' + err, 'error'); return { skip: false, ok: false }; }
    if (rowEmpty(d)) return { skip: true, ok: true };

    var stu = studentById(sid) || {};
    var perr = periodError(st.semester, st.academicYear);
    if (perr) { if (!quiet) toast(perr, 'error'); return { skip: false, ok: false }; }
    var payload = {
      type: 'student_health',
      student_id: s(sid),
      record_date: new Date().toISOString().slice(0, 10),
      semester: st.semester, academic_year: st.academicYear,
      height_m: d.height_m, weight_kg: d.weight_kg,
      blood_sugar: d.blood_sugar, pulse: d.pulse,
      bp_systolic: d.bp_systolic, bp_diastolic: d.bp_diastolic,
      note: d.note, recorded_by: me(), updated_by: me()
    };
    var cur = existingHealth(sid);
    var r = cur
      ? await GSheetDB.update(Object.assign({}, cur, payload, { record_date: s(cur.record_date) || payload.record_date }), { noRefresh: true })
      : await GSheetDB.create(payload, { noRefresh: true });
    if (!r || !r.isOk) { if (!quiet) toast('บันทึก ' + sid + ' ไม่สำเร็จ · ' + s(r && r.error), 'error'); return { skip: false, ok: false }; }
    return { skip: false, ok: true, name: s(stu.name) };
  }

  var busy = false;
  window.wbHealthSaveOne = async function (sid) {
    if (busy) return;
    busy = true;
    try {
      var r = await saveHealthRow(sid);
      if (r.skip) { toast('ยังไม่ได้กรอกค่าใดเลยในแถวนี้', 'error'); return; }
      if (!r.ok) return;
      await GSheetDB.refreshTab('student_health');
      delete hState().dirty[s(sid)];
      toast('บันทึกข้อมูลของ ' + (r.name || sid) + ' เรียบร้อย');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) { toast('บันทึกไม่สำเร็จ · ' + e.message, 'error'); }
    finally { busy = false; }
  };

  window.wbHealthSaveAll = async function () {
    if (busy) return;
    var stAll = hState();
    var perrAll = periodError(stAll.semester, stAll.academicYear);
    if (perrAll) { toast(perrAll, 'error'); return; }
    var ids = Object.keys(stAll.dirty);
    if (!ids.length) { toast('ยังไม่มีช่องไหนถูกแก้ไข', 'error'); return; }
    busy = true;
    var okN = 0, failN = 0, skipN = 0;
    var btns = document.querySelectorAll('button[onclick="wbHealthSaveAll()"]');
    for (var b = 0; b < btns.length; b++) { btns[b].disabled = true; btns[b].classList.add('opacity-60'); }
    try {
      for (var i = 0; i < ids.length; i++) {
        var r = await saveHealthRow(ids[i], true);
        if (r.skip) skipN++; else if (r.ok) okN++; else failN++;
      }
      await GSheetDB.refreshTab('student_health');
      hState().dirty = {};
      toast('บันทึกสำเร็จ ' + okN + ' คน'
        + (skipN ? ' · ข้ามที่ยังว่าง ' + skipN : '')
        + (failN ? ' · ไม่สำเร็จ ' + failN : ''), failN ? 'error' : 'success');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) { toast('บันทึกไม่สำเร็จ · ' + e.message, 'error'); }
    finally {
      busy = false;
      for (var j = 0; j < btns.length; j++) { btns[j].disabled = false; btns[j].classList.remove('opacity-60'); }
    }
  };


  /* ================================================================
     แบบฟอร์ม · นำเข้า · ส่งออก ของข้อมูล สบช.โมเดล
     ----------------------------------------------------------------
     ใช้ไฟล์ CSV เพราะ Excel เปิดได้ตรง ๆ และผู้ใช้ส่งต่อให้พยาบาล
     ที่ออกไปตรวจนอกสถานที่กรอกกลับมาได้โดยไม่ต้องเข้าระบบ

     เขียนตัวอ่าน-เขียน CSV เองแทนการใช้ตัวกลางของระบบ เพราะตัวกลางนั้น
     สร้างแถวใหม่ทุกบรรทัดโดยไม่ดูว่ามีข้อมูลเดิมอยู่แล้วหรือไม่
     ถ้านำมาใช้กับตารางนี้ อัปโหลดซ้ำครั้งเดียวข้อมูลจะซ้อนกันทันที
     ================================================================ */

  /* ใส่เครื่องหมายคำพูดเมื่อค่ามีจุลภาค คำพูด หรือขึ้นบรรทัดใหม่
     ชื่อไทยบางคนมีวงเล็บหรือจุลภาค ถ้าไม่ครอบ คอลัมน์จะเลื่อนทั้งไฟล์ */
  function csvCell(v) {
    var x = s(v);
    return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }

  /* ตัวอ่าน CSV ที่เข้าใจเครื่องหมายคำพูด
     การใช้ split(',') เฉย ๆ จะพังทันทีที่ช่องหมายเหตุมีจุลภาค */
  function parseCSV(text) {
    var out = [], row = [], cur = '', q = false;
    var t = s(text).replace(/^﻿/, '');
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); out.push(row); }
    return out.filter(function (r) { return r.some(function (x) { return s(x) !== ''; }); });
  }

  /* หัวตารางเป็นภาษาไทยให้คนกรอกอ่านรู้เรื่อง
     ตอนอ่านกลับรับทั้งชื่อไทยและชื่อช่องในฐานข้อมูล เผื่อมีคนแก้หัวตาราง */
  var CSV_COLS = [
    ['student_id', 'รหัสนักศึกษา'],
    ['name', 'ชื่อ-สกุล'],
    ['year_level', 'ชั้นปี'],
    ['semester', 'ภาคการศึกษา'],
    ['academic_year', 'ปีการศึกษา'],
    ['height_m', 'ส่วนสูง (เมตร)'],
    ['weight_kg', 'น้ำหนัก (กก.)'],
    ['blood_sugar', 'น้ำตาลในเลือด'],
    ['pulse', 'ชีพจร'],
    ['bp_systolic', 'ความดันบน'],
    ['bp_diastolic', 'ความดันล่าง'],
    ['note', 'หมายเหตุ']
  ];

  function colKeyOf(header) {
    var h = s(header).toLowerCase().replace(/\s+/g, '');
    for (var i = 0; i < CSV_COLS.length; i++) {
      var k = CSV_COLS[i][0], label = CSV_COLS[i][1];
      if (h === k.toLowerCase()) return k;
      if (h === label.toLowerCase().replace(/\s+/g, '')) return k;
    }
    // ยอมให้เขียนย่อ เช่น "ส่วนสูง" "น้ำหนัก" โดยไม่มีหน่วย
    if (h.indexOf('ภาค') === 0) return 'semester';
    if (h.indexOf('ปีการศึกษา') === 0 || h.indexOf('ปีพ.ศ.') === 0 || h.indexOf('ปีพศ') === 0) return 'academic_year';
    if (h.indexOf('ส่วนสูง') === 0) return 'height_m';
    if (h.indexOf('น้ำหนัก') === 0) return 'weight_kg';
    if (h.indexOf('ความดันบน') === 0) return 'bp_systolic';
    if (h.indexOf('ความดันล่าง') === 0) return 'bp_diastolic';
    return '';
  }

  function saveFile(name, text) {
    try {
      var bom = String.fromCharCode(0xFEFF);   // ให้ Excel อ่านภาษาไทยไม่เป็นต่างด้าว
      var blob = new Blob([bom + text], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { toast('ดาวน์โหลดไม่สำเร็จ · ' + e.message, 'error'); return false; }
  }

  /* ---------- ดาวน์โหลดแบบฟอร์ม ----------
     เติมรายชื่อนักศึกษาของชั้นปีที่เลือกมาให้ และเติมค่าที่เคยบันทึกไว้ด้วย
     จึงใช้ได้ทั้งกรอกครั้งแรกและแก้ของเดิม ไม่ต้องมีสองแบบฟอร์ม */
  window.wbHealthForm = function () {
    var st = hState();
    var studs = studentsOfYear(st.year);
    if (!studs.length) { toast('ชั้นปีนี้ยังไม่มีนักศึกษา', 'error'); return; }
    var perr = periodError(st.semester, st.academicYear);
    if (perr) { toast(perr, 'error'); return; }
    var lines = [CSV_COLS.map(function (c) { return csvCell(c[1]); }).join(',')];
    studs.forEach(function (stu) {
      var r = existingHealthFor(stu.student_id, st.semester, st.academicYear) || {};
      lines.push([
        csvCell(s(stu.student_id)), csvCell(s(stu.name)), csvCell(s(stu.year_level)),
        csvCell(st.semester), csvCell(st.academicYear),
        csvCell(r.height_m), csvCell(r.weight_kg), csvCell(r.blood_sugar),
        csvCell(r.pulse), csvCell(r.bp_systolic), csvCell(r.bp_diastolic), csvCell(r.note)
      ].join(','));
    });
    var name = 'แบบฟอร์ม_สบช.โมเดล_ชั้นปี' + st.year + '_ภาค' + st.semester + '_' + st.academicYear + '.csv';
    if (saveFile(name, lines.join('\r\n')))
      toast('ดาวน์โหลดแบบฟอร์ม' + semName(st.semester) + ' ปีการศึกษา ' + st.academicYear
        + ' ของชั้นปีที่ ' + st.year + ' จำนวน ' + studs.length + ' คนแล้ว');
  };

  /* ---------- ดาวน์โหลดข้อมูล ----------
     ส่งออกสิ่งที่บันทึกไว้จริง พร้อม BMI และการแปลผลที่ระบบคำนวณให้
     เพื่อเอาไปทำรายงานต่อโดยไม่ต้องคำนวณซ้ำ */
  window.wbHealthExport = function (scope) {
    var st = hState();
    var all = s(scope) === 'all';
    /* ส่งออกตามภาคการศึกษาที่เลือกอยู่ จะได้ตรงกับที่ผู้ใช้กำลังดูบนหน้าจอ */
    var recs = get('student_health').filter(function (r) {
      if (all) return true;
      return s(r.semester) === s(st.semester) && s(r.academic_year) === s(st.academicYear);
    });
    if (!recs.length) { toast(all ? 'ยังไม่มีข้อมูลในระบบ' : 'ยังไม่มีข้อมูลในช่วงที่เลือก', 'error'); return; }

    var head = ['รหัสนักศึกษา', 'ชื่อ-สกุล', 'ชั้นปี', 'ภาคการศึกษา', 'ปีการศึกษา',
      'ส่วนสูง (เมตร)', 'น้ำหนัก (กก.)', 'BMI', 'แปลผล BMI', 'น้ำตาลในเลือด', 'ชีพจร',
      'ความดันบน', 'ความดันล่าง', 'หมายเหตุ', 'วันที่บันทึก', 'ผู้บันทึก'];
    var lines = [head.map(csvCell).join(',')];

    recs.slice().sort(function (a, b) {
      return (s(b.academic_year) + s(b.semester)).localeCompare(s(a.academic_year) + s(a.semester))
        || s(a.student_id).localeCompare(s(b.student_id));
    }).forEach(function (r) {
      var stu = studentById(r.student_id) || {};
      var bmi = bmiOf(r.height_m, r.weight_kg);
      lines.push([
        csvCell(s(r.student_id)), csvCell(s(stu.name)), csvCell(s(stu.year_level)),
        csvCell(s(r.semester)), csvCell(s(r.academic_year)),
        csvCell(s(r.height_m)), csvCell(s(r.weight_kg)), csvCell(bmi), csvCell(bmiBand(bmi)[0]),
        csvCell(s(r.blood_sugar)), csvCell(s(r.pulse)),
        csvCell(s(r.bp_systolic)), csvCell(s(r.bp_diastolic)), csvCell(s(r.note)),
        csvCell(s(r.record_date)), csvCell(s(r.recorded_by))
      ].join(','));
    });
    var name = all
      ? 'ข้อมูล_สบช.โมเดล_ทั้งหมด.csv'
      : 'ข้อมูล_สบช.โมเดล_ภาค' + s(st.semester) + '_' + s(st.academicYear) + '.csv';
    if (saveFile(name, lines.join('\r\n')))
      toast('ดาวน์โหลดข้อมูล ' + recs.length + ' รายการแล้ว');
  };

  /* ---------- อัปโหลดไฟล์ ----------
     อ่านไฟล์แล้ว "แสดงสรุปก่อน" ยังไม่เขียนอะไรทั้งนั้น
     เพราะไฟล์ที่กรอกมาจากข้างนอกมักมีรหัสผิด ชั้นปีผิด หรือกรอกหน่วยผิด
     ถ้าเขียนทันทีแล้วค่อยมาแก้ จะแก้ยากกว่าตรวจก่อนมาก */
  window.wbHealthPickFile = function () {
    var el = document.getElementById('wbHealthFile');
    if (el) el.click();
  };

  window.wbHealthUpload = async function (ev) {
    var file = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      var text = await file.text();
      var rows = parseCSV(text);
      if (rows.length < 2) { toast('ไฟล์นี้ไม่มีข้อมูล มีแต่หัวตาราง', 'error'); return; }

      var headers = rows[0].map(colKeyOf);
      if (headers.indexOf('student_id') < 0) {
        toast('ไม่พบคอลัมน์ "รหัสนักศึกษา" ในไฟล์ · กรุณาใช้แบบฟอร์มที่ดาวน์โหลดจากระบบ', 'error');
        return;
      }

      var st = hState();
      var plan = { add: [], edit: [], skip: [], error: [] };
      for (var i = 1; i < rows.length; i++) {
        var d = {};
        headers.forEach(function (k, idx) { if (k) d[k] = s(rows[i][idx]); });

        var sid = s(d.student_id).replace(/^="?|"?$/g, '');
        var stu = studentById(sid);
        if (!sid) continue;
        if (!stu) { plan.error.push({ sid: sid, why: 'ไม่พบรหัสนี้ในทะเบียนนักศึกษา' }); continue; }

        /* ภาคและปีการศึกษามาจากในไฟล์เป็นหลัก ถ้าไม่มีจึงใช้ค่าที่เลือกบนหน้าจอ
           เพราะไฟล์อาจถูกกรอกกลับมาหลังจากเปลี่ยนภาคบนหน้าจอไปแล้ว */
        var sem = s(d.semester) || st.semester;
        var ay = s(d.academic_year) || st.academicYear;
        // ยอมรับทั้งเลขภาคและชื่อเต็ม เพราะคนกรอกมักพิมพ์ชื่อภาคมาทั้งคำ
        if (sem && !/^[0-9]$/.test(sem)) {
          var hit = '';
          for (var si = 0; si < SEMS.length; si++) {
            if (SEMS[si][1] === sem || SEMS[si][1].indexOf(sem) >= 0) { hit = SEMS[si][0]; break; }
          }
          sem = hit || sem;
        }
        var perr = periodError(sem, ay);
        if (perr) { plan.error.push({ sid: sid, name: s(stu.name), why: perr }); continue; }

        if (rowEmpty(d)) { plan.skip.push({ sid: sid, name: s(stu.name) }); continue; }
        var err = rowError(d);
        if (err) { plan.error.push({ sid: sid, name: s(stu.name), why: err }); continue; }

        var cur = existingHealthFor(sid, sem, ay);
        if (cur && !ownsRow(cur)) {
          plan.error.push({ sid: sid, name: s(stu.name), why: 'มีข้อมูลที่ ' + (s(cur.recorded_by) || 'ผู้อื่น') + ' กรอกไว้ ต้องให้ผู้นั้นแก้เอง' });
          continue;
        }
        var item = { sid: sid, name: s(stu.name), sem: sem, ay: ay, d: d, cur: cur };
        if (cur) plan.edit.push(item); else plan.add.push(item);
      }
      st.importPlan = plan;
      showImportPreview(plan);
    } catch (e) {
      toast('อ่านไฟล์ไม่สำเร็จ · ' + e.message, 'error');
    } finally {
      if (ev && ev.target) ev.target.value = '';
    }
  };

  function showImportPreview(plan) {
    var total = plan.add.length + plan.edit.length;
    function box(color, n, label) {
      return '<div class="flex-1 min-w-[7rem] bg-' + color + '-50 rounded-xl p-3 text-center">'
        + '<p class="text-2xl font-bold text-' + color + '-600">' + n + '</p>'
        + '<p class="text-xs text-gray-600">' + label + '</p></div>';
    }
    var errList = plan.error.length
      ? '<div class="mt-3"><p class="text-sm font-semibold text-red-600 mb-1">รายการที่นำเข้าไม่ได้</p>'
      + '<div class="border border-red-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto"><table class="w-full text-sm">'
      + plan.error.map(function (e) {
        return '<tr class="border-b last:border-0"><td class="px-3 py-1.5 font-mono text-xs">' + esc(e.sid) + '</td>'
          + '<td class="px-3 py-1.5">' + esc(e.name || '') + '</td>'
          + '<td class="px-3 py-1.5 text-red-600 text-xs">' + esc(e.why) + '</td></tr>';
      }).join('') + '</table></div></div>'
      : '';

    var html = '<div class="space-y-3">'
      + '<p class="text-sm text-gray-600">ตรวจไฟล์เรียบร้อย ยังไม่ได้บันทึกอะไรลงระบบ กดยืนยันเมื่อตัวเลขถูกต้อง</p>'
      + '<div class="flex flex-wrap gap-2">'
      + box('green', plan.add.length, 'เพิ่มใหม่')
      + box('blue', plan.edit.length, 'แก้ของเดิม')
      + box('gray', plan.skip.length, 'ข้าม (ไม่ได้กรอก)')
      + box('red', plan.error.length, 'มีปัญหา')
      + '</div>'
      + errList
      + (total
        ? '<button type="button" onclick="wbHealthImportConfirm()" class="w-full bg-primary text-white py-2.5 rounded-xl">ยืนยันนำเข้า ' + total + ' รายการ</button>'
        : '<p class="text-sm text-gray-500 text-center py-2">ไม่มีรายการที่นำเข้าได้</p>')
      + '</div>';
    if (typeof showModal === 'function') showModal('ตรวจก่อนนำเข้าข้อมูล สบช.โมเดล', html);
  }

  window.wbHealthImportConfirm = async function () {
    if (busy) return;
    var st = hState(), plan = st.importPlan;
    if (!plan) return;
    busy = true;
    var btn = document.querySelector('button[onclick="wbHealthImportConfirm()"]');
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
    var okN = 0, failN = 0;
    try {
      var items = plan.add.concat(plan.edit);
      for (var i = 0; i < items.length; i++) {
        var it = items[i], d = it.d;
        var payload = {
          type: 'student_health', student_id: it.sid,
          record_date: (it.cur && s(it.cur.record_date)) || new Date().toISOString().slice(0, 10),
          semester: it.sem, academic_year: it.ay,
          height_m: s(d.height_m), weight_kg: s(d.weight_kg),
          blood_sugar: s(d.blood_sugar), pulse: s(d.pulse),
          bp_systolic: s(d.bp_systolic), bp_diastolic: s(d.bp_diastolic),
          note: s(d.note), recorded_by: me(), updated_by: me()
        };
        var r = it.cur
          ? await GSheetDB.update(Object.assign({}, it.cur, payload), { noRefresh: true })
          : await GSheetDB.create(payload, { noRefresh: true });
        if (r && r.isOk) okN++; else failN++;
      }
      await GSheetDB.refreshTab('student_health');
      st.importPlan = null;
      st.dirty = {};
      if (typeof closeModal === 'function') closeModal();
      toast('นำเข้าสำเร็จ ' + okN + ' รายการ' + (failN ? ' · ไม่สำเร็จ ' + failN : ''), failN ? 'error' : 'success');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) {
      toast('นำเข้าไม่สำเร็จ · ' + e.message, 'error');
    } finally {
      busy = false;
      var b2 = document.querySelector('button[onclick="wbHealthImportConfirm()"]');
      if (b2) { b2.disabled = false; b2.classList.remove('opacity-60'); }
    }
  };

  window.wbHealthDelete = async function (sid) {
    var cur = existingHealth(sid);
    if (!cur) return;
    if (!ownsRow(cur)) { toast('ลบได้เฉพาะข้อมูลที่ตนเป็นผู้กรอก', 'error'); return; }
    var stu = studentById(sid) || {};
    var stD = hState();
    if (!confirm('ลบข้อมูล สบช.โมเดล ของ ' + (s(stu.name) || sid)
      + ' ' + semName(stD.semester) + ' ปีการศึกษา ' + stD.academicYear + '?')) return;
    try {
      var r = await GSheetDB.delete(cur, { noRefresh: true });
      if (!r || !r.isOk) throw new Error(s(r && r.error) || 'ลบไม่สำเร็จ');
      await GSheetDB.refreshTab('student_health');
      toast('ลบเรียบร้อย');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) { toast('ลบไม่สำเร็จ · ' + e.message, 'error'); }
  };

  /* ================================================================
     หน้าที่ 2 · ข้อมูลความประพฤติ — รายการ + หน้าต่างเพิ่มบันทึก
     ================================================================ */
  function conductPage() {
    if (!canConduct()) return noRight('ข้อมูลความประพฤติ');
    var st = cState();
    var rows = get('student_conduct').slice();

    if (s(st.semester)) rows = rows.filter(function (x) { return s(x.semester) === s(st.semester); });
    if (s(st.academicYear)) rows = rows.filter(function (x) { return s(x.academic_year) === s(st.academicYear); });
    if (s(st.year)) {
      rows = rows.filter(function (x) {
        var stu = studentById(x.student_id);
        return stu && s(stu.year_level) === s(st.year);
      });
    }
    var kw = s(st.search).toLowerCase();
    if (kw) {
      rows = rows.filter(function (x) {
        var stu = studentById(x.student_id) || {};
        return (s(x.student_id) + ' ' + s(stu.name) + ' ' + s(x.conduct_type) + ' ' + s(x.detail)).toLowerCase().indexOf(kw) >= 0;
      });
    }
    rows.sort(function (a, b) { return s(b.conduct_date).localeCompare(s(a.conduct_date)); });

    var total = rows.length;
    var from = (st.page - 1) * st.perPage;
    var paged = rows.slice(from, from + st.perPage);

    var body = paged.map(function (r, i) {
      var stu = studentById(r.student_id) || {};
      var mine = ownsRow(r);
      var good = s(r.conduct_type) === 'พฤติกรรมดีเด่น';
      return '<tr class="border-t">'
        + '<td class="px-3 py-2.5 text-gray-400 text-xs">' + (from + i + 1) + '</td>'
        + '<td class="px-3 py-2.5 text-sm whitespace-nowrap">'
        + (typeof toBuddhistDateList === 'function' ? esc(toBuddhistDateList(r.conduct_date)) : esc(s(r.conduct_date)))
        + '<span class="block text-[11px] text-gray-400">ภาค ' + esc(s(r.semester)) + '/' + esc(s(r.academic_year)) + '</span></td>'
        + '<td class="px-3 py-2.5 text-sm"><span class="font-medium">' + esc(s(stu.name) || s(r.student_id)) + '</span>'
        + '<span class="block text-[11px] text-gray-400 font-mono">' + esc(s(r.student_id))
        + (s(stu.year_level) ? ' · ชั้นปี ' + esc(s(stu.year_level)) : '') + '</span></td>'
        + '<td class="px-3 py-2.5"><span class="px-2 py-1 rounded-full text-xs '
        + (good ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700') + '">'
        + esc(s(r.conduct_type)) + '</span></td>'
        + '<td class="px-3 py-2.5 text-sm text-gray-700">' + esc(s(r.detail)) + '</td>'
        + '<td class="px-3 py-2.5 text-sm text-gray-600">' + esc(s(r.action_taken)) + '</td>'
        + '<td class="px-3 py-2.5 text-xs text-gray-400">' + esc(s(r.recorded_by)) + '</td>'
        + '<td class="px-3 py-2.5 text-center whitespace-nowrap">'
        + (mine
          ? '<button onclick="wbConductEdit(\'' + esc(r.__backendId) + '\')" class="text-blue-400 hover:text-blue-600 px-1" title="แก้ไข"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
          + '<button onclick="wbConductDelete(\'' + esc(r.__backendId) + '\')" class="text-red-400 hover:text-red-600 px-1" title="ลบ"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
          : '<span class="text-[11px] text-gray-300">ของผู้อื่น</span>')
        + '</td></tr>';
    }).join('');

    var pages = Math.max(1, Math.ceil(total / st.perPage));
    var pager = total > st.perPage
      ? '<div class="flex items-center justify-between px-4 py-3 border-t text-sm">'
      + '<span class="text-gray-500">ทั้งหมด ' + total + ' รายการ</span>'
      + '<div class="flex gap-1">'
      + '<button onclick="wbConductPage(' + (st.page - 1) + ')" ' + (st.page <= 1 ? 'disabled' : '')
      + ' class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">ก่อนหน้า</button>'
      + '<span class="px-3 py-1.5 text-gray-600">หน้า ' + st.page + ' / ' + pages + '</span>'
      + '<button onclick="wbConductPage(' + (st.page + 1) + ')" ' + (st.page >= pages ? 'disabled' : '')
      + ' class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">ถัดไป</button>'
      + '</div></div>' : '';

    var yearsOpt = ['<option value="">ทุกชั้นปี</option>'].concat(YEARS.map(function (y) {
      return '<option value="' + y + '"' + (s(st.year) === y ? ' selected' : '') + '>ชั้นปีที่ ' + y + '</option>';
    })).join('');

    return '<div class="mb-5 flex flex-wrap items-start justify-between gap-3">'
      + '<div><h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">'
      + '<i data-lucide="clipboard-list" class="w-6 h-6"></i>ข้อมูลความประพฤติ</h2>'
      + '<p class="text-sm text-gray-500 mt-1">บันทึกทั้งพฤติกรรมที่ต้องตักเตือนและพฤติกรรมดีเด่น · '
      + 'เหตุการณ์เดียวกันเลือกนักศึกษาได้หลายคนพร้อมกัน · แก้ไขและลบได้เฉพาะรายการที่ตนบันทึก</p></div>'
      + '<button onclick="wbConductNew()" class="px-4 py-2 rounded-xl bg-primary text-white text-sm flex items-center gap-2">'
      + '<i data-lucide="plus" class="w-4 h-4"></i>เพิ่มบันทึก</button>'
      + '</div>'

      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<div class="flex flex-wrap items-end gap-3">'
      + '<div class="flex-1 min-w-[16rem]"><label class="block text-xs text-gray-600 mb-1">ค้นหา</label>'
      + '<input value="' + esc(st.search) + '" oninput="wbConductSearch(this.value)" '
      + 'placeholder="รหัส ชื่อ ประเภท หรือรายละเอียด" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ชั้นปี</label>'
      + '<select onchange="wbConductSet(\'year\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + yearsOpt + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ภาคการศึกษา</label>'
      + '<select onchange="wbConductSet(\'semester\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + '<option value="">ทุกภาค</option>'
      + SEMS.map(function (x) {
        return '<option value="' + x[0] + '"' + (s(st.semester) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ปีการศึกษา</label>'
      + '<input value="' + esc(st.academicYear) + '" onchange="wbConductSet(\'academicYear\',this.value)" '
      + 'placeholder="ทุกปี" class="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '</div></div>'

      + '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden">'
      + '<div class="overflow-x-auto"><table class="w-full">'
      + '<thead><tr class="bg-surface text-left text-xs">'
      + '<th class="px-3 py-3">#</th><th class="px-3 py-3">วันที่</th><th class="px-3 py-3">นักศึกษา</th>'
      + '<th class="px-3 py-3">ประเภท</th><th class="px-3 py-3">รายละเอียด</th>'
      + '<th class="px-3 py-3">การดำเนินการ</th><th class="px-3 py-3">ผู้บันทึก</th><th class="px-3 py-3 text-center">จัดการ</th>'
      + '</tr></thead><tbody>'
      + (body || '<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">ยังไม่มีบันทึกความประพฤติตามเงื่อนไขที่เลือก</td></tr>')
      + '</tbody></table></div>' + pager + '</div>';
  }

  window.wbConductSet = function (k, v) { var st = cState(); st[k] = s(v); st.page = 1; if (typeof renderCurrentPage === 'function') renderCurrentPage(); };
  window.wbConductPage = function (p) { var st = cState(); st.page = Math.max(1, p); if (typeof renderCurrentPage === 'function') renderCurrentPage(); };
  window.wbConductSearch = function (v) {
    var st = cState(); st.search = s(v); st.page = 1;
    clearTimeout(st._t);
    st._t = setTimeout(function () { if (typeof renderCurrentPage === 'function') renderCurrentPage(); }, 300);
  };

  /* ---------- หน้าต่างเพิ่ม/แก้ไขบันทึกความประพฤติ ---------- */
  function conductFormHTML(d, editing) {
    var studs = activeStudents().sort(function (a, b) { return s(a.student_id).localeCompare(s(b.student_id)); });
    var picked = d.students || [];
    var pickedSet = {};
    picked.forEach(function (x) { pickedSet[s(x)] = 1; });

    var list = picked.map(function (sid, i) {
      var stu = studentById(sid) || {};
      return '<tr class="border-t"><td class="px-2 py-1.5 text-gray-400 text-xs">' + (i + 1) + '</td>'
        + '<td class="px-2 py-1.5 font-mono text-xs">' + esc(s(sid)) + '</td>'
        + '<td class="px-2 py-1.5 text-sm">' + esc(s(stu.name) || '(ไม่พบในทะเบียน)') + '</td>'
        + '<td class="px-2 py-1.5 text-xs text-gray-500">ชั้นปี ' + esc(s(stu.year_level) || '-') + '</td>'
        + '<td class="px-2 py-1.5 text-center">'
        + (editing ? '' : '<button type="button" onclick="wbConductDrop(\'' + esc(s(sid)) + '\')" class="text-red-500 text-xs hover:underline">ลบ</button>')
        + '</td></tr>';
    }).join('');

    return '<form id="wbConductForm" class="space-y-3">'
      + (editing
        ? '<div class="bg-surface rounded-xl p-3 text-sm">แก้ไขบันทึกของ <span class="font-semibold">'
        + esc(s((studentById(picked[0]) || {}).name) || s(picked[0])) + '</span></div>'
        : '<div><label class="block text-xs text-gray-600 mb-1">เลือกนักศึกษา <span class="text-red-500">*</span> '
        + '<span class="text-gray-400">เลือกได้หลายคนถ้าเป็นเหตุการณ์เดียวกัน</span></label>'
        + '<div class="flex gap-2">'
        + '<select id="wbConductPick" class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
        + '<option value="">— ค้นหาและเลือกนักศึกษา —</option>'
        + studs.filter(function (x) { return !pickedSet[s(x.student_id)]; }).map(function (x) {
          return '<option value="' + esc(s(x.student_id)) + '">'
            + esc(s(x.student_id) + ' · ' + s(x.name) + ' (ชั้นปี ' + (s(x.year_level) || '-') + ')') + '</option>';
        }).join('') + '</select>'
        + '<button type="button" onclick="wbConductAdd()" class="px-4 py-2 rounded-xl bg-primary text-white text-sm">เพิ่ม</button>'
        + '</div></div>')

      + (picked.length
        ? '<div class="border border-gray-100 rounded-xl overflow-hidden"><table class="w-full text-sm"><tbody>' + list + '</tbody></table></div>'
        : '<p class="text-sm text-gray-400">ยังไม่ได้เลือกนักศึกษา</p>')

      + '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">'
      + '<div><label class="block text-xs text-gray-600 mb-1">วันที่เกิดเหตุ <span class="text-red-500">*</span></label>'
      + '<input name="conduct_date" type="date" value="' + esc(d.conduct_date) + '" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ภาคการศึกษา <span class="text-red-500">*</span></label>'
      + '<select name="semester" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + SEMS.map(function (x) {
        return '<option value="' + x[0] + '"' + (s(d.semester) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ปีการศึกษา (พ.ศ.) <span class="text-red-500">*</span></label>'
      + '<input name="academic_year" value="' + esc(d.academic_year) + '" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '</div>'

      + '<div><label class="block text-xs text-gray-600 mb-1">ประเภทพฤติกรรม <span class="text-red-500">*</span></label>'
      + '<select name="conduct_type" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + '<option value="">— เลือกประเภท —</option>'
      + CONDUCT_TYPES.map(function (x) {
        return '<option' + (s(d.conduct_type) === x ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('') + '</select></div>'

      + '<div><label class="block text-xs text-gray-600 mb-1">รายละเอียด <span class="text-red-500">*</span></label>'
      + '<textarea name="detail" rows="3" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" '
      + 'placeholder="สิ่งที่เกิดขึ้น ระบุเท่าที่จำเป็นต่อการติดตามช่วยเหลือ">' + esc(d.detail) + '</textarea></div>'

      + '<div><label class="block text-xs text-gray-600 mb-1">การดำเนินการ</label>'
      + '<select name="action_taken" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + '<option value="">— ยังไม่ระบุ —</option>'
      + CONDUCT_ACTIONS.map(function (x) {
        return '<option' + (s(d.action_taken) === x ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('') + '</select></div>'

      + '<div><label class="block text-xs text-gray-600 mb-1">หมายเหตุ</label>'
      + '<input name="note" value="' + esc(d.note) + '" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'

      + '<p class="text-[11px] text-gray-400">ข้อมูลนี้อาจารย์ที่ปรึกษาของนักศึกษาจะมองเห็นในหน้าให้คำปรึกษา '
      + 'จึงควรเขียนเท่าที่จำเป็นต่อการดูแลช่วยเหลือ</p>'

      + '<button type="submit" class="w-full bg-primary text-white py-2.5 rounded-xl">บันทึก</button>'
      + '</form>';
  }

  function openConductModal(editing) {
    var st = cState();
    if (typeof showModal !== 'function') return;
    showModal(editing ? 'แก้ไขบันทึกความประพฤติ' : 'เพิ่มบันทึกความประพฤติ', conductFormHTML(st.draft, editing));
    var f = document.getElementById('wbConductForm');
    if (!f) return;
    f.onsubmit = function (e) { e.preventDefault(); wbConductSave(editing); };
    if (window.lucide) lucide.createIcons();
  }

  window.wbConductNew = function () {
    var st = cState();
    st.editId = '';
    st.draft = {
      students: [], conduct_date: new Date().toISOString().slice(0, 10),
      semester: '1', academic_year: curYear(),
      conduct_type: '', detail: '', action_taken: '', note: ''
    };
    openConductModal(false);
  };

  window.wbConductEdit = function (id) {
    var rows = get('student_conduct');
    var r = null;
    for (var i = 0; i < rows.length; i++) if (s(rows[i].__backendId) === s(id)) { r = rows[i]; break; }
    if (!r) return;
    if (!ownsRow(r)) { toast('แก้ไขได้เฉพาะรายการที่ตนบันทึก', 'error'); return; }
    var st = cState();
    st.editId = s(id);
    st.draft = {
      students: [s(r.student_id)], conduct_date: s(r.conduct_date),
      semester: s(r.semester) || '1', academic_year: s(r.academic_year) || curYear(),
      conduct_type: s(r.conduct_type), detail: s(r.detail),
      action_taken: s(r.action_taken), note: s(r.note)
    };
    openConductModal(true);
  };

  window.wbConductAdd = function () {
    var el = document.getElementById('wbConductPick');
    if (!el) return;
    var sid = s(el.value);
    if (!sid) { toast('เลือกนักศึกษาก่อน', 'error'); return; }
    var st = cState();
    if (st.draft.students.indexOf(sid) >= 0) { toast('นักศึกษารายนี้ถูกเลือกไว้แล้ว', 'error'); return; }
    if (!studentById(sid)) { toast('ไม่พบนักศึกษารายนี้ในทะเบียน', 'error'); return; }
    keepForm();
    st.draft.students.push(sid);
    openConductModal(false);
  };

  window.wbConductDrop = function (sid) {
    var st = cState();
    keepForm();
    st.draft.students = st.draft.students.filter(function (x) { return s(x) !== s(sid); });
    openConductModal(false);
  };

  /* เก็บสิ่งที่พิมพ์ไว้ก่อนวาดหน้าต่างใหม่ ไม่งั้นกดเพิ่มรายชื่อแล้วข้อความที่พิมพ์หาย */
  function keepForm() {
    var f = document.getElementById('wbConductForm');
    if (!f) return;
    var st = cState();
    ['conduct_date', 'semester', 'academic_year', 'conduct_type', 'detail', 'action_taken', 'note'].forEach(function (k) {
      var el = f.querySelector('[name="' + k + '"]');
      if (el) st.draft[k] = s(el.value);
    });
  }

  function validateConduct(d) {
    var e = [];
    if (!d.students.length) e.push('เลือกนักศึกษาอย่างน้อยหนึ่งคน');
    if (!s(d.conduct_date)) e.push('ระบุวันที่เกิดเหตุ');
    if (!s(d.semester)) e.push('เลือกภาคการศึกษา');
    if (!s(d.academic_year)) e.push('ระบุปีการศึกษา');
    if (!s(d.conduct_type)) e.push('เลือกประเภทพฤติกรรม');
    if (!s(d.detail)) e.push('กรอกรายละเอียด');
    return e;
  }

  var savingC = false;
  window.wbConductSave = async function (editing) {
    if (savingC) return;
    keepForm();
    var st = cState(), d = st.draft;
    var err = validateConduct(d);
    if (err.length) {
      toast('ยังกรอกไม่ครบ · ' + err[0] + (err.length > 1 ? ' (และอีก ' + (err.length - 1) + ' ข้อ)' : ''), 'error');
      return;
    }
    savingC = true;
    var btn = document.querySelector('#wbConductForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }
    try {
      var base = {
        type: 'student_conduct',
        conduct_date: d.conduct_date, semester: d.semester, academic_year: d.academic_year,
        conduct_type: d.conduct_type, detail: d.detail,
        action_taken: d.action_taken, note: d.note,
        recorded_by: me(), updated_by: me()
      };
      if (editing) {
        var rows = get('student_conduct'), cur = null;
        for (var i = 0; i < rows.length; i++) if (s(rows[i].__backendId) === s(st.editId)) { cur = rows[i]; break; }
        if (!cur) throw new Error('ไม่พบรายการที่จะแก้ไข');
        var r = await GSheetDB.update(Object.assign({}, cur, base, { student_id: d.students[0] }), { noRefresh: true });
        if (!r || !r.isOk) throw new Error(s(r && r.error) || 'บันทึกไม่สำเร็จ');
      } else {
        for (var j = 0; j < d.students.length; j++) {
          var rr = await GSheetDB.create(Object.assign({}, base, { student_id: d.students[j] }), { noRefresh: true });
          if (!rr || !rr.isOk) throw new Error(s(rr && rr.error) || 'บันทึกไม่สำเร็จ');
        }
      }
      await GSheetDB.refreshTab('student_conduct');
      st.draft = null; st.editId = '';
      if (typeof closeModal === 'function') closeModal();
      toast(editing ? 'บันทึกการแก้ไขเรียบร้อย' : 'บันทึกเรียบร้อย ' + d.students.length + ' รายการ');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) {
      toast('บันทึกไม่สำเร็จ · ' + e.message, 'error');
    } finally {
      savingC = false;
      var b2 = document.querySelector('#wbConductForm button[type="submit"]');
      if (b2) { b2.disabled = false; b2.classList.remove('opacity-60'); }
    }
  };

  window.wbConductDelete = async function (id) {
    var rows = get('student_conduct'), r = null;
    for (var i = 0; i < rows.length; i++) if (s(rows[i].__backendId) === s(id)) { r = rows[i]; break; }
    if (!r) return;
    if (!ownsRow(r)) { toast('ลบได้เฉพาะรายการที่ตนบันทึก', 'error'); return; }
    var stu = studentById(r.student_id) || {};
    if (!confirm('ลบบันทึก "' + s(r.conduct_type) + '" ของ ' + (s(stu.name) || s(r.student_id)) + '?')) return;
    try {
      var res = await GSheetDB.delete(r, { noRefresh: true });
      if (!res || !res.isOk) throw new Error(s(res && res.error) || 'ลบไม่สำเร็จ');
      await GSheetDB.refreshTab('student_conduct');
      toast('ลบเรียบร้อย');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) { toast('ลบไม่สำเร็จ · ' + e.message, 'error'); }
  };

  /* ================================================================
     ต่อเข้ากับระบบเดิม
     ================================================================ */
  var PAGES = { healthEntry: healthPage, conductEntry: conductPage };
  window.wellbeingPages = PAGES;

  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function () {
      var p = APP.currentPage;
      if (PAGES[p]) return PAGES[p]();
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      try { addMenu(); } catch (e) { console.warn('เพิ่มเมนู บันทึกข้อมูลนักศึกษา ไม่สำเร็จ:', e); }
    };

    function addMenu() {
      if (!canSeeMenu()) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-wellbeing-menu]')) return;

      var here = APP.currentPage;
      var subs = [];
      if (canHealth()) subs.push(['healthEntry', 'ข้อมูล สบช.โมเดล']);
      if (canConduct()) subs.push(['conductEntry', 'ข้อมูลความประพฤติ']);
      if (!subs.length) return;

      var node;
      if (subs.length > 1) {
        var open = subs.some(function (x) { return x[0] === here; });
        node = document.createElement('div');
        node.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
        node.setAttribute('data-wellbeing-menu', '1');
        node.innerHTML =
          '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
          + '<span class="flex items-center gap-3"><i data-lucide="stethoscope" class="w-5 h-5 flex-shrink-0"></i>บันทึกข้อมูลนักศึกษา</span>'
          + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"' + (open ? ' style="transform:rotate(180deg)"' : '') + '></i>'
          + '</button>'
          + '<div class="dropdown-menu ml-8"><div class="dropdown-inner space-y-1">'
          + subs.map(function (x) {
            var on = here === x[0];
            return '<button onclick="navigateTo(\'' + x[0] + '\')" data-page="' + x[0] + '" '
              + 'class="nav-item w-full text-left px-3 py-2 rounded-lg text-sm transition '
              + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-600 hover:bg-surface hover:text-primary') + '">'
              + x[1] + '</button>';
          }).join('')
          + '</div></div>';
      } else {
        var only = subs[0];
        node = document.createElement('button');
        node.setAttribute('onclick', "navigateTo('" + only[0] + "')");
        node.setAttribute('data-page', only[0]);
        node.setAttribute('data-wellbeing-menu', '1');
        node.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
        node.innerHTML = '<i data-lucide="stethoscope" class="w-5 h-5 flex-shrink-0"></i>' + only[1];
      }

      /* วางต่อจากเมนูระบบให้คำปรึกษา เพราะเป็นข้อมูลชุดเดียวกันที่ใช้ประกอบการให้คำปรึกษา */
      var after = nav.querySelector('[data-counsel-menu]');
      if (after && after.parentNode === nav) nav.insertBefore(node, after.nextSibling);
      else nav.appendChild(node);
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
