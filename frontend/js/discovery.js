/* ================================================================
   Optimize Everything V3 — discovery.js
   Page 1: Literature research & avenue selection
   ================================================================ */

/* ── Skeleton placeholder text ── */
const _SKELETON_SUMMARY = [
  'Analysing the current state of research in this domain, including recent advances and key challenges faced by the scientific community.',
  'Identifying the most promising methodologies, evaluating their effectiveness across different experimental conditions, and reviewing quantitative benchmarks reported in recent literature.',
  'Considering practical constraints such as scalability, cost-effectiveness, reproducibility, and alignment with both industrial requirements and academic research standards.',
].join(' ');

const _SKELETON_AVENUES = [
  { name: 'Approach One', desc: 'Reviewing the first major methodology, including its theoretical basis, experimental validation, and reported performance metrics across different conditions and scales.' },
  { name: 'Approach Two', desc: 'Evaluating an alternative strategy with distinct advantages in specific scenarios, assessing trade-offs between efficiency, cost, and practical implementation considerations.' },
  { name: 'Approach Three', desc: 'Exploring emerging techniques that show promise based on recent publications, including novel combinations of established methods and cutting-edge developments in the field.' },
  { name: 'Approach Four', desc: 'Investigating additional pathways that address specific limitations of conventional approaches, with focus on innovative solutions and interdisciplinary perspectives.' },
];

function renderDiscoveryPage(container) {
  const p = state.project;
  const report = p.literature_report;
  const hasReport = !!report;
  const selectedAvenue = p.selected_avenue;
  const isLoading = state._litLoading;

  container.innerHTML = `
    <div class="page-content">

      <section class="section">
        <div class="section-eyebrow">Research Goal</div>
        <h2 class="section-title">What do you want to optimise?</h2>
        <p class="section-desc">
          Describe your research goal in plain language. Our AI will survey the
          literature and map out the possible directions — with pros, cons, and
          industrial context — so you can choose the most promising path.
        </p>

        <div class="chat-wrap">
          <div class="chat-input-row">
            <textarea
              id="topic-input"
              class="chat-textarea"
              rows="2"
              placeholder="e.g. design a porous material for post-combustion CO₂ capture that is low-cost and regenerable…"
              ${isLoading ? 'disabled' : ''}
            >${escHtml(p.topic || '')}</textarea>
            <button class="btn-primary" id="btn-research" style="flex-shrink:0;" ${isLoading ? 'disabled' : ''}>
              ${isLoading ? 'Researching…' : hasReport ? 'Refresh' : 'Research'}
            </button>
          </div>
        </div>
      </section>

      ${(hasReport || isLoading) ? renderLiteratureSection(report, selectedAvenue, isLoading) : ''}

      ${hasReport ? renderFollowUpChat(p) : ''}

    </div>
  `;

  bindDiscovery(container);
}

function renderLiteratureSection(report, selectedAvenue, isLoading) {
  if (isLoading) {
    return renderSkeletonReport();
  }
  return renderLiteratureReport(report, selectedAvenue);
}

