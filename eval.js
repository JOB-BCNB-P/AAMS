/* ================================================================
   eval.js — ระบบประเมินผลรายวิชา (ชุด F1)
   ----------------------------------------------------------------
   ชุดนี้ทำ 2 เมนู
     1) คลังข้อคำถาม     — ชุดข้อคำถามกลาง เพิ่ม/แก้/สำเนาได้เอง
     2) ตั้งค่าแบบประเมิน — ผูกชุดข้อคำถามเข้ากับรายวิชา ระบุผู้สอน/แหล่งฝึก

   4 ด้านของแบบประเมิน (ถอดจากแบบที่วิทยาลัยใช้จริง)
     course  การจัดการเรียนการสอนรายวิชา  ประเมินตัวรายวิชา 1 ชุด
     teacher อาจารย์ผู้สอน                ประเมิน "รายคน"
     site    แหล่งฝึกภาคปฏิบัติ           ประเมิน "รายแหล่ง" เฉพาะวิชาปฏิบัติ
     engage  การมีส่วนร่วมในกระบวนการเรียนรู้ ประเมินตัวผู้เรียนเอง 1 ชุด

   ข้อคำถามไม่ได้เขียนตายไว้ในโค้ด แต่เก็บในตาราง eval_itemset / eval_item
   ปรับข้อคำถามปีหน้าได้โดยไม่ต้องแก้โปรแกรม และรายงานปีเก่าไม่เปลี่ยนตาม

   การคำนวณกำหนดไว้ที่ระดับแบบประเมิน (ใช้ตอนทำรายงานในชุดถัดไป)
     sd_mode    sample = STDEV (n-1) ตามที่ไฟล์วิเคราะห์เดิมใช้ | population = STDEVP (n)
     mean_mode  item = ถ่วงน้ำหนักรายข้อ (เท่าของเดิม) | dimension = เฉลี่ยของค่าเฉลี่ยรายด้าน
     min_respondents ผู้ตอบขั้นต่ำก่อนเปิดเผยผล กันย้อนกลับไปเดาตัวผู้ตอบ
   ================================================================ */
