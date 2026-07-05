const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db');
const router = express.Router();

function latestDateForDivision(table, division) {
  const r = db.prepare(`SELECT MAX(report_date) as d FROM ${table} WHERE division = ?`).get(division);
  return r ? r.d : null;
}

function getUnbilledRows(division) {
  const divisions = division ? [division] : db.prepare(`SELECT DISTINCT division FROM unbilled_records`).all().map(r => r.division);
  let all = [];
  for (const div of divisions) {
    const latest = latestDateForDivision('unbilled_records', div);
    if (!latest) continue;
    all = all.concat(db.prepare(`SELECT * FROM unbilled_records WHERE division = ? AND report_date = ?`).all(div, latest));
  }
  return all;
}
function getDefectiveRows(division) {
  const divisions = division ? [division] : db.prepare(`SELECT DISTINCT division FROM billed_records`).all().map(r => r.division);
  let all = [];
  for (const div of divisions) {
    const latest = latestDateForDivision('billed_records', div);
    if (!latest) continue;
    all = all.concat(db.prepare(`SELECT * FROM billed_records WHERE division = ? AND report_date = ? AND is_defective = 1`).all(div, latest));
  }
  return all;
}

const UNBILLED_COLS = [
  { header: 'Acct ID', key: 'acct_id', width: 16 },
  { header: 'Consumer No', key: 'scno', width: 14 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Division', key: 'division', width: 12 },
  { header: 'Category', key: 'tariff_type', width: 10 },
  { header: 'Load (KW)', key: 'sanction_load', width: 10 },
  { header: 'Substation', key: 'substation', width: 20 },
  { header: 'Meter Type', key: 'meter_type', width: 10 },
  { header: 'Last Bill Date', key: 'last_bill_date', width: 14 },
  { header: 'Months Unbilled', key: 'months_unbilled', width: 14 },
  { header: 'Case Status', key: 'case_status', width: 14 },
];
const DEFECTIVE_COLS = [
  { header: 'Acct ID', key: 'acct_id', width: 16 },
  { header: 'Consumer No', key: 'scno', width: 14 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Division', key: 'division', width: 12 },
  { header: 'Category', key: 'tariff_type', width: 10 },
  { header: 'Load (KW)', key: 'sanction_load', width: 10 },
  { header: 'Substation', key: 'substation', width: 20 },
  { header: 'Defect Reasons', key: 'defect_reasons', width: 16 },
  { header: 'Assigned Clerk', key: 'assigned_clerk', width: 16 },
  { header: 'Resolved', key: 'resolved_label', width: 10 },
  { header: 'Resolved Date', key: 'resolved_date', width: 14 },
];

async function sendExcel(res, filename, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

function sendPdf(res, filename, title, columns, rows) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  doc.pipe(res);
  doc.fontSize(14).text(title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(8);

  const colWidth = (doc.page.width - 60) / columns.length;
  let y = doc.y;
  columns.forEach((c, i) => doc.text(c.header, 30 + i * colWidth, y, { width: colWidth }));
  y += 14;
  doc.moveTo(30, y).lineTo(doc.page.width - 30, y).stroke();
  y += 4;

  for (const row of rows) {
    if (y > doc.page.height - 40) { doc.addPage(); y = 40; }
    columns.forEach((c, i) => {
      const val = row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key]);
      doc.text(val, 30 + i * colWidth, y, { width: colWidth, ellipsis: true });
    });
    y += 13;
  }
  doc.end();
}

router.get('/unbilled.xlsx', async (req, res) => {
  const rows = getUnbilledRows(req.query.division);
  await sendExcel(res, 'unbilled_report.xlsx', UNBILLED_COLS, rows);
});
router.get('/unbilled.pdf', (req, res) => {
  const rows = getUnbilledRows(req.query.division);
  sendPdf(res, 'unbilled_report.pdf', 'Unbilled Cases Report', UNBILLED_COLS, rows);
});
router.get('/defective.xlsx', async (req, res) => {
  const rows = getDefectiveRows(req.query.division).map(r => ({ ...r, resolved_label: r.resolved ? 'Yes' : 'No' }));
  await sendExcel(res, 'defective_bills_report.xlsx', DEFECTIVE_COLS, rows);
});
router.get('/defective.pdf', (req, res) => {
  const rows = getDefectiveRows(req.query.division).map(r => ({ ...r, resolved_label: r.resolved ? 'Yes' : 'No' }));
  sendPdf(res, 'defective_bills_report.pdf', 'Defective Bills Report', DEFECTIVE_COLS, rows);
});

// ATR export
const ATR_COLS = [
  { header: 'Submitted At', key: 'submitted_at', width: 16 },
  { header: 'Submitted By', key: 'submitted_by', width: 16 },
  { header: 'Acct ID', key: 'acct_id', width: 14 },
  { header: 'Substation', key: 'substation', width: 18 },
  { header: 'Meter Status', key: 'meter_status', width: 12 },
  { header: 'Not Working Reason', key: 'not_working_reason', width: 16 },
  { header: 'Reading kWh', key: 'reading_kwh', width: 10 },
  { header: 'Reading kVAh', key: 'reading_kvah', width: 10 },
  { header: 'Reading MD', key: 'reading_md', width: 10 },
  { header: 'Site Status', key: 'site_status', width: 14 },
  { header: 'Remarks', key: 'remarks', width: 24 },
];
function getAtrRows() {
  return db.prepare(`
    SELECT a.*, u.acct_id as acct_id, u.substation as substation
    FROM atr_reports a JOIN unbilled_records u ON a.unbilled_record_id = u.id
    ORDER BY a.submitted_at DESC
  `).all();
}
router.get('/atr.xlsx', async (req, res) => {
  await sendExcel(res, 'atr_report.xlsx', ATR_COLS, getAtrRows());
});
router.get('/atr.pdf', (req, res) => {
  sendPdf(res, 'atr_report.pdf', 'ATR Report', ATR_COLS, getAtrRows());
});

module.exports = router;
