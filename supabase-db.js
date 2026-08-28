/* ================================================================
   supabase-db.js — เลเยอร์ฐานข้อมูล Supabase (แทนที่ gsheet-db.js)
   ----------------------------------------------------------------
   ออกแบบให้ "หน้าตา API เหมือน GSheetDB เดิมทุกฟังก์ชัน"
   จึงประกาศเป็น window.GSheetDB ด้วย → app.js เดิม (9 แสนบรรทัด)
   ทำงานต่อได้โดยแทบไม่ต้องแก้

   หลักการ
     • ทุกตารางเก็บเป็น text ทั้งหมด (เหมือนที่เคยได้จาก Google Sheets)
     • คอลัมน์ที่ยังไม่ได้ประกาศในฐานข้อมูล → เก็บลง extra (jsonb) อัตโนมัติ
       ทำให้เพิ่มฟิลด์ใหม่ในฟอร์มได้ทันทีโดยข้อมูลไม่หาย
     • __rowIndex = คอลัมน์ id ของ Postgres (แทนเลขแถวในชีต)
     • สิทธิ์การเข้าถึงบังคับที่ฐานข้อมูล (RLS) ไม่ใช่ที่เบราว์เซอร์
   ================================================================ */

const EMSDB = (() => {
  'use strict';

  const CFG = window.EMS_CONFIG || {};
  const PAGE = 1000;                       // Supabase คืนสูงสุด 1000 แถว/ครั้ง

  // ชื่อ "type" ที่ app.js ใช้  ↔  ชื่อตารางจริงใน Postgres
  const TABLE_OF = { user: 'app_user' };
  const TYPE_OF  = { app_user: 'user' };
  const tbl  = t => TABLE_OF[t] || t;
  const type = t => TYPE_OF[t]  || t;

  const SHEET_TABS = [
    'student', 'teacher', 'subject', 'schedule',
    'grade', 'eng_result', 'leave',
    'tracking', 'result_tracking', 'grade_tracking', 'file_tracking',
    'announcement', 'user', 'doc_request', 'permission',
    'teacher_directory', 'directory_summary', 'login_log',
    'special_teacher', 'alumni', 'password_log',
    'survey_config', 'survey_question', 'survey_response'
  ];

  // ระลอกที่ 2 — ตารางใหญ่ที่ไม่จำเป็นต้องมีตอนเปิดหน้าแรก
  // โหลดต่อเป็นเบื้องหลังหลังหน้าจอขึ้นแล้ว (grade มีหมื่นกว่าแถว)
  const HEAVY_TABS = new Set(['grade', 'eng_result', 'survey_response', 'login_log', 'password_log']);

  // ตารางที่นักศึกษาไม่มีสิทธิ์อ่าน — ข้ามไปเลยเพื่อไม่ให้เสียเวลาเรียกฟรี
  const STUDENT_SKIP = new Set([
    'teacher', 'teacher_directory', 'directory_summary', 'special_teacher',
    'alumni', 'app_user', 'user', 'login_log', 'password_log',
    'tracking', 'result_tracking', 'grade_tracking', 'file_tracking',
    'doc_request'
  ]);

  const META = ['id', 'created_at', 'updated_at', 'extra', 'auth_user_id'];

  let sb = null;                 // Supabase client
  let _schema = {};              // { table: [columns] }
  let _allData = [];
  let _onDataChanged = null;
  let _profile = null;           // ผลจาก ems_whoami()
  let _heavyPromise = null;      // การโหลดตารางใหญ่ในเบื้องหลัง

  /* ---------------- utils ---------------- */
  const s = v => (v === null || v === undefined) ? '' : String(v);

  function client() {
    if (sb) return sb;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('ยังโหลดไลบรารี Supabase ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.__sb = sb;
    return sb;
  }

  // แปลงแถวจากฐานข้อมูล → object แบนแบบเดิม (มี type / __rowIndex)
  function toRow(tableName, r) {
    const out = { type: type(tableName), __rowIndex: r.id, __backendId: tableName + '_' + r.id };
    Object.keys(r).forEach(k => {
      if (k === 'extra' || k === 'id' || k === 'auth_user_id') return;
      out[k] = s(r[k]);
    });
    if (r.extra && typeof r.extra === 'object') {
      Object.keys(r.extra).forEach(k => { if (out[k] === undefined || out[k] === '') out[k] = s(r.extra[k]); });
    }
    return out;
  }

  // แยก payload เป็น { คอลัมน์จริง, extra } ตามโครงสร้างตารางจริง
  function splitPayload(tableName, obj) {
    const known = _schema[tableName] || [];
    const cols = {}, extra = {};
    Object.keys(obj || {}).forEach(k => {
      if (k === 'type' || k === '__backendId' || k === '__rowIndex' || k === 'id' || k === 'extra') return;
      const raw = (obj[k] === null || obj[k] === undefined) ? '' : String(obj[k]);
      // คอลัมน์เวลาของฐานข้อมูล: ค่าว่างต้องไม่ถูกส่งไป (Postgres แปลง "" เป็นวันที่ไม่ได้)
      if (k === 'created_at' || k === 'updated_at') { if (raw.trim()) cols[k] = raw.trim(); return; }
      if (known.includes(k) && !META.includes(k)) cols[k] = raw;
      else extra[k] = raw;
    });
    return { cols, extra };
  }

  async function mergeExtra(tableName, id, extra) {
    if (!extra || !Object.keys(extra).length) return null;
    const { data } = await client().from(tableName).select('extra').eq('id', id).maybeSingle();
    return Object.assign({}, (data && data.extra) || {}, extra);
  }

  /* ---------------- READ ----------------
     อ่านหน้าแรกพร้อมนับจำนวนแถวทั้งหมดในคำขอเดียว
     ถ้ามีมากกว่า 1 หน้า จึงยิงหน้าที่เหลือ "พร้อมกันทุกหน้า"
     (เดิมอ่านทีละหน้าเรียงกัน — ตาราง 12,000 แถว = รอ 13 รอบต่อกัน)     */
  async function fetchTable(tableName) {
    const first = await client()
      .from(tableName)
      .select('*', { count: 'exact' })
      .order('id', { ascending: true })
      .range(0, PAGE - 1);

    if (first.error) {
      // ไม่มีสิทธิ์อ่าน = ไม่ใช่ข้อผิดพลาดร้ายแรง (RLS ทำงานถูกต้อง)
      if (/permission|denied|row-level/i.test(first.error.message)) return [];
      throw new Error(tableName + ': ' + first.error.message);
    }

    const rows = first.data || [];
    const total = (first.count === null || first.count === undefined) ? rows.length : first.count;

    if (total > rows.length && rows.length === PAGE) {
      const reqs = [];
      for (let from = PAGE; from < total; from += PAGE) {
        reqs.push(client().from(tableName).select('*')
          .order('id', { ascending: true }).range(from, from + PAGE - 1));
      }
      const rest = await Promise.all(reqs);
      rest.forEach(r => { if (!r.error && r.data) rows.push(...r.data); });
    }

    return rows.map(r => toRow(tableName, r));
  }

  async function _loadTabs(tabs, replace) {
    const settled = await Promise.allSettled(tabs.map(t => fetchTable(tbl(t))));
    const out = [];
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') out.push(...res.value);
      else console.warn('[EMSDB] อ่านตาราง "' + tabs[i] + '" ไม่สำเร็จ:', res.reason && res.reason.message);
    });
    if (replace) _allData = out;
    else _allData = _allData.concat(out);
    if (_onDataChanged) _onDataChanged(_allData);
    return out;
  }

  // โหลดข้อมูล 2 ระลอก: ระลอกแรกคือสิ่งที่ต้องใช้เปิดหน้าจอ (คืนค่าทันทีที่เสร็จ)
  // ระลอกสองคือตารางใหญ่ ทำต่อเป็นเบื้องหลังแล้วสั่งวาดหน้าจอใหม่เมื่อครบ
  async function fetchAllData() {
    const isStu = (_profile && _profile.role) === 'student';
    const usable = SHEET_TABS.filter(t => !(isStu && STUDENT_SKIP.has(tbl(t))));
    const light = usable.filter(t => !HEAVY_TABS.has(tbl(t)));
    const heavy = usable.filter(t => HEAVY_TABS.has(tbl(t)));

    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    await _loadTabs(light, true);
    const t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    console.log('[EMSDB] ระลอกที่ 1 (' + light.length + ' ตาราง) ' + Math.round(t1 - t0) + ' ms · ' + _allData.length + ' แถว');

    _heavyPromise = _loadTabs(heavy, false).then(rows => {
      const t2 = (window.performance && performance.now) ? performance.now() : Date.now();
      console.log('[EMSDB] ระลอกที่ 2 (' + heavy.length + ' ตาราง) ' + Math.round(t2 - t1) + ' ms · +' + rows.length + ' แถว');
      return rows;
    }).catch(err => { console.warn('[EMSDB] ระลอกที่ 2 ไม่สำเร็จ:', err); return []; });

    return _allData;
  }

  // รอให้ตารางใหญ่โหลดครบ (ใช้ก่อนออกรายงานที่ต้องใช้ผลการเรียนทั้งหมด)
  async function whenFullyLoaded() { try { await _heavyPromise; } catch (e) { } return _allData; }

  async function refreshTab(t) {
    const rows = await fetchTable(tbl(t));
    _allData = _allData.filter(d => d.type !== type(tbl(t)));
    _allData.push(...rows);
    if (_onDataChanged) _onDataChanged(_allData);
  }

  /* ---------------- WRITE ---------------- */
  // เลขบัตรประชาชนนักศึกษาเก็บแยกตาราง student_private (เห็นได้เฉพาะ admin/academic/registrar)
  async function saveNationalId(studentRowId, nid) {
    const clean = String(nid || '').replace(/\D/g, '');
    if (clean.length !== 13) return;
    await client().from('student_private')
      .upsert({ student_ref: studentRowId, national_id: clean, updated_at: new Date().toISOString() },
              { onConflict: 'student_ref' });
  }

  async function create(obj, opts) {
    const t = obj && obj.type;
    if (!t) return { isOk: false, error: 'ไม่ระบุประเภทข้อมูล (type)' };
    const table = tbl(t);
    const nid = (table === 'student') ? obj.national_id : null;
    const { cols, extra } = splitPayload(table, obj);
    delete cols.national_id; delete extra.national_id;

    const payload = Object.assign({}, cols);
    if (Object.keys(extra).length) payload.extra = extra;

    const { data, error } = await client().from(table).insert(payload).select('id').single();
    if (error) return { isOk: false, error: friendly(error) };
    if (nid) { try { await saveNationalId(data.id, nid); } catch (e) { /* ไม่ให้ล้มทั้งรายการ */ } }
    if (!(opts && opts.noRefresh)) await refreshTab(t);
    return { isOk: true, rowIndex: data.id, message: 'บันทึกแล้ว' };
  }

  async function update(obj, opts) {
    const t = obj && obj.type, id = obj && obj.__rowIndex;
    if (!t || !id) return { isOk: false, error: 'ไม่พบรหัสแถวที่จะแก้ไข' };
    const table = tbl(t);
    const nid = (table === 'student') ? obj.national_id : null;
    const { cols, extra } = splitPayload(table, obj);
    delete cols.national_id; delete extra.national_id;

    const payload = Object.assign({}, cols);
    const merged = await mergeExtra(table, id, extra);
    if (merged) payload.extra = merged;

    const { error } = await client().from(table).update(payload).eq('id', id);
    if (error) return { isOk: false, error: friendly(error) };
    if (nid) { try { await saveNationalId(id, nid); } catch (e) { /* ignore */ } }
    if (!(opts && opts.noRefresh)) await refreshTab(t);
    return { isOk: true, rowIndex: id, message: 'แก้ไขแล้ว' };
  }

  async function remove(obj) {
    const t = obj && obj.type, id = obj && obj.__rowIndex;
    if (!t || !id) return { isOk: false, error: 'ไม่พบรหัสแถวที่จะลบ' };
    const { error } = await client().from(tbl(t)).delete().eq('id', id);
    if (error) return { isOk: false, error: friendly(error) };
    await refreshTab(t);
    return { isOk: true, message: 'ลบแล้ว' };
  }

  async function createMany(objs) {
    const list = objs || [];
    if (!list.length) return { isOk: true, ok: 0, fail: 0 };
    const t = list[0].type, table = tbl(t);
    const rows = list.map(o => {
      const { cols, extra } = splitPayload(table, o);
      delete cols.national_id; delete extra.national_id;
      const p = Object.assign({}, cols);
      if (Object.keys(extra).length) p.extra = extra;
      return p;
    });
    // ทำให้ทุกแถวมีคอลัมน์ครบชุดเดียวกัน — PostgREST รวมชื่อคอลัมน์จากทุกแถวเป็นชุดเดียว
    // แถวที่ขาดคอลัมน์จะกลายเป็น NULL แทนที่จะได้ค่าเริ่มต้นของตาราง
    const allKeys = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
    const nowIso = new Date().toISOString();
    const normalized = rows.map(r => {
      const o = {};
      allKeys.forEach(k => {
        if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
        else if (k === 'created_at' || k === 'updated_at') o[k] = nowIso;
        else if (k === 'extra') o[k] = {};
        else o[k] = '';
      });
      return o;
    });

    let ok = 0, fail = 0, lastErr = '';
    for (let i = 0; i < normalized.length; i += 500) {    // แบ่งชุดละ 500 แถว
      const chunk = normalized.slice(i, i + 500);
      const { error } = await client().from(table).insert(chunk);
      if (error) { fail += chunk.length; lastErr = friendly(error); }
      else ok += chunk.length;
    }
    await refreshTab(t);
    return { isOk: fail === 0, ok, fail, error: lastErr || undefined };
  }

  async function updateMany(objs) {
    const list = objs || [];
    if (!list.length) return { isOk: true, ok: 0, fail: 0 };
    const t = list[0].type;
    let ok = 0, fail = 0, lastErr = '';
    // ทำทีละ 20 รายการพร้อมกัน เร็วกว่าวนทีละแถว แต่ไม่ถล่มเซิร์ฟเวอร์
    for (let i = 0; i < list.length; i += 20) {
      const res = await Promise.all(list.slice(i, i + 20).map(o => update(o, { noRefresh: true })));
      res.forEach(r => { if (r && r.isOk) ok++; else { fail++; lastErr = (r && r.error) || ''; } });
    }
    await refreshTab(t);
    return { isOk: fail === 0, ok, fail, error: lastErr || undefined };
  }

  // เขียนแถวใหม่แบบไม่ดึงข้อมูลกลับ (ใช้กับ login_log)
  async function appendNoRefresh(obj) {
    try { return await create(obj, { noRefresh: true }); }
    catch (err) { return { isOk: false, error: String(err) }; }
  }

  function friendly(error) {
    const m = String((error && error.message) || error || '');
    if (/duplicate key.*uq_survey_response_once/i.test(m)) return 'คุณได้ทำแบบประเมินของปีการศึกษานี้ไปแล้ว';
    if (/row-level security|permission denied/i.test(m))   return 'บัญชีของคุณไม่มีสิทธิ์ดำเนินการนี้';
    if (/JWT|not authenticated|invalid claim/i.test(m))    return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    return m;
  }

  /* ---------------- AUTH ---------------- */
  async function loadSchema() {
    const { data, error } = await client().rpc('ems_schema');
    if (!error && data) _schema = data;
  }

  async function loadProfile() {
    const { data, error } = await client().rpc('ems_whoami');
    _profile = (!error && data && data.found) ? data : null;
    return _profile;
  }

  // เข้าสู่ระบบบุคลากรด้วยอีเมล + รหัสผ่าน
  // payload = { identifier (อีเมล), password }
  async function login(payload) {
    try {
      const email = String((payload && payload.identifier) || '').trim().toLowerCase();
      const password = String((payload && payload.password) || '');
      if (!email || !password) return { isOk: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' };

      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) return { isOk: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };

      await loadSchema();
      const p = await loadProfile();
      if (!p) {
        await client().auth.signOut();
        return { isOk: false, error: 'บัญชีนี้ยังไม่ได้ถูกกำหนดสิทธิ์ในระบบ กรุณาติดต่อผู้ดูแลระบบ' };
      }
      return { isOk: true, user: p };
    } catch (err) { return { isOk: false, error: String(err) }; }
  }

  // เข้าสู่ระบบด้วยบัญชี Google ของวิทยาลัย (@bcn.ac.th)
  async function loginWithGoogle() {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { hd: CFG.ALLOWED_DOMAIN || 'bcn.ac.th', prompt: 'select_account' } }
    });
    return error ? { isOk: false, error: error.message } : { isOk: true };
  }

  // เข้าสู่ระบบนักศึกษาด้วยเลขบัตรประชาชน (ตรวจฝั่งเซิร์ฟเวอร์ผ่าน Edge Function)
  async function studentLogin(nationalId) {
    try {
      const resp = await fetch(CFG.SUPABASE_URL + '/functions/v1/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY },
        body: JSON.stringify({ national_id: nationalId })
      });
      const out = await resp.json();
      if (!out || !out.isOk) return { isOk: false, error: (out && out.error) || 'เข้าสู่ระบบไม่สำเร็จ' };

      await client().auth.setSession({
        access_token: out.session.access_token,
        refresh_token: out.session.refresh_token
      });

      await loadSchema();
      const p = await loadProfile();
      await fetchAllData();
      const stu = (p && p.student) || out.student || {};
      return { isOk: true, student: stu };
    } catch (err) { return { isOk: false, error: String(err) }; }
  }

  async function studentRefresh() {
    await fetchAllData();
    return { isOk: true, student: (_profile && _profile.student) || null };
  }

  async function logout() {
    try { await client().auth.signOut(); } catch (e) { /* ignore */ }
    _profile = null; _allData = [];
  }

  function profile() { return _profile; }

  async function currentSession() {
    const { data } = await client().auth.getSession();
    return data && data.session ? data.session : null;
  }

  /* -------- ลืม/เปลี่ยนรหัสผ่านด้วย OTP ทางอีเมล -------- */
  async function requestPasswordOtp(email) {
    try {
      if (_profile && _profile.role === 'student') {
        return { isOk: false, error: 'นักศึกษาไม่สามารถเปลี่ยนรหัสผ่านได้ — ใช้เลขบัตรประชาชนในการเข้าสู่ระบบ' };
      }
      const addr = String(email || '').trim().toLowerCase();
      if (!addr) return { isOk: false, error: 'กรุณากรอกอีเมล' };
      // อีเมลของบัญชีนักศึกษาเป็นโดเมนภายใน ไม่ใช่อีเมลจริง — ไม่ให้ขอลิงก์
      if (addr.indexOf('@' + (CFG.STUDENT_EMAIL_DOMAIN || 'student.bcnb.local')) > -1) {
        return { isOk: false, error: 'บัญชีนักศึกษาไม่สามารถตั้งรหัสผ่านใหม่ได้' };
      }
      await client().auth.resetPasswordForEmail(addr);
      // ตอบเหมือนกันเสมอ เพื่อไม่ให้เดาได้ว่าอีเมลใดมีอยู่จริง
      return { isOk: true, message: 'หากอีเมลนี้มีอยู่ในระบบ ระบบได้ส่งรหัสยืนยันไปแล้ว' };
    } catch (err) { return { isOk: false, error: String(err) }; }
  }

  async function resetPasswordOtp(payload) {
    try {
      const email = String((payload && payload.email) || '').trim().toLowerCase();
      const token = String((payload && payload.code) || '').trim();
      const newPw = String((payload && payload.newPassword) || '');
      if (!email || !token || !newPw) return { isOk: false, error: 'ข้อมูลไม่ครบ' };
      if (newPw.length < 8) return { isOk: false, error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' };

      const { error: vErr } = await client().auth.verifyOtp({ email, token, type: 'recovery' });
      if (vErr) return { isOk: false, error: 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ' };

      const { error: uErr } = await client().auth.updateUser({ password: newPw });
      if (uErr) return { isOk: false, error: uErr.message };

      try {
        await client().from('password_log').insert({
          timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
          email, action: String((payload && payload.source) || 'reset'),
          user_name: (_profile && _profile.name) || '', role: (_profile && _profile.role) || ''
        });
      } catch (e) { /* ไม่ให้ล้มเพราะบันทึกประวัติ */ }

      return { isOk: true, message: 'ตั้งรหัสผ่านใหม่สำเร็จ' };
    } catch (err) { return { isOk: false, error: String(err) }; }
  }

  // เปลี่ยนรหัสผ่านขณะล็อกอินอยู่ (ไม่ต้องใช้ OTP)
  // นักศึกษาเปลี่ยนไม่ได้ — ใช้เลขบัตรประชาชนเป็นรหัสผ่านตายตัวตามนโยบายของวิทยาลัย
  async function changePassword(newPw) {
    if (_profile && _profile.role === 'student') {
      return { isOk: false, error: 'นักศึกษาไม่สามารถเปลี่ยนรหัสผ่านได้ — ใช้เลขบัตรประชาชนในการเข้าสู่ระบบ' };
    }
    if (String(newPw || '').length < 8) return { isOk: false, error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' };
    const { error } = await client().auth.updateUser({ password: String(newPw) });
    return error ? { isOk: false, error: error.message } : { isOk: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  }

  /* -------- ไฟล์แนบ PDF ของหน้าติดตามการส่ง --------
     เก็บใน Supabase Storage ถังปิด ชื่อไฟล์ตั้งตามรหัสแถว
     เช่น tracking/57.pdf → อัปโหลดซ้ำทับไฟล์เดิมทันที ไม่เกิดไฟล์ค้าง
     ในฐานข้อมูลเก็บเป็นข้อความสั้น ๆ ว่า  sb:tracking/57.pdf
     (ลิงก์ https เดิมที่เคยกรอกไว้ยังใช้งานได้ตามปกติ)              */
  const FILE_BUCKET = 'tracking-files';
  const FILE_PREFIX = 'sb:';
  const MAX_FILE_BYTES = 20 * 1024 * 1024;

  function isStoredFile(link) { return typeof link === 'string' && link.indexOf(FILE_PREFIX) === 0; }
  function filePathOf(link) { return isStoredFile(link) ? link.slice(FILE_PREFIX.length) : ''; }

  async function uploadFile(tableName, rowId, file) {
    if (!file) return { isOk: false, error: 'ยังไม่ได้เลือกไฟล์' };
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
      return { isOk: false, error: 'รองรับเฉพาะไฟล์ PDF เท่านั้น' };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { isOk: false, error: 'ไฟล์ใหญ่เกิน 20 MB (ไฟล์นี้ ' + (file.size / 1048576).toFixed(1) + ' MB)' };
    }
    const path = tableName + '/' + rowId + '.pdf';
    const { error } = await client().storage.from(FILE_BUCKET)
      .upload(path, file, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
    if (error) {
      if (/row-level security|not authorized|Unauthorized/i.test(error.message)) {
        return { isOk: false, error: 'บัญชีของคุณไม่มีสิทธิ์อัปโหลดไฟล์' };
      }
      return { isOk: false, error: error.message };
    }
    return { isOk: true, link: FILE_PREFIX + path, path };
  }

  // สร้างลิงก์ชั่วคราวสำหรับเปิดไฟล์ (อายุ 1 ชั่วโมง) — คนที่ไม่ได้ล็อกอินเปิดไม่ได้
  async function fileUrl(link, opts) {
    const path = filePathOf(link);
    if (!path) return { isOk: false, error: 'ไม่ใช่ไฟล์ในระบบ' };
    const { data, error } = await client().storage.from(FILE_BUCKET)
      .createSignedUrl(path, 3600, (opts && opts.download) ? { download: opts.download } : undefined);
    if (error) return { isOk: false, error: error.message };
    return { isOk: true, url: data.signedUrl };
  }

  async function deleteFile(link) {
    const path = filePathOf(link);
    if (!path) return { isOk: true };
    const { error } = await client().storage.from(FILE_BUCKET).remove([path]);
    return error ? { isOk: false, error: error.message } : { isOk: true };
  }

  /* -------- แบบประเมินความพึงพอใจ -------- */
  async function surveySubmit(payload) {
    try {
      const p = payload || {};
      const row = {
        type: 'survey_response',
        resp_id: 'R' + Date.now(),
        academic_year: String(p.academic_year || '').trim(),
        role: String(p.role || ''),
        role_label: String(p.role_label || ''),
        respondent_key: String(p.respondent_key || '').trim(),
        respondent_name: String(p.respondent_name || ''),
        year_level: String(p.year_level || ''),
        device: String(p.device || ''),
        frequency: String(p.frequency || ''),
        answers_json: JSON.stringify(p.answers || {}),
        overall_avg: String(p.overall_avg || ''),
        submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
      if (!row.academic_year) return { isOk: false, error: 'ไม่พบปีการศึกษา' };
      if (!row.respondent_key) return { isOk: false, error: 'ไม่พบข้อมูลผู้ตอบ' };

      const r = await create(row);
      if (!r.isOk) {
        if (/row-level security|สิทธิ์/i.test(r.error || '')) {
          return { isOk: false, error: 'แบบประเมินของปีการศึกษา ' + row.academic_year + ' ยังไม่เปิด หรือปิดรับแล้ว' };
        }
        return r;
      }
      return { isOk: true, message: 'บันทึกแบบประเมินเรียบร้อย', resp_id: row.resp_id };
    } catch (err) { return { isOk: false, error: String(err) }; }
  }

  /* ---------------- INIT / เข้ากันได้กับโค้ดเดิม ---------------- */
  async function init(config, onDataChanged) {
    _onDataChanged = onDataChanged;
    try {
      client();
      await loadSchema();
      return { isOk: true };
    } catch (err) {
      return { isOk: false, error: String(err && err.message || err) };
    }
  }

  // ระบบเดิมเคยถามหน้าตั้งค่า Google Sheet — ตอนนี้ไม่ต้องแล้ว จึงคืนค่าสำเร็จเสมอ
  function getStoredConfig() { return { spreadsheetId: 'supabase', scriptUrl: 'supabase' }; }
  function storeConfig() { /* ไม่ใช้แล้ว */ }
  function clearConfig() { /* ไม่ใช้แล้ว */ }
  function extractSheetId(v) { return v || 'supabase'; }

  function hasWriteAccess() {
    const r = _profile && _profile.role;
    return !!r && r !== 'student';
  }
  function clearSession() { _allData = []; }
  function destroy() { _allData = []; _profile = null; }

  async function debugTab(t) {
    try {
      const rows = await fetchTable(tbl(t));
      return { status: 'ok', rowCount: rows.length, firstRow: rows[0] || null };
    } catch (err) { return { error: String(err.message || err) }; }
  }

  return {
    // ---- API เดิม (ชื่อเดียวกับ GSheetDB) ----
    init, refresh: fetchAllData, destroy, clearSession, debugTab, hasWriteAccess,
    login, studentLogin, studentRefresh, appendNoRefresh,
    requestPasswordOtp, resetPasswordOtp, surveySubmit,
    create, createMany, update, updateMany, delete: remove,
    getStoredConfig, storeConfig, clearConfig, extractSheetId,
    SHEET_TABS,
    // ---- ของใหม่ที่ Supabase มีเพิ่ม ----
    loginWithGoogle, logout, profile, currentSession, changePassword, whenFullyLoaded,
    uploadFile, fileUrl, deleteFile, isStoredFile, filePathOf, MAX_FILE_BYTES,
    loadProfile, loadSchema, refreshTab, client
  };
})();

// ให้ app.js เดิมเรียกใช้ได้โดยไม่ต้องแก้ชื่อ
window.GSheetDB = EMSDB;
window.EMSDB = EMSDB;
