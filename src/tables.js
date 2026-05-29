import { parseTernaryStructure, stripDisplayParens, safeEval } from './parse.js';

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

export { detectTables };
