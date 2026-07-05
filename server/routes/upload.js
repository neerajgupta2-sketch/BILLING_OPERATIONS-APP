const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const db = require('../db');
const { meterType, checkDefective, monthsUnbilled, assignClerk } = require('../lib/classify');

const router = express.Router();
const upload = multer({ dest: require('os').tmpdir() });

// Filenames look like: BILLED_DVVNL_DIV233511_30062026.csv / UNBILLED_DVVNL_DIV233512_30062026.csv
function parseFilenameMeta(filename) {
  const m = filename.match(/^(BILLED|UNBILLED)_[A-Z]+_(DIV\d+)_(\d{2})(\d{2})(\d{4})/i);
  if (!m) return null;
  const [, type, division, dd, mm, yyyy] = m;
  return {
    reportType: type.toUpperCase(),
    division,
    reportDate: `${yyyy}-${mm}-${dd}`, // YYYY-MM-DD
  };
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : n;
}
function str(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

router.post('/upload', upload.array('files', 4), (req, res) => {
  const results = [];
  try {
    for (const file of req.files) {
      const meta = parseFilenameMeta(file.originalname);
      if (!meta) {
        results.push({ filename: file.originalname, status: 'SKIPPED', reason: 'Filename pattern not recognized' });
        continue;
      }
      const raw = fs.readFileSync(file.path, 'utf8');
      const records = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, trim: true });

      // If this exact report (type+division+date) was already uploaded, replace it instead of duplicating
      const existingBatches = db.prepare(`
        SELECT id FROM upload_batches WHERE report_type = ? AND division = ? AND report_date = ?
      `).all(meta.reportType, meta.division, meta.reportDate);
      for (const b of existingBatches) {
        if (meta.reportType === 'BILLED') db.prepare('DELETE FROM billed_records WHERE batch_id = ?').run(b.id);
        else db.prepare('DELETE FROM unbilled_records WHERE batch_id = ?').run(b.id);
        db.prepare('DELETE FROM upload_batches WHERE id = ?').run(b.id);
      }

      const batchStmt = db.prepare(`
        INSERT INTO upload_batches (report_type, division, report_date, filename, row_count)
        VALUES (?, ?, ?, ?, ?)
      `);
      const batchInfo = batchStmt.run(meta.reportType, meta.division, meta.reportDate, file.originalname, records.length);
      const batchId = batchInfo.lastInsertRowid;

      if (meta.reportType === 'BILLED') {
        insertBilled(batchId, meta, records);
      } else {
        insertUnbilled(batchId, meta, records);
      }

      results.push({ filename: file.originalname, status: 'OK', reportType: meta.reportType, division: meta.division, reportDate: meta.reportDate, rows: records.length });
      fs.unlinkSync(file.path);
    }

    // After all files in this upload are in, re-check resolution status for defective bills
    // (a bill is "resolved" once a later-dated batch shows BILL_BASIS = BR for the same ACCT_ID)
    detectResolutions();

    res.json({ ok: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message, results });
  }
});

function insertBilled(batchId, meta, records) {
  db.exec('BEGIN');
  try {
    insertBilledInner(batchId, meta, records);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function insertBilledInner(batchId, meta, records) {
  const stmt = db.prepare(`
    INSERT INTO billed_records (
      batch_id, report_date, division, acct_id, scno, name, tariff_type, sanction_load,
      substation, meter_serial, meter_type, meter_read_remark, bill_basis, bill_inf_flg,
      agent_id, billed_units, amount_payable, bill_date, is_defective, defect_reasons, assigned_clerk
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (const r of records) {
    const meterSerial = str(r.METER_SERIAL_NBR);
    const mt = meterType(meterSerial);
    const rowForRules = {
      meter_read_remark: r.METER_READ_REMARK,
      bill_basis: r.BILL_BASIS,
      bill_inf_flg: r.BILL_INF_FLG,
      tariff_type: r.TARIFF_TYPE,
      sanction_load: num(r.SANCTION_LOAD),
      substation: r.SUBSTATION,
    };
    const { isDefective, reasons } = checkDefective(rowForRules);
    const clerk = isDefective ? assignClerk(rowForRules) : null;

    stmt.run(
      batchId, meta.reportDate, meta.division,
      str(r.ACCT_ID), str(r.SCNO), str(r.NAME), str(r.TARIFF_TYPE), num(r.SANCTION_LOAD),
      str(r.SUBSTATION), meterSerial, mt, str(r.METER_READ_REMARK), str(r.BILL_BASIS), str(r.BILL_INF_FLG),
      str(r.AGENT_ID), num(r.BILLED_UNITS), num(r.AMOUNT_PAYABLE), str(r.BILL_DATE),
      isDefective ? 1 : 0, reasons.join(','), clerk
    );
  }
}

function insertUnbilled(batchId, meta, records) {
  db.exec('BEGIN');
  try {
    insertUnbilledInner(batchId, meta, records);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function insertUnbilledInner(batchId, meta, records) {
  const stmt = db.prepare(`
    INSERT INTO unbilled_records (
      batch_id, report_date, division, acct_id, scno, name, mobile_no, tariff_type, sanction_load,
      substation, meter_serial, meter_type, meter_status, last_bill_date, months_unbilled
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (const r of records) {
    const meterSerial = str(r.MTR_SRL_NO);
    const mt = meterType(meterSerial);
    const aging = monthsUnbilled(r.LAST_BILL_DATE, meta.reportDate);

    stmt.run(
      batchId, meta.reportDate, meta.division, str(r.ACCT_ID), str(r.SCNO), str(r.NAME), str(r.MOBILE_NO),
      str(r.TARIFF_TYPE), num(r.SANCTION_LOAD), str(r.SUBSTATION), meterSerial, mt,
      str(r.METER_STATUS), str(r.LAST_BILL_DATE), aging
    );
  }
}

// A defective bill is "resolved" once ANY later-dated billed batch for the same ACCT_ID has BILL_BASIS = BR
function detectResolutions() {
  const stmt = db.prepare(`
    UPDATE billed_records
    SET resolved = 1, resolved_date = (
      SELECT MIN(b2.report_date) FROM billed_records b2
      WHERE b2.acct_id = billed_records.acct_id
        AND b2.bill_basis = 'BR'
        AND b2.report_date > billed_records.report_date
    )
    WHERE is_defective = 1 AND resolved = 0 AND EXISTS (
      SELECT 1 FROM billed_records b2
      WHERE b2.acct_id = billed_records.acct_id
        AND b2.bill_basis = 'BR'
        AND b2.report_date > billed_records.report_date
    )
  `);
  stmt.run();
}

module.exports = router;
