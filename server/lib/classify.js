// classify.js — All the business rules from the architecture doc, in one place.
// If a rule ever needs to change, this is the only file that should need editing.

const db = require('../db');

// ---- 3.1 Meter type ----
function meterType(serial) {
  if (!serial) return 'Non-Smart';
  return String(serial).trim().toUpperCase().startsWith('GE') ? 'Smart' : 'Non-Smart';
}

// ---- 3.2 Defective bill rule ----
// Defective if METER_READ_REMARK in (ADF,RDF,IDF) OR BILL_BASIS = CEIL OR BILL_INF_FLG = Y
function checkDefective(row) {
  const reasons = [];
  const remark = (row.meter_read_remark || '').trim().toUpperCase();
  if (['ADF', 'RDF', 'IDF'].includes(remark)) reasons.push(remark);
  if ((row.bill_basis || '').trim().toUpperCase() === 'CEIL') reasons.push('CEIL');
  if ((row.bill_inf_flg || '').trim().toUpperCase() === 'Y') reasons.push('INFLATED');
  return { isDefective: reasons.length > 0, reasons };
}

// ---- 3.4 Aging: months unbilled, based on LAST_BILL_DATE vs current report date ----
function monthsUnbilled(lastBillDateStr, reportDateStr) {
  if (!lastBillDateStr) return null;
  const last = parseFlexibleDate(lastBillDateStr);
  const ref = new Date(reportDateStr);
  if (!last || isNaN(ref)) return null;
  let months = (ref.getFullYear() - last.getFullYear()) * 12 + (ref.getMonth() - last.getMonth());
  if (months < 0) months = 0;
  return months;
}

// Handles dates like "12-MAY-26" (common in these DISCOM exports) plus ISO fallback
function parseFlexibleDate(str) {
  if (!str) return null;
  str = String(str).trim();
  const monthMap = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = monthMap[m[2].toUpperCase()];
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (mon === undefined) return null;
    return new Date(year, mon, day);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// ---- 3.6 Billing clerk assignment rule engine ----
// Loads clerk rules + substation groups from DB (admin-editable config) and evaluates in priority order.
let _cachedClerks = null;
let _cachedGroupMap = null;
function loadAssignmentConfig() {
  _cachedClerks = db.prepare('SELECT * FROM billing_clerks ORDER BY priority ASC').all();
  const groups = db.prepare('SELECT * FROM substation_groups').all();
  _cachedGroupMap = {};
  for (const g of groups) _cachedGroupMap[normalize(g.substation)] = g.grp;
}
function invalidateAssignmentCache() {
  _cachedClerks = null;
  _cachedGroupMap = null;
}

function assignClerk(row) {
  if (!_cachedClerks || !_cachedGroupMap) loadAssignmentConfig();
  const clerks = _cachedClerks;
  const groupMap = _cachedGroupMap;

  const category = (row.tariff_type || '').trim().toUpperCase();
  const load = row.sanction_load == null ? null : Number(row.sanction_load);
  const substationGroup = groupMap[normalize(row.substation)] || '';

  for (const clerk of clerks) {
    const cats = (clerk.categories || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const catOk = cats.length === 0 || cats.includes(category);
    if (!catOk) continue;

    const minOk = clerk.min_load == null || (load != null && load >= clerk.min_load);
    const maxOk = clerk.max_load == null || (load != null && load <= clerk.max_load);
    if (!minOk || !maxOk) continue;

    const grpOk = !clerk.substation_group || clerk.substation_group === substationGroup;
    if (!grpOk) continue;

    return clerk.name;
  }
  return 'Unassigned';
}

function normalize(s) {
  if (!s) return '';
  let x = String(s).trim().toUpperCase();
  x = x.replace(/_[A-Z0-9]+$/, ''); // strip trailing "_<code>" e.g. SHIPRI_20053 -> SHIPRI
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}

module.exports = { meterType, checkDefective, monthsUnbilled, assignClerk, parseFlexibleDate, normalize, invalidateAssignmentCache };
