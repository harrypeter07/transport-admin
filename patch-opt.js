const fs = require('fs');

const path = 'src/lib/optimization.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Add startPoint and tripSequence to OptimizeCab
code = code.replace(
  '  driverPhone: string;\n}',
  '  driverPhone: string;\n  startPoint?: Point;\n  tripSequence?: number;\n}'
);

// 2. Modify buildRoutesFromAssignments
const fnStart = code.indexOf('async function buildRoutesFromAssignments');
const fnEnd = code.indexOf('return routes;', fnStart);
const fnBody = code.substring(fnStart, fnEnd + 14);

let newFnBody = fnBody.replace(
  'for (const { cab, cluster } of assignments) {',
  'for (const { cab, cluster } of assignments) {\n      const startPoint = cab.startPoint || depot;'
);

// Inside this newFnBody, replace occurrences of `depot` with `startPoint` (except the function signature and the call to GoogleMapsMatrix or fetchOSRMRoute which takes startPoint)
newFnBody = newFnBody.replace(/getDistance\(depot/g, 'getDistance(startPoint');
newFnBody = newFnBody.replace(/, depot\)/g, ', startPoint)');
newFnBody = newFnBody.replace(/const points = \[depot/g, 'const points = [startPoint');

code = code.replace(fnBody, newFnBody);

fs.writeFileSync(path, code);
console.log('Modified src/lib/optimization.ts successfully');
