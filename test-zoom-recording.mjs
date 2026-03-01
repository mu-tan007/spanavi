/**
 * Zoom Phone 録音一覧テストスクリプト
 * GET /v2/phone/recordings（アカウント全体）を取得し、owner_id で絞り込む
 *
 * 実行方法:
 *   node test-zoom-recording.mjs <zoom_user_id> [過去日数]
 *   例: node test-zoom-recording.mjs 6hHMFyIbQQ-mZq4lzw__dQ
 *       node test-zoom-recording.mjs 6hHMFyIbQQ-mZq4lzw__dQ 90
 *
 * 事前準備:
 *   .env.local に以下を設定すること
 *     VITE_ZOOM_ACCOUNT_ID=...
 *     VITE_ZOOM_CLIENT_ID=...
 *     ZOOM_CLIENT_SECRET=...
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── 引数チェック ───────────────────────────────────────────────────────────
const zoomUserId = process.argv[2];
const daysArg    = parseInt(process.argv[3] || '30', 10);

if (!zoomUserId) {
  console.error('使い方: node test-zoom-recording.mjs <zoom_user_id> [過去日数]');
  console.error('例:     node test-zoom-recording.mjs 6hHMFyIbQQ-mZq4lzw__dQ');
  process.exit(1);
}

// ── .env.local から認証情報を読み込む ────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
let envRaw;
try {
  envRaw = readFileSync(join(__dirname, '.env.local'), 'utf-8');
} catch {
  console.error('エラー: .env.local が見つかりません');
  process.exit(1);
}

// VITE_プレフィックスあり・なしの両方を試みる
const getEnv = (key) => {
  for (const k of [`VITE_${key}`, key]) {
    const m = envRaw.match(new RegExp(`^${k}=(.+)$`, 'm'));
    if (m) return m[1].trim();
  }
  return '';
};

const ACCOUNT_ID    = getEnv('ZOOM_ACCOUNT_ID');
const CLIENT_ID     = getEnv('ZOOM_CLIENT_ID');
const CLIENT_SECRET = getEnv('ZOOM_CLIENT_SECRET');

if (!ACCOUNT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('エラー: .env.local に ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET を設定してください');
  process.exit(1);
}

// ── 電話番号正規化 ────────────────────────────────────────────────────────
// "+81312345678" → "0312345678"（数字のみ抽出し、81始まりは0に変換）
function normalizePhone(n) {
  if (!n) return '';
  const digits = n.replace(/\D/g, '');
  if (digits.startsWith('81')) return '0' + digits.slice(2);
  return digits;
}

// ── アクセストークン取得 ──────────────────────────────────────────────────
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
  const body = await res.text();
  if (!res.ok) throw new Error(`トークン取得失敗 [${res.status}]: ${body}`);
  return JSON.parse(body).access_token;
}

// ── 全ページ取得（next_page_token でページネーション） ──────────────────
async function fetchAllRecordings(token, from, to) {
  const all = [];
  let nextPageToken = '';
  let page = 1;

  do {
    const params = new URLSearchParams({ page_size: '100', from, to });
    if (nextPageToken) params.set('next_page_token', nextPageToken);

    const url = `https://api.zoom.us/v2/phone/recordings?${params}`;
    process.stdout.write(`  ページ ${page} 取得中... `);

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`録音取得失敗 [${res.status}]: ${text}`);

    const json = JSON.parse(text);
    const recs = json.recordings ?? [];
    all.push(...recs);

    if (page === 1) console.log(`HTTP ${res.status} / total_records=${json.total_records ?? '?'}`);
    else console.log(`+${recs.length}件`);

    nextPageToken = json.next_page_token || '';
    page++;
  } while (nextPageToken);

  return all;
}

// ── フォーマットヘルパー ──────────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function dur(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

// ── メイン ────────────────────────────────────────────────────────────────
async function main() {
  const now  = new Date();
  const from = new Date(now.getTime() - daysArg * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const to   = now.toISOString().slice(0, 10);

  console.log('=== Zoom Phone 録音一覧（owner_id フィルタ）===');
  console.log(`対象 zoom_user_id : ${zoomUserId}`);
  console.log(`期間              : ${from} ～ ${to}（過去${daysArg}日）\n`);

  console.log('1. アクセストークン取得中...');
  const token = await getAccessToken();
  console.log('   ✓ 完了\n');

  console.log('2. GET /v2/phone/recordings（アカウント全体）...');
  const allRecordings = await fetchAllRecordings(token, from, to);
  console.log(`   ✓ アカウント全体: ${allRecordings.length} 件\n`);

  // owner_id でフィルタ
  const myRecordings = allRecordings.filter(r => r.owner_id === zoomUserId);
  console.log(`3. owner_id="${zoomUserId}" でフィルタ: ${myRecordings.length} 件\n`);

  // ── 整形表示（フィルタ後） ─────────────────────────────────────────────
  console.log('━'.repeat(80));
  if (myRecordings.length === 0) {
    console.log('該当する録音が見つかりませんでした。');
    console.log('\n【アカウント全体の owner_id 別件数（全データ）】');
    const byOwner = {};
    for (const r of allRecordings) {
      const key = r.owner_id ?? '(なし)';
      byOwner[key] = (byOwner[key] || 0) + 1;
    }
    for (const [ownerId, cnt] of Object.entries(byOwner).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${ownerId} : ${cnt} 件`);
    }
  } else {
    myRecordings.forEach((r, i) => {
      const dir = r.direction === 'outbound' ? '発信'
                : r.direction === 'inbound'  ? '着信'
                : r.direction ?? '—';
      const calleeNorm = normalizePhone(r.callee_number || '');

      console.log(`[${String(i + 1).padStart(3, ' ')}] ${fmt(r.start_time)}  (${dir})  ${dur(r.duration)}`);
      console.log(`      owner_id           : ${r.owner_id           ?? '—'}`);
      console.log(`      owner_extension_id : ${r.owner_extension_id ?? '—'}`);
      console.log(`      caller_number      : ${r.caller_number      ?? '—'}`);
      console.log(`      callee_number      : ${r.callee_number      ?? '—'}`);
      console.log(`      callee_number(正規) : ${calleeNorm || '—'}  ← Spanavi側電話番号と照合`);
      if (r.caller_name)  console.log(`      caller_name        : ${r.caller_name}`);
      if (r.callee_name)  console.log(`      callee_name        : ${r.callee_name}`);
      console.log(`      download_url       : ${r.download_url       ?? '—'}`);
      if (r.transcript_download_url) {
        console.log(`      transcript_url     : ${r.transcript_download_url}`);
      }
      console.log('');
    });
  }
  console.log('━'.repeat(80));

  // ── 生JSON（フィルタ後） ──────────────────────────────────────────────
  console.log('\n【生JSON（owner_idフィルタ後 全件）】');
  console.log(JSON.stringify(myRecordings, null, 2));
}

main().catch(err => {
  console.error('\nエラー:', err.message);
  process.exit(1);
});
