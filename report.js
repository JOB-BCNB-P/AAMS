/* ================================================================
   report.js — เมนู "รายงาน"
   ----------------------------------------------------------------
   เมนูย่อย
     1. ผลสอบสภาฯ            — กราฟแท่งรายวิชา · กราฟวงกลมรายวิชา
                                กราฟวงกลมรายสาขา · ตารางรายบุคคล
     2. การได้งานทำของศิษย์เก่า — สถานภาพ สถานที่ปฏิบัติงาน เงินเดือน

   ข้อมูล
     council_exam  : 1 แถว = ผู้เข้าสอบ 1 คน ต่อ การสอบ 1 รอบ
                     ผลรายวิชาอยู่ใน results_json {"ชื่อวิชา":"ผ่าน"}
     app_setting   : คีย์ council_exam_config เก็บรายวิชาและการจัดกลุ่มสาขา
                     แก้ชื่อวิชา/สาขาได้โดยไม่ต้องแก้โค้ด

   สิทธิ์ (ฐานข้อมูลบังคับซ้ำด้วย RLS อีกชั้น)
     กราฟและภาพรวม   : admin · academic · registrar · executive · deptHead
     ตารางรายบุคคล   : admin · academic · registrar เท่านั้น
                       เพราะมีชื่อ ผลสอบรายคน และเงินเดือน ซึ่งเป็นข้อมูลส่วนบุคคล
                       ผู้บริหารและประธานสาขาดูแนวโน้มได้ครบโดยไม่ต้องเห็นรายคน
   ================================================================ */
