import { useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

// 1画面集中の前後矢印で「同じパネルで抽出された企業群」を順に架電できるようにする。
//
// 二重架電防止:
//   各 item を開く直前に DB を直接チェックし、以下の場合は警告/スキップ:
//     ・ 直近ステータスが「アポ獲得」「除外」→ 自動スキップして次へ
//     ・ 直近が「受付再コール」「キーマン再コール」→ 警告ダイアログ
//     ・ 本日、自分以外の人が架電している → 注意ダイアログ
//
// ハードリロード対応:
//   openQueue / idx 変更時に items + idx を localStorage に保存。
//   SpanaviApp 側で起動時にこのキーを読んで restoreQueue(items, idx) で再開可能。
const SKIP_STATUSES = ['アポ獲得', '除外'];
const WARN_STATUSES = ['受付再コール', 'キーマン再コール'];
const STORAGE_KEY   = 'masp_v2_callQueue';

function saveQueue(items, idx) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, idx })); } catch {}
}
function clearQueue() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
export function readSavedQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.items) || obj.items.length === 0) return null;
    return { items: obj.items, idx: Number.isFinite(obj.idx) ? obj.idx : 0 };
  } catch { return null; }
}

async function checkItem(itemId) {
  const { data, error } = await supabase.rpc('smart_queue_call_check', { p_item_id: itemId });
  if (error) {
    console.warn('[useCallQueue] check failed:', error);
    return null;
  }
  return data || null;
}

export function useCallQueue({ setCallFlowScreen, callListData, suppressChecks = false }) {
  // suppressChecks: 「アポ獲得/除外で自動スキップ」「再コール状態で警告」「他人架電で警告」を全部off。
  // 事業俯瞰のリスト分析からの架電など、状態を承知の上で意図的に再アプローチする経路向け。
  const queueRef = useRef({ items: [], idx: 0 });

  const resolveFullList = useCallback((listId) => {
    return (callListData || []).find(l => l._supaId === listId || l.id === listId)
      || { _supaId: listId, id: listId, company: '' };
  }, [callListData]);

  const finishQueue = useCallback(() => {
    clearQueue();
    setCallFlowScreen?.(null);
  }, [setCallFlowScreen]);

  // autoDialNext: ステータス入力で「次へ」送られた時だけ true。
  // 次企業の CallFlowView マウント時に（オートコール ON なら）自動発信させる。
  // 初回起動・手動の前へ/次へでは false（勝手に架電しない）。
  const openAtIdx = useCallback(async (autoDialNext = false) => {
    const q = queueRef.current;
    const cur = q.items[q.idx];
    if (!cur || !setCallFlowScreen) { finishQueue(); return; }

    // 進捗を永続化（ハードリロードでも再開可能に）
    saveQueue(q.items, q.idx);

    // DB 直接チェック (suppressChecks=true なら全部スキップ)
    const check = suppressChecks ? null : await checkItem(cur.item_id);
    if (check) {
      // アポ獲得 / 除外 は自動スキップ
      if (SKIP_STATUSES.includes(check.latest_status)) {
        const nextIdx = q.idx + 1;
        if (nextIdx < q.items.length) {
          queueRef.current = { items: q.items, idx: nextIdx };
          openAtIdx(autoDialNext);
        } else {
          alert('全件「アポ獲得/除外」済のためキューを終了します。');
          finishQueue();
        }
        return;
      }
      // 受付再コール / キーマン再コール は警告
      if (WARN_STATUSES.includes(check.latest_status)) {
        const msg = `⚠ この企業は既に「${check.latest_status}」になっています。\n`
          + `取得者: ${check.latest_getter || '不明'}\n`
          + `日付: ${(check.latest_called_at || '').slice(0, 16).replace('T', ' ')}\n\n`
          + `「OK」: スキップして次へ進む\n「キャンセル」: それでも架電する`;
        if (window.confirm(msg)) {
          const nextIdx = q.idx + 1;
          if (nextIdx < q.items.length) {
            queueRef.current = { items: q.items, idx: nextIdx };
            openAtIdx();
          } else {
            finishQueue();
          }
          return;
        }
      }
      // 本日、自分以外が架電 → 注意
      const others = check.today_other_getters || [];
      if (others.length > 0) {
        const msg = `⚠ この企業は本日、別のメンバーが架電しています。\n`
          + `架電者: ${others.join(' / ')}\n\n`
          + `そのまま架電を続けますか？\n「OK」: 続行 / 「キャンセル」: スキップ`;
        if (!window.confirm(msg)) {
          const nextIdx = q.idx + 1;
          if (nextIdx < q.items.length) {
            queueRef.current = { items: q.items, idx: nextIdx };
            openAtIdx();
          } else {
            finishQueue();
          }
          return;
        }
      }
    }

    const goPrev = q.idx > 0 ? () => {
      queueRef.current = { items: q.items, idx: q.idx - 1 };
      openAtIdx();
    } : null;
    const goNext = q.idx < q.items.length - 1 ? () => {
      queueRef.current = { items: q.items, idx: q.idx + 1 };
      openAtIdx();
    } : null;
    setCallFlowScreen({
      list: resolveFullList(cur.list_id),
      defaultItemId: cur.item_id,
      defaultListMode: false,
      singleItemMode: true,
      onQueuePrev: goPrev,
      onQueueNext: goNext,
      queuePos: `${q.idx + 1} / ${q.items.length}件`,
      autoDialOnLoad: autoDialNext,
      onResultSubmit: () => {
        queueRef.current = { items: q.items, idx: q.idx + 1 };
        if (queueRef.current.idx < queueRef.current.items.length) openAtIdx(true);
        else finishQueue();
      },
    });
  }, [setCallFlowScreen, resolveFullList, finishQueue, suppressChecks]);

  const openQueue = useCallback((rows, startIdx = 0) => {
    const items = (rows || []).filter(r => r && r.item_id && r.list_id);
    if (items.length === 0) return;
    queueRef.current = { items, idx: Math.max(0, Math.min(startIdx, items.length - 1)) };
    openAtIdx();
  }, [openAtIdx]);

  return { openQueue };
}
