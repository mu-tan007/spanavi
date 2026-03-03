// ============================================================
// メモフィールドのパース・構築ユーティリティ
// call_list_items.memo は CSV インポート時に {"備考":"..."} のような JSON が入っている場合がある。
// ユーザーメモは _note キーで保持し、既存データを破壊しない。
// ============================================================

export const extractUserNote = (memo) => {
  if (!memo) return '';
  try {
    const parsed = JSON.parse(memo);
    return (typeof parsed === 'object' && parsed !== null) ? (parsed._note || '') : memo;
  } catch { return memo; }
};

export const buildMemoWithNote = (currentMemo, newNote) => {
  if (!currentMemo) return newNote || null;
  try {
    const parsed = JSON.parse(currentMemo);
    if (typeof parsed === 'object' && parsed !== null) {
      const updated = { ...parsed, _note: newNote };
      if (!newNote) delete updated._note;
      return Object.keys(updated).length > 0 ? JSON.stringify(updated) : null;
    }
    return newNote || null;
  } catch { return newNote || null; }
};
