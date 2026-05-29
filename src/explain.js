import { parseTernaryStructure, stripDisplayParens, balanceParens, safeEval } from './parse.js';

// ── Definitions Registry ──────────────────────────────────────────────
// Short [Label] references keep inline descriptions readable; the full
// detail is printed once in the "Where:" section at the bottom.

let _definitions = [];
let _definitionIndex = 0;

function resetDefinitions() { _definitions = []; _definitionIndex = 0; }

function getDefinitions() { return _definitions; }

function addDefinition(baseName, detail) {
  const existing = _definitions.find(d => d.detail === detail || d.detail.trim() === detail.trim());
  if (existing) return existing.label;
  _definitionIndex++;
  let label = baseName;
  const taken = _definitions.filter(d =>
    d.label === label || d.label.match(new RegExp('^' + baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\d+$'))
  );
  if (taken.length > 0) label = `${baseName} ${taken.length + 1}`;
  _definitions.push({ label, detail });
  return label;
}

// ── Number formatting ─────────────────────────────────────────────────

function formatNum(n) {
  if (typeof n === 'string') n = parseFloat(n.replace(/,/g, ''));
  if (isNaN(n)) return String(n);
  const parts = n.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function formatExprNumbers(expr) {
  let s = expr;
  // Simplify pure arithmetic within the expression: "3000 + 2000" → "5,000"
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*([+\-*])\s*(\d+(?:\.\d+)?)\b/g, (m, a, op, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (isNaN(na) || isNaN(nb)) return m;
    let r;
    if (op === '+') r = na + nb;
    else if (op === '-') r = na - nb;
    else r = na * nb;
    return formatNum(r);
  });
  s = s.replace(/\b(\d{4,})(?:\.\d+)?\b/g, m => {
    const n = parseFloat(m);
    return isNaN(n) ? m : formatNum(n);
  });
  s = s.replace(/\s*\*\s*/g, ' × ');
  return s;
}

// ── Lookup chain helpers ──────────────────────────────────────────────

function extractLookupChain(expr) {
  const parsed = parseTernaryStructure(expr);
  if (parsed.type !== 'ternary') return null;
  const tiers = [];
  let current = parsed;
  let chainVar = null;
  while (current.type === 'ternary') {
    const cond = stripDisplayParens(current.conditionRaw || '');
    const m = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|>|<=|<|==)\s*(.+)$/);
    if (!m) break;
    const [, varName, op, threshold] = m;
    if (!chainVar) chainVar = varName;
    else if (varName !== chainVar) break;
    const trueVal = current.trueVal.type === 'value' ? stripDisplayParens(current.trueVal.content) : null;
    if (!trueVal) break;
    tiers.push({ threshold: threshold.trim(), op, value: trueVal });
    current = current.falseVal;
  }
  if (tiers.length < 2) return null;
  const defaultVal = current.type === 'value' ? stripDisplayParens(current.content) : null;
  if (!defaultVal) return null;
  return { variable: chainVar, tiers, defaultValue: defaultVal };
}

function isRateChain(chain) {
  const values = [...chain.tiers.map(t => parseFloat(t.value)), parseFloat(chain.defaultValue)];
  return values.every(v => !isNaN(v) && v > 0 && v <= 1);
}

function describeLookupChainEnglish(chain) {
  const isRate = isRateChain(chain);
  const fmt = v => isRate ? `${(parseFloat(v) * 100).toFixed(0)}%` : formatNum(parseFloat(v));
  const rows = chain.tiers.map(t => `${fmt(t.value)} if ${chain.variable} ${t.op} ${formatNum(parseFloat(t.threshold))}`);
  rows.push(`${fmt(chain.defaultValue)} otherwise`);
  return rows.join('; ');
}

function registerChainDefinition(chain) {
  const varName = chain.variable.replace(/^\$/, '');
  const baseName = `${varName} ${isRateChain(chain) ? 'Rate' : 'Amount'}`;
  return addDefinition(baseName, describeLookupChainEnglish(chain));
}

// ── Arithmetic term splitters ─────────────────────────────────────────

function splitMultiplicativeAtDepth0(expr) {
  const factors = [];
  let depth = 0, start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;
    else if (depth === 0 && expr[i] === '*') { factors.push(expr.slice(start, i).trim()); start = i + 1; }
  }
  factors.push(expr.slice(start).trim());
  return factors.filter(Boolean);
}

// Splits on additive +/- at depth 0, treating only binary operators (not unary minus).
function splitArithmeticTerms(expr) {
  const terms = [];
  let depth = 0, start = 0, sign = '+';
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
      const before = expr.slice(0, i).trimEnd();
      const lastChar = before[before.length - 1];
      if (lastChar && !/[+\-*\/%(<>=!?:]/.test(lastChar)) {
        terms.push({ sign, term: expr.slice(start, i).trim() });
        sign = ch;
        start = i + 1;
      }
    }
  }
  if (start < expr.length) terms.push({ sign, term: expr.slice(start).trim() });
  return terms.filter(t => t.term);
}

// ── Comparison helpers ────────────────────────────────────────────────

// Finds the rightmost comparison operator at depth 0.
function findOutermostComparison(expr) {
  let depth = 0, lastOp = null, lastPos = -1, lastLen = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') { depth++; continue; }
    if (expr[i] === ')') { depth--; continue; }
    if (depth !== 0) continue;
    if (i + 1 < expr.length) {
      const two = expr.slice(i, i + 2);
      if (['>=', '<=', '==', '!='].includes(two)) { lastOp = two; lastPos = i; lastLen = 2; i++; continue; }
    }
    if (expr[i] === '>' && expr[i + 1] !== '=') { lastOp = '>'; lastPos = i; lastLen = 1; }
    else if (expr[i] === '<' && expr[i + 1] !== '=' && expr[i + 1] !== '>') { lastOp = '<'; lastPos = i; lastLen = 1; }
  }
  if (!lastOp || lastPos <= 0) return null;
  return { left: expr.slice(0, lastPos).trim(), op: lastOp, right: expr.slice(lastPos + lastLen).trim() };
}

