/* ================================================================
   Optimize Everything V3 — optimise.js
   Page 3: Bayesian Optimisation (inline selectors, blue accent)
   ================================================================ */

function renderOptimisePage(container) {
  const p = state.project;
  const variables  = p.variables  || [];
  const objectives = p.objectives || [];

  if (!variables.length || !objectives.length) {
    container.innerHTML = `<div class="page-content">
      <div class="notice">Define variables and objectives on the <strong>Design</strong> page first.</div>
    </div>`;
    return;
  }

  const experiments = p.experiments || [];
  const complete    = experiments.filter(e => e.is_complete);

  container.innerHTML = `
    <div class="page-content">

      <!-- Initialise -->
      ${renderInitSection(p)}

      <!-- Experiment table -->
      <section class="section">
        <div class="section-eyebrow">Data Entry</div>
        <h2 class="section-title">Experiments
          <span class="stat-badge ${complete.length === 0 ? '' : complete.length === experiments.length ? 'badge-all-complete' : 'badge-some-complete'}">${complete.length} / ${experiments.length} complete</span>
        </h2>

        ${experiments.length === 0
          ? '<p class="empty-msg">No experiments yet. Generate an initial batch above, or add one manually.</p>'
          : renderExperimentsTable(p, true)
        }

        <div class="btn-row" style="margin-top:12px;">
          <button class="btn-secondary btn-sm" id="btn-add-manual">+ Add Manually</button>
          <button class="btn-link btn-danger btn-sm hidden" id="btn-bulk-delete"></button>
        </div>
        <div id="manual-add-form" class="hidden">
          ${renderManualAddForm(variables, objectives)}
        </div>
      </section>

      <!-- Suggest -->
      <section class="section">
        <div class="section-eyebrow">Bayesian Optimisation</div>
        <h2 class="section-title">Suggest Next Experiments</h2>
        ${complete.length < 2
          ? '<p class="empty-msg">Need at least 2 completed experiments to generate suggestions.</p>'
          : renderSuggestControls(p)
        }
      </section>

      <!-- GP Charts -->
      ${complete.length >= 2 ? `
      <div class="${variables.length >= 2 ? 'gp-panels-grid' : ''}">
        ${variables.length >= 2 ? `
        <section class="section">
          <div class="section-eyebrow">GP Model</div>
          <h2 class="section-title" style="font-size:22px;">2D View</h2>
          <div class="rs-controls">
            <div class="field-row">
              <label class="field-label">X variable</label>
              ${renderInlineSelector('sc-x-var',
                variables.map(v => ({value: v.name, label: v.name})),
                variables[0]?.name
              )}
            </div>
            <div class="field-row">
              <label class="field-label">Y variable</label>
              ${renderInlineSelector('sc-y-var',
                variables.map(v => ({value: v.name, label: v.name})),
                variables.length > 1 ? variables[1].name : variables[0]?.name
              )}
            </div>
            <div class="field-row">
              <label class="field-label">Objective</label>
              ${renderInlineSelector('sc-obj',
                objectives.map(o => ({value: o.name, label: o.name})),
                objectives[0]?.name
              )}
            </div>
          </div>
          <div id="sc-chart-container" class="chart-container" style="margin-top:16px;"></div>
        </section>` : ''}

        <section class="section">
          <div class="section-eyebrow">GP Model</div>
          <h2 class="section-title" style="font-size:22px;">1D View</h2>
          ${renderResponseSurfaceControls(p)}
        </section>
      </div>` : ''}

    </div>
  `;

  bindOptimisePage(container, p);
}