(function () {
  'use strict';

  var PASS = 'ผ่าน', FAIL = 'ไม่ผ่าน', ABSENT = 'ไม่ได้เข้าสอบ';
  var C_PASS = '#22c55e', C_FAIL = '#ef4444', C_ABSENT = '#cbd5e1';

  function n(v) { return String(v == null ? '' : v).trim(); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function roles() { return (APP._roles && APP._roles.length) ? APP._roles : [APP.currentRole]; }
  function hasRole(list) { return roles().some(function (r) { return list.indexOf(r) !== -1; }); }
  // ใครเห็นรายงานได้ / ใครเห็นตารางรายบุคคลได้
  var VIEW_ROLES = ['admin', 'academic', 'registrar', 'executive', 'deptHead'];
  var DETAIL_ROLES = ['admin', 'academic', 'registrar'];

  /* สิทธิ์เห็นรายงาน แยกกันคนละช่องระหว่างผลสอบสภาฯ กับการได้งานทำของศิษย์เก่า
     ผู้ดูแลระบบปรับได้ที่ ตั้งค่าระบบ > สิทธิ์การเข้าถึงระบบ
     ลำดับการตัดสิน
       1) ค่าของรายงานนั้นเอง (reportExam / reportJob)
       2) ค่ารวม report ของรุ่นก่อนหน้า เผื่อยังตั้งค่าไว้แบบเดิม
       3) ยังไม่เคยตั้งค่าเลย ใช้ค่าตั้งต้นเดิมตาม VIEW_ROLES
     ถ้ามีหลายบทบาท ถือว่าเห็นได้เมื่อบทบาทใดบทบาทหนึ่งมีสิทธิ์ ให้ตรงกับเมนูอื่นของระบบ */
  function permAllows(key) {
    var perms = (APP && APP.permissions) || {};
    var decided = false;
    var allowed = roles().some(function (r) {
      var p = perms[r] || {};
      var k = Object.prototype.hasOwnProperty.call(p, key) ? key
            : (Object.prototype.hasOwnProperty.call(p, 'report') ? 'report' : '');
      if (!k) return false;
      decided = true;
      return !!p[k];
    });
    if (allowed) return true;
    if (decided) return false;          // ตั้งค่าไว้แล้วว่าไม่ให้เห็น
    return hasRole(VIEW_ROLES);         // ยังไม่เคยตั้งค่า ใช้ค่าตั้งต้นเดิม
  }
  function canExam() { return permAllows('reportExam'); }
  function canJob() { return permAllows('reportJob'); }
  function canView() { return canExam() || canJob(); }   // เห็นกลุ่มเมนู "รายงาน" หรือไม่

  /* ตารางรายบุคคลและเงินเดือนยังคุมด้วยบทบาทตายตัว ไม่ผูกกับตารางสิทธิ์
     เพราะเป็นข้อมูลส่วนบุคคล การเปิดให้ควรเป็นการตัดสินใจที่ตั้งใจ ไม่ใช่ติ๊กผ่าน ๆ */
  function canSeeDetail() { return hasRole(DETAIL_ROLES); }

  /* ---------------- ค่าตั้งรายวิชาและสาขา ---------------- */
  var FALLBACK = {
    subjects: ['การผดุงครรภ์', 'การพยาบาลมารดาและทารก', 'การพยาบาลเด็กและวัยรุ่น',
      'กฎหมายวิชาชีพการพยาบาลและการผดุงครรภ์ จรรยาบรรณวิชาชีพ และกฎหมายอื่นที่เกี่ยวข้อง',
      'การพยาบาลผู้ใหญ่', 'การพยาบาลผู้สูงอายุ', 'การพยาบาลสุขภาพจิตและจิตเวชศาสตร์',
      'การพยาบาลอนามัยชุมชนและการรักษาพยาบาลขั้นต้น'],
    branches: []
  };
  function cfg() {
    var row = get('app_setting').filter(function (x) { return n(x.setting_key) === 'council_exam_config'; })[0];
    if (!row) return FALLBACK;
    try {
      var o = JSON.parse(row.setting_value || '{}');
      return {
        subjects: Array.isArray(o.subjects) && o.subjects.length ? o.subjects : FALLBACK.subjects,
        branches: Array.isArray(o.branches) ? o.branches : []
      };
    } catch (e) { return FALLBACK; }
  }
  // ชื่อย่อสำหรับหัวตารางและป้ายกราฟ ชื่อเต็มยังอยู่ใน title ให้ชี้ดูได้
  function shortName(s) {
    var t = n(s);
    if (t.indexOf('กฎหมาย') === 0) return 'กฎหมายวิชาชีพฯ';
    if (t.indexOf('การพยาบาลอนามัยชุมชน') === 0) return 'อนามัยชุมชนฯ';
    return t.replace(/^การพยาบาล/, '').replace(/^การ/, '');
  }

  /* ---------------- ข้อมูลผลสอบ ---------------- */
  function examRows() {
    return get('council_exam').map(function (r) {
      var res = {};
      try { res = JSON.parse(r.results_json || '{}') || {}; } catch (e) { res = {}; }
      return {
        sid: n(r.student_id), prefix: n(r.title_prefix), name: n(r.name), batch: n(r.batch),
        round: n(r.exam_round), date: n(r.exam_date), res: res, raw: r
      };
    });
  }
  function uniq(a) {
    var seen = {}, out = [];
    a.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function state() {
    if (!APP._rep) APP._rep = { batch: '', round: '', branch: '', q: '' };
    return APP._rep;
  }
  window.repSet = function (k, v) {
    var st = state();
    st[k] = v;
    if (k === 'batch') st.round = '';      // รอบสอบผูกกับรุ่น เปลี่ยนรุ่นแล้วต้องเลือกรอบใหม่
    renderCurrentPage();
  };

  function filtered() {
    var st = state();
    return examRows().filter(function (x) {
      return (!st.batch || x.batch === st.batch) && (!st.round || x.round === st.round);
    });
  }

  /* นับผลของวิชาหนึ่งในชุดข้อมูลที่กรองแล้ว
     เกณฑ์ : ร้อยละการผ่าน = ผ่าน ÷ (ผ่าน + ไม่ผ่าน) — ไม่นับคนที่ไม่ได้เข้าสอบ
     เพราะคนที่ไม่ได้เข้าสอบไม่ได้สะท้อนคุณภาพการสอน ถ้านับรวมจะทำให้ตัวเลขต่ำกว่าความจริง */
  function tally(list, subject) {
    var p = 0, f = 0, a = 0;
    list.forEach(function (x) {
      var v = n(x.res[subject]);
      if (v === PASS) p++;
      else if (v === FAIL) f++;
      else if (v === ABSENT) a++;
    });
    return { pass: p, fail: f, absent: a, sat: p + f, pct: (p + f) ? Math.round(p / (p + f) * 1000) / 10 : 0 };
  }

  /* ---------------- แถบตัวกรอง ---------------- */
  function filterBar(withBranch) {
    var st = state(), all = examRows();
    var batches = uniq(all.map(function (x) { return x.batch; }).filter(Boolean))
      .sort(function (a, b) { return b.localeCompare(a, 'th', { numeric: true }); });
    var rounds = uniq(all.filter(function (x) { return !st.batch || x.batch === st.batch; })
      .map(function (x) { return x.round; }).filter(Boolean)).sort();
    var sel = function (key, label, opts, cur, disabled) {
      return '<label class="text-sm text-gray-600">' + label + '</label>'
        + '<select ' + (disabled ? 'disabled ' : '') + 'onchange="repSet(\'' + key + '\',this.value)" '
        + 'class="border border-gray-200 rounded-xl px-3 py-2 text-sm ' + (disabled ? 'bg-gray-50 text-gray-400' : '') + '">'
        + opts.map(function (o) {
            return '<option value="' + esc(o[0]) + '"' + (n(cur) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
          }).join('') + '</select>';
    };
    var html = '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4 flex flex-wrap items-center gap-3">'
      + sel('batch', 'รุ่นที่', [['', 'ทุกรุ่น']].concat(batches.map(function (b) { return [b, 'รุ่นที่ ' + b]; })), st.batch)
      + sel('round', 'ครั้งที่สอบ', [['', 'ทุกรอบ']].concat(rounds.map(function (r) { return [r, r]; })), st.round,
            !st.batch && batches.length > 1 ? false : false);
    if (withBranch) {
      var bs = cfg().branches.map(function (b) { return [b.name, b.name]; });
      html += sel('branch', 'สาขา', [['', 'ทุกสาขา']].concat(bs), st.branch);
    }
    html += '<span class="ml-auto text-xs text-gray-400"><i data-lucide="users" class="w-3 h-3 inline mr-1"></i>'
      + filtered().length + ' รายการ</span></div>';
    return html;
  }

  function emptyBox(msg, hint) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-10 text-center">'
      + '<i data-lucide="bar-chart-3" class="w-10 h-10 mx-auto mb-3 text-gray-300"></i>'
      + '<p class="text-sm text-gray-500">' + esc(msg) + '</p>'
      + (hint ? '<p class="text-xs text-gray-400 mt-1">' + hint + '</p>' : '') + '</div>';
  }
  function card(title, sub, body) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-5 mb-4">'
      + '<div class="mb-3"><h3 class="font-semibold text-gray-800">' + title + '</h3>'
      + (sub ? '<p class="text-xs text-gray-500 mt-0.5">' + sub + '</p>' : '') + '</div>'
      + body + '</div>';
  }

  /* ---------------- 1) กราฟแท่ง ผ่าน/ไม่ผ่าน รายวิชา ---------------- */
  function barBySubject(list) {
    var subs = cfg().subjects;
    var rows = [];
    subs.forEach(function (s) {
      var t = tally(list, s);
      rows.push({ label: shortName(s) + ' — ผ่าน', value: t.pass, color: C_PASS });
      rows.push({ label: shortName(s) + ' — ไม่ผ่าน', value: t.fail, color: C_FAIL });
    });
    var any = rows.some(function (r) { return r.value > 0; });
    if (!any) return emptyBox('ยังไม่มีผลสอบในเงื่อนไขที่เลือก');
    return card('จำนวนผู้ผ่าน / ไม่ผ่าน รายวิชา',
      'นับเฉพาะผู้ที่เข้าสอบวิชานั้น · ' + scopeText(),
      '<div class="space-y-2">' + (typeof animBarRows === 'function' ? animBarRows(rows) : '') + '</div>');
  }

  /* ---------------- 2) กราฟวงกลม ร้อยละการผ่าน รายวิชา ---------------- */
  function pieBySubject(list) {
    var subs = cfg().subjects;
    var cells = subs.map(function (s) {
      var t = tally(list, s);
      var donut = (typeof svgDonut === 'function') ? svgDonut([
        { label: PASS, value: t.pass, color: C_PASS },
        { label: FAIL, value: t.fail, color: C_FAIL },
        { label: ABSENT, value: t.absent, color: C_ABSENT }
      ], 'คน') : '';
      return '<div class="border border-gray-100 rounded-xl p-3">'
        + '<p class="text-xs font-semibold text-gray-700 mb-1" title="' + esc(s) + '">' + esc(shortName(s)) + '</p>'
        + '<p class="text-2xl font-bold tabular-nums" style="color:' + (t.pct >= 60 ? C_PASS : C_FAIL) + '">'
        + t.pct + '%</p>'
        + '<p class="text-[11px] text-gray-400 mb-2">ผ่าน ' + t.pass + ' จากผู้เข้าสอบ ' + t.sat + ' คน'
        + (t.absent ? ' · ไม่ได้เข้าสอบ ' + t.absent : '') + '</p>'
        + donut + '</div>';
    }).join('');
    if (!list.length) return emptyBox('ยังไม่มีผลสอบในเงื่อนไขที่เลือก');
    return card('ร้อยละการผ่าน รายวิชา',
      'ร้อยละ = ผ่าน ÷ ผู้เข้าสอบ (ไม่นับผู้ที่ไม่ได้เข้าสอบ) · ' + scopeText(),
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' + cells + '</div>');
  }

  /* ---------------- 3) กราฟวงกลม ร้อยละการผ่าน รายสาขา ---------------- */
  function pieByBranch(list) {
    var st = state();
    var bs = cfg().branches.filter(function (b) { return !st.branch || b.name === st.branch; });
    if (!bs.length) {
      return emptyBox('ยังไม่ได้ตั้งค่าการจัดกลุ่มสาขา',
        'ตั้งค่าได้ที่ตาราง app_setting คีย์ council_exam_config');
    }
    var cells = bs.map(function (b) {
      var p = 0, f = 0, a = 0;
      (b.subjects || []).forEach(function (s) {
        var t = tally(list, s);
        p += t.pass; f += t.fail; a += t.absent;
      });
      var pct = (p + f) ? Math.round(p / (p + f) * 1000) / 10 : 0;
      var donut = (typeof svgDonut === 'function') ? svgDonut([
        { label: PASS, value: p, color: C_PASS },
        { label: FAIL, value: f, color: C_FAIL },
        { label: ABSENT, value: a, color: C_ABSENT }
      ], 'ครั้ง') : '';
      return '<div class="border border-gray-100 rounded-xl p-4">'
        + '<p class="text-sm font-semibold text-gray-800 mb-1">' + esc(b.name) + '</p>'
        + '<p class="text-[11px] text-gray-400 mb-1">' + (b.subjects || []).map(esc).join(' · ') + '</p>'
        + '<p class="text-3xl font-bold tabular-nums" style="color:' + (pct >= 60 ? C_PASS : C_FAIL) + '">' + pct + '%</p>'
        + '<p class="text-[11px] text-gray-400 mb-2">ผ่าน ' + p + ' จากการเข้าสอบ ' + (p + f) + ' ครั้ง</p>'
        + donut + '</div>';
    }).join('');
    return card('ร้อยละการผ่าน รายสาขา',
      'นับรวมทุกวิชาในสาขา — 1 คนที่สอบ 2 วิชาในสาขาเดียวกันนับเป็น 2 ครั้ง · ' + scopeText(),
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' + cells + '</div>');
  }

  function scopeText() {
    var st = state();
    return (st.batch ? 'รุ่นที่ ' + esc(st.batch) : 'ทุกรุ่น')
      + ' · ' + (st.round ? 'ครั้งที่ ' + esc(st.round) : 'ทุกรอบการสอบ');
  }

  /* ---------------- 4) ตารางรายบุคคล ---------------- */
  function personTable(list) {
    if (!canSeeDetail()) {
      return '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">'
        + '<i data-lucide="lock" class="w-6 h-6 mx-auto mb-2 text-amber-500"></i>'
        + '<p class="text-sm text-amber-800">ตารางผลสอบรายบุคคลเปิดให้เฉพาะผู้ดูแลระบบ งานวิชาการ และงานทะเบียน</p>'
        + '<p class="text-xs text-amber-700 mt-1">กราฟและภาพรวมด้านบนแสดงข้อมูลครบถ้วนแล้ว</p></div>';
    }
    var st = state(), subs = cfg().subjects;
    var q = n(st.q).toLowerCase();
    var rows = list.filter(function (x) {
      return !q || (x.sid + ' ' + x.name).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return (a.batch + a.round + a.sid).localeCompare(b.batch + b.round + b.sid, 'th', { numeric: true });
    });

    var head = '<tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold whitespace-nowrap">รหัสนักศึกษา</th>'
      + '<th class="px-3 py-2 font-semibold">รุ่นที่</th>'
      + '<th class="px-3 py-2 font-semibold">คำนำหน้า</th>'
      + '<th class="px-3 py-2 font-semibold">ชื่อ-สกุล</th>'
      + subs.map(function (s) {
          return '<th class="px-2 py-2 font-semibold text-center" title="' + esc(s) + '">'
            + esc(shortName(s)) + '</th>';
        }).join('')
      + '<th class="px-2 py-2 font-semibold text-center">ผ่าน</th>'
      + '<th class="px-2 py-2 font-semibold text-center">ไม่ผ่าน</th>'
      + '<th class="px-3 py-2 font-semibold whitespace-nowrap">ครั้งที่สอบ</th>'
      + '<th class="px-3 py-2 font-semibold whitespace-nowrap">วันที่สอบ</th></tr>';

    var body = rows.map(function (x) {
      var np = 0, nf = 0;
      var cells = subs.map(function (s) {
        var v = n(x.res[s]), cls = 'text-gray-300', txt = '–';
        if (v === PASS) { np++; cls = 'text-emerald-600 font-semibold'; txt = 'ผ่าน'; }
        else if (v === FAIL) { nf++; cls = 'text-red-600 font-semibold'; txt = 'ไม่ผ่าน'; }
        else if (v === ABSENT) { cls = 'text-gray-400'; txt = 'ไม่เข้าสอบ'; }
        return '<td class="px-2 py-2 text-center text-xs ' + cls + '">' + txt + '</td>';
      }).join('');
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-3 py-2 font-mono text-xs text-primary whitespace-nowrap">' + esc(x.sid) + '</td>'
        + '<td class="px-3 py-2">' + esc(x.batch) + '</td>'
        + '<td class="px-3 py-2">' + esc(x.prefix) + '</td>'
        + '<td class="px-3 py-2 whitespace-nowrap">' + esc(x.name) + '</td>'
        + cells
        + '<td class="px-2 py-2 text-center tabular-nums font-semibold text-emerald-700">' + np + '</td>'
        + '<td class="px-2 py-2 text-center tabular-nums font-semibold ' + (nf ? 'text-red-700' : 'text-gray-400') + '">' + nf + '</td>'
        + '<td class="px-3 py-2 whitespace-nowrap">' + esc(x.round) + '</td>'
        + '<td class="px-3 py-2 whitespace-nowrap">'
        + esc(x.date && typeof toBuddhistDate === 'function' ? toBuddhistDate(x.date) : x.date) + '</td></tr>';
    }).join('');

    return card('ผลสอบรายบุคคล',
      'เลือกรุ่นก่อน แล้วจึงเลือกครั้งที่สอบได้ · ' + rows.length + ' รายการ',
      '<input value="' + esc(st.q) + '" oninput="repSet(\'q\',this.value)" placeholder="ค้นหารหัส/ชื่อ..." '
      + 'class="w-full sm:w-80 border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3">'
      + '<div class="overflow-x-auto border border-blue-50 rounded-xl" style="max-height:65vh;overflow-y:auto">'
      + '<table class="w-full text-sm"><thead class="sticky top-0">' + head + '</thead>'
      + '<tbody>' + (body || '<tr><td colspan="' + (subs.length + 8) + '" class="px-3 py-8 text-center text-gray-400">ไม่มีข้อมูล</td></tr>') + '</tbody>'
      + '</table></div>');
  }

  /* ---------------- หน้า : ผลสอบสภาฯ ---------------- */
  function examPage() {
    if (!canExam()) return emptyBox('บัญชีของคุณไม่มีสิทธิ์ดูรายงานผลสอบสภาการพยาบาล');
    var list = filtered();
    var head = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '<div><h2 class="text-xl font-bold text-gray-800">'
      + '<i data-lucide="clipboard-check" class="w-6 h-6 inline mr-2"></i>รายงานผลสอบสภาการพยาบาล</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">ผลสอบความรู้ขอขึ้นทะเบียนและรับใบอนุญาตประกอบวิชาชีพฯ</p></div>'
      + (canSeeDetail() ? '<button onclick="repCsvPick()" class="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primaryDark text-sm">'
          + '<i data-lucide="upload" class="w-4 h-4"></i>นำเข้าไฟล์ CSV</button>'
          + '<input type="file" id="repCsvInput" accept=".csv,text/csv" class="hidden" onchange="repCsvFile(event)">' : '')
      + '</div>';
    if (!examRows().length) {
      return head + emptyBox('ยังไม่มีข้อมูลผลสอบในระบบ',
        'นำเข้าจากไฟล์ CSV ที่ดาวน์โหลดจากชีตคำตอบของ Google Form');
    }
    return head + filterBar(true)
      + barBySubject(list) + pieBySubject(list) + pieByBranch(list) + personTable(list);
  }

  /* ---------------- หน้า : การได้งานทำของศิษย์เก่า ---------------- */
  function jobPage() {
    if (!canJob()) return emptyBox('บัญชีของคุณไม่มีสิทธิ์ดูรายงานการได้งานทำของศิษย์เก่า');
    var st = state();
    var all = get('alumni').map(function (a) {
      var p = (typeof parseTitlePrefix === 'function') ? parseTitlePrefix(a.name || '') : { prefix: '', rest: n(a.name) };
      return { sid: n(a.student_id), prefix: p.prefix, name: p.rest || n(a.name), batch: n(a.batch),
               status: n(a.alumni_status), workplace: n(a.workplace), salary: n(a.salary) };
    });
    var batches = uniq(all.map(function (x) { return x.batch; }).filter(Boolean))
      .sort(function (a, b) { return b.localeCompare(a, 'th', { numeric: true }); });
    var list = st.batch ? all.filter(function (x) { return x.batch === st.batch; }) : all;

    var head = '<div class="mb-4"><h2 class="text-xl font-bold text-gray-800">'
      + '<i data-lucide="briefcase" class="w-6 h-6 inline mr-2"></i>รายงานการได้งานทำของศิษย์เก่า</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">สถานภาพการทำงาน สถานที่ปฏิบัติงาน และเงินเดือน</p></div>';

    var bar = '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4 flex flex-wrap items-center gap-3">'
      + '<label class="text-sm text-gray-600">รุ่นที่</label>'
      + '<select onchange="repSet(\'batch\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + '<option value="">ทุกรุ่น</option>'
      + batches.map(function (b) {
          return '<option value="' + esc(b) + '"' + (st.batch === b ? ' selected' : '') + '>รุ่นที่ ' + esc(b) + '</option>';
        }).join('')
      + '</select>'
      + '<span class="ml-auto text-xs text-gray-400">' + list.length + ' คน</span></div>';

    // สรุปตามสถานภาพ
    var byStatus = {};
    list.forEach(function (x) { var k = x.status || '(ยังไม่ระบุ)'; byStatus[k] = (byStatus[k] || 0) + 1; });
    var palette = ['#1e6fba', '#0e9f6e', '#e3a008', '#9061f9', '#6b7280'];
    var segs = Object.keys(byStatus).map(function (k, i) {
      return { label: k, value: byStatus[k], color: palette[i % palette.length] };
    });
    var donut = (typeof svgDonut === 'function') ? svgDonut(segs, 'คน') : '';

    // เงินเดือน — นับเฉพาะคนที่กรอกไว้ และบอกจำนวนที่ยังไม่กรอกให้เห็นชัด
    var sal = list.map(function (x) { return parseFloat(String(x.salary).replace(/,/g, '')); })
      .filter(function (v) { return isFinite(v) && v > 0; });
    var sum = sal.reduce(function (a, b) { return a + b; }, 0);
    var avg = sal.length ? Math.round(sum / sal.length) : 0;
    var sorted = sal.slice().sort(function (a, b) { return a - b; });
    var med = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
      : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : 0;
    var money = function (v) { return v ? Number(v).toLocaleString('th-TH') : '–'; };

    var stat = function (label, val, sub, tone) {
      return '<div class="bg-white rounded-2xl p-4 border border-blue-100">'
        + '<p class="text-xs text-gray-500 mb-1">' + label + '</p>'
        + '<p class="text-2xl font-bold tabular-nums ' + (tone || 'text-primary') + '">' + val + '</p>'
        + (sub ? '<p class="text-[11px] text-gray-400 mt-0.5">' + sub + '</p>' : '') + '</div>';
    };
    var cards = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">'
      + stat('ศิษย์เก่าทั้งหมด', list.length + ' คน', st.batch ? 'รุ่นที่ ' + esc(st.batch) : 'ทุกรุ่น')
      + stat('กรอกเงินเดือนแล้ว', sal.length + ' คน',
             list.length ? Math.round(sal.length / list.length * 100) + '% ของทั้งหมด' : '',
             sal.length ? 'text-emerald-600' : 'text-gray-400')
      + stat('เงินเดือนเฉลี่ย', money(avg) + ' บาท', sal.length ? 'จาก ' + sal.length + ' คนที่กรอก' : 'ยังไม่มีข้อมูล')
      + stat('มัธยฐาน', money(med) + ' บาท', 'ทนต่อค่าสุดโต่งกว่าค่าเฉลี่ย')
      + '</div>';

    var statusCard = card('สถานภาพการทำงาน', scopeTextJob(),
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">'
      + '<div>' + (typeof animBarRows === 'function' ? animBarRows(segs) : '') + '</div>'
      + '<div class="flex justify-center">' + donut + '</div></div>');

    var table = '';
    if (canSeeDetail()) {
      var rows = list.slice().sort(function (a, b) {
        return b.batch.localeCompare(a.batch, 'th', { numeric: true }) || a.name.localeCompare(b.name, 'th');
      });
      table = card('รายชื่อศิษย์เก่า', rows.length + ' คน',
        '<div class="overflow-x-auto border border-blue-50 rounded-xl" style="max-height:65vh;overflow-y:auto">'
        + '<table class="w-full text-sm"><thead class="sticky top-0"><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold">รุ่นที่</th><th class="px-3 py-2 font-semibold">คำนำหน้า</th>'
        + '<th class="px-3 py-2 font-semibold">ชื่อ-สกุล</th><th class="px-3 py-2 font-semibold">สถานภาพ</th>'
        + '<th class="px-3 py-2 font-semibold">สถานที่ปฏิบัติงาน</th>'
        + '<th class="px-3 py-2 font-semibold text-right">เงินเดือน (บาท/เดือน)</th></tr></thead><tbody>'
        + (rows.length ? rows.map(function (x) {
            return '<tr class="border-t hover:bg-gray-50">'
              + '<td class="px-3 py-2">' + esc(x.batch) + '</td>'
              + '<td class="px-3 py-2">' + esc(x.prefix) + '</td>'
              + '<td class="px-3 py-2 whitespace-nowrap">' + esc(x.name) + '</td>'
              + '<td class="px-3 py-2">' + esc(x.status) + '</td>'
              + '<td class="px-3 py-2">' + (x.status.indexOf('ธุรกิจส่วนตัว') >= 0
                  ? '<span class="text-gray-400">ไม่ต้องระบุ</span>' : esc(x.workplace)) + '</td>'
              + '<td class="px-3 py-2 text-right tabular-nums">' + esc(x.salary ? money(parseFloat(String(x.salary).replace(/,/g, ''))) : '') + '</td>'
              + '</tr>';
          }).join('') : '<tr><td colspan="6" class="px-3 py-8 text-center text-gray-400">ไม่มีข้อมูล</td></tr>')
        + '</tbody></table></div>');
    } else {
      table = '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">'
        + '<i data-lucide="lock" class="w-6 h-6 mx-auto mb-2 text-amber-500"></i>'
        + '<p class="text-sm text-amber-800">รายชื่อพร้อมเงินเดือนรายบุคคลเปิดให้เฉพาะผู้ดูแลระบบ งานวิชาการ และงานทะเบียน</p></div>';
    }
    return head + bar + cards + statusCard + table;
  }
  function scopeTextJob() {
    var st = state();
    return st.batch ? 'รุ่นที่ ' + esc(st.batch) : 'ทุกรุ่น';
  }


  /* ================= นำเข้าผลสอบจากไฟล์ CSV =================
     ไฟล์ที่รองรับ : ชีตคำตอบของ Google Form ที่ดาวน์โหลดเป็น .csv
     จับคู่ด้วย "ชื่อหัวคอลัมน์" ไม่ใช่ลำดับคอลัมน์
       - คอลัมน์ Timestamp / ประทับเวลา ที่ Google ใส่มาเอง จะถูกข้าม
       - สลับลำดับคอลัมน์ได้ ไม่พัง
       - ชื่อวิชาต้องตรงกับที่ตั้งไว้ใน council_exam_config
     กุญแจของข้อมูล : รหัสนักศึกษา + ครั้งที่สอบ
       นำเข้าไฟล์เดิมซ้ำจะทับของเดิม ไม่เกิดข้อมูลซ้ำ
       แก้ในชีตแล้วนำเข้าใหม่ได้เลย
     นำเข้าแล้วยังไม่เขียนลงระบบ ต้องดูหน้าสรุปแล้วกดยืนยันก่อน */

  // อ่าน CSV ให้ถูกแม้มีจุลภาคหรือขึ้นบรรทัดใหม่อยู่ในเครื่องหมายคำพูด
  function parseCsv(text) {
    var rows = [], row = [], cur = '', q = false;
    var s = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return n(x) !== ''; }); });
  }

  // วันที่ : รับทั้ง ค.ศ. และ พ.ศ. ทั้งรูปแบบ ปปปป-ดด-วว และ วว/ดด/ปปปป
  function toIso(v) {
    var t = n(v).replace(/\s+/g, '');
    if (!t) return '';
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
      if (!m) return '';
      d = +m[1]; mo = +m[2]; y = +m[3];
    }
    if (y > 2400) y -= 543;                       // ปี พ.ศ. -> ค.ศ.
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    return y + '-' + p2(mo) + '-' + p2(d);
  }

  function normResult(v) {
    var t = n(v);
    if (!t) return '';
    if (/^ผ่าน/.test(t)) return PASS;
    if (/^ไม่ผ่าน/.test(t)) return FAIL;
    if (/ไม่ได้เข้าสอบ|ไม่เข้าสอบ|ขาดสอบ/.test(t)) return ABSENT;
    return '';
  }

  window.repCsvPick = function () {
    var el = document.getElementById('repCsvInput');
    if (!el) { showToast('ไม่พบช่องเลือกไฟล์', 'error'); return; }
    el.value = '';
    el.click();
  };

  window.repCsvFile = async function (ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!f) return;
    var text = await f.text();
    var rows = parseCsv(text);
    if (rows.length < 2) { showToast('ไฟล์ CSV ไม่มีข้อมูล', 'error'); return; }
    repCsvPlan(rows, f.name);
  };

  // หัวคอลัมน์ที่ระบบรู้จัก (นอกเหนือจากชื่อวิชา)
  var COL = {
    sid: ['รหัสนักศึกษา'],
    prefix: ['คำนำหน้า'],
    name: ['ชื่อ-สกุล', 'ชื่อ - สกุล', 'ชื่อสกุล'],
    batch: ['รุ่นที่', 'รุ่น'],
    round: ['ครั้งที่สอบ', 'รอบการสอบ'],
    date: ['วันที่สอบ']
  };
  function findCol(head, names) {
    for (var i = 0; i < head.length; i++) {
      var h = n(head[i]);
      for (var j = 0; j < names.length; j++) if (h === names[j]) return i;
    }
    return -1;
  }

  function repCsvPlan(rows, fname) {
    var head = rows[0].map(function (x) { return n(x); });
    var subs = cfg().subjects;
    var idx = {};
    Object.keys(COL).forEach(function (k) { idx[k] = findCol(head, COL[k]); });
    var subIdx = {};
    subs.forEach(function (s) { subIdx[s] = findCol(head, [s]); });

    var missing = [];
    ['sid', 'round'].forEach(function (k) {
      if (idx[k] < 0) missing.push(COL[k][0]);
    });
    var noSub = subs.filter(function (s) { return subIdx[s] < 0; });
    if (missing.length) {
      showModal('นำเข้าไม่ได้', '<div class="space-y-2 text-sm">'
        + '<p class="text-red-600">ไฟล์นี้ไม่มีคอลัมน์ที่จำเป็น: <b>' + esc(missing.join(', ')) + '</b></p>'
        + '<p class="text-gray-600">ตรวจว่าดาวน์โหลดจากชีตคำตอบของฟอร์มที่สร้างด้วยสคริปต์ '
        + '<code>CouncilExamForm.gs</code> และไม่ได้แก้ชื่อคำถาม</p></div>', null, 'max-w-lg');
      return;
    }

    var existing = {};
    examRows().forEach(function (x) { existing[x.sid + '|' + x.round] = x.raw; });

    var items = [], bad = [], seen = {};
    for (var r = 1; r < rows.length; r++) {
      var line = rows[r], at = 'บรรทัด ' + (r + 1) + ': ';
      var sid = n(line[idx.sid]), round = n(line[idx.round]);
      if (!sid && !round) continue;
      if (!/^\d{11}$/.test(sid)) { bad.push(at + 'รหัสนักศึกษา "' + sid + '" ไม่ใช่ตัวเลข 11 หลัก'); continue; }
      if (!round) { bad.push(at + 'ไม่มีครั้งที่สอบ'); continue; }
      var key = sid + '|' + round;
      if (seen[key]) { bad.push(at + 'ซ้ำกับบรรทัดก่อนหน้า (' + sid + ' ครั้งที่ ' + round + ') — ใช้แถวหลังสุด'); }
      seen[key] = 1;

      var res = {}, nRes = 0;
      subs.forEach(function (s) {
        if (subIdx[s] < 0) return;
        var v = normResult(line[subIdx[s]]);
        if (v) { res[s] = v; nRes++; }
        else if (n(line[subIdx[s]])) bad.push(at + s + ': อ่านค่า "' + n(line[subIdx[s]]) + '" ไม่ออก');
      });
      if (!nRes) { bad.push(at + 'ไม่มีผลรายวิชาเลย'); continue; }

      var d = idx.date >= 0 ? toIso(line[idx.date]) : '';
      if (idx.date >= 0 && n(line[idx.date]) && !d) bad.push(at + 'วันที่สอบ "' + n(line[idx.date]) + '" อ่านไม่ออก');

      items.push({
        sid: sid, round: round,
        prefix: idx.prefix >= 0 ? n(line[idx.prefix]) : '',
        name: idx.name >= 0 ? n(line[idx.name]) : '',
        batch: idx.batch >= 0 ? n(line[idx.batch]) : '',
        date: d, res: res, cur: existing[key] || null
      });
    }

    var add = items.filter(function (x) { return !x.cur; }).length;
    var upd = items.length - add;
    APP._repCsv = items;

    var warn = bad.length
      ? '<div class="border border-amber-200 bg-amber-50 rounded-xl p-3">'
        + '<p class="text-xs font-semibold text-amber-800 mb-1">ข้อสังเกต ' + bad.length + ' รายการ</p>'
        + '<ul class="text-[11px] text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">'
        + bad.slice(0, 50).map(function (x) { return '<li>• ' + esc(x) + '</li>'; }).join('')
        + (bad.length > 50 ? '<li class="text-amber-600">… และอีก ' + (bad.length - 50) + ' รายการ</li>' : '')
        + '</ul></div>' : '';

    var subWarn = noSub.length
      ? '<p class="text-xs text-amber-700">ไฟล์นี้ไม่มีคอลัมน์ของวิชา: <b>' + esc(noSub.join(', '))
        + '</b> — วิชาเหล่านี้จะไม่ถูกบันทึก</p>' : '';

    showModal('ตรวจก่อนนำเข้า — ' + esc(fname || ''),
      '<div class="space-y-3 text-sm">'
      + '<div class="grid grid-cols-3 gap-2 text-center">'
      + '<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p class="text-xs text-gray-500">เพิ่มใหม่</p>'
      + '<p class="text-2xl font-bold text-emerald-700 tabular-nums">' + add + '</p></div>'
      + '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3"><p class="text-xs text-gray-500">ทับของเดิม</p>'
      + '<p class="text-2xl font-bold text-primary tabular-nums">' + upd + '</p></div>'
      + '<div class="rounded-xl bg-gray-50 border border-gray-100 p-3"><p class="text-xs text-gray-500">ข้ามไป</p>'
      + '<p class="text-2xl font-bold text-gray-500 tabular-nums">' + (rows.length - 1 - items.length) + '</p></div>'
      + '</div>'
      + subWarn + warn
      + '<p class="text-[11px] text-gray-500">ทับของเดิม = มีรหัสนักศึกษาและครั้งที่สอบตรงกันอยู่แล้ว '
      + 'ระบบจะเขียนค่าใหม่ทับทั้งแถว · กดยืนยันแล้วจึงบันทึกลงระบบ</p>'
      + '</div>',
      items.length ? function () { window.repCsvApply(); } : null, 'max-w-2xl');
  }

  window.repCsvApply = async function () {
    var items = APP._repCsv || [];
    if (!items.length) { closeModal(); return; }
    if (!canSeeDetail()) { showToast('บัญชีของคุณไม่มีสิทธิ์นำเข้าข้อมูลนี้', 'error'); return; }
    closeModal();
    showToast('กำลังนำเข้า ' + items.length + ' รายการ...');
    try { await GSheetDB.refreshTab('council_exam'); } catch (e) { /* ใช้ข้อมูลที่มีอยู่ */ }
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var ok = 0, fail = 0, err = '';
    for (var i = 0; i < items.length; i++) {
      var x = items[i];
      var payload = {
        type: 'council_exam', student_id: x.sid, exam_round: x.round,
        title_prefix: x.prefix, name: x.name, batch: x.batch, exam_date: x.date,
        results_json: JSON.stringify(x.res), source: 'นำเข้า CSV', updated_by: who
      };
      var r = x.cur ? await GSheetDB.update(Object.assign({}, x.cur, payload))
                    : await GSheetDB.create(payload);
      if (r && r.isOk) ok++; else { fail++; err = (r && r.error) || ''; }
    }
    APP._repCsv = null;
    if (!fail) showToast('นำเข้าเรียบร้อย ' + ok + ' รายการ');
    else showToast('นำเข้าสำเร็จ ' + ok + ' รายการ ไม่สำเร็จ ' + fail + ': ' + err, 'error');
    renderCurrentPage();
  };

  /* ---------------- ผูกหน้าเข้ากับระบบเมนู ---------------- */
  var REP_PAGES = { reportExam: 'exam', reportJob: 'job' };

  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (page === 'reportExam') return examPage();
      if (page === 'reportJob') return jobPage();
      return orig.apply(this, arguments);
    };
  })();

  /* เมนู "รายงาน" เป็นกลุ่มพับได้ แทรกถัดจาก "บริการอื่นๆ"
     ใช้วิธีห่อ buildSidebar เหมือนเมนูภาระงานนักศึกษา จะได้ไม่ต้องแก้ app.js */
  (function () {
    var SUB = [['reportExam', 'ผลสอบสภาฯ'], ['reportJob', 'การได้งานทำของศิษย์เก่า']];

    function insertAfter(nav, box, selector) {
      var ref = nav.querySelector(selector);
      while (ref && ref.parentNode && ref.parentNode !== nav) ref = ref.parentNode;
      if (ref && ref.parentNode === nav) {
        if (ref.nextSibling) nav.insertBefore(box, ref.nextSibling);
        else nav.appendChild(box);
      } else nav.appendChild(box);
    }

    function addItem() {
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-rep-menu]')) return;
      // แสดงเฉพาะรายงานที่บัญชีนี้มีสิทธิ์ ไม่มีสิทธิ์สักอันก็ไม่ต้องขึ้นกลุ่มเมนู
      var subs = SUB.filter(function (s) {
        return s[0] === 'reportExam' ? canExam() : canJob();
      });
      if (!subs.length) return;
      var here = APP.currentPage;

      // เหลือรายงานเดียว ไม่ต้องทำเป็นกลุ่มพับให้กดสองครั้ง
      if (subs.length === 1) {
        var one = document.createElement('button');
        one.setAttribute('onclick', "navigateTo('" + subs[0][0] + "')");
        one.setAttribute('data-page', subs[0][0]);
        one.setAttribute('data-rep-menu', '1');
        one.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition '
          + (here === subs[0][0] ? 'bg-primaryLight text-primary font-semibold'
                                 : 'text-gray-700 hover:bg-surface hover:text-primary');
        one.innerHTML = '<i data-lucide="bar-chart-3" class="w-5 h-5 flex-shrink-0"></i>' + subs[0][1];
        insertAfter(nav, one, '[data-page="services"]');
        if (window.lucide) lucide.createIcons();
        return;
      }

      var open = subs.some(function (s) { return s[0] === here; });
      var box = document.createElement('div');
      box.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
      box.setAttribute('data-rep-menu', '1');
      box.innerHTML =
        '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
        + '<span class="flex items-center gap-3"><i data-lucide="bar-chart-3" class="w-5 h-5 flex-shrink-0"></i>รายงาน</span>'
        + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"></i></button>'
        + '<div class="dropdown-menu pl-4 mt-1 space-y-1">'
        + subs.map(function (s) {
            var on = here === s[0];
            return '<button onclick="navigateTo(\'' + s[0] + '\')" data-page="' + s[0] + '" '
              + 'class="nav-item w-full text-left px-3 py-2 rounded-xl text-sm transition '
              + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-600 hover:bg-surface hover:text-primary')
              + '">' + s[1] + '</button>';
          }).join('')
        + '</div>';
      insertAfter(nav, box, '[data-page="services"]');
      if (window.lucide) lucide.createIcons();
    }

    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      try { addItem(); } catch (e) { console.warn('เพิ่มเมนู รายงาน ไม่สำเร็จ:', e); }
    };
  })();

  window.repPages = REP_PAGES;
})();