// Like findOutermostComparison but also tracks [] depth (for simplified strings with [Label] refs).
function findComparisonInSimplified(s) {
  let depth = 0, lastOp = null, lastPos = -1, lastLen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') { depth++; continue; }
    if (s[i] === ')' || s[i] === ']') { depth--; continue; }
    if (depth !== 0) continue;
    if (i + 1 < s.length) {
      const two = s.slice(i, i + 2);
      if (['>=', '<=', '==', '!='].includes(two)) { lastOp = two; lastPos = i; lastLen = 2; i++; continue; }
    }
    if (s[i] === '>' && s[i + 1] !== '=') { lastOp = '>'; lastPos = i; lastLen = 1; }
    else if (s[i] === '<' && s[i + 1] !== '=' && s[i + 1] !== '>') { lastOp = '<'; lastPos = i; lastLen = 1; }
  }
  if (!lastOp || lastPos <= 0) return null;
  return { left: s.slice(0, lastPos).trim(), op: lastOp, right: s.slice(lastPos + lastLen).trim() };
}

// ── AND / OR flag pattern detection ──────────────────────────────────

function extractFlagFromContent(content) {
  let qPos = -1, cPos = -1, gDepth = 0;
  for (let k = content.length - 1; k >= 0; k--) {
    if (content[k] === ')') gDepth++;
    else if (content[k] === '(') gDepth--;
    else if (gDepth === 0 && content[k] === ':' && cPos < 0) cPos = k;
    else if (gDepth === 0 && content[k] === '?' && cPos >= 0 && qPos < 0) qPos = k;
  }
  if (qPos < 0 || cPos < 0) return null;
  if (content.slice(qPos + 1, cPos).trim() !== '1' || content.slice(cPos + 1).trim() !== '0') return null;
  return content.slice(0, qPos).trim();
}

function extractFlagGroups(sumExpr) {
  let s = sumExpr.trim();
  // Strip fully-wrapping outer parens
  while (s.startsWith('(')) {
    let depth = 1, j = 1;
    while (j < s.length && depth > 0) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
    if (j === s.length) s = s.slice(1, -1).trim(); else break;
  }
  const groups = [];
  let i = 0;
  while (i < s.length) {
    if (/[\s+]/.test(s[i])) { i++; continue; }
    if (s[i] === '(') {
      let depth = 1, j = i + 1;
      while (j < s.length && depth > 0) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
      const group = s.slice(i + 1, j - 1).trim();
      const flag = extractFlagFromContent(group);
      if (flag === null) return null;
      groups.push(flag);
      i = j;
    } else {
      const remainder = s.slice(i).trim();
      if (groups.length === 0) { const flag = extractFlagFromContent(remainder); if (flag !== null) return [flag]; }
      return null;
    }
  }
  return groups.length >= 1 ? groups : null;
}

// Returns { type: 'and'|'or', conditions, count } or null.
function parseAndOrPattern(cond) {
  const cmp = findOutermostComparison(cond.trim());
  if (!cmp) return null;
  if (cmp.op === '==' && /^\d+$/.test(cmp.right.trim())) {
    const flags = extractFlagGroups(cmp.left);
    if (flags?.length >= 1) return { type: 'and', conditions: flags, count: parseInt(cmp.right.trim()) };
  }
  if ((cmp.op === '>' && cmp.right.trim() === '0') || (cmp.op === '>=' && cmp.right.trim() === '1')) {
    const flags = extractFlagGroups(cmp.left);
    if (flags?.length >= 1) return { type: 'or', conditions: flags };
  }
  return null;
}

function describeFlagCondition(cond, formatter) {
  const nested = parseAndOrPattern(cond);
  if (nested) {
    const subs = nested.conditions.map(c => describeFlagCondition(c, formatter));
    const prefix = nested.type === 'and' ? (subs.length === 2 ? 'both ' : subs.length > 2 ? 'all of: ' : '') : '';
    return nested.type === 'and' ? `(${prefix}${subs.join(' AND ')})` : `(${subs.join(' OR ')})`;
  }
  return formatter(cond);
}

// ── English description ───────────────────────────────────────────────

function autoShortenIfLong(desc, baseName, threshold = 60) {
  if (desc.length <= threshold || /^\[.+\]$/.test(desc)) return desc;
  return `[${addDefinition(baseName, desc)}]`;
}

function conditionToEnglish(cond) {
  const andOr = parseAndOrPattern(cond);
  if (andOr) {
    if (andOr.conditions.length === 1 && (andOr.count === 1 || andOr.type === 'or'))
      return describeFlagCondition(andOr.conditions[0], conditionToEnglish);
    const subs = andOr.conditions.map(c => describeFlagCondition(c, conditionToEnglish));
    return andOr.type === 'and' ? subs.join(' AND ') : subs.join(' OR ');
  }
  if (cond.includes('?') && cond.length > 80) {
    const outerCmp = findOutermostComparison(cond);
    if (outerCmp) {
      const lName = /\bif\b/.test(describeArithmeticExpr(outerCmp.left)) ? 'Option A' : 'Amount A';
      const rName = /\bif\b/.test(describeArithmeticExpr(outerCmp.right)) ? 'Option B' : 'Amount B';
      return `${autoShortenIfLong(describeArithmeticExpr(outerCmp.left), lName, 55)} ${outerCmp.op} ${autoShortenIfLong(describeArithmeticExpr(outerCmp.right), rName, 55)}`;
    }
    return autoShortenIfLong(describeArithmeticExpr(cond), 'Condition', 80);
  }
  // Simple condition — format numbers nicely, simplify arithmetic thresholds
  let s = cond;
  s = s.replace(/\((\d+(?:\.\d+)?\s*[+\-*/]\s*\d+(?:\.\d+)?)\)/g, (m, e) => {
    try { const v = safeEval(e); if (!isNaN(v)) return formatNum(v); } catch {}
    return m;
  });
  s = s.replace(/(?<!\$)\b(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?\b/g, m => {
    const n = parseFloat(m.replace(/,/g, ''));
    return !isNaN(n) ? formatNum(n) : m;
  });
  return s;
}

// Simpler condition-to-English that avoids recursive ternary expansion.
function conditionToEnglishSimple(cond) {
  let s = simplifyEmbeddedTernaries(cond.trim());
  s = formatExprNumbers(s);
  s = s.replace(/\s*\*\s*/g, ' × ');
  if (s.length > 80) {
    const comp = findComparisonInSimplified(s);
    if (comp?.left.length > 40) {
      const label = addDefinition('Eligibility', stripDisplayParens(comp.left.trim()));
      s = `[${label}] ${comp.op} ${comp.right}`;
    }
  }
  return s;
}

// Replaces parenthesized ternary sub-expressions with concise [Label] refs.
// Avoids calling conditionToEnglishSimple or describeEmbeddedTernary to prevent recursion.
function simplifyEmbeddedTernaries(s) {
  let result = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '(') { result += s[i++]; continue; }
    let depth = 1, j = i + 1;
    while (j < s.length && depth > 0) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
    const group = s.slice(i, j);
    if (!group.includes('?') || !group.includes(':')) {
      result += '(' + simplifyEmbeddedTernaries(group.slice(1, -1)) + ')';
      i = j; continue;
    }
    const chain = extractLookupChain(group);
    if (chain) { result += `[${registerChainDefinition(chain)}]`; i = j; continue; }
    const simplified = simplifyEmbeddedTernaries(group.slice(1, -1));
    if (!simplified.includes('?') || !simplified.includes(':')) { result += '(' + simplified + ')'; i = j; continue; }
    const flagParsed = parseTernaryStructure(simplified);
    if (flagParsed.type === 'ternary') {
      const fTV = flagParsed.trueVal.type === 'value' ? stripDisplayParens(flagParsed.trueVal.content) : null;
      const fFV = flagParsed.falseVal.type === 'value' ? stripDisplayParens(flagParsed.falseVal.content) : null;
      if (fTV === '1' && fFV === '0') { result += '(' + simplified + ')'; i = j; continue; } // preserve flag for AND/OR detection
    }
    const chain2 = extractLookupChain('(' + simplified + ')');
    if (chain2) { result += `[${registerChainDefinition(chain2)}]`; i = j; continue; }
    const parsed = parseTernaryStructure(simplified);
    if (parsed.type === 'ternary') {
      const tV = parsed.trueVal.type === 'value' ? stripDisplayParens(parsed.trueVal.content) : null;
      const fV = parsed.falseVal.type === 'value' ? stripDisplayParens(parsed.falseVal.content) : null;
      if (tV && fV && !tV.includes('?') && !fV.includes('?')) {
        const rawCond = formatExprNumbers(stripDisplayParens(parsed.conditionRaw || ''));
        const tVfmt = formatExprNumbers(tV), fVfmt = formatExprNumbers(fV);
        if (tVfmt.includes('[') || fVfmt.includes('[')) {
          result += `[${addDefinition('Amount', `${tVfmt} if ${rawCond}, else ${fVfmt}`)}]`;
        } else {
          result += `[${tVfmt} if ${rawCond}, else ${fVfmt}]`;
        }
        i = j; continue;
      }
    }
    result += '(' + simplified + ')';
    i = j;
  }
  return result;
}

