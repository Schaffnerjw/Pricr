const https = require('https');
const http = require('http');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    const bodyStr = Buffer.concat(body);
    const apiKey = process.env.ANTHROPIC_KEY;
    
    const proxy = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
    }, (r) => {
      res.writeHead(r.statusCode, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      });
      r.pipe(res);
    });
    
    proxy.write(bodyStr);
    proxy.end();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Pricr proxy running on port ${PORT}`));