/* ================================================================
   Optimize Everything V3 — analysis.js
   Page 4: Data Analysis — file upload + GP model diagnostics
   ================================================================ */

function renderAnalysisPage(container) {
  const p = state.project;
  const experiments = p.experiments || [];
  const complete    = experiments.filter(e => e.is_complete);
  const objectives  = p.objectives || [];
  const analysisResults = p.analysis_results || { files: [] };
  const files = analysisResults.files || [];

  container.innerHTML = `
    <div class="page-content">

      <!-- Upload -->
      <section class="section">
        <div class="section-eyebrow">Data Import</div>
        <h2 class="section-title">Upload Data</h2>
        <p class="section-desc">
          Import Excel (.xlsx) or CSV files containing experimental data, literature values,
          or benchmark results for comparison with your optimisation study.
        </p>

        <div class="upload-zone" id="upload-zone">
          <div class="upload-zone-icon">📂</div>
          <div class="upload-zone-label">Drop a file here, or click to browse</div>
          <input type="file" id="file-input" accept=".csv,.xlsx,.xls" style="display:none;">
          <button class="btn-secondary btn-sm" id="btn-browse" style="margin-top:8px;">Choose File</button>
          <div class="upload-zone-hint">Supports .csv, .xlsx, .xls</div>
        </div>

        ${files.map(f => renderFileCard(f)).join('')}
      </section>

      <!-- GP Diagnostics (if optimisation data exists) -->
      ${complete.length >= 3 && objectives.length > 0 ? `
      <section class="section">
        <div class="section-eyebrow">Model Diagnostics</div>
        <h2 class="section-title">GP Model Analysis</h2>
        <p class="section-desc">Leave-one-out cross-validation to assess the predictive accuracy of the fitted Gaussian process.</p>

        <div class="field-row" style="margin-bottom:16px;">
          <label class="field-label">Objective</label>
          ${renderInlineSelector('diag-obj',
            objectives.map(o => ({value: o.name, label: o.name})),
            objectives[0]?.name
          )}
        </div>
        <div id="diag-container"><p class="muted" style="padding:8px 0;">Loading…</p></div>

        <div class="section" style="margin-top:32px;">
          <div class="subsection-label">Partial Dependence</div>
          <p class="section-desc" style="margin-bottom:16px;">
            Marginal effect of each variable on the objective, holding all others at their mean.
          </p>
          <div class="field-row" style="margin-bottom:16px;">
            <label class="field-label">Objective</label>
            ${renderInlineSelector('pdp-obj',
              objectives.map(o => ({value: o.name, label: o.name})),
              objectives[0]?.name
            )}
          </div>
          <div id="pdp-container"><p class="muted" style="padding:8px 0;">Loading…</p></div>
          <div id="gp-interpretation" style="margin-top:16px;"></div>
        </div>
      </section>` : complete.length > 0 ? `
      <section class="section">
        <div class="notice">Complete at least 3 experiments to unlock model diagnostics.</div>
      </section>` : ''}

    </div>
  `;

  bindAnalysisPage(container);

  // Auto-load diagnostics
  if (complete.length >= 3 && objectives.length > 0) {
    setTimeout(loadDiagnostics, 100);
  }
}

