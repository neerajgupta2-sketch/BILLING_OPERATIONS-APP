// admin.js
tabSwitcher('.tab', '.panel');

const LOAD_LABEL_ORDER = ['1-4KW', '5-49KW', '50KW+', 'Unknown'];

async function populateDivisionFilters() {
  const divisions = await apiGet('/api/dashboard/meta/divisions');
  const selects = ['divFilter', 'unbilledDivFilter', 'defectiveDivFilter'];
  for (const id of selects) {
    const el = document.getElementById(id);
    for (const d of divisions) {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      el.appendChild(opt);
    }
  }
}

async function loadDashboard() {
  const division = document.getElementById('divFilter').value;
  const qs = division ? `?division=${encodeURIComponent(division)}&date=latest` : '?date=latest';

  const summary = await apiGet(`/api/dashboard/summary${qs}`);
  document.getElementById('summaryTiles').innerHTML = `
    <div class="tile"><div class="label">Total Connections</div><div class="value">${fmtNum(summary.totalConnections)}</div></div>
    <div class="tile success"><div class="label">Billed</div><div class="value">${fmtNum(summary.totalBilled)}</div></div>
    <div class="tile danger"><div class="label">Unbilled</div><div class="value">${fmtNum(summary.totalUnbilled)}</div></div>
    <div class="tile danger"><div class="label">Defective Bills</div><div class="value">${fmtNum(summary.totalDefective)}</div></div>
    <div class="tile success"><div class="label">Defective Resolved</div><div class="value">${fmtNum(summary.totalResolved)}</div></div>
    <div class="tile info"><div class="label">ATR Pending</div><div class="value">${fmtNum(summary.totalAtrPending)}</div></div>
  `;

  const [bMeter, uMeter, bCat, uCat, bLoad, uLoad, bSub, aging, clerkProg] = await Promise.all([
    apiGet(`/api/dashboard/breakdown/billed/meterType${qs}`),
    apiGet(`/api/dashboard/breakdown/unbilled/meterType${qs}`),
    apiGet(`/api/dashboard/breakdown/billed/category${qs}`),
    apiGet(`/api/dashboard/breakdown/unbilled/category${qs}`),
    apiGet(`/api/dashboard/breakdown/billed/load${qs}`),
    apiGet(`/api/dashboard/breakdown/unbilled/load${qs}`),
    apiGet(`/api/dashboard/breakdown/billed/substation${qs}`),
    apiGet(`/api/dashboard/unbilled/aging${qs}`),
    apiGet(`/api/dashboard/defective/clerk-progress${qs}`),
  ]);

  renderBars(document.getElementById('billedMeterType'), bMeter);
  renderBars(document.getElementById('unbilledMeterType'), uMeter);
  renderBars(document.getElementById('billedCategory'), bCat);
  renderBars(document.getElementById('unbilledCategory'), uCat);
  renderBars(document.getElementById('billedLoad'), sortByOrder(bLoad, LOAD_LABEL_ORDER));
  renderBars(document.getElementById('unbilledLoad'), sortByOrder(uLoad, LOAD_LABEL_ORDER));
  renderBars(document.getElementById('billedSubstation'), bSub.slice(0, 15));
  renderBars(document.getElementById('agingChart'), aging.slice(0, 12));

  const atrTotal = summary.totalAtrPending + summary.totalAtrSubmitted;
  renderBars(document.getElementById('atrProgress'), [
    { label: 'ATR Submitted', count: summary.totalAtrSubmitted },
    { label: 'Still Pending', count: summary.totalAtrPending },
  ]);

  document.getElementById('clerkProgressBody').innerHTML = clerkProg.map(c => `
    <tr>
      <td>${escapeHtml(c.clerk)}</td>
      <td>${fmtNum(c.total)}</td>
      <td>${fmtNum(c.resolved)}</td>
      <td>${fmtNum(c.pending)}</td>
      <td style="width:160px;">
        <div class="bar-track"><div class="bar-fill" style="width:${c.total ? (c.resolved / c.total * 100) : 0}%;background:var(--success)"></div></div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-state">No defective bills yet</td></tr>';
}

function sortByOrder(data, order) {
  const map = {};
  for (const d of data) map[d.label] = d.count;
  return order.map(label => ({ label, count: map[label] || 0 }));
}

// ---------------- Upload ----------------
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.borderColor = 'var(--border)';
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

async function handleFiles(files) {
  if (!files.length) return;
  const statusEl = document.getElementById('uploadStatus');
  statusEl.innerHTML = '<div class="loading-dot">Uploading and processing... this can take up to a minute for large files.</div>';
  const formData = new FormData();
  for (const f of files) formData.append('files', f);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.ok) {
      statusEl.innerHTML = data.results.map(r => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <strong>${escapeHtml(r.filename)}</strong> —
          ${r.status === 'OK' ? `<span style="color:var(--success)">${r.rows} rows processed (${r.reportType}, ${r.division}, ${r.reportDate})</span>` : `<span style="color:var(--danger)">${r.status}: ${r.reason || ''}</span>`}
        </div>
      `).join('');
      toast('Upload complete', 'success');
      loadUploadHistory();
      loadDashboard();
      populateDivisionFilters();
    } else {
      statusEl.innerHTML = `<div style="color:var(--danger)">Upload failed: ${escapeHtml(data.error)}</div>`;
    }
  } catch (e) {
    statusEl.innerHTML = `<div style="color:var(--danger)">Upload failed: ${escapeHtml(e.message)}</div>`;
  }
  fileInput.value = '';
}

