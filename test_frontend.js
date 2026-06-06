const http = require('http');

async function getRoutes() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/optimization', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function getCabs() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/cabs', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function patchRoute(routeId, cabId) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/routes/' + routeId,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify({ action: "SWAP_CAB", cabId }));
    req.end();
  });
}

async function main() {
  try {
    const routes = await getRoutes();
    console.log(`Fetched ${routes.length} routes.`);
    if (routes.length === 0) return console.log("No routes to test.");
    
    const route = routes[0];
    console.log(`Target Route ID: ${route.id}`);
    
    const cabs = await getCabs();
    const availableCabs = cabs.filter(c => c.id !== route.cabId);
    if (availableCabs.length === 0) return console.log("No alternative cabs.");
    
    const targetCabId = availableCabs[0].id;
    console.log(`Target Cab ID: ${targetCabId}`);
    
    const result = await patchRoute(route.id, targetCabId);
    console.log(`PATCH Result: ${result.status} ${result.data}`);
  } catch (e) {
    console.error(e);
  }
}
main();
