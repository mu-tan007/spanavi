import { color, space, radius, font } from '../../../constants/design';

export function fmtRecallAt(date, time) {
  if (!date) return '—';
  const t = (time || '00:00').slice(0, 5);
  const d = date.slice(5).replace('-', '/');
  return `${d} ${t}`;
}

export function fmtOverdue(days) {
  if (days == null) return '—';
  if (days < 1) return `${Math.round(days * 24)}時間`;
  return `${Math.floor(days)}日`;
}

export const STATUS_BADGE = {
  '受付再コール':   { variant: 'info', label: '受付' },
  'キーマン再コール': { variant: 'warn', label: 'キーマン' },
  'キーマン不在':    { variant: 'neutral', label: 'キーマン不在' },
  '不通':            { variant: 'neutral', label: '不通' },
  '受付ブロック':    { variant: 'danger', label: '受付ブロック' },
};

export function KPI({ label, value, muted = false }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold, letterSpacing: 0.4 }}>{label}</div>
      <div style={{
        fontSize: font.size.lg, fontWeight: font.weight.bold,
        color: muted ? color.textLight : color.navy,
        fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
      }}>{value}</div>
    </div>
  );
}

export function FilterButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold,
      cursor: 'pointer', transition: 'all 0.12s', fontFamily: font.family.sans,
      ...(active
        ? { background: color.navy, color: color.white, border: `1px solid ${color.navy}` }
        : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = color.gray50; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = color.white; }}
    >{children}</button>
  );
}

export function PanelHeader({ title, description, leftKpi, rightKpi }) {
  return (
    <div style={{
      padding: '14px 18px', background: color.white, borderRadius: radius.md,
      border: `1px solid ${color.border}`, marginBottom: space[3],
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[2] }}>
        <div>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>{title}</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          {leftKpi}
          {rightKpi}
        </div>
      </div>
    </div>
  );
}

export function FilterBar({ children }) {
  return (
    <div style={{
      display: 'flex', gap: space[2.5], marginBottom: space[3], flexWrap: 'wrap', alignItems: 'center',
      padding: '12px 16px', background: color.white, borderRadius: radius.md,
      border: `1px solid ${color.border}`,
    }}>
      {children}
    </div>
  );
}

// 業種×時間帯接続率スコア (0-100) を色分けして表示
export function ScoreCell({ score }) {
  const v = Number(score) || 0;
  let bg = color.gray100;
  let fg = color.textLight;
  if (v >= 15) { bg = '#FFFBEB'; fg = '#92670A'; }
  else if (v >= 8) { bg = '#EFF6FF'; fg = '#1E40AF'; }
  else if (v > 0) { bg = '#F3F4F6'; fg = '#374151'; }
  return (
    <span style={{
      display: 'inline-block', minWidth: 48, padding: '2px 10px', borderRadius: radius.pill,
      fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
      fontWeight: font.weight.bold, fontSize: font.size.xs,
      background: bg, color: fg, textAlign: 'center',
    }}>{v.toFixed(1)}%</span>
  );
}

// engagement slug → 日本語ラベル (3種) — 純関数。Hookではない
export function salesAgencyEngagementOptions(allEngagements) {
  const order = ['seller_sourcing', 'matching', 'client_acquisition'];
  const label = { seller_sourcing: '売り手ソーシング', matching: '買い手マッチング', client_acquisition: 'クライアント開拓' };
  return (allEngagements || [])
    .filter(e => order.includes(e.slug))
    .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug))
    .map(e => ({ id: e.id, slug: e.slug, name: label[e.slug] || e.name }));
}
