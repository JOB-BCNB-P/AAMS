/* วาดหน้ารายงานจริงทั้งสามโหมด ด้วยข้อมูลปลอม เพื่อจับความผิดพลาดตอนทำงาน
   ไม่ใช่แค่จับคำในไฟล์ */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

// ---------- ข้อมูลปลอม ----------
const DATA = {
  subject: [],
  eval_form: [
    { form_code: 'F1', academic_year: '2568', semester: '1', year_level: '2', subject_code: '0101300035', subject_name: 'การพยาบาลพื้นฐาน', course_type: 'ทฤษฎี', min_respondents: '2', sd_mode: 'sample', mean_mode: 'item', coordinator: 'ครูเอ' },
    { form_code: 'F2', academic_year: '2568', semester: '1', year_level: '3', subject_code: '0101300099', subject_name: 'ปฏิบัติการพยาบาล', course_type: 'ปฏิบัติ', min_respondents: '2', sd_mode: 'sample', mean_mode: 'item', coordinator: 'ครูบี' },
    { form_code: 'F9', academic_year: '2567', semester: '2', year_level: '4', subject_code: '0101300777', subject_name: 'วิชาปีก่อน', course_type: 'ทฤษฎี', min_respondents: '2', sd_mode: 'sample' }
  ],
  eval_target: [
    { form_code: 'F1', target_kind: 'teacher', target_name: 'อาจารย์ ก', sort_order: '1' },
    { form_code: 'F2', target_kind: 'teacher', target_name: 'อาจารย์ ก', sort_order: '1' },
    { form_code: 'F1', target_kind: 'teacher', target_name: 'อาจารย์ ข', sort_order: '2' },
    { form_code: 'F2', target_kind: 'site', target_name: 'รพ.ทดสอบ', sort_order: '1' },
    { form_code: 'F9', target_kind: 'teacher', target_name: 'อาจารย์ ปีก่อน', sort_order: '1' }
  ],
  eval_itemset: [], eval_item: [], eval_response: [], eval_answer: []
};

// ---------- ผลที่ RPC จะตอบกลับ ----------
const BY_TARGET = {
  kind: 'teacher', target: 'อาจารย์ ก', year: '2568', semester: '1',
  rows: [
    { form_code: 'F1', subject_code: '0101300035', subject_name: 'การพยาบาลพื้นฐาน', year_level: '2', n_resp: 4, min: 2, visible: true, n: 3, mean: 4.0, sd: 1.0 },
    { form_code: 'F2', subject_code: '0101300099', subject_name: 'ปฏิบัติการพยาบาล', year_level: '3', n_resp: 3, min: 2, visible: true, n: 3, mean: 4.6667, sd: 0.5774 },
    { form_code: 'F3', subject_code: '0101300111', subject_name: 'วิชาคนตอบน้อย', year_level: '4', n_resp: 2, min: 5, visible: false, n: 0, mean: null, sd: null }
  ],
  sections: [{ section: 'ด้านการสอน', n: 4, mean: 4.75, sd: 0.5 }, { section: 'ด้านการวัดผล', n: 2, mean: 3.5, sd: 0.7071 }],
  items: [{ item_code: 'T1', section: 'ด้านการสอน', text: 'ข้อ 1', n: 2, mean: 4.5, sd: 0.7071 }],
  overall: { n: 6, mean: 4.3333, sd: 0.8165 }, courses: 2, hidden: 1
};
const CMTS = [{ subject_code: '0101300035', subject_name: 'การพยาบาลพื้นฐาน', dimension: 'teacher', item_code: 'C1', text_answer: 'สอนเข้าใจดี' }];
const SUMMARY = {
  visible: true, n: 4, min: 2, sd_mode: 'sample', mean_mode: 'item',
  dimensions: [{ dimension: 'course', n: 8, mean: 4.2, sd: 0.6 }, { dimension: 'teacher', n: 6, mean: 4.4, sd: 0.5 }],
  items_all: [{ dimension: 'course', item_code: 'C1', section: 'หมวด ก', text: 'ข้อ 1', n: 4, mean: 4.25, sd: 0.5 }],
  targets: [{ kind: 'teacher', name: 'อาจารย์ ก', n: 3, mean: 4.5, sd: 0.5 }, { kind: 'site', name: 'รพ.ทดสอบ', n: 2, mean: 4.0, sd: 0.7 }],
  overall_item: { mean: 4.3, sd: 0.55 }, overall_dim: { mean: 4.3, k: 2 }
};