function renderFileCard(f) {
  const numCols = Object.keys(f.stats || {});
  return `
    <div class="file-card">
      <div class="file-card-header">
        <div>
          <div class="file-card-title">📄 ${escHtml(f.filename)}</div>
          <div class="file-card-meta">${f.n_rows} rows · ${(f.columns || []).length} columns</div>
        </div>
        <button class="btn-link btn-danger" data-delete-file="${escHtml(f.id)}">Remove</button>
      </div>

      ${f.analysis ? `<div class="file-analysis-text">${escHtml(f.analysis)}</div>` : ''}

      ${numCols.length > 0 ? `
      <div class="stats-grid">
        ${numCols.slice(0, 8).map(col => {
          const s = f.stats[col];
          return `<div class="stat-box">
            <div class="stat-col-name" title="${escHtml(col)}">${escHtml(col)}</div>
            <div class="stat-val">${s.mean != null ? formatNum(s.mean) : '—'}</div>
            <div class="stat-range">${s.min != null ? formatNum(s.min) : '—'} – ${s.max != null ? formatNum(s.max) : '—'}</div>
          </div>`;
        }).join('')}
      </div>` : ''}

      ${f.preview && f.columns ? `
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>${f.columns.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${f.preview.slice(0, 10).map(row => `
              <tr>${row.map(cell => `<td>${cell != null ? formatNum(cell) : '—'}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
        ${f.n_rows > 10 ? `<p class="hint" style="padding:6px 0;">Showing 10 of ${f.n_rows} rows.</p>` : ''}
      </div>` : ''}
    </div>`;
}

function bindAnalysisPage(container) {
  // File upload drag & drop
  const uploadZone = document.getElementById('upload-zone');
  const fileInput  = document.getElementById('file-input');
  const btnBrowse  = document.getElementById('btn-browse');

  btnBrowse?.addEventListener('click', () => fileInput?.click());
  uploadZone?.addEventListener('click', e => {
    if (e.target !== btnBrowse) fileInput?.click();
  });

  uploadZone?.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone?.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFileUpload(file);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFileUpload(file);
  });

  // Delete file
  container.querySelectorAll('[data-delete-file]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this file?')) return;
      await withLoading(async () => {
        const proj = await deleteAnalysisFile(state.projectId, btn.dataset.deleteFile);
        applyProject(proj);
        renderApp();
      });
    });
  });

  // Diagnostics objective selectors
  bindSelector('diag-obj', loadDiagnostics);
  bindSelector('pdp-obj', loadPDP);
}

async function handleFileUpload(file) {
  const allowed = ['.csv', '.xlsx', '.xls'];
  if (!allowed.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return toast('Please upload a CSV or Excel file.', 'warn');
  }
  await withLoading(async () => {
    const proj = await uploadAnalysisFile(state.projectId, file);
    applyProject(proj);
    renderApp();
  }, 'Uploading and analysing…');
}

async function loadDiagnostics() {
  const objName = getSelectorValue('diag-obj');
  const diagContainer = document.getElementById('diag-container');
  if (!diagContainer) return;

  try {
    const result = await parityData(state.projectId);
    const objData = result.data.find(d => d.objective === objName) || result.data[0];

    if (!objData) {
      diagContainer.innerHTML = '<p class="muted">Not enough data.</p>';
      return;
    }

    diagContainer.innerHTML = `
      <div style="display:flex;gap:24px;align-items:stretch;width:100%;">
        <div style="flex:0 0 auto;width:min(42%,340px);">
          <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Predicted vs Actual</div>
          <div id="parity-chart" style="width:100%;"></div>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Residuals (σ)</div>
          <div id="resid-chart" style="width:100%;"></div>
        </div>
      </div>`;

    Charts.parityPlot('parity-chart', objData);
    Charts.residualsPlot('resid-chart', objData);
  } catch (err) {
    if (diagContainer) diagContainer.innerHTML = `<p class="error-msg">${escHtml(err.message)}</p>`;
  }

  // Also load PDP
  loadPDP();
}

async function loadPDP() {
  const objName = getSelectorValue('pdp-obj');
  const pdpContainer = document.getElementById('pdp-container');
  const interpContainer = document.getElementById('gp-interpretation');
  if (!pdpContainer) return;

  try {
    const [pdpResult, interpResult] = await Promise.all([
      partialDependence(state.projectId),
      gpInterpretation(state.projectId).catch(() => null),
    ]);

    const objData = pdpResult.data.find(d => d.objective === objName) || pdpResult.data[0];
    if (objData && objData.plots.length > 0) {
      pdpContainer.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:16px;">
        ${objData.plots.map((_, i) => `<div id="pdp-${i}" style="flex:1;min-width:240px;max-width:340px;"></div>`).join('')}
      </div>`;
      objData.plots.forEach((plot, i) => Charts.partialDependencePlot(`pdp-${i}`, plot, objData.objective));
    } else {
      pdpContainer.innerHTML = '<p class="muted">Not enough data for PDP.</p>';
    }

    if (interpContainer && interpResult?.text) {
      interpContainer.innerHTML = `<p style="font-style:italic;color:#5a5a5a;font-size:13px;line-height:1.7;max-width:700px;padding:16px 0;">${escHtml(interpResult.text)}</p>`;
    }
  } catch (err) {
    if (pdpContainer) pdpContainer.innerHTML = `<p class="error-msg">${escHtml(err.message)}</p>`;
  }
}