async function loadUploadHistory() {
  const rows = await apiGet('/api/cases/uploads/history');
  document.getElementById('historyBody').innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.uploaded_at)}</td>
      <td>${escapeHtml(r.report_type)}</td>
      <td>${escapeHtml(r.division)}</td>
      <td>${escapeHtml(r.report_date)}</td>
      <td>${escapeHtml(r.filename)}</td>
      <td>${fmtNum(r.row_count)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="empty-state">No uploads yet</td></tr>';
}

// ---------------- Unbilled table ----------------
async function loadUnbilledTable() {
  const division = document.getElementById('unbilledDivFilter').value;
  const status = document.getElementById('unbilledStatusFilter').value;
  const params = new URLSearchParams();
  if (division) params.set('division', division);
  if (status) params.set('status', status);
  const rows = await apiGet(`/api/cases/unbilled?${params}`);
  document.getElementById('unbilledBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.acct_id)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.division)}</td>
      <td>${escapeHtml(r.tariff_type)}</td>
      <td>${r.sanction_load ?? ''}</td>
      <td>${escapeHtml(r.substation)}</td>
      <td><span class="badge ${r.meter_type === 'Smart' ? 'smart' : 'nonsmart'}">${r.meter_type}</span></td>
      <td>${r.months_unbilled ?? '—'}</td>
      <td><span class="badge ${r.case_status === 'ATR_SUBMITTED' ? 'resolved' : 'pending'}">${r.case_status === 'ATR_SUBMITTED' ? 'ATR Submitted' : 'Pending'}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="empty-state">No unbilled cases found</td></tr>';
}

// ---------------- Defective table ----------------
async function loadDefectiveTable() {
  const division = document.getElementById('defectiveDivFilter').value;
  const clerk = document.getElementById('defectiveClerkFilter').value;
  const resolved = document.getElementById('defectiveResolvedFilter').value;
  const params = new URLSearchParams();
  if (division) params.set('division', division);
  if (clerk) params.set('clerk', clerk);
  if (resolved) params.set('resolved', resolved);
  const rows = await apiGet(`/api/cases/defective?${params}`);
  document.getElementById('defectiveBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.acct_id)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.division)}</td>
      <td>${escapeHtml(r.tariff_type)}</td>
      <td>${r.sanction_load ?? ''}</td>
      <td>${escapeHtml(r.substation)}</td>
      <td>${escapeHtml(r.defect_reasons)}</td>
      <td>${escapeHtml(r.assigned_clerk)}</td>
      <td><span class="badge ${r.resolved ? 'resolved' : 'defective'}">${r.resolved ? 'Resolved' : 'Pending'}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="empty-state">No defective bills found</td></tr>';
}

async function populateClerkFilter() {
  const clerks = await apiGet('/api/cases/config/clerks');
  const unique = [...new Set(clerks.map(c => c.name))];
  const el = document.getElementById('defectiveClerkFilter');
  for (const c of unique) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    el.appendChild(opt);
  }
}

// ---------------- Config ----------------
async function loadFieldStaff() {
  const rows = await apiGet('/api/cases/config/field-staff');
  document.getElementById('fieldStaffBody').innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td style="white-space:normal;">${escapeHtml(r.substations)}</td>
      <td><button class="btn btn-sm" onclick="deleteFieldStaff(${r.id})">Remove</button></td>
    </tr>
  `).join('') || '<tr><td colspan="3" class="empty-state">No field staff configured yet</td></tr>';
}
async function saveFieldStaff() {
  const name = document.getElementById('fsName').value.trim();
  const substations = document.getElementById('fsSubstations').value.trim();
  if (!name || !substations) return toast('Name and substations are required', 'error');
  await apiPost('/api/cases/config/field-staff', { name, substations });
  document.getElementById('fsName').value = '';
  document.getElementById('fsSubstations').value = '';
  toast('Field staff saved', 'success');
  loadFieldStaff();
}
async function deleteFieldStaff(id) {
  await apiDelete(`/api/cases/config/field-staff/${id}`);
  loadFieldStaff();
}

async function loadKnownSubstations() {
  const rows = await apiGet('/api/cases/config/known-substations');
  document.getElementById('knownSubstations').innerHTML = rows.map(s => escapeHtml(s)).join('<br>') || 'No data uploaded yet';
}

async function loadClerkRules() {
  const rows = await apiGet('/api/cases/config/clerks');
  document.getElementById('clerkRulesBody').innerHTML = rows.map(r => `
    <tr>
      <td>${r.priority}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.categories) || 'All'}</td>
      <td>${r.min_load ?? '—'} to ${r.max_load ?? '∞'} KW</td>
      <td>${escapeHtml(r.substation_group) || 'All'}</td>
    </tr>
  `).join('');
}
async function loadGroups() {
  const rows = await apiGet('/api/cases/config/substation-groups');
  document.getElementById('groupsBody').innerHTML = rows.map(r => `
    <tr><td>${escapeHtml(r.substation)}</td><td>${escapeHtml(r.grp)}</td></tr>
  `).join('');
}

// ---------------- Init ----------------
(async function init() {
  await populateDivisionFilters();
  await populateClerkFilter();
  loadDashboard();
  loadUploadHistory();
  loadUnbilledTable();
  loadDefectiveTable();
  loadFieldStaff();
  loadKnownSubstations();
  loadClerkRules();
  loadGroups();
})();