function valueToEnglish(val) {
  val = val.trim();
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(val)) return val;
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(val)) return formatNum(parseFloat(val));
  if (/^\d+(\.\d+)?\s*[+\-*]\s*\d+(\.\d+)?$/.test(val)) {
    try { const v = safeEval(val); if (!isNaN(v)) return formatNum(v); } catch {}
  }
  if (val.includes('?') && val.includes(':')) {
    const desc = describeArithmeticExpr(val);
    if (desc) return autoShortenIfLong(desc, 'Result', 60);
  }
  const formatted = formatExprNumbers(val);
  return formatted.length > 60 && !formatted.startsWith('[')
    ? autoShortenIfLong(formatted, 'Amount', 60) : formatted;
}

// ── Layered pattern detection (clamp + round) ─────────────────────────

function normalizeWS(s) { return s.replace(/\s+/g, ''); }

function extractComparisonParts(expr, op) {
  let depth = 0;
  for (let i = expr.length - 1; i >= 0; i--) {
    if (expr[i] === ')') depth++;
    else if (expr[i] === '(') depth--;
    else if (depth === 0 && expr[i] === op && expr[i - 1] !== '=' && expr[i + 1] !== '=') {
      const left = expr.slice(0, i).trim(), right = expr.slice(i + 1).trim();
      if (left && right) return { left, right };
    }
  }
  return null;
}

function extractModuloComparison(expr) {
  const cmpParts = extractComparisonParts(expr, '<');
  if (!cmpParts) return null;
  const half = parseInt(cmpParts.right.trim());
  if (isNaN(half)) return null;
  const leftSide = stripDisplayParens(cmpParts.left.trim());
  let depth = 0, modIdx = -1;
  for (let i = leftSide.length - 1; i >= 0; i--) {
    if (leftSide[i] === ')') depth++;
    else if (leftSide[i] === '(') depth--;
    else if (depth === 0 && leftSide[i] === '%') { modIdx = i; break; }
  }
  if (modIdx < 0) return null;
  const baseExpr = leftSide.slice(0, modIdx).trim();
  const step = parseInt(leftSide.slice(modIdx + 1).trim());
  if (isNaN(step) || !baseExpr) return null;
  return { baseExpr, step, half };
}

// Detects clamp/round layers wrapping a base expression.
// Pattern: X < low ? low : (X > high ? high : ROUND(X, step))
function detectLayeredPattern(parsed) {
  if (parsed.type !== 'ternary') return null;
  const layers = [];
  let current = parsed;
  let baseExpr = null;

  const cond1 = stripDisplayParens(current.conditionRaw || '');
  const trueV1 = current.trueVal.type === 'value' ? stripDisplayParens(current.trueVal.content) : null;

  const lowMatch = extractComparisonParts(cond1, '<');
  if (lowMatch && trueV1 && normalizeWS(trueV1) === normalizeWS(lowMatch.right)) {
    baseExpr = lowMatch.left;
    if (current.falseVal.type === 'ternary') {
      const cond2 = stripDisplayParens(current.falseVal.conditionRaw || '');
      const trueV2 = current.falseVal.trueVal.type === 'value' ? stripDisplayParens(current.falseVal.trueVal.content) : null;
      const highMatch = extractComparisonParts(cond2, '>');
      if (highMatch && trueV2 && normalizeWS(trueV2) === normalizeWS(highMatch.right) && normalizeWS(baseExpr) === normalizeWS(highMatch.left)) {
        layers.push({ type: 'clamp', low: lowMatch.right, high: highMatch.right, description: `Clamped between ${formatNum(parseFloat(lowMatch.right))} and ${formatNum(parseFloat(highMatch.right))}` });
        current = current.falseVal.falseVal;
      } else {
        layers.push({ type: 'floor', value: lowMatch.right, description: `Minimum of ${formatNum(parseFloat(lowMatch.right))}` });
        current = current.falseVal;
      }
    }
  }

  if (layers.length === 0) {
    const highOnly = extractComparisonParts(cond1, '>');
    if (highOnly && trueV1 && normalizeWS(trueV1) === normalizeWS(highOnly.right)) {
      baseExpr = highOnly.left;
      layers.push({ type: 'ceiling', value: highOnly.right, description: `Maximum of ${formatNum(parseFloat(highOnly.right))}` });
      current = current.falseVal;
    }
  }

  if (current.type === 'ternary') {
    const roundCond = stripDisplayParens(current.conditionRaw || '');
    const modInfo = extractModuloComparison(roundCond);
    if (modInfo && modInfo.half === modInfo.step / 2) {
      layers.push({ type: 'round', step: String(modInfo.step), description: `Rounded to nearest ${formatNum(modInfo.step)}` });
      if (!baseExpr) baseExpr = modInfo.baseExpr;
    }
  }

  if (!layers.length || !baseExpr) return null;

  const baseStripped = stripDisplayParens(baseExpr);
  let baseDescription;
  if (baseStripped.includes('?') && baseStripped.includes(':')) {
    const baseParsed = parseTernaryStructure(baseStripped);
    if (baseParsed.type === 'ternary') {
      const bTrue  = baseParsed.trueVal.type === 'value'  ? stripDisplayParens(baseParsed.trueVal.content)  : null;
      const bFalse = baseParsed.falseVal.type === 'value' ? stripDisplayParens(baseParsed.falseVal.content) : null;
      if (bTrue && bFalse) {
        const bCond = formatExprNumbers(stripDisplayParens(baseParsed.conditionRaw || ''));
        baseDescription = `${formatExprNumbers(bTrue)} when ${bCond}; otherwise ${formatExprNumbers(bFalse)}`;
      }
    }
  }
  if (!baseDescription) baseDescription = formatExprNumbers(baseStripped);

  return { layers, baseExpr, baseDescription };
}

