// Spanavi カラーパレット（既存デザイン準拠）
export const C = {
  navy: '#1a2332',
  navyLight: '#243044',
  navyMid: '#1e2d3d',
  dark: '#111927',
  gold: '#c8a45a',
  goldLight: '#d4b76e',
  white: '#ffffff',
  offWhite: '#f0ece4',
  textMain: '#e8e0d0',
  textMid: '#a0a8b4',
  textLight: '#6a7380',
  green: '#2d8a4e',
  greenLight: '#34a853',
  red: '#c0392b',
  redLight: '#e74c3c',
  orange: '#e67e22',
  blue: '#3498db',
  border: '#2a3a4a',
  borderLight: '#3a4a5c',
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