function renderInitSection(p) {
  const variables   = p.variables   || [];
  const experiments = p.experiments || [];
  const hasBO       = experiments.some(e => e.source === 'bayesian');

  if (!variables.length) return '';

  const hasExps = experiments.length > 0;
  if (hasExps && !state._showInitForm) {
    return `
      <section class="section">
        <div class="section-eyebrow">Space-filling Design</div>
        <h2 class="section-title" style="font-size:22px;">Initial Batch</h2>
        <div class="${hasBO ? 'warn-box' : 'info-box'}" style="margin-bottom:16px;">
          ${hasBO
            ? `<strong>Optimisation in progress.</strong> ${experiments.length} experiments exist including Bayesian suggestions.`
            : `<strong>Experiments exist.</strong> ${experiments.length} experiments recorded.`
          }
        </div>
        <div class="btn-row">
          <button class="btn-secondary btn-sm" id="btn-show-init">Generate Additional Initial Samples</button>
          <button class="btn-secondary btn-sm btn-danger-soft" id="btn-clear-exps">Clear All &amp; Start Fresh</button>
        </div>
        ${state.initBatch ? renderInitPreviewSection(variables) : ''}
      </section>`;
  }

  return `
    <section class="section" id="init-form-section">
      <div class="section-eyebrow">Space-filling Design</div>
      <h2 class="section-title" style="font-size:22px;">Initial Batch</h2>
      <div class="field-row">
        <label class="field-label">Samples</label>
        <input type="number" class="input-base" id="n-samples" value="${5 * variables.length}" min="2" max="200" style="width:90px;">
      </div>
      <p class="field-hint">Recommended: <strong>${5 * variables.length}</strong> samples (5 × ${variables.length} variable${variables.length > 1 ? 's' : ''}).</p>
      <div class="field-row">
        <label class="field-label">Method</label>
        ${renderInlineSelector('init-method', [
          {value: 'Latin Hypercube', label: 'Latin Hypercube'},
          {value: 'Sobol', label: 'Sobol'},
          {value: 'Random', label: 'Random'},
        ], 'Latin Hypercube')}
      </div>
      <div class="btn-row">
        <button class="btn-primary" id="btn-generate-init">Generate Initial Design</button>
        ${hasExps ? `<button class="btn-secondary" id="btn-cancel-init">Cancel</button>` : ''}
      </div>
      ${state.initBatch ? renderInitPreviewSection(variables) : ''}
    </section>`;
}

