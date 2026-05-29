let _definitions = [];
let _definitionIndex = 0;

function resetDefinitions() { _definitions = []; _definitionIndex = 0; }
function getDefinitions() { return _definitions; }

function addDefinition(baseName, detail) {
  const existing = _definitions.find(d => d.detail === detail || d.detail.trim() === detail.trim());
  if (existing) return existing.label;
  _definitionIndex++;
  let label = baseName;
  const taken = _definitions.filter(d =>
    d.label === label || d.label.match(new RegExp('^' + baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\d+$'))
  );
  if (taken.length > 0) label = `${baseName} ${taken.length + 1}`;
  _definitions.push({ label, detail });
  return label;
}

function formatNum(n) {
  if (typeof n === 'string') n = parseFloat(n.replace(/,/g, ''));
  if (isNaN(n)) return String(n);
  const parts = n.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function formatExprNumbers(expr) {
  let s = expr;
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*([+\-*])\s*(\d+(?:\.\d+)?)\b/g, (m, a, op, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (isNaN(na) || isNaN(nb)) return m;
    let r;
    if (op === '+') r = na + nb;
    else if (op === '-') r = na - nb;
    else r = na * nb;
    return formatNum(r);
  });
  s = s.replace(/\b(\d{4,})(?:\.\d+)?\b/g, m => {
    const n = parseFloat(m);
    return isNaN(n) ? m : formatNum(n);
  });
  s = s.replace(/\s*\*\s*/g, ' × ');
  return s;
}

export { resetDefinitions, getDefinitions, addDefinition, formatNum, formatExprNumbers };
