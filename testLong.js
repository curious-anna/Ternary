const { explainPseudocode } = require('./converter');

const pseudo = `((($tuition + $fees) - $pell - (($sai <= 0 ? 600 : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1) ) - ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))) > 0 ? ((($tuition + $fees) - $pell - ($sai <= 0 ? ($numberCredits >= 12 ? (600) : ($numberCredits >= 9 ? (450) : ($numberCredits >= 6 ? (300) : 0))) : 0) - ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))) <= ($numberCredits >= 12 ? 500 * 2 : 300 * 2) ? ($numberCredits >= 12 ? 500 * 2 : 300 * 2) : ($tuition + $fees) - $pell - 600 - ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))) : ($numberCredits >= 12 ? 500 * 2 : 300 * 2)) + (($sai <= 0 ? 600 : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1) ) + ((7000 - $pell > 0 ? 7000 - $pell : 0) * ($numberCredits <= 8 ? 0.5 : $numberCredits <= 11 ? 0.75 : 1))`;

const expl = explainPseudocode(pseudo);
console.log('=== SUMMARY ===');
console.log(expl.summary);
console.log();
console.log('=== STEPS ===');
console.log(JSON.stringify(expl.steps, null, 2).slice(0, 2000));
