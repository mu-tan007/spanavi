/**
 * Zoom User ID 一括登録スクリプト
 * membersテーブルの zoom_user_id カラムを一括更新する
 *
 * 実行前提:
 *   Supabaseで `ALTER TABLE members ADD COLUMN zoom_user_id text;` を実行済みであること
 *
 * 実行方法:
 *   node register-zoom-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── .env.local から設定を読み込む ─────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(join(__dirname, '.env.local'), 'utf-8');
const env = Object.fromEntries(
  envRaw.split('\n')
    .filter(line => /^[A-Z_]+=/.test(line))
    .map(line => {
      const idx = line.indexOf('=');
      // Windows の CRLF (\r\n) に対応するため \r を除去
      return [line.slice(0, idx).trim(), line.slice(idx + 1).replace(/\r/g, '').trim()];
    })
);

const SUPABASE_URL     = env.VITE_SUPABASE_URL;
const SUPABASE_KEY     = env.SUPABASE_SERVICE_ROLE_KEY;  // RLS をバイパスする service_role キー

// ── 接続確認用デバッグ出力 ──────────────────────────────────────────────────
console.log('── 接続設定確認 ──');
console.log(`URL : ${SUPABASE_URL}`);
console.log(`KEY : ${SUPABASE_KEY ? SUPABASE_KEY.slice(0, 20) + '...' : '（未設定）'}`);
if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY === 'ここにservice_roleキーを入力') {
  console.error('\nエラー: .env.local の SUPABASE_SERVICE_ROLE_KEY を設定してください。');
  console.error('  Supabase ダッシュボード → Settings → API → service_role キーをコピー');
  process.exit(1);
}
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Zoom User ID 対応表（IDが判明しているメンバーのみ） ────────────────────
// 注: 高橋航世・吉川諒馬・池田紘規・武山創・中村光希・成尾拓輝・清水慧吾は
//     Zoom IDが未提供のため除外（名簿には存在確認済み）
const ZOOM_USERS = [
  { name: '山元真滉',   zoomId: 'lXsqw8miT5iHmX7cKz0R5w' },
  { name: '瀬尾貫太',   zoomId: 'aE6Sr9T1TqS6C4JO3URkKg' },
  { name: '竹野内佑大', zoomId: 'bQSkbxdgR6O_iDtPTleNeA' },
  { name: '尾鼻優吾',   zoomId: 'FcZBCywRRjqRbQLS4oEQng' },
  { name: '小中谷樹斗', zoomId: 'nmqwFxEKTNag5FxHnhXo2g' },
  { name: '浅井佑',     zoomId: 'L7VigDqrTfWdlKtoUwzYmQ' },
  { name: '能登谷斗夢', zoomId: 'rSxbdKUHQpib1XSX0ADzUA' },
  { name: '吉藤永翔',   zoomId: 'L1ZgG_-nQkqNxq33KbX6Vg' },
  { name: '植木帆希',   zoomId: '0mzDgqKrSpiAIdlBGRKdXA' },
  { name: '石井佑弥',   zoomId: 'R1DxMyv2Tw2Lges_TgKD1Q' },
  { name: '髙尾諭良',   zoomId: '2G8CsLpAToGpDtuYZgr7rw' }, // 髙(U+9AD9) / 高(U+9AD8) 両方試行
  { name: '篠宮拓武',   zoomId: '6hHMFyIbQQ-mZq4lzw__dQ' },
];

// ── 名前正規化（スペース除去 + 髙→高 の文字バリアント対応） ─────────────────
const normalize = (s) => s.replace(/[\s　]/g, '').replace(/髙/g, '高');

async function main() {
  console.log('=== Zoom User ID 一括登録 ===\n');

  // 全メンバー取得
  const { data: members, error: fetchError } = await supabase
    .from('members')
    .select('id, name, zoom_user_id');

  if (fetchError) {
    console.error('メンバー取得失敗:', fetchError.message);
    process.exit(1);
  }
  console.log(`DBメンバー数: ${members.length} 件\n`);

  // 正規化済み名前マップ
  const memberMap = new Map(members.map(m => [normalize(m.name), m]));

  let successCount = 0;
  let failCount = 0;

  for (const { name, zoomId } of ZOOM_USERS) {
    const key = normalize(name);
    const member = memberMap.get(key);

    if (!member) {
      console.warn(`⚠ 名前が見つかりません: 「${name}」 (正規化後: ${key})`);
      failCount++;
      continue;
    }

    if (member.zoom_user_id === zoomId) {
      console.log(`  スキップ（登録済み）: ${member.name}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('members')
      .update({ zoom_user_id: zoomId })
      .eq('id', member.id);

    if (updateError) {
      console.error(`✗ 更新失敗: ${member.name} — ${updateError.message}`);
      failCount++;
    } else {
      console.log(`✓ 登録成功: ${member.name} → ${zoomId}`);
      successCount++;
    }
  }

  console.log(`\n── 結果 ──`);
  console.log(`成功: ${successCount} 件`);
  console.log(`失敗/未発見: ${failCount} 件`);

  if (failCount > 0) {
    console.log('\n※ 見つからなかったメンバーは名前のスペースや文字（髙/高など）を確認してください。');
  }
}

main().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
