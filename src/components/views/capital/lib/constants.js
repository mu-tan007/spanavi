export const DEAL_STATUSES = [
  { value: 'nn_review',       label: 'NN精査',      color: '#F8F8F8' },
  { value: 'im_review',       label: 'IM精査',      color: '#c8dcf0' },
  { value: 'top_meeting',     label: 'トップ面談',  color: '#032D60' },
  { value: 'loi_prep',        label: 'LOI準備',     color: '#032D60' },
  { value: 'dd',              label: 'DD実施',      color: '#0f3060' },
  { value: 'spa_negotiation', label: 'SPA・最終交渉', color: '#032D60' },
  { value: 'stop',            label: 'ストップ',    color: '#e8b88a' },
  { value: 'break',           label: 'ブレイク',    color: '#F0B4B4' },
]

export const DEAL_SOURCE_TYPES = [
  { value: 'intermediary', label: '仲介会社' },
  { value: 'fa',           label: 'FA' },
  { value: 'self',         label: '自社ソーシング' },
  { value: 'platform',     label: 'プラットフォーム' },
]

export const PRIORITY_LABELS = {
  1: { label: '高', color: '#032D60' },
  2: { label: '中', color: '#032D60' },
  3: { label: '低', color: '#9fbedd' },
}

// Pipeline / Decision Queue

export const NEXT_STAGE = {
  nn_review:       'im_review',
  im_review:       'top_meeting',
  top_meeting:     'loi_prep',
  loi_prep:        'dd',
  dd:              'spa_negotiation',
  spa_negotiation: null,
}

export const STAGE_AGE_THRESHOLDS = {
  nn_review:       7,
  im_review:       14,
  top_meeting:     10,
  loi_prep:        14,
  dd:              30,
  spa_negotiation: 21,
}

export const STAGE_PROBABILITY = {
  nn_review:       0.05,
  im_review:       0.15,
  top_meeting:     0.30,
  loi_prep:        0.50,
  dd:              0.70,
  spa_negotiation: 0.90,
}

export const RECOMMENDATION_RULES = {
  pursueMin: 75,
  passMax:   45,
}

export const RECOMMENDATION_STYLE = {
  PURSUE: { label: 'PURSUE推奨', bg: '#e4f0e4', color: '#2E844A' },
  PASS:   { label: 'PASS推奨',   bg: '#FAECE7', color: '#EA001E' },
  HOLD:   { label: 'HOLD推奨',   bg: '#fff4e0', color: '#8a5010' },
}

