const c = require('./converter');
console.log('case1', c.toPseudocode('MAX(ACT + 700, 300)').pseudocode);
console.log('case2', c.toPseudocode('MAX($ACT + 700, 300)').pseudocode);
console.log('case3', c.toPseudocode('$ACT + 10').pseudocode);