(function () {
  'use strict';

  /* ---------------- เครื่องมือพื้นฐาน ---------------- */
  function s(v) { return String(v == null ? '' : v).trim(); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) { var x = parseInt(v, 10); return isFinite(x) ? x : 0; }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function who() {
    return s((window.APP && APP.currentUser && (APP.currentUser.name || APP.currentUser.username)) || '');
  }

  var DIMS = [
    ['course',  'การจัดการเรียนการสอนรายวิชา',      'book-open',   'ประเมินตัวรายวิชา ชุดเดียวต่อนักศึกษาหนึ่งคน'],
    ['teacher', 'อาจารย์ผู้สอน',                    'user-check',  'ประเมินอาจารย์เป็นรายคน'],
    ['site',    'แหล่งฝึกภาคปฏิบัติ',               'building-2',  'ประเมินแหล่งฝึกเป็นรายแห่ง (เฉพาะวิชาปฏิบัติ)'],
    ['engage',  'การมีส่วนร่วมในกระบวนการเรียนรู้', 'users',       'ประเมินการมีส่วนร่วมของตัวผู้เรียนเอง']
  ];
  var DIM_NAME = {}; var DIM_ICON = {}; var DIM_HINT = {};
  DIMS.forEach(function (d) { DIM_NAME[d[0]] = d[1]; DIM_ICON[d[0]] = d[2]; DIM_HINT[d[0]] = d[3]; });
  var SET_FIELD = { course: 'set_course', teacher: 'set_teacher', site: 'set_site', engage: 'set_engage' };

  var SEMS = [['1', 'ภาคการศึกษาที่ 1'], ['2', 'ภาคการศึกษาที่ 2'], ['3', 'ภาคฤดูร้อน']];

  function canManage() {
    var p = (APP.permissions && APP.permissions[APP.currentRole]) || {};
    return !!p.evalSetup;
  }

  /* ---------------- สถานะหน้าจอ ---------------- */
  function state() {
    if (!APP._eval) {
      APP._eval = {
        tab: 'setup', year: '', sem: '1', set: '', form: '', draft: null,
        // ฝั่งนักศึกษา
        doForm: '', myResp: {}, myLoaded: false, myLoading: false, myError: '',
        ans: {}, ansLoaded: false, ansLoading: false,
        // รายงาน
        rpt: null, mine: null
      };
    }
    var st = APP._eval;
    if (!st.year) st.year = yearsList()[0] || (typeof currentAcademicYearBE === 'function' ? String(currentAcademicYearBE()) : '');
    if (!st.set) {
      var first = itemsets()[0];
      st.set = first ? s(first.set_code) : '';
    }
    return st;
  }

  function yearsList() {
    var seen = {}, out = [];
    get('subject').concat(get('eval_form')).forEach(function (x) {
      var y = s(x.academic_year);
      if (y && !seen[y]) { seen[y] = 1; out.push(y); }
    });
    return out.sort().reverse();
  }

  function itemsets() {
    return get('eval_itemset').slice().sort(function (a, b) {
      return (num(a.sort_order) - num(b.sort_order)) || s(a.set_name).localeCompare(s(b.set_name), 'th');
    });
  }
  function setsOf(dim) {
    return itemsets().filter(function (x) { return s(x.dimension) === dim; });
  }
  function setByCode(code) {
    var c = s(code);
    return c ? (get('eval_itemset').find(function (x) { return s(x.set_code) === c; }) || null) : null;
  }
  function itemsOf(code) {
    var c = s(code);
    return get('eval_item').filter(function (x) { return s(x.set_code) === c; })
      .sort(function (a, b) { return num(a.sort_order) - num(b.sort_order); });
  }
  function countRating(code) {
    return itemsOf(code).filter(function (x) { return s(x.input_type) !== 'text'; }).length;
  }
  // ชื่อชุดพร้อมจำนวนข้อ — ชุดตั้งต้นมีจำนวนข้ออยู่ในชื่ออยู่แล้ว จึงไม่เติมซ้ำ
  function setLabel(x) {
    var nm = s(x.set_name);
    return /\(\s*\d+\s*ข้อ/.test(nm) ? nm : nm + ' (' + countRating(x.set_code) + ' ข้อ)';
  }
  function defaultSet(dim, courseType) {
    var list = setsOf(dim).filter(function (x) { return s(x.status) !== 'เลิกใช้'; });
    var fit = list.filter(function (x) { return !s(x.course_type) || s(x.course_type) === s(courseType); });
    var pick = fit.filter(function (x) { return s(x.is_default); })[0] || fit[0];
    return pick ? s(pick.set_code) : '';
  }

  function forms() { return get('eval_form'); }
  function formByCode(code) {
    var c = s(code);
    return c ? (forms().find(function (f) { return s(f.form_code) === c; }) || null) : null;
  }
  function targetsOf(code, kind) {
    var c = s(code);
    return get('eval_target').filter(function (t) {
      return s(t.form_code) === c && (!kind || s(t.target_kind) === kind);
    }).sort(function (a, b) { return num(a.sort_order) - num(b.sort_order); });
  }

  // ประเภทวิชา — ใช้ค่าที่ระบุไว้ ถ้าไม่ได้ระบุจึงเดาจากชั่วโมงปฏิบัติ
  function courseTypeOf(subj) {
    var t = s(subj && subj.theory_practice);
    if (t) return t;
    return num(subj && subj.hours_lab) > 0 ? 'ปฏิบัติ' : 'ทฤษฎี';
  }

  function formCodeOf(subj, year, sem) {
    var base = 'EV' + s(year) + s(sem) + '-' + (s(subj.subject_code) || 'X') + '-' + (s(subj.year_level) || '0');
    var code = base, i = 2;
    while (formByCode(code)) { code = base + '-' + i; i++; }
    return code;
  }

  /* ---------------- ชิ้นส่วนหน้าจอที่ใช้ซ้ำ ---------------- */
  function selectHTML(o) {
    var cur = o.value == null ? '' : String(o.value);
    var opts = (o.options || []).map(function (x) {
      var v = String(x[0]);
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
    }).join('');
    return '<div class="' + (o.width || 'min-w-[12rem]') + '">'
      + (o.label ? '<label class="block text-xs font-medium text-gray-600 mb-1">'
        + (o.icon ? '<i data-lucide="' + o.icon + '" class="w-3.5 h-3.5 inline mr-1"></i>' : '')
        + esc(o.label) + '</label>' : '')
      + '<select onchange="' + o.on + '" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">'
      + opts + '</select></div>';
  }

  function badge(text, cls) {
    return '<span class="px-2 py-0.5 rounded-full text-xs ' + cls + '">' + esc(text) + '</span>';
  }
  function statusBadge(st) {
    var v = s(st) || 'ร่าง';
    var cls = v === 'เปิด' ? 'bg-emerald-100 text-emerald-700'
      : v === 'ปิด' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700';
    return badge(v, cls);
  }
  function emptyBox(msg, hint) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-8 text-center">'
      + '<i data-lucide="clipboard-list" class="w-10 h-10 mx-auto mb-2 text-gray-300"></i>'
      + '<p class="text-gray-500">' + esc(msg) + '</p>'
      + (hint ? '<p class="text-xs text-gray-400 mt-1">' + esc(hint) + '</p>' : '') + '</div>';
  }
  function noPerm() {
    return '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">'
      + '<i data-lucide="lock" class="w-8 h-8 mx-auto mb-2 text-amber-500"></i>'
      + '<p class="text-sm text-amber-800">เมนูนี้เปิดให้เฉพาะผู้ดูแลระบบ เจ้าหน้าที่งานวิชาการ และเจ้าหน้าที่งานทะเบียน</p></div>';
  }

  /* ================================================================
     เมนู 1 — คลังข้อคำถาม
     ================================================================ */
  function bankPage() {
    if (!canManage()) return noPerm();
    var st = state();
    var all = itemsets();
    if (all.length && !setByCode(st.set)) st.set = s(all[0].set_code);
    var cur = setByCode(st.set);

    var side = DIMS.map(function (d) {
      var list = setsOf(d[0]);
      return '<div class="mb-3">'
        + '<p class="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">'
        + '<i data-lucide="' + d[2] + '" class="w-3.5 h-3.5"></i>' + esc(d[1]) + '</p>'
        + (list.length ? list.map(function (x) {
          var on = s(x.set_code) === st.set;
          var off = s(x.status) === 'เลิกใช้';
          return '<button onclick="evalPick(\'' + esc(s(x.set_code)) + '\')" '
            + 'class="w-full text-left px-3 py-2 rounded-xl text-sm mb-1 transition '
            + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-700 hover:bg-surface') + '">'
            + esc(s(x.set_name))
            + '<span class="block text-xs font-normal ' + (on ? 'text-primary/70' : 'text-gray-400') + '">'
            + countRating(x.set_code) + ' ข้อให้คะแนน' + (off ? ' · เลิกใช้' : '') + '</span></button>';
        }).join('') : '<p class="text-xs text-gray-300 px-3 py-2">ยังไม่มีชุด</p>')
        + '</div>';
    }).join('');

    return header('คลังข้อคำถาม', 'list-checks',
      'ชุดข้อคำถามกลางที่แบบประเมินทุกวิชาหยิบไปใช้ — แก้ที่นี่ที่เดียว')
      + '<div class="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4">'
      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 h-fit">'
      + '<button onclick="evalNewSet()" class="w-full mb-3 px-3 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primaryDark inline-flex items-center justify-center gap-2">'
      + '<i data-lucide="plus" class="w-4 h-4"></i>สร้างชุดข้อคำถามใหม่</button>'
      + side + '</div>'
      + '<div>' + (cur ? setPanel(cur) : emptyBox('ยังไม่มีชุดข้อคำถาม', 'กดปุ่มสร้างชุดข้อคำถามใหม่เพื่อเริ่ม')) + '</div>'
      + '</div>';
  }

  function setPanel(set) {
    var code = s(set.set_code);
    var items = itemsOf(code);
    var usedBy = forms().filter(function (f) {
      return DIMS.some(function (d) { return s(f[SET_FIELD[d[0]]]) === code; });
    }).length;

    var rows = items.map(function (it, i) {
      var isText = s(it.input_type) === 'text';
      return '<tr class="border-t border-gray-50 hover:bg-gray-50">'
        + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
        + '<td class="px-3 py-2 font-mono text-primary whitespace-nowrap">' + esc(s(it.item_code)) + '</td>'
        + '<td class="px-3 py-2 text-xs text-gray-500">' + esc(s(it.section) || '—') + '</td>'
        + '<td class="px-3 py-2">' + esc(s(it.statement_th)) + '</td>'
        + '<td class="px-3 py-2 text-center">'
        + (isText ? badge('ข้อความ', 'bg-sky-100 text-sky-700') : badge('ให้คะแนน 1–' + (s(set.scale_max) || '5'), 'bg-gray-100 text-gray-600'))
        + '</td>'
        + '<td class="px-3 py-2 text-center whitespace-nowrap">'
        + '<button onclick="evalMoveItem(' + it.__rowIndex + ',-1)" class="text-gray-400 hover:text-primary p-1" title="เลื่อนขึ้น"><i data-lucide="chevron-up" class="w-4 h-4"></i></button>'
        + '<button onclick="evalMoveItem(' + it.__rowIndex + ',1)" class="text-gray-400 hover:text-primary p-1" title="เลื่อนลง"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>'
        + '<button onclick="evalEditItem(' + it.__rowIndex + ')" class="text-gray-400 hover:text-primary p-1" title="แก้ไข"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
        + '<button onclick="evalDeleteItem(' + it.__rowIndex + ')" class="text-gray-400 hover:text-red-600 p-1" title="ลบ"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
        + '</td></tr>';
    }).join('');

    return '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden">'
      + '<div class="p-5 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">'
      + '<div><p class="font-bold text-gray-800">' + esc(s(set.set_name)) + '</p>'
      + '<p class="text-xs text-gray-500 mt-1">ด้าน ' + esc(DIM_NAME[s(set.dimension)] || s(set.dimension))
      + ' · รหัสชุด <span class="font-mono">' + esc(code) + '</span>'
      + (s(set.course_type) ? ' · ใช้กับวิชา' + esc(s(set.course_type)) : ' · ใช้ได้ทุกวิชา')
      + (s(set.is_default) ? ' · ชุดตั้งต้น' : '') + '</p>'
      + '<p class="text-xs ' + (usedBy ? 'text-emerald-600' : 'text-gray-400') + ' mt-1">'
      + (usedBy ? 'มีแบบประเมินใช้ชุดนี้อยู่ ' + usedBy + ' วิชา' : 'ยังไม่มีแบบประเมินใดใช้ชุดนี้') + '</p></div>'
      + '<div class="flex flex-wrap gap-2">'
      + btn('evalAddItem()', 'plus', 'เพิ่มข้อคำถาม', 'bg-primary text-white hover:bg-primaryDark')
      + btn('evalCopySet()', 'copy', 'สำเนาชุดนี้', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + btn('evalEditSet()', 'settings', 'แก้ข้อมูลชุด', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + (usedBy ? '' : btn('evalDeleteSet()', 'trash-2', 'ลบชุด', 'border border-red-200 text-red-600 hover:bg-red-50'))
      + '</div></div>'
      + (items.length
        ? '<div class="overflow-x-auto"><table class="w-full text-sm">'
        + '<thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
        + '<th class="px-3 py-2 font-semibold">รหัสข้อ</th>'
        + '<th class="px-3 py-2 font-semibold">หมวด</th>'
        + '<th class="px-3 py-2 font-semibold">ข้อคำถาม</th>'
        + '<th class="px-3 py-2 font-semibold text-center">ชนิด</th>'
        + '<th class="px-3 py-2 font-semibold text-center">จัดการ</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>'
        : '<p class="p-8 text-center text-gray-400 text-sm">ชุดนี้ยังไม่มีข้อคำถาม</p>')
      + '</div>';
  }

  function btn(on, icon, text, cls) {
    return '<button onclick="' + on + '" class="px-3 py-2 rounded-xl text-sm inline-flex items-center gap-2 ' + cls + '">'
      + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' + esc(text) + '</button>';
  }

  window.evalPick = function (code) { state().set = s(code); renderCurrentPage(); };

  function setFormHTML(v) {
    v = v || {};
    return '<form id="evalSetForm" class="space-y-3">'
      + '<div><label class="block text-xs text-gray-600 mb-1">ชื่อชุด *</label>'
      + '<input name="set_name" required value="' + esc(s(v.set_name)) + '" class="w-full border rounded-xl px-3 py-2 text-sm"></div>'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-xs text-gray-600 mb-1">ด้านที่ใช้ *</label>'
      + '<select name="dimension" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + DIMS.map(function (d) {
        return '<option value="' + d[0] + '"' + (s(v.dimension) === d[0] ? ' selected' : '') + '>' + esc(d[1]) + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ใช้กับวิชาประเภท</label>'
      + '<select name="course_type" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + [['', 'ทุกประเภท'], ['ทฤษฎี', 'เฉพาะวิชาทฤษฎี'], ['ปฏิบัติ', 'เฉพาะวิชาปฏิบัติ']].map(function (x) {
        return '<option value="' + x[0] + '"' + (s(v.course_type) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></div></div>'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-xs text-gray-600 mb-1">มาตรวัดสูงสุด</label>'
      + '<select name="scale_max" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + ['5', '4', '3'].map(function (x) {
        return '<option value="' + x + '"' + ((s(v.scale_max) || '5') === x ? ' selected' : '') + '>1 – ' + x + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">สถานะ</label>'
      + '<select name="status" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + ['ใช้งาน', 'เลิกใช้'].map(function (x) {
        return '<option value="' + x + '"' + ((s(v.status) || 'ใช้งาน') === x ? ' selected' : '') + '>' + x + '</option>';
      }).join('') + '</select></div></div>'
      + '<label class="flex items-center gap-2 text-sm text-gray-700">'
      + '<input type="checkbox" name="is_default" class="rounded"' + (s(v.is_default) ? ' checked' : '') + '>'
      + 'ใช้เป็นชุดตั้งต้นของด้านนี้ (ระบบจะเลือกให้อัตโนมัติตอนสร้างแบบประเมิน)</label>'
      + '<div><label class="block text-xs text-gray-600 mb-1">หมายเหตุ</label>'
      + '<input name="note" value="' + esc(s(v.note)) + '" class="w-full border rounded-xl px-3 py-2 text-sm"></div>'
      + '</form>';
  }

  function readSetForm() {
    var f = document.getElementById('evalSetForm');
    if (!f) return null;
    var name = s(f.set_name.value);
    if (!name) { showToast('กรุณากรอกชื่อชุด', 'error'); return null; }
    return {
      set_name: name, dimension: f.dimension.value, course_type: f.course_type.value,
      scale_max: f.scale_max.value, status: f.status.value,
      is_default: f.is_default.checked ? '✓' : '', note: s(f.note.value), updated_by: who()
    };
  }

  function newSetCode(dim) {
    var base = dim.toUpperCase().slice(0, 4), i = 1, code;
    do { code = base + '-' + i; i++; } while (setByCode(code));
    return code;
  }

  window.evalNewSet = function () {
    showModal('สร้างชุดข้อคำถามใหม่', setFormHTML({ dimension: 'course', scale_max: '5', status: 'ใช้งาน' }),
      function () { return window.evalSaveNewSet(); }, 'max-w-xl');
  };
  window.evalSaveNewSet = async function () {
    var v = readSetForm(); if (!v) return;
    v.type = 'eval_itemset';
    v.set_code = newSetCode(v.dimension);
    v.sort_order = itemsets().length + 1;
    var r = await GSheetDB.create(v);
    if (!r || !r.isOk) { showToast('สร้างชุดไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    closeModal();
    state().set = v.set_code;
    showToast('สร้างชุด "' + v.set_name + '" แล้ว');
    renderCurrentPage();
  };

  window.evalEditSet = function () {
    var set = setByCode(state().set); if (!set) return;
    showModal('แก้ข้อมูลชุด', setFormHTML(set), function () { return window.evalSaveSet(); }, 'max-w-xl');
  };
  window.evalSaveSet = async function () {
    var set = setByCode(state().set); if (!set) return;
    var v = readSetForm(); if (!v) return;
    var r = await GSheetDB.update(Object.assign({}, set, v));
    if (!r || !r.isOk) { showToast('บันทึกไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    closeModal(); showToast('บันทึกแล้ว'); renderCurrentPage();
  };

  window.evalCopySet = function () {
    var set = setByCode(state().set); if (!set) return;
    var n = itemsOf(set.set_code).length;
    showModal('สำเนาชุดข้อคำถาม',
      '<p class="text-sm text-gray-600 mb-3">สร้างชุดใหม่โดยคัดลอกข้อคำถามทั้ง ' + n + ' ข้อจาก '
      + '<b>' + esc(s(set.set_name)) + '</b> มาให้ แล้วค่อยแก้ทีหลังได้</p>'
      + setFormHTML(Object.assign({}, set, { set_name: s(set.set_name) + ' (สำเนา)', is_default: '' })),
      function () { return window.evalDoCopySet(); }, 'max-w-xl');
  };
  window.evalDoCopySet = async function () {
    var src = setByCode(state().set); if (!src) return;
    var v = readSetForm(); if (!v) return;
    v.type = 'eval_itemset';
    v.set_code = newSetCode(v.dimension);
    v.sort_order = itemsets().length + 1;
    var r = await GSheetDB.create(v, { noRefresh: true });
    if (!r || !r.isOk) { showToast('สำเนาไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    var items = itemsOf(src.set_code);
    for (var i = 0; i < items.length; i++) {
      await GSheetDB.create({
        type: 'eval_item', set_code: v.set_code, item_code: s(items[i].item_code),
        section: s(items[i].section), statement_th: s(items[i].statement_th),
        input_type: s(items[i].input_type) || 'rating', sort_order: num(items[i].sort_order) || (i + 1),
        status: 'ใช้งาน', updated_by: who()
      }, { noRefresh: i < items.length - 1 });
    }
    closeModal();
    state().set = v.set_code;
    showToast('สำเนาชุดเรียบร้อย ' + items.length + ' ข้อ');
    renderCurrentPage();
  };

  window.evalDeleteSet = async function () {
    var set = setByCode(state().set); if (!set) return;
    if (!confirm('ลบชุด "' + s(set.set_name) + '" พร้อมข้อคำถามทั้งหมดใช่หรือไม่')) return;
    var items = itemsOf(set.set_code);
    for (var i = 0; i < items.length; i++) await GSheetDB.delete(items[i], { noRefresh: true });
    var r = await GSheetDB.delete(set);
    if (!r || !r.isOk) { showToast('ลบไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    state().set = '';
    showToast('ลบชุดแล้ว');
    renderCurrentPage();
  };

  /* ---------------- ข้อคำถาม ---------------- */
  function itemFormHTML(set, v) {
    v = v || {};
    var sections = {}, list = [];
    itemsOf(set.set_code).forEach(function (x) {
      var sec = s(x.section);
      if (sec && !sections[sec]) { sections[sec] = 1; list.push(sec); }
    });
    var cur = s(v.section);
    if (cur && list.indexOf(cur) < 0) list.push(cur);
    return '<form id="evalItemForm" class="space-y-3">'
      + '<div class="grid grid-cols-2 gap-3">'
      + '<div><label class="block text-xs text-gray-600 mb-1">รหัสข้อ *</label>'
      + '<input name="item_code" required value="' + esc(s(v.item_code)) + '" placeholder="เช่น 1.1 หรือ C01" class="w-full border rounded-xl px-3 py-2 text-sm"></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ชนิด</label>'
      + '<select name="input_type" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + '<option value="rating"' + (s(v.input_type) !== 'text' ? ' selected' : '') + '>ให้คะแนน 1–' + (s(set.scale_max) || '5') + '</option>'
      + '<option value="text"' + (s(v.input_type) === 'text' ? ' selected' : '') + '>ข้อความ (ข้อเสนอแนะ)</option>'
      + '</select></div></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">หมวด (เว้นว่างได้)</label>'
      + '<input name="section" list="evalSecList" value="' + esc(cur) + '" class="w-full border rounded-xl px-3 py-2 text-sm">'
      + '<datalist id="evalSecList">' + list.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></div>'
      + '<div><label class="block text-xs text-gray-600 mb-1">ข้อคำถาม *</label>'
      + '<textarea name="statement_th" required rows="3" class="w-full border rounded-xl px-3 py-2 text-sm">' + esc(s(v.statement_th)) + '</textarea></div>'
      + '</form>';
  }

  function readItemForm() {
    var f = document.getElementById('evalItemForm');
    if (!f) return null;
    var code = s(f.item_code.value), txt = s(f.statement_th.value);
    if (!code || !txt) { showToast('กรุณากรอกรหัสข้อและข้อคำถาม', 'error'); return null; }
    return {
      item_code: code, section: s(f.section.value), statement_th: txt,
      input_type: f.input_type.value, updated_by: who()
    };
  }

  window.evalAddItem = function () {
    var set = setByCode(state().set); if (!set) return;
    showModal('เพิ่มข้อคำถาม — ' + esc(s(set.set_name)), itemFormHTML(set, {}),
      function () { return window.evalSaveNewItem(); }, 'max-w-xl');
  };
  window.evalSaveNewItem = async function () {
    var set = setByCode(state().set); if (!set) return;
    var v = readItemForm(); if (!v) return;
    var items = itemsOf(set.set_code);
    var last = items.filter(function (x) { return s(x.input_type) !== 'text'; }).length;
    v.type = 'eval_item'; v.set_code = s(set.set_code); v.status = 'ใช้งาน';
    v.sort_order = v.input_type === 'text' ? 99 : (last + 1);
    var r = await GSheetDB.create(v);
    if (!r || !r.isOk) { showToast('เพิ่มไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    closeModal(); showToast('เพิ่มข้อคำถามแล้ว'); renderCurrentPage();
  };

  function itemById(id) {
    return get('eval_item').find(function (x) { return String(x.__rowIndex) === String(id); }) || null;
  }

  window.evalEditItem = function (id) {
    var it = itemById(id); if (!it) return;
    var set = setByCode(it.set_code); if (!set) return;
    showModal('แก้ไขข้อคำถาม ' + esc(s(it.item_code)), itemFormHTML(set, it),
      function () { return window.evalSaveItem(id); }, 'max-w-xl');
  };
  window.evalSaveItem = async function (id) {
    var it = itemById(id); if (!it) return;
    var v = readItemForm(); if (!v) return;
    var r = await GSheetDB.update(Object.assign({}, it, v));
    if (!r || !r.isOk) { showToast('บันทึกไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    closeModal(); showToast('บันทึกแล้ว'); renderCurrentPage();
  };

  window.evalDeleteItem = async function (id) {
    var it = itemById(id); if (!it) return;
    if (!confirm('ลบข้อ "' + s(it.item_code) + ' ' + s(it.statement_th).slice(0, 40) + '" ใช่หรือไม่')) return;
    var r = await GSheetDB.delete(it);
    if (!r || !r.isOk) { showToast('ลบไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    showToast('ลบแล้ว'); renderCurrentPage();
  };

  // สลับลำดับกับข้อที่อยู่ติดกัน — ข้อความ (ข้อเสนอแนะ) ให้อยู่ท้ายเสมอ จึงไม่ร่วมการเรียง
  window.evalMoveItem = async function (id, dir) {
    var it = itemById(id); if (!it) return;
    var list = itemsOf(it.set_code).filter(function (x) { return s(x.input_type) !== 'text'; });
    var i = list.findIndex(function (x) { return String(x.__rowIndex) === String(id); });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var a = list[i], b = list[j];
    await GSheetDB.update(Object.assign({}, a, { sort_order: num(b.sort_order) || (j + 1) }), { noRefresh: true });
    await GSheetDB.update(Object.assign({}, b, { sort_order: num(a.sort_order) || (i + 1) }));
    renderCurrentPage();
  };

  /* ================================================================
     เมนู 2 — ตั้งค่าแบบประเมินรายวิชา
     ================================================================ */
  function setupPage() {
    if (!canManage()) return noPerm();
    var st = state();
    if (st.form && formByCode(st.form)) return formEditor(formByCode(st.form));
    st.form = '';

    var ys = yearsList();
    var list = forms().filter(function (f) {
      return s(f.academic_year) === st.year && s(f.semester) === st.sem;
    }).sort(function (a, b) {
      return (num(a.year_level) - num(b.year_level)) || s(a.subject_code).localeCompare(s(b.subject_code));
    });

    var bar = '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4">'
      + '<div class="flex flex-wrap items-end gap-3">'
      + selectHTML({
        label: 'ปีการศึกษา', icon: 'calendar', value: st.year, on: "evalSetState('year',this.value)",
        options: ys.length ? ys.map(function (y) { return [y, y]; }) : [[st.year, st.year || '-']]
      })
      + selectHTML({ label: 'ภาคการศึกษา', icon: 'layers', value: st.sem, on: "evalSetState('sem',this.value)", options: SEMS })
      + '<div class="ml-auto">'
      + btn('evalNewForms()', 'plus', 'สร้างแบบประเมินจากรายวิชา', 'bg-primary text-white hover:bg-primaryDark')
      + '</div></div></div>';

    var rows = list.map(function (f) {
      var dims = DIMS.filter(function (d) { return s(f[SET_FIELD[d[0]]]); });
      var nT = targetsOf(f.form_code, 'teacher').length;
      var nS = targetsOf(f.form_code, 'site').length;
      var warn = [];
      if (s(f.set_teacher) && !nT) warn.push('ยังไม่ระบุอาจารย์ผู้สอน');
      if (s(f.set_site) && !nS) warn.push('ยังไม่ระบุแหล่งฝึก');
      return '<tr class="border-t border-gray-50 hover:bg-gray-50">'
        + '<td class="px-3 py-2"><p class="font-medium text-gray-800">' + esc(s(f.subject_name)) + '</p>'
        + '<p class="text-xs font-mono text-gray-400">' + esc(s(f.subject_code)) + '</p></td>'
        + '<td class="px-3 py-2 text-center text-sm">' + (s(f.year_level) ? 'ปี ' + esc(s(f.year_level)) : '-')
        + (s(f.batch) ? '<span class="block text-xs text-gray-400">รุ่น ' + esc(s(f.batch)) + '</span>' : '') + '</td>'
        + '<td class="px-3 py-2 text-center text-sm">' + esc(s(f.course_type) || '-') + '</td>'
        + '<td class="px-3 py-2"><div class="flex flex-wrap gap-1">'
        + dims.map(function (d) {
          return badge(d[1] + ' ' + countRating(f[SET_FIELD[d[0]]]) + ' ข้อ', 'bg-blue-50 text-blue-700');
        }).join('') + '</div>'
        + (warn.length ? '<p class="text-xs text-amber-600 mt-1"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> ' + esc(warn.join(' · ')) + '</p>' : '')
        + '</td>'
        + '<td class="px-3 py-2 text-center text-sm">' + (nT || '-') + '</td>'
        + '<td class="px-3 py-2 text-center text-sm">' + (s(f.set_site) ? (nS || '-') : '—') + '</td>'
        + '<td class="px-3 py-2 text-center">' + statusBadge(f.status) + '</td>'
        + '<td class="px-3 py-2 text-center whitespace-nowrap">'
        + '<button onclick="evalShowProgress(\'' + esc(s(f.form_code)) + '\')" class="text-gray-400 hover:text-primary p-1" title="ดูอัตราการตอบ"><i data-lucide="users" class="w-4 h-4"></i></button>'
        + '<button onclick="evalOpenForm(\'' + esc(s(f.form_code)) + '\')" class="text-gray-400 hover:text-primary p-1" title="ตั้งค่า"><i data-lucide="settings" class="w-4 h-4"></i></button>'
        + '<button onclick="evalDeleteForm(\'' + esc(s(f.form_code)) + '\')" class="text-gray-400 hover:text-red-600 p-1" title="ลบ"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
        + '</td></tr>';
    }).join('');

    var table = list.length
      ? '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden"><div class="overflow-x-auto">'
      + '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold">รายวิชา</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ชั้นปี/รุ่น</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ประเภท</th>'
      + '<th class="px-3 py-2 font-semibold">ด้านที่ประเมิน</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ผู้สอน</th>'
      + '<th class="px-3 py-2 font-semibold text-center">แหล่งฝึก</th>'
      + '<th class="px-3 py-2 font-semibold text-center">สถานะ</th>'
      + '<th class="px-3 py-2 font-semibold text-center">จัดการ</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>'
      : emptyBox('ยังไม่มีแบบประเมินของภาคเรียนนี้', 'กดปุ่ม "สร้างแบบประเมินจากรายวิชา" เพื่อสร้างจากรายวิชาที่เปิดสอน');

    return header('ตั้งค่าแบบประเมินรายวิชา', 'clipboard-list',
      'สร้างแบบประเมินของแต่ละรายวิชา เลือกชุดข้อคำถาม ระบุอาจารย์ผู้สอนและแหล่งฝึก')
      + bar + table;
  }

  window.evalSetState = function (k, v) { state()[k] = s(v); renderCurrentPage(); };
  window.evalOpenForm = function (code) { state().form = s(code); state().draft = null; renderCurrentPage(); };
  window.evalBackToList = function () { state().form = ''; state().draft = null; renderCurrentPage(); };

  /* ---------------- สร้างแบบประเมินจากรายวิชา ---------------- */
  window.evalNewForms = function () {
    var st = state();
    var have = {};
    forms().forEach(function (f) {
      if (s(f.academic_year) === st.year && s(f.semester) === st.sem) have[s(f.subject_code) + '|' + s(f.year_level)] = 1;
    });
    var subs = get('subject').filter(function (x) {
      return s(x.academic_year) === st.year && (typeof normSem === 'function' ? normSem(x.semester) : s(x.semester)) === st.sem
        && !have[s(x.subject_code) + '|' + s(x.year_level)];
    }).sort(function (a, b) {
      return (num(a.year_level) - num(b.year_level)) || s(a.subject_code).localeCompare(s(b.subject_code));
    });

    if (!subs.length) {
      showModal('สร้างแบบประเมินจากรายวิชา',
        '<p class="text-sm text-gray-600">รายวิชาที่เปิดสอนใน ' + esc(st.year) + ' ภาค ' + esc(st.sem)
        + ' มีแบบประเมินครบทุกวิชาแล้ว</p>', null, 'max-w-xl');
      return;
    }

    var rows = subs.map(function (x, i) {
      var ct = courseTypeOf(x);
      return '<label class="flex items-start gap-3 px-3 py-2 border-t border-gray-50 hover:bg-gray-50 cursor-pointer">'
        + '<input type="checkbox" class="ev-new mt-1 rounded" value="' + i + '" checked>'
        + '<span class="flex-1"><span class="block text-sm text-gray-800">' + esc(s(x.subject_name)) + '</span>'
        + '<span class="block text-xs text-gray-400 font-mono">' + esc(s(x.subject_code))
        + ' · ปี ' + esc(s(x.year_level) || '-') + (s(x.batch) ? ' · รุ่น ' + esc(s(x.batch)) : '') + '</span></span>'
        + badge(ct, ct === 'ปฏิบัติ' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600')
        + '</label>';
    }).join('');

    APP._evalNew = subs;
    showModal('สร้างแบบประเมินจากรายวิชา',
      '<p class="text-sm text-gray-600 mb-2">รายวิชาที่เปิดสอนใน ' + esc(st.year) + ' ภาค ' + esc(st.sem)
      + ' และยังไม่มีแบบประเมิน (' + subs.length + ' วิชา)</p>'
      + '<p class="text-xs text-gray-500 mb-3">ระบบจะใส่ชุดข้อคำถามตั้งต้นให้ก่อน — ด้านแหล่งฝึกใส่ให้เฉพาะวิชาปฏิบัติ '
      + 'และดึงชื่อผู้ประสานงานรายวิชามาเป็นอาจารย์ผู้สอนคนแรก แก้ไขเพิ่มเติมได้ในหน้าตั้งค่า</p>'
      + '<div class="flex gap-2 mb-2">'
      + '<button type="button" onclick="document.querySelectorAll(\'.ev-new\').forEach(function(c){c.checked=true})" class="text-xs text-primary hover:underline">เลือกทั้งหมด</button>'
      + '<button type="button" onclick="document.querySelectorAll(\'.ev-new\').forEach(function(c){c.checked=false})" class="text-xs text-gray-500 hover:underline">ไม่เลือกเลย</button>'
      + '</div>'
      + '<div class="border border-gray-100 rounded-xl overflow-auto" style="max-height:340px">' + rows + '</div>',
      function () { return window.evalDoNewForms(); }, 'max-w-2xl');
  };

  window.evalDoNewForms = async function () {
    var st = state(), subs = APP._evalNew || [];
    var picked = [];
    document.querySelectorAll('.ev-new').forEach(function (c) { if (c.checked) picked.push(subs[num(c.value)]); });
    if (!picked.length) { showToast('ยังไม่ได้เลือกรายวิชา', 'error'); return; }

    var ok = 0, err = '';
    for (var i = 0; i < picked.length; i++) {
      var x = picked[i], ct = courseTypeOf(x);
      var code = formCodeOf(x, st.year, st.sem);
      var payload = {
        type: 'eval_form', form_code: code,
        academic_year: st.year, semester: st.sem,
        year_level: s(x.year_level), batch: s(x.batch),
        subject_code: s(x.subject_code), subject_name: s(x.subject_name),
        course_type: ct, status: 'ร่าง',
        set_course: defaultSet('course', ct),
        set_teacher: defaultSet('teacher', ct),
        set_site: ct === 'ปฏิบัติ' ? defaultSet('site', ct) : '',
        set_engage: defaultSet('engage', ct),
        min_respondents: '5', sd_mode: 'sample', mean_mode: 'item',
        show_comment_teacher: '', updated_by: who()
      };
      var r = await GSheetDB.create(payload, { noRefresh: true });
      if (r && r.isOk) {
        ok++;
        var coord = s(x.coordinator);
        if (coord) {
          await GSheetDB.create({
            type: 'eval_target', form_code: code, target_kind: 'teacher',
            target_name: coord, target_ref: '', sort_order: 1, status: 'ใช้งาน', updated_by: who()
          }, { noRefresh: true });
        }
      } else err = (r && r.error) || '';
    }
    await GSheetDB.refreshTab('eval_form');
    await GSheetDB.refreshTab('eval_target');
    closeModal();
    APP._evalNew = null;
    if (ok === picked.length) showToast('สร้างแบบประเมินแล้ว ' + ok + ' วิชา');
    else showToast('สร้างสำเร็จ ' + ok + ' จาก ' + picked.length + ' วิชา · ' + err, 'error');
    renderCurrentPage();
  };

  window.evalDeleteForm = async function (code) {
    var f = formByCode(code); if (!f) return;
    if (!confirm('ลบแบบประเมินของ "' + s(f.subject_name) + '" ใช่หรือไม่\n(ลบได้เฉพาะแบบที่ยังไม่มีผู้ตอบ)')) return;
    var tg = targetsOf(code);
    for (var i = 0; i < tg.length; i++) await GSheetDB.delete(tg[i], { noRefresh: true });
    var r = await GSheetDB.delete(f);
    if (!r || !r.isOk) { showToast('ลบไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }
    showToast('ลบแบบประเมินแล้ว'); renderCurrentPage();
  };

  /* ---------------- หน้าตั้งค่าแบบประเมินหนึ่งวิชา ---------------- */
  function draftOf(f) {
    var st = state();
    if (!st.draft || st.draft.form_code !== s(f.form_code)) {
      st.draft = {
        form_code: s(f.form_code),
        status: s(f.status) || 'ร่าง',
        open_date: s(f.open_date), close_date: s(f.close_date),
        course_type: s(f.course_type),
        set_course: s(f.set_course), set_teacher: s(f.set_teacher),
        set_site: s(f.set_site), set_engage: s(f.set_engage),
        min_respondents: s(f.min_respondents) || '5',
        sd_mode: s(f.sd_mode) || 'sample',
        mean_mode: s(f.mean_mode) || 'item',
        show_comment_teacher: s(f.show_comment_teacher),
        teachers: targetsOf(f.form_code, 'teacher').map(function (t) { return { name: s(t.target_name), ref: s(t.target_ref) }; }),
        sites: targetsOf(f.form_code, 'site').map(function (t) { return { name: s(t.target_name), ref: '' }; })
      };
    }
    return st.draft;
  }

  window.evalDraft = function (k, v) { var d = state().draft; if (d) d[k] = s(v); };
  window.evalDraftR = function (k, v) { window.evalDraft(k, v); renderCurrentPage(); };
  window.evalDraftBool = function (k, on) { var d = state().draft; if (d) d[k] = on ? '✓' : ''; };

  window.evalAddTarget = function (kind) {
    var d = state().draft; if (!d) return;
    var id = kind === 'teacher' ? 'evalAddTeacher' : 'evalAddSite';
    var el = document.getElementById(id);
    var name = s(el && el.value);
    if (!name) { showToast('กรุณาระบุชื่อ', 'error'); return; }
    var arr = kind === 'teacher' ? d.teachers : d.sites;
    if (arr.some(function (x) { return x.name === name; })) { showToast('มีชื่อนี้อยู่แล้ว', 'error'); return; }
    arr.push({ name: name, ref: '' });
    if (el) el.value = '';
    renderCurrentPage();
  };
  window.evalDelTarget = function (kind, i) {
    var d = state().draft; if (!d) return;
    (kind === 'teacher' ? d.teachers : d.sites).splice(i, 1);
    renderCurrentPage();
  };

  function teacherOptions() {
    var seen = {}, out = [];
    get('teacher').forEach(function (t) {
      var n = s(t.title_prefix) + s(t.name);
      n = s(n) || s(t.name);
      if (n && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    get('special_teacher').forEach(function (t) {
      var n = s(t.name);
      if (n && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'th'); });
  }

  function targetBox(kind, title, hint, arr, listId, opts) {
    var rows = arr.length ? arr.map(function (x, i) {
      return '<div class="flex items-center gap-2 px-3 py-2 border-t border-gray-50">'
        + '<span class="w-6 text-xs text-gray-400 text-center">' + (i + 1) + '</span>'
        + '<span class="flex-1 text-sm text-gray-800">' + esc(x.name) + '</span>'
        + '<button onclick="evalDelTarget(\'' + kind + '\',' + i + ')" class="text-gray-300 hover:text-red-600 p-1" title="เอาออก">'
        + '<i data-lucide="x" class="w-4 h-4"></i></button></div>';
    }).join('') : '<p class="px-3 py-4 text-center text-sm text-gray-400 border-t border-gray-50">ยังไม่มีรายชื่อ</p>';

    return '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden">'
      + '<div class="px-4 py-3 border-b border-gray-100">'
      + '<p class="font-semibold text-gray-800 text-sm">' + esc(title) + ' <span class="font-normal text-gray-400">(' + arr.length + ')</span></p>'
      + '<p class="text-xs text-gray-500 mt-0.5">' + esc(hint) + '</p></div>'
      + rows
      + '<div class="p-3 border-t border-gray-100 flex gap-2">'
      + '<input id="' + (kind === 'teacher' ? 'evalAddTeacher' : 'evalAddSite') + '"'
      + (listId ? ' list="' + listId + '"' : '')
      + ' placeholder="' + (kind === 'teacher' ? 'พิมพ์หรือเลือกชื่ออาจารย์' : 'พิมพ์ชื่อแหล่งฝึก เช่น อายุรกรรม 6ก') + '"'
      + ' class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + (opts ? '<datalist id="' + listId + '">' + opts.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' : '')
      + '<button onclick="evalAddTarget(\'' + kind + '\')" class="px-3 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primaryDark">เพิ่ม</button>'
      + '</div></div>';
  }

  function formEditor(f) {
    var d = draftOf(f);

    var dimRows = DIMS.map(function (dim) {
      var key = SET_FIELD[dim[0]];
      var list = setsOf(dim[0]).filter(function (x) {
        return s(x.status) !== 'เลิกใช้' || s(x[key]) === s(d[key]);
      });
      var opts = [['', '— ไม่ใช้ด้านนี้ —']].concat(list.map(function (x) {
        return [s(x.set_code), setLabel(x)];
      }));
      var cur = s(d[key]);
      return '<div class="flex flex-wrap items-end gap-3 px-4 py-3 border-t border-gray-50">'
        + '<div class="flex-1 min-w-[14rem]">'
        + '<p class="text-sm font-medium text-gray-800 flex items-center gap-2">'
        + '<i data-lucide="' + dim[2] + '" class="w-4 h-4 text-primary"></i>' + esc(dim[1]) + '</p>'
        + '<p class="text-xs text-gray-500 mt-0.5">' + esc(dim[3]) + '</p></div>'
        + selectHTML({ value: cur, on: "evalDraftR('" + key + "',this.value)", options: opts, width: 'min-w-[18rem]' })
        + '<div class="w-24 text-right text-sm ' + (cur ? 'text-emerald-600' : 'text-gray-300') + '">'
        + (cur ? countRating(cur) + ' ข้อ' : 'ไม่ใช้') + '</div></div>';
    }).join('');

    var teacherBox = s(d.set_teacher)
      ? targetBox('teacher', 'อาจารย์ผู้สอนที่ถูกประเมิน',
        'นักศึกษาจะได้ประเมินอาจารย์ทุกคนในรายการนี้ คนละ ' + countRating(d.set_teacher) + ' ข้อ',
        d.teachers, 'evalTeacherList', teacherOptions())
      : '';
    var siteBox = s(d.set_site)
      ? targetBox('site', 'แหล่งฝึกภาคปฏิบัติ',
        'นักศึกษาจะได้ประเมินแหล่งฝึกทุกแห่งในรายการนี้ แห่งละ ' + countRating(d.set_site) + ' ข้อ',
        d.sites, '', null)
      : '';

    var totalItems = (s(d.set_course) ? countRating(d.set_course) : 0)
      + (s(d.set_teacher) ? countRating(d.set_teacher) * d.teachers.length : 0)
      + (s(d.set_site) ? countRating(d.set_site) * d.sites.length : 0)
      + (s(d.set_engage) ? countRating(d.set_engage) : 0);

    return '<div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '<div><button onclick="evalBackToList()" class="text-sm text-gray-500 hover:text-primary inline-flex items-center gap-1 mb-1">'
      + '<i data-lucide="arrow-left" class="w-4 h-4"></i>กลับไปรายการแบบประเมิน</button>'
      + '<h2 class="text-xl font-bold text-gray-800">' + esc(s(f.subject_name)) + '</h2>'
      + '<p class="text-sm text-gray-500">' + esc(s(f.subject_code)) + ' · ปีการศึกษา ' + esc(s(f.academic_year))
      + ' ภาค ' + esc(s(f.semester)) + ' · ชั้นปีที่ ' + esc(s(f.year_level) || '-')
      + (s(f.batch) ? ' รุ่น ' + esc(s(f.batch)) : '') + ' · วิชา' + esc(s(f.course_type) || '-') + '</p></div>'
      + '<div class="flex flex-wrap gap-2">'
      + btn('evalShowProgress(\'' + esc(s(f.form_code)) + '\')', 'users', 'อัตราการตอบ', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + btn('evalImportOpen()', 'upload', 'นำเข้าคำตอบจากไฟล์เดิม', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + btn('evalSaveForm()', 'save', 'บันทึกการตั้งค่า', 'bg-primary text-white hover:bg-primaryDark')
      + '</div></div>'

      // ก. ด้านที่ประเมิน
      + '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden mb-4">'
      + '<div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">'
      + '<p class="font-semibold text-gray-800 text-sm">ด้านที่ประเมินและชุดข้อคำถาม</p>'
      + '<p class="text-xs text-gray-500">นักศึกษาหนึ่งคนตอบทั้งหมด <b class="text-primary">' + totalItems + '</b> ข้อ</p></div>'
      + dimRows + '</div>'

      + (teacherBox || siteBox
        ? '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">' + teacherBox + siteBox + '</div>' : '')

      // ข. ช่วงเวลาและสถานะ
      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-3">ช่วงเวลาเปิดให้ประเมิน</p>'
      + '<div class="flex flex-wrap items-end gap-3">'
      + selectHTML({
        label: 'สถานะ', icon: 'toggle-left', value: d.status, on: "evalDraftR('status',this.value)",
        options: [['ร่าง', 'ร่าง — ยังไม่ให้นักศึกษาเห็น'], ['เปิด', 'เปิด — ให้ประเมินได้'], ['ปิด', 'ปิด — หยุดรับคำตอบ']],
        width: 'min-w-[16rem]'
      })
      + '<div class="min-w-[10rem]"><label class="block text-xs font-medium text-gray-600 mb-1">เปิดวันที่</label>'
      + '<input type="date" value="' + esc(d.open_date) + '" onchange="evalDraft(\'open_date\',this.value)" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '<div class="min-w-[10rem]"><label class="block text-xs font-medium text-gray-600 mb-1">ปิดวันที่</label>'
      + '<input type="date" value="' + esc(d.close_date) + '" onchange="evalDraft(\'close_date\',this.value)" class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"></div>'
      + '</div>'
      + '<p class="text-xs text-gray-500 mt-2">เว้นวันที่ไว้ก็ได้ — ระบบยึด "สถานะ" เป็นหลักเสมอ</p>'
      + '</div>'

      // ค. การคำนวณและการเปิดเผยผล
      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-1">การคำนวณและการเปิดเผยผล</p>'
      + '<p class="text-xs text-gray-500 mb-3">ค่าเหล่านี้ใช้ตอนออกรายงาน — ตั้งต่างกันรายวิชาได้ ถ้าต้องการเทียบกับรายงานปีเก่า</p>'
      + '<div class="flex flex-wrap items-end gap-3">'
      + selectHTML({
        label: 'ส่วนเบี่ยงเบนมาตรฐาน (SD)', icon: 'sigma', value: d.sd_mode, on: "evalDraft('sd_mode',this.value)",
        options: [['sample', 'STDEV — กลุ่มตัวอย่าง (n−1) ตามไฟล์เดิม'], ['population', 'STDEVP — ประชากร (n)']],
        width: 'min-w-[20rem]'
      })
      + selectHTML({
        label: 'ค่าเฉลี่ยรวมทุกด้าน', icon: 'calculator', value: d.mean_mode, on: "evalDraft('mean_mode',this.value)",
        options: [['item', 'ถ่วงน้ำหนักรายข้อ — ตรงกับรายงานเดิม'], ['dimension', 'เฉลี่ยของค่าเฉลี่ยรายด้าน — ทุกด้านน้ำหนักเท่ากัน']],
        width: 'min-w-[22rem]'
      })
      + selectHTML({
        label: 'ผู้ตอบขั้นต่ำก่อนเปิดเผยผล', icon: 'shield', value: d.min_respondents, on: "evalDraft('min_respondents',this.value)",
        options: [['1', '1 คน'], ['2', '2 คน'], ['3', '3 คน'], ['4', '4 คน'], ['5', '5 คน (แนะนำ)']],
        width: 'min-w-[14rem]'
      })
      + '</div>'
      + '<label class="flex items-start gap-2 text-sm text-gray-700 mt-3">'
      + '<input type="checkbox" class="rounded mt-0.5" onchange="evalDraftBool(\'show_comment_teacher\',this.checked)"'
      + (s(d.show_comment_teacher) ? ' checked' : '') + '>'
      + '<span>ให้อาจารย์เจ้าตัวอ่านข้อเสนอแนะปลายเปิดของตนเองได้'
      + '<span class="block text-xs text-gray-500">ยังไม่เปิดไว้ — ตอนนี้ข้อเสนอแนะอ่านได้เฉพาะผู้ดูแลระบบ เจ้าหน้าที่งานวิชาการ เจ้าหน้าที่งานทะเบียน และผู้บริหาร</span></span>'
      + '</label></div>'

      + '<div class="flex justify-end gap-2">'
      + btn('evalBackToList()', 'x', 'ยกเลิก', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
      + btn('evalSaveForm()', 'save', 'บันทึกการตั้งค่า', 'bg-primary text-white hover:bg-primaryDark')
      + '</div>';
  }

  window.evalSaveForm = async function () {
    var st = state(), d = st.draft;
    var f = formByCode(st.form);
    if (!f || !d) return;

    if (!s(d.set_course) && !s(d.set_teacher) && !s(d.set_site) && !s(d.set_engage)) {
      showToast('ต้องเลือกอย่างน้อยหนึ่งด้าน', 'error'); return;
    }
    if (d.status === 'เปิด') {
      if (s(d.set_teacher) && !d.teachers.length) { showToast('ยังไม่ได้ระบุอาจารย์ผู้สอน — เปิดให้ประเมินไม่ได้', 'error'); return; }
      if (s(d.set_site) && !d.sites.length) { showToast('ยังไม่ได้ระบุแหล่งฝึก — เปิดให้ประเมินไม่ได้', 'error'); return; }
    }

    var r = await GSheetDB.update(Object.assign({}, f, {
      status: d.status, open_date: d.open_date, close_date: d.close_date,
      set_course: d.set_course, set_teacher: d.set_teacher,
      set_site: d.set_site, set_engage: d.set_engage,
      min_respondents: d.min_respondents, sd_mode: d.sd_mode, mean_mode: d.mean_mode,
      show_comment_teacher: d.show_comment_teacher, updated_by: who()
    }), { noRefresh: true });
    if (!r || !r.isOk) { showToast('บันทึกไม่สำเร็จ · ' + ((r && r.error) || ''), 'error'); return; }

    // เป้าหมาย — เทียบของเดิมกับของใหม่ แล้วแก้เฉพาะส่วนที่ต่าง
    var want = [];
    if (s(d.set_teacher)) d.teachers.forEach(function (x, i) { want.push({ kind: 'teacher', name: x.name, ref: x.ref, order: i + 1 }); });
    if (s(d.set_site)) d.sites.forEach(function (x, i) { want.push({ kind: 'site', name: x.name, ref: '', order: i + 1 }); });

    var have = targetsOf(st.form);
    var keep = {};
    for (var i = 0; i < want.length; i++) {
      var w = want[i];
      var hit = have.find(function (t) { return s(t.target_kind) === w.kind && s(t.target_name) === w.name; });
      if (hit) {
        keep[hit.__rowIndex] = 1;
        if (num(hit.sort_order) !== w.order) {
          await GSheetDB.update(Object.assign({}, hit, { sort_order: w.order }), { noRefresh: true });
        }
      } else {
        await GSheetDB.create({
          type: 'eval_target', form_code: st.form, target_kind: w.kind,
          target_name: w.name, target_ref: w.ref, sort_order: w.order,
          status: 'ใช้งาน', updated_by: who()
        }, { noRefresh: true });
      }
    }
    for (var j = 0; j < have.length; j++) {
      if (!keep[have[j].__rowIndex]) await GSheetDB.delete(have[j], { noRefresh: true });
    }

    await GSheetDB.refreshTab('eval_form');
    await GSheetDB.refreshTab('eval_target');
    st.draft = null;
    showToast('บันทึกการตั้งค่าแล้ว');
    renderCurrentPage();
  };

  /* ================================================================
     ชุด F2 — นักศึกษาตอบแบบประเมิน และการติดตามอัตราการตอบ
     ชุด F3 — รายงานผลประเมิน
     ชุด F4 — นำเข้าคำตอบจากไฟล์เดิม และส่งออกรายงาน
     ================================================================ */

  function sbc() { return GSheetDB.client(); }
  async function rpc(name, args) {
    var r = await sbc().rpc(name, args || {});
    if (r.error) throw new Error(r.error.message || String(r.error));
    return r.data;
  }
  function fx(v, d) { var x = parseFloat(v); return isFinite(x) ? x.toFixed(d == null ? 2 : d) : '-'; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* เกณฑ์แปลผลค่าเฉลี่ยมาตรวัด 5 ระดับ
     ใช้ช่วงมาตรฐานที่รายงานประกันคุณภาพใช้กันทั่วไป */
  var BANDS = [
    [4.51, 'มากที่สุด', 'bg-emerald-100 text-emerald-700'],
    [3.51, 'มาก', 'bg-sky-100 text-sky-700'],
    [2.51, 'ปานกลาง', 'bg-amber-100 text-amber-700'],
    [1.51, 'น้อย', 'bg-orange-100 text-orange-700'],
    [0, 'น้อยที่สุด', 'bg-red-100 text-red-700']
  ];
  function bandOf(m) {
    var x = parseFloat(m);
    if (!isFinite(x)) return ['', '-', 'bg-gray-100 text-gray-500'];
    for (var i = 0; i < BANDS.length; i++) if (x >= BANDS[i][0]) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }
  function bandBadge(m) { var b = bandOf(m); return badge(b[1], b[2]); }

  function loadingBox(msg) {
    return '<div class="bg-white rounded-2xl border border-blue-100 p-8 text-center">'
      + '<i data-lucide="loader" class="w-8 h-8 mx-auto mb-2 text-gray-300"></i>'
      + '<p class="text-gray-500 text-sm">' + esc(msg || 'กำลังโหลดข้อมูล…') + '</p></div>';
  }
  function warnBox(msg, hint) {
    return '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">'
      + '<i data-lucide="alert-triangle" class="w-8 h-8 mx-auto mb-2 text-amber-500"></i>'
      + '<p class="text-sm text-amber-800">' + esc(msg) + '</p>'
      + (hint ? '<p class="text-xs text-amber-700 mt-1">' + esc(hint) + '</p>' : '') + '</div>';
  }

  /* ================================================================
     F2 — หน้านักศึกษาตอบแบบประเมิน
     ================================================================ */
  function myStudent() { return (APP.currentUser && APP.currentUser.data) || null; }

  // รายวิชานี้เป็นของนักศึกษาคนนี้หรือไม่ — ใช้กฎเดียวกับเมนูรายวิชาที่เปิดสอน
  function ownsForm(stu, f) {
    if (!stu) return false;
    if (typeof studentOwnsSubject === 'function') return studentOwnsSubject(stu, f);
    return !!s(f.batch) && s(f.batch) === s(stu.batch);
  }
  function formOpenNow(f) {
    if (s(f.status) !== 'เปิด') return false;
    var d = today();
    if (s(f.open_date) && s(f.open_date) > d) return false;
    if (s(f.close_date) && s(f.close_date) < d) return false;
    return true;
  }

  // ช่องกรอกทั้งหมดของแบบประเมินหนึ่ง แยกเป็นกล่องตามด้านและตามเป้าหมาย
  function answerBlocks(f) {
    var out = [];
    if (s(f.set_course)) out.push({ dim: 'course', set: s(f.set_course), kind: '', name: '', title: DIM_NAME.course });
    if (s(f.set_teacher)) targetsOf(f.form_code, 'teacher').forEach(function (t) {
      out.push({ dim: 'teacher', set: s(f.set_teacher), kind: 'teacher', name: s(t.target_name), title: 'อาจารย์ผู้สอน — ' + s(t.target_name) });
    });
    if (s(f.set_site)) targetsOf(f.form_code, 'site').forEach(function (t) {
      out.push({ dim: 'site', set: s(f.set_site), kind: 'site', name: s(t.target_name), title: 'แหล่งฝึกภาคปฏิบัติ — ' + s(t.target_name) });
    });
    if (s(f.set_engage)) out.push({ dim: 'engage', set: s(f.set_engage), kind: '', name: '', title: DIM_NAME.engage });
    return out;
  }
  function ansKey(b, item) { return b.dim + '\u0001' + b.name + '\u0001' + s(item.item_code); }
  function ratingCount(f) {
    return answerBlocks(f).reduce(function (t, b) { return t + countRating(b.set); }, 0);
  }

  function doPage() {
    var st = state();
    var stu = myStudent();
    if (!stu) return header('ประเมินรายวิชา', 'star', '')
      + warnBox('ยังไม่พบข้อมูลนักศึกษาของคุณในระบบ จึงยังแสดงแบบประเมินให้ไม่ได้', 'กรุณาติดต่องานทะเบียน');
    if (!st.myLoaded) { loadMyResponses(); return header('ประเมินรายวิชา', 'star', '') + loadingBox(); }
    if (st.myError) return header('ประเมินรายวิชา', 'star', '') + warnBox('โหลดข้อมูลไม่สำเร็จ', st.myError);
    if (st.doForm && formByCode(st.doForm)) return answerPage(formByCode(st.doForm));
    st.doForm = '';

    var list = forms().filter(function (f) { return ownsForm(stu, f) && (formOpenNow(f) || st.myResp[s(f.form_code)]); });
    var todo = [], done = [];
    list.forEach(function (f) {
      var r = st.myResp[s(f.form_code)];
      (r && r.status === 'ส่งแล้ว' ? done : todo).push(f);
    });

    function card(f, submitted) {
      var r = st.myResp[s(f.form_code)];
      var draft = r && r.status !== 'ส่งแล้ว';
      return '<button type="button" onclick="evalOpenAnswer(\'' + esc(s(f.form_code)) + '\')" '
        + 'class="card-stat text-left w-full bg-white rounded-2xl border '
        + (submitted ? 'border-gray-100' : 'border-emerald-200') + ' p-5 transition">'
        + '<div class="flex items-center justify-between mb-2">'
        + badge(submitted ? 'ประเมินแล้ว' : draft ? 'บันทึกร่างไว้' : 'รอประเมิน',
          submitted ? 'bg-gray-100 text-gray-600' : draft ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')
        + '<span class="text-xs text-gray-400">ภาค ' + esc(s(f.semester)) + '/' + esc(s(f.academic_year)) + '</span></div>'
        + '<p class="font-bold text-gray-800">' + esc(s(f.subject_name)) + '</p>'
        + '<p class="text-xs font-mono text-gray-400 mt-0.5">' + esc(s(f.subject_code)) + '</p>'
        + '<p class="text-xs text-gray-500 mt-2">' + ratingCount(f) + ' ข้อ'
        + (s(f.close_date) ? ' · ปิดรับ ' + esc(s(f.close_date)) : '') + '</p></button>';
    }

    return header('ประเมินรายวิชา', 'star', 'แบบประเมินของรายวิชาที่คุณเรียนในภาคเรียนนี้')
      + (todo.length
        ? '<p class="font-semibold text-gray-700 mb-2">รอประเมิน (' + todo.length + ')</p>'
        + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">' + todo.map(function (f) { return card(f, false); }).join('') + '</div>'
        : '<div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center mb-6">'
        + '<p class="text-emerald-700 text-sm">ตอนนี้ไม่มีแบบประเมินที่ต้องทำ</p></div>')
      + (done.length
        ? '<p class="font-semibold text-gray-700 mb-2">ประเมินแล้ว (' + done.length + ')</p>'
        + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + done.map(function (f) { return card(f, true); }).join('') + '</div>'
        : '');
  }

  async function loadMyResponses() {
    var st = state();
    if (st.myLoading) return;
    st.myLoading = true;
    try {
      var r = await sbc().from('eval_response')
        .select('form_code,status,response_key')
        .eq('student_id', s(myStudent().student_id));
      if (r.error) throw new Error(r.error.message);
      st.myResp = {};
      (r.data || []).forEach(function (x) { st.myResp[s(x.form_code)] = x; });
      st.myError = '';
    } catch (e) { st.myError = String(e.message || e); }
    st.myLoaded = true; st.myLoading = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }

  window.evalOpenAnswer = function (code) {
    var st = state();
    st.doForm = s(code); st.ans = {}; st.ansLoaded = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };
  window.evalBackToForms = function () {
    var st = state();
    st.doForm = ''; st.ans = {}; st.ansLoaded = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  function answerPage(f) {
    var st = state();
    var r = st.myResp[s(f.form_code)];
    var submitted = !!(r && r.status === 'ส่งแล้ว');
    if (r && !st.ansLoaded) { loadMyAnswers(r.response_key); return loadingBox('กำลังเรียกคำตอบที่บันทึกไว้…'); }
    if (!r) st.ansLoaded = true;

    var blocks = answerBlocks(f);
    var total = ratingCount(f);
    var answered = Object.keys(st.ans).filter(function (k) { return s(st.ans[k]) !== ''; }).length;

    var body = blocks.map(function (b, bi) {
      var items = itemsOf(b.set);
      var rows = items.map(function (it) {
        var key = ansKey(b, it);
        var cur = s(st.ans[key]);
        if (s(it.input_type) === 'text') {
          return '<div class="px-4 py-3 border-t border-gray-50">'
            + '<p class="text-sm text-gray-700 mb-1">' + esc(s(it.statement_th)) + '</p>'
            + '<textarea rows="2" ' + (submitted ? 'disabled ' : '')
            + 'onchange="evalAns(\'' + esc(key) + '\',this.value)" '
            + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm' + (submitted ? ' bg-gray-50' : '') + '">'
            + esc(cur) + '</textarea></div>';
        }
        var max = parseInt(s(setByCode(b.set) && setByCode(b.set).scale_max), 10) || 5;
        var scale = [];
        for (var v = max; v >= 1; v--) scale.push(v);
        return '<div class="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-50">'
          + '<p class="flex-1 min-w-[16rem] text-sm text-gray-700">'
          + (s(it.item_code) && /^\d/.test(s(it.item_code)) ? '<span class="font-mono text-gray-400 mr-1">' + esc(s(it.item_code)) + '</span>' : '')
          + esc(s(it.statement_th)) + '</p>'
          + '<div class="flex gap-1">' + scale.map(function (v) {
            var on = cur === String(v);
            return '<label class="cursor-pointer"><input type="radio" class="sr-only ev-r" '
              + 'name="' + esc(key) + '" value="' + v + '"' + (on ? ' checked' : '') + (submitted ? ' disabled' : '')
              + ' onchange="evalAns(\'' + esc(key) + '\',\'' + v + '\')">'
              + '<span class="inline-flex items-center justify-center w-9 h-9 rounded-xl border text-sm '
              + (on ? 'bg-primary text-white border-primary font-semibold' : 'border-gray-200 text-gray-600 hover:border-primary/50')
              + '">' + v + '</span></label>';
          }).join('') + '</div></div>';
      }).join('');

      return '<details id="evAns' + bi + '"' + (bi === 0 || !submitted ? ' open' : '') + ' class="bg-white rounded-2xl border border-blue-100 mb-4">'
        + '<summary class="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3">'
        + '<span class="font-semibold text-gray-800 text-sm flex items-center gap-2">'
        + '<i data-lucide="' + DIM_ICON[b.dim] + '" class="w-4 h-4 text-primary"></i>' + esc(b.title) + '</span>'
        + '<span class="text-xs text-gray-400">' + countRating(b.set) + ' ข้อ</span></summary>'
        + '<div class="pb-2">' + rows + '</div></details>';
    }).join('');

    return '<div class="mb-4">'
      + '<button onclick="evalBackToForms()" class="text-sm text-gray-500 hover:text-primary inline-flex items-center gap-1 mb-1">'
      + '<i data-lucide="arrow-left" class="w-4 h-4"></i>กลับไปรายการแบบประเมิน</button>'
      + '<h2 class="text-xl font-bold text-gray-800">' + esc(s(f.subject_name)) + '</h2>'
      + '<p class="text-sm text-gray-500">' + esc(s(f.subject_code)) + ' · ภาค ' + esc(s(f.semester))
      + '/' + esc(s(f.academic_year)) + '</p></div>'
      + (submitted
        ? '<div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-4 text-sm text-gray-600">'
        + '<i data-lucide="check-circle" class="w-4 h-4 inline text-emerald-600"></i> '
        + 'คุณส่งแบบประเมินนี้แล้ว จึงแก้ไขคำตอบไม่ได้ — คำตอบทั้งหมดไม่ผูกกับชื่อของคุณ</div>'
        : '<div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">'
        + '<p class="text-sm text-gray-700">ให้คะแนน 5 = มากที่สุด ถึง 1 = น้อยที่สุด · '
        + 'ตอบแล้ว <b id="evalProgress" class="text-primary">' + answered + '</b> จาก ' + total + ' ข้อ</p>'
        + '<p class="text-xs text-gray-500 mt-1">ระบบเก็บเพียงว่าคุณประเมินแล้ว ไม่เก็บว่าคุณให้คะแนนข้อไหนเท่าไร '
        + 'และจะไม่แสดงผลจนกว่าจะมีผู้ตอบครบตามเกณฑ์</p></div>')
      + body
      + (submitted ? '' :
        '<div class="flex flex-wrap justify-end gap-2 mb-6">'
        + btn('evalSubmit(false)', 'save', 'บันทึกร่างไว้ก่อน', 'border border-gray-200 text-gray-700 hover:bg-gray-50')
        + btn('evalSubmit(true)', 'send', 'ส่งแบบประเมิน', 'bg-primary text-white hover:bg-primaryDark')
        + '</div>');
  }

  async function loadMyAnswers(key) {
    var st = state();
    if (st.ansLoading) return;
    st.ansLoading = true;
    try {
      var r = await sbc().from('eval_answer')
        .select('dimension,item_code,target_name,score,text_answer')
        .eq('response_key', key);
      if (r.error) throw new Error(r.error.message);
      st.ans = {};
      (r.data || []).forEach(function (x) {
        var k = s(x.dimension) + '\u0001' + s(x.target_name) + '\u0001' + s(x.item_code);
        st.ans[k] = x.score == null ? s(x.text_answer) : String(x.score);
      });
    } catch (e) { showToast('อ่านคำตอบเดิมไม่สำเร็จ · ' + (e.message || e), 'error'); }
    st.ansLoaded = true; st.ansLoading = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }

  // เก็บคำตอบไว้ในหน่วยความจำก่อน แล้วขยับเลขนับอย่างเดียว
  // ไม่วาดหน้าใหม่ทุกครั้งที่กด เพราะแบบหนึ่งมีได้เป็นร้อยข้อ
  window.evalAns = function (key, v) {
    var st = state();
    if (!st.ans) st.ans = {};
    st.ans[key] = s(v);
    try {
      var el = document.getElementById('evalProgress');
      if (el) {
        var f = formByCode(st.doForm);
        var keys = {};
        answerBlocks(f).forEach(function (b) {
          itemsOf(b.set).forEach(function (it) { if (s(it.input_type) !== 'text') keys[ansKey(b, it)] = 1; });
        });
        el.textContent = Object.keys(keys).filter(function (k) { return s(st.ans[k]) !== ''; }).length;
      }
      // ปุ่มตัวเลขที่เพิ่งเลือก ให้เห็นทันทีว่าถูกเลือกแล้ว
      var inputs = document.querySelectorAll('input[name="' + key + '"]');
      if (inputs && inputs.forEach) inputs.forEach(function (i) {
        var sp = i.nextElementSibling;
        if (!sp) return;
        sp.className = 'inline-flex items-center justify-center w-9 h-9 rounded-xl border text-sm '
          + (i.checked ? 'bg-primary text-white border-primary font-semibold' : 'border-gray-200 text-gray-600 hover:border-primary/50');
      });
    } catch (e) { /* หน้าอาจยังไม่ได้วาด */ }
  };

  window.evalSubmit = async function (send) {
    var st = state();
    var f = formByCode(st.doForm);
    if (!f) return;
    var stu = myStudent();
    if (!stu) { showToast('ไม่พบข้อมูลนักศึกษาของคุณ', 'error'); return; }

    var blocks = answerBlocks(f), payload = [], missing = 0;
    blocks.forEach(function (b) {
      itemsOf(b.set).forEach(function (it) {
        var v = s(st.ans[ansKey(b, it)]);
        var isText = s(it.input_type) === 'text';
        if (!isText && v === '') { missing++; return; }
        if (v === '') return;
        payload.push({
          form_code: s(f.form_code), dimension: b.dim, set_code: b.set,
          item_code: s(it.item_code), target_kind: b.kind || null, target_name: b.name || null,
          score: isText ? null : Number(v), text_answer: isText ? v : null
        });
      });
    });
    if (send && missing) { showToast('ยังตอบไม่ครบ เหลืออีก ' + missing + ' ข้อ', 'error'); return; }
    if (!payload.length) { showToast('ยังไม่ได้ตอบข้อใดเลย', 'error'); return; }

    try {
      var r = st.myResp[s(f.form_code)];
      if (!r) {
        var ins = await sbc().from('eval_response')
          .insert({ form_code: s(f.form_code), student_id: s(stu.student_id), status: 'ร่าง' })
          .select('form_code,status,response_key').single();
        if (ins.error) throw new Error(ins.error.message);
        r = ins.data; st.myResp[s(f.form_code)] = r;
      }
      var del = await sbc().from('eval_answer').delete().eq('response_key', r.response_key);
      if (del.error) throw new Error(del.error.message);

      for (var i = 0; i < payload.length; i += 400) {
        var chunk = payload.slice(i, i + 400).map(function (x) {
          return Object.assign({ response_key: r.response_key }, x);
        });
        var up = await sbc().from('eval_answer').insert(chunk);
        if (up.error) throw new Error(up.error.message);
      }

      if (send) {
        var fin = await sbc().from('eval_response')
          .update({ status: 'ส่งแล้ว', submitted_at: today() })
          .eq('response_key', r.response_key);
        if (fin.error) throw new Error(fin.error.message);
        r.status = 'ส่งแล้ว';
        showToast('ส่งแบบประเมินเรียบร้อย ขอบคุณครับ');
        st.doForm = ''; st.ans = {}; st.ansLoaded = false;
      } else {
        showToast('บันทึกร่างไว้แล้ว กลับมาทำต่อได้');
      }
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ · ' + (e.message || e), 'error');
    }
  };

  /* ---------------- ติดตามอัตราการตอบ (เจ้าหน้าที่) ---------------- */
  window.evalShowProgress = async function (code) {
    var f = formByCode(code);
    if (!f) return;
    showModal('อัตราการตอบ — ' + esc(s(f.subject_name)), loadingBox(), null, 'max-w-2xl');
    try {
      var rows = await rpc('ems_eval_respondents', { p_form: s(code) });
      var done = {}, nDraft = 0, nImport = 0;
      (rows || []).forEach(function (x) {
        if (s(x.status) === 'ส่งแล้ว') done[s(x.student_id)] = s(x.submitted_at) || '✓';
        else nDraft++;
        if (/^IMPORT-/.test(s(x.student_id))) nImport++;
      });
      var stus = get('student').filter(function (x) {
        var active = typeof isActiveStudent === 'function' ? isActiveStudent(x) : s(x.status) === 'กำลังศึกษา';
        return active && ownsForm(x, f);
      }).sort(function (a, b) { return s(a.student_id).localeCompare(s(b.student_id)); });

      var nDone = stus.filter(function (x) { return done[s(x.student_id)]; }).length;
      var pct = stus.length ? Math.round(nDone / stus.length * 1000) / 10 : 0;
      var waiting = stus.filter(function (x) { return !done[s(x.student_id)]; });

      showModal('อัตราการตอบ — ' + esc(s(f.subject_name)),
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">'
        + statCard('users', 'นักศึกษาในรายวิชา', stus.length, 'คน', 'bg-blue-500')
        + statCard('check-circle', 'ประเมินแล้ว', nDone, 'คน', 'bg-emerald-500')
        + statCard('percent', 'คิดเป็น', pct, '%', 'bg-sky-500')
        + statCard('file-text', 'บันทึกร่างค้างไว้', nDraft, 'คน', 'bg-amber-500')
        + '</div>'
        + (nImport ? '<p class="text-xs text-gray-500 mb-3">มีคำตอบที่นำเข้าจากไฟล์เดิมอีก ' + nImport + ' ชุด (ไม่นับรวมในอัตราการตอบข้างบน)</p>' : '')
        + '<p class="text-sm font-semibold text-gray-700 mb-2">ยังไม่ประเมิน (' + waiting.length + ' คน)</p>'
        + (waiting.length
          ? '<div class="border border-gray-100 rounded-xl overflow-auto" style="max-height:320px"><table class="w-full text-sm">'
          + '<thead class="sticky top-0"><tr class="bg-surface text-left">'
          + '<th class="px-3 py-2 font-semibold">รหัสนักศึกษา</th><th class="px-3 py-2 font-semibold">ชื่อ-สกุล</th></tr></thead><tbody>'
          + waiting.map(function (x) {
            return '<tr class="border-t border-gray-50"><td class="px-3 py-2 font-mono text-primary">'
              + esc(s(x.student_id)) + '</td><td class="px-3 py-2">'
              + esc(typeof studentDisplayName === 'function' ? studentDisplayName(x) : s(x.name)) + '</td></tr>';
          }).join('')
          + '</tbody></table></div>'
          : '<p class="text-sm text-emerald-600">ประเมินครบทุกคนแล้ว</p>')
        + '<p class="text-xs text-gray-400 mt-3">รายชื่อนี้บอกได้แค่ว่าใครประเมินแล้ว ไม่สามารถดูได้ว่าแต่ละคนให้คะแนนเท่าไร</p>',
        null, 'max-w-2xl');
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      showModal('อัตราการตอบ', warnBox('โหลดข้อมูลไม่สำเร็จ', String(e.message || e)), null, 'max-w-lg');
    }
  };

  /* ================================================================
     F3 — รายงานผลประเมิน
     ================================================================ */
  function rptState() {
    var st = state();
    if (!st.rpt) st.rpt = { code: '', data: null, comments: null, loading: false, error: '' };
    return st.rpt;
  }
  window.evalPickReport = function (code) {
    var r = rptState();
    r.code = s(code); r.data = null; r.comments = null; r.error = '';
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  function canReport() {
    var p = (APP.permissions && APP.permissions[APP.currentRole]) || {};
    return !!p.evalReport;
  }

  function reportPage() {
    if (!canReport()) return noPerm();
    var st = state(), r = rptState();
    var ys = yearsList();
    var list = forms().filter(function (f) {
      return s(f.academic_year) === st.year && s(f.semester) === st.sem;
    }).sort(function (a, b) {
      return (num(a.year_level) - num(b.year_level)) || s(a.subject_code).localeCompare(s(b.subject_code));
    });
    if (r.code && !list.some(function (f) { return s(f.form_code) === r.code; })) r.code = '';

    var bar = '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4">'
      + '<div class="flex flex-wrap items-end gap-3">'
      + selectHTML({
        label: 'ปีการศึกษา', icon: 'calendar', value: st.year, on: "evalSetState('year',this.value)",
        options: ys.length ? ys.map(function (y) { return [y, y]; }) : [[st.year, st.year || '-']]
      })
      + selectHTML({ label: 'ภาคการศึกษา', icon: 'layers', value: st.sem, on: "evalSetState('sem',this.value)", options: SEMS })
      + selectHTML({
        label: 'รายวิชา', icon: 'book-open', value: r.code, on: 'evalPickReport(this.value)', width: 'min-w-[22rem]',
        options: [['', '— เลือกรายวิชา —']].concat(list.map(function (f) {
          return [s(f.form_code), s(f.subject_code) + ' ' + s(f.subject_name)];
        }))
      })
      + (r.code && r.data && r.data.visible
        ? '<div class="ml-auto">' + btn('evalExportReport()', 'download', 'ส่งออกสรุป (CSV)', 'border border-gray-200 text-gray-700 hover:bg-gray-50') + '</div>'
        : '')
      + '</div></div>';

    var head = header('ภาพรวมผลประเมินรายวิชา', 'bar-chart-3',
      'ค่าเฉลี่ยและส่วนเบี่ยงเบนมาตรฐาน คิดจากคำตอบทั้งหมดในระบบทุกครั้งที่เปิดดู') + bar;

    if (!r.code) return head + emptyBox('เลือกรายวิชาเพื่อดูผลประเมิน');
    if (r.error) return head + warnBox('โหลดผลไม่สำเร็จ', r.error);
    if (!r.data) { loadReport(); return head + loadingBox('กำลังคำนวณผลประเมิน…'); }
    return head + reportBody(formByCode(r.code), r.data, r.comments);
  }

  async function loadReport() {
    var r = rptState();
    if (r.loading) return;
    r.loading = true;
    try {
      var d = await rpc('ems_eval_summary', { p_form: r.code });
      if (d && d.error) throw new Error(d.error === 'forbidden' ? 'บทบาทของคุณไม่มีสิทธิ์ดูรายงานนี้' : 'ไม่พบแบบประเมิน');
      r.data = d;
      if (d && d.visible) {
        try { r.comments = await rpc('ems_eval_comments', { p_form: r.code }); }
        catch (e2) { r.comments = []; }
      }
    } catch (e) { r.error = String(e.message || e); }
    r.loading = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }

  function meanCell(m, sd) {
    return '<td class="px-3 py-2 text-center font-semibold text-gray-800">' + fx(m) + '</td>'
      + '<td class="px-3 py-2 text-center text-gray-500">' + fx(sd) + '</td>'
      + '<td class="px-3 py-2 text-center">' + bandBadge(m) + '</td>';
  }
  function tableWrap(head, body, note) {
    return '<div class="bg-white rounded-2xl border border-blue-100 overflow-hidden mb-4">'
      + '<div class="px-4 py-3 border-b border-gray-100"><p class="font-semibold text-gray-800 text-sm">' + head + '</p>'
      + (note ? '<p class="text-xs text-gray-500 mt-0.5">' + esc(note) + '</p>' : '') + '</div>'
      + '<div class="overflow-x-auto">' + body + '</div></div>';
  }

  function reportBody(f, d, comments) {
    if (!d.visible) {
      return warnBox('ยังเปิดเผยผลไม่ได้ — มีผู้ตอบ ' + d.n + ' คน จากเกณฑ์ขั้นต่ำ ' + d.min + ' คน',
        'เกณฑ์นี้ตั้งไว้เพื่อไม่ให้ย้อนกลับไปเดาได้ว่าใครให้คะแนนเท่าไร ปรับได้ในหน้าตั้งค่าแบบประเมิน');
    }
    var dims = d.dimensions || [];
    var ovI = d.overall_item || {}, ovD = d.overall_dim || {};
    var main = s(d.mean_mode) === 'dimension' ? ovD.mean : ovI.mean;

    var dimRows = dims.map(function (x) {
      return '<tr class="border-t border-gray-50">'
        + '<td class="px-3 py-2"><span class="flex items-center gap-2">'
        + '<i data-lucide="' + (DIM_ICON[x.dimension] || 'circle') + '" class="w-4 h-4 text-primary"></i>'
        + esc(DIM_NAME[x.dimension] || x.dimension) + '</span></td>'
        + '<td class="px-3 py-2 text-center text-gray-500">' + x.n + '</td>'
        + meanCell(x.mean, x.sd) + '</tr>';
    }).join('');

    var byDim = {};
    (d.items_all || []).forEach(function (x) { (byDim[x.dimension] = byDim[x.dimension] || []).push(x); });
    var itemTables = Object.keys(byDim).map(function (k) {
      var rows = byDim[k].map(function (x, i) {
        return '<tr class="border-t border-gray-50">'
          + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
          + '<td class="px-3 py-2 font-mono text-primary whitespace-nowrap">' + esc(s(x.item_code)) + '</td>'
          + '<td class="px-3 py-2 text-xs text-gray-500">' + esc(s(x.section) || '—') + '</td>'
          + '<td class="px-3 py-2">' + esc(s(x.text) || '(ไม่พบข้อความคำถาม)') + '</td>'
          + '<td class="px-3 py-2 text-center text-gray-500">' + x.n + '</td>'
          + meanCell(x.mean, x.sd) + '</tr>';
      }).join('');
      return tableWrap('รายข้อ — ' + esc(DIM_NAME[k] || k),
        '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold text-center">ลำดับ</th>'
        + '<th class="px-3 py-2 font-semibold">รหัสข้อ</th><th class="px-3 py-2 font-semibold">หมวด</th>'
        + '<th class="px-3 py-2 font-semibold">ข้อคำถาม</th>'
        + '<th class="px-3 py-2 font-semibold text-center">จำนวนคำตอบ</th>'
        + '<th class="px-3 py-2 font-semibold text-center">Mean</th>'
        + '<th class="px-3 py-2 font-semibold text-center">SD</th>'
        + '<th class="px-3 py-2 font-semibold text-center">แปลผล</th></tr></thead><tbody>' + rows + '</tbody></table>');
    }).join('');

    function targetTable(kind, title) {
      var rows = (d.targets || []).filter(function (x) { return x.kind === kind; });
      if (!rows.length) return '';
      return tableWrap(title, '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold text-center">อันดับ</th>'
        + '<th class="px-3 py-2 font-semibold">ชื่อ</th>'
        + '<th class="px-3 py-2 font-semibold text-center">จำนวนคำตอบ</th>'
        + '<th class="px-3 py-2 font-semibold text-center">Mean</th>'
        + '<th class="px-3 py-2 font-semibold text-center">SD</th>'
        + '<th class="px-3 py-2 font-semibold text-center">แปลผล</th></tr></thead><tbody>'
        + rows.map(function (x, i) {
          return '<tr class="border-t border-gray-50">'
            + '<td class="px-3 py-2 text-center text-gray-400">' + (i + 1) + '</td>'
            + '<td class="px-3 py-2">' + esc(s(x.name)) + '</td>'
            + '<td class="px-3 py-2 text-center text-gray-500">' + x.n + '</td>'
            + meanCell(x.mean, x.sd) + '</tr>';
        }).join('') + '</tbody></table>',
        'เรียงจากค่าเฉลี่ยมากไปน้อย');
    }

    var cmt = (comments || []);
    var cmtBox = cmt.length
      ? tableWrap('ข้อเสนอแนะปลายเปิด <span class="font-normal text-gray-400">(' + cmt.length + ' ข้อความ)</span>',
        '<div class="divide-y divide-gray-50">' + cmt.map(function (x) {
          return '<div class="px-4 py-3">'
            + '<p class="text-xs text-gray-400 mb-0.5">' + esc(DIM_NAME[x.dimension] || x.dimension)
            + (s(x.target_name) ? ' · ' + esc(s(x.target_name)) : '') + '</p>'
            + '<p class="text-sm text-gray-700">' + esc(s(x.text_answer)) + '</p></div>';
        }).join('') + '</div>',
        'ไม่ระบุตัวผู้เขียน — ตารางคำตอบไม่เก็บรหัสนักศึกษา')
      : '';

    return '<div class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">'
      + statCard('users', 'ผู้ตอบ', d.n, 'คน', 'bg-blue-500')
      + statCard('calculator', 'ค่าเฉลี่ยรวมทุกด้าน', fx(main), bandOf(main)[1], 'bg-emerald-500')
      + statCard('sigma', 'SD รวมทุกด้าน', fx(ovI.sd), s(d.sd_mode) === 'population' ? '(n)' : '(n−1)', 'bg-sky-500')
      + statCard('layers', 'จำนวนด้านที่ประเมิน', dims.length, 'ด้าน', 'bg-purple-500')
      + '</div>'

      + '<div class="bg-white rounded-2xl border border-blue-100 p-4 mb-4">'
      + '<p class="font-semibold text-gray-800 text-sm mb-2">ค่าเฉลี่ยรวมทุกด้าน — แสดงทั้งสองวิธี</p>'
      + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'
      + '<div class="rounded-xl border ' + (s(d.mean_mode) !== 'dimension' ? 'border-primary bg-primaryLight' : 'border-gray-100') + ' p-3">'
      + '<p class="text-xs text-gray-600">ถ่วงน้ำหนักรายข้อ <span class="text-gray-400">(ตรงกับรายงานเดิม)</span>'
      + (s(d.mean_mode) !== 'dimension' ? ' · <b class="text-primary">ใช้เป็นค่าหลัก</b>' : '') + '</p>'
      + '<p class="text-2xl font-bold text-gray-800">' + fx(ovI.mean) + ' <span class="text-sm font-normal text-gray-500">SD ' + fx(ovI.sd) + '</span></p></div>'
      + '<div class="rounded-xl border ' + (s(d.mean_mode) === 'dimension' ? 'border-primary bg-primaryLight' : 'border-gray-100') + ' p-3">'
      + '<p class="text-xs text-gray-600">เฉลี่ยของค่าเฉลี่ยรายด้าน <span class="text-gray-400">(ทุกด้านน้ำหนักเท่ากัน)</span>'
      + (s(d.mean_mode) === 'dimension' ? ' · <b class="text-primary">ใช้เป็นค่าหลัก</b>' : '') + '</p>'
      + '<p class="text-2xl font-bold text-gray-800">' + fx(ovD.mean) + ' <span class="text-sm font-normal text-gray-500">จาก ' + (ovD.k || 0) + ' ด้าน</span></p></div>'
      + '</div>'
      + '<p class="text-xs text-gray-500 mt-2">สองค่าต่างกันเพราะด้านที่มีข้อมากกว่าจะมีน้ำหนักมากกว่าในวิธีแรก '
      + 'เปลี่ยนค่าหลักได้ในหน้าตั้งค่าแบบประเมิน</p></div>'

      + tableWrap('สรุปรายด้าน', '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold">ด้าน</th>'
        + '<th class="px-3 py-2 font-semibold text-center">จำนวนคำตอบ</th>'
        + '<th class="px-3 py-2 font-semibold text-center">Mean</th>'
        + '<th class="px-3 py-2 font-semibold text-center">SD</th>'
        + '<th class="px-3 py-2 font-semibold text-center">แปลผล</th></tr></thead><tbody>' + dimRows + '</tbody></table>')
      + targetTable('teacher', 'ผลประเมินอาจารย์ผู้สอน')
      + targetTable('site', 'ผลประเมินแหล่งฝึกภาคปฏิบัติ')
      + itemTables
      + cmtBox;
  }

  /* ---------------- ผลประเมินของอาจารย์เจ้าตัว ---------------- */
  function minePage() {
    var p = (APP.permissions && APP.permissions[APP.currentRole]) || {};
    if (!p.evalMine) return noPerm();
    var st = state();
    if (!st.mine) st.mine = { loaded: false, list: [], code: '', data: null, comments: null, error: '' };
    var m = st.mine;
    if (!m.loaded) { loadMyForms(); return header('ผลประเมินของฉัน', 'user-check', '') + loadingBox(); }
    if (m.error) return header('ผลประเมินของฉัน', 'user-check', '') + warnBox('โหลดข้อมูลไม่สำเร็จ', m.error);

    var head = header('ผลประเมินของฉัน', 'user-check',
      'ผลประเมินอาจารย์ผู้สอนเฉพาะของคุณ เทียบกับค่าเฉลี่ยของรายวิชา')
      + '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4">'
      + selectHTML({
        label: 'รายวิชา', icon: 'book-open', value: m.code, on: 'evalPickMine(this.value)', width: 'min-w-[24rem]',
        options: [['', '— เลือกรายวิชา —']].concat(m.list.map(function (x) {
          return [s(x.form_code), s(x.subject_code) + ' ' + s(x.subject_name) + ' · ' + s(x.semester) + '/' + s(x.academic_year)];
        }))
      })
      + '</div>';

    if (!m.list.length) return head + emptyBox('ยังไม่มีรายวิชาที่คุณถูกระบุเป็นอาจารย์ผู้สอนในแบบประเมิน');
    if (!m.code) return head + emptyBox('เลือกรายวิชาเพื่อดูผลของคุณ');
    if (!m.data) { loadMine(); return head + loadingBox('กำลังคำนวณผล…'); }
    return head + mineBody(m.data, m.comments);
  }

  async function loadMyForms() {
    var st = state(), m = st.mine;
    if (m.loading) return;
    m.loading = true;
    try { m.list = (await rpc('ems_eval_my_forms')) || []; }
    catch (e) { m.error = String(e.message || e); }
    m.loaded = true; m.loading = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }
  window.evalPickMine = function (code) {
    var m = state().mine;
    m.code = s(code); m.data = null; m.comments = null;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };
  async function loadMine() {
    var m = state().mine;
    if (m.loading2) return;
    m.loading2 = true;
    var me = who();
    try {
      var d = await rpc('ems_eval_summary', { p_form: m.code, p_teacher: me });
      if (d && d.error) throw new Error(d.error === 'forbidden' ? 'ชื่อของคุณในระบบไม่ตรงกับรายชื่อผู้สอนของแบบประเมินนี้' : 'ไม่พบแบบประเมิน');
      m.data = d;
      if (d && d.visible) {
        try { m.comments = await rpc('ems_eval_comments', { p_form: m.code, p_teacher: me }); }
        catch (e2) { m.comments = []; }
      }
    } catch (e) { m.error = String(e.message || e); }
    m.loading2 = false;
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  }

  function mineBody(d, comments) {
    if (!d.visible) {
      return warnBox('ยังเปิดเผยผลไม่ได้ — มีผู้ตอบ ' + d.n + ' คน จากเกณฑ์ขั้นต่ำ ' + d.min + ' คน');
    }
    var me = who();
    var mine = (d.targets || []).filter(function (x) { return x.kind === 'teacher' && s(x.name) === me; })[0];
    var all = (d.dimensions_all || []).filter(function (x) { return x.dimension === 'teacher'; })[0];
    var secs = (d.sections || []).filter(function (x) { return x.dimension === 'teacher'; });
    var items = (d.items || []).filter(function (x) { return x.dimension === 'teacher'; });

    var cmt = (comments || []);
    return '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">'
      + statCard('user-check', 'ค่าเฉลี่ยของคุณ', mine ? fx(mine.mean) : '-', mine ? bandOf(mine.mean)[1] : '', 'bg-emerald-500')
      + statCard('users', 'ค่าเฉลี่ยอาจารย์ทั้งรายวิชา', all ? fx(all.mean) : '-', '', 'bg-blue-500')
      + statCard('sigma', 'SD ของคุณ', mine ? fx(mine.sd) : '-', s(d.sd_mode) === 'population' ? '(n)' : '(n−1)', 'bg-sky-500')
      + '</div>'
      + (secs.length ? tableWrap('รายหมวด', '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold">หมวด</th>'
        + '<th class="px-3 py-2 font-semibold text-center">จำนวนคำตอบ</th>'
        + '<th class="px-3 py-2 font-semibold text-center">Mean</th>'
        + '<th class="px-3 py-2 font-semibold text-center">SD</th>'
        + '<th class="px-3 py-2 font-semibold text-center">แปลผล</th></tr></thead><tbody>'
        + secs.map(function (x) {
          return '<tr class="border-t border-gray-50"><td class="px-3 py-2">' + esc(s(x.section)) + '</td>'
            + '<td class="px-3 py-2 text-center text-gray-500">' + x.n + '</td>' + meanCell(x.mean, x.sd) + '</tr>';
        }).join('') + '</tbody></table>') : '')
      + (items.length ? tableWrap('รายข้อ', '<table class="w-full text-sm"><thead><tr class="bg-surface text-left">'
        + '<th class="px-3 py-2 font-semibold">รหัสข้อ</th><th class="px-3 py-2 font-semibold">หมวด</th>'
        + '<th class="px-3 py-2 font-semibold">ข้อคำถาม</th>'
        + '<th class="px-3 py-2 font-semibold text-center">จำนวนคำตอบ</th>'
        + '<th class="px-3 py-2 font-semibold text-center">Mean</th>'
        + '<th class="px-3 py-2 font-semibold text-center">SD</th>'
        + '<th class="px-3 py-2 font-semibold text-center">แปลผล</th></tr></thead><tbody>'
        + items.map(function (x) {
          return '<tr class="border-t border-gray-50">'
            + '<td class="px-3 py-2 font-mono text-primary whitespace-nowrap">' + esc(s(x.item_code)) + '</td>'
            + '<td class="px-3 py-2 text-xs text-gray-500">' + esc(s(x.section) || '—') + '</td>'
            + '<td class="px-3 py-2">' + esc(s(x.text)) + '</td>'
            + '<td class="px-3 py-2 text-center text-gray-500">' + x.n + '</td>'
            + meanCell(x.mean, x.sd) + '</tr>';
        }).join('') + '</tbody></table>') : '')
      + (cmt.length
        ? tableWrap('ข้อเสนอแนะถึงคุณ <span class="font-normal text-gray-400">(' + cmt.length + ')</span>',
          '<div class="divide-y divide-gray-50">' + cmt.map(function (x) {
            return '<div class="px-4 py-3 text-sm text-gray-700">' + esc(s(x.text_answer)) + '</div>';
          }).join('') + '</div>', 'ไม่ระบุตัวผู้เขียน')
        : '<p class="text-sm text-gray-400">ยังไม่มีข้อเสนอแนะที่เปิดให้คุณอ่าน</p>');
  }

  /* ================================================================
     F4 — นำเข้าคำตอบจากไฟล์เดิม และส่งออกรายงาน
     ================================================================ */
  function csvCell(v) {
    var x = String(v == null ? '' : v);
    return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }
  function csvDownload(name, rows) {
    var text = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  window.evalExportReport = function () {
    var r = rptState();
    if (!r.data || !r.data.visible) { showToast('ยังไม่มีผลให้ส่งออก', 'error'); return; }
    var f = formByCode(r.code), d = r.data;
    var rows = [
      ['รายงานสรุปผลประเมินรายวิชา'],
      ['รายวิชา', s(f.subject_code) + ' ' + s(f.subject_name)],
      ['ปีการศึกษา', s(f.academic_year), 'ภาคการศึกษา', s(f.semester)],
      ['จำนวนผู้ตอบ', d.n],
      ['วิธีคิด SD', s(d.sd_mode) === 'population' ? 'STDEVP (n)' : 'STDEV (n-1)'],
      ['ค่าเฉลี่ยรวมทุกด้าน (ถ่วงน้ำหนักรายข้อ)', fx((d.overall_item || {}).mean), 'SD', fx((d.overall_item || {}).sd)],
      ['ค่าเฉลี่ยรวมทุกด้าน (เฉลี่ยของค่าเฉลี่ยรายด้าน)', fx((d.overall_dim || {}).mean)],
      [],
      ['สรุปรายด้าน'], ['ด้าน', 'จำนวนคำตอบ', 'Mean', 'SD', 'แปลผล']
    ];
    (d.dimensions || []).forEach(function (x) {
      rows.push([DIM_NAME[x.dimension] || x.dimension, x.n, fx(x.mean), fx(x.sd), bandOf(x.mean)[1]]);
    });
    rows.push([], ['รายข้อ'], ['ด้าน', 'รหัสข้อ', 'หมวด', 'ข้อคำถาม', 'จำนวนคำตอบ', 'Mean', 'SD', 'แปลผล']);
    (d.items_all || []).forEach(function (x) {
      rows.push([DIM_NAME[x.dimension] || x.dimension, s(x.item_code), s(x.section), s(x.text), x.n, fx(x.mean), fx(x.sd), bandOf(x.mean)[1]]);
    });
    var tg = d.targets || [];
    if (tg.length) {
      rows.push([], ['รายอาจารย์ / รายแหล่งฝึก'], ['ประเภท', 'ชื่อ', 'จำนวนคำตอบ', 'Mean', 'SD', 'แปลผล']);
      tg.forEach(function (x) {
        rows.push([x.kind === 'site' ? 'แหล่งฝึก' : 'อาจารย์', s(x.name), x.n, fx(x.mean), fx(x.sd), bandOf(x.mean)[1]]);
      });
    }
    if ((r.comments || []).length) {
      rows.push([], ['ข้อเสนอแนะปลายเปิด (ไม่ระบุตัวผู้เขียน)'], ['ด้าน', 'เป้าหมาย', 'ข้อความ']);
      r.comments.forEach(function (x) {
        rows.push([DIM_NAME[x.dimension] || x.dimension, s(x.target_name), s(x.text_answer)]);
      });
    }
    csvDownload('สรุปผลประเมิน_' + s(f.subject_code) + '_' + s(f.academic_year) + '-' + s(f.semester) + '.csv', rows);
    showToast('ส่งออกไฟล์แล้ว');
  };

  /* ---------------- ตัวอ่าน CSV ---------------- */
  function parseCsv(text) {
    var rows = [], row = [], cur = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return s(x) !== ''; }); });
  }

  // ตัดเลขข้อนำหน้าและช่องว่างซ้ำ เพื่อเทียบข้อความคำถามจากไฟล์กับในคลังข้อคำถาม
  function normText(v) {
    return s(v).replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/\s+/g, ' ')
      .replace(/[​]/g, '').toLowerCase();
  }
  function headInfo(h) {
    h = s(h);
    var m = /^([\s\S]*?)\s*\[([\s\S]*)\]\s*$/.exec(h);
    var label = m ? s(m[1]) : h;
    var item = m ? s(m[2]) : '';
    var target = '';
    var t = /^([\s\S]*?)\s*\(([^()]*)\)\s*$/.exec(label);
    if (t) { label = s(t[1]); target = s(t[2]); }
    return { label: label, target: target, item: item, isText: !m };
  }
  function dimOfLabel(label) {
    if (/อาจารย์ผู้สอน/.test(label)) return 'teacher';
    if (/แหล่งฝึก/.test(label)) return 'site';
    if (/มีส่วนร่วม/.test(label)) return 'engage';
    if (/รายวิชา/.test(label)) return 'course';
    return '';
  }

  window.evalImportOpen = function () {
    var st = state();
    var f = formByCode(st.form);
    if (!f) return;
    showModal('นำเข้าคำตอบจากไฟล์เดิม — ' + esc(s(f.subject_name)),
      '<p class="text-sm text-gray-600 mb-2">ใช้ไฟล์ผลตอบแบบสอบถามจาก Google Forms '
      + 'โดยเปิดใน Google ชีต แล้วเลือก ไฟล์ → ดาวน์โหลด → <b>ค่าที่คั่นด้วยจุลภาค (.csv)</b></p>'
      + '<p class="text-xs text-gray-500 mb-3">ระบบจะจับคู่หัวคอลัมน์กับข้อคำถามในคลังให้เอง '
      + 'และ<b>ไม่นำเข้าคอลัมน์อีเมล</b> เก็บเพียงว่ามีผู้ตอบกี่ราย</p>'
      + '<input type="file" id="evalCsvFile" accept=".csv,text/csv" onchange="evalImportFile(event)" '
      + 'class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + '<div id="evalCsvMsg" class="text-xs text-gray-500 mt-2"></div>',
      null, 'max-w-2xl');
  };

  window.evalImportFile = async function (ev) {
    var file = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    var text = await file.text();
    window.evalImportPlan(text, file.name);
  };

  // อ่านไฟล์แล้วทำแผนนำเข้า พร้อมบอกเหตุผลรายคอลัมน์ที่ข้าม
  window.evalImportPlan = function (text, fileName) {
    var st = state();
    var f = formByCode(st.form);
    if (!f) return null;
    var rows = parseCsv(text);
    if (rows.length < 2) { showToast('ไฟล์ไม่มีข้อมูลคำตอบ', 'error'); return null; }

    var heads = rows[0], data = rows.slice(1);
    var setOf = { course: s(f.set_course), teacher: s(f.set_teacher), site: s(f.set_site), engage: s(f.set_engage) };
    var index = {};   // dimension → { normText → item }
    Object.keys(setOf).forEach(function (d) {
      if (!setOf[d]) return;
      index[d] = { rating: {}, text: null, codes: {} };
      itemsOf(setOf[d]).forEach(function (it) {
        if (s(it.input_type) === 'text') { if (!index[d].text) index[d].text = it; return; }
        index[d].rating[normText(it.statement_th)] = it;
        index[d].codes[normText(s(it.item_code))] = it;
      });
    });

    var cols = [], skipped = [], targets = { teacher: {}, site: {} };
    heads.forEach(function (h, ci) {
      var info = headInfo(h);
      var dim = dimOfLabel(info.label);
      if (!dim) { if (s(h)) skipped.push({ head: s(h), why: 'ไม่ใช่คอลัมน์ของแบบประเมิน (เช่น เวลา/อีเมล)' }); return; }
      if (!setOf[dim]) { skipped.push({ head: s(h), why: 'แบบประเมินนี้ไม่ได้เปิดด้าน ' + (DIM_NAME[dim] || dim) }); return; }
      var idx = index[dim];
      var it = null;
      if (info.isText) it = idx.text;
      else it = idx.rating[normText(info.item)] || idx.codes[normText(s(info.item).split(/\s+/)[0])] || null;
      if (!it) { skipped.push({ head: s(h), why: info.isText ? 'ชุดข้อคำถามไม่มีช่องข้อเสนอแนะ' : 'ไม่พบข้อคำถามนี้ในคลัง' }); return; }
      var kind = (dim === 'teacher' || dim === 'site') ? dim : '';
      if (kind && info.target) targets[kind][info.target] = 1;
      cols.push({ ci: ci, dim: dim, set: setOf[dim], item: s(it.item_code), kind: kind, name: kind ? info.target : '', isText: info.isText });
    });

    var have = {};
    targetsOf(f.form_code).forEach(function (t) { have[s(t.target_kind) + '\u0001' + s(t.target_name)] = 1; });
    var newTargets = [];
    ['teacher', 'site'].forEach(function (k) {
      Object.keys(targets[k]).forEach(function (n) { if (!have[k + '\u0001' + n]) newTargets.push({ kind: k, name: n }); });
    });

    var plan = { form: s(f.form_code), cols: cols, skipped: skipped, newTargets: newTargets, rows: data, file: fileName || '' };
    APP._evalImport = plan;

    var byDim = {};
    cols.forEach(function (c) { byDim[c.dim] = (byDim[c.dim] || 0) + 1; });

    showModal('ตรวจก่อนนำเข้า — ' + esc(s(f.subject_name)),
      '<div class="space-y-3">'
      + '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">'
      + statCard('users', 'ชุดคำตอบในไฟล์', data.length, 'ราย', 'bg-blue-500')
      + statCard('check-circle', 'คอลัมน์ที่จับคู่ได้', cols.length, 'คอลัมน์', 'bg-emerald-500')
      + statCard('alert-triangle', 'คอลัมน์ที่ข้าม', skipped.length, 'คอลัมน์', 'bg-amber-500')
      + '</div>'
      + '<div class="flex flex-wrap gap-1">' + Object.keys(byDim).map(function (k) {
        return badge((DIM_NAME[k] || k) + ' ' + byDim[k] + ' คอลัมน์', 'bg-blue-50 text-blue-700');
      }).join('') + '</div>'
      + (newTargets.length
        ? '<div class="bg-sky-50 border border-sky-100 rounded-xl p-3">'
        + '<p class="text-sm text-sky-800 mb-1">จะเพิ่มรายชื่อใหม่ให้ ' + newTargets.length + ' รายการ</p>'
        + '<p class="text-xs text-sky-700">' + esc(newTargets.map(function (t) { return t.name; }).join(' · ')) + '</p></div>'
        : '')
      + (skipped.length
        ? '<details class="border border-gray-100 rounded-xl"><summary class="cursor-pointer px-3 py-2 text-sm text-gray-700">'
        + 'ดูคอลัมน์ที่ข้าม (' + skipped.length + ')</summary>'
        + '<div class="px-3 pb-3 overflow-auto" style="max-height:220px"><table class="w-full text-xs">'
        + skipped.map(function (x) {
          return '<tr class="border-t border-gray-50"><td class="py-1 pr-2 text-gray-700">' + esc(x.head.slice(0, 80)) + '</td>'
            + '<td class="py-1 text-gray-400 whitespace-nowrap">' + esc(x.why) + '</td></tr>';
        }).join('') + '</table></div></details>'
        : '')
      + '<p class="text-xs text-gray-500">การนำเข้าจะเพิ่มชุดคำตอบใหม่ทับของเดิมไม่ได้ '
      + 'ถ้าเคยนำเข้าไฟล์นี้ไปแล้ว ให้กดล้างคำตอบที่นำเข้าก่อน</p>'
      + '<div>' + btn('evalImportClear()', 'trash-2', 'ล้างคำตอบที่เคยนำเข้าของวิชานี้', 'border border-red-200 text-red-600 hover:bg-red-50') + '</div>'
      + '<div id="evalImportMsg" class="text-sm text-gray-600"></div>'
      + '</div>',
      cols.length && data.length ? function () { return window.evalImportRun(); } : null, 'max-w-2xl');
    if (window.lucide) lucide.createIcons();
    return plan;
  };

  // แปลงหนึ่งแถวของไฟล์เป็นรายการคำตอบตามแผน
  window.evalImportRowPayload = function (plan, row) {
    var out = [];
    plan.cols.forEach(function (c) {
      var raw = s(row[c.ci]);
      if (raw === '') return;
      if (c.isText) {
        if (/^[-_.\s]*$/.test(raw) || raw === 'ไม่มี') return;
        out.push({ d: c.dim, s: c.set, i: c.item, k: c.kind || '', t: c.name || '', v: '', x: raw });
      } else {
        var v = parseFloat(raw);
        if (!isFinite(v)) return;
        out.push({ d: c.dim, s: c.set, i: c.item, k: c.kind || '', t: c.name || '', v: String(v), x: '' });
      }
    });
    return out;
  };

  window.evalImportRun = async function () {
    var plan = APP._evalImport;
    if (!plan) return;
    var msg = document.getElementById('evalImportMsg');
    function say(t) { if (msg) msg.textContent = t; }

    try {
      // เพิ่มรายชื่ออาจารย์/แหล่งฝึกที่ยังไม่มี เพื่อให้รายงานจับกลุ่มได้ถูก
      for (var i = 0; i < plan.newTargets.length; i++) {
        var t = plan.newTargets[i];
        await GSheetDB.create({
          type: 'eval_target', form_code: plan.form, target_kind: t.kind,
          target_name: t.name, sort_order: 90 + i, status: 'ใช้งาน', updated_by: who()
        }, { noRefresh: i < plan.newTargets.length - 1 });
      }

      var total = plan.rows.length, done = 0, CH = 10;
      for (var a = 0; a < total; a += CH) {
        var batch = plan.rows.slice(a, a + CH).map(function (r) {
          return { a: window.evalImportRowPayload(plan, r) };
        }).filter(function (x) { return x.a.length; });
        if (!batch.length) continue;
        var res = await rpc('ems_eval_import', { p_form: plan.form, p_rows: batch });
        if (res && res.error) throw new Error(res.error === 'forbidden' ? 'บทบาทของคุณไม่มีสิทธิ์นำเข้า' : res.error);
        done += batch.length;
        say('นำเข้าแล้ว ' + done + ' จาก ' + total + ' ชุด…');
      }
      APP._evalImport = null;
      closeModal();
      showToast('นำเข้าคำตอบเรียบร้อย ' + done + ' ชุด');
      await GSheetDB.refreshTab('eval_target');
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    } catch (e) {
      say('');
      showToast('นำเข้าไม่สำเร็จ · ' + (e.message || e), 'error');
    }
  };

  window.evalImportClear = async function () {
    var st = state();
    var code = (APP._evalImport && APP._evalImport.form) || s(st.form);
    if (!code) return;
    if (!confirm('ล้างคำตอบที่นำเข้าจากไฟล์ทั้งหมดของวิชานี้ใช่หรือไม่\n(คำตอบที่นักศึกษาตอบในระบบจะไม่ถูกลบ)')) return;
    try {
      var r = await rpc('ems_eval_import_clear', { p_form: code });
      if (r && r.error) throw new Error(r.error === 'forbidden' ? 'บทบาทของคุณไม่มีสิทธิ์' : r.error);
      showToast('ล้างคำตอบที่นำเข้าแล้ว ' + ((r && r.removed) || 0) + ' ชุด');
    } catch (e) { showToast('ล้างไม่สำเร็จ · ' + (e.message || e), 'error'); }
  };

  /* ---------------- หัวเรื่อง ---------------- */
  function header(title, icon, sub) {
    return '<div class="mb-4">'
      + '<h2 class="text-xl font-bold text-gray-800"><i data-lucide="' + icon + '" class="w-6 h-6 inline mr-2"></i>' + esc(title) + '</h2>'
      + (sub ? '<p class="text-sm text-gray-500 mt-1">' + esc(sub) + '</p>' : '')
      + '</div>';
  }

  /* ================= ต่อเข้ากับระบบเดิม ================= */
  // เมนูย่อยแต่ละอันเป็นหน้าของตัวเอง แถบเมนูซ้ายจึงไฮไลต์ถูกและปุ่มย้อนกลับของเบราว์เซอร์ทำงานตามปกติ
  var EV_PAGES = {
    evalDo: doPage, evalReport: reportPage, evalMine: minePage,
    evalSetup: setupPage, evalBank: bankPage
  };
  window.evalPages = EV_PAGES;

  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (EV_PAGES[page]) { state().tab = page; return EV_PAGES[page](); }
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    // แทรกปุ่มเมนูให้ปลอดภัย
    //   เมนูอ้างอิงบางตัวอยู่ในกลุ่มที่พับได้ จึงไม่ใช่ลูกโดยตรงของแถบเมนู
    //   ต้องไต่ขึ้นไปหาบรรพบุรุษที่เป็นลูกของแถบเมนูก่อน ไม่งั้น insertBefore จะล้มเหลว
    function insertNav(nav, el, selector) {
      var ref = nav.querySelector(selector);
      while (ref && ref.parentNode && ref.parentNode !== nav) ref = ref.parentNode;
      if (ref && ref.parentNode === nav) nav.insertBefore(el, ref);
      else nav.appendChild(el);
    }

    var orig = window.buildSidebar;
    if (typeof orig !== 'function') return;
    window.buildSidebar = function () {
      orig.apply(this, arguments);
      try { addItem(); } catch (e) { console.warn('เพิ่มเมนู ประเมินผลรายวิชา ไม่สำเร็จ:', e); }
    };

    // [หน้า, ชื่อเมนู, สิทธิ์ที่ต้องมี]
    var EV_SUB = [
      ['evalDo', 'ประเมินรายวิชา', 'evalDo'],
      ['evalReport', 'ภาพรวมผลประเมิน', 'evalReport'],
      ['evalMine', 'ผลประเมินของฉัน', 'evalMine'],
      ['evalSetup', 'ตั้งค่าแบบประเมิน', 'evalSetup'],
      ['evalBank', 'คลังข้อคำถาม', 'evalSetup']
    ];
    var NAV_CLASS = 'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface hover:text-primary transition';

    function addItem() {
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.evalCourse) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-eval-menu]')) return;

      var subs = EV_SUB.filter(function (x) { return perms[x[2]]; });
      if (!subs.length) return;
      var here = APP.currentPage;
      var anchor = '[data-page="ploAssess"], [data-page="survey"], [data-page="services"]';

      // มีเมนูเดียว (นักศึกษา/อาจารย์) ก็ไม่ต้องทำเป็นกลุ่มพับให้กดสองครั้ง
      if (subs.length === 1) {
        var one = document.createElement('button');
        one.setAttribute('onclick', "navigateTo('" + subs[0][0] + "')");
        one.setAttribute('data-page', subs[0][0]);
        one.setAttribute('data-eval-menu', '1');
        one.className = NAV_CLASS;
        one.innerHTML = '<i data-lucide="star" class="w-5 h-5 flex-shrink-0"></i>' + subs[0][1];
        insertNav(nav, one, anchor);
        if (window.lucide) lucide.createIcons();
        return;
      }

      var open = subs.some(function (x) { return x[0] === here; });
      var box = document.createElement('div');
      box.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
      box.setAttribute('data-eval-menu', '1');
      box.innerHTML =
        '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
        + '<span class="flex items-center gap-3"><i data-lucide="star" class="w-5 h-5 flex-shrink-0"></i>ประเมินผลรายวิชา</span>'
        + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"' + (open ? ' style="transform:rotate(180deg)"' : '') + '></i>'
        + '</button>'
        + '<div class="dropdown-menu ml-8 mt-1 space-y-1">'
        + subs.map(function (x) {
          var on = here === x[0];
          return '<button onclick="navigateTo(\'' + x[0] + '\')" data-page="' + x[0] + '" '
            + 'class="nav-item w-full text-left px-3 py-2 rounded-lg text-sm transition '
            + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-600 hover:bg-surface hover:text-primary') + '">'
            + x[1] + '</button>';
        }).join('')
        + '</div>';
      insertNav(nav, box, anchor);
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
