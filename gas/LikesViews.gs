/**
* ============================================================
* לייקים וצפיות לאתר "רביב דיגיטל"
* ============================================================
* שרת ספירת לייקים ("אהבתי") וצפיות לכל פריט באתר.
* הנתונים נשמרים בגיליון Google Sheets שנוצר אוטומטית בדרייב שלכם.
*
* איך פורסים (מדריך מלא: gas/README.md):
* 1. נכנסים ל-https://script.google.com → "פרויקט חדש".
* 2. מדביקים את כל הקוד הזה בקובץ Code.gs.
* 3. מריצים ידנית פעם אחת את הפונקציה setup() כדי ליצור את הגיליון
*    (בוחרים setup → Run → מאשרים הרשאות).
* 4. פורסים: Deploy → New deployment → Web app
*    - Execute as: Me (החשבון שלכם)
*    - Who has access: Anyone
* 5. מעתיקים את כתובת ה-Web App ומדביקים אותה באתר:
*    index.html → const LIKES_URL = 'הכתובת שלכם';
*
* איך האתר מתקשר איתו:
* - קריאה:  GET .../exec?action=counts&callback=cb  → תשובה JSONP
* - לייק:   GET .../exec?action=like&id=xxx&visitor=yyy
* - ביטול:  GET .../exec?action=unlike&id=xxx&visitor=yyy
* - צפייה: GET .../exec?action=view&id=xxx&visitor=yyy
*
* לייקים: ספירה של מבקרים שונים (לפי מזהה מבקר ייחודי) — אותו אדם נספר פעם אחת.
* צפיות: ספירת סה"כ צפיות — כל כניסה לאתר שבה הפריט הוצג מוסיפה +1
*  (מניעת רענון-ספאם נעשה בדפדפן: פעם אחת לכל סשן לכל פריט).
*
* התראות במייל:
* - צפיות: כל VIEW_EMAIL_EVERY צפיות חדשות באותו פריט (ברירת מחדל: 25)
* - לייקים: כל LIKE_EMAIL_EVERY לייקים חדשים באותו פריט (ברירת מחדל: 5)
*   (רוצים מייל על כל לייק בודד? שימו LIKE_EMAIL_EVERY: 1)
* - סיכום חודשי: מריצים פעם אחת את setupMonthlySummaryTrigger() וכל חודש
*   ב-1 בשעה 09:00 תישלח טבלת סיכום מעוצבת של כל הפריטים.
* ============================================================
*/

var CONFIG = {
  SPREADSHEET_FILE_NAME: 'לייקים וצפיות - רביב דיגיטל',
  LIKES_SHEET: 'ליקים',
  VIEWS_SHEET: 'צפיות',
  NOTIFICATIONS_SHEET: 'התראות',
  EMAIL_TO: '', // ריק = נשלח לחשבון שמפעיל את הסקריפט
  VIEW_EMAIL_EVERY: 25, // מייל כל 25 צפיות חדשות באותו פריט
  LIKE_EMAIL_EVERY: 5   // מייל כל 5 לייקים חדשים באותו פריט
};

/**
* הפעלה ידנית ראשונית — יוצרת את הגיליון אם טרם נוצר ומחזירה את כתובתו.
*/
function setup() {
  return getSpreadsheet_().getUrl();
}

/**
* אבחון: מציג לאיזה גיליון הסקריפט כותב בפועל וכמה שורות יש בכל גיליון.
* מריצים ידנית ורואים את הפלט ב-View → Logs.
*/
function diagnose() {
  var out = {
    now: new Date().toString(),
    spreadsheetName: CONFIG.SPREADSHEET_FILE_NAME,
    filesWithThatName: [],
    usedSpreadsheet: null,
    sheets: {},
    likesLastRows: [],
    viewsLastRows: []
  };
  var it = DriveApp.getFilesByName(CONFIG.SPREADSHEET_FILE_NAME);
  while (it.hasNext()) {
    var f = it.next();
    out.filesWithThatName.push({ id: f.getId(), url: f.getUrl(), created: f.getDateCreated().toString() });
  }
  var ss = getSpreadsheet_();
  out.usedSpreadsheet = { id: ss.getId(), url: ss.getUrl() };
  [CONFIG.LIKES_SHEET, CONFIG.VIEWS_SHEET, CONFIG.NOTIFICATIONS_SHEET].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    out.sheets[name] = sh ? { rows: sh.getLastRow() } : 'לא קיים';
  });
  out.likesLastRows = readLastRows_(ss.getSheetByName(CONFIG.LIKES_SHEET), 5);
  out.viewsLastRows = readLastRows_(ss.getSheetByName(CONFIG.VIEWS_SHEET), 5);
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function readLastRows_(sheet, n) {
  var out = [];
  if (!sheet) return out;
  var values = sheet.getDataRange().getValues();
  for (var i = Math.max(1, values.length - n); i < values.length; i++) {
    out.push(String(values[i][1]) + ' | ' + String(values[i][2]) + ' | ' + String(values[i][0]));
  }
  return out;
}

