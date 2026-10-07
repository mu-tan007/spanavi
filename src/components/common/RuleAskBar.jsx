import { useEffect, useState } from 'react';
import { color, radius, font, alpha } from '../../constants/design';
import { fetchReportRules, resolveReportRules } from '../../lib/reportRules';

// 架電ページのスクリプトの上に「このクライアントで必ず聞くこと」を出す（report_rules の ask=true の項目）
export default function RuleAskBar({ list }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchReportRules().then(all => { if (alive) setItems(resolveReportRules(all, list).items.filter(i => i.ask !== false)); });
    return () => { alive = false; };
  }, [list]);
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '6px 10px', marginBottom: 8, borderRadius: radius.md, background: alpha(color.gold, 0.12), border: `1px solid ${alpha(color.gold, 0.45)}` }}>
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>必ず聞くこと</span>
      {items.map(i => (
        <span key={i.key} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: color.white, border: `1px solid ${alpha(color.gold, 0.5)}`, color: color.textDark }}>
          {i.label}{i.required ? '' : '（任意）'}
        </span>
      ))}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: color.textLight }}>アポ報告の入力欄にも出ます</span>
    </div>
  );
}
