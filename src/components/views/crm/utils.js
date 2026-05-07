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
  { key: 'status', width: 100, align: 'left' },
  { key: 'company', width: 240, align: 'left' },
  { key: 'industry', width: 80, align: 'left' },
  { key: 'target', width: 70, align: 'center' },
  { key: 'reward', width: 100, align: 'left' },
  { key: 'list', width: 80, align: 'left' },
  { key: 'calendar', width: 80, align: 'left' },
  { key: 'contact', width: 80, align: 'left' },
  { key: 'lastTouch', width: 90, align: 'center' },
  { key: 'primaryContact', width: 130, align: 'left' },
];

export const CRM_COLS_EDIT = [...CRM_COLS_BASE, { key: 'edit', width: 32, align: 'center' }];

export const CRM_COL_LABELS = ['ステータス','企業名','業界','目標','報酬体系','リスト','カレンダー','連絡','最終接点','主担当'];
