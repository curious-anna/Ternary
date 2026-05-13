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
  // Use negative lookahead so we never re-match the '<' or '>' inside '<=' / '>='
  s = s.replace(/\s*<(?!=)\s*/g, ' < ');
  s = s.replace(/\s*>(?!=)\s*/g, ' > ');
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

function wrapForBinaryOperand(expr) {
  const trimmed = expr.trim();
  if (trimmed === '') return '()';
  return isWrappedWithParentheses(trimmed) ? trimmed : `(${trimmed})`;
}

function parseTernaryStructure(code) {
  code = code.trim();
  // Strip fully wrapping outer parens before scanning for depth-0 ternary operators
  while (isWrappedWithParentheses(code)) {
    code = code.slice(1, -1).trim();
  }
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

/**
 * Remove unmatched parentheses from a string.
 * - Forward pass: mark unmatched ')' for removal
 * - Backward pass: mark unmatched '(' for removal
 */
function balanceParens(str) {
  const chars = str.split('');
  const toRemove = new Set();
  // Forward pass: find unmatched close parens
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '(') depth++;
    else if (chars[i] === ')') {
      if (depth > 0) depth--;
      else toRemove.add(i);
    }
  }
  // Backward pass: find unmatched open parens
  depth = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === ')') depth++;
    else if (chars[i] === '(') {
      if (depth > 0) depth--;
      else toRemove.add(i);
    }
  }
  if (toRemove.size === 0) return str;
  return chars.filter((_, i) => !toRemove.has(i)).join('');
}

function toPseudocode(rawInput) {
  let e = rawInput.trim();
  if (e.startsWith('=')) e = e.slice(1).trim();

  // ── Auto-balance parentheses by removing unmatched ones ──
  e = balanceParens(e);

  const reserved = new Set(['IF', 'MIN', 'MAX', 'AND', 'OR', 'ROUND', 'ROUNDUP', 'ROUNDDOWN']);

  // Normalize user-provided variable names with `$` prefix.
  e = e.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => `$${name}`);

  // Add `$` prefix to identifier tokens that are not reserved functions and not already prefixed.
  e = e.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, _p1, offset, string) => {
    if (offset > 0 && string[offset - 1] === '$') {
      return match;
    }
    const upper = match.toUpperCase();
    if (reserved.has(upper)) return upper;
    return `$${match}`;
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
        const valueOperand = wrapForBinaryOperand(value);
        const stepOperand = wrapForBinaryOperand(step);
        const modExpr = `(${valueOperand} % ${stepOperand})`;
        const baseExpr = `(${valueOperand} - ${modExpr})`;
        return `(${modExpr} < (${stepOperand} / 2)) ? (${baseExpr}) : ((${baseExpr}) + ${stepOperand})`;
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
        const valueOperand = wrapForBinaryOperand(value);
        const stepOperand = wrapForBinaryOperand(step);
        const modExpr = `(${valueOperand} % ${stepOperand})`;
        return `((${valueOperand}) - (${modExpr}) + ((${modExpr}) ? ${stepOperand} : 0))`;
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
        const valueOperand = wrapForBinaryOperand(value);
        const stepOperand = wrapForBinaryOperand(step);
        const modExpr = `(${valueOperand} % ${stepOperand})`;
        return `((${valueOperand}) - (${modExpr}))`;
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
 * Extract boolean flag groups from a sum expression like:
 *   (A ? 1 : 0) + (B ? 1 : 0)
 * Returns array of inner condition strings, or null if not a flag-sum pattern.
 * Handles nested parens (unlike the old regex approach).
 */
function extractFlagGroups(sumExpr) {
  let s = sumExpr.trim();
  // Strip outermost wrapping parens if the entire expression is enclosed
  while (s.startsWith('(')) {
    let depth = 1, j = 1;
    while (j < s.length && depth > 0) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')') depth--;
      j++;
    }
    if (j === s.length) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  const groups = [];
  let i = 0;
  while (i < s.length) {
    // Skip whitespace and +
    if (/[\s+]/.test(s[i])) { i++; continue; }
    if (s[i] === '(') {
      // Find matching close paren
      let depth = 1, j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')') depth--;
        j++;
      }
      const group = s.slice(i + 1, j - 1).trim(); // content inside outer parens
      // Check if this group ends with ? 1 : 0
      const flag = extractFlagFromContent(group);
      if (flag === null) return null;
      groups.push(flag);
      i = j;
    } else {
      // Not a paren group — check if the remainder itself is a single bare flag
      // e.g. after stripping outer parens: "COND ? 1 : 0"
      const remainder = s.slice(i).trim();
      if (groups.length === 0) {
        const flag = extractFlagFromContent(remainder);
        if (flag !== null) return [flag];
      }
      return null;
    }
  }
  return groups.length >= 1 ? groups : null;
}

/**
 * Check if content matches a flag pattern: COND ? 1 : 0
 * Returns the inner condition string or null.
 */
function extractFlagFromContent(content) {
  // Find the LAST top-level ? ... : ...
  let qPos = -1, cPos = -1, gDepth = 0;
  for (let k = content.length - 1; k >= 0; k--) {
    if (content[k] === ')') gDepth++;
    else if (content[k] === '(') gDepth--;
    else if (gDepth === 0 && content[k] === ':' && cPos < 0) cPos = k;
    else if (gDepth === 0 && content[k] === '?' && cPos >= 0 && qPos < 0) qPos = k;
  }
  if (qPos < 0 || cPos < 0) return null;
  const trueVal = content.slice(qPos + 1, cPos).trim();
  const falseVal = content.slice(cPos + 1).trim();
  if (trueVal !== '1' || falseVal !== '0') return null;
  return content.slice(0, qPos).trim();
}

