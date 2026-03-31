const resultEl      = document.getElementById('result');
const explanationEl = document.getElementById('explanation');
const inputEl       = document.getElementById('excelInput');
const charCounterEl = document.getElementById('charCounter');
const validationEl  = document.getElementById('validationBadge');
const copyToastEl   = document.getElementById('copyToast');

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function highlightExplanation(text) {
  const tokenRegex = /\[\d+\]|---|Step \d+:|→ If YES:|→ If NO:|condition:|if true:|if false:|[┌├└│]|\b(IF|THEN|ELSE)\b|\$[a-zA-Z0-9_]+|\b[0-9]+(?:\.[0-9]+)?\b|<=|>=|==|!=|[+\-*\/%?:()]|\n|[ \t]+|./g;
  return text.replace(tokenRegex, (token) => {
    if (token === '\n') return '<br />';
    if (/^[ \t]+$/.test(token)) return token.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    if (/^\[\d+\]$/.test(token)) return `<span class="token-depth">${token}</span>`;
    if (token === 'condition:') return `<span class="token-label-cond">${token}</span>`;
    if (token === 'if true:') return `<span class="token-label-true">${token}</span>`;
    if (token === 'if false:') return `<span class="token-label-false">${token}</span>`;
    if (/^[┌├└│]$/.test(token)) return `<span class="token-connector">${token}</span>`;
    if (/^Step \d+:$/.test(token)) return `<span class="token-step">${token}</span>`;
    if (token === '→ If YES:') return `<span class="token-yes">${token}</span>`;
    if (token === '→ If NO:') return `<span class="token-no">${token}</span>`;
    if (token === '---') return '<hr style="border-color:#334155;margin:14px 0">';
    if (/^(IF|THEN|ELSE)$/.test(token)) return `<span class="token-keyword">${token}</span>`;
    if (/^\$[a-zA-Z0-9_]+$/.test(token)) return `<span class="token-variable">${token}</span>`;
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(token)) return `<span class="token-number">${token}</span>`;
    if (/^(<=|>=|==|!=|[+\-*\/%?:])$/.test(token)) return `<span class="token-operator">${escapeHtml(token)}</span>`;
    if (/^[()]$/.test(token)) return `<span class="token-bracket">${token}</span>`;
    return escapeHtml(token);
  });
}

function showValidationBadge(pseudocode) {
  const forbidden = /\|\|/.test(pseudocode) || /&&/.test(pseudocode) ||
    /\bAND\b/.test(pseudocode) || /\bOR\b/.test(pseudocode);
  validationEl.innerHTML = forbidden
    ? '<span class="badge-invalid">⚠️ Contains forbidden operators</span>'
    : '<span class="badge-valid">✅ Valid pseudocode</span>';
}

// ── Conversion ────────────────────────────────────────────────────────────────

async function convertFormula() {
  const input = inputEl.value.trim();
  if (!input) {
    resultEl.textContent = 'Please enter an Excel-style expression.';
    resultEl.className = 'code-output';
    explanationEl.innerHTML = '';
    validationEl.innerHTML = '';
    return;
  }

  try {
    const resp = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formula: input }),
    });

    const json = await resp.json();

    if (!resp.ok) {
      resultEl.textContent = 'Error: ' + (json.error || 'unknown');
      resultEl.className = 'code-output error';
      explanationEl.innerHTML = '';
      validationEl.innerHTML = '';
      return;
    }

    resultEl.textContent = json.pseudocode;
    resultEl.className = 'code-output';
    showValidationBadge(json.pseudocode);

    const formatted = typeof json.explanation === 'string' ? json.explanation : '';
    explanationEl.innerHTML = `<div class="explain-highlighted-code">${highlightExplanation(formatted)}</div>`;

  } catch (err) {
    resultEl.textContent = 'Network error: ' + err.message;
    resultEl.className = 'code-output error';
    explanationEl.innerHTML = '';
    validationEl.innerHTML = '';
  }
}

// ── Copy with SVG button & toast ─────────────────────────────────────────────

async function copyResult() {
  const pseudo = resultEl.textContent.trim();
  if (!pseudo || pseudo === 'Awaiting input…' || pseudo.startsWith('Error:') || pseudo.startsWith('Please') || pseudo.startsWith('Network')) {
    return;
  }
  try {
    await navigator.clipboard.writeText(pseudo);
    copyToastEl.classList.remove('hidden');
    setTimeout(() => copyToastEl.classList.add('hidden'), 2000);
  } catch (e) {
    copyToastEl.textContent = 'Copy failed';
    copyToastEl.classList.remove('hidden');
    setTimeout(() => copyToastEl.classList.add('hidden'), 2000);
  }
}

// ── Character counter ─────────────────────────────────────────────────────────

