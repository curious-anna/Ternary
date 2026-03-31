function splitArgs(text) {
  const result = [];
  let depth = 0;
  let token = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
      token += ch;
    } else if (ch === ')') {
      depth--;
      token += ch;
    } else if (ch === ',' && depth === 0) {
      result.push(token.trim());
      token = '';
    } else {
      token += ch;
    }
  }
  if (token.trim() !== '') result.push(token.trim());
  return result;
}

/**
 * Splits `expr` on bare occurrences of `keyword` at parenthesis depth 0.
 * For alphabetic keywords (AND, OR), word boundaries are enforced and a
 * leading `$` is treated as part of an identifier (not a word boundary).
 * For operator tokens (&&, ||), plain substring matching at depth 0 is used.
 * Returns an array of trimmed parts; if no split occurs, returns [expr].
 */
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
        // Preceding char must be a non-word char AND must NOT be '$'
        const prevCh = i === 0 ? null : expr[i - 1];
        const beforeOk = prevCh === null || (/\W/.test(prevCh) && prevCh !== '$');
        // Following char must be a non-word char
        const nextCh = (i + kwLen < expr.length) ? expr[i + kwLen] : null;
        const afterOk = nextCh === null || /\W/.test(nextCh);
        matches = beforeOk && afterOk;
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
  s = s.replace(/\s*<\s*/g, ' < ');
  s = s.replace(/\s*>\s*/g, ' > ');
  s = s.replace(/\s*==\s*/g, ' == ');
  s = s.replace(/([^><=!])=([^=])/g, '$1 == $2');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Given a number of decimal places `d`, returns the corresponding step
 * as a numeric string (e.g. d=2 → "0.01", d=0 → "1", d=-1 → "10").
 */
function decimalPlacesToStep(d) {
  if (d === 0) return '1';
  if (d > 0) return (1 / Math.pow(10, d)).toFixed(d);
  return String(Math.pow(10, -d));
}

function isWrappedWithParentheses(text) {
  const s = text.trim();
  if (!s.startsWith('(') || !s.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0 && i < s.length - 1) return false;
    }
  }
  return depth === 0;
}

function parseTernaryStructure(code) {
  code = code.trim();
  let qPos = -1;
  let colonPos = -1;
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(') { depth++; }
    else if (ch === ')') { depth--; }
    else if (ch === '?' && depth === 0 && qPos === -1) { qPos = i; }
    else if (ch === ':' && depth === 0 && qPos !== -1 && colonPos === -1) { colonPos = i; break; }
  }
  if (qPos === -1 || colonPos === -1) {
    return { type: 'value', content: code };
  }
  let condition = code.substring(0, qPos).trim();
  let trueVal = code.substring(qPos + 1, colonPos).trim();
  let falseVal = code.substring(colonPos + 1).trim();
  const unwrap = (s) => {
    while (s.startsWith('(') && s.endsWith(')')) {
      let d = 0, fullyWrapped = true;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) { fullyWrapped = false; break; } }
      }
      if (fullyWrapped) { s = s.substring(1, s.length - 1).trim(); } else { break; }
    }
    return s;
  };
  condition = unwrap(condition);
  trueVal = unwrap(trueVal);
  falseVal = unwrap(falseVal);
  return {
    type: 'ternary',
    conditionRaw: condition,
    condition: parseTernaryStructure(condition),
    trueVal: parseTernaryStructure(trueVal),
    falseVal: parseTernaryStructure(falseVal)
  };
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
        else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) { ok = false; break; } }
      }
      if (ok) { s = s.slice(1, -1).trim(); changed = true; }
    }
  }
  return s;
}

