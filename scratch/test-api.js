const fetch = require('node-fetch');
async function test() {
  const res = await fetch('http://localhost:33025/api/optimization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': 'NextAuth.session-token=your_token_if_needed' },
    body: JSON.stringify({
      shiftId: "shift-0500",
      isPickup: true,
      date: "2026-06-08",
      mode: "APPLY",
      selectedStrategy: "MANUAL_EXCEL",
      previewRoutes: [{
        cabId: "some-cab-id", // need a valid cab id
        vehicleNumber: "MH49CW0078",
        shiftId: "shift-0500",
        isPickup: true,
        totalDistance: 0,
        totalDuration: 0,
        optimizationScore: 100,
        tripSequence: 1,
        stops: [{
          employeeId: "2573661",
          stopOrder: 1,
          etaMinutes: 0
        }],
        violations: []
      }]
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
