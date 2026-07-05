const express = require('express');
const db = require('../db');
const { normalize } = require('../lib/classify');
const router = express.Router();

function latestDateForDivision(division) {
  const r = db.prepare(`SELECT MAX(report_date) as d FROM unbilled_records WHERE division = ?`).get(division);
  return r ? r.d : null;
}
function latestDateForDivisionBilled(division) {
  const r = db.prepare(`SELECT MAX(report_date) as d FROM billed_records WHERE division = ?`).get(division);
  return r ? r.d : null;
}

// List unbilled cases for a given substation (field staff view), latest snapshot only
// Matching is normalized (ignores trailing "_<code>" and case) so admin-entered names
// don't need to exactly match the raw coded substation values in the uploaded data.
router.get('/unbilled/by-substation/:substation', (req, res) => {
  const targetNorm = normalize(req.params.substation);
  const divisions = db.prepare(`SELECT DISTINCT division FROM unbilled_records`).all().map(r => r.division);
  let all = [];
  for (const div of divisions) {
    const latest = latestDateForDivision(div);
    if (!latest) continue;
    const rows = db.prepare(`
      SELECT * FROM unbilled_records WHERE division = ? AND report_date = ?
    `).all(div, latest);
    all = all.concat(rows.filter(r => normalize(r.substation) === targetNorm));
  }
  all.sort((a, b) => (b.months_unbilled || 0) - (a.months_unbilled || 0));
  res.json(all);
});

// List all unbilled cases (admin/clerk view), latest snapshot, with filters
router.get('/unbilled', (req, res) => {
  const { division, substation, category, status } = req.query;
  const divisions = division ? [division] : db.prepare(`SELECT DISTINCT division FROM unbilled_records`).all().map(r => r.division);
  let all = [];
  for (const div of divisions) {
    const latest = latestDateForDivision(div);
    if (!latest) continue;
    let q = `SELECT * FROM unbilled_records WHERE division = ? AND report_date = ?`;
    const params = [div, latest];
    if (category) { q += ' AND UPPER(tariff_type) = UPPER(?)'; params.push(category); }
    if (status) { q += ' AND case_status = ?'; params.push(status); }
    q += ' ORDER BY months_unbilled DESC';
    let rows = db.prepare(q).all(...params);
    if (substation) { const t = normalize(substation); rows = rows.filter(r => normalize(r.substation) === t); }
    all = all.concat(rows);
  }
  res.json(all);
});

// Defective bills list (admin/clerk view), latest snapshot, with filters incl. clerk
router.get('/defective', (req, res) => {
  const { division, clerk, category, resolved } = req.query;
  const divisions = division ? [division] : db.prepare(`SELECT DISTINCT division FROM billed_records`).all().map(r => r.division);
  let all = [];
  for (const div of divisions) {
    const latest = latestDateForDivisionBilled(div);
    if (!latest) continue;
    let q = `SELECT * FROM billed_records WHERE division = ? AND report_date = ? AND is_defective = 1`;
    const params = [div, latest];
    if (clerk) { q += ' AND assigned_clerk = ?'; params.push(clerk); }
    if (category) { q += ' AND UPPER(tariff_type) = UPPER(?)'; params.push(category); }
    if (resolved !== undefined) { q += ' AND resolved = ?'; params.push(resolved === 'true' || resolved === '1' ? 1 : 0); }
    q += ' ORDER BY resolved ASC';
    all = all.concat(db.prepare(q).all(...params));
  }
  res.json(all);
});

// Submit ATR for an unbilled case
router.post('/atr/:unbilledRecordId', (req, res) => {
  const { unbilledRecordId } = req.params;
  const { submittedBy, meterStatus, notWorkingReason, readingKwh, readingKvah, readingMd, siteStatus, remarks } = req.body;

  const insert = db.prepare(`
    INSERT INTO atr_reports (unbilled_record_id, submitted_by, meter_status, not_working_reason, reading_kwh, reading_kvah, reading_md, site_status, remarks)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  insert.run(unbilledRecordId, submittedBy || '', meterStatus || '', notWorkingReason || '', readingKwh ?? null, readingKvah ?? null, readingMd ?? null, siteStatus || '', remarks || '');

  db.prepare(`UPDATE unbilled_records SET case_status = 'ATR_SUBMITTED' WHERE id = ?`).run(unbilledRecordId);
  res.json({ ok: true });
});

// Get ATR history for a case
router.get('/atr/:unbilledRecordId', (req, res) => {
  const rows = db.prepare(`SELECT * FROM atr_reports WHERE unbilled_record_id = ? ORDER BY submitted_at DESC`).all(req.params.unbilledRecordId);
  res.json(rows);
});

// ---- Config: field staff ----
router.get('/config/field-staff', (req, res) => {
  res.json(db.prepare(`SELECT * FROM field_staff ORDER BY name`).all());
});
router.post('/config/field-staff', (req, res) => {
  const { name, substations } = req.body;
  db.prepare(`INSERT INTO field_staff (name, substations) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET substations = excluded.substations`).run(name, substations);
  res.json({ ok: true });
});
router.delete('/config/field-staff/:id', (req, res) => {
  db.prepare(`DELETE FROM field_staff WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---- Config: billing clerks ----
router.get('/config/clerks', (req, res) => {
  res.json(db.prepare(`SELECT * FROM billing_clerks ORDER BY priority`).all());
});

// ---- Config: substation groups ----
router.get('/config/substation-groups', (req, res) => {
  res.json(db.prepare(`SELECT * FROM substation_groups ORDER BY grp, substation`).all());
});

// ---- List all distinct substations seen in data (helps admin build field-staff mapping) ----
router.get('/config/known-substations', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT substation FROM (
      SELECT substation FROM billed_records
      UNION
      SELECT substation FROM unbilled_records
    ) WHERE substation IS NOT NULL AND substation != '' ORDER BY substation
  `).all();
  res.json(rows.map(r => r.substation));
});

// Upload history (for admin visibility)
router.get('/uploads/history', (req, res) => {
  res.json(db.prepare(`SELECT * FROM upload_batches ORDER BY uploaded_at DESC LIMIT 100`).all());
});

module.exports = router;
