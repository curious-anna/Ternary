// Syntax highlighting, variable color system, and hover/pin interactivity.

export function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ── Bracket colorization ──────────────────────────────────────────────

const OPEN_BRACKETS  = new Set(['(', '[', '{']);
const CLOSE_BRACKETS = new Set([')', ']', '}']);
const DEPTH_COLORS   = 6;

export function renderBracketColoredText(text) {
  let html = '', depth = 0;
  for (const ch of text) {
    if (OPEN_BRACKETS.has(ch)) {
      html += `<span class="token-bracket-pair bracket-depth-${depth % DEPTH_COLORS}">${escapeHtml(ch)}</span>`;
      depth++;
    } else if (CLOSE_BRACKETS.has(ch)) {
      depth = Math.max(depth - 1, 0);
      html += `<span class="token-bracket-pair bracket-depth-${depth % DEPTH_COLORS}">${escapeHtml(ch)}</span>`;
    } else {
      html += escapeHtml(ch);
    }
  }
  return html;
}

// Like renderBracketColoredText but operates on already-rendered HTML,
// skipping characters inside HTML tags.
export function applyBracketPairColorizationToHtml(html) {
  let output = '', depth = 0, inTag = false;
  for (const ch of html) {
    if (ch === '<') { inTag = true; output += ch; continue; }
    if (inTag) { output += ch; if (ch === '>') inTag = false; continue; }
    if (OPEN_BRACKETS.has(ch)) {
      output += `<span class="token-bracket-pair bracket-depth-${depth % DEPTH_COLORS}">${ch}</span>`;
      depth++;
    } else if (CLOSE_BRACKETS.has(ch)) {
      depth = Math.max(depth - 1, 0);
      output += `<span class="token-bracket-pair bracket-depth-${depth % DEPTH_COLORS}">${ch}</span>`;
    } else {
      output += ch;
    }
  }
  return output;
}

// ── Variable / definition color system ───────────────────────────────

const VAR_COLORS = 10;
const DEF_COLORS = 8;
let varColorMap = {};
let defColorMap = {};

export function assignVariableColors(text) {
  varColorMap = {};
  const vars = [];
  let m;
  const re = /\$[a-zA-Z_][a-zA-Z0-9_]*/g;
  while ((m = re.exec(text)) !== null) {
    if (!vars.includes(m[0])) vars.push(m[0]);
  }
  vars.forEach((v, i) => { varColorMap[v] = i % VAR_COLORS; });
}

export function assignDefinitionColors(text) {
  defColorMap = {};
  const defs = [];
  let m;
  const re = /^\s+\[([^\]]+)\]\s*=/gm;
  while ((m = re.exec(text)) !== null) {
    if (!defs.includes(m[1])) defs.push(m[1]);
  }
  defs.forEach((d, i) => { defColorMap[d] = i % DEF_COLORS; });
}

export function buildVariableLegend() {
  const vars = Object.keys(varColorMap);
  if (!vars.length) return '';
  const items = vars.map(v =>
    `<span class="var-legend-item var-color-${varColorMap[v]}" data-var="${v}"><span class="var-legend-dot"></span>${v}</span>`
  ).join('');
  return `<div class="var-legend">${items}</div>`;
}

export function buildDefinitionLegend() {
  const defs = Object.keys(defColorMap);
  if (!defs.length) return '';
  const items = defs.map(d =>
    `<span class="def-legend-item def-color-${defColorMap[d]}" data-def="${escapeHtml(d)}"><span class="def-legend-dot"></span>[${escapeHtml(d)}]</span>`
  ).join('');
  return `<div class="def-legend">${items}</div>`;
}

function varSpan(varName) {
  const ci = varColorMap[varName] !== undefined ? varColorMap[varName] : 0;
  return `<span class="token-variable var-color-${ci}" data-var="${varName}">${varName}</span>`;
}

function defSpan(label, inner) {
  const ci = defColorMap[label] !== undefined ? defColorMap[label] : 0;
  return `<span class="token-def-ref def-color-${ci}" data-def="${escapeHtml(label)}">[${inner}]</span>`;
}

