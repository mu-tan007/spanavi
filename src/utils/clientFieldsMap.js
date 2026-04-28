// AI が返す DB 名 → CRMView / addForm が使う FE キーへの対応表
export const CLIENT_DB_TO_FE = {
  status: 'status',
  contract_status: 'contract',
  industry: 'industry',
  supply_target: 'target',
  reward_type: 'rewardType',
  payment_site: 'paySite',
  payment_note: 'payNote',
  list_source: 'listSrc',
  calendar_type: 'calendar',
  contact_method: 'contact',
  client_email: 'clientEmail',
  google_calendar_id: 'googleCalendarId',
  scheduling_url: 'schedulingUrl',
  notes: 'noteFirst',
  note_kickoff: 'noteKickoff',
  note_regular: 'noteRegular',
  name: 'company',
};

export const CLIENT_FIELD_LABELS = {
  status: 'ステータス',
  contract: '契約',
  industry: '業界',
  target: '月間目標',
  rewardType: '報酬体系',
  paySite: '支払サイト',
  payNote: '支払特記',
  listSrc: 'リスト負担',
  calendar: 'カレンダー',
  contact: '連絡手段',
  clientEmail: 'メールアドレス',
  googleCalendarId: 'Google Calendar ID',
  schedulingUrl: '日程調整 URL',
  noteFirst: '備考（初回面談時）',
  noteKickoff: '備考（キックオフ時）',
  noteRegular: '備考（定期 MTG 時）',
  company: '企業名',
};

// AI 抽出結果 (DB-style) → FE-style パッチに変換
export function dbFieldsToFe(dbFields) {
  if (!dbFields || typeof dbFields !== 'object') return {};
  const out = {};
  Object.entries(dbFields).forEach(([dbKey, val]) => {
    const feKey = CLIENT_DB_TO_FE[dbKey];
    if (!feKey) return;
    if (val === null || val === undefined || val === '') return;
    out[feKey] = val;
  });
  return out;
}