function getSpreadsheet_() {
  var files = DriveApp.getFilesByName(CONFIG.SPREADSHEET_FILE_NAME);
  var candidates = [];
  while (files.hasNext()) candidates.push(files.next());
  var ss;
  if (!candidates.length) {
    ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_FILE_NAME);
  } else {
    // אם קיימים כמה קבצים באותו שם — מעדיפים קובץ שכבר מכיל נתונים,
    // ואם אין כזה — את העדכני ביותר. כך הנתונים לא מתפזרים בין גיליונות.
    candidates.sort(function (a, b) {
      return b.getDateCreated().getTime() - a.getDateCreated().getTime();
    });
    ss = SpreadsheetApp.open(candidates[0]);
    for (var i = 0; i < candidates.length; i++) {
      var cand = SpreadsheetApp.open(candidates[i]);
      var likes = cand.getSheetByName(CONFIG.LIKES_SHEET);
      var views = cand.getSheetByName(CONFIG.VIEWS_SHEET);
      if ((likes && likes.getLastRow() > 1) || (views && views.getLastRow() > 1)) {
        ss = cand;
        break;
      }
    }
  }
  ensureSheets_(ss);
  return ss;
}

function ensureSheets_(ss) {
  if (!ss.getSheetByName(CONFIG.LIKES_SHEET)) {
    ss.insertSheet(CONFIG.LIKES_SHEET).appendRow(['timestamp', 'item', 'visitor']);
  }
  if (!ss.getSheetByName(CONFIG.VIEWS_SHEET)) {
    ss.insertSheet(CONFIG.VIEWS_SHEET).appendRow(['timestamp', 'item', 'visitor']);
  }
  if (!ss.getSheetByName(CONFIG.NOTIFICATIONS_SHEET)) {
    ss.insertSheet(CONFIG.NOTIFICATIONS_SHEET).appendRow(['item', 'views_notified', 'likes_notified']);
  }
}

function doGet(e) {
  var p = e.parameter || {};
  var action = String(p.action || 'counts');
  var id = String(p.id || '').slice(0, 60);
  var visitor = String(p.visitor || '').slice(0, 60);
  var writeError = '';
  try {
    if (action === 'like' && id && visitor) {
      getSpreadsheet_().getSheetByName(CONFIG.LIKES_SHEET).appendRow([new Date(), id, visitor]);
      safeNotify_('like', id);
    } else if (action === 'unlike' && id && visitor) {
      removeRows_(CONFIG.LIKES_SHEET, id, visitor);
    } else if (action === 'view' && id && visitor) {
      getSpreadsheet_().getSheetByName(CONFIG.VIEWS_SHEET).appendRow([new Date(), id, visitor]);
      safeNotify_('view', id);
    }
  } catch (err) {
    // לא להפיל את התשובה — אבל מדווחים על השגיאה בתשובה כדי שניתן יהיה לאבחן
    writeError = String(err);
  }
  var data = getCounts_(visitor);
  if (writeError) data.write_error = writeError;
  var callback = String(p.callback || '');
  return respond_(callback, data);
}

