import { toPseudocode } from './convert.js';
import { explainPseudocode as explainConverter, evaluateWithTrace } from './explain.js';
import {
  escapeHtml, renderBracketColoredText, applyBracketPairColorizationToHtml,
  assignVariableColors, assignDefinitionColors, buildVariableLegend, buildDefinitionLegend,
  highlightExplanation, wireVariableInteractivity, wireDefinitionInteractivity,
} from './highlight.js';

// ── DOM refs ──────────────────────────────────────────────────────────

const resultEl      = document.getElementById('result');
const explanationEl = document.getElementById('explanation');
const inputEl       = document.getElementById('excelInput');
const inputMirrorEl = document.getElementById('excelInputMirror');
const charCounterEl = document.getElementById('charCounter');
const validationEl  = document.getElementById('validationBadge');
const copyToastEl   = document.getElementById('copyToast');

// ── Converter panel ───────────────────────────────────────────────────

function setCodeOutput(text, isError = false) {
  resultEl.innerHTML = renderBracketColoredText(text);
  resultEl.className = isError ? 'code-output error' : 'code-output';
}

function syncEditorMirror(textareaEl, mirrorEl) {
  const shell = textareaEl?.closest('.editor-shell');
  const value = textareaEl?.value ?? '';
  if (mirrorEl) mirrorEl.innerHTML = value ? renderBracketColoredText(value) : '';
  if (shell) shell.classList.toggle('has-content', value.length > 0);
  if (mirrorEl) { mirrorEl.scrollTop = textareaEl.scrollTop; mirrorEl.scrollLeft = textareaEl.scrollLeft; }
}

function showValidationBadge(pseudocode) {
  const forbidden = /\|\|/.test(pseudocode) || /&&/.test(pseudocode) || /\bAND\b/.test(pseudocode) || /\bOR\b/.test(pseudocode);
  validationEl.innerHTML = forbidden
    ? '<span class="badge-invalid">⚠️ Contains forbidden operators</span>'
    : '<span class="badge-valid">✅ Valid pseudocode</span>';
}

function convertFormula() {
  const input = inputEl.value.trim();
  if (!input) {
    setCodeOutput('Please enter an expression.');
    explanationEl.innerHTML = '';
    validationEl.innerHTML = '';
    return;
  }
  try {
    const { pseudocode, explanation } = toPseudocode(input);
    setCodeOutput(pseudocode);
    showValidationBadge(pseudocode);
    const text = explanation || '';
    assignVariableColors(text);
    assignDefinitionColors(text);
    explanationEl.innerHTML =
      buildVariableLegend() + buildDefinitionLegend() +
      `<div class="explain-highlighted-code">${applyBracketPairColorizationToHtml(highlightExplanation(text))}</div>`;
    wireVariableInteractivity();
    wireDefinitionInteractivity();
  } catch (err) {
    setCodeOutput('Error: ' + err.message, true);
    explanationEl.innerHTML = '';
    validationEl.innerHTML = '';
  }
}

async function copyResult() {
  const text = resultEl.textContent.trim();
  if (!text || text === 'Awaiting input…' || text.startsWith('Error:') || text.startsWith('Please')) return;
  try {
    await navigator.clipboard.writeText(text);
    copyToastEl.textContent = '✅ Copied!';
  } catch {
    copyToastEl.textContent = 'Copy failed';
  }
  copyToastEl.classList.remove('hidden');
  setTimeout(() => copyToastEl.classList.add('hidden'), 2000);
}

