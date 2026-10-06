/**
 * AAMS → Google Sheet : สำรองข้อมูลอัตโนมัติ (ทางเดียว — ระบบไม่อ่านข้อมูลจาก Sheet กลับไปใช้)
 * วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
 *
 * ทำงานอย่างไร
 *  - ทุกคืน (ค่าเริ่มต้น 02:00 น.) : ดึงข้อมูลทุกตารางที่อนุญาต แล้ว "เขียนทับ" ลงสเปรดชีต "AAMS Backup (ล่าสุด)"
 *  - ทุกวันอาทิตย์ (03:00 น.)       : เก็บไฟล์ CSV ทุกตารางไว้ในโฟลเดอร์ Drive "AAMS Backup/CSV/ปปปป-ดด-วว"
 *                                    เก็บย้อนหลัง KEEP_WEEKS สัปดาห์ เก่ากว่านั้นย้ายลงถังขยะอัตโนมัติ
 *  - ถ้าสำรองไม่สำเร็จ ส่งอีเมลแจ้ง NOTIFY_EMAIL
 *
 * ติดตั้ง (ทำครั้งเดียว) — ดูรายละเอียดใน README_BACKUP.md
 *  1) Project Settings → Script Properties เพิ่ม
 *       AAMS_BACKUP_URL    = https://xqpbwvbvrowsbwolxhan.supabase.co/functions/v1/backup-export
 *       AAMS_BACKUP_TOKEN  = (โทเคนที่ได้รับ)
 *       NOTIFY_EMAIL       = อีเมลผู้ดูแลระบบ (คั่นหลายคนด้วย , ได้)
 *  2) เลือกฟังก์ชัน setup แล้วกด Run (อนุญาตสิทธิ์) → สร้างสเปรดชีต/โฟลเดอร์ + ตั้งเวลาอัตโนมัติ + สำรองครั้งแรก
 */

var CFG = {
  ROOT_FOLDER: 'AAMS Backup',
  SHEET_NAME: 'AAMS Backup (ล่าสุด)',
  DAILY_HOUR: 2,          // 02:00 น.
  WEEKLY_DAY: ScriptApp.WeekDay.SUNDAY,
  WEEKLY_HOUR: 3,         // 03:00 น.
  KEEP_WEEKS: 8,          // เก็บ CSV ย้อนหลังกี่สัปดาห์
  PAGE: 5000,             // แถวต่อการเรียก 1 ครั้ง
  MAX_CELL: 49000,        // Google Sheet รับได้ 50,000 ตัวอักษร/เซลล์
  TZ: 'Asia/Bangkok'
};

/* ───────────── ติดตั้ง ───────────── */

function setup() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('AAMS_BACKUP_URL') || !p.getProperty('AAMS_BACKUP_TOKEN')) {
    throw new Error('กรุณาใส่ AAMS_BACKUP_URL และ AAMS_BACKUP_TOKEN ใน Script Properties ก่อน');
  }
  ensureSpreadsheet_();
  ensureFolder_(['CSV']);
  installTriggers();
  backupToSheet();
  Logger.log('ติดตั้งเรียบร้อย: ' + ensureSpreadsheet_().getUrl());
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'backupToSheet' || f === 'backupCsvWeekly') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupToSheet').timeBased().everyDays(1).atHour(CFG.DAILY_HOUR).inTimezone(CFG.TZ).create();
  ScriptApp.newTrigger('backupCsvWeekly').timeBased().onWeekDay(CFG.WEEKLY_DAY).atHour(CFG.WEEKLY_HOUR).inTimezone(CFG.TZ).create();
}

/** ทดสอบการเชื่อมต่อ (ไม่เขียนอะไร) */
function testConnection() {
  var res = api_({ action: 'list' });
  Logger.log('เชื่อมต่อสำเร็จ ' + res.tables.length + ' ตาราง');
  res.tables.forEach(function (t) { Logger.log(t.name + ' (' + t.label + '): ' + t.count); });
}

/* ───────────── สำรองลง Google Sheet (ทุกคืน) ───────────── */

