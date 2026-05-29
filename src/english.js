import { parseTernaryStructure, stripDisplayParens, safeEval } from './parse.js';
import { addDefinition, formatNum, formatExprNumbers } from './definitions.js';
import { detectLayeredPattern } from './patterns.js';

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

// ── Comparison helper (unified) ───────────────────────────────────────

// Finds the rightmost comparison operator at depth 0.
// Pass { trackBrackets: true } to also treat [] as depth-increasing (for simplified strings with [Label] refs).
function findOutermostComparison(expr, { trackBrackets = false } = {}) {
  let depth = 0, lastOp = null, lastPos = -1, lastLen = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(' || (trackBrackets && expr[i] === '[')) { depth++; continue; }
    if (expr[i] === ')' || (trackBrackets && expr[i] === ']')) { depth--; continue; }
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

// Replaces parenthesized ternary sub-expressions with concise [Label] refs.
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
      const fTV = flagParsed.trueVal.type  === 'value' ? stripDisplayParens(flagParsed.trueVal.content)  : null;
      const fFV = flagParsed.falseVal.type === 'value' ? stripDisplayParens(flagParsed.falseVal.content) : null;
      if (fTV === '1' && fFV === '0') { result += '(' + simplified + ')'; i = j; continue; }
    }
    const chain2 = extractLookupChain('(' + simplified + ')');
    if (chain2) { result += `[${registerChainDefinition(chain2)}]`; i = j; continue; }
    const parsed = parseTernaryStructure(simplified);
    if (parsed.type === 'ternary') {
      const tV = parsed.trueVal.type  === 'value' ? stripDisplayParens(parsed.trueVal.content)  : null;
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

function conditionToEnglishSimple(cond) {
  let s = simplifyEmbeddedTernaries(cond.trim());
  s = formatExprNumbers(s);
  s = s.replace(/\s*\*\s*/g, ' × ');
  if (s.length > 80) {
    const comp = findOutermostComparison(s, { trackBrackets: true });
    if (comp?.left.length > 40) {
      const label = addDefinition('Eligibility', stripDisplayParens(comp.left.trim()));
      s = `[${label}] ${comp.op} ${comp.right}`;
    }
  }
  return s;
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
  const trueText  = parsed.trueVal.type  !== 'value' ? describeAsDefinition(parsed.trueVal,  'Award')    : autoShortenIfLong(describeArithmeticExpr(trueV  || ''), 'Award',    60);
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

export { conditionToEnglish, valueToEnglish, describeArithmeticExpr };
