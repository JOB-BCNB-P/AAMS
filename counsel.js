/* ================================================================
   counsel.js — ระบบให้คำปรึกษานักศึกษา
   ----------------------------------------------------------------
   แนวคิด : ไม่สร้างข้อมูลซ้ำกับที่ระบบมีอยู่แล้ว
     ผลการศึกษา      ใช้ตาราง grade เดิม และเรียกหน้าต่างใบแสดงผลการเรียนตัวเดิม
     การลา/ขาดเรียน  ใช้ตาราง leave เดิม
     การเจ็บป่วย     ใช้ตาราง leave เดิม เฉพาะประเภทลาป่วย/ลาพบแพทย์ ซึ่งมีใบรับรองแพทย์แนบอยู่แล้ว
     ที่ปรึกษา        ใช้ช่อง advisor ในทะเบียนนักศึกษา (นศ. 635 จาก 636 คนมีแล้ว)
   สร้างใหม่เฉพาะสองอย่างที่ยังไม่มีที่เก็บจริง ๆ
     student_health   ข้อมูล สบช.โมเดล — ส่วนสูง/น้ำหนัก น้ำตาลในเลือด ชีพจร ความดัน รายภาคการศึกษา
     student_conduct  ข้อมูลความประพฤติ

   สิทธิ์บังคับที่ฐานข้อมูล (RLS) ไม่ใช่แค่ซ่อนปุ่ม
     อาจารย์            เห็นและแก้เฉพาะบันทึกของตน และเลือกได้เฉพาะนักศึกษาในที่ปรึกษาของตน
     ผู้ดูแลระบบ         เห็นทั้งหมด
     เจ้าหน้าที่งานอื่นๆ  เห็นเฉพาะรายการที่ส่งต่อมา
   ================================================================ */
