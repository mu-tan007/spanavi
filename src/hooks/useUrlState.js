// =====================================================================
// useUrlState: URL 検索クエリと React state を双方向同期する共通フック
// ---------------------------------------------------------------------
// 目的:
//   各画面のクライアント選択・サブタブ・期間フィルタ等の状態を URL に
//   残し、ハードリロード/URL共有/ブラウザの戻る/進むで失われないようにする。
//
// 使い方:
//   const [client, setClient]   = useUrlState('client', null);
//   const [tab, setTab]         = useUrlState('tab', 'list', { allowed: ['list','grid'] });
//   const [from, setFrom]       = useUrlState('from', '');
//   const [filters, setFilters] = useUrlState('filters', [], { json: true });
//
// 設計方針:
//   - default 値と一致する場合は URL から消す（URL を散らかさない）
//   - setX(next) は関数も受け付ける（prev => next 形式）
//   - allowed: 不正値が来たら default にフォールバック（XSS/typo 防衛）
//   - json: true で配列・オブジェクトを JSON.stringify/parse
//   - replace: true（default） で履歴を汚さず置換
//   - 複数 useUrlState を同一コンポーネントで使った場合の race condition を
//     避けるため、setSearchParams は必ず functional 形式で呼ぶ
// =====================================================================

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * @param {string} key  URL クエリのキー名
 * @param {*}      defaultValue  state の初期値（URL に値が無い時に返る）
 * @param {object} [options]
 * @param {string[]} [options.allowed]   受け付ける値の許可リスト。違反値は default にフォールバック
 * @param {boolean}  [options.json]      true: 値を JSON で encode/decode（配列・オブジェクト用）
 * @param {boolean}  [options.replace]   true (default): replaceState で履歴を汚さない
 * @returns {[any, (next:any|((prev:any)=>any))=>void]}
 */
export function useUrlState(key, defaultValue, options = {}) {
  const { allowed, json = false, replace = true } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(key);

  const value = useMemo(() => {
    if (raw == null) return defaultValue;
    if (json) {
      try { return JSON.parse(raw); } catch { return defaultValue; }
    }
    if (allowed && !allowed.includes(raw)) return defaultValue;
    return raw;
  }, [raw, defaultValue, json, allowed]);

  const setValue = useCallback((next) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      const prevRaw = np.get(key);
      let prevVal;
      if (prevRaw == null) prevVal = defaultValue;
      else if (json) { try { prevVal = JSON.parse(prevRaw); } catch { prevVal = defaultValue; } }
      else prevVal = prevRaw;

      const computed = typeof next === 'function' ? next(prevVal) : next;

      const isEmpty =
        computed === null ||
        computed === undefined ||
        computed === '' ||
        (Array.isArray(computed) && computed.length === 0) ||
        (json && typeof computed === 'object' && computed !== null && Object.keys(computed).length === 0);

      const isDefault = !json && computed === defaultValue;

      if (isEmpty || isDefault) {
        np.delete(key);
      } else {
        np.set(key, json ? JSON.stringify(computed) : String(computed));
      }
      return np;
    }, { replace });
  }, [key, setSearchParams, defaultValue, json, replace]);

  return [value, setValue];
}
