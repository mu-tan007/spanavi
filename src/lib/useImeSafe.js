import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * IME 日本語入力中に input value を外部 state に同期しないためのフック。
 *
 * 使用例:
 *   const [q, setQ] = useUrlState('apo_q', '');
 *   const ime = useImeSafeInput(q, setQ);
 *   <input {...ime} placeholder="..." />
 *
 * 何が問題か:
 *   <input value={外部state} onChange={...} /> の形で外部 state を毎打鍵で更新すると、
 *   IME 変換中の中間文字もstateに反映 → React が input value を書き換え → IME が破棄され
 *   「黒田」と打つと「kくくrくろくろdくろだ」のように壊れる、または何も入らなくなる。
 *
 * 仕組み:
 *   - input value は内部 local state で管理 (IME を邪魔しない)
 *   - IME 確定 (compositionend) or 非IME入力時に親に通知
 *   - 外部 value が変わったら local も追従 (ただし IME中は除く)
 *
 * @param {string} value - 親から渡される現在値
 * @param {(value: string) => void} onChangeValue - 確定値を親に通知する setter
 * @returns input に spread する props { value, onChange, onCompositionStart, onCompositionEnd }
 */
export function useImeSafeInput(value, onChangeValue) {
  const [local, setLocal] = useState(value ?? '');
  const composingRef = useRef(false);

  // 親 value が変わった時 local を追従 (IME中以外)。
  useEffect(() => {
    if (!composingRef.current) setLocal(value ?? '');
  }, [value]);

  const handleChange = useCallback((e) => {
    const v = e.target.value;
    setLocal(v);
    // 非IME入力 (英字直接入力、ペースト、Backspace等) は即座に親に通知。
    // IME中は親通知をスキップして、compositionend でまとめて通知する。
    if (!composingRef.current) onChangeValue(v);
  }, [onChangeValue]);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e) => {
    composingRef.current = false;
    const v = e.target.value;
    setLocal(v);
    onChangeValue(v);
  }, [onChangeValue]);

  return {
    value: local,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}

// 後方互換: 旧 useImeSafe(setter) シグネチャ。新規利用は useImeSafeInput を推奨。
export function useImeSafe(setter) {
  const composingRef = useRef(false);
  return {
    onChange: (e) => { if (!composingRef.current) setter(e.target.value); },
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: (e) => { composingRef.current = false; setter(e.target.value); },
  };
}
