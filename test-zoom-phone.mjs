/**
 * Zoom Phone API テストスクリプト
 * GET /v2/phone/users でユーザー一覧とIDを取得する
 *
 * 実行方法:
 *   node test-zoom-phone.mjs
 *
 * 事前準備:
 *   .env.local の VITE_ZOOM_CLIENT_SECRET に Client Secret を設定すること
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── 認証情報 ───────────────────────────────────────────────────────────────
const ACCOUNT_ID   = 'ZHz9CMbvRbinEtdouvFO9Q';
const CLIENT_ID    = 'PYRk9MqBRBmkjMGqfXCqA';

// .env.local から VITE_ZOOM_CLIENT_SECRET を読み込む
const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(join(__dirname, '.env.local'), 'utf-8');
const clientSecretMatch = envRaw.match(/^VITE_ZOOM_CLIENT_SECRET=(.+)$/m);
const CLIENT_SECRET = clientSecretMatch?.[1]?.trim();

if (!CLIENT_SECRET || CLIENT_SECRET === 'ここにClient Secretを入力') {
  console.error('エラー: .env.local の VITE_ZOOM_CLIENT_SECRET を設定してください');
  process.exit(1);
}

// ── Step 1: Server-to-Server OAuth でアクセストークン取得 ─────────────────
async function getAccessToken() {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`トークン取得失敗 [${res.status}]: ${body}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

// ── Step 2: GET /v2/phone/users でユーザー一覧取得 ────────────────────────
async function getPhoneUsers(token) {
  const res = await fetch('https://api.zoom.us/v2/phone/users?page_size=100', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Phone Users API失敗 [${res.status}]: ${body}`);
  }
  return res.json();
}

// ── メイン ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Zoom Phone API テスト ===\n');

  console.log('1. アクセストークン取得中...');
  const token = await getAccessToken();
  console.log('   ✓ 取得成功\n');

  console.log('2. Phone ユーザー一覧取得中...');
  const data = await getPhoneUsers(token);
  const users = data.users ?? [];
  console.log(`   ✓ ${data.total_records ?? users.length} 件\n`);

  console.log('────────────────────────────────');
  if (users.length === 0) {
    console.log('ユーザーが見つかりませんでした。');
  } else {
    users.forEach((u, i) => {
      console.log(`[${i + 1}] ${u.display_name ?? u.name}`);
      console.log(`    User ID  : ${u.id}`);
      console.log(`    Email    : ${u.email}`);
      console.log(`    内線番号 : ${u.extension_number ?? 'なし'}`);
      console.log(`    電話番号 : ${u.phone_numbers?.map(p => p.number).join(', ') || 'なし'}`);
      console.log('');
    });
  }

  console.log('────────────────────────────────');
  console.log('生データ (JSON):');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(err => {
  console.error('\nエラー:', err.message);
  process.exit(1);
});
