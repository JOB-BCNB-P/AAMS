/* ================================================================
   CouncilExamForm.gs — สร้าง Google Form "ผลสอบสภาการพยาบาล" อัตโนมัติ
   สำหรับระบบ AAMS — วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
   ----------------------------------------------------------------
   ทำไมต้องใช้สคริปต์แทนการสร้างฟอร์มด้วยมือ
     คอลัมน์ในชีตคำตอบต้องตรงกับหัวตารางที่ตัวนำเข้าของ AAMS รู้จัก
     ถ้าพิมพ์ชื่อคำถามเองทีละข้อ สะกดคลาดไปตัวเดียวก็นำเข้าไม่ได้
     สคริปต์นี้จึงสร้างคำถามจากรายการเดียวกับที่ระบบใช้ ไม่มีทางหลุด

   วิธีใช้ (ทำครั้งเดียว ใช้เวลาไม่ถึง 2 นาที)
     1. เปิด https://script.google.com → + โปรเจกต์ใหม่
     2. ลบโค้ดตัวอย่างทิ้ง แล้ววางไฟล์นี้ลงไปทั้งไฟล์
     3. เลือกฟังก์ชัน  createCouncilExamForm  แล้วกด เรียกใช้ (Run)
     4. ครั้งแรกจะขอสิทธิ์ → อนุญาต (เป็นบัญชีของคุณเอง ไม่เกี่ยวกับ AAMS)
     5. ดูลิงก์ฟอร์มและลิงก์ชีตใน บันทึกการดำเนินการ (Execution log)

   สิ่งที่ได้
     - ฟอร์มที่ "ไม่ต้องเข้าสู่ระบบ" ก็กรอกได้
     - ผู้กรอกแก้คำตอบของตัวเองได้ภายหลัง (เปิด "แก้ไขหลังส่ง" ไว้ให้แล้ว)
     - ถ้ากรอกอีเมลไว้ ระบบจะส่งลิงก์แก้ไขกลับไปให้ทางอีเมลอัตโนมัติ
       (ต้องรัน installEditLinkTrigger ด้วยอีกครั้งหนึ่ง — ดูท้ายไฟล์)
     - ชีตคำตอบที่ดาวน์โหลดเป็น .csv แล้วนำเข้า AAMS ได้ทันที

   ⚠ ข้อควรระวัง
     ฟอร์มที่ไม่ต้องล็อกอิน = ใครมีลิงก์ก็กรอกได้ ให้ส่งลิงก์เฉพาะผู้ที่เกี่ยวข้อง
     และตรวจข้อมูลในหน้าพรีวิวของ AAMS ก่อนกดนำเข้าทุกครั้ง
   ================================================================ */

/* ---------------- ค่าที่แก้ได้ ---------------- */

var FORM_TITLE = 'บันทึกผลสอบความรู้ขอขึ้นทะเบียนและรับใบอนุญาตฯ (สภาการพยาบาล)';
var FORM_DESC =
  'แบบฟอร์มสำหรับบันทึกผลสอบความรู้ฯ ของผู้สำเร็จการศึกษา ' +
  'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ\n\n' +
  '• กรอก 1 ครั้ง ต่อ ผู้เข้าสอบ 1 คน ต่อ การสอบ 1 รอบ\n' +
  '• วิชาที่ไม่ได้เข้าสอบในรอบนั้น ให้เลือก "ไม่ได้เข้าสอบ"\n' +
  '• ส่งแล้วยังแก้ไขได้ จากลิงก์ที่ขึ้นหลังกดส่ง หรือจากลิงก์ที่ส่งเข้าอีเมล';

// คำนำหน้า — เพิ่มได้ตามที่ใช้จริง
var PREFIXES = ['นาย', 'นาง', 'นางสาว'];

// ผลรายวิชา — ค่าทั้งสามนี้ต้องตรงกับที่ AAMS อ่าน
var RESULTS = ['ผ่าน', 'ไม่ผ่าน', 'ไม่ได้เข้าสอบ'];

/* รายวิชาสอบ 8 วิชา — ชื่อในนี้จะกลายเป็น "หัวคอลัมน์" ในชีตคำตอบ
   และเป็นชื่อเดียวกับที่ตัวนำเข้าของ AAMS ใช้จับคู่
   ถ้าสภาฯ เปลี่ยนชื่อวิชา ให้แก้ที่นี่ แล้วแก้ในหน้าตั้งค่าของ AAMS ให้ตรงกัน */