function backupToSheet() {
  var started = new Date();
  var log = [];
  try {
    var list = api_({ action: 'list' }).tables;
    var ss = ensureSpreadsheet_();
    list.forEach(function (t) {
      try {
        var data = fetchTable_(t.name);
        writeSheet_(ss, t.label, data);
        log.push([t.label, t.name, data.rows.length, 'สำเร็จ', '']);
      } catch (e) {
        log.push([t.label, t.name, '', 'ล้มเหลว', String(e.message || e)]);
      }
    });
    writeSummary_(ss, started, log);
    var fails = log.filter(function (r) { return r[3] !== 'สำเร็จ'; });
    if (fails.length) notify_('สำรองข้อมูล AAMS ไม่สำเร็จบางตาราง (' + fails.length + ')',
      fails.map(function (r) { return '• ' + r[0] + ': ' + r[4]; }).join('\n') + '\n\n' + ss.getUrl());
  } catch (e) {
    notify_('สำรองข้อมูล AAMS ล้มเหลว', String(e.stack || e));
    throw e;
  }
}

/* ───────────── สำรองเป็น CSV รายสัปดาห์ ───────────── */

function backupCsvWeekly() {
  try {
    var stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
    var csvRoot = ensureFolder_(['CSV']);
    var it = csvRoot.getFoldersByName(stamp);
    var folder = it.hasNext() ? it.next() : csvRoot.createFolder(stamp);
    var list = api_({ action: 'list' }).tables;
    var fails = [];
    list.forEach(function (t) {
      try {
        var data = fetchTable_(t.name);
        var name = t.name + '.csv';
        var old = folder.getFilesByName(name);
        while (old.hasNext()) old.next().setTrashed(true);
        folder.createFile(name, '﻿' + toCsv_(data), MimeType.CSV); // BOM ให้ Excel อ่านภาษาไทยถูก
      } catch (e) { fails.push(t.name + ': ' + (e.message || e)); }
    });
    pruneOldCsv_(csvRoot);
    if (fails.length) notify_('สำรอง CSV รายสัปดาห์ AAMS ไม่สำเร็จบางตาราง', fails.join('\n'));
  } catch (e) {
    notify_('สำรอง CSV รายสัปดาห์ AAMS ล้มเหลว', String(e.stack || e));
    throw e;
  }
}

function pruneOldCsv_(csvRoot) {
  var cutoff = new Date(Date.now() - CFG.KEEP_WEEKS * 7 * 86400000);
  var it = csvRoot.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.getName());
    if (m && new Date(+m[1], +m[2] - 1, +m[3]) < cutoff) f.setTrashed(true);
  }
}

/* ───────────── ตัวช่วย ───────────── */

