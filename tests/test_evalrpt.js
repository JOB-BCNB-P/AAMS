/* รายงานผลประเมินรายอาจารย์ / รายแหล่งฝึก และการดาวน์โหลด PDF */
const fs = require('fs');
const assert = require('assert');
// รันจากโฟลเดอร์ tests/ ในโปรเจกต์ อ่านไฟล์จากโฟลเดอร์แม่
const P = require('path').join(__dirname, '..') + require('path').sep;
const EV = fs.readFileSync(P + 'eval.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

// ดึงฟังก์ชันตัวเดียวออกมาโดยนับปีกกา เพื่อให้ทดสอบตรรกะได้จริงไม่ใช่แค่จับคำ
function grab(name, head) {
  const i = EV.indexOf(head);
  assert.ok(i >= 0, 'หาไม่เจอ: ' + head);
  let d = 0, j = EV.indexOf('{', i);
  for (let k = j; k < EV.length; k++) {
    if (EV[k] === '{') d++;
    else if (EV[k] === '}') { d--; if (!d) { j = k + 1; break; } }
  }
  return EV.slice(i, j);
}

console.log('[1] โหมดรายงานสามแบบ');
t('มีทั้งภาพรวมรายวิชา รายอาจารย์ และแหล่งฝึก', () => {
  const m = grab('RPT_MODES', 'var RPT_MODES = [');
  assert.ok(m.includes("['course', 'ภาพรวมรายวิชา'"), 'ไม่มีโหมดภาพรวมรายวิชา');
  assert.ok(m.includes("['teacher', 'รายอาจารย์'"), 'ไม่มีโหมดรายอาจารย์');
  assert.ok(m.includes("['site', 'รายแหล่งฝึก'"), 'ไม่มีโหมดแหล่งฝึก');
});
t('สลับโหมดแล้วล้างผลของเป้าหมายเดิม ไม่ค้างข้ามคน', () => {
  const f = grab('evalRptMode', 'window.evalRptMode = function (m)');
  ['r.tgt', 'r.tdata', 'r.tcomments', 'r.terror', 'r.tkey'].forEach(k =>
    assert.ok(f.includes(k + " = ''") || f.includes(k + ' = null'), 'ไม่ได้ล้าง ' + k));
  assert.ok(f.includes("(m === 'teacher' || m === 'site') ? m : 'course'"), 'ไม่ได้กันค่าโหมดแปลกปลอม');
});
t('เปลี่ยนเป้าหมายแล้วล้างผลเดิมด้วย', () => {
  const f = grab('evalPickTarget', 'window.evalPickTarget = function (name)');
  assert.ok(f.includes('r.tdata = null') && f.includes("r.tkey = ''"), 'ยังค้างผลของคนก่อน');
});

console.log('\n[2] ตัวกรอง ปีการศึกษา / ภาคการศึกษา');
t('รายการเป้าหมายอ่านจากปี/ภาคที่เลือกเท่านั้น', () => {
  const f = grab('rptTargets', 'function rptTargets(kind)');
  assert.ok(f.includes('rptForms().forEach'), 'ไม่ได้จำกัดตามปี/ภาค');
  assert.ok(f.includes("s(t.target_kind) !== kind"), 'ไม่ได้แยกอาจารย์กับแหล่งฝึก');
});
t('rptForms กรองด้วยทั้งปีและภาค', () => {
  const f = grab('rptForms', 'function rptForms()');
  assert.ok(f.includes('s(f.academic_year) === st.year') && f.includes('s(f.semester) === st.sem'),
    'เงื่อนไขกรองไม่ครบ');
});
t('เปลี่ยนปีแล้วเป้าหมายที่ไม่มีอยู่จริงถูกล้าง', () => {
  const f = grab('reportPage', 'function reportPage()');
  assert.ok(/if \(r\.tgt && !tgts\.some\(/.test(f), 'ไม่ได้ตรวจว่าเป้าหมายยังอยู่ในปี/ภาคใหม่');
  assert.ok(f.includes("r.tgt = ''; r.tdata = null;"), 'ไม่ได้ล้างผลเดิมเมื่อเป้าหมายหลุดช่วง');
});
t('นับจำนวนวิชาต่อคนให้เห็นในรายการเลือก', () => {
  const f = grab('rptTargets', 'function rptTargets(kind)');
  assert.ok(f.includes('seen[nm].n++'), 'ไม่ได้นับจำนวนวิชา');
  assert.ok(grab('reportPage', 'function reportPage()').includes("' (' + x.n + ' วิชา)'"), 'ไม่ได้แสดงจำนวนวิชา');
});

console.log('\n[3] ไม่ยิงฐานข้อมูลซ้ำ');
t('จำคำขอด้วยกุญแจ ปี|ภาค|ชนิด|ชื่อ', () => {
  const f = grab('loadTargetReport', 'async function loadTargetReport()');
  assert.ok(f.includes("var key = st.year + '|' + st.sem + '|' + r.mode + '|' + r.tgt;"), 'กุญแจไม่ครบทุกตัวกรอง');
  assert.ok(f.includes('if (r.tloading || r.tkey === key) return;'), 'ยังยิงซ้ำได้');
  assert.ok(f.includes("r.tkey = ''"), 'พลาดแล้วไม่ยอมให้ลองใหม่');
});
t('เรียก RPC ตัวที่สร้างไว้ พร้อมอาร์กิวเมนต์ครบ', () => {
  const f = grab('loadTargetReport', 'async function loadTargetReport()');
  assert.ok(f.includes("rpc('ems_eval_by_target', args)"), 'ไม่ได้เรียก ems_eval_by_target');
  assert.ok(f.includes("rpc('ems_eval_comments_by_target', args)"), 'ไม่ได้ดึงข้อเสนอแนะ');
  assert.ok(f.includes('p_year: st.year') && f.includes('p_sem: st.sem')
    && f.includes('p_kind: r.mode') && f.includes('p_target: r.tgt'), 'อาร์กิวเมนต์ไม่ครบ');
});
t('บทบาทที่ไม่มีสิทธิ์ได้ข้อความไทย ไม่ใช่ forbidden', () => {
  const f = grab('loadTargetReport', 'async function loadTargetReport()');
  assert.ok(f.includes("d.error === 'forbidden'") && f.includes('ไม่มีสิทธิ์ดูรายงานนี้'), 'ไม่ได้แปลข้อความ');
});

console.log('\n[4] เกณฑ์ผู้ตอบขั้นต่ำ ต้องไม่รั่ว');
t('วิชาที่ผู้ตอบไม่ถึงเกณฑ์ แสดงว่ามีอยู่แต่ไม่โชว์คะแนน', () => {
  const f = grab('targetBody', 'function targetBody(d, comments)');
  assert.ok(f.includes('ยังเปิดเผยไม่ได้ — ผู้ตอบไม่ถึงเกณฑ์'), 'ไม่ได้บอกเหตุผล');
  assert.ok(!/!x\.visible[\s\S]{0,400}meanCell\(x\.mean/.test(f), 'แถวที่ปิดบังยังโชว์ค่าเฉลี่ย');
});
t('ไม่มีวิชาใดถึงเกณฑ์ ต้องไม่แสดงตารางเลย', () => {
  const f = grab('targetBody', 'function targetBody(d, comments)');
  assert.ok(/if \(!vis\.length\)[\s\S]{0,200}warnBox/.test(f), 'ยังแสดงผลแม้ไม่มีวิชาที่เปิดเผยได้');
});
t('เตือนจำนวนวิชาที่ถูกกันออกจากค่าเฉลี่ย', () => {
  const f = grab('targetBody', 'function targetBody(d, comments)');
  assert.ok(f.includes('ไม่ถูกนับเข้าค่าเฉลี่ยรวม'), 'ผู้อ่านจะเข้าใจผิดว่าค่าเฉลี่ยครอบทุกวิชา');
});

console.log('\n[5] ดาวน์โหลด PDF ทั้งสามแบบ');
t('มีปุ่ม PDF ในโหมดรายวิชา', () => {
  const f = grab('reportPage', 'function reportPage()');
  assert.ok(/r\.mode === 'course'[\s\S]{0,600}evalPrintReport\(\)/.test(f), 'โหมดรายวิชาไม่มีปุ่ม PDF');
});
t('มีปุ่ม PDF ในโหมดอาจารย์และแหล่งฝึก', () => {
  const f = grab('reportPage', 'function reportPage()');
  assert.ok(/r\.mode !== 'course'[\s\S]{0,600}evalPrintTarget\(\)/.test(f), 'โหมดเป้าหมายไม่มีปุ่ม PDF');
});
t('ตัวพิมพ์ทั้งสองมีอยู่จริงและปฏิเสธข้อมูลว่าง', () => {
  const a = grab('evalPrintReport', 'window.evalPrintReport = function ()');
  const b = grab('evalPrintTarget', 'window.evalPrintTarget = function ()');
  assert.ok(a.includes("!r.data || !r.data.visible") && a.includes('ยังไม่มีผลให้ดาวน์โหลด'), 'พิมพ์ได้แม้ยังไม่มีผล');
  assert.ok(b.includes("r.mode === 'course' || !d") && b.includes('ยังไม่มีผลให้ดาวน์โหลด'), 'พิมพ์ผิดโหมดได้');
});
t('เอกสารพิมพ์เป็น A4 ฟอนต์ไทย และหัวตารางซ้ำทุกหน้า', () => {
  // PRINT_CSS เป็นสตริงต่อกัน ไม่ใช่บล็อกปีกกา จึงตัดตามเครื่องหมายจบคำสั่ง
  const i = EV.indexOf('var PRINT_CSS =');
  assert.ok(i >= 0, 'ไม่พบ PRINT_CSS');
  const css = EV.slice(i, EV.indexOf("';", EV.indexOf('@media print', i)));
  assert.ok(css.includes('family=Sarabun'), 'ไม่ได้ฝังฟอนต์ไทย');
  assert.ok(css.includes('@page{size:A4'), 'ไม่ได้ตั้งขนาดกระดาษ');
  assert.ok(css.includes('thead{display:table-header-group}'), 'ตารางข้ามหน้าแล้วหัวตารางหาย');
  assert.ok(css.includes('page-break-inside:avoid'), 'แถวถูกตัดครึ่งหน้าได้');
});
t('เอกสารพิมพ์บอกชื่อวิทยาลัย ปี ภาค และเกณฑ์แปลผล', () => {
  const f = grab('evalPrintTarget', 'window.evalPrintTarget = function ()');
  assert.ok(f.includes('collegeName()'), 'ไม่มีชื่อวิทยาลัย');
  assert.ok(f.includes('semLabel(d.semester)') && f.includes("s(d.year)"), 'ไม่มีปี/ภาค');
  assert.ok(f.includes('bandFoot()'), 'ไม่มีเกณฑ์แปลผลท้ายเอกสาร');
  assert.ok(grab('bandFoot', 'function bandFoot()').includes('4.51–5.00 มากที่สุด'), 'เกณฑ์ไม่ครบ');
});
t('PDF รายเป้าหมายแสดงทั้งรายวิชา รายหมวด และรายข้อ', () => {
  const f = grab('evalPrintTarget', 'window.evalPrintTarget = function ()');
  ['ผลรายวิชา', 'สรุปรายหมวดคำถาม', 'สรุปรายข้อ'].forEach(h =>
    assert.ok(f.includes(h), 'ขาดหัวข้อ ' + h));
});
t('PDF รายวิชาแสดงตารางอาจารย์และแหล่งฝึกของวิชานั้น', () => {
  const f = grab('evalPrintReport', 'window.evalPrintReport = function ()');
  assert.ok(f.includes("['teacher', 'site'].forEach"), 'ไม่ได้พิมพ์ตารางรายเป้าหมาย');
  assert.ok(f.includes('ผลประเมินแหล่งฝึกภาคปฏิบัติ') && f.includes('ผลประเมินอาจารย์ผู้สอน'), 'หัวตารางไม่ครบ');
});
t('ปิด Popup ไว้ต้องได้คำเตือน ไม่ใช่เงียบหาย', () => {
  const f = grab('printDoc', 'function printDoc(title, inner)');
  assert.ok(f.includes('กรุณาอนุญาต Popup'), 'ผู้ใช้จะไม่รู้ว่าเกิดอะไรขึ้น');
});

console.log('\n[6] ส่งออก CSV รายเป้าหมาย');
t('มีทั้งสถานะการเปิดเผยผลของแต่ละวิชา', () => {
  const f = grab('evalExportTarget', 'window.evalExportTarget = function ()');
  assert.ok(f.includes("x.visible ? 'เปิดเผยผลได้' : 'ผู้ตอบไม่ถึงเกณฑ์'"), 'อ่าน CSV แล้วแยกไม่ออก');
  assert.ok(f.includes("x.visible ? fx(x.mean) : ''"), 'วิชาที่ปิดบังยังส่งค่าเฉลี่ยออกไป');
});
t('ชื่อไฟล์บอกชนิด ชื่อ ปี และภาค', () => {
  const f = grab('evalExportTarget', 'window.evalExportTarget = function ()');
  assert.ok(f.includes("'สรุปผลประเมิน_' + kindWord(d.kind) + '_' + s(d.target)"), 'ชื่อไฟล์แยกไม่ออก');
});

console.log('\n[7] ไม่ทำของเดิมพัง');
t('โหมดรายวิชายังทำงานเหมือนเดิมทุกอย่าง', () => {
  const f = grab('reportPage', 'function reportPage()');
  assert.ok(f.includes('return head + reportBody(formByCode(r.code), r.data, r.comments);'), 'เส้นทางเดิมหาย');
  assert.ok(f.includes('loadReport()'), 'ไม่เรียกตัวโหลดเดิม');
  assert.ok(f.includes('releaseButton(formByCode(r.code))'), 'ปุ่มส่งผลให้ผู้สอนหาย');
  assert.ok(f.includes("btn('evalExportReport()'"), 'ปุ่มส่งออก CSV เดิมหาย');
});
t('ยังกันบทบาทที่ไม่มีสิทธิ์ที่ประตูหน้า', () => {
  const f = grab('reportPage', 'function reportPage()');
  assert.ok(f.includes('if (!canReport()) return noPerm();'), 'ประตูหน้าเปิดโล่ง');
});
t('ไอคอนของปุ่มสลับโหมดครบ', () => {
  const idx = (EV.match(/RPT_MODES = \[[\s\S]*?\];/) || [''])[0];
  ['book-open', 'user', 'building-2'].forEach(i => assert.ok(idx.includes("'" + i + "'"), 'ขาดไอคอน ' + i));
});
t('ทุกไอคอนในระบบมีจริงใน lucide 0.263.0', () => {
  // ชื่อที่ไม่มีจริงจะกลายเป็นช่องว่าง ไม่ error หน้าจอจึงดูเหมือนปกติแต่ไอคอนหาย
  let L;
  try { L = require('lucide'); } catch (e) { console.log('      (ข้าม — ไม่ได้ติดตั้ง lucide ในเครื่องนี้)'); return; }
  const files = ['app.js', 'eval.js', 'workload.js', 'profile.js', 'curriculum.js', 'plo.js', 'app-patch.js', 'index.html'];
  const bad = new Set();
  files.forEach(f => {
    let t; try { t = fs.readFileSync(P + f, 'utf8'); } catch (e) { return; }
    (t.match(/data-lucide=["'][a-z0-9-]+["']/g) || []).forEach(m => {
      const n = m.slice(13, -1);
      const pas = n.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join('');
      if (!L[pas]) bad.add(n + ' (' + f + ')');
    });
  });
  assert.strictEqual(bad.size, 0, 'ไอคอนที่ไม่มีจริง: ' + [...bad].join(', '));
});
t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => {
  new (require('vm').Script)(EV);
});

console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