function updateCharCounter() {
  charCounterEl.textContent = inputEl.value.length + ' chars';
}

// ── Debounced live translation ────────────────────────────────────────────────

let debounceTimer = null;
inputEl.addEventListener('input', () => {
  updateCharCounter();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convertFormula, 300);
});

// ── Example chips ─────────────────────────────────────────────────────────────

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    inputEl.value = chip.dataset.formula;
    updateCharCounter();
    convertFormula();
  });
});

// ── Clear button ──────────────────────────────────────────────────────────────

document.getElementById('clearBtn').addEventListener('click', () => {
  inputEl.value = '';
  updateCharCounter();
  resultEl.textContent = 'Awaiting input…';
  resultEl.className = 'code-output';
  explanationEl.innerHTML = 'No conversion yet.';
  validationEl.innerHTML = '';
  copyToastEl.classList.add('hidden');
});

// ── Convert button & keyboard shortcut ───────────────────────────────────────

document.getElementById('convertBtn').addEventListener('click', convertFormula);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    convertFormula();
  }
});

document.getElementById('copyBtn').addEventListener('click', copyResult);

// ══════════════════════════════════════════════════════════════════════════════
// ── Pseudocode Explainer (optional feature) ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const explainerToggleBar = document.getElementById('explainerToggleBar');
const explainerToggle    = document.getElementById('explainerToggle');
const explainerPanel     = document.getElementById('explainerPanel');
const explainerInput     = document.getElementById('explainerInput');
const explainerCharCount = document.getElementById('explainerCharCounter');
const explainerSummary   = document.getElementById('explainerSummary');
const excelFormulaText   = document.getElementById('excelFormulaText');
const varGrid            = document.getElementById('varGrid');
const traceOutput        = document.getElementById('traceOutput');
const runTraceBtn        = document.getElementById('runTraceBtn');
const patternBadges      = document.getElementById('patternBadges');
const tablesContainer    = document.getElementById('tablesContainer');
const structureBox       = document.getElementById('structureBox');

let currentExplainData = null;   // latest /api/explain response
let currentPseudocode  = '';     // the pseudocode being explained

// ── Toggle explainer panel ────────────────────────────────────────────────────

explainerToggleBar.addEventListener('click', () => {
  explainerToggle.checked = !explainerToggle.checked;
  syncExplainerVisibility();
});
explainerToggle.addEventListener('change', syncExplainerVisibility);

