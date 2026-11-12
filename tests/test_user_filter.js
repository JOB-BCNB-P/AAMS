/* หน้าจัดการผู้ใช้งาน — กรองตามบทบาทได้ และนับรวมภาระงานเพิ่มเติมด้วย */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const SRC = fs.readFileSync(P + 'app.js', 'utf8');
let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

function grab(sig) {
  const i = SRC.indexOf(sig);
  assert.ok(i >= 0, 'ไม่พบ ' + sig);
  // เริ่มนับจากปีกกาหลังลายเซ็น ไม่งั้น `opts = {}` ในพารามิเตอร์จะถูกนับเป็นตัวเปิดบล็อก
  let d = 0, j = SRC.indexOf('{', i + sig.length);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  throw new Error('อ่าน ' + sig + ' ไม่จบ');
}

const USERS = [
  { name: 'ผู้ดูแล', role: 'admin' },
  { name: 'งานทะเบียน', role: 'registrar' },
  { name: 'อ.หนึ่ง', role: 'teacher' },
  { name: 'อ.สอง', role: 'teacher' },
  { name: 'อ.รองวิชาการ', role: 'teacher', extra_roles: 'executive', exec_area: 'วิชาการ' },
  { name: 'อ.ประธานสาขา', role: 'teacher', extra_roles: 'classTeacher,deptHead' },
  { name: 'นศ.หนึ่ง', role: 'student' }
];

function box() {
  const sb = {
    console, Math, JSON, Date, Set, Array, Object, String, Number, clearTimeout, setTimeout,
    APP: { filters: { search: '', semester: '', academicYear: '', yearLevel: '', userRole: '' }, pagination: { page: 1, perPage: 25 }, allData: [] },
    getDataByType: ty => (ty === 'user' ? USERS : []),
    htmlEsc: v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    norm: v => String(v || '').replace(/\.0$/, '').replace(/\s+/g, ' ').trim(),
    normSem: v => String(v || '').trim(),
    renderCurrentPage: () => { }
  };
  vm.createContext(sb);
  new vm.Script(
    SRC.match(/const SETTINGS_ROLE_LABELS = \{[\s\S]*?\};/)[0] + '\n'
    + grab('function userRolesOf(u)') + '\n'
    + grab('function applyFilters(data)') + '\n'
    + grab('function filterBar(opts = {})')
  ).runInContext(sb);
  return sb;
}

