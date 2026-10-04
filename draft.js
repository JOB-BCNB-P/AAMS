/* ================================================================
   draft.js — เก็บข้อมูลที่กรอกค้างไว้ ไม่ให้หายเมื่อสลับหน้าจอ
   ----------------------------------------------------------------
   ทำงานกับทุกฟอร์มที่มี id (<form id="...">) ทั้งในหน้าต่างเพิ่ม/แก้ไข และในหน้าเต็ม
   เช่น แบบประเมินความพึงพอใจ ใบลา ฟอร์มเพิ่มข้อมูลทุกเมนู

   • ขณะพิมพ์/ติ๊ก  จำเฉพาะช่องที่ผู้ใช้เปลี่ยนจากค่าเริ่มต้น (ฝากไว้ในแท็บนี้)
   • เปิดฟอร์มเดิมอีกครั้ง  เติมค่าที่ค้างไว้กลับให้ พร้อมแถบแจ้ง และปุ่ม "ล้างแล้วเริ่มใหม่"
   • บันทึกสำเร็จ  ลบร่างของฟอร์มนั้นทิ้ง
   • ออกจากระบบ  ลบร่างทั้งหมด

   แยกร่างตาม ผู้ใช้ + หน้า + id ฟอร์ม + "ค่าเริ่มต้นของฟอร์ม"
   ฟอร์มแก้ไขของนักศึกษาคนละคนจึงไม่ปนกัน (ค่าเริ่มต้นต่างกัน)

   ที่เก็บ : sessionStorage — อยู่เฉพาะแท็บนี้ ปิดแท็บแล้วหาย, เก็บไม่เกิน 12 ชั่วโมง
   ไม่เก็บ : รหัสผ่าน ไฟล์แนบ ช่องซ่อน และช่องที่ใส่ data-nodraft
   ระบบให้คำปรึกษา (counsel.js) ไม่ได้ใช้ <form> จึงมีที่เก็บร่างของตัวเอง
   ================================================================ */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var STORE = 'aams_form_drafts_v1';
  var TTL = 12 * 3600 * 1000;
  var MAX = 40;
  var mem = {};

  function loadAll() {
    try { var o = JSON.parse(sessionStorage.getItem(STORE) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return mem; }
  }
  function saveAll(all) {
    var now = Date.now();
    Object.keys(all).forEach(function (k) { if (!all[k] || now - all[k].t > TTL) delete all[k]; });
    var ks = Object.keys(all).sort(function (a, b) { return all[b].t - all[a].t; });
    ks.slice(MAX).forEach(function (k) { delete all[k]; });
    mem = all;
    try { sessionStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { /* ใช้หน่วยความจำแทน */ }
  }
  function getDraft(key) { var d = loadAll()[key]; return (d && Date.now() - d.t <= TTL) ? d : null; }
  function putDraft(key, v) { var all = loadAll(); all[key] = { t: Date.now(), v: v }; saveAll(all); }
  function dropDraft(key) { var all = loadAll(); if (all[key]) { delete all[key]; saveAll(all); } }
  window.emsDraftClearAll = function () { mem = {}; try { sessionStorage.removeItem(STORE); } catch (e) { } };

  /* ---------- อ่าน/เขียนค่าในฟอร์ม ---------- */
  var SKIP_TYPES = /^(file|password|hidden|submit|button|reset|image)$/i;
  function fields(form) {
    return Array.prototype.filter.call(form.elements || [], function (el) {
      if (!(el.name || el.id)) return false;
      if (SKIP_TYPES.test(el.type || '')) return false;
      if (el.closest && el.closest('[data-nodraft]')) return false;
      return /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    });
  }
  function fkey(el) {
    if (el.type === 'radio') return 'r:' + (el.name || el.id);
    if (el.type === 'checkbox') return 'c:' + (el.id || (el.name + '=' + el.value));
    return 'v:' + (el.id || el.name);
  }
  function readForm(form) {
    var o = {};
    fields(form).forEach(function (el) {
      var k = fkey(el);
      if (el.type === 'radio') { if (!(k in o)) o[k] = ''; if (el.checked) o[k] = el.value; }
      else if (el.type === 'checkbox') o[k] = el.checked ? '1' : '';
      else if (el.multiple && el.selectedOptions) o[k] = Array.prototype.map.call(el.selectedOptions, function (x) { return x.value; }).join('\u0001');
      else o[k] = el.value;
    });
    return o;
  }
  function cssEsc(v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/(["\\\]\[#.:])/g, '\\$1'); }
  // หาช่องใหม่ทุกครั้ง เพราะบางช่องสั่งวาดฟอร์มใหม่เมื่อค่าเปลี่ยน
  function findEls(form, k) {
    var kind = k.slice(0, 2), id = k.slice(2);
    var all = fields(form);
    if (kind === 'r:') return all.filter(function (el) { return el.type === 'radio' && (el.name || el.id) === id; });
    if (kind === 'c:') return all.filter(function (el) { return el.type === 'checkbox' && (el.id || (el.name + '=' + el.value)) === id; });
    return all.filter(function (el) { return el.type !== 'radio' && el.type !== 'checkbox' && (el.id || el.name) === id; });
  }
  function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) { } }
  function setValue(form, k, val) {
    var els = findEls(form, k);
    if (!els.length) return false;
    var kind = k.slice(0, 2), changed = null;
    if (kind === 'r:') {
      els.forEach(function (el) { var on = el.value === val; if (el.checked !== on) { el.checked = on; if (on) changed = el; } });
      if (!val) els.forEach(function (el) { el.checked = false; });
    } else if (kind === 'c:') {
      var on = val === '1'; if (els[0].checked !== on) { els[0].checked = on; changed = els[0]; }
    } else {
      var el = els[0];
      if (el.multiple) {
        var want = String(val).split('\u0001');
        Array.prototype.forEach.call(el.options, function (o) { o.selected = want.indexOf(o.value) >= 0; });
        changed = el;
      } else if (el.value !== val) {
        if (el.tagName === 'SELECT' && !Array.prototype.some.call(el.options, function (o) { return o.value === val; })) return false;
        el.value = val; changed = el;
      }
    }
    if (changed) { fire(changed, 'input'); fire(changed, 'change'); }
    return true;
  }

  /* ---------- กุญแจของร่าง ---------- */
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  // APP ประกาศด้วย const ใน app.js จึงไม่ได้เป็นคุณสมบัติของ window ต้องอ้างชื่อตรง ๆ
  function app() { try { return (typeof APP !== 'undefined' && APP) || null; } catch (e) { return null; } }
  function who() {
    var a = app() || {}, u = a.currentUser || {};
    return String(u.email || u.name || '') + '@' + String(a.currentRole || '');
  }
  function dataAttrs(form) {
    var o = {};
    Object.keys(form.dataset || {}).forEach(function (k) { if (k.indexOf('emsDraft') !== 0) o[k] = form.dataset[k]; });
    return o;
  }

  /* ---------- แถบแจ้งกู้ข้อมูล ---------- */
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function showNote(form, t) {
    if (form.querySelector('.ems-draft-note')) return;
    var n = document.createElement('div');
    n.className = 'ems-draft-note mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex flex-wrap items-center gap-2';
    n.setAttribute('data-nodraft', '1');
    n.innerHTML = '<span class="flex-1 min-w-0">นำข้อมูลที่กรอกค้างไว้ (เวลา ' + hhmm(t) + ' น.) กลับมาให้แล้ว ทำต่อได้เลย · ยังไม่ได้บันทึกจนกว่าจะกดบันทึก</span>'
      + '<button type="button" class="px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 text-xs hover:bg-amber-100">ล้างแล้วเริ่มใหม่</button>';
    n.querySelector('button').addEventListener('click', function () { resetForm(form); });
    form.insertBefore(n, form.firstChild);
  }
  function resetForm(form) {
    var init = form._emsInit || {};
    Object.keys(init).forEach(function (k) { setValue(form, k, init[k]); });
    dropDraft(form.dataset.emsDraftKey);
    var n = form.querySelector('.ems-draft-note'); if (n) n.remove();
  }

  /* ---------- ผูกกับฟอร์มที่เพิ่งปรากฏ ---------- */
  var lastRestore = {};
  function attach(form) {
    if (!form || !form.id || form.dataset.emsDraftKey || form.hasAttribute('data-nodraft')) return;
    var init = readForm(form);
    form._emsInit = init;
    var page = String((app() || {}).currentPage || '');
    var key = who() + '|' + page + '|' + form.id + '|' + hash(JSON.stringify(init) + JSON.stringify(dataAttrs(form)));
    form.dataset.emsDraftKey = key;

    var d = getDraft(key);
    if (!d || !d.v || !Object.keys(d.v).length) return;
    // กันวนซ้ำ : เติมค่าแล้วฟอร์มสั่งวาดตัวเองใหม่ อย่าเติมซ้ำในทันที
    if (lastRestore[key] && Date.now() - lastRestore[key] < 500) return;
    lastRestore[key] = Date.now();
    var missing = [];
    Object.keys(d.v).forEach(function (k) { if (!setValue(form, k, d.v[k])) missing.push(k); });
    showNote(form, d.t);
    // ช่องที่โหลดตามมาทีหลัง (เช่น รายการที่ดึงจากเซิร์ฟเวอร์) ลองเติมอีกครั้ง
    if (missing.length) {
      [600, 1600].forEach(function (ms) {
        setTimeout(function () {
          if (!document.contains(form)) return;
          var now = readForm(form);
          missing = missing.filter(function (k) {
            if (now[k] !== undefined && now[k] !== init[k]) return false;   // ผู้ใช้แก้เองแล้ว
            return !setValue(form, k, d.v[k]);
          });
        }, ms);
      });
    }
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'FORM') attach(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('form[id]'), attach);
  }
  var pendingScan = [];
  var mo = new MutationObserver(function (list) {
    list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes || [], function (n) { if (n.nodeType === 1) pendingScan.push(n); }); });
    if (pendingScan.length === 0) return;
    // รอให้โค้ดที่วาดฟอร์มเติมค่าเริ่มต้นให้เสร็จก่อน (หลายฟอร์มเติมค่าหลัง showModal ทันที)
    setTimeout(function () {
      var nodes = pendingScan; pendingScan = [];
      nodes.forEach(function (n) { if (document.contains(n)) scan(n); });
    }, 60);
  });
  function start() {
    mo.observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  /* ---------- จำค่าทุกครั้งที่ผู้ใช้เปลี่ยน ---------- */
  var timers = {};
  function onEdit(e) {
    if (!e.isTrusted) return;
    var el = e.target, form = el && el.form;
    if (!form || !form.dataset || !form.dataset.emsDraftKey) return;
    if (el.closest && el.closest('[data-nodraft]')) return;
    var key = form.dataset.emsDraftKey;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      if (!document.contains(form)) return;
      var init = form._emsInit || {}, now = readForm(form), diff = {};
      Object.keys(now).forEach(function (k) { if (now[k] !== init[k]) diff[k] = now[k]; });
      if (Object.keys(diff).length) putDraft(key, diff); else dropDraft(key);
    }, 250);
  }
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);

  /* ---------- บันทึกสำเร็จ → ลบร่าง ----------
     จำว่าผู้ใช้กดปุ่ม/ส่งฟอร์มในพื้นที่ไหน (หน้าต่าง หรือหน้าหลัก) แล้วรอผลการบันทึก
     บางฟอร์มปิดหน้าต่างก่อนบันทึกเสร็จ จึงจำกุญแจไว้ตั้งแต่ตอนกด */
  var pending = { keys: [], t: 0 };
  function remember(target) {
    var zone = target && target.closest && (target.closest('#modalContainer') || target.closest('#mainContent'));
    if (!zone) return;
    var keys = Array.prototype.map.call(zone.querySelectorAll('form[data-ems-draft-key]'), function (f) { return f.dataset.emsDraftKey; });
    if (keys.length) pending = { keys: keys, t: Date.now() };
  }
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return;
    var b = e.target && e.target.closest && e.target.closest('button,[type="submit"]');
    if (b) remember(b);
  }, true);
  document.addEventListener('submit', function (e) { remember(e.target); }, true);

  function onSaved() {
    if (!pending.keys.length || Date.now() - pending.t > 30000) return;
    pending.keys.forEach(function (k) {
      dropDraft(k);
      var f = document.querySelector('form[data-ems-draft-key="' + cssEsc(k) + '"]');
      if (f) { var n = f.querySelector('.ems-draft-note'); if (n) n.remove(); }
    });
    pending = { keys: [], t: 0 };
  }
  function wrapDb() {
    var db = window.GSheetDB;
    if (!db || db.__emsDraftWrapped) return;
    ['create', 'createMany', 'update', 'updateMany', 'appendNoRefresh', 'surveySubmit'].forEach(function (m) {
      var orig = db[m];
      if (typeof orig !== 'function') return;
      db[m] = function () {
        var r = orig.apply(this, arguments);
        if (r && typeof r.then === 'function') {
          r.then(function (res) { if (res && res.isOk) onSaved(); }, function () { });
        }
        return r;
      };
    });
    db.__emsDraftWrapped = true;
  }
  wrapDb();

  /* ---------- ออกจากระบบ → ลบร่างทั้งหมด ---------- */
  var origLogout = window.emsConfirmLogout;
  if (typeof origLogout === 'function') {
    window.emsConfirmLogout = function () {
      window.emsDraftClearAll();
      try { sessionStorage.removeItem('aams_counsel_draft'); } catch (e) { }
      return origLogout.apply(this, arguments);
    };
  }

  // ให้ชุดทดสอบเรียกใช้ได้
  window.__emsDraft = { readForm: readForm, setValue: setValue, attach: attach, getDraft: getDraft, putDraft: putDraft, dropDraft: dropDraft, onSaved: onSaved, remember: remember };
})();