// ── Arithmetic expression description ────────────────────────────────

function describeAsDefinition(node, baseName) {
  function serialize(n) {
    if (n.type === 'value') return stripDisplayParens(n.content);
    const c = stripDisplayParens(n.conditionRaw || '');
    return `(${c} ? ${serialize(n.trueVal)} : ${serialize(n.falseVal)})`;
  }
  return `[${addDefinition(baseName, describeArithmeticExpr(serialize(node)))}]`;
}

function describeEmbeddedTernary(expr) {
  const stripped = stripDisplayParens(expr);
  const parsed = parseTernaryStructure(stripped);
  if (parsed.type !== 'ternary') return null;

  const layered = detectLayeredPattern(parsed);
  if (layered) {
    const baseName = addDefinition('Base Amount', layered.baseDescription);
    return `[${baseName}], ${layered.layers.map(l => l.description.toLowerCase()).join(', ')}`;
  }

  const cond   = stripDisplayParens(parsed.conditionRaw || '');
  const trueV  = parsed.trueVal.type  === 'value' ? stripDisplayParens(parsed.trueVal.content)  : null;
  const falseV = parsed.falseVal.type === 'value' ? stripDisplayParens(parsed.falseVal.content) : null;

  // Boolean flag: (COND ? 1 : 0)
  if (trueV === '1' && falseV === '0') return `1 if ${conditionToEnglishSimple(cond)}`;

  const andOr = parseAndOrPattern(cond);
  if (andOr && trueV !== null && falseV !== null) {
    if (andOr.conditions.length === 1 && (andOr.count === 1 || andOr.type === 'or')) {
      const condDesc = describeFlagCondition(andOr.conditions[0], conditionToEnglishSimple);
      return falseV === '0' ? `${formatExprNumbers(trueV)} if ${condDesc}` : `${formatExprNumbers(trueV)} if ${condDesc}, otherwise ${formatExprNumbers(falseV)}`;
    }
    const subs = andOr.conditions.map(c => describeFlagCondition(c, conditionToEnglishSimple));
    const prefix = andOr.type === 'and' ? (subs.length === (andOr.count || subs.length) && subs.length === 2 ? 'both ' : subs.length > 2 ? 'all of: ' : '') : '';
    const joiner = andOr.type === 'and' ? ' AND ' : ' OR ';
    const clause = `${prefix}${subs.join(joiner)}`;
    return falseV === '0' ? `${formatExprNumbers(trueV)} when ${clause}` : `${formatExprNumbers(trueV)} when ${clause}, otherwise ${formatExprNumbers(falseV)}`;
  }

  if (trueV !== null && falseV === '0') {
    const trueDesc = trueV.includes('?') ? describeArithmeticExpr(trueV) : formatExprNumbers(trueV);
    return `${trueDesc} if ${conditionToEnglishSimple(cond)}`;
  }
  if (trueV === '0' && falseV !== null) {
    const falseDesc = falseV.includes('?') ? describeArithmeticExpr(falseV) : formatExprNumbers(falseV);
    return `${falseDesc} unless ${conditionToEnglishSimple(cond)}`;
  }

  const chain = extractLookupChain(stripped);
  if (chain) return `[${registerChainDefinition(chain)}]`;

  if (trueV !== null && falseV !== null) {
    const condDesc = autoShortenIfLong(conditionToEnglishSimple(cond), 'Condition', 80);
    const tDesc = autoShortenIfLong(trueV.includes('?') ? describeArithmeticExpr(trueV) : formatExprNumbers(trueV), 'Amount', 60);
    const fDesc = autoShortenIfLong(falseV.includes('?') ? describeArithmeticExpr(falseV) : formatExprNumbers(falseV), 'Amount', 60);
    return `${tDesc} if ${condDesc}, else ${fDesc}`;
  }

  const condDesc2 = autoShortenIfLong(conditionToEnglishSimple(cond), 'Condition', 80);
  const trueText  = parsed.trueVal.type  !== 'value' ? describeAsDefinition(parsed.trueVal, 'Award')    : autoShortenIfLong(describeArithmeticExpr(trueV || ''), 'Award', 60);
  const falseText = parsed.falseVal.type !== 'value' ? describeAsDefinition(parsed.falseVal, 'Fallback') : autoShortenIfLong(describeArithmeticExpr(falseV || ''), 'Fallback', 60);
  return `${trueText} if ${condDesc2}, else ${falseText}`;
}

