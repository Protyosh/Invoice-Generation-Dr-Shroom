// ═══════════════════════════════════════════════════════════
//  DR. SHROOM — B2B INVOICE APP BACKEND
//  STANDALONE Apps Script project — completely separate from
//  your customer order-taking script. This has its own doGet,
//  doPost, and writes to its own tabs in the spreadsheet below.
// ═══════════════════════════════════════════════════════════

// ── Your spreadsheet ID — same sheet as your orders, different tabs ──
const SHEET_ID = '1tD-ZvhS2R1VRE-hQIIb-yOUfzY9bbBvLog_YH2x7n6o';

// ── Sheet tab names used by the invoice app ──
const INV_SHEET            = 'B2B_Invoices';
const PRODUCTS_SHEET       = 'Products';
const RECIPIENTS_SHEET     = 'Recipients';
const BUSINESS_INFO_SHEET  = 'BusinessInfo';

// ── Column layouts (1-based) ──
const INV_COLS = {
  invoiceNo:   1,
  date:        2,
  finYear:     3,
  recName:     4,
  recAddress:  5,
  recPhone:    6,
  items:       7,   // JSON summary string
  total:       8,
  createdBy:   9,   // device/user label, optional
  paymentTermsDays: 10,  // 0 = Immediate Payment, otherwise Net N days
};
const INV_TOTAL_COLS = 10;

const PRODUCT_COLS = {
  code:    1,
  name:    2,
  price:   3,
  stock:   4,
  active:  5,   // TRUE/FALSE — lets you hide a product without deleting it
  image:   6,   // small base64 data URL thumbnail (in-app only, never printed on invoice)
};
const PRODUCT_TOTAL_COLS = 6;

const RECIPIENT_COLS = {
  name:    1,
  address: 2,
  phone:   3,
};
const RECIPIENT_TOTAL_COLS = 3;

const BUSINESS_INFO_COLS = {
  key:   1,
  value: 2,
};

// ═══════════════════════════════════════════════════════════
//  ENTRY POINTS — doGet / doPost for THIS script only
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  const action = e.parameter.action;
  try {
    switch (action) {
      case 'getProducts':     return buildResponse(getProducts());
      case 'getRecipients':   return buildResponse(getRecipients());
      case 'getBusinessInfo': return buildResponse(getBusinessInfo());
      case 'getInvoices':     return buildResponse(getInvoiceHistory());
      case 'getInvoice':      return buildResponse(getInvoiceByNumber(e.parameter.invoiceNo || ''));
      default:                return buildResponse({ success: false, error: 'Unknown or missing action: ' + action });
    }
  } catch (err) {
    return buildResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (err) { return buildResponse({ success: false, error: 'Busy, retry' }); }

  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'createInvoice':    return buildResponse(createInvoice(data));
      case 'saveProduct':      return buildResponse(saveProduct(data));
      case 'deleteProduct':    return buildResponse(deleteProduct(data));
      case 'saveRecipient':    return buildResponse(saveRecipient(data));
      case 'deleteRecipient':  return buildResponse(deleteRecipient(data));
      case 'saveBusinessInfo': return buildResponse(saveBusinessInfo(data));
      case 'adjustStock':      return buildResponse(adjustStock(data));
      default:                 return buildResponse({ success: false, error: 'Unknown or missing action: ' + data.action });
    }
  } catch (err) {
    Logger.log(err.toString());
    return buildResponse({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function buildResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
//  SHEET HELPERS — get-or-create each tab with headers
// ═══════════════════════════════════════════════════════════

function getOrCreateSheet_(name, headers, headerBg, headerFg) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    const hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setBackground(headerBg || '#1a1208')
      .setFontColor(headerFg || '#c8860a')
      .setFontWeight('bold').setFontSize(11)
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getInvoiceSheet_() {
  return getOrCreateSheet_(INV_SHEET,
    ['Invoice No', 'Date', 'Financial Year', 'Recipient Name', 'Recipient Address', 'Recipient Phone', 'Items (JSON)', 'Total', 'Created By', 'Payment Terms (Days)']);
}

function getProductsSheet_() {
  const sheet = getOrCreateSheet_(PRODUCTS_SHEET, ['Code', 'Name', 'Price', 'Stock', 'Active', 'Image']);
  // Seed with the three known flavours if the sheet is brand new (only header row present)
  if (sheet.getLastRow() === 1) {
    sheet.getRange(2, 1, 3, 6).setValues([
      ['PP', 'Peri Peri Flavour',     170, 0, true, ''],
      ['MM', 'Magic Masala Flavour',  170, 0, true, ''],
      ['CO', 'Cream & Onion',         170, 0, true, ''],
    ]);
  }
  return sheet;
}

function getRecipientsSheet_() {
  return getOrCreateSheet_(RECIPIENTS_SHEET, ['Name', 'Address', 'Phone']);
}

function getBusinessInfoSheet_() {
  const sheet = getOrCreateSheet_(BUSINESS_INFO_SHEET, ['Key', 'Value']);
  if (sheet.getLastRow() === 1) {
    sheet.getRange(2, 1, 5, 2).setValues([
      ['businessName', 'Dr. Shroom Snacks'],
      ['address',       'Dhariathal, Ramnagar, Bishramganj, Tripura 799103'],
      ['fssai',         '20251102107896617'],
      ['phone',         '7005342088'],
      ['email',         ''],
    ]);
  }
  return sheet;
}

// ═══════════════════════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════════════════════

function getProducts() {
  const sheet = getProductsSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);
  const products = rows
    .filter(r => r[PRODUCT_COLS.code - 1] !== '')
    .map((r, i) => ({
      rowIndex: i + 2, // 1-based sheet row, for editing later
      code:   r[PRODUCT_COLS.code   - 1],
      name:   r[PRODUCT_COLS.name   - 1],
      price:  r[PRODUCT_COLS.price  - 1],
      stock:  r[PRODUCT_COLS.stock  - 1],
      active: r[PRODUCT_COLS.active - 1] !== false,
      image:  r[PRODUCT_COLS.image  - 1] || '',
    }));
  return { success: true, products };
}

function saveProduct(data) {
  const sheet = getProductsSheet_();
  const p = data.product || {};
  if (!p.code || !p.name) return { success: false, error: 'Product code and name required' };

  // Google Sheets cells cap at 50,000 characters. Guard against an
  // oversized thumbnail slipping through (the app compresses images
  // client-side, but this protects the sheet either way).
  const image = p.image || '';
  if (image.length > 45000) {
    return { success: false, error: 'Image too large — please use a smaller photo' };
  }

  const values = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][PRODUCT_COLS.code - 1]).toUpperCase() === String(p.code).toUpperCase()) {
      targetRow = i + 1; // 1-based
      break;
    }
  }

  const rowValues = [p.code, p.name, Number(p.price) || 0, Number(p.stock) || 0, p.active !== false, image];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, PRODUCT_TOTAL_COLS).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return { success: true };
}

