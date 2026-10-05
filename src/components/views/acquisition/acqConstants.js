// 買収タブ（管理者のみ）の定義。値は DB の check 制約（20261006100000_acquisition_tab.sql）と揃える。

// 配信を受けただけの案件は載せない（むー様 2026-10-06）。弊社から関心を伝えてやり取りを始めたものだけ。
export const STAGES = [
  { value: 'received', label: '受領', variant: 'default', open: true },
  { value: 'nda', label: 'NDA', variant: 'info', open: true },
  { value: 'im_received', label: 'IM受領', variant: 'info', open: true },
  { value: 'qa', label: 'QA中', variant: 'info', open: true },
  { value: 'top_meeting', label: 'トップ面談', variant: 'primary', open: true },
  { value: 'loi_submitted', label: 'LOI提出', variant: 'primary', open: true },
  { value: 'basic_agreement', label: '基本合意', variant: 'warn', open: true },
  { value: 'dd', label: 'DD', variant: 'warn', open: true },
  { value: 'definitive_agreement', label: '最終契約', variant: 'warn', open: true },
  { value: 'closed_won', label: 'クロージング', variant: 'success', open: false },
  { value: 'declined_by_us', label: '見送り（弊社）', variant: 'neutral', open: false },
  { value: 'lost', label: '不成約（先方）', variant: 'danger', open: false },
  { value: 'name_clear_denied', label: 'ネームクリア不可', variant: 'neutral', open: false },
];
export const STAGE_BY_VALUE = Object.fromEntries(STAGES.map(s => [s.value, s]));
export const stageLabel = (v) => STAGE_BY_VALUE[v]?.label || '—';
export const isOpenStage = (v) => STAGE_BY_VALUE[v]?.open ?? true;
// トップ面談以上まで進んだか（集計用）
export const TOP_MEETING_OR_LATER = ['top_meeting', 'loi_submitted', 'basic_agreement', 'dd', 'definitive_agreement', 'closed_won'];

export const FIRM_KINDS = [
  { value: 'intermediary', label: '仲介' },
  { value: 'buy_side_fa', label: '買い手側FA' },
  { value: 'sell_side_fa', label: '売り手側FA' },
  { value: 'platform', label: 'マッチングサイト' },
  { value: 'public', label: '公的機関' },
  { value: 'other', label: 'その他' },
];
export const firmKindLabel = (v) => FIRM_KINDS.find(k => k.value === v)?.label || '—';

export const CHANNELS = [
  { value: 'intro', label: '個別の紹介' },
  { value: 'broadcast', label: '配信' },
  { value: 'self', label: '自社ソーシング' },
  { value: 'platform', label: 'マッチングサイト' },
  { value: 'public', label: '公的機関' },
];
export const channelLabel = (v) => CHANNELS.find(k => k.value === v)?.label || '—';

export const PRICE_BASIS = [
  { value: 'unknown', label: '不明' },
  { value: 'equity', label: '株式価値' },
  { value: 'enterprise', label: '企業価値' },
];
export const priceBasisLabel = (v) => PRICE_BASIS.find(k => k.value === v)?.label || '不明';

export const SCHEMES = [
  { value: 'unknown', label: '不明' },
  { value: 'share', label: '株式譲渡' },
  { value: 'business', label: '事業譲渡' },
];
export const schemeLabel = (v) => SCHEMES.find(k => k.value === v)?.label || '不明';

export const DOC_TYPES = [
  { value: 'nonname', label: 'ノンネーム' },
  { value: 'im', label: 'IM' },
  { value: 'qa', label: 'QAリスト' },
  { value: 'financials', label: '決算書・試算表' },
  { value: 'loi', label: 'LOI' },
  { value: 'top_meeting', label: 'トップ面談資料' },
  { value: 'contract', label: '契約書・NDA' },
  { value: 'valuation', label: '価値算定' },
  { value: 'other', label: 'その他' },
];
export const docTypeLabel = (v) => DOC_TYPES.find(k => k.value === v)?.label || 'その他';

export const DOC_DIRECTIONS = [
  { value: 'received', label: '受領' },
  { value: 'sent', label: '弊社から送付' },
  { value: 'internal', label: '社内' },
];
export const docDirectionLabel = (v) => DOC_DIRECTIONS.find(k => k.value === v)?.label || '受領';

export const ACTIVITY_CHANNELS = [
  { value: 'email', label: 'メール' },
  { value: 'line', label: 'LINE' },
  { value: 'phone', label: '電話' },
  { value: 'meeting', label: '面談' },
  { value: 'zoom', label: 'オンライン面談' },
  { value: 'other', label: 'その他' },
];
export const activityChannelLabel = (v) => ACTIVITY_CHANNELS.find(k => k.value === v)?.label || 'その他';

export const CONTACT_CHANNELS = [
  { value: '', label: '—' },
  { value: 'email', label: 'メール' },
  { value: 'line', label: 'LINE' },
  { value: 'phone', label: '電話' },
  { value: 'slack', label: 'Slack' },
  { value: 'other', label: 'その他' },
];

export const DEFENSE_RELATIONS = [
  { value: '', label: '—' },
  { value: 'direct', label: '◎ 防衛との取引あり' },
  { value: 'industry_only', label: '○ 業種のみ該当' },
  { value: 'none', label: '対象外' },
];

// 金額は円で持ち、画面は「億・万」で出す。
export function yen(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(abs >= 1e9 ? 1 : 2).replace(/\.?0+$/, '')}億`;
  if (abs >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}万`;
  return `${n.toLocaleString()}円`;
}

export function priceRange(min, max) {
  if (min == null && max == null) return '—';
  if (min != null && max != null && Number(min) !== Number(max)) return `${yen(min)}〜${yen(max)}`;
  return yen(min ?? max);
}

// 「4.2億」「3,000万」「420000000」などを円に直す。空は null。
export function parseYen(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).replace(/[,，\s円]/g, '');
  if (!s) return null;
  const m = s.match(/^(-?[0-9.]+)(億|万)?$/);
  if (!m) return NaN;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return NaN;
  if (m[2] === '億') return Math.round(n * 1e8);
  if (m[2] === '万') return Math.round(n * 1e4);
  return Math.round(n);
}

export const fmtDate = (d) => (d ? String(d).slice(0, 10).replace(/-/g, '/') : '—');
export const fmtDateTime = (d) => {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  const p = (x) => String(x).padStart(2, '0');
  return `${t.getFullYear()}/${p(t.getMonth() + 1)}/${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
};

export const todayStr = () => {
  const t = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
};
