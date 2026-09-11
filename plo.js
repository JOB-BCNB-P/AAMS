/* ================================================================
   plo.js — เมนู "ประเมินผลหลักสูตร PLOs"
   ----------------------------------------------------------------
   แนวคิด
     CLO  = ผลลัพธ์การเรียนรู้ระดับรายวิชา (กรอกเอง พร้อมคะแนนเต็ม/เกณฑ์ผ่าน)
     PLO  = ผลลัพธ์ระดับหลักสูตร — CLO แต่ละข้อผูกกับ PLO/Sub-PLO หนึ่งข้อ
     YLO  = ผลลัพธ์ระดับชั้นปี — คำนวณจาก CLO ของรายวิชาในชั้นปีนั้น

   ร้อยละการบรรลุ = ผลการประเมินที่ผ่าน ÷ ผลการประเมินทั้งหมด × 100
     ระดับ CLO เท่ากับร้อยละนักศึกษาที่ผ่าน CLO ข้อนั้น
     ระดับ PLO/YLO ถัวเฉลี่ยจาก CLO ที่เกี่ยวข้อง

   เกณฑ์ตัดสิน "บรรลุ" และ "ระดับคุณภาพ" อยู่ในตาราง plo_setting / plo_band
   แก้ได้โดยไม่ต้องแก้โค้ด

   การคำนวณสรุปทำที่เซิร์ฟเวอร์ (ems_plo_summary) เพราะตารางคะแนนรายคนใหญ่
   เบราว์เซอร์จึงไม่ต้องโหลดคะแนนทั้งหมด
   ================================================================ */
