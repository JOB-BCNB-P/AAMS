/* หน้า "กรอกภาระงาน" ฝั่งเจ้าหน้าที่
   ข้อบกพร่องที่เคยเกิด : เลือกพันธกิจแล้วไม่มีช่องให้กรอก
     เหตุที่ 1 การ์ดพันธกิจถูกตั้งให้ยุบไว้ทั้งหมดตั้งแต่เปิดหน้า เลือกแล้วก็ยังยุบอยู่
               และตอนเลือกพันธกิจเดียว ปุ่ม "ขยายทั้งหมด" ก็ถูกซ่อน จึงไม่มีทางกางเลย
     เหตุที่ 2 กล่องเปล่าขึ้นแค่ข้อความสีจาง "ยังไม่มีรายการ" ส่วนปุ่มเพิ่มแถวเป็นปุ่มเล็ก
               อยู่มุมบนขวาปนกับปุ่มอื่น มองไม่ออกว่าต้องกดอะไรต่อ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const P = path.join(__dirname, '..') + path.sep;
const WL = fs.readFileSync(P + 'workload.js', 'utf8');

let pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

function env(role, roles, plans) {
  const DATA = {
    workload_plan: plans || [], workload_student: [], workload_rate: [], subject: [],
    student: [{ student_id: '6611030101', name: 'กนกพร เดชกล้า', year_level: '1', status: 'กำลังศึกษา', batch: '80' }]
  };
  const sb = {
    console,
    APP: {
      currentRole: role, currentPage: 'workload', _roles: roles,
      currentUser: { name: 'ผู้ใช้ทดสอบ' }, filters: {}, pagination: { page: 1 },
      permissions: { [role]: { workload: 1 } }
    },
    getDataByType: (t) => DATA[t] || [],
    norm: (v) => String(v == null ? '' : v).trim(),
    normSem: (v) => String(v == null ? '' : v).trim(),
    isActiveStudent: (s) => String(s && s.status) === 'กำลังศึกษา',
    showModal: () => { }, closeModal: () => { }, showToast: () => { },
    renderCurrentPage: () => { }, navigateTo: () => { },
    GSheetDB: { create: async () => ({ isOk: true }), update: async () => ({ isOk: true }), refreshTab: async () => { } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute() { }, appendChild() { }, classList: { add() { } } }) },
    setTimeout, clearTimeout, Promise
  };
  sb.window = sb; sb.getPageContent = () => ''; sb.buildSidebar = () => { };
  vm.createContext(sb);
  new vm.Script(WL).runInContext(sb);
  return sb;
}
function openPlan(sb, mission) {
  sb.wlSet('tab', 'plan');
  sb.wlSet('mode', 'cohort');
  if (mission !== undefined) sb.wlSet('mission', mission);
  return sb.getPageContent('workload', 'x');
}

console.log('[1] เลือกพันธกิจแล้วต้องเห็นช่องกรอกทันที');
t('เลือกพันธกิจเดียว การ์ดต้องกางออกเอง', () => {
  const sb = env('admin', ['admin']);
  openPlan(sb, 'research');
  assert.strictEqual(sb.APP._wl.fold.research, false, 'การ์ดยังยุบอยู่ ผู้ใช้จะเห็นแต่หัวข้อ');
});
t('กลับไป "ทุกพันธกิจ" ต้องกางทุกการ์ด', () => {
  const sb = env('admin', ['admin']);
  openPlan(sb, 'research');
  sb.wlSet('mission', '');
  const folded = Object.keys(sb.APP._wl.fold).filter(k => k !== 'sumTable' && sb.APP._wl.fold[k]);
  assert.strictEqual(folded.length, 0, 'ยังมีการ์ดที่ยุบอยู่: ' + folded.join(', '));
});
t('ตอนเลือกพันธกิจเดียว ปุ่มขยายทั้งหมดถูกซ่อน จึงต้องกางให้เอง', () => {
  // ถ้าวันหนึ่งเอาเงื่อนไขซ่อนปุ่มออก ก็ยังกางให้อยู่ดี แต่ตรวจไว้ให้รู้ว่าทำไมต้องกาง
  const src = WL.slice(WL.indexOf('function foldBar'), WL.indexOf('function foldBar') + 300);
  assert.ok(src.includes("if (state().mission) return ''"), 'พฤติกรรมเปลี่ยนไป ต้องทบทวนการกางการ์ด');
});

console.log('\n[2] กล่องที่ยังไม่มีรายการ ต้องบอกว่าทำอะไรต่อ');
t('มีปุ่มเพิ่มรายการแรกอยู่ในกล่อง ไม่ใช่แค่ปุ่มเล็กมุมบน', () => {
  const h = openPlan(env('admin', ['admin']), 'research');
  assert.ok(h.includes('เพิ่มรายการแรก'), 'ไม่มีปุ่มในกล่อง');
  assert.ok(h.includes('ยังไม่มีรายการในพันธกิจด้านวิจัย'), 'ไม่ได้บอกว่ากล่องนี้ว่าง');
});
t('พันธกิจด้านวิชาการเสนอให้ดึงรายวิชาที่เปิดสอน', () => {
  const h = openPlan(env('admin', ['admin']), 'teaching');
  assert.ok(h.includes('ดึงรายวิชาที่เปิดสอน'), 'ไม่มีทางลัดดึงรายวิชา');
  assert.ok(h.includes('wlPullSubjects()'), 'ปุ่มไม่ได้ผูกกับฟังก์ชัน');
});
t('พันธกิจอื่นไม่ต้องมีปุ่มดึงรายวิชา', () => {
  const h = openPlan(env('admin', ['admin']), 'personal');
  const box = h.slice(h.indexOf('ยังไม่มีรายการใน'));
  assert.ok(!box.includes('ดึงรายวิชาที่เปิดสอน'), 'พันธกิจที่ไม่ใช่วิชาการไม่ควรมีปุ่มนี้');
});
t('มีรายการแล้วต้องแสดงตาราง ไม่ใช่กล่องว่าง', () => {
  const sb = env('admin', ['admin'], [{
    __backendId: 'PL1', academic_year: '2568', year_level: '1', semester: '1',
    research_json: JSON.stringify([{ kind: 'กิจกรรมที่', activity: 'อบรม', hours: '6' }]),
    teaching_json: '[]', service_json: '[]', student_json: '[]', personal_json: '[]'
  }]);
  const h = openPlan(sb, 'research');
  assert.ok(!h.includes('ยังไม่มีรายการในพันธกิจด้านวิจัย'), 'มีข้อมูลแล้วยังขึ้นกล่องว่าง');
  assert.ok(h.includes('อบรม'), 'ไม่ได้แสดงรายการที่มีอยู่');
});

console.log('\n[3] พันธกิจที่ไม่ได้รับมอบหมาย');
t('บอกเหตุผลและทางแก้ ไม่ใช่กล่องว่างเปล่า', () => {
  const h = openPlan(env('otherStaff', ['otherStaff']), 'teaching');
  assert.ok(h.includes('ไม่ได้รับมอบหมายให้บันทึก'), 'ไม่ได้บอกว่าทำไมกรอกไม่ได้');
  assert.ok(h.includes('จัดการผู้ใช้งาน'), 'ไม่ได้บอกว่าขอสิทธิ์ได้ที่ไหน');
  assert.ok(!h.includes('เพิ่มรายการแรก'), 'ไม่ควรมีปุ่มเพิ่มในพันธกิจที่ถูกล็อก');
});
t('เจ้าหน้าที่งานอื่นๆ ยังกรอกพันธกิจที่ได้รับมอบหมายได้', () => {
  const h = openPlan(env('otherStaff', ['otherStaff']), 'research');
  assert.ok(h.includes('เพิ่มรายการแรก'), 'กรอกพันธกิจที่ได้รับมอบหมายไม่ได้');
});

console.log('\n' + (fail ? '✗ ' : '✓ ') + 'ผ่าน ' + pass + ' ข้อ  ไม่ผ่าน ' + fail + ' ข้อ');
process.exit(fail ? 1 : 0);
