import { useState, useRef, useEffect } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';

// 検索可能な複数選択ドロップダウン
// props:
//   label, placeholder, options (string[]), values (string[]), onChange (string[] => void)
export default function MultiSelectDropdown({
  label, placeholder = '選択',
  options = [], values = [], onChange,
  width = 240,
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const toggle = (v) => {
    if (values.includes(v)) onChange(values.filter(x => x !== v));
    else onChange([...values, v]);
  };

  const summary = values.length === 0
    ? placeholder
    : values.length === 1 ? values[0]
    : `${values.length} 件選択中`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'inline-flex', alignItems: 'center', gap: space[1],
        padding: '5px 10px', borderRadius: radius.md,
        border: `1px solid ${values.length > 0 ? color.navy : color.border}`,
        background: values.length > 0 ? alpha(color.navy, 0.06) : color.white,
        color: values.length > 0 ? color.navy : color.textMid,
        fontSize: font.size.xs, fontWeight: font.weight.semibold,
        fontFamily: font.family.sans, cursor: 'pointer',
        minWidth: width,
      }}>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label && <span style={{ color: color.textLight, fontWeight: font.weight.medium, marginRight: 4 }}>{label}:</span>}
          {summary}
        </span>
        <span style={{ fontSize: 10, color: color.textLight }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
          background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.md, boxShadow: shadow.lg,
          minWidth: width + 60, maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: space[2], borderBottom: `1px solid ${color.borderLight}`, display: 'flex', gap: space[1], alignItems: 'center' }}>
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="検索…" autoFocus
              style={{
                flex: 1, padding: '4px 8px', border: `1px solid ${color.border}`, borderRadius: radius.sm,
                fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, outline: 'none',
              }}
            />
            {values.length > 0 && (
              <button onClick={() => onChange([])} style={{
                padding: '4px 8px', border: 'none', background: 'transparent',
                color: color.danger, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, cursor: 'pointer',
              }}>クリア</button>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: space[3], textAlign: 'center', color: color.textLight, fontSize: font.size.xs }}>該当なし</div>
            ) : (
              filtered.map(opt => {
                const checked = values.includes(opt);
                return (
                  <label key={opt} style={{
                    display: 'flex', alignItems: 'center', gap: space[2],
                    padding: '6px 12px', cursor: 'pointer',
                    background: checked ? alpha(color.navy, 0.06) : 'transparent',
                    fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans,
                  }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = color.gray50; }}
                  onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(opt)}
                      style={{ width: 14, height: 14, accentColor: color.navy, cursor: 'pointer' }} />
                    <span>{opt}</span>
                  </label>
                );
              })
            )}
          </div>
          {values.length > 0 && (
            <div style={{
              padding: '6px 12px', borderTop: `1px solid ${color.borderLight}`,
              fontSize: 10, color: color.textLight, fontFamily: font.family.mono, textAlign: 'right',
            }}>
              {values.length} / {options.length} 件選択中
            </div>
          )}
        </div>
      )}
    </div>
  );
}
