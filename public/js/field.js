// field.js
let currentStaff = null;
let currentSubstations = [];
let currentCase = null;

async function init() {
  const staffList = await apiGet('/api/cases/config/field-staff');
  const sel = document.getElementById('staffSelect');
  if (staffList.length === 0) {
    sel.innerHTML = '<option value="">No field staff configured yet — ask Admin to add you</option>';
  } else {
    sel.innerHTML = staffList.map(s => `<option value='${escapeHtml(JSON.stringify(s))}'>${escapeHtml(s.name)}</option>`).join('');
  }

  // Remember last selected staff on this device for convenience
  const saved = localStorage_safe_get('fieldStaffName');
  if (saved) {
    const match = staffList.find(s => s.name === saved);
    if (match) {
      currentStaff = match.name;
      currentSubstations = match.substations.split(',').map(s => s.trim());
      showCaseList();
    }
  }

  document.querySelectorAll('[data-ftab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-ftab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('unbilledList').style.display = tab.dataset.ftab === 'unbilled' ? 'block' : 'none';
      document.getElementById('defectiveList').style.display = tab.dataset.ftab === 'defective' ? 'block' : 'none';
    });
  });
}

// In-memory fallback since artifacts can't use localStorage, but this is a real
// standalone app (not a claude.ai artifact) so localStorage works fine here.
function localStorage_safe_get(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function localStorage_safe_set(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}

function selectStaff() {
  const sel = document.getElementById('staffSelect');
  if (!sel.value) return toast('No staff selected', 'error');
  const staff = JSON.parse(sel.value);
  currentStaff = staff.name;
  currentSubstations = staff.substations.split(',').map(s => s.trim());
  localStorage_safe_set('fieldStaffName', staff.name);
  showCaseList();
}

function backToNameSelect() {
  document.getElementById('pickNameView').style.display = 'block';
  document.getElementById('caseListView').style.display = 'none';
}

async function showCaseList() {
  document.getElementById('pickNameView').style.display = 'none';
  document.getElementById('caseListView').style.display = 'block';
  document.getElementById('atrFormView').style.display = 'none';
  document.getElementById('staffNameLabel').textContent = currentStaff;
  await loadUnbilledForStaff();
  await loadDefectiveForStaff();
}

async function loadUnbilledForStaff() {
  const el = document.getElementById('unbilledList');
  el.innerHTML = '<div class="loading-dot">Loading...</div>';
  let all = [];
  for (const sub of currentSubstations) {
    const rows = await apiGet(`/api/cases/unbilled/by-substation/${encodeURIComponent(sub)}`);
    all = all.concat(rows);
  }
  if (all.length === 0) { el.innerHTML = '<div class="empty-state">No unbilled cases for your substation(s) right now 🎉</div>'; return; }
  el.innerHTML = all.map(r => `
    <div class="case-card" onclick='openCase(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
      <div class="top-row">
        <div class="acct">${escapeHtml(r.acct_id)}</div>
        <span class="badge ${r.case_status === 'ATR_SUBMITTED' ? 'resolved' : 'pending'}">${r.case_status === 'ATR_SUBMITTED' ? 'ATR Submitted' : 'Pending'}</span>
      </div>
      <div class="name">${escapeHtml(r.name)}</div>
      <div class="meta">${escapeHtml(r.substation)} · ${escapeHtml(r.tariff_type)} · ${r.sanction_load ?? '?'}KW · ${r.months_unbilled ?? '?'} month(s) unbilled</div>
    </div>
  `).join('');
}

async function loadDefectiveForStaff() {
  const el = document.getElementById('defectiveList');
  el.innerHTML = '<div class="loading-dot">Loading...</div>';
  let all = await apiGet('/api/cases/defective');
  all = all.filter(r => currentSubstations.some(s => (r.substation || '').toUpperCase().includes(s.toUpperCase())));
  if (all.length === 0) { el.innerHTML = '<div class="empty-state">No defective bills for your substation(s) right now</div>'; return; }
  el.innerHTML = all.map(r => `
    <div class="case-card">
      <div class="top-row">
        <div class="acct">${escapeHtml(r.acct_id)}</div>
        <span class="badge ${r.resolved ? 'resolved' : 'defective'}">${r.resolved ? 'Resolved' : 'Pending'}</span>
      </div>
      <div class="name">${escapeHtml(r.name)}</div>
      <div class="meta">${escapeHtml(r.substation)} · Reasons: ${escapeHtml(r.defect_reasons)} · Clerk: ${escapeHtml(r.assigned_clerk)}</div>
    </div>
  `).join('');
}

function openCase(caseData) {
  currentCase = caseData;
  document.getElementById('caseListView').style.display = 'none';
  document.getElementById('atrFormView').style.display = 'block';
  document.getElementById('caseDetailCard').innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Consumer</div>
    <div style="font-family:var(--font-display);font-weight:600;font-size:16px;margin-bottom:10px;">${escapeHtml(caseData.name)}</div>
    <div class="meta" style="color:var(--text-muted);font-size:13px;line-height:1.8;">
      Account: <span class="mono">${escapeHtml(caseData.acct_id)}</span><br>
      Substation: ${escapeHtml(caseData.substation)}<br>
      Category / Load: ${escapeHtml(caseData.tariff_type)} · ${caseData.sanction_load ?? '?'}KW<br>
      Months Unbilled: ${caseData.months_unbilled ?? '?'}
    </div>
  `;
  toggleMeterFields();
}

function toggleMeterFields() {
  const val = document.getElementById('meterStatus').value;
  document.getElementById('workingFields').style.display = val === 'Working' ? 'block' : 'none';
  document.getElementById('notWorkingFields').style.display = val === 'Not Working' ? 'block' : 'none';
}

function backToList() {
  document.getElementById('atrFormView').style.display = 'none';
  document.getElementById('caseListView').style.display = 'block';
}

async function submitAtr() {
  if (!currentCase) return;
  const meterStatus = document.getElementById('meterStatus').value;
  const body = {
    submittedBy: currentStaff,
    meterStatus,
    notWorkingReason: meterStatus === 'Not Working' ? document.getElementById('notWorkingReason').value : '',
    readingKwh: meterStatus === 'Working' ? (document.getElementById('readingKwh').value || null) : null,
    readingKvah: meterStatus === 'Working' ? (document.getElementById('readingKvah').value || null) : null,
    readingMd: meterStatus === 'Working' ? (document.getElementById('readingMd').value || null) : null,
    siteStatus: document.getElementById('siteStatus').value,
    remarks: document.getElementById('remarks').value,
  };
  try {
    await apiPost(`/api/cases/atr/${currentCase.id}`, body);
    toast('ATR submitted successfully', 'success');
    backToList();
    loadUnbilledForStaff();
  } catch (e) {
    toast('Failed to submit ATR: ' + e.message, 'error');
  }
}

init();
