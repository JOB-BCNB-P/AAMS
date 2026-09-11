/* ================================================================
   curriculum.js — เมนู "ข้อมูลหลักสูตร"
   ----------------------------------------------------------------
   รองรับหลายฉบับ (2565 และฉบับปรับปรุงในอนาคต เช่น 2570)
   เลือกดูได้จากปุ่มเลือกฉบับด้านบน

   ตารางที่ใช้
     curriculum        : หัวเรื่องของหลักสูตรแต่ละฉบับ (หมวดที่ 1 ข้อมูลทั่วไป)
     curriculum_course : รายวิชาในหลักสูตร พร้อมชื่อไทย/อังกฤษ หน่วยกิต น(ท-ป-ค)
     curriculum_plo    : PLO และ Sub-PLO พร้อมกลยุทธ์การสอนและการวัดประเมินผล
     curriculum_map    : แผนที่กระจาย PLO สู่รายวิชา (I / R / M / P)

   สิทธิ์: ทุกคนที่เข้าสู่ระบบดูได้ — แก้ไขได้เฉพาะผู้ดูแลระบบและเจ้าหน้าที่งานวิชาการ
   ================================================================ */
(function () {
  'use strict';

  var TABS = [
    ['info', 'รายละเอียดหลักสูตร', 'file-text'],
    ['courses', 'รายวิชา', 'book-open'],
    ['plo', 'ผลลัพธ์การเรียนรู้ (PLOs)', 'target'],
    ['map', 'Curriculum Mapping', 'grid-3x3']
  ];

  // ระดับความรับผิดชอบในแผนที่กระจาย PLO
  var LEVELS = {
    I: { label: 'Introduce', th: 'เริ่มเรียนรู้', cls: 'bg-sky-100 text-sky-700' },
    R: { label: 'Reinforce', th: 'ฝึกซ้ำให้ชำนาญ', cls: 'bg-amber-100 text-amber-700' },
    M: { label: 'Master', th: 'เชี่ยวชาญ', cls: 'bg-emerald-100 text-emerald-700' },
    P: { label: 'Practice', th: 'ฝึกปฏิบัติ', cls: 'bg-violet-100 text-violet-700' }
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }

  function state() {
    if (!APP._cur) APP._cur = { tab: 'info', year: '', search: '' };
    if (!APP._cur.year) APP._cur.year = years()[0] || '';
    return APP._cur;
  }
  function years() {
    var ys = get('curriculum').map(function (c) { return s(c.curriculum_year); }).filter(Boolean);
    return ys.sort().reverse();
  }
  function curOf(y) {
    return get('curriculum').filter(function (c) { return s(c.curriculum_year) === s(y); })[0] || null;
  }
  function coursesOf(y) {
    return get('curriculum_course')
      .filter(function (c) { return s(c.curriculum_year) === s(y); })
      .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); });
  }
  function plosOf(y) {
    return get('curriculum_plo')
      .filter(function (p) { return s(p.curriculum_year) === s(y); })
      .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); });
  }
  function mapOf(y) {
    return get('curriculum_map').filter(function (m) { return s(m.curriculum_year) === s(y); });
  }
  function canEdit() {
    var roles = (APP._roles && APP._roles.length) ? APP._roles : [APP.currentRole];
    return roles.some(function (r) { return r === 'admin' || r === 'academic'; });
  }

  /* ---------------- โครงหน้า ---------------- */
  window.curriculumPage = function curriculumPage() {
    var st = state();
    var ys = years();
    if (!ys.length) {
      return card('<div class="text-center py-16 text-gray-400">'
        + '<i data-lucide="book-x" class="w-10 h-10 mx-auto mb-3"></i>'
        + '<p>ยังไม่มีข้อมูลหลักสูตรในระบบ</p></div>');
    }

    var head = '<div class="flex flex-wrap items-start justify-between gap-3 mb-5">'
      + '<div><h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">'
      + '<i data-lucide="graduation-cap" class="w-5 h-5 text-primary"></i>ข้อมูลหลักสูตร</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">รายละเอียดหลักสูตร รายวิชา และผลลัพธ์การเรียนรู้ระดับหลักสูตร</p></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ฉบับหลักสูตร</label>'
      + '<select onchange="curSet(\'year\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + ys.map(function (y) {
          return '<option value="' + esc(y) + '"' + (st.year === y ? ' selected' : '') + '>ฉบับปรับปรุง พ.ศ. ' + esc(y) + '</option>';
        }).join('')
      + '</select></div></div>';

    var tabs = '<div class="flex flex-wrap gap-2 mb-5 border-b border-gray-100 pb-3">'
      + TABS.map(function (t) {
          var on = st.tab === t[0];
          return '<button onclick="curSet(\'tab\',\'' + t[0] + '\')" class="px-3.5 py-2 rounded-xl text-sm flex items-center gap-2 transition '
            + (on ? 'bg-primary text-white' : 'text-gray-600 hover:bg-surface') + '">'
            + '<i data-lucide="' + t[2] + '" class="w-4 h-4"></i>' + t[1] + '</button>';
        }).join('')
      + '</div>';

    var body = st.tab === 'courses' ? coursesTab(st.year)
      : st.tab === 'plo' ? ploTab(st.year)
      : st.tab === 'map' ? mapTab(st.year)
      : infoTab(st.year);

    return card(head + tabs + body);
  };

  function card(inner) {
    return '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">' + inner + '</div>';
  }

  window.curSet = function (k, v) {
    var st = state();
    st[k] = v;
    if (k === 'year') st.search = '';
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  /* ---------------- แท็บ 1 : รายละเอียดหลักสูตร ---------------- */
  function row(label, val) {
    if (!s(val)) return '';
    return '<tr class="align-top"><td class="py-2 pr-4 text-gray-500 whitespace-nowrap w-52">' + esc(label) + '</td>'
      + '<td class="py-2 text-gray-800">' + esc(val) + '</td></tr>';
  }

  function infoTab(y) {
    var c = curOf(y);
    if (!c) return empty('ยังไม่มีรายละเอียดของหลักสูตรฉบับนี้');

    var basic = '<table class="w-full text-sm"><tbody>'
      + row('ชื่อหลักสูตร (ไทย)', c.title_th)
      + row('ชื่อหลักสูตร (อังกฤษ)', c.title_en)
      + row('ชื่อปริญญา (ไทย)', s(c.degree_full_th) + (s(c.degree_short_th) ? '  ·  ชื่อย่อ ' + s(c.degree_short_th) : ''))
      + row('ชื่อปริญญา (อังกฤษ)', s(c.degree_full_en) + (s(c.degree_short_en) ? '  ·  ชื่อย่อ ' + s(c.degree_short_en) : ''))
      + row('สถาบันอุดมศึกษา', c.institute)
      + row('คณะ', c.faculty)
      + row('วิทยาลัย', c.college)
      + row('ประเภทหลักสูตร', c.program_type)
      + row('ภาษาที่ใช้', c.language)
      + row('ระยะเวลาการศึกษา', s(c.study_years) ? s(c.study_years) + ' ปี' : '')
      + row('สถานภาพ', c.curriculum_status)
      + '</tbody></table>';

    // การ์ดหน่วยกิต
    var d = {};
    try { d = JSON.parse(s(c.detail_json) || '{}'); } catch (e) { d = {}; }
    var st2 = d['โครงสร้างหน่วยกิต'] || {};
    var chips = Object.keys(st2).map(function (k) {
      var big = k === 'รวม';
      return '<div class="rounded-xl px-4 py-3 ' + (big ? 'bg-primary text-white' : 'bg-surface') + '">'
        + '<p class="text-xs ' + (big ? 'text-white/80' : 'text-gray-500') + '">' + esc(k) + '</p>'
        + '<p class="text-lg font-bold">' + esc(st2[k]) + ' <span class="text-xs font-normal">หน่วยกิต</span></p></div>';
    }).join('');
    var credits = chips ? '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">' + chips + '</div>' : '';

    // หัวข้อบรรยายอื่น ๆ
    var more = Object.keys(d).filter(function (k) { return k !== 'โครงสร้างหน่วยกิต'; }).map(function (k) {
      var v = d[k];
      var inner = Array.isArray(v)
        ? '<ol class="list-decimal pl-5 space-y-1">' + v.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>'
        : '<p>' + esc(v) + '</p>';
      return '<div class="border border-gray-100 rounded-xl p-4">'
        + '<h4 class="font-semibold text-sm text-gray-700 mb-2">' + esc(k) + '</h4>'
        + '<div class="text-sm text-gray-600 leading-relaxed">' + inner + '</div></div>';
    }).join('');

    return credits
      + '<div class="border border-gray-100 rounded-xl p-4 mb-4">' + basic + '</div>'
      + (more ? '<div class="grid md:grid-cols-2 gap-3">' + more + '</div>' : '')
      + (s(c.note) ? '<p class="text-xs text-gray-400 mt-4">' + esc(c.note) + '</p>' : '');
  }

  /* ---------------- แท็บ 2 : รายวิชา ---------------- */
  function coursesTab(y) {
    var st = state();
    var all = coursesOf(y);
    if (!all.length) return empty('ยังไม่มีรายวิชาของหลักสูตรฉบับนี้');

    var q = s(st.search).toLowerCase();
    var list = !q ? all : all.filter(function (c) {
      return (s(c.course_code) + ' ' + s(c.name_th) + ' ' + s(c.name_en)).toLowerCase().indexOf(q) >= 0;
    });

    var search = '<div class="flex flex-wrap items-center gap-3 mb-4">'
      + '<div class="flex-1 min-w-[220px] relative">'
      + '<i data-lucide="search" class="absolute left-3 top-2.5 w-4 h-4 text-gray-400"></i>'
      + '<input type="text" value="' + esc(st.search) + '" placeholder="ค้นหารหัสวิชา / ชื่อไทย / ชื่ออังกฤษ..." '
      + 'class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm" '
      + 'oninput="clearTimeout(window._curSearchTimer);window._curSearchTimer=setTimeout(()=>curSet(\'search\',this.value),250)"></div>'
      + '<span class="text-sm text-gray-500">' + list.length + ' จาก ' + all.length + ' รายวิชา</span>'
      + '<button onclick="curExportCourses()" class="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-surface flex items-center gap-2">'
      + '<i data-lucide="download" class="w-4 h-4"></i>ดาวน์โหลด CSV</button></div>';

    // จัดกลุ่มตามหมวด
    var groups = [], seen = {};
    list.forEach(function (c) {
      var g = s(c.course_group) || 'อื่น ๆ';
      if (!seen[g]) { seen[g] = []; groups.push(g); }
      seen[g].push(c);
    });

    var body = groups.map(function (g) {
      var rows = seen[g];
      var cr = rows.reduce(function (a, c) { return a + (Number(c.credits) || 0); }, 0);
      return '<div class="mb-5">'
        + '<div class="flex items-baseline justify-between mb-2">'
        + '<h4 class="font-semibold text-sm text-primary">' + esc(g) + '</h4>'
        + '<span class="text-xs text-gray-400">' + rows.length + ' วิชา · รวม ' + cr + ' หน่วยกิต</span></div>'
        + '<div class="overflow-x-auto"><table class="w-full text-sm">'
        + '<thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold whitespace-nowrap">รหัสวิชา</th>'
        + '<th class="px-3 py-2 font-semibold">ชื่อรายวิชา</th>'
        + '<th class="px-3 py-2 font-semibold text-center whitespace-nowrap">หน่วยกิต</th>'
        + '<th class="px-3 py-2 font-semibold text-center whitespace-nowrap">ชั่วโมง/ภาค</th></tr></thead><tbody>'
        + rows.map(function (c) {
            return '<tr class="border-t border-gray-50 hover:bg-surface/60">'
              + '<td class="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">' + esc(c.course_code) + '</td>'
              + '<td class="px-3 py-2.5"><div class="text-gray-800">' + esc(c.name_th) + '</div>'
              + (s(c.name_en) ? '<div class="text-xs text-gray-400 italic">' + esc(c.name_en) + '</div>' : '') + '</td>'
              + '<td class="px-3 py-2.5 text-center whitespace-nowrap text-gray-700">' + esc(c.credits)
              + '<span class="text-xs text-gray-400">(' + esc(c.h_theory) + '-' + esc(c.h_lab) + '-' + esc(c.h_self) + ')</span></td>'
              + '<td class="px-3 py-2.5 text-center whitespace-nowrap">' + termHoursCell(c) + '</td></tr>';
          }).join('')
        + '</tbody></table></div></div>';
    }).join('');

    return search + (body || empty('ไม่พบรายวิชาที่ตรงกับคำค้น'));
  }

  /* ชั่วโมงต่อภาคการศึกษาตามเอกสารหลักสูตร
     วิชาบรรยาย/ทดลอง = ชั่วโมงต่อสัปดาห์ x 15 สัปดาห์
     วิชาภาคปฏิบัติ   = ชั่วโมงต่อสัปดาห์ x 45 (ตามที่เอกสารหลักสูตรระบุไว้) */
  function termHours(c) {
    var v = function (k) { var x = parseFloat(s(c[k])); return isFinite(x) ? x : 0; };
    return { theory: v('term_theory'), lab: v('term_lab'), practice: v('term_practice'), self: v('term_self') };
  }
  function termHoursCell(c) {
    var h = termHours(c);
    var contact = h.theory + h.lab + h.practice;
    if (!contact && !h.self) return '<span class="text-gray-300">-</span>';
    var part = [];
    if (h.theory) part.push('ทฤษฎี ' + h.theory);
    if (h.lab) part.push('ทดลอง ' + h.lab);
    if (h.practice) part.push('ปฏิบัติ ' + h.practice);
    if (h.self) part.push('ตนเอง ' + h.self);
    return '<span class="text-gray-800 font-semibold tabular-nums">' + contact + '</span>'
      + '<span class="block text-[11px] text-gray-400">' + part.join(' · ') + '</span>';
  }

  window.curExportCourses = function () {
    var st = state();
    var rows = coursesOf(st.year);
    var head = ['รหัสวิชา', 'ชื่อไทย', 'ชื่ออังกฤษ', 'หน่วยกิต', 'ทฤษฎี/สัปดาห์', 'ทดลอง/สัปดาห์', 'ตนเอง/สัปดาห์',
      'ทฤษฎี/ภาค', 'ทดลอง/ภาค', 'ปฏิบัติ/ภาค', 'ตนเอง/ภาค', 'หมวด'];
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [head.map(q).join(',')].concat(rows.map(function (c) {
      var h = termHours(c);
      return [c.course_code, c.name_th, c.name_en, c.credits, c.h_theory, c.h_lab, c.h_self,
        h.theory, h.lab, h.practice, h.self, c.course_group].map(q).join(',');
    }));
    var blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'curriculum_' + st.year + '_courses.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---------------- แท็บ 3 : PLOs ---------------- */
  function ploTab(y) {
    var all = plosOf(y);
    if (!all.length) return empty('ยังไม่มีผลลัพธ์การเรียนรู้ของหลักสูตรฉบับนี้');

    var mains = all.filter(function (p) { return !s(p.parent_code); });
    var subsOf = function (code) {
      return all.filter(function (p) { return s(p.parent_code) === s(code); });
    };

    var note = '<div class="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-gray-600 mb-4 flex items-start gap-2">'
      + '<i data-lucide="info" class="w-4 h-4 text-primary flex-shrink-0 mt-0.5"></i>'
      + '<span>ผลลัพธ์การเรียนรู้ระดับหลักสูตร (Program Learning Outcomes) '
      + 'คือสิ่งที่ผู้เรียนต้องทำได้เมื่อสิ้นสุดการเรียนการสอนตลอดหลักสูตร</span></div>';

    return note + mains.map(function (p) {
      var subs = subsOf(p.plo_code);
      return '<div class="border border-gray-100 rounded-xl p-4 mb-3">'
        + '<div class="flex items-start gap-3">'
        + '<span class="flex-shrink-0 w-14 text-center px-2 py-1 rounded-lg bg-primary text-white text-xs font-semibold">'
        + esc(p.plo_code) + '</span>'
        + '<p class="text-sm text-gray-800 leading-relaxed flex-1">' + esc(p.statement_th) + '</p></div>'
        + (subs.length
            ? '<ul class="mt-3 ml-16 space-y-1.5">' + subs.map(function (x) {
                var n = courseCountOf(x.plo_code);
                return '<li class="text-sm text-gray-600 flex gap-2">'
                  + '<span class="font-mono text-xs text-gray-400 flex-shrink-0 pt-0.5">' + esc(x.plo_code) + '</span>'
                  + '<span class="flex-1">' + esc(x.statement_th) + '</span>'
                  + '<span class="flex-shrink-0 text-xs px-2 py-0.5 rounded-lg '
                  + (n ? 'bg-surface text-gray-500' : 'bg-red-50 text-red-600') + '" '
                  + 'title="จำนวนรายวิชาที่รับผิดชอบผลลัพธ์ข้อนี้">'
                  + (n ? n + ' วิชา' : 'ยังไม่มีรายวิชา') + '</span></li>';
              }).join('') + '</ul>'
            : '')
        + (s(p.teaching_th) || s(p.assess_th)
            ? '<div class="grid md:grid-cols-2 gap-3 mt-3 ml-16">'
              + (s(p.teaching_th) ? block('กลยุทธ์/วิธีการสอน', p.teaching_th, 'bg-emerald-50 border-emerald-100') : '')
              + (s(p.assess_th) ? block('การวัดและประเมินผล', p.assess_th, 'bg-amber-50 border-amber-100') : '')
              + '</div>'
            : '')
        + '</div>';
    }).join('');
  }

  // นับจำนวนรายวิชาที่รับผิดชอบผลลัพธ์ข้อนั้น (จาก Curriculum Mapping)
  function courseCountOf(ploCode) {
    var st = state(), n = 0, seen = {};
    mapOf(st.year).forEach(function (m) {
      if (s(m.plo_code) !== s(ploCode)) return;
      var c = s(m.course_code);
      if (c && !seen[c]) { seen[c] = 1; n++; }
    });
    return n;
  }

  function block(title, text, cls) {
    return '<div class="rounded-xl border p-3 ' + cls + '">'
      + '<p class="text-xs font-semibold text-gray-700 mb-1">' + esc(title) + '</p>'
      + '<p class="text-xs text-gray-600 leading-relaxed whitespace-pre-line">' + esc(text) + '</p></div>';
  }

  /* ---------------- แท็บ 4 : Curriculum Mapping ---------------- */
  function mapTab(y) {
    var rows = mapOf(y);
    if (!rows.length) {
      return empty('ยังไม่มีข้อมูลแผนที่กระจายความรับผิดชอบของหลักสูตรฉบับนี้'
        + (canEdit() ? ' — รอนำเข้าจากไฟล์ต้นฉบับ' : ''));
    }

    var courses = coursesOf(y);
    var plos = plosOf(y).filter(function (p) { return s(p.parent_code); });
    if (!plos.length) plos = plosOf(y);

    var key = {};
    rows.forEach(function (m) { key[s(m.course_code) + '|' + s(m.plo_code)] = s(m.level); });

    var tally = {};
    rows.forEach(function (m) { var l = s(m.level); if (l) tally[l] = (tally[l] || 0) + 1; });
    var legend = '<div class="flex flex-wrap items-center gap-2 mb-4">'
      + Object.keys(LEVELS).map(function (k) {
          return '<span class="px-2.5 py-1 rounded-lg text-xs ' + LEVELS[k].cls + '">'
            + '<b>' + k + '</b> ' + esc(LEVELS[k].label) + ' · ' + esc(LEVELS[k].th)
            + (tally[k] ? ' <b>(' + tally[k] + ')</b>' : '') + '</span>';
        }).join('')
      + '<span class="text-xs text-gray-400 ml-auto">' + courses.length + ' รายวิชา × '
      + plos.length + ' ผลลัพธ์ย่อย · เลื่อนตารางไปทางขวาเพื่อดูให้ครบ</span></div>';

    // แถวบน: จัดกลุ่มตาม PLO หลัก เพื่อให้อ่านตารางกว้าง ๆ ได้ง่ายขึ้น
    var groups = [], last = null;
    plos.forEach(function (p) {
      var parent = s(p.parent_code) || s(p.plo_code);
      if (last && last.parent === parent) { last.span++; return; }
      last = { parent: parent, span: 1 };
      groups.push(last);
    });
    var mainOf = {};
    plosOf(y).forEach(function (p) { if (!s(p.parent_code)) mainOf[s(p.plo_code)] = p; });

    var head = '<tr class="bg-surface">'
      + '<th rowspan="2" class="px-3 py-2 text-left text-xs font-semibold sticky left-0 bg-surface z-10 align-bottom">รายวิชา</th>'
      + groups.map(function (g, i) {
          var m = mainOf[g.parent];
          return '<th colspan="' + g.span + '" class="px-1 py-1.5 text-center text-[10px] font-semibold whitespace-nowrap '
            + (i % 2 ? 'bg-blue-50/60' : '') + '" title="' + esc(m ? m.statement_th : '') + '">'
            + esc(g.parent.replace('PLO', 'PLO ')) + '</th>';
        }).join('')
      + '</tr><tr class="bg-surface">'
      + plos.map(function (p) {
          return '<th class="px-1 py-1.5 text-center text-[10px] font-normal text-gray-500 whitespace-nowrap" title="'
            + esc(p.statement_th) + '">' + esc(p.plo_code) + '</th>';
        }).join('') + '</tr>';

    var body = courses.map(function (c) {
      return '<tr class="border-t border-gray-50">'
        + '<td class="px-3 py-2 text-xs sticky left-0 bg-white z-10 whitespace-nowrap">'
        + '<span class="font-mono text-gray-400">' + esc(c.course_code) + '</span> ' + esc(c.name_th) + '</td>'
        + plos.map(function (p) {
            var lv = key[s(c.course_code) + '|' + s(p.plo_code)] || '';
            return '<td class="px-1 py-2 text-center">' + (lv
              ? '<span class="inline-block w-6 rounded text-[10px] font-bold ' + ((LEVELS[lv] || {}).cls || 'bg-gray-100 text-gray-600') + '">' + esc(lv) + '</span>'
              : '<span class="text-gray-200">·</span>') + '</td>';
          }).join('') + '</tr>';
    }).join('');

    return legend + '<div class="overflow-x-auto border border-gray-100 rounded-xl">'
      + '<table class="w-full"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function empty(msg) {
    return '<div class="text-center py-14 text-gray-400 text-sm">'
      + '<i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2"></i><p>' + esc(msg) + '</p></div>';
  }

  /* ---------------- เติมข้อมูลรายวิชาจากหลักสูตรอัตโนมัติ ----------------
     ใช้ในฟอร์ม "เพิ่มรายวิชา" ของเมนูรายวิชาที่เปิดสอน
     พิมพ์รหัสวิชาแล้วชื่อไทย/อังกฤษ/หน่วยกิต จะถูกเติมให้ถ้าตรงกับหลักสูตร */
  window.curFillFromCurriculum = function (input) {
    var form = input && input.form;
    if (!form) return;
    var code = s(input.value).replace(/\s+/g, '').toLowerCase();
    if (code.length < 3) return;

    var hit = null;
    get('curriculum_course').some(function (c) {
      if (s(c.course_code).replace(/\s+/g, '').toLowerCase() === code) { hit = c; return true; }
      return false;
    });
    if (!hit) return;

    var set = function (name, val) {
      var f = form.querySelector('[name="' + name + '"]');
      if (f && !s(f.value)) f.value = val;
    };
    set('subject_name', s(hit.name_th));
    set('subject_name_en', s(hit.name_en));
    set('credits', s(hit.credits));
    set('hours_theory', s(hit.h_theory));
    set('hours_lab', s(hit.h_lab));
    set('hours_self', s(hit.h_self));
    if (typeof updateCreditPreview === 'function') {
      var cr = form.querySelector('[name="credits"]');
      if (cr) updateCreditPreview(cr);
    }
  };

  /* ---------------- ต่อเข้ากับระบบเดิม ---------------- */
  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (page === 'curriculum') return window.curriculumPage();
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    // แทรกปุ่มเมนูให้ปลอดภัย
    //   เมนูอ้างอิงบางตัวอยู่ในกลุ่มที่พับได้ จึงไม่ใช่ลูกโดยตรงของแถบเมนู
    //   ต้องไต่ขึ้นไปหาบรรพบุรุษที่เป็นลูกของแถบเมนูก่อน ไม่งั้น insertBefore จะล้มเหลว
    function insertNav(nav, btn, selector) {
      var ref = nav.querySelector(selector);
      while (ref && ref.parentNode && ref.parentNode !== nav) ref = ref.parentNode;
      if (ref && ref.parentNode === nav) nav.insertBefore(btn, ref);
      else nav.appendChild(btn);
    }

    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      try { addItem(); } catch (e) { console.warn('เพิ่มเมนู ข้อมูลหลักสูตร ไม่สำเร็จ:', e); }
    };

    function addItem() {
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.curriculum) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-page="curriculum"]')) return;
      var btn = document.createElement('button');
      btn.setAttribute('onclick', "navigateTo('curriculum')");
      btn.setAttribute('data-page', 'curriculum');
      btn.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
      btn.innerHTML = '<i data-lucide="graduation-cap" class="w-5 h-5 flex-shrink-0"></i>ข้อมูลหลักสูตร';
      // วางไว้ก่อนเมนูปฏิทินกิจกรรมวิชาการ ให้อยู่ต้น ๆ ของกลุ่มงานวิชาการ
      insertNav(nav, btn, '[data-page="schedule"]');
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
