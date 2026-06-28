/* ================================================================
   Optimize Everything V3 — api.js
   ================================================================ */

async function apiFetch(path, options = {}) {
  const url = CONFIG.API_URL.replace(/\/$/, '') + path;
  const defaults = { headers: { 'Content-Type': 'application/json' } };
  const merged = {
    ...defaults, ...options,
    headers: { ...defaults.headers, ...(options.headers || {}) },
  };
  if (options.body instanceof FormData) delete merged.headers['Content-Type'];

  // 120s timeout to catch gateway timeouts before they become opaque errors
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  merged.signal = controller.signal;

  let response;
  try {
    response = await fetch(url, merged);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out — the server took too long. Please try again.');
    throw new Error('Network error — could not reach the server. Check your connection and try again.');
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let errMsg = `API error ${response.status}`;
    try {
      const errBody = await response.json();
      if (typeof errBody.detail === 'string') errMsg = errBody.detail;
      else if (Array.isArray(errBody.detail)) errMsg = errBody.detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      else if (errBody.message) errMsg = String(errBody.message);
    } catch (_) {}
    throw new Error(errMsg);
  }

  if (response.status === 204) return null;
  return response.json();
}

/* ── Projects ── */
function createProject(name, topic) {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, topic }),
  });
}
function getProject(id) { return apiFetch(`/api/projects/${id}`); }
function updateProject(id, data) {
  return apiFetch(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

/* ── Discovery ── */
function generateLiterature(id, topic) {
  return apiFetch(`/api/projects/${id}/literature`, {
    method: 'POST', body: JSON.stringify({ topic }),
  });
}

async function streamChat(projectId, message, onChunk, onDone) {
  const url = CONFIG.API_URL.replace(/\/$/, '') + `/api/projects/${projectId}/chat/stream`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) throw new Error(`Chat error ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') { onDone(); return; }
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) onChunk(parsed.text);
      } catch (_) {}
    }
  }
  onDone();
}

function selectAvenue(id, avenue_id, avenue_name) {
  return apiFetch(`/api/projects/${id}/select-avenue`, {
    method: 'POST', body: JSON.stringify({ avenue_id, avenue_name }),
  });
}

/* ── Variables / Objectives ── */
function addVariable(id, name, min, max) {
  return apiFetch(`/api/projects/${id}/variables`, {
    method: 'POST', body: JSON.stringify({ name, min, max }),
  });
}
function removeVariable(id, name) {
  return apiFetch(`/api/projects/${id}/variables/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
function addObjective(id, name, type) {
  return apiFetch(`/api/projects/${id}/objectives`, {
    method: 'POST', body: JSON.stringify({ name, type }),
  });
}
function removeObjective(id, name) {
  return apiFetch(`/api/projects/${id}/objectives/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

/* ── Experiments ── */
function generateInit(id, nSamples, method) {
  return apiFetch(`/api/projects/${id}/init`, {
    method: 'POST', body: JSON.stringify({ n_samples: nSamples, method }),
  });
}
function addExperiments(id, experiments) {
  return apiFetch(`/api/projects/${id}/experiments`, {
    method: 'POST', body: JSON.stringify({ experiments }),
  });
}
function updateExperiment(id, expId, objectiveValues) {
  return apiFetch(`/api/projects/${id}/experiments/${expId}`, {
    method: 'PATCH', body: JSON.stringify({ objective_values: objectiveValues }),
  });
}
function deleteExperiment(id, expId) {
  return apiFetch(`/api/projects/${id}/experiments/${expId}`, { method: 'DELETE' });
}
function clearExperiments(id) {
  return apiFetch(`/api/projects/${id}/experiments`, { method: 'DELETE' });
}
function bulkDeleteExperiments(id, ids) {
  return apiFetch(`/api/projects/${id}/experiments/bulk-delete`, {
    method: 'POST', body: JSON.stringify({ ids }),
  });
}

/* ── Optimisation ── */
function suggest(id, params) {
  return apiFetch(`/api/projects/${id}/suggest`, {
    method: 'POST', body: JSON.stringify(params),
  });
}
function responseSurface(id, params) {
  return apiFetch(`/api/projects/${id}/response-surface`, {
    method: 'POST', body: JSON.stringify(params),
  });
}
async function exportCsv(id) {
  const url = CONFIG.API_URL.replace(/\/$/, '') + `/api/projects/${id}/export/csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Export error ${response.status}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
function partialDependence(id) { return apiFetch(`/api/projects/${id}/partial-dependence`); }
function parityData(id)        { return apiFetch(`/api/projects/${id}/parity`); }
function gpInterpretation(id)  { return apiFetch(`/api/projects/${id}/gp-interpretation`); }

/* ── Analysis ── */
async function uploadAnalysisFile(id, file) {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch(`/api/projects/${id}/analysis/upload`, { method: 'POST', body: fd });
}
function deleteAnalysisFile(id, fileId) {
  return apiFetch(`/api/projects/${id}/analysis/files/${fileId}`, { method: 'DELETE' });
}

/* ── Paper ── */
function generatePaper(id) {
  return apiFetch(`/api/projects/${id}/paper/generate`, { method: 'POST' });
}
function updatePaperSection(id, section, content) {
  return apiFetch(`/api/projects/${id}/paper`, {
    method: 'PATCH', body: JSON.stringify({ section, content }),
  });
}
