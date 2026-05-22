import { useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

// 1画面集中の前後矢印で「同じパネルで抽出された企業群」を順に架電できるようにする。
//
// 二重架電防止:
//   各 item を開く直前に DB を直接チェックし、以下の場合は警告/スキップ:
//     ・ 直近ステータスが「アポ獲得」「除外」→ 自動スキップして次へ
//     ・ 直近が「受付再コール」「キーマン再コール」→ 警告ダイアログ
//     ・ 本日、自分以外の人が架電している → 注意ダイアログ
const SKIP_STATUSES = ['アポ獲得', '除外'];
const WARN_STATUSES = ['受付再コール', 'キーマン再コール'];

async function checkItem(itemId) {
  const { data, error } = await supabase.rpc('smart_queue_call_check', { p_item_id: itemId });
  if (error) {
    console.warn('[useCallQueue] check failed:', error);
    return null;
  }
  return data || null;
}

export function useCallQueue({ setCallFlowScreen, callListData }) {
  const queueRef = useRef({ items: [], idx: 0 });

  const resolveFullList = useCallback((listId) => {
    return (callListData || []).find(l => l._supaId === listId || l.id === listId)
      || { _supaId: listId, id: listId, company: '' };
  }, [callListData]);

  const openAtIdx = useCallback(async () => {
    const q = queueRef.current;
    const cur = q.items[q.idx];
    if (!cur || !setCallFlowScreen) { setCallFlowScreen?.(null); return; }

    // DB 直接チェック
    const check = await checkItem(cur.item_id);
    if (check) {
      // アポ獲得 / 除外 は自動スキップ
      if (SKIP_STATUSES.includes(check.latest_status)) {
        const nextIdx = q.idx + 1;
        if (nextIdx < q.items.length) {
          queueRef.current = { items: q.items, idx: nextIdx };
          openAtIdx();
        } else {
          alert('全件「アポ獲得/除外」済のためキューを終了します。');
          setCallFlowScreen?.(null);
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
            setCallFlowScreen?.(null);
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
            setCallFlowScreen?.(null);
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
      onResultSubmit: () => {
        queueRef.current = { items: q.items, idx: q.idx + 1 };
        if (queueRef.current.idx < queueRef.current.items.length) openAtIdx();
        else setCallFlowScreen?.(null);
      },
    });
  }, [setCallFlowScreen, resolveFullList]);

  const openQueue = useCallback((rows, startIdx = 0) => {
    const items = (rows || []).filter(r => r && r.item_id && r.list_id);
    if (items.length === 0) return;
    queueRef.current = { items, idx: Math.max(0, Math.min(startIdx, items.length - 1)) };
    openAtIdx();
  }, [openAtIdx]);

  return { openQueue };
}