// ── Tokenization ──────────────────────────────────────────────────────

function tokenizeBracketContent(content) {
  const re = /\$[a-zA-Z_][a-zA-Z0-9_]*|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b|\b\d+(?:\.\d+)?%?\b|<=|>=|!=|==|AND|OR|both |[+\-*\/%×]|./g;
  let result = '', m;
  while ((m = re.exec(content)) !== null) {
    const t = m[0];
    if (/^\$[a-zA-Z_]/.test(t)) { result += varSpan(t); continue; }
    if (/^\d/.test(t)) { result += `<span class="token-number">${t}</span>`; continue; }
    if (/^(AND|OR)$/.test(t)) { result += `<span class="token-logic">${t}</span>`; continue; }
    if (/^(<=|>=|!=|==|[+\-*\/%×])$/.test(t)) { result += `<span class="token-operator">${escapeHtml(t)}</span>`; continue; }
    result += escapeHtml(t);
  }
  return result;
}

export function highlightExplanation(text) {
  return text.split('\n').map(line => {
    if (/^---$/.test(line.trim())) return '<hr style="border-color:#334155;margin:14px 0">';
    if (/^Where:/.test(line.trim())) return `<div class="where-header">Where:</div>`;

    const headerMatch = line.match(/^(This formula computes:|This expression simply returns:|This formula has \d+ decision points?\.)(.*)$/);
    if (headerMatch) return `<span class="token-formula-header">${escapeHtml(headerMatch[1])}</span>${headerMatch[2] ? tokenizeLine(headerMatch[2]) : ''}`;

    const defMatch = line.match(/^(\s+)\[([^\]]+)\]\s*=\s*(.+)$/);
    if (defMatch) {
      const indent = defMatch[1].replace(/ /g, '&nbsp;');
      const label  = defMatch[2];
      const ci = defColorMap[label] !== undefined ? defColorMap[label] : 0;
      return `${indent}<span class="token-def-label def-color-${ci}" data-def="${escapeHtml(label)}">[${escapeHtml(label)}]</span> <span class="token-operator">=</span> ${tokenizeLine(defMatch[3])}`;
    }
    return tokenizeLine(line);
  }).join('<br />');
}

function tokenizeLine(line) {
  const re = /\[([^\]]+)\]|Step \d+:|Check whether |Structure:|Detected patterns:|✓ If YES → |✗ If NO  → |return |go to |clamped between |rounded to nearest |Minimum of |Maximum of | and |\$[a-zA-Z_][a-zA-Z0-9_]*|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b|\b\d+(?:\.\d+)?%?\b|<=|>=|!=|==|×|AND |OR |both |all of: |when |if |else |unless |otherwise |prorated by |[+\-*\/%]|[?:()]|\n|[ \t]+|./g;
  let result = '', match;
  while ((match = re.exec(line)) !== null) {
    const token = match[0];
    if (token === '\n') { result += '<br />'; continue; }
    if (/^[ \t]+$/.test(token)) { result += token.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;'); continue; }

    if (match[1] !== undefined) {
      const label = match[1];
      if (defColorMap[label] !== undefined) { result += defSpan(label, escapeHtml(label)); continue; }
      result += `<span class="token-bracket-label">[${tokenizeBracketContent(label)}]</span>`;
      continue;
    }

    if (/^Step \d+:$/.test(token))        { result += `<span class="token-step">${token}</span>`; continue; }
    if (token === 'Check whether ')        { result += `<span class="token-check">Check whether </span>`; continue; }
    if (token === 'Structure:' || token === 'Detected patterns:') { result += `<span class="token-section-header">${token}</span>`; continue; }
    if (token === '✓ If YES → ')           { result += `<span class="token-yes">✓ If YES →</span> `; continue; }
    if (token === '✗ If NO  → ')           { result += `<span class="token-no">✗ If NO  →</span> `; continue; }
    if (token === 'return ')               { result += `<span class="token-keyword">return</span> `; continue; }
    if (token === 'go to ')               { result += `<span class="token-keyword">go to</span> `; continue; }
    if (token === 'clamped between ')      { result += `<span class="token-layer">clamped between </span>`; continue; }
    if (token === 'rounded to nearest ')   { result += `<span class="token-layer">rounded to nearest </span>`; continue; }
    if (token === 'Minimum of ')           { result += `<span class="token-layer">Minimum of </span>`; continue; }
    if (token === 'Maximum of ')           { result += `<span class="token-layer">Maximum of </span>`; continue; }
    if (token === ' and ')                 { result += ` <span class="token-cond-word">and</span> `; continue; }
    if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(token)) { result += varSpan(token); continue; }
    if (/^\d/.test(token))                { result += `<span class="token-number">${token}</span>`; continue; }
    if (token === 'AND ')                 { result += `<span class="token-logic">AND</span> `; continue; }
    if (token === 'OR ')                  { result += `<span class="token-logic">OR</span> `; continue; }
    if (token === 'both ')                { result += `<span class="token-logic-soft">both </span>`; continue; }
    if (token === 'all of: ')             { result += `<span class="token-logic-soft">all of: </span>`; continue; }
    if (/^(when |if |else |unless |otherwise )$/.test(token)) { result += `<span class="token-cond-word">${token}</span>`; continue; }
    if (token === 'prorated by ')         { result += `<span class="token-cond-word">prorated by </span>`; continue; }
    if (/^(<=|>=|!=|==|×)$/.test(token)) { result += `<span class="token-operator">${escapeHtml(token)}</span>`; continue; }
    if (/^[+\-*\/%]$/.test(token))       { result += `<span class="token-operator">${escapeHtml(token)}</span>`; continue; }
    if (/^[?:()]$/.test(token))           { result += `<span class="token-bracket">${token}</span>`; continue; }
    result += escapeHtml(token);
  }
  return result;
}

