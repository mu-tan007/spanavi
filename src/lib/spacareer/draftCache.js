// ============================================================
// スパキャリ 受講生入力の端末ローカル下書きキャッシュ
// ----------------------------------------------------------------
// むー様指示 2026-06-24: 受講生から「保存しようとすると強制ログアウトされる/
// 保存に失敗して回答が全部消える」との連絡。長時間フォーム中にアクセストークンが
// 期限切れになり保存(upsert)が失敗→ログアウト、が根因。
//
// サーバー保存の成否に関わらず、入力内容を常に localStorage に退避しておくことで、
// 万一ログアウトされても回答を失わず、再ログイン後に自動復元できるようにする。
// ============================================================

const PREFIX = 'sp_draft_v1:';

/**
 * 下書きを読み込む。
 * @param {string} key 画面+受講生で一意なキー（例 'kickoff_hearing:<customerId>'）
 * @returns {{ data: any, savedAt: number } | null}
 */
export function loadDraft(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * 下書きを保存する（入力のたびに呼ぶ）。失敗しても黙って無視する。
 * @param {string} key
 * @param {any} data シリアライズ可能な入力スナップショット
 */
export function saveDraft(key, data) {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // 容量超過・プライベートモード等は黙って無視（下書きはベストエフォート）
  }
}

/**
 * 下書きを破棄する（サーバーへ全件保存が確定したときに呼ぶ）。
 * @param {string} key
 */
export function clearDraft(key) {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // 無視
  }
}
