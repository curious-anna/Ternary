const c = require('./converter');
console.log('MIN(act,600)', c.toPseudocode('MIN(act, 600)').pseudocode);
console.log('MIN($act,600)', c.toPseudocode('MIN($act, 600)').pseudocode);
console.log('MAX(ACT+700,300)', c.toPseudocode('MAX(ACT + 700, 300)').pseudocode);
console.log('MIN(ROUND(act,500), act+600)', c.toPseudocode('MIN(ROUND(act, 500), act+600)').pseudocode);

