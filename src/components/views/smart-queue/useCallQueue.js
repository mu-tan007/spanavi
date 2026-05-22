import { useCallback, useRef } from 'react';

// 1画面集中の前後矢印で「同じパネルで抽出された企業群」を順に架電できるようにする。
// 各Panel の「架電」ボタンに openQueue(rows, startIdx) を割り当てる。
//
// 想定: rows は { list_id, item_id, ... } を持つレコード配列。
// setCallFlowScreen は SpanaviApp が提供する画面遷移セッター。
// callListData は ListView 経由で渡される全リスト配列（fullList 解決用）。
export function useCallQueue({ setCallFlowScreen, callListData }) {
  const queueRef = useRef({ items: [], idx: 0 });

  const resolveFullList = useCallback((listId) => {
    return (callListData || []).find(l => l._supaId === listId || l.id === listId)
      || { _supaId: listId, id: listId, company: '' };
  }, [callListData]);

  const openAtIdx = useCallback(() => {
    const q = queueRef.current;
    const cur = q.items[q.idx];
    if (!cur || !setCallFlowScreen) { setCallFlowScreen?.(null); return; }
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
