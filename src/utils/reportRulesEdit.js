// 顧客管理の「聞くこと・条件」の編集（report_rules の1行＝クライアント／担当者／リストの1段）
// 画面の入力を保存の形に整える。既存の key・ask・options はそのまま残す。

export const ITEM_TYPES = [
  { value: 'text', label: '文字' },
  { value: 'number_oku', label: '金額（億円）' },
  { value: 'number_people', label: '人数' },
  { value: 'select', label: '選択肢' },
];
export const CHECK_FIELDS = [
  { value: '', label: '確認だけ' },
  { value: 'revenue_oku', label: '売上（億円）で判定' },
  { value: 'employees', label: '従業員（人）で判定' },
];
export const CHECK_OPS = [
  { value: '<=', label: '以下' },
  { value: '<', label: '未満' },
  { value: '>=', label: '以上' },
];

export function newKey(prefix = 'k') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** 選択肢の入力（、や , 区切り）を配列に */
export function parseOptions(text) {
  return String(text || '').split(/[、,，\n]/).map(s => s.trim()).filter(Boolean);
}

/** 保存の形へ。空の行は捨てる。数字の条件は値が数字のときだけ判定を付ける */
export function toStorage({ items = [], conditions = [], note = '' }) {
  const outItems = items
    .filter(it => String(it.label || '').trim())
    .map(it => {
      const o = { key: it.key || newKey('i'), label: it.label.trim(), type: it.type || 'text', required: !!it.required, ask: it.ask !== false };
      if (o.type === 'select') o.options = Array.isArray(it.options) ? it.options : parseOptions(it.optionsText);
      return o;
    });
  const outConds = conditions
    .filter(c => String(c.label || '').trim())
    .map(c => {
      const o = { key: c.key || newKey('c'), label: c.label.trim() };
      const v = Number(c.check?.value);
      if (c.check?.field && c.check.value !== '' && c.check.value != null && !Number.isNaN(v)) o.check = { field: c.check.field, op: c.check.op || '<=', value: v };
      if (c.note) o.note = c.note;
      return o;
    });
  return { items: outItems, conditions: outConds, note: String(note || '').trim() || null };
}

export function isEmptyRule(r) {
  return (!r.items || r.items.length === 0) && (!r.conditions || r.conditions.length === 0) && !r.note;
}

/** 報告の本文にどう入るかの見本 */
export function previewReportBlock(items = []) {
  const lines = items.filter(it => String(it.label || '').trim()).map(it => {
    const unit = it.type === 'number_oku' ? '億円' : it.type === 'number_people' ? '人' : '';
    return `${it.label.trim()}：（架電で聞いた値）${unit}`;
  });
  return lines.length ? `【ヒアリング】\n${lines.join('\n')}` : '';
}

/** 段の名前（一覧・タブに出す） */
export function scopeLabel(row, { contacts = [], lists = [] } = {}) {
  if (row.list_id) return `リスト：${lists.find(l => l._supaId === row.list_id)?.industry || '（名前なし）'}`;
  if (row.contact_id) return `担当者：${contacts.find(c => c.id === row.contact_id)?.name || '（不明）'} 様`;
  return 'この会社の全リスト';
}
