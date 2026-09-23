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
  /* รายชื่อนักศึกษาของรุ่นที่กำลังกรอกอยู่ (รหัส 2 ตัวแรกตรงกับรหัสรุ่นของชั้นปีนั้น)
     ใช้ร่วมกันระหว่างตารางกรอกคะแนนกับการนำเข้า/ส่งออก CSV จะได้เป็นรายชื่อชุดเดียวกันเสมอ */
  function entryStudents() {
    var st = state();
    var batch = cohortPrefix(st.eYear, st.eLevel);
    return get('student').filter(function (x) {
      return s(x.student_id).slice(0, 2) === batch && s(x.status) !== 'ลาออก';
    }).sort(function (a, b) { return s(a.student_id).localeCompare(s(b.student_id)); });
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
      + subs.length + ' วิชา)</span>', list) + csvPanel() + body;
  }

  /* ================= นำเข้า/ส่งออกข้อมูลผ่านไฟล์ CSV =================
     แม่แบบที่ดาวน์โหลดจะมีข้อมูลเดิมติดมาด้วย จึงใช้เป็นไฟล์สำรองหรือแก้ไขต่อได้เลย
     ตอนอัปโหลดระบบดูจากหัวตารางว่าเป็นไฟล์ CLO หรือไฟล์คะแนน ไม่ต้องเลือกเอง */
  function csvPanel() {
    var st = state();
    var nClo = st.eSubject ? closOf(st.eYear, st.eSem, st.eSubject).length : 0;
    var btn = function (onclick, icon, label, cls) {
      return '<button onclick="' + onclick + '" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm ' + cls + '">'
        + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' + esc(label) + '</button>';
    };
    return '<div class="border border-emerald-100 bg-emerald-50/40 rounded-2xl p-4 mb-6">'
      + '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">'
      + '<p class="text-sm font-semibold text-gray-700"><i data-lucide="file-spreadsheet" class="w-4 h-4 inline mr-1 text-emerald-600"></i>'
      + 'นำเข้าข้อมูลผ่านไฟล์ CSV</p>'
      + '<span class="text-[11px] text-gray-500">ปีการศึกษา ' + esc(st.eYear) + ' · ภาค '
      + esc(st.eSem === '3' ? 'ฤดูร้อน' : st.eSem) + ' · ชั้นปีที่ ' + esc(st.eLevel) + '</span></div>'
      + '<div class="flex flex-wrap gap-2 mb-2">'
      + btn('ploCsvTemplateAll()', 'download', 'แม่แบบรวมไฟล์เดียว (CLO + คะแนน)', 'border-emerald-600 text-white bg-emerald-600 hover:bg-emerald-700')
      + btn('ploCsvPick()', 'upload', 'อัปโหลดไฟล์ CSV', 'border-primary text-primary bg-white hover:bg-primaryLight')
      + '</div>'
      + '<details class="mb-2"><summary class="text-[11px] text-gray-500 cursor-pointer">แม่แบบแยกไฟล์ (แบบเดิม)</summary>'
      + '<div class="flex flex-wrap gap-2 mt-2">'
      + btn('ploCsvTemplate(\'clo\')', 'download', 'แม่แบบ CLO อย่างเดียว', 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50')
      + btn('ploCsvTemplate(\'score\')', 'download', 'แม่แบบคะแนนอย่างเดียว', 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50')
      + '</div></details>'
      + '<input type="file" id="ploCsvInput" accept=".csv,text/csv" class="hidden" onchange="ploCsvFile(event)">'
      + '<p class="text-[11px] text-gray-500">'
      + '<b>แม่แบบรวม</b> มีทั้ง CLO และคะแนนรายคนอยู่ในไฟล์เดียว แยกด้วยคอลัมน์แรก "ประเภท"<br>'
      + 'แถว <b>CLO</b> = รหัส CLO · คำอธิบาย · PLO ที่ผูก · คะแนนเต็ม · เกณฑ์ผ่าน &nbsp;|&nbsp; '
      + 'แถว <b>คะแนน</b> = รหัสนักศึกษา · รหัส CLO · คะแนนที่ได้<br>'
      + 'นำเข้าทีเดียว ระบบจะบันทึก CLO ให้ก่อนแล้วค่อยผูกคะแนนตามรหัส CLO'
      + (st.eSubject ? (nClo ? ' — ตอนนี้มี ' + nClo + ' CLO' : ' — รายวิชานี้ยังไม่ได้กำหนด CLO') : ' — เลือกรายวิชาก่อน')
      + '<br>ระบบจะสรุปให้ดูก่อนว่าจะเพิ่มหรือแก้อะไรบ้าง แล้วค่อยกดยืนยัน</p>'
      + '</div>';
  }

  /* อ่านไฟล์ CSV ให้ถูกต้องแม้มีจุลภาคหรือขึ้นบรรทัดใหม่อยู่ในเครื่องหมายคำพูด
     (คำอธิบาย CLO ภาษาไทยมักมีจุลภาค การตัดด้วย split(',') เฉย ๆ จะทำให้ข้อมูลเพี้ยน) */
  function parseCsv(text) {
    var out = [], row = [], cur = '', q = false;
    text = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); out.push(row); }
    return out.filter(function (r) { return r.some(function (c) { return s(c) !== ''; }); });
  }

  function csvCell(v) {
    var t = String(v == null ? '' : v);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function csvDownload(name, rows) {
    var text = '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.ploCsvTemplate = function (kind) {
    var st = state();
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    if (!subs.length) { showToast('ไม่มีรายวิชาในภาค/ปี/ชั้นปีที่เลือก', 'error'); return; }

    if (kind === 'clo') {
      var rows = [['subject_code', 'subject_name', 'clo_code', 'statement_th', 'plo_code', 'max_score', 'pass_score']];
      var target = st.eSubject ? subs.filter(function (x) { return s(x.subject_code) === s(st.eSubject); }) : subs;
      if (!target.length) target = subs;
      target.forEach(function (x) {
        var cs = closOf(st.eYear, st.eSem, x.subject_code);
        if (cs.length) {
          cs.forEach(function (c) {
            rows.push([x.subject_code, x.subject_name, c.clo_code, c.statement_th, c.plo_code, c.max_score, c.pass_score]);
          });
        } else {
          // ยังไม่มี CLO — ใส่แถวเปล่าไว้ให้กรอก (เว้นรหัส CLO ไว้ ระบบจะข้ามแถวที่ไม่ได้กรอก)
          rows.push([x.subject_code, x.subject_name, '', '', '', '100', '60']);
        }
      });
      csvDownload('plo_clo_' + s(st.eYear) + '_' + s(st.eSem) + '_ชั้นปี' + s(st.eLevel) + '.csv', rows);
      showToast('ดาวน์โหลดแม่แบบ CLO แล้ว (' + (rows.length - 1) + ' แถว)');
      return;
    }

    if (!st.eSubject) { showToast('เลือกรายวิชาก่อน จึงจะทำแม่แบบคะแนนได้', 'error'); return; }
    var clos = closOf(st.eYear, st.eSem, st.eSubject);
    if (!clos.length) { showToast('รายวิชานี้ยังไม่ได้กำหนด CLO — นำเข้า CLO ก่อน', 'error'); return; }
    var studs = entryStudents();
    if (!studs.length) { showToast('ไม่พบนักศึกษารหัส ' + cohortPrefix(st.eYear, st.eLevel), 'error'); return; }

    var head = ['student_id', 'name'].concat(clos.map(function (c) { return s(c.clo_code); }));
    var rows2 = [head];
    studs.forEach(function (u) {
      rows2.push([u.student_id, u.name].concat(clos.map(function (c) {
        var v = st.scores ? st.scores[c.__backendId + '|' + u.student_id] : '';
        return (v == null ? '' : v);
      })));
    });
    csvDownload('plo_score_' + s(st.eSubject) + '_' + s(st.eYear) + '_' + s(st.eSem) + '.csv', rows2);
    showToast('ดาวน์โหลดแม่แบบคะแนนแล้ว (' + studs.length + ' คน × ' + clos.length + ' CLO)'
      + (st.scores ? '' : ' — คะแนนเดิมจะติดมาด้วยถ้ากด "เปิดตารางกรอกคะแนน" ก่อนดาวน์โหลด'));
  };

  /* ================================================================
     แม่แบบรวมไฟล์เดียว — CLO และคะแนนรายคนอยู่ในไฟล์เดียวกัน
     แยกด้วยคอลัมน์แรก "ประเภท"
       CLO    = นิยาม CLO ของรายวิชา (คำอธิบาย ผูกกับ PLO คะแนนเต็ม เกณฑ์ผ่าน)
       คะแนน  = คะแนนของนักศึกษาหนึ่งคนใน CLO หนึ่งข้อ
     นำเข้าทีเดียวจบ ระบบสร้าง CLO ให้ก่อนแล้วค่อยผูกคะแนนตามรหัส CLO
     ================================================================ */
  var ALL_HEAD = ['ประเภท', 'subject_code', 'subject_name', 'clo_code', 'statement_th',
    'plo_code', 'max_score', 'pass_score', 'student_id', 'name', 'score'];

  function rowKind(v) {
    var x = s(v).toLowerCase();
    if (x === 'clo') return 'clo';
    if (x === 'คะแนน' || x === 'score') return 'score';
    return '';
  }

  window.ploCsvTemplateAll = function () {
    var st = state();
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    if (!subs.length) { showToast('ไม่มีรายวิชาในภาค/ปี/ชั้นปีที่เลือก', 'error'); return; }
    var target = st.eSubject ? subs.filter(function (x) { return s(x.subject_code) === s(st.eSubject); }) : subs;
    if (!target.length) target = subs;

    var rows = [ALL_HEAD.slice()];
    var studs = entryStudents();
    var nClo = 0, nScore = 0;

    target.forEach(function (x) {
      var cs = closOf(st.eYear, st.eSem, x.subject_code);
      if (cs.length) {
        cs.forEach(function (c) {
          rows.push(['CLO', x.subject_code, x.subject_name, c.clo_code, c.statement_th,
            c.plo_code, c.max_score, c.pass_score, '', '', '']);
          nClo++;
        });
      } else {
        // ยังไม่มี CLO — เว้นรหัสไว้ให้กรอก ระบบจะข้ามแถวที่ยังไม่ได้กรอก
        rows.push(['CLO', x.subject_code, x.subject_name, '', '', '', '100', '60', '', '', '']);
      }
    });

    // แถวคะแนน — ทำให้เฉพาะรายวิชาที่เลือกและมี CLO อยู่แล้ว จะได้ไม่เป็นไฟล์ยักษ์
    if (st.eSubject && studs.length) {
      var clos = closOf(st.eYear, st.eSem, st.eSubject);
      var subj = target[0] || {};
      clos.forEach(function (c) {
        studs.forEach(function (u) {
          var v = st.scores ? st.scores[c.__backendId + '|' + u.student_id] : '';
          rows.push(['คะแนน', s(subj.subject_code), '', s(c.clo_code), '', '', '', '',
            s(u.student_id), s(u.name), (v == null ? '' : v)]);
          nScore++;
        });
      });
    }

    csvDownload('plo_รวม_' + s(st.eYear) + '_' + s(st.eSem) + '_ชั้นปี' + s(st.eLevel)
      + (st.eSubject ? '_' + s(st.eSubject) : '') + '.csv', rows);
    showToast('ดาวน์โหลดแม่แบบรวมแล้ว — CLO ' + nClo + ' ข้อ · ช่องคะแนน ' + nScore + ' ช่อง'
      + (st.eSubject ? '' : ' (เลือกรายวิชาก่อนจึงจะมีแถวคะแนนมาด้วย)'));
  };

  function ploCsvPlanAll(rows, head, fname) {
    var st = state();
    var idx = function (k) { return head.indexOf(k); };
    var iKind = idx('ประเภท') >= 0 ? idx('ประเภท') : idx('type');
    var iSub = idx('subject_code'), iCode = idx('clo_code'), iText = idx('statement_th'),
      iPlo = idx('plo_code'), iMax = idx('max_score'), iPass = idx('pass_score'),
      iSid = idx('student_id'), iScore = idx('score');

    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var ploOk = {};
    ploOptions().forEach(function (p) { ploOk[s(p.plo_code)] = 1; });
    var stuOk = {};
    entryStudents().forEach(function (u) { stuOk[s(u.student_id)] = 1; });

    var cloPlan = [], scorePlan = [], bad = [], seen = {}, blank = 0;
    var nStu = {}, willHave = {};

    // ---- รอบแรก : แถว CLO ----
    rows.slice(1).forEach(function (r, i) {
      if (rowKind(r[iKind]) !== 'clo') return;
      var line = i + 2;
      var code = s(r[iCode]);
      if (!code) return;                       // แถวเปล่าของแม่แบบ ข้ามเงียบ ๆ
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      var subj = subs.filter(function (x) { return s(x.subject_code) === scode; })[0];
      if (!subj) { bad.push('บรรทัด ' + line + ' : ไม่พบรายวิชา ' + (scode || '(ไม่ได้ระบุ)') + ' ในภาค/ปี/ชั้นปีที่เลือก'); return; }
      var key = scode + '|' + code;
      if (seen[key]) { bad.push('บรรทัด ' + line + ' : ' + code + ' ของวิชา ' + scode + ' ซ้ำกับบรรทัด ' + seen[key]); return; }
      seen[key] = line;
      var plo = s(r[iPlo]);
      if (!plo) { bad.push('บรรทัด ' + line + ' : ' + code + ' ไม่ได้ระบุ PLO'); return; }
      if (!ploOk[plo]) { bad.push('บรรทัด ' + line + ' : ไม่พบ PLO รหัส ' + plo + ' ในหลักสูตร'); return; }
      var pass = iPass >= 0 ? s(r[iPass]) : '';
      if (pass === '' || !isFinite(Number(pass))) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านต้องเป็นตัวเลข'); return; }
      var max = iMax >= 0 ? s(r[iMax]) : '';
      if (max !== '' && !isFinite(Number(max))) { bad.push('บรรทัด ' + line + ' : ' + code + ' คะแนนเต็มต้องเป็นตัวเลข'); return; }
      if (max !== '' && Number(pass) > Number(max)) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านมากกว่าคะแนนเต็ม'); return; }
      var exist = closOf(st.eYear, st.eSem, scode).filter(function (c) { return s(c.clo_code) === code; })[0] || null;
      cloPlan.push({
        subj: subj, code: code, text: iText >= 0 ? s(r[iText]) : '',
        plo: plo, max: max === '' ? '100' : max, pass: pass, exist: exist
      });
      willHave[key] = { max: max === '' ? '100' : max };
    });

    // CLO ที่มีอยู่แล้วในระบบ ก็ผูกคะแนนได้ แม้ไฟล์นี้จะไม่ได้นิยามซ้ำ
    subs.forEach(function (x) {
      closOf(st.eYear, st.eSem, x.subject_code).forEach(function (c) {
        var k = s(x.subject_code) + '|' + s(c.clo_code);
        if (!willHave[k]) willHave[k] = { max: s(c.max_score) };
      });
    });

    // ---- รอบสอง : แถวคะแนน ----
    rows.slice(1).forEach(function (r, i) {
      if (rowKind(r[iKind]) !== 'score') return;
      var line = i + 2;
      var sid = s(r[iSid]);
      var code = s(r[iCode]);
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      if (!sid && !code) return;
      if (!sid) { bad.push('บรรทัด ' + line + ' : แถวคะแนนไม่ได้ระบุรหัสนักศึกษา'); return; }
      if (!code) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ไม่ได้ระบุรหัส CLO'); return; }
      if (!stuOk[sid]) { bad.push('บรรทัด ' + line + ' : ไม่พบรหัสนักศึกษา ' + sid + ' ในรุ่นนี้'); return; }
      var k = scode + '|' + code;
      var info = willHave[k];
      if (!info) { bad.push('บรรทัด ' + line + ' : ไม่พบ ' + code + ' ของวิชา ' + (scode || '(ไม่ได้ระบุ)') + ' ทั้งในไฟล์และในระบบ'); return; }
      var v = iScore >= 0 ? s(r[iScore]) : '';
      if (v === '') { blank++; return; }        // เว้นว่าง = ยังไม่ให้คะแนน ไม่ใช่ศูนย์
      if (!isFinite(Number(v))) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + code + ' "' + v + '" ไม่ใช่ตัวเลข'); return; }
      var num = Number(v);
      if (num < 0) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + code + ' คะแนนติดลบ'); return; }
      var max = Number(info.max);
      if (isFinite(max) && max > 0 && num > max) {
        bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + code + ' คะแนน ' + num + ' เกินคะแนนเต็ม ' + max); return;
      }
      scorePlan.push({ subject_code: scode, clo_code: code, student_id: sid, score: num });
      nStu[sid] = 1;
    });

    var add = cloPlan.filter(function (x) { return !x.exist; }).length;
    var upd = cloPlan.length - add;
    APP._ploCsv = { kind: 'all', plan: cloPlan, scores: scorePlan };

    csvReview('นำเข้าไฟล์รวม ' + fname,
      '<div class="grid grid-cols-4 gap-2 text-center">'
      + '<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p class="text-2xl font-bold text-emerald-700">' + add + '</p><p class="text-xs text-gray-600">CLO เพิ่มใหม่</p></div>'
      + '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3"><p class="text-2xl font-bold text-primary">' + upd + '</p><p class="text-xs text-gray-600">CLO แก้ของเดิม</p></div>'
      + '<div class="rounded-xl bg-sky-50 border border-sky-100 p-3"><p class="text-2xl font-bold text-sky-700">' + scorePlan.length + '</p><p class="text-xs text-gray-600">คะแนน (' + Object.keys(nStu).length + ' คน)</p></div>'
      + '<div class="rounded-xl bg-gray-50 border border-gray-100 p-3"><p class="text-2xl font-bold text-gray-500">' + bad.length + '</p><p class="text-xs text-gray-600">ข้ามไป</p></div>'
      + '</div>'
      + '<p class="text-xs text-gray-500">ปีการศึกษา ' + esc(st.eYear) + ' · ภาค ' + esc(st.eSem) + ' · ชั้นปีที่ ' + esc(st.eLevel)
      + ' — ระบบจะบันทึก CLO ก่อน แล้วจึงผูกคะแนนตามรหัส CLO'
      + (blank ? ' · ช่องคะแนนที่เว้นว่างไว้ ' + blank + ' ช่อง จะไม่ถูกแตะ (ไม่ใช่ให้ 0)' : '') + '</p>',
      bad, cloPlan.length + scorePlan.length);
  }

  window.ploCsvPick = function () {
    var el = document.getElementById('ploCsvInput');
    if (!el) { showToast('ไม่พบช่องเลือกไฟล์', 'error'); return; }
    el.value = '';
    el.click();
  };

  window.ploCsvFile = async function (ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!f) return;
    var text = '';
    try { text = await f.text(); } catch (e) { showToast('อ่านไฟล์ไม่สำเร็จ: ' + e, 'error'); return; }
    var rows = parseCsv(text);
    if (rows.length < 2) { showToast('ไฟล์ CSV ไม่มีข้อมูล', 'error'); return; }
    var head = rows[0].map(function (x) { return s(x).toLowerCase(); });
    // ไฟล์รวมมาก่อน เพราะมีทั้ง clo_code และ student_id อยู่ในไฟล์เดียว
    if (head.indexOf('ประเภท') >= 0 || head.indexOf('type') >= 0) { ploCsvPlanAll(rows, head, f.name); return; }
    if (head.indexOf('clo_code') >= 0) { ploCsvPlanClo(rows, head, f.name); return; }
    if (head.indexOf('student_id') >= 0) { ploCsvPlanScore(rows, head, f.name); return; }
    showModal('อ่านไฟล์ไม่ออก',
      '<p class="text-sm text-gray-600">หัวตารางของไฟล์นี้ไม่ตรงกับแม่แบบที่ระบบรองรับ</p>'
      + '<p class="text-xs text-gray-500 mt-2">ไฟล์รวมต้องมีคอลัมน์ <b>ประเภท</b> เป็นคอลัมน์แรก'
      + ' · ไฟล์ CLO อย่างเดียวต้องมี <b>clo_code</b> · ไฟล์คะแนนอย่างเดียวต้องมี <b>student_id</b></p>'
      + '<p class="text-xs text-gray-400 mt-2">หัวตารางที่พบ: ' + esc(rows[0].join(', ')) + '</p>');
  };

  // สรุปผลตรวจก่อนบันทึก — ผู้ใช้ต้องกดยืนยันเองทุกครั้ง
  function csvReview(title, summary, problems, count) {
    var html = '<div class="space-y-3">' + summary
      + (problems.length
          ? '<div class="border border-amber-200 bg-amber-50 rounded-xl p-3">'
            + '<p class="text-xs font-semibold text-amber-800 mb-1">ข้ามไป ' + problems.length + ' รายการ</p>'
            + '<ul class="text-[11px] text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">'
            + problems.slice(0, 50).map(function (x) { return '<li>• ' + esc(x) + '</li>'; }).join('')
            + (problems.length > 50 ? '<li class="text-amber-600">… และอีก ' + (problems.length - 50) + ' รายการ</li>' : '')
            + '</ul></div>'
          : '')
      + (count ? '' : '<p class="text-sm text-red-600">ไม่มีรายการที่นำเข้าได้</p>')
      + '</div>';
    showModal(title, html, count ? function () { return window.ploCsvApply(); } : null, 'max-w-2xl');
  }

  function ploCsvPlanClo(rows, head, fname) {
    var st = state();
    var idx = function (k) { return head.indexOf(k); };
    var iSub = idx('subject_code'), iCode = idx('clo_code'), iText = idx('statement_th'),
        iPlo = idx('plo_code'), iMax = idx('max_score'), iPass = idx('pass_score');
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var ploOk = {};
    ploOptions().forEach(function (p) { ploOk[s(p.plo_code)] = 1; });

    var plan = [], bad = [], seen = {};
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2;
      var code = s(r[iCode]);
      if (!code) return;   // แถวเปล่าของแม่แบบ — ข้ามเงียบ ๆ ไม่ถือว่าผิด
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      var subj = subs.filter(function (x) { return s(x.subject_code) === scode; })[0];
      if (!subj) { bad.push('บรรทัด ' + line + ' : ไม่พบรายวิชา ' + (scode || '(ไม่ได้ระบุ)') + ' ในภาค/ปี/ชั้นปีที่เลือก'); return; }
      var key = scode + '|' + code;
      if (seen[key]) { bad.push('บรรทัด ' + line + ' : ' + code + ' ของวิชา ' + scode + ' ซ้ำกับบรรทัด ' + seen[key]); return; }
      seen[key] = line;
      var plo = s(r[iPlo]);
      if (!plo) { bad.push('บรรทัด ' + line + ' : ' + code + ' ไม่ได้ระบุ PLO'); return; }
      if (!ploOk[plo]) { bad.push('บรรทัด ' + line + ' : ไม่พบ PLO รหัส ' + plo + ' ในหลักสูตร'); return; }
      var pass = iPass >= 0 ? s(r[iPass]) : '';
      if (pass === '' || !isFinite(Number(pass))) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านต้องเป็นตัวเลข'); return; }
      var max = iMax >= 0 ? s(r[iMax]) : '';
      if (max !== '' && !isFinite(Number(max))) { bad.push('บรรทัด ' + line + ' : ' + code + ' คะแนนเต็มต้องเป็นตัวเลข'); return; }
      if (max !== '' && Number(pass) > Number(max)) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านมากกว่าคะแนนเต็ม'); return; }
      var exist = closOf(st.eYear, st.eSem, scode).filter(function (c) { return s(c.clo_code) === code; })[0] || null;
      plan.push({ subj: subj, code: code, text: iText >= 0 ? s(r[iText]) : '',
        plo: plo, max: max === '' ? '100' : max, pass: pass, exist: exist });
    });

    var add = plan.filter(function (x) { return !x.exist; }).length;
    var upd = plan.length - add;
    APP._ploCsv = { kind: 'clo', plan: plan };
    csvReview('นำเข้า CLO จากไฟล์ ' + fname,
      '<div class="grid grid-cols-3 gap-2 text-center">'
      + '<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p class="text-2xl font-bold text-emerald-700">' + add + '</p><p class="text-xs text-gray-600">เพิ่มใหม่</p></div>'
      + '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3"><p class="text-2xl font-bold text-primary">' + upd + '</p><p class="text-xs text-gray-600">แก้ไขของเดิม</p></div>'
      + '<div class="rounded-xl bg-gray-50 border border-gray-100 p-3"><p class="text-2xl font-bold text-gray-500">' + bad.length + '</p><p class="text-xs text-gray-600">ข้ามไป</p></div>'
      + '</div>'
      + '<p class="text-xs text-gray-500">ปีการศึกษา ' + esc(st.eYear) + ' · ภาค ' + esc(st.eSem) + ' · ชั้นปีที่ ' + esc(st.eLevel)
      + ' — คะแนนนักศึกษาที่บันทึกไว้แล้วจะไม่ถูกลบ</p>',
      bad, plan.length);
  }

  function ploCsvPlanScore(rows, head, fname) {
    var st = state();
    if (!st.eSubject) { showToast('เลือกรายวิชาก่อน จึงจะนำเข้าคะแนนได้', 'error'); return; }
    var clos = closOf(st.eYear, st.eSem, st.eSubject);
    if (!clos.length) { showToast('รายวิชานี้ยังไม่ได้กำหนด CLO — นำเข้า CLO ก่อน', 'error'); return; }

    var byCode = {};
    clos.forEach(function (c) { byCode[s(c.clo_code).toLowerCase()] = c; });
    var iSid = head.indexOf('student_id');
    var cols = [], unknown = [];
    head.forEach(function (h, i) {
      if (i === iSid || h === 'name' || h === '') return;
      if (byCode[h]) cols.push({ i: i, clo: byCode[h] });
      else unknown.push(s(rows[0][i]));
    });

    var bad = [];
    unknown.forEach(function (h) { bad.push('คอลัมน์ "' + h + '" ไม่ตรงกับ CLO ใดของรายวิชานี้ — ไม่นำเข้า'); });
    if (!cols.length) {
      APP._ploCsv = null;
      csvReview('นำเข้าคะแนนจากไฟล์ ' + fname,
        '<p class="text-sm text-gray-600">หัวตารางไม่มีคอลัมน์ที่ตรงกับรหัส CLO ของรายวิชานี้</p>'
        + '<p class="text-xs text-gray-500 mt-1">CLO ที่มี: ' + esc(clos.map(function (c) { return c.clo_code; }).join(', ')) + '</p>',
        bad, 0);
      return;
    }

    var stuOk = {};
    entryStudents().forEach(function (u) { stuOk[s(u.student_id)] = 1; });
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var payload = [], nStu = {}, blank = 0;
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2;
      var sid = s(r[iSid]);
      if (!sid) return;
      if (!stuOk[sid]) { bad.push('บรรทัด ' + line + ' : ไม่พบรหัสนักศึกษา ' + sid + ' ในรุ่นนี้'); return; }
      cols.forEach(function (c) {
        var v = s(r[c.i]);
        if (v === '') { blank++; return; }    // เว้นว่าง = ยังไม่ให้คะแนน ไม่ใช่ศูนย์
        if (!isFinite(Number(v))) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + c.clo.clo_code + ' "' + v + '" ไม่ใช่ตัวเลข'); return; }
        var num = Number(v);
        var max = Number(c.clo.max_score);
        if (num < 0) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + c.clo.clo_code + ' คะแนนติดลบ'); return; }
        if (isFinite(max) && max > 0 && num > max) {
          bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + c.clo.clo_code + ' คะแนน ' + num + ' เกินคะแนนเต็ม ' + max); return;
        }
        payload.push({ clo_id: Number(c.clo.__backendId), student_id: sid, score: num, updated_by: who });
        nStu[sid] = 1;
      });
    });

    APP._ploCsv = { kind: 'score', payload: payload };
    csvReview('นำเข้าคะแนนจากไฟล์ ' + fname,
      '<div class="grid grid-cols-3 gap-2 text-center">'
      + '<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p class="text-2xl font-bold text-emerald-700">' + payload.length + '</p><p class="text-xs text-gray-600">คะแนนที่จะบันทึก</p></div>'
      + '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3"><p class="text-2xl font-bold text-primary">' + Object.keys(nStu).length + '</p><p class="text-xs text-gray-600">นักศึกษา</p></div>'
      + '<div class="rounded-xl bg-gray-50 border border-gray-100 p-3"><p class="text-2xl font-bold text-gray-500">' + bad.length + '</p><p class="text-xs text-gray-600">ข้ามไป</p></div>'
      + '</div>'
      + '<p class="text-xs text-gray-500">รายวิชา ' + esc(st.eSubject) + ' · ' + cols.length + ' CLO'
      + (blank ? ' · ช่องที่เว้นว่างไว้ ' + blank + ' ช่อง จะไม่ถูกแตะ (ไม่ใช่ให้ 0)' : '') + '</p>',
      bad, payload.length);
  }

  window.ploCsvApply = async function () {
    var p = APP._ploCsv;
    if (!p) return;
    var st = state();

    /* ไฟล์รวม — ต้องทำสองจังหวะ
       จังหวะแรกบันทึก CLO ให้เสร็จก่อน เพราะคะแนนอ้างถึง CLO ด้วยรหัสแถว
       ที่ยังไม่เกิดขึ้นตอนอ่านไฟล์ จังหวะที่สองจึงค่อยหารหัสแถวจริงแล้วบันทึกคะแนน */
    if (p.kind === 'all') {
      var whoA = (APP.currentUser && APP.currentUser.name) || '';
      var batchA = cohortPrefix(st.eYear, st.eLevel);
      var okA = 0, errA = '';
      if (p.plan.length) showToast('กำลังบันทึก CLO ' + p.plan.length + ' รายการ...');
      for (var a = 0; a < p.plan.length; a++) {
        var xa = p.plan[a];
        var baseA = {
          type: 'plo_clo', curriculum_year: st.curriculum,
          academic_year: st.eYear, semester: st.eSem, year_level: st.eLevel, batch: batchA,
          subject_code: xa.subj.subject_code, subject_name: xa.subj.subject_name,
          clo_code: xa.code, statement_th: xa.text, plo_code: xa.plo,
          max_score: xa.max, pass_score: xa.pass, updated_by: whoA
        };
        var rA = xa.exist
          ? await GSheetDB.update(Object.assign({}, xa.exist, baseA), { noRefresh: a < p.plan.length - 1 })
          : await GSheetDB.create(Object.assign({ sort_order: a + 1 }, baseA), { noRefresh: a < p.plan.length - 1 });
        if (rA && rA.isOk) okA++; else errA = (rA && rA.error) || '';
      }

      // หารหัสแถวของ CLO หลังบันทึกเสร็จ แล้วแปลงคะแนนเป็นชุดที่ส่งขึ้นฐานข้อมูลได้
      var payloadA = [], missA = 0;
      if (p.scores.length) {
        var mapA = {};
        subjectsOf(st.eYear, st.eSem, st.eLevel).forEach(function (sb2) {
          closOf(st.eYear, st.eSem, sb2.subject_code).forEach(function (c) {
            mapA[s(sb2.subject_code) + '|' + s(c.clo_code)] = c;
          });
        });
        p.scores.forEach(function (x) {
          var c = mapA[s(x.subject_code) + '|' + s(x.clo_code)];
          if (!c) { missA++; return; }
          payloadA.push({ clo_id: Number(c.__backendId), student_id: x.student_id, score: x.score, updated_by: whoA });
        });
      }

      var doneA = 0;
      if (payloadA.length) {
        showToast('กำลังบันทึกคะแนน ' + payloadA.length + ' รายการ...');
        for (var b = 0; b < payloadA.length; b += 500) {
          var rB = await sb().from('plo_score').upsert(payloadA.slice(b, b + 500), { onConflict: 'clo_id,student_id' });
          if (rB && rB.error) {
            APP._ploCsv = null;
            if (typeof closeModal === 'function') closeModal();
            showToast('บันทึกคะแนนไม่สำเร็จหลังจากบันทึกไปแล้ว ' + doneA + ' รายการ: ' + rB.error.message, 'error');
            if (typeof renderCurrentPage === 'function') renderCurrentPage();
            return;
          }
          doneA += Math.min(500, payloadA.length - b);
        }
      }

      APP._ploCsv = null;
      if (typeof closeModal === 'function') closeModal();
      st.scores = null; st._dirty = {}; st.summary = null;
      var msgA = 'นำเข้าเรียบร้อย — CLO ' + okA + ' รายการ · คะแนน ' + doneA + ' รายการ';
      if (missA) msgA += ' (ข้ามคะแนนที่หา CLO ไม่เจอ ' + missA + ' รายการ)';
      showToast(msgA, (okA === p.plan.length && !missA) ? 'success' : 'error');
      if (errA) showToast('มีบางรายการบันทึกไม่สำเร็จ · ' + errA, 'error');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
      return;
    }

    if (p.kind === 'clo') {
      var who = (APP.currentUser && APP.currentUser.name) || '';
      var batch = cohortPrefix(st.eYear, st.eLevel);
      var ok = 0, err = '';
      showToast('กำลังนำเข้า ' + p.plan.length + ' รายการ...');
      for (var i = 0; i < p.plan.length; i++) {
        var x = p.plan[i];
        var base = {
          type: 'plo_clo', curriculum_year: st.curriculum,
          academic_year: st.eYear, semester: st.eSem, year_level: st.eLevel, batch: batch,
          subject_code: x.subj.subject_code, subject_name: x.subj.subject_name,
          clo_code: x.code, statement_th: x.text, plo_code: x.plo,
          max_score: x.max, pass_score: x.pass, updated_by: who
        };
        var opts = { noRefresh: i < p.plan.length - 1 };
        var r = x.exist
          ? await GSheetDB.update(Object.assign({}, x.exist, base), opts)
          : await GSheetDB.create(Object.assign({ sort_order: i + 1 }, base), opts);
        if (r && r.isOk) ok++; else err = (r && r.error) || '';
      }
      APP._ploCsv = null;
      if (typeof closeModal === 'function') closeModal();
      st.scores = null; st.summary = null;
      if (ok === p.plan.length) showToast('นำเข้า CLO เรียบร้อย ' + ok + ' รายการ');
      else showToast('นำเข้าสำเร็จ ' + ok + ' จาก ' + p.plan.length + ' รายการ · ' + err, 'error');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
      return;
    }

    // คะแนน — ส่งเป็นชุดละ 500 แถว กันคำขอใหญ่เกินไป
    var list = p.payload, done = 0;
    showToast('กำลังบันทึกคะแนน ' + list.length + ' รายการ...');
    for (var j = 0; j < list.length; j += 500) {
      var r2 = await sb().from('plo_score').upsert(list.slice(j, j + 500), { onConflict: 'clo_id,student_id' });
      if (r2 && r2.error) {
        APP._ploCsv = null;
        if (typeof closeModal === 'function') closeModal();
        showToast('บันทึกไม่สำเร็จหลังจากบันทึกไปแล้ว ' + done + ' รายการ: ' + r2.error.message, 'error');
        return;
      }
      done += Math.min(500, list.length - j);
    }
    APP._ploCsv = null;
    if (typeof closeModal === 'function') closeModal();
    st.scores = null; st._dirty = {}; st.summary = null;
    showToast('นำเข้าคะแนนเรียบร้อย ' + done + ' รายการ');
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

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
        + '<th class="px-3 py-2 w-20"></th></tr></thead><tbody>'
        + rows.map(function (r) {
            return '<tr class="border-t border-gray-50">'
              + '<td class="px-3 py-2 font-semibold">' + esc(r.clo_code) + '</td>'
              + '<td class="px-3 py-2">' + esc(r.statement_th) + '</td>'
              + '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded-lg bg-blue-50 text-primary text-xs">'
              + esc(r.plo_code || '—') + '</span></td>'
              + '<td class="px-3 py-2 text-center">' + esc(r.max_score) + '</td>'
              + '<td class="px-3 py-2 text-center">' + esc(r.pass_score) + '</td>'
              + '<td class="px-3 py-2 text-right whitespace-nowrap">'
              // รหัสแถวเป็นข้อความ (เช่น plo_clo_20) ต้องครอบเครื่องหมายคำพูด
              // ไม่งั้นเบราว์เซอร์อ่านเป็นชื่อตัวแปรแล้วฟ้องว่าไม่รู้จัก
              + '<button onclick="ploEditClo(\'' + esc(r.__backendId) + '\')" class="text-gray-300 hover:text-primary mr-2" title="แก้ไข CLO นี้">'
              + '<i data-lucide="pencil" class="w-4 h-4"></i></button>'
              + '<button onclick="ploDeleteClo(\'' + esc(r.__backendId) + '\')" class="text-gray-300 hover:text-red-500" title="ลบ CLO นี้">'
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

  /* แก้ไข CLO ที่บันทึกไว้แล้ว
     เดิมมีแต่ปุ่มลบ ถ้าพิมพ์ผิดหรือจะปรับเกณฑ์ผ่าน ต้องลบแล้วเพิ่มใหม่
     ซึ่งทำให้คะแนนนักศึกษาที่กรอกไว้ใน CLO ข้อนั้นหายไปด้วย
     การแก้ไขนี้ไม่แตะตารางคะแนน คะแนนเดิมยังอยู่ครบ */
  window.ploEditClo = function (id) {
    var rec = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0];
    if (!rec) { showToast('ไม่พบ CLO ที่จะแก้ไข', 'error'); return; }

    var opts = ploOptions();
    var sel = '<select id="cloEPlo" class="w-full border rounded-lg px-2 py-1.5 text-sm">'
      + '<option value="">— เลือก PLO —</option>'
      + opts.map(function (p) {
          var t = (s(p.parent_code) ? '   ' : '') + s(p.plo_code) + ' ' + s(p.statement_th).slice(0, 60);
          return '<option value="' + esc(p.plo_code) + '"'
            + (s(rec.plo_code) === s(p.plo_code) ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('') + '</select>';

    var html = '<div class="space-y-3">'
      + '<p class="text-xs text-gray-500">รายวิชา ' + esc(rec.subject_code) + ' ' + esc(rec.subject_name)
      + ' · ปีการศึกษา ' + esc(rec.academic_year) + ' ภาคการศึกษาที่ ' + esc(rec.semester) + '</p>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">รหัส CLO</label>'
      + '<input id="cloECode" value="' + esc(rec.clo_code) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">คำอธิบาย</label>'
      + '<textarea id="cloEText" rows="3" class="w-full border rounded-lg px-2 py-1.5 text-sm">' + esc(rec.statement_th) + '</textarea></div>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">ผูกกับ PLO</label>' + sel + '</div>'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">คะแนนเต็ม</label>'
      + '<input id="cloEMax" type="number" value="' + esc(rec.max_score) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">เกณฑ์ผ่าน</label>'
      + '<input id="cloEPass" type="number" value="' + esc(rec.pass_score) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '</div>'
      + '<p class="text-[11px] text-gray-400">คะแนนนักศึกษาที่กรอกไว้จะไม่ถูกลบ '
      + 'ถ้าแก้คะแนนเต็มหรือเกณฑ์ผ่าน ผลการบรรลุจะคำนวณใหม่จากคะแนนเดิม</p>'
      + '</div>';

    // คืน Promise ออกไปด้วย เพื่อให้ผู้เรียกรอจนบันทึกเสร็จจริงได้
    showModal('แก้ไข ' + esc(rec.clo_code), html, function () { return window.ploSaveClo(id); }, 'max-w-xl');
  };

  window.ploSaveClo = async function (id) {
    var rec = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0];
    if (!rec) return;
    var v = function (el) { return s(((typeof document !== 'undefined' && document.getElementById(el)) || {}).value); };
    var code = v('cloECode'), text = v('cloEText'), plo = v('cloEPlo'),
        max = v('cloEMax'), pass = v('cloEPass');
    if (!code) { showToast('กรุณากรอกรหัส CLO', 'error'); return; }
    if (!plo) { showToast('กรุณาเลือก PLO ที่ CLO นี้ผูกอยู่', 'error'); return; }
    if (!pass) { showToast('กรุณากรอกเกณฑ์ผ่าน', 'error'); return; }

    // กันรหัสซ้ำกับ CLO ข้ออื่นในรายวิชาเดียวกัน
    var dup = closOf(rec.academic_year, rec.semester, rec.subject_code).some(function (c) {
      return String(c.__backendId) !== String(id) && s(c.clo_code) === code;
    });
    if (dup) { showToast('รหัส ' + code + ' มีอยู่แล้วในรายวิชานี้', 'error'); return; }

    var r = await GSheetDB.update(Object.assign({}, rec, {
      clo_code: code, statement_th: text, plo_code: plo,
      max_score: max, pass_score: pass,
      updated_by: (APP.currentUser && APP.currentUser.name) || ''
    }));
    if (r && r.isOk) {
      if (typeof closeModal === 'function') closeModal();
      showToast('แก้ไขแล้ว');
      state().scores = null;
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } else showToast('แก้ไขไม่สำเร็จ: ' + ((r && r.error) || ''), 'error');
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
    var studs = entryStudents();

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
      try { addItem(); } catch (e) { console.warn('เพิ่มเมนู ประเมินผลหลักสูตร PLOs ไม่สำเร็จ:', e); }
    };

    function addItem() {
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.ploAssess) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-page="ploAssess"]')) return;
      var btn = document.createElement('button');
      btn.setAttribute('onclick', "navigateTo('ploAssess')");
      btn.setAttribute('data-page', 'ploAssess');
      btn.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
      btn.innerHTML = '<i data-lucide="target" class="w-5 h-5 flex-shrink-0"></i>ประเมินผลหลักสูตร PLOs';
      // เกาะหน้ากลุ่มภาระงานนักศึกษาถ้ามี จะได้เป็น PLOs → ภาระงานนักศึกษา เสมอ
      insertNav(nav, btn, '[data-wl-menu], [data-page="teacherDirectory"], '
        + '[data-page="tracking"], [data-page="services"]');
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
