import { useState, useRef, useCallback } from 'react';
import { color, radius, font, shadow, alpha } from '../../constants/design';

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
        background: color.navy,
        borderRadius: 12,
        border: `1px solid ${alpha(color.gold, 0.4)}`,
        boxShadow: shadow.xl,
        fontFamily: font.family.sans,
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
        <span style={{ color: alpha(color.white, 0.3), fontSize: font.size.md, flexShrink: 0, lineHeight: 1 }}>⠿</span>

        {/* タイトル */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: font.size.base,
            fontWeight: font.weight.bold,
            color: color.white,
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
            width: 28, height: 28, borderRadius: radius.lg,
            background: alpha(color.white, 0.1),
            border: `1px solid ${alpha(color.white, 0.2)}`,
            color: color.white, cursor: 'pointer',
            fontSize: font.size.md, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            width: 28, height: 28, borderRadius: radius.lg,
            background: alpha(color.danger, 0.15),
            border: `1px solid ${alpha(color.danger, 0.3)}`,
            color: '#ff6b6b', cursor: 'pointer',
            fontSize: font.size.md, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          fontSize: font.size.xs,
          color: alpha(color.white, 0.55),
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
