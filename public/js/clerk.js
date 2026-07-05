// clerk.js
tabSwitcher('.tab', '.panel');

async function loadDashboard() {
  const qs = '?date=latest';
  const summary = await apiGet(`/api/dashboard/summary${qs}`);
  document.getElementById('summaryTiles').innerHTML = `
    <div class="tile"><div class="label">Total Connections</div><div class="value">${fmtNum(summary.totalConnections)}</div></div>
    <div class="tile success"><div class="label">Billed</div><div class="value">${fmtNum(summary.totalBilled)}</div></div>
    <div class="tile danger"><div class="label">Unbilled</div><div class="value">${fmtNum(summary.totalUnbilled)}</div></div>
    <div class="tile danger"><div class="label">Defective Bills</div><div class="value">${fmtNum(summary.totalDefective)}</div></div>
    <div class="tile success"><div class="label">Defective Resolved</div><div class="value">${fmtNum(summary.totalResolved)}</div></div>
    <div class="tile info"><div class="label">Defective Pending</div><div class="value">${fmtNum(summary.totalPendingDefective)}</div></div>
  `;

  const [clerkProg, cat, sub] = await Promise.all([
    apiGet(`/api/dashboard/defective/clerk-progress${qs}`),
    apiGet(`/api/dashboard/breakdown/billed/category${qs}`),
    apiGet(`/api/dashboard/breakdown/billed/substation${qs}`),
  ]);

  document.getElementById('clerkProgressBody').innerHTML = clerkProg.map(c => `
    <tr>
      <td>${escapeHtml(c.clerk)}</td>
      <td>${fmtNum(c.total)}</td>
      <td>${fmtNum(c.resolved)}</td>
      <td>${fmtNum(c.pending)}</td>
      <td style="width:160px;"><div class="bar-track"><div class="bar-fill" style="width:${c.total ? (c.resolved / c.total * 100) : 0}%;background:var(--success)"></div></div></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-state">No defective bills yet</td></tr>';

  renderBars(document.getElementById('defectiveCategory'), cat);
  renderBars(document.getElementById('defectiveSubstation'), sub.slice(0, 15));
}

async function populateClerkSelect() {
  const clerks = await apiGet('/api/cases/config/clerks');
  const unique = [...new Set(clerks.map(c => c.name))];
  document.getElementById('clerkSelect').innerHTML = unique.map(c => `<option>${escapeHtml(c)}</option>`).join('');
}

async function loadMyBills() {
  const clerk = document.getElementById('clerkSelect').value;
  const rows = await apiGet(`/api/cases/defective?clerk=${encodeURIComponent(clerk)}`);
  document.getElementById('myBillsBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.acct_id)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.division)}</td>
      <td>${escapeHtml(r.tariff_type)}</td>
      <td>${r.sanction_load ?? ''}</td>
      <td>${escapeHtml(r.substation)}</td>
      <td>${escapeHtml(r.defect_reasons)}</td>
      <td><span class="badge ${r.resolved ? 'resolved' : 'defective'}">${r.resolved ? 'Resolved' : 'Pending'}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="empty-state">No defective bills currently assigned to you</td></tr>';

  document.getElementById('exportXlsx').href = `/api/export/defective.xlsx`;
  document.getElementById('exportPdf').href = `/api/export/defective.pdf`;
  document.getElementById('exportLinks').style.display = 'flex';
}

(async function init() {
  await populateClerkSelect();
  loadDashboard();
})();
