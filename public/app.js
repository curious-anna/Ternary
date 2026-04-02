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

// ── Variable Color System ─────────────────────────────────────────────────────

const VAR_COLORS = 10; // number of color classes
let varColorMap = {};   // { varName: colorIndex }

const DEF_COLORS = 8; // number of definition color classes
let defColorMap = {};  // { defLabel: colorIndex }

function assignVariableColors(text) {
  varColorMap = {};
  const vars = [];
  const re = /\$[a-zA-Z_][a-zA-Z0-9_]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!vars.includes(m[0])) vars.push(m[0]);
  }
  vars.forEach((v, i) => { varColorMap[v] = i % VAR_COLORS; });
}

function assignDefinitionColors(text) {
  defColorMap = {};
  const defs = [];
  // Match definition labels from Where: section: [Label] = ...
  const defRe = /^\s+\[([^\]]+)\]\s*=/gm;
  let m;
  while ((m = defRe.exec(text)) !== null) {
    if (!defs.includes(m[1])) defs.push(m[1]);
  }
  defs.forEach((d, i) => { defColorMap[d] = i % DEF_COLORS; });
}

function buildVariableLegend() {
  const vars = Object.keys(varColorMap);
  if (vars.length === 0) return '';
  const items = vars.map(v => {
    const ci = varColorMap[v];
    return `<span class="var-legend-item var-color-${ci}" data-var="${v}"><span class="var-legend-dot"></span>${v}</span>`;
  }).join('');
  return `<div class="var-legend" title="Variables">${items}</div>`;
}

function buildDefinitionLegend() {
  const defs = Object.keys(defColorMap);
  if (defs.length === 0) return '';
  const items = defs.map(d => {
    const ci = defColorMap[d];
    return `<span class="def-legend-item def-color-${ci}" data-def="${escapeHtml(d)}"><span class="def-legend-dot"></span>[${escapeHtml(d)}]</span>`;
  }).join('');
  return `<div class="def-legend" title="Definitions">${items}</div>`;
}

function varSpan(varName) {
  const ci = varColorMap[varName] !== undefined ? varColorMap[varName] : 0;
  return `<span class="token-variable var-color-${ci}" data-var="${varName}">${varName}</span>`;
}

function defSpan(label, inner) {
  const ci = defColorMap[label] !== undefined ? defColorMap[label] : 0;
  return `<span class="token-def-ref def-color-${ci}" data-def="${escapeHtml(label)}">[${inner}]</span>`;
}

function highlightExplanation(text) {
  // Process line-by-line for better control
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    // Check for special line types
    if (/^---$/.test(line.trim())) return '<hr style="border-color:#334155;margin:14px 0">';

    // "Where:" header
    if (/^Where:/.test(line.trim())) {
      return `<div class="where-header">Where:</div>`;
    }

    // Formula header lines
    const headerMatch = line.match(/^(This formula computes:|This expression simply returns:|This formula has \d+ decision points?\.)(.*)$/);
    if (headerMatch) {
      return `<span class="token-formula-header">${escapeHtml(headerMatch[1])}</span>${headerMatch[2] ? tokenizeLine(headerMatch[2]) : ''}`;
    }

    // Definition lines: [Label] = detail
    const defMatch = line.match(/^(\s+)\[([^\]]+)\]\s*=\s*(.+)$/);
    if (defMatch) {
      const indent = defMatch[1].replace(/ /g, '&nbsp;');
      const label = defMatch[2];
      const ci = defColorMap[label] !== undefined ? defColorMap[label] : 0;
      const detail = tokenizeLine(defMatch[3]);
      return `${indent}<span class="token-def-label def-color-${ci}" data-def="${escapeHtml(label)}">[${escapeHtml(label)}]</span> <span class="token-operator">=</span> ${detail}`;
    }

    return tokenizeLine(line);
  });
  return htmlLines.join('<br />');
}

