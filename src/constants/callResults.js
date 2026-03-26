// ============================================================
// 架電ステータス定数（全コンポーネント共通・唯一のデフォルト定義）
// org_settings の call_statuses が未設定の場合のフォールバック
// ============================================================
export const CALL_RESULTS = [
  { id: 'missed',           label: '不通',         excluded: false, color: '#6B7280', bg: '#6B728018', desc: '電話がつながらなかった',       ceo_connect: false },
  { id: 'absent',           label: '社長不在',     excluded: false, color: '#6B7280', bg: '#6B728018', desc: '社長が外出中',                 ceo_connect: false },
  { id: 'reception_block',  label: '受付ブロック', excluded: false, color: '#6B7280', bg: '#6B728018', desc: '受付に断られた',               ceo_connect: false },
  { id: 'reception_recall', label: '受付再コール', excluded: false, color: '#2563EB', bg: '#2563EB18', desc: '後日電話してほしいと言われた', ceo_connect: false },
  { id: 'ceo_recall',       label: '社長再コール', excluded: false, color: '#2563EB', bg: '#2563EB18', desc: '社長から再度電話の指示',       ceo_connect: true  },
  { id: 'appointment',      label: 'アポ獲得',     excluded: true,  color: '#0D2247', bg: '#0D224710', desc: 'アポイント取得成功',           ceo_connect: true  },
  { id: 'ceo_decline',      label: '社長お断り',   excluded: false, color: '#6B7280', bg: '#6B728018', desc: '社長本人から断られた',         ceo_connect: true  },
  { id: 'excluded',         label: '除外',         excluded: true,  color: '#e53835', bg: '#e5383510', desc: '対象外・架電不要',             ceo_connect: false },
];