/**
 * Try to interpret a condition as an AND/OR boolean flag pattern.
 * Returns { type: 'and'|'or', conditions: string[] } or null.
 */
function parseAndOrPattern(cond) {
  const s = cond.trim();
  // AND pattern: flagSum == N  (including single flag == 1)
  {
    const cmp = findOutermostComparison(s);
    if (cmp && cmp.op === '==' && /^\d+$/.test(cmp.right.trim())) {
      const flags = extractFlagGroups(cmp.left);
      if (flags && flags.length >= 1) {
        return { type: 'and', conditions: flags, count: parseInt(cmp.right.trim()) };
      }
    }
  }
  // OR pattern: flagSum > 0  or  flagSum >= 1
  {
    const cmp = findOutermostComparison(s);
    if (cmp && ((cmp.op === '>' && cmp.right.trim() === '0') || (cmp.op === '>=' && cmp.right.trim() === '1'))) {
      const flags = extractFlagGroups(cmp.left);
      if (flags && flags.length >= 1) {
        return { type: 'or', conditions: flags };
      }
    }
  }
  return null;
}

/**
 * Describe a single flag condition recursively.
 * If it's itself an AND/OR pattern, recursively expand.
 * Returns a plain English string.
 */
function describeFlagCondition(cond, formatter) {
  // Check if this flag is itself an AND/OR wrapped in a ternary: ((OR_PATTERN) >= 1 ? 1 : 0)-style
  // But here we receive the raw inner condition, so check directly
  const nested = parseAndOrPattern(cond);
  if (nested) {
    const subs = nested.conditions.map(c => describeFlagCondition(c, formatter));
    if (nested.type === 'and') {
      const prefix = subs.length === 2 ? 'both ' : subs.length > 2 ? 'all of: ' : '';
      return `(${prefix}${subs.join(' AND ')})`;
    } else {
      return `(${subs.join(' OR ')})`;
    }
  }
  return formatter(cond);
}

/**
 * Translate a comparison condition into plain English.
 * Handles AND/OR sum patterns and standard comparisons.
 */
function conditionToEnglish(cond) {
  // AND/OR pattern using depth-aware parsing
  const andOr = parseAndOrPattern(cond);
  if (andOr) {
    // Single flag: (COND ? 1 : 0) == 1  →  just the condition
    if (andOr.conditions.length === 1 && (andOr.count === 1 || andOr.type === 'or')) {
      return describeFlagCondition(andOr.conditions[0], conditionToEnglish);
    }
    const subs = andOr.conditions.map(c => describeFlagCondition(c, conditionToEnglish));
    if (andOr.type === 'and') {
      return subs.join(' AND ');
    } else {
      return subs.join(' OR ');
    }
  }

  // Complex conditions with embedded ternaries — decompose
  if (cond.includes('?') && cond.length > 80) {
    // Find the outermost comparison operator at depth 0
    const outerCmp = findOutermostComparison(cond);
    if (outerCmp) {
      let leftDesc = describeArithmeticExpr(outerCmp.left);
      let rightDesc = describeArithmeticExpr(outerCmp.right);
      // Choose descriptive names based on content
      const leftName = /\bif\b/.test(leftDesc) || /\belse\b/.test(leftDesc) ? 'Option A' : 'Amount A';
      const rightName = /\bif\b/.test(rightDesc) || /\belse\b/.test(rightDesc) ? 'Option B' : 'Amount B';
      // Auto-shorten both sides if they're still long
      leftDesc = autoShortenIfLong(leftDesc, leftName, 55);
      rightDesc = autoShortenIfLong(rightDesc, rightName, 55);
      return `${leftDesc} ${outerCmp.op} ${rightDesc}`;
    }
    let desc = describeArithmeticExpr(cond);
    return autoShortenIfLong(desc, 'Condition', 80);
  }

  // Simple condition — keep math, format nicely
  let s = cond;
  // Simplify arithmetic threshold expressions like (14000 + 4000) → 18,000
  s = s.replace(/\((\d+(?:\.\d+)?\s*[+\-*/]\s*\d+(?:\.\d+)?)\)/g, (m, expr) => {
    try {
      const v = safeEval(expr);
      if (typeof v === 'number' && !isNaN(v)) return formatNum(v);
    } catch(e) {}
    return m;
  });
  // Format standalone numbers with commas
  s = s.replace(/(?<!\$)\b(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?\b/g, (m) => {
    const n = parseFloat(m.replace(/,/g, ''));
    if (!isNaN(n)) return formatNum(n);
    return m;
  });
  return s;
}

/**
 * Format a number with commas (e.g. 13900 → "13,900").
 * Preserves decimals.
 */
function formatNum(n) {
  if (typeof n === 'string') n = parseFloat(n.replace(/,/g, ''));
  if (isNaN(n)) return String(n);
  const parts = n.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function valueToEnglish(val) {
  val = val.trim();
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(val)) return val;
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(val)) return formatNum(parseFloat(val));

  // Simplify pure arithmetic (no variables): "3000 + 2000" → "5,000"
  if (/^\d+(\.\d+)?\s*[+\-*]\s*\d+(\.\d+)?$/.test(val)) {
    try {
      const v = safeEval(val);
      if (typeof v === 'number' && !isNaN(v)) return formatNum(v);
    } catch(e) {}
  }

  // Try to describe complex arithmetic expressions with embedded ternaries
  if (val.includes('?') && val.includes(':')) {
    let desc = describeArithmeticExpr(val);
    if (desc) {
      // Auto-shorten long results into definitions for clarity
      desc = autoShortenIfLong(desc, 'Result', 60);
      return desc;
    }
  }
  // Format numbers with commas, keep $variables
  let formatted = formatExprNumbers(val);
  // Also auto-shorten plain long expressions
  if (formatted.length > 60 && !formatted.startsWith('[')) {
    formatted = autoShortenIfLong(formatted, 'Amount', 60);
  }
  return formatted;
}

