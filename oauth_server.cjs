const http = require('http');
const url = require('url');
const https = require('https');
const fs = require('fs');

const CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com';
const REDIRECT_URI = 'http://localhost:3456';
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar';

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + CLIENT_ID
  + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI)
  + '&response_type=code'
  + '&scope=' + encodeURIComponent(SCOPE)
  + '&access_type=offline&prompt=consent';

console.log('=== 以下のURLをブラウザで開いてください ===');
console.log(authUrl);
console.log('==========================================');

const server = http.createServer((req, res) => {
  const code = url.parse(req.url, true).query.code;
  if (!code) return;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>認証完了！ターミナルを確認してください。</h1>');
  server.close();

  console.log('認証コード取得成功: ' + code);

  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/GOOGLE_CLIENT_SECRET=(.+)/);
  const clientSecret = match ? match[1].trim() : null;
  if (!clientSecret) {
    console.error('GOOGLE_CLIENT_SECRET not found in .env.local');
    process.exit(1);
  }

  const postData = [
    'code=' + encodeURIComponent(code),
    'client_id=' + encodeURIComponent(CLIENT_ID),
    'client_secret=' + encodeURIComponent(clientSecret),
    'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
    'grant_type=authorization_code',
  ].join('&');

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req2 = https.request(options, (res2) => {
    let data = '';
    res2.on('data', (chunk) => { data += chunk; });
    res2.on('end', () => {
      console.log('トークンレスポンス: ' + data);
      let parsed;
      try { parsed = JSON.parse(data); } catch (e) { console.error('JSON parse error'); process.exit(1); }
      if (parsed.refresh_token) {
        console.log('');
        console.log('REFRESH_TOKEN=' + parsed.refresh_token);
      } else {
        console.error('refresh_token が取得できませんでした。エラー: ' + (parsed.error || JSON.stringify(parsed)));
      }
      process.exit(0);
    });
  });
  req2.on('error', (e) => { console.error('request error: ' + e.message); process.exit(1); });
  req2.write(postData);
  req2.end();
});

server.listen(3456, () => {
  console.log('ローカルサーバー起動中 (port 3456)...');
  console.log('ブラウザで認証URLを開いて許可してください。');
});
