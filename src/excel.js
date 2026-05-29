import { stripDisplayParens } from './parse.js';

function reconstructExcel(node) {
  if (node.type === 'value') {
    let v = stripDisplayParens(node.content);
    v = v.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1));
    return v;
  }
  const cond = node.conditionRaw || '';
  const andMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*==\s*(\d+)$/);
  if (andMatch) {
    const parts = andMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const inner = parts.map(p => { const m = p.match(/\((.+?)\s*\? 1 : 0\)/); return m ? m[1].trim().replace(/\$/g, '').replace(/ == /g, '=') : p; });
      return `IF(AND(${inner.join(', ')}), ${reconstructExcel(node.trueVal)}, ${reconstructExcel(node.falseVal)})`;
    }
  }
  const orMatch = cond.match(/^((?:\([^)]*\? 1 : 0\)\s*\+\s*)*\([^)]*\? 1 : 0\))\s*>\s*0$/);
  if (orMatch) {
    const parts = orMatch[1].match(/\(([^?]+)\? 1 : 0\)/g);
    if (parts) {
      const inner = parts.map(p => { const m = p.match(/\((.+?)\s*\? 1 : 0\)/); return m ? m[1].trim().replace(/\$/g, '').replace(/ == /g, '=') : p; });
      return `IF(OR(${inner.join(', ')}), ${reconstructExcel(node.trueVal)}, ${reconstructExcel(node.falseVal)})`;
    }
  }
  const condExcel = cond.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1)).replace(/ == /g, '=');
  return `IF(${condExcel}, ${reconstructExcel(node.trueVal)}, ${reconstructExcel(node.falseVal)})`;
}

export { reconstructExcel };