// ---------- สภาพแวดล้อมปลอม ----------
const calls = [];
let opened = null;
function makeEnv() {
  const sandbox = {
    console,
    APP: {
      currentRole: 'admin',
      config: { college_name: 'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ' },
      permissions: { admin: { evalReport: 1, evalSetup: 1, evalDo: 1, evalMine: 1 } },
      currentUser: { data: { name: 'ผู้ดูแล' } }
    },
    getDataByType: (t) => DATA[t] || [],
    GSheetDB: {
      client: () => ({
        rpc: async (name, args) => {
          calls.push([name, args]);
          if (name === 'ems_eval_by_target') return { data: BY_TARGET };
          if (name === 'ems_eval_comments_by_target') return { data: CMTS };
          if (name === 'ems_eval_summary') return { data: SUMMARY };
          if (name === 'ems_eval_comments') return { data: [] };
          return { data: null };
        }
      })
    },
    statCard: (i, l, v, u, c) => '<div class="statcard" data-label="' + l + '">' + v + ' ' + (u || '') + '</div>',
    showToast: (m, k) => calls.push(['toast', m, k]),
    showModal: () => { },
    renderCurrentPage: () => { },
    currentAcademicYearBE: () => 2568,
    document: { getElementById: () => null, querySelector: () => null, createElement: () => ({ setAttribute() { }, classList: { add() { } } }) },
    setTimeout, clearTimeout, Promise, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } }, Blob: function () { }
  };
  sandbox.window = sandbox;
  sandbox.window.open = (u, tgt) => {
    opened = { html: '' };
    return { document: { write(h) { opened.html += h; }, close() { } } };
  };
  sandbox.getPageContent = () => '';
  sandbox.buildSidebar = () => { };
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(P + 'eval.js', 'utf8')).runInContext(sandbox);
  return sandbox;
}

const flush = () => new Promise(r => setTimeout(r, 0));

