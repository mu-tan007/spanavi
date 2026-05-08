import { useState, useRef, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { color, space, radius, font, shadow } from '../../constants/design';
import { Input, Badge } from '../ui';

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
            <Badge
              key={i}
              variant="primary"
              solid
              size="sm"
              style={{ background: color.navy, gap: 2 }}
            >
              {v}
              <X size={11} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={() => handleRemove(v)} />
            </Badge>
          ))}
          <button onClick={handleClearAll} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: color.textLight, fontSize: 10, padding: '2px 4px',
          }}>全解除</button>
        </div>
      )}

      {/* Input */}
      <Input
        size="sm"
        type="text"
        value={input}
        onChange={handleInputChange}
        onPaste={handlePaste}
        onFocus={() => setOpen(true)}
        placeholder={value.length > 0 ? '追加...' : placeholder}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          maxHeight: 240, overflowY: 'auto', boxShadow: shadow.md,
          marginTop: 2,
        }}>
          {filtered.map((item, i) => (
            <div
              key={i}
              onClick={() => handleSelect(item)}
              style={{
                padding: `7px ${space[2.5]}px`, cursor: 'pointer', fontSize: font.size.base,
                borderBottom: i < filtered.length - 1 ? `1px solid ${color.borderLight}` : 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = color.offWhite}
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