(function () {
  'use strict';

  /* ---------------- เครื่องมือพื้นฐาน ---------------- */
  function s(v) { return String(v == null ? '' : v).trim(); }
  function esc(v) { return (typeof htmlEsc === 'function') ? htmlEsc(v) : s(v); }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function me() { return s(APP.currentUser && APP.currentUser.name); }

  var SEMS = [['1', 'ภาคการศึกษาที่ 1'], ['2', 'ภาคการศึกษาที่ 2'], ['3', 'ภาคฤดูร้อน']];
  var YEARS = ['1', '2', '3', '4'];

  /* ตัดคำนำหน้าและช่องว่างออกก่อนเทียบชื่อ — ใช้กฎเดียวกับหน้า "ข้อมูลอาจารย์ที่ปรึกษา"
     เพราะช่อง advisor ในทะเบียนพิมพ์คำนำหน้าไม่เหมือนกันทุกแถว */
  var TITLES = ['ผศ.ดร.', 'รศ.ดร.', 'ศ.ดร.', 'ผศ.', 'รศ.', 'ศ.', 'ดร.', 'อ.', 'อาจารย์',
    'ว่าที่ร.ต.', 'ว่าที่ร้อยตรี', 'น.ส.', 'นางสาว', 'นาง', 'นาย', 'นพ.', 'พญ.'];
  function nameKey(v) {
    var n = s(v).toLowerCase().replace(/\s+/g, '');
    var go = true;
    while (go) {
      go = false;
      for (var i = 0; i < TITLES.length; i++) {
        var p = TITLES[i].toLowerCase().replace(/\s+/g, '');
        if (p && n.indexOf(p) === 0) { n = n.slice(p.length); go = true; break; }
      }
    }
    return n;
  }

  /* ---------------- สิทธิ์ ---------------- */
  function perms() { return (APP.permissions && APP.permissions[APP.currentRole]) || {}; }
  function canUse() { return !!perms().counsel; }
  function isAdvisorRole() { return APP.currentRole === 'teacher' || APP.currentRole === 'classTeacher'; }
  function seesAll() { return ['admin', 'academic', 'registrar'].indexOf(APP.currentRole) >= 0; }
  function isReferralStaff() { return APP.currentRole === 'otherStaff'; }
  // แก้ไขได้เฉพาะเจ้าของบันทึก หรือผู้ที่เห็นทั้งหมด — ตรงกับกติกาใน RLS
  function canEdit(row) {
    if (seesAll()) return true;
    if (!isAdvisorRole()) return false;
    return !row || nameKey(row.advisor_name) === nameKey(me());
  }

  /* ---------------- ข้อมูล ---------------- */
  function sessions() {
    var all = get('counsel_session');
    if (seesAll()) return all;
    if (isReferralStaff()) return all.filter(function (x) { return s(x.refer_status) === 'ส่งต่อ'; });
    var k = nameKey(me());
    return all.filter(function (x) { return nameKey(x.advisor_name) === k; });
  }
  function sessionByCode(code) {
    var c = s(code);
    return sessions().filter(function (x) { return s(x.session_code) === c; })[0] || null;
  }
  function membersOf(code) {
    var c = s(code);
    return get('counsel_student').filter(function (x) { return s(x.session_code) === c; })
      .sort(function (a, b) {
        return s(a.year_level).localeCompare(s(b.year_level)) || s(a.student_id).localeCompare(s(b.student_id));
      });
  }
  function options(kind) {
    return get('counsel_option')
      .filter(function (x) { return s(x.kind) === kind && s(x.status) !== 'เลิกใช้'; })
      .sort(function (a, b) { return num(a.sort_order) - num(b.sort_order); });
  }
  function optionLabel(kind, code) {
    var hit = options(kind).filter(function (x) { return s(x.code) === s(code); })[0];
    return hit ? s(hit.label) : s(code);
  }

  /* นักศึกษาที่อาจารย์คนนี้ให้คำปรึกษาได้
     อาจารย์ = เฉพาะที่ตนเป็นที่ปรึกษา · ผู้ดูแล/งานทะเบียน = ทุกคนที่กำลังศึกษา */
  function myStudents() {
    var list = get('student').filter(function (x) {
      return typeof isActiveStudent === 'function' ? isActiveStudent(x) : s(x.status) === 'กำลังศึกษา';
    });
    if (seesAll()) return list;
    var k = nameKey(me());
    if (!k) return [];
    return list.filter(function (x) { return nameKey(x.advisor) === k; });
  }
  function studentsByYear(y) {
    return myStudents().filter(function (x) { return s(x.year_level) === s(y); })
      .sort(function (a, b) { return s(a.student_id).localeCompare(s(b.student_id)); });
  }
  function studentById(sid) {
    var k = s(sid);
    return get('student').filter(function (x) { return s(x.student_id) === k; })[0] || null;
  }

  /* GPA สะสม — คิดจากตาราง grade เดิม ไม่เก็บซ้ำในระบบให้คำปรึกษา */
  var GRADE_POINT = { 'A': 4, 'B+': 3.5, 'B': 3, 'C+': 2.5, 'C': 2, 'D+': 1.5, 'D': 1, 'F': 0 };
  function gpaOfStudent(sid) {
    var k = s(sid), pts = 0, cr = 0;
    get('grade').forEach(function (g) {
      if (s(g.student_id) !== k) return;
      var gd = s(g.grade).toUpperCase();
      if (!(gd in GRADE_POINT)) return;
      var c = num(g.credits);
      if (!c) return;
      pts += GRADE_POINT[gd] * c; cr += c;
    });
    return cr ? Math.round(pts / cr * 100) / 100 : null;
  }

  /* ---------------- เวลาและวันที่ ---------------- */
  function minutesBetween(a, b) {
    var ma = /^(\d{1,2}):(\d{2})$/.exec(s(a)), mb = /^(\d{1,2}):(\d{2})$/.exec(s(b));
    if (!ma || !mb) return null;
    var x = (+ma[1]) * 60 + (+ma[2]), y = (+mb[1]) * 60 + (+mb[2]);
    return y - x;                       // ติดลบได้ ให้ผู้เรียกเป็นคนตัดสินว่าผิด
  }
  // เก็บเป็นนาที แสดงเป็นชั่วโมง — 90 นาที = 1.50 ชม.
  function hoursText(minText) {
    var m = num(minText);
    if (!m) return '0.00';
    return (m / 60).toFixed(2);
  }
  function beDate(iso) { return (typeof toBuddhistDate === 'function') ? toBuddhistDate(iso) : s(iso); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function curYearBE() {
    return (typeof currentAcademicYearBE === 'function') ? String(currentAcademicYearBE()) : String(new Date().getFullYear() + 543);
  }
  function yearsList() {
    var seen = {}, out = [];
    sessions().forEach(function (x) { var y = s(x.academic_year); if (y && !seen[y]) { seen[y] = 1; out.push(y); } });
    if (!out.length) out.push(curYearBE());
    return out.sort().reverse();
  }

  /* ---------------- ชิ้นส่วนหน้าจอ ---------------- */
  function header(title, icon, sub) {
    return '<div class="mb-4">'
      + '<h2 class="text-xl font-bold text-gray-800"><i data-lucide="' + icon + '" class="w-6 h-6 inline mr-2"></i>' + esc(title) + '</h2>'
      + (sub ? '<p class="text-sm text-gray-500 mt-1">' + esc(sub) + '</p>' : '') + '</div>';
  }
  function btn(onclick, icon, text, cls) {
    return '<button onclick="' + onclick + '" class="px-4 py-2 rounded-xl text-sm inline-flex items-center gap-2 ' + cls + '">'
      + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' + esc(text) + '</button>';
  }
  function badge(text, cls) {
    return '<span class="px-2 py-0.5 rounded-lg text-xs ' + cls + '">' + esc(text) + '</span>';
  }
  function referBadge(v) {
    return s(v) === 'ส่งต่อ'
      ? badge('ส่งต่อให้งานให้คำปรึกษา', 'bg-amber-100 text-amber-700')
      : badge('ไม่ส่งต่อ', 'bg-gray-100 text-gray-600');
  }
  function emptyBox(msg, hint) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-8 text-center">'
      + '<i data-lucide="message-circle" class="w-10 h-10 mx-auto mb-3 text-gray-300"></i>'
      + '<p class="text-gray-500 text-sm">' + esc(msg) + '</p>'
      + (hint ? '<p class="text-xs text-gray-400 mt-1">' + esc(hint) + '</p>' : '') + '</div>';
  }
  function noPerm() {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-8 text-center">'
      + '<i data-lucide="lock" class="w-10 h-10 mx-auto mb-3 text-gray-300"></i>'
      + '<p class="text-gray-500">บทบาทของคุณไม่มีสิทธิ์เข้าหน้านี้</p></div>';
  }
  function selectHTML(o) {
    var cur = o.value == null ? '' : String(o.value);
    return '<div class="' + (o.width || 'min-w-[12rem]') + '">'
      + (o.label ? '<label class="block text-xs font-medium text-gray-600 mb-1">'
        + (o.icon ? '<i data-lucide="' + o.icon + '" class="w-3.5 h-3.5 inline mr-1"></i>' : '')
        + esc(o.label) + (o.req ? ' <span class="text-red-500">*</span>' : '') + '</label>' : '')
      + '<select ' + (o.id ? 'id="' + o.id + '" ' : '') + (o.on ? 'onchange="' + o.on + '" ' : '')
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + (o.options || []).map(function (x) {
        var v = String(x[0]);
        return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
      }).join('') + '</select></div>';
  }

  /* ================================================================
     สถานะของหน้า
     ================================================================ */
  function state() {
    if (!APP._counsel) {
      APP._counsel = {
        search: '', fSem: '', fYear: '', fRefer: '',
        sortKey: 'counsel_date', sortDir: 'desc',
        perPage: 10, page: 1,
        draft: null, editCode: '', dirty: false
      };
    }
    return APP._counsel;
  }
  window.counselSet = function (k, v) {
    var st = state(); st[k] = s(v);
    if (k !== 'page') st.page = 1;
    renderCurrentPage();
  };
  window.counselPage = function (p) { state().page = Math.max(1, parseInt(p, 10) || 1); renderCurrentPage(); };
  window.counselSort = function (k) {
    var st = state();
    if (st.sortKey === k) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
    else { st.sortKey = k; st.sortDir = 'asc'; }
    renderCurrentPage();
  };

  /* ================================================================
     1) หน้ารายการให้คำปรึกษา
     ================================================================ */
  function listPage() {
    if (!canUse()) return noPerm();
    var st = state();

    var rows = sessions().slice();
    if (st.search) {
      var q = st.search.toLowerCase();
      rows = rows.filter(function (x) { return s(x.topic).toLowerCase().indexOf(q) >= 0; });
    }
    if (st.fSem) rows = rows.filter(function (x) { return s(x.semester) === st.fSem; });
    if (st.fYear) rows = rows.filter(function (x) { return s(x.academic_year) === st.fYear; });
    if (st.fRefer) rows = rows.filter(function (x) { return s(x.refer_status) === st.fRefer; });

    rows.sort(function (a, b) {
      var k = st.sortKey, va = s(a[k]), vb = s(b[k]);
      if (k === 'duration_min') { va = num(a[k]); vb = num(b[k]); return st.sortDir === 'asc' ? va - vb : vb - va; }
      var r = va.localeCompare(vb, 'th');
      return st.sortDir === 'asc' ? r : -r;
    });

    var total = rows.length;
    var per = num(st.perPage) || 10;
    var pages = Math.max(1, Math.ceil(total / per));
    if (st.page > pages) st.page = pages;
    var shown = rows.slice((st.page - 1) * per, st.page * per);

    function th(key, label, cls) {
      var on = st.sortKey === key;
      return '<th class="px-3 py-2 font-semibold ' + (cls || '') + '">'
        + '<button onclick="counselSort(\'' + key + '\')" class="inline-flex items-center gap-1 hover:text-primary">'
        + esc(label) + '<i data-lucide="' + (on ? (st.sortDir === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevrons-up-down')
        + '" class="w-3 h-3 ' + (on ? 'text-primary' : 'text-gray-300') + '"></i></button></th>';
    }

    var body = shown.map(function (x, i) {
      var n = (st.page - 1) * per + i + 1;
      var mem = membersOf(x.session_code);
      return '<tr class="border-t border-gray-50 hover:bg-gray-50">'
        + '<td class="px-3 py-2 text-center text-gray-400">' + n + '</td>'
        + '<td class="px-3 py-2"><p class="font-medium text-gray-800">' + esc(s(x.topic) || '(ไม่ระบุเรื่อง)') + '</p>'
        + '<p class="text-xs text-gray-400">' + esc(s(x.advisor_name)) + '</p></td>'
        + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(beDate(x.counsel_date) || '-') + '</td>'
        + '<td class="px-3 py-2 text-center whitespace-nowrap">' + hoursText(x.duration_min) + ' ชม.'
        + '<span class="block text-xs text-gray-400">' + esc(s(x.start_time)) + '–' + esc(s(x.end_time)) + '</span></td>'
        + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(s(x.academic_year) || '-')
        + '<span class="block text-xs text-gray-400">ภาค ' + esc(s(x.semester) || '-') + '</span></td>'
        + '<td class="px-3 py-2 text-center">' + referBadge(x.refer_status) + '</td>'
        + '<td class="px-3 py-2 text-center whitespace-nowrap">'
        + '<span class="text-xs text-gray-500">นักศึกษา ' + mem.length + ' คน</span>'
        + '<button onclick="counselShow(\'' + esc(s(x.session_code)) + '\')" '
        + 'class="ml-2 px-2 py-1 rounded-lg bg-primaryLight text-primary text-xs hover:bg-primary hover:text-white transition">รายละเอียด</button>'
        + (canEdit(x) ? '<button onclick="counselEdit(\'' + esc(s(x.session_code)) + '\')" '
          + 'class="ml-1 p-1 text-gray-400 hover:text-primary" title="แก้ไข"><i data-lucide="pencil" class="w-4 h-4"></i></button>' : '')
        + '</td></tr>';
    }).join('');

    var bar = '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4">'
      + '<div class="flex flex-wrap items-end gap-3">'
      + '<div class="min-w-[16rem] flex-1"><label class="block text-xs font-medium text-gray-600 mb-1">'
      + '<i data-lucide="search" class="w-3.5 h-3.5 inline mr-1"></i>ค้นหาจากเรื่องที่ให้คำปรึกษา</label>'
      + '<input value="' + esc(st.search) + '" oninput="counselSearch(this.value)" placeholder="พิมพ์คำที่ต้องการค้นหา" '
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + selectHTML({
        label: 'ภาคการศึกษา', icon: 'layers', value: st.fSem, on: "counselSet('fSem',this.value)",
        options: [['', 'ทุกภาค']].concat(SEMS)
      })
      + selectHTML({
        label: 'ปีการศึกษา', icon: 'calendar', value: st.fYear, on: "counselSet('fYear',this.value)",
        options: [['', 'ทุกปี']].concat(yearsList().map(function (y) { return [y, y]; }))
      })
      + selectHTML({
        label: 'สถานะส่งต่อ', icon: 'share-2', value: st.fRefer, on: "counselSet('fRefer',this.value)",
        options: [['', 'ทั้งหมด'], ['ไม่ส่งต่อ', 'ไม่ส่งต่อ'], ['ส่งต่อ', 'ส่งต่อให้งานให้คำปรึกษา']]
      })
      + selectHTML({
        label: 'ต่อหน้า', icon: 'list', value: String(st.perPage), on: "counselSet('perPage',this.value)",
        width: 'min-w-[7rem]', options: [['10', '10'], ['25', '25'], ['50', '50'], ['100', '100']]
      })
      + '</div></div>';

    var pager = pages > 1
      ? '<div class="flex flex-wrap items-center justify-between gap-2 mt-3">'
      + '<p class="text-xs text-gray-500">แสดง ' + ((st.page - 1) * per + 1) + '–' + Math.min(st.page * per, total) + ' จาก ' + total + ' รายการ</p>'
      + '<div class="flex gap-1">'
      + '<button onclick="counselPage(' + (st.page - 1) + ')" ' + (st.page <= 1 ? 'disabled ' : '')
      + 'class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm ' + (st.page <= 1 ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-50') + '">ก่อนหน้า</button>'
      + '<span class="px-3 py-1.5 text-sm text-gray-600">หน้า ' + st.page + ' / ' + pages + '</span>'
      + '<button onclick="counselPage(' + (st.page + 1) + ')" ' + (st.page >= pages ? 'disabled ' : '')
      + 'class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm ' + (st.page >= pages ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-50') + '">ถัดไป</button>'
      + '</div></div>' : '';

    var head = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '<div><h2 class="text-xl font-bold text-gray-800">'
      + '<i data-lucide="heart-handshake" class="w-6 h-6 inline mr-2"></i>ระบบให้คำปรึกษา</h2>'
      + '<p class="text-sm text-gray-500 mt-1">'
      + (seesAll() ? 'เห็นบันทึกของอาจารย์ทุกท่าน'
        : isReferralStaff() ? 'เห็นเฉพาะรายการที่ส่งต่อมาให้งานให้คำปรึกษา'
          : 'บันทึกของคุณ · เลือกได้เฉพาะนักศึกษาในที่ปรึกษาของคุณ (' + myStudents().length + ' คน)')
      + '</p></div>'
      + '<div class="flex flex-wrap gap-2">'
      + (isAdvisorRole() || seesAll()
        ? btn('counselEdit(\'\')', 'plus', 'เพิ่มการให้คำปรึกษา', 'bg-primary text-white hover:bg-primaryDark') : '')
      + btn('navigateTo(\'dashboard\')', 'arrow-left', 'กลับ', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + '</div></div>';

    if (!total) {
      return head + bar + emptyBox('ยังไม่มีข้อมูลการให้คำปรึกษา',
        (isAdvisorRole() && !myStudents().length)
          ? 'ยังไม่พบนักศึกษาที่คุณเป็นอาจารย์ที่ปรึกษา กรุณาติดต่องานทะเบียน'
          : 'กดปุ่ม "เพิ่มการให้คำปรึกษา" เพื่อบันทึกรายการแรก');
    }

    return head + bar
      + '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden"><div class="overflow-x-auto">'
      + '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
      + th('topic', 'เรื่องที่ให้คำปรึกษา')
      + th('counsel_date', 'วันที่ให้คำปรึกษา', 'text-center')
      + th('duration_min', 'เวลา (ชั่วโมง)', 'text-center')
      + th('academic_year', 'ปีการศึกษา', 'text-center')
      + th('refer_status', 'สถานะส่งต่อ', 'text-center')
      + '<th class="px-3 py-2 font-semibold text-center">ข้อมูลการให้คำปรึกษา</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div></div>' + pager;
  }

  // พิมพ์ค้นหาแล้วไม่วาดใหม่ทั้งหน้า จะได้ไม่เสียโฟกัสในช่อง
  var searchTimer = null;
  window.counselSearch = function (v) {
    var st = state();
    st.search = s(v); st.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { renderCurrentPage(); }, 250);
  };

  /* ================================================================
     2) หน้าต่างข้อมูลประกอบของนักศึกษา 5 ใบ
     ----------------------------------------------------------------
     สี่ใบแรกอ่านจากตารางที่ระบบมีอยู่แล้ว ไม่มีการเก็บข้อมูลซ้ำ
     ================================================================ */
  function stuHead(stu, title, icon, color) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-3">'
      + '<p class="text-xs ' + color + ' font-semibold">' + esc(title) + '</p>'
      + '<p class="text-lg font-bold text-gray-800">' + esc(s(stu.name)) + '</p>'
      + '<div class="flex flex-wrap gap-2 mt-2">'
      + badge('รหัส ' + s(stu.student_id), 'bg-blue-50 text-blue-700')
      + badge('ชั้นปี ' + (s(stu.year_level) || '-'), 'bg-indigo-50 text-indigo-700')
      + '</div></div>';
  }
  function listCard(title, count, rowsHtml, emptyMsg) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-4">'
      + '<div class="flex items-center justify-between mb-2">'
      + '<p class="text-sm font-semibold text-primary">' + esc(title) + '</p>'
      + badge(count + ' รายการ', count ? 'bg-primaryLight text-primary' : 'bg-gray-100 text-gray-500')
      + '</div>'
      + (count ? '<div class="overflow-x-auto">' + rowsHtml + '</div>'
        : '<p class="text-sm text-gray-400">' + esc(emptyMsg) + '</p>') + '</div>';
  }

  // ---- ผลการศึกษา : เรียกหน้าต่างใบแสดงผลการเรียนตัวเดิมของระบบ ----
  window.counselStuGrades = function (sid) {
    var stu = studentById(sid);
    if (!stu) { showToast('ไม่พบข้อมูลนักศึกษา', 'error'); return; }
    if (typeof _renderTranscript === 'function') { _renderTranscript(stu); return; }
    showToast('ยังเปิดใบแสดงผลการเรียนไม่ได้', 'error');
  };

  // ---- ความประพฤติ : ตาราง student_conduct ----
  window.counselStuConduct = function (sid) {
    var stu = studentById(sid); if (!stu) return;
    var rows = get('student_conduct').filter(function (x) { return s(x.student_id) === s(sid); })
      .sort(function (a, b) { return s(b.conduct_date).localeCompare(s(a.conduct_date)); });
    var table = '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
      + '<th class="px-3 py-2 font-semibold">ประเภท</th>'
      + '<th class="px-3 py-2 font-semibold">รายละเอียด</th>'
      + '<th class="px-3 py-2 font-semibold">การดำเนินการ</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ภาค/ปีการศึกษา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">วันที่บันทึก</th></tr></thead><tbody>'
      + rows.map(function (x, i) {
        return '<tr class="border-t border-gray-50">'
          + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
          + '<td class="px-3 py-2">' + esc(s(x.conduct_type) || '-') + '</td>'
          + '<td class="px-3 py-2">' + esc(s(x.detail) || '-') + '</td>'
          + '<td class="px-3 py-2">' + esc(s(x.action_taken) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(s(x.semester) || '-') + '/' + esc(s(x.academic_year) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(beDate(x.conduct_date) || '-') + '</td></tr>';
      }).join('') + '</tbody></table>';
    showModal('ข้อมูลความประพฤติ',
      stuHead(stu, 'ข้อมูลความประพฤติ', 'wrench', 'text-primary')
      + listCard('รายการความประพฤติ', rows.length, table, 'ไม่มีข้อมูลความประพฤติ'), null, 'max-w-4xl');
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 50);
  };

  // ---- การลา/ขาดเรียน : ตาราง leave เดิม ----
  function leavesOf(sid) {
    var stu = studentById(sid);
    var nm = stu ? s(stu.name) : '';
    return get('leave').filter(function (x) {
      return (s(x.student_id) && s(x.student_id) === s(sid)) || (nm && s(x.name) === nm);
    }).sort(function (a, b) { return s(b.leave_date).localeCompare(s(a.leave_date)); });
  }
  function leaveTable(rows) {
    return '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
      + '<th class="px-3 py-2 font-semibold">ประเภทการลา</th>'
      + '<th class="px-3 py-2 font-semibold">รายวิชา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ชั่วโมง</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ภาค/ปีการศึกษา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">วันที่ลา</th></tr></thead><tbody>'
      + rows.map(function (x, i) {
        return '<tr class="border-t border-gray-50">'
          + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
          + '<td class="px-3 py-2">' + esc(s(x.leave_type) || '-') + '</td>'
          + '<td class="px-3 py-2">' + esc(s(x.subject_name) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center">' + esc(s(x.leave_hours) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(s(x.semester) || '-') + '/' + esc(s(x.academic_year) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">'
          + esc((typeof toBuddhistDateList === 'function' ? toBuddhistDateList(x.leave_date) : s(x.leave_date)) || '-')
          + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  window.counselStuLeave = function (sid) {
    var stu = studentById(sid); if (!stu) return;
    var rows = leavesOf(sid);
    showModal('ข้อมูลการลา/ขาดเรียน รายบุคคล',
      stuHead(stu, 'ข้อมูลการลา/ขาดเรียน รายบุคคล', 'calendar-off', 'text-primary')
      + listCard('รายการลา/ขาดเรียน', rows.length, leaveTable(rows), 'ไม่มีข้อมูลการลา/ขาดเรียน'), null, 'max-w-4xl');
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 50);
  };

  // ---- การเจ็บป่วย : ตาราง leave เดิม เฉพาะลาป่วย/ลาพบแพทย์ (มีใบรับรองแพทย์แนบอยู่แล้ว) ----
  window.counselStuIllness = function (sid) {
    var stu = studentById(sid); if (!stu) return;
    var rows = leavesOf(sid).filter(function (x) {
      var t = s(x.leave_type);
      return t.indexOf('ป่วย') >= 0 || t.indexOf('แพทย์') >= 0;
    });
    showModal('ข้อมูลการเจ็บป่วย',
      stuHead(stu, 'ข้อมูลการเจ็บป่วย', 'briefcase-medical', 'text-primary')
      + listCard('รายการเจ็บป่วย/ปัญหาสุขภาพ', rows.length, leaveTable(rows), 'ไม่มีข้อมูลการเจ็บป่วย')
      + '<p class="text-xs text-gray-400 mt-2">ดึงจากใบลาประเภทลาป่วยและลาพบแพทย์ในระบบการลา '
      + 'จึงไม่ต้องบันทึกซ้ำอีกที่หนึ่ง</p>', null, 'max-w-4xl');
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 50);
  };

  // ---- สบช.โมเดล : ตาราง student_health ----
  // BMI คำนวณตอนแสดงผลจากส่วนสูงและน้ำหนัก ไม่เก็บซ้ำในฐานข้อมูล
  function bmiOf(h, w) {
    var hm = num(h), kg = num(w);
    if (!hm || !kg) return null;
    if (hm > 3) hm = hm / 100;               // เผลอกรอกเป็นเซนติเมตร
    return Math.round(kg / (hm * hm) * 100) / 100;
  }
  window.counselStuHealth = function (sid) {
    var stu = studentById(sid); if (!stu) return;
    var rows = get('student_health').filter(function (x) { return s(x.student_id) === s(sid); })
      .sort(function (a, b) { return s(a.record_date).localeCompare(s(b.record_date)); });
    var table = '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ส่วนสูง/น้ำหนัก/BMI</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ค่าน้ำตาลในเลือด</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ชีพจร</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ความดัน</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ภาคการศึกษา/ปีการศึกษา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">วันที่บันทึก</th></tr></thead><tbody>'
      + rows.map(function (x, i) {
        var b = bmiOf(x.height_m, x.weight_kg);
        return '<tr class="border-t border-gray-50">'
          + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">'
          + esc(s(x.height_m) || '-') + '/' + esc(s(x.weight_kg) || '-') + '/' + (b == null ? '-' : b.toFixed(2)) + '</td>'
          + '<td class="px-3 py-2 text-center">' + esc(s(x.blood_sugar) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center">' + esc(s(x.pulse) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">'
          + esc(s(x.bp_systolic) || '-') + '/' + esc(s(x.bp_diastolic) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(s(x.semester) || '-') + '/' + esc(s(x.academic_year) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">' + esc(beDate(x.record_date) || '-') + '</td></tr>';
      }).join('') + '</tbody></table>';
    showModal('ข้อมูล สบช.โมเดล',
      stuHead(stu, 'ข้อมูล สบช.โมเดล', 'heart-pulse', 'text-primary')
      + listCard('รายการสุขภาพ', rows.length, table, 'ยังไม่มีข้อมูล สบช.โมเดล')
      + '<p class="text-xs text-gray-400 mt-2">BMI คำนวณจากส่วนสูงและน้ำหนักที่บันทึกไว้ '
      + 'ระบบเก็บเฉพาะค่าที่วัดได้ ไม่มีการให้คะแนนหรือตัดเกณฑ์ใด ๆ</p>', null, 'max-w-4xl');
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 50);
  };

  /* รูปนักศึกษา — ใช้รูปโปรไฟล์ที่นักศึกษาอัปโหลดเอง ถ้ายังไม่มีให้ขึ้นเป็นกรอบว่าง */
  function stuPhoto(sid) {
    var url = '';
    try {
      if (typeof window.emsProfilePhotoOf === 'function') url = s(window.emsProfilePhotoOf(sid));
    } catch (e) { /* ไม่มีก็ไม่เป็นไร */ }
    return url
      ? '<img src="' + esc(url) + '" alt="" class="w-12 h-12 rounded-lg object-cover border border-gray-200">'
      : '<div class="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center" title="ยังไม่มีรูป">'
      + '<i data-lucide="user" class="w-6 h-6 text-gray-300"></i></div>';
  }

  /* แถวนักศึกษาหนึ่งคน — ใช้ร่วมกันทั้งตารางแยกชั้นปีและตารางเฉพาะราย */
  function stuRow(stu, opts) {
    opts = opts || {};
    var sid = s(stu.student_id);
    var g = gpaOfStudent(sid);
    function info(fn, label) {
      return '<td class="px-2 py-2 text-center">'
        + '<button type="button" onclick="' + fn + '(\'' + esc(sid) + '\')" '
        + 'class="px-2 py-1 rounded-lg bg-primaryLight text-primary text-xs hover:bg-primary hover:text-white transition whitespace-nowrap">'
        + 'รายละเอียด</button></td>';
    }
    return '<tr class="border-t border-gray-50 hover:bg-gray-50">'
      + (opts.pick
        ? '<td class="px-2 py-2 text-center"><input type="checkbox" class="rounded cs-pick" value="' + esc(sid) + '"'
        + (opts.checked ? ' checked' : '') + ' onchange="counselCount()"></td>'
        : '<td class="px-2 py-2 text-center text-gray-400">' + (opts.index || '') + '</td>')
      + '<td class="px-2 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">' + esc(sid) + '</td>'
      + '<td class="px-2 py-2 whitespace-nowrap">' + esc(s(stu.name)) + '</td>'
      + '<td class="px-2 py-2 text-center font-semibold ' + (g != null && g < 2.30 ? 'text-red-600' : 'text-gray-800') + '">'
      + (g == null ? '-' : g.toFixed(2)) + '</td>'
      + info('counselStuGrades') + info('counselStuConduct') + info('counselStuLeave')
      + info('counselStuIllness') + info('counselStuHealth')
      + '<td class="px-2 py-2 text-center">' + stuPhoto(sid) + '</td>'
      + (opts.remove
        ? '<td class="px-2 py-2 text-center"><button type="button" onclick="counselDropOne(\'' + esc(sid) + '\')" '
        + 'class="px-2 py-1 rounded-lg bg-red-50 text-red-600 text-xs hover:bg-red-600 hover:text-white transition">ลบ</button></td>'
        : '')
      + '</tr>';
  }
  function stuTableHead(opts) {
    opts = opts || {};
    return '<thead><tr class="bg-surface text-left">'
      + '<th class="px-2 py-2 font-semibold text-center">' + (opts.pick ? '#' : 'ลำดับ') + '</th>'
      + '<th class="px-2 py-2 font-semibold">รหัสนักศึกษา</th>'
      + '<th class="px-2 py-2 font-semibold">ชื่อ–สกุล</th>'
      + '<th class="px-2 py-2 font-semibold text-center">GPA</th>'
      + '<th class="px-2 py-2 font-semibold text-center">ข้อมูลผลการศึกษา</th>'
      + '<th class="px-2 py-2 font-semibold text-center">ข้อมูลความประพฤติ</th>'
      + '<th class="px-2 py-2 font-semibold text-center">ข้อมูลการลา/ขาดเรียน รายบุคคล</th>'
      + '<th class="px-2 py-2 font-semibold text-center">ข้อมูลการเจ็บป่วย</th>'
      + '<th class="px-2 py-2 font-semibold text-center">ข้อมูล สบช.โมเดล</th>'
      + '<th class="px-2 py-2 font-semibold text-center">รูป</th>'
      + (opts.remove ? '<th class="px-2 py-2 font-semibold text-center">ลบ</th>' : '')
      + '</tr></thead>';
  }

  /* ================================================================
     3) หน้าเพิ่ม / แก้ไขการให้คำปรึกษา
     ================================================================ */
  function newCode() { return 'CS' + Date.now().toString(36).toUpperCase(); }

  function draftOf(code) {
    var st = state();
    if (st.draft && st.draft.__code === s(code)) return st.draft;
    var row = code ? sessionByCode(code) : null;
    st.draft = row ? {
      __code: s(code), __new: false,
      session_code: s(row.session_code),
      counsel_date: s(row.counsel_date), start_time: s(row.start_time), end_time: s(row.end_time),
      semester: s(row.semester), academic_year: s(row.academic_year), topic: s(row.topic),
      issues: s(row.issue_types).split(',').map(s).filter(Boolean),
      issue_other: s(row.issue_other), channel: s(row.channel), result_note: s(row.result_note),
      refer_status: s(row.refer_status) || 'ไม่ส่งต่อ', refer_to: s(row.refer_to), refer_reason: s(row.refer_reason),
      picked: membersOf(code).map(function (m) {
        return { student_id: s(m.student_id), source: s(m.source) || 'year', private_note: s(m.private_note) };
      })
    } : {
      __code: '', __new: true,
      session_code: newCode(),
      counsel_date: todayISO(), start_time: '', end_time: '',
      semester: '1', academic_year: curYearBE(), topic: '',
      issues: [], issue_other: '', channel: '', result_note: '',
      refer_status: 'ไม่ส่งต่อ', refer_to: '', refer_reason: '',
      picked: []
    };
    st.dirty = false;
    return st.draft;
  }

  function pickedIds(d) { return d.picked.map(function (x) { return x.student_id; }); }
  function isPicked(d, sid) { return pickedIds(d).indexOf(s(sid)) >= 0; }

  window.counselField = function (k, v) {
    var d = state().draft; if (!d) return;
    d[k] = s(v); state().dirty = true;
    if (k === 'start_time' || k === 'end_time') updateDuration();
  };
  window.counselFieldR = function (k, v) { window.counselField(k, v); renderCurrentPage(); };

  window.counselIssue = function (code, on) {
    var d = state().draft; if (!d) return;
    var i = d.issues.indexOf(s(code));
    if (on && i < 0) d.issues.push(s(code));
    if (!on && i >= 0) d.issues.splice(i, 1);
    state().dirty = true;
    renderCurrentPage();
  };

  /* คำนวณระยะเวลาโดยไม่วาดหน้าใหม่ — ผู้ใช้กำลังพิมพ์อยู่ */
  function updateDuration() {
    var d = state().draft; if (!d) return;
    var box = document.getElementById('csDuration');
    if (!box) return;
    var m = minutesBetween(d.start_time, d.end_time);
    if (m == null) { box.textContent = '—'; box.className = 'text-sm text-gray-400'; return; }
    if (m <= 0) { box.textContent = 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม'; box.className = 'text-sm text-red-600 font-medium'; return; }
    box.textContent = m + ' นาที (' + (m / 60).toFixed(2) + ' ชั่วโมง)';
    box.className = 'text-sm text-primary font-semibold';
  }

  window.counselPickAll = function (year, on) {
    var d = state().draft; if (!d) return;
    studentsByYear(year).forEach(function (stu) {
      var sid = s(stu.student_id);
      var i = pickedIds(d).indexOf(sid);
      if (on && i < 0) d.picked.push({ student_id: sid, source: 'year', private_note: '' });
      if (!on && i >= 0) d.picked.splice(i, 1);
    });
    state().dirty = true;
    renderCurrentPage();
  };
  window.counselToggleOne = function (sid, on) {
    var d = state().draft; if (!d) return;
    var i = pickedIds(d).indexOf(s(sid));
    if (on && i < 0) d.picked.push({ student_id: s(sid), source: 'year', private_note: '' });
    if (!on && i >= 0) d.picked.splice(i, 1);
    state().dirty = true;
    counselCount();
  };
  window.counselDropOne = function (sid) {
    var d = state().draft; if (!d) return;
    var i = pickedIds(d).indexOf(s(sid));
    if (i >= 0) d.picked.splice(i, 1);
    state().dirty = true;
    renderCurrentPage();
  };
  // เพิ่มเฉพาะราย — กันชื่อซ้ำทั้งกับที่เลือกจากชั้นปีและในรายการเฉพาะรายเอง
  window.counselAddOne = function () {
    var d = state().draft; if (!d) return;
    var inp = document.getElementById('csAddStudent');
    var sid = s(inp && inp.value);
    if (!sid) { showToast('กรุณาเลือกนักศึกษาก่อน', 'error'); return; }
    var stu = myStudents().filter(function (x) { return s(x.student_id) === sid; })[0];
    if (!stu) { showToast('ไม่พบนักศึกษารหัสนี้ในรายชื่อที่คุณเป็นที่ปรึกษา', 'error'); return; }
    if (isPicked(d, sid)) { showToast('นักศึกษารายนี้ถูกเลือกไว้แล้ว', 'error'); return; }
    d.picked.push({ student_id: sid, source: 'specific', private_note: '' });
    state().dirty = true;
    if (inp) inp.value = '';
    renderCurrentPage();
  };
  window.counselCount = function () {
    var d = state().draft; if (!d) return;
    // อ่านสถานะติ๊กจริงบนหน้าจอกลับเข้าร่าง แล้วขยับเลขนับอย่างเดียว ไม่วาดใหม่ทั้งหน้า
    var boxes = document.querySelectorAll('input.cs-pick');
    if (boxes && boxes.forEach) {
      boxes.forEach(function (c) {
        var sid = s(c.value), i = pickedIds(d).indexOf(sid);
        if (c.checked && i < 0) d.picked.push({ student_id: sid, source: 'year', private_note: '' });
        if (!c.checked && i >= 0 && d.picked[i].source !== 'specific') d.picked.splice(i, 1);
      });
    }
    state().dirty = true;
    YEARS.forEach(function (y) {
      var el = document.getElementById('csCount' + y);
      if (!el) return;
      var n = studentsByYear(y).filter(function (x) { return isPicked(d, x.student_id); }).length;
      el.textContent = n + ' / ' + studentsByYear(y).length + ' คน';
    });
    var tot = document.getElementById('csTotalPicked');
    if (tot) tot.textContent = d.picked.length;
  };

  function yearBlock(d, y) {
    var list = studentsByYear(y);
    var nPicked = list.filter(function (x) { return isPicked(d, x.student_id); }).length;
    if (!list.length) {
      return '<details class="bg-white rounded-2xl border border-blue-100 mb-3"><summary class="px-4 py-3 cursor-pointer text-sm">'
        + '<span class="font-semibold text-gray-700">ชั้นปีที่ ' + y + '</span> '
        + '<span class="text-gray-400">— ไม่มีนักศึกษาในที่ปรึกษาของคุณ</span></summary></details>';
    }
    return '<details class="bg-white rounded-2xl border border-blue-100 mb-3"' + (nPicked ? ' open' : '') + '>'
      + '<summary class="px-4 py-3 cursor-pointer flex flex-wrap items-center justify-between gap-2">'
      + '<span class="font-semibold text-gray-800 text-sm">ชั้นปีที่ ' + y
      + ' <span class="font-normal text-gray-400">(' + list.length + ' คน)</span></span>'
      + '<span class="flex items-center gap-2">'
      + '<span id="csCount' + y + '" class="text-xs text-primary font-semibold">' + nPicked + ' / ' + list.length + ' คน</span>'
      + '<button type="button" onclick="event.preventDefault();counselPickAll(\'' + y + '\',true)" '
      + 'class="px-2 py-1 rounded-lg bg-primaryLight text-primary text-xs">เลือกทั้งหมด</button>'
      + '<button type="button" onclick="event.preventDefault();counselPickAll(\'' + y + '\',false)" '
      + 'class="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs">ยกเลิกทั้งหมด</button>'
      + '</span></summary>'
      + '<div class="overflow-x-auto border-t border-gray-100"><table class="w-full text-sm">'
      + stuTableHead({ pick: true }) + '<tbody>'
      + list.map(function (stu) { return stuRow(stu, { pick: true, checked: isPicked(d, stu.student_id) }); }).join('')
      + '</tbody></table></div></details>';
  }

  function editPage() {
    if (!canUse()) return noPerm();
    var st = state();
    var d = draftOf(st.editCode);
    if (st.editCode && !sessionByCode(st.editCode)) return noPerm();
    if (!st.editCode && !(isAdvisorRole() || seesAll())) return noPerm();

    var mins = minutesBetween(d.start_time, d.end_time);
    var durText = mins == null ? '—'
      : mins <= 0 ? 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม'
        : mins + ' นาที (' + (mins / 60).toFixed(2) + ' ชั่วโมง)';
    var durCls = mins == null ? 'text-sm text-gray-400'
      : mins <= 0 ? 'text-sm text-red-600 font-medium' : 'text-sm text-primary font-semibold';

    var saveBar = '<div class="flex flex-wrap gap-2">'
      + btn('counselSave()', 'save', 'บันทึก', 'bg-primary text-white hover:bg-primaryDark')
      + btn('counselBack()', 'arrow-left', 'กลับ', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + '</div>';

    // ---------- ข้อมูลทั่วไป ----------
    var general = '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-3">ข้อมูลทั่วไป</p>'
      + '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">'
      + '<div><label class="block text-xs font-medium text-gray-600 mb-1">วันที่ให้คำปรึกษา <span class="text-red-500">*</span></label>'
      + '<input type="date" value="' + esc(d.counsel_date) + '" onchange="counselFieldR(\'counsel_date\',this.value)" '
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + '<p class="text-xs text-gray-400 mt-1">' + (d.counsel_date ? 'ตรงกับ ' + esc(beDate(d.counsel_date)) + ' (พ.ศ.)' : '&nbsp;') + '</p></div>'
      + '<div><label class="block text-xs font-medium text-gray-600 mb-1">เวลาเริ่ม <span class="text-red-500">*</span></label>'
      + '<input type="time" value="' + esc(d.start_time) + '" onchange="counselField(\'start_time\',this.value)" '
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '<div><label class="block text-xs font-medium text-gray-600 mb-1">เวลาสิ้นสุด <span class="text-red-500">*</span></label>'
      + '<input type="time" value="' + esc(d.end_time) + '" onchange="counselField(\'end_time\',this.value)" '
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + selectHTML({
        label: 'ภาคการศึกษา', req: true, value: d.semester, on: "counselField('semester',this.value)",
        options: SEMS, width: ''
      })
      + '<div><label class="block text-xs font-medium text-gray-600 mb-1">ปีการศึกษา (พ.ศ.) <span class="text-red-500">*</span></label>'
      + '<input value="' + esc(d.academic_year) + '" onchange="counselField(\'academic_year\',this.value)" '
      + 'placeholder="เช่น ' + curYearBE() + '" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '<div><label class="block text-xs font-medium text-gray-600 mb-1">ระยะเวลา</label>'
      + '<div id="csDuration" class="' + durCls + ' px-3 py-2">' + esc(durText) + '</div>'
      + '<p class="text-xs text-gray-400">คำนวณให้อัตโนมัติ · รุ่นแรกรองรับการให้คำปรึกษาภายในวันเดียว</p></div>'
      + '</div>'
      + '<div class="mt-3"><label class="block text-xs font-medium text-gray-600 mb-1">เรื่องการให้คำปรึกษา <span class="text-red-500">*</span></label>'
      + '<input value="' + esc(d.topic) + '" onchange="counselField(\'topic\',this.value)" '
      + 'placeholder="เช่น ติดตามผลการเรียนภาคการศึกษาที่ผ่านมา" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '</div>';

    // ---------- ประเภทประเด็นปัญหา ----------
    var hasOther = d.issues.indexOf('other') >= 0;
    var issueBox = '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-1">ประเภทประเด็นปัญหา <span class="text-red-500">*</span></p>'
      + '<p class="text-xs text-gray-500 mb-3">เลือกได้มากกว่าหนึ่งข้อ</p>'
      + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">'
      + options('issue').map(function (o) {
        var on = d.issues.indexOf(s(o.code)) >= 0;
        return '<label class="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-surface text-sm cursor-pointer">'
          + '<input type="checkbox" class="rounded mt-0.5"' + (on ? ' checked' : '')
          + ' onchange="counselIssue(\'' + esc(s(o.code)) + '\',this.checked)">'
          + '<span class="text-gray-800">' + esc(s(o.label)) + '</span></label>';
      }).join('') + '</div>'
      + (hasOther
        ? '<div class="mt-3"><label class="block text-xs font-medium text-gray-600 mb-1">ระบุรายละเอียด "อื่น ๆ" <span class="text-red-500">*</span></label>'
        + '<input value="' + esc(d.issue_other) + '" onchange="counselField(\'issue_other\',this.value)" '
        + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>' : '')
      + '</div>';

    // ---------- ช่องทาง + ผลการให้คำปรึกษา ----------
    var midBox = '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">'
      + selectHTML({
        label: 'ช่องทางการให้คำปรึกษา', req: true, value: d.channel, on: "counselField('channel',this.value)",
        width: '', options: [['', '— เลือกช่องทาง —']].concat(options('channel').map(function (o) { return [s(o.code), s(o.label)]; }))
      })
      + '<div class="lg:col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">'
      + 'บันทึกผลการให้คำปรึกษา/การช่วยเหลือ <span class="text-red-500">*</span></label>'
      + '<textarea rows="4" onchange="counselField(\'result_note\',this.value)" '
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">' + esc(d.result_note) + '</textarea>'
      + '<p class="text-xs text-gray-400 mt-1">เป็นผลร่วมของการให้คำปรึกษาครั้งนี้ '
      + 'บันทึกเฉพาะรายบุคคลใส่แยกได้ในตารางรายชื่อด้านล่าง</p></div>'
      + '</div></div>';

    // ---------- การจัดการปัญหา ----------
    var referOn = s(d.refer_status) === 'ส่งต่อ';
    var referBox = '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-3">การจัดการปัญหา <span class="text-red-500">*</span></p>'
      + '<div class="flex flex-wrap gap-4">'
      + ['ไม่ส่งต่อ', 'ส่งต่อ'].map(function (v) {
        return '<label class="flex items-center gap-2 text-sm cursor-pointer">'
          + '<input type="radio" name="csRefer" value="' + v + '"' + (s(d.refer_status) === v ? ' checked' : '')
          + ' onchange="counselFieldR(\'refer_status\',this.value)">'
          + '<span class="text-gray-800">' + (v === 'ส่งต่อ' ? 'ส่งต่อให้งานให้คำปรึกษา' : 'ไม่ส่งต่อ') + '</span></label>';
      }).join('') + '</div>'
      + (referOn
        ? '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">'
        + '<div><label class="block text-xs font-medium text-gray-600 mb-1">หน่วยงาน/ผู้รับผิดชอบ <span class="text-red-500">*</span></label>'
        + '<input value="' + esc(d.refer_to) + '" onchange="counselField(\'refer_to\',this.value)" '
        + 'placeholder="เช่น งานกิจการนักศึกษา" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
        + '<div><label class="block text-xs font-medium text-gray-600 mb-1">เหตุผลการส่งต่อ <span class="text-red-500">*</span></label>'
        + '<input value="' + esc(d.refer_reason) + '" onchange="counselField(\'refer_reason\',this.value)" '
        + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div></div>' : '')
      + '</div>';

    // ---------- เลือกนักศึกษา ----------
    // ตารางล่างเป็น "สรุปรายชื่อที่เลือกแล้ว" ของทุกคน ไม่ว่าจะติ๊กจากชั้นปีหรือเพิ่มทีละคน
    // ถ้าแยกเป็นอีกรายการหนึ่ง นักศึกษาคนเดียวจะปรากฏสองที่ ผู้ใช้จะนึกว่าเลือกซ้ำ
    var specific = d.picked.slice();
    var addable = myStudents().filter(function (x) { return !isPicked(d, x.student_id); });
    var specBox = '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-1">รายชื่อนักศึกษาที่เลือกแล้ว</p>'
      + '<p class="text-xs text-gray-500 mb-3">ค้นหาเพิ่มทีละคนด้วยรหัสหรือชื่อได้ที่ช่องด้านล่าง · คนที่เลือกไว้แล้วจะไม่ขึ้นในช่องค้นหา · กดลบเพื่อเอาออกจากการให้คำปรึกษาครั้งนี้ ไม่ได้ลบนักศึกษาออกจากระบบ</p>'
      + '<div class="flex flex-wrap gap-2 mb-3">'
      + '<select id="csAddStudent" class="flex-1 min-w-[16rem] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + '<option value="">— ค้นหาและเลือกนักศึกษา —</option>'
      + addable.map(function (x) {
        return '<option value="' + esc(s(x.student_id)) + '">' + esc(s(x.student_id) + ' · ' + s(x.name) + ' (ชั้นปี ' + (s(x.year_level) || '-') + ')') + '</option>';
      }).join('') + '</select>'
      + '<button type="button" onclick="counselAddOne()" class="px-4 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primaryDark">เพิ่มรายชื่อ</button>'
      + '</div>'
      + (specific.length
        ? '<div class="overflow-x-auto"><table class="w-full text-sm">' + stuTableHead({ remove: true }) + '<tbody>'
        + specific.map(function (p, i) {
          var stu = studentById(p.student_id) || { student_id: p.student_id, name: '(ไม่พบในทะเบียน)' };
          return stuRow(stu, { index: i + 1, remove: true, source: p.source });
        }).join('') + '</tbody></table></div>'
        : '<p class="text-sm text-gray-400">ยังไม่ได้เลือกนักศึกษา · ติ๊กจากรายชื่อแยกชั้นปีด้านบน หรือค้นหาเพิ่มทีละคนที่ช่องด้านบน</p>')
      + '</div>';

    var pickBox = '<div class="mb-2 flex flex-wrap items-center justify-between gap-2">'
      + '<p class="font-semibold text-gray-800 text-sm">เลือกนักศึกษาที่รับคำปรึกษา <span class="text-red-500">*</span></p>'
      + '<p class="text-xs text-gray-500">เลือกแล้ว <span id="csTotalPicked" class="text-primary font-semibold">' + d.picked.length + '</span> คน</p></div>'
      + YEARS.map(function (y) { return yearBlock(d, y); }).join('');

    return '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '<div><h2 class="text-xl font-bold text-gray-800">'
      + '<i data-lucide="heart-handshake" class="w-6 h-6 inline mr-2"></i>'
      + (d.__new ? 'เพิ่มการให้คำปรึกษา' : 'แก้ไขการให้คำปรึกษา') + '</h2>'
      + '<p class="text-sm text-gray-500 mt-1">รหัสรายการ ' + esc(d.session_code)
      + ' · ผู้บันทึก ' + esc(me() || '-') + '</p></div>' + saveBar + '</div>'
      + general + issueBox + midBox + referBox + pickBox + specBox
      + '<div class="flex justify-end">' + saveBar + '</div>';
  }

  /* ================================================================
     4) ตรวจสอบและบันทึก
     ================================================================ */
  function validate(d) {
    var err = [];
    if (!s(d.counsel_date)) err.push('ระบุวันที่ให้คำปรึกษา');
    if (!s(d.start_time)) err.push('ระบุเวลาเริ่ม');
    if (!s(d.end_time)) err.push('ระบุเวลาสิ้นสุด');
    var m = minutesBetween(d.start_time, d.end_time);
    if (s(d.start_time) && s(d.end_time)) {
      if (m == null) err.push('รูปแบบเวลาไม่ถูกต้อง');
      else if (m <= 0) err.push('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม (รุ่นแรกรองรับภายในวันเดียว)');
    }
    if (!s(d.semester)) err.push('เลือกภาคการศึกษา');
    if (!s(d.academic_year)) err.push('ระบุปีการศึกษา');
    if (!s(d.topic)) err.push('ระบุเรื่องที่ให้คำปรึกษา');
    if (!d.issues.length) err.push('เลือกประเภทประเด็นปัญหาอย่างน้อยหนึ่งข้อ');
    if (d.issues.indexOf('other') >= 0 && !s(d.issue_other)) err.push('ระบุรายละเอียดของ "อื่น ๆ"');
    if (!s(d.channel)) err.push('เลือกช่องทางการให้คำปรึกษา');
    if (!s(d.result_note)) err.push('กรอกผลการให้คำปรึกษา');
    if (!s(d.refer_status)) err.push('เลือกสถานะการจัดการปัญหา');
    if (s(d.refer_status) === 'ส่งต่อ') {
      if (!s(d.refer_to)) err.push('ระบุหน่วยงาน/ผู้รับผิดชอบที่ส่งต่อ');
      if (!s(d.refer_reason)) err.push('ระบุเหตุผลการส่งต่อ');
    }
    if (!d.picked.length) err.push('เลือกนักศึกษาอย่างน้อยหนึ่งคน');
    // กันชื่อซ้ำอีกชั้น เผื่อร่างถูกแก้จากหลายทาง
    var seen = {}, dup = 0;
    d.picked.forEach(function (p) { if (seen[p.student_id]) dup++; seen[p.student_id] = 1; });
    if (dup) err.push('มีรายชื่อนักศึกษาซ้ำ ' + dup + ' รายการ');
    return err;
  }

  var saving = false;
  window.counselSave = async function () {
    if (saving) return;
    var st = state(), d = st.draft;
    if (!d) return;
    // อ่านสถานะติ๊กล่าสุดจากหน้าจอก่อน เผื่อผู้ใช้เพิ่งกดแล้วยังไม่ได้วาดใหม่
    try { window.counselCount(); } catch (e) { }

    var err = validate(d);
    if (err.length) {
      showToast('ยังกรอกไม่ครบ · ' + err[0] + (err.length > 1 ? ' (และอีก ' + (err.length - 1) + ' ข้อ)' : ''), 'error');
      return;
    }

    saving = true;
    var btns = document.querySelectorAll('button[onclick="counselSave()"]');
    if (btns && btns.forEach) btns.forEach(function (b) { b.disabled = true; b.classList.add('opacity-60'); });

    try {
      var mins = minutesBetween(d.start_time, d.end_time);
      var payload = {
        type: 'counsel_session',
        session_code: d.session_code,
        counsel_date: d.counsel_date, start_time: d.start_time, end_time: d.end_time,
        duration_min: String(mins),
        semester: d.semester, academic_year: d.academic_year, topic: d.topic,
        issue_types: d.issues.join(','), issue_other: d.issue_other,
        channel: d.channel, result_note: d.result_note,
        refer_status: d.refer_status, refer_to: d.refer_to, refer_reason: d.refer_reason,
        advisor_name: me(), updated_by: me()
      };

      var existing = d.__new ? null : sessionByCode(d.__code);
      var r;
      if (existing) {
        r = await GSheetDB.update(Object.assign({}, existing, payload), { noRefresh: true });
      } else {
        payload.created_by = me();
        r = await GSheetDB.create(payload, { noRefresh: true });
      }
      if (!r || !r.isOk) throw new Error((r && r.error) || 'บันทึกรายการไม่สำเร็จ');

      // ---- รายชื่อนักศึกษา : เทียบของเดิมกับของใหม่ แก้เฉพาะส่วนที่ต่าง ----
      var have = existing ? membersOf(d.__code) : [];
      var keep = {};
      for (var i = 0; i < d.picked.length; i++) {
        var p = d.picked[i];
        var stu = studentById(p.student_id) || {};
        var row = have.filter(function (h) { return s(h.student_id) === s(p.student_id); })[0];
        var mp = {
          type: 'counsel_student', session_code: d.session_code,
          student_id: p.student_id,
          student_name: s(stu.name),
          // ชั้นปี ณ วันให้คำปรึกษา — เก็บไว้เพื่อไม่ให้ประวัติย้อนหลังเปลี่ยนตามการเลื่อนชั้นปี
          year_level: row ? s(row.year_level) : s(stu.year_level),
          source: p.source || 'year',
          private_note: s(p.private_note), updated_by: me()
        };
        if (row) { keep[row.__rowIndex] = 1; await GSheetDB.update(Object.assign({}, row, mp), { noRefresh: true }); }
        else await GSheetDB.create(mp, { noRefresh: true });
      }
      // เอารายชื่อออกจากการให้คำปรึกษาครั้งนี้ ไม่ได้ลบประวัตินักศึกษาออกจากระบบ
      for (var j = 0; j < have.length; j++) {
        if (!keep[have[j].__rowIndex]) await GSheetDB.delete(have[j], { noRefresh: true });
      }

      try {
        await GSheetDB.create({
          type: 'counsel_log', session_code: d.session_code,
          action: existing ? 'แก้ไข' : 'สร้าง',
          detail: 'นักศึกษา ' + d.picked.length + ' คน · ' + hoursText(String(mins)) + ' ชม.',
          acted_by: me()
        }, { noRefresh: true });
      } catch (e) { /* บันทึกประวัติไม่สำเร็จ ไม่ให้ล้มการบันทึกหลัก */ }

      await GSheetDB.refreshTab('counsel_session');
      await GSheetDB.refreshTab('counsel_student');

      st.draft = null; st.dirty = false; st.editCode = '';
      showToast(existing ? 'บันทึกการแก้ไขเรียบร้อย' : 'บันทึกการให้คำปรึกษาเรียบร้อย');
      navigateTo('counselList');
    } catch (e) {
      // ล้มเหลวต้องคงข้อมูลที่กรอกไว้ — ไม่ล้างร่างทิ้ง
      showToast('บันทึกไม่สำเร็จ · ' + (e.message || e), 'error');
    } finally {
      saving = false;
      var bs = document.querySelectorAll('button[onclick="counselSave()"]');
      if (bs && bs.forEach) bs.forEach(function (b) { b.disabled = false; b.classList.remove('opacity-60'); });
    }
  };

  window.counselEdit = function (code) {
    var st = state();
    st.editCode = s(code);
    st.draft = null;
    navigateTo('counselEdit');
  };
  window.counselBack = function () {
    var st = state();
    if (st.dirty && !confirm('ยังมีข้อมูลที่ยังไม่ได้บันทึก ออกจากหน้านี้ใช่หรือไม่')) return;
    st.draft = null; st.dirty = false; st.editCode = '';
    navigateTo('counselList');
  };

  /* ================================================================
     5) หน้าต่างรายละเอียดรายการให้คำปรึกษา
     ================================================================ */
  window.counselShow = function (code) {
    var x = sessionByCode(code);
    if (!x) { showToast('ไม่พบรายการ หรือบัญชีของคุณไม่มีสิทธิ์ดู', 'error'); return; }
    var mem = membersOf(code);
    function row(k, v) {
      return '<div class="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">'
        + '<span class="text-xs text-gray-500 w-40 flex-shrink-0">' + esc(k) + '</span>'
        + '<span class="text-sm text-gray-800 flex-1">' + (v || '<span class="text-gray-400">-</span>') + '</span></div>';
    }
    var issues = s(x.issue_types).split(',').map(s).filter(Boolean)
      .map(function (c) { return optionLabel('issue', c); });
    if (s(x.issue_other)) issues.push('อื่น ๆ: ' + s(x.issue_other));

    var stuTable = mem.length
      ? '<div class="overflow-x-auto"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
      + '<th class="px-3 py-2 font-semibold">รหัสนักศึกษา</th>'
      + '<th class="px-3 py-2 font-semibold">ชื่อ–สกุล</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ชั้นปี ณ วันให้คำปรึกษา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ที่มา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ข้อมูลประกอบ</th></tr></thead><tbody>'
      + mem.map(function (m, i) {
        return '<tr class="border-t border-gray-50">'
          + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
          + '<td class="px-3 py-2 font-mono text-xs text-gray-600">' + esc(s(m.student_id)) + '</td>'
          + '<td class="px-3 py-2">' + esc(s(m.student_name) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center">' + esc(s(m.year_level) || '-') + '</td>'
          + '<td class="px-3 py-2 text-center">'
          + badge(s(m.source) === 'specific' ? 'เฉพาะราย' : 'เลือกจากชั้นปี',
            s(m.source) === 'specific' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600') + '</td>'
          + '<td class="px-3 py-2 text-center whitespace-nowrap">'
          + '<button onclick="counselStuGrades(\'' + esc(s(m.student_id)) + '\')" class="px-2 py-1 rounded-lg bg-primaryLight text-primary text-xs mr-1">ผลการศึกษา</button>'
          + '<button onclick="counselStuHealth(\'' + esc(s(m.student_id)) + '\')" class="px-2 py-1 rounded-lg bg-primaryLight text-primary text-xs">สบช.โมเดล</button>'
          + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<p class="text-sm text-gray-400">ไม่มีรายชื่อนักศึกษา</p>';

    showModal('ข้อมูลการให้คำปรึกษา',
      '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-3">'
      + row('เรื่องที่ให้คำปรึกษา', '<b>' + esc(s(x.topic)) + '</b>')
      + row('วันที่ให้คำปรึกษา', esc(beDate(x.counsel_date)))
      + row('เวลา', esc(s(x.start_time)) + ' – ' + esc(s(x.end_time))
        + ' <span class="text-gray-400">(' + hoursText(x.duration_min) + ' ชั่วโมง)</span>')
      + row('ภาค/ปีการศึกษา', esc(s(x.semester)) + ' / ' + esc(s(x.academic_year)))
      + row('ประเภทประเด็นปัญหา', issues.map(function (t) { return badge(t, 'bg-blue-50 text-blue-700'); }).join(' '))
      + row('ช่องทาง', esc(optionLabel('channel', x.channel)))
      + row('ผู้บันทึก', esc(s(x.advisor_name)))
      + '</div>'
      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-3">'
      + '<p class="text-sm font-semibold text-primary mb-2">ผลการให้คำปรึกษา/การช่วยเหลือ</p>'
      + '<p class="text-sm text-gray-700 whitespace-pre-line">' + esc(s(x.result_note) || '-') + '</p></div>'
      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-3">'
      + '<p class="text-sm font-semibold text-primary mb-2">การจัดการปัญหา</p>'
      + row('สถานะ', referBadge(x.refer_status))
      + (s(x.refer_status) === 'ส่งต่อ'
        ? row('หน่วยงาน/ผู้รับผิดชอบ', esc(s(x.refer_to))) + row('เหตุผลการส่งต่อ', esc(s(x.refer_reason))) : '')
      + '</div>'
      + '<div class="bg-white rounded-2xl border border-blue-100 p-4">'
      + '<p class="text-sm font-semibold text-primary mb-2">นักศึกษาที่รับคำปรึกษา ('
      + mem.length + ' คน)</p>' + stuTable + '</div>',
      null, 'max-w-5xl');
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 50);
  };

  /* ================================================================
     6) ต่อเข้ากับระบบเดิม
     ================================================================ */
  var PAGES = { counselList: listPage, counselEdit: editPage };
  window.counselPages = PAGES;

  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (PAGES[page]) return PAGES[page]();
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      try { addMenu(); } catch (e) { console.warn('เพิ่มเมนู ระบบให้คำปรึกษา ไม่สำเร็จ:', e); }
    };

    function addMenu() {
      if (!canUse()) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-counsel-menu]')) return;

      var here = APP.currentPage;
      var subs = [['counselList', 'รายการให้คำปรึกษา']];
      if (isAdvisorRole() || seesAll()) subs.push(['counselEdit', 'บันทึกการให้คำปรึกษา']);

      var node;
      if (subs.length > 1) {
        var open = subs.some(function (x) { return x[0] === here; });
        node = document.createElement('div');
        node.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
        node.setAttribute('data-counsel-menu', '1');
        node.innerHTML =
          '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
          + '<span class="flex items-center gap-3"><i data-lucide="heart-handshake" class="w-5 h-5 flex-shrink-0"></i>ระบบให้คำปรึกษานักศึกษา</span>'
          + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"' + (open ? ' style="transform:rotate(180deg)"' : '') + '></i>'
          + '</button>'
          + '<div class="dropdown-menu ml-8 mt-1 space-y-1">'
          + subs.map(function (x) {
            var on = here === x[0];
            return '<button onclick="' + (x[0] === 'counselEdit' ? "counselEdit('')" : "navigateTo('" + x[0] + "')") + '" '
              + 'data-page="' + x[0] + '" class="nav-item w-full text-left px-3 py-2 rounded-lg text-sm transition '
              + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-600 hover:bg-surface hover:text-primary') + '">'
              + x[1] + '</button>';
          }).join('')
          + '</div>';
      } else {
        node = document.createElement('button');
        node.setAttribute('onclick', "navigateTo('counselList')");
        node.setAttribute('data-page', 'counselList');
        node.setAttribute('data-counsel-menu', '1');
        node.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
        node.innerHTML = '<i data-lucide="heart-handshake" class="w-5 h-5 flex-shrink-0"></i>ระบบให้คำปรึกษานักศึกษา';
      }

      /* วางต่อจากเมนู "ระบบการลาของนักศึกษา" ตามที่ขอ
         ถ้าไม่ได้เปิดเมนูการลาไว้ ให้ไปวางก่อนแบบประเมิน/บริการอื่นๆ แทน */
      var after = nav.querySelector('[data-leave-menu]');
      if (after && after.parentNode === nav) {
        nav.insertBefore(node, after.nextSibling);
      } else {
        var before = nav.querySelector('[data-page="survey"], [data-page="surveyManage"], [data-page="services"]');
        while (before && before.parentNode && before.parentNode !== nav) before = before.parentNode;
        if (before && before.parentNode === nav) nav.insertBefore(node, before);
        else nav.appendChild(node);
      }
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
