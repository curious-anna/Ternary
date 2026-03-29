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
          const rawDigits = args[1].trim();
          const digitsNum = parseInt(rawDigits, 10);
          if (!isNaN(digitsNum) && String(digitsNum) === rawDigits) {
            step = decimalPlacesToStep(digitsNum);
          } else {
            step = convert(rawDigits).trim();
          }
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
          const rawDigits = args[1].trim();
          const digitsNum = parseInt(rawDigits, 10);
          if (!isNaN(digitsNum) && String(digitsNum) === rawDigits) {
            step = decimalPlacesToStep(digitsNum);
          } else {
            step = convert(rawDigits).trim();
          }
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
          const rawDigits = args[1].trim();
          const digitsNum = parseInt(rawDigits, 10);
          if (!isNaN(digitsNum) && String(digitsNum) === rawDigits) {
            step = decimalPlacesToStep(digitsNum);
          } else {
            step = convert(rawDigits).trim();
          }
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

  function parseTernaryStructure(code) {
    code = code.trim();

    let qPos = -1;
    let colonPos = -1;
    let depth = 0;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
      } else if (ch === '?' && depth === 0 && qPos === -1) {
        qPos = i;
      } else if (ch === ':' && depth === 0 && qPos !== -1 && colonPos === -1) {
        colonPos = i;
        break;
      }
    }

    if (qPos === -1 || colonPos === -1) {
      return { type: 'value', content: code };
    }

    let condition = code.substring(0, qPos).trim();
    let trueVal = code.substring(qPos + 1, colonPos).trim();
    let falseVal = code.substring(colonPos + 1).trim();

    const unwrap = (s) => {
      while (s.startsWith('(') && s.endsWith(')')) {
        let d = 0;
        let fullyWrapped = true;
        for (let i = 0; i < s.length; i++) {
          if (s[i] === '(') d++;
          else if (s[i] === ')') {
            d--;
            if (d === 0 && i < s.length - 1) {
              fullyWrapped = false;
              break;
            }
          }
        }
        if (fullyWrapped) {
          s = s.substring(1, s.length - 1).trim();
        } else {
          break;
        }
      }
      return s;
    };

    condition = unwrap(condition);
    trueVal = unwrap(trueVal);
    falseVal = unwrap(falseVal);

    return {
      type: 'ternary',
      condition: parseTernaryStructure(condition),
      trueVal: parseTernaryStructure(trueVal),
      falseVal: parseTernaryStructure(falseVal)
    };
  }

  function formatTernaryStructure(structure, depth = 0) {
    const indent = '    '.repeat(depth);
    const lines = [];

    if (structure.type === 'value') {
      lines.push(indent + structure.content);
      return lines;
    }

    lines.push(indent + 'IF');
    if (structure.condition.type === 'value') {
      lines.push(indent + '    ' + structure.condition.content);
    } else {
      lines.push(...formatTernaryStructure(structure.condition, depth + 1));
    }

    lines.push(indent + 'THEN');
    if (structure.trueVal.type === 'value') {
      lines.push(indent + '    ' + structure.trueVal.content);
    } else {
      lines.push(...formatTernaryStructure(structure.trueVal, depth + 1));
    }

    lines.push(indent + 'ELSE');
    if (structure.falseVal.type === 'value') {
      lines.push(indent + '    ' + structure.falseVal.content);
    } else {
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

    const human = (node) => {
      if (node.type === 'value') {
        return node.content;
      }
      const cond = human(node.condition);
      const tVal = human(node.trueVal);
      const fVal = human(node.falseVal);
      return `if ${cond} then ${tVal} else ${fVal}`;
    };

    return human(parsed);
  }

  const structuredExplanation = buildFormattedExplanation(converted);
  const naturalExplanation = buildHumanExplanation(converted);
  const combinedExplanation = `${structuredExplanation}\n\n${naturalExplanation}`;

  return {
    pseudocode: converted,
    explanation: combinedExplanation
  };
}

module.exports = {
  toPseudocode,
  splitArgs,
  splitInfixByKeyword,
  normalizeComparisonOps,
  isWrappedWithParentheses,
  decimalPlacesToStep
};