function getCounts_(visitor) {
  var out = { likes: {}, views: {} };
  try {
    var ss = getSpreadsheet_();
    out.likes = countDistinct_(ss.getSheetByName(CONFIG.LIKES_SHEET));
    out.views = countRows_(ss.getSheetByName(CONFIG.VIEWS_SHEET));
    // רשימת הפריטים שמבקר ספציפי סימן (אם נשלח מזהה) — לסנכרון מצב הלב בין מכשירים
    if (visitor) {
      var my = {};
      var values = ss.getSheetByName(CONFIG.LIKES_SHEET).getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        var rowId = String(values[i][1] || '').trim();
        var rowVisitor = String(values[i][2] || '').trim();
        if (rowId && rowVisitor === visitor) my[rowId] = true;
      }
      out.myLikes = my;
    }
  } catch (err) {
    out.error = String(err);
  }
  return out;
}

// צפיות נספרות כסה"כ — כל שורה = צפייה אחת (הדה-דופליקציה לפי סשן נעשית בדפדפן)
function countRows_(sheet) {
  return countRowsInRange_(sheet, null, null);
}

// סה"כ צפיות בטווח תאריכים [from, to) — לסיכום החודשי
function countRowsInRange_(sheet, from, to) {
  var counts = {};
  if (!sheet) return counts;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var ts = values[i][0];
    if (from && (!(ts instanceof Date) || ts.getTime() < from.getTime())) continue;
    if (to && ts instanceof Date && ts.getTime() >= to.getTime()) continue;
    var rowId = String(values[i][1] || '').trim();
    if (!rowId) continue;
    counts[rowId] = (counts[rowId] || 0) + 1;
  }
  return counts;
}

// סופר כמה מבקרים שונים (לפי מזהה מבקר) אהבו/צפו בכל פריט
function countDistinct_(sheet) {
  return countDistinctInRange_(sheet, null, null);
}

// כמו countDistinct_ אבל רק על טווח תאריכים [from, to) — לסיכום החודשי
function countDistinctInRange_(sheet, from, to) {
  var counts = {};
  if (!sheet) return counts;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var ts = values[i][0];
    if (from && (!(ts instanceof Date) || ts.getTime() < from.getTime())) continue;
    if (to && ts instanceof Date && ts.getTime() >= to.getTime()) continue;
    var rowId = String(values[i][1] || '').trim();
    var rowVisitor = String(values[i][2] || '').trim();
    if (!rowId || !rowVisitor) continue;
    if (!counts[rowId]) counts[rowId] = {};
    counts[rowId][rowVisitor] = true;
  }
  var result = {};
  for (var key in counts) result[key] = Object.keys(counts[key]).length;
  return result;
}

// מחיקת שורות מסוימות (לביטול לייק של אותו מבקר)
function removeRows_(sheetName, id, visitor) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return;
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;
  var keep = [values[0]]; // שורת הכותרת
  for (var i = 1; i < values.length; i++) {
    var rowId = String(values[i][1] || '').trim();
    var rowVisitor = String(values[i][2] || '').trim();
    if (rowId === id && rowVisitor === visitor) continue; // למחוק
    keep.push(values[i]);
  }
  sheet.clearContents();
  if (keep.length) {
    sheet.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
  }
}

function respond_(callback, data) {
  var json = JSON.stringify(data);
  if (callback) {
    var safe = String(callback).replace(/[^A-Za-z0-9_$]/g, '');
    return ContentService.createTextOutput(safe + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
* התראות במייל
* ============================================================ */

// למי שולחים: CONFIG.EMAIL_TO אם הוגדר, אחרת לחשבון שמפעיל את הסקריפט
function getEmailRecipient_() {
  var to = String(CONFIG.EMAIL_TO || '').trim();
  if (to) return to;
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (err) {}
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail() || ''; } catch (err) {}
  }
  return email;
}

// קריאה בטוחה — אף פעם לא מפילה את תשובת השרת בגלל כשל בהתראה
function safeNotify_(type, id) {
  try {
    checkNotifications_(type, id);
  } catch (err) {
    // התראה נכשלה — ממשיכים כרגיל
  }
}

// בודק אם חוצים סף חדש (כל N צפיות / M לייקים) ושולח מייל
function checkNotifications_(type, id) {
  var every = type === 'like' ? CONFIG.LIKE_EMAIL_EVERY : CONFIG.VIEW_EMAIL_EVERY;
  every = parseInt(every, 10);
  if (!every || every < 1) return;
  var counts = getCounts_();
  var total = (type === 'like' ? counts.likes : counts.views)[id] || 0;
  if (total < every) return;
  var stateKey = type === 'like' ? 'likes' : 'views';
  var state = getNotified_();
  if (!state[id]) state[id] = { views: 0, likes: 0 };
  var last = parseInt(state[id][stateKey], 10) || 0;
  // השוואה לפי "קבוצות סף" — כך שגם קפיצה גדולה בבת אחת לא מדלגת על סף
  var newBucket = Math.floor(total / every);
  var lastBucket = Math.floor(last / every);
  if (newBucket > lastBucket) {
    state[id][stateKey] = total;
    saveNotified_(state);
    sendThresholdEmail_(type, id, total);
  }
}

// קריאת מצב ההתראות הנוכחי מגיליון "התראות"
function getNotified_() {
  var state = {};
  var sheet = getSpreadsheet_().getSheetByName(CONFIG.NOTIFICATIONS_SHEET);
  if (!sheet) return state;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    if (!id) continue;
    state[id] = {
      views: parseInt(values[i][1], 10) || 0,
      likes: parseInt(values[i][2], 10) || 0
    };
  }
  return state;
}