(async function () {
  console.log('[1] โหมดภาพรวมรายวิชา (ของเดิม)');
  let w = makeEnv();
  let html = w.evalPages.evalReport();
  t('วาดได้ และตั้งค่าเริ่มต้นเป็นโหมดรายวิชา', () => {
    assert.ok(html.includes('ภาพรวมผลประเมินรายวิชา'), 'หัวเรื่องไม่ถูก');
    assert.ok(html.includes('— เลือกรายวิชา —'), 'ไม่มีตัวเลือกรายวิชา');
  });
  t('รายการวิชาเห็นแค่ปี/ภาคที่เลือก', () => {
    assert.ok(html.includes('0101300035') && html.includes('0101300099'), 'วิชาของปีนี้ไม่ครบ');
    assert.ok(!html.includes('0101300777'), 'วิชาปี 2567 หลุดมาด้วย');
  });
  t('มีปุ่มสลับสามโหมด', () => {
    ['ภาพรวมรายวิชา', 'รายอาจารย์', 'รายแหล่งฝึก'].forEach(x =>
      assert.ok(html.includes('>' + x + '</button>'), 'ไม่มีปุ่ม ' + x));
  });

  w.evalPickReport('F1');
  w.evalPages.evalReport();           // รอบนี้สั่งโหลด
  await flush(); await flush();
  html = w.evalPages.evalReport();
  t('เลือกวิชาแล้วได้ผลและมีปุ่ม PDF', () => {
    assert.ok(html.includes('สรุปรายด้าน'), 'ไม่ได้วาดผล');
    assert.ok(html.includes('evalPrintReport()'), 'ไม่มีปุ่ม PDF');
    assert.ok(html.includes('evalExportReport()'), 'ปุ่ม CSV เดิมหาย');
  });
  t('กดพิมพ์แล้วได้เอกสาร A4 ภาษาไทยครบ', () => {
    opened = null; w.evalPrintReport();
    assert.ok(opened, 'ไม่ได้เปิดหน้าต่างพิมพ์');
    const h = opened.html;
    assert.ok(h.includes('รายงานสรุปผลประเมินรายวิชา'), 'ไม่มีหัวเรื่อง');
    assert.ok(h.includes('0101300035 การพยาบาลพื้นฐาน'), 'ไม่มีชื่อวิชา');
    assert.ok(h.includes('วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ'), 'ไม่มีชื่อวิทยาลัย');
    assert.ok(h.includes('ผลประเมินอาจารย์ผู้สอน') && h.includes('อาจารย์ ก'), 'ไม่มีตารางรายอาจารย์');
    assert.ok(h.includes('ผลประเมินแหล่งฝึกภาคปฏิบัติ') && h.includes('รพ.ทดสอบ'), 'ไม่มีตารางแหล่งฝึก');
    assert.ok(h.includes('@page{size:A4'), 'ไม่ได้ตั้ง A4');
    assert.ok(h.includes('family=Sarabun'), 'ไม่มีฟอนต์ไทย');
    assert.ok(h.includes('window.print()'), 'ไม่สั่งพิมพ์');
  });

  console.log('\n[2] โหมดรายอาจารย์');
  w = makeEnv();
  w.evalRptMode('teacher');
  html = w.evalPages.evalReport();
  t('รายชื่ออาจารย์มาจากปี/ภาคที่เลือก พร้อมจำนวนวิชา', () => {
    assert.ok(html.includes('ผลประเมินรายอาจารย์'), 'หัวเรื่องไม่เปลี่ยน');
    assert.ok(html.includes('อาจารย์ ก (2 วิชา)'), 'นับวิชาผิดหรือไม่มีชื่อ');
    assert.ok(html.includes('อาจารย์ ข (1 วิชา)'), 'ขาดอาจารย์อีกคน');
    assert.ok(!html.includes('อาจารย์ ปีก่อน'), 'อาจารย์ของปี 2567 หลุดมา');
  });
  t('ยังไม่เลือกคน ต้องยังไม่ยิงฐานข้อมูล', () => {
    assert.ok(!calls.some(c => c[0] === 'ems_eval_by_target'), 'ยิงก่อนเลือกคน');
  });

  calls.length = 0;
  w.evalPickTarget('อาจารย์ ก');
  w.evalPages.evalReport();
  await flush(); await flush();
  html = w.evalPages.evalReport();
  t('ส่งตัวกรองครบทั้งปี ภาค ชนิด และชื่อ', () => {
    const c = calls.find(x => x[0] === 'ems_eval_by_target');
    assert.ok(c, 'ไม่ได้เรียก RPC');
    // เทียบทีละช่อง เพราะวัตถุมาจากบริบท vm คนละ prototype
    assert.strictEqual(c[1].p_year, '2568');
    assert.strictEqual(c[1].p_sem, '1');
    assert.strictEqual(c[1].p_kind, 'teacher');
    assert.strictEqual(c[1].p_target, 'อาจารย์ ก');
    assert.strictEqual(Object.keys(c[1]).length, 4, 'ส่งอาร์กิวเมนต์เกิน');
  });
  t('วาดตารางรายวิชา รายหมวด รายข้อ และข้อเสนอแนะ', () => {
    ['ผลรายวิชา', 'สรุปรายหมวดคำถาม', 'สรุปรายข้อ', 'ข้อเสนอแนะปลายเปิด'].forEach(x =>
      assert.ok(html.includes(x), 'ขาด ' + x));
    assert.ok(html.includes('สอนเข้าใจดี'), 'ข้อเสนอแนะไม่ขึ้น');
  });
  t('ค่าเฉลี่ยรวมและจำนวนวิชาถูกต้อง', () => {
    assert.ok(html.includes('data-label="ค่าเฉลี่ยรวมทุกวิชา">4.33'), 'ค่าเฉลี่ยผิด');
    assert.ok(html.includes('data-label="รายวิชาที่นำมาคิด">2'), 'จำนวนวิชาผิด');
    assert.ok(html.includes('data-label="SD รวมทุกวิชา">0.82'), 'SD ผิด');
  });
  t('วิชาที่ผู้ตอบไม่ถึงเกณฑ์ บอกว่ามีอยู่แต่ไม่โชว์คะแนน', () => {
    assert.ok(html.includes('วิชาคนตอบน้อย'), 'ซ่อนวิชาไปเลย ผู้อ่านจะไม่รู้ว่ามี');
    assert.ok(html.includes('ผู้ตอบไม่ถึงเกณฑ์ 5 คน'), 'ไม่ได้บอกเกณฑ์');
    assert.ok(html.includes('มี 1 รายวิชาที่ผู้ตอบยังไม่ถึงเกณฑ์'), 'ไม่ได้เตือนที่หัวรายงาน');
  });
  t('วาดซ้ำแล้วไม่ยิงฐานข้อมูลเพิ่ม', () => {
    const before = calls.filter(c => c[0] === 'ems_eval_by_target').length;
    w.evalPages.evalReport(); w.evalPages.evalReport();
    assert.strictEqual(calls.filter(c => c[0] === 'ems_eval_by_target').length, before, 'ยิงซ้ำทุกครั้งที่วาด');
  });
  t('พิมพ์ PDF รายอาจารย์ได้ครบ', () => {
    opened = null; w.evalPrintTarget();
    assert.ok(opened, 'ไม่เปิดหน้าต่างพิมพ์');
    const h = opened.html;
    assert.ok(h.includes('รายงานสรุปผลประเมินอาจารย์ผู้สอน'), 'หัวเรื่องผิด');
    assert.ok(h.includes('อาจารย์ ก'), 'ไม่มีชื่ออาจารย์');
    assert.ok(h.includes('ปีการศึกษา 2568') && h.includes('ภาคการศึกษาที่ 1'), 'ไม่มีปี/ภาค');
    assert.ok(h.includes('การพยาบาลพื้นฐาน') && h.includes('ปฏิบัติการพยาบาล'), 'ตารางรายวิชาไม่ครบ');
    assert.ok(h.includes('ยังเปิดเผยไม่ได้ — ผู้ตอบไม่ถึงเกณฑ์ 5 คน'), 'วิชาที่ปิดบังไม่มีคำอธิบาย');
    assert.ok(h.includes('สอนเข้าใจดี'), 'ข้อเสนอแนะไม่เข้าเอกสาร');
    assert.ok(h.includes('4.51–5.00 มากที่สุด'), 'ไม่มีเกณฑ์แปลผล');
    assert.ok(/อีก 1 รายวิชายังเปิดเผยผลไม่ได้/.test(h), 'ไม่ได้บอกจำนวนวิชาที่กันออก');
  });
  t('วิชาที่ปิดบัง ต้องไม่มีค่าเฉลี่ยหลุดลงเอกสาร', () => {
    const h = opened.html;
    const i = h.indexOf('วิชาคนตอบน้อย');
    const row = h.slice(i, h.indexOf('</tr>', i));
    assert.ok(!/\d\.\d\d/.test(row), 'มีตัวเลขค่าเฉลี่ยหลุดมา: ' + row);
  });

  console.log('\n[3] โหมดรายแหล่งฝึก');
  w = makeEnv();
  w.evalRptMode('site');
  html = w.evalPages.evalReport();
  t('รายชื่อแหล่งฝึกแยกจากอาจารย์', () => {
    assert.ok(html.includes('ผลประเมินรายแหล่งฝึก'), 'หัวเรื่องผิด');
    assert.ok(html.includes('รพ.ทดสอบ (1 วิชา)'), 'ไม่มีแหล่งฝึก');
    assert.ok(!html.includes('อาจารย์ ก ('), 'อาจารย์หลุดเข้ามาในรายการแหล่งฝึก');
  });
  t('ปี/ภาคที่ไม่มีแหล่งฝึก บอกให้ไปตั้งค่า', () => {
    w.evalSetState('sem', '3');
    const h = w.evalPages.evalReport();
    assert.ok(h.includes('ยังไม่มีแหล่งฝึกที่ถูกกำหนดให้ประเมินในปี/ภาคนี้'), 'ไม่ได้บอกผู้ใช้');
    assert.ok(h.includes('หน้าตั้งค่าแบบประเมิน'), 'ไม่ได้บอกว่าไปตั้งที่ไหน');
  });

  console.log('\n[4] สลับโหมดและเปลี่ยนปี ต้องไม่ค้างข้อมูลเก่า');
  w = makeEnv();
  w.evalRptMode('teacher'); w.evalPickTarget('อาจารย์ ก');
  w.evalPages.evalReport(); await flush(); await flush();
  t('เปลี่ยนปีแล้วคนที่ไม่มีในปีใหม่ถูกล้าง ไม่โชว์ผลเก่า', () => {
    w.evalSetState('year', '2567');
    w.evalSetState('sem', '2');       // ปี 2567 ภาค 2 มีอาจารย์อีกคน ไม่ใช่รายการว่าง
    const h = w.evalPages.evalReport();
    assert.ok(!h.includes('ข้อเสนอแนะปลายเปิด'), 'ยังโชว์ผลของปีก่อนหน้า');
    assert.ok(!h.includes('การพยาบาลพื้นฐาน'), 'ตารางผลของปีเดิมยังค้าง');
    assert.ok(h.includes('เลือกอาจารย์เพื่อดูผลประเมิน'), 'ไม่ได้กลับไปให้เลือกใหม่');
    assert.ok(h.includes('อาจารย์ ปีก่อน (1 วิชา)'), 'รายชื่อไม่ได้เปลี่ยนตามปี');
  });
  t('สลับไปโหมดรายวิชาแล้วกลับมา ผลเป้าหมายถูกล้าง', () => {
    w.evalSetState('year', '2568');
    w.evalSetState('sem', '1');
    w.evalRptMode('course');
    w.evalRptMode('teacher');
    const h = w.evalPages.evalReport();
    assert.ok(h.includes('เลือกอาจารย์เพื่อดูผลประเมิน'), 'ยังค้างผลของคนเดิม');
  });
  t('กดพิมพ์ตอนยังไม่มีผล ต้องเตือน ไม่ใช่พัง', () => {
    calls.length = 0; opened = null;
    w.evalPrintTarget();
    assert.ok(!opened, 'เปิดเอกสารเปล่า');
    assert.ok(calls.some(c => c[0] === 'toast' && /ยังไม่มีผล/.test(c[1])), 'ไม่ได้เตือน');
  });

  console.log('\n[5] บทบาทที่ไม่มีสิทธิ์');
  w = makeEnv();
  w.APP.currentRole = 'student';
  w.APP.permissions.student = {};
  t('นักศึกษาเปิดหน้านี้ไม่ได้', () => {
    const h = w.evalPages.evalReport();
    assert.ok(!h.includes('รายอาจารย์'), 'เห็นปุ่มสลับโหมดด้วย');
  });

  console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
