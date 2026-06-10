// ============================================================
// Edge Function 同期チェック
// ----------------------------------------------------------------
// リポジトリ(supabase/functions/*) と Supabase 本番のデプロイ状態の乖離を検出する。
// 「mainにマージしたのに本番未デプロイ」「本番で動いているのにソースがrepoに無い」
// という事故（2026-06-10 に実際に発生）を機械的に検出するためのスクリプト。
//
// 使い方:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-edge-functions.mjs
//   （または supabase CLI ログイン済みならトークンを自動検出）
//
// 終了コード:
//   1 = 重大な乖離あり（repoにあるのに未デプロイ / repoの方が新しい）
//   0 = 問題なし、または警告のみ（本番にあるがrepoに無い）/ トークン未設定でスキップ
// ============================================================
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = join(repoRoot, 'supabase', 'functions');

// ── プロジェクトref（config.toml から取得、env で上書き可） ──
function getProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const configPath = join(repoRoot, 'supabase', 'config.toml');
  if (existsSync(configPath)) {
    const m = readFileSync(configPath, 'utf8').match(/project_id\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error('project ref が特定できません（SUPABASE_PROJECT_REF を設定してください）');
}

// ── アクセストークン（env → supabase CLI の保存場所） ──
function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const candidates = [
    join(homedir(), '.supabase', 'access-token'),
    process.env.APPDATA ? join(process.env.APPDATA, 'supabase', 'access-token') : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  }
  return null;
}

function localFunctionSlugs() {
  return readdirSync(functionsDir)
    .filter(name => {
      if (name.startsWith('_') || name.startsWith('.')) return false;
      const full = join(functionsDir, name);
      return statSync(full).isDirectory() && existsSync(join(full, 'index.ts'));
    })
    .sort();
}

function lastCommitMs(slug) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "supabase/functions/${slug}"`, {
      cwd: repoRoot, encoding: 'utf8',
    }).trim();
    return iso ? new Date(iso).getTime() : null;
  } catch {
    return null;
  }
}

async function main() {
  const token = getAccessToken();
  if (!token) {
    console.log('[check-edge-functions] SUPABASE_ACCESS_TOKEN が無いためスキップします。');
    console.log('  ローカル: supabase login 済みなら自動検出、または環境変数で指定してください。');
    console.log('  CI: GitHub Secrets に SUPABASE_ACCESS_TOKEN を追加すると有効になります。');
    process.exit(0);
  }

  const ref = getProjectRef();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[check-edge-functions] Management API エラー: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const deployed = await res.json(); // [{ slug, status, updated_at(ms), version, ... }]
  const deployedBySlug = new Map(deployed.map(f => [f.slug, f]));
  const localSlugs = localFunctionSlugs();
  const localSet = new Set(localSlugs);

  // 1. repo にあるのに本番未デプロイ（最も危険: 「直したつもり」事故）
  const notDeployed = localSlugs.filter(s => !deployedBySlug.has(s));

  // 2. repo の方が新しい（mainマージ後にデプロイされていない可能性）
  const stale = [];
  for (const slug of localSlugs) {
    const fn = deployedBySlug.get(slug);
    if (!fn) continue;
    const commitMs = lastCommitMs(slug);
    if (commitMs && fn.updated_at && commitMs > fn.updated_at) {
      stale.push({
        slug,
        committed: new Date(commitMs).toISOString(),
        deployed: new Date(fn.updated_at).toISOString(),
      });
    }
  }

  // 3. 本番で動いているのにソースが repo に無い（復旧不能リスク → 警告）
  const missingInRepo = deployed.map(f => f.slug).filter(s => !localSet.has(s)).sort();

  console.log(`[check-edge-functions] repo: ${localSlugs.length}関数 / 本番: ${deployed.length}関数`);

  let hasError = false;
  if (notDeployed.length) {
    hasError = true;
    console.error('\n■ ERROR: repo にあるが本番に未デプロイ（デプロイ漏れ）:');
    notDeployed.forEach(s => console.error(`  - ${s}`));
  }
  if (stale.length) {
    hasError = true;
    console.error('\n■ ERROR: repo の方が新しい（マージ後にデプロイされていない可能性）:');
    stale.forEach(x => console.error(`  - ${x.slug}  commit=${x.committed}  deploy=${x.deployed}`));
  }
  if (missingInRepo.length) {
    console.warn('\n■ WARN: 本番で稼働中だがソースが repo に無い（要ソース回収）:');
    missingInRepo.forEach(s => console.warn(`  - ${s}`));
  }
  if (!hasError && !missingInRepo.length) {
    console.log('OK: repo と本番は同期しています。');
  }
  process.exit(hasError ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