// ── Variable / definition interactivity ──────────────────────────────

let pinnedVar = null;
let pinnedDef = null;

function highlightVar(varName, on) {
  if (pinnedVar && pinnedVar !== varName) return;
  document.querySelectorAll(`.token-variable[data-var="${varName}"]`).forEach(el => el.classList.toggle('var-highlight', on));
  document.querySelectorAll(`.var-legend-item[data-var="${varName}"]`).forEach(el => el.classList.toggle('active', on));
}

function toggleVarPin(varName) {
  if (pinnedVar === varName) { highlightVar(varName, false); pinnedVar = null; }
  else { if (pinnedVar) highlightVar(pinnedVar, false); pinnedVar = varName; highlightVar(varName, true); }
}

function highlightDef(defName, on) {
  if (pinnedDef && pinnedDef !== defName) return;
  document.querySelectorAll(`[data-def="${defName}"]`).forEach(el => el.classList.toggle('def-highlight', on));
}

function toggleDefPin(defName) {
  if (pinnedDef === defName) { highlightDef(defName, false); pinnedDef = null; }
  else { if (pinnedDef) highlightDef(pinnedDef, false); pinnedDef = defName; highlightDef(defName, true); }
}

export function wireVariableInteractivity() {
  document.querySelectorAll('.var-legend-item').forEach(item => {
    const v = item.dataset.var;
    item.addEventListener('mouseenter', () => highlightVar(v, true));
    item.addEventListener('mouseleave', () => highlightVar(v, false));
    item.addEventListener('click', () => toggleVarPin(v));
  });
  document.querySelectorAll('.token-variable[data-var]').forEach(span => {
    const v = span.dataset.var;
    span.addEventListener('mouseenter', () => highlightVar(v, true));
    span.addEventListener('mouseleave', () => highlightVar(v, false));
    span.addEventListener('click', () => toggleVarPin(v));
  });
}

export function wireDefinitionInteractivity() {
  ['.def-legend-item', '.token-def-ref[data-def]', '.token-def-label[data-def]'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const d = el.dataset.def;
      el.addEventListener('mouseenter', () => highlightDef(d, true));
      el.addEventListener('mouseleave', () => highlightDef(d, false));
      el.addEventListener('click', () => toggleDefPin(d));
    });
  });
}
