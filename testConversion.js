const { toPseudocode } = require('./converter');
const tests = [
  'MAX(5,8)',
  '($gpa > 3 || $act > 5, 500, 800)',
  '($gpa > 4 && $act < 8, 5000, 0)',
  '($gpa > 4 && $act < 8, 5000)',
  '($gpa > 5 && $act > 500, 5000, 0)',
  '(act > 23 || gpa > 5, 5000, 0)',
  'MAX(ACT + 700, 300)',
  'MAX($ACT + 700, 300)',
  '$ACT + 10',
  'ROUND(3.2)',
  'ROUND(3.7)',
  'ROUNDUP(3.2)',
  'ROUNDDOWN(3.7)',
  'MAX(ROUND(act, 100), 1000)',
  'ROUND(act, 100)',
  'ROUNDUP(act, 100)',
  'ROUNDDOWN(act, 100)'
];
for (const t of tests) {
  const out = toPseudocode(t);
  console.log(`${t} => ${out.pseudocode}`);
  console.log('explanation:\n' + out.explanation + '\n');
}