// שמירת מצב ההתראות בגיליון "התראות"
function saveNotified_(state) {
  var sheet = getSpreadsheet_().getSheetByName(CONFIG.NOTIFICATIONS_SHEET);
  if (!sheet) return;
  var rows = [['item', 'views_notified', 'likes_notified']];
  for (var id in state) {
    rows.push([id, state[id].views, state[id].likes]);
  }
  sheet.clearContents();
  if (rows.length) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// שליחת מייל על חציית סף (לייקים / צפיות)
function sendThresholdEmail_(type, id, total) {
  var to = getEmailRecipient_();
  if (!to) return;
  var isLike = type === 'like';
  var label = isLike ? 'לייקים' : 'צפיות';
  var icon = isLike ? '❤️' : '👁️';
  var subject = icon + ' ' + id + ' — ' + total + ' ' + label;
  var text = id + ' הגיע ל-' + total + ' ' + label + '!';
  var html =
    '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:560px;margin:0 auto;">' +
    '<h2 style="color:#1A3263;margin:0 0 6px;">' + icon + ' ' + esc_(id) + '</h2>' +
    '<p style="font-size:16px;margin:0;">הפריט הגיע ל-' +
    '<strong style="font-size:24px;color:#d9a308;">' + total + '</strong> ' + label + '!</p>' +
    '<p style="color:#888;font-size:13px;margin-top:16px;">נשלח אוטומטית מהסקריפט של "רביב דיגיטל".</p>' +
    '</div>';
  MailApp.sendEmail(to, subject, text, { htmlBody: html });
}

/* ============================================================
* סיכום חודשי
* ============================================================ */

var MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

// הגדרת טריגר: בכל חודש ב-1 בשעה 09:00 תישלח מייל סיכום של החודש הקודם
function setupMonthlySummaryTrigger() {
  removeMonthlySummaryTrigger();
  ScriptApp.newTrigger('sendMonthlySummary')
    .timeBased()
    .onMonthDay(1)
    .atHour(9)
    .create();
  return 'הטריגר הוגדר: בכל חודש ב-1 בשעה 09:00 תישלח מייל סיכום של החודש הקודם.';
}

// ביטול הטריגר החודשי
function removeMonthlySummaryTrigger() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'sendMonthlySummary';
  });
  for (var i = 0; i < existing.length; i++) {
    ScriptApp.deleteTrigger(existing[i]);
  }
  return 'הטריגר הוסר.';
}