function syncExplainerVisibility() {
  const open = explainerToggle.checked;
  explainerPanel.classList.toggle('visible', open);
  explainerToggleBar.classList.toggle('open', open);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.explainer-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.explainer-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.explainer-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// ── Explain API call ──────────────────────────────────────────────────────────

async function explainPseudocode() {
  const input = explainerInput.value.trim();
  if (!input) {
    explainerSummary.innerHTML = 'Please paste some pseudocode above.';
    excelFormulaText.textContent = '—';
    varGrid.innerHTML = '';
    traceOutput.innerHTML = 'Waiting for variable values…';
    runTraceBtn.disabled = true;
    currentExplainData = null;
    return;
  }

  currentPseudocode = input;

  try {
    const resp = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudocode: input }),
    });
    const json = await resp.json();

    if (!resp.ok) {
      explainerSummary.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(json.error || 'unknown')}</span>`;
      return;
    }

    currentExplainData = json;
    renderExplanation(json);

  } catch (err) {
    explainerSummary.innerHTML = `<span style="color:#ef4444">Network error: ${escapeHtml(err.message)}</span>`;
  }
}

// ── Render the explanation across all tabs ─────────────────────────────────────

function renderExplanation(data) {
  // ── Structure breakdown ───────────────────────────────────────────────
  if (data.structures && data.structures.length > 0) {
    let html = '<div class="structure-box">';
    html += '<div class="structure-title">Formula Structure</div>';
    for (const s of data.structures) {
      const tagCls = s.type === 'guard' ? 'guard' : s.type === 'clamp' ? 'clamp' : s.type === 'comparison' ? 'compare' : s.type === 'rounding' ? 'round' : 'guard';
      html += `<div class="structure-item">`;
      html += `<span class="structure-tag ${tagCls}">${escapeHtml(s.type)}</span>`;
      html += `<span class="structure-desc">${escapeHtml(s.description)}</span>`;
      html += '</div>';
    }
    html += '</div>';
    structureBox.innerHTML = html;
  } else {
    structureBox.innerHTML = '';
  }

  // ── Pattern badges ────────────────────────────────────────────────────
  if (data.patterns && data.patterns.length > 0) {
    let badgeHtml = '';
    for (const p of data.patterns) {
      const cls = p.type || 'default';
      const icon = p.type === 'max' ? '▲' : p.type === 'min' ? '▼' : p.type === 'round' ? '⊙' : p.type === 'roundup' ? '⊘' : p.type === 'clamp' ? '⇔' : p.type === 'conditional' ? '?' : '•';
      badgeHtml += `<span class="pattern-badge ${cls}">${icon} ${escapeHtml(p.description)}</span>`;
    }
    patternBadges.innerHTML = badgeHtml;
  } else {
    patternBadges.innerHTML = '';
  }

  // ── Summary tab ───────────────────────────────────────────────────────
  let summaryText = data.summary;
  // Strip the Structure: block from summary text since we render it separately
  summaryText = summaryText.replace(/^Structure:\n(  \[.+\]\s.+\n)*\n?/m, '');
  const summaryHtml = escapeHtml(summaryText)
    .replace(/^(Step \d+:)/gm, '<span class="step-header">$1</span>')
    .replace(/(✓ If YES →.*)/g, '<span class="yes-path">$1</span>')
    .replace(/(✗ If NO\s+→.*)/g, '<span class="no-path">$1</span>')
    .replace(/\n/g, '<br>');
  explainerSummary.innerHTML = summaryHtml;

  // ── Tables tab ────────────────────────────────────────────────────────
  if (data.tables && data.tables.length > 0) {
    tablesContainer.innerHTML = '';
    for (let ti = 0; ti < data.tables.length; ti++) {
      const table = data.tables[ti];
      const wrap = document.createElement('div');
      wrap.className = 'lookup-table-wrap';

      if (table.type === 'nested') {
        wrap.innerHTML = renderNestedTable(table, ti);
      } else {
        wrap.innerHTML = renderFlatTable(table, ti);
      }
      tablesContainer.appendChild(wrap);
    }
    // Wire up tier toggles
    tablesContainer.querySelectorAll('.tier-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        hdr.classList.toggle('open');
        const body = hdr.nextElementSibling;
        if (body) body.classList.toggle('open');
      });
    });
  } else {
    tablesContainer.innerHTML = '<p class="no-tables-msg">No lookup tables detected in this pseudocode.</p>';
  }

  // ── Excel tab ─────────────────────────────────────────────────────────
  excelFormulaText.textContent = data.excelFormula || '—';

  // ── Try-It tab ────────────────────────────────────────────────────────
  varGrid.innerHTML = '';
  if (data.variables.length === 0) {
    varGrid.innerHTML = '<p style="color:#64748b;font-size:13px">No variables detected.</p>';
    runTraceBtn.disabled = true;
  } else {
    for (const v of data.variables) {
      const card = document.createElement('div');
      card.className = 'var-card';
      const name = v.startsWith('$') ? v.slice(1) : v;
      card.innerHTML =
        `<label><span>${escapeHtml(v)}</span></label>` +
        `<input type="number" data-var="${escapeHtml(name)}" placeholder="0" step="any" />`;
      varGrid.appendChild(card);
    }
    runTraceBtn.disabled = false;
  }
  traceOutput.innerHTML = 'Enter values above and click <strong>Run</strong>.';
}

// ── Table rendering helpers ──────────────────────────────────────────────────

function formatResultCell(row) {
  let html = `<span class="lt-result">${escapeHtml(row.result)}</span>`;
  if (row.formulaDesc) {
    html += `<span class="lt-formula-desc">${escapeHtml(row.formulaDesc)}</span>`;
  }
  return html;
}

function renderFlatTable(table, idx) {
  const varClean = escapeHtml(table.variable);
  const rowCount = table.rows.length;
  let html = `<div class="lookup-table-title">${escapeHtml(table.title)} <span class="lt-badge">${rowCount} rows</span></div>`;
  html += '<table class="lookup-table"><thead><tr>';
  html += `<th>Condition (${varClean})</th><th>Result</th>`;
  html += '</tr></thead><tbody>';
  for (const row of table.rows) {
    const isDefault = row.threshold === 'otherwise';
    const cls = isDefault ? ' class="lt-default"' : '';
    const condText = isDefault ? 'Otherwise (default)' : `${varClean} ${escapeHtml(row.op)} ${escapeHtml(row.threshold)}`;
    html += `<tr${cls}>`;
    html += `<td class="lt-threshold">${condText}</td>`;
    html += `<td>${formatResultCell(row)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderNestedTable(table, idx) {
  const outerVar = escapeHtml(table.outerVariable);
  const innerVar = escapeHtml(table.innerVariable);
  let html = `<div class="lookup-table-title">${escapeHtml(table.title)} <span class="lt-badge">${table.tiers.length} tiers</span></div>`;

  for (let i = 0; i < table.tiers.length; i++) {
    const tier = table.tiers[i];
    const tierLabel = `${outerVar} ${escapeHtml(tier.op)} ${escapeHtml(tier.threshold)}`;
    const isFirst = i === 0;
    html += `<div class="tier-header${isFirst ? ' open' : ''}" data-tier="${i}">`;
    html += `<span class="tier-arrow">▶</span> ${tierLabel}`;
    html += `<span class="lt-badge">${tier.rows.length} rows</span>`;
    html += '</div>';
    html += `<div class="tier-body${isFirst ? ' open' : ''}">`;
    html += `<table class="lookup-table"><thead><tr>`;
    html += `<th>Condition (${innerVar})</th><th>Result</th>`;
    html += '</tr></thead><tbody>';
    for (const row of tier.rows) {
      const isDefault = row.threshold === 'otherwise';
      const cls = isDefault ? ' class="lt-default"' : '';
      const condText = isDefault ? 'Otherwise (default)' : `${innerVar} ${escapeHtml(row.op)} ${escapeHtml(row.threshold)}`;
      html += `<tr${cls}>`;
      html += `<td class="lt-threshold">${condText}</td>`;
      html += `<td>${formatResultCell(row)}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  if (table.defaultResult) {
    html += `<div style="margin-top:8px;padding:8px 14px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#854d0e">`;
    html += `<strong>Default (no tier matched):</strong> ${escapeHtml(table.defaultResult.text)}`;
    html += '</div>';
  }

  return html;
}

// ── Run trace (Try It) ───────────────────────────────────────────────────────

async function runTrace() {
  if (!currentPseudocode) return;

  // Gather values from inputs
  const values = {};
  let allFilled = true;
  varGrid.querySelectorAll('input[data-var]').forEach(inp => {
    const name = inp.dataset.var;
    if (inp.value.trim() === '') {
      allFilled = false;
    } else {
      values[name] = parseFloat(inp.value);
    }
  });

  if (!allFilled) {
    traceOutput.innerHTML = '<span class="trace-error">Please fill in all variable values.</span>';
    return;
  }

  try {
    const resp = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudocode: currentPseudocode, values }),
    });
    const json = await resp.json();

    if (json.error) {
      traceOutput.innerHTML = `<span class="trace-error">${escapeHtml(json.error)}</span>`;
      return;
    }

    renderTrace(json, values);
  } catch (err) {
    traceOutput.innerHTML = `<span class="trace-error">Network error: ${escapeHtml(err.message)}</span>`;
  }
}

function renderTrace(data, values) {
  let html = '';

  // Show variable values
  html += '<div style="margin-bottom:12px;color:#94a3b8">';
  html += Object.entries(values)
    .map(([k, v]) => `<span class="token-variable">$${escapeHtml(k)}</span> = <span class="token-number">${v}</span>`)
    .join('&nbsp;&nbsp;│&nbsp;&nbsp;');
  html += '</div>';

  // Show trace steps
  for (let i = 0; i < data.trace.length; i++) {
    const t = data.trace[i];
    if (t.type === 'condition') {
      const icon = t.result ? '✓' : '✗';
      const cls = t.result ? 'trace-yes' : 'trace-no';
      html += `<div class="trace-step">`;
      html += `<span class="trace-check">Check:</span> ${escapeHtml(t.condition)} `;
      html += `<span class="${cls}"> → ${icon} ${t.result ? 'YES' : 'NO'}</span>`;
      html += `</div>`;
    } else if (t.type === 'result') {
      html += `<div class="trace-result">Final Result: ${t.value}</div>`;
    }
  }

  traceOutput.innerHTML = html;
}

// ── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('explainBtn').addEventListener('click', explainPseudocode);
runTraceBtn.addEventListener('click', runTrace);

// Char counter
explainerInput.addEventListener('input', () => {
  explainerCharCount.textContent = explainerInput.value.length + ' chars';
});

// Example chips
document.querySelectorAll('.explainer-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    explainerInput.value = chip.dataset.pseudo;
    explainerCharCount.textContent = explainerInput.value.length + ' chars';
    explainPseudocode();
  });
});

// Clear
document.getElementById('explainerClearBtn').addEventListener('click', () => {
  explainerInput.value = '';
  explainerCharCount.textContent = '0 chars';
  explainerSummary.innerHTML = 'Enter pseudocode above and click <strong>Explain</strong>.';
  excelFormulaText.textContent = '—';
  varGrid.innerHTML = '';
  traceOutput.innerHTML = 'Waiting for variable values…';
  runTraceBtn.disabled = true;
  currentExplainData = null;
  currentPseudocode = '';
  patternBadges.innerHTML = '';
  structureBox.innerHTML = '';
  tablesContainer.innerHTML = '<p class="no-tables-msg">No lookup tables detected. Explain some pseudocode first.</p>';
});

// Keyboard shortcut for explain
explainerInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    explainPseudocode();
  }
});

// Allow pressing Enter in var inputs to run trace
varGrid.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    e.preventDefault();
    runTrace();
  }
});