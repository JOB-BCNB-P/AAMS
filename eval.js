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
      APP._eval = { tab: 'setup', year: '', sem: '1', set: '', form: '', draft: null };
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
      + '<div class="flex gap-2">'
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

  /* ---------------- หัวเรื่อง ---------------- */
  function header(title, icon, sub) {
    return '<div class="mb-4">'
      + '<h2 class="text-xl font-bold text-gray-800"><i data-lucide="' + icon + '" class="w-6 h-6 inline mr-2"></i>' + esc(title) + '</h2>'
      + (sub ? '<p class="text-sm text-gray-500 mt-1">' + esc(sub) + '</p>' : '')
      + '</div>';
  }

  /* ================= ต่อเข้ากับระบบเดิม ================= */
  var EV_PAGES = { evalSetup: 'setup', evalBank: 'bank' };
  window.evalPages = EV_PAGES;

  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (page === 'evalSetup') { state().tab = 'setup'; return setupPage(); }
      if (page === 'evalBank') { state().tab = 'bank'; return bankPage(); }
      return orig.apply(this, arguments);
    };
  })();

  (function () {
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
      try { addItem(); } catch (e) { console.warn('เพิ่มเมนู ประเมินผลรายวิชา ไม่สำเร็จ:', e); }
    };

    var EV_SUB = [['evalSetup', 'ตั้งค่าแบบประเมิน'], ['evalBank', 'คลังข้อคำถาม']];

    function addItem() {
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.evalCourse) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-page="evalSetup"]')) return;

      var here = APP.currentPage;
      var open = EV_SUB.some(function (x) { return x[0] === here; });
      var box = document.createElement('div');
      box.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
      box.setAttribute('data-eval-menu', '1');
      box.innerHTML =
        '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
        + '<span class="flex items-center gap-3"><i data-lucide="star" class="w-5 h-5 flex-shrink-0"></i>ประเมินผลรายวิชา</span>'
        + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"' + (open ? ' style="transform:rotate(180deg)"' : '') + '></i>'
        + '</button>'
        + '<div class="dropdown-menu ml-8 mt-1 space-y-1">'
        + EV_SUB.map(function (x) {
          var on = here === x[0];
          return '<button onclick="navigateTo(\'' + x[0] + '\')" data-page="' + x[0] + '" '
            + 'class="nav-item w-full text-left px-3 py-2 rounded-lg text-sm transition '
            + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-600 hover:bg-surface hover:text-primary') + '">'
            + x[1] + '</button>';
        }).join('')
        + '</div>';
      insertNav(nav, box, '[data-page="ploAssess"], [data-page="survey"], [data-page="services"]');
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