function renderInitPreviewSection(variables) {
  const batch = state.initBatch;
  if (!batch || !batch.length) return '';
  return `
    <div id="init-preview" style="margin-top:24px;">
      <div class="subsection-label" style="margin-bottom:12px;">Preview — ${batch.length} experiments</div>
      <div id="init-scatter-chart" class="chart-container"></div>
      <div style="overflow-x:auto;margin-top:12px;">
        <table class="init-table">
          <thead><tr><th>#</th>${variables.map(v => `<th>${escHtml(v.name)}</th>`).join('')}</tr></thead>
          <tbody>
            ${batch.map((row, i) => `
              <tr>
                <td class="muted">${i+1}</td>
                ${variables.map(v => `<td>${formatNum(row[v.name])}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn-primary" id="btn-confirm-init">Confirm &amp; Save Experiments</button>
        <button class="btn-secondary" id="btn-discard-init">Discard</button>
      </div>
    </div>`;
}

function renderExperimentsTable(p, editable) {
  const variables  = p.variables  || [];
  const objectives = p.objectives || [];
  const experiments = p.experiments || [];
  if (!experiments.length) return '<p class="empty-msg">No experiments.</p>';

  return `
    <div style="overflow-x:auto;">
      <table class="data-table exp-table">
        <thead>
          <tr>
            ${editable ? '<th class="cb-col"><input type="checkbox" class="exp-cb-all"></th>' : ''}
            <th>#</th>
            ${variables.map(v  => `<th>${escHtml(v.name)}</th>`).join('')}
            ${objectives.map(o => `<th>${escHtml(o.name)}</th>`).join('')}
            <th>Source</th>
            ${editable ? '<th style="min-width:80px;"></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${experiments.map((e, i) => {
            const done = e.is_complete;
            return `<tr data-exp-id="${e.id}" class="${done ? 'row-complete' : ''}">
              ${editable ? `<td class="cb-col"><input type="checkbox" class="exp-cb" data-exp-id="${e.id}"></td>` : ''}
              <td class="muted">${i+1}</td>
              ${variables.map(v => `<td>${formatNum(e.variable_values[v.name])}</td>`).join('')}
              ${editable
                ? objectives.map(o => {
                    const val = e.objective_values?.[o.name];
                    if (done && val != null) return `<td>${formatNum(val)}</td>`;
                    return `<td><input type="number" class="input-inline obj-input"
                      data-exp-id="${e.id}" data-obj="${escHtml(o.name)}"
                      value="${val != null ? val : ''}" placeholder="—" step="any"></td>`;
                  }).join('')
                : objectives.map(o => {
                    const val = e.objective_values?.[o.name];
                    return `<td>${val != null ? formatNum(val) : '<span class="muted">—</span>'}</td>`;
                  }).join('')
              }
              <td><span class="source-tag">${escHtml(formatSource(e.source))}</span></td>
              ${editable ? `<td class="action-col">
                ${done
                  ? `<button class="btn-link btn-danger btn-del-exp" data-exp-id="${e.id}">Del</button>`
                  : `<button class="btn-link btn-save-exp" data-exp-id="${e.id}">Save</button>
                     <button class="btn-link btn-danger btn-del-exp" data-exp-id="${e.id}">Del</button>`
                }
              </td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderManualAddForm(variables, objectives) {
  return `
    <div class="manual-form">
      <div class="manual-form-grid">
        ${variables.map(v => `
          <div class="manual-field">
            <label class="field-label">${escHtml(v.name)} <span class="muted">[${formatNum(v.min)}, ${formatNum(v.max)}]</span></label>
            <input type="number" class="input-base" id="manual-var-${sanitizeId(v.name)}" step="any">
          </div>`).join('')}
        ${objectives.map(o => `
          <div class="manual-field">
            <label class="field-label">${escHtml(o.name)} <span class="muted">(optional)</span></label>
            <input type="number" class="input-base" id="manual-obj-${sanitizeId(o.name)}" step="any" placeholder="leave blank if unknown">
          </div>`).join('')}
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn-primary btn-sm" id="btn-submit-manual">Add Experiment</button>
      </div>
    </div>`;
}

function renderSuggestControls(p) {
  const objectives  = p.objectives || [];
  const hasMultiObj = objectives.length >= 2;
  return `
    <div class="suggest-controls">
      <div class="field-row">
        <label class="field-label">Suggestions</label>
        <input type="number" class="input-base" id="suggest-n" value="${p.batch_size}" min="1" max="20" style="width:80px;">
      </div>
      <div class="field-row">
        <label class="field-label">Mode</label>
        ${renderInlineSelector('suggest-mode', [
          {value: 'Single Objective', label: 'Single Objective'},
          ...(hasMultiObj ? [{value: 'Weighted Sum', label: 'Weighted Sum'}] : []),
          ...(hasMultiObj ? [{value: 'Pareto', label: 'Pareto'}] : []),
        ], 'Single Objective')}
      </div>
      <div class="field-row" id="single-obj-row">
        <label class="field-label">Objective</label>
        ${renderInlineSelector('suggest-obj-select',
          objectives.map(o => ({value: o.name, label: `${o.name} (${o.type})`})),
          objectives[0]?.name
        )}
      </div>
      <div id="weights-row" class="hidden">
        <p class="field-label" style="margin-bottom:8px;">Objective weights</p>
        ${objectives.map(o => `
          <div class="field-row">
            <label class="field-label">${escHtml(o.name)}</label>
            <input type="number" class="input-base" id="w-${sanitizeId(o.name)}" value="${(1/objectives.length).toFixed(2)}" step="0.01" min="0" max="1" style="width:80px;">
          </div>`).join('')}
      </div>
      <div class="field-row">
        <label class="field-label">Acquisition fn</label>
        ${renderInlineSelector('suggest-acq', [
          {value: 'Expected Improvement', label: 'Expected Improvement'},
          {value: 'Upper Confidence Bound', label: 'UCB'},
        ], 'Expected Improvement')}
      </div>
      <div class="field-row">
        <label class="field-label">UCB β</label>
        <input type="number" class="input-base" id="suggest-beta" value="2" step="0.5" min="0.1" style="width:80px;">
      </div>
      <div class="btn-row">
        <button class="btn-primary" id="btn-suggest">Suggest Experiments</button>
      </div>
      <p class="hint">Backend: ${escHtml(p.backend)}</p>
    </div>`;
}

function renderResponseSurfaceControls(p) {
  const variables  = p.variables  || [];
  const objectives = p.objectives || [];
  return `
    <div class="rs-controls">
      <div class="field-row">
        <label class="field-label">X variable</label>
        ${renderInlineSelector('rs-x-var',
          variables.map(v => ({value: v.name, label: v.name})),
          variables[0]?.name
        )}
      </div>
      <div class="field-row">
        <label class="field-label">Objective</label>
        ${renderInlineSelector('rs-obj',
          objectives.map(o => ({value: o.name, label: o.name})),
          objectives[0]?.name
        )}
      </div>
    </div>
    <div id="rs-chart-container" class="chart-container" style="margin-top:16px;min-height:20px;"></div>`;
}

function bindOptimisePage(container, p) {
  const variables  = p.variables  || [];
  const objectives = p.objectives || [];

  // Init form
  document.getElementById('btn-show-init')?.addEventListener('click', () => {
    state._showInitForm = true; renderApp();
  });
  document.getElementById('btn-cancel-init')?.addEventListener('click', () => {
    state._showInitForm = false; renderApp();
  });
  document.getElementById('btn-clear-exps')?.addEventListener('click', async () => {
    const n = (p.experiments || []).length;
    if (!confirm(`Delete all ${n} experiments? This cannot be undone.`)) return;
    await withLoading(async () => {
      const proj = await clearExperiments(state.projectId);
      applyProject(proj);
      state.initBatch = null;
      state._showInitForm = false;
      renderApp();
    });
  });
  document.getElementById('btn-generate-init')?.addEventListener('click', async () => {
    const n = parseInt(document.getElementById('n-samples')?.value) || 10;
    const method = getSelectorValue('init-method') || 'Latin Hypercube';
    await withLoading(async () => {
      const result = await generateInit(state.projectId, n, method);
      state.initBatch  = result.batch;
      state.initMethod = method;
      renderApp();
      setTimeout(() => Charts.initScatter('init-scatter-chart', state.initBatch, variables), 50);
    });
  });
  document.getElementById('btn-confirm-init')?.addEventListener('click', async () => {
    await withLoading(async () => {
      const methodLabel = { 'Latin Hypercube': 'LHS', 'Sobol': 'Sobol', 'Random': 'Random' };
      const source = methodLabel[state.initMethod] || state.initMethod || 'init';
      const exps = state.initBatch.map(row => ({
        variable_values: Object.fromEntries(variables.map(v => [v.name, row[v.name]])),
        objective_values: {},
        source,
      }));
      const proj = await addExperiments(state.projectId, exps);
      applyProject(proj);
      state.initBatch = null;
      state._showInitForm = false;
      toast(`${exps.length} experiments added.`);
      renderApp();
    });
  });
  document.getElementById('btn-discard-init')?.addEventListener('click', () => {
    state.initBatch = null;
    renderApp();
  });
  if (state.initBatch) {
    setTimeout(() => Charts.initScatter('init-scatter-chart', state.initBatch, variables), 50);
  }

  // Bind inline selectors for init
  bindSelector('init-method', () => {});

  // Manual add
  document.getElementById('btn-add-manual')?.addEventListener('click', () => {
    document.getElementById('manual-add-form')?.classList.toggle('hidden');
  });
  document.getElementById('btn-submit-manual')?.addEventListener('click', async () => {
    const varVals = {}; let valid = true;
    variables.forEach(v => {
      const el = document.getElementById(`manual-var-${sanitizeId(v.name)}`);
      const val = parseFloat(el?.value);
      if (isNaN(val)) { valid = false; toast(`Enter a value for ${v.name}.`, 'warn'); }
      varVals[v.name] = val;
    });
    if (!valid) return;
    const objVals = {};
    objectives.forEach(o => {
      const el = document.getElementById(`manual-obj-${sanitizeId(o.name)}`);
      const val = el?.value.trim();
      if (val !== '') objVals[o.name] = parseFloat(val);
    });
    await withLoading(async () => {
      const proj = await addExperiments(state.projectId, [{ variable_values: varVals, objective_values: objVals, source: 'manual' }]);
      applyProject(proj); renderApp();
    });
  });

  // Experiment table
  const bulkBtn = document.getElementById('btn-bulk-delete');
  const updateBulkBtn = () => {
    if (!bulkBtn) return;
    const checked = container.querySelectorAll('.exp-cb:checked');
    if (checked.length > 0) {
      bulkBtn.textContent = `Delete ${checked.length} selected`;
      bulkBtn.classList.remove('hidden');
    } else { bulkBtn.classList.add('hidden'); }
  };
  container.querySelector('.exp-cb-all')?.addEventListener('change', e => {
    container.querySelectorAll('.exp-cb').forEach(cb => { cb.checked = e.target.checked; });
    updateBulkBtn();
  });
  container.querySelectorAll('.exp-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const all = container.querySelectorAll('.exp-cb');
      const selAll = container.querySelector('.exp-cb-all');
      if (selAll) selAll.checked = [...all].every(c => c.checked);
      updateBulkBtn();
    });
  });
  bulkBtn?.addEventListener('click', async () => {
    const ids = [...container.querySelectorAll('.exp-cb:checked')].map(cb => cb.dataset.expId);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} experiment${ids.length > 1 ? 's' : ''}?`)) return;
    await withLoading(async () => {
      const proj = await bulkDeleteExperiments(state.projectId, ids);
      applyProject(proj); renderApp();
    });
  });
  container.querySelectorAll('.btn-save-exp').forEach(btn => {
    btn.addEventListener('click', async () => {
      const expId = btn.dataset.expId;
      const objVals = {};
      objectives.forEach(o => {
        const inp = container.querySelector(`.obj-input[data-exp-id="${expId}"][data-obj="${o.name}"]`);
        if (inp && inp.value.trim() !== '') objVals[o.name] = parseFloat(inp.value);
      });
      await withLoading(async () => {
        const proj = await updateExperiment(state.projectId, expId, objVals);
        applyProject(proj); renderApp();
      });
    });
  });
  container.querySelectorAll('.btn-del-exp').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this experiment?')) return;
      await withLoading(async () => {
        const proj = await deleteExperiment(state.projectId, btn.dataset.expId);
        applyProject(proj); renderApp();
      });
    });
  });

  // Suggest — bind inline selectors
  bindSelector('suggest-mode', (mode) => {
    document.getElementById('single-obj-row')?.classList.toggle('hidden', mode !== 'Single Objective');
    document.getElementById('weights-row')?.classList.toggle('hidden', mode !== 'Weighted Sum');
  });
  bindSelector('suggest-obj-select', () => {});
  bindSelector('suggest-acq', () => {});

  document.getElementById('btn-suggest')?.addEventListener('click', async () => {
    const mode = getSelectorValue('suggest-mode') || 'Single Objective';
    const acqFunc = getSelectorValue('suggest-acq') || 'Expected Improvement';
    const beta = parseFloat(document.getElementById('suggest-beta')?.value || '2');
    const nSug = parseInt(document.getElementById('suggest-n')?.value || p.batch_size);
    let targetObj = null, weights = null;
    if (mode === 'Single Objective') {
      targetObj = getSelectorValue('suggest-obj-select');
      if (!targetObj) return toast('Select an objective.', 'warn');
    } else if (mode === 'Weighted Sum') {
      weights = {};
      objectives.forEach(o => {
        weights[o.name] = parseFloat(document.getElementById(`w-${sanitizeId(o.name)}`)?.value || '1');
      });
    }
    await withLoading(async () => {
      const proj = await suggest(state.projectId, {
        num_suggestions: nSug, acq_func: acqFunc, beta,
        optimization_mode: mode, objective_name: targetObj, objective_weights: weights,
      });
      applyProject(proj);
      toast(`${nSug} suggestion${nSug > 1 ? 's' : ''} added.`);
      renderApp();
    }, 'Running Bayesian optimisation…');
  });

  // Response surface — bind inline selectors
  bindSelector('sc-x-var', renderSuggestionsContour2D);
  bindSelector('sc-y-var', renderSuggestionsContour2D);
  bindSelector('sc-obj', renderSuggestionsContour2D);
  bindSelector('rs-x-var', renderResponseSurface1D);
  bindSelector('rs-obj', renderResponseSurface1D);

  const complete = (p.experiments || []).filter(e => e.is_complete);
  if (complete.length >= 2) {
    setTimeout(() => {
      renderResponseSurface1D();
      if (variables.length >= 2) renderSuggestionsContour2D();
    }, 80);
  }
}

