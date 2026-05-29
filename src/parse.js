// Core parsing utilities shared by the converter and explainer.

function splitArgs(text) {
  const result = [];
  let depth = 0;
  let token = '';
  for (const ch of text) {
    if (ch === '(') { depth++; token += ch; }
    else if (ch === ')') { depth--; token += ch; }
    else if (ch === ',' && depth === 0) { result.push(token.trim()); token = ''; }
    else { token += ch; }
  }
  if (token.trim()) result.push(token.trim());
  return result;
}

// Splits `expr` on `keyword` at parenthesis depth 0.
// For alphabetic keywords (AND, OR), a leading $ counts as part of the identifier
// so that $OR or $AND are never split on.
function splitInfixByKeyword(expr, keyword) {
  const result = [];
  let depth = 0;
  let start = 0;
  const kwUpper = keyword.toUpperCase();
  const kwLen = keyword.length;
  const isAlpha = /^[A-Za-z]+$/.test(keyword);

  let i = 0;
  while (i <= expr.length - kwLen) {
    const ch = expr[i];
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth--; i++; continue; }
    if (depth === 0 && expr.slice(i, i + kwLen).toUpperCase() === kwUpper) {
      let matches = true;
      if (isAlpha) {
        const prevCh = i === 0 ? null : expr[i - 1];
        const nextCh = i + kwLen < expr.length ? expr[i + kwLen] : null;
        matches = (prevCh === null || (/\W/.test(prevCh) && prevCh !== '$'))
               && (nextCh === null || /\W/.test(nextCh));
      }
      if (matches) {
        result.push(expr.slice(start, i).trim());
        start = i + kwLen;
        i += kwLen;
        continue;
      }
    }
    i++;
  }
  result.push(expr.slice(start).trim());
  return result;
}

function normalizeComparisonOps(str) {
  let s = str;
  s = s.replace(/\s*<=\s*/g, ' <= ');
  s = s.replace(/\s*>=\s*/g, ' >= ');
  s = s.replace(/\s*<>\s*/g, ' != ');
  s = s.replace(/\s*<(?!=)\s*/g, ' < ');
  s = s.replace(/\s*>(?!=)\s*/g, ' > ');
  s = s.replace(/\s*==\s*/g, ' == ');
  s = s.replace(/([^><=!])=([^=])/g, '$1 == $2');
  return s.replace(/\s+/g, ' ').trim();
}

function isWrappedWithParentheses(text) {
  const s = text.trim();
  if (!s.startsWith('(') || !s.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0 && i < s.length - 1) return false;
    }
  }
  return depth === 0;
}

function wrapForBinaryOperand(expr) {
  const trimmed = expr.trim();
  if (!trimmed) return '()';
  return isWrappedWithParentheses(trimmed) ? trimmed : `(${trimmed})`;
}

function stripDisplayParens(s) {
  s = String(s).trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (s.startsWith('(') && s.endsWith(')')) {
      let d = 0, ok = true;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') {
          d--;
          if (d === 0 && i < s.length - 1) { ok = false; break; }
        }
      }
      if (ok) { s = s.slice(1, -1).trim(); changed = true; }
    }
  }
  return s;
}

// Parses a ternary expression into a tree node:
//   { type: 'ternary', conditionRaw, condition, trueVal, falseVal }
//   { type: 'value', content }
function parseTernaryStructure(code) {
  code = code.trim();
  while (isWrappedWithParentheses(code)) code = code.slice(1, -1).trim();

  let qPos = -1, colonPos = -1, depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '?' && depth === 0 && qPos === -1) qPos = i;
    else if (ch === ':' && depth === 0 && qPos !== -1 && colonPos === -1) { colonPos = i; break; }
  }
  if (qPos === -1 || colonPos === -1) return { type: 'value', content: code };

  const unwrap = s => {
    while (s.startsWith('(') && s.endsWith(')')) {
      let d = 0, fullyWrapped = true;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) { fullyWrapped = false; break; } }
      }
      if (fullyWrapped) s = s.slice(1, -1).trim(); else break;
    }
    return s;
  };

  const condition = unwrap(code.substring(0, qPos).trim());
  const trueVal   = unwrap(code.substring(qPos + 1, colonPos).trim());
  const falseVal  = unwrap(code.substring(colonPos + 1).trim());
  return {
    type: 'ternary',
    conditionRaw: condition,
    condition: parseTernaryStructure(condition),
    trueVal:   parseTernaryStructure(trueVal),
    falseVal:  parseTernaryStructure(falseVal),
  };
}