function describeArithmeticExpr(expr, opts) {
  opts = opts || {};
  expr = stripDisplayParens(expr).trim();
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) return expr;
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(expr)) return formatNum(parseFloat(expr));
  if (expr.includes('?') && expr.includes(':')) {
    const t = describeEmbeddedTernary(expr);
    if (t) return t;
  }
  const terms = splitArithmeticTerms(expr);
  if (!terms.length) return formatExprNumbers(expr);

  const described = [];
  for (const { sign, term } of terms) {
    const stripped = stripDisplayParens(term);
    if (stripped.includes('?') && stripped.includes(':')) {
      const mulParts = splitMultiplicativeAtDepth0(stripped);
      if (mulParts.length >= 2) {
        const factorDescs = mulParts.map(factor => {
          const fStripped = stripDisplayParens(factor);
          if (fStripped.includes('?')) {
            const chain = extractLookupChain(fStripped);
            if (chain) return `× [${registerChainDefinition(chain)}]`;
            const emb = describeEmbeddedTernary(fStripped);
            if (emb) return emb;
          }
          const factorFmt = formatExprNumbers(fStripped);
          return factor.trim().startsWith('(') && /[+\-]/.test(fStripped) ? `(${factorFmt})` : factorFmt;
        });
        if (/\b(if|when|unless)\b/.test(factorDescs[0])) factorDescs[0] = `(${factorDescs[0]})`;
        described.push({ sign, text: autoShortenIfLong(factorDescs.join(' '), /×\s*\[/.test(factorDescs.join(' ')) ? 'Supplement' : 'Product', 70) });
        continue;
      }
      const desc = describeEmbeddedTernary(stripped);
      if (desc) { described.push({ sign, text: desc }); continue; }
    }
    described.push({ sign, text: formatExprNumbers(stripped) });
  }

  for (let i = 0; i < described.length; i++) {
    if (described[i].text.length > 70) {
      const base = /×\s*\[/.test(described[i].text) ? 'Supplement' : /\bif\b/.test(described[i].text) ? 'Amount' : 'Subtotal';
      described[i].text = autoShortenIfLong(described[i].text, base, 70);
    }
  }

  const hasLayered = described.some(d => /\b(clamped|rounded)\b/i.test(d.text));
  if (hasLayered) {
    for (let i = 0; i < described.length; i++) {
      const t = described[i].text;
      if (!/\b(clamped|rounded)\b/i.test(t) && /\b(if|when|unless)\b/.test(t) && !t.startsWith('['))
        described[i].text = `[${addDefinition('Additional Award', t)}]`;
    }
  }

  const parts = described.map(({ sign, text }, i) => i === 0 ? (sign === '-' ? `-${text}` : text) : `${sign} ${text}`);
  if (opts.multiLine && (parts.length >= 3 || (parts.length >= 2 && hasLayered))) return parts.join('\n');
  return parts.join(' ');
}

// ── Excel formula reconstruction ──────────────────────────────────────

function reconstructExcel(node) {
  if (node.type === 'value') {
    let v = stripDisplayParens(node.content);
    v = v.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1));
    return v;
  }
  const cond = node.conditionRaw || '';
  const andMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*==\s*(\d+)$/);
  if (andMatch) {
    const parts = andMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const inner = parts.map(p => { const m = p.match(/\((.+?)\s*\? 1 : 0\)/); return m ? m[1].trim().replace(/\$/g, '').replace(/ == /g, '=') : p; });
      return `IF(AND(${inner.join(', ')}), ${reconstructExcel(node.trueVal)}, ${reconstructExcel(node.falseVal)})`;
    }
  }
  const orMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*>\s*0$/);
  if (orMatch) {
    const parts = orMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const inner = parts.map(p => { const m = p.match(/\((.+?)\s*\? 1 : 0\)/); return m ? m[1].trim().replace(/\$/g, '').replace(/ == /g, '=') : p; });
      return `IF(OR(${inner.join(', ')}), ${reconstructExcel(node.trueVal)}, ${reconstructExcel(node.falseVal)})`;
    }
  }
  const condExcel = cond.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1)).replace(/ == /g, '=');
  return `IF(${condExcel}, ${reconstructExcel(node.trueVal)}, ${reconstructExcel(node.falseVal)})`;
}

// ── Evaluate with trace ───────────────────────────────────────────────

function evaluateWithTrace(pseudocode, values) {
  let expr = pseudocode;
  for (const [varName, val] of Object.entries(values)) {
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expr = expr.replace(new RegExp('\\$' + escaped, 'g'), String(val));
  }
  const remaining = expr.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g);
  if (remaining) return { error: `Missing values for: ${[...new Set(remaining)].join(', ')}` };

  const parsed = parseTernaryStructure(expr);
  const trace = [];

  function walk(node, step) {
    if (node.type === 'value') {
      const val = safeEval(stripDisplayParens(node.content));
      trace.push({ type: 'result', step, value: val });
      return val;
    }
    const condStr = stripDisplayParens(node.conditionRaw || '');
    let condResult;
    try { condResult = safeEval(condStr); } catch { condResult = 0; }
    const isTruthy = Boolean(condResult);
    trace.push({ type: 'condition', step, condition: condStr, result: isTruthy });
    return isTruthy ? walk(node.trueVal, step + 1) : walk(node.falseVal, step + 1);
  }

  try {
    return { result: walk(parsed, 1), trace };
  } catch (e) {
    return { error: 'Could not evaluate: ' + e.message };
  }
}

// ── Pattern detection ─────────────────────────────────────────────────