function deleteProduct(data) {
  const sheet = getProductsSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][PRODUCT_COLS.code - 1]).toUpperCase() === String(data.code).toUpperCase()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Product not found' };
}

function adjustStock(data) {
  // data.adjustments = [{ code: 'PP', delta: -2 }, ...]
  const sheet = getProductsSheet_();
  const values = sheet.getDataRange().getValues();
  const adjustments = data.adjustments || [];

  adjustments.forEach(adj => {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][PRODUCT_COLS.code - 1]).toUpperCase() === String(adj.code).toUpperCase()) {
        const cell = sheet.getRange(i + 1, PRODUCT_COLS.stock);
        const current = Number(cell.getValue()) || 0;
        cell.setValue(current + Number(adj.delta));
        break;
      }
    }
  });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
//  RECIPIENTS
// ═══════════════════════════════════════════════════════════

function getRecipients() {
  const sheet = getRecipientsSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);
  const recipients = rows
    .filter(r => r[RECIPIENT_COLS.name - 1] !== '')
    .map((r, i) => ({
      rowIndex: i + 2,
      name:    r[RECIPIENT_COLS.name    - 1],
      address: r[RECIPIENT_COLS.address - 1],
      phone:   r[RECIPIENT_COLS.phone   - 1],
    }));
  return { success: true, recipients };
}

function saveRecipient(data) {
  const sheet = getRecipientsSheet_();
  const r = data.recipient || {};
  if (!r.name) return { success: false, error: 'Recipient name required' };

  const values = sheet.getDataRange().getValues();
  let targetRow = -1;
  // Match by name+phone to avoid duplicate saves of the same recipient
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][RECIPIENT_COLS.name - 1]).toLowerCase() === String(r.name).toLowerCase()
        && String(values[i][RECIPIENT_COLS.phone - 1]) === String(r.phone || '')) {
      targetRow = i + 1;
      break;
    }
  }

  const rowValues = [r.name, r.address || '', r.phone || ''];
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, RECIPIENT_TOTAL_COLS).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return { success: true };
}

function deleteRecipient(data) {
  const sheet = getRecipientsSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][RECIPIENT_COLS.name - 1]).toLowerCase() === String(data.name).toLowerCase()
        && String(values[i][RECIPIENT_COLS.phone - 1]) === String(data.phone || '')) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Recipient not found' };
}

// ═══════════════════════════════════════════════════════════
//  BUSINESS INFO
// ═══════════════════════════════════════════════════════════

function getBusinessInfo() {
  const sheet = getBusinessInfoSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);
  const info = {};
  rows.forEach(r => {
    if (r[BUSINESS_INFO_COLS.key - 1]) {
      info[r[BUSINESS_INFO_COLS.key - 1]] = r[BUSINESS_INFO_COLS.value - 1];
    }
  });
  return { success: true, info };
}

