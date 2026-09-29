/* กลุ่มย่อยของวิชาปฏิบัติ — นักศึกษาประเมินเฉพาะอาจารย์ของกลุ่มตัวเอง
   และอาจารย์เห็นค่าเฉลี่ยเฉพาะกลุ่มที่ตนสอน */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const EV = fs.readFileSync(P + 'eval.js', 'utf8');
const DB = fs.readFileSync(P + 'supabase-db.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

// ---------- ข้อมูลปลอม ----------
function baseData() {
  return {
    subject: [],
    student: [
      { student_id: 'S1', name: 'นศ หนึ่ง', batch: '30' },
      { student_id: 'S2', name: 'นศ สอง', batch: '30' },
      { student_id: 'S3', name: 'นศ สาม', batch: '30' },
      { student_id: 'S4', name: 'นศ สี่', batch: '30' }
    ],
    eval_itemset: [{ set_code: 'SETT', set_name: 'ชุดอาจารย์', dimension: 'teacher', scale_max: '5', status: 'ใช้งาน' }],
    eval_item: [
      { set_code: 'SETT', item_code: 'T1', section: 'ด้านการสอน', statement_th: 'ข้อ 1', input_type: 'rating', sort_order: '1', __rowIndex: 1 },
      { set_code: 'SETT', item_code: 'T2', section: 'ด้านการสอน', statement_th: 'ข้อ 2', input_type: 'rating', sort_order: '2', __rowIndex: 2 }
    ],
    eval_form: [{
      form_code: 'FP', academic_year: '2568', semester: '1', year_level: '3', batch: '30',
      subject_code: '0101300099', subject_name: 'ปฏิบัติการพยาบาล', course_type: 'ปฏิบัติ',
      status: 'เปิด', min_respondents: '2', sd_mode: 'sample', mean_mode: 'item', set_teacher: 'SETT'
    }],
    eval_target: [
      { form_code: 'FP', target_kind: 'teacher', target_name: 'อาจารย์ ก', group_name: 'กลุ่ม 1', sort_order: '1', __rowIndex: 11 },
      { form_code: 'FP', target_kind: 'teacher', target_name: 'อาจารย์ ก', group_name: 'กลุ่ม 2', sort_order: '2', __rowIndex: 12 },
      { form_code: 'FP', target_kind: 'teacher', target_name: 'อาจารย์ ข', group_name: 'กลุ่ม 2', sort_order: '3', __rowIndex: 13 },
      { form_code: 'FP', target_kind: 'teacher', target_name: 'อาจารย์ ค', group_name: '', sort_order: '4', __rowIndex: 14 }
    ],
    eval_group: [
      { form_code: 'FP', group_name: 'กลุ่ม 1', students: 'S1,S2', site_name: 'รพ.ทดสอบ', ward: 'อายุรกรรม', sort_order: '1', __rowIndex: 21 },
      { form_code: 'FP', group_name: 'กลุ่ม 2', students: 'S3', site_name: 'รพ.ทดสอบ', ward: 'ศัลยกรรม', sort_order: '2', __rowIndex: 22 }
    ],
    eval_heading: [], eval_response: [], eval_answer: []
  };
}

const writes = [];
function makeEnv(opts) {
  opts = opts || {};
  const DATA = opts.data || baseData();
  const sandbox = {
    console,
    APP: {
      currentRole: opts.role || 'admin',
      config: { college_name: 'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ' },
      permissions: {
        admin: { evalReport: 1, evalSetup: 1, evalDo: 1, evalMine: 1 },
        student: { evalDo: 1 }, teacher: { evalMine: 1 }
      },
      currentUser: { name: opts.me || 'ผู้ดูแล', data: opts.student || { name: 'ผู้ดูแล' } }
    },
    getDataByType: (t) => DATA[t] || [],
    studentOwnsSubject: (stu, f) => String(stu.batch || '') === String(f.batch || ''),
    GSheetDB: {
      client: () => ({
        rpc: async (name, args) => {
          writes.push(['rpc', name, args]);
          if (name === 'ems_eval_my_groups') return { data: opts.myGroups || {} };
          if (name === 'ems_eval_group_scores') return { data: opts.groupScores || null };
          return { data: null };
        },
        from: () => ({
          select() { return this; }, eq() { return this; },
          // ต้องคืนตัวเดิมเพื่อให้ต่อ .select().single() ได้ และ await ได้ด้วย then ข้างล่าง
          insert(rows) { writes.push(['insert', rows]); return this; },
          update(v) { writes.push(['update', v]); return this; },
          delete() { writes.push(['delete']); return this; },
          single() { return Promise.resolve({ data: { form_code: 'FP', status: 'ร่าง', response_key: 'RK' }, error: null }); },
          then(r) { return Promise.resolve({ data: [], error: null }).then(r); }
        })
      }),
      create: async (o) => { writes.push(['create', o]); return { isOk: true }; },
      update: async (o) => { writes.push(['update', o]); return { isOk: true }; },
      delete: async (o) => { writes.push(['delete', o]); return { isOk: true }; },
      refreshTab: async () => { }
    },
    statCard: (i, l, v, u) => '<div data-label="' + l + '">' + v + '</div>',
    showToast: (m, k) => writes.push(['toast', m, k]),
    showModal: (title, html) => { writes.push(['modal', title]); sandbox.__modal = html; },
    closeModal: () => { },
    renderCurrentPage: () => { },
    currentAcademicYearBE: () => 2568,
    document: {
      getElementById: (id) => (sandbox.__els || {})[id] || null,
      querySelector: () => null,
      createElement: () => ({ setAttribute() { }, classList: { add() { } }, appendChild() { } })
    },
    setTimeout, clearTimeout, Promise,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } }, Blob: function () { }
  };
  sandbox.window = sandbox;
  sandbox.window.open = () => ({ document: { write() { }, close() { } } });
  sandbox.getPageContent = () => '';
  sandbox.buildSidebar = () => { };
  vm.createContext(sandbox);
  new vm.Script(EV).runInContext(sandbox);
  sandbox.__data = DATA;
  return sandbox;
}
const flush = () => new Promise(r => setTimeout(r, 0));