// ── Definitions Registry ─────────────────────────────────────────────────────
// Accumulates labeled definitions (lookup tables, proration rates, etc.) so
// inline descriptions stay short and the details appear once at the bottom.
let _definitions = [];  // { label, detail }
let _definitionIndex = 0;

function resetDefinitions() { _definitions = []; _definitionIndex = 0; }

/**
 * Register a definition and return its short label.
 * If an identical detail already exists, reuse its label.
 */
function addDefinition(baseName, detail) {
  // Exact match — reuse
  const existing = _definitions.find(d => d.detail === detail);
  if (existing) return existing.label;
  // Trim whitespace for matching
  const trimmed = detail.trim();
  const existingTrimmed = _definitions.find(d => d.detail.trim() === trimmed);
  if (existingTrimmed) return existingTrimmed.label;
  _definitionIndex++;
  // Avoid label collisions — if baseName is taken, append a number
  let label = baseName;
  const taken = _definitions.filter(d => d.label === label || d.label.match(new RegExp('^' + baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\d+$')));
  if (taken.length > 0) {
    label = `${baseName} ${taken.length + 1}`;
  }
  _definitions.push({ label, detail });
  return label;
}

function getDefinitions() { return _definitions; }

// ── Enhanced Explanation Helpers ──────────────────────────────────────────────

/**
 * Simple condition-to-English for embedded descriptions.
 * Handles basic comparisons without recursive ternary expansion.
 */
function conditionToEnglishSimple(cond) {
  let s = cond.trim();
  // Simplify parenthesized ternary groups first (before stripping $)
  s = simplifyEmbeddedTernaries(s);
  // Format numbers with commas, keep $variables and operator symbols
  s = formatExprNumbers(s);
  // Convert * to × for readability
  s = s.replace(/\s*\*\s*/g, ' × ');
  // If result is very long, auto-shorten the LHS of the comparison
  if (s.length > 80) {
    const comp = findComparisonInSimplified(s);
    if (comp && comp.left.length > 40) {
      const lhs = stripDisplayParens(comp.left.trim());
      const label = addDefinition('Eligibility', lhs);
      s = `[${label}] ${comp.op} ${comp.right}`;
    }
  }
  return s;
}

/**
 * Replace parenthesized ternary sub-expressions with concise labels.
 * Safe from recursion: only uses extractLookupChain and parseTernaryStructure
 * (never calls conditionToEnglishSimple or describeEmbeddedTernary).
 */
function simplifyEmbeddedTernaries(s) {
  let result = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')') depth--;
        j++;
      }
      const group = s.slice(i, j);
      if (group.includes('?') && group.includes(':')) {
        // Try as a lookup chain first
        const chain = extractLookupChain(group);
        if (chain) {
          const label = registerChainDefinition(chain);
          result += `[${label}]`;
          i = j;
          continue;
        }
        // Recursively simplify inner content first
        const simplified = simplifyEmbeddedTernaries(group.slice(1, -1));
        // After simplification, try extracting as chain or simple conditional
        if (simplified.includes('?') && simplified.includes(':')) {
          // Boolean flag: (COND ? 1 : 0) → leave as-is for AND/OR detection
          const flagParsed = parseTernaryStructure(simplified);
          if (flagParsed.type === 'ternary') {
            const fTV = flagParsed.trueVal.type === 'value' ? stripDisplayParens(flagParsed.trueVal.content) : null;
            const fFV = flagParsed.falseVal.type === 'value' ? stripDisplayParens(flagParsed.falseVal.content) : null;
            if (fTV === '1' && fFV === '0') {
              // Preserve the flag pattern so AND/OR detection can find it
              result += '(' + simplified + ')';
              i = j;
              continue;
            }
          }
          const chain2 = extractLookupChain('(' + simplified + ')');
          if (chain2) {
            const label = registerChainDefinition(chain2);
            result += `[${label}]`;
            i = j;
            continue;
          }
          const parsed = parseTernaryStructure(simplified);
          if (parsed.type === 'ternary') {
            const tV = parsed.trueVal.type === 'value' ? stripDisplayParens(parsed.trueVal.content) : null;
            const fV = parsed.falseVal.type === 'value' ? stripDisplayParens(parsed.falseVal.content) : null;
            if (tV && fV && !tV.includes('?') && !fV.includes('?')) {
              const rawCond = formatExprNumbers(stripDisplayParens(parsed.conditionRaw || ''));
              const tVfmt = formatExprNumbers(tV);
              const fVfmt = formatExprNumbers(fV);
              // If values contain bracket refs, use a definition to avoid [[...]]
              if (tVfmt.includes('[') || fVfmt.includes('[')) {
                const desc = `${tVfmt} if ${rawCond}, else ${fVfmt}`;
                const label = addDefinition('Amount', desc);
                result += `[${label}]`;
              } else {
                result += `[${tVfmt} if ${rawCond}, else ${fVfmt}]`;
              }
              i = j;
              continue;
            }
          }
        }
        result += '(' + simplified + ')';
        i = j;
      } else {
        // No ternary — recursively simplify inside the group
        result += '(' + simplifyEmbeddedTernaries(group.slice(1, -1)) + ')';
        i = j;
      }
    } else {
      result += s[i];
      i++;
    }
  }
  return result;
}

/**
 * Find the outermost (rightmost, depth-0) comparison operator in an expression.
 * Returns { left, op, right } or null.
 */
