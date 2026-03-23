const resultEl = document.getElementById('result');
const explanationEl = document.getElementById('explanation');
const copyStatusEl = document.getElementById('copyStatus');

async function convertFormula() {
  const input = document.getElementById('excelInput').value.trim();
  if (!input) {
    resultEl.innerText = 'Please enter an Excel-style expression.';
    explanationEl.innerHTML = '';
    return;
  }
  try {
    const resp = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formula: input }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      resultEl.innerText = `Error: ${json.error || 'unknown'}`;
      explanationEl.innerHTML = '';
      return;
    }
    resultEl.innerText = json.pseudocode;

    // Render structured multi-line explanation with code-style highlighting.
    const formatted = typeof json.explanation === 'string' ? json.explanation : '';
    
    // Build HTML with syntax highlighting - NO escaping before HTML markup
    const highlighted = formatted
      .replace(/&/g, '&amp;')  // Only escape & that aren't part of entities
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\b(IF|THEN|ELSE)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\$[a-zA-Z0-9_]+/g, '<span class="token-variable">$&</span>')
      .replace(/\b([0-9]+(?:\.[0-9]+)?)\b/g, '<span class="token-number">$1</span>')
      .replace(/(<=|>=|==|!=)(?![a-z])/g, '<span class="token-operator">$1</span>')
      .replace(/([+\-*\/%])/g, '<span class="token-operator">$1</span>')
      .replace(/([?:])/g, '<span class="token-operator">$1</span>')
      .replace(/([()])/g, '<span class="token-bracket">$1</span>');

    const withBreaks = highlighted
      .replace(/ /g, '&nbsp;')
      .replace(/\n/g, '<br />');

    explanationEl.innerHTML = `<div class="explain-highlighted-code">${withBreaks}</div>`;




    copyStatusEl.innerText = '';
  } catch (err) {
    resultEl.innerText = 'Network error: ' + err.message;
    explanationEl.innerHTML = '';
    copyStatusEl.innerText = '';
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

async function copyResult() {
  const pseudo = resultEl.innerText.trim();
  if (!pseudo || pseudo === 'Awaiting input...' || pseudo.startsWith('Error:')) {
    copyStatusEl.innerText = 'Nothing to copy yet.';
    return;
  }
  try {
    await navigator.clipboard.writeText(pseudo);
    copyStatusEl.innerText = 'Copied to clipboard!';
  } catch (e) {
    copyStatusEl.innerText = 'Copy failed: ' + e.message;
  }
}

document.getElementById('convertBtn').addEventListener('click', convertFormula);
document.getElementById('copySymbol').addEventListener('click', copyResult);
