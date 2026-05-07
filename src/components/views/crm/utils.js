import { C } from '../../../constants/colors';

export const NAVY = '#0D2247';
export const BLUE = '#1E40AF';
export const GRAY_200 = '#E5E7EB';
export const GRAY_50 = '#F8F9FA';
export const GOLD = '#B8860B';

export const STATUS_LIST = ['支援中', '準備中', '停止中', '保留', '中期フォロー', '面談予定'];

export function statusStyle(st) {
  if (st === '支援中') return { bg: C.green + '15', color: C.green, dot: C.green };
  if (st === '準備中') return { bg: C.gold + '15', color: C.gold, dot: C.gold };
  if (st === '停止中') return { bg: '#e5383515', color: '#e53835', dot: '#e53835' };
  if (st === '保留') return { bg: C.textLight + '15', color: C.textLight, dot: C.textLight };
  if (st === '中期フォロー') return { bg: NAVY + '10', color: NAVY, dot: NAVY };
  if (st === '面談予定') return { bg: '#7c3aed15', color: '#7c3aed', dot: '#7c3aed' };
  return { bg: C.textLight + '10', color: C.textLight, dot: C.textLight };
}

// 連絡手段のテキストラベル（絵文字は使わない）
export function contactLabel(ct) {
  if (!ct) return '-';
  if (ct === 'LINE') return 'LINE';
  if (ct === 'Slack') return 'Slack';
  if (ct === 'Chatwork') return 'Chatwork';
  if (ct === 'メール') return 'メール';
  return ct || 'TEL';
}

// 経過日数（"X日前" / 同日 / 14日以上はゴールド字色）
export function lastTouchDisplay(ts) {
  if (!ts) return { label: '-', stale: false };
  const now = Date.now();
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return { label: '-', stale: false };
  const diffMs = now - t;
  if (diffMs < 0) return { label: '本日', stale: false };
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return { label: '本日', stale: false };
  if (days >= 14) return { label: `${days}日前`, stale: true };
  return { label: `${days}日前`, stale: false };
}

export const CRM_COLS_BASE = [
  { key: 'status',         width: 100, align: 'left' },
  { key: 'company',        width: 220, align: 'left' },
  { key: 'lastTouch',      width: 90,  align: 'center' },
  { key: 'primaryContact', width: 130, align: 'left' },
  { key: 'nextContact',    width: 100, align: 'center' },
  { key: 'targetRatio',    width: 100, align: 'center' },
  { key: 'nextAction',     width: 150, align: 'left' },
];

export const CRM_COLS_EDIT = [...CRM_COLS_BASE, { key: 'edit', width: 96, align: 'center' }];

export const CRM_COL_LABELS = ['ステータス','企業名','最終接点','主担当','次回接点予定','目標対比','次のアクション'];

// 当月の 'YYYY-MM' を取得
export function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 中心月の前後の 'YYYY-MM' 配列を生成
export function getMonthRange(centerYM, monthsBefore, monthsAfter) {
  const [y, m] = centerYM.split('-').map(Number);
  const result = [];
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const date = new Date(y, m - 1 + i, 1);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    result.push(`${yy}-${mm}`);
  }
  return result;
}

// 'YYYY-MM' を '5月' 形式に。年が変わるところは '27/1月' のように年も含める
export function formatMonthLabel(ym, prevYm) {
  const [y, m] = ym.split('-');
  const ym2 = m.replace(/^0/, '') + '月';
  if (!prevYm) return `${y.slice(2)}/${ym2}`;
  if (prevYm.slice(0, 4) !== y) return `${y.slice(2)}/${ym2}`;
  return ym2;
}