// Removes unmatched parentheses: forward pass marks unmatched ')',
// backward pass marks unmatched '('.
function balanceParens(str) {
  const chars = str.split('');
  const toRemove = new Set();
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '(') depth++;
    else if (chars[i] === ')') {
      if (depth > 0) depth--;
      else toRemove.add(i);
    }
  }
  depth = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === ')') depth++;
    else if (chars[i] === '(') {
      if (depth > 0) depth--;
      else toRemove.add(i);
    }
  }
  if (!toRemove.size) return str;
  return chars.filter((_, i) => !toRemove.has(i)).join('');
}

// Evaluates a numeric expression (numbers, +−*/%, comparisons, ternary, parens).
// Does not use eval() or Function(). Returns a number.
function safeEval(expr) {
  const tokens = [];
  let i = 0;
  const s = expr.replace(/\s+/g, ' ').trim();
  while (i < s.length) {
    if (s[i] === ' ') { i++; continue; }
    if (/[0-9]/.test(s[i]) || (s[i] === '-' && (tokens.length === 0 || /^[(%*\/+\-<>=!?:,]$/.test(tokens[tokens.length - 1])))) {
      let num = '';
      if (s[i] === '-') { num += '-'; i++; }
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      tokens.push(parseFloat(num));
      continue;
    }
    if (i + 1 < s.length) {
      const two = s[i] + s[i + 1];
      if (['<=', '>=', '==', '!='].includes(two)) { tokens.push(two); i += 2; continue; }
    }
    tokens.push(s[i]);
    i++;
  }

  let pos = 0;
  const peek = () => pos < tokens.length ? tokens[pos] : null;
  const next = () => tokens[pos++];

  function parseTernary() {
    let left = parseComparison();
    if (peek() !== '?') return left;
    next();
    const trueVal = parseTernary();
    if (peek() !== ':') throw new Error('Expected : in ternary');
    next();
    const falseVal = parseTernary();
    return left ? trueVal : falseVal;
  }
  function parseComparison() {
    let left = parseAddSub();
    while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) {
      const op = next(), right = parseAddSub();
      if (op === '<')  left = left < right  ? 1 : 0;
      else if (op === '>') left = left > right  ? 1 : 0;
      else if (op === '<=') left = left <= right ? 1 : 0;
      else if (op === '>=') left = left >= right ? 1 : 0;
      else if (op === '==') left = left === right ? 1 : 0;
      else if (op === '!=') left = left !== right ? 1 : 0;
    }
    return left;
  }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = next(), right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseMulDiv() {
    let left = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next(), right = parseUnary();
      if (op === '*') left = left * right;
      else if (op === '/') left = right !== 0 ? left / right : NaN;
      else left = left % right;
    }
    return left;
  }
  function parseUnary() {
    if (peek() === '-') { next(); return -parsePrimary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (t === '(') {
      next();
      const val = parseTernary();
      if (peek() === ')') next();
      return val;
    }
    if (typeof t === 'number') { next(); return t; }
    throw new Error(`Unexpected token: ${t}`);
  }

  return parseTernary();
}

export {
  splitArgs, splitInfixByKeyword, normalizeComparisonOps,
  isWrappedWithParentheses, wrapForBinaryOperand,
  stripDisplayParens, parseTernaryStructure, balanceParens,
  safeEval,
};
