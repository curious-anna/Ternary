const { toPseudocode } = require('./converter');

let passed = 0;
let failed = 0;

function assert(name, input, mustContain, mustNotContain) {
  try {
    const out = toPseudocode(input);
    const pseudo = out.pseudocode;
    let ok = true;

    for (const s of (mustContain || [])) {
      if (!pseudo.includes(s)) {
        console.error('FAIL [' + name + ']: expected to contain "' + s + '" in:\n  ' + pseudo);
        ok = false;
      }
    }

    for (const s of (mustNotContain || [])) {
      const re = s instanceof RegExp ? s : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (re.test(pseudo)) {
        console.error('FAIL [' + name + ']: expected NOT to contain ' + s + ' in:\n  ' + pseudo);
        ok = false;
      }
    }

    if (ok) {
      console.log('PASS [' + name + ']: ' + pseudo);
      passed++;
    } else {
      failed++;
    }
  } catch (e) {
    console.error('ERROR [' + name + ']: ' + e.message);
    failed++;
  }
}

// ── Basic function conversions ────────────────────────────────────────────────
assert('MAX basic', 'MAX(5,8)', ['(5 > 8) ? (5) : (8)'], []);
assert('MIN basic', 'MIN(5,8)', ['(5 < 8) ? (5) : (8)'], []);
assert('MAX expr', 'MAX(ACT + 700, 300)', ['$act + 700 > 300'], []);
assert('var prefix', '$ACT + 10', ['$act + 10'], []);

// ── ROUND: second arg is decimal places, not step ────────────────────────────
assert('ROUND no digits',   'ROUND(3.2)',         ['3.2 % 1'],  []);
assert('ROUND no digits 2', 'ROUND(3.7)',         ['3.7 % 1'],  []);
assert('ROUND 2 digits',    '=ROUND(3.567, 2)',   ['0.01'],     []);
assert('ROUNDUP 2 digits',  '=ROUNDUP(1.1, 2)',   ['0.01'],     []);
assert('ROUNDDOWN 2 digits','=ROUNDDOWN(9.99, 1)',['0.1'],      []);
assert('ROUND 0 digits',    '=ROUND(5.5, 0)',     ['% 1'],      []);

// ── AND / OR as functions ─────────────────────────────────────────────────────
assert(
  'AND function',
  '=IF(AND(A > 1, B < 5), 100, 0)',
  ['? 1 : 0) +', '== 2'],
  ['&&', 'AND']
);
assert(
  'OR function',
  '=IF(OR(A == 0, B == 0), 0, 99)',
  ['? 1 : 0) +', '> 0'],
  ['||', 'OR']
);

// ── Infix AND / OR in condition string ───────────────────────────────────────
assert(
  'infix AND',
  '=IF(A > 1 AND B < 5, 100, 0)',
  ['? 1 : 0) +', '== 2'],
  ['&&', 'AND']
);
assert(
  'infix OR',
  '=IF(A == 0 OR B == 0, 0, 99)',
  ['? 1 : 0) +', '> 0'],
  ['||', 'OR']
);

// ── Infix && / || in shorthand ternary ───────────────────────────────────────
assert(
  'shorthand &&',
  '($gpa > 4 && $act < 8, 5000, 0)',
  ['== 2'],
  ['&&', /\bAND\b/]
);
assert(
  'shorthand ||',
  '(act > 23 || gpa > 5, 5000, 0)',
  ['> 0'],
  ['||', /\bOR\b/]
);

// ── Deeply nested: AND containing OR ─────────────────────────────────────────
assert(
  'nested AND(OR)',
  '=IF(AND(A>1, OR(B<5, C==3)), MAX(A,B), 0)',
  [],
  ['&&', '||', /\bAND\b/, /\bOR\b/]
);

// ── MAX / MIN nested ──────────────────────────────────────────────────────────
assert('MIN nested MAX', '=MIN(A, MAX(B, C))', [], []);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed.');
if (failed > 0) process.exit(1);
