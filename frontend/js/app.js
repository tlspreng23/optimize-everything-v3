/* ================================================================
   Optimize Everything V3 — app.js
   State, routing, landing, header, utilities
   ================================================================ */

/* ── State ── */
let state = {
  projectId:   null,
  project:     null,
  currentPage: 'discovery',
  loading:     false,
  // Optimise page
  initBatch:   null,
  initMethod:  null,
  _showInitForm: false,
  // Paper page
  _editingPaperSection: null,
};

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  bindLanding();
  bindHeader();
  bindPageNav();
  autoLoad();
});

/* ── Landing ── */
function bindLanding() {
  document.getElementById('btn-new-project').addEventListener('click', async () => {
    const name = prompt('Project name (leave blank for a default):') ?? '';
    await withLoading(async () => {
      const proj = await createProject(name.trim() || 'Untitled Project');
      applyProject(proj);
      showProjectPage();
    });
  });

  document.getElementById('btn-load-project').addEventListener('click', () => {
    const id = document.getElementById('load-project-id').value.trim();
    if (!id) return toast('Paste a project ID first.', 'warn');
    loadProject(id);
  });

  document.getElementById('load-project-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-load-project').click();
  });
}

/* ── Header ── */
function bindHeader() {
  document.getElementById('header-logo-btn').addEventListener('click', () => setPage('discovery'));

  document.getElementById('btn-share').addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('p', state.projectId);
    navigator.clipboard.writeText(url.toString())
      .then(() => toast('Link copied to clipboard.'))
      .catch(() => toast('Copy failed — check browser permissions.', 'warn'));
  });

  document.getElementById('btn-new').addEventListener('click', () => {
    if (!confirm('Start a new project? This tab will leave the current project.')) return;
    showLanding();
  });
}

/* ── Page nav ── */
function bindPageNav() {
  document.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => setPage(btn.dataset.page));
  });
}

function setPage(name) {
  state.currentPage = name;
  document.querySelectorAll('.page-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });
  renderApp();
}

function updatePageNav() {
  const p = state.project;
  if (!p) return;

  const completedPages = getCompletedPages(p);
  document.querySelectorAll('.page-btn').forEach(btn => {
    const pg = btn.dataset.page;
    btn.classList.toggle('completed', completedPages.includes(pg) && pg !== state.currentPage);
    btn.classList.toggle('active',    pg === state.currentPage);
  });
}

function getCompletedPages(p) {
  const pages = [];
  if (p.literature_report) pages.push('discovery');
  if ((p.variables || []).length > 0 && (p.objectives || []).length > 0) pages.push('architecture');
  if ((p.experiments || []).filter(e => e.is_complete).length > 0) pages.push('optimise');
  if (p.analysis_results?.files?.length > 0) pages.push('analysis');
  if (p.paper) pages.push('paper');
  return pages;
}

/* ── URL / auto-load ── */
function autoLoad() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('p');
  if (id) loadProject(id);
}
function updateURL(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('p', id);
  history.replaceState(null, '', url.toString());
}

/* ── Project load/apply ── */
async function loadProject(id) {
  await withLoading(async () => {
    let proj;
    try { proj = await getProject(id); }
    catch (err) { toast(`Could not load project: ${err.message}`, 'error'); return; }
    applyProject(proj);
    showProjectPage();
  });
}

function applyProject(proj) {
  state.projectId = proj.id;
  state.project   = proj;
  state.initBatch = null;
  updateURL(proj.id);
  document.getElementById('project-name-display').textContent = proj.name;
}

/* ── Page visibility ── */
function showProjectPage() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('project-page').classList.remove('hidden');
  renderApp();
}
function showLanding() {
  document.getElementById('project-page').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
  state.projectId = null; state.project = null; state.initBatch = null;
  document.getElementById('load-project-id').value = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('p');
  history.replaceState(null, '', url.toString());
}

/* ── Main render ── */
function renderApp() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  updatePageNav();

  switch (state.currentPage) {
    case 'discovery':    renderDiscoveryPage(content);    break;
    case 'architecture': renderArchitecturePage(content); break;
    case 'optimise':     renderOptimisePage(content);     break;
    case 'analysis':     renderAnalysisPage(content);     break;
    case 'paper':        renderPaperPage(content);        break;
  }
}

/* ================================================================
   INLINE SELECTOR HELPERS (replaces dropdown <select>)
   ================================================================ */

/**
 * Render an inline selector (clickable options displayed side by side).
 * @param {string} id - Container element ID
 * @param {Array} options - [{value, label}]
 * @param {string} selectedValue - Currently selected value
 */
function renderInlineSelector(id, options, selectedValue) {
  return `<div class="inline-selector" id="${id}">
    ${options.map(o =>
      `<span class="sel-opt${o.value === selectedValue ? ' active' : ''}" data-value="${escHtml(o.value)}">${escHtml(o.label)}</span>`
    ).join('')}
  </div>`;
}

/**
 * Get the currently selected value from an inline selector.
 */
function getSelectorValue(id) {
  const el = document.querySelector(`#${id} .sel-opt.active`);
  return el ? el.dataset.value : null;
}

/**
 * Bind click events on an inline selector, calling onChange(value) when selection changes.
 */
function bindSelector(id, onChange) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  wrap.querySelectorAll('.sel-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      wrap.querySelectorAll('.sel-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      if (onChange) onChange(opt.dataset.value);
    });
  });
}

/* ================================================================
   UTILITIES
   ================================================================ */

function withLoading(fn, label = 'Loading…') {
  document.getElementById('loading-label').textContent = label;
  showLoading();
  return fn().catch(err => {
    toast(err.message || 'Something went wrong.', 'error');
  }).finally(hideLoading);
}
function showLoading() {
  state.loading = true;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  state.loading = false;
  document.getElementById('loading-overlay').classList.add('hidden');
}

let _toastTimer = null;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}

function formatNum(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (n === 0) return '0';
  if (Math.abs(n) >= 10000 || (Math.abs(n) > 0 && Math.abs(n) < 0.001))
    return n.toExponential(3);
  return parseFloat(n.toPrecision(5)).toString();
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sanitizeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function formatSource(src) {
  const map = { bayesian:'BO', manual:'Manual', init:'Init', lhs:'LHS', sobol:'Sobol', random:'Random' };
  return map[String(src).toLowerCase()] ?? src;
}
