import { parseTernaryStructure, stripDisplayParens, balanceParens } from './parse.js';
import { resetDefinitions, getDefinitions } from './definitions.js';
import { conditionToEnglish, valueToEnglish, describeArithmeticExpr } from './english.js';
import { detectPatterns, detectStructure } from './patterns.js';
import { detectTables } from './tables.js';
import { reconstructExcel } from './excel.js';
import { evaluateWithTrace } from './trace.js';

function explainPseudocode(pseudocode) {
  const code = balanceParens(pseudocode.trim());
  const parsed = parseTernaryStructure(code);
  resetDefinitions();

  const vars = new Set();
  function collectVars(node) {
    if (node.type === 'value') { const m = node.content.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g); if (m) m.forEach(v => vars.add(v)); }
    if (node.conditionRaw) { const m = node.conditionRaw.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g); if (m) m.forEach(v => vars.add(v)); }
    if (node.type === 'ternary') { collectVars(node.trueVal); collectVars(node.falseVal); }
  }
  collectVars(parsed);

  function buildSteps(node, bucket) {
    if (node.type === 'value') {
      const v = stripDisplayParens(node.content);
      return { type: 'result', value: v, english: valueToEnglish(v) };
    }
    const stepNum = bucket.length + 1;
    const condStr = stripDisplayParens(node.conditionRaw || '');
    const step = { type: 'decision', stepNum, condition: condStr, conditionEnglish: conditionToEnglish(condStr), trueOutcome: null, falseOutcome: null };
    bucket.push(step);
    step.trueOutcome  = buildSteps(node.trueVal,  bucket);
    step.falseOutcome = buildSteps(node.falseVal, bucket);
    return step;
  }

  const steps = [];
  buildSteps(parsed, steps);

  const { structures, coreNode } = detectStructure(parsed);

  const coreSteps = [];
  if (structures.length > 0) buildSteps(coreNode, coreSteps);

  let excelFormula = '';
  try { excelFormula = '=' + reconstructExcel(parsed); } catch { excelFormula = '(could not reconstruct)'; }

  const patterns = detectPatterns(parsed);
  const tables   = detectTables(parsed);

  const summaryLines = [];
  if (structures.length > 0) {
    summaryLines.push('Structure:');
    for (const s of structures) {
      const icon = { guard: '[Guard]', clamp: '[Clamp]', comparison: '[Compare]', rounding: '[Round]' }[s.type] || '[Info]';
      summaryLines.push(`  ${icon} ${s.description}`);
    }
    summaryLines.push('');
  }

  const displaySteps = structures.length > 0 ? coreSteps : steps;

  if (!displaySteps.length && !structures.length) {
    const rawVal = stripDisplayParens(parsed.content);
    const englishVal = describeArithmeticExpr(rawVal, { multiLine: true });
    if (getDefinitions().length > 0) {
      summaryLines.push('This formula computes:');
      englishVal.split('\n').forEach(l => summaryLines.push(`  ${l}`));
    } else {
      summaryLines.push(`This expression simply returns: ${englishVal}`);
    }
  } else {
    const isTiered = displaySteps.length >= 3 && displaySteps.every((step, idx) => {
      if (step.trueOutcome.type !== 'result') return false;
      return idx < displaySteps.length - 1
        ? step.falseOutcome.type === 'decision' && step.falseOutcome.stepNum === step.stepNum + 1
        : step.falseOutcome.type === 'result';
    });

    if (displaySteps.length > 0)
      summaryLines.push(isTiered ? `This formula has ${displaySteps.length} award tiers.` : `This formula has ${displaySteps.length} decision point${displaySteps.length > 1 ? 's' : ''}.`);

    if (patterns.length > 0) { summaryLines.push('', 'Detected patterns:'); patterns.forEach(p => summaryLines.push(`  * ${p.description}`)); }
    if (tables.length > 0) summaryLines.push('', `Contains ${tables.length} lookup table${tables.length > 1 ? 's' : ''} (see Tables tab for details).`);

    if (isTiered) {
      summaryLines.push('', 'Returns the first matching award:');
      const tiers = displaySteps.map(s => ({ value: s.trueOutcome.english, condition: s.conditionEnglish }));
      const defaultValue = displaySteps[displaySteps.length - 1].falseOutcome.english;
      const maxLen = Math.max(...tiers.map(t => t.value.length), defaultValue.length);
      tiers.forEach(t => summaryLines.push(`  ${t.value.padStart(maxLen)} — if ${t.condition}`));
      summaryLines.push(`  ${defaultValue.padStart(maxLen)} — otherwise`);
    } else {
      for (const step of displaySteps) {
        summaryLines.push('', `Step ${step.stepNum}: Check whether ${step.conditionEnglish}`);
        summaryLines.push(step.trueOutcome.type  === 'result' ? `  ✓ If YES → return ${step.trueOutcome.english}`  : `  ✓ If YES → go to Step ${step.trueOutcome.stepNum}`);
        summaryLines.push(step.falseOutcome.type === 'result' ? `  ✗ If NO  → return ${step.falseOutcome.english}` : `  ✗ If NO  → go to Step ${step.falseOutcome.stepNum}`);
      }
    }
  }

  const defs = getDefinitions();
  if (defs.length > 0) {
    const sortedDefs = [...defs].sort((a, b) => b.detail.length - a.detail.length);
    for (const d of defs) {
      d.detail = d.detail.replace(/\[([^\[\]]+)\]/g, (m, content) => {
        const match = defs.find(d2 => d2.detail === content);
        return match ? `[${match.label}]` : m;
      });
      for (const cand of sortedDefs) {
        if (cand === d || cand.detail.length < 15) continue;
        const safeDetail = cand.detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (d.detail.includes(cand.detail) && !d.detail.includes(`[${cand.label}]`))
          d.detail = d.detail.replace(new RegExp(safeDetail, 'g'), `[${cand.label}]`);
      }
      d.detail = d.detail.replace(/\((\[[^\]]+\])\)/g, '$1');
    }
    summaryLines.push('', 'Where:');
    defs.forEach(d => summaryLines.push(`  [${d.label}] = ${d.detail}`));
  }

  return { variables: [...vars], steps, excelFormula, summary: summaryLines.join('\n'), patterns, tables, structures };
}

export { explainPseudocode, evaluateWithTrace };