// שליחת הסיכום החודשי. ברירת מחדל: החודש הקודם (monthOffset = -1).
// אפשר להריץ ידנית גם עם sendMonthlySummary(0) לסיכום החודש הנוכחי עד כה.
function sendMonthlySummary(monthOffset) {
  var offset = typeof monthOffset === 'number' ? monthOffset : -1;
  var now = new Date();
  var from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  var to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  var ss = getSpreadsheet_();
  var likesMonthly = countDistinctInRange_(ss.getSheetByName(CONFIG.LIKES_SHEET), from, to);
  var viewsMonthly = countRowsInRange_(ss.getSheetByName(CONFIG.VIEWS_SHEET), from, to);
  var likesTotal = countDistinct_(ss.getSheetByName(CONFIG.LIKES_SHEET));
  var viewsTotal = countRows_(ss.getSheetByName(CONFIG.VIEWS_SHEET));
  // איחוד כל הפריטים שהופיעו בכל אחת מהספירות
  var ids = {};
  [likesMonthly, viewsMonthly, likesTotal, viewsTotal].forEach(function (m) {
    for (var k in m) ids[k] = true;
  });
  var rows = [];
  var sumLikes = 0, sumViews = 0;
  for (var id in ids) {
    var l = likesMonthly[id] || 0;
    var v = viewsMonthly[id] || 0;
    rows.push({
      id: id,
      likes: l,
      views: v,
      likesTotal: likesTotal[id] || 0,
      viewsTotal: viewsTotal[id] || 0
    });
    sumLikes += l;
    sumViews += v;
  }
  // מיון לפי כמות הפעילות בחודש (לייקים + צפיות) — הכי פעיל קודם
  rows.sort(function (a, b) {
    return (b.likes + b.views) - (a.likes + a.views);
  });
  var monthLabel = MONTHS_HE[from.getMonth()] + ' ' + from.getFullYear();
  var subject = '📊 סיכום חודשי: ' + monthLabel + ' — לייקים וצפיות (רביב דיגיטל)';
  var text = 'סיכום ' + monthLabel +
    '\nלייקים: ' + sumLikes + ' | צפיות: ' + sumViews +
    '\n' + rows.map(function (r) {
      return r.id + ' — לייקים: ' + r.likes + ', צפיות: ' + r.views;
    }).join('\n');
  var html = buildSummaryHtml_(rows, monthLabel, sumLikes, sumViews);
  var toEmail = getEmailRecipient_();
  if (toEmail) {
    MailApp.sendEmail(toEmail, subject, text, { htmlBody: html });
  }
}

// בניית גוף המייל החודשי (HTML מעוצב, תואם Gmail)
function buildSummaryHtml_(rows, monthLabel, sumLikes, sumViews) {
  var trs = '';
  if (!rows.length) {
    trs = '<tr><td colspan="4" style="padding:16px;text-align:center;color:#999;">' +
      'אין פעילות בחודש זה 🤷‍♂️</td></tr>';
  } else {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var medal = i === 0 ? ' 🏆' : (i === 1 ? ' 🥈' : (i === 2 ? ' 🥉' : ''));
      var bg = i === 0 ? '#fff8e1' : (i % 2 === 1 ? '#fafafa' : '#ffffff');
      trs += '<tr style="background:' + bg + ';">' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eee;">' + esc_(r.id) + medal + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">' + r.likes + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">' + r.views + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;color:#888;">' +
        r.likesTotal + ' / ' + r.viewsTotal + '</td>' +
        '</tr>';
    }
  }
  return (
    '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;">' +
    '<h2 style="color:#1A3263;margin:0 0 2px;">📊 סיכום חודשי — לייקים וצפיות</h2>' +
    '<p style="color:#888;margin:0 0 16px;">' + esc_(monthLabel) + '</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px;">' +
    '<tr style="background:#f0f0f0;">' +
    '<th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd;">פריט</th>' +
    '<th style="padding:8px 10px;text-align:center;border-bottom:2px solid #ddd;">לייקים</th>' +
    '<th style="padding:8px 10px;text-align:center;border-bottom:2px solid #ddd;">צפיות</th>' +
    '<th style="padding:8px 10px;text-align:center;border-bottom:2px solid #ddd;">סה"כ (לייקים/צפיות)</th>' +
    '</tr>' +
    trs +
    '<tr style="background:#fdf6e3;">' +
    '<td style="padding:8px 10px;font-weight:bold;">סה"כ</td>' +
    '<td style="padding:8px 10px;text-align:center;font-weight:bold;">' + sumLikes + '</td>' +
    '<td style="padding:8px 10px;text-align:center;font-weight:bold;">' + sumViews + '</td>' +
    '<td style="padding:8px 10px;text-align:center;"></td>' +
    '</tr>' +
    '</table>' +
    '<p style="color:#888;font-size:13px;margin-top:16px;">' +
    'נשלח אוטומטית מהסקריפט של "רביב דיגיטל".</p>' +
    '</div>'
  );
}

// הימנעות מהזרקת HTML בשמות פריטים
function esc_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

