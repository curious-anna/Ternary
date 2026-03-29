const resultEl      = document.getElementById('result');
const explanationEl = document.getElementById('explanation');
const inputEl       = document.getElementById('excelInput');
const charCounterEl = document.getElementById('charCounter');
const validationEl  = document.getElementById('validationBadge');
const copyToastEl   = document.getElementById('copyToast');

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function highlightExplanation(text) {
  const tokenRegex = /\[\d+\]|---|Step \d+:|→ If YES:|→ If NO:|condition:|if true:|if false:|[┌├└│]|\b(IF|THEN|ELSE)\b|\$[a-zA-Z0-9_]+|\b[0-9]+(?:\.[0-9]+)?\b|<=|>=|==|!=|[+\-*\/%?:()]|\n|[ \t]+|./g;
  return text.replace(tokenRegex, (token) => {
    if (token === '\n') return '<br />';
    if (/^[ \t]+$/.test(token)) return token.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    if (/^\[\d+\]$/.test(token)) return `<span class="token-depth">${token}</span>`;
    if (token === 'condition:') return `<span class="token-label-cond">${token}</span>`;
    if (token === 'if true:') return `<span class="token-label-true">${token}</span>`;
    if (token === 'if false:') return `<span class="token-label-false">${token}</span>`;
    if (/^[┌├└│]$/.test(token)) return `<span class="token-connector">${token}</span>`;
    if (/^Step \d+:$/.test(token)) return `<span class="token-step">${token}</span>`;
    if (token === '→ If YES:') return `<span class="token-yes">${token}</span>`;
    if (token === '→ If NO:') return `<span class="token-no">${token}</span>`;
    if (token === '---') return '<hr style="border-color:#334155;margin:14px 0">';
    if (/^(IF|THEN|ELSE)$/.test(token)) return `<span class="token-keyword">${token}</span>`;
    if (/^\$[a-zA-Z0-9_]+$/.test(token)) return `<span class="token-variable">${token}</span>`;
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(token)) return `<span class="token-number">${token}</span>`;
    if (/^(<=|>=|==|!=|[+\-*\/%?:])$/.test(token)) return `<span class="token-operator">${escapeHtml(token)}</span>`;
    if (/^[()]$/.test(token)) return `<span class="token-bracket">${token}</span>`;
    return escapeHtml(token);
  });
}

function showValidationBadge(pseudocode) {
  const forbidden = /\|\|/.test(pseudocode) || /&&/.test(pseudocode) ||
    /\bAND\b/.test(pseudocode) || /\bOR\b/.test(pseudocode);
  validationEl.innerHTML = forbidden
    ? '<span class="badge-invalid">⚠️ Contains forbidden operators</span>'
    : '<span class="badge-valid">✅ Valid pseudocode</span>';
}

// ── Conversion ────────────────────────────────────────────────────────────────

async function convertFormula() {
  const input = inputEl.value.trim();
  if (!input) {
    resultEl.textContent = 'Please enter an Excel-style expression.';
    resultEl.className = 'code-output';
    explanationEl.innerHTML = '';
    validationEl.innerHTML = '';
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
      resultEl.textContent = 'Error: ' + (json.error || 'unknown');
      resultEl.className = 'code-output error';
      explanationEl.innerHTML = '';
      validationEl.innerHTML = '';
      return;
    }

    resultEl.textContent = json.pseudocode;
    resultEl.className = 'code-output';
    showValidationBadge(json.pseudocode);

    const formatted = typeof json.explanation === 'string' ? json.explanation : '';
    explanationEl.innerHTML = `<div class="explain-highlighted-code">${highlightExplanation(formatted)}</div>`;

  } catch (err) {
    resultEl.textContent = 'Network error: ' + err.message;
    resultEl.className = 'code-output error';
    explanationEl.innerHTML = '';
    validationEl.innerHTML = '';
  }
}

// ── Copy with SVG button & toast ─────────────────────────────────────────────

async function copyResult() {
  const pseudo = resultEl.textContent.trim();
  if (!pseudo || pseudo === 'Awaiting input…' || pseudo.startsWith('Error:') || pseudo.startsWith('Please') || pseudo.startsWith('Network')) {
    return;
  }
  try {
    await navigator.clipboard.writeText(pseudo);
    copyToastEl.classList.remove('hidden');
    setTimeout(() => copyToastEl.classList.add('hidden'), 2000);
  } catch (e) {
    copyToastEl.textContent = 'Copy failed';
    copyToastEl.classList.remove('hidden');
    setTimeout(() => copyToastEl.classList.add('hidden'), 2000);
  }
}

// ── Character counter ─────────────────────────────────────────────────────────

function updateCharCounter() {
  charCounterEl.textContent = inputEl.value.length + ' chars';
}

// ── Debounced live translation ────────────────────────────────────────────────

let debounceTimer = null;
inputEl.addEventListener('input', () => {
  updateCharCounter();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convertFormula, 300);
});

// ── Example chips ─────────────────────────────────────────────────────────────

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    inputEl.value = chip.dataset.formula;
    updateCharCounter();
    convertFormula();
  });
});

// ── Clear button ──────────────────────────────────────────────────────────────

document.getElementById('clearBtn').addEventListener('click', () => {
  inputEl.value = '';
  updateCharCounter();
  resultEl.textContent = 'Awaiting input…';
  resultEl.className = 'code-output';
  explanationEl.innerHTML = 'No conversion yet.';
  validationEl.innerHTML = '';
  copyToastEl.classList.add('hidden');
});

// ── Convert button & keyboard shortcut ───────────────────────────────────────

document.getElementById('convertBtn').addEventListener('click', convertFormula);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    convertFormula();
  }
});

document.getElementById('copyBtn').addEventListener('click', copyResult);