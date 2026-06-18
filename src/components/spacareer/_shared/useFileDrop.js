import { useState } from 'react';

// ============================================================
// ファイルのドラッグ＆ドロップ用フック
// ----------------------------------------------------------------
// 既存のファイル選択ボタンはそのまま残し、対象コンテナに dropHandlers を
// 展開するだけでドロップ受付を追加できる。
//   const { isOver, dropHandlers } = useFileDrop(handleFile, disabled);
//   <div {...dropHandlers} style={{ ...(isOver ? overStyle : null) }}>
// onFile には dataTransfer の先頭ファイルが渡る。
// ============================================================
export function useFileDrop(onFile, disabled = false) {
  const [isOver, setIsOver] = useState(false);

  const dropHandlers = {
    onDragOver: (e) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsOver(true);
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
      if (disabled) return;
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile(f);
    },
  };

  return { isOver, dropHandlers };
}
