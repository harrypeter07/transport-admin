const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 33025,
  path: '/api/optimization/excel-routes',
  method: 'POST',
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});
req.end();
