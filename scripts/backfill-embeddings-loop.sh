#!/usr/bin/env bash
# company_master.embedding を backfill-embeddings Edge Function でループ実行
# 全件 embedding 完了するまでチャンク呼び出し。
#
# Usage:
#   bash scripts/backfill-embeddings-loop.sh
#
# 進捗ログは scripts/backfill-embeddings.log に追記。

set -euo pipefail

cd "$(dirname "$0")/.."

ANON=$(grep "VITE_SUPABASE_ANON_KEY=" .env.local | sed 's/^VITE_SUPABASE_ANON_KEY=//' | tr -d '\r\n')
URL="https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/backfill-embeddings"
LOG="scripts/backfill-embeddings.log"

echo "=== backfill start: $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$LOG"

iter=0
while true; do
  iter=$((iter+1))
  resp=$(curl -sS -X POST "$URL" \
    -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d '{"batch_size":2000,"update_chunk":200}' --max-time 240)

  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "[$ts] iter=$iter $resp" | tee -a "$LOG"

  # 完了判定
  if echo "$resp" | grep -q '"done":true'; then
    echo "=== backfill done at iter=$iter $ts ===" | tee -a "$LOG"
    exit 0
  fi
  # エラー時は短く待機して再試行
  if echo "$resp" | grep -q '"error"'; then
    echo "[$ts] error detected, sleep 5s and retry" | tee -a "$LOG"
    sleep 5
  fi
done