(async function () {
  console.log('[1] นักศึกษาเห็นเฉพาะอาจารย์ของกลุ่มตัวเอง');
  let w = makeEnv({
    role: 'student', student: { student_id: 'S1', name: 'นศ หนึ่ง', batch: '30' },
    myGroups: { FP: 'กลุ่ม 1' }
  });
  w.APP._eval = null;
  let page = w.evalPages.evalDo();
  await flush(); await flush();
  w.evalOpenAnswer('FP');
  page = w.evalPages.evalDo();
  await flush(); await flush();
  page = w.evalPages.evalDo();

  t('เห็นอาจารย์ของกลุ่มตัวเอง และอาจารย์ที่ไม่ผูกกลุ่ม', () => {
    assert.ok(page.includes('อาจารย์ ก'), 'ไม่เห็นอาจารย์ของกลุ่มตัวเอง');
    assert.ok(page.includes('อาจารย์ ค'), 'อาจารย์ที่ไม่ผูกกลุ่ม ทุกคนต้องได้ประเมิน');
  });
  t('ไม่เห็นอาจารย์ของกลุ่มอื่น', () =>
    assert.ok(!page.includes('อาจารย์ ข'), 'อาจารย์ของกลุ่ม 2 หลุดมาให้นักศึกษากลุ่ม 1 ประเมิน'));
  t('ชื่อกลุ่มติดมากับหัวข้อ จะได้ไม่สับสนว่าประเมินใคร', () =>
    assert.ok(page.includes('อาจารย์ผู้สอน — อาจารย์ ก · กลุ่ม 1'), 'หัวข้อไม่บอกกลุ่ม'));

  console.log('\n[2] นักศึกษาที่ยังไม่ถูกจัดกลุ่ม');
  w = makeEnv({
    role: 'student', student: { student_id: 'S4', name: 'นศ สี่', batch: '30' },
    myGroups: {}
  });
  w.APP._eval = null;
  w.evalPages.evalDo(); await flush(); await flush();
  w.evalOpenAnswer('FP');
  w.evalPages.evalDo(); await flush(); await flush();
  const p4 = w.evalPages.evalDo();
  t('ได้คำเตือนชัดเจน ไม่ใช่หน้าว่าง ๆ', () => {
    assert.ok(p4.includes('ยังไม่พบชื่อของคุณในกลุ่มใด'), 'ไม่ได้เตือน');
    assert.ok(p4.includes('แจ้งอาจารย์ผู้รับผิดชอบรายวิชา'), 'ไม่ได้บอกว่าต้องทำอย่างไรต่อ');
  });
  t('ไม่เผลอให้ประเมินอาจารย์ของกลุ่มใดเลย', () => {
    assert.ok(!p4.includes('อาจารย์ ก') && !p4.includes('อาจารย์ ข'), 'ยังโผล่อาจารย์ของกลุ่มอื่น');
  });

  console.log('\n[3] คำตอบต้องจำไว้ว่ามาจากกลุ่มไหน');
  w = makeEnv({
    role: 'student', student: { student_id: 'S3', name: 'นศ สาม', batch: '30' },
    myGroups: { FP: 'กลุ่ม 2' }
  });
  w.APP._eval = null;
  w.evalPages.evalDo(); await flush(); await flush();
  w.evalOpenAnswer('FP');
  w.evalPages.evalDo(); await flush(); await flush();
  const st = w.APP._eval;
  // ตอบทุกข้อของทุกกล่องที่เห็น
  const blocks = [];
  w.evalPages.evalDo();
  ['อาจารย์ ก', 'อาจารย์ ข', 'อาจารย์ ค'].forEach(n => {
    ['T1', 'T2'].forEach(it => { st.ans['teacher\u0001' + n + '\u0001' + it] = '5'; });
  });
  writes.length = 0;
  await w.evalSubmit(true);
  await flush();
  const ins = writes.filter(x => x[0] === 'insert').map(x => x[1]).flat();
  t('บันทึกชื่อกลุ่มลงทุกคำตอบของอาจารย์ที่ผูกกลุ่ม', () => {
    assert.ok(ins.length, 'ไม่ได้บันทึกคำตอบเลย');
    const ka = ins.filter(x => x.target_name === 'อาจารย์ ก');
    assert.ok(ka.length, 'ไม่มีคำตอบของอาจารย์ ก');
    ka.forEach(x => assert.strictEqual(x.target_group, 'กลุ่ม 2', 'กลุ่มผิด: ' + x.target_group));
  });
  t('อาจารย์ที่ไม่ผูกกลุ่ม ช่องกลุ่มต้องว่าง', () => {
    const kc = ins.filter(x => x.target_name === 'อาจารย์ ค');
    assert.ok(kc.length, 'ไม่มีคำตอบของอาจารย์ ค');
    kc.forEach(x => assert.strictEqual(x.target_group, '', 'ไม่ควรมีกลุ่ม'));
  });
  t('ไม่มีคำตอบของอาจารย์กลุ่มอื่นหลุดเข้ามา', () => {
    // นักศึกษา S3 อยู่กลุ่ม 2 จึงประเมิน อ.ก (กลุ่ม 2) และ อ.ข (กลุ่ม 2) ได้
    // แต่ต้องไม่มีแถวที่ target_group เป็น "กลุ่ม 1"
    assert.ok(!ins.some(x => x.target_group === 'กลุ่ม 1'), 'มีคำตอบติดกลุ่ม 1 ปนมา');
  });

  console.log('\n[4] หน้าตั้งค่า — การ์ดกลุ่มย่อย');
  w = makeEnv({ role: 'admin' });
  w.APP._eval = null;
  w.evalPages.evalSetup();
  w.evalOpenForm('FP');
  const setup = w.evalPages.evalSetup();
  t('การ์ดกลุ่มย่อยขึ้นในวิชาปฏิบัติ', () => {
    assert.ok(setup.includes('กลุ่มย่อยของวิชาปฏิบัติ'), 'ไม่มีการ์ดกลุ่ม');
    assert.ok(setup.includes('กลุ่ม 1') && setup.includes('กลุ่ม 2'), 'ไม่แสดงกลุ่มที่มีอยู่');
  });
  t('บอกจำนวนนักศึกษาในกลุ่ม และอาจารย์นิเทศของกลุ่ม', () => {
    assert.ok(/กลุ่ม 1[\s\S]{0,200}นักศึกษา 2 คน/.test(setup), 'นับสมาชิกผิด');
    assert.ok(/กลุ่ม 1[\s\S]{0,400}อาจารย์ ก/.test(setup), 'ไม่ได้บอกอาจารย์ของกลุ่ม');
  });
  t('เตือนว่ายังมีนักศึกษาตกหล่น', () =>
    assert.ok(setup.includes('ยังเหลือนักศึกษาอีก 1 คน'), 'ไม่ได้เตือนคนที่ยังไม่เข้ากลุ่ม'));
  t('ชื่ออาจารย์ในรายการมีป้ายกลุ่มกำกับ', () =>
    assert.ok(/อาจารย์ ก[\s\S]{0,160}กลุ่ม 1/.test(setup), 'ไม่มีป้ายกลุ่ม'));
  t('จำนวนข้อต่อคน นับตามกลุ่ม ไม่ใช่รวมอาจารย์ทุกกลุ่ม', () => {
    // อาจารย์ไม่ผูกกลุ่ม 1 คน + กลุ่มที่มีอาจารย์มากสุด 2 คน = 3 คน × 2 ข้อ = 6
    assert.ok(setup.includes('>6</b> ข้อ') || setup.includes('>6</b>'), 'นับจำนวนข้อผิด (ควรได้ 6)');
  });

  console.log('\n[5] วิชาทฤษฎีต้องไม่มีการ์ดกลุ่ม');
  const d2 = baseData();
  d2.eval_form[0].course_type = 'ทฤษฎี';
  d2.eval_group = [];
  d2.eval_target = [{ form_code: 'FP', target_kind: 'teacher', target_name: 'อาจารย์ ง', group_name: '', sort_order: '1', __rowIndex: 31 }];
  w = makeEnv({ role: 'admin', data: d2 });
  w.APP._eval = null;
  w.evalPages.evalSetup(); w.evalOpenForm('FP');
  const setup2 = w.evalPages.evalSetup();
  t('ไม่ขึ้นการ์ดกลุ่มในวิชาทฤษฎี', () =>
    assert.ok(!setup2.includes('กลุ่มย่อยของวิชาปฏิบัติ'), 'วิชาทฤษฎีไม่ควรมีการ์ดนี้'));
  t('วิชาทฤษฎี นักศึกษายังประเมินอาจารย์ทุกคนเหมือนเดิม', () => {
    const w2 = makeEnv({
      role: 'student', data: d2, student: { student_id: 'S1', name: 'นศ หนึ่ง', batch: '30' }, myGroups: {}
    });
    w2.APP._eval = null;
    w2.evalPages.evalDo();
    w2.evalOpenAnswer('FP');
    const h = w2.evalPages.evalDo();
    assert.ok(!h.includes('ยังไม่พบชื่อของคุณในกลุ่มใด'), 'วิชาที่ไม่แบ่งกลุ่มไม่ควรโดนบล็อก');
  });

  console.log('\n[6] อาจารย์เห็นค่าเฉลี่ยเฉพาะกลุ่มของตน');
  w = makeEnv({
    role: 'teacher', me: 'อาจารย์ ก',
    groupScores: {
      form_code: 'FP', teacher: 'อาจารย์ ก', min: 2, released: true,
      rows: [
        { group_name: 'กลุ่ม 1', n_resp: 3, visible: true, n: 6, mean: 4.6667 },
        { group_name: 'กลุ่ม 2', n_resp: 1, visible: false, n: 0, mean: null }
      ]
    }
  });
  const box = w.__testMyGroupBox ? w.__testMyGroupBox() : null;
  t('ตารางรายกลุ่มแสดงค่าเฉลี่ยของกลุ่มที่ถึงเกณฑ์', () => {
    const src = EV.slice(EV.indexOf('function myGroupBox'), EV.indexOf('function mineBody'));
    assert.ok(src.includes('ค่าเฉลี่ยของคุณ แยกตามกลุ่มย่อย'), 'ไม่มีตารางรายกลุ่ม');
    assert.ok(src.includes('x.visible'), 'ไม่ได้ตรวจเกณฑ์');
  });
  t('กลุ่มที่ผู้ตอบไม่ถึงเกณฑ์ ต้องไม่โชว์ค่าเฉลี่ย', () => {
    const src = EV.slice(EV.indexOf('function myGroupBox'), EV.indexOf('function mineBody'));
    assert.ok(!/!x\.visible[\s\S]{0,200}fx\(x\.mean\)/.test(src), 'กลุ่มที่ปิดบังยังโชว์ค่าเฉลี่ย');
    assert.ok(src.includes('ยังเปิดเผยไม่ได้ — ผู้ตอบไม่ถึงเกณฑ์'), 'ไม่ได้บอกเหตุผล');
  });
  t('ไม่มี SD และไม่มีรายข้อ ตามที่ตกลงว่าเห็นแค่ค่าเฉลี่ย', () => {
    const src = EV.slice(EV.indexOf('function myGroupBox'), EV.indexOf('function mineBody'));
    assert.ok(!src.includes('meanCell('), 'meanCell พ่วง SD มาด้วย');
    assert.ok(!/รายข้อ/.test(src), 'ไม่ควรมีรายข้อ');
  });
  t('เรียก RPC ตัวที่กันสิทธิ์ไว้ที่ฐานข้อมูล', () =>
    assert.ok(EV.includes("rpc('ems_eval_group_scores', { p_form: m.code })"), 'ไม่ได้เรียก ems_eval_group_scores'));

  console.log('\n[7] รายงานของผู้ดูแล');
  t('มีตารางผลแยกรายกลุ่ม', () => {
    const src = EV.slice(EV.indexOf('function groupTable(d)'), EV.indexOf('F3ข — ดาวน์โหลดเป็น PDF'));
    assert.ok(src.includes('ผลแยกรายกลุ่มย่อย'), 'ไม่มีตาราง');
    assert.ok(!/!x\.visible[\s\S]{0,300}meanCell\(x\.mean/.test(src), 'กลุ่มที่ปิดบังยังโชว์ค่าเฉลี่ย');
  });
  t('PDF และ CSV มีตารางรายกลุ่มด้วย', () => {
    assert.ok(EV.includes("body += '<h3>ผลแยกรายกลุ่มย่อย (วิชาปฏิบัติ)</h3><table>'"), 'PDF ไม่มีตารางรายกลุ่ม');
    assert.ok(EV.includes("rows.push([], ['ผลแยกรายกลุ่มย่อย'],"), 'CSV ไม่มีตารางรายกลุ่ม');
  });

  console.log('\n[8] ความปลอดภัยของข้อมูล');
  t('นักศึกษาไม่โหลดตารางกลุ่ม (มีรายชื่อเพื่อนทั้งห้อง)', () => {
    const i = DB.indexOf('STUDENT_SKIP');
    const seg = DB.slice(i, DB.indexOf(']);', i));
    assert.ok(seg.includes("'eval_group'"), 'นักศึกษายังโหลดตารางกลุ่มได้');
  });
  t('นักศึกษาถามกลุ่มของตัวเองผ่าน RPC แทน', () =>
    assert.ok(EV.includes("rpc('ems_eval_my_groups')"), 'ไม่ได้ถามผ่าน RPC'));
  t('เจ้าหน้าที่ยังโหลดตารางกลุ่มได้ตามปกติ', () => {
    const i = DB.indexOf('SHEET_TABS');
    const seg = DB.slice(i, DB.indexOf('];', i));
    assert.ok(seg.includes("'eval_group'"), 'ไม่ได้ใส่ใน SHEET_TABS');
  });

  console.log('\n[9] ไม่ทำของเดิมพัง');
  t('ลบแบบประเมินแล้วลบกลุ่มตามไปด้วย', () => {
    const src = EV.slice(EV.indexOf('window.evalDeleteForm'), EV.indexOf('window.evalDeleteForm') + 900);
    assert.ok(src.includes('groupsOf(code)'), 'ลบแบบประเมินแล้วกลุ่มค้าง');
  });
  t('บันทึกเป้าหมายเทียบด้วยชื่อ+กลุ่ม อาจารย์คนเดียวอยู่ได้หลายกลุ่ม', () => {
    const i = EV.indexOf("var have = targetsOf(st.form);");
    const src = EV.slice(i, i + 1200);
    assert.ok(src.includes("s(t.group_name) === w.group"), 'ยังเทียบแค่ชื่อ แถวกลุ่มที่สองจะถูกลบทิ้ง');
    assert.ok(src.includes('!keep[t.__rowIndex]'), 'แถวชื่อซ้ำอาจจับคู่ซ้ำแถวเดิม');
  });
  t('บันทึกกลุ่มลงตาราง eval_group', () =>
    assert.ok(EV.includes("type: 'eval_group', form_code: st.form, group_name: s(g.name)"), 'ไม่ได้บันทึกกลุ่ม'));
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(EV); new vm.Script(DB); });

  console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
