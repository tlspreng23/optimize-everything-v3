/* ================================================================
   Optimize Everything V3 — paper.js
   Page 5: Paper — AI-generated scientific write-up
   ================================================================ */

const PAPER_SECTIONS = [
  { key: 'abstract',     label: 'Abstract',     heading: 'Abstract' },
  { key: 'introduction', label: 'Introduction',  heading: 'Introduction' },
  { key: 'results',      label: 'Results',       heading: 'Results' },
  { key: 'discussion',   label: 'Discussion',    heading: 'Discussion' },
  { key: 'conclusion',   label: 'Conclusion',    heading: 'Conclusion' },
];

function renderPaperPage(container) {
  const p    = state.project;
  const paper = p.paper;
  const hasEnoughData = (p.experiments || []).filter(e => e.is_complete).length >= 2;

  container.innerHTML = `
    <div class="page-content">

      <section class="section">
        <div class="section-eyebrow">Publication Draft</div>
        <h2 class="section-title">Research Paper</h2>
        <p class="section-desc">
          Generate a structured draft paper based on your Bayesian optimisation results.
          Each section is editable — use it as a starting point for your manuscript.
        </p>

        ${!hasEnoughData ? `
        <div class="notice">Complete at least 2 experiments to generate a paper draft.</div>` : `
        <div class="btn-row" style="margin-bottom:24px;">
          <button class="btn-gold" id="btn-generate-paper">
            ${paper ? '↺ Regenerate Paper' : '✦ Generate Paper Draft'}
          </button>
          ${paper ? `
          <button class="btn-secondary btn-sm" id="btn-export-paper">Export as Text</button>
          <button class="btn-secondary btn-sm" id="btn-export-csv-paper">Export Data (CSV)</button>` : ''}
        </div>`}
      </section>

      ${paper ? renderPaperContent(paper) : ''}

    </div>
  `;

  bindPaperPage(container);
}

function renderPaperContent(paper) {
  const editingSection = state._editingPaperSection;

  return `
    <article id="paper-article">

      <!-- Title -->
      <div class="paper-header">
        ${editingSection === 'title'
          ? `<textarea class="paper-section-textarea" id="edit-title" style="font-family:'DM Sans',sans-serif;font-size:24px;font-weight:500;min-height:80px;">${escHtml(paper.title || '')}</textarea>`
          : `<h1 class="paper-title-display">${escHtml(paper.title || 'Untitled Study')}</h1>`
        }
        <button class="btn-secondary btn-sm" id="btn-edit-title">
          ${editingSection === 'title' ? 'Save' : 'Edit'}
        </button>
      </div>

      <!-- Keywords -->
      ${(paper.keywords || []).length ? `
      <div class="paper-keywords">
        ${paper.keywords.map(k => `<span class="keyword-tag">${escHtml(k)}</span>`).join('')}
      </div>` : ''}

      <hr class="paper-divider">

      <!-- Sections -->
      ${PAPER_SECTIONS.map(sec => renderPaperSection(sec, paper[sec.key] || '', editingSection)).join('')}

    </article>
  `;
}

function renderPaperSection(sec, content, editingSection) {
  const isEditing = editingSection === sec.key;
  return `
    <div class="paper-section" id="paper-section-${sec.key}">
      <div class="paper-section-label">
        <span>${sec.label.toUpperCase()}</span>
        <button class="btn-link" data-edit-section="${sec.key}">
          ${isEditing ? 'Save' : 'Edit'}
        </button>
      </div>
      <h3 class="paper-section-heading">${sec.heading}</h3>
      ${isEditing
        ? `<textarea class="paper-section-textarea" id="edit-${sec.key}">${escHtml(content)}</textarea>`
        : `<p class="paper-section-text">${escHtml(content)}</p>`
      }
    </div>
    <hr class="paper-divider">
  `;
}

function bindPaperPage(container) {
  // Generate paper
  document.getElementById('btn-generate-paper')?.addEventListener('click', async () => {
    await withLoading(async () => {
      const proj = await generatePaper(state.projectId);
      applyProject(proj);
      state._editingPaperSection = null;
      renderApp();
    }, 'Drafting paper…', [
      'Drafting paper…',
      'Writing abstract…',
      'Composing introduction…',
      'Summarising results…',
      'Analysing discussion points…',
      'Formulating conclusions…',
    ]);
  });

  // Export paper as text
  document.getElementById('btn-export-paper')?.addEventListener('click', () => {
    exportPaperAsText(state.project.paper);
  });

  // Export CSV
  document.getElementById('btn-export-csv-paper')?.addEventListener('click', async () => {
    try {
      const url = await exportCsv(state.projectId);
      const a = document.createElement('a');
      a.href = url; a.download = `experiments-${state.projectId.slice(0,8)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast(`Export failed: ${err.message}`, 'error');
    }
  });

  // Edit title
  document.getElementById('btn-edit-title')?.addEventListener('click', async () => {
    if (state._editingPaperSection === 'title') {
      const content = document.getElementById('edit-title')?.value.trim() || '';
      await savePaperSection('title', content);
    } else {
      state._editingPaperSection = 'title';
      renderApp();
    }
  });

  // Edit section buttons
  container.querySelectorAll('[data-edit-section]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.editSection;
      if (state._editingPaperSection === key) {
        const content = document.getElementById(`edit-${key}`)?.value || '';
        await savePaperSection(key, content);
      } else {
        state._editingPaperSection = key;
        renderApp();
      }
    });
  });
}

async function savePaperSection(section, content) {
  await withLoading(async () => {
    const proj = await updatePaperSection(state.projectId, section, content);
    applyProject(proj);
    state._editingPaperSection = null;
    renderApp();
  });
}

function exportPaperAsText(paper) {
  if (!paper) return;
  const lines = [];
  lines.push(paper.title || 'Untitled Study');
  lines.push('='.repeat(60));
  if (paper.keywords?.length) {
    lines.push('Keywords: ' + paper.keywords.join(', '));
    lines.push('');
  }
  PAPER_SECTIONS.forEach(sec => {
    lines.push('');
    lines.push(sec.heading.toUpperCase());
    lines.push('-'.repeat(40));
    lines.push(paper[sec.key] || '');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'paper-draft.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