// 優先度スコア（0〜100）
//   ctx: { lastTouchAt, monthAppoCount, monthTarget, maxMonthTarget }
//   - 規模: 月間目標 / 全クライアント中の最大目標 * 50
//   - 放置: min(放置日数/30, 1) * 30
//   - 進捗遅れ: max(0, 1 - 達成率) * 20
export function priorityScore(client, ctx = {}) {
  const { lastTouchAt, monthAppoCount = 0, monthTarget = 0, maxMonthTarget = 0 } = ctx;

  const sizeScore = maxMonthTarget > 0 ? (monthTarget / maxMonthTarget) * 50 : 0;

  let sinceTouch = 30;
  if (lastTouchAt) {
    const t = new Date(lastTouchAt).getTime();
    if (!Number.isNaN(t)) sinceTouch = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  }
  const idleScore = Math.min(Math.max(sinceTouch, 0) / 30, 1) * 30;

  let lagScore = 0;
  if (monthTarget > 0) {
    const ratio = monthAppoCount / monthTarget;
    lagScore = Math.max(0, 1 - ratio) * 20;
  }

  const total = sizeScore + idleScore + lagScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

// 優先度スコアを色とランク（高/中/低）に変換
export function priorityRank(score) {
  if (score >= 80) return { color: '#DC2626', label: '高' };
  if (score >= 50) return { color: '#B8860B', label: '中' };
  return { color: '#9CA3AF', label: '低' };
}

// ステータス別メールテンプレ（件名・本文）
const EMAIL_TEMPLATES = {
  '面談予定': {
    subjectFor: company => `[${company}様] 面談日程のご相談`,
    bodyFor: (company, contactName) => `${contactName ? contactName + '様' : 'ご担当者様'}

お世話になっております。
M&A ソーシングパートナーズの篠宮です。

${company}様との面談日程について、改めてご相談させてください。
ご都合のよい候補日をいくつかご提示いただけますと幸いです。

何卒よろしくお願いいたします。`,
  },
  '準備中': {
    subjectFor: company => `[${company}様] キックオフ日程のご相談`,
    bodyFor: (company, contactName) => `${contactName ? contactName + '様' : 'ご担当者様'}

お世話になっております。
M&A ソーシングパートナーズの篠宮です。

${company}様のサービス開始に向けたキックオフミーティングの日程について
ご相談させてください。

何卒よろしくお願いいたします。`,
  },
  '支援中': {
    subjectFor: company => `[${company}様] 今月の進捗のご共有`,
    bodyFor: (company, contactName) => `${contactName ? contactName + '様' : 'ご担当者様'}

いつもお世話になっております。
M&A ソーシングパートナーズの篠宮です。

${company}様への今月の架電状況・アポ進捗についてご共有させてください。
詳細は別途資料にてお送りいたします。

何卒よろしくお願いいたします。`,
  },
  '中期フォロー': {
    subjectFor: company => `[${company}様] 近況のご相談`,
    bodyFor: (company, contactName) => `${contactName ? contactName + '様' : 'ご担当者様'}

ご無沙汰しております。
M&A ソーシングパートナーズの篠宮です。

${company}様の近況をお伺いさせてください。
あらためてお力になれることがあればぜひご相談ください。

何卒よろしくお願いいたします。`,
  },
  '保留': {
    subjectFor: company => `[${company}様] サービス再開のご相談`,
    bodyFor: (company, contactName) => `${contactName ? contactName + '様' : 'ご担当者様'}

お世話になっております。
M&A ソーシングパートナーズの篠宮です。

${company}様のサービス再開について、改めてご相談させてください。
ご都合のよろしいお時間をいただけますと幸いです。

何卒よろしくお願いいたします。`,
  },
  '停止中': {
    subjectFor: company => `[${company}様] サービス再開のご相談`,
    bodyFor: (company, contactName) => `${contactName ? contactName + '様' : 'ご担当者様'}

ご無沙汰しております。
M&A ソーシングパートナーズの篠宮です。

サービス再開のお声がけにあがりました。
${company}様の現状をお伺いできればと存じます。

何卒よろしくお願いいたします。`,
  },
};

// メールドラフトを生成して mailto: URL を返す
export function composeEmailDraft(client, primaryContact) {
  const company = client.company || '';
  const contactName = primaryContact?.name || '';
  const to = primaryContact?.email || client.clientEmail || '';
  const tpl = EMAIL_TEMPLATES[client.status] || EMAIL_TEMPLATES['支援中'];
  const subject = tpl.subjectFor(company);
  const body = tpl.bodyFor(company, contactName);
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : null,
    body ? `body=${encodeURIComponent(body)}` : null,
  ].filter(Boolean).join('&');
  return {
    to,
    subject,
    body,
    mailto: `mailto:${to}${params ? '?' + params : ''}`,
  };
}

