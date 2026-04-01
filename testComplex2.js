const { explainPseudocode } = require('./converter');

const pseudo = `( ((($coa - 2101 - $sai) * ($cqGPA >= 4.15 ? 0.80 : ($cqGPA >= 3.9 ? 0.77 : ($cqGPA >= 3.6 ? 0.60 : ($cqGPA >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit) > 2000 ? (($coa - 2101 - $sai) * ($cqGPA >= 4.15 ? 0.80 : ($cqGPA >= 3.9 ? 0.77 : ($cqGPA >= 3.6 ? 0.60 : ($cqGPA >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit + 3000) : (3000 + 2000)) < (($tuition - ($pell + $state + $merit)) > 0 ? ($tuition - ($pell + $state + $merit) + 3000) : 3000) ? ((($coa - 2101 - $sai) * ($cqGPA >= 4.15 ? 0.80 : ($cqGPA >= 3.9 ? 0.77 : ($cqGPA >= 3.6 ? 0.60 : ($cqGPA >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit) > 2000 ? (($coa - 2101 - $sai) * ($cqGPA >= 4.15 ? 0.80 : ($cqGPA >= 3.9 ? 0.77 : ($cqGPA >= 3.6 ? 0.60 : ($cqGPA >= 3.3 ? 0.60 : 0.40)))) - $pell - $state - $merit + 3000) : (3000 + 2000)) : (($tuition - ($pell + $state + $merit)) > 0 ? ($tuition - ($pell + $state + $merit) + 3000) : 3000) )`;

const expl = explainPseudocode(pseudo);
console.log('=== SUMMARY ===');
console.log(expl.summary);
