const { explainPseudocode } = require('./converter');

// Example 1: Proration by numberCredits
console.log('=== Example 1: Full proration formula ===');
const ex1 = '((($tuition + $fees) - $pell - (($sai <= 0 ? 600 : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1) ) - ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))) > 0 ? ((($tuition + $fees) - $pell - ($sai <= 0 ? ($numberCredits >= 12 ? (600) : ($numberCredits >= 9 ? (450) : ($numberCredits >= 6 ? (300) : 0))) : 0) - ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))) <= ($numberCredits >= 12 ? 500 * 2 : 300 * 2) ? ($numberCredits >= 12 ? 500 * 2 : 300 * 2) : ($tuition + $fees) - $pell - 600 - ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))) : ($numberCredits >= 12 ? 500 * 2 : 300 * 2)) + (($sai <= 0 ? 600 : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1) ) + ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))';
try {
  const result1 = explainPseudocode(ex1);
  console.log('Summary:');
  console.log(result1.summary);
  console.log();
  if (result1.tables.length > 0) {
    console.log('Tables found:', result1.tables.length);
    result1.tables.forEach((t, i) => console.log(`  Table ${i+1}: ${t.title}`));
  }
} catch (e) {
  console.error('Error:', e.message, e.stack);
}

console.log('\n' + '='.repeat(60) + '\n');

// Example 3: AND logic
console.log('=== Example 3: AND logic ===');
const ex3 = '(13900 - $merit - $pell - (($sai <= 0 ? 1 : 0) + ($pell > 0 ? 1 : 0) == 2 ? 500 : 0) - ($tuition > 0 ? 9126 : 0) > 0) ? (13900 - $merit - $pell - (($sai <= 0 ? 1 : 0) + ($pell > 0 ? 1 : 0) == 2 ? 500 : 0) - ($tuition > 0 ? 9126 : 0)) : (0)';
try {
  const result3 = explainPseudocode(ex3);
  console.log('Summary:');
  console.log(result3.summary);
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n' + '='.repeat(60) + '\n');

// Proration standalone
console.log('=== Proration factor standalone ===');
const prorate = '(7000 - $pell > 0 ? 7000 - $pell : 0) * ($numbercredits <= 8 ? 0.5 : $numbercredits <= 11 ? 0.75 : 1)';
try {
  const result = explainPseudocode(prorate);
  console.log('Summary:');
  console.log(result.summary);
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n' + '='.repeat(60) + '\n');

// Operator bug fix test
console.log('=== Operator bug fix test ===');
const { toPseudocode } = require('./converter');
const opTest = toPseudocode('IF($x<=0, 100, 200)');
console.log('$x<=0 → pseudocode:', opTest.pseudocode, opTest.pseudocode.includes('<==') ? 'BUG: <==' : '✓ OK');
const opTest2 = toPseudocode('IF($x>=5, 100, 200)');
console.log('$x>=5 → pseudocode:', opTest2.pseudocode, opTest2.pseudocode.includes('>==') ? 'BUG: >==' : '✓ OK');

console.log('\n' + '='.repeat(60) + '\n');

// Example 2: GPA table factor
console.log('=== Example 2: GPA table factor ===');
const ex2 = '( ((($coa - 2101 - $sai) * ($cqgpa >= 4.15 ? 0.80 : ($cqgpa >= 3.9 ? 0.77 : ($cqgpa >= 3.6 ? 0.60 : ($cqgpa >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit) > 2000 ? (($coa - 2101 - $sai) * ($cqgpa >= 4.15 ? 0.80 : ($cqgpa >= 3.9 ? 0.77 : ($cqgpa >= 3.6 ? 0.60 : ($cqgpa >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit + 3000) : (3000 + 2000)) < (($tuition - ($pell + $state + $merit)) > 0 ? ($tuition - ($pell + $state + $merit) + 3000) : 3000) ? ((($coa - 2101 - $sai) * ($cqgpa >= 4.15 ? 0.80 : ($cqgpa >= 3.9 ? 0.77 : ($cqgpa >= 3.6 ? 0.60 : ($cqgpa >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit) > 2000 ? (($coa - 2101 - $sai) * ($cqgpa >= 4.15 ? 0.80 : ($cqgpa >= 3.9 ? 0.77 : ($cqgpa >= 3.6 ? 0.60 : ($cqgpa >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit + 3000) : (3000 + 2000)) : (($tuition - ($pell + $state + $merit)) > 0 ? ($tuition - ($pell + $state + $merit) + 3000) : 3000) )';
try {
  const result2 = explainPseudocode(ex2);
  console.log('Summary:');
  console.log(result2.summary);
  console.log();
  console.log('Tables:', result2.tables.length > 0 ? result2.tables.map(t => t.title).join(', ') : 'none');
} catch (e) {
  console.error('Error:', e.message);
}
