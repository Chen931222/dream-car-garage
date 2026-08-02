// 暫用：接收頁面 POST 的縮圖，寫進 web-deploy（只允許 thumb-*.webp 檔名）
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'web-deploy');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const m = req.url.match(/^\/save\/(thumb-[a-z0-9]+\.webp)$/);
  if (!m || req.method !== 'POST') { res.statusCode = 404; res.end('no'); return; }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync(path.join(ROOT, m[1]), buf);
    res.end('ok ' + m[1] + ' ' + buf.length);
  });
}).listen(9123, () => console.log('thumb-server up on 9123'));
