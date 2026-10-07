import { color, radius, font, alpha } from '../../constants/design';

// アポ取得報告の登録前の検査結果（utils/appoReportChecks）を、保存ボタンの上に出す。
// 赤＝直すまで登録できない／黄＝確かめたらチェックを入れて登録できる
export default function AppoReportChecks({ issues, ack, onAck }) {
  if (!issues || issues.length === 0) return null;
  const errors = issues.filter(i => i.level === 'error');
  const warns = issues.filter(i => i.level === 'warn');
  const row = (i, k) => (
    <li key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: font.size.xs, lineHeight: 1.6, color: i.level === 'error' ? color.danger : color.textDark }}>
      <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: i.level === 'error' ? color.danger : color.warn, transform: 'translateY(-1px)' }} />
      {i.msg}
    </li>
  );
  return (
    <div style={{ margin: '0 20px 8px', padding: '8px 12px', borderRadius: radius.md, border: `1px solid ${errors.length ? alpha(color.danger, 0.35) : alpha(color.warn, 0.45)}`, background: errors.length ? alpha(color.danger, 0.05) : alpha(color.warn, 0.08) }}>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: errors.length ? color.danger : color.textDark, marginBottom: 4 }}>
        {errors.length ? `登録の前に直すところが${errors.length}つあります` : '登録の前に確かめてください'}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {errors.map(row)}
        {warns.map((w, k) => row(w, 'w' + k))}
      </ul>
      {errors.length === 0 && warns.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!ack} onChange={e => onAck(e.target.checked)} />
          確かめました（このまま登録する）
        </label>
      )}
    </div>
  );
}

export function canRegister(issues, ack) {
  if (!issues) return true;
  if (issues.some(i => i.level === 'error')) return false;
  if (issues.some(i => i.level === 'warn') && !ack) return false;
  return true;
}
