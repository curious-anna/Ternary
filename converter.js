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

function normalizeComparisonOps(str) {
  let s = str;
  s = s.replace(/\s*<=\s*/g, ' <= ');
  s = s.replace(/\s*>=\s*/g, ' >= ');
  s = s.replace(/\s*<>\s*/g, ' != ');
  s = s.replace(/\s*<\s*/g, ' < ');
  s = s.replace(/\s*>\s*/g, ' > ');
  s = s.replace(/\s*==\s*/g, ' == ');
  s = s.replace(/([^><=!])=([^=])/g, '$1 == $2');
  s = s.replace(/\bAND\b/gi, '&&');
  s = s.replace(/\bOR\b/gi, '||');
  s = s.replace(/\|\|/g, ' || ');
  s = s.replace(/&&/g, ' && ');
  return s.replace(/\s+/g, ' ').trim();
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
  e = e.replace(/(?<!\$)\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
    const upper = match.toUpperCase();
    if (reserved.has(upper)) return upper; // normalize function names to uppercase
    return `$${match.toLowerCase()}`; // variable names become lowercase with $ prefix
  });

  function convert(expr) {
    expr = expr.trim();
    if (expr === '') return '';
    while (isWrappedWithParentheses(expr)) {
      expr = expr.slice(1, -1).trim();
    }

    const funcMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
    const topLevelArgs = splitArgs(expr);
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
      // Integer-step rounding rules (no float digit-based ROUND):
      // ROUND(value, X)  -> nearest X using (value % X) < X/2 rules
      // ROUNDUP(value, X) -> next X when remainder non-zero
      // ROUNDDOWN(value, X) -> floor to X
      if (name === 'ROUND' && args.length >= 1) {
        const value = convert(args[0]);
        let step = '1';
        if (args.length >= 2) {
          step = convert(args[1]).trim();
        }
        if (step === '0' || step === '0.0') {
          throw new Error('ROUND: step X cannot be zero');
        }
        const modExpr = `(${value} % ${step})`;
        const baseExpr = `(${value} - ${modExpr})`;
        return `(${modExpr} < (${step} / 2)) ? ${baseExpr} : (${baseExpr} + ${step})`;
      }
      if (name === 'ROUNDUP' && args.length >= 1) {
        const value = convert(args[0]);
        let step = '1';
        if (args.length >= 2) {
          step = convert(args[1]).trim();
        }
        if (step === '0' || step === '0.0') {
          throw new Error('ROUNDUP: step X cannot be zero');
        }
        const modExpr = `(${value} % ${step})`;
        return `(${value} - ${modExpr} + (${modExpr} ? ${step} : 0))`;
      }
      if (name === 'ROUNDDOWN' && args.length >= 1) {
        const value = convert(args[0]);
        let step = '1';
        if (args.length >= 2) {
          step = convert(args[1]).trim();
        }
        if (step === '0' || step === '0.0') {
          throw new Error('ROUNDDOWN: step X cannot be zero');
        }
        const modExpr = `(${value} % ${step})`;
        return `(${value} - ${modExpr})`;
      }
      // Enforce allowed output operations only.
      throw new Error(`Unsupported function '${name}' - only IF, MIN, MAX, AND, OR, ROUND, ROUNDUP, ROUNDDOWN are allowed.`);
    }

    let converted = normalizeComparisonOps(expr);
    if (converted.includes(' && ')) {
      const parts = converted.split(' && ').map(p => p.trim());
      const sumExpr = parts.map(p => `(${p} ? 1 : 0)`).join(' + ');
      converted = `(${sumExpr} == ${parts.length})`;
    } else if (converted.includes(' || ')) {
      const parts = converted.split(' || ').map(p => p.trim());
      const sumExpr = parts.map(p => `(${p} ? 1 : 0)`).join(' + ');
      converted = `(${sumExpr} > 0)`;
    }
    return converted;
  }

  const converted = convert(e);

  function tokenizeCode(code) {
    // Break pseudocode into syntax tokens: keyword, operator, variable, number, bracket
    const tokens = [];
    let i = 0;
    
    while (i < code.length) {
      // Whitespace and newlines are preserved for formatting
      if (code[i] === '\n') {
        tokens.push({ text: '\n', type: 'newline' });
        i++;
        continue;
      }
      if (code[i] === '\t') {
        tokens.push({ text: '\t', type: 'whitespace' });
        i++;
        continue;
      }
      if (code[i] === ' ') {
        let spaceRun = '';
        while (i < code.length && code[i] === ' ') {
          spaceRun += ' ';
          i++;
        }
        tokens.push({ text: spaceRun, type: 'whitespace' });
        continue;
      }

      // Brackets
      if (/[()\[\]]/.test(code[i])) {
        tokens.push({ text: code[i], type: 'bracket' });
        i++;
      }
      // Operators
      else if (code.substr(i, 2) === '<=') {
        tokens.push({ text: '<=', type: 'operator' });
        i += 2;
      } else if (code.substr(i, 2) === '>=') {
        tokens.push({ text: '>=', type: 'operator' });
        i += 2;
      } else if (code.substr(i, 2) === '==') {
        tokens.push({ text: '==', type: 'operator' });
        i += 2;
      } else if (code.substr(i, 2) === '!=') {
        tokens.push({ text: '!=', type: 'operator' });
        i += 2;
      } else if (/[+\-*\/<>]/.test(code[i])) {
        tokens.push({ text: code[i], type: 'operator' });
        i++;
      } else if (code[i] === '?') {
        tokens.push({ text: '?', type: 'keyword' });
        i++;
      } else if (code[i] === ':') {
        tokens.push({ text: ':', type: 'keyword' });
        i++;
      }
      // Variables (start with $)
      else if (code[i] === '$') {
        let varName = '';
        while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) {
          varName += code[i];
          i++;
        }
        tokens.push({ text: varName, type: 'variable' });
      }
      // Numbers and decimals
      else if (/[0-9.]/.test(code[i])) {
        let num = '';
        while (i < code.length && /[0-9.]/.test(code[i])) {
          num += code[i];
          i++;
        }
        tokens.push({ text: num, type: 'number' });
      }
      // Unknown
      else {
        tokens.push({ text: code[i], type: 'unknown' });
        i++;
      }
    }
    
    return tokens;
  }

  function parseTernaryStructure(code) {
    code = code.trim();
    
    // Find first ? and first : at parenthesis depth 0
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
    
    // No ternary operator found at top level
    if (qPos === -1 || colonPos === -1) {
      return { type: 'value', content: code };
    }
    
    // Extract three parts
    let condition = code.substring(0, qPos).trim();
    let trueVal = code.substring(qPos + 1, colonPos).trim();
    let falseVal = code.substring(colonPos + 1).trim();
    
    // Helper: strip symmetric outer parentheses
    const unwrap = (s) => {
      while (s.startsWith('(') && s.endsWith(')')) {
        let d = 0;
        let fullyWrapped = true;
        for (let i = 0; i < s.length; i++) {
          if (s[i] === '(') d++;
          else if (s[i] === ')') {
            d--;
            // If depth reaches 0 before the end, the outer parens don't wrap everything
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
    
    // Recursively parse each part
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

    // Condition
    lines.push(indent + 'IF');
    if (structure.condition.type === 'value') {
      lines.push(indent + '    ' + structure.condition.content);
    } else {
      lines.push(...formatTernaryStructure(structure.condition, depth + 1));
    }

    // Then branch
    lines.push(indent + 'THEN');
    if (structure.trueVal.type === 'value') {
      lines.push(indent + '    ' + structure.trueVal.content);
    } else {
      lines.push(...formatTernaryStructure(structure.trueVal, depth + 1));
    }

    // Else branch
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

  return {
    pseudocode: converted,
    explanation: buildFormattedExplanation(converted)
  };
}

module.exports = {
  toPseudocode,
  splitArgs,
  normalizeComparisonOps,
  isWrappedWithParentheses
};
