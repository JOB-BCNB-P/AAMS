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
      if (k === 'type' || k === '__backendId' || k === '__rowIndex' || k === 'id') return;
      if (known.includes(k) && !META.includes(k)) cols[k] = (obj[k] === null || obj[k] === undefined) ? '' : String(obj[k]);
      else extra[k] = (obj[k] === null || obj[k] === undefined) ? '' : String(obj[k]);
    });
    return { cols, extra };
  }

  async function mergeExtra(tableName, id, extra) {
    if (!extra || !Object.keys(extra).length) return null;
    const { data } = await client().from(tableName).select('extra').eq('id', id).maybeSingle();
    return Object.assign({}, (data && data.extra) || {}, extra);
  }

  /* ---------------- READ ---------------- */
  async function fetchTable(tableName) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client()
        .from(tableName).select('*').order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) {
        // ไม่มีสิทธิ์อ่าน = ไม่ใช่ข้อผิดพลาดร้ายแรง (RLS ทำงานถูกต้อง)
        if (/permission|denied|row-level/i.test(error.message)) return [];
        throw new Error(tableName + ': ' + error.message);
      }
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows.map(r => toRow(tableName, r));
  }

  async function fetchAllData() {
    const isStu = (_profile && _profile.role) === 'student';
    const tabs = SHEET_TABS.filter(t => !(isStu && STUDENT_SKIP.has(tbl(t))));
    const settled = await Promise.allSettled(tabs.map(t => fetchTable(tbl(t))));
    _allData = [];
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') _allData.push(...res.value);
      else console.warn('[EMSDB] อ่านตาราง "' + tabs[i] + '" ไม่สำเร็จ:', res.reason && res.reason.message);
    });
    if (_onDataChanged) _onDataChanged(_allData);
    return _allData;
  }

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
    let ok = 0, fail = 0, lastErr = '';
    for (let i = 0; i < rows.length; i += 500) {          // แบ่งชุดละ 500 แถว
      const chunk = rows.slice(i, i + 500);
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
      const addr = String(email || '').trim().toLowerCase();
      if (!addr) return { isOk: false, error: 'กรุณากรอกอีเมล' };
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
  async function changePassword(newPw) {
    if (String(newPw || '').length < 8) return { isOk: false, error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' };
    const { error } = await client().auth.updateUser({ password: String(newPw) });
    return error ? { isOk: false, error: error.message } : { isOk: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
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
    loginWithGoogle, logout, profile, currentSession, changePassword,
    loadProfile, loadSchema, refreshTab, client
  };
})();

// ให้ app.js เดิมเรียกใช้ได้โดยไม่ต้องแก้ชื่อ
window.GSheetDB = EMSDB;
window.EMSDB = EMSDB;
