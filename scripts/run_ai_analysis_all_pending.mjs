// 未分析の キーマン断り 全件を一気に AI 分析する self-contained バッチ
// 使い方: node scripts/run_ai_analysis_all_pending.mjs [LIMIT]
//   LIMIT 省略時は 5000 件まで一気に処理
//
// 動作:
//   1. RPC ai_rejection_pending_targets(p_limit) で未分析 ID 全取得
//   2. analyze-rejection-recording を 並列 10 で叩く
//   3. 結果は Edge Function 側で call_records.rejection_reason に save
import fs from 'fs';

const SUPABASE_URL = 'https://baiiznjzvzhxwwqzsozn.supabase.co';
const ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g';

const CONCURRENCY  = 10;
const RPC_URL      = `${SUPABASE_URL}/rest/v1/rpc/ai_rejection_pending_targets`;
const ANALYZE_URL  = `${SUPABASE_URL}/functions/v1/analyze-rejection-recording`;
const LIMIT        = parseInt(process.argv[2] || '5000', 10);

// PostgREST のデフォルト max-rows は 1000 なので、 batch ごとに再フェッチして残りを拾う
// RPC が「未分析」だけ返す仕様なので、 処理済みは自動的に次のフェッチで除外される

async function processOne(record_id) {
  const res = await fetch(ANALYZE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ record_id, save_to_db: true }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

const startAt = Date.now();
let totalSuccess = 0, totalFailed = 0, totalProcessed = 0;
const allErrors = [];
let batchNum = 0;

while (true) {
  batchNum++;
  console.log(`\n[batch-all] === batch #${batchNum} === fetching pending IDs (limit=${LIMIT})...`);

  const rpcRes = await fetch(RPC_URL, {
    method: 'POST',
    headers: {
      'apikey': ANON_JWT,
      'Authorization': `Bearer ${ANON_JWT}`,
      'Content-Type': 'application/json',
      'Range-Unit': 'items',
      'Range': `0-${LIMIT - 1}`,
    },
    body: JSON.stringify({ p_limit: LIMIT }),
  });
  if (!rpcRes.ok) {
    console.error(`RPC failed: ${rpcRes.status} ${await rpcRes.text()}`);
    process.exit(1);
  }
  const rows = await rpcRes.json();
  const ids = rows.map(r => r.id);
  console.log(`[batch-all] batch #${batchNum}: ${ids.length} ids to process (concurrency=${CONCURRENCY})`);

  if (ids.length === 0) {
    console.log('[batch-all] no more pending. done.');
    break;
  }

  let idx = 0, success = 0, failed = 0;

  async function worker() {
    while (idx < ids.length) {
      const i = idx++;
      const id = ids[i];
      try { await processOne(id); success++; }
      catch (e) { failed++; allErrors.push({ id, error: e.message }); }
      const done = success + failed;
      if (done % 50 === 0 || done === ids.length) {
        const elapsed = ((Date.now() - startAt) / 1000).toFixed(0);
        console.log(`[batch-all] batch#${batchNum} ${done}/${ids.length} (success=${success}, failed=${failed}, total_elapsed=${elapsed}s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  totalSuccess += success;
  totalFailed += failed;
  totalProcessed += ids.length;
  console.log(`[batch-all] batch #${batchNum} done. success=${success}, failed=${failed}`);
}

const totalSec = ((Date.now() - startAt) / 1000).toFixed(1);
console.log('\n========== Final Summary ==========');
console.log(`Batches     : ${batchNum}`);
console.log(`Total       : ${totalProcessed}`);
console.log(`Success     : ${totalSuccess}`);
console.log(`Failed      : ${totalFailed}`);
console.log(`Elapsed     : ${totalSec}s (${(totalSec / 60).toFixed(1)}min)`);

if (allErrors.length > 0) {
  console.log('\nFirst 10 errors:');
  allErrors.slice(0, 10).forEach(e => console.log(`  ${e.id}: ${e.error}`));
  fs.writeFileSync('scripts/ai_batch_all_errors.json', JSON.stringify(allErrors, null, 2));
  console.log(`\n${allErrors.length} errors saved to scripts/ai_batch_all_errors.json`);
}
