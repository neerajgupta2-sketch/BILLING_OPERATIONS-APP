// seed.js — Loads the default billing clerk rules and substation groups
// exactly as specified. Run once: `node seed.js`
// Safe to re-run — it clears and re-inserts config tables only (never touches uploaded data).
const db = require('./db');

db.exec('DELETE FROM billing_clerks');
db.exec('DELETE FROM substation_groups');
db.exec('DELETE FROM field_staff');

const insertClerk = db.prepare(`
  INSERT INTO billing_clerks (name, priority, categories, min_load, max_load, substation_group)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Priority 1: Pawan Soli - Solar (<=9KW) or LMV10 (any load) -- evaluated first, overrides all
insertClerk.run('Pawan Soni', 1, 'SOLAR', null, 9, '');
insertClerk.run('Pawan Soni', 1, 'LMV10', null, null, '');

// Priority 2: Zamir Ahmed - Load >= 50KW, all categories/substations
insertClerk.run('Zamir Ahmed', 2, '', 50, null, '');

// Priority 3: Anil Pastor - Load 5-49KW, all categories/substations
insertClerk.run('Anil Pastor', 3, '', 5, 49, '');

// Priority 4: Shadab Mohd - Load 1-4KW, Group 1 substations
insertClerk.run('Shadab Mohd', 4, '', 1, 4, 'GROUP1');

// Priority 4: Gaurav Patel - Load 1-4KW, Group 2 substations
insertClerk.run('Gaurav Patel', 4, '', 1, 4, 'GROUP2');

const insertGroup = db.prepare(`INSERT INTO substation_groups (substation, grp) VALUES (?, ?)`);
// NOTE: names below match the ACTUAL spellings found in the real FTP data (which vary
// slightly from how they're commonly spoken/typed, e.g. "SHIPRI" not "SIPRI",
// "JAIL CHOWRAHA" not "JAIL CHAURAHA", "UNNAV GATE" not "UNNAO GATE"). Both the spoken
// and data-observed variants are included for safety. Fix/extend via Admin > Configuration
// if a substation is ever misrouted or missing.
const group1 = [
  'HANSARI', 'HASARI', '132 KV HASARI',
  'BIJOLI', 'BIJAULI',
  'GROWTH CENTER', 'GROWTHCENTRE',
  'SIPRI', 'SHIPRI',
  'PULIYA NO 9', 'PULIYA NO. 9',
  'SUTIMILL', 'SUTI MILL',
  'MUNNALAL POWER HOUSE', 'MUNNA LAL POWER HOUSE',
  'UNNAO GATE', 'UNNAV GATE',
];
const group2 = [
  'NANDANPURA', 'NANDANPUTRA',
  'NAGRA',
  'GALLA MANDI', 'GALLAMANDI',
  'NEW GALLA MANDI',
  'MEDICAL',
  'JAIL CHAURAHA', 'JAIL CHOWRAHA',
  'HYDEL', 'HYDEL COLONY',
  'RANI MAHAL', 'RANIMAHAL',
];
for (const s of group1) insertGroup.run(s, 'GROUP1');
for (const s of group2) insertGroup.run(s, 'GROUP2');

console.log('NOTE: "GURSARAI" substation appears in the real DIV233512 data but was not');
console.log('mentioned in your Group 1/Group 2 list. It will fall into "Unassigned" until');
console.log('you confirm which group (or field staff) it belongs to.');

console.log('Seed complete: 5 clerks configured, substation groups loaded.');
console.log('NOTE: Field staff (12 people) and their substation mappings are not seeded --');
console.log('add them via the Admin > Configuration screen once the app is running,');
console.log('since you know the actual name-to-substation assignments.');
