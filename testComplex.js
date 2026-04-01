const { toPseudocode, explainPseudocode } = require('./converter');

const formula = `(  ($sai < 0    ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2    : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + 3500)) / 2  ) < 1000    ? 1000    : (        ($sai < 0          ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2          : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + 3500)) / 2        ) > 6500          ? 6500          : (              (                ($sai < 0                  ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2                  : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + 3500)) / 2                ) % 100              ) < 50                ? (                    ($sai < 0                      ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2                      : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + 3500)) / 2                    ) - (                        ($sai < 0                          ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2                          : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + 3500)) / 2                        ) % 100                      )                  )                : (                    ($sai < 0                      ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2                      : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + $state + 3500)) / 2                    ) - (                        ($sai < 0                          ? (($tuition + $fees + $directRoomAndBoard) - ($pell + $state + $merit + 3500)) / 2                          : ((($tuition + $fees + $directRoomAndBoard) - $sai) - ($pell + $state + $merit + 3500)) / 2                        ) % 100                      ) + 100                  )            )      ))+ ($pell > 0 ? 2000 + 650 : 2000)`;

const result = toPseudocode(formula);
const pseudo = result.pseudocode;
console.log('=== PSEUDOCODE ===');
console.log(pseudo);
console.log();

const expl = explainPseudocode(pseudo);
console.log('=== SUMMARY ===');
console.log(expl.summary);
console.log();
console.log('=== STRUCTURES ===');
console.log(JSON.stringify(expl.structures, null, 2));
console.log();
console.log('=== PATTERNS ===');
console.log(JSON.stringify(expl.patterns, null, 2));
console.log();
console.log('=== VARIABLES ===');
console.log(expl.variables);