function findOutermostComparison(expr) {
  let depth = 0;
  let lastOp = null;
  let lastPos = -1;
  let lastLen = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') { depth++; continue; }
    if (expr[i] === ')') { depth--; continue; }
    if (depth !== 0) continue;
    if (i + 1 < expr.length) {
      const two = expr.slice(i, i + 2);
      if (['>=', '<=', '==', '!='].includes(two)) {
        lastOp = two; lastPos = i; lastLen = 2;
        i++; continue;
      }
    }
    if (expr[i] === '>' && (i + 1 >= expr.length || expr[i + 1] !== '=')) {
      lastOp = '>'; lastPos = i; lastLen = 1;
    } else if (expr[i] === '<' && (i + 1 >= expr.length || (expr[i + 1] !== '=' && expr[i + 1] !== '>'))) {
      lastOp = '<'; lastPos = i; lastLen = 1;
    }
  }
  if (!lastOp || lastPos <= 0) return null;
  return {
    left: expr.slice(0, lastPos).trim(),
    op: lastOp,
    right: expr.slice(lastPos + lastLen).trim(),
  };
}

/**
 * Like findOutermostComparison but also tracks [] depth for simplified strings
 * that contain bracket labels like [numberCredits Rate].
 */
function findComparisonInSimplified(s) {
  let depth = 0;
  let lastOp = null, lastPos = -1, lastLen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') { depth++; continue; }
    if (s[i] === ')' || s[i] === ']') { depth--; continue; }
    if (depth !== 0) continue;
    if (i + 1 < s.length) {
      const two = s.slice(i, i + 2);
      if (['>=', '<=', '==', '!='].includes(two)) {
        lastOp = two; lastPos = i; lastLen = 2; i++; continue;
      }
    }
    if (s[i] === '>' && (i + 1 >= s.length || s[i + 1] !== '=')) {
      lastOp = '>'; lastPos = i; lastLen = 1;
    } else if (s[i] === '<' && (i + 1 >= s.length || (s[i + 1] !== '=' && s[i + 1] !== '>'))) {
      lastOp = '<'; lastPos = i; lastLen = 1;
    }
  }
  if (!lastOp || lastPos <= 0) return null;
  return { left: s.slice(0, lastPos).trim(), op: lastOp, right: s.slice(lastPos + lastLen).trim() };
}

/**
 * Extract a lookup/tier chain from a ternary expression.
 * Returns { variable, tiers: [{threshold, op, value}], defaultValue } or null.
 */
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
    if (chainVar === null) chainVar = varName;
    else if (varName !== chainVar) break;
    const trueVal = current.trueVal.type === 'value'
      ? stripDisplayParens(current.trueVal.content) : null;
    if (trueVal === null) break;
    tiers.push({ threshold: threshold.trim(), op, value: trueVal });
    current = current.falseVal;
  }
  if (tiers.length < 2) return null;
  const defaultVal = current.type === 'value'
    ? stripDisplayParens(current.content) : null;
  if (defaultVal === null) return null;
  return { variable: chainVar, tiers, defaultValue: defaultVal };
}

/**
 * Describe a lookup chain in English.
 * If all values are between 0 and 1, formats them as percentages.
 */
function describeLookupChainEnglish(chain) {
  const varName = chain.variable; // keep $prefix
  const allValues = [...chain.tiers.map(t => parseFloat(t.value)), parseFloat(chain.defaultValue)];
  const allDecimal = allValues.every(v => !isNaN(v) && v > 0 && v <= 1);
  const rows = chain.tiers.map(t => {
    const val = allDecimal ? `${(parseFloat(t.value) * 100).toFixed(0)}%` : formatNum(parseFloat(t.value));
    return `${val} if ${varName} ${t.op} ${formatNum(parseFloat(t.threshold))}`;
  });
  const defVal = allDecimal
    ? `${(parseFloat(chain.defaultValue) * 100).toFixed(0)}%`
    : formatNum(parseFloat(chain.defaultValue));
  rows.push(`${defVal} otherwise`);
  return rows.join('; ');
}

/**
 * Returns true if all values in a lookup chain are between 0 and 1 (rate/percentage).
 */
function isRateChain(chain) {
  const allValues = [...chain.tiers.map(t => parseFloat(t.value)), parseFloat(chain.defaultValue)];
  return allValues.every(v => !isNaN(v) && v > 0 && v <= 1);
}

/**
 * Register a lookup chain as a definition and return a short label like [GPA Rate].
 */
function registerChainDefinition(chain) {
  const varName = chain.variable.replace(/^\$/, '');
  const isRate = isRateChain(chain);
  const baseName = `${varName} ${isRate ? 'Rate' : 'Amount'}`;
  const detail = describeLookupChainEnglish(chain);
  return addDefinition(baseName, detail);
}

/**
 * Split on * at parenthesis depth 0.
 */
function splitMultiplicativeAtDepth0(expr) {
  const factors = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && ch === '*') {
      factors.push(expr.slice(start, i).trim());
      start = i + 1;
    }
  }
  factors.push(expr.slice(start).trim());
  return factors.filter(f => f !== '');
}

/**
 * Split on additive operators (+/-) at parenthesis depth 0,
 * treating only binary operators (not unary minus).
 * Returns array of { sign: '+' or '-', term: string }.
 */
function splitArithmeticTerms(expr) {
  const terms = [];
  let depth = 0;
  let start = 0;
  let sign = '+';
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
  if (start < expr.length) {
    terms.push({ sign, term: expr.slice(start).trim() });
  }
  return terms.filter(t => t.term !== '');
}

// ── Layered Pattern Detection (clamp + round + base) ──────────────────────

/**
 * Detect clamp/round/base layered patterns in a ternary tree.
 * Pattern: X < low ? low : (X > high ? high : ROUND(X, step))
 * Returns { layers: [...], baseExpr, baseDescription } or null.
 */