function saveBusinessInfo(data) {
  const sheet = getBusinessInfoSheet_();
  const info = data.info || {};
  const values = sheet.getDataRange().getValues();

  Object.keys(info).forEach(key => {
    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][BUSINESS_INFO_COLS.key - 1] === key) {
        sheet.getRange(i + 1, BUSINESS_INFO_COLS.value).setValue(info[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, info[key]]);
      values.push([key, info[key]]); // keep in-memory copy in sync for subsequent keys this call
    }
  });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
//  INVOICE NUMBERING — INV/26-27/DS01 style, resets per FY
// ═══════════════════════════════════════════════════════════

// Indian financial year: Apr 1 – Mar 31.
// e.g. a date in Apr 2026 – Mar 2027 => "26-27"
function getFinancialYear_(date) {
  const d = date || new Date();
  const month = d.getMonth(); // 0 = Jan
  const year = d.getFullYear();
  const startYear = month >= 3 ? year : year - 1; // April(3)+ => FY starts this year
  const endYear = startYear + 1;
  const fmt = y => String(y).slice(-2);
  return fmt(startYear) + '-' + fmt(endYear);
}

function getNextInvoiceNumber_(finYear) {
  const props = PropertiesService.getScriptProperties();
  const key = 'invCounter_' + finYear;
  const current = parseInt(props.getProperty(key) || '0', 10);
  const next = current + 1;
  props.setProperty(key, String(next));
  const padded = next < 10 ? '0' + next : String(next);
  return { number: 'INV/' + finYear + '/DS' + padded, seq: next };
}

// ═══════════════════════════════════════════════════════════
//  CREATE INVOICE
// ═══════════════════════════════════════════════════════════

function createInvoice(data) {
  if (!data.recipient || !data.recipient.name) {
    return { success: false, error: 'Recipient name required' };
  }
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    return { success: false, error: 'At least one item required' };
  }

  const now = new Date();
  const finYear = getFinancialYear_(now);
  const { number: invoiceNo } = getNextInvoiceNumber_(finYear);

  const sheet = getInvoiceSheet_();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd/MM/yyyy');

  const total = data.items.reduce((sum, i) => sum + (Number(i.qty) * Number(i.price)), 0);

  sheet.appendRow([
    invoiceNo,
    dateStr,
    finYear,
    data.recipient.name,
    data.recipient.address || '',
    data.recipient.phone || '',
    JSON.stringify(data.items),
    total,
    data.createdBy || '',
    Number(data.paymentTermsDays) || 0,
  ]);

  // Style the new row + invoice number cell
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, INV_COLS.invoiceNo)
    .setFontWeight('bold').setFontColor('#1a1208').setBackground('#fff8ee');

  // Decrement stock for each item that matches a known product code
  const adjustments = data.items
    .filter(i => i.code)
    .map(i => ({ code: i.code, delta: -Number(i.qty) }));
  if (adjustments.length > 0) adjustStock({ adjustments });

  // Save recipient for reuse (if not already saved)
  saveRecipient({ recipient: data.recipient });

  return { success: true, invoiceNo, date: dateStr, finYear, total };
}

// ═══════════════════════════════════════════════════════════
//  INVOICE HISTORY
// ═══════════════════════════════════════════════════════════

function getInvoiceHistory() {
  const sheet = getInvoiceSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);
  const invoices = rows
    .filter(r => r[INV_COLS.invoiceNo - 1] !== '')
    .map(r => ({
      invoiceNo: r[INV_COLS.invoiceNo  - 1],
      date:      r[INV_COLS.date       - 1],
      recName:   r[INV_COLS.recName    - 1],
      total:     r[INV_COLS.total      - 1],
    }))
    .reverse(); // newest first
  return { success: true, invoices };
}

function getInvoiceByNumber(invoiceNo) {
  if (!invoiceNo) return { success: false, error: 'invoiceNo required' };
  const sheet = getInvoiceSheet_();
  const rows = sheet.getDataRange().getValues().slice(1);
  const row = rows.find(r => String(r[INV_COLS.invoiceNo - 1]).toUpperCase() === invoiceNo.toUpperCase());
  if (!row) return { success: false, error: 'Invoice not found' };

  let items = [];
  try { items = JSON.parse(row[INV_COLS.items - 1]); } catch (e) { items = []; }

  return {
    success: true,
    invoice: {
      invoiceNo: row[INV_COLS.invoiceNo  - 1],
      date:      row[INV_COLS.date       - 1],
      finYear:   row[INV_COLS.finYear    - 1],
      recipient: {
        name:    row[INV_COLS.recName    - 1],
        address: row[INV_COLS.recAddress - 1],
        phone:   row[INV_COLS.recPhone   - 1],
      },
      items,
      total: row[INV_COLS.total - 1],
      paymentTermsDays: Number(row[INV_COLS.paymentTermsDays - 1]) || 0,
    }
  };
}
