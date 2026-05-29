import { parseTernaryStructure, stripDisplayParens } from './parse.js';
import { formatNum, formatExprNumbers } from './definitions.js';

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
      const bTrue  = baseParsed.trueVal.type  === 'value' ? stripDisplayParens(baseParsed.trueVal.content)  : null;
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

function detectPatterns(node) {
  const results = [];
  const seen = new Set();
  const norm  = s => s.replace(/\s+/g, '').replace(/^\(+|\)+$/g, '');
  const clean = s => s.replace(/^\(+|\)+$/g, '').trim();

  function walk(n) {
    if (n.type !== 'ternary') return;
    const cond   = stripDisplayParens(n.conditionRaw || '');
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
    const cond   = stripDisplayParens(coreNode.conditionRaw || '');
    const falseV = coreNode.falseVal.type === 'value' ? stripDisplayParens(coreNode.falseVal.content) : null;
    const guardMatch = cond.match(/^(\$[a-zA-Z_][a-zA-Z0-9_]*)\s*(>|>=|!=)\s*0$/);
    if (guardMatch && (falseV === '0' || falseV === '0.0')) {
      structures.push({ type: 'guard', variable: guardMatch[1], description: `Only applies when ${guardMatch[1]} > 0; otherwise returns 0` });
      coreNode = coreNode.trueVal;
    }
  }

  // CLAMP: LOW >= expr ? LOW : HIGH <= expr ? HIGH : expr
  if (coreNode.type === 'ternary') {
    const cond   = stripDisplayParens(coreNode.conditionRaw || '');
    const trueV  = coreNode.trueVal.type === 'value' ? stripDisplayParens(coreNode.trueVal.content) : null;
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
    const cond   = stripDisplayParens(coreNode.conditionRaw || '');
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

export { detectLayeredPattern, detectPatterns, detectStructure };
