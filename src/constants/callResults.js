// ============================================================
// 架電ステータス定数（全コンポーネント共通）
// ============================================================
export const CALL_RESULTS = [
  { id: 'missed',           label: '不通',         excluded: false },
  { id: 'absent',           label: '社長不在',     excluded: false },
  { id: 'reception_block',  label: '受付ブロック', excluded: false },
  { id: 'reception_recall', label: '受付再コール', excluded: false },
  { id: 'ceo_recall',       label: '社長再コール', excluded: false },
  { id: 'appointment',      label: 'アポ獲得',     excluded: true  },
  { id: 'ceo_decline',      label: '社長お断り',   excluded: false },
  { id: 'excluded',         label: '除外',         excluded: true  },
];