function detectLayeredPattern(parsed) {
  if (parsed.type !== 'ternary') return null;
  const layers = [];
  let current = parsed;
  let baseExpr = null;

  // ── Low clamp: EXPR < LOW ? LOW : ... ──
  const cond1 = stripDisplayParens(current.conditionRaw || '');
  const trueV1 = current.trueVal.type === 'value' ? stripDisplayParens(current.trueVal.content) : null;
  // Match "COMPLEX_EXPR < NUMBER" — the EXPR may itself be a ternary inside parens
  const lowMatch = extractComparisonParts(cond1, '<');
  if (lowMatch && trueV1 && normalizeWS(trueV1) === normalizeWS(lowMatch.right)) {
    baseExpr = lowMatch.left;
    const lowVal = lowMatch.right;

    // ── High clamp in false branch: EXPR > HIGH ? HIGH : ... ──
    if (current.falseVal.type === 'ternary') {
      const cond2 = stripDisplayParens(current.falseVal.conditionRaw || '');
      const trueV2 = current.falseVal.trueVal.type === 'value'
        ? stripDisplayParens(current.falseVal.trueVal.content) : null;
      const highMatch = extractComparisonParts(cond2, '>');
      if (highMatch && trueV2 && normalizeWS(trueV2) === normalizeWS(highMatch.right)
          && normalizeWS(baseExpr) === normalizeWS(highMatch.left)) {
        layers.push({
          type: 'clamp',
          low: lowVal,
          high: highMatch.right,
          description: `Clamped between ${formatNum(parseFloat(lowVal))} and ${formatNum(parseFloat(highMatch.right))}`
        });
        current = current.falseVal.falseVal;
      } else {
        // Just a floor
        layers.push({
          type: 'floor',
          value: lowVal,
          description: `Minimum of ${formatNum(parseFloat(lowVal))}`
        });
        current = current.falseVal;
      }
    }
  }

  // ── High clamp without low: EXPR > HIGH ? HIGH : ... ──
  if (layers.length === 0) {
    const highOnly = extractComparisonParts(cond1, '>');
    if (highOnly && trueV1 && normalizeWS(trueV1) === normalizeWS(highOnly.right)) {
      baseExpr = highOnly.left;
      layers.push({
        type: 'ceiling',
        value: highOnly.right,
        description: `Maximum of ${formatNum(parseFloat(highOnly.right))}`
      });
      current = current.falseVal;
    }
  }

  // ── Round-to-nearest inside the clamp ──
  if (current.type === 'ternary') {
    const roundCond = stripDisplayParens(current.conditionRaw || '');
    // Find "% STEP" at depth 0, then "< HALF"
    const modInfo = extractModuloComparison(roundCond);
    if (modInfo && modInfo.half === modInfo.step / 2) {
      layers.push({
        type: 'round',
        step: String(modInfo.step),
        description: `Rounded to nearest ${formatNum(modInfo.step)}`
      });
      if (!baseExpr) baseExpr = modInfo.baseExpr;
    }
  }

  if (layers.length === 0 || !baseExpr) return null;

  // ── Describe the base expression ──
  const baseStripped = stripDisplayParens(baseExpr);
  let baseDescription;

  if (baseStripped.includes('?') && baseStripped.includes(':')) {
    const baseParsed = parseTernaryStructure(baseStripped);
    if (baseParsed.type === 'ternary') {
      const bCond = stripDisplayParens(baseParsed.conditionRaw || '');
      const bTrue = baseParsed.trueVal.type === 'value'
        ? stripDisplayParens(baseParsed.trueVal.content) : null;
      const bFalse = baseParsed.falseVal.type === 'value'
        ? stripDisplayParens(baseParsed.falseVal.content) : null;
      if (bTrue && bFalse) {
        const condDesc = formatExprNumbers(bCond);
        baseDescription = `${formatExprNumbers(bTrue)} when ${condDesc}; otherwise ${formatExprNumbers(bFalse)}`;
      }
    }
  }
  if (!baseDescription) {
    baseDescription = formatExprNumbers(baseStripped);
  }

  return { layers, baseExpr, baseDescription };
}

/**
 * Extract left/right sides of a comparison operator at depth 0.
 * E.g. for "(complex expr) < 1000" returns { left: "(complex expr)", right: "1000" }.
 */
function extractComparisonParts(expr, op) {
  let depth = 0;
  for (let i = expr.length - 1; i >= 0; i--) {
    const ch = expr[i];
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    else if (depth === 0) {
      // Check for the operator (single char < or >)
      if (ch === op && expr[i-1] !== '=' && expr[i+1] !== '=') {
        const left = expr.slice(0, i).trim();
        const right = expr.slice(i + 1).trim();
        if (left && right) return { left, right };
      }
    }
  }
  return null;
}

/** Normalize whitespace for comparison */
function normalizeWS(s) { return s.replace(/\s+/g, ''); }

/**
 * Extract (EXPR % STEP) < HALF from a condition string.
 * Finds % at depth 0, then < at depth 0.
 */
function extractModuloComparison(expr) {
  // First find the < comparison at depth 0 (scan from right)
  const cmpParts = extractComparisonParts(expr, '<');
  if (!cmpParts) return null;
  const halfStr = cmpParts.right.trim();
  const half = parseInt(halfStr);
  if (isNaN(half)) return null;

  // Left side should be "EXPR % STEP" — find % at depth 0
  const leftSide = stripDisplayParens(cmpParts.left.trim());
  let depth = 0;
  let modIdx = -1;
  for (let i = leftSide.length - 1; i >= 0; i--) {
    const ch = leftSide[i];
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    else if (depth === 0 && ch === '%') { modIdx = i; break; }
  }
  if (modIdx < 0) return null;

  const baseExpr = leftSide.slice(0, modIdx).trim();
  const stepStr = leftSide.slice(modIdx + 1).trim();
  const step = parseInt(stepStr);
  if (isNaN(step) || !baseExpr) return null;

  return { baseExpr, step, half };
}