function detectPatterns(node) {
  const results = [];
  const seen = new Set();
  const norm  = s => s.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
  const clean = s => s.replace(/^\(+|\)+$/g, '').trim();

  function walk(n) {
    if (n.type !== 'ternary') return;
    const cond  = stripDisplayParens(n.conditionRaw || '');
    const trueV  = n.trueVal.type  === 'value' ? stripDisplayParens(n.trueVal.content)  : null;
    const falseV = n.falseVal.type === 'value' ? stripDisplayParens(n.falseVal.content) : null;

    // CLAMP: CONST >= expr ? CONST : CONST2 <= expr ? CONST2 : expr
    if (trueV !== null) {
      const clampFloor = cond.match(/^(-?[\d.]+)\s*>=\s/);
      if (clampFloor && trueV === clampFloor[1] && n.falseVal.type === 'ternary') {
        const innerCond = stripDisplayParens(n.falseVal.conditionRaw || '');
        const innerTrue = n.falseVal.trueVal.type === 'value' ? stripDisplayParens(n.falseVal.trueVal.content) : null;
        const clampCeil = innerCond.match(/^(-?[\d.]+)\s*<=\s/);
        if (clampCeil && innerTrue === clampCeil[1]) {
          const key = `CLAMP(${clampFloor[1]}, ${clampCeil[1]})`;
          if (!seen.has(key)) { seen.add(key); results.push({ type: 'clamp', min: clampFloor[1], max: clampCeil[1], description: `CLAMP: Result is bounded between ${clampFloor[1]} (minimum) and ${clampCeil[1]} (maximum)` }); }
          walk(n.falseVal.falseVal); return;
        }
      }
    }

    // Conditional add: $var > 0 ? VALUE : 0
    if (trueV && falseV === '0') {
      const m = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*>\s*0$/);
      if (m) {
        const key = `COND_${m[1]}_${trueV}`;
        if (!seen.has(key)) { seen.add(key); results.push({ type: 'conditional', variable: clean(m[1]), value: trueV, description: `Conditional: adds ${trueV} only when ${clean(m[1])} > 0` }); }
        return;
      }
    }

    // MAX: (a > b) ? a : b
    const maxMatch = cond.match(/^(.+?)\s*(?:>|>=)\s*(.+)$/);
    if (maxMatch && trueV && falseV && norm(maxMatch[1]) === norm(trueV) && norm(maxMatch[2]) === norm(falseV)) {
      const key = `MAX(${clean(maxMatch[1])}, ${clean(maxMatch[2])})`;
      if (!seen.has(key)) { seen.add(key); results.push({ type: 'max', a: clean(maxMatch[1]), b: clean(maxMatch[2]), description: `MAX pattern: "${clean(cond)}" → MAX(${clean(maxMatch[1])}, ${clean(maxMatch[2])})` }); }
      return;
    }

    // MIN: (a < b) ? a : b
    const minMatch = cond.match(/^(.+?)\s*(?:<|<=)\s*(.+)$/);
    if (minMatch && trueV && falseV && norm(minMatch[1]) === norm(trueV) && norm(minMatch[2]) === norm(falseV)) {
      const key = `MIN(${clean(minMatch[1])}, ${clean(minMatch[2])})`;
      if (!seen.has(key)) { seen.add(key); results.push({ type: 'min', a: clean(minMatch[1]), b: clean(minMatch[2]), description: `MIN pattern: "${clean(cond)}" → MIN(${clean(minMatch[1])}, ${clean(minMatch[2])})` }); }
      return;
    }

    // ROUND: (expr % step < step/2) ? ...
    const roundMatch = cond.match(/^(.+?)\s*%\s*(.+?)\s*<\s*(.+?)\s*\/\s*2$/);
    if (roundMatch) {
      const key = `ROUND(${clean(roundMatch[1])}, ${clean(roundMatch[2])})`;
      if (!seen.has(key)) { seen.add(key); results.push({ type: 'round', value: clean(roundMatch[1]), step: clean(roundMatch[2]), description: `ROUND pattern: rounds ${clean(roundMatch[1])} to nearest ${clean(roundMatch[2])}` }); }
    }

    // ROUNDUP: VALUE % STEP ? STEP : 0
    if (trueV && falseV === '0') {
      const modCond = cond.match(/^(.+?)\s*%\s*(\d+(?:\.\d+)?)$/);
      if (modCond && (trueV === modCond[2] || trueV.includes(modCond[2]))) {
        const key = `ROUNDUP(${clean(modCond[1])}, ${modCond[2]})`;
        if (!seen.has(key)) { seen.add(key); results.push({ type: 'roundup', value: clean(modCond[1]), step: modCond[2], description: `ROUNDUP pattern: rounds ${clean(modCond[1])} up to next ${modCond[2]}` }); }
      }
    }

    walk(n.trueVal);
    walk(n.falseVal);
  }

  walk(node);
  return results;
}

function detectStructure(rootNode) {
  const structures = [];
  let coreNode = rootNode;

  // Guard: $var > 0 ? (main) : 0
  if (coreNode.type === 'ternary') {
    const cond = stripDisplayParens(coreNode.conditionRaw || '');
    const falseV = coreNode.falseVal.type === 'value' ? stripDisplayParens(coreNode.falseVal.content) : null;
    const guardMatch = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>|>=|!=)\s*0$/);
    if (guardMatch && (falseV === '0' || falseV === '0.0')) {
      structures.push({ type: 'guard', variable: guardMatch[1], description: `Only applies when ${guardMatch[1]} > 0; otherwise returns 0` });
      coreNode = coreNode.trueVal;
    }
  }

  // CLAMP: LOW >= expr ? LOW : HIGH <= expr ? HIGH : expr
  if (coreNode.type === 'ternary') {
    const cond = stripDisplayParens(coreNode.conditionRaw || '');
    const trueV = coreNode.trueVal.type === 'value' ? stripDisplayParens(coreNode.trueVal.content) : null;
    const floorMatch = cond.match(/^(-?[\d.]+)\s*>=\s/);
    if (floorMatch && trueV === floorMatch[1] && coreNode.falseVal.type === 'ternary') {
      const innerCond = stripDisplayParens(coreNode.falseVal.conditionRaw || '');
      const innerTrue = coreNode.falseVal.trueVal.type === 'value' ? stripDisplayParens(coreNode.falseVal.trueVal.content) : null;
      const ceilMatch = innerCond.match(/^(-?[\d.]+)\s*<=\s/);
      if (ceilMatch && innerTrue === ceilMatch[1]) {
        structures.push({ type: 'clamp', min: floorMatch[1], max: ceilMatch[1], description: `Result is clamped between ${formatNum(parseFloat(floorMatch[1]))} (minimum) and ${formatNum(parseFloat(ceilMatch[1]))} (maximum)` });
        coreNode = coreNode.falseVal.falseVal;
      }
    }
  }

  // Top-level MAX or MIN comparison
  if (coreNode.type === 'ternary') {
    const cond  = stripDisplayParens(coreNode.conditionRaw || '');
    const trueV  = coreNode.trueVal.type  === 'value' ? stripDisplayParens(coreNode.trueVal.content)  : null;
    const falseV = coreNode.falseVal.type === 'value' ? stripDisplayParens(coreNode.falseVal.content) : null;
    if (trueV && falseV) {
      const cmpMatch = cond.match(/^(.+?)\s*(>|>=)\s*(.+)$/);
      if (cmpMatch) {
        const nL = cmpMatch[1].replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        const nR = cmpMatch[3].replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        const nT = trueV.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        const nF = falseV.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        if (nL === nT && nR === nF) structures.push({ type: 'comparison', subType: 'max', description: 'Takes the LARGER of two calculated values (MAX)' });
        else if (nL === nF && nR === nT) structures.push({ type: 'comparison', subType: 'min', description: 'Takes the SMALLER of two calculated values (MIN)' });
      }
    }
  }

  if (coreNode.type === 'value') {
    const v = stripDisplayParens(coreNode.content);
    const modMatch = v.match(/%\s*(\d+)\s*$/);
    if (modMatch) structures.push({ type: 'rounding', step: modMatch[1], description: `Result is rounded down to the nearest ${modMatch[1]}` });
  }

  return { structures, coreNode };
}

