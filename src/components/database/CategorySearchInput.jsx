import { useState, useRef, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import { X } from 'lucide-react';

/**
 * 複数選択対応インクリメンタルサーチ
 * items: string[] - 候補リスト
 * value: string[] - 選択中の値（配列）
 * onChange: (val: string[]) => void
 * placeholder: string
 */
export default function CategorySearchInput({ items, value = [], onChange, placeholder }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const selected = new Set(value);
    const available = items.filter(item => !selected.has(item));
    if (!input) return available.slice(0, 30);
    const q = input.toLowerCase();
    return available.filter(item => item.toLowerCase().includes(q)).slice(0, 50);
  }, [items, input, value]);

  const handleSelect = (item) => {
    onChange([...value, item]);
    setInput('');
  };

  // カンマ区切り一括入力（半角・全角カンマ対応）
  const handleInputChange = (e) => {
    const raw = e.target.value;
    // カンマが含まれていたら一括登録を試行
    if (raw.includes(',') || raw.includes('，') || raw.includes('、')) {
      const parts = raw.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        const itemSet = new Set(items);
        const selected = new Set(value);
        const matched = parts.filter(p => itemSet.has(p) && !selected.has(p));
        const unmatched = parts.filter(p => !itemSet.has(p));
        if (matched.length > 0) {
          onChange([...value, ...matched]);
        }
        // マッチしなかったものがあれば入力欄に残す
        setInput(unmatched.join(', '));
        setOpen(unmatched.length > 0);
        return;
      }
    }
    setInput(raw);
    setOpen(true);
  };

  // ペースト時も一括処理
  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',') || pasted.includes('，') || pasted.includes('、')) {
      e.preventDefault();
      const parts = pasted.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const itemSet = new Set(items);
      const selected = new Set(value);
      const matched = parts.filter(p => itemSet.has(p) && !selected.has(p));
      const unmatched = parts.filter(p => !itemSet.has(p));
      if (matched.length > 0) {
        onChange([...value, ...matched]);
      }
      setInput(unmatched.join(', '));
      setOpen(unmatched.length > 0);
    }
  };

  const handleRemove = (item) => {
    onChange(value.filter(v => v !== item));
  };

  const handleClearAll = () => {
    onChange([]);
    setInput('');
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Selected tags */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
          {value.map((v, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 7px', fontSize: 11, borderRadius: 4,
              background: C.navy, color: C.white, whiteSpace: 'nowrap',
            }}>
              {v}
              <X size={11} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={() => handleRemove(v)} />
            </span>
          ))}
          <button onClick={handleClearAll} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.textLight, fontSize: 10, padding: '2px 4px',
          }}>全解除</button>
        </div>
      )}

      {/* Input */}
      <input
        type="text"
        value={input}
        onChange={handleInputChange}
        onPaste={handlePaste}
        onFocus={() => setOpen(true)}
        placeholder={value.length > 0 ? '追加...' : placeholder}
        style={{
          width: '100%', padding: '6px 8px', border: `1px solid ${C.border}`,
          borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box',
        }}
      />

      {/* Dropdown */}
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
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.offWhite}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
