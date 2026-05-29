import { parseTernaryStructure, stripDisplayParens, safeEval } from './parse.js';

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

export { evaluateWithTrace };
