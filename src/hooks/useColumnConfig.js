import { useState, useCallback, useRef, useEffect } from 'react';

const MIN_WIDTH = 40;

/**
 * カラム幅・揃えをUI上で変更可能にするカスタムフック
 * @param {string} tableId - localStorage保存用キー
 * @param {Array<{key: string, width: number, align: string}>} defaultColumns
 */
export default function useColumnConfig(tableId, defaultColumns, options = {}) {
  const { padding = 32, gap = 0 } = options;
  const storageKey = `spanavi_colcfg_${tableId}`;

  // localStorage からオーバーライドをマージ
  const loadColumns = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return defaultColumns.map(col => ({
        ...col,
        width: saved[col.key]?.width ?? col.width,
        align: saved[col.key]?.align ?? col.align,
      }));
    } catch {
      return defaultColumns.map(col => ({ ...col }));
    }
  };

  const [columns, setColumns] = useState(loadColumns);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, colIndex: -1 });
  const resizeRef = useRef(null);

  // defaultColumns が変わったら再マージ
  useEffect(() => {
    setColumns(loadColumns());
  }, [tableId]);

  // localStorage に保存（デフォルトとの差分のみ）
  const persist = useCallback((cols) => {
    const overrides = {};
    cols.forEach((col, i) => {
      const def = defaultColumns[i];
      if (!def) return;
      const delta = {};
      if (col.width !== def.width) delta.width = col.width;
      if (col.align !== def.align) delta.align = col.align;
      if (Object.keys(delta).length > 0) overrides[col.key] = delta;
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
      // persist after state update
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

  // 右クリックメニュー表示
  const onHeaderContextMenu = useCallback((e, colIndex) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, colIndex });
  }, []);

  // 揃え変更
  const setAlign = useCallback((colIndex, align) => {
    setColumns(prev => {
      const next = prev.map((c, i) => i === colIndex ? { ...c, align } : c);
      persist(next);
      return next;
    });
    setContextMenu({ visible: false, x: 0, y: 0, colIndex: -1 });
  }, [persist]);

  // 全リセット
  const resetAll = useCallback(() => {
    localStorage.removeItem(storageKey);
    setColumns(defaultColumns.map(col => ({ ...col })));
    setContextMenu({ visible: false, x: 0, y: 0, colIndex: -1 });
  }, [storageKey, defaultColumns]);

  // メニューを閉じる
  const closeMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, colIndex: -1 });
  }, []);

  return {
    columns,
    gridTemplateColumns,
    contentMinWidth,
    onResizeStart,
    onHeaderContextMenu,
    contextMenu,
    setAlign,
    resetAll,
    closeMenu,
  };
}
