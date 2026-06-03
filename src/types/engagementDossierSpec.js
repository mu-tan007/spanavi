// =====================================================================
// engagement 別「アポ詳細レポート (CompanyDossierPanel)」の spec
//   - セクション名 (M&A ニュース など)
//   - MASP メモ 3 項目ラベル
//   - AI 生成プロンプト (Edge Function 側でも参照)
// =====================================================================
//
// 既存 DB スキーマ (content.masp_memo.{personality, meeting_exp, future_consider})
// と互換性を保つため、フィールドキーは共通のまま、ラベルだけ engagement 別に変える。
//   personality     : 共通で「担当者のお人柄/温度感」
//   meeting_exp     : engagement 固有 (M&A 面談経験 / 現在の運用状況 / 既存ツール 等)
//   future_consider : engagement 固有 (将来検討 / 検討時期 / 採用予定 等)
//
// engagement.slug ベースで spec を引く。マッチしない場合は default (M&A 売り手) を使う。

const DEFAULT_SPEC = {
  axisLabel:        'M&A',                              // セクション「同業界の○○ニュース」の○○
  newsSectionLabel: '同業界のM&Aニュース',
  newsDealTypes:    ['M&A', 'TOB', '資本業務提携', '事業譲渡'],
  maspMemoLabels: {
    personality:     '社長のお人柄',
    meeting_exp:     'M&A面談経験の有無',
    future_consider: '将来的なM&A検討可否',
  },
  // AI 生成プロンプト用のテーマ
  aiTheme: {
    industryTrendFocus: 'M&A・事業承継・資本提携の文脈',
    memoExtractionGuide:
      '- personality: 社長(キーマン)のお人柄、性格、コミュニケーションスタイル\n' +
      '- meeting_exp: 過去にM&A仲介会社や金融機関とM&A面談を行った経験の有無\n' +
      '- future_consider: 将来的なM&A (売却/事業承継) を検討する可能性',
  },
};

const SPECS_BY_SLUG = {
  // M&A 売り手ソーシング = デフォルト
  seller_sourcing: DEFAULT_SPEC,

  // M&A 買い手マッチング
  matching: {
    axisLabel:        'M&A',
    newsSectionLabel: '同業界のM&Aニュース',
    newsDealTypes:    ['M&A', '買収', '資本業務提携'],
    maspMemoLabels: {
      personality:     '担当者のお人柄',
      meeting_exp:     '過去の買収・出資実績',
      future_consider: '今後の買収方針・対象領域',
    },
    aiTheme: {
      industryTrendFocus: 'M&A 買収・PMI・資本提携の文脈',
      memoExtractionGuide:
        '- personality: 担当者の人柄、判断スタイル\n' +
        '- meeting_exp: 過去の買収・出資実績、PMI 経験\n' +
        '- future_consider: 今後の買収方針・関心領域・予算感',
    },
  },

  // SaaS リード獲得
  lead_generation_saas: {
    axisLabel:        'SaaS',
    newsSectionLabel: '同業界のSaaS導入トレンド',
    newsDealTypes:    ['SaaS導入', 'DX事例', 'プロダクト改修'],
    maspMemoLabels: {
      personality:     '担当者の温度感',
      meeting_exp:     '既存ツール / 運用課題',
      future_consider: '導入検討時期 / 予算感',
    },
    aiTheme: {
      industryTrendFocus: 'SaaS 導入・DX 推進の文脈',
      memoExtractionGuide:
        '- personality: 担当者の人柄、ITリテラシー、意思決定スピード\n' +
        '- meeting_exp: 既に使っている SaaS / 運用上の課題\n' +
        '- future_consider: 導入検討時期、予算感、決裁者プロセス',
    },
  },

  // IFA リード獲得
  lead_generation_ifa: {
    axisLabel:        '資産運用',
    newsSectionLabel: '同業界の資産運用市場動向',
    newsDealTypes:    ['資産運用', 'ファンド', 'IFAビジネス'],
    maspMemoLabels: {
      personality:     '担当者のお人柄 / 資産観',
      meeting_exp:     '現在の資産運用状況',
      future_consider: '今後の運用方針 / 検討時期',
    },
    aiTheme: {
      industryTrendFocus: '富裕層資産運用・IFA ビジネスの文脈',
      memoExtractionGuide:
        '- personality: ご本人の人柄、リスク許容度、投資経験\n' +
        '- meeting_exp: 現在の資産運用状況 (銘柄、商品、金融機関)\n' +
        '- future_consider: 今後の運用方針、相談時期希望',
    },
  },

  // 人材リード獲得
  lead_generation_jinzai: {
    axisLabel:        '採用',
    newsSectionLabel: '同業界の採用市場動向',
    newsDealTypes:    ['採用', '人事制度', '組織変革'],
    maspMemoLabels: {
      personality:     '担当者のお人柄',
      meeting_exp:     '現在の採用課題 / 採用実績',
      future_consider: '今後の採用計画 / 予算感',
    },
    aiTheme: {
      industryTrendFocus: '人材採用・組織開発の文脈',
      memoExtractionGuide:
        '- personality: 担当者の人柄、組織観\n' +
        '- meeting_exp: 現在の採用課題、過去の採用実績 (人数/職種)\n' +
        '- future_consider: 今後の採用計画、予算感、開始時期',
    },
  },

  // クライアント開拓系 (共通テーマ)
  client_acquisition: {
    axisLabel:        '提携',
    newsSectionLabel: '同業界の提携・協業動向',
    newsDealTypes:    ['提携', '協業', 'パートナーシップ'],
    maspMemoLabels: {
      personality:     '担当者のお人柄',
      meeting_exp:     '現在の協業状況 / 過去の取引',
      future_consider: '今後の提携方針 / 検討時期',
    },
    aiTheme: {
      industryTrendFocus: '事業提携・パートナーシップの文脈',
      memoExtractionGuide:
        '- personality: 担当者の人柄、意思決定スタイル\n' +
        '- meeting_exp: 現在の協業先、過去のパートナーシップ\n' +
        '- future_consider: 今後の提携方針、検討時期',
    },
  },
};

// SaaS/IFA/人材 配下のクライアント開拓も共通仕様に向ける
SPECS_BY_SLUG.client_acquisition_saas   = SPECS_BY_SLUG.client_acquisition;
SPECS_BY_SLUG.client_acquisition_ifa    = SPECS_BY_SLUG.client_acquisition;
SPECS_BY_SLUG.client_acquisition_jinzai = SPECS_BY_SLUG.client_acquisition;

// engagement の slug から spec を引く。null/未定義は DEFAULT。
export function getDossierSpecBySlug(slug) {
  if (!slug) return DEFAULT_SPEC;
  return SPECS_BY_SLUG[slug] || DEFAULT_SPEC;
}

// engagement.type ベースのフォールバック解決 (slug が無い場合)
export function getDossierSpecByType(type) {
  if (!type) return DEFAULT_SPEC;
  if (type === 'matching') return SPECS_BY_SLUG.matching;
  if (type === 'client_acquisition') return SPECS_BY_SLUG.client_acquisition;
  // seller_sourcing 系 (M&A売り手 + 各種リード獲得) はデフォルトに寄せる
  // (より厳密に分けるには slug が必要)
  return DEFAULT_SPEC;
}

export const DEFAULT_DOSSIER_SPEC = DEFAULT_SPEC;
