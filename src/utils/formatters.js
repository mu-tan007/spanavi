// 日付フォーマット（JST明示）
export function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 短い日付（JST明示）
export function formatDateShort(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  })
}

// 数値カンマ区切り
export function formatNumber(num) {
  if (num == null) return '-'
  return num.toLocaleString()
}

// 金額表示（円単位）
export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '—';
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
};
