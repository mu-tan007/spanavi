import { useState, useRef, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';

/**
 * インクリメンタルサーチ付きカテゴリ入力
 * items: string[] - 候補リスト
 * value: string - 現在の値
 * onChange: (val) => void
 * placeholder: string
 */
export default function CategorySearchInput({ items, value, onChange, placeholder }) {
  const [input, setInput] = useState(value || '');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!input) return items.slice(0, 30);
    const q = input.toLowerCase();
    return items.filter(item => item.toLowerCase().includes(q)).slice(0, 50);
  }, [items, input]);

  const handleSelect = (item) => {
    setInput(item);
    onChange(item);
    setOpen(false);
  };

  const handleClear = () => {
    setInput('');
    onChange('');
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '6px 8px', border: `1px solid ${C.border}`,
            borderRadius: 6, fontSize: 13, outline: 'none', minWidth: 0,
          }}
        />
        {input && (
          <button onClick={handleClear} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.textLight, fontSize: 16, padding: '0 4px',
          }}>×</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
          maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          marginTop: 2,
        }}>
          {filtered.map((item, i) => (
            <div
              key={i}
              onClick={() => handleSelect(item)}
              style={{
                padding: '7px 10px', cursor: 'pointer', fontSize: 13,
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                background: item === value ? C.goldGlow : 'transparent',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.offWhite}
              onMouseLeave={(e) => e.currentTarget.style.background = item === value ? C.goldGlow : 'transparent'}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