// CSV 1行をパース（ダブルクォート対応）
export function parseCSVLine(line, sep = ',') {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

// 列名の正規化（揺れに対応）
const HEADER_ALIASES = {
  company: ['会社名', '企業名', '法人名', 'company', 'name'],
  phone: ['電話番号', '電話', 'phone', 'tel', 'telephone'],
  representative: ['代表者', '代表者名', '社長', '代表', 'representative'],
  business: ['事業内容', '業界', '業種', 'business', 'industry'],
  address: ['住所', '所在地', 'address'],
  prefecture: ['都道府県', '県', 'pref', 'prefecture'],
  email: ['メール', 'メールアドレス', 'email', 'mail'],
  website: ['サイト', 'URL', 'website', 'url'],
};

export function detectColumnMapping(rawHeaders) {
  const norm = h => String(h || '').trim().toLowerCase();
  const map = {};
  rawHeaders.forEach((h, idx) => {
    const lh = norm(h);
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      if (map[key] !== undefined) return;
      if (aliases.some(a => norm(a) === lh)) map[key] = idx;
    });
  });
  return map;
}

// CSV テキストを { rows: [{company, phone, ...}], headers, mapping } に変換
export function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headers: [], mapping: {} };
  const headers = parseCSVLine(lines[0]);
  const mapping = detectColumnMapping(headers);
  const rows = lines.slice(1).map((line, i) => {
    const cols = parseCSVLine(line);
    const row = { no: i + 1 };
    Object.entries(mapping).forEach(([key, idx]) => {
      row[key] = (cols[idx] || '').trim();
    });
    return row;
  }).filter(r => r.company);
  return { rows, headers, mapping };
}

// 経過日数をミリ秒差から計算（過去日付ならマイナス、null/不正なら null）
function daysSince(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

// 「次のアクション」自動判定。アクション文字列＋色を返す
//   client: { status, _supaId }
//   ctx: { lastTouchAt, monthAppoCount, currentYM }
export function nextActionFor(client, ctx = {}) {
  const { lastTouchAt, monthAppoCount = 0 } = ctx;
  const status = client.status;
  const sinceTouch = daysSince(lastTouchAt);
  const sinceStatusChange = daysSince(client.statusChangedAt);

  // 1. 「面談予定」で予定日が過去（次回接点予定日が過去になっている）
  const sinceNext = daysSince(client.nextContactAt);
  if (status === '面談予定' && sinceNext !== null && sinceNext > 0) {
    return { label: '商談実施要確認', color: '#DC2626' };
  }

  // 2. 最終接点が30日以上ない（再アプローチ要）
  if (sinceTouch !== null && sinceTouch >= 30) {
    return { label: '要再アプローチ', color: '#DC2626' };
  }

  // 3. 「面談予定」で14日以上動かず（商談化フォロー）
  if (status === '面談予定' && sinceTouch !== null && sinceTouch >= 14) {
    return { label: '商談化フォロー必要', color: '#B8860B' };
  }

  // 4. 「準備中」で30日以上経過（キックオフ調整）
  if (status === '準備中' && sinceStatusChange !== null && sinceStatusChange >= 30) {
    return { label: 'キックオフ調整', color: '#B8860B' };
  }

  // 5. 「支援中」で当月アポ実績ゼロ（進捗確認）
  if (status === '支援中' && monthAppoCount === 0) {
    return { label: '進捗確認', color: '#B8860B' };
  }

  // 6. 最終接点が14日以上ない（メール送信待ち）
  if (sinceTouch !== null && sinceTouch >= 14) {
    return { label: 'メール送信待ち', color: '#B8860B' };
  }

  return { label: '—', color: '#9CA3AF' };
}