let debounceTimer = null;
inputEl.addEventListener('input', () => {
  charCounterEl.textContent = inputEl.value.length + ' chars';
  syncEditorMirror(inputEl, inputMirrorEl);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convertFormula, 300);
});
inputEl.addEventListener('scroll', () => syncEditorMirror(inputEl, inputMirrorEl));
document.getElementById('convertBtn').addEventListener('click', convertFormula);
document.getElementById('clearBtn').addEventListener('click', () => {
  inputEl.value = '';
  charCounterEl.textContent = '0 chars';
  syncEditorMirror(inputEl, inputMirrorEl);
  setCodeOutput('Awaiting input…');
  explanationEl.innerHTML = 'No conversion yet.';
  validationEl.innerHTML = '';
  copyToastEl.classList.add('hidden');
});
document.getElementById('copyBtn').addEventListener('click', copyResult);
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    inputEl.value = chip.dataset.formula;
    charCounterEl.textContent = inputEl.value.length + ' chars';
    syncEditorMirror(inputEl, inputMirrorEl);
    convertFormula();
  });
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); convertFormula(); }
});

// ── Explainer panel ───────────────────────────────────────────────────

const explainerToggleBar = document.getElementById('explainerToggleBar');
const explainerToggle    = document.getElementById('explainerToggle');
const explainerPanel     = document.getElementById('explainerPanel');
const explainerInput     = document.getElementById('explainerInput');
const explainerMirrorEl  = document.getElementById('explainerInputMirror');
const explainerCharCount = document.getElementById('explainerCharCounter');
const explainerSummary   = document.getElementById('explainerSummary');
const excelFormulaText   = document.getElementById('excelFormulaText');
const varGrid            = document.getElementById('varGrid');
const traceOutput        = document.getElementById('traceOutput');
const runTraceBtn        = document.getElementById('runTraceBtn');
const patternBadges      = document.getElementById('patternBadges');
const tablesContainer    = document.getElementById('tablesContainer');
const structureBox       = document.getElementById('structureBox');

let currentPseudocode = '';

function syncExplainerVisibility() {
  const open = explainerToggle.checked;
  explainerPanel.classList.toggle('visible', open);
  explainerToggleBar.classList.toggle('open', open);
}
explainerToggleBar.addEventListener('click', () => { explainerToggle.checked = !explainerToggle.checked; syncExplainerVisibility(); });
explainerToggle.addEventListener('change', syncExplainerVisibility);

document.querySelectorAll('.explainer-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.explainer-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.explainer-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

function explainPseudocodeUI() {
  const input = explainerInput.value.trim();
  if (!input) {
    explainerSummary.innerHTML = 'Please paste a ternary expression above.';
    excelFormulaText.textContent = '—';
    varGrid.innerHTML = '';
    traceOutput.innerHTML = 'Waiting for variable values…';
    runTraceBtn.disabled = true;
    return;
  }
  currentPseudocode = input;
  try {
    renderExplanation(explainConverter(input));
  } catch (err) {
    explainerSummary.innerHTML = `<span style="color:#ef4444">Error: ${escapeHtml(err.message)}</span>`;
  }
}

function renderExplanation(data) {
  // Structure box
  if (data.structures?.length > 0) {
    let html = '<div class="structure-box"><div class="structure-title">Formula Structure</div>';
    for (const s of data.structures) {
      const tagCls = { guard: 'guard', clamp: 'clamp', comparison: 'compare', rounding: 'round' }[s.type] || 'guard';
      html += `<div class="structure-item"><span class="structure-tag ${tagCls}">${escapeHtml(s.type)}</span><span class="structure-desc">${escapeHtml(s.description)}</span></div>`;
    }
    structureBox.innerHTML = html + '</div>';
  } else {
    structureBox.innerHTML = '';
  }

  // Pattern badges
  if (data.patterns?.length > 0) {
    const icons = { max: '▲', min: '▼', round: '⊙', roundup: '⊘', clamp: '⇔', conditional: '?' };
    patternBadges.innerHTML = data.patterns.map(p =>
      `<span class="pattern-badge ${p.type || 'default'}">${icons[p.type] || '•'} ${escapeHtml(p.description)}</span>`
    ).join('');
  } else {
    patternBadges.innerHTML = '';
  }

  // Summary
  const summaryText = (data.summary || '').replace(/^Structure:\n(  \[.+\]\s.+\n)*\n?/m, '');
  assignVariableColors(summaryText);
  assignDefinitionColors(summaryText);
  explainerSummary.innerHTML =
    buildVariableLegend() + buildDefinitionLegend() +
    `<div class="explain-highlighted-code">${applyBracketPairColorizationToHtml(highlightExplanation(summaryText))}</div>`;
  wireVariableInteractivity();
  wireDefinitionInteractivity();

  // Lookup tables
  if (data.tables?.length > 0) {
    tablesContainer.innerHTML = '';
    for (const table of data.tables) {
      const wrap = document.createElement('div');
      wrap.className = 'lookup-table-wrap';
      wrap.innerHTML = table.type === 'nested' ? renderNestedTable(table) : renderFlatTable(table);
      tablesContainer.appendChild(wrap);
    }
    tablesContainer.querySelectorAll('.tier-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        hdr.classList.toggle('open');
        hdr.nextElementSibling?.classList.toggle('open');
      });
    });
  } else {
    tablesContainer.innerHTML = '<p class="no-tables-msg">No lookup tables detected in this expression.</p>';
  }

  // Excel formula
  excelFormulaText.innerHTML = renderBracketColoredText(data.excelFormula || '—');

  // Variable input grid
  varGrid.innerHTML = '';
  if (!data.variables?.length) {
    varGrid.innerHTML = '<p style="color:#64748b;font-size:13px">No variables detected.</p>';
    runTraceBtn.disabled = true;
  } else {
    for (const v of data.variables) {
      const card = document.createElement('div');
      card.className = 'var-card';
      const name = v.startsWith('$') ? v.slice(1) : v;
      card.innerHTML = `<label><span>${escapeHtml(v)}</span></label><input type="number" data-var="${escapeHtml(name)}" placeholder="0" step="any" />`;
      varGrid.appendChild(card);
    }
    runTraceBtn.disabled = false;
  }
  traceOutput.innerHTML = 'Enter values above and click <strong>Run</strong>.';
}