async function renderResponseSurface1D() {
  const xVar = getSelectorValue('rs-x-var');
  const objName = getSelectorValue('rs-obj');
  if (!xVar || !objName) return;
  const cont = document.getElementById('rs-chart-container');
  if (!cont) return;
  cont.innerHTML = '<p class="muted" style="padding:12px;">Computing…</p>';
  try {
    const data = await responseSurface(state.projectId, { mode: '1d', x_var: xVar, obj_name: objName });
    cont.innerHTML = '<div id="rs-chart"></div>';
    Charts.responseSurface1D('rs-chart', {
      x: data.x_plot, mean: data.mean, lower: data.lower, upper: data.upper,
      x_obs: data.x_data, y_obs: data.y_data,
    }, xVar, objName);
  } catch (err) {
    cont.innerHTML = `<p class="error-msg">${escHtml(err.message)}</p>`;
  }
}

async function renderSuggestionsContour2D() {
  const xVar = getSelectorValue('sc-x-var');
  const yVar = getSelectorValue('sc-y-var');
  const objName = getSelectorValue('sc-obj');
  const cont = document.getElementById('sc-chart-container');
  if (!xVar || !yVar || !objName || !cont) return;
  if (xVar === yVar) return toast('X and Y must be different variables.', 'warn');
  cont.innerHTML = '<p class="muted" style="padding:12px;">Computing…</p>';
  try {
    const data = await responseSurface(state.projectId, { mode: '2d', x_var: xVar, y_var: yVar, obj_name: objName });
    cont.innerHTML = '<div id="sc-chart"></div>';
    const exps = state.project.experiments || [];
    Charts.suggestionsContour('sc-chart', {
      x: data.x_axis, y: data.y_axis, z: data.z_grid,
    }, exps.filter(e => e.source === 'bayesian' && !e.is_complete),
       exps.filter(e => e.is_complete), xVar, yVar, objName);
  } catch (err) {
    cont.innerHTML = `<p class="error-msg">${escHtml(err.message)}</p>`;
  }
}