function toPseudocode(rawInput) {
  let e = rawInput.trim();
  if (e.startsWith('=')) e = e.slice(1).trim();

  const reserved = new Set(['IF', 'MIN', 'MAX', 'AND', 'OR', 'ROUND', 'ROUNDUP', 'ROUNDDOWN']);

  // Normalize user-provided variable names with `$` and preserve them (lowercase keys).
  e = e.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => `$${name.toLowerCase()}`);

  // Add `$` prefix to identifier tokens that are not reserved functions and not already prefixed.
  e = e.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, _p1, offset, string) => {
    if (offset > 0 && string[offset - 1] === '$') {
      return match;
    }
    const upper = match.toUpperCase();
    if (reserved.has(upper)) return upper;
    return `$${match.toLowerCase()}`;
  });

  function convert(expr) {
    expr = expr.trim();
    if (expr === '') return '';
    while (isWrappedWithParentheses(expr)) {
      expr = expr.slice(1, -1).trim();
    }

    const funcMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
    const topLevelArgs = splitArgs(expr);

    // Shorthand ternary: (condition, trueValue, falseValue?) — handle before infix split
    // so that e.g. "(A > 1 OR B < 5, 500, 0)" correctly treats the OR as a condition.
    if (!funcMatch && topLevelArgs.length >= 2) {
      const condition = convert(topLevelArgs[0]);
      const trueExpr = convert(topLevelArgs[1]);
      const falseExpr = topLevelArgs.length >= 3 ? convert(topLevelArgs[2]) : '0';
      return `(${condition}) ? (${trueExpr}) : (${falseExpr})`;
    }

    if (funcMatch) {
      const name = funcMatch[1].toUpperCase();
      const inner = funcMatch[2];
      const args = splitArgs(inner);

      if (name === 'IF' && args.length >= 2) {
        const condition = convert(args[0]);
        const trueExpr = convert(args[1]);
        const falseExpr = args.length >= 3 ? convert(args[2]) : '0';
        return `(${condition}) ? (${trueExpr}) : (${falseExpr})`;
      }

      if (name === 'MIN' && args.length >= 2) {
        let result = convert(args[0]);
        for (let i = 1; i < args.length; i++) {
          const next = convert(args[i]);
          result = `(${result} < ${next}) ? (${result}) : (${next})`;
        }
        return result;
      }

      if (name === 'MAX' && args.length >= 2) {
        let result = convert(args[0]);
        for (let i = 1; i < args.length; i++) {
          const next = convert(args[i]);
          result = `(${result} > ${next}) ? (${result}) : (${next})`;
        }
        return result;
      }

      if (name === 'AND' && args.length >= 2) {
        const convertedArgs = args.map(convert);
        const sumExpr = convertedArgs.map(p => `(${p} ? 1 : 0)`).join(' + ');
        return `(${sumExpr} == ${args.length})`;
      }

      if (name === 'OR' && args.length >= 2) {
        const convertedArgs = args.map(convert);
        const sumExpr = convertedArgs.map(p => `(${p} ? 1 : 0)`).join(' + ');
        return `(${sumExpr} > 0)`;
      }

      if (name === 'ROUND' && args.length >= 1) {
        const value = convert(args[0]);
        let step = '1';
        if (args.length >= 2) {
          step = convert(args[1].trim()).trim();
        }
        if (step === '0' || step === '0.0') {
          throw new Error('ROUND: step cannot be zero');
        }
        const modExpr = `(${value} % ${step})`;
        const baseExpr = `(${value} - ${modExpr})`;
        return `(${modExpr} < (${step} / 2)) ? (${baseExpr}) : ((${baseExpr}) + ${step})`;
      }

      if (name === 'ROUNDUP' && args.length >= 1) {
        const value = convert(args[0]);
        let step = '1';
        if (args.length >= 2) {
          step = convert(args[1].trim()).trim();
        }
        if (step === '0' || step === '0.0') {
          throw new Error('ROUNDUP: step cannot be zero');
        }
        const modExpr = `(${value} % ${step})`;
        return `((${value}) - (${modExpr}) + ((${modExpr}) ? ${step} : 0))`;
      }

      if (name === 'ROUNDDOWN' && args.length >= 1) {
        const value = convert(args[0]);
        let step = '1';
        if (args.length >= 2) {
          step = convert(args[1].trim()).trim();
        }
        if (step === '0' || step === '0.0') {
          throw new Error('ROUNDDOWN: step cannot be zero');
        }
        const modExpr = `(${value} % ${step})`;
        return `((${value}) - (${modExpr}))`;
      }

      throw new Error(`Unsupported function '${name}' - only IF, MIN, MAX, AND, OR, ROUND, ROUNDUP, ROUNDDOWN are allowed.`);
    }

    // Handle infix AND/OR/&&/|| at depth 0 with a depth-aware split so that
    // operators inside nested parentheses are never split on.
    for (const [kw, isAnd] of [['AND', true], ['OR', false], ['&&', true], ['||', false]]) {
      const parts = splitInfixByKeyword(expr, kw);
      if (parts.length >= 2 && parts.every(p => p !== '')) {
        const convertedArgs = parts.map(convert);
        const sumExpr = convertedArgs.map(p => `(${p} ? 1 : 0)`).join(' + ');
        return isAnd
          ? `(${sumExpr} == ${parts.length})`
          : `(${sumExpr} > 0)`;
      }
    }

    return normalizeComparisonOps(expr);
  }

  const converted = convert(e);

  // Post-conversion guard (Bug 3): ensure no forbidden tokens leaked through.
  if (/\|\|/.test(converted) || /&&/.test(converted) || /\bAND\b/.test(converted) || /\bOR\b/.test(converted)) {
    throw new Error(`Conversion produced forbidden tokens (||, &&, AND, OR) in output: ${converted}`);
  }

  function formatTernaryStructure(structure, depth = 1) {
    const lines = [];
    const prefix = `[${depth}] ` + '  '.repeat(depth - 1);

    if (structure.type === 'value') {
      lines.push(prefix + stripDisplayParens(structure.content));
      return lines;
    }

    // Always show the real condition text (stored during parsing).
    const rawCond = structure.conditionRaw !== undefined
      ? structure.conditionRaw
      : (structure.condition.type === 'value' ? structure.condition.content : '');
    const condStr = stripDisplayParens(rawCond);

    // Only wrap on ' + ' when the condition is an AND/OR sum (each term ends with '? 1 : 0').
    if (condStr.length > 72 && condStr.includes('? 1 : 0')) {
      const parts = condStr.split(' + ');
      const contIndent = prefix + '    ';
      lines.push(prefix + '┌ condition: ' + parts[0]);
      for (let i = 1; i < parts.length; i++) {
        lines.push(contIndent + '+ ' + parts[i]);
      }
    } else {
      lines.push(prefix + '┌ condition: ' + condStr);
    }

    if (structure.trueVal.type === 'value') {
      lines.push(prefix + '├ if true:  ' + stripDisplayParens(structure.trueVal.content));
    } else {
      lines.push(prefix + '├ if true:');
      lines.push(...formatTernaryStructure(structure.trueVal, depth + 1));
    }

    if (structure.falseVal.type === 'value') {
      lines.push(prefix + '└ if false: ' + stripDisplayParens(structure.falseVal.content));
    } else {
      lines.push(prefix + '└ if false:');
      lines.push(...formatTernaryStructure(structure.falseVal, depth + 1));
    }

    return lines;
  }

  function buildFormattedExplanation(output) {
    const parsed = parseTernaryStructure(output);
    const lineStrings = formatTernaryStructure(parsed);
    return lineStrings.join('\n');
  }

  function buildHumanExplanation(output) {
    const parsed = parseTernaryStructure(output);

    const steps = [];
    const stepMap = new WeakMap();

    function assignSteps(node) {
      if (node.type !== 'ternary') return;
      const stepNum = steps.length + 1;
      stepMap.set(node, stepNum);
      steps.push(node);
      assignSteps(node.trueVal);
      assignSteps(node.falseVal);
    }
    assignSteps(parsed);

    if (steps.length === 0) {
      return `No conditional logic — result: ${stripDisplayParens(parsed.content)}`;
    }

    const lines = [];
    lines.push(`${steps.length} decision step${steps.length > 1 ? 's' : ''}:`);

    for (const node of steps) {
      const stepNum = stepMap.get(node);
      const rawCond = node.conditionRaw !== undefined
        ? node.conditionRaw
        : (node.condition.type === 'value' ? node.condition.content : '');
      const condStr = stripDisplayParens(rawCond);

      lines.push('');
      lines.push(`Step ${stepNum}:`);
      lines.push(`  condition:  ${condStr}`);

      if (node.trueVal.type === 'value') {
        lines.push(`  → If YES:  result = ${stripDisplayParens(node.trueVal.content)}`);
      } else {
        lines.push(`  → If YES:  go to Step ${stepMap.get(node.trueVal)}`);
      }

      if (node.falseVal.type === 'value') {
        lines.push(`  → If NO:   result = ${stripDisplayParens(node.falseVal.content)}`);
      } else {
        lines.push(`  → If NO:   go to Step ${stepMap.get(node.falseVal)}`);
      }
    }

    return lines.join('\n');
  }

  const structuredExplanation = buildFormattedExplanation(converted);
  const naturalExplanation = buildHumanExplanation(converted);
  const combinedExplanation = `${structuredExplanation}\n\n---\n\n${naturalExplanation}`;

  return {
    pseudocode: converted,
    explanation: combinedExplanation
  };
}