function api_(payload) {
  var p = PropertiesService.getScriptProperties();
  var res = UrlFetchApp.fetch(p.getProperty('AAMS_BACKUP_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-backup-token': p.getProperty('AAMS_BACKUP_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) { /* ignore */ }
  if (code !== 200 || !body.ok) throw new Error('HTTP ' + code + ' ' + (body.error || res.getContentText().slice(0, 200)));
  return body;
}

function fetchTable_(name) {
  var columns = [], rows = [], offset = 0;
  for (var guard = 0; guard < 200; guard++) {
    var page = api_({ action: 'page', table: name, offset: offset, limit: CFG.PAGE });
    if (!columns.length && page.columns.length) columns = page.columns;
    // ถ้าคอลัมน์หน้าถัดไปต่างจากเดิม จัดเรียงตามหัวตารางแรก
    var map = page.columns.map(function (c) { return columns.indexOf(c); });
    page.rows.forEach(function (r) {
      var out = columns.map(function () { return ''; });
      r.forEach(function (v, i) { if (map[i] >= 0) out[map[i]] = v; });
      rows.push(out);
    });
    offset += page.rows.length;
    if (page.done || !page.rows.length) break;
  }
  return { columns: columns, rows: rows };
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  var s = String(v);
  if (s.length > CFG.MAX_CELL) s = s.slice(0, CFG.MAX_CELL) + '…[ตัดทอน]';
  if (/^[=+\-@]/.test(s)) s = "'" + s;              // กันสูตร/คำสั่งแฝง
  return s;
}

function writeSheet_(ss, label, data) {
  var sh = ss.getSheetByName(label) || ss.insertSheet(label);
  sh.clear();
  var cols = Math.max(1, data.columns.length);
  var values = [data.columns.length ? data.columns : ['(ไม่มีข้อมูล)']];
  data.rows.forEach(function (r) { values.push(r.map(cell_)); });
  // ปรับขนาดแผ่นงานให้พอดี (ลดเซลล์ว่างที่นับรวมในเพดาน 10 ล้านเซลล์)
  if (sh.getMaxColumns() > cols) sh.deleteColumns(cols + 1, sh.getMaxColumns() - cols);
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  var need = values.length + 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  if (sh.getMaxRows() > need) sh.deleteRows(need + 1, sh.getMaxRows() - need);
  sh.getRange(1, 1, values.length, cols).setNumberFormat('@'); // เก็บเป็นข้อความ ไม่ให้แปลงวันที่/เลขนำหน้า 0
  for (var i = 0; i < values.length; i += 5000) {
    var chunk = values.slice(i, i + 5000);
    sh.getRange(i + 1, 1, chunk.length, cols).setValues(chunk);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#e8eef7');
}

function writeSummary_(ss, started, log) {
  var sh = ss.getSheetByName('_สรุปการสำรอง') || ss.insertSheet('_สรุปการสำรอง', 0);
  sh.clear();
  var fmt = function (d) { return Utilities.formatDate(d, CFG.TZ, 'dd/MM/yyyy HH:mm:ss'); };
  var ok = log.filter(function (r) { return r[3] === 'สำเร็จ'; }).length;
  sh.getRange(1, 1, 4, 2).setValues([
    ['สำรองล่าสุด', fmt(started)],
    ['เสร็จเมื่อ', fmt(new Date())],
    ['ผลลัพธ์', ok + ' / ' + log.length + ' ตาราง สำเร็จ'],
    ['หมายเหตุ', 'สำเนาอ่านอย่างเดียว ระบบ AAMS ไม่ดึงข้อมูลจากไฟล์นี้ — ไม่รวมข้อมูลอ่อนไหว (เลขบัตรประชาชน, บันทึกให้คำปรึกษา, สุขภาพ, ความประพฤติ, บัญชีธนาคาร, เงินเดือน)']
  ]);
  sh.getRange(6, 1, 1, 5).setValues([['แท็บ', 'ตาราง', 'จำนวนแถว', 'สถานะ', 'ข้อผิดพลาด']]).setFontWeight('bold').setBackground('#e8eef7');
  if (log.length) sh.getRange(7, 1, log.length, 5).setValues(log);
  sh.getRange(1, 1, 4, 1).setFontWeight('bold');
  sh.autoResizeColumns(1, 5);
  ['Sheet1', 'แผ่น1', 'ชีต1'].forEach(function (n) {           // แผ่นงานเริ่มต้นของไฟล์ใหม่
    var d = ss.getSheetByName(n);
    if (d && ss.getSheets().length > 1) ss.deleteSheet(d);
  });
  ss.setActiveSheet(sh);
}

function toCsv_(data) {
  var esc = function (v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  var lines = [data.columns.map(esc).join(',')];
  data.rows.forEach(function (r) { lines.push(r.map(esc).join(',')); });
  return lines.join('\r\n');
}

function ensureFolder_(path) {
  var it = DriveApp.getFoldersByName(CFG.ROOT_FOLDER);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(CFG.ROOT_FOLDER);
  (path || []).forEach(function (n) {
    var s = f.getFoldersByName(n);
    f = s.hasNext() ? s.next() : f.createFolder(n);
  });
  return f;
}

function ensureSpreadsheet_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('AAMS_BACKUP_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* ถูกลบ → สร้างใหม่ */ } }
  var ss = SpreadsheetApp.create(CFG.SHEET_NAME);
  ss.setSpreadsheetTimeZone(CFG.TZ);
  var file = DriveApp.getFileById(ss.getId());
  ensureFolder_().addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  p.setProperty('AAMS_BACKUP_SHEET_ID', ss.getId());
  return ss;
}

function notify_(subject, body) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  var msg = { to: to, subject: '[AAMS Backup] ' + subject, body: body, noReply: true };
  try { MailApp.sendEmail(msg); } catch (e) { delete msg.noReply; MailApp.sendEmail(msg); } // noReply ใช้ได้เฉพาะบัญชี Workspace
}
