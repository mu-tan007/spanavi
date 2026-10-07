import { color, radius, font, alpha } from '../../constants/design';
import { ruleFieldKey } from '../../lib/reportRules';

// アポ取得報告の中の「このクライアントで聞くこと」（report_rules の items）
export default function RuleFields({ items, form, onChange }) {
  if (!items || items.length === 0) return null;
  const input = { width: '100%', padding: '6px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.sans, background: color.white, boxSizing: 'border-box', color: color.textDark };
  return (
    <div style={{ gridColumn: '1 / -1', padding: '10px 12px', borderRadius: radius.md, border: `1px solid ${alpha(color.gold, 0.5)}`, background: alpha(color.gold, 0.08) }}>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 6 }}>このクライアントで聞くこと（報告に載ります）</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {items.map(it => {
          const k = ruleFieldKey(it.key);
          const v = form[k] ?? '';
          const wide = it.type === 'text';
          return (
            <label key={it.key} style={{ gridColumn: wide ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.textMid }}>{it.label}{it.required && <span style={{ color: color.danger }}> *</span>}</span>
              {it.type === 'select' ? (
                <select value={v} onChange={e => onChange(k, e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                  <option value="">選んでください</option>
                  {(it.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (it.type === 'number_oku' || it.type === 'number_people') ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" step={it.type === 'number_oku' ? '0.1' : '1'} min="0" value={v} onChange={e => onChange(k, e.target.value)} style={{ ...input, flex: 1 }} />
                  <span style={{ fontSize: font.size.xs, color: color.textMid }}>{it.type === 'number_oku' ? '億円' : '人'}</span>
                </span>
              ) : (
                <input type="text" value={v} onChange={e => onChange(k, e.target.value)} style={input} />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
