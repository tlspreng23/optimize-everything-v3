/* ================================================================
   Optimize Everything V3 — charts.js
   Plotly.js chart renderers — blue accent, transparent backgrounds
   ================================================================ */

const Charts = (() => {

  const ACCENT = '#2B258E';
  const ACCENT_LIGHT = 'rgba(43, 37, 142, 0.12)';

  /* ── Shared base layout ── */
  const BASE_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
    margin: { t: 40, b: 50, l: 55, r: 20 },
    xaxis: { gridcolor: '#e0e0dc', linecolor: '#1a1a1a', zerolinecolor: '#e0e0dc' },
    yaxis: { gridcolor: '#e0e0dc', linecolor: '#1a1a1a', zerolinecolor: '#e0e0dc' },
    legend: { orientation: 'h', y: 1.12, font: { size: 11 } },
  };

  const PLOTLY_CONFIG = { displayModeBar: false, responsive: true };

  /* ── Helper: deep-merge layout with overrides ── */
  function mergeLayout(overrides) {
    return Object.assign({}, BASE_LAYOUT, overrides, {
      xaxis: Object.assign({}, BASE_LAYOUT.xaxis, overrides.xaxis || {}),
      yaxis: Object.assign({}, BASE_LAYOUT.yaxis, overrides.yaxis || {}),
    });
  }

  /* ── Helper: safely get Plotly div ── */
  function getDiv(divId) {
    const el = document.getElementById(divId);
    if (!el) console.warn(`Charts: div #${divId} not found`);
    return el;
  }

  /* Shared axis style: no grid, mirrored frame */
  const SCATTER_AXIS = {
    showgrid: false,
    zeroline: false,
    linecolor: '#1a1a1a',
    linewidth: 1,
    mirror: true,
    showspikes: true,
    spikecolor: '#c8c8c4',
    spikethickness: 1,
    spikedash: 'dot',
    spikemode: 'across',
    ticks: 'outside',
    ticklen: 4,
    tickcolor: '#1a1a1a',
  };

  /* ================================================================
     1. initScatter — show coverage of initial batch
     ================================================================ */
  function initScatter(divId, batch, variables) {
    const el = getDiv(divId);
    if (!el || !batch || !batch.length) return;

    const varNames = variables.map(v => v.name);
    el.innerHTML = '';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';

    let xName = varNames[0];
    let yName = varNames.length > 1 ? varNames[1] : varNames[0];

    if (varNames.length >= 2) {
      // Inline axis selectors
      const controlDiv = document.createElement('div');
      controlDiv.style.cssText = [
        'display:flex', 'gap:24px', 'align-items:center',
        'padding:10px 16px', 'border-bottom:1px solid #1a1a1a',
        'font-family:DM Sans,sans-serif', 'font-size:11px',
      ].join(';');

      const makeSelector = (label, defaultVal) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:10px;';
        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'color:#8a8a8a;text-transform:uppercase;letter-spacing:0.1em;font-size:10px;font-weight:600;';
        wrap.appendChild(lbl);

        const optionsWrap = document.createElement('div');
        optionsWrap.style.cssText = 'display:flex;gap:12px;';

        varNames.forEach(n => {
          const opt = document.createElement('span');
          opt.textContent = n;
          opt.dataset.value = n;
          opt.style.cssText = `cursor:pointer;font-size:12px;transition:color 0.15s;padding:2px 0;border-bottom:2px solid transparent;${n === defaultVal ? 'color:#1a1a1a;font-weight:600;border-bottom-color:#2B258E;' : 'color:#8a8a8a;'}`;
          opt.addEventListener('click', () => {
            optionsWrap.querySelectorAll('span').forEach(o => {
              o.style.color = '#8a8a8a';
              o.style.fontWeight = '400';
              o.style.borderBottomColor = 'transparent';
            });
            opt.style.color = '#1a1a1a';
            opt.style.fontWeight = '600';
            opt.style.borderBottomColor = '#2B258E';
          });
          optionsWrap.appendChild(opt);
        });

        wrap.appendChild(optionsWrap);
        return { wrap, optionsWrap, getValue: () => {
          const active = optionsWrap.querySelector('span[style*="font-weight: 600"], span[style*="font-weight:600"]');
          return active ? active.dataset.value : defaultVal;
        }};
      };

      const xSel = makeSelector('X axis', xName);
      const ySel = makeSelector('Y axis', yName);
      controlDiv.appendChild(xSel.wrap);
      controlDiv.appendChild(ySel.wrap);
      el.appendChild(controlDiv);

      const plotDiv = document.createElement('div');
      el.appendChild(plotDiv);

      const redraw = () => _drawInitScatter(plotDiv, batch, xSel.getValue(), ySel.getValue(), variables);
      controlDiv.addEventListener('click', () => setTimeout(redraw, 10));
      redraw();

    } else {
      const plotDiv = document.createElement('div');
      el.appendChild(plotDiv);
      _drawInitScatter1D(plotDiv, batch, xName);
    }
  }

  function _drawInitScatter(el, batch, xName, yName) {
    const xVals = batch.map(row => row[xName]);
    const yVals = batch.map(row => row[yName]);

    const trace = {
      x: xVals,
      y: yVals,
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: '#1a1a1a',
        size: 8,
        opacity: 0.85,
        line: { color: '#FAFAF8', width: 1.5 },
      },
      hovertemplate: `<b>${xName}</b>: %{x:.4g}<br><b>${yName}</b>: %{y:.4g}<extra></extra>`,
    };

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 24, b: 56, l: 56, r: 24 },
      xaxis: Object.assign({}, SCATTER_AXIS, { title: { text: xName, font: { size: 11 } } }),
      yaxis: Object.assign({}, SCATTER_AXIS, { title: { text: yName, font: { size: 11 } } }),
      hovermode: 'closest',
      showlegend: false,
      height: 360,
    };

    el.style.cssText = 'max-width:360px;width:100%;aspect-ratio:1;';
    Plotly.newPlot(el, [trace], layout, PLOTLY_CONFIG);
  }

  function _drawInitScatter1D(el, batch, xName) {
    const xVals = batch.map(row => row[xName]);

    const trace = {
      x: xVals,
      y: xVals.map(() => 0),
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: '#1a1a1a',
        size: 8,
        opacity: 0.85,
        line: { color: '#FAFAF8', width: 1.5 },
      },
      hovertemplate: `<b>${xName}</b>: %{x:.4g}<extra></extra>`,
    };

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 24, b: 56, l: 24, r: 24 },
      xaxis: Object.assign({}, SCATTER_AXIS, { title: { text: xName, font: { size: 11 } } }),
      yaxis: { visible: false, showgrid: false, zeroline: false, range: [-0.5, 0.5], mirror: true, linecolor: '#1a1a1a', linewidth: 1 },
      hovermode: 'closest',
      showlegend: false,
      height: 160,
    };

    Plotly.newPlot(el, [trace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     2. responseSurface1D — GP mean (blue) + CI (blue shade) + observed
     ================================================================ */
  function responseSurface1D(divId, data, varName, objName) {
    const el = getDiv(divId);
    if (!el || !data) return;

    const ciTrace = {
      x: [...data.x, ...data.x.slice().reverse()],
      y: [...data.upper, ...data.lower.slice().reverse()],
      fill: 'toself',
      fillcolor: ACCENT_LIGHT,
      line: { color: 'transparent' },
      type: 'scatter',
      mode: 'lines',
      showlegend: false,
      hoverinfo: 'skip',
      name: '95% CI',
    };

    const meanTrace = {
      x: data.x,
      y: data.mean,
      type: 'scatter',
      mode: 'lines',
      line: { color: ACCENT, width: 2 },
      name: 'GP mean',
      hovertemplate: `${varName}: %{x:.4g}<br>${objName}: %{y:.4g}<extra>GP mean</extra>`,
    };

    const obsTrace = {
      x: data.x_obs,
      y: data.y_obs,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: '#1a1a1a',
        size: 7,
        symbol: 'circle',
        line: { color: '#FAFAF8', width: 1 },
      },
      name: 'Observed',
      hovertemplate: `${varName}: %{x:.4g}<br>${objName}: %{y:.4g}<extra>Observed</extra>`,
    };

    const layout = mergeLayout({
      xaxis: { title: { text: varName, font: { size: 11 } } },
      yaxis: { title: { text: objName, font: { size: 11 } } },
      height: 300,
    });

    Plotly.newPlot(el, [ciTrace, meanTrace, obsTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     3. responseSurface2D — contour heatmap + scatter overlay
     ================================================================ */
  function responseSurface2D(divId, data, xVar, yVar, objName) {
    const el = getDiv(divId);
    if (!el || !data) return;

    const contourTrace = {
      x: data.x,
      y: data.y,
      z: data.z,
      type: 'contour',
      colorscale: [[0, 'rgba(43,37,142,0.05)'], [0.5, 'rgba(43,37,142,0.3)'], [1, 'rgba(43,37,142,0.7)']],
      contours: { coloring: 'heatmap' },
      showscale: true,
      colorbar: {
        thickness: 12,
        len: 0.75,
        tickfont: { size: 10, family: 'DM Sans' },
        title: { text: objName, font: { size: 10, family: 'DM Sans' }, side: 'right' },
      },
      hovertemplate: `${xVar}: %{x:.4g}<br>${yVar}: %{y:.4g}<br>${objName}: %{z:.4g}<extra></extra>`,
    };

    const scatterTrace = {
      x: data.x_obs,
      y: data.y_obs,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: '#1a1a1a',
        size: 7,
        symbol: 'circle',
        line: { color: '#ffffff', width: 1.5 },
      },
      name: 'Observed',
      hovertemplate: `${xVar}: %{x:.4g}<br>${yVar}: %{y:.4g}<extra>Observed</extra>`,
    };

    el.style.cssText = 'max-width:400px;width:100%;aspect-ratio:1;';
    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 24, b: 56, l: 56, r: 70 },
      xaxis: Object.assign({}, SCATTER_AXIS, { title: { text: xVar, font: { size: 11 } } }),
      yaxis: Object.assign({}, SCATTER_AXIS, { title: { text: yVar, font: { size: 11 } } }),
      showlegend: false,
    };

    Plotly.newPlot(el, [contourTrace, scatterTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     4. progress — observed values + best-so-far (blue)
     ================================================================ */
  function progress(divId, data, objName) {
    const el = getDiv(divId);
    if (!el || !data) return;

    const observedTrace = {
      x: data.x,
      y: data.observed,
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#8a8a8a', width: 1.5 },
      marker: { color: '#8a8a8a', size: 6 },
      name: 'Observed',
      hovertemplate: `Exp %{x}<br>${objName}: %{y:.4g}<extra>Observed</extra>`,
    };

    const bestTrace = {
      x: data.x,
      y: data.best,
      type: 'scatter',
      mode: 'lines',
      line: { color: ACCENT, width: 2.5 },
      name: 'Best so far',
      hovertemplate: `Exp %{x}<br>Best: %{y:.4g}<extra>Best so far</extra>`,
    };

    const layout = mergeLayout({
      xaxis: {
        title: { text: 'Experiment #', font: { size: 11 } },
        tickformat: 'd',
      },
      yaxis: { title: { text: objName, font: { size: 11 } } },
      height: 260,
    });

    Plotly.newPlot(el, [observedTrace, bestTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     5. paretoFront — dominated (grey) + Pareto front (blue stars)
     ================================================================ */
  function paretoFront(divId, data) {
    const el = getDiv(divId);
    if (!el || !data) return;

    const domTrace = {
      x: (data.dominated || []).map(p => p.x),
      y: (data.dominated || []).map(p => p.y),
      type: 'scatter',
      mode: 'markers',
      marker: { color: '#c0c0c0', size: 8, symbol: 'circle', line: { color: '#8a8a8a', width: 1 } },
      name: 'Dominated',
      hovertemplate: `%{x:.4g}, %{y:.4g}<extra>Dominated</extra>`,
    };

    const paretoSorted = (data.pareto || []).slice().sort((a, b) => a.x - b.x);
    const px = paretoSorted.map(p => p.x);
    const py = paretoSorted.map(p => p.y);

    const paretoLine = {
      x: px,
      y: py,
      type: 'scatter',
      mode: 'lines',
      line: { color: ACCENT, width: 1.5, dash: 'dash' },
      showlegend: false,
      hoverinfo: 'skip',
    };

    const paretoTrace = {
      x: px,
      y: py,
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: ACCENT,
        size: 11,
        symbol: 'star',
        line: { color: '#1a1660', width: 1 },
      },
      name: 'Pareto front',
      hovertemplate: `%{x:.4g}, %{y:.4g}<extra>Pareto</extra>`,
    };

    const layout = mergeLayout({
      xaxis: { title: { text: data.x_label || 'Objective 1', font: { size: 11 } } },
      yaxis: { title: { text: data.y_label || 'Objective 2', font: { size: 11 } } },
      height: 340,
    });

    Plotly.newPlot(el, [domTrace, paretoLine, paretoTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     6. suggestionsContour — GP contour + existing + BO suggestions
     ================================================================ */
  function suggestionsContour(divId, rsData, suggestions, existing, xVar, yVar, objName) {
    const el = getDiv(divId);
    if (!el || !rsData) return;

    const contourTrace = {
      x: rsData.x,
      y: rsData.y,
      z: rsData.z,
      type: 'contour',
      colorscale: [[0, 'rgba(43,37,142,0.05)'], [0.5, 'rgba(43,37,142,0.3)'], [1, 'rgba(43,37,142,0.7)']],
      contours: { coloring: 'heatmap' },
      showscale: true,
      colorbar: {
        thickness: 12,
        len: 0.75,
        tickfont: { size: 10, family: 'DM Sans' },
        title: { text: objName, font: { size: 10, family: 'DM Sans' }, side: 'right' },
      },
      hovertemplate: `${xVar}: %{x:.4g}<br>${yVar}: %{y:.4g}<br>${objName}: %{z:.4g}<extra></extra>`,
    };

    const existTrace = {
      x: (existing || []).map(e => e.variable_values[xVar]),
      y: (existing || []).map(e => e.variable_values[yVar]),
      type: 'scatter',
      mode: 'markers',
      marker: { color: '#666', size: 6, symbol: 'circle', line: { color: '#fff', width: 1 } },
      name: 'Observed',
      hovertemplate: `${xVar}: %{x:.4g}<br>${yVar}: %{y:.4g}<extra>Observed</extra>`,
    };

    const suggestTrace = {
      x: (suggestions || []).map(e => e.variable_values[xVar]),
      y: (suggestions || []).map(e => e.variable_values[yVar]),
      type: 'scatter',
      mode: 'markers',
      marker: { color: '#1a1a1a', size: 12, symbol: 'circle', line: { color: '#fff', width: 2 } },
      name: 'Suggested',
      hovertemplate: `${xVar}: %{x:.4g}<br>${yVar}: %{y:.4g}<extra>Suggested</extra>`,
    };

    el.style.cssText = 'max-width:540px;width:100%;aspect-ratio:1;';
    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 24, b: 60, l: 60, r: 80 },
      xaxis: Object.assign({}, SCATTER_AXIS, { title: { text: xVar, font: { size: 11 } } }),
      yaxis: Object.assign({}, SCATTER_AXIS, { title: { text: yVar, font: { size: 11 } } }),
      showlegend: true,
      legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top', bgcolor: 'rgba(250,250,248,0.85)', bordercolor: '#1a1a1a', borderwidth: 1, font: { size: 10 } },
    };

    Plotly.newPlot(el, [contourTrace, existTrace, suggestTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     7. partialDependencePlot — single 1D PDP
     ================================================================ */
  function partialDependencePlot(divId, plot, objName) {
    const el = getDiv(divId);
    if (!el || !plot) return;

    const ciTrace = {
      x: [...plot.x_plot, ...plot.x_plot.slice().reverse()],
      y: [...plot.upper, ...plot.lower.slice().reverse()],
      fill: 'toself',
      fillcolor: ACCENT_LIGHT,
      line: { color: 'transparent' },
      type: 'scatter',
      mode: 'lines',
      showlegend: false,
      hoverinfo: 'skip',
    };

    const meanTrace = {
      x: plot.x_plot,
      y: plot.mean,
      type: 'scatter',
      mode: 'lines',
      line: { color: ACCENT, width: 2 },
      showlegend: false,
      hovertemplate: `${plot.variable}: %{x:.4g}<br>${objName}: %{y:.4g}<extra></extra>`,
    };

    const obsTrace = {
      x: plot.x_data,
      y: plot.y_data,
      type: 'scatter',
      mode: 'markers',
      marker: { color: 'rgba(180,180,180,0.9)', size: 6, symbol: 'circle', line: { color: '#aaa', width: 1 } },
      showlegend: false,
      hovertemplate: `${plot.variable}: %{x:.4g}<br>${objName}: %{y:.4g}<extra>Observed</extra>`,
    };

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 28, b: 50, l: 52, r: 16 },
      xaxis: {
        title: { text: plot.variable, font: { size: 11 } },
        showgrid: false, zeroline: false,
        linecolor: '#1a1a1a', linewidth: 1, mirror: true,
        ticks: 'outside', ticklen: 4, tickcolor: '#1a1a1a',
      },
      yaxis: {
        title: { text: objName, font: { size: 11 } },
        showgrid: false, zeroline: false,
        linecolor: '#1a1a1a', linewidth: 1, mirror: true,
        ticks: 'outside', ticklen: 4, tickcolor: '#1a1a1a',
      },
      showlegend: false,
      height: 280,
    };

    Plotly.newPlot(el, [ciTrace, meanTrace, obsTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     8. parityPlot — predicted vs actual
     ================================================================ */
  function parityPlot(divId, data) {
    const el = getDiv(divId);
    if (!el || !data) return;

    const allVals = [...data.actual, ...data.predicted];
    const lo = Math.min(...allVals);
    const hi = Math.max(...allVals);
    const pad = (hi - lo) * 0.12 || Math.abs(lo) * 0.1 || 0.1;

    const identityTrace = {
      x: [lo - pad, hi + pad],
      y: [lo - pad, hi + pad],
      type: 'scatter',
      mode: 'lines',
      line: { color: '#c0c0bc', width: 1.5, dash: 'dash' },
      showlegend: false,
      hoverinfo: 'skip',
    };

    const scatterTrace = {
      x: data.predicted,
      y: data.actual,
      type: 'scatter',
      mode: 'markers',
      marker: { color: ACCENT, size: 8, opacity: 0.85, line: { color: '#1a1660', width: 1 } },
      showlegend: false,
      hovertemplate: `Predicted: %{x:.4g}<br>Actual: %{y:.4g}<extra></extra>`,
    };

    el.style.cssText = 'width:100%;aspect-ratio:1;';
    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 24, b: 54, l: 54, r: 16 },
      xaxis: {
        title: { text: 'Predicted', font: { size: 11 } },
        showgrid: false, zeroline: false,
        linecolor: '#1a1a1a', linewidth: 1, mirror: true,
        ticks: 'outside', ticklen: 4, tickcolor: '#1a1a1a',
        range: [lo - pad, hi + pad],
      },
      yaxis: {
        title: { text: 'Actual', font: { size: 11 } },
        showgrid: false, zeroline: false,
        linecolor: '#1a1a1a', linewidth: 1, mirror: true,
        ticks: 'outside', ticklen: 4, tickcolor: '#1a1a1a',
        range: [lo - pad, hi + pad],
      },
      showlegend: false,
    };

    Plotly.newPlot(el, [identityTrace, scatterTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     9. residualsPlot — bar chart
     ================================================================ */
  function residualsPlot(divId, data) {
    const el = getDiv(divId);
    if (!el || !data) return;

    const n = data.residuals.length;
    const xs = Array.from({ length: n }, (_, i) => i + 1);

    const residTrace = {
      x: xs,
      y: data.residuals,
      type: 'bar',
      marker: {
        color: data.residuals.map(r =>
          Math.abs(r) > 2 ? '#ef4444' : Math.abs(r) > 1 ? '#f59e0b' : ACCENT
        ),
        opacity: 0.8,
      },
      showlegend: false,
      hovertemplate: `Exp %{x}<br>%{y:.2f} σ<extra></extra>`,
    };

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'DM Sans', size: 11, color: '#8a8a8a' },
      margin: { t: 24, b: 50, l: 50, r: 16 },
      xaxis: {
        title: { text: 'Experiment', font: { size: 11 } },
        tickformat: 'd',
        showgrid: false, zeroline: false,
        linecolor: '#1a1a1a', linewidth: 1, mirror: true,
        ticks: 'outside', ticklen: 4, tickcolor: '#1a1a1a',
      },
      yaxis: {
        title: { text: 'Residual (σ)', font: { size: 11 } },
        showgrid: false,
        zeroline: true, zerolinecolor: '#c0c0bc', zerolinewidth: 1.5,
        linecolor: '#1a1a1a', linewidth: 1, mirror: true,
        ticks: 'outside', ticklen: 4, tickcolor: '#1a1a1a',
      },
      shapes: [
        { type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: -1, y1: 1,
          fillcolor: 'rgba(43,37,142,0.06)', line: { width: 0 } },
        { type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: -2, y1: 2,
          fillcolor: 'rgba(43,37,142,0.02)', line: { width: 0 } },
      ],
      showlegend: false,
      height: 280,
    };

    Plotly.newPlot(el, [residTrace], layout, PLOTLY_CONFIG);
  }

  /* ================================================================
     10. clear — purge a Plotly div
     ================================================================ */
  function clear(divId) {
    const el = getDiv(divId);
    if (el) {
      Plotly.purge(el);
      el.innerHTML = '';
    }
  }

  /* ── Public API ── */
  return { initScatter, responseSurface1D, responseSurface2D, progress, paretoFront,
           suggestionsContour, partialDependencePlot, parityPlot, residualsPlot, clear };

})();