function detectTables(rootNode) {
  const tables = [];

  function describeValue(node) {
    if (node.type === 'value') {
      const v = stripDisplayParens(node.content);
      return { text: v, isFormula: false, formulaDesc: describeFormula(v) };
    }
    const subChain = tryExtractChain(node);
    if (subChain?.rowCount >= 3) return { text: `[lookup on ${subChain.variable}]`, isFormula: false, formulaDesc: null };
    const cond = stripDisplayParens(node.conditionRaw || '');
    const tv = node.trueVal.type  === 'value' ? stripDisplayParens(node.trueVal.content)  : '...';
    const fv = node.falseVal.type === 'value' ? stripDisplayParens(node.falseVal.content) : '...';
    return { text: `IF(${cond}, ${tv}, ${fv})`, isFormula: true, formulaDesc: null };
  }

  function describeFormula(expr) {
    const s = expr.replace(/\s+/g, ' ').trim();
    const rateMatch = s.match(/^\(\$([a-z]+)\s*-\s*\(\$([a-z]+)\s*>\s*0\s*\?\s*\$\2\s*:\s*0\)\)\s*\*\s*([\d.]+)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)$/);
    if (rateMatch) return `(${rateMatch[1]} − MAX(${rateMatch[2]}, 0)) × ${(parseFloat(rateMatch[3]) * 100).toFixed(0)}% − ${rateMatch[4]} − ${rateMatch[5]} − ${rateMatch[6]}`;
    const fullMatch = s.match(/^\$([a-z]+)\s*-\s*\(\$([a-z]+)\s*>\s*0\s*\?\s*\$\2\s*:\s*0\)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)$/);
    if (fullMatch) return `${fullMatch[1]} − MAX(${fullMatch[2]}, 0) − ${fullMatch[3]} − ${fullMatch[4]} − ${fullMatch[5]} (100%)`;
    const maxZero = s.match(/^\$([a-z]+)\s*>\s*0\s*\?\s*\$\1\s*:\s*0$/);
    if (maxZero) return `MAX(${maxZero[1]}, 0)`;
    if (s.includes('%') && (s.includes('?') || s.includes(':'))) return 'rounding operation';
    return null;
  }

  function tryExtractChain(node) {
    const rows = [];
    let current = node;
    let chainVar = null, chainOp = null;
    while (current.type === 'ternary') {
      const cond = stripDisplayParens(current.conditionRaw || '');
      const m = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|>|<=|<|==|!=)\s*(.+)$/);
      if (!m) break;
      const [, varName, op, threshold] = m;
      if (!chainVar) { chainVar = varName; chainOp = op; }
      else if (varName !== chainVar) break;
      let thresholdClean = threshold.trim();
      if (/[+\-*/]/.test(thresholdClean) && !/\$/.test(thresholdClean)) {
        try { const ev = safeEval(thresholdClean); if (!isNaN(ev)) thresholdClean = String(ev); } catch {}
      }
      const trueResult = describeValue(current.trueVal);
      rows.push({ threshold: thresholdClean, op, result: trueResult.text, isFormula: trueResult.isFormula, formulaDesc: trueResult.formulaDesc });
      current = current.falseVal;
    }
    if (rows.length < 2) return null;
    const defaultVal = describeValue(current);
    rows.push({ threshold: 'otherwise', op: '', result: defaultVal.text, isFormula: defaultVal.isFormula, formulaDesc: defaultVal.formulaDesc });
    return { variable: chainVar, operator: chainOp, rows, rowCount: rows.length };
  }

  function scanValueForEmbeddedTables(text, depth) {
    const stripped = stripDisplayParens(text);
    let i = 0, parenDepth = 0, groupStart = -1;
    while (i < stripped.length) {
      if (stripped[i] === '(') { if (!parenDepth) groupStart = i; parenDepth++; }
      else if (stripped[i] === ')') {
        parenDepth--;
        if (!parenDepth && groupStart >= 0) {
          const inner = stripped.substring(groupStart + 1, i).trim();
          if (inner.includes('?') && inner.includes(':') && inner.length > 30) {
            const parsed = parseTernaryStructure(inner);
            if (parsed.type === 'ternary') findTables(parsed, depth + 1);
          }
          groupStart = -1;
        }
      }
      i++;
    }
  }

  function findTables(node, depth) {
    if (node.type !== 'ternary') {
      if (node.type === 'value' && depth < 5) scanValueForEmbeddedTables(node.content, depth);
      return;
    }
    const chain = tryExtractChain(node);
    if (chain?.rowCount >= 3) {
      let current = node;
      const outerRows = [];
      let hasInnerTables = false;
      while (current.type === 'ternary') {
        const cond = stripDisplayParens(current.conditionRaw || '');
        const m = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|>|<=|<|==|!=)\s*(.+)$/);
        if (!m || m[1] !== chain.variable) break;
        let tierThreshold = m[3].trim();
        if (/[+\-*/]/.test(tierThreshold) && !/\$/.test(tierThreshold)) {
          try { const ev = safeEval(tierThreshold); if (!isNaN(ev)) tierThreshold = String(ev); } catch {}
        }
        const innerChain = tryExtractChain(current.trueVal);
        if (innerChain?.rowCount >= 3) {
          hasInnerTables = true;
          outerRows.push({ threshold: tierThreshold, op: m[2], innerTable: innerChain });
        } else {
          outerRows.push({ threshold: tierThreshold, op: m[2], innerTable: null, simpleResult: describeValue(current.trueVal) });
        }
        current = current.falseVal;
      }
      if (hasInnerTables && outerRows.length >= 2) {
        const innerVar = outerRows.find(r => r.innerTable)?.innerTable.variable || '?';
        tables.push({
          type: 'nested',
          outerVariable: chain.variable,
          innerVariable: innerVar,
          outerOperator: chain.operator,
          tiers: outerRows.map(r => ({
            threshold: r.threshold, op: r.op,
            rows: r.innerTable ? r.innerTable.rows : [{ threshold: '-', op: '', result: r.simpleResult.text, isFormula: r.simpleResult.isFormula, formulaDesc: r.simpleResult.formulaDesc }],
          })),
          defaultResult: describeValue(current),
          title: `Lookup: ${chain.variable} tiers × ${innerVar} ranges`,
        });
        return;
      }
      tables.push({ type: 'flat', variable: chain.variable, operator: chain.operator, rows: chain.rows, title: `Lookup table on ${chain.variable}` });
      return;
    }
    findTables(node.trueVal, depth + 1);
    findTables(node.falseVal, depth + 1);
  }

  findTables(rootNode, 0);
  return tables;
}

// ── Main explainer ────────────────────────────────────────────────────

