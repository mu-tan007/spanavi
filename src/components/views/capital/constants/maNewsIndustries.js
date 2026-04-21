export const MA_NEWS_INDUSTRIES = [
  { key: 'it',            label: 'IT・ソフトウェア' },
  { key: 'manufacturing', label: '製造業' },
  { key: 'retail',        label: '小売・EC' },
  { key: 'healthcare',    label: '医療・ヘルスケア' },
  { key: 'finance',       label: '金融・保険' },
  { key: 'realestate',    label: '建設・不動産' },
  { key: 'food',          label: '食品・外食' },
  { key: 'logistics',     label: '運輸・物流' },
  { key: 'energy',        label: 'エネルギー・資源' },
  { key: 'media',         label: 'メディア・エンタメ' },
  { key: 'hr',            label: '人材・サービス' },
  { key: 'education',     label: '教育' },
  { key: 'other',         label: 'その他' },
]

export const INDUSTRY_LABEL_MAP = Object.fromEntries(
  MA_NEWS_INDUSTRIES.map(i => [i.key, i.label])
)