// ── Pseudocode Explainer ──────────────────────────────────────────────────────

/**
 * Translate a comparison condition into plain English.
 * Handles AND/OR sum patterns and standard comparisons.
 */
function conditionToEnglish(cond) {
  // AND pattern: (X ? 1 : 0) + (Y ? 1 : 0) == N
  const andMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*==\s*(\d+)$/);
  if (andMatch) {
    const parts = andMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const conditions = parts.map(p => {
        const inner = p.match(/\((.+?)\s*\? 1 : 0\)/);
        return inner ? conditionToEnglish(inner[1].trim()) : p;
      });
      return conditions.join(' AND ');
    }
  }
  // OR pattern: (...) > 0
  const orMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*>\s*0$/);
  if (orMatch) {
    const parts = orMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const conditions = parts.map(p => {
        const inner = p.match(/\((.+?)\s*\? 1 : 0\)/);
        return inner ? conditionToEnglish(inner[1].trim()) : p;
      });
      return conditions.join(' OR ');
    }
  }

  // Complex conditions with embedded ternaries — summarize instead of expanding
  if (cond.includes('?') && cond.length > 80) {
    const floorMatch = cond.match(/^(-?[\d.]+)\s*>=\s/);
    if (floorMatch) return `the calculated result is at most ${floorMatch[1]} (minimum floor)`;
    const ceilMatch = cond.match(/^(-?[\d.]+)\s*<=\s/);
    if (ceilMatch) return `the calculated result is at least ${ceilMatch[1]} (maximum cap)`;
    // Large comparison — summarize
    const cmpParts = cond.match(/^(.{1,40})\s*(>|>=|<|<=)\s*(.{1,40})/);
    if (cmpParts) return `one calculated value ${cmpParts[2] === '>' || cmpParts[2] === '>=' ? 'exceeds' : 'is less than'} another`;
    return 'a complex calculated condition';
  }

  let s = cond;
  s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => name);
  // Simplify arithmetic threshold expressions like (14000 + 4000) → 18000
  s = s.replace(/\((\d+(?:\.\d+)?\s*[+\-*/]\s*\d+(?:\.\d+)?)\)/g, (m, expr) => {
    try {
      const v = safeEval(expr);
      if (typeof v === 'number' && !isNaN(v)) return String(v);
    } catch(e) {}
    return m;
  });
  s = s.replace(/ >= /g, ' is at least ');
  s = s.replace(/ <= /g, ' is at most ');
  s = s.replace(/ > /g, ' is greater than ');
  s = s.replace(/ < /g, ' is less than ');
  s = s.replace(/ == /g, ' equals ');
  s = s.replace(/ != /g, ' does not equal ');
  return s;
}