// ── Table rendering ───────────────────────────────────────────────────

function formatResultCell(row) {
  let html = `<span class="lt-result">${escapeHtml(row.result)}</span>`;
  if (row.formulaDesc) html += `<span class="lt-formula-desc">${escapeHtml(row.formulaDesc)}</span>`;
  return html;
}

function renderFlatTable(table) {
  const v = escapeHtml(table.variable);
  let html = `<div class="lookup-table-title">${escapeHtml(table.title)} <span class="lt-badge">${table.rows.length} rows</span></div>`;
  html += `<table class="lookup-table"><thead><tr><th>Condition (${v})</th><th>Result</th></tr></thead><tbody>`;
  for (const row of table.rows) {
    const isDefault = row.threshold === 'otherwise';
    const condText  = isDefault ? 'Otherwise (default)' : `${v} ${escapeHtml(row.op)} ${escapeHtml(row.threshold)}`;
    html += `<tr${isDefault ? ' class="lt-default"' : ''}><td class="lt-threshold">${condText}</td><td>${formatResultCell(row)}</td></tr>`;
  }
  return html + '</tbody></table>';
}

function renderNestedTable(table) {
  const outer = escapeHtml(table.outerVariable);
  const inner = escapeHtml(table.innerVariable);
  let html = `<div class="lookup-table-title">${escapeHtml(table.title)} <span class="lt-badge">${table.tiers.length} tiers</span></div>`;
  for (let i = 0; i < table.tiers.length; i++) {
    const tier = table.tiers[i];
    const label = `${outer} ${escapeHtml(tier.op)} ${escapeHtml(tier.threshold)}`;
    html += `<div class="tier-header${i === 0 ? ' open' : ''}"><span class="tier-arrow">▶</span> ${label}<span class="lt-badge">${tier.rows.length} rows</span></div>`;
    html += `<div class="tier-body${i === 0 ? ' open' : ''}"><table class="lookup-table"><thead><tr><th>Condition (${inner})</th><th>Result</th></tr></thead><tbody>`;
    for (const row of tier.rows) {
      const isDefault = row.threshold === 'otherwise';
      const condText  = isDefault ? 'Otherwise (default)' : `${inner} ${escapeHtml(row.op)} ${escapeHtml(row.threshold)}`;
      html += `<tr${isDefault ? ' class="lt-default"' : ''}><td class="lt-threshold">${condText}</td><td>${formatResultCell(row)}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }
  if (table.defaultResult) {
    html += `<div style="margin-top:8px;padding:8px 14px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#854d0e"><strong>Default (no tier matched):</strong> ${escapeHtml(table.defaultResult.text)}</div>`;
  }
  return html;
}

// ── Try It (trace evaluator) ──────────────────────────────────────────

function runTrace() {
  if (!currentPseudocode) return;
  const values = {};
  let allFilled = true;
  varGrid.querySelectorAll('input[data-var]').forEach(inp => {
    if (!inp.value.trim()) allFilled = false;
    else values[inp.dataset.var] = parseFloat(inp.value);
  });
  if (!allFilled) { traceOutput.innerHTML = '<span class="trace-error">Please fill in all variable values.</span>'; return; }
  try {
    renderTrace(evaluateWithTrace(currentPseudocode, values), values);
  } catch (err) {
    traceOutput.innerHTML = `<span class="trace-error">${escapeHtml(err.message)}</span>`;
  }
}

function renderTrace(data, values) {
  let html = '<div style="margin-bottom:12px;color:#94a3b8">';
  html += Object.entries(values).map(([k, v]) =>
    `<span class="token-variable">$${escapeHtml(k)}</span> = <span class="token-number">${v}</span>`
  ).join('&nbsp;&nbsp;│&nbsp;&nbsp;');
  html += '</div>';
  for (const t of data.trace) {
    if (t.type === 'condition') {
      html += `<div class="trace-step"><span class="trace-check">Check:</span> ${escapeHtml(t.condition)} <span class="${t.result ? 'trace-yes' : 'trace-no'}"> → ${t.result ? '✓ YES' : '✗ NO'}</span></div>`;
    } else if (t.type === 'result') {
      html += `<div class="trace-result">Final Result: ${t.value}</div>`;
    }
  }
  traceOutput.innerHTML = html;
}

// ── Explainer event listeners ─────────────────────────────────────────

document.getElementById('explainBtn').addEventListener('click', explainPseudocodeUI);
runTraceBtn.addEventListener('click', runTrace);

explainerInput.addEventListener('input', () => {
  explainerCharCount.textContent = explainerInput.value.length + ' chars';
  syncEditorMirror(explainerInput, explainerMirrorEl);
});
explainerInput.addEventListener('scroll', () => syncEditorMirror(explainerInput, explainerMirrorEl));
explainerInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); explainPseudocodeUI(); }
});

document.querySelectorAll('.explainer-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    explainerInput.value = chip.dataset.pseudo;
    explainerCharCount.textContent = explainerInput.value.length + ' chars';
    syncEditorMirror(explainerInput, explainerMirrorEl);
    explainPseudocodeUI();
  });
});

document.getElementById('explainerClearBtn').addEventListener('click', () => {
  explainerInput.value = '';
  explainerCharCount.textContent = '0 chars';
  syncEditorMirror(explainerInput, explainerMirrorEl);
  explainerSummary.innerHTML = 'Enter a ternary expression above and click <strong>Explain</strong>.';
  excelFormulaText.textContent = '—';
  varGrid.innerHTML = '';
  traceOutput.innerHTML = 'Waiting for variable values…';
  runTraceBtn.disabled = true;
  currentPseudocode = '';
  patternBadges.innerHTML = '';
  structureBox.innerHTML = '';
  tablesContainer.innerHTML = '<p class="no-tables-msg">No lookup tables detected. Explain a ternary expression first.</p>';
});

varGrid.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); runTrace(); }
});

// ── Init ──────────────────────────────────────────────────────────────

syncEditorMirror(inputEl, inputMirrorEl);
syncEditorMirror(explainerInput, explainerMirrorEl);