/* ── Skeleton loading state ── */
function renderSkeletonReport() {
  return `
    <section class="section lit-report" id="lit-report-section">
      <div class="section-eyebrow">Literature Review</div>
      <h2 class="section-title skeleton-text">Research Landscape</h2>

      <div class="lit-summary skeleton-block">
        <p class="skeleton-text">${_SKELETON_SUMMARY}</p>
      </div>

      <div class="subsection-label">Approaches &amp; Systems</div>
      <div class="avenues-grid">
        ${_SKELETON_AVENUES.map(a => `
          <div class="avenue-card skeleton-block">
            <div class="avenue-name skeleton-text">${a.name}</div>
            <div class="avenue-desc skeleton-text">${a.desc}</div>
            <div class="avenue-pillars">
              <div class="avenue-pillar skeleton-text">Evaluating advantages and potential benefits</div>
              <div class="avenue-pillar skeleton-text">Assessing limitations and practical constraints</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="skeleton-status" id="skeleton-status">
        <div class="skeleton-status-dot"></div>
        <span>Searching scientific literature…</span>
      </div>
    </section>
  `;
}

/* ── Real report ── */
function renderLiteratureReport(report, selectedAvenue) {
  const avenues = report.avenues || [];
  const openQs  = report.open_questions || [];

  return `
    <section class="section lit-report" id="lit-report-section">
      <div class="section-eyebrow">Literature Review</div>
      <h2 class="section-title">${escHtml(report.field || 'Research Landscape')}</h2>

      <div class="lit-summary">${formatLitText(report.summary || '')}</div>

      <div class="subsection-label">Approaches &amp; Systems</div>
      <div class="avenues-grid${selectedAvenue ? ' has-selection' : ''}" id="avenues-grid">
        ${avenues.map(a => renderAvenueCard(a, a.name === selectedAvenue)).join('')}
      </div>

      ${openQs.length ? `
      <div class="open-questions">
        <h4>Open Questions in the Field</h4>
        <ul>${openQs.map(q => `<li>${escHtml(q)}</li>`).join('')}</ul>
      </div>` : ''}

      ${report.recommendation ? `
      <div class="recommendation-box">
        <h4>AI Recommendation</h4>
        <p>${escHtml(report.recommendation)}</p>
      </div>` : ''}

      <div class="avenue-selection-footer" id="avenue-footer">
        ${selectedAvenue
          ? `<p class="avenue-selected-note">Selected: <span class="avenue-selected-name">${escHtml(selectedAvenue)}</span></p>
             <div class="btn-row">
               <button class="btn-gold" id="btn-to-architecture">Continue to Study Design →</button>
               <button class="btn-secondary btn-sm" id="btn-change-avenue">Change</button>
             </div>`
          : `<p class="avenue-selected-note">Click an approach above to select it and generate a study design.</p>`
        }
      </div>
    </section>
  `;
}

function renderAvenueCard(avenue, isSelected) {
  const pros = (avenue.pros || []).slice(0, 3);
  const cons = (avenue.cons || []).slice(0, 2);
  return `
    <div class="avenue-card ${isSelected ? 'selected' : ''}" data-avenue-id="${escHtml(avenue.id)}" data-avenue-name="${escHtml(avenue.name)}">
      <div class="avenue-name">${escHtml(avenue.name)}</div>
      <div class="avenue-desc">${escHtml(avenue.description)}</div>
      <div class="avenue-pillars">
        ${pros.map(p => `<div class="avenue-pillar avenue-pro">✓ ${escHtml(p)}</div>`).join('')}
        ${cons.map(c => `<div class="avenue-pillar avenue-con">✗ ${escHtml(c)}</div>`).join('')}
      </div>
      ${(avenue.trl || avenue.key_results) ? `
      <div class="avenue-meta">
        ${avenue.trl ? `<div class="avenue-meta-row"><strong>TRL:</strong> ${escHtml(avenue.trl)}</div>` : ''}
        ${avenue.key_results ? `<div class="avenue-meta-row"><strong>Key results:</strong> ${escHtml(avenue.key_results)}</div>` : ''}
      </div>` : ''}
    </div>
  `;
}

function renderFollowUpChat(p) {
  const history = p.chat_history || [];

  return `
    <section class="section followup-section">
      <div class="section-eyebrow">Follow-up Questions</div>
      <h2 class="section-title" style="font-size:20px;">Ask about these approaches</h2>

      <div class="chat-messages" id="chat-messages">
        ${history.map(m => renderChatMessage(m)).join('')}
      </div>

      <div class="chat-input-row" style="margin-bottom:0;">
        <textarea
          id="chat-input"
          class="chat-textarea"
          rows="1"
          placeholder="Ask a question about any of these approaches…"
          style="font-size:14px;min-height:44px;"
        ></textarea>
        <button class="btn-secondary" id="btn-chat-send" style="flex-shrink:0;">Ask</button>
      </div>
    </section>
  `;
}

function renderChatMessage(msg) {
  const isUser = msg.role === 'user';
  return `
    <div class="chat-msg ${isUser ? 'user' : 'assistant'}">
      <div class="chat-bubble">${isUser ? escHtml(msg.content) : parseMarkdown(msg.content)}</div>
    </div>
  `;
}

/* ── Skeleton status message cycling ── */
let _skelTimer = null;
let _skelIndex = 0;
const _SKEL_STEPS = [
  'Searching scientific literature…',
  'Analysing research landscape…',
  'Identifying key approaches…',
  'Evaluating methodologies…',
  'Comparing trade-offs…',
  'Assessing technology readiness…',
  'Synthesising findings…',
  'Structuring report…',
];

function startSkeletonCycle() {
  _skelIndex = 0;
  _skelTimer = setInterval(() => {
    _skelIndex = (_skelIndex + 1) % _SKEL_STEPS.length;
    const el = document.querySelector('#skeleton-status span');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = _SKEL_STEPS[_skelIndex];
        el.style.opacity = '1';
      }, 200);
    }
  }, 3000);
}

function stopSkeletonCycle() {
  if (_skelTimer) { clearInterval(_skelTimer); _skelTimer = null; }
}

/* ── Bindings ── */
function bindDiscovery(container) {
  const btnResearch = document.getElementById('btn-research');
  const topicInput  = document.getElementById('topic-input');

  // Start skeleton cycle if loading
  if (state._litLoading) {
    startSkeletonCycle();
  }

  btnResearch?.addEventListener('click', async () => {
    const topic = topicInput?.value.trim();
    if (!topic) return toast('Describe your research goal first.', 'warn');

    // Show skeleton inline (no overlay)
    state._litLoading = true;
    renderApp();

    try {
      const proj = await generateLiterature(state.projectId, topic);
      applyProject(proj);
    } catch (err) {
      toast(err.message || 'Literature research failed.', 'error');
    } finally {
      state._litLoading = false;
      stopSkeletonCycle();
      renderApp();
    }
  });

  topicInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) btnResearch?.click();
  });

  // Avenue card selection
  container.querySelectorAll('.avenue-card:not(.skeleton-block)').forEach(card => {
    card.addEventListener('click', async () => {
      const avenueId   = card.dataset.avenueId;
      const avenueName = card.dataset.avenueName;
      await withLoading(async () => {
        const proj = await selectAvenue(state.projectId, avenueId, avenueName);
        applyProject(proj);
        renderApp();
      }, 'Analysing selected approach…', [
        'Analysing selected approach…',
        'Identifying key variables…',
        'Defining optimisation objectives…',
        'Estimating practical ranges…',
        'Structuring experimental design…',
      ]);
    });
  });

  // Continue to architecture
  document.getElementById('btn-to-architecture')?.addEventListener('click', () => {
    setPage('architecture');
  });

  // Change avenue
  document.getElementById('btn-change-avenue')?.addEventListener('click', () => {
    container.querySelectorAll('.avenue-card').forEach(c => c.classList.remove('selected'));
    const footer = document.getElementById('avenue-footer');
    if (footer) footer.innerHTML = `<p class="avenue-selected-note">Click an approach above to select it.</p>`;
  });

  // Follow-up chat
  bindChat(container);
}

function bindChat(container) {
  const chatInput = document.getElementById('chat-input');
  const btnSend   = document.getElementById('btn-chat-send');
  if (!chatInput || !btnSend) return;

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
  });

  const sendMessage = async () => {
    const msg = chatInput.value.trim();
    if (!msg) return;
    chatInput.value = '';
    chatInput.style.height = '';

    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg user';
    userDiv.innerHTML = `<div class="chat-bubble">${escHtml(msg)}</div>`;
    messagesEl.appendChild(userDiv);

    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-msg assistant';
    typingDiv.innerHTML = `
      <div class="chat-bubble chat-typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>`;
    messagesEl.appendChild(typingDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    let fullText = '';
    const responseBubble = document.createElement('div');
    responseBubble.className = 'chat-bubble';

    try {
      await streamChat(
        state.projectId,
        msg,
        (chunk) => {
          if (!fullText) {
            typingDiv.innerHTML = '';
            typingDiv.appendChild(responseBubble);
          }
          fullText += chunk;
          responseBubble.innerHTML = parseMarkdown(fullText);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        },
        () => {
          if (!fullText) typingDiv.remove();
          getProject(state.projectId).then(proj => {
            state.project = proj;
          }).catch(() => {});
        }
      );
    } catch (err) {
      typingDiv.remove();
      toast(`Chat error: ${err.message}`, 'error');
    }
  };

  btnSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

// Simple markdown parser for chat bubbles
function parseMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>')
    .replace(/^### (.+)$/gm, '<strong style="display:block;margin-top:8px;">$1</strong>')
    .replace(/^## (.+)$/gm,  '<strong style="display:block;margin-top:8px;font-size:1.05em;">$1</strong>')
    .replace(/^- (.+)$/gm,   '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p>$1</p>');
}

// Format multi-paragraph literature text
function formatLitText(text) {
  if (!text) return '';
  return escHtml(text)
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => `<p style="margin-bottom:12px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
