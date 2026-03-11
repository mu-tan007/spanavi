// Spanavi カラーパレット（ブルーテーマ）
export const C = {
  navy: '#032D60',        // ダークネイビー（ナビ背景）
  navyLight: '#0176D3',   // プライマリブルー
  navyMid: '#014486',     // ミドルブルー
  dark: '#021B40',        // 最深部ネイビー
  gold: '#C8A84B',        // ゴールド（ブランドアクセント）
  goldLight: '#D4BB6A',
  white: '#ffffff',
  offWhite: '#F3F2F2',    // ページ背景
  textMain: '#ffffff',    // 暗背景上のテキスト
  textMid: '#A8C4E0',     // 暗背景上のサブテキスト
  textLight: '#706E6B',   // 明背景上のサブテキスト
  green: '#2E844A',
  greenLight: '#4CAF70',
  red: '#EA001E',
  redLight: '#FF4D4D',
  orange: '#FFB75D',
  blue: '#0176D3',        // プライマリブルー
  border: '#1A4E8A',      // 暗背景上のボーダー
  borderLight: '#2A6CC4', // 暗背景上の明ボーダー
}

// 架電結果ステータス
export const CALL_STATUSES = [
  { key: '不通', label: '不通', color: C.textMid, description: '電話がつながらなかった' },
  { key: '除外', label: '除外', color: C.red, description: '対象外・架電不要' },
  { key: '社長不在', label: '社長不在', color: C.orange, description: '社長がいなかった' },
  { key: '受付ブロック', label: '受付ブロック', color: C.orange, description: '受付で断られた' },
  { key: '受付再コール', label: '受付再コール', color: C.blue, description: '後日電話してほしいと言われた' },
  { key: '社長再コール', label: '社長再コール', color: C.blue, description: '社長から再度電話の指示' },
  { key: 'アポ獲得', label: 'アポ獲得', color: C.green, description: 'アポイント取得成功' },
  { key: '社長お断り', label: '社長お断り', color: C.redLight, description: '社長本人から断られた' },
]

// ユーザーロール
export const USER_ROLES = {
  admin: '管理者',
  manager: 'マネージャー',
  caller: 'アポインター',
}

// ユーザーティア
export const USER_TIERS = {
  trainee: 'Trainee',
  spartan: 'Spartan',
  hyper_spartan: 'Hyper Spartan',
  super_spartan: 'Super Spartan',
}