function valueToEnglish(val) {
  val = val.trim();
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(val)) return `the value of ${val.slice(1)}`;
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(val)) return val;
  // Complex expression — simplify variable names
  return val.replace(/\$/g, '');
}

function reconstructExcel(node) {
  if (node.type === 'value') {
    let v = stripDisplayParens(node.content);
    v = v.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1));
    return v;
  }
  const cond = node.conditionRaw || '';
  // Check for AND/OR sum patterns
  const andMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*==\s*(\d+)$/);
  if (andMatch) {
    const parts = andMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const innerConds = parts.map(p => {
        const m = p.match(/\((.+?)\s*\? 1 : 0\)/);
        return m ? m[1].trim().replace(/\$/g, '').replace(/ == /g, '=') : p;
      });
      const trueExcel = reconstructExcel(node.trueVal);
      const falseExcel = reconstructExcel(node.falseVal);
      return `IF(AND(${innerConds.join(', ')}), ${trueExcel}, ${falseExcel})`;
    }
  }
  const orMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*>\s*0$/);
  if (orMatch) {
    const parts = orMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const innerConds = parts.map(p => {
        const m = p.match(/\((.+?)\s*\? 1 : 0\)/);
        return m ? m[1].trim().replace(/\$/g, '').replace(/ == /g, '=') : p;
      });
      const trueExcel = reconstructExcel(node.trueVal);
      const falseExcel = reconstructExcel(node.falseVal);
      return `IF(OR(${innerConds.join(', ')}), ${trueExcel}, ${falseExcel})`;
    }
  }
  let condExcel = cond.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1));
  condExcel = condExcel.replace(/ == /g, '=');
  const trueExcel = reconstructExcel(node.trueVal);
  const falseExcel = reconstructExcel(node.falseVal);
  return `IF(${condExcel}, ${trueExcel}, ${falseExcel})`;
}

/**
 * Safe expression evaluator — supports: numbers, +, -, *, /, %, comparisons, ternary, parens.
 * No eval() or Function() used. Returns a number.
 */
