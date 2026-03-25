const resultEl = document.getElementById('result');
const explanationEl = document.getElementById('explanation');
const copyStatusEl = document.getElementById('copyStatus');

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

function highlightExplanation(text) {
  const tokenRegex = /\b(IF|THEN|ELSE)\b|\$[a-zA-Z0-9_]+|\b[0-9]+(?:\.[0-9]+)?\b|<=|>=|==|!=|[+\-*\/%?:()]|\n|[ \t]+|./g;

  return text.replace(tokenRegex, (token) => {
    if (token === '\n') return '<br />';
    if (/^[ \t]+$/.test(token)) return token.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    if (/^(IF|THEN|ELSE)$/.test(token)) return `<span class="token-keyword">${token}</span>`;
    if (/^\$[a-zA-Z0-9_]+$/.test(token)) return `<span class="token-variable">${token}</span>`;
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(token)) return `<span class="token-number">${token}</span>`;
    if (/^(<=|>=|==|!=|[+\-*\/%?:])$/.test(token)) return `<span class="token-operator">${escapeHtml(token)}</span>`;
    if (/^[()]$/.test(token)) return `<span class="token-bracket">${token}</span>`;
    return escapeHtml(token);
  });
}

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

    const formatted = typeof json.explanation === 'string' ? json.explanation : '';
    const highlighted = highlightExplanation(formatted);
    explanationEl.innerHTML = `<div class="explain-highlighted-code">${highlighted}</div>`;

    copyStatusEl.innerText = '';
  } catch (err) {
    resultEl.innerText = 'Network error: ' + err.message;
    explanationEl.innerHTML = '';
    copyStatusEl.innerText = '';
  }
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