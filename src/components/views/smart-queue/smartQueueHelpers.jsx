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

export function PanelHeader({ title, leftKpi, rightKpi }) {
  return (
    <div style={{
      padding: '14px 18px', background: color.white, borderRadius: radius.md,
      border: `1px solid ${color.border}`, marginBottom: space[3],
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[2] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>{title}</div>
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

// 詳細条件抽出/業種×ステータスで選択可能な8ステータス + 未架電
export const ALL_STATUSES = [
  '未架電', '不通', 'キーマン不在', '受付ブロック',
  '受付再コール', 'キーマン再コール', 'キーマン断り', '問い合わせフォーム',
];

export const PREFECTURES_JP = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

export const TSR_INDUSTRY_MAJORS = [
  'A 農業、林業','B 漁業','C 鉱業、採石業、砂利採取業',
  'D 建設業','E 製造業','F 電気・ガス・熱供給・水道業',
  'G 情報通信業','H 運輸業、郵便業','I 卸売業、小売業',
  'J 金融業、保険業','K 不動産業、物品賃貸業',
  'L 学術研究、専門・技術サービス業','M 宿泊業、飲食サービス業',
  'N 生活関連サービス業、娯楽業','O 教育、学習支援業',
  'P 医療、福祉','Q 複合サービス事業','R サービス業（他に分類されないもの）',
];

// 売上 千円 → 表示用「○億○千万」
export function fmtRevenueK(k) {
  if (k == null) return '—';
  if (k >= 1_000_000) return `${(k / 1_000_000).toFixed(1)}十億円`;
  if (k >= 100_000)   return `${(k / 100_000).toFixed(1)}億円`;
  if (k >= 1_000)     return `${(k / 1_000).toFixed(0)}百万円`;
  return `${k}千円`;
}

// 億円 → 千円換算 (入力UIから RPC 引数へ変換)
export function okuToK(oku) {
  const n = Number(oku);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100_000);
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