var SUBJECTS = [
  'การผดุงครรภ์',
  'การพยาบาลมารดาและทารก',
  'การพยาบาลเด็กและวัยรุ่น',
  'กฎหมายวิชาชีพการพยาบาลและการผดุงครรภ์ จรรยาบรรณวิชาชีพ และกฎหมายอื่นที่เกี่ยวข้อง',
  'การพยาบาลผู้ใหญ่',
  'การพยาบาลผู้สูงอายุ',
  'การพยาบาลสุขภาพจิตและจิตเวชศาสตร์',
  'การพยาบาลอนามัยชุมชนและการรักษาพยาบาลขั้นต้น'
];

/* ---------------- สร้างฟอร์ม ---------------- */

function createCouncilExamForm() {
  var form = FormApp.create(FORM_TITLE);
  form.setDescription(FORM_DESC)
      .setCollectEmail(false)        // ไม่ต้องเข้าสู่ระบบ
      .setRequireLogin(false)
      .setAllowResponseEdits(true)   // แก้คำตอบของตัวเองได้ภายหลัง
      .setLimitOneResponsePerUser(false)
      .setProgressBar(true)
      .setConfirmationMessage(
        'บันทึกเรียบร้อย ขอบคุณค่ะ\n\n' +
        'ถ้ากรอกผิด กดลิงก์ "แก้ไขคำตอบของคุณ" ด้านบนเพื่อแก้ได้ทันที\n' +
        'แนะนำให้คัดลอกลิงก์นั้นเก็บไว้ หรือกรอกอีเมลไว้ในฟอร์มเพื่อให้ระบบส่งลิงก์ให้');

  /* ---- ส่วนที่ 1 : ข้อมูลผู้เข้าสอบ ---- */
  form.addSectionHeaderItem()
      .setTitle('ข้อมูลผู้เข้าสอบ')
      .setHelpText('กรอกให้ตรงกับทะเบียนของวิทยาลัย เพราะระบบใช้รหัสนักศึกษาจับคู่ข้อมูล');

  // รหัสนักศึกษา 11 หลัก — ใส่ตัวตรวจไว้ กันกรอกผิดตั้งแต่ต้นทาง
  form.addTextItem()
      .setTitle('รหัสนักศึกษา')
      .setHelpText('ตัวเลข 11 หลัก เช่น 65101301001')
      .setRequired(true)
      .setValidation(
        FormApp.createTextValidation()
          .setHelpText('รหัสนักศึกษาต้องเป็นตัวเลข 11 หลัก')
          .requireTextMatchesPattern('^[0-9]{11}$')
          .build());

  var prefix = form.addMultipleChoiceItem();
  prefix.setTitle('คำนำหน้า')
        .setChoiceValues(PREFIXES)
        .showOtherOption(true)
        .setRequired(true);

  form.addTextItem()
      .setTitle('ชื่อ-สกุล')
      .setHelpText('ไม่ต้องใส่คำนำหน้าซ้ำ เช่น สมหญิง ใจดี')
      .setRequired(true);

  form.addTextItem()
      .setTitle('รุ่นที่')
      .setHelpText('ตัวเลขรุ่น เช่น 80')
      .setRequired(true)
      .setValidation(
        FormApp.createTextValidation()
          .setHelpText('กรอกเป็นตัวเลข เช่น 80')
          .requireTextMatchesPattern('^[0-9]{1,3}$')
          .build());

  /* ---- ส่วนที่ 2 : ข้อมูลการสอบ ---- */
  form.addSectionHeaderItem()
      .setTitle('ข้อมูลการสอบ')
      .setHelpText('ผู้เข้าสอบคนเดียวกันที่สอบหลายรอบ ให้กรอกแยกเป็นคนละครั้ง');

  form.addTextItem()
      .setTitle('ครั้งที่สอบ')
      .setHelpText('เช่น 1/2568 หรือ 2/2568 — ใช้แยกรอบการสอบในรายงาน')
      .setRequired(true);

  form.addDateItem()
      .setTitle('วันที่สอบ')
      .setRequired(true);

  /* ---- ส่วนที่ 3 : ผลรายวิชา ---- */
  form.addSectionHeaderItem()
      .setTitle('ผลการสอบรายวิชา')
      .setHelpText('วิชาที่ไม่ได้เข้าสอบในรอบนี้ ให้เลือก "ไม่ได้เข้าสอบ"');

  SUBJECTS.forEach(function (name) {
    form.addMultipleChoiceItem()
        .setTitle(name)
        .setChoiceValues(RESULTS)
        .setRequired(true);
  });

  /* ---- ส่วนที่ 4 : ช่องทางติดต่อกลับ (ไม่บังคับ) ---- */
  form.addSectionHeaderItem()
      .setTitle('ช่องทางแก้ไขภายหลัง (ไม่บังคับ)');

  form.addTextItem()
      .setTitle('อีเมลผู้กรอก')
      .setHelpText('กรอกไว้เพื่อให้ระบบส่งลิงก์สำหรับแก้ไขคำตอบกลับไปให้ ' +
                   'ถ้าไม่กรอก ให้เก็บลิงก์ที่ขึ้นหลังกดส่งไว้เอง')
      .setRequired(false);

  /* ---- ชีตคำตอบ ---- */
  var ss = SpreadsheetApp.create('ผลสอบสภาการพยาบาล (คำตอบ) — AAMS');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('================ สร้างเรียบร้อย ================');
  Logger.log('ลิงก์สำหรับส่งให้ผู้กรอก : ' + form.getPublishedUrl());
  Logger.log('ลิงก์แก้ไขตัวฟอร์ม       : ' + form.getEditUrl());
  Logger.log('ชีตคำตอบ                : ' + ss.getUrl());
  Logger.log('');
  Logger.log('ขั้นต่อไป : ถ้าต้องการให้ระบบส่งลิงก์แก้ไขเข้าอีเมลผู้กรอก');
  Logger.log('ให้เรียกใช้ฟังก์ชัน installEditLinkTrigger อีกหนึ่งครั้ง');
  return form.getPublishedUrl();
}

