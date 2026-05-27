import { useState, useCallback } from 'react';

/**
 * IME 日本語入力中の中間文字確定を抑制するヘルパー。
 *
 * 使用例:
 *   const [q, setQ] = useUrlState('apo_q', '');
 *   <input value={q} {...useImeSafe(setQ)} />
 *
 * 仕組み:
 *   - compositionstart で IME 変換中フラグを立てる
 *   - その間 onChange を握りつぶす（外部 setter を呼ばない）
 *   - compositionend で確定値を一度だけ反映
 *
 * これがないと、useUrlState などの外部 state に変換中の中間文字が反映され、
 * input が再描画されて IME がリセットされ「kくくrくろくろdくろだ」のように壊れる。
 *
 * @param {(value: string) => void} onChange - 確定値を受け取る setter
 * @returns {{ onChange, onCompositionStart, onCompositionEnd }} input に spread する props
 */
export function useImeSafe(onChange) {
  const [composing, setComposing] = useState(false);
  const handleChange = useCallback((e) => {
    if (!composing) onChange(e.target.value);
  }, [composing, onChange]);
  const handleCompositionStart = useCallback(() => setComposing(true), []);
  const handleCompositionEnd = useCallback((e) => {
    setComposing(false);
    onChange(e.target.value);
  }, [onChange]);
  return {
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