function explainPseudocode(pseudocode) {
  const code = balanceParens(pseudocode.trim());
  const parsed = parseTernaryStructure(code);
  resetDefinitions();

  // Collect all $variables
  const vars = new Set();
  function collectVars(node) {
    if (node.type === 'value') { const m = node.content.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g); if (m) m.forEach(v => vars.add(v)); }
    if (node.conditionRaw) { const m = node.conditionRaw.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g); if (m) m.forEach(v => vars.add(v)); }
    if (node.type === 'ternary') { collectVars(node.trueVal); collectVars(node.falseVal); }
  }
  collectVars(parsed);

  // Build decision steps
  const steps = [];
  function buildSteps(node) {
    if (node.type === 'value') {
      const v = stripDisplayParens(node.content);
      return { type: 'result', value: v, english: valueToEnglish(v) };
    }
    const stepNum = steps.length + 1;
    const condStr = stripDisplayParens(node.conditionRaw || '');
    const step = { type: 'decision', stepNum, condition: condStr, conditionEnglish: conditionToEnglish(condStr), trueOutcome: null, falseOutcome: null };
    steps.push(step);
    step.trueOutcome  = buildSteps(node.trueVal);
    step.falseOutcome = buildSteps(node.falseVal);
    return step;
  }
  buildSteps(parsed);

  const { structures, coreNode } = detectStructure(parsed);

  const coreSteps = [];
  function buildCoreSteps(node) {
    if (node.type === 'value') { const v = stripDisplayParens(node.content); return { type: 'result', value: v, english: valueToEnglish(v) }; }
    const stepNum = coreSteps.length + 1;
    const condStr = stripDisplayParens(node.conditionRaw || '');
    const step = { type: 'decision', stepNum, condition: condStr, conditionEnglish: conditionToEnglish(condStr), trueOutcome: null, falseOutcome: null };
    coreSteps.push(step);
    step.trueOutcome  = buildCoreSteps(node.trueVal);
    step.falseOutcome = buildCoreSteps(node.falseVal);
    return step;
  }
  if (structures.length > 0) buildCoreSteps(coreNode);

  let excelFormula = '';
  try { excelFormula = '=' + reconstructExcel(parsed); } catch { excelFormula = '(could not reconstruct)'; }

  const patterns = detectPatterns(parsed);
  const tables   = detectTables(parsed);

  // Build plain-English summary
  const summaryLines = [];
  if (structures.length > 0) {
    summaryLines.push('Structure:');
    for (const s of structures) {
      const icon = { guard: '[Guard]', clamp: '[Clamp]', comparison: '[Compare]', rounding: '[Round]' }[s.type] || '[Info]';
      summaryLines.push(`  ${icon} ${s.description}`);
    }
    summaryLines.push('');
  }

  const displaySteps = structures.length > 0 ? coreSteps : steps;

  if (!displaySteps.length && !structures.length) {
    const rawVal = stripDisplayParens(parsed.content);
    const englishVal = describeArithmeticExpr(rawVal, { multiLine: true });
    if (getDefinitions().length > 0) {
      summaryLines.push('This formula computes:');
      englishVal.split('\n').forEach(l => summaryLines.push(`  ${l}`));
    } else {
      summaryLines.push(`This expression simply returns: ${englishVal}`);
    }
  } else {
    const isTiered = displaySteps.length >= 3 && displaySteps.every((step, idx) => {
      if (step.trueOutcome.type !== 'result') return false;
      return idx < displaySteps.length - 1
        ? step.falseOutcome.type === 'decision' && step.falseOutcome.stepNum === step.stepNum + 1
        : step.falseOutcome.type === 'result';
    });

    if (displaySteps.length > 0)
      summaryLines.push(isTiered ? `This formula has ${displaySteps.length} award tiers.` : `This formula has ${displaySteps.length} decision point${displaySteps.length > 1 ? 's' : ''}.`);

    if (patterns.length > 0) { summaryLines.push('', 'Detected patterns:'); patterns.forEach(p => summaryLines.push(`  * ${p.description}`)); }
    if (tables.length > 0) summaryLines.push('', `Contains ${tables.length} lookup table${tables.length > 1 ? 's' : ''} (see Tables tab for details).`);

    if (isTiered) {
      summaryLines.push('', 'Returns the first matching award:');
      const tiers = displaySteps.map(s => ({ value: s.trueOutcome.english, condition: s.conditionEnglish }));
      const defaultValue = displaySteps[displaySteps.length - 1].falseOutcome.english;
      const maxLen = Math.max(...tiers.map(t => t.value.length), defaultValue.length);
      tiers.forEach(t => summaryLines.push(`  ${t.value.padStart(maxLen)} — if ${t.condition}`));
      summaryLines.push(`  ${defaultValue.padStart(maxLen)} — otherwise`);
    } else {
      for (const step of displaySteps) {
        summaryLines.push('', `Step ${step.stepNum}: Check whether ${step.conditionEnglish}`);
        summaryLines.push(step.trueOutcome.type === 'result'   ? `  ✓ If YES → return ${step.trueOutcome.english}`   : `  ✓ If YES → go to Step ${step.trueOutcome.stepNum}`);
        summaryLines.push(step.falseOutcome.type === 'result'  ? `  ✗ If NO  → return ${step.falseOutcome.english}`  : `  ✗ If NO  → go to Step ${step.falseOutcome.stepNum}`);
      }
    }
  }

  // Append definitions ("Where: ..." section)
  const defs = getDefinitions();
  if (defs.length > 0) {
    // Post-process: replace inline text that matches another definition's detail with its [Label]
    const sortedDefs = [...defs].sort((a, b) => b.detail.length - a.detail.length);
    for (const d of defs) {
      d.detail = d.detail.replace(/\[([^\[\]]+)\]/g, (m, content) => {
        const match = defs.find(d2 => d2.detail === content);
        return match ? `[${match.label}]` : m;
      });
      for (const cand of sortedDefs) {
        if (cand === d || cand.detail.length < 15) continue;
        const safeDetail = cand.detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (d.detail.includes(cand.detail) && !d.detail.includes(`[${cand.label}]`))
          d.detail = d.detail.replace(new RegExp(safeDetail, 'g'), `[${cand.label}]`);
      }
      d.detail = d.detail.replace(/\((\[[^\]]+\])\)/g, '$1');
    }
    summaryLines.push('', 'Where:');
    defs.forEach(d => summaryLines.push(`  [${d.label}] = ${d.detail}`));
  }

  return { variables: [...vars], steps, excelFormula, summary: summaryLines.join('\n'), patterns, tables, structures };
}

export { explainPseudocode, evaluateWithTrace };