/* ---------------- ส่งลิงก์แก้ไขกลับทางอีเมล (ไม่บังคับ) ----------------
   เรียกใช้ installEditLinkTrigger หนึ่งครั้งหลังสร้างฟอร์ม
   จากนั้นทุกครั้งที่มีคนส่งคำตอบและกรอกอีเมลไว้ ระบบจะส่งลิงก์แก้ไขให้อัตโนมัติ
   ----------------------------------------------------------------
   หมายเหตุ : บัญชี Google ทั่วไปส่งอีเมลได้วันละ 100 ฉบับ
   บัญชี Workspace ของวิทยาลัยได้ 1,500 ฉบับต่อวัน เพียงพอกับการใช้งานปกติ */
function installEditLinkTrigger() {
  var forms = FormApp.getActiveForm ? null : null;   // กันเรียกผิดบริบท
  var form = FormApp.openByUrl(_formEditUrl_());
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCouncilExamSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onCouncilExamSubmit').forForm(form).onFormSubmit().create();
  Logger.log('ติดตั้งตัวส่งลิงก์แก้ไขเรียบร้อย');
}

/* ใส่ลิงก์แก้ไขฟอร์ม (getEditUrl ที่ได้จากตอนสร้าง) ตรงนี้ก่อนเรียก installEditLinkTrigger */
function _formEditUrl_() {
  return 'วางลิงก์แก้ไขตัวฟอร์มที่ได้จาก createCouncilExamForm ตรงนี้';
}

function onCouncilExamSubmit(e) {
  try {
    var resp = e.response;
    var items = resp.getItemResponses();
    var email = '', who = '', sid = '';
    items.forEach(function (it) {
      var t = it.getItem().getTitle();
      if (t === 'อีเมลผู้กรอก') email = String(it.getResponse() || '').trim();
      if (t === 'ชื่อ-สกุล') who = String(it.getResponse() || '').trim();
      if (t === 'รหัสนักศึกษา') sid = String(it.getResponse() || '').trim();
    });
    if (!email || email.indexOf('@') < 0) return;      // ไม่ได้กรอกอีเมล ก็ไม่ต้องส่ง
    MailApp.sendEmail({
      to: email,
      subject: 'ลิงก์แก้ไขผลสอบสภาการพยาบาล — ' + sid + ' ' + who,
      body: 'เรียน ผู้กรอกข้อมูล\n\n' +
            'ระบบได้รับข้อมูลผลสอบของ ' + sid + ' ' + who + ' เรียบร้อยแล้ว\n\n' +
            'ถ้าต้องการแก้ไขคำตอบ ใช้ลิงก์นี้\n' + resp.getEditResponseUrl() + '\n\n' +
            'กรุณาเก็บลิงก์นี้ไว้ ใช้ได้เฉพาะคำตอบชุดนี้เท่านั้น\n\n' +
            'วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ'
    });
  } catch (err) {
    Logger.log('ส่งลิงก์แก้ไขไม่สำเร็จ: ' + err);
  }
}
