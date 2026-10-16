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
  /* รหัสแถวจริง (ตัวเลข) ของ CLO
     ในหน้าเว็บ __backendId เป็นข้อความ "plo_clo_20" — Number() ตรง ๆ ได้ NaN แล้วส่งไปเป็น null
     ฐานข้อมูลจึงปฏิเสธ (clo_id ห้ามว่าง) ต้องใช้ __rowIndex หรือเลขท้ายสุดของ __backendId
     รับได้ทั้งตัวระเบียน CLO และข้อความ __backendId */
  function cloNum(x) {
    if (x && typeof x === 'object') {
      var ri = Number(x.__rowIndex);
      if (ri) return ri;
      x = x.__backendId;
    }
    var m = String(x == null ? '' : x).match(/(\d+)$/);
    return m ? Number(m[1]) : null;
  }
  function cloKey(id) { return 'plo_clo_' + id; }   // กุญแจฝั่งหน้าเว็บ = __backendId
  /* ================= องค์ประกอบคะแนนของ CLO =================
     CLO หนึ่งข้อแบ่งเป็นหลายการประเมินได้ เช่น
       สอบกลางภาค เต็ม 40 คิด 20% (มีสอบซ่อม เกณฑ์ผ่าน 24)
       สอบปลายภาค เต็ม 25 คิด 5%  (มีสอบซ่อม เกณฑ์ผ่าน 15)
       ผังความคิด เต็ม 20 คิด 5%
       → รวม CLO 30%
     อาจารย์กรอก "คะแนนดิบ" ระบบคิดคะแนนที่ได้ คิดเป็น % และรวม CLO ให้
     ผลรวมแปลงเป็นร้อยละของน้ำหนัก CLO (เช่น 21.5/30 = 71.67%) แล้วเทียบกับเกณฑ์ผ่านของ CLO
     ที่เก็บ  : นิยามองค์ประกอบ → plo_clo.components (JSON)
               คะแนนดิบรายคน → plo_clo.extra คีย์ "sc:<รหัสนักศึกษา>" (ข้อความ JSON) — ไม่ต้องสร้างตารางใหม่
                                 อ่าน/เขียนตรงจากฐานข้อมูลทุกครั้ง และรวมทีละนักศึกษา จึงไม่ทับคะแนนของคนอื่น
               ร้อยละรวม      → plo_score.score ตามเดิม (หน้าสรุปผลจึงคำนวณได้เหมือนเดิม) */
  function comps(clo) {
    var raw = clo && clo.components;
    if (!raw) return [];
    try {
      var a = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(a) ? a.filter(function (c) { return c && s(c.name) && n(c.full) > 0; }) : [];
    } catch (e) { return []; }
  }
  function compWeight(list) { return list.reduce(function (t, c) { return t + n(c.weight); }, 0); }
  // คะแนนที่ใช้คิดของการประเมินหนึ่งรายการ (คืน null ถ้ายังไม่กรอก)
  function compUsed(c, d) {
    d = d || {};
    var sc = s(d.s) === '' ? null : n(d.s);
    var rt = (c.retake && s(d.r) !== '') ? n(d.r) : null;
    if (sc === null && rt === null) return null;
    if (rt === null) return sc;
    var pass = s(c.pass) !== '' ? n(c.pass) : (s(defPass(c.full)) !== '' ? n(defPass(c.full)) : null);
    if (c.rule === 'actual' || pass === null) return Math.max(sc || 0, rt);
    // สอบซ่อมผ่าน = ได้เท่าเกณฑ์ผ่าน · ไม่ผ่าน = ใช้คะแนนที่มากกว่า
    return rt >= pass ? Math.max(sc || 0, pass) : Math.max(sc || 0, rt);
  }
  function compCalc(clo, det) {
    var list = comps(clo), W = compWeight(list), tot = 0, done = 0;
    var rows = list.map(function (c) {
      var u = compUsed(c, (det || {})[c.id]);
      var w = u === null ? null : Math.min(u, n(c.full)) / n(c.full) * n(c.weight);
      if (w !== null) { tot += w; done++; }
      return { used: u, w: w };
    });
    var complete = list.length > 0 && done === list.length;
    return { rows: rows, total: tot, W: W, complete: complete,
             pct: (complete && W > 0) ? Math.round(tot / W * 10000) / 100 : null };
  }
  function f2(v) { return v == null ? '' : (Math.round(v * 100) / 100).toString(); }
  // ตัดคีย์คะแนนดิบ (sc:...) ออกก่อนส่งระเบียน CLO ไปแก้ไขแบบปกติ
  // ไม่งั้นค่าเก่าที่ค้างในเบราว์เซอร์จะไปทับคะแนนที่อาจารย์อีกท่านเพิ่งบันทึก
  function noScores(rec) {
    var o = {};
    Object.keys(rec || {}).forEach(function (k) { if (k.indexOf('sc:') !== 0 && k !== 'course_cfg') o[k] = rec[k]; });
    return o;
  }

  function state() {
    if (!APP._plo) {
      APP._plo = {
        tab: 'summary', view: 'plo',
        curriculum: '', batch: '', year: '', sem: '', subj: '',
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
    var has = function (x) { return roles.indexOf(x) >= 0; };
    if (has('admin') || has('academic')) return true;
    // ผู้บริหารดูได้อย่างเดียว — ไม่เห็นหน้าบันทึกข้อมูล แม้มีบทบาทอาจารย์ร่วมด้วย
    if (has('executive')) return false;
    return has('teacher') || has('classTeacher');
  }

  /* ================= สิทธิ์ตามบทบาท =================
     ดูทุกรายวิชา       : ผู้ดูแลระบบ งานวิชาการ งานทะเบียน ผู้บริหาร
     ประธานสาขา        : ดูเฉพาะรายวิชาในสาขาของตน (วิชาที่มีหลายสาขา ทุกสาขาที่เกี่ยวข้องเห็น)
     กรอก/แก้ทุกรายวิชา : ผู้ดูแลระบบ งานวิชาการ
     อาจารย์           : กรอกได้เฉพาะรายวิชาที่ตนเป็นผู้ประสานงาน
                         CLO ที่ผู้ประสานงานคนอื่นกรอกไว้ ดูได้แต่แก้/ลบ/กรอกคะแนนไม่ได้ (เจ้าของ = created_by)
                         CLO เดิมที่ยังไม่มีชื่อผู้กรอก ผู้ประสานงานของวิชาแก้ได้ทุกคน */
  function myRoles() { return (APP._roles && APP._roles.length) ? APP._roles : [APP.currentRole]; }
  function hasRole(list) { return myRoles().some(function (r) { return list.indexOf(r) >= 0; }); }
  function isAllEdit() { return hasRole(['admin', 'academic']); }
  function isAllView() { return hasRole(['admin', 'academic', 'registrar', 'executive']); }
  function meName() { return s(APP.currentUser && APP.currentUser.name); }
  function isCoord(subj) { return typeof subjectHasCoordinator === 'function' && !!meName() && subjectHasCoordinator(subj || {}, meName()); }
  function mySubject(subj) { return isAllEdit() || isCoord(subj); }
  function cloSubject(c) {
    return get('subject').filter(function (x) {
      return s(x.subject_code) === s(c.subject_code) && s(x.academic_year) === s(c.academic_year) && s(x.semester) === s(c.semester);
    })[0] || get('subject').filter(function (x) { return s(x.subject_code) === s(c.subject_code); })[0] || { subject_code: c.subject_code };
  }
  function cloOwner(c) { return s(c && c.created_by); }
  function canEditClo(c) {
    if (!c || !canEdit()) return false;
    if (isAllEdit()) return true;
    if (!isCoord(cloSubject(c))) return false;
    var o = cloOwner(c);
    return !o || o === meName();
  }
  function lockMsg(c) { return cloRef(c) + ' กรอกโดย ' + (cloOwner(c) || 'ผู้อื่น') + ' — แก้ไข/ลบได้เฉพาะผู้กรอก'; }
  // ประธานสาขา (ที่ไม่ได้มีบทบาทดูทั้งหมด) เห็นเฉพาะสาขาตน · null = ไม่จำกัด
  function viewSubjectFilter() {
    if (isAllView()) return null;
    var isHead = hasRole(['deptHead']), isTeacher = hasRole(['teacher', 'classTeacher']);
    if (!isHead && !isTeacher) return null;
    var dept = typeof currentDept === 'function' ? currentDept() : s(APP.currentUser && APP.currentUser.department);
    var codes = {}, names = {};
    get('subject').forEach(function (x) {
      // ประธานสาขา = วิชาในสาขา · อาจารย์ = วิชาที่ตนเป็นผู้ประสานงาน (มีทั้งสองบทบาท = รวมกัน)
      var ok = (isHead && typeof subjectHasDept === 'function' && subjectHasDept(x, dept)) || (isTeacher && isCoord(x));
      if (ok) { codes[s(x.subject_code)] = 1; names[s(x.subject_name)] = 1; }
    });
    return function (r) { return s(r['รหัสวิชา']) ? !!codes[s(r['รหัสวิชา'])] : !!names[s(r['รายวิชา'])]; };
  }
  /* รายการ PLO สำหรับช่องเลือก — เรียง PLO หลักตามเลข แล้วตามด้วย Sub-PLO ของข้อนั้นทันที
     (เดิมเรียงตาม sort_order ล้วน PLO หลักทั้ง 10 ข้อจึงขึ้นก่อน แล้ว Sub-PLO ทั้งหมดไปกองต่อท้าย
      ดูไม่ออกว่า 1.1 อยู่ใต้ PLO ไหน) */
  function ploNo(code) {
    var m = s(code).match(/(\d+)(?:\.(\d+))?/);
    return m ? [Number(m[1]), m[2] ? Number(m[2]) : 0] : [999, 0];
  }
  function ploOptions() {
    var st = state();
    var all = get('curriculum_plo').filter(function (p) { return s(p.curriculum_year) === s(st.curriculum); });
    var byNo = function (a, b) {
      var x = ploNo(a.plo_code), y = ploNo(b.plo_code);
      return (x[0] - y[0]) || (x[1] - y[1]) || ((Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    };
    var mains = all.filter(function (p) { return !s(p.parent_code); }).sort(byNo);
    var subs = all.filter(function (p) { return s(p.parent_code); });
    var used = {}, out = [];
    mains.forEach(function (m) {
      out.push(m);
      var mn = ploNo(m.plo_code)[0];
      subs.filter(function (x) {
        // ผูกด้วย parent_code ก่อน ถ้ารหัสเขียนต่างรูปแบบ (PLO1 กับ 1) เทียบด้วยเลข PLO แทน
        return !used[x.__backendId] && (s(x.parent_code) === s(m.plo_code) || ploNo(x.parent_code)[0] === mn);
      }).sort(byNo).forEach(function (x) { used[x.__backendId] = 1; out.push(x); });
    });
    subs.filter(function (x) { return !used[x.__backendId]; }).sort(byNo).forEach(function (x) { out.push(x); });
    return out;
  }
  // ข้อความในช่องเลือก — Sub-PLO เยื้องเข้า (ใช้ช่องว่างแบบไม่ยุบ) และตัดข้อความยาวด้วย … ไม่ตัดกลางคำห้วน ๆ
  function ploLabel(p) {
    var t = s(p.statement_th);
    if (t.length > 80) t = t.slice(0, 80).replace(/\s+\S*$/, '') + '…';
    return (s(p.parent_code) ? '\u00a0\u00a0\u00a0\u00a0└ ' : '') + s(p.plo_code) + ' ' + t;
  }

  /* ================= หน้าหลัก ================= */
  window.ploPage = function ploPage() {
    var st = state();
    var head = '<div class="flex flex-wrap items-start justify-between gap-3 mb-5">'
      + '<div><h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">'
      + '<i data-lucide="target" class="w-5 h-5 text-primary"></i>ประเมินผลหลักสูตร PLOs</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">อัตราการบรรลุผลลัพธ์การเรียนรู้ระดับรายวิชา หลักสูตร และชั้นปี</p></div>'
      + '</div>';

    /* เมนูย่อยอยู่ที่แถบเมนูด้านซ้ายแล้ว (สรุปผลรวม · บันทึกข้อมูล)
       ในหน้าแสดงแค่ป้ายบอกว่ากำลังอยู่ส่วนไหน */
    var isEntry = st.tab === 'entry' && canEdit();
    var tabs = '<div class="flex items-center gap-2 mb-5 border-b border-gray-100 pb-3 text-sm">'
      + '<span class="px-3 py-1.5 rounded-xl bg-primary text-white flex items-center gap-2">'
      + '<i data-lucide="' + (isEntry ? 'pencil-line' : 'bar-chart-3') + '" class="w-4 h-4"></i>'
      + (isEntry ? 'บันทึกข้อมูล' : 'สรุปผลรวม') + '</span>'
      + (canEdit() ? '<button onclick="navigateTo(\'' + (isEntry ? 'ploSummary' : 'ploEntry') + '\')" class="text-xs text-gray-500 hover:text-primary">'
        + (isEntry ? 'ไปที่สรุปผลรวม →' : 'ไปที่บันทึกข้อมูล →') + '</button>' : '')
      + '</div>';

    var body = isEntry ? entryTab() : summaryTab();
    return '<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">'
      + head + tabs + body + '</div>';
  };

  window.ploSet = function (k, v) {
    var st = state();
    // เปลี่ยนรายวิชา/ภาค/ปี/ชั้นปี ขณะมีคะแนนที่ยังไม่บันทึก — ถามก่อน ไม่ให้หายเงียบ ๆ
    if (['eYear', 'eSem', 'eLevel', 'eSubject'].indexOf(k) >= 0 && s(st[k]) !== s(v)
        && st._dirty && Object.keys(st._dirty).length
        && !confirm('ยังมีคะแนนที่แก้ไขแต่ยังไม่ได้บันทึก ' + Object.keys(st._dirty).length + ' ช่อง\nเปลี่ยนไปหน้าอื่นจะไม่บันทึกคะแนนเหล่านี้ ต้องการเปลี่ยนใช่หรือไม่')) {
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
      return;
    }
    st[k] = v;
    if (['curriculum', 'batch', 'year', 'sem'].indexOf(k) >= 0) { st.summary = null; st.subj = ''; }
    if (['eYear', 'eSem', 'eLevel'].indexOf(k) >= 0) { st.eSubject = ''; st.scores = null; }
    if (k === 'eSubject') { st.scores = null; st.gridClo = ''; }
    if (['eYear', 'eSem', 'eLevel', 'eSubject'].indexOf(k) >= 0) st._dirty = {};
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
      + summarySubjSelect()
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
      st.summary = r.data || {}; st._aggMode = null;
      try { await tagSections([].concat(st.summary['ราย CLO'] || [], st.summary['รายวิชาที่ต้องติดตาม'] || [])); } catch (e2) { }
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
      var full = st.summary, view = filteredSummary();
      var ov = view['ภาพรวม'] || {};
      if (!ov['ผลการประเมินทั้งหมด']) {
        body = hint(s(st.subj) ? 'รายวิชานี้ยังไม่มีคะแนนที่บันทึกไว้ในเงื่อนไขที่เลือก' : 'ยังไม่มีคะแนนที่บันทึกไว้ในเงื่อนไขที่เลือก — ไปที่แท็บ "บันทึกข้อมูล" เพื่อกำหนด CLO และกรอกคะแนน');
      } else {
        st.summary = view;   // ส่วนแสดงผลทุกส่วนอ่านจาก st.summary — สลับชั่วคราวระหว่างวาด
        try {
          var allowB = viewSubjectFilter();
          body = (allowB && !s(st.subj) ? '<p class="text-xs text-primary mb-3"><i data-lucide="filter" class="w-3.5 h-3.5 inline"></i> ' + (hasRole(['deptHead'])
                    ? 'แสดงเฉพาะรายวิชาในสาขา ' + esc(typeof currentDept === 'function' ? currentDept() : '') + (hasRole(['teacher', 'classTeacher']) ? ' และรายวิชาที่ท่านเป็นผู้ประสานงาน' : '')
                    : 'แสดงเฉพาะรายวิชาที่ท่านเป็นผู้ประสานงาน')
                  + ' · ผลรวมคำนวณจาก CLO ของรายวิชาเหล่านี้</p>' : '')
            + (s(st.subj) ? '<p class="text-xs text-primary mb-3"><i data-lucide="filter" class="w-3.5 h-3.5 inline"></i> แสดงเฉพาะรายวิชา ' + esc(st.subj)
                  + ' · ผลรวมคำนวณจาก CLO ของรายวิชานี้ · ค้นหารายบุคคลยังแสดงทุกรายวิชา</p>' : '')
            + cards(ov) + chartBlock() + watchTable() + studentBox();
        } finally { st.summary = full; }
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
        + '<span class="text-xs text-gray-700 flex-1 truncate" title="' + esc(label(r) + (st.view === 'clo' && r.__sec ? ' [' + r.__sec + ']' : '')) + '">' + esc(label(r)) + (st.view === 'clo' ? secChip(r.__sec) : '') + '</span>'
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

    return section('อัตราการบรรลุ', toggle + legend + (st.view === 'clo' ? cloGrouped(rows) : '<div class="mt-1">' + bars + '</div>'));
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
              + '<td class="px-3 py-2.5 whitespace-nowrap">' + esc(r['CLO']) + secChip(r.__sec) + '</td>'
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
    if (st.stuYear === undefined) st.stuYear = st.year;
    if (st.stuSem === undefined) st.stuSem = st.sem;
    var sel = function (label, key, opts, blank, dis) {
      return '<div><label class="block text-xs text-gray-600 mb-1">' + esc(label) + '</label>'
        + '<select ' + (dis ? 'disabled title="เลือกปีการศึกษาและภาคการศึกษาก่อน" ' : '') + 'onchange="ploStuSet(\'' + key + '\',this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm max-w-[16rem]' + (dis ? ' bg-gray-50 text-gray-400' : '') + '">'
        + '<option value="">' + esc(blank) + '</option>'
        + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (s(st[key]) === s(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
        + '</select></div>';
    };
    var ready = s(st.stuYear) && s(st.stuSem);
    var subjOpts = [];
    if (ready) {
      var seen = {}, allow = viewSubjectFilter();
      ((res && res['ราย CLO']) || []).forEach(function (r) {
        if (s(r['ปีการศึกษา']) !== s(st.stuYear) || s(r['ภาคเรียน']) !== s(st.stuSem)) return;
        var k = s(r['รหัสวิชา']) || s(r['รายวิชา']);
        if (!k || seen[k]) return;
        if (allow && !allow(r)) return;
        seen[k] = 1; subjOpts.push([k, (s(r['รหัสวิชา']) ? s(r['รหัสวิชา']) + ' ' : '') + s(r['รายวิชา'])]);
      });
    }
    var box = '<div class="flex flex-wrap items-end gap-3 mb-4">'
      + '<div class="flex-1 min-w-[240px]"><label class="block text-xs text-gray-600 mb-1">นักศึกษา</label><div class="relative">'
      + '<i data-lucide="search" class="absolute left-3 top-2.5 w-4 h-4 text-gray-400"></i>'
      + '<input id="ploStuSearch" type="text" value="' + esc(st.stuQuery) + '" list="ploStuList" '
      + 'placeholder="พิมพ์รหัสนักศึกษาหรือชื่อ แล้วกด Enter..." '
      + 'class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm" '
      + 'onchange="ploFindStudent(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();ploFindStudent(this.value)}">'
      + studentDatalist() + '</div></div>'
      + sel('ปีการศึกษา', 'stuYear', yearsList().map(function (y) { return [y, y]; }), 'ทุกปี')
      + sel('ภาคการศึกษา', 'stuSem', SEMS.map(function (x) { return [x, x === '3' ? 'ฤดูร้อน' : x]; }), 'ทุกภาค')
      + sel('รายวิชา', 'stuSubj', subjOpts, ready ? (res ? 'ทุกรายวิชา' : 'ค้นหานักศึกษาก่อน') : 'เลือกปี/ภาคก่อน', !ready)
      + '<button onclick="ploFindStudent(document.getElementById(\'ploStuSearch\').value)" '
      + 'class="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-surface">ค้นหา</button>'
      + (res ? '<button onclick="ploSet(\'stuResult\',null)" class="px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600">ล้าง</button>' : '')
      + '</div>';

    if (!res) return section('ผลการบรรลุรายบุคคล', box + '<p class="text-xs text-gray-400">ค้นหาเพื่อดูผลการบรรลุของนักศึกษาแต่ละคน · เลือกปี/ภาค/รายวิชาเพื่อจำกัดช่วงข้อมูลได้</p>');

    // กรองรายวิชา (ฝั่งเครื่อง) แล้วคำนวณภาพรวม / ราย PLO ใหม่จากแถว CLO ที่เหลือ
    var all = res['ราย CLO'] || [];
    var rows = all.filter(function (r) {
      if (!s(st.stuSubj) || !ready) return true;
      return (s(r['รหัสวิชา']) || s(r['รายวิชา'])) === s(st.stuSubj);
    });
    var pass = rows.filter(function (r) { return r['ผ่าน']; }).length;
    var pct = rows.length ? Math.round(pass / rows.length * 10000) / 100 : 0;
    var lv = bandFor(pct, []), b = bandOf(lv);
    var subjSet = {};
    rows.forEach(function (r) { subjSet[s(r['รหัสวิชา']) || s(r['รายวิชา'])] = 1; });
    var have = {};
    (res['ราย PLO'] || []).forEach(function (r) { have[s(r['PLO'])] = 1; });
    var pg = {}, porder = [];
    rows.forEach(function (r) {
      var c = s(r['PLO']), k = (!Object.keys(have).length || have[c]) ? c : ploMainOf(c);
      if (!k) return;
      if (!pg[k]) { pg[k] = { k: k, pass: 0, tot: 0 }; porder.push(k); }
      pg[k].tot++; if (r['ผ่าน']) pg[k].pass++;
    });
    porder.sort(function (a, c) { var x = ploNo(a), y = ploNo(c); return (x[0] - y[0]) || (x[1] - y[1]); });

    var card = function (label, value, sub, cls) {
      return '<div class="rounded-2xl border p-4 ' + (cls || 'border-gray-100 bg-surface') + '">'
        + '<p class="text-xs text-gray-500">' + esc(label) + '</p>'
        + '<p class="text-2xl font-bold mt-1">' + value + '</p>'
        + (sub ? '<p class="text-xs text-gray-500 mt-0.5">' + sub + '</p>' : '') + '</div>';
    };
    var scope = (s(st.stuYear) ? 'ปีการศึกษา ' + esc(st.stuYear) : 'ทุกปีการศึกษา') + ' · ' + (s(st.stuSem) ? 'ภาค ' + esc(st.stuSem === '3' ? 'ฤดูร้อน' : st.stuSem) : 'ทุกภาค')
      + (s(st.stuSubj) && ready ? ' · ' + esc((subjOpts.filter(function (o) { return o[0] === st.stuSubj; })[0] || [0, st.stuSubj])[1]) : '');
    var head = '<div class="flex flex-wrap items-baseline gap-x-3 mb-3"><p class="font-semibold text-gray-800">' + esc(res['ชื่อ'] || '-')
      + ' <span class="font-mono text-xs text-gray-500">' + esc(res['รหัสนักศึกษา']) + '</span></p>'
      + '<p class="text-xs text-gray-500">' + scope + '</p></div>';
    if (!rows.length) return section('ผลการบรรลุรายบุคคล', box + head + hint('ไม่มีผลการประเมินในช่วงที่เลือก'));
    var cards = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">'
      + card('ร้อยละผ่านภาพรวม', '<span class="' + b.text + '">' + fx(pct) + '%</span>', '<span class="' + b.text + ' font-medium">ระดับ ' + esc(lv.label || '-') + '</span>', b.bg + ' ' + b.ring)
      + card('ผลการประเมินทั้งหมด', rows.length, 'ผ่าน ' + pass + ' · ไม่ผ่าน ' + (rows.length - pass))
      + card('จำนวนรายวิชา', Object.keys(subjSet).length, 'ที่มีผลการประเมิน')
      + card('PLO ที่เกี่ยวข้อง', porder.length, porder.filter(function (k) { return pg[k].pass < pg[k].tot; }).length + ' PLO มี CLO ไม่ผ่าน')
      + '</div>';

    var view = st.stuView || 'plo';
    var tg = '<div class="flex flex-wrap items-center gap-2 mb-3">'
      + [['plo', 'ราย PLO'], ['clo', 'ราย CLO']].map(function (v) {
          return '<button onclick="ploSet(\'stuView\',\'' + v[0] + '\')" class="px-3 py-1.5 rounded-lg text-xs transition '
            + (view === v[0] ? 'bg-primary text-white' : 'border border-gray-200 text-gray-600 hover:bg-surface') + '">' + v[1] + '</button>';
        }).join('') + '</div>';
    var bar = function (p, crit, bb, w) {
      return '<div class="relative h-2 rounded-full bg-gray-100 ' + (w || 'w-full') + '">'
        + '<div class="h-2 rounded-full" style="width:' + Math.max(0, Math.min(100, p)) + '%;background:' + bb.bar + '"></div>'
        + (crit != null ? '<div class="absolute border-l-2 border-gray-500" style="top:-3px;height:14px;left:' + Math.min(100, crit) + '%" title="เกณฑ์ผ่าน ' + fx(crit, 0) + '%"></div>' : '')
        + '</div>';
    };
    var body;
    if (view === 'plo') {
      body = porder.map(function (k) {
        var g = pg[k], p = g.tot ? Math.round(g.pass / g.tot * 10000) / 100 : 0, l = bandFor(p, []), bb = bandOf(l);
        return '<div class="mb-3"><div class="flex items-baseline gap-2 mb-1">'
          + '<span class="text-xs text-gray-700 flex-1">' + esc(k.replace('PLO', 'PLO ')) + '</span>'
          + '<span class="text-xs font-semibold text-gray-800 tabular-nums">' + fx(p) + '%</span>'
          + '<span class="text-[11px] ' + bb.text + '">' + esc(l.label || '') + '</span></div>'
          + bar(p, null, bb) + '<p class="text-[11px] text-gray-400 mt-0.5">ผ่าน ' + g.pass + ' จาก ' + g.tot + ' CLO</p></div>';
      }).join('');
    } else {
      var groups = {}, order = [];
      rows.forEach(function (r) {
        var k = s(r['รหัสวิชา']) || s(r['รายวิชา']) || '-';
        if (!groups[k]) { groups[k] = { name: s(r['รายวิชา']), code: s(r['รหัสวิชา']), term: s(r['ภาคเรียน']) + '/' + s(r['ปีการศึกษา']), rows: [] }; order.push(k); }
        groups[k].rows.push(r);
      });
      var single = order.length === 1;
      body = order.map(function (k) {
        var g = groups[k], ok = g.rows.filter(function (r) { return r['ผ่าน']; }).length;
        var p = Math.round(ok / g.rows.length * 10000) / 100, l = bandFor(p, []), bb = bandOf(l);
        g.rows.sort(function (a, c) {
          return (SEC_ORDER[a.__sec || ''] || 0) - (SEC_ORDER[c.__sec || ''] || 0) || s(a['CLO']).localeCompare(s(c['CLO']), undefined, { numeric: true });
        });
        var tbl = '<div class="overflow-x-auto border-t border-gray-100"><table class="w-full text-sm" data-ems-cards="skip"><thead><tr class="text-left text-[11px] text-gray-500 border-b">'
          + '<th class="px-3 py-1.5 font-medium">CLO</th><th class="px-3 py-1.5 font-medium">PLO</th>'
          + '<th class="px-3 py-1.5 font-medium" style="width:38%">คะแนน (เส้นดำ = เกณฑ์ผ่าน)</th><th class="px-3 py-1.5 font-medium text-center">ผล</th></tr></thead><tbody>'
          + g.rows.map(function (r) {
              var full = n(r['คะแนนเต็ม']) || 100, sc = n(r['คะแนน']), ps = n(r['เกณฑ์ผ่าน']);
              var p2 = sc / full * 100, c2 = ps / full * 100;
              var bb2 = r['ผ่าน'] ? BAND.emerald : BAND.red;
              return '<tr class="border-t border-gray-50">'
                + '<td class="px-3 py-1.5 whitespace-nowrap">' + esc(r['CLO']) + secChip(r.__sec) + '</td>'
                + '<td class="px-3 py-1.5 text-xs text-gray-500">' + esc(r['PLO'] || '') + '</td>'
                + '<td class="px-3 py-1.5"><div class="flex items-center gap-2">' + bar(p2, c2, bb2, 'flex-1" style="min-width:6rem')
                + '<span class="text-xs tabular-nums text-gray-800 whitespace-nowrap" style="min-width:5.5rem;text-align:right">'
                + (full === 100 ? fx(sc) + '%' : esc(r['คะแนน']) + ' / ' + esc(r['คะแนนเต็ม'])) + ' <span class="text-gray-400">(' + esc(r['เกณฑ์ผ่าน']) + ')</span></span></div></td>'
                + '<td class="px-3 py-1.5 text-center">' + (r['ผ่าน']
                    ? '<span class="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs"><i data-lucide="check" class="w-3 h-3 inline"></i> ผ่าน</span>'
                    : '<span class="px-2 py-0.5 rounded-lg bg-red-50 text-red-700 text-xs"><i data-lucide="x" class="w-3 h-3 inline"></i> ไม่ผ่าน</span>') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        return '<details class="border border-gray-100 rounded-xl mb-2 bg-white"' + (single || st.stuOpenAll ? ' open' : '') + '>'
          + '<summary class="list-none cursor-pointer px-3 py-2.5 flex flex-wrap items-center gap-y-1" style="column-gap:1rem">'
          + '<i data-lucide="chevron-right" class="w-4 h-4 text-gray-400 ems-chev"></i>'
          + '<span class="text-sm font-medium text-gray-800 flex-1" style="min-width:12rem">' + (g.code ? '<span class="font-mono text-xs text-gray-400 mr-1">' + esc(g.code) + '</span>' : '') + esc(g.name)
          + ' <span class="text-[11px] text-gray-400">ภาค ' + esc(g.term) + '</span></span>'
          + '<span class="text-[11px] text-gray-500">' + g.rows.length + ' CLO</span>'
          + '<span class="flex items-center gap-2 w-44">' + bar(p, null, bb, 'flex-1') + '<span class="text-xs font-semibold tabular-nums text-gray-800">' + fx(p) + '%</span></span>'
          + (ok < g.rows.length ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 whitespace-nowrap"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> ไม่ผ่าน ' + (g.rows.length - ok) + ' CLO</span>'
                                : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap"><i data-lucide="check" class="w-3 h-3 inline"></i> ผ่านทุก CLO</span>')
          + '</summary>' + tbl + '</details>';
      }).join('');
      body = (single ? '' : '<div class="flex justify-end gap-3 mb-2 text-[11px]"><button type="button" onclick="ploSet(\'stuOpenAll\',true)" class="text-primary hover:underline">เปิดทั้งหมด</button>'
          + '<button type="button" onclick="ploSet(\'stuOpenAll\',false)" class="text-primary hover:underline">ปิดทั้งหมด</button></div>')
        + '<style>details[open] > summary .ems-chev{transform:rotate(90deg)} details > summary::-webkit-details-marker{display:none}</style>' + body;
    }
    return section('ผลการบรรลุรายบุคคล', box + head + cards + tg + body);
  }
  // เปลี่ยนปี/ภาค = ดึงผลใหม่จากเซิร์ฟเวอร์ · เปลี่ยนรายวิชา = กรองในเครื่อง
  window.ploStuSet = function (k, v) {
    var st = state();
    st[k] = v;
    if (k === 'stuYear' || k === 'stuSem') {
      st.stuSubj = '';
      if (st.stuResult && s(st.stuQuery)) { window.ploFindStudent(st.stuQuery); return; }
    }
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

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
        p_year: (st.stuYear === undefined ? st.year : st.stuYear) || null,
        p_semester: (st.stuSem === undefined ? st.sem : st.stuSem) || null
      });
      if (r.error) { showToast('ค้นหาไม่สำเร็จ: ' + r.error.message, 'error'); return; }
      st.stuResult = r.data || null;
      try { if (st.stuResult) await tagStudentSections(st.stuResult['ราย CLO'], sid); } catch (e2) { }
      var allowS = viewSubjectFilter();
      if (st.stuResult && allowS) {
        var rowsS = (st.stuResult['ราย CLO'] || []).filter(allowS), okS = rowsS.filter(function (x) { return x['ผ่าน']; }).length;
        var pctS = rowsS.length ? Math.round(okS / rowsS.length * 10000) / 100 : 0;
        st.stuResult = Object.assign({}, st.stuResult, { 'ราย CLO': rowsS, 'ราย PLO': [],
          'ภาพรวม': Object.assign({}, st.stuResult['ภาพรวม'] || {}, { 'ผลการประเมิน': rowsS.length, 'ผ่าน': okS, 'ร้อยละผ่าน': pctS, 'ระดับ': bandFor(pctS, []) }) });
      }
    } catch (e) { showToast('ค้นหาไม่สำเร็จ: ' + e, 'error'); return; }
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };


  /* ================= ป้ายส่วน (ทฤษฎี/ทดลอง/ปฏิบัติ) ในหน้าสรุปผล =================
     ฟังก์ชันสรุปบนเซิร์ฟเวอร์ส่งมาแค่ "รายวิชา + รหัส CLO" ไม่มีส่วน
     จึงจับคู่กับ CLO ในเครื่อง (plo_clo) เอง
       • รหัสนั้นมีส่วนเดียว → ใช้ส่วนนั้น
       • รหัสเดียวกันอยู่หลายส่วน (เช่น CLO 1.1.2 ทฤษฎี + ทดลอง) → นับผลของแต่ละ CLO จากตารางคะแนน
         แล้วจับคู่ด้วยจำนวน "ผ่าน / ทั้งหมด" (รายบุคคลจับคู่ด้วยคะแนน)
         ถ้าตัวเลขเท่ากันทุกประการ แถวเหล่านั้นแสดงผลเหมือนกัน จึงสลับป้ายกันได้โดยไม่ผิดความหมาย */
  function secChip(x) {
    if (!x) return '';
    var cls = x === 'ทฤษฎี' ? 'bg-sky-50 text-sky-700 border-sky-100' : x === 'ทดลอง' ? 'bg-violet-50 text-violet-700 border-violet-100' : 'bg-amber-50 text-amber-700 border-amber-100';
    return '<span class="inline-block px-1.5 py-0 rounded-md border text-[10px] font-medium align-middle ml-1 ' + cls + '">' + esc(x) + '</span>';
  }
  function rowCands(r) {
    var st = state(), code = s(r['CLO']), scode = s(r['รหัสวิชา']), sname = s(r['รายวิชา']);
    var yr = s(r['ปีการศึกษา']), sm = s(r['ภาคเรียน']);
    return get('plo_clo').filter(function (c) {
      if (s(c.curriculum_year) !== s(st.curriculum) || s(c.clo_code) !== code) return false;
      if (scode ? s(c.subject_code) !== scode : s(c.subject_name) !== sname) return false;
      if (yr && s(c.academic_year) !== yr) return false;
      if (sm && s(c.semester) !== sm) return false;
      if (!yr && st.year && s(c.academic_year) !== s(st.year)) return false;
      if (!sm && st.sem && s(c.semester) !== s(st.sem)) return false;
      return true;
    });
  }
  async function cloStats(ids) {
    var out = {};
    await Promise.all(ids.map(async function (id) {
      var c = get('plo_clo').filter(function (x) { return cloNum(x) === id; })[0] || {};
      var a = await sb().from('plo_score').select('clo_id', { count: 'exact', head: true }).eq('clo_id', id);
      var b = await sb().from('plo_score').select('clo_id', { count: 'exact', head: true }).eq('clo_id', id).gte('score', n(c.pass_score));
      out[id] = { total: a.count || 0, pass: b.count || 0 };
    }));
    return out;
  }
  // ใส่ r.__sec ให้แถวสรุป (ราย CLO / รายวิชาที่ต้องติดตาม)
  async function tagSections(rows) {
    rows = (rows || []).filter(function (r) { return r && r['CLO'] != null; });
    var groups = {};
    rows.forEach(function (r) {
      var cands = rowCands(r);
      var secs = cands.map(secOf).filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (secs.length <= 1) { r.__sec = secs[0] || ''; return; }
      var k = s(r['รหัสวิชา'] || r['รายวิชา']) + '|' + s(r['CLO']) + '|' + s(r['ปีการศึกษา']) + '|' + s(r['ภาคเรียน']);
      (groups[k] = groups[k] || { rows: [], cands: cands }).rows.push(r);
    });
    var keys = Object.keys(groups);
    if (!keys.length) return;
    var ids = [];
    keys.forEach(function (k) { groups[k].cands.forEach(function (c) { if (ids.indexOf(cloNum(c)) < 0) ids.push(cloNum(c)); }); });
    var stat = {};
    try { stat = await cloStats(ids); } catch (e) { stat = {}; }
    keys.forEach(function (k) {
      var g = groups[k], left = g.cands.slice();
      g.rows.forEach(function (r) {
        var tot = n(r['ผลการประเมิน'] != null ? r['ผลการประเมิน'] : r['นักศึกษา']), ps = n(r['ผ่าน']);
        var i = left.findIndex(function (c) { var x = stat[cloNum(c)]; return x && x.total === tot && x.pass === ps; });
        if (i < 0) i = 0;
        r.__sec = left.length ? secOf(left[i]) : '';
        if (left.length > 1) left.splice(i, 1);
      });
    });
  }
  // รายบุคคล : จับคู่ด้วยคะแนนของนักศึกษาคนนั้น
  async function tagStudentSections(rows, sid) {
    rows = rows || [];
    var amb = [];
    rows.forEach(function (r) {
      var cands = rowCands(r);
      var secs = cands.map(secOf).filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (secs.length <= 1) r.__sec = secs[0] || ''; else amb.push({ r: r, cands: cands });
    });
    if (!amb.length) return;
    var ids = [];
    amb.forEach(function (a) { a.cands.forEach(function (c) { if (ids.indexOf(cloNum(c)) < 0) ids.push(cloNum(c)); }); });
    var q = await sb().from('plo_score').select('clo_id,score').eq('student_id', sid).in('clo_id', ids);
    var sc = {};
    ((q && q.data) || []).forEach(function (x) { sc[x.clo_id] = n(x.score); });
    var used = {};
    amb.forEach(function (a) {
      var v = n(a.r['คะแนน']);
      var c = a.cands.filter(function (c) { return !used[cloNum(c)] && sc[cloNum(c)] != null && Math.abs(sc[cloNum(c)] - v) < 0.01; })[0]
        || a.cands.filter(function (c) { return !used[cloNum(c)]; })[0] || a.cands[0];
      used[cloNum(c)] = 1;
      a.r.__sec = secOf(c);
    });
  }


  /* ================= เลือกดูทีละรายวิชา (หน้าสรุปผลรวม) =================
     ต้องเลือกปีการศึกษาและภาคก่อน · ไม่เลือก = ทุกรายวิชาเหมือนเดิม
     ฟังก์ชันสรุปบนเซิร์ฟเวอร์ไม่มีตัวกรองรายวิชา จึงกรองแถว "ราย CLO" ในเครื่อง
     แล้วรวมเป็นภาพรวม / ราย PLO / ราย YLO ใหม่ด้วยวิธีเดียวกับเซิร์ฟเวอร์ (ตรวจวิธีจากผลรวมทั้งหมดอัตโนมัติ) */
  function summarySubjects() {
    var st = state(), seen = {}, out = [];
    get('plo_clo').forEach(function (c) {
      if (s(c.curriculum_year) !== s(st.curriculum) || s(c.academic_year) !== s(st.year) || s(c.semester) !== s(st.sem)) return;
      var k = s(c.subject_code);
      if (!k || seen[k]) return;
      var allow = viewSubjectFilter();
      if (allow && !allow({ 'รหัสวิชา': k })) return;
      seen[k] = 1; out.push({ code: k, name: s(c.subject_name) });
    });
    return out.sort(function (a, b) { return a.code.localeCompare(b.code); });
  }
  function summarySubjSelect() {
    var st = state(), ready = s(st.year) && s(st.sem);
    var list = ready ? summarySubjects() : [];
    return '<div><label class="block text-xs text-gray-600 mb-1">รายวิชา</label>'
      + '<select ' + (ready ? '' : 'disabled title="เลือกปีการศึกษาและภาคการศึกษาก่อน" ')
      + 'onchange="ploSetSubj(this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm max-w-[18rem]' + (ready ? '' : ' bg-gray-50 text-gray-400') + '">'
      + '<option value="">' + (ready ? 'ทุกรายวิชา' : 'เลือกปี/ภาคก่อน') + '</option>'
      + list.map(function (x) {
          return '<option value="' + esc(x.code) + '"' + (s(st.subj) === x.code ? ' selected' : '') + '>' + esc(x.code + ' ' + x.name) + '</option>';
        }).join('') + '</select></div>';
  }
  // เปลี่ยนรายวิชาไม่ต้องโหลดใหม่ — กรองจากผลที่โหลดไว้แล้ว
  window.ploSetSubj = function (v) { state().subj = v; if (typeof renderCurrentPage === 'function') renderCurrentPage(); };

  function rowSubjMatch(r, code) {
    var x = summarySubjects().filter(function (y) { return y.code === code; })[0] || { code: code, name: '' };
    return s(r['รหัสวิชา']) ? s(r['รหัสวิชา']) === code : (s(r['รายวิชา']) === x.name || s(r['รายวิชา']) === code);
  }
  var LEGEND_BANDS = [[80, 'emerald', 'มากที่สุด'], [70, 'sky', 'มาก'], [60, 'amber', 'พอใช้'], [0, 'red', 'ต้องปรับปรุง']];
  function bandFor(pct, sample) {
    var b = LEGEND_BANDS.filter(function (x) { return pct >= x[0] - 1e-9; })[0] || LEGEND_BANDS[3];
    // ใช้ชื่อระดับแบบที่เซิร์ฟเวอร์ส่งมา (ถ้ามีสีเดียวกัน)
    var hit = (sample || []).filter(function (o) { return o && o.color === b[1] && o.label; })[0];
    return hit ? hit : { color: b[1], label: b[2] };
  }
  function ploMainOf(code) {
    var st = state();
    var p = get('curriculum_plo').filter(function (x) { return s(x.curriculum_year) === s(st.curriculum) && s(x.plo_code) === s(code); })[0];
    return p && s(p.parent_code) ? s(p.parent_code) : s(code);
  }
  function cloTot(r) { return n(r['ผลการประเมิน'] != null ? r['ผลการประเมิน'] : r['นักศึกษา']); }
  function cloPloOf(r) {
    if (s(r['PLO'])) return s(r['PLO']);
    var c = rowCands(r)[0];
    return c ? s(c.plo_code) : '';
  }
  // รวมแถว CLO เป็นกลุ่ม · mode 'pool' = ผ่านรวม ÷ ทั้งหมดรวม · 'mean' = เฉลี่ยร้อยละของ CLO
  function aggRows(rows, keyFn, mode) {
    var g = {}, order = [];
    rows.forEach(function (r) {
      var k = keyFn(r); if (!k) return;
      if (!g[k]) { g[k] = { k: k, pass: 0, tot: 0, pcts: [] }; order.push(k); }
      g[k].pass += n(r['ผ่าน']); g[k].tot += cloTot(r); g[k].pcts.push(n(r['ร้อยละบรรลุ']));
    });
    return order.map(function (k) {
      var x = g[k];
      x.pct = mode === 'mean' ? (x.pcts.reduce(function (a, b) { return a + b; }, 0) / (x.pcts.length || 1)) : (x.tot ? x.pass / x.tot * 100 : 0);
      x.pct = Math.round(x.pct * 100) / 100;
      return x;
    });
  }
  function ploKeyFn(serverPlo) {
    var have = {};
    serverPlo.forEach(function (r) { have[s(r['PLO'])] = 1; });
    return function (r) { var c = cloPloOf(r); return have[c] ? c : ploMainOf(c); };
  }
  // เลือกวิธีรวมที่ตรงกับผลของเซิร์ฟเวอร์มากที่สุด (เทียบจากข้อมูลทุกรายวิชา)
  function aggMode(sum) {
    var clo = sum['ราย CLO'] || [], plo = sum['ราย PLO'] || [];
    if (!clo.length || !plo.length) return 'pool';
    var kf = ploKeyFn(plo), err = {};
    ['pool', 'mean'].forEach(function (m) {
      var mine = {}; aggRows(clo, kf, m).forEach(function (x) { mine[x.k] = x.pct; });
      err[m] = plo.reduce(function (t, r) { var v = mine[s(r['PLO'])]; return t + (v == null ? 100 : Math.abs(v - n(r['ร้อยละบรรลุ']))); }, 0);
    });
    return err.mean < err.pool ? 'mean' : 'pool';
  }
  function filteredSummary() {
    var st = state(), sum = st.summary || {};
    var allow = viewSubjectFilter();
    var useSubj = !!(s(st.subj) && s(st.year) && s(st.sem));
    if (!useSubj && !allow) return sum;
    var mode = st._aggMode || (st._aggMode = aggMode(sum));
    var keep = function (r) { return (!useSubj || rowSubjMatch(r, st.subj)) && (!allow || allow(r)); };
    var clo = (sum['ราย CLO'] || []).filter(keep);
    var watch = (sum['รายวิชาที่ต้องติดตาม'] || []).filter(keep);
    var samples = [];
    ['ราย PLO', 'ราย CLO', 'ราย YLO (ชั้นปี)'].forEach(function (k) { (sum[k] || []).forEach(function (r) { samples.push(r['ระดับ']); }); });
    samples.push((sum['ภาพรวม'] || {})['ระดับ']);
    var mk = function (tpl, x) {
      var o = Object.assign({}, tpl || {});
      o['ผ่าน'] = x.pass; o['ผลการประเมิน'] = x.tot; delete o['นักศึกษา'];
      o['ร้อยละบรรลุ'] = x.pct; o['ระดับ'] = bandFor(x.pct, samples);
      if (o['เกณฑ์'] != null) o['บรรลุ'] = x.pct >= n(o['เกณฑ์']);
      return o;
    };
    var sPlo = sum['ราย PLO'] || [];
    var plo = aggRows(clo, ploKeyFn(sPlo), mode).map(function (x) {
      var tpl = sPlo.filter(function (r) { return s(r['PLO']) === x.k; })[0] || { PLO: x.k };
      return mk(tpl, x);
    });
    var sY = sum['ราย YLO (ชั้นปี)'] || [];
    var lvl = useSubj ? (get('subject').filter(function (x) { return s(x.subject_code) === s(st.subj) && s(x.academic_year) === s(st.year); })[0] || {}).year_level : '';
    var ylo = aggRows(clo, function (r) { return s(r['ชั้นปี']) || s(lvl) || '-'; }, mode).map(function (x) {
      var tpl = sY.filter(function (r) { return s(r['ชั้นปี']) === x.k; })[0] || { 'ชั้นปี': x.k };
      return mk(tpl, x);
    });
    var all = aggRows(clo, function () { return 'all'; }, mode)[0] || { pass: 0, tot: 0, pct: 0 };
    var ov = Object.assign({}, sum['ภาพรวม'] || {});
    ov['ผลการประเมินทั้งหมด'] = all.tot; ov['ผ่าน'] = all.pass; ov['ไม่ผ่าน'] = all.tot - all.pass;
    ov['ร้อยละบรรลุ'] = all.pct; ov['ระดับ'] = bandFor(all.pct, samples);
    ov['จำนวนนักศึกษา'] = clo.reduce(function (m, r) { return Math.max(m, cloTot(r)); }, 0);
    var subjSeen = {};
    clo.forEach(function (r) { subjSeen[s(r['รหัสวิชา'] || r['รายวิชา'])] = 1; });
    ov['จำนวนรายวิชา'] = Object.keys(subjSeen).length;
    var out = Object.assign({}, sum);
    out['ภาพรวม'] = ov; out['ราย CLO'] = clo; out['ราย PLO'] = plo; out['ราย YLO (ชั้นปี)'] = ylo; out['รายวิชาที่ต้องติดตาม'] = watch;
    return out;
  }


  /* ---------- ราย CLO แบบจัดกลุ่มตามรายวิชา ----------
     หลายรายวิชา = การ์ดละวิชา (พับไว้) หัวการ์ดบอกภาพรวมของวิชา · กดเปิดดูตาราง CLO แบบกะทัดรัด
     เรียงวิชาที่น่าห่วงขึ้นก่อน และกรองเฉพาะ CLO ที่ต่ำกว่า 100% / ไม่บรรลุเกณฑ์ได้ */
  function cloGrouped(rows) {
    var st = state();
    var flt = st.cloFlt || 'all', sort = st.cloSort || 'low';
    if (!st._cloOpen) st._cloOpen = {};
    var tot = function (r) { return n(r['ผลการประเมิน'] != null ? r['ผลการประเมิน'] : r['นักศึกษา']); };
    var bad = function (r) { return r['บรรลุ'] === false || (r['เกณฑ์'] != null && n(r['ร้อยละบรรลุ']) < n(r['เกณฑ์'])); };
    var groups = {}, order = [];
    rows.forEach(function (r) {
      var k = s(r['รหัสวิชา']) || s(r['รายวิชา']);
      if (!groups[k]) { groups[k] = { k: k, name: s(r['รายวิชา']), code: s(r['รหัสวิชา']), rows: [] }; order.push(k); }
      groups[k].rows.push(r);
    });
    var list = order.map(function (k) {
      var g = groups[k], pass = 0, all = 0, min = 101, nBad = 0, nLow = 0;
      g.rows.forEach(function (r) {
        pass += n(r['ผ่าน']); all += tot(r);
        min = Math.min(min, n(r['ร้อยละบรรลุ']));
        if (bad(r)) nBad++;
        if (n(r['ร้อยละบรรลุ']) < 100) nLow++;
      });
      g.pct = all ? Math.round(pass / all * 10000) / 100 : 0; g.min = min > 100 ? 0 : min; g.nBad = nBad; g.nLow = nLow;
      g.show = g.rows.filter(function (r) { return flt === 'all' || (flt === 'low' ? n(r['ร้อยละบรรลุ']) < 100 : bad(r)); });
      g.show.sort(function (a, b) {
        return (SEC_ORDER[a.__sec || ''] || 0) - (SEC_ORDER[b.__sec || ''] || 0)
          || s(a['CLO']).localeCompare(s(b['CLO']), undefined, { numeric: true });
      });
      return g;
    }).filter(function (g) { return g.show.length; });
    list.sort(sort === 'code'
      ? function (a, b) { return (a.code || a.name).localeCompare(b.code || b.name, 'th'); }
      : function (a, b) { return (b.nBad - a.nBad) || (a.min - b.min) || (a.pct - b.pct) || a.name.localeCompare(b.name, 'th'); });
    var single = list.length === 1;
    var btn = function (key, val, label) {
      var on = (st[key] || (key === 'cloFlt' ? 'all' : 'low')) === val;
      return '<button type="button" data-no-loading onclick="ploSet(\'' + key + '\',\'' + val + '\')" class="px-2.5 py-1 rounded-lg text-[11px] '
        + (on ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-600 hover:bg-surface') + '">' + esc(label) + '</button>';
    };
    var tools = '<div class="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-gray-500">'
      + '<span>แสดง</span>' + btn('cloFlt', 'all', 'ทุก CLO') + btn('cloFlt', 'low', 'ต่ำกว่า 100%') + btn('cloFlt', 'bad', 'ไม่บรรลุเกณฑ์')
      + '<span class="ml-2">เรียงวิชา</span>' + btn('cloSort', 'low', 'น่าห่วงก่อน') + btn('cloSort', 'code', 'ตามรหัสวิชา')
      + (single ? '' : '<span class="ml-auto flex gap-2"><button type="button" onclick="ploCloOpenAll(true)" class="text-primary hover:underline">เปิดทั้งหมด</button>'
        + '<button type="button" onclick="ploCloOpenAll(false)" class="text-primary hover:underline">ปิดทั้งหมด</button></span>')
      + '</div>';
    if (!list.length) return tools + '<div class="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">'
      + '<i data-lucide="check-circle-2" class="w-4 h-4 inline"></i> ไม่มี CLO ที่ตรงกับเงื่อนไขนี้</div>';
    var bar = function (pct, crit, b, w) {
      return '<div class="relative h-2 rounded-full bg-gray-100 ' + (w || 'w-full') + '">'
        + '<div class="h-2 rounded-full" style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:' + b.bar + '"></div>'
        + (crit != null ? '<div class="absolute border-l-2 border-gray-500" style="top:-3px;height:14px;left:' + Math.min(100, crit) + '%" title="เกณฑ์บรรลุ ' + fx(crit, 0) + '%"></div>' : '')
        + '</div>';
    };
    window._ploCloKeys = list.map(function (g) { return g.k; });
    var cards = list.map(function (g, gi) {
      var crit = g.rows[0]['เกณฑ์'] != null ? n(g.rows[0]['เกณฑ์']) : null;
      var lv = bandFor(g.pct, g.rows.map(function (r) { return r['ระดับ']; }));
      var b = bandOf(lv), bMin = bandOf(bandFor(g.min, g.rows.map(function (r) { return r['ระดับ']; })));
      var open = single || st._cloOpen[g.k] === true;
      var table = '<div class="overflow-x-auto"><table class="w-full text-sm" data-ems-cards="skip"><thead><tr class="text-left text-[11px] text-gray-500 border-b">'
        + '<th class="px-3 py-1.5 font-medium">CLO</th><th class="px-3 py-1.5 font-medium">PLO</th>'
        + '<th class="px-3 py-1.5 font-medium text-right whitespace-nowrap">ผ่าน / ทั้งหมด</th>'
        + '<th class="px-3 py-1.5 font-medium" style="width:34%">ร้อยละการบรรลุ</th><th class="px-3 py-1.5 font-medium">ระดับ</th></tr></thead><tbody>'
        + g.show.map(function (r) {
            var rb = bandOf(r['ระดับ']), pct = n(r['ร้อยละบรรลุ']);
            var c2 = r['เกณฑ์'] != null ? n(r['เกณฑ์']) : null;
            var mark = r['บรรลุ'] === true ? '<i data-lucide="check" class="w-3.5 h-3.5 inline text-emerald-600"></i> '
              : r['บรรลุ'] === false ? '<i data-lucide="x" class="w-3.5 h-3.5 inline text-red-600"></i> ' : '';
            return '<tr class="border-t border-gray-50 hover:bg-surface/60" title="' + esc(s(r['CLO']) + (r.__sec ? ' [' + r.__sec + ']' : '') + ' · ผ่าน ' + r['ผ่าน'] + ' จาก ' + tot(r) + (c2 != null ? ' · เกณฑ์ ' + fx(c2, 0) + '%' : '')) + '">'
              + '<td class="px-3 py-1.5 whitespace-nowrap">' + esc(r['CLO']) + secChip(r.__sec) + '</td>'
              + '<td class="px-3 py-1.5 text-xs text-gray-500">' + esc(r['PLO'] || '') + '</td>'
              + '<td class="px-3 py-1.5 text-right tabular-nums text-xs text-gray-600 whitespace-nowrap">' + esc(r['ผ่าน']) + ' / ' + tot(r) + '</td>'
              + '<td class="px-3 py-1.5"><div class="flex items-center gap-2">' + bar(pct, c2, rb, 'flex-1" style="min-width:6rem')
              + '<span class="text-xs font-semibold tabular-nums text-gray-800 w-16 text-right">' + mark + fx(pct) + '%</span></div></td>'
              + '<td class="px-3 py-1.5 text-[11px] whitespace-nowrap ' + rb.text + '">' + esc((r['ระดับ'] || {}).label || '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      return '<details class="border border-gray-100 rounded-xl mb-2 bg-white"' + (open ? ' open' : '')
        + ' ontoggle="ploCloToggle(this,' + gi + ')">'
        + '<summary class="list-none cursor-pointer px-3 py-2.5 flex flex-wrap items-center gap-y-1" style="column-gap:1rem">'
        + '<i data-lucide="chevron-right" class="w-4 h-4 text-gray-400 ems-chev"></i>'
        + '<span class="text-sm font-medium text-gray-800 flex-1" style="min-width:12rem">' + (g.code ? '<span class="font-mono text-xs text-gray-400 mr-1">' + esc(g.code) + '</span>' : '') + esc(g.name) + '</span>'
        + '<span class="text-[11px] text-gray-500">' + g.rows.length + ' CLO</span>'
        + '<span class="flex items-center gap-2 w-44">' + bar(g.pct, crit, b, 'flex-1')
        + '<span class="text-xs font-semibold tabular-nums text-gray-800">' + fx(g.pct) + '%</span></span>'
        + '<span class="text-[11px] ' + b.text + ' w-16">' + esc(lv.label || '') + '</span>'
        + '<span class="text-[11px] text-gray-500 whitespace-nowrap">ต่ำสุด <b class="tabular-nums text-gray-800">' + fx(g.min) + '%</b><span class="' + bMin.text + '"> ●</span></span>'
        + (g.nBad ? '<span class="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 whitespace-nowrap"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> ไม่บรรลุ ' + g.nBad + ' CLO</span>'
                  : '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap"><i data-lucide="check" class="w-3 h-3 inline"></i> บรรลุทุก CLO</span>')
        + '</summary><div class="border-t border-gray-100">' + table + '</div></details>';
    }).join('');
    var note = '<p class="text-[11px] text-gray-400 mb-2">' + list.length + ' รายวิชา · ร้อยละรวมของวิชา = ผ่านรวม ÷ ผลการประเมินรวมของทุก CLO · '
      + 'เส้นดำ = เกณฑ์บรรลุ · ' + (single ? '' : 'กดที่ชื่อวิชาเพื่อดูราย CLO') + '</p>';
    return tools + note + '<style>details[open] > summary .ems-chev{transform:rotate(90deg)} details > summary::-webkit-details-marker{display:none}</style>' + cards;
  }
  window.ploCloToggle = function (el, i) { var st = state(), k = (window._ploCloKeys || [])[i]; if (k == null) return; if (!st._cloOpen) st._cloOpen = {}; st._cloOpen[k] = el.open; };
  window.ploCloOpenAll = function (v) {
    var st = state(); st._cloOpen = {};
    (window._ploCloKeys || []).forEach(function (k) { st._cloOpen[k] = v; });
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
        && (!level || s(x.year_level) === s(level)) && mySubject(x);
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

  /* ================= ส่วนของรายวิชา (ทฤษฎี / ทดลอง / ปฏิบัติ) =================
     รายวิชาแบบ "ทฤษฎีและทดลอง" หรือ "ทฤษฎีและปฏิบัติ" แยก CLO เป็นรายส่วนได้
     CLO รหัสเดียวกันอยู่ได้ทั้งสองส่วน (เช่น CLO 1.1.3 ทฤษฎี และ CLO 1.1.3 ทดลอง)
     แต่ละส่วนมีองค์ประกอบคะแนน เกณฑ์ผ่าน และผลการบรรลุ "แยกกัน" — ผลสรุป PLO นับทั้งสองรายการ
     เก็บใน plo_clo.section (ว่าง = ไม่แยกส่วน) */
  var SEC_ORDER = { '': 0, 'ทฤษฎี': 1, 'ทดลอง': 2, 'ปฏิบัติ': 3 };
  function normSec(v) {
    var x = s(v).toLowerCase();
    if (!x || x === '-' || x === 'ไม่แยก') return '';
    if (x.indexOf('ทดลอง') >= 0 || x === 'lab' || x === 'laboratory') return 'ทดลอง';
    if (x.indexOf('ปฏิบัติ') >= 0 || x === 'practice' || x === 'practicum') return 'ปฏิบัติ';
    if (x.indexOf('ทฤษฎี') >= 0 || x === 'theory' || x === 'lecture') return 'ทฤษฎี';
    return '';
  }
  function secOf(c) { return normSec(c && c.section); }
  // รหัสที่ใช้อ้าง CLO ในไฟล์ CSV และบนหน้าจอ — CLO1.1.3 [ทดลอง]
  function cloRef(c) { var x = secOf(c); return s(c && c.clo_code) + (x ? ' [' + x + ']' : ''); }
  function refOf(code, sec) { return s(code) + (sec ? ' [' + sec + ']' : ''); }
  // แยก "CLO1.1.3 [ทดลอง]" → { code, sec } · ถ้าไม่มีวงเล็บ ใช้ค่าจากคอลัมน์ section แทน
  function parseRef(str, secCol) {
    var m = s(str).match(/^(.*?)\s*\[(.+)\]\s*$/);
    return m ? { code: s(m[1]), sec: normSec(m[2]) } : { code: s(str), sec: normSec(secCol) };
  }
  function sameClo(c, code, sec) { return s(c.clo_code) === s(code) && secOf(c) === (sec || ''); }
  function secBadge(c) {
    var x = secOf(c);
    if (!x) return '';
    var cls = x === 'ทฤษฎี' ? 'bg-sky-50 text-sky-700' : x === 'ทดลอง' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700';
    return ' <span class="px-1.5 py-0.5 rounded-md text-[10px] font-normal align-middle ' + cls + '">' + esc(x) + '</span>';
  }
  // ส่วนที่รายวิชานี้มี — อ่านจากประเภทรายวิชา (theory_practice) ของรายวิชาที่เปิดสอน
  function sectionsOf(subj) {
    var t = s(subj && subj.theory_practice);
    var out = [];
    if (t.indexOf('ทดลอง') >= 0) out = ['ทฤษฎี', 'ทดลอง'];
    else if (t.indexOf('ทฤษฎี') >= 0 && t.indexOf('ปฏิบัติ') >= 0) out = ['ทฤษฎี', 'ปฏิบัติ'];
    return out;
  }
  function closOf(year, sem, code) {
    var st = state();
    return get('plo_clo').filter(function (x) {
      return s(x.curriculum_year) === s(st.curriculum)
        && s(x.academic_year) === s(year) && s(x.semester) === s(sem)
        && s(x.subject_code) === s(code);
    }).sort(function (a, b) {
      return ((SEC_ORDER[secOf(a)] || 0) - (SEC_ORDER[secOf(b)] || 0))
        || ((Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    });
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

    var pick = '<div class="flex flex-wrap items-end gap-3">'
      + sel('ปีการศึกษา', 'eYear', yearsList().map(function (y) { return [y, y]; }))
      + sel('ภาคการศึกษา', 'eSem', SEMS.map(function (x) { return [x, x === '3' ? 'ฤดูร้อน' : x]; }))
      + sel('ชั้นปี', 'eLevel', ['1', '2', '3', '4'].map(function (l) {
          var p = cohortPrefix(st.eYear, l);
          return [l, 'ชั้นปีที่ ' + l + (p ? ' (รหัส ' + p + ')' : '')];
        }))
      + '</div>';

    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var scopeTxt = 'ปีการศึกษา ' + st.eYear + ' · ภาค ' + (st.eSem === '3' ? 'ฤดูร้อน' : st.eSem) + ' · ชั้นปีที่ ' + st.eLevel;
    if (!subs.length) {
      return '<div class="ems-stepped">'
        + step(1, 'เลือกปีการศึกษา ภาคการศึกษา และชั้นปี', scopeTxt, pick, 'active')
        + step(2, 'เลือกรายวิชา', '', hint('ไม่มีรายวิชาที่เปิดสอนในภาค/ปี/ชั้นปีที่เลือก'), 'wait')
        + '</div>';
    }

    var list = '<div class="grid md:grid-cols-2 gap-2">'
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

    var subj = st.eSubject ? subs.filter(function (x) { return s(x.subject_code) === s(st.eSubject); })[0] : null;
    var nClo = st.eSubject ? closOf(st.eYear, st.eSem, st.eSubject).length : 0;
    var ed = subj ? cloEditor() : null;
    var waitMsg = function (m) { return '<p class="text-sm text-gray-400">' + esc(m) + '</p>'; };

    return '<div class="ems-stepped">'
      + step(1, 'เลือกปีการศึกษา ภาคการศึกษา และชั้นปี', scopeTxt, pick, 'done')
      + step(2, 'เลือกรายวิชา', 'รายวิชาที่เปิดสอน ' + subs.length + ' วิชา' + (subj ? ' · เลือกแล้ว: ' + s(subj.subject_name) : ''),
          list, subj ? 'done' : 'active')
      + step(3, 'กำหนด CLO และผูกกับ PLO', subj ? 'รายวิชา ' + s(subj.subject_name) + ' · มี ' + nClo + ' CLO' : 'ทำหลังเลือกรายวิชา',
          ed ? ed.clo + courseOverview(subj) : waitMsg('เลือกรายวิชาในขั้นที่ 2 ก่อน'), !subj ? 'wait' : (nClo ? 'done' : 'active'))
      + step(4, 'กรอกคะแนนนักศึกษารายคน', nClo ? 'คะแนนแต่ละ CLO · กดบันทึกเมื่อกรอกเสร็จ' : 'ทำหลังกำหนด CLO แล้ว',
          (ed && ed.scores) ? ed.scores : waitMsg(!subj ? 'เลือกรายวิชาในขั้นที่ 2 ก่อน' : 'เพิ่ม CLO ในขั้นที่ 3 ก่อน'),
          (subj && nClo) ? 'active' : 'wait')
      + step(5, 'สรุปคะแนนรายวิชาและเกรด', nClo ? 'รวมคะแนนทุก CLO ตามสัดส่วน · ตัดเกรดตามช่วงคะแนนของรายวิชา' : 'ทำหลังกำหนด CLO แล้ว',
          (subj && nClo) ? courseGradeTable(subj) : waitMsg(!subj ? 'เลือกรายวิชาในขั้นที่ 2 ก่อน' : 'เพิ่ม CLO ในขั้นที่ 3 ก่อน'),
          (subj && nClo) ? 'active' : 'wait')
      + step(6, 'นำเข้าผ่านไฟล์ CSV / Excel', 'ไม่บังคับ · ทางลัดแทนขั้นที่ 3–4 เมื่อมีข้อมูลหลายรายวิชา', csvPanel(), 'opt')
      + '</div>';
  }

  /* กรอบขั้นตอนมีหมายเลข — ใช้ชุดสไตล์เดียวกับฟอร์มเพิ่มข้อมูลหน้าอื่น (steps.js / styles.css .ems-step)
     state: done = เสร็จแล้ว (เลขสีเขียว ✓) · active = ขั้นที่ต้องทำต่อ · wait = ยังทำไม่ได้ · opt = ไม่บังคับ */
  function step(no, title, sub, inner, state, final) {
    var cls = 'ems-step' + (state === 'done' ? ' is-done' : '') + (state === 'active' ? ' is-active' : '')
      + (final ? ' ems-step-final' : '');
    return '<section class="' + cls + '"' + (state === 'wait' ? ' style="opacity:.6"' : '') + '>'
      + '<div class="ems-step-head"><span class="ems-step-no" aria-hidden="true">' + no + '</span>'
      + '<div class="min-w-0"><p class="ems-step-title">' + esc(title) + '</p>'
      + (sub ? '<p class="ems-step-sub">' + esc(sub) + '</p>' : '') + '</div></div>'
      + '<div class="ems-step-body space-y-3">' + inner + '</div></section>';
  }

  /* ================= นำเข้า/ส่งออกข้อมูลผ่านไฟล์ CSV =================
     แม่แบบที่ดาวน์โหลดจะมีข้อมูลเดิมติดมาด้วย จึงใช้เป็นไฟล์สำรองหรือแก้ไขต่อได้เลย
     ตอนอัปโหลดระบบดูจากหัวตารางว่าเป็นไฟล์ CLO หรือไฟล์คะแนน ไม่ต้องเลือกเอง */
  function csvPanel() {
    var st = state();
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var subj = st.eSubject ? subs.filter(function (x) { return s(x.subject_code) === s(st.eSubject); })[0] : null;
    var nClo = st.eSubject ? closOf(st.eYear, st.eSem, st.eSubject).length : 0;
    var nComp = st.eSubject ? closOf(st.eYear, st.eSem, st.eSubject).filter(function (c) { return comps(c).length; }).length : 0;
    var nAny = (st.eSubject ? [subj] : subs).filter(Boolean).some(function (x) { return closOf(st.eYear, st.eSem, x.subject_code).length; });
    var btn = function (onclick, icon, label, cls, off) {
      return '<button ' + (off ? 'disabled ' : '') + 'onclick="' + onclick + '" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm '
        + cls + (off ? ' opacity-40 cursor-not-allowed' : '') + '">'
        + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' + esc(label) + '</button>';
    };
    var no = function (num, done) {
      return '<span class="w-7 h-7 rounded-full ' + (done ? 'bg-emerald-600' : 'bg-primary') + ' text-white text-sm font-bold flex items-center justify-center flex-shrink-0">' + num + '</span>';
    };
    var scope = 'ปีการศึกษา ' + esc(st.eYear) + ' · ภาค ' + esc(st.eSem === '3' ? 'ฤดูร้อน' : st.eSem) + ' · ชั้นปีที่ ' + esc(st.eLevel);

    // ขั้นที่ 1 : CLO ที่ผูกกับ PLO
    var step1 = '<div class="bg-white border border-blue-100 rounded-xl p-4">'
      + '<div class="flex items-start gap-3 mb-2">' + no('ก', nClo > 0)
      + '<div><p class="text-sm font-semibold text-gray-800">นำเข้า CLO ที่ผูกกับ PLO</p>'
      + '<p class="text-[11px] text-gray-500">' + (subj ? 'รายวิชา ' + esc(subj.subject_name) : 'ทุกรายวิชาของชั้นปีนี้ (' + subs.length + ' วิชา)')
      + ' · คอลัมน์: รหัสวิชา · รหัส CLO · คำอธิบาย · PLO ที่ผูก · คะแนนเต็ม (100) · เกณฑ์ผ่าน (%)</p></div></div>'
      + '<div class="flex flex-wrap gap-2 ml-10">'
      + btn("ploCsvTemplate('clo')", 'download', 'ดาวน์โหลดแม่แบบ CLO', 'border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50')
      + btn("ploCsvPick('clo')", 'upload', 'อัปโหลดไฟล์ CLO', 'border-primary text-white bg-primary hover:bg-primaryDark')
      + '</div>'
      + '<div class="flex flex-wrap items-center gap-2 ml-10 mt-2 pt-2 border-t border-dashed border-gray-200">'
      + '<span class="text-[11px] text-gray-600 w-full">องค์ประกอบคะแนนของ CLO (สอบกลางภาค/ปลายภาค/งาน · คะแนนเต็ม · คิดเป็น % · สอบซ่อม) — 1 แถวต่อ 1 การประเมิน</span>'
      + btn("ploCsvTemplateComp()", 'download', 'แม่แบบองค์ประกอบคะแนน', 'border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50', !nAny)
      + btn("ploCsvPick('comp')", 'upload', 'อัปโหลดองค์ประกอบ', 'border-primary text-primary bg-white hover:bg-blue-50', !nAny)
      + '</div>'
      + '<p class="text-[11px] text-gray-400 mt-2 ml-10">แม่แบบมี CLO เดิมติดมาด้วย แก้ไขแล้วอัปโหลดกลับได้ · รหัส CLO ที่มีอยู่แล้วจะถูกแก้ ที่ยังไม่มีจะเพิ่มใหม่</p>'
      + '</div>';

    // ขั้นที่ 2 : คะแนนรายคน — ต้องเลือกรายวิชาและมี CLO แล้ว
    var why = !st.eSubject ? 'เลือกรายวิชาในขั้นที่ 2 ก่อน' : (!nClo ? 'รายวิชานี้ยังไม่มี CLO — นำเข้าไฟล์ CLO (ก) หรือเพิ่มในขั้นที่ 3 ก่อน' : '');
    var step2 = '<div class="bg-white border ' + (why ? 'border-gray-100' : 'border-blue-100') + ' rounded-xl p-4">'
      + '<div class="flex items-start gap-3 mb-2">' + no('ข', false)
      + '<div><p class="text-sm font-semibold ' + (why ? 'text-gray-400' : 'text-gray-800') + '">นำเข้าคะแนนรายคน <span class="font-normal text-xs">(หลังเพิ่ม CLO แล้ว)</span></p>'
      + '<p class="text-[11px] text-gray-500">' + (why ? '<span class="text-amber-700">' + why + '</span>'
          : 'รายวิชา ' + esc(subj ? subj.subject_name : st.eSubject) + ' · ' + nClo + ' CLO · คอลัมน์: รหัสนักศึกษา · ชื่อ · คะแนนแต่ละ CLO (1 คอลัมน์ต่อ 1 CLO)')
      + '</p></div></div>'
      + '<div class="flex flex-wrap gap-2 ml-10">'
      + btn("ploCsvTemplate('score')", 'download', 'ดาวน์โหลดแม่แบบคะแนน', 'border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50', !!why)
      + btn("ploCsvPick('score')", 'upload', 'อัปโหลดไฟล์คะแนน', 'border-primary text-white bg-primary hover:bg-primaryDark', !!why)
      + '</div>'
      + (why ? '' : '<div class="flex flex-wrap items-center gap-2 ml-10 mt-2 pt-2 border-t border-dashed border-gray-200">'
        + '<span class="text-[11px] text-gray-600 w-full">' + (nComp
            ? 'คะแนนดิบของ CLO ที่แบ่งองค์ประกอบ (' + nComp + ' CLO) — กรอกคะแนนแต่ละการประเมินและสอบซ่อม ระบบคิดร้อยละให้'
            : 'คะแนนดิบรายองค์ประกอบ — ใช้ได้เมื่อมี CLO ที่แบ่งองค์ประกอบคะแนนแล้ว') + '</span>'
        + btn("ploCsvTemplateRaw()", 'download', 'แม่แบบคะแนนดิบ', 'border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50', !nComp)
        + btn("ploXlsxTemplate()", 'file-spreadsheet', 'แบบบันทึกคะแนน Excel (หัว 3 ชั้น)', 'border-emerald-600 text-white bg-emerald-600 hover:bg-emerald-700', !nComp)
        + btn("ploCsvPick('raw')", 'upload', 'อัปโหลดคะแนนดิบ (.xlsx / .csv)', 'border-primary text-primary bg-white hover:bg-blue-50', !nComp)
        + '</div>')
      + (why ? '' : '<p class="text-[11px] text-gray-400 mt-2 ml-10">ช่องที่เว้นว่างจะไม่ถูกแตะ (ไม่ใช่ให้ 0) · กด "เปิดตารางกรอกคะแนน" ก่อนดาวน์โหลด คะแนนเดิมจะติดมาในแม่แบบ</p>')
      + '</div>';

    return '<div class="border border-emerald-100 bg-emerald-50/40 rounded-2xl p-4">'
      + '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">'
      + '<p class="text-sm font-semibold text-gray-700"><i data-lucide="file-spreadsheet" class="w-4 h-4 inline mr-1 text-emerald-600"></i>นำเข้าข้อมูลผ่านไฟล์ CSV / Excel</p>'
      + '<span class="text-[11px] text-gray-500">' + scope + '</span></div>'
      + '<div class="grid lg:grid-cols-2 gap-3">' + step1 + step2 + '</div>'
      + '<input type="file" id="ploCsvInput" accept=".csv,.xlsx,text/csv" class="hidden" onchange="ploCsvFile(event)">'
      + '<p class="text-[11px] text-gray-500 mt-2">ทุกครั้งที่อัปโหลด ระบบจะสรุปให้ดูก่อนว่าจะเพิ่มหรือแก้อะไรบ้าง แล้วจึงกดยืนยัน</p>'
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
      var rows = [['subject_code', 'subject_name', 'section', 'clo_code', 'statement_th', 'plo_code', 'max_score', 'pass_score']];
      var target = st.eSubject ? subs.filter(function (x) { return s(x.subject_code) === s(st.eSubject); }) : subs;
      if (!target.length) target = subs;
      target.forEach(function (x) {
        var cs = closOf(st.eYear, st.eSem, x.subject_code);
        if (cs.length) {
          cs.forEach(function (c) {
            rows.push([x.subject_code, x.subject_name, secOf(c), c.clo_code, c.statement_th, c.plo_code, c.max_score, c.pass_score]);
          });
        } else {
          // ยังไม่มี CLO — ใส่แถวเปล่าไว้ให้กรอก (เว้นรหัส CLO ไว้ ระบบจะข้ามแถวที่ไม่ได้กรอก)
          // รายวิชาที่แยกส่วน — ใส่แถวเปล่าให้ส่วนละ 1 แถว
          (sectionsOf(x).length ? sectionsOf(x) : ['']).forEach(function (sx) {
            rows.push([x.subject_code, x.subject_name, sx, '', '', '', '100', '60']);
          });
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

    var head = ['student_id', 'name'].concat(clos.map(function (c) { return cloRef(c); }));
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
  var ALL_HEAD = ['ประเภท', 'subject_code', 'subject_name', 'section', 'clo_code', 'statement_th',
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
          rows.push(['CLO', x.subject_code, x.subject_name, secOf(c), c.clo_code, c.statement_th,
            c.plo_code, c.max_score, c.pass_score, '', '', '']);
          nClo++;
        });
      } else {
        // ยังไม่มี CLO — เว้นรหัสไว้ให้กรอก ระบบจะข้ามแถวที่ยังไม่ได้กรอก
        (sectionsOf(x).length ? sectionsOf(x) : ['']).forEach(function (sx) {
          rows.push(['CLO', x.subject_code, x.subject_name, sx, '', '', '', '100', '60', '', '', '']);
        });
      }
    });

    // แถวคะแนน — ทำให้เฉพาะรายวิชาที่เลือกและมี CLO อยู่แล้ว จะได้ไม่เป็นไฟล์ยักษ์
    if (st.eSubject && studs.length) {
      var clos = closOf(st.eYear, st.eSem, st.eSubject);
      var subj = target[0] || {};
      clos.forEach(function (c) {
        studs.forEach(function (u) {
          var v = st.scores ? st.scores[c.__backendId + '|' + u.student_id] : '';
          rows.push(['คะแนน', s(subj.subject_code), '', secOf(c), s(c.clo_code), '', '', '', '',
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
    var iSec = idx('section');
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
      var pr0 = parseRef(r[iCode], iSec >= 0 ? r[iSec] : '');
      var code = pr0.code, sec = pr0.sec;
      if (!code) return;                       // แถวเปล่าของแม่แบบ ข้ามเงียบ ๆ
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      var subj = subs.filter(function (x) { return s(x.subject_code) === scode; })[0];
      if (!subj) { bad.push('บรรทัด ' + line + ' : ไม่พบรายวิชา ' + (scode || '(ไม่ได้ระบุ)') + ' ในภาค/ปี/ชั้นปีที่เลือก'); return; }
      if (sec && sectionsOf(subj).indexOf(sec) < 0) { bad.push('บรรทัด ' + line + ' : วิชา ' + scode + ' ไม่มีส่วน' + sec); return; }
      var key = scode + '|' + refOf(code, sec);
      if (seen[key]) { bad.push('บรรทัด ' + line + ' : ' + refOf(code, sec) + ' ของวิชา ' + scode + ' ซ้ำกับบรรทัด ' + seen[key]); return; }
      seen[key] = line;
      var plo = s(r[iPlo]);
      if (!plo) { bad.push('บรรทัด ' + line + ' : ' + code + ' ไม่ได้ระบุ PLO'); return; }
      if (!ploOk[plo]) { bad.push('บรรทัด ' + line + ' : ไม่พบ PLO รหัส ' + plo + ' ในหลักสูตร'); return; }
      var pass = iPass >= 0 ? s(r[iPass]) : '';
      if (pass === '' || !isFinite(Number(pass))) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านต้องเป็นตัวเลข'); return; }
      var max = iMax >= 0 ? s(r[iMax]) : '';
      // คะแนนเต็มเป็นร้อยละเสมอ (100) — เว้นว่างได้ ระบบใส่ 100 ให้
      if (max !== '' && Number(max) !== 100) { bad.push('บรรทัด ' + line + ' : ' + code + ' คะแนนเต็มต้องเป็น 100 (คะแนนคิดเป็นร้อยละ)'); return; }
      max = '100';
      if (Number(pass) < 0 || Number(pass) > 100) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านต้องอยู่ระหว่าง 0–100 (%)'); return; }
      var exist = closOf(st.eYear, st.eSem, scode).filter(function (c) { return sameClo(c, code, sec); })[0] || null;
      if (exist && !canEditClo(exist)) { bad.push('บรรทัด ' + line + ' : ' + lockMsg(exist)); return; }
      cloPlan.push({
        subj: subj, code: code, sec: sec, text: iText >= 0 ? s(r[iText]) : '',
        plo: plo, max: max === '' ? '100' : max, pass: pass, exist: exist
      });
      willHave[key] = { max: max === '' ? '100' : max };
    });

    // CLO ที่มีอยู่แล้วในระบบ ก็ผูกคะแนนได้ แม้ไฟล์นี้จะไม่ได้นิยามซ้ำ
    subs.forEach(function (x) {
      closOf(st.eYear, st.eSem, x.subject_code).forEach(function (c) {
        var k = s(x.subject_code) + '|' + cloRef(c);
        if (!willHave[k]) willHave[k] = { max: s(c.max_score) };
      });
    });

    // ---- รอบสอง : แถวคะแนน ----
    rows.slice(1).forEach(function (r, i) {
      if (rowKind(r[iKind]) !== 'score') return;
      var line = i + 2;
      var sid = s(r[iSid]);
      var pr1 = parseRef(r[iCode], iSec >= 0 ? r[iSec] : '');
      var code = pr1.code, sec = pr1.sec;
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      if (!sid && !code) return;
      if (!sid) { bad.push('บรรทัด ' + line + ' : แถวคะแนนไม่ได้ระบุรหัสนักศึกษา'); return; }
      if (!code) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ไม่ได้ระบุรหัส CLO'); return; }
      if (!stuOk[sid]) { bad.push('บรรทัด ' + line + ' : ไม่พบรหัสนักศึกษา ' + sid + ' ในรุ่นนี้'); return; }
      var k = scode + '|' + refOf(code, sec);
      var info = willHave[k];
      if (!info) { bad.push('บรรทัด ' + line + ' : ไม่พบ ' + code + ' ของวิชา ' + (scode || '(ไม่ได้ระบุ)') + ' ทั้งในไฟล์และในระบบ'); return; }
      var exC = closOf(st.eYear, st.eSem, scode).filter(function (c) { return sameClo(c, code, sec); })[0];
      if (exC && comps(exC).length) { bad.push('บรรทัด ' + line + ' : ' + code + ' แบ่งเป็นหลายการประเมินแล้ว — ใช้แม่แบบคะแนนดิบแทน'); return; }
      var v = iScore >= 0 ? s(r[iScore]) : '';
      if (v === '') { blank++; return; }        // เว้นว่าง = ยังไม่ให้คะแนน ไม่ใช่ศูนย์
      if (!isFinite(Number(v))) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + code + ' "' + v + '" ไม่ใช่ตัวเลข'); return; }
      var num = Number(v);
      if (num < 0) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + code + ' คะแนนติดลบ'); return; }
      var max = Number(info.max);
      if (isFinite(max) && max > 0 && num > max) {
        bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + code + ' คะแนน ' + num + ' เกินคะแนนเต็ม ' + max); return;
      }
      scorePlan.push({ subject_code: scode, clo_code: code, sec: sec, student_id: sid, score: num });
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

  window.ploCsvPick = function (kind) {
    var st = state();
    st.csvKind = kind || '';
    if (kind === 'raw') {
      if (!st.eSubject) { showToast('เลือกรายวิชาก่อน จึงจะนำเข้าคะแนนได้', 'error'); return; }
    }
    if (kind === 'score') {
      if (!st.eSubject) { showToast('เลือกรายวิชาก่อน จึงจะนำเข้าคะแนนได้', 'error'); return; }
      if (!closOf(st.eYear, st.eSem, st.eSubject).length) { showToast('รายวิชานี้ยังไม่มี CLO — นำเข้า CLO (ขั้นที่ 1) ก่อน', 'error'); return; }
    }
    var el = document.getElementById('ploCsvInput');
    if (!el) { showToast('ไม่พบช่องเลือกไฟล์', 'error'); return; }
    el.value = '';
    el.click();
  };

  window.ploCsvFile = async function (ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!f) return;
    try { ev.target.value = ''; } catch (e0) { }   // เลือกไฟล์เดิมซ้ำได้
    if (/\.xls$/i.test(f.name)) { showToast('ไฟล์ .xls รุ่นเก่า — เปิดใน Excel แล้วบันทึกเป็น .xlsx ก่อน', 'error'); return; }
    if (/\.xlsx$/i.test(f.name)) {
      var wantX = state().csvKind || '';
      if (wantX && wantX !== 'raw') { showToast('ไฟล์ Excel ใช้ได้กับปุ่ม "อัปโหลดคะแนนดิบ" เท่านั้น', 'error'); return; }
      var xr = null;
      try { xr = await xlsxRawRows(f); } catch (e1) { showToast('อ่านไฟล์ Excel ไม่สำเร็จ: ' + (e1.message || e1), 'error'); return; }
      if (!xr) { showToast('ไม่พบหัวตารางของแบบบันทึกคะแนน — ใช้ไฟล์ที่ดาวน์โหลดจากปุ่ม "แบบบันทึกคะแนน Excel" (ห้ามลบแถวที่ 6 ที่ซ่อนไว้)', 'error'); return; }
      ploCsvPlanRaw(xr, f.name); return;
    }
    var text = '';
    try { text = await f.text(); } catch (e) { showToast('อ่านไฟล์ไม่สำเร็จ: ' + e, 'error'); return; }
    var rows = parseCsv(text);
    if (rows.length < 2) { showToast('ไฟล์ CSV ไม่มีข้อมูล', 'error'); return; }
    var head = rows[0].map(function (x) { return s(x).toLowerCase(); });
    // อัปโหลดจากปุ่มของขั้นไหน ต้องเป็นไฟล์ชนิดนั้น — กันอัปโหลดไฟล์คะแนนในช่อง CLO หรือกลับกัน
    var want = state().csvKind || '';
    // แม่แบบใหม่ขององค์ประกอบคะแนน — ตรวจก่อน เพราะไฟล์คะแนนดิบก็มี student_id เหมือนไฟล์คะแนนเดิม
    var isComp = head.indexOf('item_name') >= 0;
    var isRaw = !isComp && head.indexOf('student_id') >= 0 && isRawHead(rows[0]);
    var gotNew = isComp ? 'comp' : isRaw ? 'raw' : '';
    if (want && (want === 'comp' || want === 'raw' || gotNew) && gotNew !== want) {
      showToast(want === 'comp' ? 'ไฟล์นี้ไม่ใช่แม่แบบองค์ประกอบคะแนน (ต้องมีคอลัมน์ item_name)'
        : want === 'raw' ? 'ไฟล์นี้ไม่ใช่แม่แบบคะแนนดิบ — ดาวน์โหลดแม่แบบคะแนนดิบก่อน'
        : 'ไฟล์นี้เป็นแม่แบบ' + (isComp ? 'องค์ประกอบคะแนน' : 'คะแนนดิบ') + ' — อัปโหลดที่ปุ่มของแม่แบบนั้น', 'error');
      return;
    }
    if (isComp) { ploCsvPlanComp(rows, head, f.name); return; }
    if (isRaw) { ploCsvPlanRaw(rows, f.name); return; }
    var isAll = head.indexOf('ประเภท') >= 0 || head.indexOf('type') >= 0;
    var got = isAll ? 'all' : head.indexOf('clo_code') >= 0 ? 'clo' : head.indexOf('student_id') >= 0 ? 'score' : '';
    if (want && got && got !== 'all' && got !== want) {
      showToast(want === 'clo' ? 'ไฟล์นี้เป็นไฟล์คะแนน — อัปโหลดที่ขั้นที่ 2 "นำเข้าคะแนนรายคน"' : 'ไฟล์นี้เป็นไฟล์ CLO — อัปโหลดที่ขั้นที่ 1 "นำเข้า CLO ที่ผูกกับ PLO"', 'error');
      return;
    }
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
    var iSec = idx('section');
    var iSub = idx('subject_code'), iCode = idx('clo_code'), iText = idx('statement_th'),
        iPlo = idx('plo_code'), iMax = idx('max_score'), iPass = idx('pass_score');
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var ploOk = {};
    ploOptions().forEach(function (p) { ploOk[s(p.plo_code)] = 1; });

    var plan = [], bad = [], seen = {};
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2;
      var pr0 = parseRef(r[iCode], iSec >= 0 ? r[iSec] : '');
      var code = pr0.code, sec = pr0.sec;
      if (!code) return;   // แถวเปล่าของแม่แบบ — ข้ามเงียบ ๆ ไม่ถือว่าผิด
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      var subj = subs.filter(function (x) { return s(x.subject_code) === scode; })[0];
      if (!subj) { bad.push('บรรทัด ' + line + ' : ไม่พบรายวิชา ' + (scode || '(ไม่ได้ระบุ)') + ' ในภาค/ปี/ชั้นปีที่เลือก'); return; }
      if (sec && sectionsOf(subj).indexOf(sec) < 0) { bad.push('บรรทัด ' + line + ' : วิชา ' + scode + ' ไม่มีส่วน' + sec); return; }
      var key = scode + '|' + refOf(code, sec);
      if (seen[key]) { bad.push('บรรทัด ' + line + ' : ' + refOf(code, sec) + ' ของวิชา ' + scode + ' ซ้ำกับบรรทัด ' + seen[key]); return; }
      seen[key] = line;
      var plo = s(r[iPlo]);
      if (!plo) { bad.push('บรรทัด ' + line + ' : ' + code + ' ไม่ได้ระบุ PLO'); return; }
      if (!ploOk[plo]) { bad.push('บรรทัด ' + line + ' : ไม่พบ PLO รหัส ' + plo + ' ในหลักสูตร'); return; }
      var pass = iPass >= 0 ? s(r[iPass]) : '';
      if (pass === '' || !isFinite(Number(pass))) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านต้องเป็นตัวเลข'); return; }
      var max = iMax >= 0 ? s(r[iMax]) : '';
      // คะแนนเต็มเป็นร้อยละเสมอ (100) — เว้นว่างได้ ระบบใส่ 100 ให้
      if (max !== '' && Number(max) !== 100) { bad.push('บรรทัด ' + line + ' : ' + code + ' คะแนนเต็มต้องเป็น 100 (คะแนนคิดเป็นร้อยละ)'); return; }
      max = '100';
      if (Number(pass) < 0 || Number(pass) > 100) { bad.push('บรรทัด ' + line + ' : ' + code + ' เกณฑ์ผ่านต้องอยู่ระหว่าง 0–100 (%)'); return; }
      var exist = closOf(st.eYear, st.eSem, scode).filter(function (c) { return sameClo(c, code, sec); })[0] || null;
      if (exist && !canEditClo(exist)) { bad.push('บรรทัด ' + line + ' : ' + lockMsg(exist)); return; }
      plan.push({ subj: subj, code: code, sec: sec, text: iText >= 0 ? s(r[iText]) : '',
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
    // หัวคอลัมน์ = รหัส CLO (มี [ส่วน] ต่อท้ายถ้ารายวิชาแยกส่วน) · ยอมรับรหัสล้วนถ้ารหัสนั้นมีส่วนเดียว
    var cnt0 = {};
    clos.forEach(function (c) { var k0 = s(c.clo_code).toLowerCase(); cnt0[k0] = (cnt0[k0] || 0) + 1; });
    clos.forEach(function (c) {
      byCode[cloRef(c).toLowerCase()] = c;
      if (cnt0[s(c.clo_code).toLowerCase()] === 1) byCode[s(c.clo_code).toLowerCase()] = c;
    });
    var iSid = head.indexOf('student_id');
    var cols = [], unknown = [], bad = [];
    head.forEach(function (h, i) {
      if (i === iSid || h === 'name' || h === '') return;
      if (byCode[h] && comps(byCode[h]).length) {
        bad.push('คอลัมน์ "' + s(rows[0][i]) + '" : CLO นี้แบ่งเป็นหลายการประเมินแล้ว — ใช้แม่แบบคะแนนดิบแทน (ไม่นำเข้าคอลัมน์นี้)');
      } else if (byCode[h] && !canEditClo(byCode[h])) bad.push(lockMsg(byCode[h]));
      else if (byCode[h]) cols.push({ i: i, clo: byCode[h] });
      else unknown.push(s(rows[0][i]));
    });

    unknown.forEach(function (h) { bad.push('คอลัมน์ "' + h + '" ไม่ตรงกับ CLO ใดของรายวิชานี้ — ไม่นำเข้า'); });
    if (!cols.length) {
      APP._ploCsv = null;
      csvReview('นำเข้าคะแนนจากไฟล์ ' + fname,
        '<p class="text-sm text-gray-600">หัวตารางไม่มีคอลัมน์ที่ตรงกับรหัส CLO ของรายวิชานี้</p>'
        + '<p class="text-xs text-gray-500 mt-1">CLO ที่มี: ' + esc(clos.map(cloRef).join(', ')) + '</p>',
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
        payload.push({ clo_id: cloNum(c.clo), student_id: sid, score: num, updated_by: who });
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

  /* ================================================================
     CSV ขององค์ประกอบคะแนน — 2 แม่แบบ
     (ก2) นิยามองค์ประกอบ : 1 แถว = 1 การประเมินของ CLO หนึ่งข้อ
          subject_code, clo_code, item_name, full_score, weight_pct, pass_score, retake, retake_rule
          นำเข้าแล้ว "แทนที่" องค์ประกอบเดิมของ CLO ที่อยู่ในไฟล์ (CLO ที่ไม่อยู่ในไฟล์ไม่ถูกแตะ)
     (ข2) คะแนนดิบ        : 1 แถว = นักศึกษา 1 คน · คอลัมน์ = "<รหัส CLO> | c1 ชื่อการประเมิน (เต็ม 40)"
          และ "<รหัส CLO> | c1 ซ่อม" สำหรับการประเมินที่มีสอบซ่อม
          ช่องว่าง = ไม่แตะคะแนนเดิม · ระบบคิดที่ได้/คิดเป็น %/ร้อยละรวม ด้วยกติกาเดียวกับตารางบนหน้าเว็บ
     ================================================================ */
  var COMP_HEAD = ['subject_code', 'subject_name', 'section', 'clo_code', 'item_name', 'full_score', 'weight_pct', 'pass_score', 'retake', 'retake_rule'];
  function yes(v) { var x = s(v).toLowerCase(); return x === 'y' || x === 'yes' || x === '1' || x === 'true' || x === 'มี' || x === 'ใช่' || x === '✓'; }
  function ruleOf(v) { var x = s(v).toLowerCase(); return (x === 'actual' || x.indexOf('จริง') >= 0 || x.indexOf('ได้') >= 0) ? 'actual' : 'cap'; }

  window.ploCsvTemplateComp = function () {
    var st = state();
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var target = st.eSubject ? subs.filter(function (x) { return s(x.subject_code) === s(st.eSubject); }) : subs;
    if (!target.length) { showToast('ไม่มีรายวิชาในภาค/ปี/ชั้นปีที่เลือก', 'error'); return; }
    var rows = [COMP_HEAD.slice()], n0 = 0;
    target.forEach(function (x) {
      closOf(st.eYear, st.eSem, x.subject_code).forEach(function (c) {
        var list = comps(c);
        if (list.length) {
          list.forEach(function (k) {
            rows.push([x.subject_code, x.subject_name, secOf(c), c.clo_code, k.name, k.full, k.weight, k.pass,
              k.retake ? 'มี' : 'ไม่มี', k.retake ? (k.rule === 'actual' ? 'ตามคะแนนที่สอบได้' : 'เท่าเกณฑ์ผ่าน') : '']);
          });
        } else {
          // ยังไม่มีองค์ประกอบ — ใส่แถวตัวอย่างให้แก้ (ลบแถวทิ้งได้ถ้า CLO นี้กรอกร้อยละตรง)
          rows.push([x.subject_code, x.subject_name, secOf(c), c.clo_code, '', '', '', '', 'ไม่มี', '']);
        }
        n0++;
      });
    });
    if (n0 === 0) { showToast('ยังไม่มี CLO — นำเข้าหรือเพิ่ม CLO ก่อน', 'error'); return; }
    csvDownload('plo_องค์ประกอบ_' + s(st.eYear) + '_' + s(st.eSem) + '_ชั้นปี' + s(st.eLevel)
      + (st.eSubject ? '_' + s(st.eSubject) : '') + '.csv', rows);
    showToast('ดาวน์โหลดแม่แบบองค์ประกอบคะแนนแล้ว (' + n0 + ' CLO)');
  };

  function ploCsvPlanComp(rows, head, fname) {
    var st = state();
    var ix = function (k) { return head.indexOf(k); };
    var iSecC = ix('section');
    var iSub = ix('subject_code'), iClo = ix('clo_code'), iName = ix('item_name'), iFull = ix('full_score'),
        iW = ix('weight_pct'), iPass = ix('pass_score'), iRt = ix('retake'), iRule = ix('retake_rule');
    var subs = subjectsOf(st.eYear, st.eSem, st.eLevel);
    var bad = [], groups = {}, order = [];
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2;
      var name = s(r[iName]);
      if (!name) return;                                    // แถวว่างของแม่แบบ
      var scode = iSub >= 0 ? s(r[iSub]) : s(st.eSubject);
      var prC = parseRef(r[iClo], iSecC >= 0 ? r[iSecC] : '');
      var code = prC.code, secC = prC.sec;
      var subj = subs.filter(function (x) { return s(x.subject_code) === scode; })[0];
      if (!subj) { bad.push('บรรทัด ' + line + ' : ไม่พบรายวิชา ' + (scode || '(ไม่ได้ระบุ)')); return; }
      var clo = closOf(st.eYear, st.eSem, scode).filter(function (c) { return sameClo(c, code, secC); })[0];
      if (!clo) { bad.push('บรรทัด ' + line + ' : ไม่พบ ' + (refOf(code, secC) || 'CLO') + ' ในวิชา ' + scode + ' — เพิ่ม CLO ก่อน (ตรวจช่อง section ด้วย)'); return; }
      var full = s(r[iFull]), w = s(r[iW]), pass = iPass >= 0 ? s(r[iPass]) : '', rt = iRt >= 0 && yes(r[iRt]);
      if (!(Number(full) > 0)) { bad.push('บรรทัด ' + line + ' : ' + name + ' คะแนนเต็มต้องมากกว่า 0'); return; }
      if (!(Number(w) > 0)) { bad.push('บรรทัด ' + line + ' : ' + name + ' ต้องระบุว่าคิดเป็นกี่ %'); return; }
      if (pass !== '' && (!isFinite(Number(pass)) || Number(pass) < 0 || Number(pass) > Number(full))) {
        bad.push('บรรทัด ' + line + ' : ' + name + ' เกณฑ์ผ่านต้องอยู่ระหว่าง 0–' + full); return;
      }
      if (pass === '') pass = defPass(full, courseCfg(closOf(st.eYear, st.eSem, scode)));   // เว้นว่าง = เกณฑ์ผ่านเริ่มต้นของรายวิชา
      if (rt && pass === '') { bad.push('บรรทัด ' + line + ' : ' + name + ' มีสอบซ่อมต้องระบุเกณฑ์ผ่าน'); return; }
      if (!canEditClo(clo)) { bad.push('บรรทัด ' + line + ' : ' + lockMsg(clo)); return; }
      var key = clo.__backendId;
      if (!groups[key]) { groups[key] = { clo: clo, subj: subj, list: [], old: comps(clo) }; order.push(key); }
      var g = groups[key];
      // คงรหัสเดิมถ้าชื่อการประเมินตรงกับของเดิม คะแนนดิบที่บันทึกไว้จึงยังผูกกับรายการเดิม
      var prev = g.old.filter(function (o) { return s(o.name) === name; })[0];
      g.list.push({ id: prev ? prev.id : null, name: name, full: full, weight: w, pass: pass, retake: rt,
                    rule: rt ? ruleOf(iRule >= 0 ? r[iRule] : '') : 'cap' });
    });
    // แจกรหัสให้รายการใหม่ ไม่ให้ชนรหัสเดิม
    order.forEach(function (k) {
      var g = groups[k], used = {}, mx = 0;
      g.old.concat(g.list).forEach(function (c) { if (c.id) { used[c.id] = 1; mx = Math.max(mx, Number(String(c.id).replace(/\D/g, '')) || 0); } });
      g.list.forEach(function (c) { if (!c.id) { mx++; c.id = 'c' + mx; } });
    });
    APP._ploCsv = { kind: 'comp', groups: order.map(function (k) { return groups[k]; }) };
    var n = order.length;
    csvReview('นำเข้าองค์ประกอบคะแนนจากไฟล์ ' + fname,
      '<p class="text-sm text-gray-700">จะกำหนดองค์ประกอบคะแนนใหม่ให้ <b>' + n + '</b> CLO (แทนที่ของเดิมเฉพาะ CLO ที่อยู่ในไฟล์)</p>'
      + '<div class="max-h-56 overflow-y-auto border border-gray-100 rounded-xl"><table class="w-full text-xs">'
      + '<thead class="bg-surface"><tr><th class="px-2 py-1 text-left">CLO</th><th class="px-2 py-1 text-left">การประเมิน</th><th class="px-2 py-1">รวม</th></tr></thead><tbody>'
      + order.map(function (k) {
          var g = groups[k];
          return '<tr class="border-t"><td class="px-2 py-1 whitespace-nowrap">' + esc(g.subj.subject_code) + ' · ' + esc(cloRef(g.clo)) + '</td>'
            + '<td class="px-2 py-1">' + g.list.map(function (c) { return esc(c.name) + ' ' + esc(c.full) + '→' + esc(c.weight) + '%' + (c.retake ? ' (ซ่อม)' : ''); }).join(' · ') + '</td>'
            + '<td class="px-2 py-1 text-center">' + f2(compWeight(g.list)) + '%</td></tr>';
        }).join('') + '</tbody></table></div>'
      + '<p class="text-[11px] text-gray-500">ชื่อการประเมินที่ตรงกับของเดิมจะใช้รหัสเดิม คะแนนดิบที่บันทึกไว้แล้วจึงไม่หาย</p>',
      bad, n);
  }

  // ---------- คะแนนดิบรายองค์ประกอบ ----------
  window.ploCsvTemplateRaw = async function () {
    var st = state();
    if (!st.eSubject) { showToast('เลือกรายวิชาก่อน', 'error'); return; }
    var clos = closOf(st.eYear, st.eSem, st.eSubject).filter(function (c) { return comps(c).length; });
    if (!clos.length) { showToast('รายวิชานี้ยังไม่มี CLO ที่แบ่งองค์ประกอบคะแนน', 'error'); return; }
    var studs = entryStudents();
    if (!studs.length) { showToast('ไม่พบนักศึกษารหัส ' + cohortPrefix(st.eYear, st.eLevel), 'error'); return; }
    // คะแนนที่บันทึกไว้แล้ว — อ่านสดจากฐานข้อมูล
    var det = {};
    var pr = await sb().from('plo_clo').select('id,extra').in('id', clos.map(cloNum));
    (pr.data || []).forEach(function (row) {
      var ex = row.extra || {};
      Object.keys(ex).forEach(function (k) {
        if (k.indexOf('sc:') !== 0) return;
        var d = ex[k]; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
        det[cloKey(row.id) + '|' + k.slice(3)] = d || {};
      });
    });
    var head = ['student_id', 'name'], cols = [];
    clos.forEach(function (c) {
      comps(c).forEach(function (k) {
        head.push(cloRef(c) + ' | ' + k.id + ' ' + k.name + ' (เต็ม ' + k.full + ')'); cols.push([c, k, 's']);
        if (k.retake) { head.push(cloRef(c) + ' | ' + k.id + ' ซ่อม (ผ่าน ' + k.pass + ')'); cols.push([c, k, 'r']); }
      });
    });
    var rows = [head];
    studs.forEach(function (u) {
      rows.push([u.student_id, u.name].concat(cols.map(function (x) {
        var d = (det[x[0].__backendId + '|' + u.student_id] || {})[x[1].id] || {};
        return d[x[2]] == null ? '' : d[x[2]];
      })));
    });
    csvDownload('plo_คะแนนดิบ_' + s(st.eSubject) + '_' + s(st.eYear) + '_' + s(st.eSem) + '.csv', rows);
    showToast('ดาวน์โหลดแม่แบบคะแนนดิบแล้ว (' + studs.length + ' คน × ' + cols.length + ' ช่อง)');
  };

  var RAW_COL = /^(.+?)\s*\|\s*(c\d+)\b\s*(ซ่อม)?/i;
  function isRawHead(rawHead) { return rawHead.some(function (h) { return RAW_COL.test(s(h)); }); }

  function ploCsvPlanRaw(rows, fname) {
    var st = state();
    if (!st.eSubject) { showToast('เลือกรายวิชาก่อน จึงจะนำเข้าคะแนนได้', 'error'); return; }
    var clos = closOf(st.eYear, st.eSem, st.eSubject);
    var byCode = {};
    clos.forEach(function (c) { byCode[cloRef(c).toLowerCase()] = c; });
    var rawHead = rows[0].map(s);
    var iSid = rawHead.map(function (h) { return h.toLowerCase(); }).indexOf('student_id');
    var cols = [], bad = [];
    rawHead.forEach(function (h, i) {
      var m = h.match(RAW_COL);
      if (!m) return;
      var c = byCode[s(m[1]).toLowerCase()];
      if (!c) { bad.push('คอลัมน์ "' + h + '" : ไม่พบ ' + m[1] + ' ในรายวิชานี้'); return; }
      if (!canEditClo(c)) { if (bad.indexOf(lockMsg(c)) < 0) bad.push(lockMsg(c)); return; }
      var k = comps(c).filter(function (x) { return x.id === m[2].toLowerCase(); })[0];
      if (!k) { bad.push('คอลัมน์ "' + h + '" : ไม่พบการประเมิน ' + m[2] + ' ใน ' + c.clo_code + ' — ดาวน์โหลดแม่แบบใหม่'); return; }
      if (m[3] && !k.retake) { bad.push('คอลัมน์ "' + h + '" : ' + k.name + ' ไม่ได้ตั้งให้มีสอบซ่อม'); return; }
      cols.push({ i: i, clo: c, comp: k, part: m[3] ? 'r' : 's' });
    });
    var stuOk = {};
    entryStudents().forEach(function (u) { stuOk[s(u.student_id)] = 1; });
    var edits = [], nStu = {}, blank = 0;
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2, sid = s(r[iSid]);
      if (!sid) return;
      if (!stuOk[sid]) { bad.push('บรรทัด ' + line + ' : ไม่พบรหัสนักศึกษา ' + sid + ' ในรุ่นนี้'); return; }
      cols.forEach(function (c) {
        var v = s(r[c.i]);
        if (v === '') { blank++; return; }
        if (!isFinite(Number(v)) || Number(v) < 0) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + c.comp.name + ' "' + v + '" ไม่ใช่คะแนนที่ถูกต้อง'); return; }
        if (Number(v) > n(c.comp.full)) { bad.push('บรรทัด ' + line + ' : ' + sid + ' ' + c.comp.name + ' ' + v + ' เกินคะแนนเต็ม ' + c.comp.full); return; }
        edits.push({ clo: c.clo, sid: sid, cid: c.comp.id, part: c.part, v: v });
        nStu[sid] = 1;
      });
    });
    APP._ploCsv = { kind: 'raw', edits: edits };
    csvReview('นำเข้าคะแนนดิบจากไฟล์ ' + fname,
      '<div class="grid grid-cols-3 gap-2 text-center">'
      + '<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p class="text-2xl font-bold text-emerald-700">' + edits.length + '</p><p class="text-xs text-gray-600">ช่องคะแนน</p></div>'
      + '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3"><p class="text-2xl font-bold text-primary">' + Object.keys(nStu).length + '</p><p class="text-xs text-gray-600">นักศึกษา</p></div>'
      + '<div class="rounded-xl bg-gray-50 border border-gray-100 p-3"><p class="text-2xl font-bold text-gray-500">' + bad.length + '</p><p class="text-xs text-gray-600">ข้ามไป</p></div></div>'
      + '<p class="text-xs text-gray-500">ระบบคิดคะแนนที่ได้ คิดเป็น % และร้อยละรวมของ CLO ให้เอง'
      + (blank ? ' · ช่องที่เว้นว่าง ' + blank + ' ช่อง จะไม่ถูกแตะ' : '') + '</p>',
      bad, edits.length);
  }

  async function ploCsvApplyRaw(p) {
    var st = state(), who = (APP.currentUser && APP.currentUser.name) || '';
    var byClo = {};
    p.edits.forEach(function (e) { (byClo[e.clo.__backendId] = byClo[e.clo.__backendId] || { clo: e.clo, list: [] }).list.push(e); });
    var keys = Object.keys(byClo), scores = [], nRaw = 0;
    showToast('กำลังบันทึกคะแนนดิบ ' + p.edits.length + ' ช่อง...');
    for (var i = 0; i < keys.length; i++) {
      var g = byClo[keys[i]], cid = cloNum(g.clo);
      var cur = await sb().from('plo_clo').select('extra').eq('id', cid).maybeSingle();
      if (cur && cur.error) { showToast('อ่านข้อมูล CLO ไม่สำเร็จ: ' + cur.error.message, 'error'); return; }
      var ex = (cur && cur.data && cur.data.extra) || {};
      var touched = {};
      g.list.forEach(function (e) {
        var key = 'sc:' + e.sid, d = {};
        try { d = ex[key] ? (typeof ex[key] === 'string' ? JSON.parse(ex[key]) : ex[key]) : {}; } catch (x) { d = {}; }
        d[e.cid] = d[e.cid] || {};
        d[e.cid][e.part] = e.v;
        ex[key] = JSON.stringify(d);
        touched[e.sid] = d;
        nRaw++;
      });
      var up = await sb().from('plo_clo').update({ extra: ex }).eq('id', cid);
      if (up.error) { showToast('บันทึกคะแนนดิบไม่สำเร็จ: ' + up.error.message, 'error'); return; }
      Object.keys(touched).forEach(function (sid) {
        var calc = compCalc(g.clo, touched[sid]);
        if (calc.pct !== null) scores.push({ clo_id: cid, student_id: sid, score: calc.pct, updated_by: who });
      });
    }
    for (var b = 0; b < scores.length; b += 500) {
      var r = await sb().from('plo_score').upsert(scores.slice(b, b + 500), { onConflict: 'clo_id,student_id' });
      if (r.error) { showToast('บันทึกร้อยละรวมไม่สำเร็จ: ' + r.error.message, 'error'); return; }
    }
    APP._ploCsv = null;
    if (typeof closeModal === 'function') closeModal();
    st.scores = null; st._dirty = {}; st.summary = null;
    showToast('นำเข้าคะแนนดิบเรียบร้อย ' + nRaw + ' ช่อง · คำนวณผล CLO ครบ ' + scores.length + ' รายการ');
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }

  async function ploCsvApplyComp(p) {
    var st = state(), ok = 0, err = '';
    showToast('กำลังบันทึกองค์ประกอบคะแนน ' + p.groups.length + ' CLO...');
    for (var i = 0; i < p.groups.length; i++) {
      var g = p.groups[i];
      var list = g.list.map(function (c) { return { id: c.id, name: c.name, full: c.full, weight: c.weight, pass: c.pass, retake: !!c.retake, rule: c.rule }; });
      var r = await GSheetDB.update(Object.assign(noScores(g.clo), { components: JSON.stringify(list),
        updated_by: (APP.currentUser && APP.currentUser.name) || '' }), { noRefresh: i < p.groups.length - 1 });
      if (r && r.isOk) ok++; else err = (r && r.error) || '';
    }
    APP._ploCsv = null;
    if (typeof closeModal === 'function') closeModal();
    st.scores = null; st.summary = null;
    showToast(ok === p.groups.length ? 'นำเข้าองค์ประกอบคะแนนเรียบร้อย ' + ok + ' CLO' : 'สำเร็จ ' + ok + ' จาก ' + p.groups.length + ' CLO · ' + err,
      ok === p.groups.length ? 'success' : 'error');
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }


  /* ================================================================
     ภาพรวมรายวิชา · เกณฑ์ผ่านอัตโนมัติ · ตัดเกรด
     ----------------------------------------------------------------
     ค่าตั้งของรายวิชา (เกณฑ์ผ่านเริ่มต้น และช่วงคะแนนเกรด) เก็บใน extra ของ CLO ทุกข้อในรายวิชานั้น
     คีย์ "course_cfg" — อาจารย์ผู้สอนแก้ได้ (สิทธิ์เดียวกับ CLO) ไม่ต้องสร้างตารางใหม่
     อ่านจาก CLO ข้อใดก็ได้ที่มีค่า (ทุกข้อถูกเขียนพร้อมกันเสมอ)
     ================================================================ */
  var DEF_GRADES = [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['F', 0]];
  var DEF_CFG = { passPct: '60', grades: [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['F', 0]] };

  function courseCfg(clos) {
    var raw = null;
    (clos || []).some(function (c) { if (s(c.course_cfg)) { raw = c.course_cfg; return true; } return false; });
    var cfg = null;
    try { cfg = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; } catch (e) { cfg = null; }
    cfg = cfg || {};
    var g = Array.isArray(cfg.grades) && cfg.grades.length ? cfg.grades : DEF_CFG.grades;
    g = g.map(function (x) { return [s(x[0]), n(x[1])]; }).filter(function (x) { return x[0]; })
         .sort(function (a, b) { return b[1] - a[1]; });
    return { passPct: cfg.passPct == null ? DEF_CFG.passPct : s(cfg.passPct), grades: g, saved: !!raw };
  }
  function curCourseCfg() { var st = state(); return courseCfg(closOf(st.eYear, st.eSem, st.eSubject)); }
  // เกณฑ์ผ่านเริ่มต้นของการประเมินหนึ่งรายการ = ร้อยละที่ตั้งไว้ × คะแนนเต็ม
  function defPass(full, cfg) {
    cfg = cfg || curCourseCfg();
    if (s(cfg.passPct) === '' || !(n(full) > 0)) return '';
    return String(Math.round(n(full) * n(cfg.passPct)) / 100);
  }
  function gradeOf(pct, cfg) {
    if (pct == null) return '';
    var g = (cfg || curCourseCfg()).grades;
    for (var i = 0; i < g.length; i++) if (pct >= g[i][1] - 1e-9) return g[i][0];
    return g.length ? g[g.length - 1][0] : '';
  }

  /* ---------- ภาพรวมน้ำหนักรายวิชา (ขั้นที่ 3) ---------- */
  function courseOverview(subj) {
    var st = state();
    var clos = closOf(st.eYear, st.eSem, st.eSubject);
    if (!clos.length) return '';
    var cfg = courseCfg(clos);
    var secs = sectionsOf(subj);
    var groups = (secs.length ? secs : ['']).map(function (x) { return { sec: x, clos: [] }; });
    clos.forEach(function (c) {
      var g = groups.filter(function (x) { return x.sec === secOf(c); })[0];
      if (!g) { g = { sec: secOf(c), clos: [] }; groups.push(g); }
      g.clos.push(c);
    });
    var total = 0, noComp = 0;
    var rowsHtml = groups.filter(function (g) { return g.clos.length; }).map(function (g) {
      var sub = 0;
      var lines = g.clos.map(function (c) {
        var w = compWeight(comps(c));
        if (!comps(c).length) noComp++;
        sub += w;
        return '<div class="flex items-center justify-between gap-2 text-xs py-0.5">'
          + '<span class="text-gray-700">' + esc(c.clo_code) + ' <span class="text-gray-400">· ' + esc(c.plo_code || '') + '</span></span>'
          + (comps(c).length ? '<span class="tabular-nums font-semibold text-primary">' + f2(w) + '%</span>'
                             : '<span class="text-amber-600">ยังไม่กำหนดองค์ประกอบ</span>') + '</div>';
      }).join('');
      total += sub;
      return '<div class="border border-gray-100 rounded-xl p-3 bg-white">'
        + '<div class="flex items-center justify-between mb-1"><p class="text-sm font-semibold text-gray-800">' + esc(g.sec || 'ทั้งรายวิชา') + '</p>'
        + '<span class="text-sm font-bold tabular-nums">' + f2(sub) + '%</span></div>' + lines + '</div>';
    }).join('');
    var ok = Math.abs(total - 100) < 0.01;
    var warn = !ok
      ? '<p class="text-xs mt-2 ' + (total > 100 ? 'text-red-600' : 'text-amber-700') + '">น้ำหนักรวมทั้งรายวิชาได้ <b>' + f2(total) + '%</b> '
        + (total > 100 ? 'เกิน 100% — ตรวจองค์ประกอบคะแนนอีกครั้ง' : 'ยังไม่ครบ 100%') + ' · การตัดเกรดจะคิดจากน้ำหนักที่มีอยู่จริง</p>'
      : '<p class="text-xs mt-2 text-emerald-700">น้ำหนักรวมครบ 100% พร้อมตัดเกรด</p>';
    return '<div class="border border-blue-100 bg-blue-50/40 rounded-2xl p-4 mt-4">'
      + '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">'
      + '<p class="text-sm font-semibold text-gray-800"><i data-lucide="pie-chart" class="w-4 h-4 inline mr-1 text-primary"></i>ภาพรวมน้ำหนักคะแนนรายวิชา</p>'
      + '<div class="flex items-center gap-2"><span class="text-sm">รวม <b class="tabular-nums ' + (ok ? 'text-emerald-700' : 'text-amber-700') + '">' + f2(total) + '%</b></span>'
      + '<button type="button" onclick="ploCourseCfgEdit()" class="px-3 py-1.5 border border-primary text-primary rounded-lg text-xs bg-white hover:bg-blue-50">'
      + '<i data-lucide="settings-2" class="w-3.5 h-3.5 inline"></i> ตั้งค่ารายวิชา</button></div></div>'
      + '<div class="grid md:grid-cols-' + Math.min(groups.filter(function (g) { return g.clos.length; }).length, 3) + ' gap-3">' + rowsHtml + '</div>'
      + warn
      + (noComp ? '<p class="text-[11px] text-gray-500 mt-1">CLO ที่ยังไม่กำหนดองค์ประกอบคะแนน ' + noComp + ' ข้อ จะไม่ถูกนับในคะแนนรายวิชาและการตัดเกรด</p>' : '')
      + '<p class="text-[11px] text-gray-500 mt-1">เกณฑ์ผ่านเริ่มต้นของแต่ละการประเมิน: <b>' + (s(cfg.passPct) === '' ? 'ไม่ตั้ง' : esc(cfg.passPct) + '% ของคะแนนเต็ม') + '</b>'
      + ' · เกรด: ' + cfg.grades.map(function (g) { return esc(g[0]) + (g[1] > 0 ? ' ≥' + g[1] : ''); }).join(' · ') + '</p>'
      + '</div>';
  }

  /* ---------- หน้าต่างตั้งค่ารายวิชา ---------- */
  window.ploCourseCfgEdit = function () {
    var cfg = curCourseCfg();
    var st = state();
    st._cfgDraft = { passPct: cfg.passPct, grades: cfg.grades.map(function (g) { return [g[0], g[1]]; }) };
    showModal('ตั้งค่ารายวิชา ' + esc(st.eSubject), '<div id="ploCfgBox"></div>', null, 'max-w-lg');
    cfgDraw();
  };
  function cfgDraw() {
    var d = state()._cfgDraft, box = document.getElementById('ploCfgBox');
    if (!d || !box) return;
    box.innerHTML = '<div class="space-y-4">'
      + '<div><label class="block text-sm font-semibold text-gray-800 mb-1">เกณฑ์ผ่านเริ่มต้นของแต่ละการประเมิน</label>'
      + '<div class="flex items-center gap-2"><input type="number" min="0" max="100" step="0.01" value="' + esc(d.passPct) + '" oninput="ploCfgSet(\'passPct\',this.value)" data-nodraft="1" class="w-24 border rounded-lg px-2 py-1.5 text-sm">'
      + '<span class="text-sm text-gray-600">% ของคะแนนเต็ม</span></div>'
      + '<p class="text-[11px] text-gray-500 mt-1">เช่น 60% → สอบกลางภาคเต็ม 40 ผ่าน 24 · Role play เต็ม 24 ผ่าน 14.4 — ระบบเติมให้เองเมื่อช่องเกณฑ์ผ่านเว้นว่าง (แก้รายการได้) · เว้นว่าง = ไม่ตั้งเกณฑ์อัตโนมัติ</p></div>'
      + '<div><label class="block text-sm font-semibold text-gray-800 mb-1">ช่วงคะแนนเกรด (คะแนนรวมรายวิชา %)</label>'
      + '<table class="w-full text-sm"><thead><tr class="text-left text-xs text-gray-500"><th class="py-1">เกรด</th><th class="py-1">ตั้งแต่ (%)</th><th></th></tr></thead><tbody>'
      + d.grades.map(function (g, i) {
          return '<tr><td class="py-1 pr-2"><input value="' + esc(g[0]) + '" oninput="ploCfgGrade(' + i + ',0,this.value)" data-nodraft="1" class="w-20 border rounded-lg px-2 py-1 text-sm"></td>'
            + '<td class="py-1 pr-2"><input type="number" step="0.01" value="' + esc(g[1]) + '" oninput="ploCfgGrade(' + i + ',1,this.value)" data-nodraft="1" class="w-24 border rounded-lg px-2 py-1 text-sm"></td>'
            + '<td class="py-1 text-right"><button type="button" onclick="ploCfgGradeDel(' + i + ')" class="text-gray-300 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>';
        }).join('') + '</tbody></table>'
      + '<div class="flex flex-wrap gap-2 mt-2">'
      + '<button type="button" onclick="ploCfgGradeAdd()" class="px-2.5 py-1 border rounded-lg text-xs">+ เพิ่มเกรด</button>'
      + '<button type="button" onclick="ploCfgPreset(\'std\')" class="px-2.5 py-1 border rounded-lg text-xs">A–F (A≥80 … C≥60)</button>'
      + '<button type="button" onclick="ploCfgPreset(\'full\')" class="px-2.5 py-1 border rounded-lg text-xs">มี D+/D (≥55/≥50)</button></div>'
      + '<p class="text-[11px] text-gray-500 mt-1">เรียงจากมากไปน้อยให้อัตโนมัติ · เกรดสุดท้ายควรตั้ง 0 (เช่น F)</p></div>'
      + '<div class="flex justify-end gap-2 pt-2 border-t">'
      + '<button type="button" onclick="closeModal()" class="px-4 py-1.5 border rounded-lg text-sm">ยกเลิก</button>'
      + '<button type="button" onclick="ploCfgSave()" class="px-4 py-1.5 bg-primary text-white rounded-lg text-sm">บันทึก</button></div>'
      + '<p class="text-[11px] text-gray-400">ใช้กับรายวิชา ' + esc(state().eSubject) + ' ปีการศึกษา ' + esc(state().eYear) + ' ภาค ' + esc(state().eSem) + ' เท่านั้น</p>'
      + '</div>';
    if (window.lucide) lucide.createIcons();
  }
  window.ploCfgSet = function (k, v) { var d = state()._cfgDraft; if (d) d[k] = v; };
  window.ploCfgGrade = function (i, k, v) { var d = state()._cfgDraft; if (d && d.grades[i]) d.grades[i][k] = k ? v : s(v); };
  window.ploCfgGradeDel = function (i) { var d = state()._cfgDraft; if (!d) return; d.grades.splice(i, 1); cfgDraw(); };
  window.ploCfgGradeAdd = function () { var d = state()._cfgDraft; if (!d) return; d.grades.push(['', 0]); cfgDraw(); };
  window.ploCfgPreset = function (k) {
    var d = state()._cfgDraft; if (!d) return;
    d.grades = (k === 'full' ? DEF_GRADES : DEF_CFG.grades).map(function (g) { return [g[0], g[1]]; });
    cfgDraw();
  };
  window.ploCfgSave = async function () {
    var st = state(), d = st._cfgDraft; if (!d) return;
    if (s(d.passPct) !== '' && (!isFinite(Number(d.passPct)) || Number(d.passPct) < 0 || Number(d.passPct) > 100)) {
      showToast('เกณฑ์ผ่านเริ่มต้นต้องอยู่ระหว่าง 0–100', 'error'); return;
    }
    var grades = d.grades.filter(function (g) { return s(g[0]); }).map(function (g) { return [s(g[0]), n(g[1])]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!grades.length) { showToast('ต้องมีเกรดอย่างน้อย 1 ระดับ', 'error'); return; }
    var cfg = JSON.stringify({ passPct: s(d.passPct), grades: grades });
    var clos = closOf(st.eYear, st.eSem, st.eSubject);
    if (!clos.length) { showToast('รายวิชานี้ยังไม่มี CLO — เพิ่ม CLO ก่อน', 'error'); return; }
    showToast('กำลังบันทึกค่าตั้งรายวิชา...');
    for (var i = 0; i < clos.length; i++) {
      var cid = cloNum(clos[i]);
      var cur = await sb().from('plo_clo').select('extra').eq('id', cid).maybeSingle();
      if (cur && cur.error) { showToast('อ่านข้อมูล CLO ไม่สำเร็จ: ' + cur.error.message, 'error'); return; }
      var ex = (cur && cur.data && cur.data.extra) || {};
      ex.course_cfg = cfg;
      var up = await sb().from('plo_clo').update({ extra: ex }).eq('id', cid);
      if (up.error) { showToast('บันทึกไม่สำเร็จ: ' + up.error.message, 'error'); return; }
      clos[i].course_cfg = cfg;   // ให้หน้าจอเห็นค่าใหม่ทันที
    }
    var t = document.getElementById('loadingToast'); if (t) t.remove();
    st._cfgDraft = null;
    closeModal();
    showToast('บันทึกค่าตั้งรายวิชาแล้ว');
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  /* ---------- สรุปคะแนนรายวิชาและเกรด (ขั้นที่ 5) ---------- */
  function courseGradeTable(subj) {
    var st = state();
    var clos = closOf(st.eYear, st.eSem, st.eSubject).filter(function (c) { return comps(c).length; });
    if (!clos.length) return '<p class="text-sm text-gray-400">ยังไม่มี CLO ที่กำหนดองค์ประกอบคะแนน — กำหนดในขั้นที่ 3 ก่อน ระบบจึงจะรวมคะแนนรายวิชาและตัดเกรดได้</p>';
    var studs = entryStudents();
    if (!studs.length) return '<p class="text-sm text-gray-400">ไม่พบนักศึกษาในรุ่นนี้</p>';
    if (!st.scores) {
      return '<button onclick="ploLoadScores()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm flex items-center gap-2">'
        + '<i data-lucide="calculator" class="w-4 h-4"></i>โหลดคะแนนเพื่อสรุปเกรด (' + studs.length + ' คน)</button>';
    }
    var cfg = courseCfg(closOf(st.eYear, st.eSem, st.eSubject));
    var secs = [];
    clos.forEach(function (c) { if (secs.indexOf(secOf(c)) < 0) secs.push(secOf(c)); });
    var secW = {}, W = 0;
    secs.forEach(function (x) { secW[x] = 0; });
    clos.forEach(function (c) { var w = compWeight(comps(c)); secW[secOf(c)] += w; W += w; });
    var dist = {}, incomplete = 0;
    cfg.grades.forEach(function (g) { dist[g[0]] = 0; });
    var res = studs.map(function (u) {
      var bySec = {}, tot = 0, complete = true;
      secs.forEach(function (x) { bySec[x] = 0; });
      clos.forEach(function (c) {
        var calc = compCalc(c, (st.detail || {})[c.__backendId + '|' + u.student_id] || {});
        if (!calc.complete) complete = false;
        bySec[secOf(c)] += calc.total; tot += calc.total;
      });
      var pct = W > 0 ? Math.round(tot / W * 10000) / 100 : null;
      var g = complete ? gradeOf(pct, cfg) : '';
      if (complete) dist[g] = (dist[g] || 0) + 1; else incomplete++;
      return { u: u, bySec: bySec, tot: tot, pct: pct, g: g, complete: complete };
    });
    st._gradeRes = { secs: secs, secW: secW, W: W, res: res, cfg: cfg };
    var nDone = studs.length - incomplete;
    var gCls = function (g) { return g === 'F' ? 'bg-red-50 text-red-700' : /^A/.test(g) ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-primary'; };
    var summary = '<div class="overflow-x-auto mb-3"><table class="text-sm border border-gray-100 rounded-xl"><thead><tr class="bg-surface">'
      + '<th class="px-3 py-1.5 text-left">เกรด</th><th class="px-3 py-1.5 text-left">ช่วงคะแนน</th><th class="px-3 py-1.5">จำนวน (คน)</th><th class="px-3 py-1.5">ร้อยละ</th></tr></thead><tbody>'
      + cfg.grades.map(function (g, i) {
          var hi = i === 0 ? null : cfg.grades[i - 1][1];
          var range = i === 0 ? '≥ ' + g[1] + '%' : (g[1] > 0 ? g[1] + ' – ' + f2(hi - 0.01) + '%' : '< ' + hi + '%');
          var c = dist[g[0]] || 0;
          return '<tr class="border-t"><td class="px-3 py-1 font-semibold">' + esc(g[0]) + '</td><td class="px-3 py-1 text-gray-600">' + esc(range) + '</td>'
            + '<td class="px-3 py-1 text-center tabular-nums">' + c + '</td><td class="px-3 py-1 text-center tabular-nums">' + (nDone ? f2(c * 100 / nDone) : '0') + '</td></tr>';
        }).join('')
      + '<tr class="border-t bg-gray-50 font-semibold"><td class="px-3 py-1" colspan="2">รวม (คิดเกรดแล้ว)</td><td class="px-3 py-1 text-center">' + nDone + '</td><td class="px-3 py-1 text-center">100</td></tr>'
      + '</tbody></table></div>'
      + (incomplete ? '<p class="text-xs text-amber-700 mb-2">ยังกรอกคะแนนไม่ครบทุกการประเมิน ' + incomplete + ' คน — ยังไม่ตัดเกรดให้</p>' : '')
      + (Math.abs(W - 100) >= 0.01 ? '<p class="text-xs text-amber-700 mb-2">น้ำหนักรวมของ CLO ที่มีองค์ประกอบ = ' + f2(W) + '% (ไม่ใช่ 100%) — คะแนนรวมแปลงเป็นร้อยละของ ' + f2(W) + ' ก่อนตัดเกรด</p>' : '');
    var qk = s(st.gridQ).toLowerCase();
    var table = '<div class="ems-tablewrap border border-gray-100 rounded-xl" style="overflow:auto;max-height:60vh"><table data-ems-cards="skip" class="text-sm" style="min-width:100%;width:max-content">'
      + '<thead class="sticky top-0 z-20"><tr class="bg-surface text-left">'
      + '<th class="px-2 py-2 text-center w-10 bg-surface">#</th><th class="px-2 py-2 bg-surface sticky left-0 z-30 min-w-[13rem]">นักศึกษา</th>'
      + secs.map(function (x) { return '<th class="px-3 py-2 text-center bg-surface whitespace-nowrap">' + esc(x || 'คะแนน') + '<div class="text-[10px] font-normal text-gray-400">(' + f2(secW[x]) + '%)</div></th>'; }).join('')
      + '<th class="px-3 py-2 text-center bg-gray-100 whitespace-nowrap">รวม<div class="text-[10px] font-normal text-gray-400">(' + f2(W) + '%)</div></th>'
      + '<th class="px-3 py-2 text-center bg-gray-100">ร้อยละ</th><th class="px-3 py-2 text-center bg-gray-100">เกรด</th></tr></thead><tbody>'
      + res.map(function (r, i) {
          var hid = qk && (r.u.student_id + ' ' + r.u.name).toLowerCase().indexOf(qk) < 0 ? ' style="display:none"' : '';
          return '<tr class="border-t border-gray-50" data-q="' + esc((r.u.student_id + ' ' + r.u.name).toLowerCase()) + '"' + hid + '>'
            + '<td class="px-2 py-1 text-center text-xs text-gray-400">' + (i + 1) + '</td>'
            + '<td class="px-2 py-1 sticky left-0 bg-white z-10 whitespace-nowrap"><span class="font-mono text-xs text-gray-400">' + esc(r.u.student_id) + '</span> ' + esc(r.u.name) + '</td>'
            + secs.map(function (x) { return '<td class="px-3 py-1 text-center tabular-nums">' + f2(r.bySec[x]) + '</td>'; }).join('')
            + '<td class="px-3 py-1 text-center tabular-nums font-semibold bg-gray-50">' + f2(r.tot) + '</td>'
            + '<td class="px-3 py-1 text-center tabular-nums bg-gray-50">' + (r.complete ? f2(r.pct) + '%' : '<span class="text-[11px] text-amber-600">ยังไม่ครบ</span>') + '</td>'
            + '<td class="px-3 py-1 text-center bg-gray-50">' + (r.g ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold ' + gCls(r.g) + '">' + esc(r.g) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    return summary + table
      + '<div class="flex flex-wrap items-center gap-2 mt-3">'
      + (canEdit() ? '<button type="button" onclick="ploGradePush()" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primaryDark"><i data-lucide="send" class="w-4 h-4"></i>ส่งเกรดเข้าหน้าผลการเรียน (' + nDone + ' คน)</button>' : '')
      + '<button type="button" onclick="ploXlsxTemplate()" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-600 text-emerald-700 text-sm bg-white hover:bg-emerald-50"><i data-lucide="file-spreadsheet" class="w-4 h-4"></i>แบบบันทึกคะแนน Excel</button>'
      + '<button type="button" onclick="ploGradeCsv()" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-600 text-emerald-700 text-sm bg-white hover:bg-emerald-50"><i data-lucide="download" class="w-4 h-4"></i>ดาวน์โหลดสรุปคะแนนและเกรด (CSV)</button>'
      + '<button type="button" onclick="ploCourseCfgEdit()" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm bg-white hover:bg-gray-50"><i data-lucide="settings-2" class="w-4 h-4"></i>แก้ช่วงคะแนนเกรด</button>'
      + '<span class="text-[11px] text-gray-500">คิดจากคะแนนที่บันทึกแล้วและที่กำลังกรอกในขั้นที่ 4 · กดบันทึกคะแนนในขั้นที่ 4 ก่อนปิดหน้า</span></div>';
  }
  window.ploGradeCsv = function () {
    var st = state(), g = st._gradeRes;
    if (!g) { showToast('ยังไม่มีข้อมูลสรุป', 'error'); return; }
    var head = ['student_id', 'name'].concat(g.secs.map(function (x) { return (x || 'คะแนน') + ' (' + f2(g.secW[x]) + '%)'; }))
      .concat(['รวม (' + f2(g.W) + '%)', 'ร้อยละ', 'เกรด']);
    var rows = [head].concat(g.res.map(function (r) {
      return [r.u.student_id, r.u.name].concat(g.secs.map(function (x) { return f2(r.bySec[x]); }))
        .concat([f2(r.tot), r.complete ? f2(r.pct) : '', r.g]);
    }));
    csvDownload('เกรด_' + s(st.eSubject) + '_' + s(st.eYear) + '_' + s(st.eSem) + '.csv', rows);
  };


  /* ================================================================
     ส่งเกรดเข้าหน้าผลการเรียน (ตาราง grade)
     ----------------------------------------------------------------
     จับคู่ด้วย รหัสนักศึกษา + รหัสวิชา + ปีการศึกษา + ภาคการศึกษา
       • ยังไม่มีแถว             → เพิ่มใหม่
       • มีแถวแต่เกรดว่าง         → เติมเกรด
       • มีเกรดอยู่แล้วและต่างกัน  → เปลี่ยนเฉพาะเมื่อติ๊ก "เขียนทับ"
     อ่านแถวเดิมสดจากฐานข้อมูลทุกครั้ง ไม่พึ่งข้อมูลที่ค้างในเบราว์เซอร์
     ================================================================ */
  function semKey(v) { var x = s(v); return (x.indexOf('ร้อน') >= 0 || x === '3') ? '3' : x.replace(/\D/g, '') || x; }
  function creditsOf(subj) { var m = s(subj && subj.credits).match(/\d+(\.\d+)?/); return m ? Number(m[0]) : 3; }

  window.ploGradePush = async function () {
    var st = state(), g = st._gradeRes;
    if (!canEdit()) { showToast('ไม่มีสิทธิ์ส่งเกรด', 'error'); return; }
    if (!g) { showToast('ยังไม่มีผลสรุปเกรด — โหลดคะแนนในขั้นที่ 5 ก่อน', 'error'); return; }
    var ready = g.res.filter(function (r) { return r.complete && r.g; });
    if (!ready.length) { showToast('ยังไม่มีนักศึกษาที่คะแนนครบและตัดเกรดได้', 'error'); return; }
    var subj = subjectsOf(st.eYear, st.eSem, st.eLevel).filter(function (x) { return s(x.subject_code) === s(st.eSubject); })[0] || {};
    showToast('กำลังตรวจผลการเรียนเดิม...');
    var q = await sb().from('grade').select('*').eq('subject_code', s(st.eSubject));
    var t = document.getElementById('loadingToast'); if (t) t.remove();
    if (q.error) { showToast('อ่านผลการเรียนเดิมไม่สำเร็จ: ' + q.error.message, 'error'); return; }
    var have = {};
    (q.data || []).forEach(function (row) {
      var ex = row.extra || {};
      var yr = s(row.academic_year != null ? row.academic_year : ex.academic_year);
      var sm = row.semester != null ? row.semester : ex.semester;
      if (yr !== s(st.eYear) || semKey(sm) !== semKey(st.eSem)) return;
      var sid = s(row.student_id);
      (have[sid] = have[sid] || []).push({ id: row.id, grade: s(row.grade != null ? row.grade : ex.grade) });
    });
    var plan = { create: [], fill: [], change: [], same: 0, dup: 0, notReady: g.res.length - ready.length, subj: subj };
    ready.forEach(function (r) {
      var sid = s(r.u.student_id), rows = have[sid] || [];
      if (rows.length > 1) plan.dup++;
      if (!rows.length) { plan.create.push({ r: r }); return; }
      var cur = rows.filter(function (x) { return x.grade === ''; })[0] || rows[0];
      if (cur.grade === '') plan.fill.push({ r: r, id: cur.id });
      else if (cur.grade === r.g) plan.same++;
      else plan.change.push({ r: r, id: cur.id, old: cur.grade });
    });
    st._gradePush = plan;
    var box = function (num, label, cls) {
      return '<div class="rounded-xl border p-3 text-center ' + cls + '"><p class="text-2xl font-bold">' + num + '</p><p class="text-xs text-gray-600">' + label + '</p></div>';
    };
    var changeList = plan.change.length
      ? '<div class="border border-amber-200 rounded-xl overflow-auto" style="max-height:30vh"><table class="w-full text-sm"><thead><tr class="bg-amber-50 text-left text-xs">'
        + '<th class="px-2 py-1.5">นักศึกษา</th><th class="px-2 py-1.5 text-center">เกรดเดิม</th><th class="px-2 py-1.5 text-center">เกรดจากระบบ PLO</th></tr></thead><tbody>'
        + plan.change.map(function (x) {
            return '<tr class="border-t"><td class="px-2 py-1"><span class="font-mono text-xs text-gray-400">' + esc(x.r.u.student_id) + '</span> ' + esc(x.r.u.name) + '</td>'
              + '<td class="px-2 py-1 text-center">' + esc(x.old) + '</td><td class="px-2 py-1 text-center font-semibold">' + esc(x.r.g) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        + '<label class="flex items-center gap-2 text-sm mt-2"><input type="checkbox" id="ploGpOver" class="w-4 h-4"> เขียนทับเกรดเดิม ' + plan.change.length + ' คนนี้ด้วย</label>'
      : '';
    var nGo = plan.create.length + plan.fill.length;
    showModal('ส่งเกรดเข้าหน้าผลการเรียน',
      '<div class="space-y-3">'
      + '<p class="text-sm text-gray-700">รายวิชา <b>' + esc(st.eSubject) + ' ' + esc(subj.subject_name || '') + '</b> · ปีการศึกษา ' + esc(st.eYear)
      + ' · ภาค ' + esc(st.eSem === '3' ? 'ฤดูร้อน' : st.eSem) + '</p>'
      + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">'
      + box(plan.create.length, 'เพิ่มใหม่', 'bg-emerald-50 border-emerald-100 text-emerald-700')
      + box(plan.fill.length, 'เติมเกรดในแถวที่ว่าง', 'bg-blue-50 border-blue-100 text-primary')
      + box(plan.change.length, 'เกรดเดิมไม่ตรง', 'bg-amber-50 border-amber-100 text-amber-700')
      + box(plan.same, 'ตรงกันแล้ว (ข้าม)', 'bg-gray-50 border-gray-100 text-gray-500') + '</div>'
      + (Math.abs(g.W - 100) >= 0.01 ? '<p class="text-xs text-red-600">น้ำหนักรวมของรายวิชา = ' + f2(g.W) + '% (ไม่ใช่ 100%) — ตรวจองค์ประกอบคะแนนก่อนส่งเกรด</p>' : '')
      + (plan.notReady ? '<p class="text-xs text-amber-700">ยังไม่ส่ง ' + plan.notReady + ' คน เพราะคะแนนยังไม่ครบทุกการประเมิน</p>' : '')
      + (plan.dup ? '<p class="text-xs text-amber-700">มีนักศึกษา ' + plan.dup + ' คนที่มีแถวผลการเรียนวิชานี้ซ้ำกันหลายแถว — ระบบแก้เฉพาะแถวแรก ตรวจที่หน้าผลการเรียนอีกครั้ง</p>' : '')
      + changeList
      + '<p class="text-[11px] text-gray-500">ส่งซ้ำได้ทุกเมื่อ (เช่น หลังแก้คะแนนสอบซ่อม) · ระบบเพิ่ม/แก้เฉพาะช่องเกรด ไม่ลบแถวใด ๆ</p>'
      + '<div class="flex justify-end gap-2 pt-2 border-t">'
      + '<button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-sm">ยกเลิก</button>'
      + '<button type="button" id="ploGpBtn" onclick="ploGradePushRun()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm"' + (nGo || plan.change.length ? '' : ' disabled') + '>'
      + '<i data-lucide="send" class="w-4 h-4 inline"></i> ส่งเกรด</button></div></div>', null, 'max-w-2xl');
    if (window.lucide) lucide.createIcons();
  };

  window.ploGradePushRun = async function () {
    var st = state(), p = st._gradePush; if (!p) return;
    var over = !!(document.getElementById('ploGpOver') || {}).checked;
    var ups = p.fill.concat(over ? p.change : []);
    if (!p.create.length && !ups.length) { showToast('ไม่มีรายการที่ต้องส่ง — ติ๊ก "เขียนทับ" ถ้าต้องการเปลี่ยนเกรดเดิม', 'error'); return; }
    var btn = document.getElementById('ploGpBtn'); if (btn) { btn.disabled = true; btn.textContent = 'กำลังส่ง...'; }
    var now = new Date().toISOString(), subj = p.subj || {}, ok = 0, fail = 0, err = '';
    if (p.create.length) {
      var r1 = await GSheetDB.createMany(p.create.map(function (x) {
        return { type: 'grade', student_id: s(x.r.u.student_id), subject_code: s(st.eSubject), subject_name: s(subj.subject_name),
                 grade: x.r.g, credits: creditsOf(subj), semester: st.eSem, academic_year: s(st.eYear), created_at: now };
      }));
      ok += (r1 && r1.ok) || 0; fail += (r1 && r1.fail) || 0; if (r1 && r1.error) err = r1.error;
    }
    if (ups.length) {
      var r2 = await GSheetDB.updateMany(ups.map(function (x) { return { type: 'grade', __rowIndex: x.id, grade: x.r.g, updated_at: now }; }));
      ok += (r2 && r2.ok) || 0; fail += (r2 && r2.fail) || 0; if (r2 && r2.error) err = r2.error;
    }
    st._gradePush = null;
    closeModal();
    if (fail) showToast('ส่งเกรดสำเร็จ ' + ok + ' รายการ · ไม่สำเร็จ ' + fail + (err ? ' (' + err + ')' : ''), 'error');
    else showToast('ส่งเกรดเข้าหน้าผลการเรียนแล้ว ' + ok + ' รายการ');
  };

  /* ================================================================
     ไฟล์ Excel (.xlsx) — แบบบันทึกคะแนนหัวตาราง 3 ชั้น (ส่วน → CLO → การประเมิน)
     ----------------------------------------------------------------
     เขียนและอ่าน .xlsx เอง (ไม่โหลดไลบรารีจากภายนอก)
       • เขียน: SpreadsheetML + zip แบบไม่บีบอัด
       • อ่าน : zip (store/deflate ผ่าน DecompressionStream) แล้วแยก XML ด้วย regex
     แถวที่ 6 (ซ่อน) เก็บ "รหัสคอลัมน์" รูปแบบเดียวกับแม่แบบ CSV คะแนนดิบ
     ตอนอัปโหลดจึงส่งต่อให้ ploCsvPlanRaw ตรวจและสรุปก่อนบันทึกเหมือน CSV ทุกประการ
     ================================================================ */
  var XL = (function () {
    var CRC = (function () {
      var t = new Uint32Array(256);
      for (var i = 0; i < 256; i++) { var c = i; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
      return t;
    })();
    function crc32(u) { var c = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    var enc = function (x) { return new TextEncoder().encode(x); };
    function zip(files) {
      var parts = [], central = [], off = 0;
      files.forEach(function (f) {
        var name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(data);
        var h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        var c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
        c.setUint32(42, off, true);
        central.push(new Uint8Array(c.buffer), name);
        off += 30 + name.length + data.length;
      });
      var cdSize = central.reduce(function (t, x) { return t + x.length; }, 0);
      var e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
      e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
      var all = parts.concat(central, [new Uint8Array(e.buffer)]);
      var out = new Uint8Array(all.reduce(function (t, x) { return t + x.length; }, 0)), p = 0;
      all.forEach(function (x) { out.set(x, p); p += x.length; });
      return out;
    }
    async function inflate(u8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('เบราว์เซอร์นี้อ่านไฟล์ .xlsx ไม่ได้ — บันทึกเป็น CSV แล้วอัปโหลดแทน');
      var ds = new DecompressionStream('deflate-raw');
      var buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(buf);
    }
    async function unzip(buf) {
      var u = new Uint8Array(buf), v = new DataView(u.buffer, u.byteOffset, u.byteLength), eo = -1;
      for (var i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eo = i; break; }
      if (eo < 0) throw new Error('ไม่ใช่ไฟล์ .xlsx');
      var n = v.getUint16(eo + 10, true), p = v.getUint32(eo + 16, true), out = {};
      var dec = new TextDecoder();
      for (var k = 0; k < n; k++) {
        if (v.getUint32(p, true) !== 0x02014b50) break;
        var method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
        var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
        var name = dec.decode(u.subarray(p + 46, p + 46 + nl));
        var ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
        var raw = u.subarray(ds, ds + csize);
        if (/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(name)) {
          out[name] = dec.decode(method === 8 ? await inflate(raw) : raw);
        }
        p += 46 + nl + xl + cl;
      }
      return out;
    }
    function unx(x) {
      return String(x).replace(/&(#x?[0-9a-f]+|lt|gt|amp|quot|apos);/gi, function (m, e) {
        var l = e.toLowerCase();
        if (l === 'lt') return '<'; if (l === 'gt') return '>'; if (l === 'amp') return '&'; if (l === 'quot') return '"'; if (l === 'apos') return "'";
        return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
      });
    }
    function texts(xml) { var o = '', m, re = /<t\b[^>]*>([\s\S]*?)<\/t>/g; while ((m = re.exec(xml))) o += unx(m[1]); return o; }
    function colNo(ref) { var m = String(ref).match(/^([A-Z]+)/), c = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return c; }
    function colName(c) { var x = ''; while (c > 0) { var r = (c - 1) % 26; x = String.fromCharCode(65 + r) + x; c = Math.floor((c - 1) / 26); } return x; }
    // คืน [{name, rows:[[ข้อความ]]}] ของทุกแผ่นงาน
    async function read(buf) {
      var f = await unzip(buf), ss = [];
      if (f['xl/sharedStrings.xml']) {
        var m, re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
        while ((m = re.exec(f['xl/sharedStrings.xml']))) ss.push(texts(m[1]));
      }
      var names = {};
      var rels = f['xl/_rels/workbook.xml.rels'] || '', wb = f['xl/workbook.xml'] || '', rm, sm, rid = {};
      var rre = /<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g;
      while ((rm = rre.exec(rels))) rid[rm[1]] = rm[2].replace(/^\/?(xl\/)?/, 'xl/');
      var sre = /<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g;
      while ((sm = sre.exec(wb))) if (rid[sm[2]]) names[rid[sm[2]]] = unx(sm[1]);
      return Object.keys(f).filter(function (k) { return /worksheets\/sheet\d+\.xml$/.test(k); }).sort(function (a, b) {
        return Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]);
      }).map(function (k) {
        var rows = [], m, re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        while ((m = re.exec(f[k]))) {
          var at = m[1], body = m[2] || '';
          var r = (at.match(/\br="([A-Z]+)(\d+)"/) || []), t = (at.match(/\bt="([^"]+)"/) || [])[1] || '';
          if (!r[1]) continue;
          var vv = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1], val = '';
          if (t === 's') val = ss[Number(vv)] || '';
          else if (t === 'inlineStr') val = texts(body);
          else if (vv != null) val = unx(vv);
          if (t === '' && val !== '' && isFinite(Number(val))) val = String(Math.round(Number(val) * 1e6) / 1e6);
          var ri = Number(r[2]) - 1, ci = colNo(r[1]) - 1;
          while (rows.length <= ri) rows.push([]);
          while (rows[ri].length < ci) rows[ri].push('');
          rows[ri][ci] = val;
        }
        return { name: names[k] || k, rows: rows };
      });
    }
    function x(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    /* sheets: [{name, rows:[{h, hidden, cells:[{v,f,s}|null]}], merges:['A1:C1'], widths:[..], freeze:{x,y}, dv:[{ref,max}]}] */
    function build(sheets) {
      var STY = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>'
        + '<fonts count="5">'
        + '<font><sz val="14"/><name val="TH SarabunPSK"/></font>'
        + '<font><b/><sz val="18"/><name val="TH SarabunPSK"/></font>'
        + '<font><b/><sz val="14"/><name val="TH SarabunPSK"/></font>'
        + '<font><sz val="9"/><color rgb="FF9CA3AF"/><name val="Calibri"/></font>'
        + '<font><sz val="12"/><color rgb="FF6B7280"/><name val="TH SarabunPSK"/></font></fonts>'
        + '<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + ['FFDBEAFE', 'FFE0E7FF', 'FFFEF3C7', 'FFF3F4F6', 'FFDCFCE7', 'FFFFFBEB'].map(function (c) {
            return '<fill><patternFill patternType="solid"><fgColor rgb="' + c + '"/><bgColor indexed="64"/></patternFill></fill>';
          }).join('') + '</fills>'
        + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
        + '<border><left style="thin"><color rgb="FFBFC5CD"/></left><right style="thin"><color rgb="FFBFC5CD"/></right><top style="thin"><color rgb="FFBFC5CD"/></top><bottom style="thin"><color rgb="FFBFC5CD"/></bottom><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="13">'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                          // 0 ปกติ
        + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                             // 1 ชื่อเรื่อง
        + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' // 2 หัว ฟ้า
        + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' // 3 หัว ม่วงอ่อน
        + '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' // 4 หัว สอบซ่อม
        + '<xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' // 5 หัว สรุป
        + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                             // 6 แถวรหัส
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' // 7 ช่องกรอก
        + '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' // 8 ข้อความ
        + '<xf numFmtId="164" fontId="2" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' // 9 สูตร
        + '<xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' // 10 ช่องสอบซ่อม
        + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' // 11 คำอธิบาย
        + '<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' // 12 สูตรข้อความ
        + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
      var files = [], ws = [];
      sheets.forEach(function (sh, si) {
        var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '>'
          + (sh.freeze ? '<pane xSplit="' + sh.freeze.x + '" ySplit="' + sh.freeze.y + '" topLeftCell="' + colName(sh.freeze.x + 1) + (sh.freeze.y + 1) + '" activePane="bottomRight" state="frozen"/>' : '')
          + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/>'
          + (sh.widths && sh.widths.length ? '<cols>' + sh.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '')
          + '<sheetData>'
          + sh.rows.map(function (row, ri) {
              if (!row) return '';
              var rn = ri + 1;
              return '<row r="' + rn + '"' + (row.h ? ' ht="' + row.h + '" customHeight="1"' : '') + (row.hidden ? ' hidden="1"' : '') + '>'
                + (row.cells || []).map(function (c, ci) {
                    if (!c) return '';
                    var ref = colName(ci + 1) + rn, st = c.s ? ' s="' + c.s + '"' : '';
                    if (c.f) return '<c r="' + ref + '"' + st + (c.str ? ' t="str"' : '') + '><f>' + x(c.f) + '</f></c>';
                    if (c.v === '' || c.v == null) return '<c r="' + ref + '"' + st + '/>';
                    if (typeof c.v === 'number') return '<c r="' + ref + '"' + st + '><v>' + c.v + '</v></c>';
                    return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + x(c.v) + '</t></is></c>';
                  }).join('') + '</row>';
            }).join('')
          + '</sheetData>'
          + (sh.merges && sh.merges.length ? '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '')
          + (sh.dv && sh.dv.length ? '<dataValidations count="' + sh.dv.length + '">' + sh.dv.map(function (d) {
              return '<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="คะแนนไม่ถูกต้อง" error="' + x('กรอกได้ 0 – ' + d.max) + '" sqref="' + d.ref + '">'
                + '<formula1>0</formula1><formula2>' + d.max + '</formula2></dataValidation>';
            }).join('') + '</dataValidations>' : '')
          + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
          + '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>'
          + '</worksheet>';
        files.push({ name: 'xl/worksheets/sheet' + (si + 1) + '.xml', data: xml });
        ws.push(sh.name);
      });
      files.unshift(
        { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
          + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
          + ws.map(function (w, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')
          + '</Types>' },
        { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
        { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          + '<bookViews><workbookView/></bookViews><sheets>' + ws.map(function (w, i) { return '<sheet name="' + x(w) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>'
          + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
        { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + ws.map(function (w, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('')
          + '<Relationship Id="rId' + (ws.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
        { name: 'xl/styles.xml', data: STY }
      );
      return zip(files);
    }
    return { build: build, read: read, colName: colName };
  })();
  window.__ploXL = XL;   // ใช้ทดสอบ

  /* แผ่นงานแบบบันทึกคะแนน — m = { subj, year, sem, level, clos, studs, det, cfg } */
  function gradeBook(m) {
    var C = XL.colName, cfg = m.cfg, R0 = 7, RN = R0 + Math.max(m.studs.length, 1) - 1;
    var groups = [];
    m.clos.forEach(function (c) {
      var g = groups.filter(function (x) { return x.sec === secOf(c); })[0];
      if (!g) { g = { sec: secOf(c), clos: [] }; groups.push(g); }
      g.clos.push(c);
    });
    var rows = [];
    for (var i = 0; i < 6; i++) rows.push({ cells: [] });
    var put = function (r, c, cell) { rows[r - 1].cells[c - 1] = cell; };
    var merges = [], dv = [], widths = [6, 14, 30];
    var head = function (r1, c1, r2, c2, v, sty) {
      for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) put(r, c, { v: (r === r1 && c === c1) ? v : '', s: sty });
      if (r1 !== r2 || c1 !== c2) merges.push(C(c1) + r1 + ':' + C(c2) + r2);
    };
    head(3, 1, 5, 1, 'ลำดับ', 2); head(3, 2, 5, 2, 'รหัสนักศึกษา', 2); head(3, 3, 5, 3, 'ชื่อ - สกุล', 2);
    put(6, 1, { v: 'no', s: 6 }); put(6, 2, { v: 'student_id', s: 6 }); put(6, 3, { v: 'name', s: 6 });
    var col = 4, inputs = [], secCols = [];
    groups.forEach(function (g, gi) {
      var hs = gi % 2 ? 3 : 2, gStart = col, secW = 0, terms = [];
      g.clos.forEach(function (c) {
        var cStart = col, list = comps(c), cw = compWeight(list);
        secW += cw;
        list.forEach(function (k) {
          var full = n(k.full), w = n(k.weight), pass = s(k.pass) !== '' ? s(k.pass) : defPass(k.full, cfg);
          var sc = col++;
          put(5, sc, { v: s(k.name) + '\nเต็ม ' + f2(full) + ' · ' + f2(w) + '%', s: hs });
          put(6, sc, { v: cloRef(c) + ' | ' + k.id, s: 6 });
          widths[sc - 1] = 12;
          dv.push({ ref: C(sc) + R0 + ':' + C(sc) + RN, max: full });
          inputs.push({ c: sc, req: true, clo: c, k: k, part: 's' });
          var S = C(sc) + '{r}', used;
          if (k.retake) {
            var rc = col++;
            put(5, rc, { v: 'ซ่อม\n' + (pass !== '' ? 'ผ่าน ' + pass : ''), s: 4 });
            put(6, rc, { v: cloRef(c) + ' | ' + k.id + ' ซ่อม', s: 6 });
            widths[rc - 1] = 9;
            dv.push({ ref: C(rc) + R0 + ':' + C(rc) + RN, max: full });
            inputs.push({ c: rc, req: false, clo: c, k: k, part: 'r' });
            var Rr = C(rc) + '{r}';
            used = (k.rule !== 'actual' && pass !== '')
              ? 'IF(' + Rr + '="",N(' + S + '),IF(' + Rr + '>=' + pass + ',MAX(N(' + S + '),' + pass + '),MAX(N(' + S + '),' + Rr + ')))'
              : 'MAX(N(' + S + '),N(' + Rr + '))';
          } else used = 'N(' + S + ')';
          terms.push('MIN(' + used + ',' + full + ')/' + full + '*' + w);
        });
        head(4, cStart, 4, col - 1, s(c.clo_code) + (s(c.plo_code) ? ' · ' + s(c.plo_code) : '') + ' (' + f2(cw) + '%)', hs);
      });
      head(3, gStart, 3, col - 1, (g.sec ? 'ภาค' + g.sec : 'คะแนน') + ' (' + f2(secW) + '%)', hs);
      secCols.push({ sec: g.sec, w: secW, terms: terms });
    });
    // คอลัมน์สรุป (สูตร)
    var sumStart = col, W = secCols.reduce(function (t, x) { return t + x.w; }, 0);
    secCols.forEach(function (x) { x.c = col++; head(4, x.c, 5, x.c, (x.sec || 'คะแนน') + '\n(' + f2(x.w) + '%)', 5); put(6, x.c, { v: 'sum', s: 6 }); widths[x.c - 1] = 11; });
    var cT = col++, cP = col++, cOk = col++, cG = col++;
    head(4, cT, 5, cT, 'รวม\n(' + f2(W) + '%)', 5); head(4, cP, 5, cP, 'ร้อยละ', 5);
    head(4, cOk, 5, cOk, 'กรอกครบ', 5); head(4, cG, 5, cG, 'เกรด', 5);
    [cT, cP, cOk, cG].forEach(function (c) { put(6, c, { v: 'sum', s: 6 }); widths[c - 1] = 10; });
    head(3, sumStart, 3, cG, 'สรุปคะแนน (คำนวณอัตโนมัติ)', 5);
    var gradeF = function (P) {
      var g = cfg.grades, f = '"' + (g.length ? g[g.length - 1][0] : '') + '"';
      for (var i = g.length - 2; i >= 0; i--) f = 'IF(' + P + '>=' + g[i][1] + ',"' + g[i][0] + '",' + f + ')';
      return f;
    };
    var title = 'แบบบันทึกคะแนน รายวิชา ' + s(m.subj.subject_code) + ' ' + s(m.subj.subject_name);
    head(1, 1, 1, cG, title, 1);
    head(2, 1, 2, cG, 'ปีการศึกษา ' + m.year + ' · ภาคการศึกษา ' + (m.sem === '3' ? 'ฤดูร้อน' : m.sem) + ' · ชั้นปีที่ ' + m.level
      + ' · เกณฑ์ผ่านเริ่มต้น ' + (s(cfg.passPct) === '' ? '-' : cfg.passPct + '% ของคะแนนเต็ม')
      + ' · กรอกเฉพาะช่องคะแนน ห้ามแทรก/ลบคอลัมน์หรือแก้หัวตาราง', 11);
    rows[0].h = 30; rows[1].h = 24; rows[2].h = 26; rows[3].h = 30; rows[4].h = 46; rows[5].hidden = true;
    var req = inputs.filter(function (x) { return x.req; });
    (m.studs.length ? m.studs : [{ student_id: '', name: '' }]).forEach(function (u, i) {
      var r = R0 + i, cells = [];
      rows.push({ cells: cells });
      cells[0] = { v: i + 1, s: 7 }; cells[1] = { v: s(u.student_id), s: 8 }; cells[2] = { v: s(u.name), s: 8 };
      inputs.forEach(function (x) {
        var d = ((m.det[x.clo.__backendId + '|' + u.student_id] || {})[x.k.id] || {})[x.part];
        var v = d == null || s(d) === '' ? '' : (isFinite(Number(d)) ? Number(d) : s(d));
        cells[x.c - 1] = { v: v, s: x.part === 'r' ? 10 : 7 };
      });
      secCols.forEach(function (x) {
        cells[x.c - 1] = { f: x.terms.length ? 'ROUND(' + x.terms.join('+').replace(/\{r\}/g, r) + ',2)' : '0', s: 9 };
      });
      cells[cT - 1] = { f: 'ROUND(' + secCols.map(function (x) { return C(x.c) + r; }).join('+') + ',2)', s: 9 };
      cells[cP - 1] = { f: W > 0 ? 'ROUND(' + C(cT) + r + '/' + W + '*100,2)' : '0', s: 9 };
      var blanks = req.map(function (x) { return '(' + C(x.c) + r + '="")'; }).join('+') || '0';
      cells[cOk - 1] = { f: 'IF(' + blanks + '=0,"ครบ","ขาด "&(' + blanks + '))', s: 12, str: true };
      cells[cG - 1] = { f: 'IF(' + C(cOk) + r + '<>"ครบ","",' + gradeF(C(cP) + r) + ')', s: 12, str: true };
    });
    var main = { name: 'คะแนน', rows: rows, merges: merges, widths: widths, freeze: { x: 3, y: 6 }, dv: dv };

    // แผ่นที่ 2 : สรุปการกระจายเกรด
    var GR = "'คะแนน'!" + C(cG) + R0 + ':' + C(cG) + RN;
    var srows = [{ cells: [{ v: 'สรุปผลการตัดเกรด ' + s(m.subj.subject_code) + ' ' + s(m.subj.subject_name), s: 1 }], h: 30 }, { cells: [] },
      { cells: [{ v: 'เกรด', s: 2 }, { v: 'ช่วงคะแนน (ร้อยละ)', s: 2 }, { v: 'จำนวน (คน)', s: 2 }, { v: 'ร้อยละ', s: 2 }], h: 26 }];
    var gs = cfg.grades, firstR = 4;
    gs.forEach(function (g, i) {
      var hi = i === 0 ? null : gs[i - 1][1];
      var range = i === 0 ? '≥ ' + g[1] : (g[1] > 0 ? g[1] + ' – ' + f2(hi - 0.01) : '< ' + hi);
      var r = firstR + i;
      srows.push({ cells: [{ v: g[0], s: 7 }, { v: range, s: 7 }, { f: 'COUNTIF(' + GR + ',"' + g[0] + '")', s: 9 },
        { f: 'IF(C' + (firstR + gs.length) + '=0,0,ROUND(C' + r + '/C' + (firstR + gs.length) + '*100,2))', s: 9 }] });
    });
    var lastR = firstR + gs.length - 1;
    srows.push({ cells: [{ v: 'รวม (ตัดเกรดแล้ว)', s: 5 }, { v: '', s: 5 }, { f: 'SUM(C' + firstR + ':C' + lastR + ')', s: 9 }, { f: 'IF(C' + (lastR + 1) + '=0,0,100)', s: 9 }] });
    srows.push({ cells: [{ v: 'ยังกรอกไม่ครบ', s: 7 }, { v: '', s: 7 }, { f: 'COUNTIF(' + "'คะแนน'!" + C(cOk) + R0 + ':' + C(cOk) + RN + ',"ขาด*")', s: 9 }, { v: '', s: 7 }] });
    var sum = { name: 'สรุปเกรด', rows: srows, merges: ['A1:D1', 'A' + (lastR + 1) + ':B' + (lastR + 1), 'A' + (lastR + 2) + ':B' + (lastR + 2)], widths: [16, 22, 14, 12] };

    // แผ่นที่ 3 : คำอธิบาย
    var notes = [
      'วิธีใช้แบบบันทึกคะแนน',
      '1) กรอกคะแนนดิบในแผ่นงาน "คะแนน" เฉพาะช่องสีขาว (คะแนนปกติ) และช่องสีเหลืองอ่อน (สอบซ่อม — กรอกเฉพาะคนที่สอบซ่อม)',
      '2) ช่องที่เว้นว่างจะไม่ถูกแตะเมื่ออัปโหลดกลับ (ไม่ใช่ให้ 0) — ถ้าได้ 0 คะแนน ให้พิมพ์ 0',
      '3) คอลัมน์ "สรุปคะแนน" คำนวณให้อัตโนมัติ: คะแนนแต่ละการประเมิน ÷ คะแนนเต็ม × ร้อยละที่กำหนด',
      '4) สอบซ่อม "เท่าเกณฑ์ผ่าน": ซ่อมผ่านได้คะแนนเท่าเกณฑ์ผ่าน · ซ่อมไม่ผ่านใช้คะแนนที่มากกว่า',
      '5) เกรดแสดงเมื่อกรอกคะแนนครบทุกการประเมิน · ช่วงคะแนน: ' + cfg.grades.map(function (g) { return g[0] + (g[1] > 0 ? ' ≥ ' + g[1] : ''); }).join(', '),
      '6) อัปโหลดกลับที่ หน้า PLOs → บันทึกข้อมูล → ขั้นที่ 6 → "อัปโหลดคะแนนดิบ" (รับทั้ง .xlsx และ .csv) ระบบจะสรุปให้ตรวจก่อนบันทึก',
      '7) ห้ามแทรก ลบ หรือสลับคอลัมน์ และห้ามลบแถวที่ 6 (ซ่อนไว้ เป็นรหัสคอลัมน์ที่ระบบใช้อ่านไฟล์) — เพิ่มหรือแก้การประเมินให้ทำในระบบแล้วดาวน์โหลดแม่แบบใหม่',
      '8) ระบบใช้ผลการคำนวณของระบบเป็นหลัก สูตรในไฟล์มีไว้ให้ตรวจทานระหว่างกรอก'
    ];
    var info = { name: 'คำอธิบาย', rows: notes.map(function (t, i) { return { cells: [{ v: t, s: i ? 11 : 1 }], h: i ? 40 : 30 }; }), widths: [120] };
    return XL.build([main, sum, info]);
  }

  window.ploXlsxTemplate = async function () {
    var st = state();
    if (!st.eSubject) { showToast('เลือกรายวิชาก่อน', 'error'); return; }
    var clos = closOf(st.eYear, st.eSem, st.eSubject).filter(function (c) { return comps(c).length; });
    if (!clos.length) { showToast('รายวิชานี้ยังไม่มี CLO ที่แบ่งองค์ประกอบคะแนน', 'error'); return; }
    var studs = entryStudents();
    if (!studs.length) { showToast('ไม่พบนักศึกษารหัส ' + cohortPrefix(st.eYear, st.eLevel), 'error'); return; }
    var det = {};
    var pr = await sb().from('plo_clo').select('id,extra').in('id', clos.map(cloNum));
    if (pr.error) { showToast('อ่านคะแนนเดิมไม่สำเร็จ: ' + pr.error.message, 'error'); return; }
    (pr.data || []).forEach(function (row) {
      var ex = row.extra || {};
      Object.keys(ex).forEach(function (k) {
        if (k.indexOf('sc:') !== 0) return;
        var d = ex[k]; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
        det[cloKey(row.id) + '|' + k.slice(3)] = d || {};
      });
    });
    // คะแนนที่กำลังกรอกในขั้นที่ 4 แต่ยังไม่กดบันทึก — ใช้ค่าบนหน้าจอแทน
    Object.keys(st.detail || {}).forEach(function (k) { det[k] = st.detail[k]; });
    var subj = subjectsOf(st.eYear, st.eSem, st.eLevel).filter(function (x) { return s(x.subject_code) === s(st.eSubject); })[0] || { subject_code: st.eSubject };
    var bytes = gradeBook({ subj: subj, year: s(st.eYear), sem: s(st.eSem), level: s(st.eLevel), clos: clos, studs: studs, det: det,
                            cfg: courseCfg(closOf(st.eYear, st.eSem, st.eSubject)) });
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'แบบบันทึกคะแนน_' + s(st.eSubject) + '_' + s(st.eYear) + '_' + s(st.eSem) + '.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    showToast('ดาวน์โหลดแบบบันทึกคะแนน Excel แล้ว (' + studs.length + ' คน)');
  };

  // อ่าน .xlsx → แถวสำหรับ ploCsvPlanRaw (หัว = แถวรหัสคอลัมน์ที่ซ่อนไว้)
  async function xlsxRawRows(file) {
    var sheets = await XL.read(await file.arrayBuffer());
    for (var i = 0; i < sheets.length; i++) {
      var rows = sheets[i].rows;
      for (var r = 0; r < Math.min(rows.length, 30); r++) {
        var row = (rows[r] || []).map(s);
        if (row.map(function (x) { return x.toLowerCase(); }).indexOf('student_id') >= 0 && isRawHead(row)) {
          return [row].concat(rows.slice(r + 1).map(function (x) { return (x || []).map(s); }));
        }
      }
    }
    return null;
  }

  window.ploCsvApply = async function () {
    var p = APP._ploCsv;
    if (!p) return;
    var st = state();
    if (p.kind === 'comp') return ploCsvApplyComp(p);
    if (p.kind === 'raw') return ploCsvApplyRaw(p);

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
          clo_code: xa.code, section: xa.sec || '', statement_th: xa.text, plo_code: xa.plo,
          max_score: xa.max, pass_score: xa.pass, updated_by: whoA
        };
        var rA = xa.exist
          ? await GSheetDB.update(Object.assign(noScores(xa.exist), baseA), { noRefresh: a < p.plan.length - 1 })
          : await GSheetDB.create(Object.assign({ sort_order: a + 1, created_by: whoA }, baseA), { noRefresh: a < p.plan.length - 1 });
        if (rA && rA.isOk) okA++; else errA = (rA && rA.error) || '';
      }

      // หารหัสแถวของ CLO หลังบันทึกเสร็จ แล้วแปลงคะแนนเป็นชุดที่ส่งขึ้นฐานข้อมูลได้
      var payloadA = [], missA = 0;
      if (p.scores.length) {
        var mapA = {};
        subjectsOf(st.eYear, st.eSem, st.eLevel).forEach(function (sb2) {
          closOf(st.eYear, st.eSem, sb2.subject_code).forEach(function (c) {
            mapA[s(sb2.subject_code) + '|' + cloRef(c)] = c;
          });
        });
        p.scores.forEach(function (x) {
          var c = mapA[s(x.subject_code) + '|' + refOf(x.clo_code, x.sec)];
          if (!c) { missA++; return; }
          payloadA.push({ clo_id: cloNum(c), student_id: x.student_id, score: x.score, updated_by: whoA });
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
          clo_code: x.code, section: x.sec || '', statement_th: x.text, plo_code: x.plo,
          max_score: x.max, pass_score: x.pass, updated_by: who
        };
        var opts = { noRefresh: i < p.plan.length - 1 };
        var r = x.exist
          ? await GSheetDB.update(Object.assign(noScores(x.exist), base), opts)
          : await GSheetDB.create(Object.assign({ sort_order: i + 1, created_by: who }, base), opts);
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
            var t = ploLabel(p);
            return '<option value="' + esc(p.plo_code) + '" title="' + esc(s(p.plo_code) + ' ' + s(p.statement_th)) + '"' + (s(val) === s(p.plo_code) ? ' selected' : '') + '>'
              + esc(t) + '</option>';
          }).join('') + '</select>';
    };

    var table = !rows.length
      ? '<p class="text-sm text-gray-400 mb-3">ยังไม่มี CLO ในรายวิชานี้</p>'
      : '<div class="overflow-x-auto mb-3"><table class="w-full text-sm">'
        + '<thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold w-28">CLO</th>'
        + '<th class="px-3 py-2 font-semibold">คำอธิบาย</th>'
        + '<th class="px-3 py-2 font-semibold w-44">PLO ที่ผูก</th>'
        + '<th class="px-3 py-2 font-semibold text-center w-24">คะแนนเต็ม</th>'
        + '<th class="px-3 py-2 font-semibold text-center w-24">เกณฑ์ผ่าน (%)</th>'
        + '<th class="px-3 py-2 w-20"></th></tr></thead><tbody>'
        + rows.map(function (r) {
            return '<tr class="border-t border-gray-50">'
              + '<td class="px-3 py-2 font-semibold whitespace-nowrap">' + esc(r.clo_code) + secBadge(r) + '</td>'
              + '<td class="px-3 py-2">' + esc(r.statement_th) + '</td>'
              + '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded-lg bg-blue-50 text-primary text-xs">'
              + esc(r.plo_code || '—') + '</span>'
              + (comps(r).length ? '<div class="text-[11px] text-emerald-700 mt-1">' + comps(r).length + ' การประเมิน · รวม ' + f2(compWeight(comps(r))) + '%</div>' : '')
              + '</td>'
              + '<td class="px-3 py-2 text-center">' + (s(r.max_score) && n(r.max_score) !== 100
                  ? '<span class="text-amber-700" title="CLO เดิม — กดแก้ไขแล้วบันทึกเพื่อเปลี่ยนเป็น 100%">' + esc(r.max_score) + ' ⚠</span>' : '100%') + '</td>'
              + '<td class="px-3 py-2 text-center">' + esc(r.pass_score) + '%</td>'
              + '<td class="px-3 py-2 text-right whitespace-nowrap">'
              // รหัสแถวเป็นข้อความ (เช่น plo_clo_20) ต้องครอบเครื่องหมายคำพูด
              // ไม่งั้นเบราว์เซอร์อ่านเป็นชื่อตัวแปรแล้วฟ้องว่าไม่รู้จัก
              + (!canEditClo(r)
                  ? '<span class="text-[11px] text-gray-400" title="' + esc(lockMsg(r)) + '"><i data-lucide="lock" class="w-3.5 h-3.5 inline"></i> กรอกโดย ' + esc(cloOwner(r) || 'ผู้อื่น') + '</span></td></tr>'
                  : '')
              + (!canEditClo(r) ? '' : '<button onclick="ploEditComps(\'' + esc(r.__backendId) + '\')" class="mr-2 px-2 py-0.5 rounded-lg border text-[11px] '
              + (comps(r).length ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-gray-200 text-gray-500 hover:border-primary hover:text-primary') + '" title="กำหนดว่า CLO นี้มีคะแนนอะไรเท่าไหร่บ้าง">'
              + '<i data-lucide="list-checks" class="w-3.5 h-3.5 inline"></i> องค์ประกอบคะแนน</button>'
              + '<button onclick="ploEditClo(\'' + esc(r.__backendId) + '\')" class="text-gray-300 hover:text-primary mr-2" title="แก้ไข CLO นี้">'
              + '<i data-lucide="pencil" class="w-4 h-4"></i></button>'
              + '<button onclick="ploDeleteClo(\'' + esc(r.__backendId) + '\')" class="text-gray-300 hover:text-red-500" title="ลบ CLO นี้">'
              + '<i data-lucide="trash-2" class="w-4 h-4"></i></button>'
              + (cloOwner(r) && cloOwner(r) !== meName() ? '<div class="text-[10px] text-gray-400 mt-0.5">กรอกโดย ' + esc(cloOwner(r)) + '</div>' : '')
              + '</td></tr>');
          }).join('')
        + '</tbody></table></div>';

    var secs = sectionsOf(subj);
    var form = '<div class="border border-gray-100 rounded-xl p-4 bg-surface/50 mb-4">'
      + '<p class="text-xs font-semibold text-gray-600 mb-2">เพิ่ม CLO'
      + (secs.length ? ' <span class="font-normal text-gray-500">— รายวิชานี้เป็น' + esc(s(subj.theory_practice)) + ' เลือกส่วนของ CLO ได้ (รหัสเดียวกันอยู่ได้ทั้งสองส่วน)</span>' : '') + '</p>'
      + '<div class="grid md:grid-cols-12 gap-2 items-end">'
      + (secs.length
          ? '<div class="md:col-span-2"><label class="block text-[11px] text-gray-500 mb-1">ส่วน</label>'
            + '<select id="cloSec" class="w-full border rounded-lg px-2 py-1.5 text-sm">'
            + secs.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('') + '</select></div>'
          : '')
      + '<div class="md:col-span-2"><label class="block text-[11px] text-gray-500 mb-1">รหัส CLO</label>'
      + '<input id="cloCode" value="CLO' + (rows.length + 1) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div class="md:col-span-' + (secs.length ? '2' : '4') + '"><label class="block text-[11px] text-gray-500 mb-1">คำอธิบาย</label>'
      + '<input id="cloText" class="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="ผู้เรียนสามารถ..."></div>'
      + '<div class="md:col-span-3"><label class="block text-[11px] text-gray-500 mb-1">ผูกกับ PLO</label>' + ploSelect('cloPlo', '') + '</div>'
      + '<div class="md:col-span-1"><label class="block text-[11px] text-gray-500 mb-1">เต็ม</label>'
      + '<input id="cloMax" type="hidden" value="100"><div class="w-full border border-gray-100 bg-gray-50 rounded-lg px-2 py-1.5 text-sm text-gray-500 text-center" title="คะแนนคิดเป็นร้อยละ">100%</div></div>'
      + '<div class="md:col-span-1"><label class="block text-[11px] text-gray-500 mb-1">ผ่าน (%)</label>'
      + '<input id="cloPass" type="number" min="0" max="100" step="0.01" value="60" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div class="md:col-span-1"><button onclick="ploAddClo(false)" class="w-full px-3 py-1.5 bg-primary text-white rounded-lg text-sm">เพิ่ม</button></div>'
      + '</div>'
      + '<div class="mt-2 flex items-center gap-2">'
      + '<button onclick="ploAddClo(true)" class="text-xs text-primary hover:underline flex items-center gap-1">'
      + '<i data-lucide="copy-plus" class="w-3.5 h-3.5"></i>เพิ่ม CLO นี้ให้ทุกรายวิชาของชั้นปีที่ ' + esc(st.eLevel) + '</button>'
      + '<span class="text-[11px] text-gray-400">(ข้ามรายวิชาที่มีรหัส CLO นี้อยู่แล้ว)</span></div>'
      + '</div>';

    var scores = rows.length ? scoreGrid(rows) : '';

    // แยกส่งเป็น 2 ส่วน ให้หน้าบันทึกข้อมูลวางเป็นขั้นที่ 3 (CLO) และขั้นที่ 4 (คะแนน)
    return { clo: table + form, scores: scores };
  }

  window.ploAddClo = async function (wholeYear) {
    var st = state();
    var code = s((document.getElementById('cloCode') || {}).value);
    var sec = normSec((document.getElementById('cloSec') || {}).value);
    var text = s((document.getElementById('cloText') || {}).value);
    var plo = s((document.getElementById('cloPlo') || {}).value);
    var max = '100';   // คะแนนเต็มเป็นร้อยละเสมอ
    var pass = s((document.getElementById('cloPass') || {}).value);
    if (pass !== '' && (!isFinite(Number(pass)) || Number(pass) < 0 || Number(pass) > 100)) { showToast('เกณฑ์ผ่านต้องอยู่ระหว่าง 0–100 (%)', 'error'); return; }
    if (!code) { showToast('กรุณากรอกรหัส CLO', 'error'); return; }
    if (!plo) { showToast('กรุณาเลือก PLO ที่ CLO นี้ผูกอยู่', 'error'); return; }
    if (!pass) { showToast('กรุณากรอกเกณฑ์ผ่าน', 'error'); return; }

    var targets = wholeYear
      ? subjectsOf(st.eYear, st.eSem, st.eLevel)
      : subjectsOf(st.eYear, st.eSem, st.eLevel).filter(function (x) { return s(x.subject_code) === s(st.eSubject); });
    if (!targets.length) { showToast('ไม่พบรายวิชาปลายทาง', 'error'); return; }

    var batch = cohortPrefix(st.eYear, st.eLevel);
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var made = 0, skipped = 0, failed = 0, lastErr = '', noSec = 0;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      // วิชาปลายทางไม่มีส่วนที่เลือก (เช่น เป็นวิชาทฤษฎีล้วน) → เพิ่มเป็น CLO ไม่แยกส่วน
      var tSec = sectionsOf(t).indexOf(sec) >= 0 ? sec : '';
      if (sec && !tSec) noSec++;
      var dup = closOf(st.eYear, st.eSem, t.subject_code).some(function (c) { return sameClo(c, code, tSec); });
      if (dup) { skipped++; continue; }
      var r = await GSheetDB.create({
        type: 'plo_clo', curriculum_year: st.curriculum,
        academic_year: st.eYear, semester: st.eSem, year_level: st.eLevel, batch: batch,
        subject_code: t.subject_code, subject_name: t.subject_name,
        clo_code: code, section: tSec, statement_th: text, plo_code: plo,
        max_score: max, pass_score: pass,
        sort_order: closOf(st.eYear, st.eSem, t.subject_code).length + 1,
        created_by: who, updated_by: who
      }, { noRefresh: i < targets.length - 1 });
      if (r && r.isOk) made++; else { failed++; lastErr = (r && r.error) || 'ไม่ทราบสาเหตุ'; }
    }
    // แจ้งให้ชัดว่าทำไมไม่เพิ่ม — เดิมบอกแค่ "เพิ่มแล้ว 0 รายวิชา" ผู้ใช้จึงไม่รู้ว่าบันทึกไม่สำเร็จ
    if (failed) {
      showToast('เพิ่ม ' + refOf(code, sec) + ' ไม่สำเร็จ ' + failed + ' รายวิชา: ' + lastErr
        + (/duplicate|unique|23505/i.test(lastErr) ? ' — ฐานข้อมูลยังห้ามรหัส CLO ซ้ำในรายวิชาเดียวกัน ต้องรัน 97_plo_clo_section_unique.sql' : ''), 'error');
    } else if (!made && skipped) {
      showToast(refOf(code, sec) + ' มีอยู่แล้วในรายวิชานี้ — ไม่ได้เพิ่มซ้ำ', 'error');
    } else {
      showToast('เพิ่ม CLO แล้ว ' + made + ' รายวิชา' + (skipped ? ' · ข้าม ' + skipped + ' วิชาที่มีอยู่แล้ว' : '')
        + (noSec ? ' · ' + noSec + ' วิชาไม่มีส่วน' + sec + ' จึงเพิ่มเป็น CLO ไม่แยกส่วน' : ''));
    }
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  /* แก้ไข CLO ที่บันทึกไว้แล้ว
     เดิมมีแต่ปุ่มลบ ถ้าพิมพ์ผิดหรือจะปรับเกณฑ์ผ่าน ต้องลบแล้วเพิ่มใหม่
     ซึ่งทำให้คะแนนนักศึกษาที่กรอกไว้ใน CLO ข้อนั้นหายไปด้วย
     การแก้ไขนี้ไม่แตะตารางคะแนน คะแนนเดิมยังอยู่ครบ */
  window.ploEditClo = function (id) {
    { var _rg = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0]; if (_rg && !canEditClo(_rg)) { showToast(lockMsg(_rg), 'error'); return; } }
    var rec = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0];
    if (!rec) { showToast('ไม่พบ CLO ที่จะแก้ไข', 'error'); return; }

    var opts = ploOptions();
    var sel = '<select id="cloEPlo" class="w-full border rounded-lg px-2 py-1.5 text-sm">'
      + '<option value="">— เลือก PLO —</option>'
      + opts.map(function (p) {
          var t = ploLabel(p);
          return '<option value="' + esc(p.plo_code) + '" title="' + esc(s(p.plo_code) + ' ' + s(p.statement_th)) + '"'
            + (s(rec.plo_code) === s(p.plo_code) ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('') + '</select>';

    var html = '<div class="space-y-3">'
      + '<p class="text-xs text-gray-500">รายวิชา ' + esc(rec.subject_code) + ' ' + esc(rec.subject_name)
      + ' · ปีการศึกษา ' + esc(rec.academic_year) + ' ภาคการศึกษาที่ ' + esc(rec.semester) + '</p>'
      + (function () {
          var subjR = subjectsOf(rec.academic_year, rec.semester, rec.year_level).filter(function (x) { return s(x.subject_code) === s(rec.subject_code); })[0];
          var ss = sectionsOf(subjR);
          if (secOf(rec) && ss.indexOf(secOf(rec)) < 0) ss = ss.concat([secOf(rec)]);
          if (!ss.length) return '';
          return '<div><label class="block text-[11px] text-gray-500 mb-1">ส่วน</label>'
            + '<select id="cloESec" class="w-full border rounded-lg px-2 py-1.5 text-sm">'
            + '<option value=""' + (secOf(rec) ? '' : ' selected') + '>ไม่แยกส่วน</option>'
            + ss.map(function (x) { return '<option value="' + esc(x) + '"' + (secOf(rec) === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('')
            + '</select></div>';
        })()
      + '<div><label class="block text-[11px] text-gray-500 mb-1">รหัส CLO</label>'
      + '<input id="cloECode" value="' + esc(rec.clo_code) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">คำอธิบาย</label>'
      + '<textarea id="cloEText" rows="3" class="w-full border rounded-lg px-2 py-1.5 text-sm">' + esc(rec.statement_th) + '</textarea></div>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">ผูกกับ PLO</label>' + sel + '</div>'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">คะแนนเต็ม</label>'
      + '<input id="cloEMax" type="hidden" value="100"><div class="w-full border border-gray-100 bg-gray-50 rounded-lg px-2 py-1.5 text-sm text-gray-500">100% <span class="text-[11px]">(คะแนนคิดเป็นร้อยละ)</span>'
      + (s(rec.max_score) && n(rec.max_score) !== 100 ? '<span class="block text-[11px] text-amber-700">เดิมตั้งไว้ ' + esc(rec.max_score) + ' — บันทึกแล้วจะเปลี่ยนเป็น 100%</span>' : '') + '</div></div>'
      + '<div><label class="block text-[11px] text-gray-500 mb-1">เกณฑ์ผ่าน (%)</label>'
      + '<input id="cloEPass" type="number" min="0" max="100" step="0.01" value="' + esc(rec.pass_score) + '" class="w-full border rounded-lg px-2 py-1.5 text-sm"></div>'
      + '</div>'
      + '<p class="text-[11px] text-gray-400">คะแนนนักศึกษาที่กรอกไว้จะไม่ถูกลบ '
      + 'ถ้าแก้คะแนนเต็มหรือเกณฑ์ผ่าน ผลการบรรลุจะคำนวณใหม่จากคะแนนเดิม</p>'
      + '</div>';

    // คืน Promise ออกไปด้วย เพื่อให้ผู้เรียกรอจนบันทึกเสร็จจริงได้
    showModal('แก้ไข ' + esc(cloRef(rec)), html, function () { return window.ploSaveClo(id); }, 'max-w-xl');
  };

  window.ploSaveClo = async function (id) {
    { var _rg = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0]; if (_rg && !canEditClo(_rg)) { showToast(lockMsg(_rg), 'error'); return; } }
    var rec = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0];
    if (!rec) return;
    var v = function (el) { return s(((typeof document !== 'undefined' && document.getElementById(el)) || {}).value); };
    var code = v('cloECode'), text = v('cloEText'), plo = v('cloEPlo'),
        max = '100', pass = v('cloEPass');   // คะแนนเต็มเป็นร้อยละเสมอ
    var secEl = (typeof document !== 'undefined') && document.getElementById('cloESec');
    var sec = secEl ? normSec(secEl.value) : secOf(rec);
    if (pass !== '' && (!isFinite(Number(pass)) || Number(pass) < 0 || Number(pass) > 100)) { showToast('เกณฑ์ผ่านต้องอยู่ระหว่าง 0–100 (%)', 'error'); return; }
    if (!code) { showToast('กรุณากรอกรหัส CLO', 'error'); return; }
    if (!plo) { showToast('กรุณาเลือก PLO ที่ CLO นี้ผูกอยู่', 'error'); return; }
    if (!pass) { showToast('กรุณากรอกเกณฑ์ผ่าน', 'error'); return; }

    // กันรหัสซ้ำกับ CLO ข้ออื่นในรายวิชาเดียวกัน
    var dup = closOf(rec.academic_year, rec.semester, rec.subject_code).some(function (c) {
      return String(c.__backendId) !== String(id) && sameClo(c, code, sec);
    });
    if (dup) { showToast(refOf(code, sec) + ' มีอยู่แล้วในรายวิชานี้', 'error'); return; }

    var r = await GSheetDB.update(Object.assign(noScores(rec), {
      clo_code: code, section: sec, statement_th: text, plo_code: plo,
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
    { var _rg = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0]; if (_rg && !canEditClo(_rg)) { showToast(lockMsg(_rg), 'error'); return; } }
    var rec = APP.allData.find(function (d) { return String(d.__backendId) === String(id); });
    if (!rec) return;
    if (!confirm('ลบ ' + s(rec.clo_code) + ' ของรายวิชานี้?\n\nคะแนนนักศึกษาที่บันทึกไว้ใน CLO นี้จะถูกลบไปด้วย')) return;
    var r = await GSheetDB.delete(rec);
    if (r && r.isOk) { showToast('ลบแล้ว'); state().scores = null; renderCurrentPage(); }
    else showToast('ลบไม่สำเร็จ: ' + ((r && r.error) || ''), 'error');
  };

  /* ---------- ตารางกรอกคะแนนรายคน ---------- */
  /* ตารางกรอกคะแนนรายคน
     CLO มาก ตารางจะกว้างจนต้องเลื่อนซ้ายขวา จึงมี 2 มุมมอง
       • ทีละ CLO (ค่าเริ่มต้นเมื่อมีมากกว่า 6 CLO) : เลือก CLO จากแถบด้านบน กรอกลงคอลัมน์เดียว เห็นผลผ่าน/ไม่ผ่านทันที
       • ทุก CLO : ตารางเต็ม หัวตารางและคอลัมน์ชื่อตรึงไว้ เลื่อนแล้วยังรู้ว่าเป็นช่องของใคร CLO ไหน
     ทั้งสองมุมมองใช้คะแนนชุดเดียวกัน สลับไปมาได้โดยคะแนนที่ยังไม่บันทึกไม่หาย
     กด Enter / ลูกศรขึ้นลง เพื่อเลื่อนไปช่องของนักศึกษาคนถัดไป */
  function scoreFilled(r, studs) {
    var st = state(), c = 0;
    studs.forEach(function (u) { var v = st.scores[r.__backendId + '|' + u.student_id]; if (v != null && s(v) !== '') c++; });
    return c;
  }
  function scoreInput(r, u, wide) {
    var st = state();
    var v = st.scores[r.__backendId + '|' + u.student_id];
    var has = v != null && s(v) !== '';
    var cls = !has ? '' : (n(v) >= n(r.pass_score) ? 'bg-emerald-50' : 'bg-red-50');
    return '<input type="number" step="0.01" min="0" max="' + esc(s(r.max_score) || '100') + '" title="คะแนนร้อยละ (0–' + esc(s(r.max_score) || '100') + ')"'
      + ' value="' + esc(has ? v : '') + '" data-clo="' + esc(r.__backendId) + '" data-stu="' + esc(u.student_id) + '"'
      + ' oninput="ploScoreInput(this)" onkeydown="ploScoreKey(event,this)" data-nodraft="1"' + (canEditClo(r) ? '' : ' disabled title="' + esc(lockMsg(r)) + '"')
      + ' class="' + (wide ? 'w-28' : 'w-16') + ' border rounded-lg px-2 py-1 text-sm text-center tabular-nums ' + cls + '">';
  }
  function resultBadge(r, v) {
    if (v == null || s(v) === '') return '<span class="text-[11px] text-gray-300">ยังไม่กรอก</span>';
    return n(v) >= n(r.pass_score)
      ? '<span class="px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-700">ผ่าน</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[11px] bg-red-50 text-red-600">ไม่ผ่าน</span>';
  }
  /* ---------- ตารางกรอกคะแนนแบบมีองค์ประกอบ (โหมดทีละ CLO) ---------- */
  function compGrid(cur, studs, hide) {
    var st = state();
    var list = comps(cur), W = compWeight(list);
    if (!st.detail) st.detail = {};
    var head1 = '<th rowspan="2" class="px-2 py-2 text-center w-10 bg-surface">#</th>'
      + '<th rowspan="2" class="px-2 py-2 bg-surface sticky left-0 z-30 min-w-[13rem] text-left">นักศึกษา</th>'
      + list.map(function (c) {
          var span = c.retake ? 4 : 3;
          return '<th colspan="' + span + '" class="px-2 py-1.5 text-center border-l border-gray-200 bg-blue-50/60">'
            + esc(c.name) + '<div class="text-[10px] font-normal text-gray-500">เต็ม ' + esc(c.full) + ' · คิด ' + esc(c.weight) + '%'
            + (s(c.pass) !== '' ? ' · ผ่าน ' + esc(c.pass) : '') + '</div></th>';
        }).join('')
      + '<th rowspan="2" class="px-2 py-2 text-center border-l border-gray-300 bg-gray-100 whitespace-nowrap">รวม CLO<div class="text-[10px] font-normal text-gray-500">(' + f2(W) + '%)</div></th>'
      + '<th rowspan="2" class="px-2 py-2 text-center bg-gray-100 whitespace-nowrap">ร้อยละ<div class="text-[10px] font-normal text-gray-500">ผ่าน ' + esc(cur.pass_score) + '%</div></th>'
      + '<th rowspan="2" class="px-2 py-2 text-center bg-gray-100">ผล</th>';
    var head2 = list.map(function (c) {
      return '<th class="px-1 py-1 text-[11px] font-normal text-gray-600 border-l border-gray-200 bg-surface">คะแนน</th>'
        + (c.retake ? '<th class="px-1 py-1 text-[11px] font-normal text-amber-700 bg-surface">สอบซ่อม</th>' : '')
        + '<th class="px-1 py-1 text-[11px] font-normal text-gray-600 bg-surface">ที่ได้</th>'
        + '<th class="px-1 py-1 text-[11px] font-normal text-primary bg-blue-50/60">คิด ' + esc(c.weight) + '%</th>';
    }).join('');
    var inp = function (key, c, part, v) {
      return '<input type="number" step="0.01" min="0" max="' + esc(c.full) + '" value="' + esc(v == null ? '' : v) + '"'
        + ' data-ckey="' + esc(key) + '" data-comp="' + esc(c.id) + '" data-part="' + part + '" data-clo="' + esc(cur.__backendId) + '-' + esc(c.id) + part + '"'
        + ' oninput="ploCompInput(this)" onkeydown="ploScoreKey(event,this)" data-nodraft="1"' + (canEditClo(cur) ? '' : ' disabled title="' + esc(lockMsg(cur)) + '"')
        + ' class="w-16 border rounded-lg px-1.5 py-1 text-sm text-center tabular-nums' + (part === 'r' ? ' border-amber-200' : '') + '">';
    };
    var body = studs.map(function (u, i) {
      var key = cur.__backendId + '|' + u.student_id;
      var det = st.detail[key] || {};
      var calc = compCalc(cur, det);
      return '<tr class="border-t border-gray-50" data-q="' + esc((u.student_id + ' ' + u.name).toLowerCase()) + '"' + hide(u) + '>'
        + '<td class="px-2 py-1 text-center text-xs text-gray-400">' + (i + 1) + '</td>'
        + '<td class="px-2 py-1 sticky left-0 bg-white z-10 whitespace-nowrap"><span class="font-mono text-xs text-gray-400">' + esc(u.student_id) + '</span> ' + esc(u.name) + '</td>'
        + list.map(function (c, j) {
            var d = det[c.id] || {};
            return '<td class="px-1 py-1 text-center border-l border-gray-100">' + inp(key, c, 's', d.s) + '</td>'
              + (c.retake ? '<td class="px-1 py-1 text-center">' + inp(key, c, 'r', d.r) + '</td>' : '')
              + '<td class="px-1 py-1 text-center text-xs tabular-nums text-gray-600" data-cu="' + esc(key + '|' + c.id) + '">' + f2(calc.rows[j].used) + '</td>'
              + '<td class="px-1 py-1 text-center text-xs tabular-nums font-semibold text-primary bg-blue-50/40" data-cw="' + esc(key + '|' + c.id) + '">' + f2(calc.rows[j].w) + '</td>';
          }).join('')
        + '<td class="px-2 py-1 text-center tabular-nums font-semibold border-l border-gray-200 bg-gray-50" data-ct="' + esc(key) + '">' + (calc.rows.some(function (x) { return x.w !== null; }) ? f2(calc.total) : '') + '</td>'
        + '<td class="px-2 py-1 text-center tabular-nums bg-gray-50" data-cp="' + esc(key) + '">' + (calc.pct === null ? '' : f2(calc.pct) + '%') + '</td>'
        + '<td class="px-2 py-1 text-center" data-res="' + esc(key) + '">' + compBadge(cur, calc) + '</td></tr>';
    }).join('');
    return '<div class="ems-tablewrap border border-gray-100 rounded-xl" style="overflow:auto;max-height:65vh"><table data-ems-cards="skip" class="text-sm" style="min-width:100%;width:max-content">'
      + '<thead class="sticky top-0 z-20"><tr>' + head1 + '</tr><tr>' + head2 + '</tr></thead><tbody>' + body + '</tbody></table></div>'
      + '<p class="text-[11px] text-gray-500 mt-1">กรอกคะแนนดิบ ระบบคิด "ที่ได้" (รวมกติกาสอบซ่อม) · คิดเป็น % · รวม CLO และร้อยละให้เอง · '
      + 'ผล CLO นับเมื่อกรอกครบทุกการประเมิน · บันทึกระหว่างทางได้</p>'
      + (st._partMissing ? '<p class="text-xs text-red-600 mt-1">โหลดคะแนนรายองค์ประกอบไม่สำเร็จ'
          + ' · <button type="button" onclick="ploLoadScores()" class="underline">ลองโหลดใหม่</button>'
          + (st._partErr ? '<span class="block text-[11px] text-red-400">(' + esc(st._partErr) + ')</span>' : '') + '</p>' : '');
  }
  function compBadge(cur, calc) {
    if (calc.pct === null) {
      return calc.rows.some(function (x) { return x.w !== null; })
        ? '<span class="text-[11px] text-amber-600">กรอกยังไม่ครบ</span>' : '<span class="text-[11px] text-gray-300">ยังไม่กรอก</span>';
    }
    return calc.pct >= n(cur.pass_score)
      ? '<span class="px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-700">ผ่าน</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[11px] bg-red-50 text-red-600">ไม่ผ่าน</span>';
  }
  window.ploCompInput = function (el) {
    var st = state();
    var key = el.getAttribute('data-ckey'), cid = el.getAttribute('data-comp'), part = el.getAttribute('data-part');
    if (!st.detail) st.detail = {};
    var det = st.detail[key] = st.detail[key] || {};
    det[cid] = det[cid] || {};
    det[cid][part] = el.value;
    var clo = closOf(st.eYear, st.eSem, st.eSubject).filter(function (r) { return key.indexOf(r.__backendId + '|') === 0; })[0];
    if (!clo) return;
    var calc = compCalc(clo, det);
    comps(clo).forEach(function (c, j) {
      var u = document.querySelector('[data-cu="' + key + '|' + c.id + '"]'); if (u) u.textContent = f2(calc.rows[j].used);
      var w = document.querySelector('[data-cw="' + key + '|' + c.id + '"]'); if (w) w.textContent = f2(calc.rows[j].w);
    });
    var t = document.querySelector('[data-ct="' + key + '"]'); if (t) t.textContent = calc.rows.some(function (x) { return x.w !== null; }) ? f2(calc.total) : '';
    var p = document.querySelector('[data-cp="' + key + '"]'); if (p) p.textContent = calc.pct === null ? '' : f2(calc.pct) + '%';
    var b = document.querySelector('[data-res="' + key + '"]'); if (b) b.innerHTML = compBadge(clo, calc);
    st.scores[key] = calc.pct === null ? '' : calc.pct;
    if (!st._dirty) st._dirty = {};
    st._dirty[key] = true;
    var m = document.getElementById('ploScoreMsg');
    if (m) { m.textContent = 'มีการแก้ไขที่ยังไม่บันทึก ' + Object.keys(st._dirty).length + ' คน'; m.className = 'text-xs text-amber-600'; }
  };

  /* ---------- หน้าต่างกำหนดองค์ประกอบคะแนนของ CLO ---------- */
  window.ploEditComps = function (id) {
    { var _rg = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0]; if (_rg && !canEditClo(_rg)) { showToast(lockMsg(_rg), 'error'); return; } }
    var rec = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(id); })[0];
    if (!rec) { showToast('ไม่พบ CLO', 'error'); return; }
    var st = state();
    st._compDraft = { id: id, list: comps(rec).map(function (c) { return Object.assign({}, c); }) };
    if (!st._compDraft.list.length) st._compDraft.list = [{ id: 'c1', name: '', full: '', weight: '', pass: '', retake: false, rule: 'cap' }];
    showModal('องค์ประกอบคะแนน ' + esc(cloRef(rec)), '<div id="ploCompBox"></div>', null, 'max-w-4xl');
    compDraw();
  };
  function compDraw() {
    var st = state(), d = st._compDraft; if (!d) return;
    var box = document.getElementById('ploCompBox'); if (!box) return;
    var rec = (APP.allData || []).filter(function (x) { return String(x.__backendId) === String(d.id); })[0] || {};
    var W = d.list.reduce(function (t, c) { return t + n(c.weight); }, 0);
    var cell = function (i, k, v, type, ph, w) {
      return '<input ' + (type ? 'type="' + type + '" step="0.01" min="0" ' : '') + 'value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(ph || '') + '"'
        + ' oninput="ploCompSet(' + i + ',\'' + k + '\',this.value)" data-nodraft="1" class="' + (w || 'w-20') + ' border rounded-lg px-2 py-1.5 text-sm">';
    };
    box.innerHTML = '<p class="text-xs text-gray-600 mb-3">ระบุการประเมินที่รวมเป็นคะแนนของ CLO นี้ เช่น สอบกลางภาค เต็ม 40 คิด 20% · '
      + 'อาจารย์จะกรอกคะแนนดิบ ระบบคิดเป็น % และรวมให้ · ผล CLO เทียบกับเกณฑ์ผ่าน <b>' + esc(rec.pass_score || '-') + '%</b> ของน้ำหนักรวม '
      + '(แก้เกณฑ์ผ่านของ CLO ได้ที่ปุ่มดินสอ)</p>'
      + '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-surface text-left text-xs">'
      + '<th class="px-2 py-2">#</th><th class="px-2 py-2">ชื่อการประเมิน</th><th class="px-2 py-2">คะแนนเต็ม</th><th class="px-2 py-2">คิดเป็น %</th>'
      + '<th class="px-2 py-2">มีสอบซ่อม</th><th class="px-2 py-2">เกณฑ์ผ่าน (คะแนน)</th><th class="px-2 py-2">สอบซ่อมผ่าน ให้คะแนน</th><th></th></tr></thead><tbody>'
      + d.list.map(function (c, i) {
          return '<tr class="border-t border-gray-50">'
            + '<td class="px-2 py-1.5 text-gray-400">' + (i + 1) + '</td>'
            + '<td class="px-2 py-1.5">' + cell(i, 'name', c.name, '', 'เช่น สอบกลางภาค', 'w-44') + '</td>'
            + '<td class="px-2 py-1.5">' + cell(i, 'full', c.full, 'number', '40') + '</td>'
            + '<td class="px-2 py-1.5">' + cell(i, 'weight', c.weight, 'number', '20') + '</td>'
            + '<td class="px-2 py-1.5 text-center"><input type="checkbox" ' + (c.retake ? 'checked ' : '') + 'onchange="ploCompSet(' + i + ',\'retake\',this.checked,true)" class="w-4 h-4"></td>'
            + '<td class="px-2 py-1.5">' + cell(i, 'pass', c.pass, 'number', defPass(c.full) !== '' ? defPass(c.full) + ' (อัตโนมัติ)' : (c.retake ? 'เช่น 24' : 'ไม่บังคับ'), 'w-28') + '</td>'
            + '<td class="px-2 py-1.5">' + (c.retake
                ? '<select onchange="ploCompSet(' + i + ',\'rule\',this.value)" class="border rounded-lg px-2 py-1.5 text-xs">'
                  + '<option value="cap"' + (c.rule !== 'actual' ? ' selected' : '') + '>เท่าเกณฑ์ผ่าน</option>'
                  + '<option value="actual"' + (c.rule === 'actual' ? ' selected' : '') + '>ตามคะแนนที่สอบได้</option></select>'
                : '<span class="text-xs text-gray-300">—</span>') + '</td>'
            + '<td class="px-2 py-1.5 text-right"><button type="button" onclick="ploCompDel(' + i + ')" class="text-gray-300 hover:text-red-500" title="ลบรายการนี้"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>';
        }).join('')
      + '</tbody><tfoot><tr class="border-t bg-gray-50"><td></td><td class="px-2 py-2 text-sm font-semibold">รวม CLO</td><td></td>'
      + '<td class="px-2 py-2 text-sm font-semibold" id="ploCompW">' + f2(W) + '%</td><td colspan="4"></td></tr></tfoot></table></div>'
      + '<div class="flex flex-wrap items-center justify-between gap-2 mt-3">'
      + '<button type="button" onclick="ploCompAdd()" class="px-3 py-1.5 border border-primary text-primary rounded-lg text-sm"><i data-lucide="plus" class="w-4 h-4 inline"></i> เพิ่มการประเมิน</button>'
      + '<div class="flex gap-2">'
      + (comps(rec).length ? '<button type="button" onclick="ploCompClear()" class="px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-sm">ไม่ใช้องค์ประกอบ (กรอกร้อยละตรง)</button>' : '')
      + '<button type="button" onclick="ploCompSave()" class="px-4 py-1.5 bg-primary text-white rounded-lg text-sm"><i data-lucide="save" class="w-4 h-4 inline"></i> บันทึก</button></div></div>'
      + '<p class="text-[11px] text-gray-500 mt-2">สอบซ่อม: "เท่าเกณฑ์ผ่าน" = สอบซ่อมผ่านได้คะแนนเท่าเกณฑ์ (เช่น 24) · "ตามคะแนนที่สอบได้" = ใช้คะแนนสอบซ่อมจริง · สอบซ่อมไม่ผ่านใช้คะแนนที่มากกว่าเสมอ</p>';
    if (window.lucide) lucide.createIcons();
  }
  window.ploCompSet = function (i, k, v, redraw) {
    var d = state()._compDraft; if (!d || !d.list[i]) return;
    d.list[i][k] = v;
    if (redraw) { compDraw(); return; }
    if (k === 'full') {
      var pi = document.querySelectorAll('#ploCompBox input[oninput*="\'pass\'"]')[i];
      if (pi) pi.placeholder = defPass(v) !== '' ? defPass(v) + ' (อัตโนมัติ)' : (d.list[i].retake ? 'เช่น 24' : 'ไม่บังคับ');
    }
    if (k === 'weight') { var w = document.getElementById('ploCompW'); if (w) w.textContent = f2(d.list.reduce(function (t, c) { return t + n(c.weight); }, 0)) + '%'; }
  };
  window.ploCompAdd = function () {
    var d = state()._compDraft; if (!d) return;
    var ids = d.list.map(function (c) { return Number(String(c.id).replace(/\D/g, '')) || 0; });
    d.list.push({ id: 'c' + (Math.max.apply(null, ids.concat([0])) + 1), name: '', full: '', weight: '', pass: '', retake: false, rule: 'cap' });
    compDraw();
  };
  window.ploCompDel = function (i) { var d = state()._compDraft; if (!d) return; d.list.splice(i, 1); compDraw(); };
  async function compStore(id, list) {
    var rec = (APP.allData || []).filter(function (x) { return String(x.__backendId) === String(id); })[0];
    if (!rec) return false;
    var r = await GSheetDB.update(Object.assign(noScores(rec), { components: list.length ? JSON.stringify(list) : '',
      updated_by: (APP.currentUser && APP.currentUser.name) || '' }));
    if (!r || !r.isOk) { showToast('บันทึกไม่สำเร็จ: ' + ((r && r.error) || ''), 'error'); return false; }
    return true;
  }
  window.ploCompSave = async function () {
    var d = state()._compDraft; if (!d) return;
    { var _rg = (APP.allData || []).filter(function (x) { return String(x.__backendId) === String(d.id); })[0]; if (_rg && !canEditClo(_rg)) { showToast(lockMsg(_rg), 'error'); return; } }
    var list = d.list.filter(function (c) { return s(c.name) || s(c.full) || s(c.weight); });
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!s(c.name)) { showToast('รายการที่ ' + (i + 1) + ' ยังไม่มีชื่อการประเมิน', 'error'); return; }
      if (!(n(c.full) > 0)) { showToast(c.name + ': คะแนนเต็มต้องมากกว่า 0', 'error'); return; }
      if (!(n(c.weight) > 0)) { showToast(c.name + ': ต้องระบุว่าคิดเป็นกี่ %', 'error'); return; }
      if (s(c.pass) === '') c.pass = defPass(c.full);   // เว้นว่าง = ใช้เกณฑ์ผ่านเริ่มต้นของรายวิชา
      if (c.retake && s(c.pass) === '') { showToast(c.name + ': มีสอบซ่อมต้องระบุเกณฑ์ผ่าน (หรือตั้งเกณฑ์ผ่านเริ่มต้นที่ "ตั้งค่ารายวิชา")', 'error'); return; }
      if (s(c.pass) !== '' && n(c.pass) > n(c.full)) { showToast(c.name + ': เกณฑ์ผ่านมากกว่าคะแนนเต็ม', 'error'); return; }
      list[i] = { id: c.id, name: s(c.name), full: s(c.full), weight: s(c.weight), pass: s(c.pass), retake: !!c.retake, rule: c.rule === 'actual' ? 'actual' : 'cap' };
    }
    if (!list.length) { showToast('ยังไม่มีการประเมิน', 'error'); return; }
    if (await compStore(d.id, list)) {
      closeModal(); state()._compDraft = null; state().scores = null;   // ให้โหลดคะแนนใหม่ตามโครงใหม่
      showToast('บันทึกองค์ประกอบคะแนนแล้ว — รวม CLO ' + f2(compWeight(list)) + '%');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    }
  };
  window.ploCompClear = async function () {
    var d = state()._compDraft; if (!d) return;
    if (!confirm('ยกเลิกองค์ประกอบคะแนนของ CLO นี้?\nคะแนนร้อยละรวมที่บันทึกไว้แล้วยังอยู่ แต่จะกรอกเป็นร้อยละตรง ๆ แทน')) return;
    if (await compStore(d.id, [])) {
      closeModal(); state()._compDraft = null; state().scores = null;
      showToast('เปลี่ยนเป็นกรอกร้อยละตรงแล้ว');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    }
  };

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

    // CLO ที่มีหลายการประเมินกรอกได้ในโหมดทีละ CLO — เปิดโหมดนั้นให้ก่อน
    var mode = st.gridMode || ((rows.length > 6 || rows.some(function (r) { return comps(r).length; })) ? 'one' : 'all');
    var cur = rows.filter(function (r) { return String(r.__backendId) === String(st.gridClo); })[0] || rows[0];
    var curIdx = rows.indexOf(cur);
    var dirtyN = st._dirty ? Object.keys(st._dirty).length : 0;

    var tbtn = function (m, icon, label) {
      var on = mode === m;
      return '<button type="button" data-no-loading onclick="ploSet(\'gridMode\',\'' + m + '\')" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm '
        + (on ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50') + '">'
        + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' + label + '</button>';
    };
    var toolbar = '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">'
      + '<div class="inline-flex rounded-xl border border-gray-200 overflow-hidden">'
      + tbtn('one', 'list', 'ทีละ CLO') + tbtn('all', 'table', 'ทุก CLO (' + rows.length + ')') + '</div>'
      + '<input type="search" data-nodraft="1" oninput="ploGridFilter(this.value)" value="' + esc(st.gridQ || '') + '" placeholder="ค้นหารหัสหรือชื่อนักศึกษา" '
      + 'class="flex-1 min-w-[12rem] max-w-xs border border-gray-200 rounded-xl px-3 py-1.5 text-sm"></div>';
    var qk = s(st.gridQ).toLowerCase();
    var hide = function (u) { return qk && (u.student_id + ' ' + u.name).toLowerCase().indexOf(qk) < 0 ? ' style="display:none"' : ''; };

    var table;
    if (mode === 'one') {
      var chips = '<div class="flex gap-2 overflow-x-auto pb-2 mb-3" style="scrollbar-width:thin">'
        + rows.map(function (r) {
            var on = r === cur, f = scoreFilled(r, studs);
            return '<button type="button" data-no-loading onclick="ploSet(\'gridClo\',\'' + esc(r.__backendId) + '\')" title="' + esc(r.statement_th) + '" '
              + 'class="flex-shrink-0 text-left rounded-xl border px-3 py-1.5 transition '
              + (on ? 'border-primary bg-blue-50' : 'border-gray-100 bg-white hover:bg-surface') + '">'
              + '<span class="block text-sm font-semibold whitespace-nowrap ' + (on ? 'text-primary' : 'text-gray-700') + '">' + esc(r.clo_code) + secBadge(r) + '</span>'
              + '<span class="block text-[10px] ' + (f === studs.length ? 'text-emerald-600' : 'text-gray-400') + '">'
              + '<span id="ploChip_' + esc(r.__backendId) + '">' + f + '</span>/' + studs.length + ' คน</span></button>';
          }).join('') + '</div>';
      var prev = curIdx > 0 ? rows[curIdx - 1] : null, next = curIdx < rows.length - 1 ? rows[curIdx + 1] : null;
      var nav = function (r, label) {
        return '<button type="button" data-no-loading ' + (r ? 'onclick="ploSet(\'gridClo\',\'' + esc(r.__backendId) + '\')"' : 'disabled')
          + ' class="px-3 py-1.5 rounded-lg border bg-white text-sm ' + (r ? 'hover:bg-gray-50' : 'opacity-40') + '">' + label + '</button>';
      };
      var info = '<div class="flex flex-wrap items-start justify-between gap-3 bg-surface/60 border border-blue-50 rounded-xl px-4 py-3 mb-3">'
        + '<div class="min-w-0"><p class="text-sm font-semibold text-gray-800">' + esc(cur.clo_code) + secBadge(cur)
        + ' <span class="ml-1 px-2 py-0.5 rounded-lg bg-blue-50 text-primary text-xs font-normal">' + esc(cur.plo_code || '—') + '</span></p>'
        + '<p class="text-xs text-gray-600 mt-0.5">' + esc(cur.statement_th || '') + '</p>'
        + '<p class="text-[11px] text-gray-400 mt-0.5">' + (comps(cur).length
            ? comps(cur).map(function (c) { return esc(c.name) + ' ' + esc(c.weight) + '%'; }).join(' + ') + ' = ' + f2(compWeight(comps(cur))) + '% · ผ่านเมื่อได้ ≥ ' + esc(cur.pass_score) + '% ของน้ำหนักรวม'
            : 'กรอกเป็นร้อยละ (เต็ม ' + esc(s(cur.max_score) || '100') + '%) · เกณฑ์ผ่าน ' + esc(cur.pass_score) + '%')
        + ' · <button type="button" onclick="ploEditComps(\'' + esc(cur.__backendId) + '\')" class="text-primary hover:underline">'
        + (comps(cur).length ? 'แก้องค์ประกอบคะแนน' : 'แบ่งเป็นหลายการประเมิน (กลางภาค/ปลายภาค/งาน)') + '</button></p></div>'
        + '<div class="flex gap-2 flex-shrink-0">' + nav(prev, '‹ CLO ก่อนหน้า') + nav(next, 'CLO ถัดไป ›') + '</div></div>';
      if (comps(cur).length) { table = chips + info + compGrid(cur, studs, hide); } else
      table = chips + info
        + '<div class="ems-tablewrap border border-gray-100 rounded-xl" style="overflow:auto;max-height:65vh"><table data-ems-cards="skip" class="w-full text-sm" style="min-width:100%;width:max-content">'
        + '<thead class="sticky top-0 z-20"><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold text-center w-12 bg-surface">#</th><th class="px-3 py-2 font-semibold bg-surface">รหัสนักศึกษา</th>'
        + '<th class="px-3 py-2 font-semibold bg-surface">ชื่อ-สกุล</th><th class="px-3 py-2 font-semibold text-center bg-surface">คะแนน</th>'
        + '<th class="px-3 py-2 font-semibold text-center bg-surface">ผล</th></tr></thead><tbody>'
        + studs.map(function (u, i) {
            var v = st.scores[cur.__backendId + '|' + u.student_id];
            return '<tr class="border-t border-gray-50" data-q="' + esc((u.student_id + ' ' + u.name).toLowerCase()) + '"' + hide(u) + '>'
              + '<td class="px-3 py-1.5 text-center text-xs text-gray-400">' + (i + 1) + '</td>'
              + '<td class="px-3 py-1.5 font-mono text-xs text-gray-500">' + esc(u.student_id) + '</td>'
              + '<td class="px-3 py-1.5">' + esc(u.name) + '</td>'
              + '<td class="px-3 py-1 text-center">' + scoreInput(cur, u, true) + '</td>'
              + '<td class="px-3 py-1.5 text-center" data-res="' + esc(cur.__backendId + '|' + u.student_id) + '">' + resultBadge(cur, v) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
    } else {
      table = '<div class="ems-tablewrap border border-gray-100 rounded-xl" style="overflow:auto;max-height:70vh"><table data-ems-cards="skip" class="text-sm" style="min-width:100%;width:max-content">'
        + '<thead class="sticky top-0 z-20"><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold sticky left-0 bg-surface z-30 min-w-[14rem]">นักศึกษา</th>'
        + rows.map(function (r) {
            return '<th class="px-1 py-2 font-semibold text-center whitespace-nowrap bg-surface" title="' + esc(cloRef(r) + ' · ' + (r.plo_code || '') + ' — ' + (r.statement_th || '')) + '">'
              + esc(r.clo_code) + secBadge(r) + '<div class="text-[10px] font-normal text-gray-400">' + esc(r.plo_code || '') + ' · ผ่าน ' + esc(r.pass_score) + '%</div></th>';
          }).join('')
        + '<th class="px-2 py-2 font-semibold text-center whitespace-nowrap bg-surface">ผ่าน</th></tr></thead><tbody>'
        + studs.map(function (u) {
            var ok = 0;
            rows.forEach(function (r) { var v = st.scores[r.__backendId + '|' + u.student_id]; if (v != null && s(v) !== '' && n(v) >= n(r.pass_score)) ok++; });
            return '<tr class="border-t border-gray-50" data-q="' + esc((u.student_id + ' ' + u.name).toLowerCase()) + '"' + hide(u) + '>'
              + '<td class="px-3 py-1.5 sticky left-0 bg-white z-10 whitespace-nowrap">'
              + '<span class="font-mono text-xs text-gray-400">' + esc(u.student_id) + '</span> ' + esc(u.name) + '</td>'
              + rows.map(function (r) {
                  if (comps(r).length) {
                    var cv = st.scores[r.__backendId + '|' + u.student_id];
                    return '<td class="px-1 py-1 text-center text-xs tabular-nums ' + (s(cv) === '' ? 'text-gray-300' : (n(cv) >= n(r.pass_score) ? 'text-emerald-700' : 'text-red-600'))
                      + '" title="CLO นี้มีหลายการประเมิน — กรอกในโหมด ทีละ CLO">' + (s(cv) === '' ? '—' : f2(n(cv)) + '%') + '</td>';
                  }
                  return '<td class="px-1 py-1 text-center">' + scoreInput(r, u, false) + '</td>';
                }).join('')
              + '<td class="px-2 py-1.5 text-center text-xs tabular-nums whitespace-nowrap text-gray-600">' + ok + '/' + rows.length + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        + '<p class="text-[11px] text-gray-400 mt-1">ชี้ที่หัวคอลัมน์เพื่อดูคำอธิบาย CLO · หัวตารางและชื่อนักศึกษาตรึงไว้ขณะเลื่อน</p>';
    }

    return section('กรอกคะแนนรายคน <span class="text-xs font-normal text-gray-400">(ช่องเขียวคือผ่านเกณฑ์ · แดงคือไม่ผ่าน · Enter ไปคนถัดไป)</span>',
      toolbar + table
      + '<div class="flex items-center gap-3 mt-3">'
      + '<button onclick="ploSaveScores()" class="px-4 py-2 bg-primary text-white rounded-xl text-sm flex items-center gap-2">'
      + '<i data-lucide="save" class="w-4 h-4"></i>บันทึกคะแนน</button>'
      + '<span id="ploScoreMsg" class="text-xs ' + (dirtyN ? 'text-amber-600' : 'text-gray-400') + '">'
      + (dirtyN ? 'มีการแก้ไขที่ยังไม่บันทึก ' + dirtyN + ' ช่อง' : 'แก้ไขได้ทุก CLO แล้วกดบันทึกครั้งเดียว')
      + '</span></div>');
  }

  window.ploGridFilter = function (q) {
    var st = state(); st.gridQ = q;
    var k = s(q).toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-q]'), function (tr) {
      tr.style.display = !k || tr.getAttribute('data-q').indexOf(k) >= 0 ? '' : 'none';
    });
  };
  // Enter / ลูกศรลง = ช่องของนักศึกษาคนถัดไปใน CLO เดียวกัน · ลูกศรขึ้น = คนก่อนหน้า
  window.ploScoreKey = function (e, el) {
    var down = e.key === 'Enter' || e.key === 'ArrowDown', up = e.key === 'ArrowUp';
    if (!down && !up) return;
    e.preventDefault();
    var clo = el.getAttribute('data-clo');
    var list = Array.prototype.filter.call(document.querySelectorAll('input[data-clo="' + clo + '"]'), function (x) {
      var tr = x.closest('tr'); return !tr || tr.style.display !== 'none';
    });
    var i = list.indexOf(el), nx = list[i + (down ? 1 : -1)];
    if (nx) { nx.focus(); if (nx.select) nx.select(); }
  };

  window.ploLoadScores = async function () {
    var st = state();
    var rows = closOf(st.eYear, st.eSem, st.eSubject);
    var ids = rows.map(function (r) { return cloNum(r); }).filter(Boolean);
    st.scores = {};
    if (ids.length) {
      try {
        var r = await sb().rpc('ems_plo_scores', { clo_ids: ids });
        if (r.error) { showToast('โหลดคะแนนไม่สำเร็จ: ' + r.error.message, 'error'); return; }
        // ฐานข้อมูลคืน clo_id เป็นตัวเลข — แปลงกลับเป็นกุญแจเดียวกับที่ตารางกรอกคะแนนใช้
        (r.data || []).forEach(function (x) { st.scores[cloKey(x.clo_id) + '|' + x.student_id] = x.score; });
      } catch (e) { showToast('โหลดคะแนนไม่สำเร็จ: ' + e, 'error'); return; }
      // คะแนนดิบรายองค์ประกอบ — เฉพาะ CLO ที่กำหนดองค์ประกอบไว้
      st.detail = {}; st._partMissing = false;
      var cIds = rows.filter(function (r) { return comps(r).length; }).map(cloNum).filter(Boolean);
      if (cIds.length) {
        // อ่านสดจากฐานข้อมูล (ไม่ใช้สำเนาในเบราว์เซอร์ ซึ่งอาจเก่ากว่าที่อาจารย์ท่านอื่นเพิ่งบันทึก)
        var pr = await sb().from('plo_clo').select('id,extra').in('id', cIds);
        if (pr.error) { st._partMissing = true; st._partErr = pr.error.message; console.warn('plo_clo extra:', pr.error.message); }
        (pr.data || []).forEach(function (row) {
          var ex = row.extra || {};
          Object.keys(ex).forEach(function (k) {
            if (k.indexOf('sc:') !== 0) return;
            var d = ex[k]; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
            st.detail[cloKey(row.id) + '|' + k.slice(3)] = d || {};
          });
        });
      }
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
    var res = document.querySelector('[data-res="' + key + '"]');
    if (res && clo) res.innerHTML = resultBadge(clo, el.value);
    var chip = document.getElementById('ploChip_' + el.getAttribute('data-clo'));
    if (chip && clo) chip.textContent = scoreFilled(clo, entryStudents());
    var m = document.getElementById('ploScoreMsg');
    if (m) { m.textContent = 'มีการแก้ไขที่ยังไม่บันทึก ' + Object.keys(st._dirty).length + ' ช่อง'; m.className = 'text-xs text-amber-600'; }
  };

  window.ploSaveScores = async function () {
    var st = state();
    var dirty = Object.keys(st._dirty || {}).filter(function (k) {
      var c = (APP.allData || []).filter(function (d) { return String(d.__backendId) === String(k.split('|')[0]); })[0];
      return !c || canEditClo(c);
    });
    if (!dirty.length) { showToast('ไม่มีการแก้ไข'); return; }
    var who = (APP.currentUser && APP.currentUser.name) || '';
    // คะแนนดิบรายองค์ประกอบ — บันทึกได้แม้ยังกรอกไม่ครบ (เช่น มีแต่คะแนนกลางภาค)
    var parts = dirty.filter(function (k) { return st.detail && st.detail[k]; }).map(function (k) {
      var p = k.split('|');
      return { clo_id: cloNum(p[0]), student_id: p[1], detail: st.detail[k], updated_by: who };
    }).filter(function (x) { return x.clo_id; });
    var payload = dirty.map(function (k) {
      var p = k.split('|');
      return { clo_id: cloNum(p[0]), student_id: p[1],
               score: s(st.scores[k]) === '' ? null : Number(st.scores[k]), updated_by: who };
    }).filter(function (x) { return x.score !== null && x.clo_id; });

    if (typeof showToast === 'function') showToast('กำลังบันทึก ' + Math.max(payload.length, parts.length) + ' รายการ...');
    if (parts.length) {
      // รวมเป็นราย CLO แล้วผสานเข้า extra ของ CLO นั้น
      // อ่าน extra ล่าสุดก่อนเขียนทุกครั้ง คะแนนของนักศึกษาคนอื่นที่อาจารย์ท่านอื่นเพิ่งบันทึกจึงไม่หาย
      var byClo = {};
      parts.forEach(function (x) { (byClo[x.clo_id] = byClo[x.clo_id] || []).push(x); });
      var cloIds = Object.keys(byClo);
      for (var b = 0; b < cloIds.length; b++) {
        var cid = Number(cloIds[b]);
        var cur = await sb().from('plo_clo').select('extra').eq('id', cid).maybeSingle();
        if (cur && cur.error) {
          var t0 = document.getElementById('loadingToast'); if (t0) t0.remove();
          showToast('อ่านข้อมูล CLO ไม่สำเร็จ: ' + cur.error.message, 'error'); return;
        }
        var ex = (cur && cur.data && cur.data.extra) || {};
        byClo[cid].forEach(function (x) { ex['sc:' + x.student_id] = JSON.stringify(x.detail || {}); });
        var up = await sb().from('plo_clo').update({ extra: ex }).eq('id', cid);
        if (up.error) {
          var t1 = document.getElementById('loadingToast'); if (t1) t1.remove();
          console.warn('plo_clo extra:', up.error);
          showToast('บันทึกคะแนนรายองค์ประกอบไม่สำเร็จ: ' + up.error.message, 'error'); return;
        }
      }
      st._partMissing = false;
    }
    var r = payload.length ? await sb().from('plo_score').upsert(payload, { onConflict: 'clo_id,student_id' }) : { error: null };
    var t = document.getElementById('loadingToast'); if (t) t.remove();
    if (r.error) { showToast('บันทึกไม่สำเร็จ: ' + r.error.message, 'error'); return; }
    var partial = parts.filter(function (x) { return s(st.scores[cloKey(x.clo_id) + '|' + x.student_id]) === ''; }).length;
    st._dirty = {};
    st.summary = null;
    showToast('บันทึกคะแนนเรียบร้อย ' + Math.max(payload.length, parts.length) + ' รายการ'
      + (partial ? ' · ' + partial + ' คนยังกรอกไม่ครบทุกการประเมิน (ยังไม่นับผล CLO)' : ''));
    var m = document.getElementById('ploScoreMsg');
    if (m) { m.textContent = 'บันทึกแล้ว'; m.className = 'text-xs text-emerald-600'; }
  };

  /* ================= ต่อเข้ากับระบบเดิม ================= */
  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      // เมนูย่อย: สรุปผลรวม / บันทึกข้อมูล — ploAssess คงไว้ให้ลิงก์เดิมยังเปิดได้ (= สรุปผลรวม)
      if (page === 'ploSummary' || page === 'ploAssess') { state().tab = 'summary'; return window.ploPage(); }
      if (page === 'ploEntry') { state().tab = canEdit() ? 'entry' : 'summary'; return window.ploPage(); }
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
      if (!nav || nav.querySelector('[data-plo-menu]')) return;
      var subs = [['ploSummary', 'สรุปผลรวม']].concat(canEdit() ? [['ploEntry', 'บันทึกข้อมูล']] : []);
      var here = APP.currentPage;
      var btn;
      if (subs.length === 1) {
        // ดูได้อย่างเดียว (เช่น ผู้บริหาร) — ไม่ต้องทำเป็นกลุ่มพับให้กดสองครั้ง
        btn = document.createElement('button');
        btn.setAttribute('onclick', "navigateTo('ploAssess')");
        btn.setAttribute('data-page', 'ploAssess');
        btn.className = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';
        btn.innerHTML = '<i data-lucide="target" class="w-5 h-5 flex-shrink-0"></i>ประเมินผลหลักสูตร PLOs';
      } else {
        var open = subs.some(function (x) { return x[0] === here; }) || here === 'ploAssess';
        btn = document.createElement('div');
        btn.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
        btn.innerHTML =
          '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
          + '<span class="flex items-center gap-3"><i data-lucide="target" class="w-5 h-5 flex-shrink-0"></i>ประเมินผลหลักสูตร PLOs</span>'
          + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"' + (open ? ' style="transform:rotate(180deg)"' : '') + '></i></button>'
          + '<div class="dropdown-menu ml-8 mt-1 space-y-1">'
          + subs.map(function (x) {
              var on = x[0] === here || (here === 'ploAssess' && x[0] === 'ploSummary');
              return '<button onclick="navigateTo(\'' + x[0] + '\')" data-page="' + x[0] + '" class="nav-item w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-surface hover:text-primary transition'
                + (on ? ' bg-primaryLight text-primary font-semibold' : '') + '">' + x[1] + '</button>';
            }).join('')
          + '</div>';
      }
      btn.setAttribute('data-plo-menu', '1');
      // คงเครื่องหมายเดิมไว้ เมนูอื่นที่อ้างตำแหน่ง [data-page="ploAssess"] จะได้จัดลำดับถูกเหมือนเดิม
      if (subs.length > 1) btn.setAttribute('data-page', 'ploAssess');
      // เกาะหน้ากลุ่มภาระงานนักศึกษาถ้ามี จะได้เป็น PLOs → ภาระงานนักศึกษา เสมอ
      // วางก่อนกลุ่ม "ผลการศึกษา" (ผลการเรียน) · ถ้าไม่มีสิทธิ์เมนูนั้น ใช้ตำแหน่งเดิม
      var eduSel = nav.querySelector('[data-page="grades"]') ? '[data-page="grades"]'
        : nav.querySelector('[data-page="engResults"]') ? '[data-page="engResults"]' : '';
      if (eduSel) insertNav(nav, btn, eduSel);
      else insertNav(nav, btn, '[data-wl-menu], [data-page="teacherDirectory"], '
        + '[data-page="tracking"], [data-page="services"]');
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
