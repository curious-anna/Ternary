const { toPseudocode } = require('./converter');

// Case sensitivity tests
const tests = [
  ['max($GPA, cfGPA)', '($GPA > $cfGPA) ? ($GPA) : ($cfGPA)'],
  ['MIN(totalCOA, maxAward)', '($totalCOA < $maxAward) ? ($totalCOA) : ($maxAward)'],
  ['IF($DirectRoomAndBoard > 0, $DirectRoomAndBoard, 0)', '($DirectRoomAndBoard > 0) ? ($DirectRoomAndBoard) : (0)'],
  ['$SAI + $GPA', '$SAI + $GPA'],
];

let pass = 0, fail = 0;
for (const [input, expected] of tests) {
  const result = toPseudocode(input);
  const got = result.pseudocode;
  if (got === expected) {
    console.log(`PASS [${input}]`);
    pass++;
  } else {
    console.log(`FAIL [${input}]`);
    console.log(`  expected: ${expected}`);
    console.log(`  got:      ${got}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed.`);