/**
 * Detect and describe an embedded ternary within an arithmetic expression.
 * Handles AND/OR patterns, simple conditionals, and lookup chains.
 */
function describeEmbeddedTernary(expr) {
  const stripped = stripDisplayParens(expr);
  const parsed = parseTernaryStructure(stripped);
  if (parsed.type !== 'ternary') return null;

  // ── Try layered pattern detection (clamp + round + base) first ──
  const layered = detectLayeredPattern(parsed);
  if (layered) {
    const baseName = addDefinition('Base Amount', layered.baseDescription);
    const layerDescs = layered.layers.map(l => l.description.toLowerCase());
    return `[${baseName}], ${layerDescs.join(', ')}`;
  }

  const cond = stripDisplayParens(parsed.conditionRaw || '');
  const trueVal = parsed.trueVal.type === 'value' ? stripDisplayParens(parsed.trueVal.content) : null;
  const falseVal = parsed.falseVal.type === 'value' ? stripDisplayParens(parsed.falseVal.content) : null;

  // Boolean flag: (COND ? 1 : 0) — just represents "is COND true?"
  if (trueVal === '1' && falseVal === '0') {
    return `1 if ${conditionToEnglishSimple(cond)}`;
  }

  // AND/OR pattern using depth-aware parsing
  const andOr = parseAndOrPattern(cond);
  if (andOr && trueVal !== null && falseVal !== null) {
    // Single flag: (COND ? 1 : 0) == 1 → just "VALUE if COND" or "COND"
    if (andOr.conditions.length === 1 && (andOr.count === 1 || andOr.type === 'or')) {
      const condDesc = describeFlagCondition(andOr.conditions[0], conditionToEnglishSimple);
      if (falseVal === '0') return `${formatExprNumbers(trueVal)} if ${condDesc}`;
      return `${formatExprNumbers(trueVal)} if ${condDesc}, otherwise ${formatExprNumbers(falseVal)}`;
    }
    const subs = andOr.conditions.map(c => describeFlagCondition(c, conditionToEnglishSimple));
    if (andOr.type === 'and') {
      const n = andOr.count || subs.length;
      const prefix = subs.length === n && subs.length === 2 ? 'both '
        : subs.length === n && subs.length > 2 ? 'all of: ' : '';
      if (falseVal === '0') return `${formatExprNumbers(trueVal)} when ${prefix}${subs.join(' AND ')}`;
      return `${formatExprNumbers(trueVal)} when ${prefix}${subs.join(' AND ')}, otherwise ${formatExprNumbers(falseVal)}`;
    } else {
      if (falseVal === '0') return `${formatExprNumbers(trueVal)} when ${subs.join(' OR ')}`;
      return `${formatExprNumbers(trueVal)} when ${subs.join(' OR ')}, otherwise ${formatExprNumbers(falseVal)}`;
    }
  }

  // Simple conditional: condition ? result : 0  →  "result if condition"
  if (trueVal !== null && falseVal === '0') {
    const trueDesc = trueVal.includes('?') ? describeArithmeticExpr(trueVal) : formatExprNumbers(trueVal);
    const condSimple = conditionToEnglishSimple(cond);
    const result = `${trueDesc} if ${condSimple}`;
    return result;
  }
  if (trueVal === '0' && falseVal !== null) {
    const falseDesc = falseVal.includes('?') ? describeArithmeticExpr(falseVal) : formatExprNumbers(falseVal);
    const condSimple = conditionToEnglishSimple(cond);
    const result = `${falseDesc} unless ${condSimple}`;
    return result;
  }

  // Lookup chain → register as definition and return short label
  const chain = extractLookupChain(stripped);
  if (chain) {
    const label = registerChainDefinition(chain);
    return `[${label}]`;
  }

  // Simple ternary with both values
  if (trueVal !== null && falseVal !== null) {
    let condDesc = conditionToEnglishSimple(cond);
    condDesc = autoShortenIfLong(condDesc, 'Condition', 80);
    let trueDesc = trueVal.includes('?') ? describeArithmeticExpr(trueVal) : formatExprNumbers(trueVal);
    trueDesc = autoShortenIfLong(trueDesc, 'Amount', 60);
    let falseDesc = falseVal.includes('?') ? describeArithmeticExpr(falseVal) : formatExprNumbers(falseVal);
    falseDesc = autoShortenIfLong(falseDesc, 'Amount', 60);
    return `${trueDesc} if ${condDesc}, else ${falseDesc}`;
  }

  // Complex ternary where branches contain sub-ternaries — describe as definitions
  let condDesc2 = conditionToEnglishSimple(cond);
  condDesc2 = autoShortenIfLong(condDesc2, 'Condition', 80);
  const trueText = parsed.trueVal.type !== 'value'
    ? describeAsDefinition(parsed.trueVal, 'Award')
    : (trueVal.includes('?') ? autoShortenIfLong(describeArithmeticExpr(trueVal), 'Award', 60) : formatExprNumbers(trueVal));
  const falseText = parsed.falseVal.type !== 'value'
    ? describeAsDefinition(parsed.falseVal, 'Fallback')
    : (falseVal ? (falseVal.includes('?') ? autoShortenIfLong(describeArithmeticExpr(falseVal), 'Fallback', 60) : formatExprNumbers(falseVal)) : describeAsDefinition(parsed.falseVal, 'Fallback'));
  return `${trueText} if ${condDesc2}, else ${falseText}`;
}