function safeEval(expr) {
  const tokens = [];
  let i = 0;
  const s = expr.replace(/\s+/g, ' ').trim();
  while (i < s.length) {
    if (s[i] === ' ') { i++; continue; }
    // Number (including negative at start or after operator/open-paren)
    if (/[0-9]/.test(s[i]) || (s[i] === '-' && (tokens.length === 0 || /^[(%*\/+\-<>=!?:,]$/.test(tokens[tokens.length - 1])))) {
      let num = '';
      if (s[i] === '-') { num += '-'; i++; }
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      tokens.push(parseFloat(num));
      continue;
    }
    // Two-char operators
    if (i + 1 < s.length) {
      const two = s[i] + s[i + 1];
      if (['<=', '>=', '==', '!='].includes(two)) { tokens.push(two); i += 2; continue; }
    }
    tokens.push(s[i]);
    i++;
  }

  let pos = 0;
  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function next() { return tokens[pos++]; }

  function parseTernary() {
    let left = parseComparison();
    if (peek() === '?') {
      next(); // eat ?
      const trueVal = parseTernary();
      if (peek() !== ':') throw new Error('Expected : in ternary');
      next(); // eat :
      const falseVal = parseTernary();
      return left ? trueVal : falseVal;
    }
    return left;
  }

  function parseComparison() {
    let left = parseAddSub();
    while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) {
      const op = next();
      const right = parseAddSub();
      if (op === '<') left = left < right ? 1 : 0;
      else if (op === '>') left = left > right ? 1 : 0;
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
      const op = next();
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = parseUnary();
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

/**
 * Evaluate pseudocode with given variable values, tracking which branches are taken.
 */
function evaluateWithTrace(pseudocode, values) {
  // Substitute variables
  let expr = pseudocode;
  for (const [varName, val] of Object.entries(values)) {
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expr = expr.replace(new RegExp('\\$' + escaped, 'g'), String(val));
  }

  // Check for remaining unresolved variables
  const remaining = expr.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g);
  if (remaining) {
    return { error: `Missing values for: ${[...new Set(remaining)].join(', ')}` };
  }

  const parsed = parseTernaryStructure(expr);
  const trace = [];

  function walk(node, stepIndex) {
    if (node.type === 'value') {
      const val = safeEval(stripDisplayParens(node.content));
      trace.push({ type: 'result', step: stepIndex, value: val });
      return val;
    }
    const condStr = stripDisplayParens(node.conditionRaw || '');
    let condResult;
    try { condResult = safeEval(condStr); } catch { condResult = 0; }
    const isTruthy = Boolean(condResult);
    trace.push({ type: 'condition', step: stepIndex, condition: condStr, result: isTruthy });
    return isTruthy ? walk(node.trueVal, stepIndex + 1) : walk(node.falseVal, stepIndex + 1);
  }

  try {
    const result = walk(parsed, 1);
    return { result, trace };
  } catch (e) {
    return { error: 'Could not evaluate: ' + e.message };
  }
}

/**
 * Main explainer: takes pseudocode, returns structured explanation data.
 */
function explainPseudocode(pseudocode) {
  const code = pseudocode.trim();
  const parsed = parseTernaryStructure(code);

  // Collect variables
  const vars = new Set();
  function collectVars(node) {
    const sources = [];
    if (node.type === 'value') sources.push(node.content);
    if (node.conditionRaw) sources.push(node.conditionRaw);
    if (node.type === 'ternary') {
      collectVars(node.trueVal);
      collectVars(node.falseVal);
    }
    for (const src of sources) {
      const matches = src.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g);
      if (matches) matches.forEach(v => vars.add(v));
    }
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
    const step = {
      type: 'decision',
      stepNum,
      condition: condStr,
      conditionEnglish: conditionToEnglish(condStr),
      trueOutcome: null,
      falseOutcome: null,
    };
    steps.push(step);
    step.trueOutcome = buildSteps(node.trueVal);
    step.falseOutcome = buildSteps(node.falseVal);
    return step;
  }
  buildSteps(parsed);

  // Structural analysis — extract guards, clamps, etc.
  const { structures, coreNode } = detectStructure(parsed);

  // Also build steps from the core node (without guard/clamp wrappers)
  const coreSteps = [];
  function buildCoreSteps(node) {
    if (node.type === 'value') {
      const v = stripDisplayParens(node.content);
      return { type: 'result', value: v, english: valueToEnglish(v) };
    }
    const stepNum = coreSteps.length + 1;
    const condStr = stripDisplayParens(node.conditionRaw || '');
    const step = {
      type: 'decision',
      stepNum,
      condition: condStr,
      conditionEnglish: conditionToEnglish(condStr),
      trueOutcome: null,
      falseOutcome: null,
    };
    coreSteps.push(step);
    step.trueOutcome = buildCoreSteps(node.trueVal);
    step.falseOutcome = buildCoreSteps(node.falseVal);
    return step;
  }
  if (structures.length > 0) buildCoreSteps(coreNode);

  // Reconstruct Excel formula
  let excelFormula = '';
  try { excelFormula = '=' + reconstructExcel(parsed); } catch { excelFormula = '(could not reconstruct)'; }

  // ── Pattern detection ────────────────────────────────────────────────────
  const patterns = detectPatterns(parsed);
  const tables = detectTables(parsed);

  // Build plain-English summary
  const summaryLines = [];

  // Show structural breakdown first (if any)
  if (structures.length > 0) {
    summaryLines.push('Structure:');
    for (const s of structures) {
      const icon = s.type === 'guard' ? '[Guard]' : s.type === 'clamp' ? '[Clamp]' : s.type === 'comparison' ? '[Compare]' : s.type === 'rounding' ? '[Round]' : '[Info]';
      summaryLines.push(`  ${icon} ${s.description}`);
    }
    summaryLines.push('');
  }

  // Use core steps if structures were found, otherwise use full steps
  const displaySteps = structures.length > 0 ? coreSteps : steps;

  if (displaySteps.length === 0 && structures.length === 0) {
    summaryLines.push(`This expression simply returns: ${stripDisplayParens(parsed.content)}`);
  } else {
    if (displaySteps.length > 0) {
      summaryLines.push(`This formula has ${displaySteps.length} decision point${displaySteps.length > 1 ? 's' : ''}.`);
    }

    // Add pattern annotations
    if (patterns.length > 0) {
      summaryLines.push('');
      summaryLines.push('Detected patterns:');
      for (const p of patterns) {
        summaryLines.push(`  * ${p.description}`);
      }
    }

    if (tables.length > 0) {
      summaryLines.push('');
      summaryLines.push(`Contains ${tables.length} lookup table${tables.length > 1 ? 's' : ''} (see Tables tab for details).`);
    }

    for (const step of displaySteps) {
      summaryLines.push('');
      summaryLines.push(`Step ${step.stepNum}: Check whether ${step.conditionEnglish}`);
      if (step.trueOutcome.type === 'result') {
        summaryLines.push(`  \u2713 If YES \u2192 return ${step.trueOutcome.english}`);
      } else {
        summaryLines.push(`  \u2713 If YES \u2192 go to Step ${step.trueOutcome.stepNum}`);
      }
      if (step.falseOutcome.type === 'result') {
        summaryLines.push(`  \u2717 If NO  \u2192 return ${step.falseOutcome.english}`);
      } else {
        summaryLines.push(`  \u2717 If NO  \u2192 go to Step ${step.falseOutcome.stepNum}`);
      }
    }
  }

  return {
    variables: [...vars],
    steps,
    excelFormula,
    summary: summaryLines.join('\n'),
    patterns,
    tables,
    structures,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Pattern Detection ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detect MIN/MAX equivalents, rounding patterns, and common sub-expressions.
 */
function detectPatterns(node) {
  const results = [];
  const seen = new Set();

  function walk(n) {
    if (n.type !== 'ternary') return;
    const cond = stripDisplayParens(n.conditionRaw || '');
    const trueV = n.trueVal.type === 'value' ? stripDisplayParens(n.trueVal.content) : null;
    const falseV = n.falseVal.type === 'value' ? stripDisplayParens(n.falseVal.content) : null;

    // CLAMP pattern: CONST >= expr ? CONST : CONST2 <= expr ? CONST2 : expr
    // This means: result is bounded between CONST (floor) and CONST2 (ceiling)
    if (trueV !== null) {
      const clampFloor = cond.match(/^(-?[\d.]+)\s*>=\s/);
      if (clampFloor && trueV === clampFloor[1] && n.falseVal.type === 'ternary') {
        const innerCond = stripDisplayParens(n.falseVal.conditionRaw || '');
        const innerTrue = n.falseVal.trueVal.type === 'value' ? stripDisplayParens(n.falseVal.trueVal.content) : null;
        const clampCeil = innerCond.match(/^(-?[\d.]+)\s*<=\s/);
        if (clampCeil && innerTrue === clampCeil[1]) {
          const key = `CLAMP(${clampFloor[1]}, ${clampCeil[1]})`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              type: 'clamp', min: clampFloor[1], max: clampCeil[1],
              description: `CLAMP: Result is bounded between ${clampFloor[1]} (minimum) and ${clampCeil[1]} (maximum)`
            });
          }
          walk(n.falseVal.falseVal);
          return;
        }
      }
    }

    // Conditional value: $var > 0 ? VALUE : 0 (optional addition/deduction)
    if (trueV && falseV === '0') {
      const condValMatch = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*>\s*0$/);
      if (condValMatch) {
        const key = `COND_${condValMatch[1]}_${trueV}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            type: 'conditional', variable: clean(condValMatch[1]), value: trueV,
            description: `Conditional: adds ${trueV} only when ${clean(condValMatch[1])} > 0`
          });
        }
        return;
      }
    }

    // MAX(a, b) pattern: (a > b) ? a : b  or  (a >= b) ? a : b
    const maxMatch = cond.match(/^(.+?)\s*(?:>|>=)\s*(.+)$/);
    if (maxMatch && trueV && falseV) {
      const [, left, right] = maxMatch;
      if (norm(left) === norm(trueV) && norm(right) === norm(falseV)) {
        const key = `MAX(${clean(left)}, ${clean(right)})`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ type: 'max', a: clean(left), b: clean(right),
            description: `MAX pattern: "${clean(cond)}" → MAX(${clean(left)}, ${clean(right)})` });
        }
        return; // don't recurse into recognized leaf
      }
    }

    // MIN(a, b) pattern: (a < b) ? a : b  or  (a <= b) ? a : b
    const minMatch = cond.match(/^(.+?)\s*(?:<|<=)\s*(.+)$/);
    if (minMatch && trueV && falseV) {
      const [, left, right] = minMatch;
      if (norm(left) === norm(trueV) && norm(right) === norm(falseV)) {
        const key = `MIN(${clean(left)}, ${clean(right)})`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ type: 'min', a: clean(left), b: clean(right),
            description: `MIN pattern: "${clean(cond)}" → MIN(${clean(left)}, ${clean(right)})` });
        }
        return;
      }
    }

    // ROUND pattern: (expr % step < step/2) ? (expr - expr % step) : (expr - expr % step + step)
    const roundMatch = cond.match(/^(.+?)\s*%\s*(.+?)\s*<\s*(.+?)\s*\/\s*2$/);
    if (roundMatch) {
      const key = `ROUND(${clean(roundMatch[1])}, ${clean(roundMatch[2])})`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ type: 'round', value: clean(roundMatch[1]), step: clean(roundMatch[2]),
          description: `ROUND pattern: rounds ${clean(roundMatch[1])} to nearest ${clean(roundMatch[2])}` });
      }
    }

    // ROUNDUP pattern: expr - (expr % step) + ((expr % step) ? step : 0)
    if (trueV || falseV) {
      const upCheck = (trueV || '').match(/^(.+?)\s*%\s*(.+)$/);
      if (upCheck) {
        const key = `ROUNDUP(${clean(upCheck[1])}, ${clean(upCheck[2])})`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ type: 'roundup', value: clean(upCheck[1]), step: clean(upCheck[2]),
            description: `ROUNDUP pattern: rounds ${clean(upCheck[1])} up to next ${clean(upCheck[2])}` });
        }
      }
    }

    walk(n.trueVal);
    walk(n.falseVal);
  }

  function norm(s) { return s.replace(/\s+/g, '').replace(/^\(+|\)+$/g, ''); }
  function clean(s) { return s.replace(/^\(+|\)+$/g, '').trim(); }

  walk(node);
  return results;
}

/**
 * Detect high-level structural patterns: guards, clamps, comparisons.
 * Returns the structural annotations and the "core" formula node (after stripping wrappers).
 */
function detectStructure(rootNode) {
  const structures = [];
  let coreNode = rootNode;

  // Guard: $var > 0 ? (main) : 0
  if (coreNode.type === 'ternary') {
    const cond = stripDisplayParens(coreNode.conditionRaw || '');
    const falseV = coreNode.falseVal.type === 'value' ? stripDisplayParens(coreNode.falseVal.content) : null;
    const guardMatch = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>|>=|!=)\s*0$/);
    if (guardMatch && (falseV === '0' || falseV === '0.0')) {
      structures.push({
        type: 'guard',
        variable: guardMatch[1],
        description: `Only applies when ${guardMatch[1].slice(1)} > 0; otherwise returns 0`,
      });
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
        structures.push({
          type: 'clamp',
          min: floorMatch[1],
          max: ceilMatch[1],
          description: `Result is clamped between ${floorMatch[1]} (minimum) and ${ceilMatch[1]} (maximum)`,
        });
        coreNode = coreNode.falseVal.falseVal;
      }
    }
  }

  // Top-level comparison: A > B ? A : B = MAX  or  A > B ? B : A = MIN
  if (coreNode.type === 'ternary') {
    const cond = stripDisplayParens(coreNode.conditionRaw || '');
    const trueV = coreNode.trueVal.type === 'value' ? stripDisplayParens(coreNode.trueVal.content) : null;
    const falseV = coreNode.falseVal.type === 'value' ? stripDisplayParens(coreNode.falseVal.content) : null;
    if (trueV && falseV) {
      const cmpMatch = cond.match(/^(.+?)\s*(>|>=)\s*(.+)$/);
      if (cmpMatch) {
        const normL = cmpMatch[1].replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        const normR = cmpMatch[3].replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        const normT = trueV.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        const normF = falseV.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
        if (normL === normT && normR === normF) {
          structures.push({ type: 'comparison', subType: 'max', description: 'Takes the LARGER of two calculated values (MAX)' });
        } else if (normL === normF && normR === normT) {
          structures.push({ type: 'comparison', subType: 'min', description: 'Takes the SMALLER of two calculated values (MIN)' });
        }
      }
    }
  }

  // Check for modulo rounding in value nodes
  if (coreNode.type === 'value') {
    const v = stripDisplayParens(coreNode.content);
    const modMatch = v.match(/%\s*(\d+)\s*$/);
    if (modMatch) {
      structures.push({ type: 'rounding', step: modMatch[1], description: `Result is rounded down to the nearest ${modMatch[1]}` });
    }
  }

  return { structures, coreNode };
}

/**
 * Detect chained else-if ladders (lookup tables) and nested tiers.
 * Returns an array of table objects, each with a variable, rows, title, and formula description.
 */
function detectTables(rootNode) {
  const tables = [];

  function tryExtractChain(node) {
    // A chain is: var op val ? result : var op val ? result : ... : default
    // All conditions must test the same variable with the same operator
    const rows = [];
    let current = node;
    let chainVar = null;
    let chainOp = null;

    while (current.type === 'ternary') {
      const cond = stripDisplayParens(current.conditionRaw || '');
      // Match: $var >= N  or  $var > N  or  $var <= N  or  $var < N  or  $var == N
      const m = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|>|<=|<|==|!=)\s*(.+)$/);
      if (!m) break;
      const [, varName, op, threshold] = m;
      if (chainVar === null) { chainVar = varName; chainOp = op; }
      else if (varName !== chainVar) break; // different variable — not a chain

      // Evaluate arithmetic thresholds like (14000 + 4000) → 18000
      let thresholdClean = threshold.trim();
      if (/[+\-*/]/.test(thresholdClean) && !/\$/.test(thresholdClean)) {
        try {
          const evaluated = safeEval(thresholdClean);
          if (typeof evaluated === 'number' && !isNaN(evaluated)) {
            thresholdClean = String(evaluated);
          }
        } catch(e) { /* keep original */ }
      }

      const trueResult = describeValue(current.trueVal);
      rows.push({ threshold: thresholdClean, op, result: trueResult.text, isFormula: trueResult.isFormula, formulaDesc: trueResult.formulaDesc });

      current = current.falseVal;
    }

    if (rows.length < 2) return null; // need at least 2 rows to be a useful table

    // The final fallthrough (else/default)
    const defaultVal = describeValue(current);
    rows.push({ threshold: 'otherwise', op: '', result: defaultVal.text, isFormula: defaultVal.isFormula, formulaDesc: defaultVal.formulaDesc });

    return { variable: chainVar, operator: chainOp, rows, rowCount: rows.length };
  }

  function describeValue(node) {
    if (node.type === 'value') {
      const v = stripDisplayParens(node.content);
      const fDesc = describeFormula(v);
      return { text: v, isFormula: fDesc !== null, formulaDesc: fDesc };
    }
    // If the value is itself a chain, just say "nested table"
    const subChain = tryExtractChain(node);
    if (subChain && subChain.rowCount >= 3) {
      return { text: `[lookup on ${subChain.variable}]`, isFormula: false, formulaDesc: null };
    }
    // Simple ternary — describe it briefly
    const cond = stripDisplayParens(node.conditionRaw || '');
    const tv = node.trueVal.type === 'value' ? stripDisplayParens(node.trueVal.content) : '...';
    const fv = node.falseVal.type === 'value' ? stripDisplayParens(node.falseVal.content) : '...';
    return { text: `IF(${cond}, ${tv}, ${fv})`, isFormula: true, formulaDesc: null };
  }

  /**
   * Describe common formula shapes in plain English.
   */
  function describeFormula(expr) {
    const s = expr.replace(/\s+/g, ' ').trim();

    // Pattern: ($coa - MAX($sai,0)) * rate - $merit - $pell - $state
    // Represented as: ($coa - ($sai > 0 ? $sai : 0)) * 0.85 - $merit - $pell - $state
    const rateMatch = s.match(/^\(\$([a-z]+)\s*-\s*\(\$([a-z]+)\s*>\s*0\s*\?\s*\$\2\s*:\s*0\)\)\s*\*\s*([\d.]+)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)$/);
    if (rateMatch) {
      const [, base, saiVar, rate, d1, d2, d3] = rateMatch;
      const pct = (parseFloat(rate) * 100).toFixed(0);
      return `(${base} − MAX(${saiVar}, 0)) × ${pct}% − ${d1} − ${d2} − ${d3}`;
    }

    // Pattern: $coa - MAX($sai,0) - $merit - $pell - $state  (rate = 1.0 / full)
    const fullMatch = s.match(/^\$([a-z]+)\s*-\s*\(\$([a-z]+)\s*>\s*0\s*\?\s*\$\2\s*:\s*0\)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)\s*-\s*\$([a-z]+)$/);
    if (fullMatch) {
      const [, base, saiVar, d1, d2, d3] = fullMatch;
      return `${base} − MAX(${saiVar}, 0) − ${d1} − ${d2} − ${d3} (100%)`;
    }

    // Simple MAX($var, 0) pattern
    const maxZero = s.match(/^\$([a-z]+)\s*>\s*0\s*\?\s*\$\1\s*:\s*0$/);
    if (maxZero) return `MAX(${maxZero[1]}, 0)`;

    // Rounding via modular arithmetic
    if (s.includes('%') && (s.includes('?') || s.includes(':'))) {
      return 'rounding operation';
    }

    // Simple numeric
    if (/^-?[\d.]+$/.test(s)) return null; // not a formula

    return null;
  }

  /**
   * Recursively walk the tree looking for tables.  When an outer variable
   * branches on a threshold and each branch contains an inner chain on a
   * different variable, build a nested tier table.
   */
  function scanValueForEmbeddedTables(text, depth) {
    const stripped = stripDisplayParens(text);
    let i = 0, parenDepth = 0, groupStart = -1;
    while (i < stripped.length) {
      if (stripped[i] === '(') {
        if (parenDepth === 0) groupStart = i;
        parenDepth++;
      } else if (stripped[i] === ')') {
        parenDepth--;
        if (parenDepth === 0 && groupStart >= 0) {
          const inner = stripped.substring(groupStart + 1, i).trim();
          if (inner.includes('?') && inner.includes(':') && inner.length > 30) {
            const parsed = parseTernaryStructure(inner);
            if (parsed.type === 'ternary') {
              findTables(parsed, depth + 1);
            }
          }
          groupStart = -1;
        }
      }
      i++;
    }
  }

  function findTables(node, depth) {
    if (node.type !== 'ternary') {
      // Scan value nodes for embedded ternary chains (rate tables, etc.)
      if (node.type === 'value' && depth < 5) {
        scanValueForEmbeddedTables(node.content, depth);
      }
      return;
    }

    // Try to extract a chain starting here
    const chain = tryExtractChain(node);
    if (chain && chain.rowCount >= 3) {
      // Check if any row results are themselves sub-chains (nested tiers)
      let hasInnerTables = false;
      let current = node;
      const outerRows = [];
      while (current.type === 'ternary') {
        const cond = stripDisplayParens(current.conditionRaw || '');
        const m = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|>|<=|<|==|!=)\s*(.+)$/);
        if (!m || m[1] !== chain.variable) break;
        const innerChain = tryExtractChain(current.trueVal);
        // Evaluate arithmetic thresholds for tier rows
        let tierThreshold = m[3].trim();
        if (/[+\-*/]/.test(tierThreshold) && !/\$/.test(tierThreshold)) {
          try {
            const ev = safeEval(tierThreshold);
            if (typeof ev === 'number' && !isNaN(ev)) tierThreshold = String(ev);
          } catch(e) {}
        }
        if (innerChain && innerChain.rowCount >= 3) {
          hasInnerTables = true;
          outerRows.push({ threshold: tierThreshold, op: m[2], innerTable: innerChain });
        } else {
          outerRows.push({ threshold: tierThreshold, op: m[2], innerTable: null, simpleResult: describeValue(current.trueVal) });
        }
        current = current.falseVal;
      }

      if (hasInnerTables && outerRows.length >= 2) {
        // This is a nested tier table (e.g., merit tiers × SAI ranges)
        const innerVar = outerRows.find(r => r.innerTable)?.innerTable.variable || '?';
        tables.push({
          type: 'nested',
          outerVariable: chain.variable,
          innerVariable: innerVar,
          outerOperator: chain.operator,
          tiers: outerRows.map(r => ({
            threshold: r.threshold,
            op: r.op,
            rows: r.innerTable ? r.innerTable.rows : [{ threshold: '-', op: '', result: r.simpleResult.text, isFormula: r.simpleResult.isFormula, formulaDesc: r.simpleResult.formulaDesc }],
          })),
          defaultResult: describeValue(current),
          title: `Lookup: ${chain.variable} tiers × ${innerVar} ranges`,
        });
        return; // don't recurse further
      }

      // Simple flat lookup table
      tables.push({
        type: 'flat',
        variable: chain.variable,
        operator: chain.operator,
        rows: chain.rows,
        title: `Lookup table on ${chain.variable}`,
      });
      return;
    }

    // Not a chain — recurse
    if (node.type === 'ternary') {
      findTables(node.trueVal, depth + 1);
      findTables(node.falseVal, depth + 1);
    }
  }

  findTables(rootNode, 0);
  return tables;
}

module.exports = {
  toPseudocode,
  explainPseudocode,
  evaluateWithTrace,
  splitArgs,
  splitInfixByKeyword,
  normalizeComparisonOps,
  isWrappedWithParentheses,
  decimalPlacesToStep
};