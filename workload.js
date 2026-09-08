/* ================================================================
   workload.js — เมนู "ภาระงานนักศึกษา (Student workload)"
   ----------------------------------------------------------------
   โครงสร้างข้อมูล
     workload_plan    : ค่ามาตรฐานต่อ ปีการศึกษา/ชั้นปี/ภาคเรียน (ใช้กับทุกคนในชั้น)
     workload_student : ค่าเฉพาะรายบุคคลที่ต่างจากมาตรฐาน (เว้นว่าง = ใช้ค่ามาตรฐาน)
     workload_rate    : เกณฑ์หน่วยชั่วโมงภาระงานต่อชิ้นงาน (ตัวช่วยคำนวณ)

   การคิดชั่วโมง — ตามไฟล์ต้นฉบับของวิทยาลัย
     ชั่วโมงถ่วงน้ำหนักของแต่ละพันธกิจ = ชั่วโมงจริง × สัดส่วนพันธกิจ
     ชั่วโมงภาระงานทั้งหมด = ผลรวมของทุกพันธกิจที่ถ่วงน้ำหนักแล้ว
   ================================================================ */
(function () {
  'use strict';

  var MISSIONS = [
    { key: 'teaching', field: 'teaching_json', wkey: 'w_teaching', def: 0.40, label: 'พันธกิจการเรียนการสอน', short: 'การเรียนการสอน', color: '#1e6fba', bg: 'bg-blue-50', text: 'text-blue-700', subject: true },
    { key: 'service', field: 'service_json', wkey: 'w_service', def: 0.15, label: 'พันธกิจบริการวิชาการ', short: 'บริการวิชาการ', color: '#0e9f6e', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { key: 'research', field: 'research_json', wkey: 'w_research', def: 0.10, label: 'พันธกิจวิจัย/นวัตกรรม', short: 'วิจัย/นวัตกรรม', color: '#9061f9', bg: 'bg-purple-50', text: 'text-purple-700' },
    { key: 'student', field: 'student_json', wkey: 'w_student', def: 0.15, label: 'พันธกิจพัฒนานักศึกษา (กิจการนักศึกษา)', short: 'พัฒนานักศึกษา', color: '#e3a008', bg: 'bg-amber-50', text: 'text-amber-700' },
    { key: 'personal', field: 'personal_json', wkey: 'w_personal', def: 0.20, label: 'การใช้ชีวิตส่วนตัว', short: 'ใช้ชีวิตส่วนตัว', color: '#6b7280', bg: 'bg-gray-50', text: 'text-gray-600' }
  ];
  var ACT_KINDS = ['กิจกรรมที่', 'กิจกรรมโครงการ', 'กิจกรรมพิเศษ'];
  var SEMS = ['1', '2', '3'];

  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fx(v) { return String(Math.round(n(v) * 100) / 100); }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function semName(s) { return String(s) === '3' ? 'ฤดูร้อน' : String(s); }
  function uniq(a) { var out = [], seen = {}; a.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  function state() {
    if (!APP._wl) APP._wl = { tab: 'summary', year: '', level: '1', sem: '1', search: '', draft: null, calc: [] };
    if (!APP._wl.year) APP._wl.year = wlYears()[0] || '2568';
    return APP._wl;
  }
  function wlYears() {
    var ys = get('workload_plan').map(function (p) { return norm(p.academic_year); })
      .concat(get('subject').map(function (s) { return norm(s.academic_year); }));
    return uniq(ys).sort(function (a, b) { return b.localeCompare(a, 'th', { numeric: true }); });
  }

  function rows(rec, m) {
    if (!rec) return [];
    try { var a = JSON.parse(rec[m.field] || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function planOf(year, level, sem) {
    return get('workload_plan').find(function (p) {
      return norm(p.academic_year) === norm(year) && norm(p.year_level) === norm(level) && norm(p.semester) === norm(sem);
    }) || null;
  }
  function overrideOf(sid, year, sem) {
    return get('workload_student').find(function (o) {
      return norm(o.student_id) === norm(sid) && norm(o.academic_year) === norm(year) && norm(o.semester) === norm(sem);
    }) || null;
  }
  function weightOf(plan, m) {
    var v = plan ? norm(plan[m.wkey]) : '';
    return v === '' ? m.def : n(v);
  }
  function calc(plan, ovr) {
    var out = { raw: {}, weighted: {}, total: 0 };
    MISSIONS.forEach(function (m) {
      var useOvr = ovr && norm(ovr[m.field]) !== '';
      var list = rows(useOvr ? ovr : plan, m);
      var raw = list.reduce(function (s, r) { return s + n(r.hours); }, 0);
      out.raw[m.key] = raw;
      out.weighted[m.key] = Math.round(raw * weightOf(plan, m) * 100) / 100;
      out.total += out.weighted[m.key];
    });
    out.total = Math.round(out.total * 100) / 100;
    return out;
  }
  function meta(rec) {
    if (!rec) return {};
    try { return JSON.parse(rec.meta_json || '{}') || {}; } catch (e) { return {}; }
  }
  function stampNow() {
    var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + (d.getFullYear() + 543) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function metaLine(rec, m) {
    var info = meta(rec)[m.key];
    if (!info || !info.by) return '<span class="text-[11px] text-gray-300">ยังไม่เคยบันทึก</span>';
    return '<span class="text-[11px] text-gray-400">บันทึกล่าสุดโดย ' + esc(info.by) + ' · ' + esc(info.at || '') + '</span>';
  }

  // รหัสนักศึกษา 2 ตัวแรก คือปีการศึกษาที่เข้าเรียน
  //   ปีการศึกษา 2568 → ชั้นปีที่ 1 คือรหัส 68, ชั้นปีที่ 2 คือ 67, ชั้นปีที่ 3 คือ 66, ชั้นปีที่ 4 คือ 65
  // จึงคำนวณจาก (ปีการศึกษา - ชั้นปี + 1) แทนการใช้ชั้นปีปัจจุบันในทะเบียน
  // ซึ่งจะผิดทันทีเมื่อย้อนดูปีการศึกษาก่อนหน้า
  function cohortPrefix(year, level) {
    var y = parseInt(String(year || '').slice(-2), 10);
    var l = parseInt(level, 10) || 1;
    if (isNaN(y)) return '';
    var p = ((y - l + 1) % 100 + 100) % 100;
    return (p < 10 ? '0' : '') + p;
  }
  window.wlCohortPrefix = cohortPrefix;

  function cohortStudents(level, year) {
    var yr = year || state().year;
    var pfx = cohortPrefix(yr, level);
    var all = get('student');
    if (pfx) {
      var hit = all.filter(function (s) {
        return String(s.student_id || '').slice(0, 2) === pfx && norm(s.status) !== 'ลาออก';
      });
      // รุ่นที่จบไปแล้วยังต้องนับได้ เพราะตอนนั้นเขาเป็นนักศึกษาของชั้นปีนั้นจริง
      if (hit.length) return hit;
    }
    // ไม่พบรหัสรุ่นนั้นในทะเบียน — ถอยไปใช้ชั้นปีปัจจุบันตามเดิม
    return all.filter(function (s) {
      return norm(s.year_level) === norm(level) && (typeof isActiveStudent === 'function' ? isActiveStudent(s) : true);
    });
  }
  function myRoles() { return (APP._roles && APP._roles.length) ? APP._roles : [APP.currentRole]; }
  function canEdit() {
    return myRoles().some(function (r) { return r === 'admin' || r === 'academic' || r === 'otherStaff'; });
  }
  // ผู้ดูแลระบบ/งานวิชาการ แก้ได้ทุกพันธกิจ
  // เจ้าหน้าที่งานอื่นๆ แก้ได้เฉพาะพันธกิจที่ได้รับมอบหมาย และไม่รวมการเรียนการสอน
  function myMissions() {
    if (myRoles().some(function (r) { return r === 'admin' || r === 'academic'; })) {
      return MISSIONS.map(function (m) { return m.key; });
    }
    if (myRoles().indexOf('otherStaff') === -1) return [];
    var p = window.__emsProfile || {};
    var list = p.workload_missions;
    if (typeof list === 'string') list = list.split(',');
    if (!Array.isArray(list) || !list.length) list = ['service', 'research', 'student', 'personal'];
    return list.map(function (x) { return String(x).trim(); })
      .filter(function (x) { return x && x !== 'teaching'; });
  }
  function canEditMission(key) { return myMissions().indexOf(key) !== -1; }

  /* ---------------- หน้าหลัก ---------------- */
  window.workloadPage = function workloadPage() {
    var st = state();
    var years = wlYears();
    var tabs = [['summary', 'สรุปผลรวม', 'bar-chart-3'], ['plan', 'กรอกภาระงานรายชั้นปี', 'clipboard-list'],
    ['students', 'รายบุคคล', 'users'], ['rate', 'เกณฑ์หน่วยชั่วโมง', 'calculator']];

    var head = '<div class="flex flex-wrap items-center justify-between gap-3 mb-5">'
      + '<div><h2 class="text-xl font-bold text-gray-800"><i data-lucide="gauge" class="w-6 h-6 inline mr-2"></i>ภาระงานนักศึกษา (Student workload)</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">คิดชั่วโมงภาระงานตามสัดส่วนพันธกิจของวิทยาลัย</p></div>'
      + '<div class="flex items-center gap-2"><label class="text-sm text-gray-500">ปีการศึกษา</label>'
      + '<select onchange="wlSet(\'year\', this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + years.map(function (y) { return '<option ' + (y === st.year ? 'selected' : '') + '>' + esc(y) + '</option>'; }).join('')
      + '</select></div></div>';

    var bar = '<div class="flex gap-1 mb-5 border-b overflow-x-auto">'
      + tabs.map(function (t) {
        return '<button onclick="wlSet(\'tab\',\'' + t[0] + '\')" class="px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 '
          + (st.tab === t[0] ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700') + '">'
          + '<i data-lucide="' + t[2] + '" class="w-4 h-4 inline mr-1"></i>' + t[1] + '</button>';
      }).join('') + '</div>';

    var body = st.tab === 'plan' ? planTab()
      : st.tab === 'students' ? studentsTab()
        : st.tab === 'rate' ? rateTab() : summaryTab();
    return head + bar + body;
  };

  window.wlSet = function (k, v) {
    var st = state();
    st[k] = v;
    if (k !== 'search') st.draft = null;
    renderCurrentPage();
  };

  /* ---------------- แท็บ 1 : สรุปผลรวม ---------------- */
  function missionLegend(plan) {
    return '<div class="flex flex-wrap gap-2 mb-4">' + MISSIONS.map(function (m) {
      return '<span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ' + m.bg + ' ' + m.text + '">'
        + '<span style="width:8px;height:8px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
        + esc(m.short) + ' ' + Math.round(weightOf(plan, m) * 100) + '%</span>';
    }).join('') + '</div>';
  }

  function summaryTab() {
    var st = state();
    var cells = [], grand = 0, cohortTotal = 0;
    ['1', '2', '3', '4'].forEach(function (lv) {
      SEMS.forEach(function (sm) {
        var plan = planOf(st.year, lv, sm);
        if (!plan) return;
        var c = calc(plan, null);
        var ovr = get('workload_student').filter(function (o) {
          return norm(o.academic_year) === norm(st.year) && norm(o.year_level) === norm(lv) && norm(o.semester) === norm(sm);
        }).length;
        grand += c.total;
        cohortTotal += cohortStudents(lv).length;
        cells.push({ lv: lv, sm: sm, plan: plan, c: c, studs: cohortStudents(lv).length, ovr: ovr });
      });
    });

    if (!cells.length) {
      return '<div class="bg-white rounded-2xl p-8 border border-blue-100 text-center text-gray-400">'
        + 'ยังไม่มีข้อมูลภาระงานของปีการศึกษา ' + esc(st.year)
        + '<p class="text-sm mt-2">ไปที่แท็บ "กรอกภาระงานรายชั้นปี" เพื่อเริ่มบันทึก</p></div>';
    }

    var tiles = MISSIONS.map(function (m) {
      var sum = cells.reduce(function (s, x) { return s + x.c.weighted[m.key]; }, 0);
      return '<div class="bg-white rounded-2xl p-4 border border-blue-100">'
        + '<div class="flex items-center gap-2 mb-1"><span style="width:10px;height:10px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
        + '<p class="text-xs text-gray-500">' + esc(m.short) + '</p></div>'
        + '<p class="text-2xl font-bold" style="color:' + m.color + '">' + fx(sum) + '</p>'
        + '<p class="text-[11px] text-gray-400">ชั่วโมงถ่วงน้ำหนัก · สัดส่วน ' + Math.round(weightOf(cells[0].plan, m) * 100) + '%</p></div>';
    }).join('');

    var table = cells.map(function (x) {
      var segs = MISSIONS.map(function (m) {
        var pct = x.c.total ? (x.c.weighted[m.key] / x.c.total * 100) : 0;
        return pct > 0 ? '<span title="' + esc(m.short) + ' ' + fx(x.c.weighted[m.key]) + ' ชม." style="width:' + pct + '%;background:' + m.color + '"></span>' : '';
      }).join('');
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-3 font-medium whitespace-nowrap">ชั้นปีที่ ' + x.lv + '</td>'
        + '<td class="px-4 py-3 whitespace-nowrap">ภาค ' + semName(x.sm) + '</td>'
        + MISSIONS.map(function (m) {
          return '<td class="px-3 py-3 text-center tabular-nums"><span class="text-gray-800">' + fx(x.c.weighted[m.key]) + '</span>'
            + '<span class="block text-[11px] text-gray-400">' + fx(x.c.raw[m.key]) + ' ชม.</span></td>';
        }).join('')
        + '<td class="px-4 py-3 text-center"><b class="text-primary text-base tabular-nums">' + fx(x.c.total) + '</b>'
        + '<div class="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mt-1" style="min-width:80px">' + segs + '</div></td>'
        + '<td class="px-4 py-3 text-center text-gray-600 tabular-nums">' + x.studs + '</td>'
        + '<td class="px-4 py-3 text-center">' + (x.ovr ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">' + x.ovr + ' ราย</span>' : '<span class="text-gray-300">-</span>') + '</td></tr>';
    }).join('');

    return '<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">' + tiles + '</div>'
      + '<div class="bg-white rounded-2xl p-5 border border-blue-100">'
      + '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">'
      + '<h3 class="font-bold">สรุปชั่วโมงภาระงาน ปีการศึกษา ' + esc(st.year) + '</h3>'
      + '<button onclick="wlExportCSV()" class="px-3 py-1.5 rounded-lg border border-emerald-500 text-emerald-600 text-sm hover:bg-emerald-50"><i data-lucide="download" class="w-4 h-4 inline mr-1"></i>ส่งออก CSV</button></div>'
      + missionLegend(cells[0].plan)
      + '<div class="overflow-x-auto"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left"><th class="px-4 py-3 font-semibold">ชั้นปี</th><th class="px-4 py-3 font-semibold">ภาคเรียน</th>'
      + MISSIONS.map(function (m) { return '<th class="px-3 py-3 font-semibold text-center">' + esc(m.short) + '</th>'; }).join('')
      + '<th class="px-4 py-3 font-semibold text-center">รวมทั้งหมด</th><th class="px-4 py-3 font-semibold text-center">นักศึกษา</th>'
      + '<th class="px-4 py-3 font-semibold text-center">ปรับเฉพาะราย</th></tr></thead>'
      + '<tbody>' + table + '</tbody>'
      + '<tfoot><tr class="border-t-2 bg-surface font-semibold"><td class="px-4 py-3" colspan="2">รวมทั้งปีการศึกษา</td>'
      + MISSIONS.map(function (m) {
        var s = cells.reduce(function (a, x) { return a + x.c.weighted[m.key]; }, 0);
        return '<td class="px-3 py-3 text-center tabular-nums">' + fx(s) + '</td>';
      }).join('')
      + '<td class="px-4 py-3 text-center text-primary tabular-nums">' + fx(grand) + '</td>'
      + '<td class="px-4 py-3 text-center tabular-nums">' + cohortTotal + '</td><td></td></tr></tfoot></table></div>'
      + '<p class="text-xs text-gray-500 mt-3"><i data-lucide="info" class="w-3 h-3 inline mr-0.5"></i>'
      + 'ตัวเลขบนคือชั่วโมงหลังถ่วงน้ำหนักตามสัดส่วนพันธกิจ ตัวเลขสีจางด้านล่างคือชั่วโมงจริงก่อนถ่วงน้ำหนัก</p></div>';
  }

  /* ---------------- ตัวเลือกชั้นปี/ภาคเรียน ---------------- */
  function cohortPicker() {
    var st = state();
    return '<div class="flex flex-wrap items-end gap-3 mb-4">'
      + '<div><label class="block text-xs text-gray-600 mb-1">ชั้นปี</label>'
      + '<select onchange="wlSet(\'level\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + ['1', '2', '3', '4'].map(function (l) {
          var pfx = cohortPrefix(st.year, l);
          return '<option value="' + l + '" ' + (st.level === l ? 'selected' : '') + '>ชั้นปีที่ ' + l
            + (pfx ? ' (รหัส ' + pfx + ')' : '') + '</option>';
        }).join('')
      + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ภาคการศึกษา</label>'
      + '<select onchange="wlSet(\'sem\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + SEMS.map(function (s) { return '<option value="' + s + '" ' + (st.sem === s ? 'selected' : '') + '>ภาค ' + semName(s) + '</option>'; }).join('')
      + '</select></div></div>';
  }

  function draft() {
    var st = state();
    if (st.draft) return st.draft;
    var plan = planOf(st.year, st.level, st.sem);
    var d = { weights: {} };
    MISSIONS.forEach(function (m) {
      d[m.key] = rows(plan, m).map(function (r) { return Object.assign({}, r); });
      d.weights[m.key] = weightOf(plan, m);
    });
    st.draft = d;
    return d;
  }

  window.wlRowSet = function (mkey, idx, field, value) {
    var d = state().draft || draft();
    if (d[mkey] && d[mkey][idx]) d[mkey][idx][field] = value;
    wlUpdateTotals();
  };
  window.wlRowAdd = function (mkey) {
    var d = state().draft || draft();
    var m = MISSIONS.filter(function (x) { return x.key === mkey; })[0];
    d[mkey].push(m.subject ? { subject_name: '', pieces: '', hours: '' } : { kind: 'กิจกรรมที่', activity: '', hours: '' });
    if (state().editSid) wlEditStudent(state().editSid, true); else renderCurrentPage();
  };
  window.wlRowDel = function (mkey, idx) {
    var d = state().draft || draft();
    d[mkey].splice(idx, 1);
    if (state().editSid) wlEditStudent(state().editSid, true); else renderCurrentPage();
  };
  window.wlPullSubjects = function () {
    var st = state(), d = draft();
    var subs = get('subject').filter(function (s) {
      var sem = (typeof normSem === 'function') ? normSem(s.semester) : norm(s.semester);
      return norm(s.academic_year) === norm(st.year) && norm(s.year_level) === norm(st.level) && sem === norm(st.sem);
    });
    if (!subs.length) { showToast('ไม่พบรายวิชาที่เปิดสอนของชั้นปี/ภาคเรียนนี้', 'error'); return; }
    var have = {};
    d.teaching.forEach(function (r) { have[norm(r.subject_name)] = 1; });
    var added = 0;
    subs.forEach(function (s) {
      if (have[norm(s.subject_name)]) return;
      d.teaching.push({ subject_code: norm(s.subject_code), subject_name: norm(s.subject_name), pieces: '', hours: '' });
      added++;
    });
    showToast(added ? 'ดึงรายวิชามาเพิ่ม ' + added + ' วิชา' : 'รายวิชาที่เปิดสอนมีอยู่ในรายการครบแล้ว');
    renderCurrentPage();
  };

  function inp(mkey, i, field, val, type, readonly, cls) {
    if (readonly) return '<div class="text-sm py-2 ' + (cls.indexOf('center') >= 0 ? 'text-center' : '') + '">' + esc(val) + '</div>';
    return '<input type="' + type + '" value="' + esc(val) + '" oninput="wlRowSet(\'' + mkey + '\',' + i + ',\'' + field + '\',this.value)" class="' + cls + ' border rounded-lg px-2 py-1.5 text-sm">';
  }

  function missionEditor(m, d, readonly, cur) {
    if (!readonly && !canEditMission(m.key)) readonly = 'locked';
    var locked = readonly === 'locked';
    readonly = !!readonly;
    var list = d[m.key] || [];
    var raw = list.reduce(function (s, r) { return s + n(r.hours); }, 0);
    var w = d.weights[m.key];
    var head = '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">'
      + '<h4 class="font-semibold text-sm flex items-center gap-2">'
      + '<span style="width:10px;height:10px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
      + esc(m.label) + ' <span class="text-xs font-normal text-gray-400">สัดส่วน ' + Math.round(w * 100) + '%</span></h4>'
      + '<div class="flex items-center gap-2 flex-wrap">'
      + '<span class="text-xs text-gray-500">รวม <b class="text-gray-800" data-wl-raw="' + m.key + '">' + fx(raw) + '</b> ชม.'
      + ' → ถ่วงน้ำหนัก <b style="color:' + m.color + '" data-wl-w="' + m.key + '">' + fx(raw * w) + '</b></span>'
      + (readonly ? '' : '<button type="button" onclick="wlRowAdd(\'' + m.key + '\')" class="px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">+ เพิ่มแถว</button>')
      + (m.subject && !readonly ? '<button type="button" onclick="wlPullSubjects()" class="px-2 py-1 rounded-lg border border-primary text-xs text-primary hover:bg-primaryLight">ดึงรายวิชาที่เปิดสอน</button>' : '')
      + (readonly ? '' : '<button type="button" onclick="wlSaveMission(\'' + m.key + '\')" class="px-3 py-1 rounded-lg text-xs text-white hover:opacity-90" style="background:' + m.color + '"><i data-lucide="save" class="w-3 h-3 inline mr-0.5"></i>บันทึกพันธกิจนี้</button>')
      + (locked ? '<span class="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500"><i data-lucide="lock" class="w-3 h-3 inline mr-0.5"></i>ไม่ได้รับมอบหมาย</span>' : '')
      + '</div></div>'
      + '<div class="mb-2">' + metaLine(cur, m) + '</div>';

    var body;
    if (!list.length) {
      body = '<p class="text-xs text-gray-400 py-2">ยังไม่มีรายการ</p>';
    } else if (m.subject) {
      body = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-medium">รายวิชา</th><th class="px-3 py-2 font-medium text-center" style="width:8rem">จำนวนชิ้นงาน</th>'
        + '<th class="px-3 py-2 font-medium text-center" style="width:8rem">เวลาที่ใช้ (ชม.)</th>' + (readonly ? '' : '<th style="width:2.5rem"></th>') + '</tr></thead><tbody>'
        + list.map(function (r, i) {
          return '<tr class="border-t"><td class="px-3 py-1.5">' + inp(m.key, i, 'subject_name', r.subject_name, 'text', readonly, 'w-full')
            + '</td><td class="px-3 py-1.5">' + inp(m.key, i, 'pieces', r.pieces, 'number', readonly, 'w-full text-center')
            + '</td><td class="px-3 py-1.5">' + inp(m.key, i, 'hours', r.hours, 'number', readonly, 'w-full text-center') + '</td>'
            + (readonly ? '' : '<td class="px-2"><button type="button" onclick="wlRowDel(\'' + m.key + '\',' + i + ')" class="text-red-400 hover:text-red-600"><i data-lucide="x" class="w-4 h-4"></i></button></td>')
            + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      body = '<div class="space-y-2">' + list.map(function (r, i) {
        return '<div class="grid grid-cols-12 gap-2 items-start">'
          + '<div class="col-span-4 sm:col-span-2">'
          + (readonly ? '<div class="text-xs text-gray-500 py-2">' + esc(r.kind || 'กิจกรรมที่') + '</div>'
            : '<select onchange="wlRowSet(\'' + m.key + '\',' + i + ',\'kind\',this.value)" class="w-full border rounded-lg px-2 py-2 text-xs">'
            + ACT_KINDS.map(function (k) { return '<option ' + ((r.kind || 'กิจกรรมที่') === k ? 'selected' : '') + '>' + k + '</option>'; }).join('') + '</select>')
          + '</div>'
          + '<div class="col-span-5 sm:col-span-7">'
          + (readonly ? '<div class="text-sm py-2 whitespace-pre-wrap">' + esc(r.activity) + '</div>'
            : '<textarea rows="2" oninput="wlRowSet(\'' + m.key + '\',' + i + ',\'activity\',this.value)" placeholder="ชื่อกิจกรรม" class="w-full border rounded-lg px-2 py-1.5 text-sm">' + esc(r.activity) + '</textarea>')
          + '</div>'
          + '<div class="col-span-2">' + inp(m.key, i, 'hours', r.hours, 'number', readonly, 'w-full text-center') + '</div>'
          + (readonly ? '' : '<div class="col-span-1 pt-2"><button type="button" onclick="wlRowDel(\'' + m.key + '\',' + i + ')" class="text-red-400 hover:text-red-600"><i data-lucide="x" class="w-4 h-4"></i></button></div>')
          + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-3">' + head + body + '</div>';
  }

  window.wlUpdateTotals = function () {
    var d = state().draft;
    if (!d) return;
    var total = 0;
    MISSIONS.forEach(function (m) {
      var raw = (d[m.key] || []).reduce(function (s, r) { return s + n(r.hours); }, 0);
      var wt = raw * d.weights[m.key];
      total += wt;
      var a = document.querySelector('[data-wl-raw="' + m.key + '"]'); if (a) a.textContent = fx(raw);
      var b = document.querySelector('[data-wl-w="' + m.key + '"]'); if (b) b.textContent = fx(wt);
    });
    var t = document.getElementById('wlGrand'); if (t) t.textContent = fx(total);
  };

  /* ---------------- แท็บ 2 : กรอกภาระงานรายชั้นปี ---------------- */
  function missionScopeNote() {
    var mine = myMissions();
    var all = mine.length === MISSIONS.length;
    var names = MISSIONS.filter(function (m) { return mine.indexOf(m.key) !== -1; })
      .map(function (m) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg ' + m.bg + ' ' + m.text + '">'
          + '<span style="width:7px;height:7px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
          + esc(m.short) + '</span>';
      }).join(' ');
    return '<div class="bg-white border border-blue-100 rounded-xl px-4 py-3 mb-4 text-xs text-gray-600 flex items-start gap-2">'
      + '<i data-lucide="info" class="w-4 h-4 text-primary flex-shrink-0 mt-0.5"></i><span>'
      + '<b class="text-gray-700">บันทึกแยกทีละพันธกิจได้</b> — แต่ละกล่องด้านล่างมีปุ่ม "บันทึกพันธกิจนี้" ของตัวเอง '
      + 'ต่างคนต่างเวลาก็บันทึกได้ ระบบดึงข้อมูลล่าสุดมาก่อนบันทึกทุกครั้ง จึงไม่ทับงานของคนอื่น<br>'
      + '<b class="text-gray-700">พันธกิจที่บัญชีนี้บันทึกได้:</b> '
      + (names || '<span class="text-red-500">ยังไม่ได้รับมอบหมายพันธกิจใด</span>')
      + (all ? '' : ' <span class="text-gray-400">· พันธกิจอื่นจะถูกล็อกไว้ ผู้ดูแลระบบกำหนดได้ที่ ตั้งค่าระบบ → จัดการผู้ใช้งาน</span>')
      + '</span></div>';
  }

  function planTab() {
    var st = state();
    st.editSid = '';
    if (!canEdit()) return cohortPicker() + readonlyPlan();
    var d = draft();
    var total = MISSIONS.reduce(function (s, m) {
      return s + (d[m.key] || []).reduce(function (a, r) { return a + n(r.hours); }, 0) * d.weights[m.key];
    }, 0);
    return cohortPicker()
      + '<div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">'
      + '<div><p class="text-sm text-gray-600">ชั่วโมงภาระงานทั้งหมด · ชั้นปีที่ ' + esc(st.level) + ' ภาค ' + semName(st.sem) + ' ปีการศึกษา ' + esc(st.year) + '</p>'
      + '<p class="text-3xl font-bold text-primary tabular-nums" id="wlGrand">' + fx(total) + '</p>'
      + '<p class="text-xs text-gray-500">ใช้กับนักศึกษารหัส ' + esc(cohortPrefix(st.year, st.level))
      + ' จำนวน ' + cohortStudents(st.level).length + ' คน ที่ไม่ได้ปรับเฉพาะราย</p></div>'
      + '<button onclick="wlSavePlan()" class="px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primaryDark text-sm flex items-center gap-2 self-start"><i data-lucide="save" class="w-4 h-4"></i>บันทึกทุกพันธกิจที่ทำได้</button></div>'
      + missionScopeNote()
      + MISSIONS.map(function (m) { return missionEditor(m, d, false, planOf(st.year, st.level, st.sem)); }).join('');
  }

  function readonlyPlan() {
    var st = state();
    var plan = planOf(st.year, st.level, st.sem);
    if (!plan) return '<div class="bg-white rounded-2xl p-8 border border-blue-100 text-center text-gray-400">ยังไม่มีข้อมูลของชั้นปี/ภาคเรียนนี้</div>';
    var d = { weights: {} };
    MISSIONS.forEach(function (m) { d[m.key] = rows(plan, m); d.weights[m.key] = weightOf(plan, m); });
    var c = calc(plan, null);
    return '<div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">'
      + '<p class="text-sm text-gray-600">ชั่วโมงภาระงานทั้งหมด</p><p class="text-3xl font-bold text-primary tabular-nums">' + fx(c.total) + '</p>'
      + '<p class="text-xs text-gray-500 mt-1">บัญชีของคุณดูได้อย่างเดียว — แก้ไขได้โดยผู้ดูแลระบบ · งานวิชาการ · เจ้าหน้าที่งานอื่นๆ</p></div>'
      + MISSIONS.map(function (m) { return missionEditor(m, d, true, plan); }).join('');
  }

  // บันทึกเฉพาะพันธกิจเดียว — ดึงข้อมูลล่าสุดจากฐานข้อมูลก่อนเสมอ
  // เพื่อไม่ให้ทับงานที่คนอื่นเพิ่งบันทึกในพันธกิจอื่น
  window.wlSaveMission = async function (mkey) {
    var st = state(), d = st.draft;
    if (!d) return;
    var m = MISSIONS.filter(function (x) { return x.key === mkey; })[0];
    if (!canEditMission(mkey)) { showToast('บัญชีของคุณไม่ได้รับมอบหมายให้บันทึก' + m.short, 'error'); return; }
    var forStudent = !!st.editSid;
    var tab = forStudent ? 'workload_student' : 'workload_plan';
    var who = (APP.currentUser && APP.currentUser.name) || '';

    if (typeof showToast === 'function') showToast('กำลังบันทึก ' + m.short + '...');
    try { await GSheetDB.refreshTab(tab); } catch (e) { /* ใช้ข้อมูลที่มีอยู่ */ }

    var cur = forStudent ? overrideOf(st.editSid, st.year, st.sem) : planOf(st.year, st.level, st.sem);
    var mt = meta(cur);
    mt[mkey] = { by: who, at: stampNow() };

    var payload = {
      type: tab, academic_year: st.year, year_level: st.level, semester: st.sem,
      updated_by: who, meta_json: JSON.stringify(mt)
    };
    if (forStudent) payload.student_id = st.editSid;
    payload[m.field] = JSON.stringify(d[mkey] || []);

    var r = cur ? await GSheetDB.update(Object.assign({}, cur, payload)) : await GSheetDB.create(payload);
    if (!(r && r.isOk)) { showToast('บันทึกไม่สำเร็จ: ' + ((r && r.error) || ''), 'error'); return; }

    // ซิงก์พันธกิจอื่นในหน้าจอให้เป็นค่าล่าสุดจากฐานข้อมูล (เผื่อมีคนแก้ระหว่างนี้)
    var fresh = forStudent ? overrideOf(st.editSid, st.year, st.sem) : planOf(st.year, st.level, st.sem);
    var basis = forStudent ? planOf(st.year, st.level, st.sem) : fresh;
    MISSIONS.forEach(function (x) {
      if (x.key === mkey) return;
      var src = (forStudent && fresh && norm(fresh[x.field])) ? fresh : basis;
      d[x.key] = rows(src, x).map(function (row) { return Object.assign({}, row); });
    });

    showToast('บันทึก ' + m.short + ' เรียบร้อย');
    if (forStudent) wlEditStudent(st.editSid, true); else renderCurrentPage();
  };

  window.wlSavePlan = async function () {
    var st = state(), d = draft();
    var plan = planOf(st.year, st.level, st.sem);
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var mine = MISSIONS.filter(function (m) { return canEditMission(m.key); });
    if (!mine.length) { showToast('บัญชีของคุณไม่ได้รับมอบหมายให้บันทึกพันธกิจใดเลย', 'error'); return; }
    var mt = meta(plan);
    mine.forEach(function (m) { mt[m.key] = { by: who, at: stampNow() }; });
    var payload = {
      type: 'workload_plan', academic_year: st.year, year_level: st.level, semester: st.sem,
      updated_by: who, meta_json: JSON.stringify(mt)
    };
    mine.forEach(function (m) { payload[m.field] = JSON.stringify(d[m.key] || []); });
    var r = plan ? await GSheetDB.update(Object.assign({}, plan, payload)) : await GSheetDB.create(payload);
    if (r && r.isOk) { showToast('บันทึกภาระงานเรียบร้อย'); st.draft = null; renderCurrentPage(); }
    else showToast('บันทึกไม่สำเร็จ: ' + ((r && r.error) || ''), 'error');
  };

  /* ---------------- แท็บ 3 : รายบุคคล ---------------- */
  function studentsTab() {
    var st = state();
    st.editSid = '';
    var plan = planOf(st.year, st.level, st.sem);
    var q = norm(st.search).toLowerCase();
    var list = cohortStudents(st.level).filter(function (s) {
      return !q || (norm(s.student_id) + ' ' + norm(s.name)).toLowerCase().indexOf(q) >= 0;
    });
    var base = plan ? calc(plan, null) : null;

    var body = list.slice(0, 300).map(function (s) {
      var ovr = overrideOf(s.student_id, st.year, st.sem);
      var c = calc(plan, ovr);
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-2.5 font-mono text-primary">' + esc(s.student_id) + '</td>'
        + '<td class="px-4 py-2.5">' + esc(s.name) + '</td>'
        + MISSIONS.map(function (m) { return '<td class="px-3 py-2.5 text-center tabular-nums text-gray-600">' + fx(c.weighted[m.key]) + '</td>'; }).join('')
        + '<td class="px-4 py-2.5 text-center"><b class="tabular-nums ' + (ovr ? 'text-amber-600' : 'text-primary') + '">' + fx(c.total) + '</b></td>'
        + '<td class="px-4 py-2.5 text-center">' + (ovr ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">ปรับเฉพาะราย</span>' : '<span class="text-xs text-gray-400">ตามมาตรฐาน</span>') + '</td>'
        + (canEdit() ? '<td class="px-3 py-2.5 text-center whitespace-nowrap"><button onclick="wlEditStudent(\'' + esc(s.student_id) + '\')" class="text-blue-400 hover:text-blue-600" title="ปรับเฉพาะราย"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
          + (ovr ? '<button onclick="wlResetStudent(\'' + esc(s.student_id) + '\')" class="text-red-400 hover:text-red-600 ml-1" title="กลับไปใช้ค่ามาตรฐาน"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>' : '') + '</td>' : '')
        + '</tr>';
    }).join('');

    return cohortPicker()
      + (base ? '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4 flex flex-wrap items-center justify-between gap-3">'
        + '<p class="text-sm text-gray-600">ค่ามาตรฐานของชั้นปีนี้ <b class="text-primary text-lg tabular-nums">' + fx(base.total) + '</b> ชั่วโมง</p>'
        + '<input value="' + esc(st.search) + '" oninput="wlSet(\'search\',this.value)" placeholder="ค้นหารหัส/ชื่อนักศึกษา" class="border border-gray-200 rounded-xl px-3 py-2 text-sm w-64 max-w-full"></div>'
        : '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-sm text-amber-800">ยังไม่ได้กรอกค่ามาตรฐานของชั้นปี/ภาคเรียนนี้</div>')
      + '<div class="bg-white rounded-2xl p-5 border border-blue-100">'
      + '<h3 class="font-bold mb-3">นักศึกษาชั้นปีที่ ' + esc(st.level) + ' (' + list.length + ' คน)</h3>'
      + '<div class="overflow-x-auto"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left"><th class="px-4 py-3 font-semibold">รหัส</th><th class="px-4 py-3 font-semibold">ชื่อ-สกุล</th>'
      + MISSIONS.map(function (m) { return '<th class="px-3 py-3 font-semibold text-center">' + esc(m.short) + '</th>'; }).join('')
      + '<th class="px-4 py-3 font-semibold text-center">รวม</th><th class="px-4 py-3 font-semibold text-center">สถานะ</th>'
      + (canEdit() ? '<th class="px-3 py-3"></th>' : '') + '</tr></thead>'
      + '<tbody>' + (body || '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-400">ไม่พบนักศึกษา</td></tr>') + '</tbody></table></div>'
      + (list.length > 300 ? '<p class="text-xs text-gray-400 mt-2">แสดง 300 คนแรก — ใช้ช่องค้นหาเพื่อหาคนที่ต้องการ</p>' : '')
      + '</div>';
  }

  window.wlEditStudent = function (sid, keepDraft) {
    var st = state();
    var plan = planOf(st.year, st.level, st.sem);
    var stu = get('student').find(function (s) { return norm(s.student_id) === norm(sid); }) || {};
    if (!keepDraft) {
      var ovr = overrideOf(sid, st.year, st.sem);
      var d = { weights: {} };
      MISSIONS.forEach(function (m) {
        d[m.key] = rows(ovr && norm(ovr[m.field]) ? ovr : plan, m).map(function (r) { return Object.assign({}, r); });
        d.weights[m.key] = weightOf(plan, m);
      });
      st.draft = d;
    }
    st.editSid = sid;
    showModal('ปรับภาระงานเฉพาะราย',
      '<div class="space-y-1">'
      + '<div class="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-2 text-sm">'
      + '<p><span class="text-gray-500">นักศึกษา:</span> <b>' + esc(stu.name || '-') + '</b> (' + esc(sid) + ')</p>'
      + '<p><span class="text-gray-500">ชั้นปี/ภาค:</span> ชั้นปีที่ ' + esc(st.level) + ' ภาค ' + semName(st.sem) + ' ปีการศึกษา ' + esc(st.year) + '</p>'
      + '<p class="mt-1 text-gray-600">รวม <b class="text-primary tabular-nums" id="wlGrand">0</b> ชั่วโมง</p>'
      + '<p class="text-[11px] text-gray-500 mt-1">พันธกิจที่ยังไม่เคยบันทึกเฉพาะราย จะใช้ค่ามาตรฐานของชั้นปีโดยอัตโนมัติ</p></div>'
      + MISSIONS.map(function (m) { return missionEditor(m, st.draft, false, overrideOf(sid, st.year, st.sem)); }).join('')
      + '<button type="button" onclick="wlSaveStudent()" class="w-full bg-primary text-white py-2.5 rounded-xl hover:bg-primaryDark mt-2">บันทึกทุกพันธกิจที่ทำได้ ของนักศึกษาคนนี้</button>'
      + '<p class="text-[11px] text-gray-400 text-center mt-1">หรือกด "บันทึกพันธกิจนี้" ในแต่ละกล่องเพื่อบันทึกทีละพันธกิจ</p>'
      + '</div>', null, 'max-w-3xl');
    setTimeout(wlUpdateTotals, 30);
  };

  window.wlSaveStudent = async function () {
    var st = state(), d = st.draft, sid = st.editSid;
    var ovr = overrideOf(sid, st.year, st.sem);
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var mine = MISSIONS.filter(function (m) { return canEditMission(m.key); });
    if (!mine.length) { showToast('บัญชีของคุณไม่ได้รับมอบหมายให้บันทึกพันธกิจใดเลย', 'error'); return; }
    var mt = meta(ovr);
    mine.forEach(function (m) { mt[m.key] = { by: who, at: stampNow() }; });
    var payload = {
      type: 'workload_student', student_id: sid, academic_year: st.year,
      year_level: st.level, semester: st.sem,
      updated_by: who, meta_json: JSON.stringify(mt)
    };
    mine.forEach(function (m) { payload[m.field] = JSON.stringify(d[m.key] || []); });
    var r = ovr ? await GSheetDB.update(Object.assign({}, ovr, payload)) : await GSheetDB.create(payload);
    if (r && r.isOk) { showToast('บันทึกภาระงานเฉพาะรายเรียบร้อย'); st.draft = null; st.editSid = ''; closeModal(); renderCurrentPage(); }
    else showToast('บันทึกไม่สำเร็จ: ' + ((r && r.error) || ''), 'error');
  };

  window.wlResetStudent = async function (sid) {
    var st = state();
    var ovr = overrideOf(sid, st.year, st.sem);
    if (!ovr) return;
    if (!confirm('กลับไปใช้ค่ามาตรฐานของชั้นปี?\n\nค่าที่ปรับเฉพาะรายของนักศึกษาคนนี้จะถูกลบ')) return;
    var r = await GSheetDB.delete(ovr);
    if (r && r.isOk) { showToast('กลับไปใช้ค่ามาตรฐานแล้ว'); renderCurrentPage(); }
    else showToast('ทำรายการไม่สำเร็จ', 'error');
  };

  /* ---------------- แท็บ 4 : เกณฑ์หน่วยชั่วโมง + ตัวช่วยคำนวณ ---------------- */
  function rateList() {
    return get('workload_rate').slice().sort(function (a, b) {
      return norm(a.sort_order).localeCompare(norm(b.sort_order), 'th', { numeric: true });
    });
  }
  function rateUsable() {
    return rateList().filter(function (r) { return n(r.hours) > 0; });
  }

  function rateTab() {
    var st = state();
    var rates = rateList();
    var opts = rateUsable().map(function (r, i) {
      return '<option value="' + i + '">' + esc(norm(r.work_group) + ' · ' + norm(r.item)) + ' (' + esc(r.hours) + ' ชม./' + esc(r.unit) + ')</option>';
    }).join('');

    var groups = {}, order = [];
    rates.forEach(function (r) {
      var k = norm(r.category) + ' — ' + norm(r.work_group);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    });
    var tbl = order.map(function (k) {
      return '<tr class="bg-surface"><td colspan="3" class="px-4 py-2 font-semibold text-sm text-gray-700">' + esc(k) + '</td></tr>'
        + groups[k].map(function (r) {
          return '<tr class="border-t"><td class="px-4 py-2.5">' + esc(r.item)
            + (norm(r.note) ? '<span class="block text-[11px] text-amber-600 mt-0.5">' + esc(r.note) + '</span>' : '')
            + '</td><td class="px-4 py-2.5 text-center text-gray-500">' + esc(r.unit) + '</td>'
            + '<td class="px-4 py-2.5 text-center font-semibold tabular-nums">' + esc(r.hours) + '</td></tr>';
        }).join('');
    }).join('');

    var calcRows = (st.calc || []).map(function (c, i) {
      return '<tr class="border-t"><td class="px-3 py-2">' + esc(c.item) + '</td>'
        + '<td class="px-3 py-2 text-center tabular-nums">' + esc(c.qty) + ' ' + esc(c.unit) + '</td>'
        + '<td class="px-3 py-2 text-center tabular-nums">' + esc(c.rate) + '</td>'
        + '<td class="px-3 py-2 text-center font-semibold tabular-nums">' + fx(c.hours) + '</td>'
        + '<td class="px-2"><button onclick="wlCalcDel(' + i + ')" class="text-red-400 hover:text-red-600"><i data-lucide="x" class="w-4 h-4"></i></button></td></tr>';
    }).join('');
    var calcTotal = (st.calc || []).reduce(function (s, c) { return s + n(c.hours); }, 0);

    return '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">'
      + '<div class="bg-white rounded-2xl p-5 border border-blue-100">'
      + '<h3 class="font-bold mb-1">ตัวช่วยคำนวณชั่วโมง</h3>'
      + '<p class="text-xs text-gray-500 mb-3">เลือกประเภทงาน ใส่จำนวน แล้วกดเพิ่ม ระบบคูณหน่วยชั่วโมงให้อัตโนมัติ</p>'
      + '<div class="flex flex-wrap gap-2 items-end mb-3">'
      + '<div class="flex-1" style="min-width:200px"><label class="block text-xs text-gray-600 mb-1">ประเภทงาน</label>'
      + '<select id="wlCalcItem" class="w-full border rounded-xl px-3 py-2 text-sm">' + opts + '</select></div>'
      + '<div style="width:6rem"><label class="block text-xs text-gray-600 mb-1">จำนวน</label>'
      + '<input id="wlCalcQty" type="number" min="0" step="1" value="1" class="w-full border rounded-xl px-3 py-2 text-sm text-center"></div>'
      + '<button onclick="wlCalcAdd()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm hover:bg-primaryDark">เพิ่ม</button></div>'
      + (calcRows
        ? '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-medium">รายการ</th><th class="px-3 py-2 font-medium text-center">จำนวน</th>'
        + '<th class="px-3 py-2 font-medium text-center">หน่วย ชม.</th><th class="px-3 py-2 font-medium text-center">รวม</th><th></th></tr></thead>'
        + '<tbody>' + calcRows + '</tbody></table></div>'
        + '<div class="flex items-center justify-between mt-3 p-3 bg-blue-50 rounded-xl">'
        + '<span class="text-sm text-gray-600">รวมชั่วโมงภาระงาน</span>'
        + '<span class="text-2xl font-bold text-primary tabular-nums">' + fx(calcTotal) + '</span></div>'
        + '<button onclick="wlCalcClear()" class="mt-2 text-xs text-gray-500 hover:text-red-600">ล้างรายการทั้งหมด</button>'
        : '<p class="text-sm text-gray-400 py-4 text-center">ยังไม่มีรายการ — เลือกประเภทงานแล้วกดเพิ่ม</p>')
      + '</div>'
      + '<div class="bg-white rounded-2xl p-5 border border-blue-100">'
      + '<h3 class="font-bold mb-1">เกณฑ์หน่วยชั่วโมงภาระงาน</h3>'
      + '<p class="text-xs text-gray-500 mb-3">อ้างอิงจากเอกสารการกำหนดภาระงานของนักศึกษา</p>'
      + '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
      + '<th class="px-4 py-2 font-semibold">รายการ</th><th class="px-4 py-2 font-semibold text-center">หน่วย</th>'
      + '<th class="px-4 py-2 font-semibold text-center">ชั่วโมง</th></tr></thead><tbody>' + tbl + '</tbody></table></div>'
      + '</div></div>';
  }

  window.wlCalcAdd = function () {
    var st = state();
    var rates = rateUsable();
    var i = parseInt(document.getElementById('wlCalcItem').value, 10);
    var qty = n(document.getElementById('wlCalcQty').value);
    var r = rates[i];
    if (!r || qty <= 0) { showToast('กรุณาเลือกประเภทงานและใส่จำนวน', 'error'); return; }
    st.calc = st.calc || [];
    st.calc.push({ item: norm(r.item), unit: norm(r.unit), qty: qty, rate: norm(r.hours), hours: n(r.hours) * qty });
    renderCurrentPage();
  };
  window.wlCalcDel = function (i) { state().calc.splice(i, 1); renderCurrentPage(); };
  window.wlCalcClear = function () { state().calc = []; renderCurrentPage(); };

  /* ---------------- ส่งออก CSV ---------------- */
  window.wlExportCSV = function () {
    var st = state();
    var head = ['ปีการศึกษา', 'ชั้นปี', 'ภาคเรียน']
      .concat(MISSIONS.map(function (m) { return m.short + ' (ชม.จริง)'; }))
      .concat(MISSIONS.map(function (m) { return m.short + ' (ถ่วงน้ำหนัก)'; }))
      .concat(['รวมทั้งหมด', 'จำนวนนักศึกษา']);
    var lines = [head.join(',')];
    ['1', '2', '3', '4'].forEach(function (lv) {
      SEMS.forEach(function (sm) {
        var plan = planOf(st.year, lv, sm);
        if (!plan) return;
        var c = calc(plan, null);
        lines.push([st.year, lv, semName(sm)]
          .concat(MISSIONS.map(function (m) { return fx(c.raw[m.key]); }))
          .concat(MISSIONS.map(function (m) { return fx(c.weighted[m.key]); }))
          .concat([fx(c.total), cohortStudents(lv).length]).join(','));
      });
    });
    var blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'student_workload_' + st.year + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---------------- ต่อเข้ากับระบบเดิม ---------------- */
  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (page === 'workload') return workloadPage();
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.workload) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-page="workload"]')) return;
      var btn = document.createElement('button');
      btn.setAttribute('onclick', "navigateTo('workload')");
      btn.setAttribute('data-page', 'workload');
      btn.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
      btn.innerHTML = '<i data-lucide="gauge" class="w-5 h-5 flex-shrink-0"></i>ภาระงานนักศึกษา';
      var before = nav.querySelector('[data-page="survey"], [data-page="surveyManage"], [data-page="services"]');
      if (before) nav.insertBefore(btn, before); else nav.appendChild(btn);
      if (window.lucide) lucide.createIcons();
    };
  })();
})();
