const express = require('express');
const db = require('../db');
const router = express.Router();

// Helper: get latest report_date available per division (so dashboard always shows "today's" picture)
function latestDates() {
  const rows = db.prepare(`
    SELECT division, MAX(report_date) as latest FROM (
      SELECT division, report_date FROM billed_records
      UNION
      SELECT division, report_date FROM unbilled_records
    ) GROUP BY division
  `).all();
  return rows; // [{division, latest}]
}

router.get('/meta/latest-dates', (req, res) => {
  res.json(latestDates());
});

router.get('/meta/divisions', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT division FROM billed_records
    UNION
    SELECT DISTINCT division FROM unbilled_records
  `).all();
  res.json(rows.map(r => r.division));
});

// date param: 'latest' (default, per-division latest) or explicit YYYY-MM-DD
function resolveDateFilter(date, division) {
  if (date && date !== 'latest') return { clause: 'report_date = ?', params: [date] };
  const dates = latestDates();
  if (division) {
    const d = dates.find(x => x.division === division);
    return { clause: 'report_date = ?', params: [d ? d.latest : '0000-00-00'] };
  }
  // no division specified: use each row's own division's latest date
  if (dates.length === 0) return { clause: '1=0', params: [] };
  const clauses = dates.map(() => '(division = ? AND report_date = ?)').join(' OR ');
  const params = [];
  for (const d of dates) { params.push(d.division, d.latest); }
  return { clause: `(${clauses})`, params };
}

router.get('/summary', (req, res) => {
  const { date, division } = req.query;
  const df = resolveDateFilter(date, division);
  const divClause = division ? ' AND division = ?' : '';
  const divParam = division ? [division] : [];

  const totalBilled = db.prepare(`SELECT COUNT(*) c FROM billed_records WHERE ${df.clause}${divClause}`).get(...df.params, ...divParam).c;
  const totalUnbilled = db.prepare(`SELECT COUNT(*) c FROM unbilled_records WHERE ${df.clause}${divClause}`).get(...df.params, ...divParam).c;
  const totalDefective = db.prepare(`SELECT COUNT(*) c FROM billed_records WHERE ${df.clause}${divClause} AND is_defective = 1`).get(...df.params, ...divParam).c;
  const totalResolved = db.prepare(`SELECT COUNT(*) c FROM billed_records WHERE ${df.clause}${divClause} AND is_defective = 1 AND resolved = 1`).get(...df.params, ...divParam).c;
  const totalAtrPending = db.prepare(`SELECT COUNT(*) c FROM unbilled_records WHERE ${df.clause}${divClause} AND case_status = 'PENDING'`).get(...df.params, ...divParam).c;
  const totalAtrSubmitted = db.prepare(`SELECT COUNT(*) c FROM unbilled_records WHERE ${df.clause}${divClause} AND case_status = 'ATR_SUBMITTED'`).get(...df.params, ...divParam).c;

  res.json({
    totalConnections: totalBilled + totalUnbilled,
    totalBilled,
    totalUnbilled,
    totalDefective,
    totalResolved,
    totalPendingDefective: totalDefective - totalResolved,
    totalAtrPending,
    totalAtrSubmitted,
  });
});

// Generic breakdown endpoint: dimension = category | load | substation | meterType
router.get('/breakdown/:table/:dimension', (req, res) => {
  const { table, dimension } = req.params;
  const { date, division } = req.query;
  const validTables = { billed: 'billed_records', unbilled: 'unbilled_records' };
  const dimCols = { category: 'tariff_type', substation: 'substation', meterType: 'meter_type' };
  if (!validTables[table]) return res.status(400).json({ error: 'invalid table' });

  const df = resolveDateFilter(date, division);
  const divClause = division ? ' AND division = ?' : '';
  const divParam = division ? [division] : [];

  if (dimension === 'load') {
    // load buckets matching the clerk-rule brackets, for consistency
    const rows = db.prepare(`SELECT sanction_load FROM ${validTables[table]} WHERE ${df.clause}${divClause}`).all(...df.params, ...divParam);
    const buckets = { '1-4KW': 0, '5-49KW': 0, '50KW+': 0, 'Unknown': 0 };
    for (const r of rows) {
      const l = r.sanction_load;
      if (l == null) buckets['Unknown']++;
      else if (l >= 50) buckets['50KW+']++;
      else if (l >= 5) buckets['5-49KW']++;
      else if (l >= 1) buckets['1-4KW']++;
      else buckets['Unknown']++;
    }
    return res.json(Object.entries(buckets).map(([label, count]) => ({ label, count })));
  }

  const col = dimCols[dimension];
  if (!col) return res.status(400).json({ error: 'invalid dimension' });
  const rows = db.prepare(`
    SELECT COALESCE(NULLIF(${col}, ''), 'Unknown') as label, COUNT(*) as count
    FROM ${validTables[table]} WHERE ${df.clause}${divClause}
    GROUP BY label ORDER BY count DESC
  `).all(...df.params, ...divParam);
  res.json(rows);
});

// Unbilled aging breakdown
router.get('/unbilled/aging', (req, res) => {
  const { date, division } = req.query;
  const df = resolveDateFilter(date, division);
  const divClause = division ? ' AND division = ?' : '';
  const divParam = division ? [division] : [];
  const rows = db.prepare(`
    SELECT COALESCE(months_unbilled, -1) as months, COUNT(*) as count
    FROM unbilled_records WHERE ${df.clause}${divClause}
    GROUP BY months ORDER BY months ASC
  `).all(...df.params, ...divParam);
  res.json(rows.map(r => ({ label: r.months < 0 ? 'Unknown' : `${r.months} month(s)`, count: r.count })));
});

// Defective bills correction progress by clerk
router.get('/defective/clerk-progress', (req, res) => {
  const { date, division } = req.query;
  const df = resolveDateFilter(date, division);
  const divClause = division ? ' AND division = ?' : '';
  const divParam = division ? [division] : [];
  const rows = db.prepare(`
    SELECT COALESCE(NULLIF(assigned_clerk, ''), 'Unassigned') as clerk,
      COUNT(*) as total,
      SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
    FROM billed_records
    WHERE ${df.clause}${divClause} AND is_defective = 1
    GROUP BY clerk ORDER BY total DESC
  `).all(...df.params, ...divParam);
  res.json(rows.map(r => ({ clerk: r.clerk, total: r.total, resolved: r.resolved, pending: r.total - r.resolved })));
});

module.exports = router;
