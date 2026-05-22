// 直近14日キーマン断り録音を analyze-rejection-recording で分析するバッチ
// 並列度 10 で実行。 Edge Function 側で recording_url 取得 + DB UPDATE まで完結
// 使い方: node scripts/run_ai_analysis_batch.mjs [LIMIT]

import fs from 'fs';

const SUPABASE_URL = 'https://baiiznjzvzhxwwqzsozn.supabase.co';
// legacy anon JWT (verify_jwt=true なので必要)
const ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g';

const CONCURRENCY = 10;
const FN_URL = `${SUPABASE_URL}/functions/v1/analyze-rejection-recording`;
const ID_FILE = 'scripts/ai_target_ids.txt';
const LIMIT = parseInt(process.argv[2] || '0', 10); // > 0 で件数制限

const ids = fs.readFileSync(ID_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const targets = LIMIT > 0 ? ids.slice(0, LIMIT) : ids;

console.log(`[batch] target ids: ${targets.length} (concurrency=${CONCURRENCY})`);

async function processOne(record_id) {
  const res = await fetch(FN_URL, {
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

async function processWithConcurrency(items, limit, worker) {
  let idx = 0, success = 0, failed = 0;
  const errors = [];
  async function next() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      const id = items[i];
      try {
        await worker(id);
        success++;
      } catch (e) {
        failed++;
        errors.push({ id, error: e.message });
      }
      const done = success + failed;
      if (done % 10 === 0 || done === items.length) {
        console.log(`[batch] ${done}/${items.length} (success=${success}, failed=${failed})`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => next()));
  return { success, failed, errors };
}

const startAt = Date.now();
const { success, failed, errors } = await processWithConcurrency(targets, CONCURRENCY, processOne);
const elapsedSec = ((Date.now() - startAt) / 1000).toFixed(1);

console.log('\n========== Summary ==========');
console.log(`Total       : ${targets.length}`);
console.log(`Success     : ${success}`);
console.log(`Failed      : ${failed}`);
console.log(`Elapsed     : ${elapsedSec}s (${(elapsedSec / 60).toFixed(1)}min)`);
if (errors.length > 0) {
  console.log('\nFirst 10 errors:');
  errors.slice(0, 10).forEach(e => console.log(`  ${e.id}: ${e.error}`));
  fs.writeFileSync('scripts/ai_batch_errors.json', JSON.stringify(errors, null, 2));
  console.log(`\n${errors.length} errors saved to scripts/ai_batch_errors.json`);
}
