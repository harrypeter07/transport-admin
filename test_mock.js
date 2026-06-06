const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/routes/dummy-id',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
});
req.on('error', console.error);
req.write(JSON.stringify({ action: "SWAP_CAB", cabId: "dummy-cab" }));
req.end();
