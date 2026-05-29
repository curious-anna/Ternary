import {
  splitArgs, splitInfixByKeyword, normalizeComparisonOps,
  isWrappedWithParentheses, wrapForBinaryOperand,
  stripDisplayParens, parseTernaryStructure, balanceParens,
} from './parse.js';

function toPseudocode(rawInput) {
  let e = rawInput.trim();
  if (e.startsWith('=')) e = e.slice(1).trim();
  e = balanceParens(e);

  const reserved = new Set(['IF', 'MIN', 'MAX', 'AND', 'OR', 'ROUND', 'ROUNDUP', 'ROUNDDOWN']);

  // Normalise variable names to $prefix, uppercase reserved words.
  e = e.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => `$${name}`);
  e = e.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, _p1, offset, string) => {
    if (offset > 0 && string[offset - 1] === '$') return match;
    const upper = match.toUpperCase();
    return reserved.has(upper) ? upper : `$${match}`;
  });

  function convert(expr) {
    expr = expr.trim();
    if (!expr) return '';
    while (isWrappedWithParentheses(expr)) expr = expr.slice(1, -1).trim();

    const funcMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
    const topArgs = splitArgs(expr);

    // Shorthand ternary: (condition, trueValue, falseValue?)
    if (!funcMatch && topArgs.length >= 2) {
      const cond  = convert(topArgs[0]);
      const trueE = convert(topArgs[1]);
      const falseE = topArgs.length >= 3 ? convert(topArgs[2]) : '0';
      return `(${cond}) ? (${trueE}) : (${falseE})`;
    }

    if (funcMatch) {
      const name = funcMatch[1].toUpperCase();
      const args = splitArgs(funcMatch[2]);

      if (name === 'IF' && args.length >= 2) {
        const cond  = convert(args[0]);
        const trueE = convert(args[1]);
        const falseE = args.length >= 3 ? convert(args[2]) : '0';
        return `(${cond}) ? (${trueE}) : (${falseE})`;
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
        const flags = args.map(convert).map(p => `(${p} ? 1 : 0)`).join(' + ');
        return `(${flags} == ${args.length})`;
      }

      if (name === 'OR' && args.length >= 2) {
        const flags = args.map(convert).map(p => `(${p} ? 1 : 0)`).join(' + ');
        return `(${flags} > 0)`;
      }

      if (['ROUND', 'ROUNDUP', 'ROUNDDOWN'].includes(name) && args.length >= 1) {
        const value = convert(args[0]);
        const step  = args.length >= 2 ? convert(args[1].trim()).trim() : '1';
        if (step === '0' || step === '0.0') throw new Error(`${name}: step cannot be zero`);
        const v = wrapForBinaryOperand(value);
        const s = wrapForBinaryOperand(step);
        const mod  = `(${v} % ${s})`;
        const base = `(${v} - ${mod})`;
        if (name === 'ROUND')     return `(${mod} < (${s} / 2)) ? (${base}) : ((${base}) + ${s})`;
        if (name === 'ROUNDUP')   return `((${v}) - (${mod}) + ((${mod}) ? ${s} : 0))`;
        /* ROUNDDOWN */           return `((${v}) - (${mod}))`;
      }

      throw new Error(`Unsupported function '${name}' — only IF, MIN, MAX, AND, OR, ROUND, ROUNDUP, ROUNDDOWN are allowed.`);
    }

    // Infix AND / OR / && / ||
    for (const [kw, isAnd] of [['AND', true], ['OR', false], ['&&', true], ['||', false]]) {
      const parts = splitInfixByKeyword(expr, kw);
      if (parts.length >= 2 && parts.every(p => p)) {
        const flags = parts.map(convert).map(p => `(${p} ? 1 : 0)`).join(' + ');
        return isAnd ? `(${flags} == ${parts.length})` : `(${flags} > 0)`;
      }
    }

    return normalizeComparisonOps(expr);
  }

  const pseudocode = convert(e);

  if (/\|\|/.test(pseudocode) || /&&/.test(pseudocode) || /\bAND\b/.test(pseudocode) || /\bOR\b/.test(pseudocode)) {
    throw new Error(`Conversion produced forbidden tokens in output: ${pseudocode}`);
  }

  return { pseudocode, explanation: buildExplanation(pseudocode) };
}

// ── Explanation builders ──────────────────────────────────────────────

function buildExplanation(pseudocode) {
  const parsed = parseTernaryStructure(pseudocode);
  return formatTree(parsed, 1).join('\n') + '\n\n---\n\n' + formatSteps(parsed);
}

function formatTree(node, depth) {
  const lines = [];
  const prefix = `[${depth}] ` + '  '.repeat(depth - 1);

  if (node.type === 'value') {
    lines.push(prefix + stripDisplayParens(node.content));
    return lines;
  }

  const condStr = stripDisplayParens(node.conditionRaw || '');

  // Wrap long AND/OR sum conditions across multiple lines for readability
  if (condStr.length > 72 && condStr.includes('? 1 : 0')) {
    const parts = condStr.split(' + ');
    lines.push(prefix + '┌ condition: ' + parts[0]);
    const indent = prefix + '    ';
    for (let i = 1; i < parts.length; i++) lines.push(indent + '+ ' + parts[i]);
  } else {
    lines.push(prefix + '┌ condition: ' + condStr);
  }

  if (node.trueVal.type === 'value') {
    lines.push(prefix + '├ if true:  ' + stripDisplayParens(node.trueVal.content));
  } else {
    lines.push(prefix + '├ if true:');
    lines.push(...formatTree(node.trueVal, depth + 1));
  }

  if (node.falseVal.type === 'value') {
    lines.push(prefix + '└ if false: ' + stripDisplayParens(node.falseVal.content));
  } else {
    lines.push(prefix + '└ if false:');
    lines.push(...formatTree(node.falseVal, depth + 1));
  }

  return lines;
}

function formatSteps(parsed) {
  const steps = [];
  const stepMap = new WeakMap();

  function assign(node) {
    if (node.type !== 'ternary') return;
    stepMap.set(node, steps.length + 1);
    steps.push(node);
    assign(node.trueVal);
    assign(node.falseVal);
  }
  assign(parsed);

  if (!steps.length) return `No conditional logic — result: ${stripDisplayParens(parsed.content)}`;

  const lines = [`${steps.length} decision step${steps.length > 1 ? 's' : ''}:`];
  for (const node of steps) {
    const n = stepMap.get(node);
    const condStr = stripDisplayParens(node.conditionRaw || '');
    lines.push('', `Step ${n}:`, `  condition:  ${condStr}`);
    lines.push(node.trueVal.type === 'value'
      ? `  → If YES:  result = ${stripDisplayParens(node.trueVal.content)}`
      : `  → If YES:  go to Step ${stepMap.get(node.trueVal)}`);
    lines.push(node.falseVal.type === 'value'
      ? `  → If NO:   result = ${stripDisplayParens(node.falseVal.content)}`
      : `  → If NO:   go to Step ${stepMap.get(node.falseVal)}`);
  }
  return lines.join('\n');
}

export { toPseudocode };
