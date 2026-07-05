// db.js — Database setup using Node's built-in SQLite (node:sqlite)
// No native compilation needed — works out of the box on any Node 22+ host.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'billing.db'));

db.exec(`
PRAGMA journal_mode = WAL;

-- Every uploaded file creates one batch record (for history/audit)
CREATE TABLE IF NOT EXISTS upload_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,       -- 'BILLED' or 'UNBILLED'
  division TEXT NOT NULL,          -- DIV233511 / DIV233512
  report_date TEXT NOT NULL,       -- date embedded in filename, YYYY-MM-DD
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Billed records, one row per bill, per day, per division (historical, never overwritten)
CREATE TABLE IF NOT EXISTS billed_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  division TEXT NOT NULL,
  acct_id TEXT,
  scno TEXT,
  name TEXT,
  tariff_type TEXT,
  sanction_load REAL,
  substation TEXT,
  meter_serial TEXT,
  meter_type TEXT,                 -- Smart / Non-Smart (derived)
  meter_read_remark TEXT,
  bill_basis TEXT,
  bill_inf_flg TEXT,
  agent_id TEXT,
  billed_units REAL,
  amount_payable REAL,
  bill_date TEXT,
  is_defective INTEGER,            -- 0/1 derived
  defect_reasons TEXT,             -- comma list e.g. "ADF,CEIL"
  assigned_clerk TEXT,             -- derived via rule engine
  resolved INTEGER DEFAULT 0,      -- set to 1 once a later batch shows BILL_BASIS = BR for this acct
  resolved_date TEXT,
  FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_billed_acct ON billed_records(acct_id);
CREATE INDEX IF NOT EXISTS idx_billed_date_div ON billed_records(report_date, division);
CREATE INDEX IF NOT EXISTS idx_billed_defective ON billed_records(is_defective, resolved);

-- Unbilled records, one row per unbilled connection, per day, per division
CREATE TABLE IF NOT EXISTS unbilled_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  division TEXT NOT NULL,
  acct_id TEXT,
  scno TEXT,
  name TEXT,
  mobile_no TEXT,
  tariff_type TEXT,
  sanction_load REAL,
  substation TEXT,
  meter_serial TEXT,
  meter_type TEXT,
  meter_status TEXT,
  last_bill_date TEXT,
  months_unbilled INTEGER,          -- derived aging
  case_status TEXT DEFAULT 'PENDING', -- PENDING / ATR_SUBMITTED
  FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_unbilled_acct ON unbilled_records(acct_id);
CREATE INDEX IF NOT EXISTS idx_unbilled_date_div ON unbilled_records(report_date, division);
CREATE INDEX IF NOT EXISTS idx_unbilled_substation ON unbilled_records(substation);

-- ATRs submitted by field staff against an unbilled_records case
CREATE TABLE IF NOT EXISTS atr_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unbilled_record_id INTEGER NOT NULL,
  submitted_by TEXT NOT NULL,
  meter_status TEXT,               -- Working / Not Working
  not_working_reason TEXT,         -- Meter Defective / Reading Back / Meter Jump / No Display / Other
  reading_kwh REAL,
  reading_kvah REAL,
  reading_md REAL,
  site_status TEXT,                -- TDC / PDC / Not Traceable / No Meter No Line / Duplicate Connection / Other
  remarks TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (unbilled_record_id) REFERENCES unbilled_records(id)
);

-- Config: field staff master (name + assigned substations, comma separated)
CREATE TABLE IF NOT EXISTS field_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  substations TEXT NOT NULL DEFAULT ''  -- comma-separated substation names
);

-- Config: billing clerk rules
CREATE TABLE IF NOT EXISTS billing_clerks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL,        -- lower number = evaluated first
  categories TEXT DEFAULT '',       -- comma list, empty = ALL
  min_load REAL,                    -- null = no lower bound
  max_load REAL,                    -- null = no upper bound
  substation_group TEXT DEFAULT ''  -- 'GROUP1' / 'GROUP2' / '' (ALL)
);

-- Config: substation groups
CREATE TABLE IF NOT EXISTS substation_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  substation TEXT NOT NULL UNIQUE,
  grp TEXT NOT NULL   -- 'GROUP1' or 'GROUP2'
);
`);

module.exports = db;