function tokenizeLine(line) {
  // Tokenize with a comprehensive regex
  const tokenRegex = /\[([^\]]+)\]|Step \d+:|Check whether |Structure:|Detected patterns:|✓ If YES → |✗ If NO  → |return |go to |clamped between |rounded to nearest |Minimum of |Maximum of | and |\$[a-zA-Z_][a-zA-Z0-9_]*|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b|\b\d+(?:\.\d+)?%?\b|<=|>=|!=|==|×|AND |OR |both |all of: |when |if |else |unless |otherwise |prorated by |[+\-*\/%]|[?:()]|\n|[ \t]+|./g;
  let result = '';
  let match;
  while ((match = tokenRegex.exec(line)) !== null) {
    const token = match[0];
    if (token === '\n') { result += '<br />'; continue; }
    if (/^[ \t]+$/.test(token)) { result += token.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;'); continue; }

    // Bracketed labels like [500 when both sai <= 0 AND pell > 0]
    if (match[1] !== undefined) {
      const bracketLabel = match[1];
      // If this matches a known definition, use colored def-ref
      if (defColorMap[bracketLabel] !== undefined) {
        result += defSpan(bracketLabel, escapeHtml(bracketLabel));
        continue;
      }
      result += `<span class="token-bracket-label">[${tokenizeBracketContent(bracketLabel)}]</span>`;
      continue;
    }

    // Step headers
    if (/^Step \d+:$/.test(token)) { result += `<span class="token-step">${token}</span>`; continue; }
    if (token === 'Check whether ') { result += `<span class="token-check">Check whether </span>`; continue; }
    if (token === 'Structure:') { result += `<span class="token-section-header">${token}</span>`; continue; }
    if (token === 'Detected patterns:') { result += `<span class="token-section-header">${token}</span>`; continue; }

    // Yes/No arrows
    if (token === '✓ If YES → ') { result += `<span class="token-yes">✓ If YES →</span> `; continue; }
    if (token === '✗ If NO  → ') { result += `<span class="token-no">✗ If NO  →</span> `; continue; }
    if (token === 'return ') { result += `<span class="token-keyword">return</span> `; continue; }
    if (token === 'go to ') { result += `<span class="token-keyword">go to</span> `; continue; }

    // Layer descriptors (clamp, round)
    if (token === 'clamped between ') { result += `<span class="token-layer">clamped between </span>`; continue; }
    if (token === 'rounded to nearest ') { result += `<span class="token-layer">rounded to nearest </span>`; continue; }
    if (token === 'Minimum of ') { result += `<span class="token-layer">Minimum of </span>`; continue; }
    if (token === 'Maximum of ') { result += `<span class="token-layer">Maximum of </span>`; continue; }

    // Connectors
    if (token === ' and ') { result += ` <span class="token-cond-word">and</span> `; continue; }

    // Variables with $ — use color map
    if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(token)) { result += varSpan(token); continue; }

    // Numbers (with commas, percentages)
    if (/^\d/.test(token)) { result += `<span class="token-number">${token}</span>`; continue; }

    // Logical keywords
    if (token === 'AND ') { result += `<span class="token-logic">AND</span> `; continue; }
    if (token === 'OR ') { result += `<span class="token-logic">OR</span> `; continue; }
    if (token === 'both ') { result += `<span class="token-logic-soft">both </span>`; continue; }
    if (token === 'all of: ') { result += `<span class="token-logic-soft">all of: </span>`; continue; }

    // Conditional words
    if (/^(when |if |else |unless |otherwise )$/.test(token)) { result += `<span class="token-cond-word">${token}</span>`; continue; }
    if (token === 'prorated by ') { result += `<span class="token-cond-word">prorated by </span>`; continue; }

    // Comparison operators
    if (/^(<=|>=|!=|==|×)$/.test(token)) { result += `<span class="token-operator">${escapeHtml(token)}</span>`; continue; }

    // Arithmetic operators
    if (/^[+\-*\/%]$/.test(token)) { result += `<span class="token-operator">${escapeHtml(token)}</span>`; continue; }

    // Parens
    if (/^[?:()]$/.test(token)) { result += `<span class="token-bracket">${token}</span>`; continue; }

    // Default
    result += escapeHtml(token);
  }
  return result;
}

