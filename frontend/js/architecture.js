/* ================================================================
   Optimize Everything V3 — architecture.js
   Page 2: Study Architecture — variable & objective selection
   ================================================================ */

function renderArchitecturePage(container) {
  const p = state.project;
  const design = p.study_design;
  const variables  = p.variables  || [];
  const objectives = p.objectives || [];

  if (!p.selected_avenue) {
    container.innerHTML = `<div class="page-content">
      <div class="notice">Select a research avenue on the <strong>Discover</strong> page first.</div>
    </div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-content">

      <section class="section">
        <div class="section-eyebrow">Study Configuration</div>
        <h2 class="section-title">Design Your Study</h2>
        <p class="section-desc">
          Studying: <strong>${escHtml(p.selected_avenue)}</strong><br>
          Select the input variables to optimise and the objectives to measure.
          AI suggestions are pre-populated based on the literature.
        </p>

        ${design ? renderArchContext(design) : ''}
      </section>

      ${design ? renderSuggestionPanels(design, variables, objectives) : ''}

      <section class="section">
        <div class="section-eyebrow">Selected Variables</div>
        <h2 class="section-title" style="font-size:22px;">Active Input Space</h2>

        ${variables.length === 0 ? '<p class="empty-msg">No variables selected yet. Accept suggestions above or add a custom one below.</p>' : `
        <div style="overflow-x:auto;margin-bottom:16px;">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Min</th><th>Max</th><th></th></tr></thead>
            <tbody>
              ${variables.map(v => `
                <tr>
                  <td>${escHtml(v.name)}</td>
                  <td>${formatNum(v.min)}</td>
                  <td>${formatNum(v.max)}</td>
                  <td><button class="btn-link btn-danger" data-rm-var="${escHtml(v.name)}">Remove</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}

        <div class="add-form">
          <input type="text"   class="input-base" id="var-name" placeholder="Variable name" style="flex:2;">
          <input type="number" class="input-base" id="var-min"  placeholder="Min" style="width:90px;flex:none;">
          <input type="number" class="input-base" id="var-max"  placeholder="Max" style="width:90px;flex:none;">
          <button class="btn-secondary btn-sm" id="btn-add-var">+ Add Custom</button>
        </div>
      </section>

      <section class="section">
        <div class="section-eyebrow">Selected Objectives</div>
        <h2 class="section-title" style="font-size:22px;">Optimisation Targets</h2>

        ${objectives.length === 0 ? '<p class="empty-msg">No objectives selected yet.</p>' : `
        <div style="overflow-x:auto;margin-bottom:16px;">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Direction</th><th></th></tr></thead>
            <tbody>
              ${objectives.map(o => `
                <tr>
                  <td>${escHtml(o.name)}</td>
                  <td><span class="badge badge-${o.type === 'maximize' ? 'max' : 'min'}">${o.type}</span></td>
                  <td><button class="btn-link btn-danger" data-rm-obj="${escHtml(o.name)}">Remove</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}

        <div class="add-form">
          <input type="text" class="input-base" id="obj-name" placeholder="Objective name" style="flex:2;">
          ${renderInlineSelector('obj-type', [
            {value: 'maximize', label: 'Maximize'},
            {value: 'minimize', label: 'Minimize'},
          ], 'maximize')}
          <button class="btn-secondary btn-sm" id="btn-add-obj">+ Add Custom</button>
        </div>
      </section>

      ${variables.length > 0 && objectives.length > 0 ? `
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn-gold btn-large" id="btn-to-optimise">Continue to Optimisation →</button>
      </div>` : `
      <p class="hint">Add at least one variable and one objective to proceed.</p>`}

    </div>
  `;

  bindArchitecture(container);
}

function renderArchContext(design) {
  return `
    <div class="arch-context-box">
      <p>${escHtml(design.context || '')}</p>
    </div>
    <div class="arch-split">
      <div class="arch-split-card industry">
        <h4>🏭 Industrial Focus</h4>
        <p>${escHtml(design.industry_note || '')}</p>
      </div>
      <div class="arch-split-card academic">
        <h4>🎓 Academic Focus</h4>
        <p>${escHtml(design.academic_note || '')}</p>
      </div>
    </div>
    ${(design.constraints || []).length ? `
    <div class="notice" style="margin-bottom:24px;">
      <strong>Experimental considerations:</strong>
      <ul class="constraints-list" style="margin-top:6px;">
        ${design.constraints.map(c => `<li>${escHtml(c)}</li>`).join('')}
      </ul>
    </div>` : ''}
  `;
}

function renderSuggestionPanels(design, activeVars, activeObjs) {
  const sugVars = design.suggested_variables || [];
  const sugObjs = design.suggested_objectives || [];
  const activeVarNames = activeVars.map(v => v.name);
  const activeObjNames = activeObjs.map(o => o.name);

  return `
    <section class="section">
      <div class="section-eyebrow">AI Suggestions</div>
      <h2 class="section-title" style="font-size:22px;">Suggested Variables</h2>
      <p class="section-desc" style="margin-bottom:16px;">
        Click a suggestion to add it to your study. Primary objectives are pre-selected.
        Recommended starting point: <strong>${design.recommended_initial_samples || 15} initial experiments</strong>, batch size <strong>${design.recommended_batch_size || 5}</strong>.
      </p>

      <div class="suggestion-list">
        ${sugVars.map(v => {
          const isActive = activeVarNames.includes(v.name);
          return `
          <div class="suggestion-item ${isActive ? 'selected' : ''}"
               data-sug-var-name="${escHtml(v.name)}"
               data-sug-var-min="${v.min}" data-sug-var-max="${v.max}">
            <span class="sug-badge ${v.category || 'material'}">${escHtml(v.category || 'material')}</span>
            <div class="sug-main">
              <div class="sug-name">${escHtml(v.name)} ${isActive ? '✓' : ''}</div>
              <div class="sug-meta">Range: ${formatNum(v.min)} – ${formatNum(v.max)} ${escHtml(v.unit || '')}</div>
              <div class="sug-rationale">${escHtml(v.rationale || '')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-eyebrow">AI Suggestions</div>
      <h2 class="section-title" style="font-size:22px;">Suggested Objectives</h2>

      <div class="suggestion-list">
        ${sugObjs.map(o => {
          const isActive = activeObjNames.includes(o.name);
          return `
          <div class="suggestion-item ${isActive ? 'selected' : ''}"
               data-sug-obj-name="${escHtml(o.name)}"
               data-sug-obj-type="${escHtml(o.type)}">
            <span class="badge ${o.type === 'maximize' ? 'badge-max' : 'badge-min'}"
                  style="flex-shrink:0;margin-top:2px;">${o.type}</span>
            <div class="sug-main">
              <div class="sug-name">${escHtml(o.name)} ${isActive ? '✓' : ''} ${o.importance === 'primary' ? '<span class="trl-badge">primary</span>' : ''}</div>
              <div class="sug-meta">Unit: ${escHtml(o.unit || '—')}</div>
              <div class="sug-rationale">${escHtml(o.rationale || '')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>
  `;
}

function bindArchitecture(container) {
  // Suggestion variable click
  container.querySelectorAll('[data-sug-var-name]').forEach(item => {
    item.addEventListener('click', async () => {
      const name = item.dataset.sugVarName;
      const min  = parseFloat(item.dataset.sugVarMin);
      const max  = parseFloat(item.dataset.sugVarMax);
      const isActive = item.classList.contains('selected');
      await withLoading(async () => {
        let proj;
        if (isActive) {
          proj = await removeVariable(state.projectId, name);
        } else {
          proj = await addVariable(state.projectId, name, min, max);
        }
        applyProject(proj);
        renderApp();
      });
    });
  });

  // Suggestion objective click
  container.querySelectorAll('[data-sug-obj-name]').forEach(item => {
    item.addEventListener('click', async () => {
      const name = item.dataset.sugObjName;
      const type = item.dataset.sugObjType;
      const isActive = item.classList.contains('selected');
      await withLoading(async () => {
        let proj;
        if (isActive) {
          proj = await removeObjective(state.projectId, name);
        } else {
          proj = await addObjective(state.projectId, name, type);
        }
        applyProject(proj);
        renderApp();
      });
    });
  });

  // Add custom variable
  document.getElementById('btn-add-var')?.addEventListener('click', async () => {
    const name = document.getElementById('var-name').value.trim();
    const min  = parseFloat(document.getElementById('var-min').value);
    const max  = parseFloat(document.getElementById('var-max').value);
    if (!name) return toast('Enter a variable name.', 'warn');
    if (isNaN(min) || isNaN(max)) return toast('Enter numeric min and max.', 'warn');
    if (min >= max) return toast('Min must be less than max.', 'warn');
    await withLoading(async () => {
      const proj = await addVariable(state.projectId, name, min, max);
      applyProject(proj);
      renderApp();
    });
  });

  // Remove variable
  container.querySelectorAll('[data-rm-var]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove variable "${btn.dataset.rmVar}"?`)) return;
      await withLoading(async () => {
        const proj = await removeVariable(state.projectId, btn.dataset.rmVar);
        applyProject(proj);
        renderApp();
      });
    });
  });

  // Bind inline selector for obj-type
  bindSelector('obj-type', () => {});

  // Add custom objective
  document.getElementById('btn-add-obj')?.addEventListener('click', async () => {
    const name = document.getElementById('obj-name').value.trim();
    const type = getSelectorValue('obj-type') || 'maximize';
    if (!name) return toast('Enter an objective name.', 'warn');
    await withLoading(async () => {
      const proj = await addObjective(state.projectId, name, type);
      applyProject(proj);
      renderApp();
    });
  });

  // Remove objective
  container.querySelectorAll('[data-rm-obj]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove objective "${btn.dataset.rmObj}"?`)) return;
      await withLoading(async () => {
        const proj = await removeObjective(state.projectId, btn.dataset.rmObj);
        applyProject(proj);
        renderApp();
      });
    });
  });

  // Continue to optimise
  document.getElementById('btn-to-optimise')?.addEventListener('click', () => {
    setPage('optimise');
  });
}
