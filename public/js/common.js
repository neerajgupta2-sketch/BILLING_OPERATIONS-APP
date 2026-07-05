// common.js — shared helpers across all pages

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Renders a simple horizontal bar breakdown (no chart library needed)
function renderBars(container, data, opts = {}) {
  const max = Math.max(1, ...data.map(d => d.count));
  container.innerHTML = data.map(d => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.count / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-count">${d.count.toLocaleString()}</div>
    </div>
  `).join('') || '<div class="empty-state">No data yet</div>';
}

function tabSwitcher(tabSelector, panelSelector) {
  document.querySelectorAll(tabSelector).forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll(tabSelector).forEach(t => t.classList.remove('active'));
      document.querySelectorAll(panelSelector).forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`${panelSelector}[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString();
}
