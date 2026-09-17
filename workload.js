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

  // ชื่อ ลำดับ และสัดส่วน ตามเอกสารหลักสูตร ข้อ 1.6 การกำหนดภาระงานของนักศึกษา
  //   ด้านวิชาการ 40% · ด้านวิจัย 10% · ด้านบริการวิชาการ 15% · ด้านกิจการนักศึกษา 15% · ใช้ชีวิตส่วนตัว 20%
  // key/field เดิมไม่เปลี่ยน ข้อมูลที่บันทึกไว้แล้วจึงใช้ต่อได้ทั้งหมด
  var MISSIONS = [
    { key: 'teaching', field: 'teaching_json', wkey: 'w_teaching', def: 0.40, label: 'พันธกิจด้านวิชาการ', short: 'ด้านวิชาการ', color: '#1e6fba', bg: 'bg-blue-50', text: 'text-blue-700', subject: true },
    { key: 'research', field: 'research_json', wkey: 'w_research', def: 0.10, label: 'พันธกิจด้านวิจัย', short: 'ด้านวิจัย', color: '#9061f9', bg: 'bg-purple-50', text: 'text-purple-700' },
    // timed : กรอกเป็นช่วงวันที่และช่วงเวลา แล้วให้ระบบคิดจำนวนชั่วโมงให้
    { key: 'service', field: 'service_json', wkey: 'w_service', def: 0.15, label: 'พันธกิจด้านบริการวิชาการ', short: 'บริการวิชาการ', color: '#0e9f6e', bg: 'bg-emerald-50', text: 'text-emerald-700', timed: true },
    { key: 'student', field: 'student_json', wkey: 'w_student', def: 0.15, label: 'พันธกิจด้านกิจการนักศึกษา', short: 'กิจการนักศึกษา', color: '#e3a008', bg: 'bg-amber-50', text: 'text-amber-700', timed: true },
    { key: 'personal', field: 'personal_json', wkey: 'w_personal', def: 0.20, label: 'การใช้ชีวิตส่วนตัว', short: 'ใช้ชีวิตส่วนตัว', color: '#6b7280', bg: 'bg-gray-50', text: 'text-gray-600' }
  ];
  var ACT_KINDS = ['กิจกรรมที่', 'กิจกรรมโครงการ', 'กิจกรรมพิเศษ'];
  var SEMS = ['1', '2', '3'];

  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fx(v) { return String(Math.round(n(v) * 100) / 100); }
  function get(t) { return (typeof getDataByType === 'function' ? getDataByType(t) : []) || []; }
  function semName(s) { return String(s) === '3' ? 'ฤดูร้อน' : String(s); }
  function missionOf(key) { return MISSIONS.filter(function (m) { return m.key === key; })[0] || null; }
  // ข้อความสั้น ๆ บอกช่วงวันเวลาของกิจกรรม ใช้ในหน้ารายละเอียดและไฟล์ส่งออก
  function spanText(r) {
    if (!r) return '';
    var p1 = isoParts(r.date_from), p2 = isoParts(r.date_to);
    var dpart = '';
    if (p1 && p2 && norm(r.date_from) !== norm(r.date_to)) {
      // ย่อให้อ่านง่ายเมื่ออยู่เดือนเดียวกันหรือปีเดียวกัน
      if (p1.y === p2.y && p1.m === p2.m) dpart = p1.d + '-' + p2.d + ' ' + TH_MON[p2.m - 1] + ' ' + (p2.y + 543);
      else if (p1.y === p2.y) dpart = p1.d + ' ' + TH_MON[p1.m - 1] + ' - ' + p2.d + ' ' + TH_MON[p2.m - 1] + ' ' + (p2.y + 543);
      else dpart = isoToThText(r.date_from) + ' ถึง ' + isoToThText(r.date_to);
    } else {
      dpart = isoToThText(r.date_from) || isoToThText(r.date_to);
    }
    var t1 = thTime(r.time_from), t2 = thTime(r.time_to);
    var tpart = t1 && t2 ? t1 + '-' + t2 + ' น.' : (t1 || t2 ? (t1 || t2) + ' น.' : '');
    return [dpart, tpart].filter(function (x) { return x; }).join(' · ');
  }

  /* ---------------- คิดชั่วโมงจากช่วงวันที่และช่วงเวลา ----------------
     กิจกรรมบริการวิชาการและกิจการนักศึกษามักจัดเป็นช่วง เช่น 3 วัน วันละ 08.00-12.00
     จึงให้กรอกวันที่-วันที่ และเวลา-เวลา แล้วคิดเป็น (จำนวนวัน x ชั่วโมงต่อวัน)
     - กรอกวันที่เดียวหรือไม่กรอกวันที่เลย ถือเป็น 1 วัน
     - เวลาสิ้นสุดก่อนเวลาเริ่ม ถือว่ากิจกรรมข้ามเที่ยงคืน และบอกไว้บนหน้าจอให้เห็นชัด
     - ถ้าข้อมูลไม่พอหรือขัดกัน จะไม่เดาตัวเลขให้ แต่บอกว่าติดอะไร */
  var SPAN_FIELDS = ['date_from', 'date_to', 'time_from', 'time_to'];

  /* ---------------- วันที่ : กรอกและอ่านเป็นปี พ.ศ. ----------------
     เก็บลงฐานข้อมูลเป็น ค.ศ. รูปแบบ YYYY-MM-DD เหมือนเดิม เพื่อเรียงและคำนวณได้ถูก
     แต่ทุกจุดที่คนอ่านหรือกรอก ใช้ปี พ.ศ. ตามที่ใช้กันในเอกสารราชการ
     ช่องกรอกรับ 3/11/2568 · 03/11/68 · 2568-11-03 และปฏิเสธปีที่ไม่ใช่ พ.ศ. */
  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function pad2(x) { return (x < 10 ? '0' : '') + x; }
  function isoParts(v) {
    var mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm(v));
    return mm ? { y: +mm[1], m: +mm[2], d: +mm[3] } : null;
  }
  // ค.ศ. -> ข้อความในช่องกรอก วว/ดด/ปปปป (พ.ศ.)
  function isoToTh(v) {
    var p = isoParts(v);
    return p ? pad2(p.d) + '/' + pad2(p.m) + '/' + (p.y + 543) : '';
  }
  // ค.ศ. -> ข้อความอ่านง่าย 3 พ.ย. 2568
  function isoToThText(v) {
    var p = isoParts(v);
    return p ? p.d + ' ' + TH_MON[p.m - 1] + ' ' + (p.y + 543) : '';
  }
  // ข้อความที่คนกรอก (ปี พ.ศ.) -> ค.ศ. ; อ่านไม่ออกคืนค่าว่าง ไม่เดาให้
  function thToIso(v) {
    var t = norm(v).replace(/[.\u2013\u2014]/g, '-').replace(/\s+/g, '');
    var mm, y, mo, d;
    if ((mm = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(t))) { y = +mm[1]; mo = +mm[2]; d = +mm[3]; }
    else if ((mm = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/.exec(t))) { d = +mm[1]; mo = +mm[2]; y = +mm[3]; }
    else return '';
    if (y < 100) y += 2500;                 // 68 หมายถึง 2568
    if (y < 2400 || y > 2600) return '';    // ต้องเป็นปี พ.ศ.
    y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }
  // เวลาแบบไทย 08.00
  function thTime(v) {
    var mm = /^(\d{1,2}):(\d{2})/.exec(norm(v));
    return mm ? pad2(+mm[1]) + '.' + mm[2] : '';
  }
  function dayNum(v) {
    var mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm(v));
    if (!mm) return null;
    return Date.UTC(+mm[1], +mm[2] - 1, +mm[3]);
  }
  function minOfDay(v) {
    var mm = /^(\d{1,2}):(\d{2})/.exec(norm(v));
    if (!mm) return null;
    var h = +mm[1], mi = +mm[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function spanCalc(r) {
    var out = { days: 0, perDay: 0, hours: 0, overnight: false, err: '', ready: false };
    var tf = minOfDay(r.time_from), tt = minOfDay(r.time_to);
    var df = dayNum(r.date_from), dt = dayNum(r.date_to);
    if (tf === null || tt === null) { out.err = 'กรอกเวลาเริ่มและเวลาสิ้นสุดเพื่อให้คิดชั่วโมงให้'; return out; }
    var mins = tt - tf;
    if (mins === 0) { out.err = 'เวลาเริ่มกับเวลาสิ้นสุดตรงกัน'; return out; }
    if (mins < 0) { mins += 1440; out.overnight = true; }
    out.perDay = Math.round(mins / 60 * 100) / 100;
    // ยังกรอกวันที่ไม่ครบรูปแบบ ถือว่ายังไม่รู้จำนวนวัน จึงไม่คิดให้
    if (norm(r.date_from_in) || norm(r.date_to_in)) {
      out.err = 'กรอกวันที่เป็น วว/ดด/ปปปป (พ.ศ.) เช่น 3/11/2568';
      return out;
    }
    if (df !== null && dt !== null) {
      if (dt < df) { out.err = 'วันที่สิ้นสุดอยู่ก่อนวันที่เริ่ม'; return out; }
      out.days = Math.round((dt - df) / 86400000) + 1;
    } else {
      out.days = 1;
    }
    out.hours = Math.round(out.perDay * out.days * 100) / 100;
    out.ready = true;
    return out;
  }
  // คำอธิบายใต้ช่องกรอก บอกที่มาของตัวเลขให้ตรวจได้
  function spanNote(r) {
    var manual = norm(r.hours_manual) === '1';
    var c = spanCalc(r);
    if (manual) {
      return '<span class="text-gray-500">กรอกชั่วโมงเอง ' + fx(r.hours) + ' ชม.</span>'
        + (c.ready ? ' <span class="text-gray-400">· คิดจากวันเวลาได้ ' + fx(c.hours) + ' ชม.</span>' : '');
    }
    if (c.err) return '<span class="text-gray-400">' + esc(c.err) + '</span>';
    return '<span class="text-gray-600">' + c.days + ' วัน x ' + fx(c.perDay) + ' ชม./วัน = <b>' + fx(c.hours) + '</b> ชม.'
      + (c.overnight ? ' <span class="text-amber-700">(ข้ามเที่ยงคืน)</span>' : '') + '</span>';
  }
  function uniq(a) { var out = [], seen = {}; a.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  function state() {
    if (!APP._wl) {
      // เริ่มต้นยุบการ์ดไว้ทั้งหมด ให้เห็นภาพรวมก่อน แล้วค่อยกดขยายดูรายละเอียด
      var fold0 = { sumTable: true };
      MISSIONS.forEach(function (m) { fold0[m.key] = true; });
      APP._wl = {
      tab: 'summary', year: '', level: '1', sem: '1', search: '', draft: null, calc: [],
      tol: 0,                       // ยอมให้เกินชั่วโมงเป้าหมายได้กี่เปอร์เซ็นต์ ก่อนถือว่าเกิน
      mView: 'level', mLevel: '', mSid: '', mq: '',  // มุมมองการ์ดพันธกิจ : รายชั้นปี / รายบุคคล
      mode: 'cohort', gsel: {},     // กล่องกรอกที่เปิดอยู่ : ทั้งชั้นปี / รายบุคคล ('' = ยุบทั้งคู่)
      mission: '', gq: '',          // พันธกิจที่เลือกกรอก ('' = ทุกพันธกิจ) · คำค้นในรายชื่อนักศึกษา
      fold: fold0                   // การ์ดที่ถูกยุบไว้ (จำเฉพาะระหว่างใช้งาน)
      };
    }
    if (!APP._wl.year) APP._wl.year = wlYears()[0] || '2568';
    return APP._wl;
  }
  function wlYears() {
    var ys = get('workload_plan').map(function (p) { return norm(p.academic_year); })
      .concat(get('subject').map(function (s) { return norm(s.academic_year); }));
    return uniq(ys).sort(function (a, b) { return b.localeCompare(a, 'th', { numeric: true }); });
  }

  /* ---------------- ตัวช่วยจำผลลัพธ์ภายในการวาดหน้าหนึ่งรอบ ----------------
     หน้าสรุปผลเรียกฟังก์ชันเดิมซ้ำหลายพันครั้ง (แปลง JSON, กรองรายชื่อนักศึกษา, ค้นหาแผน)
     จึงเก็บผลไว้ใช้ซ้ำตลอดการวาดรอบนั้น แล้วล้างทิ้งเมื่อวาดเสร็จ
     ทำให้ไม่มีทางได้ค่าค้างจากข้อมูลเก่า เพราะการวาดรอบใหม่เริ่มจากศูนย์เสมอ */
  var MEMO = null;
  function memo(key, fn) {
    if (!MEMO) return fn();
    if (MEMO[key] === undefined) MEMO[key] = fn();
    return MEMO[key];
  }

  function rows(rec, m) {
    if (!rec) return [];
    var id = rec.__backendId;
    if (id && MEMO) return memo('r|' + id + '|' + m.key, function () { return parseRows(rec, m); });
    return parseRows(rec, m);
  }
  function parseRows(rec, m) {
    try { var a = JSON.parse(rec[m.field] || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function planOf(year, level, sem) {
    return memo('pl|' + year + '|' + level + '|' + sem, function () {
      return get('workload_plan').find(function (p) {
        return norm(p.academic_year) === norm(year) && norm(p.year_level) === norm(level) && norm(p.semester) === norm(sem);
      }) || null;
    });
  }
  // ทำดัชนีค่าเฉพาะรายครั้งเดียว แทนการไล่ค้นทีละคน (นักศึกษาหลายร้อยคน x ทุกภาค)
  function ovrIndex() {
    return memo('ovrIdx', function () {
      var map = {};
      get('workload_student').forEach(function (o) {
        map[norm(o.student_id) + '|' + norm(o.academic_year) + '|' + norm(o.semester)] = o;
      });
      return map;
    });
  }
  function overrideOf(sid, year, sem) {
    if (MEMO) return ovrIndex()[norm(sid) + '|' + norm(year) + '|' + norm(sem)] || null;
    return get('workload_student').find(function (o) {
      return norm(o.student_id) === norm(sid) && norm(o.academic_year) === norm(year) && norm(o.semester) === norm(sem);
    }) || null;
  }
  function weightOf(plan, m) {
    var v = plan ? norm(plan[m.wkey]) : '';
    return v === '' ? m.def : n(v);
  }
  // รายชื่อผู้เข้าร่วมของกิจกรรมหนึ่งแถว — ว่าง/ไม่ระบุ = นักศึกษาทุกคนในชั้น
  function partOf(r) {
    var v = r && r.students;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    return Array.isArray(v) ? v.map(String) : [];
  }
  // กิจกรรมแถวนี้นับให้นักศึกษาคนนี้หรือไม่
  //   sid ว่าง = คิดแบบค่ามาตรฐานของชั้น (นับทุกกิจกรรม)
  function appliesTo(r, sid) {
    if (!sid) return true;
    var list = partOf(r);
    return !list.length || list.indexOf(String(sid)) !== -1;
  }

  function calc(plan, ovr, sid) {
    var out = { raw: {}, weighted: {}, total: 0 };
    MISSIONS.forEach(function (m) {
      var useOvr = ovr && norm(ovr[m.field]) !== '';
      var list = rows(useOvr ? ovr : plan, m).filter(function (r) { return appliesTo(r, sid); });
      var raw = list.reduce(function (s, r) { return s + n(r.hours); }, 0);
      out.raw[m.key] = raw;
      out.weighted[m.key] = Math.round(raw * weightOf(plan, m) * 100) / 100;
      out.total += out.weighted[m.key];
    });
    out.total = Math.round(out.total * 100) / 100;
    return out;
  }

  /* ---------------- เป้าหมายชั่วโมงของแต่ละพันธกิจ ----------------
     ฐาน = ชั่วโมงพันธกิจด้านวิชาการที่กรอกไว้ในภาคนั้น ถือเป็นร้อยละ 40 ของภาระงานทั้งหมด
     ชั่วโมงรวมตามกรอบ = ฐาน ÷ 0.40
     ชั่วโมงของด้านอื่น   = ฐาน x (ร้อยละของด้านนั้น ÷ 40)
     ใช้ร้อยละของด้านวิชาการที่บันทึกไว้จริงเป็นตัวหาร เผื่อวิทยาลัยปรับสัดส่วนภายหลัง */
  function acadBase(plan) {
    return plan ? calc(plan, null).raw[MISSIONS[0].key] : 0;
  }
  function targetFrom(plan, base) {
    var acadPct = Math.round(weightOf(plan, MISSIONS[0]) * 1000) / 10;
    var out = { frame: 0, base: base, acadPct: acadPct };
    MISSIONS.forEach(function (m) {
      var p = Math.round(weightOf(plan, m) * 1000) / 10;
      out[m.key] = acadPct ? Math.round(base * p / acadPct * 100) / 100 : 0;
    });
    // คิดกรอบรวมจากฐานโดยตรง ไม่ใช่บวกค่าที่ปัดทศนิยมแล้วทีละพันธกิจ
    // มิฉะนั้นตัวเลขบนหน้าจอจะไม่ตรงกับสูตร ฐาน ÷ สัดส่วนด้านวิชาการ
    out.frame = acadPct ? Math.round(base * 100 / acadPct * 100) / 100 : 0;
    return out;
  }
  function targetOf(plan) { return targetFrom(plan, acadBase(plan)); }

  // เป้าหมายรวมทั้งปีการศึกษาของชั้นปีหนึ่ง (รวมทุกภาคที่มีข้อมูล)
  function yearTarget(year, level) {
    // รวมฐานชั่วโมงของทุกภาคก่อน แล้วค่อยคิดเป้าหมายครั้งเดียว
    // ถ้าคิดทีละภาคแล้วเอาค่าที่ปัดทศนิยมแล้วมาบวกกัน ผลรวมจะเพี้ยนจากสูตรเล็กน้อย
    var out = { frame: 0, ok: false, base: 0 };
    MISSIONS.forEach(function (m) { out[m.key] = 0; });
    var ref = null, base = 0;
    SEMS.forEach(function (sm) {
      var p = planOf(year, level, sm);
      if (!p) return;
      if (!ref) ref = p;
      base += acadBase(p);
    });
    if (!ref) return out;
    var t = targetFrom(ref, base);
    MISSIONS.forEach(function (m) { out[m.key] = t[m.key]; });
    out.frame = t.frame;
    out.base = base;
    out.ok = t.frame > 0;
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

  /* "รุ่นที่" ของชั้นปีนั้นในปีการศึกษานั้น
     อ่านจากทะเบียนนักศึกษาเป็นหลัก — หานักศึกษาที่รหัสขึ้นต้นด้วยรหัสรุ่นนี้ แล้วใช้เลขรุ่นของเขา
     ถ้าปีนั้นยังไม่มีใครในทะเบียน จะเทียบจากส่วนต่างระหว่างเลขรุ่นกับรหัสรุ่นที่มีอยู่จริง
     ถ้าเทียบไม่ได้เลย คืนค่าว่าง — ไม่แต่งเลขรุ่นขึ้นมาเอง */
  function batchOf(year, level) {
    var pfx = cohortPrefix(year, level);
    if (!pfx) return '';
    return memo('bt|' + pfx, function () {
      var hit = {}, best = '', bestN = 0;
      var off = {}, bestOff = null, bestOffN = 0;
      get('student').forEach(function (s) {
        var sid = String(s.student_id || ''), b = norm(s.batch);
        if (sid.length < 2 || !b) return;
        var p2 = sid.slice(0, 2);
        if (p2 === pfx) {
          hit[b] = (hit[b] || 0) + 1;
          if (hit[b] > bestN) { bestN = hit[b]; best = b; }
        }
        var d = parseInt(b, 10) - parseInt(p2, 10);
        if (isFinite(d)) {
          off[d] = (off[d] || 0) + 1;
          if (off[d] > bestOffN) { bestOffN = off[d]; bestOff = d; }
        }
      });
      if (best) return best;
      if (bestOff !== null) {
        var v = parseInt(pfx, 10) + bestOff;
        if (isFinite(v) && v > 0) return String(v);
      }
      return '';
    });
  }
  window.wlBatchOf = batchOf;

  // ชั้นปีที่ 1 (รุ่น 81) — ถ้าไม่รู้เลขรุ่น จะบอกรหัสรุ่นแทน
  function levelLabel(year, level) {
    var b = batchOf(year, level), p = cohortPrefix(year, level);
    var tag = b ? 'รุ่น ' + b : (p ? 'รหัส ' + p : '');
    return 'ชั้นปีที่ ' + level + (tag ? ' (' + tag + ')' : '');
  }
  function semLabel(s) {
    return String(s) === '3' ? 'ภาคฤดูร้อน' : 'ภาคการศึกษาที่ ' + String(s);
  }

  function cohortStudents(level, year) {
    var yr = year || state().year;
    return memo('co|' + yr + '|' + level, function () { return cohortStudentsRaw(level, yr); });
  }
  function cohortStudentsRaw(level, yr) {
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
    if (!Array.isArray(list) || !list.length) list = ['research', 'service', 'student', 'personal'];
    return list.map(function (x) { return String(x).trim(); })
      .filter(function (x) { return x && x !== 'teaching'; });
  }
  function canEditMission(key) { return myMissions().indexOf(key) !== -1; }

  /* ---------------- หน้าหลัก ---------------- */
  window.workloadPage = function workloadPage() {
    MEMO = {};
    try { return buildWorkloadPage(); } finally { MEMO = null; }
  };

  function buildWorkloadPage() {
    var st = state();
    var years = wlYears();
    // แท็บเดิม 3 แท็บ ย้ายไปเป็นเมนูย่อยใต้เมนู "ภาระงานนักศึกษา" ในแถบเมนูซ้ายแล้ว
    // หน้านี้จึงแสดงเฉพาะหัวข้อของเมนูย่อยที่กำลังเปิดอยู่
    if (st.tab === 'students') st.tab = 'plan';   // ลิงก์เก่าที่ชี้มาแท็บรายบุคคล
    var TAB_NAME = { summary: ['สรุปผลรวม', 'คิดชั่วโมงภาระงานตามสัดส่วนพันธกิจของวิทยาลัย'],
      plan: ['กรอกภาระงาน', 'เลือกชั้นปีและภาคการศึกษา แล้วกรอกทั้งชั้นปีหรือเลือกกรอกรายบุคคล'],
      rate: ['เกณฑ์หน่วยชั่วโมง', 'ตารางเทียบหน่วยชั่วโมงของกิจกรรมแต่ละประเภท'] };
    var t = TAB_NAME[st.tab] || TAB_NAME.summary;

    var head = '<div class="flex flex-wrap items-center justify-between gap-3 mb-5">'
      + '<div><h2 class="text-xl font-bold text-gray-800"><i data-lucide="gauge" class="w-6 h-6 inline mr-2"></i>ภาระงานนักศึกษา'
      + ' <span class="text-gray-300 font-normal">/</span> ' + esc(t[0]) + '</h2>'
      + '<p class="text-sm text-gray-500 mt-0.5">' + esc(t[1]) + '</p></div>'
      + '<div class="flex items-center gap-2"><label class="text-sm text-gray-500">ปีการศึกษา</label>'
      + '<select onchange="wlSet(\'year\', this.value)" class="border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + years.map(function (y) { return '<option ' + (y === st.year ? 'selected' : '') + '>' + esc(y) + '</option>'; }).join('')
      + '</select></div></div>';

    var body = st.tab === 'plan' ? planTab()
      : st.tab === 'rate' ? rateTab() : summaryTab();
    return head + body;
  }

  /* กดแท็บแล้วต้องเห็นผลทันที
     ระบบวาดหน้าใหม่ทั้งหน้าเมื่อเปลี่ยนแท็บ ซึ่งใช้เวลาสั้น ๆ แต่พอให้รู้สึกหน่วง
     จึงเปลี่ยนสีปุ่มให้ก่อนในจังหวะที่กด แล้วค่อยวาดเนื้อหาในเฟรมถัดไป */
  function paintTab(key) {
    try {
      var btns = document.querySelectorAll('[data-wl-tab]');
      Array.prototype.forEach.call(btns, function (b) {
        var on = b.getAttribute('data-wl-tab') === key;
        b.className = 'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 '
          + (on ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700');
      });
    } catch (e) { /* ไม่สำเร็จก็ยังวาดหน้าใหม่ตามปกติ */ }
  }

  window.wlSet = function (k, v) {
    var st = state();
    st[k] = v;
    // ล้างร่างเฉพาะเมื่อเปลี่ยนขอบเขตข้อมูลที่กรอก — เปลี่ยนตัวกรองของหน้าสรุปไม่ต้องล้าง
    if (['year', 'level', 'sem', 'mode'].indexOf(k) !== -1) st.draft = null;
    if (k === 'mView') st.mq = '';
    if (k === 'tab') {
      paintTab(v);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(renderCurrentPage);
      else renderCurrentPage();
      return;
    }
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

  /* ---------------- ภาระงานรายคนทั้งปีการศึกษา ----------------
     เก็บทั้งชั่วโมงจริง (raw) และชั่วโมงถ่วงน้ำหนัก (per)
     ชั่วโมงจริงใช้ดูสัดส่วนเวลาที่นักศึกษาใช้ไปกับแต่ละพันธกิจ
     ชั่วโมงถ่วงน้ำหนักใช้แสดงปริมาณภาระงานตามสัดส่วนของวิทยาลัย */
  function studentTotals(year) {
    return memo('tot|' + year, function () { return studentTotalsRaw(year); });
  }
  // ภาระงานทั้งปีของนักศึกษาหนึ่งคน
  function oneTotal(year, lv, stu, plans) {
    var tot = 0, rawTot = 0, per = {}, raw = {}, extra = false;
    MISSIONS.forEach(function (m) { per[m.key] = 0; raw[m.key] = 0; });
    SEMS.forEach(function (sm, i) {
      var plan = plans[i];
      if (!plan) return;
      var ovr = overrideOf(stu.student_id, year, sm);
      if (ovr) extra = true;
      var c = calc(plan, ovr, stu.student_id);
      tot += c.total;
      MISSIONS.forEach(function (m) {
        per[m.key] += c.weighted[m.key];
        raw[m.key] += c.raw[m.key];
        rawTot += c.raw[m.key];
      });
    });
    return { sid: norm(stu.student_id), name: norm(stu.name), level: lv,
             total: Math.round(tot * 100) / 100, per: per,
             raw: raw, rawTotal: Math.round(rawTot * 100) / 100, ovr: extra };
  }

  function studentTotalsRaw(year) {
    var out = [];
    ['1', '2', '3', '4'].forEach(function (lv) {
      var plans = SEMS.map(function (sm) { return planOf(year, lv, sm); });
      if (!plans.some(Boolean)) return;
      cohortStudents(lv, year).forEach(function (stu) {
        out.push(oneTotal(year, lv, stu, plans));
      });
    });
    return out;
  }

  /* ภาระงานของนักศึกษาคนเดียว — ใช้ตอนดูมุมมองรายบุคคล
     รหัสนักศึกษาบอกชั้นปีอยู่แล้ว จึงคิดเฉพาะคนนั้น ไม่ต้องไล่ทั้ง 600 กว่าคน */
  function studentTotalOf(year, sid) {
    sid = norm(sid);
    var y = parseInt(String(year || '').slice(-2), 10);
    var p = parseInt(sid.slice(0, 2), 10);
    var lv = (!isNaN(y) && !isNaN(p)) ? (y - p + 1) : 0;
    if (lv >= 1 && lv <= 4) {
      var plans = SEMS.map(function (sm) { return planOf(year, String(lv), sm); });
      if (plans.some(Boolean)) {
        var stu = cohortStudents(String(lv), year).filter(function (x) {
          return norm(x.student_id) === sid;
        })[0];
        if (stu) return oneTotal(year, String(lv), stu, plans);
      }
    }
    // รหัสไม่เข้ารูปแบบรุ่น — ถอยไปหาในรายชื่อทั้งหมด
    return studentTotals(year).filter(function (x) { return x.sid === sid; })[0] || null;
  }
  /* ---------------- ตัวเลือกมุมมองของการ์ดพันธกิจ : รายชั้นปี / รายบุคคล ---------------- */
  function missionScopeBar() {
    var st = state();
    // ชั้นปีที่มีข้อมูล อ่านจากแผนภาระงานได้เลย ไม่ต้องไล่คำนวณรายคน
    var levels = uniq(get('workload_plan')
      .filter(function (p) { return norm(p.academic_year) === norm(st.year); })
      .map(function (p) { return norm(p.year_level); })).sort();
    var tab = function (k, label, icon) {
      var on = st.mView === k;
      return '<button type="button" onclick="wlSet(\'mView\',\'' + k + '\')" class="px-3 py-1.5 text-sm '
        + (on ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50') + '">'
        + '<i data-lucide="' + icon + '" class="w-4 h-4 inline mr-1"></i>' + label + '</button>';
    };
    var bar = '<div class="flex flex-wrap items-center gap-2 mb-3">'
      + '<div class="inline-flex rounded-xl border border-gray-200 overflow-hidden">'
      + tab('level', 'รายชั้นปี', 'layers') + tab('person', 'รายบุคคล', 'user') + '</div>';

    if (st.mView === 'person') {
      var cur = norm(st.mSid) ? studentTotalOf(st.year, st.mSid) : null;
      bar += cur
        ? '<span class="px-3 py-1.5 rounded-xl bg-primaryLight text-primary text-sm">'
          + esc(cur.name) + ' <span class="font-mono text-xs">' + esc(cur.sid) + '</span> · ชั้นปีที่ ' + esc(cur.level) + '</span>'
          + '<button type="button" onclick="wlSet(\'mSid\',\'\')" class="text-xs text-gray-500 hover:text-gray-700 underline">เปลี่ยนคน</button>'
        : '<input value="' + esc(st.mq) + '" oninput="wlSet(\'mq\',this.value)" '
          + 'placeholder="ค้นหารหัส/ชื่อนักศึกษา" class="border border-gray-200 rounded-xl px-3 py-1.5 text-sm w-64 max-w-full">';
    } else {
      bar += '<select onchange="wlSet(\'mLevel\',this.value)" class="border border-gray-200 rounded-xl px-3 py-1.5 text-sm">'
        + '<option value="" ' + (norm(st.mLevel) === '' ? 'selected' : '') + '>ทุกชั้นปี</option>'
        + levels.map(function (l) {
            return '<option value="' + l + '" ' + (norm(st.mLevel) === l ? 'selected' : '') + '>ชั้นปีที่ ' + l + '</option>';
          }).join('')
        + '</select>';
    }
    bar += '</div>';

    if (st.mView === 'person' && !norm(st.mSid)) {
      var q = norm(st.mq).toLowerCase();
      // ค้นหาจากทะเบียนนักศึกษาโดยตรง เร็วกว่าไล่คำนวณชั่วโมงของทุกคนก่อนค้น
      var pool = [];
      levels.forEach(function (l) {
        cohortStudents(l, st.year).forEach(function (x) {
          pool.push({ sid: norm(x.student_id), name: norm(x.name), level: l });
        });
      });
      var hit = q ? pool.filter(function (x) { return (x.sid + ' ' + x.name).toLowerCase().indexOf(q) >= 0; }) : [];
      bar += q
        ? '<div class="flex flex-wrap gap-1.5 mb-3">'
          + (hit.length ? hit.slice(0, 12).map(function (x) {
              return '<button type="button" onclick="wlSet(\'mSid\',\'' + esc(x.sid) + '\')" '
                + 'class="px-2.5 py-1 rounded-lg border border-gray-200 text-xs hover:bg-primaryLight hover:border-primary">'
                + '<span class="font-mono text-gray-400 mr-1">' + esc(x.sid) + '</span>' + esc(x.name)
                + ' <span class="text-gray-400">· ปี ' + esc(x.level) + '</span></button>';
            }).join('') : '<span class="text-xs text-gray-400">ไม่พบนักศึกษา</span>')
          + (hit.length > 12 ? '<span class="text-xs text-gray-400 self-center">+ อีก ' + (hit.length - 12) + ' คน — พิมพ์ให้เจาะจงขึ้น</span>' : '')
          + '</div>'
        : '<p class="text-xs text-gray-400 mb-3">พิมพ์รหัสหรือชื่อนักศึกษาเพื่อดูชั่วโมงของคนนั้น</p>';
    }
    return bar;
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
        + '<p class="text-sm mt-2">ไปที่แท็บ "กรอกภาระงาน" เพื่อเริ่มบันทึก</p></div>';
    }

    /* ---- การ์ดพันธกิจ : เลือกดูรายชั้นปีหรือรายบุคคล ---- */
    var sums = {}, raws = {}, scopeNote = '', haveScope = true, capLv = '1', rec = null;
    MISSIONS.forEach(function (m) { sums[m.key] = 0; raws[m.key] = 0; });

    if (st.mView === 'person') {
      rec = norm(st.mSid) ? studentTotalOf(st.year, st.mSid) : null;
      if (rec) {
        MISSIONS.forEach(function (m) { sums[m.key] = rec.per[m.key]; raws[m.key] = rec.raw[m.key]; });
        capLv = rec.level;
        scopeNote = 'ชั่วโมงของ ' + esc(rec.name) + ' (' + esc(rec.sid) + ') รวมทุกภาคการศึกษา'
          + ' — นับเฉพาะกิจกรรมที่นักศึกษาคนนี้เข้าร่วม และใช้ค่าเฉพาะรายถ้ามีการปรับไว้';
      } else { haveScope = false; }
    } else {
      var lv2 = norm(st.mLevel);
      capLv = lv2 || cells[0].lv;
      ['1', '2', '3', '4'].forEach(function (l) {
        if (lv2 && l !== lv2) return;
        SEMS.forEach(function (sm) {
          var plan = planOf(st.year, l, sm);
          if (!plan) return;
          var c = calc(plan, null);
          MISSIONS.forEach(function (m) { sums[m.key] += c.weighted[m.key]; raws[m.key] += c.raw[m.key]; });
        });
      });
      scopeNote = lv2 ? 'ค่ามาตรฐานของชั้นปีที่ ' + esc(lv2) + ' รวมทุกภาคการศึกษา'
                      : 'ค่ามาตรฐานรวมทุกชั้นปีและทุกภาคการศึกษา';
    }
    var rawTotal = MISSIONS.reduce(function (a, m) { return a + raws[m.key]; }, 0);
    var tolNow = n(st.tol);
    // เป้าหมายของมุมมองนี้ : รายบุคคลใช้ของชั้นปีตนเอง รายชั้นปีใช้ของชั้นปีที่เลือก
    var tg = { ok: false };
    if (st.mView === 'person') tg = yearTarget(st.year, capLv);
    else if (norm(st.mLevel)) tg = yearTarget(st.year, capLv);
    else {
      MISSIONS.forEach(function (m) { tg[m.key] = 0; });
      tg.frame = 0;
      ['1', '2', '3', '4'].forEach(function (l) {
        var y = yearTarget(st.year, l);
        if (!y.ok) return;
        tg.ok = true;
        MISSIONS.forEach(function (m) { tg[m.key] += y[m.key]; });
        tg.frame += y.frame;
      });
    }

    var tiles = !haveScope ? '' : MISSIONS.map(function (m) {
      var share = rawTotal ? Math.round(raws[m.key] / rawTotal * 1000) / 10 : 0;
      var t = tg.ok ? tg[m.key] : 0;
      var bad = t > 0 && raws[m.key] > t * (1 + tolNow / 100);
      return '<div class="bg-white rounded-2xl p-4 border ' + (bad ? 'border-amber-200' : 'border-blue-100') + '">'
        + '<div class="flex items-center gap-2 mb-1"><span style="width:10px;height:10px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
        + '<p class="text-xs text-gray-500">' + esc(m.short) + '</p></div>'
        + '<p class="text-2xl font-bold" style="color:' + m.color + '">' + fx(raws[m.key]) + '</p>'
        + '<p class="text-[11px] text-gray-400">ชั่วโมงจริง · ถ่วงน้ำหนักแล้ว ' + fx(sums[m.key]) + ' ชม.</p>'
        + '<p class="text-[11px] ' + (bad ? 'text-amber-700 font-semibold' : 'text-gray-400') + '">'
        + (tg.ok ? 'เป้าหมาย ' + fx(t) + ' ชม.' + (bad ? ' — เกินเป้าหมาย' : '')
                 : 'คิดเป็น ' + share + '% ของเวลาทั้งหมด')
        + '</p></div>';
    }).join('');

    // เลือกรายชั้นปีแล้ว ให้เห็นข้อมูลรายบุคคลของทั้งชั้นปีนั้นต่อท้ายการ์ด
    var perPerson = '';
    if (st.mView === 'level' && norm(st.mLevel)) {
      perPerson = personTable(st.year, norm(st.mLevel));
    } else if (st.mView === 'level') {
      perPerson = '<p class="text-xs text-gray-400 mt-3">เลือกชั้นปีเพื่อดูข้อมูลรายบุคคลของทั้งชั้นปี</p>';
    } else if (st.mView === 'person' && rec) {
      perPerson = personDetail(st.year, rec);
    }

    var missionCards = '<div class="bg-white rounded-2xl p-5 border border-blue-100 mb-5">'
      + '<div class="flex flex-wrap items-baseline justify-between gap-2 mb-1">'
      + '<h3 class="font-bold">ชั่วโมงภาระงานแยกตามพันธกิจ</h3>'
      + '<span class="text-xs text-gray-400">รวมเวลาจริง ' + fx(rawTotal) + ' ชั่วโมง'
      + (tg.ok ? ' · กรอบทั้งหมด ' + fx(tg.frame) + ' ชั่วโมง' : '') + '</span></div>'
      + missionScopeBar()
      + (haveScope
          ? '<div class="grid grid-cols-2 md:grid-cols-5 gap-3">' + tiles + '</div>'
            + '<p class="text-xs text-gray-500 mt-3"><i data-lucide="info" class="w-3 h-3 inline mr-0.5"></i>' + scopeNote + '</p>'
            + perPerson
          : '')
      + '</div>';

    var table = cells.map(function (x) {
      var segs = MISSIONS.map(function (m) {
        var pct = x.c.total ? (x.c.weighted[m.key] / x.c.total * 100) : 0;
        return pct > 0 ? '<span title="' + esc(m.short) + ' ' + fx(x.c.weighted[m.key]) + ' ชม." style="width:' + pct + '%;background:' + m.color + '"></span>' : '';
      }).join('');
      var tgRow = targetOf(x.plan);
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-3 font-medium whitespace-nowrap">ชั้นปีที่ ' + x.lv + '</td>'
        + '<td class="px-4 py-3 whitespace-nowrap">ภาค ' + semName(x.sm) + '</td>'
        + MISSIONS.map(function (m) {
          return '<td class="px-3 py-3 text-center tabular-nums"><span class="text-gray-800">' + fx(x.c.weighted[m.key]) + '</span>'
            + '<span class="block text-[11px] text-gray-400">' + fx(x.c.raw[m.key]) + ' ชม.</span></td>';
        }).join('')
        + '<td class="px-4 py-3 text-center"><b class="text-primary text-base tabular-nums">' + fx(x.c.total) + '</b>'
        + '<div class="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mt-1" style="min-width:80px">' + segs + '</div></td>'
        + '<td class="px-3 py-3 text-center tabular-nums">'
        + (tgRow.frame ? '<span class="text-gray-700">' + fx(tgRow.frame) + '</span>'
            + '<span class="block text-[11px] text-gray-400">วิชาการ ' + fx(tgRow.base) + '</span>'
            : '<span class="text-gray-300">-</span>') + '</td>'
        + '<td class="px-4 py-3 text-center text-gray-600 tabular-nums">' + x.studs + '</td>'
        + '<td class="px-4 py-3 text-center">' + (x.ovr ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">' + x.ovr + ' ราย</span>' : '<span class="text-gray-300">-</span>') + '</td></tr>';
    }).join('');

    var sumFolded = !!(st.fold || {}).sumTable;
    var sumCard = '<div class="bg-white rounded-2xl p-5 border border-blue-100 mb-5">'
      + '<div class="flex flex-wrap items-center justify-between gap-2' + (sumFolded ? '' : ' mb-3') + '">'
      + '<button type="button" onclick="wlFold(\'sumTable\')" class="font-bold flex items-center gap-2 text-left hover:text-primary" '
      + 'title="' + (sumFolded ? 'กดเพื่อขยาย' : 'กดเพื่อยุบ') + '">'
      + '<i data-lucide="chevron-down" data-wl-chev="sumTable" class="w-4 h-4 text-gray-400 transition-transform"'
      + (sumFolded ? ' style="transform:rotate(-90deg)"' : '') + '></i>'
      + 'สรุปชั่วโมงภาระงาน ปีการศึกษา ' + esc(st.year)
      + '<span class="text-xs font-normal text-gray-400">· ' + cells.length + ' ภาคการศึกษา · รวม ' + fx(grand) + ' ชม.ถ่วงน้ำหนัก</span></button>'
      + '<button onclick="wlExportCSV()" class="px-3 py-1.5 rounded-lg border border-emerald-500 text-emerald-600 text-sm hover:bg-emerald-50"><i data-lucide="download" class="w-4 h-4 inline mr-1"></i>ส่งออก CSV</button></div>'
      + '<div data-wl-body="sumTable"' + (sumFolded ? ' hidden' : '') + '>'
      + missionLegend(cells[0].plan)
      + '<div class="overflow-x-auto"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left"><th class="px-4 py-3 font-semibold">ชั้นปี</th><th class="px-4 py-3 font-semibold">ภาคเรียน</th>'
      + MISSIONS.map(function (m) { return '<th class="px-3 py-3 font-semibold text-center">' + esc(m.short) + '</th>'; }).join('')
      + '<th class="px-4 py-3 font-semibold text-center">รวมทั้งหมด</th>'
      + '<th class="px-3 py-3 font-semibold text-center">กรอบชั่วโมง</th>'
      + '<th class="px-4 py-3 font-semibold text-center">นักศึกษา</th>'
      + '<th class="px-4 py-3 font-semibold text-center">ปรับเฉพาะราย</th></tr></thead>'
      + '<tbody>' + table + '</tbody>'
      + '<tfoot><tr class="border-t-2 bg-surface font-semibold"><td class="px-4 py-3" colspan="2">รวมทั้งปีการศึกษา</td>'
      + MISSIONS.map(function (m) {
        var s = cells.reduce(function (a, x) { return a + x.c.weighted[m.key]; }, 0);
        return '<td class="px-3 py-3 text-center tabular-nums">' + fx(s) + '</td>';
      }).join('')
      + '<td class="px-4 py-3 text-center text-primary tabular-nums">' + fx(grand) + '</td>'
      + '<td class="px-3 py-3 text-center tabular-nums">'
      + fx(cells.reduce(function (a, x) { return a + targetOf(x.plan).frame; }, 0)) + '</td>'
      + '<td class="px-4 py-3 text-center tabular-nums">' + cohortTotal + '</td><td></td></tr></tfoot></table></div>'
      + '<p class="text-xs text-gray-500 mt-3"><i data-lucide="info" class="w-3 h-3 inline mr-0.5"></i>'
      + 'ตัวเลขบนคือชั่วโมงหลังถ่วงน้ำหนักตามสัดส่วนพันธกิจ ตัวเลขสีจางด้านล่างคือชั่วโมงจริงก่อนถ่วงน้ำหนัก</p></div></div>';

    return sumCard + missionCards;
  }

  /* ---------------- รายละเอียดภาระงานของนักศึกษาหนึ่งคน ----------------
     ไล่ทีละพันธกิจว่ามีรายการอะไรบ้าง มาจากภาคการศึกษาไหน กี่ชั่วโมง
     นับเฉพาะรายการที่นักศึกษาคนนี้เข้าร่วม และใช้ค่าเฉพาะรายถ้ามีการปรับไว้ */
  function personDetail(year, rec) {
    var blocks = MISSIONS.map(function (m) {
      var items = [];
      SEMS.forEach(function (sm) {
        var plan = planOf(year, rec.level, sm);
        if (!plan) return;
        var ovr = overrideOf(rec.sid, year, sm);
        var useOvr = ovr && norm(ovr[m.field]) !== '';
        rows(useOvr ? ovr : plan, m).forEach(function (r) {
          if (!appliesTo(r, rec.sid)) return;
          items.push({ sm: sm, r: r, ovr: !!useOvr });
        });
      });
      var sum = items.reduce(function (a, x) { return a + n(x.r.hours); }, 0);
      var head = '<div class="flex flex-wrap items-baseline justify-between gap-2 mb-1">'
        + '<h5 class="text-sm font-semibold flex items-center gap-2">'
        + '<span style="width:9px;height:9px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
        + esc(m.label) + '</h5>'
        + '<span class="text-xs text-gray-500">' + items.length + ' รายการ · รวม '
        + '<b style="color:' + m.color + '">' + fx(sum) + '</b> ชม.'
        + (rec.rawTotal ? ' · ' + (Math.round(sum / rec.rawTotal * 1000) / 10) + '% ของเวลาทั้งหมด' : '')
        + '</span></div>';

      if (!items.length) {
        return '<div class="border border-gray-100 rounded-xl p-3 mb-2">' + head
          + '<p class="text-xs text-gray-400">ไม่มีรายการ</p></div>';
      }

      var cols = m.subject
        ? ['ภาค', 'รายวิชา', 'ชิ้นงาน', 'ชั่วโมง']
        : ['ภาค', 'ประเภท', 'กิจกรรม', 'ชั่วโมง'];
      var body = items.map(function (x) {
        var r = x.r;
        return '<tr class="border-t">'
          + '<td class="px-3 py-1.5 text-center text-xs text-gray-500 whitespace-nowrap">' + semName(x.sm) + '</td>'
          + (m.subject
              ? '<td class="px-3 py-1.5">' + esc(norm(r.subject_name) || '-') + '</td>'
                + '<td class="px-3 py-1.5 text-center tabular-nums text-gray-600">' + esc(norm(r.pieces) || '-') + '</td>'
              : '<td class="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">' + esc(norm(r.kind) || 'กิจกรรมที่') + '</td>'
                + '<td class="px-3 py-1.5 whitespace-pre-wrap">' + esc(norm(r.activity) || '-')
                  + (spanText(r) ? '<span class="block text-[11px] text-gray-400">' + esc(spanText(r)) + '</span>' : '')
                  + '</td>')
          + '<td class="px-3 py-1.5 text-center tabular-nums font-semibold">' + fx(r.hours) + '</td></tr>';
      }).join('');

      return '<div class="border border-gray-100 rounded-xl p-3 mb-2">' + head
        + '<div class="overflow-x-auto"><table class="w-full text-sm">'
        + '<thead><tr class="bg-surface text-left">'
        + cols.map(function (c, i) {
            return '<th class="px-3 py-1.5 font-medium text-xs' + (i === 0 || i === 2 || i === 3 ? ' text-center' : '') + '">' + c + '</th>';
          }).join('')
        + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
    }).join('');

    return '<div class="mt-4">'
      + '<div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">'
      + '<h4 class="font-semibold text-sm">รายละเอียดภาระงานของ ' + esc(rec.name) + '</h4>'
      + '<span class="text-xs text-gray-400">รหัส ' + esc(rec.sid) + ' · ชั้นปีที่ ' + esc(rec.level)
      + ' · รวมทุกภาคการศึกษา ' + fx(rec.rawTotal) + ' ชม.</span></div>'
      + blocks + '</div>';
  }

  /* ---------------- ข้อมูลรายบุคคลของทั้งชั้นปี ----------------
     แสดงชั่วโมงจริงรายพันธกิจของนักศึกษาทุกคนในชั้นปีที่เลือก
     คนที่มีค่าเฉพาะรายจะมีป้ายกำกับ เพื่อให้รู้ว่าไม่ได้ใช้ค่ามาตรฐานของชั้น */
  function personTable(year, level) {
    var list = studentTotals(year).filter(function (x) { return x.level === level; });
    if (!list.length) {
      return '<p class="text-xs text-gray-400 mt-3">ยังไม่มีข้อมูลนักศึกษาของชั้นปีที่ ' + esc(level) + '</p>';
    }
    list.sort(function (a, b) { return a.sid.localeCompare(b.sid, 'th', { numeric: true }); });
    var shown = list.slice(0, 300);
    // เกณฑ์สัดส่วนของชั้นปีนี้ (40/10/15/15/20 หรือค่าที่วิทยาลัยปรับไว้) ใช้เทียบให้เห็นว่าใครเบี่ยงจากเกณฑ์
    var refPlan = null;
    SEMS.forEach(function (sm) { if (!refPlan) refPlan = planOf(year, level, sm); });
    var caps = {};
    MISSIONS.forEach(function (m) { caps[m.key] = Math.round(weightOf(refPlan, m) * 1000) / 10; });
    var overCount = {};
    MISSIONS.forEach(function (m) { overCount[m.key] = 0; });
    var body = shown.map(function (x) {
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-3 py-2 font-mono text-xs text-primary whitespace-nowrap">' + esc(x.sid) + '</td>'
        + '<td class="px-3 py-2">' + esc(x.name) + '</td>'
        // สัดส่วนร้อยละของเวลาทั้งหมดที่นักศึกษาคนนั้นใช้ไป เทียบกับเกณฑ์ของพันธกิจนั้น
        + MISSIONS.map(function (m) {
            var pct = x.rawTotal ? Math.round(x.raw[m.key] / x.rawTotal * 1000) / 10 : 0;
            var over = x.rawTotal > 0 && pct > caps[m.key];
            if (over) overCount[m.key]++;
            return '<td class="px-3 py-2 text-center tabular-nums '
              + (over ? 'text-amber-700 font-semibold' : 'text-gray-600') + '" '
              + 'title="' + fx(x.raw[m.key]) + ' ชม. · เกณฑ์ ' + caps[m.key] + '%">'
              + pct + '%' + (over ? ' ▲' : '') + '</td>';
          }).join('')
        + '<td class="px-3 py-2 text-center tabular-nums font-semibold text-primary">' + fx(x.rawTotal) + '</td>'
        + '<td class="px-3 py-2 text-center">' + (x.ovr
            ? '<span class="px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700">ปรับเฉพาะราย</span>'
            : '<span class="text-[11px] text-gray-400">ตามมาตรฐาน</span>') + '</td></tr>';
    }).join('');
    return '<div class="mt-4">'
      + '<div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">'
      + '<h4 class="font-semibold text-sm">ข้อมูลรายบุคคล ชั้นปีที่ ' + esc(level) + ' (' + list.length + ' คน)</h4>'
      + '<span class="text-xs text-gray-400">สัดส่วนเวลาที่ใช้ในแต่ละพันธกิจ · รวมทุกภาคการศึกษา</span></div>'
      + '<div class="overflow-x-auto border border-blue-50 rounded-xl" style="max-height:60vh;overflow-y:auto">'
      + '<table class="w-full text-sm"><thead class="sticky top-0"><tr class="bg-surface text-left">'
      + '<th class="px-3 py-2 font-semibold">รหัส</th><th class="px-3 py-2 font-semibold">ชื่อ-สกุล</th>'
      + MISSIONS.map(function (m) {
          return '<th class="px-3 py-2 font-semibold text-center whitespace-nowrap">' + esc(m.short)
            + '<span class="block text-[10px] font-normal text-gray-400">เกณฑ์ ' + caps[m.key] + '%</span></th>';
        }).join('')
      + '<th class="px-3 py-2 font-semibold text-center">รวม (ชม.)</th>'
      + '<th class="px-3 py-2 font-semibold text-center">สถานะ</th></tr></thead>'
      + '<tbody>' + body + '</tbody>'
      + '<tfoot><tr class="border-t-2 bg-surface text-xs">'
      + '<td class="px-3 py-2 font-semibold" colspan="2">จำนวนคนที่สัดส่วนสูงกว่าเกณฑ์</td>'
      + MISSIONS.map(function (m) {
          return '<td class="px-3 py-2 text-center tabular-nums '
            + (overCount[m.key] ? 'text-amber-700 font-semibold' : 'text-gray-400') + '">'
            + overCount[m.key] + ' คน</td>';
        }).join('')
      + '<td colspan="2"></td></tr></tfoot></table></div>'
      + '<p class="text-xs text-gray-400 mt-2">ตัวเลขในช่องพันธกิจคือสัดส่วนร้อยละของเวลาทั้งหมดที่นักศึกษาคนนั้นใช้ไป '
      + 'เทียบกับเกณฑ์ที่ระบุใต้ชื่อพันธกิจ · ▲ และตัวเลขสีส้มคือสูงกว่าเกณฑ์ · ชี้ค้างที่ตัวเลขเพื่อดูจำนวนชั่วโมง'
      + (list.length > 300 ? ' · แสดง 300 คนแรกจาก ' + list.length + ' คน' : '') + '</p>'
      + '</div>';
  }

  /* ---------------- ตัวเลือกชั้นปี/ภาคเรียน ---------------- */
  /* ขั้นที่ 1-2 ของหน้ากรอกภาระงาน : เลือกชั้นปี (มีเลขรุ่นกำกับ) และภาคการศึกษา
     ทำเป็นปุ่มกดแทนรายการเลื่อน จะได้เห็นตัวเลือกทั้งหมดพร้อมกันและกดง่ายบนมือถือ */
  function cohortPicker() {
    var st = state();
    var chip = function (on, label, sub, onclick) {
      return '<button type="button" onclick="' + onclick + '" class="px-4 py-2.5 rounded-xl border text-left transition '
        + (on ? 'border-primary bg-primaryLight' : 'border-gray-200 bg-white hover:bg-gray-50') + '">'
        + '<span class="block text-sm font-semibold ' + (on ? 'text-primary' : 'text-gray-700') + '">' + esc(label) + '</span>'
        + (sub ? '<span class="block text-[11px] ' + (on ? 'text-primary' : 'text-gray-400') + '">' + esc(sub) + '</span>' : '')
        + '</button>';
    };
    return '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4">'
      + '<p class="text-xs font-semibold text-gray-600 mb-2"><i data-lucide="layers" class="w-3.5 h-3.5 inline mr-1"></i>เลือกชั้นปี</p>'
      + '<div class="flex flex-wrap gap-2 mb-4">'
      + ['1', '2', '3', '4'].map(function (l) {
          var b = batchOf(st.year, l), p = cohortPrefix(st.year, l);
          var sub = (b ? 'รุ่น ' + b : '') + (p ? (b ? ' · ' : '') + 'รหัส ' + p : '');
          return chip(st.level === l, 'ชั้นปีที่ ' + l, sub, 'wlSet(\'level\',\'' + l + '\')');
        }).join('')
      + '</div>'
      + '<p class="text-xs font-semibold text-gray-600 mb-2"><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1"></i>ภาคการศึกษา</p>'
      + '<div class="flex flex-wrap gap-2">'
      + SEMS.map(function (s) { return chip(st.sem === s, semLabel(s), '', 'wlSet(\'sem\',\'' + s + '\')'); }).join('')
      + '</div></div>';
  }

  function groupSel() {
    var g = state().gsel || {};
    return Object.keys(g).filter(function (k) { return g[k]; });
  }

  function draft() {
    var st = state();
    if (st.draft) return st.draft;
    var plan = planOf(st.year, st.level, st.sem);
    // เลือกคนเดียวในโหมดกลุ่ม = แก้เฉพาะรายคนนั้น จึงตั้งต้นจากค่าที่เคยปรับไว้
    var sel = groupSel();
    var base = (st.mode === 'group' && sel.length === 1) ? overrideOf(sel[0], st.year, st.sem) : null;
    var d = { weights: {} };
    MISSIONS.forEach(function (m) {
      var src = (base && norm(base[m.field]) !== '') ? base : plan;
      d[m.key] = rows(src, m).map(function (r) { return Object.assign({}, r); });
      d.weights[m.key] = weightOf(plan, m);
    });
    st.draft = d;
    return d;
  }

  /* ยุบ/ขยายการ์ดพันธกิจ
     สลับที่หน้าจอโดยตรง ไม่ต้องวาดหน้าใหม่ จะได้ตอบสนองทันทีและไม่เสียตำแหน่งเลื่อนหน้า */
  window.wlFold = function (key) {
    var st = state();
    if (!st.fold) st.fold = {};
    st.fold[key] = !st.fold[key];
    var box = document.querySelector('[data-wl-body="' + key + '"]');
    var chev = document.querySelector('[data-wl-chev="' + key + '"]');
    if (!box) { renderCurrentPage(); return; }
    box.hidden = st.fold[key];
    if (chev) chev.style.transform = st.fold[key] ? 'rotate(-90deg)' : '';
  };
  window.wlFoldAll = function (on) {
    var st = state();
    st.fold = {};
    if (on) MISSIONS.forEach(function (m) { st.fold[m.key] = true; });
    renderCurrentPage();
  };

  window.wlRowSet = function (mkey, idx, field, value) {
    var d = state().draft || draft();
    var r = d[mkey] && d[mkey][idx];
    if (!r) return;
    r[field] = value;
    var m = missionOf(mkey);
    if (m && m.timed) {
      // พิมพ์ชั่วโมงเองถือว่าขอคุมตัวเลขด้วยมือ ลบออกจนว่างก็กลับไปคิดให้อัตโนมัติ
      if (field === 'hours') r.hours_manual = norm(value) === '' ? '' : '1';
      else if (SPAN_FIELDS.indexOf(field) !== -1) spanApply(mkey, idx, r);
      spanPaint(mkey, idx, r);
    }
    wlUpdateTotals();
  };
  // เขียนชั่วโมงที่คิดได้ลงในแถวและในช่องกรอก (ไม่แตะถ้าผู้ใช้กรอกเอง)
  function spanApply(mkey, idx, r) {
    if (norm(r.hours_manual) === '1') return;
    var c = spanCalc(r);
    r.hours = c.ready ? String(c.hours) : '';
    var el = (typeof document !== 'undefined') && document.querySelector('[data-wl-hr="' + mkey + '|' + idx + '"]');
    if (el) el.value = r.hours;
  }
  // คำอ่านใต้ช่องวันที่ ยืนยันว่าระบบเข้าใจวันที่ตรงกับที่กรอก
  function dateEcho(r, field) {
    var iso = norm(r[field]);
    if (iso) return '<span class="text-gray-500">' + esc(isoToThText(iso)) + '</span>';
    if (norm(r[field + '_in'])) return '<span class="text-amber-700">ยังอ่านวันที่นี้ไม่ออก</span>';
    return '';
  }
  /* รับค่าวันที่ที่กรอกเป็น พ.ศ. แปลงเก็บเป็น ค.ศ.
     ถ้าอ่านไม่ออก เก็บข้อความที่กรอกไว้ให้เห็น ไม่ลบทิ้งและไม่เดาวันที่ให้ */
  window.wlRowDate = function (mkey, idx, field, text) {
    var d = state().draft || draft();
    var r = d[mkey] && d[mkey][idx];
    if (!r) return;
    var iso = thToIso(text);
    r[field] = iso;
    r[field + '_in'] = (norm(text) === '' || iso) ? '' : norm(text);
    spanApply(mkey, idx, r);
    spanPaint(mkey, idx, r);
    var el = (typeof document !== 'undefined') && document.querySelector('[data-wl-dt="' + mkey + '|' + idx + '|' + field + '"]');
    if (el) el.innerHTML = dateEcho(r, field);
    wlUpdateTotals();
  };

  function spanPaint(mkey, idx, r) {
    var el = (typeof document !== 'undefined') && document.querySelector('[data-wl-span="' + mkey + '|' + idx + '"]');
    if (el) el.innerHTML = spanNote(r);
  }
  // กลับไปให้ระบบคิดชั่วโมงจากวันเวลา
  window.wlSpanAuto = function (mkey, idx) {
    var d = state().draft || draft();
    var r = d[mkey] && d[mkey][idx];
    if (!r) return;
    r.hours_manual = '';
    spanApply(mkey, idx, r);
    renderCurrentPage();
  };
  window.wlRowAdd = function (mkey) {
    var st0 = state();
    if (st0.fold) st0.fold[mkey] = false;   // เพิ่มแถวแล้วต้องเห็นแถวใหม่
    var d = st0.draft || draft();
    var m = MISSIONS.filter(function (x) { return x.key === mkey; })[0];
    d[mkey].push(m.subject ? { subject_name: '', pieces: '', hours: '' }
      : m.timed ? { kind: 'กิจกรรมที่', activity: '', date_from: '', date_to: '', time_from: '', time_to: '', hours: '' }
      : { kind: 'กิจกรรมที่', activity: '', hours: '' });
    renderCurrentPage();
  };
  window.wlRowDel = function (mkey, idx) {
    var d = state().draft || draft();
    d[mkey].splice(idx, 1);
    renderCurrentPage();
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

  function inp(mkey, i, field, val, type, readonly, cls, extra) {
    if (readonly) return '<div class="text-sm py-2 ' + (cls.indexOf('center') >= 0 ? 'text-center' : '') + '">' + esc(val) + '</div>';
    return '<input type="' + type + '" value="' + esc(val) + '"' + (extra || '')
      + ' oninput="wlRowSet(\'' + mkey + '\',' + i + ',\'' + field + '\',this.value)" class="' + cls + ' border rounded-lg px-2 py-1.5 text-sm">';
  }

  /* แถวช่องกรอกวันที่และเวลาของกิจกรรมหนึ่งรายการ */
  function spanFields(mkey, i, r, readonly) {
    // วันที่กรอกเป็นปี พ.ศ. (เก็บเป็น ค.ศ. ข้างใน) ใต้ช่องมีคำอ่านกำกับให้ตรวจได้ว่าระบบเข้าใจตรงกัน
    var cells = [
      ['date_from', 'วันที่เริ่ม (พ.ศ.)', 'date'],
      ['date_to', 'วันที่สิ้นสุด (พ.ศ.)', 'date'],
      ['time_from', 'เวลาเริ่ม', 'time'],
      ['time_to', 'เวลาสิ้นสุด', 'time']
    ].map(function (c) {
      var isDate = c[2] === 'date';
      var shown = isDate ? (isoToTh(r[c[0]]) || norm(r[c[0] + '_in'])) : norm(r[c[0]]);
      var field = isDate
        ? '<input type="text" inputmode="numeric" maxlength="10" placeholder="วว/ดด/ปปปป" '
          + 'value="' + esc(shown) + '" '
          + 'oninput="wlRowDate(\'' + mkey + '\',' + i + ',\'' + c[0] + '\',this.value)" '
          + 'class="w-full border rounded-lg px-2 py-1.5 text-sm">'
          + '<span class="block text-[11px] mt-0.5" data-wl-dt="' + mkey + '|' + i + '|' + c[0] + '">' + dateEcho(r, c[0]) + '</span>'
        : '<input type="time" value="' + esc(shown) + '" '
          + 'oninput="wlRowSet(\'' + mkey + '\',' + i + ',\'' + c[0] + '\',this.value)" '
          + 'class="w-full border rounded-lg px-2 py-1.5 text-sm">';
      var ro = isDate
        ? (isoToThText(r[c[0]]) || norm(r[c[0] + '_in']) || '-')
        : (thTime(r[c[0]]) ? thTime(r[c[0]]) + ' น.' : '-');
      return '<label class="block"><span class="block text-[11px] text-gray-500 mb-0.5">' + c[1] + '</span>'
        + (readonly ? '<span class="block text-sm py-1">' + esc(ro) + '</span>' : field)
        + '</label>';
    }).join('');
    var manual = norm(r.hours_manual) === '1';
    return '<div class="col-span-12 rounded-xl bg-surface/60 border border-gray-100 p-2">'
      + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' + cells + '</div>'
      + '<div class="flex flex-wrap items-center gap-2 text-[11px] mt-1.5">'
      + '<i data-lucide="clock" class="w-3.5 h-3.5 text-gray-400"></i>'
      + '<span data-wl-span="' + mkey + '|' + i + '">' + spanNote(r) + '</span>'
      + (readonly || !manual ? '' :
          '<button type="button" onclick="wlSpanAuto(\'' + mkey + '\',' + i + ')" class="text-primary hover:underline">'
          + 'ให้คิดจากวันเวลาแทน</button>')
      + '</div></div>';
  }

  function missionEditor(m, d, readonly, cur) {
    if (!readonly && !canEditMission(m.key)) readonly = 'locked';
    var locked = readonly === 'locked';
    readonly = !!readonly;
    var list = d[m.key] || [];
    var raw = list.reduce(function (s, r) { return s + n(r.hours); }, 0);
    var w = d.weights[m.key];
    var folded = !!(state().fold || {})[m.key];
    // ชื่อพันธกิจเป็นปุ่มกดยุบ/ขยาย ส่วนปุ่มทำงานอื่นแยกออกไป จะได้ไม่กดชนกัน
    var head = '<div class="flex flex-wrap items-center justify-between gap-2' + (folded ? '' : ' mb-2') + '">'
      + '<button type="button" onclick="wlFold(\'' + m.key + '\')" '
      + 'class="font-semibold text-sm flex items-center gap-2 text-left hover:text-primary" '
      + 'title="' + (folded ? 'กดเพื่อขยาย' : 'กดเพื่อยุบ') + '">'
      + '<i data-lucide="chevron-down" data-wl-chev="' + m.key + '" class="w-4 h-4 text-gray-400 transition-transform"'
      + (folded ? ' style="transform:rotate(-90deg)"' : '') + '></i>'
      + '<span style="width:10px;height:10px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>'
      + esc(m.label) + ' <span class="text-xs font-normal text-gray-400">สัดส่วน ' + Math.round(w * 100) + '%</span>'
      + '<span class="text-xs font-normal text-gray-400">· ' + list.length + ' รายการ</span></button>'
      + '<div class="flex items-center gap-2 flex-wrap">'
      + '<span class="text-xs text-gray-500">รวม <b class="text-gray-800" data-wl-raw="' + m.key + '">' + fx(raw) + '</b> ชม.'
      + ' → ถ่วงน้ำหนัก <b style="color:' + m.color + '" data-wl-w="' + m.key + '">' + fx(raw * w) + '</b></span>'
      + (readonly ? '' : '<button type="button" onclick="wlRowAdd(\'' + m.key + '\')" class="px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">+ เพิ่มแถว</button>')
      + (m.subject && !readonly ? '<button type="button" onclick="wlPullSubjects()" class="px-2 py-1 rounded-lg border border-primary text-xs text-primary hover:bg-primaryLight">ดึงรายวิชาที่เปิดสอน</button>' : '')
      + (readonly ? '' : '<button type="button" onclick="wlSaveMission(\'' + m.key + '\')" class="px-3 py-1 rounded-lg text-xs text-white hover:opacity-90" style="background:' + m.color + '"><i data-lucide="save" class="w-3 h-3 inline mr-0.5"></i>บันทึกพันธกิจนี้</button>')
      + (locked ? '<span class="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500"><i data-lucide="lock" class="w-3 h-3 inline mr-0.5"></i>ไม่ได้รับมอบหมาย</span>' : '')
      + '</div></div>';

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
          + '<div class="col-span-2">' + inp(m.key, i, 'hours', r.hours, 'number', readonly, 'w-full text-center', m.timed ? ' data-wl-hr="' + m.key + '|' + i + '"' : '') + '</div>'
          + (readonly ? '' : '<div class="col-span-1 pt-2"><button type="button" onclick="wlRowDel(\'' + m.key + '\',' + i + ')" class="text-red-400 hover:text-red-600"><i data-lucide="x" class="w-4 h-4"></i></button></div>')
          + (m.timed ? spanFields(m.key, i, r, readonly) : '')
          + '<div class="col-span-12 -mt-1">' + partLine(m.key, i, r, readonly) + '</div>'
          + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="bg-white rounded-2xl p-4 border border-blue-100 mb-3">' + head
      + '<div data-wl-body="' + m.key + '"' + (folded ? ' hidden' : '') + '>'
      + '<div class="mb-2">' + metaLine(cur, m) + '</div>' + body + '</div></div>';
  }

  // บรรทัดบอกว่ากิจกรรมนี้นับให้ใครบ้าง พร้อมปุ่มเลือก
  function partLine(mkey, i, r, readonly) {
    // โหมดกรอกเป็นกลุ่มระบุผู้เข้าร่วมไว้ที่ตัวกลุ่มแล้ว ไม่ต้องถามซ้ำในแต่ละแถว
    if (state().mode === 'group') return '';
    var list = partOf(r);
    var total = cohortStudents(state().level).length;
    var txt = list.length
      ? '<span class="text-amber-700">เฉพาะ ' + list.length + ' คน</span>'
      : '<span class="text-gray-500">นักศึกษาทุกคนในชั้น' + (total ? ' (' + total + ' คน)' : '') + '</span>';
    return '<div class="flex items-center gap-2 text-[11px] pl-1">'
      + '<i data-lucide="users" class="w-3.5 h-3.5 text-gray-400"></i>'
      + '<span>ผู้เข้าร่วม: ' + txt + '</span>'
      + (readonly ? '' :
          '<button type="button" onclick="wlPickStudents(\'' + mkey + '\',' + i + ')" '
          + 'class="text-primary hover:underline">เลือกนักศึกษา</button>'
          + (list.length ? ' <button type="button" onclick="wlClearStudents(\'' + mkey + '\',' + i + ')" '
              + 'class="text-gray-400 hover:text-gray-600">ล้าง (ให้นับทุกคน)</button>' : ''))
      + '</div>';
  }

  /* ---------- กล่องเลือกนักศึกษาเข้าร่วมกิจกรรม ----------
     กิจกรรมนอกการเรียนการสอนไม่ได้มีนักศึกษาเข้าร่วมทุกคน
     จึงติ๊กเลือกได้ทีละหลายคน แทนการเพิ่มทีละคน */
  window.wlPickStudents = function (mkey, i) {
    var st = state();
    var d = st.draft || draft();
    var r = (d[mkey] || [])[i];
    if (!r) return;
    APP._wlPick = { kind: 'row', mkey: mkey, i: i, sel: {}, q: '' };
    partOf(r).forEach(function (sid) { APP._wlPick.sel[sid] = 1; });
    showModal('เลือกนักศึกษาที่เข้าร่วมกิจกรรม', pickBody());
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 30);
  };

  // เลือกนักศึกษาของโหมด "กรอกเป็นกลุ่ม" — ใช้กล่องเดียวกันกับการเลือกผู้เข้าร่วม
  window.wlPickGroup = function () {
    var st = state();
    APP._wlPick = { kind: 'group', sel: {}, q: '' };
    groupSel().forEach(function (sid) { APP._wlPick.sel[sid] = 1; });
    showModal('เลือกนักศึกษาที่จะกรอกภาระงานให้', pickBody());
    setTimeout(function () { if (window.lucide) lucide.createIcons(); }, 30);
  };

  function pickBody() {
    var p = APP._wlPick || { sel: {}, q: '' };
    var st = state();
    var all = cohortStudents(st.level);
    var q = norm(p.q).toLowerCase();
    var list = all.filter(function (s) {
      return !q || (norm(s.student_id) + ' ' + norm(s.name)).toLowerCase().indexOf(q) >= 0;
    });
    var count = Object.keys(p.sel).filter(function (k) { return p.sel[k]; }).length;

    return '<div class="space-y-3">'
      + '<div class="flex flex-wrap items-center gap-2">'
      + '<input id="wlPickSearch" value="' + esc(p.q) + '" placeholder="ค้นหารหัส/ชื่อ..." '
      + 'oninput="wlPickSet(\'q\',this.value)" class="flex-1 min-w-[180px] border rounded-xl px-3 py-2 text-sm">'
      + '<button type="button" onclick="wlPickAll(1)" class="px-3 py-2 rounded-xl border text-xs text-gray-600 hover:bg-gray-50">เลือกที่แสดงทั้งหมด</button>'
      + '<button type="button" onclick="wlPickAll(0)" class="px-3 py-2 rounded-xl border text-xs text-gray-600 hover:bg-gray-50">ไม่เลือกเลย</button>'
      + '</div>'
      + '<div class="text-xs text-gray-500">เลือกแล้ว <b id="wlPickCount" class="text-primary">' + count + '</b> คน '
      + 'จากนักศึกษาชั้นปีที่ ' + esc(st.level) + ' ทั้งหมด ' + all.length + ' คน'
      + ' · แสดง ' + list.length + ' รายการ</div>'
      + '<div class="border rounded-xl max-h-[45vh] overflow-y-auto divide-y">'
      + (list.length ? list.map(function (s) {
          var on = !!p.sel[s.student_id];
          return '<label class="flex items-center gap-3 px-3 py-2 hover:bg-surface cursor-pointer">'
            + '<input type="checkbox" ' + (on ? 'checked' : '') + ' value="' + esc(s.student_id) + '" '
            + 'onchange="wlPickOne(this.value,this.checked)" class="w-4 h-4">'
            + '<span class="font-mono text-xs text-gray-400 w-28">' + esc(s.student_id) + '</span>'
            + '<span class="text-sm">' + esc(s.name) + '</span></label>';
        }).join('') : '<p class="px-3 py-6 text-center text-sm text-gray-400">ไม่พบนักศึกษา</p>')
      + '</div>'
      + '<div class="flex items-center gap-2">'
      + '<button type="button" onclick="wlPickApply()" class="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm">ใช้รายชื่อนี้</button>'
      + '<button type="button" onclick="closeModal()" class="px-4 py-2.5 rounded-xl border text-sm text-gray-600">ยกเลิก</button>'
      + '</div>'
      + '<p class="text-[11px] text-gray-400">' + (p.kind === 'group'
          ? 'ค่าที่กรอกจะถูกบันทึกเป็นค่าเฉพาะรายของนักศึกษาทุกคนที่เลือก'
          : 'ถ้าไม่เลือกใครเลย ระบบจะนับกิจกรรมนี้ให้นักศึกษาทุกคนในชั้น') + '</p>'
      + '</div>';
  }

  window.wlPickSet = function (k, v) {
    if (!APP._wlPick) return;
    APP._wlPick[k] = v;
    // วาดเฉพาะเนื้อในกล่อง ไม่ปิดกล่อง เพื่อไม่ให้เคอร์เซอร์ในช่องค้นหาหลุด
    var wrap = document.querySelector('#modalContainer .space-y-3');
    if (wrap) {
      wrap.outerHTML = pickBody();
      var inp2 = document.getElementById('wlPickSearch');
      if (inp2) { inp2.focus(); inp2.setSelectionRange(inp2.value.length, inp2.value.length); }
      if (window.lucide) lucide.createIcons();
    }
  };
  window.wlPickOne = function (sid, on) {
    if (!APP._wlPick) return;
    if (on) APP._wlPick.sel[sid] = 1; else delete APP._wlPick.sel[sid];
    var c = document.getElementById('wlPickCount');
    if (c) c.textContent = Object.keys(APP._wlPick.sel).length;
  };
  window.wlPickAll = function (on) {
    if (!APP._wlPick) return;
    var p = APP._wlPick, st = state();
    var q = norm(p.q).toLowerCase();
    cohortStudents(st.level).forEach(function (s) {
      if (q && (norm(s.student_id) + ' ' + norm(s.name)).toLowerCase().indexOf(q) < 0) return;
      if (on) p.sel[s.student_id] = 1; else delete p.sel[s.student_id];
    });
    wlPickSet('q', p.q);
  };
  window.wlPickApply = function () {
    var p = APP._wlPick;
    if (!p) return;
    var st = state();
    var sel = Object.keys(p.sel).filter(function (k) { return p.sel[k]; });

    if (p.kind === 'group') {
      var g = {};
      sel.forEach(function (sid) { g[sid] = 1; });
      st.gsel = g;
      // เลือกคนเดียว = แก้เฉพาะราย จึงโหลดค่าที่เคยปรับไว้ของคนนั้นมาตั้งต้นใหม่
      if (sel.length === 1) st.draft = null;
      APP._wlPick = null;
      closeModal();
      renderCurrentPage();
      return;
    }

    var d = st.draft || draft();
    var r = (d[p.mkey] || [])[p.i];
    if (!r) { closeModal(); return; }
    var all = cohortStudents(st.level).length;
    // เลือกครบทุกคน = เท่ากับไม่เจาะจง เก็บเป็นค่าว่างจะอ่านง่ายกว่า
    r.students = (sel.length && sel.length < all) ? sel : [];
    APP._wlPick = null;
    closeModal();
    renderCurrentPage();
  };
  window.wlGroupClear = function () {
    state().gsel = {};
    renderCurrentPage();
  };
  window.wlClearStudents = function (mkey, i) {
    var d = state().draft || draft();
    var r = (d[mkey] || [])[i];
    if (!r) return;
    r.students = [];
    renderCurrentPage();
  };

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

  /* ---------------- แท็บ 2 : กรอกภาระงาน (ทั้งชั้นปี / เป็นกลุ่ม) ---------------- */
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

  /* ---------------- ขั้นที่ 3-4 : กล่องกรอกที่ยุบ-ขยายได้ ----------------
     กล่องที่เปิดอยู่คือโหมดที่จะบันทึก เปิดกล่องหนึ่งอีกกล่องจะยุบลง
     เพื่อไม่ให้สับสนว่าค่าที่กรอกอยู่จะถูกบันทึกให้ทั้งชั้นปีหรือเฉพาะคนที่เลือก */
  function sectionBox(key, icon, title, sub, badge, body) {
    var open = state().mode === key;
    return '<div class="bg-white rounded-2xl border mb-4 overflow-hidden ' + (open ? 'border-primary' : 'border-blue-100') + '">'
      + '<button type="button" onclick="wlSection(\'' + key + '\')" data-wl-sec="' + key + '" '
      + 'class="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface/60">'
      + '<span class="flex items-center gap-3 min-w-0">'
      + '<span class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + (open ? 'bg-primary' : 'bg-gray-100') + '">'
      + '<i data-lucide="' + icon + '" class="w-5 h-5 ' + (open ? 'text-white' : 'text-gray-500') + '"></i></span>'
      + '<span class="min-w-0"><span class="block text-sm font-semibold ' + (open ? 'text-primary' : 'text-gray-800') + '">' + esc(title) + '</span>'
      + '<span class="block text-[11px] text-gray-500">' + sub + '</span></span></span>'
      + '<span class="flex items-center gap-2 flex-shrink-0">' + (badge || '')
      + '<i data-lucide="chevron-down" class="w-5 h-5 text-gray-400 transition-transform"'
      + (open ? '' : ' style="transform:rotate(-90deg)"') + '></i></span></button>'
      + (open ? '<div class="px-5 pb-5 pt-4 border-t border-gray-100 fade-in">' + body() + '</div>' : '')
      + '</div>';
  }

  window.wlSection = function (key) {
    var st = state();
    wlSet('mode', st.mode === key ? '' : key);
  };

  // พันธกิจที่จะกรอกในกล่องนี้ — '' คือกรอกทุกพันธกิจพร้อมกันเหมือนเดิม
  function shownMissions() {
    var k = state().mission;
    return k ? MISSIONS.filter(function (m) { return m.key === k; }) : MISSIONS;
  }

  function missionPicker() {
    var st = state();
    var chip = function (on, label, color, locked, onclick) {
      return '<button type="button" onclick="' + onclick + '" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition '
        + (on ? 'border-primary bg-primaryLight text-primary font-semibold' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50') + '">'
        + (color ? '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';display:inline-block"></span>' : '')
        + esc(label)
        + (locked ? '<i data-lucide="lock" class="w-3 h-3 text-gray-400"></i>' : '') + '</button>';
    };
    return '<p class="text-xs font-semibold text-gray-600 mb-2"><i data-lucide="target" class="w-3.5 h-3.5 inline mr-1"></i>เลือกพันธกิจ</p>'
      + '<div class="flex flex-wrap gap-2 mb-4">'
      + chip(!st.mission, 'ทุกพันธกิจ', '', false, 'wlSet(\'mission\',\'\')')
      + MISSIONS.map(function (m) {
          return chip(st.mission === m.key, m.label, m.color, !canEditMission(m.key), 'wlSet(\'mission\',\'' + m.key + '\')');
        }).join('')
      + '</div>';
  }

  /* รายชื่อนักศึกษาของกล่อง "กรอกรายบุคคล" — ติ๊กเลือกได้ทีละหลายคนในหน้าเดียว */
  function groupListBox() {
    var st = state();
    var all = cohortStudents(st.level);
    var q = norm(st.gq).toLowerCase();
    var list = q ? all.filter(function (s) {
      return (norm(s.student_id) + ' ' + norm(s.name)).toLowerCase().indexOf(q) >= 0;
    }) : all;
    var g = st.gsel || {};
    return '<div data-wl-glist="1" class="border border-gray-200 rounded-xl max-h-72 overflow-y-auto divide-y divide-gray-50">'
      + (list.length ? list.map(function (s) {
          var sid = norm(s.student_id), on = !!g[sid];
          return '<label class="flex items-center gap-3 px-3 py-2 cursor-pointer ' + (on ? 'bg-primaryLight' : 'hover:bg-surface') + '">'
            + '<input type="checkbox" ' + (on ? 'checked' : '') + ' value="' + esc(sid) + '" '
            + 'onchange="wlGroupOne(this.value,this.checked)" class="w-4 h-4 flex-shrink-0">'
            + '<span class="font-mono text-xs text-gray-400 w-28 flex-shrink-0">' + esc(sid) + '</span>'
            + '<span class="text-sm truncate">' + esc(s.name) + '</span></label>';
        }).join('') : '<p class="px-3 py-6 text-center text-sm text-gray-400">ไม่พบนักศึกษา</p>')
      + '</div>';
  }

  function groupPicker() {
    var st = state();
    var all = cohortStudents(st.level);
    return '<p class="text-xs font-semibold text-gray-600 mb-2"><i data-lucide="users" class="w-3.5 h-3.5 inline mr-1"></i>รายชื่อนักศึกษา</p>'
      + '<div class="flex flex-wrap items-center gap-2 mb-2">'
      + '<input id="wlGroupSearch" value="' + esc(st.gq || '') + '" placeholder="ค้นหารหัส/ชื่อ..." '
      + 'oninput="wlGroupSearch(this.value)" class="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm">'
      + '<button type="button" onclick="wlGroupAll(1)" class="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">เลือกที่แสดงทั้งหมด</button>'
      + '<button type="button" onclick="wlGroupAll(0)" class="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">ล้างรายชื่อ</button>'
      + '</div>'
      + '<p class="text-xs text-gray-500 mb-2">เลือกแล้ว <b data-wl-gcount="1" class="text-primary">' + groupSel().length + '</b> คน'
      + ' จาก' + esc(levelLabel(st.year, st.level)) + ' ทั้งหมด ' + all.length + ' คน</p>'
      + groupListBox()
      + '<p class="text-[11px] text-gray-400 mt-2">ค่าที่กรอกจะถูกบันทึกเป็นค่าเฉพาะรายของนักศึกษาทุกคนที่ติ๊กไว้'
      + ' · ติ๊กคนเดียวจะดึงค่าเดิมของคนนั้นขึ้นมาแก้</p>';
  }

  window.wlGroupSearch = function (v) {
    var st = state();
    st.gq = v;
    // วาดใหม่เฉพาะกล่องรายชื่อ ช่องค้นหาจึงไม่เสียโฟกัสและไม่เสียตำแหน่งเคอร์เซอร์
    var box = document.querySelector('[data-wl-glist]');
    if (box) { box.outerHTML = groupListBox(); if (window.lucide) lucide.createIcons(); }
    else renderCurrentPage();
  };
  window.wlGroupOne = function (sid, on) {
    var st = state();
    if (!st.gsel) st.gsel = {};
    var before = groupSel().length;
    if (on) st.gsel[norm(sid)] = 1; else delete st.gsel[norm(sid)];
    var after = groupSel().length;
    // ติ๊กคนเดียว = แก้ค่าเฉพาะรายของคนนั้น ต้องดึงค่าเดิมของเขามาตั้งต้นใหม่
    // (ทั้งตอนเข้าสู่สภาพ "คนเดียว" และตอนออกจากสภาพนั้น)
    if (before === 1 || after === 1) { st.draft = null; renderCurrentPage(); return; }
    var c = document.querySelector('[data-wl-gcount]');
    if (c) c.textContent = after;
  };
  window.wlGroupAll = function (on) {
    var st = state();
    var q = norm(st.gq).toLowerCase();
    if (!st.gsel) st.gsel = {};
    cohortStudents(st.level).forEach(function (s) {
      var sid = norm(s.student_id);
      if (q && (sid + ' ' + norm(s.name)).toLowerCase().indexOf(q) < 0) return;
      if (on) st.gsel[sid] = 1; else delete st.gsel[sid];
    });
    st.draft = null;
    renderCurrentPage();
  };

  /* กล่องเลือกโหมดกรอกแบบเดิม (ปุ่ม 2 อัน + กล่องเลือกนักศึกษาแบบป๊อปอัป)
     ถูกแทนที่ด้วยกล่องยุบ-ขยาย 2 กล่องด้านบนแล้ว จึงเอาออกเพื่อไม่ให้มีสองทางทำงานซ้อนกัน */

  /* รายชื่อนักศึกษาที่มีค่าเฉพาะรายของชั้นปี/ภาคนี้ — แทนแท็บรายบุคคลที่ยุบไปแล้ว */
  function ovrPanel() {
    var st = state();
    var plan = planOf(st.year, st.level, st.sem);
    var list = get('workload_student').filter(function (o) {
      return norm(o.academic_year) === norm(st.year) && norm(o.year_level) === norm(st.level) && norm(o.semester) === norm(st.sem);
    });
    if (!list.length) return '';
    var names = get('student');
    var body = list.map(function (o) {
      var sid = norm(o.student_id);
      var s = names.filter(function (x) { return norm(x.student_id) === sid; })[0] || {};
      var c = calc(plan, o, sid);
      return '<tr class="border-t hover:bg-gray-50">'
        + '<td class="px-4 py-2.5 font-mono text-primary">' + esc(sid) + '</td>'
        + '<td class="px-4 py-2.5">' + esc(s.name || '-') + '</td>'
        + '<td class="px-3 py-2.5 text-center tabular-nums font-semibold text-amber-700">' + fx(c.total) + '</td>'
        + '<td class="px-3 py-2.5 text-center text-[11px] text-gray-500">' + esc(norm(o.updated_by) || '-') + '</td>'
        + (canEdit() ? '<td class="px-3 py-2.5 text-center whitespace-nowrap">'
            + '<button onclick="wlEditStudent(\'' + esc(sid) + '\')" class="text-blue-400 hover:text-blue-600" title="แก้ค่าเฉพาะรายคนนี้"><i data-lucide="pencil" class="w-4 h-4"></i></button>'
            + '<button onclick="wlResetStudent(\'' + esc(sid) + '\')" class="text-red-400 hover:text-red-600 ml-1" title="กลับไปใช้ค่ามาตรฐานของชั้นปี"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button></td>' : '')
        + '</tr>';
    }).join('');
    return '<div class="bg-white rounded-2xl p-5 border border-amber-100 mt-4">'
      + '<h3 class="font-bold mb-1">นักศึกษาที่มีค่าเฉพาะราย (' + list.length + ' คน)</h3>'
      + '<p class="text-xs text-gray-500 mb-3">ชั้นปีที่ ' + esc(st.level) + ' ภาค ' + semName(st.sem) + ' ปีการศึกษา ' + esc(st.year)
      + ' — คนเหล่านี้ใช้ค่าที่บันทึกไว้เฉพาะตัว ไม่ใช่ค่ามาตรฐานของชั้นปี</p>'
      + '<div class="overflow-x-auto"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left"><th class="px-4 py-2.5 font-semibold">รหัส</th>'
      + '<th class="px-4 py-2.5 font-semibold">ชื่อ-สกุล</th>'
      + '<th class="px-3 py-2.5 font-semibold text-center">ชั่วโมงรวม</th>'
      + '<th class="px-3 py-2.5 font-semibold text-center">บันทึกโดย</th>'
      + (canEdit() ? '<th class="px-3 py-2.5"></th>' : '') + '</tr></thead>'
      + '<tbody>' + body + '</tbody></table></div></div>';
  }

  /* ================= นำเข้า/ส่งออกภาระงานเป็นไฟล์ CSV =================
     ดาวน์โหลดแบบฟอร์ม → กรอกใน Excel → อัปโหลดกลับ
     ข้อมูลที่นำเข้าจะไปลงในช่องกรอกบนหน้าจอก่อน ยังไม่เขียนลงระบบ
     ผู้ใช้ต้องตรวจแล้วกดปุ่มบันทึกเองเหมือนกรอกด้วยมือ */
  var CSV_COLS = ['mission', 'kind', 'subject_name', 'activity', 'pieces', 'hours',
    'date_from', 'date_to', 'time_from', 'time_to', 'students'];

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
  /* อ่าน CSV ให้ถูกแม้มีจุลภาคหรือขึ้นบรรทัดใหม่อยู่ในเครื่องหมายคำพูด
     ชื่อกิจกรรมภาษาไทยมักมีจุลภาค ถ้าตัดด้วย split(',') เฉย ๆ ข้อมูลจะเพี้ยน */
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
    return out.filter(function (r) { return r.some(function (c) { return norm(c) !== ''; }); });
  }

  // รับได้ทั้งรหัสพันธกิจ ชื่อเต็ม และชื่อย่อ เผื่อผู้ใช้พิมพ์เอง
  function missionByName(v) {
    var t = norm(v).toLowerCase();
    if (!t) return null;
    return MISSIONS.filter(function (m) {
      return m.key.toLowerCase() === t || m.label.toLowerCase() === t || m.short.toLowerCase() === t;
    })[0] || null;
  }

  function wlCsvPanel(which) {
    var st = state();
    var target = which === 'group'
      ? (groupSel().length ? 'นักศึกษาที่เลือกไว้ ' + groupSel().length + ' คน' : 'ยังไม่ได้เลือกนักศึกษา')
      : esc(levelLabel(st.year, st.level)) + ' ทั้งชั้น';
    var btn = function (onclick, icon, label, cls) {
      return '<button type="button" onclick="' + onclick + '" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm ' + cls + '">'
        + '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' + esc(label) + '</button>';
    };
    return '<div class="border border-emerald-100 bg-emerald-50/40 rounded-2xl p-4 mb-4">'
      + '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">'
      + '<p class="text-sm font-semibold text-gray-700"><i data-lucide="file-spreadsheet" class="w-4 h-4 inline mr-1 text-emerald-600"></i>'
      + 'กรอกผ่านไฟล์ CSV</p>'
      + '<span class="text-[11px] text-gray-500">' + esc(levelLabel(st.year, st.level)) + ' · '
      + esc(semLabel(st.sem)) + ' · ปีการศึกษา ' + esc(st.year) + '</span></div>'
      + '<div class="flex flex-wrap gap-2 mb-2">'
      + btn('wlCsvTemplate()', 'download', 'ดาวน์โหลดแบบฟอร์ม CSV', 'border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50')
      + btn('wlCsvPick()', 'upload', 'อัปโหลดไฟล์ CSV', 'border-primary text-primary bg-white hover:bg-primaryLight')
      + '</div>'
      + '<input type="file" id="wlCsvInput" accept=".csv,text/csv" class="hidden" onchange="wlCsvFile(event)">'
      + '<p class="text-[11px] text-gray-500">'
      + 'แบบฟอร์มที่ดาวน์โหลดมีข้อมูลเดิมติดมาด้วย · คอลัมน์ : ' + CSV_COLS.join(', ') + '<br>'
      + 'วันที่กรอกเป็น วว/ดด/ปปปป (พ.ศ.) เวลาเป็น ชช:นน · ช่อง students ใส่รหัสนักศึกษาคั่นด้วยเว้นวรรค (เว้นว่าง = ทุกคนในชั้น)<br>'
      + '<b class="text-gray-700">นำเข้าแล้วข้อมูลจะไปลงในช่องกรอกด้านล่างก่อน ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึก</b>'
      + ' · พันธกิจที่ไม่มีข้อมูลในไฟล์จะไม่ถูกแตะ · จะเขียนทับเฉพาะพันธกิจที่มีข้อมูลในไฟล์<br>'
      + 'ค่านี้จะลงให้กับ : <b class="text-gray-700">' + target + '</b></p>'
      + '</div>';
  }

  window.wlCsvTemplate = function () {
    var st = state();
    var d = draft();
    var rows = [CSV_COLS.slice()];
    MISSIONS.forEach(function (m) {
      var list = d[m.key] || [];
      if (!list.length) {
        // ยังไม่มีข้อมูล — ใส่แถวเปล่าที่ระบุชื่อพันธกิจไว้ให้ จะได้รู้ว่ากรอกค่าอะไรได้บ้าง
        rows.push([m.label, '', '', '', '', '', '', '', '', '', '']);
        return;
      }
      list.forEach(function (r) {
        rows.push([
          m.label,
          m.subject ? '' : norm(r.kind) || ACT_KINDS[0],
          m.subject ? norm(r.subject_name) : '',
          m.subject ? '' : norm(r.activity),
          m.subject ? norm(r.pieces) : '',
          norm(r.hours),
          m.timed ? (isoToTh(r.date_from) || norm(r.date_from_in)) : '',
          m.timed ? (isoToTh(r.date_to) || norm(r.date_to_in)) : '',
          m.timed ? norm(r.time_from) : '',
          m.timed ? norm(r.time_to) : '',
          partOf(r).join(' ')
        ]);
      });
    });
    csvDownload('workload_' + norm(st.year) + '_ชั้นปี' + norm(st.level) + '_ภาค' + norm(st.sem) + '.csv', rows);
    showToast('ดาวน์โหลดแบบฟอร์มแล้ว (' + (rows.length - 1) + ' แถว)');
  };

  window.wlCsvPick = function () {
    var el = document.getElementById('wlCsvInput');
    if (!el) { showToast('ไม่พบช่องเลือกไฟล์', 'error'); return; }
    el.value = '';
    el.click();
  };

  window.wlCsvFile = async function (ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!f) return;
    var text = '';
    try { text = await f.text(); } catch (e) { showToast('อ่านไฟล์ไม่สำเร็จ: ' + e, 'error'); return; }
    var rows = parseCsv(text);
    if (rows.length < 2) { showToast('ไฟล์ CSV ไม่มีข้อมูล', 'error'); return; }
    wlCsvPlan(rows, f.name);
  };

  function wlCsvPlan(rows, fname) {
    var st = state();
    var head = rows[0].map(function (x) { return norm(x).toLowerCase(); });
    var at = function (r, key) { var i = head.indexOf(key); return i < 0 ? '' : norm(r[i]); };
    if (head.indexOf('mission') < 0) {
      showModal('อ่านไฟล์ไม่ออก',
        '<p class="text-sm text-gray-600">ไฟล์นี้ไม่มีคอลัมน์ <b>mission</b> จึงไม่รู้ว่าแต่ละแถวเป็นพันธกิจใด</p>'
        + '<p class="text-xs text-gray-500 mt-2">ดาวน์โหลดแบบฟอร์มจากปุ่มด้านบนแล้วกรอกในไฟล์นั้นจะตรงที่สุด</p>'
        + '<p class="text-xs text-gray-400 mt-2">หัวตารางที่พบ: ' + esc(rows[0].join(', ')) + '</p>');
      return;
    }

    var ids = {};
    cohortStudents(st.level).forEach(function (s) { ids[norm(s.student_id)] = 1; });

    var byMission = {}, bad = [], total = 0, blank = 0;
    rows.slice(1).forEach(function (raw, i) {
      var line = i + 2;
      var m = missionByName(at(raw, 'mission'));
      if (!m) {
        if (norm(at(raw, 'mission')) === '') return;   // แถวว่างสนิท ข้ามเงียบ ๆ
        bad.push('บรรทัด ' + line + ' : ไม่รู้จักพันธกิจ "' + at(raw, 'mission') + '"');
        return;
      }
      var name = m.subject ? at(raw, 'subject_name') : at(raw, 'activity');
      var hrs = at(raw, 'hours');
      if (!name && !hrs && !at(raw, 'date_from') && !at(raw, 'time_from')) { blank++; return; }  // แถวเปล่าของแบบฟอร์ม
      if (!canEditMission(m.key)) { bad.push('บรรทัด ' + line + ' : ไม่ได้รับมอบหมายให้บันทึก' + m.label); return; }
      if (!name) { bad.push('บรรทัด ' + line + ' : ' + m.short + ' ไม่ได้กรอก' + (m.subject ? 'ชื่อรายวิชา' : 'ชื่อกิจกรรม')); return; }
      if (hrs !== '' && !isFinite(Number(hrs))) { bad.push('บรรทัด ' + line + ' : ชั่วโมง "' + hrs + '" ไม่ใช่ตัวเลข'); return; }

      var r = {};
      if (m.subject) {
        r.subject_name = name;
        var pc = at(raw, 'pieces');
        if (pc !== '' && !isFinite(Number(pc))) { bad.push('บรรทัด ' + line + ' : จำนวนชิ้นงาน "' + pc + '" ไม่ใช่ตัวเลข'); return; }
        r.pieces = pc;
      } else {
        r.activity = name;
        var kd = at(raw, 'kind');
        r.kind = ACT_KINDS.indexOf(kd) >= 0 ? kd : ACT_KINDS[0];
        if (kd && ACT_KINDS.indexOf(kd) < 0) bad.push('บรรทัด ' + line + ' : ประเภท "' + kd + '" ไม่มีในระบบ ใช้ "' + ACT_KINDS[0] + '" แทน');
      }

      if (m.timed) {
        ['date_from', 'date_to'].forEach(function (k) {
          var v = at(raw, k);
          var iso = thToIso(v);
          r[k] = iso;
          r[k + '_in'] = (v === '' || iso) ? '' : v;
          if (v !== '' && !iso) bad.push('บรรทัด ' + line + ' : วันที่ "' + v + '" ต้องเป็น วว/ดด/ปปปป (พ.ศ.)');
        });
        ['time_from', 'time_to'].forEach(function (k) {
          var v = at(raw, k);
          if (v !== '' && minOfDay(v) === null) { bad.push('บรรทัด ' + line + ' : เวลา "' + v + '" ต้องเป็น ชช:นน'); v = ''; }
          r[k] = v;
        });
      }

      /* ชั่วโมง : กรอกมาเองก็ใช้ตามนั้น (พันธกิจแบบมีวันเวลาจะทำเครื่องหมายว่ากรอกเอง)
         ไม่กรอกมา และมีวันเวลาครบ ก็คิดให้จากวันเวลาเหมือนกรอกบนหน้าจอ
         ไม่มีทั้งคู่ ปล่อยว่างไว้ ไม่เดาตัวเลขให้ */
      if (hrs !== '') {
        r.hours = hrs;
        if (m.timed) r.hours_manual = '1';
      } else if (m.timed) {
        var c = spanCalc(r);
        r.hours = c.ready ? String(c.hours) : '';
        if (!c.ready) bad.push('บรรทัด ' + line + ' : ' + name + ' — ' + (c.err || 'ยังคิดชั่วโมงไม่ได้') + ' (ปล่อยชั่วโมงว่างไว้)');
      } else {
        r.hours = '';
        bad.push('บรรทัด ' + line + ' : ' + name + ' ไม่ได้กรอกชั่วโมง (นำเข้าให้แต่นับเป็น 0)');
      }

      var sel = norm(at(raw, 'students')).split(/[\s,;]+/).filter(Boolean);
      var unknown = sel.filter(function (x) { return !ids[x]; });
      if (unknown.length) bad.push('บรรทัด ' + line + ' : ไม่พบรหัสนักศึกษา ' + unknown.join(', ') + ' ในชั้นปีนี้ (ไม่นำเข้ารหัสเหล่านี้)');
      r.students = sel.filter(function (x) { return ids[x]; });

      if (!byMission[m.key]) byMission[m.key] = [];
      byMission[m.key].push(r);
      total++;
    });

    APP._wlCsv = { byMission: byMission, total: total };

    var keys = Object.keys(byMission);
    var d = draft();
    var lines = MISSIONS.map(function (m) {
      var n0 = (d[m.key] || []).length;
      var n1 = byMission[m.key] ? byMission[m.key].length : null;
      return '<tr class="border-t border-gray-50">'
        + '<td class="px-3 py-1.5"><span style="width:8px;height:8px;border-radius:50%;background:' + m.color + ';display:inline-block;margin-right:6px"></span>'
        + esc(m.label) + '</td>'
        + '<td class="px-3 py-1.5 text-center text-gray-500">' + n0 + '</td>'
        + '<td class="px-3 py-1.5 text-center ' + (n1 === null ? 'text-gray-300' : 'font-semibold text-primary') + '">'
        + (n1 === null ? '—' : n1) + '</td>'
        + '<td class="px-3 py-1.5 text-xs ' + (n1 === null ? 'text-gray-400' : 'text-emerald-700') + '">'
        + (n1 === null ? 'ไม่มีข้อมูลในไฟล์ — คงของเดิมไว้' : 'เขียนทับด้วยข้อมูลจากไฟล์') + '</td></tr>';
    }).join('');

    var st2 = state();
    var where = st2.mode === 'group'
      ? (groupSel().length ? 'ค่าเฉพาะรายของนักศึกษาที่เลือกไว้ ' + groupSel().length + ' คน' : 'ยังไม่ได้เลือกนักศึกษา')
      : levelLabel(st2.year, st2.level) + ' ทั้งชั้น';

    showModal('นำเข้าภาระงานจากไฟล์ ' + esc(fname),
      '<div class="space-y-3">'
      + '<div class="grid grid-cols-3 gap-2 text-center">'
      + '<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><p class="text-2xl font-bold text-emerald-700">' + total + '</p><p class="text-xs text-gray-600">รายการที่นำเข้าได้</p></div>'
      + '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3"><p class="text-2xl font-bold text-primary">' + keys.length + '</p><p class="text-xs text-gray-600">พันธกิจที่จะเขียนทับ</p></div>'
      + '<div class="rounded-xl bg-gray-50 border border-gray-100 p-3"><p class="text-2xl font-bold text-gray-500">' + bad.length + '</p><p class="text-xs text-gray-600">ข้อสังเกต</p></div>'
      + '</div>'
      + '<div class="border border-gray-100 rounded-xl overflow-hidden"><table class="w-full text-sm">'
      + '<thead><tr class="bg-surface text-left"><th class="px-3 py-2 font-semibold">พันธกิจ</th>'
      + '<th class="px-3 py-2 font-semibold text-center">มีอยู่เดิม</th>'
      + '<th class="px-3 py-2 font-semibold text-center">ในไฟล์</th>'
      + '<th class="px-3 py-2 font-semibold">ผลที่จะเกิด</th></tr></thead><tbody>' + lines + '</tbody></table></div>'
      + (bad.length
          ? '<div class="border border-amber-200 bg-amber-50 rounded-xl p-3">'
            + '<p class="text-xs font-semibold text-amber-800 mb-1">ข้อสังเกต ' + bad.length + ' รายการ</p>'
            + '<ul class="text-[11px] text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">'
            + bad.slice(0, 50).map(function (x) { return '<li>• ' + esc(x) + '</li>'; }).join('')
            + (bad.length > 50 ? '<li class="text-amber-600">… และอีก ' + (bad.length - 50) + ' รายการ</li>' : '')
            + '</ul></div>'
          : '')
      + (blank ? '<p class="text-[11px] text-gray-400">ข้ามแถวเปล่าของแบบฟอร์ม ' + blank + ' แถว</p>' : '')
      + '<p class="text-xs text-gray-600">ค่าที่นำเข้าจะไปลงในช่องกรอกของ <b>' + esc(where) + '</b>'
      + ' — <b class="text-gray-800">ยังไม่บันทึกลงระบบ</b> ตรวจบนหน้าจอแล้วกดปุ่มบันทึกเองอีกครั้ง</p>'
      + (total ? '' : '<p class="text-sm text-red-600">ไม่มีรายการที่นำเข้าได้</p>')
      + '</div>',
      total ? function () { return window.wlCsvApply(); } : null, 'max-w-2xl');
  }

  window.wlCsvApply = function () {
    var p = APP._wlCsv;
    if (!p || !p.total) return;
    var st = state();
    var d = st.draft || draft();
    Object.keys(p.byMission).forEach(function (k) { d[k] = p.byMission[k]; });
    st.draft = d;
    APP._wlCsv = null;
    if (typeof closeModal === 'function') closeModal();
    showToast('นำเข้าแล้ว ' + p.total + ' รายการ — ตรวจแล้วกดบันทึกเพื่อเก็บลงระบบ');
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
  };

  /* แถบสรุปชั่วโมง + ปุ่มบันทึก ของกล่องที่เปิดอยู่ */
  function grandCard(group) {
    var st = state();
    var sel = groupSel();
    var d = draft();
    var shown = shownMissions();
    var total = shown.reduce(function (s, m) {
      return s + (d[m.key] || []).reduce(function (a, r) { return a + n(r.hours); }, 0) * d.weights[m.key];
    }, 0);
    var scope = st.mission ? ('เฉพาะ' + esc((missionOf(st.mission) || {}).label || '')) : 'ทุกพันธกิจ';
    var saveLabel = group
      ? (st.mission ? 'บันทึกพันธกิจนี้ให้ทุกคนที่เลือก' : 'บันทึกให้ทุกคนที่เลือก')
      : (st.mission ? 'บันทึกพันธกิจนี้' : 'บันทึกทุกพันธกิจที่ทำได้');
    return '<div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 flex flex-wrap items-start justify-between gap-3">'
      + '<div><p class="text-sm text-gray-600">ชั่วโมงภาระงาน (' + scope + ') · ' + esc(levelLabel(st.year, st.level))
      + ' ' + esc(semLabel(st.sem)) + ' ปีการศึกษา ' + esc(st.year) + '</p>'
      + '<p class="text-3xl font-bold text-primary tabular-nums" id="wlGrand">' + fx(total) + '</p>'
      + '<p class="text-xs text-gray-500">' + (group
          ? (sel.length
              ? 'จะบันทึกเป็นค่าเฉพาะรายให้นักศึกษาที่เลือกไว้ ' + sel.length + ' คน'
              : '<span class="text-amber-700">ยังไม่ได้ติ๊กเลือกนักศึกษา — เลือกจากรายชื่อด้านบนก่อนบันทึก</span>')
          : 'ใช้กับนักศึกษารหัส ' + esc(cohortPrefix(st.year, st.level))
            + ' จำนวน ' + cohortStudents(st.level).length + ' คน ที่ไม่ได้ปรับเฉพาะราย') + '</p></div>'
      + '<button onclick="wlSavePlan()" class="px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primaryDark text-sm flex items-center gap-2 self-start">'
      + '<i data-lucide="save" class="w-4 h-4"></i>' + saveLabel + '</button></div>';
  }

  function foldBar() {
    if (state().mission) return '';   // เลือกพันธกิจเดียวแล้ว ไม่ต้องมีปุ่มยุบ/ขยายทั้งหมด
    return '<div class="flex items-center justify-end gap-3 mb-2 text-xs">'
      + '<button type="button" onclick="wlFoldAll(1)" class="text-gray-500 hover:text-primary">'
      + '<i data-lucide="chevrons-down-up" class="w-3.5 h-3.5 inline mr-0.5"></i>ยุบทั้งหมด</button>'
      + '<button type="button" onclick="wlFoldAll(0)" class="text-gray-500 hover:text-primary">'
      + '<i data-lucide="chevrons-up-down" class="w-3.5 h-3.5 inline mr-0.5"></i>ขยายทั้งหมด</button></div>';
  }

  function missionEditors(group) {
    var st = state();
    var d = draft();
    var sel = groupSel();
    return shownMissions().map(function (m) {
      var cur = group
        ? (sel.length === 1 ? overrideOf(sel[0], st.year, st.sem) : null)
        : planOf(st.year, st.level, st.sem);
      return missionEditor(m, d, false, cur);
    }).join('');
  }

  function planTab() {
    var st = state();
    if (!canEdit()) return cohortPicker() + readonlyPlan();
    var sel = groupSel();
    var badge = function (txt, cls) {
      return '<span class="text-[11px] px-2 py-1 rounded-lg ' + cls + '">' + esc(txt) + '</span>';
    };
    return cohortPicker()
      + missionScopeNote()
      + sectionBox('cohort', 'users', 'กรอกข้อมูลทั้งชั้นปี',
          'ค่ามาตรฐานที่ใช้กับนักศึกษาทุกคนใน' + esc(levelLabel(st.year, st.level)) + ' ' + esc(semLabel(st.sem)),
          badge(cohortStudents(st.level).length + ' คน', 'bg-blue-50 text-blue-700'),
          function () { return missionPicker() + wlCsvPanel('cohort') + grandCard(false) + foldBar() + missionEditors(false); })
      + sectionBox('group', 'user-check', 'กรอกรายบุคคล (เลือกได้หลายคน)',
          'ติ๊กเลือกนักศึกษาแล้วบันทึกค่าเดียวกันให้ทุกคนที่เลือก',
          badge(sel.length ? 'เลือกแล้ว ' + sel.length + ' คน' : 'ยังไม่ได้เลือก',
            sel.length ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'),
          function () { return missionPicker() + groupPicker() + wlCsvPanel('group') + grandCard(true) + foldBar() + missionEditors(true); })
      + ovrPanel();
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

  /* บันทึกเฉพาะพันธกิจเดียว — ดึงข้อมูลล่าสุดจากฐานข้อมูลก่อนเสมอ
     เพื่อไม่ให้ทับงานที่คนอื่นเพิ่งบันทึกในพันธกิจอื่น
     โหมดกลุ่มจะเขียนค่าเฉพาะรายให้นักศึกษาทุกคนที่เลือกไว้ */
  window.wlSaveMission = async function (mkey) {
    var st = state(), d = st.draft;
    if (!d) return;
    var m = MISSIONS.filter(function (x) { return x.key === mkey; })[0];
    if (!canEditMission(mkey)) { showToast('บัญชีของคุณไม่ได้รับมอบหมายให้บันทึก' + m.short, 'error'); return; }
    var group = st.mode === 'group';
    var sel = groupSel();
    if (group && !sel.length) { showToast('เลือกนักศึกษาก่อนบันทึก', 'error'); return; }
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var json = JSON.stringify(d[mkey] || []);

    if (typeof showToast === 'function') showToast('กำลังบันทึก ' + m.short + (group ? ' ให้นักศึกษา ' + sel.length + ' คน' : '') + '...');
    try { await GSheetDB.refreshTab(group ? 'workload_student' : 'workload_plan'); } catch (e) { /* ใช้ข้อมูลที่มีอยู่ */ }

    if (group) {
      var ok = 0, err = '';
      for (var i = 0; i < sel.length; i++) {
        var sid = sel[i];
        var cur0 = overrideOf(sid, st.year, st.sem);
        var mt0 = meta(cur0);
        mt0[mkey] = { by: who, at: stampNow() };
        var p0 = {
          type: 'workload_student', student_id: sid, academic_year: st.year,
          year_level: st.level, semester: st.sem, updated_by: who, meta_json: JSON.stringify(mt0)
        };
        p0[m.field] = json;
        var r0 = cur0 ? await GSheetDB.update(Object.assign({}, cur0, p0)) : await GSheetDB.create(p0);
        if (r0 && r0.isOk) ok++; else err = (r0 && r0.error) || '';
      }
      if (ok === sel.length) showToast('บันทึก ' + m.short + ' ให้นักศึกษา ' + ok + ' คน เรียบร้อย');
      else if (ok) showToast('บันทึกสำเร็จ ' + ok + ' คน ไม่สำเร็จ ' + (sel.length - ok) + ' คน: ' + err, 'error');
      else showToast('บันทึกไม่สำเร็จ: ' + err, 'error');
      renderCurrentPage();
      return;
    }

    var cur = planOf(st.year, st.level, st.sem);
    var mt = meta(cur);
    mt[mkey] = { by: who, at: stampNow() };

    var payload = {
      type: 'workload_plan', academic_year: st.year, year_level: st.level, semester: st.sem,
      updated_by: who, meta_json: JSON.stringify(mt)
    };
    payload[m.field] = json;

    var r = cur ? await GSheetDB.update(Object.assign({}, cur, payload)) : await GSheetDB.create(payload);
    if (!(r && r.isOk)) { showToast('บันทึกไม่สำเร็จ: ' + ((r && r.error) || ''), 'error'); return; }

    // ซิงก์พันธกิจอื่นในหน้าจอให้เป็นค่าล่าสุดจากฐานข้อมูล (เผื่อมีคนแก้ระหว่างนี้)
    var fresh = planOf(st.year, st.level, st.sem);
    MISSIONS.forEach(function (x) {
      if (x.key === mkey) return;
      d[x.key] = rows(fresh, x).map(function (row) { return Object.assign({}, row); });
    });

    showToast('บันทึก ' + m.short + ' เรียบร้อย');
    renderCurrentPage();
  };

  window.wlSavePlan = async function () {
    var st = state(), d = draft();
    var who = (APP.currentUser && APP.currentUser.name) || '';
    var mine = MISSIONS.filter(function (m) { return canEditMission(m.key); });
    if (!mine.length) { showToast('บัญชีของคุณไม่ได้รับมอบหมายให้บันทึกพันธกิจใดเลย', 'error'); return; }
    // เลือกกรอกพันธกิจเดียว ก็บันทึกเฉพาะพันธกิจนั้น
    // ไม่งั้นพันธกิจอื่นจะถูกประทับว่า "บันทึกล่าสุดโดย..." ทั้งที่ไม่ได้แตะเลย
    if (st.mission) {
      mine = mine.filter(function (m) { return m.key === st.mission; });
      if (!mine.length) { showToast('บัญชีของคุณไม่ได้รับมอบหมายให้บันทึกพันธกิจนี้', 'error'); return; }
    }

    if (st.mode === 'group') {
      var sel = groupSel();
      if (!sel.length) { showToast('เลือกนักศึกษาก่อนบันทึก', 'error'); return; }
      if (sel.length > 40 && !confirm('บันทึกให้นักศึกษา ' + sel.length + ' คน?\n\nระบบจะสร้างค่าเฉพาะรายของแต่ละคน อาจใช้เวลาสักครู่')) return;
      showToast('กำลังบันทึกให้นักศึกษา ' + sel.length + ' คน...');
      try { await GSheetDB.refreshTab('workload_student'); } catch (e) { /* ใช้ข้อมูลที่มีอยู่ */ }
      var ok = 0, err = '';
      for (var i = 0; i < sel.length; i++) {
        var sid = sel[i];
        var cur0 = overrideOf(sid, st.year, st.sem);
        var mt0 = meta(cur0);
        mine.forEach(function (m) { mt0[m.key] = { by: who, at: stampNow() }; });
        var p0 = {
          type: 'workload_student', student_id: sid, academic_year: st.year,
          year_level: st.level, semester: st.sem, updated_by: who, meta_json: JSON.stringify(mt0)
        };
        mine.forEach(function (m) { p0[m.field] = JSON.stringify(d[m.key] || []); });
        var r0 = cur0 ? await GSheetDB.update(Object.assign({}, cur0, p0)) : await GSheetDB.create(p0);
        if (r0 && r0.isOk) ok++; else err = (r0 && r0.error) || '';
      }
      if (ok === sel.length) showToast('บันทึกภาระงานให้นักศึกษา ' + ok + ' คน เรียบร้อย');
      else if (ok) showToast('บันทึกสำเร็จ ' + ok + ' คน ไม่สำเร็จ ' + (sel.length - ok) + ' คน: ' + err, 'error');
      else showToast('บันทึกไม่สำเร็จ: ' + err, 'error');
      renderCurrentPage();
      return;
    }

    var plan = planOf(st.year, st.level, st.sem);
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

  /* ---------------- ค่าเฉพาะราย ----------------
     แท็บรายบุคคลถูกยุบเข้ามาในแท็บกรอกภาระงาน
     "แก้คนนี้" จึงเท่ากับสลับไปโหมดกลุ่มที่เลือกคนเดียว */
  window.wlEditStudent = function (sid) {
    var st = state();
    st.tab = 'plan';
    st.mode = 'group';
    st.mission = '';
    st.gq = '';
    st.gsel = {};
    st.gsel[norm(sid)] = 1;
    st.draft = null;
    // แท็บกลายเป็นเมนูย่อยแล้ว จึงต้องย้ายหน้าไปที่เมนู "กรอกภาระงาน" เพื่อให้แถบเมนูซ้ายตรงกัน
    if (typeof navigateTo === 'function' && APP.currentPage !== 'workloadPlan') { navigateTo('workloadPlan'); return; }
    renderCurrentPage();
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
      + '<p class="text-xs text-gray-500 mb-3">อ้างอิงเอกสารหลักสูตร ข้อ 1.6 การกำหนดภาระงานของนักศึกษา '
      + '— ตารางนี้ใช้กับ<b class="text-gray-700">พันธกิจด้านวิชาการ</b> ส่วนพันธกิจด้านอื่นคิดชั่วโมงตามจริง</p>'
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
  // เมนูย่อยแต่ละอันเป็นหน้าของตัวเอง แถบเมนูซ้ายจึงไฮไลต์ได้ถูกและปุ่มย้อนกลับของเบราว์เซอร์ทำงานตามปกติ
  var WL_PAGES = { workloadSummary: 'summary', workloadPlan: 'plan', workloadRate: 'rate' };
  window.wlPages = WL_PAGES;

  (function () {
    var orig = window.getPageContent;
    if (typeof orig !== 'function') return;
    window.getPageContent = function (page) {
      if (WL_PAGES[page]) { state().tab = WL_PAGES[page]; return workloadPage(); }
      if (page === 'workload') { state().tab = state().tab || 'summary'; return workloadPage(); }  // ลิงก์เก่า
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
      try { addItem(); } catch (e) { console.warn('เพิ่มเมนู ภาระงานนักศึกษา ไม่สำเร็จ:', e); }
    };

    // เมนู "ภาระงานนักศึกษา" เป็นกลุ่มที่พับได้ ข้างในคือแท็บเดิมทั้ง 3
    var WL_SUB = [['workloadSummary', 'สรุปผลรวม'], ['workloadPlan', 'กรอกภาระงาน'], ['workloadRate', 'เกณฑ์หน่วยชั่วโมง']];

    function addItem() {
      var perms = (APP.permissions && APP.permissions[APP.currentRole]) || {};
      if (!perms.workload) return;
      var nav = document.getElementById('sidebarNav');
      if (!nav || nav.querySelector('[data-page="workloadSummary"]')) return;

      var here = APP.currentPage;
      var open = here === 'workload' || WL_SUB.some(function (s) { return s[0] === here; });
      var box = document.createElement('div');
      box.className = 'dropdown-item' + (open ? ' dropdown-open' : '');
      box.setAttribute('data-wl-menu', '1');
      box.innerHTML =
        '<button onclick="toggleDropdown(this)" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-surface transition">'
        + '<span class="flex items-center gap-3"><i data-lucide="gauge" class="w-5 h-5 flex-shrink-0"></i>ภาระงานนักศึกษา</span>'
        + '<i data-lucide="chevron-down" class="w-4 h-4 transition-transform"' + (open ? ' style="transform:rotate(180deg)"' : '') + '></i>'
        + '</button>'
        + '<div class="dropdown-menu ml-8 mt-1 space-y-1">'
        + WL_SUB.map(function (s) {
            var on = here === s[0];
            return '<button onclick="navigateTo(\'' + s[0] + '\')" data-page="' + s[0] + '" '
              + 'class="nav-item w-full text-left px-3 py-2 rounded-lg text-sm transition '
              + (on ? 'bg-primaryLight text-primary font-semibold' : 'text-gray-600 hover:bg-surface hover:text-primary') + '">'
              + s[1] + '</button>';
          }).join('')
        + '</div>';
      insertNav(nav, box, '[data-page="survey"], [data-page="services"]');
      if (window.lucide) lucide.createIcons();
    }
  })();
})();