/**
 * Recursively describe a ternary sub-tree and register it as a named definition.
 * Returns a short [Label] reference.
 */
function describeAsDefinition(node, baseName) {
  // Serialize the subtree to text, adding parens around nested ternaries
  function serialize(n) {
    if (n.type === 'value') return stripDisplayParens(n.content);
    const c = stripDisplayParens(n.conditionRaw || '');
    return `(${c} ? ${serialize(n.trueVal)} : ${serialize(n.falseVal)})`;
  }
  const text = serialize(node);
  const desc = describeArithmeticExpr(text);
  const label = addDefinition(baseName, desc);
  return `[${label}]`;
}

/**
 * If a single-line description is too long, register it as a definition and return [Label].
 * Otherwise return the description as-is.
 */
function autoShortenIfLong(desc, baseName, threshold) {
  if (!threshold) threshold = 60;
  if (desc.length <= threshold) return desc;
  // Already a definition reference
  if (/^\[.+\]$/.test(desc)) return desc;
  const label = addDefinition(baseName, desc);
  return `[${label}]`;
}

/**
 * Describe a full arithmetic expression that may contain embedded ternaries.
 * Returns a human-readable English string.
 */
function describeArithmeticExpr(expr, opts) {
  opts = opts || {};
  expr = stripDisplayParens(expr).trim();

  // Simple variable — keep $
  if (/^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) return expr;
  // Simple number — format with commas
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(expr)) return formatNum(parseFloat(expr));

  // If this is itself a ternary, describe it directly
  if (expr.includes('?') && expr.includes(':')) {
    const asTernary = describeEmbeddedTernary(expr);
    if (asTernary) return asTernary;
  }

  const terms = splitArithmeticTerms(expr);
  if (terms.length === 0) return formatExprNumbers(expr);

  const described = [];
  for (const { sign, term } of terms) {
    const stripped = stripDisplayParens(term);

    // Term contains embedded ternary
    if (stripped.includes('?') && stripped.includes(':')) {
      // Check for multiplication by a proration/rate factor: EXPR * (chain)
      const mulParts = splitMultiplicativeAtDepth0(stripped);
      if (mulParts.length >= 2) {
        const factorDescs = [];
        for (const factor of mulParts) {
          const factorStripped = stripDisplayParens(factor);
          if (factorStripped.includes('?')) {
            const chain = extractLookupChain(factorStripped);
            if (chain) {
              const label = registerChainDefinition(chain);
              factorDescs.push(`× [${label}]`);
              continue;
            }
            const embDesc = describeEmbeddedTernary(factorStripped);
            if (embDesc) { factorDescs.push(embDesc); continue; }
          }
          // If factor is a parenthesized group with +/- inside, keep parens for precedence
          const factorFmt = formatExprNumbers(factorStripped);
          if (factor.trim().startsWith('(') && /[+\-]/.test(factorStripped) && factorDescs.length < mulParts.length - 1) {
            factorDescs.push(`(${factorFmt})`);
          } else {
            factorDescs.push(factorFmt);
          }
        }
        // Wrap conditional first factor in parens to avoid precedence confusion
        if (factorDescs[0] && /\b(if|when|unless)\b/.test(factorDescs[0])) {
          factorDescs[0] = `(${factorDescs[0]})`;
        }
        let productText = factorDescs.join(' ');
        productText = autoShortenIfLong(productText, /×\s*\[/.test(productText) ? 'Supplement' : 'Product', 70);
        described.push({ sign, text: productText });
        continue;
      }

      // Try as a single embedded ternary
      const desc = describeEmbeddedTernary(stripped);
      if (desc) { described.push({ sign, text: desc }); continue; }
    }

    // Plain term — keep $variables, format numbers
    described.push({ sign, text: formatExprNumbers(stripped) });
  }

  // Auto-shorten any remaining long terms into definitions
  for (let i = 0; i < described.length; i++) {
    const t = described[i].text;
    if (t.length > 70) {
      const baseName = /×\s*\[/.test(t) ? 'Supplement' : /\bif\b/.test(t) ? 'Amount' : 'Subtotal';
      described[i].text = autoShortenIfLong(t, baseName, 70);
    }
  }

  // When one term has layered patterns (clamped/rounded) and another has
  // conditional language (if/else/when), the conditional reads ambiguously
  // when joined. Turn the conditional into a named definition.
  const hasLayered = described.some(d => /\b(clamped|rounded)\b/i.test(d.text));
  if (hasLayered) {
    for (let i = 0; i < described.length; i++) {
      const t = described[i].text;
      if (!/\b(clamped|rounded)\b/i.test(t) && /\b(if|when|unless)\b/.test(t) && !t.startsWith('[')) {
        const label = addDefinition('Additional Award', t);
        described[i].text = `[${label}]`;
      }
    }
  }

  // Build the final string: use actual math operators
  const parts = [];
  for (let i = 0; i < described.length; i++) {
    const { sign, text } = described[i];
    if (i === 0) {
      parts.push(sign === '-' ? `-${text}` : text);
    } else {
      parts.push(`${sign} ${text}`);
    }
  }
  // Multi-line: one term per line when there are 3+ terms,
  // or when one term has layered patterns (to avoid ambiguous joining)
  if (opts.multiLine && (parts.length >= 3 || (parts.length >= 2 && hasLayered))) {
    return parts.join('\n');
  }
  return parts.join(' ');
}

/**
 * Format numbers in an expression with commas, keeping everything else intact.
 */
function formatExprNumbers(expr) {
  let s = expr;
  // Simplify pure arithmetic: N + M, N * M, N - M where both are plain numbers
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*([+\-*])\s*(\d+(?:\.\d+)?)\b/g, (m, a, op, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (isNaN(na) || isNaN(nb)) return m;
    let result;
    if (op === '+') result = na + nb;
    else if (op === '-') result = na - nb;
    else if (op === '*') result = na * nb;
    else return m;
    return formatNum(result);
  });
  // Format remaining large numbers
  s = s.replace(/\b(\d{4,})(?:\.\d+)?\b/g, (m) => {
    const n = parseFloat(m);
    return isNaN(n) ? m : formatNum(n);
  });
  // Convert * to × for readability
  s = s.replace(/\s*\*\s*/g, ' × ');
  return s;
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
  let code = pseudocode.trim();

  // ── Auto-balance parentheses by removing unmatched ones ──
  code = balanceParens(code);

  const parsed = parseTernaryStructure(code);

  // Reset definitions registry before building descriptions
  resetDefinitions();

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
    const rawVal = stripDisplayParens(parsed.content);
    // For the top-level summary, use multi-line mode for long expressions
    const englishVal = describeArithmeticExpr(rawVal, { multiLine: true });
    const defs = getDefinitions();
    if (defs.length > 0) {
      summaryLines.push('This formula computes:');
      // englishVal may contain embedded newlines from multiLine mode
      const lines = englishVal.split('\n');
      for (const line of lines) {
        summaryLines.push(`  ${line}`);
      }
    } else {
      summaryLines.push(`This expression simply returns: ${englishVal}`);
    }
  } else {
    // ── Detect tiered-award pattern (cascading if-else → tier list) ──
    // Every YES → a result value, every NO → next step (last NO → result)
    const isTiered = displaySteps.length >= 3 && displaySteps.every((step, idx) => {
      if (step.trueOutcome.type !== 'result') return false;
      if (idx < displaySteps.length - 1) {
        return step.falseOutcome.type === 'decision' && step.falseOutcome.stepNum === step.stepNum + 1;
      }
      return step.falseOutcome.type === 'result';
    });

    if (displaySteps.length > 0) {
      if (isTiered) {
        summaryLines.push(`This formula has ${displaySteps.length} award tiers.`);
      } else {
        summaryLines.push(`This formula has ${displaySteps.length} decision point${displaySteps.length > 1 ? 's' : ''}.`);
      }
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

    if (isTiered) {
      summaryLines.push('');
      summaryLines.push('Returns the first matching award:');
      // Find the max value width for alignment
      const tiers = displaySteps.map(step => ({
        value: step.trueOutcome.english,
        condition: step.conditionEnglish
      }));
      const lastStep = displaySteps[displaySteps.length - 1];
      const defaultValue = lastStep.falseOutcome.english;
      const maxLen = Math.max(...tiers.map(t => t.value.length), defaultValue.length);
      for (const tier of tiers) {
        summaryLines.push(`  ${tier.value.padStart(maxLen)} — if ${tier.condition}`);
      }
      summaryLines.push(`  ${defaultValue.padStart(maxLen)} — otherwise`);
    } else {
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
  }

  // Append definitions (lookup tables, rate schedules, etc.)
  const defs = getDefinitions();
  if (defs.length > 0) {
    // Post-process: replace inline bracket descriptions [X if Y, else Z]
    // with matching definition labels where possible
    for (const d of defs) {
      d.detail = d.detail.replace(/\[([^\[\]]+)\]/g, (m, content) => {
        const match = defs.find(d2 => d2.detail === content);
        if (match) return `[${match.label}]`;
        return m;
      });
    }
    // Post-process: replace unbracketed text that matches a definition detail
    // Sort by detail length (longest first) to replace the most specific match
    const sortedDefs = [...defs].sort((a, b) => b.detail.length - a.detail.length);
    for (const d of defs) {
      for (const candidate of sortedDefs) {
        if (candidate === d) continue;
        if (candidate.detail.length < 15) continue; // skip short definitions
        // Don't replace inside definition's own text or simple refs
        const safeDetail = candidate.detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(safeDetail, 'g');
        const replacement = `[${candidate.label}]`;
        if (d.detail.includes(candidate.detail) && !d.detail.includes(replacement)) {
          d.detail = d.detail.replace(re, replacement);
        }
      }
      // Clean up: remove parens around sole bracket refs like ([Label]) → [Label]
      d.detail = d.detail.replace(/\((\[[^\]]+\])\)/g, '$1');
    }
    summaryLines.push('');
    summaryLines.push('Where:');
    for (const d of defs) {
      summaryLines.push(`  [${d.label}] = ${d.detail}`);
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

    // ROUNDUP pattern: the converter outputs:
    //   (VALUE) - (VALUE % STEP) + ((VALUE % STEP) ? STEP : 0)
    // The condition must be a modulo expression: VALUE % STEP
    if (trueV && falseV === '0') {
      const modCond = cond.match(/^(.+?)\s*%\s*(\d+(?:\.\d+)?)$/);
      if (modCond) {
        // Verify the true branch adds the step back (roundup shape)
        const step = modCond[2];
        if (trueV === step || trueV.includes(step)) {
          const key = `ROUNDUP(${clean(modCond[1])}, ${step})`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ type: 'roundup', value: clean(modCond[1]), step,
              description: `ROUNDUP pattern: rounds ${clean(modCond[1])} up to next ${step}` });
          }
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
        description: `Only applies when ${guardMatch[1]} > 0; otherwise returns 0`,
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
          description: `Result is clamped between ${formatNum(parseFloat(floorMatch[1]))} (minimum) and ${formatNum(parseFloat(ceilMatch[1]))} (maximum)`,
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

export {
  toPseudocode,
  explainPseudocode,
  evaluateWithTrace,
  splitArgs,
  splitInfixByKeyword,
  normalizeComparisonOps,
  isWrappedWithParentheses,
  decimalPlacesToStep
};