(function () {
  'use strict';

  var SEMS = ['1', '2', '3'];
  var VIEWS = [['plo', 'ราย PLO'], ['clo', 'ราย CLO'], ['ylo', 'ราย YLO (ชั้นปี)']];

  // สีระดับคุณภาพ — ตรวจผ่านเครื่องมือตรวจสีสำหรับผู้มีภาวะตาบอดสีแล้ว
  // ทุกแท่งมีตัวเลขและชื่อระดับกำกับเสมอ ไม่ใช้สีสื่อความหมายเพียงอย่างเดียว
  var BAND = {
    red:     { bar: '#ef4444', bg: 'bg-red-50',     text: 'text-red-700',     ring: 'border-red-200' },
    amber:   { bar: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'border-amber-200' },
    sky:     { bar: '#0ea5e9', bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'border-sky-200' },
    emerald: { bar: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'border-emerald-200' }
  };
  var GREY = { bar: '#9ca3af', bg: 'bg-gray-50', text: 'text-gray-600', ring: 'border-gray-200' };
  function bandOf(o) { return (o && BAND[o.color]) || GREY; }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function n(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function fx(v, d) { return n(v).toFixed(d == null ? 2 : d); }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function sb() { return GSheetDB.client(); }

  function state() {
    if (!APP._plo) {
      APP._plo = {
        tab: 'summary', view: 'plo',
        curriculum: '', batch: '', year: '', sem: '',
        summary: null, loading: false,
        // แท็บบันทึกข้อมูล
        eYear: '', eSem: '1', eLevel: '1', eSubject: '', clos: null, scores: null,
        stuQuery: '', stuResult: null
      };
    }
    var st = APP._plo;
    if (!st.curriculum) st.curriculum = (get('curriculum')[0] || {}).curriculum_year || '2565';
    if (!st.year) st.year = yearsList()[0] || '';
    if (!st.eYear) st.eYear = st.year;
    return st;
  }

  function yearsList() {
    var ys = get('subject').map(function (x) { return s(x.academic_year); })
      .concat(get('plo_clo').map(function (x) { return s(x.academic_year); }))
      .filter(Boolean);
    var seen = {}, out = [];
    ys.forEach(function (y) { if (!seen[y]) { seen[y] = 1; out.push(y); } });
    return out.sort().reverse();
  }
  // รหัสรุ่น = ปีการศึกษา - ชั้นปี + 1 (ใช้กฎเดียวกับเมนูภาระงานนักศึกษา)
  function cohortPrefix(year, level) {
    if (typeof window.wlCohortPrefix === 'function') return window.wlCohortPrefix(year, level);
    var y = parseInt(String(year || '').slice(-2), 10), l = parseInt(level, 10) || 1;
    if (isNaN(y)) return '';
    var p = ((y - l + 1) % 100 + 100) % 100;
    return (p < 10 ? '0' : '') + p;
  }
  function batchList() {
    var out = [], seen = {};
    get('student').forEach(function (x) {
      var p = s(x.student_id).slice(0, 2);
      if (p && !seen[p]) { seen[p] = 1; out.push(p); }
    });
    return out.sort().reverse();
  }
  function canEdit() {
    var roles = (APP._roles && APP._roles.length) ? APP._roles : [APP.currentRole];
    return roles.some(function (r) {
      return r === 'admin' || r === 'academic' || r === 'teacher' || r === 'classTeacher';
    });
  }
  function ploOptions() {
    var st = state();
    return get('curriculum_plo')
      .filter(function (p) { return s(p.curriculum_year) === s(st.curriculum); })
      .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); });
  }

  /* ================= หน้าหลัก ================= */
  window.ploPage = function ploPage() {
    var st = state();
    var head = '<div class="flex flex-wrap items-start justify-between gap-3 mb-5">'
      + '<div><h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">'
      + '<i data-lucide="target" class="w-5 h-5 text-primary"></i>ประเมินผลหลักสูตร PLOs</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">อัตราการบรรลุผลลัพธ์การเรียนรู้ระดับรายวิชา หลักสูตร และชั้นปี</p></div>'
      + '</div>';

    var tabs = '<div class="flex flex-wrap gap-2 mb-5 border-b border-gray-100 pb-3">'
      + [['summary', 'สรุปผลรวม', 'bar-chart-3'], ['entry', 'บันทึกข้อมูล', 'pencil-line']]
        .map(function (t) {
          if (t[0] === 'entry' && !canEdit()) return '';
          var on = st.tab === t[0];
          return '<button onclick="ploSet(\'tab\',\'' + t[0] + '\')" class="px-3.5 py-2 rounded-xl text-sm flex items-center gap-2 transition '
            + (on ? 'bg-primary text-white' : 'text-gray-600 hover:bg-surface') + '">'
            + '<i data-lucide="' + t[2] + '" class="w-4 h-4"></i>' + t[1] + '</button>';
        }).join('')
      + '</div>';

    var body = st.tab === 'entry' && canEdit() ? entryTab() : summaryTab();
    return '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">'
      + head + tabs + body + '</div>';
  };

  window.ploSet = function (k, v) {
    var st = state();
    st[k] = v;
    if (['curriculum', 'batch', 'year', 'sem'].indexOf(k) >= 0) st.summary = null;
    if (['eYear', 'eSem', 'eLevel'].indexOf(k) >= 0) { st.eSubject = ''; st.scores = null; }
    if (k === 'eSubject') st.scores = null;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  /* ================= แท็บ 1 : สรุปผลรวม ================= */
  function filterBar() {
    var st = state();
    var sel = function (label, key, opts, blank) {
      return '<div><label class="block text-xs text-gray-600 mb-1">' + esc(label) + '</label>'
        + '<select onchange="ploSet(\'' + key + '\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
        + (blank ? '<option value="">' + esc(blank) + '</option>' : '')
        + opts.map(function (o) {
            var v = o[0], t = o[1];
            return '<option value="' + esc(v) + '"' + (s(st[key]) === s(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
          }).join('')
        + '</select></div>';
    };
    return '<div class="flex flex-wrap items-end gap-3 mb-5">'
      + sel('หลักสูตร', 'curriculum',
          get('curriculum').map(function (c) { return [c.curriculum_year, 'ฉบับปรับปรุง ' + c.curriculum_year]; }))
      + sel('รุ่นนักศึกษา', 'batch', batchList().map(function (b) { return [b, 'รหัส ' + b]; }), 'ทุกรุ่น')
      + sel('ปีการศึกษา', 'year', yearsList().map(function (y) { return [y, y]; }), 'ทุกปี')
      + sel('ภาคการศึกษา', 'sem', SEMS.map(function (x) { return [x, x === '3' ? 'ฤดูร้อน' : x]; }), 'ทุกภาค')
      + '<button onclick="ploLoad()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm flex items-center gap-2 hover:bg-primaryDark">'
      + '<i data-lucide="refresh-cw" class="w-4 h-4"></i>โหลดข้อมูล</button>'
      + '<button onclick="ploExportPDF()" class="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm flex items-center gap-2 hover:bg-surface">'
      + '<i data-lucide="file-down" class="w-4 h-4"></i>บันทึกเป็น PDF</button>'
      + '</div>';
  }

  window.ploLoad = async function () {
    var st = state();
    st.loading = true;
    if (typeof showToast === 'function') showToast('กำลังคำนวณผลการบรรลุ...');
    try {
      var r = await sb().rpc('ems_plo_summary', {
        p_curriculum: st.curriculum,
        p_batch: st.batch || null,
        p_year: st.year || null,
        p_semester: st.sem || null
      });
      var t = document.getElementById('loadingToast'); if (t) t.remove();
      if (r.error) { showToast('โหลดไม่สำเร็จ: ' + r.error.message, 'error'); st.loading = false; return; }
      st.summary = r.data || {};
      st.loading = false;
      if (typeof showToast === 'function') showToast('คำนวณเสร็จแล้ว');
    } catch (e) {
      st.loading = false;
      if (typeof showToast === 'function') showToast('โหลดไม่สำเร็จ: ' + e, 'error');
    }
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  function summaryTab() {
    var st = state();
    var body;
    if (!st.summary) {
      body = hint('เลือกตัวกรองด้านบนแล้วกด "โหลดข้อมูล" เพื่อคำนวณผลการบรรลุ');
    } else {
      var ov = st.summary['ภาพรวม'] || {};
      if (!ov['ผลการประเมินทั้งหมด']) {
        body = hint('ยังไม่มีคะแนนที่บันทึกไว้ในเงื่อนไขที่เลือก — ไปที่แท็บ "บันทึกข้อมูล" เพื่อกำหนด CLO และกรอกคะแนน');
      } else {
        body = cards(ov) + chartBlock() + watchTable() + studentBox();
      }
    }
    return filterBar() + body;
  }

  function hint(msg) {
    return '<div class="text-center py-14 text-gray-400 text-sm">'
      + '<i data-lucide="bar-chart-3" class="w-8 h-8 mx-auto mb-2"></i><p>' + esc(msg) + '</p></div>';
  }

  function cards(ov) {
    var b = bandOf(ov['ระดับ']);
    var pct = n(ov['ร้อยละบรรลุ']);
    var card = function (label, value, sub, cls) {
      return '<div class="rounded-2xl border p-4 ' + (cls || 'border-gray-100 bg-surface') + '">'
        + '<p class="text-xs text-gray-500">' + esc(label) + '</p>'
        + '<p class="text-2xl font-bold mt-1">' + value + '</p>'
        + (sub ? '<p class="text-xs text-gray-500 mt-0.5">' + sub + '</p>' : '') + '</div>';
    };
    return '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">'
      + card('ร้อยละการบรรลุภาพรวม',
          '<span class="' + b.text + '">' + fx(pct) + '%</span>',
          '<span class="' + b.text + ' font-medium">ระดับ ' + esc((ov['ระดับ'] || {}).label || '-') + '</span>',
          b.bg + ' ' + b.ring)
      + card('ผลการประเมินทั้งหมด', esc(ov['ผลการประเมินทั้งหมด']),
          'ผ่าน ' + esc(ov['ผ่าน']) + ' · ไม่ผ่าน ' + esc(ov['ไม่ผ่าน']))
      + card('จำนวนนักศึกษา', esc(ov['จำนวนนักศึกษา']), 'ที่มีคะแนนบันทึกไว้')
      + card('จำนวนรายวิชา', esc(ov['จำนวนรายวิชา']), 'ที่กำหนด CLO แล้ว')
      + '</div>';
  }

  /* ---------- กราฟแท่งอัตราการบรรลุ ----------
     ใช้แท่งแนวนอนเพราะเป็นการเทียบค่าระหว่างหมวดที่มีชื่อยาว
     มีเส้นเกณฑ์กำกับ และทุกแท่งมีตัวเลข + ชื่อระดับเสมอ */
  function chartBlock() {
    var st = state();
    var key = st.view === 'clo' ? 'ราย CLO' : st.view === 'ylo' ? 'ราย YLO (ชั้นปี)' : 'ราย PLO';
    var rows = (st.summary || {})[key] || [];

    var toggle = '<div class="flex flex-wrap items-center gap-2 mb-4">'
      + VIEWS.map(function (v) {
          var on = st.view === v[0];
          return '<button onclick="ploSet(\'view\',\'' + v[0] + '\')" class="px-3 py-1.5 rounded-lg text-xs transition '
            + (on ? 'bg-primary text-white' : 'border border-gray-200 text-gray-600 hover:bg-surface') + '">'
            + esc(v[1]) + '</button>';
        }).join('')
      + '<span class="text-xs text-gray-400 ml-auto">' + rows.length + ' รายการ</span></div>';

    if (!rows.length) return section('อัตราการบรรลุ', toggle + hint('ไม่มีข้อมูลในมุมมองนี้'));

    var label = function (r) {
      if (st.view === 'clo') return s(r['รายวิชา']) + ' · ' + s(r['CLO']);
      if (st.view === 'ylo') return 'ชั้นปีที่ ' + s(r['ชั้นปี']);
      return s(r['PLO']).replace('PLO', 'PLO ');
    };

    var bars = rows.map(function (r) {
      var pct = n(r['ร้อยละบรรลุ']);
      var b = bandOf(r['ระดับ']);
      var crit = r['เกณฑ์'] != null ? n(r['เกณฑ์']) : null;
      var okMark = r['บรรลุ'] === true ? '<i data-lucide="check" class="w-3.5 h-3.5 inline text-emerald-600"></i>'
        : r['บรรลุ'] === false ? '<i data-lucide="x" class="w-3.5 h-3.5 inline text-red-600"></i>' : '';
      return '<div class="mb-3">'
        + '<div class="flex items-baseline gap-2 mb-1">'
        + '<span class="text-xs text-gray-700 flex-1 truncate" title="' + esc(label(r)) + '">' + esc(label(r)) + '</span>'
        + '<span class="text-xs font-semibold ' + b.text + ' whitespace-nowrap">' + okMark + ' ' + fx(pct) + '%</span>'
        + '<span class="text-[11px] ' + b.text + ' whitespace-nowrap">' + esc((r['ระดับ'] || {}).label || '') + '</span>'
        + '</div>'
        + '<div class="relative h-3 rounded-full bg-gray-100 overflow-visible">'
        + '<div class="h-3 rounded-full" style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + b.bar + '"></div>'
        + (crit != null
            ? '<div class="absolute top-[-3px] h-[18px] border-l-2 border-gray-500" style="left:' + Math.min(100, crit) + '%" '
              + 'title="เกณฑ์บรรลุ ' + fx(crit, 0) + '%"></div>'
            : '')
        + '</div>'
        + '<p class="text-[11px] text-gray-400 mt-0.5">ผ่าน ' + esc(r['ผ่าน']) + ' จาก '
        + esc(r['นักศึกษา'] != null ? r['นักศึกษา'] : r['ผลการประเมิน']) + ' ผลการประเมิน'
        + (crit != null ? ' · เกณฑ์ ' + fx(crit, 0) + '%' : '') + '</p>'
        + '</div>';
    }).join('');

    var legend = '<div class="flex flex-wrap gap-2 mb-3 text-[11px]">'
      + ['red|ต้องปรับปรุง (< 60%)', 'amber|พอใช้ (60–69.99%)', 'sky|มาก (70–79.99%)', 'emerald|มากที่สุด (≥ 80%)']
        .map(function (x) {
          var p = x.split('|');
          return '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ' + BAND[p[0]].bg + ' ' + BAND[p[0]].text + '">'
            + '<span style="width:8px;height:8px;border-radius:50%;background:' + BAND[p[0]].bar + ';display:inline-block"></span>'
            + esc(p[1]) + '</span>';
        }).join('')
      + '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 text-gray-500">'
      + '<span style="width:2px;height:11px;background:#6b7280;display:inline-block"></span>เส้นเกณฑ์บรรลุ</span></div>';

    return section('อัตราการบรรลุ', toggle + legend + '<div class="mt-1">' + bars + '</div>');
  }

  function watchTable() {
    var st = state();
    var rows = (st.summary || {})['รายวิชาที่ต้องติดตาม'] || [];
    var inner;
    if (!rows.length) {
      inner = '<div class="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">'
        + '<i data-lucide="check-circle-2" class="w-4 h-4"></i>ไม่มีรายวิชาที่มีนักศึกษาไม่ผ่านเกินเกณฑ์</div>';
    } else {
      inner = '<div class="overflow-x-auto"><table class="w-full text-sm">'
        + '<thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold">รายวิชา</th>'
        + '<th class="px-3 py-2 font-semibold">CLO</th>'
        + '<th class="px-3 py-2 font-semibold">PLO</th>'
        + '<th class="px-3 py-2 font-semibold text-center">ชั้นปี</th>'
        + '<th class="px-3 py-2 font-semibold text-center">ภาค/ปี</th>'
        + '<th class="px-3 py-2 font-semibold text-right">ไม่ผ่าน</th>'
        + '<th class="px-3 py-2 font-semibold text-right">ร้อยละไม่ผ่าน</th></tr></thead><tbody>'
        + rows.map(function (r) {
            return '<tr class="border-t border-gray-50">'
              + '<td class="px-3 py-2.5"><span class="font-mono text-xs text-gray-400">' + esc(r['รหัสวิชา']) + '</span> ' + esc(r['รายวิชา']) + '</td>'
              + '<td class="px-3 py-2.5">' + esc(r['CLO']) + '</td>'
              + '<td class="px-3 py-2.5">' + esc(r['PLO']) + '</td>'
              + '<td class="px-3 py-2.5 text-center">' + esc(r['ชั้นปี']) + '</td>'
              + '<td class="px-3 py-2.5 text-center whitespace-nowrap">' + esc(r['ภาคเรียน']) + '/' + esc(r['ปีการศึกษา']) + '</td>'
              + '<td class="px-3 py-2.5 text-right">' + esc(r['ไม่ผ่าน']) + ' / ' + esc(r['นักศึกษา']) + '</td>'
              + '<td class="px-3 py-2.5 text-right font-semibold text-red-600">' + fx(r['ร้อยละไม่ผ่าน']) + '%</td></tr>';
          }).join('')
        + '</tbody></table></div>';
    }
    return section('รายวิชาที่ต้องติดตาม <span class="text-xs font-normal text-gray-400">(นักศึกษาไม่ผ่านเกินเกณฑ์ที่ตั้งไว้)</span>', inner);
  }

  /* ---------- ค้นหารายชื่อนักศึกษา ---------- */
  function studentBox() {
    var st = state();
    var res = st.stuResult;
    var box = '<div class="flex flex-wrap items-end gap-3 mb-3">'
      + '<div class="flex-1 min-w-[240px] relative">'
      + '<i data-lucide="search" class="absolute left-3 top-2.5 w-4 h-4 text-gray-400"></i>'
      + '<input id="ploStuSearch" type="text" value="' + esc(st.stuQuery) + '" list="ploStuList" '
      + 'placeholder="พิมพ์รหัสนักศึกษาหรือชื่อ แล้วกด Enter..." '
      + 'class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm" '
      + 'onchange="ploFindStudent(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();ploFindStudent(this.value)}">'
      + studentDatalist() + '</div>'
      + '<button onclick="ploFindStudent(document.getElementById(\'ploStuSearch\').value)" '
      + 'class="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-surface">ค้นหา</button>'
      + (res ? '<button onclick="ploSet(\'stuResult\',null)" class="px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600">ล้าง</button>' : '')
      + '</div>';

    if (!res) return section('ผลการบรรลุรายบุคคล', box + '<p class="text-xs text-gray-400">ค้นหาเพื่อดูผลราย CLO ของนักศึกษาแต่ละคน</p>');

    var ov = res['ภาพรวม'] || {};
    var b = bandOf(ov['ระดับ']);
    var head = '<div class="rounded-xl border ' + b.ring + ' ' + b.bg + ' p-4 mb-3">'
      + '<p class="font-semibold text-gray-800">' + esc(res['ชื่อ'] || '-') + ' <span class="font-mono text-xs text-gray-500">' + esc(res['รหัสนักศึกษา']) + '</span></p>'
      + (ov['ผลการประเมิน']
          ? '<p class="text-sm mt-1 ' + b.text + '">ผ่าน ' + esc(ov['ผ่าน']) + ' จาก ' + esc(ov['ผลการประเมิน'])
            + ' ผลการประเมิน · <b>' + fx(ov['ร้อยละผ่าน']) + '%</b> · ระดับ ' + esc((ov['ระดับ'] || {}).label || '-') + '</p>'
          : '<p class="text-sm text-gray-500 mt-1">ยังไม่มีคะแนนที่บันทึกไว้</p>')
      + '</div>';

    var plos = (res['ราย PLO'] || []).map(function (r) {
      return '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-xs text-gray-600 mr-1.5 mb-1.5">'
        + '<b>' + esc(s(r['PLO']).replace('PLO', 'PLO ')) + '</b> ' + fx(r['ร้อยละผ่าน'], 0) + '%</span>';
    }).join('');

    var clos = (res['ราย CLO'] || []);
    var tbl = !clos.length ? '' : '<div class="overflow-x-auto mt-3"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold">รายวิชา</th><th class="px-3 py-2 font-semibold">CLO</th>'
      + '<th class="px-3 py-2 font-semibold">PLO</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ภาค/ปี</th>'
      + '<th class="px-3 py-2 font-semibold text-right">คะแนน</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ผล</th></tr></thead><tbody>'
      + clos.map(function (r) {
          return '<tr class="border-t border-gray-50">'
            + '<td class="px-3 py-2.5">' + esc(r['รายวิชา']) + '</td>'
            + '<td class="px-3 py-2.5">' + esc(r['CLO']) + '</td>'
            + '<td class="px-3 py-2.5">' + esc(r['PLO']) + '</td>'
            + '<td class="px-3 py-2.5 text-center whitespace-nowrap">' + esc(r['ภาคเรียน']) + '/' + esc(r['ปีการศึกษา']) + '</td>'
            + '<td class="px-3 py-2.5 text-right">' + esc(r['คะแนน']) + ' / ' + esc(r['คะแนนเต็ม'])
            + ' <span class="text-xs text-gray-400">(ผ่าน ' + esc(r['เกณฑ์ผ่าน']) + ')</span></td>'
            + '<td class="px-3 py-2.5 text-center">' + (r['ผ่าน']
                ? '<span class="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs">ผ่าน</span>'
                : '<span class="px-2 py-0.5 rounded-lg bg-red-50 text-red-700 text-xs">ไม่ผ่าน</span>') + '</td></tr>';
        }).join('')
      + '</tbody></table></div>';

    return section('ผลการบรรลุรายบุคคล', box + head + plos + tbl);
  }

  function studentDatalist() {
    var st = state();
    var list = get('student').filter(function (x) {
      return !st.batch || s(x.student_id).slice(0, 2) === s(st.batch);
    }).slice(0, 900);
    return '<datalist id="ploStuList">'
      + list.map(function (x) {
          return '<option value="' + esc(x.student_id) + '">' + esc(x.name) + '</option>';
        }).join('') + '</datalist>';
  }

  window.ploFindStudent = async function (q) {
    var st = state();
    q = s(q);
    st.stuQuery = q;
    if (!q) { st.stuResult = null; renderCurrentPage(); return; }
    // ผู้ใช้อาจพิมพ์ชื่อ — แปลงเป็นรหัสนักศึกษาก่อน
    var sid = q;
    if (!/^\d{6,}$/.test(q)) {
      var hit = get('student').filter(function (x) {
        return s(x.name).indexOf(q) >= 0 || s(x.student_id) === q;
      })[0];
      if (hit) sid = s(hit.student_id);
    }
    try {
      var r = await sb().rpc('ems_plo_student', {
        p_student_id: sid, p_curriculum: st.curriculum,
        p_year: st.year || null, p_semester: st.sem || null
      });
      if (r.error) { showToast('ค้นหาไม่สำเร็จ: ' + r.error.message, 'error'); return; }
      st.stuResult = r.data || null;
    } catch (e) { showToast('ค้นหาไม่สำเร็จ: ' + e, 'error'); return; }
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  function section(title, inner) {
    return '<div class="mb-6"><h3 class="font-semibold text-gray-700 mb-3">' + title + '</h3>' + inner + '</div>';
  }

  /* ---------- บันทึกเป็น PDF ---------- */
  window.ploExportPDF = function () {
    var st = state();
    if (!st.summary) { showToast('กรุณากดโหลดข้อมูลก่อน', 'error'); return; }
    var node = document.getElementById('mainContent');
    if (!node) return;
    var w = window.open('', '_blank');
    if (!w) { showToast('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาตแล้วลองอีกครั้ง', 'error'); return; }
    var f = st.summary['ตัวกรอง'] || {};
    w.document.write('<!doctype html><html><head><meta charset="utf-8">'
      + '<title>รายงานผลการบรรลุ PLOs</title>'
      + '<script src="https://cdn.tailwindcss.com"><\/script>'
      + '<style>body{font-family:Sarabun,"Segoe UI",Tahoma,sans-serif;padding:24px}'
      + '@media print{.no-print{display:none}}</style></head><body>'
      + '<h1 style="font-size:20px;font-weight:700;margin:0 0 4px">รายงานผลการบรรลุผลลัพธ์การเรียนรู้ (PLOs)</h1>'
      + '<p style="font-size:13px;color:#6b7280;margin:0 0 16px">วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ · '
      + 'หลักสูตรฉบับปรับปรุง ' + esc(f['หลักสูตร'] || '') + ' · รุ่น ' + esc(f['รุ่น'] || 'ทุกรุ่น')
      + ' · ปีการศึกษา ' + esc(f['ปีการศึกษา'] || 'ทุกปี') + ' · ภาคเรียน ' + esc(f['ภาคเรียน'] || 'ทุกภาค') + '</p>'
      + node.innerHTML
      + '<p class="no-print" style="margin-top:20px;font-size:12px;color:#6b7280">'
      + 'กด Ctrl+P แล้วเลือก "บันทึกเป็น PDF"</p></body></html>');
    w.document.close();
    setTimeout(function () { try { w.print(); } catch (e) { } }, 800);
  };

  /* ================= แท็บ 2 : บันทึกข้อมูล ================= */
  function subjectsOf(year, sem, level) {
    return get('subject').filter(function (x) {
      return s(x.academic_year) === s(year) && s(x.semester) === s(sem)
        && (!level || s(x.year_level) === s(level));
    }).sort(function (a, b) { return s(a.subject_code).localeCompare(s(b.subject_code)); });
  }
  function closOf(year, sem, code) {
    var st = state();
    return get('plo_clo').filter(function (x) {
      return s(x.curriculum_year) === s(st.curriculum)
        && s(x.academic_year) === s(year) && s(x.semester) === s(sem)
        && s(x.subject_code) === s(code);
    }).sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); });
  }

  function entryTab() {
    var st = state();
    var sel = function (label, key, opts) {
      return '<div><label class="block text-xs text-gray-600 mb-1">' + esc(label) + '</label>'
        + '<select onchange="ploSet(\'' + key + '\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
        + opts.map(function (o) {
            return '<option value="' + esc(o[0]) + '"' + (s(st[key]) === s(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
          }).join('') + '</select></div>';
    };

    var pick = '<div class="flex flex-wrap items-end gap-3 mb-5">'
      + sel('ปีการศึกษา', 'eYear', yearsList().map(function (y) { return [y, y]; }))
      + sel('ภาคการศึกษา', 'eSem', SEMS.map(function (x) { return [x, x === '3' ? 'ฤดูร้อน' : x]; }))
      + sel('ชั้นปี', 'eLevel', ['1', '2', '3', '4'].map(function (l) {
          var p = cohortPrefix(st.eYear, l);
          return [l, 'ชั้นปีที่ ' + l + (p ? ' (รหัส ' + p + ')' : '')];
        }))
      + '</div>';

    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    if (!subs.length) return pick + hint('ไม่มีรายวิชาที่เปิดสอนในภาค/ปี/ชั้นปีที่เลือก');

    var list = '<div class="grid md:grid-cols-2 gap-2 mb-6">'
      + subs.map(function (x) {
          var nc = closOf(st.eYear, st.eSem, x.subject_code).length;
          var on = s(st.eSubject) === s(x.subject_code);
          return '<button onclick="ploSet(\'eSubject\',\'' + esc(x.subject_code) + '\')" '
            + 'class="text-left rounded-xl border px-3 py-2.5 transition '
            + (on ? 'border-primary bg-blue-50' : 'border-gray-100 hover:bg-surface') + '">'
            + '<div class="flex items-center justify-between gap-2">'
            + '<span class="text-sm text-gray-800">' + esc(x.subject_name) + '</span>'
            + '<span class="text-xs px-2 py-0.5 rounded-lg flex-shrink-0 '
            + (nc ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500') + '">'
            + (nc ? nc + ' CLO' : 'ยังไม่กำหนด') + '</span></div>'
            + '<div class="text-xs text-gray-400 font-mono mt-0.5">' + esc(x.subject_code) + '</div></button>';
        }).join('')
      + '</div>';

    var body = st.eSubject ? cloEditor() : hint('เลือกรายวิชาด้านบนเพื่อกำหนด CLO และกรอกคะแนน');
    return pick + section('รายวิชาที่เปิดสอน <span class="text-xs font-normal text-gray-400">('
      + subs.length + ' วิชา)</span>', list) + body;
  }

  /* ---------- กำหนด CLO ของรายวิชา ---------- */
  function cloEditor() {
    var st = state();
    var subj = subjectsOf(st.eYear, st.eSem, st.eLevel).filter(function (x) {
      return s(x.subject_code) === s(st.eSubject);
    })[0] || {};
    var rows = closOf(st.eYear, st.eSem, st.eSubject);

    var opts = ploOptions();
    var ploSelect = function (id, val) {
      return '<select id="' + id + '" class="w-full border rounded-lg px-2 py-1.5 text-sm">'
        + '<option value="">— เลือก PLO —</option>'
        + opts.map(function (p) {
            var isSub = !!s(p.parent_code);
            var t = (isSub ? '   ' : '') + s(p.plo_code) + ' ' + s(p.statement_th).slice(0, 60);
            return '<option value="' + esc(p.plo_code) + '"' + (s(val) === s(p.plo_code) ? ' selected' : '') + '>'
              + esc(t) + '</option>';
          }).join('') + '</select>';
    };

    var table = !rows.length
      ? '<p class="text-sm text-gray-400 mb-3">ยังไม่มี CLO ในรายวิชานี้</p>'
      : '<div class="overflow-x-auto mb-3"><table class="w-full text-sm">'
        + '<thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold w-20">CLO</th>'
        + '<th class="px-3 py-2 font-semibold">คำอธิบาย</th>'
        + '<th class="px-3 py-2 font-semibold w-44">PLO ที่ผูก</th>'
        + '<th class="px-3 py-2 font-semibold text-center w-24">คะแนนเต็ม</th>'
        + '<th class="px-3 py-2 font-semibold text-center w-24">เกณฑ์ผ่าน</th>'
        + '<th class="px-3 py-2 w-10"></th></tr></thead><tbody>'
        + rows.map(function (r) {
            return '<tr class="border-t border-gray-50">'
              + '<td class="px-3 py-2 font-semibold">' + esc(r.clo_code) + '</td>'
              + '<td class="px-3 py-2">' + esc(r.statement_th) + '</td>'
              + '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded-lg bg-blue-50 text-primary text-xs">'
              + esc(r.plo_code || '—') + '</span></td>'
              + '<td class="px-3 py-2 text-center">' + esc(r.max_score) + '</td>'
              + '<td class="px-3 py-2 text-center">' + esc(r.pass_score) + '</td>'
              + '<td class="px-3 py-2 text-right">'
              + '<button onclick="ploDeleteClo(' + esc(r.__backendId) + ')" class="text-gray-300 hover:text-red-500" title="ลบ CLO นี้">'
              + '<i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>';
          }).join('')
        + '</tbody></table></div>';

    var form = '<div class="border border-gray-100 rounded-xl p-4 bg-surface/50 mb-4">'
      + '<p class="text-xs font-semibold text-gray-600 mb-2">เพิ่ม CLO</p>'
      + '<div class="grid md:grid-cols-12 gap-2 items-end">'
      + '<div class="md:col-span-2"><label class="block text-[11px] text-gray-500 mb-1">รหัส CLO</label>'
      + '<input id="cloCode" value="CLO' + (rows.length + 1) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div class="md:col-span-4"><label class="block text-[11px] text-gray-500 mb-1">คำอธิบาย</label>'
      + '<input id="cloText" class="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="ผู้เรียนสามารถ..."></div>'
      + '<div class="md:col-span-3"><label class="block text-[11px] text-gray-500 mb-1">ผูกกับ PLO</label>' + ploSelect('cloPlo', '') + '</div>'
      + '<div class="md:col-span-1"><label class="block text-[11px] text-gray-500 mb-1">เต็ม</label>'
      + '<input id="cloMax" type="number" value="100" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div class="md:col-span-1"><label class="block text-[11px] text-gray-500 mb-1">ผ่าน</label>'
      + '<input id="cloPass" type="number" value="60" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div class="md:col-span-1"><button onclick="ploAddClo(false)" class="w-full px-3 py-1.5 bg-primary text-white rounded-lg text-sm">เพิ่ม</button></div>'
      + '</div>'
      + '<div class="mt-2 flex items-center gap-2">'
      + '<button onclick="ploAddClo(true)" class="text-xs text-primary hover:underline flex items-center gap-1">'
      + '<i data-lucide="copy-plus" class="w-3.5 h-3.5"></i>เพิ่ม CLO นี้ให้ทุกรายวิชาของชั้นปีที่ ' + esc(st.eLevel) + '</button>'
      + '<span class="text-[11px] text-gray-400">(ข้ามรายวิชาที่มีรหัส CLO นี้อยู่แล้ว)</span></div>'
      + '</div>';

    var scores = rows.length ? scoreGrid(rows) : '';

    return section('CLO ของรายวิชา <span class="text-primary">' + esc(subj.subject_name || st.eSubject) + '</span>',
      table + form) + scores;
  }

  window.ploAddClo = async function (wholeYear) {
    var st = state();
    var code = s((document.getElementById('cloCode') || {}).value);
    var text = s((document.getElementById('cloText') || {}).value);
    var plo = s((document.getElementById('cloPlo') || {}).value);
    var max = s((document.getElementById('cloMax') || {}).value);
    var pass = s((document.getElementById('cloPass') || {}).value);
    if (!code) { showToast('กรุณากรอกรหัส CLO', 'error'); return; }
    if (!plo) { showToast('กรุณาเลือก PLO ที่ CLO นี้ผูกอยู่', 'error'); return; }
    if (!pass) { showToast('กรุณากรอกเกณฑ์ผ่าน', 'error'); return; }

    var targets = wholeYear
      ? subjectsOf(st.eYear, st.eSem, st.eLevel)
      : subjectsOf(st.eYear, st.eSem, st.eLevel).filter(function (x) { return s(x.subject_code) === s(st.eSubject); });
    if (!targets.length) { showToast('ไม่พบรายวิชาปลายทาง', 'error'); return; }

    var batch = cohortPrefix(st.eYear, st.eLevel);
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var made = 0, skipped = 0;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var dup = closOf(st.eYear, st.eSem, t.subject_code).some(function (c) { return s(c.clo_code) === code; });
      if (dup) { skipped++; continue; }
      var r = await GSheetDB.create({
        type: 'plo_clo', curriculum_year: st.curriculum,
        academic_year: st.eYear, semester: st.eSem, year_level: st.eLevel, batch: batch,
        subject_code: t.subject_code, subject_name: t.subject_name,
        clo_code: code, statement_th: text, plo_code: plo,
        max_score: max, pass_score: pass,
        sort_order: closOf(st.eYear, st.eSem, t.subject_code).length + 1,
        updated_by: who
      }, { noRefresh: i < targets.length - 1 });
      if (r && r.isOk) made++;
    }
    showToast('เพิ่ม CLO แล้ว ' + made + ' รายวิชา' + (skipped ? ' · ข้าม ' + skipped + ' วิชาที่มีอยู่แล้ว' : ''));
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  window.ploDeleteClo = async function (id) {
    var rec = APP.allData.find(function (d) { return String(d.__backendId) === String(id); });
    if (!rec) return;
    if (!confirm('ลบ ' + s(rec.clo_code) + ' ของรายวิชานี้?\n\nคะแนนนักศึกษาที่บันทึกไว้ใน CLO นี้จะถูกลบไปด้วย')) return;
    var r = await GSheetDB.delete(rec);
    if (r && r.isOk) { showToast('ลบแล้ว'); state().scores = null; renderCurrentPage(); }
    else showToast('ลบไม่สำเร็จ: ' + ((r && r.error) || ''), 'error');
  };

  /* ---------- ตารางกรอกคะแนนรายคน ---------- */
  function scoreGrid(rows) {
    var st = state();
    var batch = cohortPrefix(st.eYear, st.eLevel);
    var studs = get('student').filter(function (x) {
      return s(x.student_id).slice(0, 2) === batch && s(x.status) !== 'ลาออก';
    }).sort(function (a, b) { return s(a.student_id).localeCompare(s(b.student_id)); });

    if (!studs.length) return section('กรอกคะแนนรายคน', hint('ไม่พบนักศึกษารหัส ' + batch));
    if (!st.scores) {
      return section('กรอกคะแนนรายคน',
        '<button onclick="ploLoadScores()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm flex items-center gap-2">'
        + '<i data-lucide="download" class="w-4 h-4"></i>เปิดตารางกรอกคะแนน ('
        + studs.length + ' คน × ' + rows.length + ' CLO)</button>');
    }

    var head = '<tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold sticky left-0 bg-surface z-10">นักศึกษา</th>'
      + rows.map(function (r) {
          return '<th class="px-2 py-2 font-semibold text-center whitespace-nowrap" title="' + esc(r.statement_th) + '">'
            + esc(r.clo_code) + '<div class="text-[10px] font-normal text-gray-400">เต็ม ' + esc(r.max_score)
            + ' · ผ่าน ' + esc(r.pass_score) + '</div></th>';
        }).join('') + '</tr>';

    var body = studs.map(function (u) {
      return '<tr class="border-t border-gray-50">'
        + '<td class="px-3 py-1.5 sticky left-0 bg-white z-10 whitespace-nowrap">'
        + '<span class="font-mono text-xs text-gray-400">' + esc(u.student_id) + '</span> ' + esc(u.name) + '</td>'
        + rows.map(function (r) {
            var key = r.__backendId + '|' + u.student_id;
            var v = st.scores[key];
            var pass = v != null && v !== '' && n(v) >= n(r.pass_score);
            var cls = (v == null || v === '') ? '' : (pass ? 'bg-emerald-50' : 'bg-red-50');
            return '<td class="px-1 py-1 text-center"><input type="number" step="0.01" value="' + esc(v == null ? '' : v) + '" '
              + 'data-clo="' + esc(r.__backendId) + '" data-stu="' + esc(u.student_id) + '" '
              + 'oninput="ploScoreInput(this)" class="w-20 border rounded-lg px-2 py-1 text-sm text-center ' + cls + '"></td>';
          }).join('') + '</tr>';
    }).join('');

    return section('กรอกคะแนนรายคน <span class="text-xs font-normal text-gray-400">(ช่องเขียวคือผ่านเกณฑ์ · แดงคือไม่ผ่าน)</span>',
      '<div class="overflow-x-auto border border-gray-100 rounded-xl max-h-[70vh]">'
      + '<table class="w-full text-sm"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="flex items-center gap-3 mt-3">'
      + '<button onclick="ploSaveScores()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm flex items-center gap-2">'
      + '<i data-lucide="save" class="w-4 h-4"></i>บันทึกคะแนน</button>'
      + '<span id="ploScoreMsg" class="text-xs text-gray-400">แก้ไขแล้วกดบันทึกครั้งเดียว</span></div>');
  }

  window.ploLoadScores = async function () {
    var st = state();
    var rows = closOf(st.eYear, st.eSem, st.eSubject);
    var ids = rows.map(function (r) { return Number(r.__backendId); }).filter(Boolean);
    st.scores = {};
    if (ids.length) {
      try {
        var r = await sb().rpc('ems_plo_scores', { clo_ids: ids });
        if (r.error) { showToast('โหลดคะแนนไม่สำเร็จ: ' + r.error.message, 'error'); return; }
        (r.data || []).forEach(function (x) { st.scores[x.clo_id + '|' + x.student_id] = x.score; });
      } catch (e) { showToast('โหลดคะแนนไม่สำเร็จ: ' + e, 'error'); return; }
    }
    st._dirty = {};
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  window.ploScoreInput = function (el) {
    var st = state();
    var key = el.getAttribute('data-clo') + '|' + el.getAttribute('data-stu');
    st.scores[key] = el.value;
    if (!st._dirty) st._dirty = {};
    st._dirty[key] = true;
    // ระบายสีช่องทันทีโดยไม่ต้องวาดหน้าใหม่ (คงเคอร์เซอร์ไว้)
    var rows = closOf(st.eYear, st.eSem, st.eSubject);
    var clo = rows.filter(function (r) { return String(r.__backendId) === el.getAttribute('data-clo'); })[0];
    el.classList.remove('bg-emerald-50', 'bg-red-50');
    if (clo && s(el.value) !== '') {
      el.classList.add(n(el.value) >= n(clo.pass_score) ? 'bg-emerald-50' : 'bg-red-50');
    }
    var m = document.getElementById('ploScoreMsg');
    if (m) { m.textContent = 'มีการแก้ไขที่ยังไม่บันทึก'; m.className = 'text-xs text-amber-600'; }
  };

  window.ploSaveScores = async function () {
    var st = state();
    var dirty = Object.keys(st._dirty || {});
    if (!dirty.length) { showToast('ไม่มีการแก้ไข'); return; }
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var payload = dirty.map(function (k) {
      var p = k.split('|');
      return { clo_id: Number(p[0]), student_id: p[1],
               score: s(st.scores[k]) === '' ? null : Number(st.scores[k]), updated_by: who };
    }).filter(function (x) { return x.score !== null; });

    if (typeof showToast === 'function') showToast('กำลังบันทึก ' + payload.length + ' รายการ...');
    var r = await sb().from('plo_score').upsert(payload, { onConflict: 'clo_id,student_id' });
    var t = document.getElementById('loadingToast'); if (t) t.remove();
    if (r.error) { showToast('บันทึกไม่สำเร็จ: ' + r.error.message, 'error'); return; }
    st._dirty = {};
    st.summary = null;
    showToast('บันทึกคะแนนเรียบร้อย ' + payload.length + ' รายการ');
    var m = document.getElementById('ploScoreMsg');
    if (m) { m.textContent = 'บันทึกแล้ว'; m.className = 'text-xs text-emerald-600'; }
  };

  /* ================= ต่อเข้ากับระบบเดิม ================= */
  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (page === 'ploAssess') return window.ploPage();
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.ploAssess) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-page="ploAssess"]')) return;
      var btn = document.createElement('button');
      btn.setAttribute('onclick', "navigateTo('ploAssess')");
      btn.setAttribute('data-page', 'ploAssess');
      btn.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
      btn.innerHTML = '<i data-lucide="target" class="w-5 h-5 flex-shrink-0"></i>ประเมินผลหลักสูตร PLOs';
      var before = nav.querySelector('[data-page="teacherDirectory"], [data-page="services"], [data-page="survey"]');
      if (before) nav.insertBefore(btn, before); else nav.appendChild(btn);
      if (window.lucide) lucide.createIcons();
    };
  })();
})();
