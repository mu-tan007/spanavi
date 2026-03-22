import { useState } from 'react';

/**
 * カラムヘッダー右端に配置するリサイズ用ドラッグハンドル
 * ホバー時のみ青い縦線が出現する
 */
export default function ColumnResizeHandle({ colIndex, onResizeStart }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onResizeStart(colIndex, e.clientX);
      }}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: 'col-resize',
        zIndex: 2,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{
        width: 2,
        height: '100%',
        background: hovered ? 'rgba(13, 34, 71, 0.4)' : 'transparent',
        transition: 'background 0.15s',
      }} />
    </div>
  );
}
