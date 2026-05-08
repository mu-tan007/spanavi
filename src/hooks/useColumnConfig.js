import { useState, useCallback, useRef, useEffect } from 'react';

const MIN_WIDTH = 40;

/**
 * カラム幅をUI上で変更可能にするカスタムフック
 * 揃え (align) は defaultColumns の値を変更不可で使用する
 * @param {string} tableId - localStorage保存用キー
 * @param {Array<{key: string, width: number, align: string}>} defaultColumns
 */
export default function useColumnConfig(tableId, defaultColumns, options = {}) {
  const { padding = 32, gap = 0 } = options;
  const storageKey = `spanavi_colcfg_${tableId}`;

  // localStorage からカラム幅オーバーライドのみマージ
  const loadColumns = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return defaultColumns.map(col => ({
        ...col,
        width: saved[col.key]?.width ?? col.width,
      }));
    } catch {
      return defaultColumns.map(col => ({ ...col }));
    }
  };

  const [columns, setColumns] = useState(loadColumns);
  const resizeRef = useRef(null);

  useEffect(() => {
    setColumns(loadColumns());
  }, [tableId]);

  // localStorage に保存（デフォルトとの差分のみ）
  const persist = useCallback((cols) => {
    const overrides = {};
    cols.forEach((col, i) => {
      const def = defaultColumns[i];
      if (!def) return;
      if (col.width !== def.width) {
        overrides[col.key] = { width: col.width };
      }
    });
    if (Object.keys(overrides).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(overrides));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, defaultColumns]);

  // CSS Grid用文字列（比例方式: 画面幅に応じて自動伸縮、最小幅保証）
  const gridTemplateColumns = columns.map(c => `minmax(${MIN_WIDTH}px, ${c.width}fr)`).join(' ');

  // 横スクロール用: 最小幅合計（全カラムが最小幅になった場合のフォールバック）
  const contentMinWidth = columns.length * MIN_WIDTH + padding + (columns.length - 1) * gap;

  // リサイズ開始
  const onResizeStart = useCallback((colIndex, startX) => {
    const startWidth = columns[colIndex].width;
    resizeRef.current = { colIndex, startX, startWidth };

    const onMouseMove = (e) => {
      if (!resizeRef.current) return;
      const { colIndex: ci, startX: sx, startWidth: sw } = resizeRef.current;
      const newWidth = Math.max(MIN_WIDTH, sw + (e.clientX - sx));
      setColumns(prev => {
        const next = prev.map((c, i) => i === ci ? { ...c, width: newWidth } : c);
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColumns(prev => {
        persist(prev);
        return prev;
      });
      resizeRef.current = null;
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [columns, persist]);

  // 全リセット（列幅をデフォルトに戻す）
  const resetAll = useCallback(() => {
    localStorage.removeItem(storageKey);
    setColumns(defaultColumns.map(col => ({ ...col })));
  }, [storageKey, defaultColumns]);

  return {
    columns,
    gridTemplateColumns,
    contentMinWidth,
    onResizeStart,
    resetAll,
  };
}