(function () {
  console.log('[1] อ่านบทบาททั้งหมดของบัญชี');
  const w = box();
  // อาร์เรย์ที่สร้างในแซนด์บ็อกซ์เป็นคนละ realm · deepStrictEqual จึงไม่ผ่านแม้ค่าตรงกัน
  const roles = u => w.userRolesOf(u).join('|');
  t('รวมบทบาทหลักกับภาระงานเพิ่มเติม', () =>
    assert.strictEqual(roles({ role: 'teacher', extra_roles: 'classTeacher,deptHead' }), 'teacher|classTeacher|deptHead'));
  t('ไม่คืนค่าซ้ำและไม่คืนค่าว่าง', () => {
    assert.strictEqual(roles({ role: 'teacher', extra_roles: ' teacher , , deptHead ' }), 'teacher|deptHead');
    assert.strictEqual(roles({}), '');
    assert.strictEqual(roles(null), '');
  });

  console.log('\n[2] กรองรายชื่อ');
  t('กรองบทบาทหลักได้', () => {
    const w2 = box();
    w2.APP.filters.userRole = 'registrar';
    const r = w2.applyFilters(USERS);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].name, 'งานทะเบียน');
  });
  t('กรองเจอคนที่ถือบทบาทนั้นเป็นภาระงานเพิ่มเติม', () => {
    const w2 = box();
    w2.APP.filters.userRole = 'executive';
    const r = w2.applyFilters(USERS);
    assert.strictEqual(r.length, 1, 'ควรเจอรองฯ ที่เก็บเป็น role=teacher + extra_roles');
    assert.strictEqual(r[0].name, 'อ.รองวิชาการ');
  });
  t('คนหนึ่งอยู่ได้หลายบทบาท', () => {
    ['teacher', 'classTeacher', 'deptHead'].forEach(r => {
      const w2 = box();
      w2.APP.filters.userRole = r;
      assert.ok(w2.applyFilters(USERS).some(x => x.name === 'อ.ประธานสาขา'), 'ไม่เจอในบทบาท ' + r);
    });
  });
  t('ไม่เลือกบทบาท = เห็นทุกคน', () => {
    const w2 = box();
    assert.strictEqual(w2.applyFilters(USERS).length, USERS.length);
  });
  t('กรองบทบาทใช้ร่วมกับช่องค้นหาได้', () => {
    const w2 = box();
    w2.APP.filters.userRole = 'teacher';
    w2.APP.filters.search = 'สอง';
    const r = w2.applyFilters(USERS);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].name, 'อ.สอง');
  });

  console.log('\n[3] ช่องเลือกบนหน้าจอ');
  const h = (() => { const w2 = box(); return w2.filterBar({ semester: false, year: false, userRole: USERS }); })();
  t('มีตัวเลือกครบทุกบทบาทที่มีคนจริง', () => {
    ['ผู้ดูแลระบบ', 'งานทะเบียน', 'อาจารย์', 'ผู้บริหาร', 'ประธานสาขา', 'นักศึกษา']
      .forEach(x => assert.ok(h.includes(x), 'ไม่มีตัวเลือก ' + x));
  });
  t('บอกจำนวนคนในแต่ละบทบาท', () => {
    assert.ok(/อาจารย์ \(4\)/.test(h), 'นับอาจารย์ผิด (ต้องนับคนที่ role=teacher ทั้งหมด)');
    assert.ok(/ผู้บริหาร \(1\)/.test(h), 'นับผู้บริหารผิด');
    assert.ok(/ทุกบทบาท \(7 คน\)/.test(h), 'ไม่ได้บอกจำนวนรวม');
  });
  t('ไม่ขึ้นบทบาทที่ไม่มีคนเลย', () =>
    assert.ok(!h.includes('จนท.งานอื่นๆ'), 'ขึ้นบทบาทที่ไม่มีผู้ใช้'));
  t('หน้าอื่นที่ไม่ได้ขอ ไม่มีช่องนี้', () => {
    const w2 = box();
    assert.ok(!w2.filterBar({ semester: false, year: false }).includes('ทุกบทบาท'), 'โผล่ในหน้าที่ไม่ได้ขอ');
  });

  console.log('\n[4] ผูกเข้ากับหน้าจัดการผู้ใช้งาน');
  const pg = grab('function settingsUsersPage()');
  t('หน้านี้เรียกใช้ตัวกรองบทบาท', () =>
    assert.ok(pg.includes('userRole: allUsers'), 'ยังไม่ได้เปิดใช้'));
  t('นับจำนวนจากรายชื่อทั้งหมด ไม่ใช่หลังกรอง', () =>
    assert.ok(pg.includes('const allUsers = getDataByType') && pg.includes('applyFilters(allUsers)'), 'นับผิดฐาน'));
  t('บอกว่ากำลังกรองอยู่', () => {
    assert.ok(pg.includes("filtered ? total + ' จาก ' + allUsers.length"), 'ไม่ได้บอกว่ากรองอยู่');
    assert.ok(pg.includes('ไม่มีผู้ใช้ที่ตรงกับตัวกรอง'), 'กรองแล้วไม่เจอ ยังบอกว่า "ยังไม่มีผู้ใช้"');
  });
  t('แสดงตำแหน่งผู้บริหารในคอลัมน์บทบาท', () =>
    assert.ok(pg.includes('execAreaLabel(u.exec_area)'), 'ไม่เห็นว่าใครเป็นรองฯ ด้านไหน'));

  console.log('\n[5] ไม่ค้างไปกวนหน้าอื่น');
  t('ตั้งค่าเริ่มต้นไว้ใน APP.filters', () =>
    assert.ok(/filters: \{[^}]*userRole: ''/.test(SRC), 'ไม่ได้ประกาศค่าเริ่มต้น'));
  t('ล้างตัวกรองเมื่อเปลี่ยนหน้า', () => {
    const g = SRC.slice(SRC.indexOf('function navigateTo(page)'), SRC.indexOf('function navigateTo(page)') + 900);
    assert.ok(g.includes("APP.filters.userRole = ''"), 'ตัวกรองค้างข้ามหน้า');
  });
  t('ไฟล์ทั้งไฟล์ยังแปลผ่าน', () => { new vm.Script(SRC); });

  console.log('\n' + (fail ? '✗' : '✓') + ' ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
  process.exit(fail ? 1 : 0);
})();
