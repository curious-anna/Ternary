const http = require('http');

const testInput = '($act > 23 || $gpa > 5, 5000, 0)';

const data = JSON.stringify({ formula: testInput });
const opts = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/convert',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(opts, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', e => {
  console.error('Error:', e.message);
});

req.write(data);
req.end();