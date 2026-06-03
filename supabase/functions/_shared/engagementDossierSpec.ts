// =====================================================================
// engagement 別「アポ詳細レポート (CompanyDossierPanel)」AI 生成 spec
//   - フロント側 src/types/engagementDossierSpec.js と内容を同期させること
//   - generate-company-dossier Edge Function から呼び出してプロンプト切替
// =====================================================================

export interface DossierAiSpec {
  axisLabel: string                  // 「M&A」「SaaS」「資産運用」など
  newsSectionLabel: string           // 「同業界のM&Aニュース」「同業界の採用市場動向」など
  newsDealTypes: string[]            // ニュース deal_type 候補
  industryTrendFocus: string         // AI に渡す「○○の文脈」
  memoExtractionGuide: string        // MASP メモ 3 項目を抽出するための指示
  newsSearchSites: string[]          // web_search で site:絞り込みする候補ドメイン
}

const DEFAULT_SPEC: DossierAiSpec = {
  axisLabel: 'M&A',
  newsSectionLabel: '同業界のM&Aニュース',
  newsDealTypes: ['M&A', 'TOB', '資本業務提携', '事業譲渡', '子会社化'],
  industryTrendFocus: 'M&A・事業承継・資本提携の文脈',
  memoExtractionGuide:
    '- personality: 社長(キーマン)のお人柄、性格、コミュニケーションスタイル\n' +
    '- meeting_exp: 過去にM&A仲介会社や金融機関とM&A面談を行った経験の有無\n' +
    '- future_consider: 将来的なM&A (売却/事業承継) を検討する可能性',
  newsSearchSites: ['ma-cp.com', 'strike-ma.co.jp', 'nikkei.com', 'diamond.jp'],
}

const SPECS_BY_SLUG: Record<string, DossierAiSpec> = {
  seller_sourcing: DEFAULT_SPEC,

  matching: {
    axisLabel: 'M&A',
    newsSectionLabel: '同業界のM&A・買収ニュース',
    newsDealTypes: ['M&A', '買収', '資本業務提携', '子会社化'],
    industryTrendFocus: 'M&A 買収・PMI・資本提携の文脈',
    memoExtractionGuide:
      '- personality: 担当者の人柄、判断スタイル\n' +
      '- meeting_exp: 過去の買収・出資実績、PMI 経験\n' +
      '- future_consider: 今後の買収方針・関心領域・予算感',
    newsSearchSites: ['ma-cp.com', 'strike-ma.co.jp', 'nikkei.com', 'diamond.jp'],
  },

  lead_generation_saas: {
    axisLabel: 'SaaS',
    newsSectionLabel: '同業界のSaaS導入トレンド',
    newsDealTypes: ['SaaS導入', 'DX事例', 'プロダクト改修', '業務効率化'],
    industryTrendFocus: 'SaaS 導入・DX 推進の文脈',
    memoExtractionGuide:
      '- personality: 担当者の人柄、ITリテラシー、意思決定スピード\n' +
      '- meeting_exp: 既に使っている SaaS / 運用上の課題\n' +
      '- future_consider: 導入検討時期、予算感、決裁者プロセス',
    newsSearchSites: ['itmedia.co.jp', 'nikkei.com', 'businessinsider.jp', 'techcrunch.com'],
  },

  lead_generation_ifa: {
    axisLabel: '資産運用',
    newsSectionLabel: '同業界の資産運用市場動向',
    newsDealTypes: ['資産運用', 'ファンド', 'IFAビジネス', 'プライベートバンキング'],
    industryTrendFocus: '富裕層資産運用・IFA ビジネスの文脈',
    memoExtractionGuide:
      '- personality: ご本人の人柄、リスク許容度、投資経験\n' +
      '- meeting_exp: 現在の資産運用状況 (銘柄、商品、金融機関)\n' +
      '- future_consider: 今後の運用方針、相談時期希望',
    newsSearchSites: ['nikkei.com', 'diamond.jp', 'toyokeizai.net', 'gentosha-go.com'],
  },

  lead_generation_jinzai: {
    axisLabel: '採用',
    newsSectionLabel: '同業界の採用市場動向',
    newsDealTypes: ['採用', '人事制度', '組織変革', '人材戦略'],
    industryTrendFocus: '人材採用・組織開発の文脈',
    memoExtractionGuide:
      '- personality: 担当者の人柄、組織観\n' +
      '- meeting_exp: 現在の採用課題、過去の採用実績 (人数/職種)\n' +
      '- future_consider: 今後の採用計画、予算感、開始時期',
    newsSearchSites: ['nikkei.com', 'jinjibu.jp', 'business.nikkei.com', 'hrpro.co.jp'],
  },

  client_acquisition: {
    axisLabel: '提携',
    newsSectionLabel: '同業界の提携・協業動向',
    newsDealTypes: ['提携', '協業', 'パートナーシップ', '業務提携'],
    industryTrendFocus: '事業提携・パートナーシップの文脈',
    memoExtractionGuide:
      '- personality: 担当者の人柄、意思決定スタイル\n' +
      '- meeting_exp: 現在の協業先、過去のパートナーシップ\n' +
      '- future_consider: 今後の提携方針、検討時期',
    newsSearchSites: ['nikkei.com', 'diamond.jp', 'toyokeizai.net'],
  },
}

SPECS_BY_SLUG.client_acquisition_saas = SPECS_BY_SLUG.client_acquisition
SPECS_BY_SLUG.client_acquisition_ifa = SPECS_BY_SLUG.client_acquisition
SPECS_BY_SLUG.client_acquisition_jinzai = SPECS_BY_SLUG.client_acquisition

export function getDossierAiSpec(slug: string | null | undefined): DossierAiSpec {
  if (!slug) return DEFAULT_SPEC
  return SPECS_BY_SLUG[slug] || DEFAULT_SPEC
}

export const DEFAULT_DOSSIER_AI_SPEC = DEFAULT_SPEC
