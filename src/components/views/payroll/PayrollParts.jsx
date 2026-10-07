import './PayrollParts.css';

// 報酬ページの部品（2026-10-07 むー様確認の見本どおり）

export function PayrollFlow({ monthLabel, flow }) {
  return (
    <div className="pr-card pr-flow">
      <div className="pr-flow-l"><span className="pr-lbl">{monthLabel}分の進み</span><b>{flow.headline}</b></div>
      {flow.steps.map(s => (
        <div key={s.key} className={`pr-st ${s.state}`}><b className="pr-num">{s.sub}</b>{s.label}</div>
      ))}
    </div>
  );
}

const man = (yen) => (Math.round((yen || 0) / 1000) / 10).toLocaleString();

export function PayrollKpis({ total, sales, payees, submitted }) {
  const ratio = sales ? Math.round((total / sales) * 1000) / 10 : 0;
  return (
    <div className="pr-kpi">
      <div className="pr-card pr-k"><span className="pr-lbl">支給の合計</span><div className="pr-v pr-num">{man(total)}<small>万円</small></div><div className="pr-s">{payees}名</div></div>
      <div className="pr-card pr-k"><span className="pr-lbl">売上の合計</span><div className="pr-v pr-num">{man(sales)}<small>万円</small></div><div className="pr-s">報酬の対象になる面談済アポ</div></div>
      <div className="pr-card pr-k"><span className="pr-lbl">売上に対する支給</span><div className="pr-v pr-num">{ratio}<small>%</small></div><div className="pr-s">インセンティブ・役職ボーナス・紹介・調整の合計</div></div>
      <div className="pr-card pr-k"><span className="pr-lbl">請求書</span><div className="pr-v pr-num">{submitted}<small>/ {payees}人</small></div><div className="pr-s">{payees - submitted > 0 ? `出していない ${payees - submitted}人` : 'そろった'}</div></div>
    </div>
  );
}

export const PARTS = [
  { key: 'incentive', label: 'インセンティブ', cls: 'c1' },
  { key: 'teamBonus', label: '役職ボーナス', cls: 'c2' },
  { key: 'referral', label: '紹介', cls: 'c3' },
  { key: 'adjustment', label: '調整', cls: 'c4' },
];

/** 支給の内わけの帯。幅は一番多い人を100%に。マイナスの調整は帯に入れず、数字で添える */
export function PayBar({ parts, max }) {
  const pos = PARTS.map(p => ({ ...p, v: Math.max(0, parts[p.key] || 0) })).filter(p => p.v > 0);
  const sum = pos.reduce((t, p) => t + p.v, 0);
  if (!sum) return <span className="pr-none">—</span>;
  const neg = Math.min(0, parts.adjustment || 0);
  return (
    <span className="pr-barwrap">
      <span className="pr-stack" style={{ width: `${Math.max(4, (sum / max) * 100)}%` }}
        title={PARTS.map(p => `${p.label} ${(parts[p.key] || 0).toLocaleString()}円`).join(' ／ ')}>
        {pos.map(p => <i key={p.key} className={p.cls} style={{ width: `${(p.v / sum) * 100}%` }} />)}
      </span>
      {neg < 0 && <span className="pr-neg pr-num">−¥{Math.abs(neg).toLocaleString()}</span>}
    </span>
  );
}

export function PayLegend() {
  return <span className="pr-lg">{PARTS.map(p => <span key={p.key}><i className={p.cls} />{p.label}</span>)}</span>;
}
