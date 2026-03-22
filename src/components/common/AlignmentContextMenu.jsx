import { useEffect, useRef } from 'react';

const ITEMS = [
  { value: 'left', label: '左揃え' },
  { value: 'center', label: '中央揃え' },
  { value: 'right', label: '右揃え' },
];

/**
 * ヘッダー右クリックで表示される揃え変更メニュー
 */
export default function AlignmentContextMenu({ x, y, currentAlign, onSelect, onReset, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // 画面端からはみ出さないよう調整
  const style = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: '4px 0',
    minWidth: 140,
    fontFamily: "'Noto Sans JP', sans-serif",
    fontSize: 12,
  };

  const itemStyle = (isActive) => ({
    padding: '6px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#0D2247',
    background: 'transparent',
    border: 'none',
    width: '100%',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: isActive ? 700 : 400,
  });

  return (
    <div ref={ref} style={style}>
      {ITEMS.map(item => (
        <button
          key={item.value}
          onClick={() => onSelect(item.value)}
          onMouseEnter={e => { e.currentTarget.style.background = '#F3F4F6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          style={itemStyle(currentAlign === item.value)}
        >
          {item.label}
          {currentAlign === item.value && <span style={{ fontSize: 11, color: '#0D2247' }}>✓</span>}
        </button>
      ))}
      <div style={{ borderTop: '1px solid #E5E7EB', margin: '4px 0' }} />
      <button
        onClick={onReset}
        onMouseEnter={e => { e.currentTarget.style.background = '#F3F4F6'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        style={{ ...itemStyle(false), color: '#6B7280', fontSize: 11 }}
      >
        全カラムをリセット
      </button>
    </div>
  );
}