function tokenizeBracketContent(content) {
  // Inside brackets, highlight variables, numbers, operators
  const innerRegex = /\$[a-zA-Z_][a-zA-Z0-9_]*|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b|\b\d+(?:\.\d+)?%?\b|<=|>=|!=|==|AND|OR|both |[+\-*\/%×]|./g;
  let result = '';
  let m;
  while ((m = innerRegex.exec(content)) !== null) {
    const t = m[0];
    if (/^\$[a-zA-Z_]/.test(t)) { result += varSpan(t); continue; }
    if (/^\d/.test(t)) { result += `<span class="token-number">${t}</span>`; continue; }
    if (/^(AND|OR)$/.test(t)) { result += `<span class="token-logic">${t}</span>`; continue; }
    if (/^(<=|>=|!=|==|[+\-*\/%×])$/.test(t)) { result += `<span class="token-operator">${escapeHtml(t)}</span>`; continue; }
    result += escapeHtml(t);
  }
  return result;
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
    resultEl.textContent = 'Please enter an expression.';
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
    assignVariableColors(formatted);
    assignDefinitionColors(formatted);
    const legend = buildVariableLegend();
    const defLegend = buildDefinitionLegend();
    explanationEl.innerHTML = `${legend}${defLegend}<div class="explain-highlighted-code">${highlightExplanation(formatted)}</div>`;

    // Wire up variable and definition hover highlighting
    wireVariableInteractivity();
    wireDefinitionInteractivity();

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
    explainerSummary.innerHTML = 'Please paste a ternary expression above.';
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
  assignVariableColors(summaryText);
  assignDefinitionColors(summaryText);
  const legend = buildVariableLegend();
  const defLegend = buildDefinitionLegend();
  const summaryHtml = `${legend}${defLegend}<div class="explain-highlighted-code">${highlightExplanation(summaryText)}</div>`;
  explainerSummary.innerHTML = summaryHtml;
  wireVariableInteractivity();
  wireDefinitionInteractivity();

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
    tablesContainer.innerHTML = '<p class="no-tables-msg">No lookup tables detected in this expression.</p>';
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
  explainerSummary.innerHTML = 'Enter a ternary expression above and click <strong>Explain</strong>.';
  excelFormulaText.textContent = '—';
  varGrid.innerHTML = '';
  traceOutput.innerHTML = 'Waiting for variable values…';
  runTraceBtn.disabled = true;
  currentExplainData = null;
  currentPseudocode = '';
  patternBadges.innerHTML = '';
  structureBox.innerHTML = '';
  tablesContainer.innerHTML = '<p class="no-tables-msg">No lookup tables detected. Explain a ternary expression first.</p>';
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

// ── Variable interactivity: hover/click to highlight all occurrences ──────────

function wireVariableInteractivity() {
  // Legend items
  document.querySelectorAll('.var-legend-item').forEach(item => {
    const varName = item.dataset.var;
    item.addEventListener('mouseenter', () => highlightVar(varName, true));
    item.addEventListener('mouseleave', () => highlightVar(varName, false));
    item.addEventListener('click', () => toggleVarPin(varName));
  });

  // Inline variable tokens
  document.querySelectorAll('.token-variable[data-var]').forEach(span => {
    const varName = span.dataset.var;
    span.addEventListener('mouseenter', () => highlightVar(varName, true));
    span.addEventListener('mouseleave', () => highlightVar(varName, false));
    span.addEventListener('click', () => toggleVarPin(varName));
  });
}

let pinnedVar = null;

function highlightVar(varName, on) {
  if (pinnedVar && pinnedVar !== varName) return; // don't override pin
  document.querySelectorAll(`.token-variable[data-var="${varName}"]`).forEach(el => {
    el.classList.toggle('var-highlight', on);
  });
  document.querySelectorAll(`.var-legend-item[data-var="${varName}"]`).forEach(el => {
    el.classList.toggle('active', on);
  });
}

function toggleVarPin(varName) {
  if (pinnedVar === varName) {
    // Unpin
    highlightVar(varName, false);
    pinnedVar = null;
  } else {
    // Unpin previous
    if (pinnedVar) highlightVar(pinnedVar, false);
    // Pin new
    pinnedVar = varName;
    highlightVar(varName, true);
  }
}

// ── Definition interactivity: hover/click to highlight all occurrences ────────

function wireDefinitionInteractivity() {
  // Legend items
  document.querySelectorAll('.def-legend-item').forEach(item => {
    const defName = item.dataset.def;
    item.addEventListener('mouseenter', () => highlightDef(defName, true));
    item.addEventListener('mouseleave', () => highlightDef(defName, false));
    item.addEventListener('click', () => toggleDefPin(defName));
  });

  // Inline definition references
  document.querySelectorAll('.token-def-ref[data-def]').forEach(span => {
    const defName = span.dataset.def;
    span.addEventListener('mouseenter', () => highlightDef(defName, true));
    span.addEventListener('mouseleave', () => highlightDef(defName, false));
    span.addEventListener('click', () => toggleDefPin(defName));
  });

  // Definition labels in Where: section
  document.querySelectorAll('.token-def-label[data-def]').forEach(span => {
    const defName = span.dataset.def;
    span.addEventListener('mouseenter', () => highlightDef(defName, true));
    span.addEventListener('mouseleave', () => highlightDef(defName, false));
    span.addEventListener('click', () => toggleDefPin(defName));
  });
}

let pinnedDef = null;

function highlightDef(defName, on) {
  if (pinnedDef && pinnedDef !== defName) return; // don't override pin
  document.querySelectorAll(`[data-def="${defName}"]`).forEach(el => {
    el.classList.toggle('def-highlight', on);
  });
}

function toggleDefPin(defName) {
  if (pinnedDef === defName) {
    highlightDef(defName, false);
    pinnedDef = null;
  } else {
    if (pinnedDef) highlightDef(pinnedDef, false);
    pinnedDef = defName;
    highlightDef(defName, true);
  }
}