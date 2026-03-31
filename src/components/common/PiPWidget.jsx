import { useState, useRef, useCallback } from 'react';

/**
 * PiP（ピクチャーインピクチャー）フローティングミニウィンドウ
 * 架電画面を最小化した際に右下に表示される。
 */
export default function PiPWidget({ title, subtitle, onMaximize, onClose }) {
  const [pos, setPos] = useState(null); // null = デフォルト右下
  const widgetRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMouseMove = (ev) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - rect.width, ev.clientX - offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - rect.height, ev.clientY - offsetY)),
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const posStyle = pos
    ? { top: pos.y, left: pos.x }
    : { bottom: 24, right: 24 };

  return (
    <div
      ref={widgetRef}
      style={{
        position: 'fixed',
        ...posStyle,
        width: 320,
        zIndex: 10050,
        background: '#0D2247',
        borderRadius: 12,
        border: '1px solid rgba(200, 168, 75, 0.4)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        fontFamily: "'Noto Sans JP', sans-serif",
        animation: 'pipSlideIn 0.25s ease-out',
        userSelect: 'none',
      }}
    >
      {/* keyframes */}
      <style>{`
        @keyframes pipSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* ドラッグハンドル + メイン情報 */}
      <div
        onMouseDown={onMouseDown}
        style={{
          padding: '10px 14px 6px',
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* ドラッグインジケータ */}
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, flexShrink: 0, lineHeight: 1 }}>⠿</span>

        {/* タイトル */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {title}
          </div>
        </div>

        {/* 最大化ボタン */}
        <button
          onClick={onMaximize}
          title="元に戻す"
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', cursor: 'pointer',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ↗
        </button>

        {/* 終了ボタン */}
        <button
          onClick={onClose}
          title="架電終了"
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'rgba(234,0,30,0.15)',
            border: '1px solid rgba(234,0,30,0.3)',
            color: '#ff6b6b', cursor: 'pointer',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* サブ情報行 */}
      {subtitle && (
        <div style={{
          padding: '0 14px 10px 36px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
