// ============================================================
// マネタイズ領域診断 ナレッジベース（固定データ）
// ----------------------------------------------------------------
// 第2回診断エンジンが参照する「整備済み固定ナレッジ」。
// ・MONETIZATION_DOMAINS … マネタイズ領域（6種＋フリーランス副業市場）
// ・INDUSTRIES           … 業界（痛み・AI活用余地・フリーランス参入性・フォーム営業相性）
// ・DOMAIN_INDUSTRY_AFFINITY … 領域×業界の相性補正（任意・未指定は中立3）
//
// スコアはいずれも 1〜5（5が最良）。フォーム営業を基本とするため
// formSalesFit（業界がフォーム営業で開拓しやすいか）を持たせている。
// 仮定値（商談化率・受注率など）はこの初期エンジンには持たせない。
// ============================================================

// ── マネタイズ領域 ───────────────────────────────────────────
// freelanceAccessibility: 個人/フリーランスが構造的に参入しやすいか（1-5）
// aiLeverage:             AIで提供価値・生産性を高めやすいか（1-5）
// unitPriceRange:         単発 or 月額の目安（税別・円）。表示用
// presentation:           主な「見せ方」の型
// meetingNeed:            オンライン商談の必要度（none=不要 / light=軽め・要調整 / required=必須）
export const MONETIZATION_DOMAINS = [
  {
    id: 'content_sales', label: 'コンテンツ販売',
    freelanceAccessibility: 5, aiLeverage: 5, meetingNeed: 'none',
    unitPriceRange: { min: 3000, max: 100000, unit: '本' },
    presentation: '専門テーマの教材・ノウハウを発信し信頼で売る',
    summary: '自分の知見・経験を教材化して売る。フルオートのマーケティングなら商談なしでも完結できる。在庫リスクなし・利益率が高い一方、集客と発信の継続力が要る。',
    bestFor: ['発信が好き', '体系化が得意', '特定領域の経験がある'],
  },
  {
    id: 'affiliate', label: 'アフィリエイト',
    freelanceAccessibility: 5, aiLeverage: 4, meetingNeed: 'none',
    unitPriceRange: { min: 1000, max: 50000, unit: '成果' },
    presentation: '顔出しなしのSNS/記事で送客し成果報酬を得る',
    summary: '他社商品を紹介し成果報酬を得る。顔出し・商談なしで完結できる。低リスクだが収益化まで時間がかかり、検索/SNSの設計力が要る。',
    bestFor: ['リサーチが好き', 'コツコツ積み上げられる', '顔出ししたくない'],
  },
  {
    id: 'ops_agency', label: '運用代行',
    freelanceAccessibility: 4, aiLeverage: 4, meetingNeed: 'light',
    unitPriceRange: { min: 50000, max: 300000, unit: '月' },
    presentation: '「成果は出したいが手が回らない」企業の運用を巻き取る',
    summary: 'SNS・広告・MA等の運用を月額で代行。継続課金で安定。多くは商談・顔出しなしでも進むが、案件によっては顔合わせが要る（要調整）。',
    bestFor: ['手を動かすのが苦でない', '改善のPDCAが好き'],
  },
  {
    id: 'consulting', label: 'コンサルティング',
    freelanceAccessibility: 3, aiLeverage: 3, meetingNeed: 'required',
    unitPriceRange: { min: 100000, max: 500000, unit: '月' },
    presentation: '実績・専門性を背景に、戦略と意思決定を支援する',
    summary: '専門知見で課題解決を支援。商談・対話が前提で単価は高い。実績と信頼の積み上げが必要。',
    bestFor: ['特定領域で実績がある', '人に教える・整理するのが得意', '商談ができる'],
  },
  {
    id: 'tool_sales', label: 'ツール販売',
    freelanceAccessibility: 4, aiLeverage: 5, meetingNeed: 'none',
    unitPriceRange: { min: 1000, max: 30000, unit: '本/月' },
    presentation: '業務の面倒を解く小さなツール/テンプレ/GPTsを売る',
    summary: 'テンプレ・GPTs・小規模SaaS等をオンライン販売。商談なしで完結できる。AIで作りやすくなったが、刺さる課題選定が肝。',
    bestFor: ['仕組み化が好き', '小さく作って試せる'],
  },
  {
    id: 'dev', label: '受託開発',
    freelanceAccessibility: 3, aiLeverage: 4, meetingNeed: 'required',
    unitPriceRange: { min: 200000, max: 2000000, unit: '案件' },
    presentation: '要件を形にする実装力で、業務システム/Webを請ける',
    summary: 'AI受託など直案件は商談で要件をすり合わせる前提。単価は高いが、技術力と要件定義力が必要。AIで生産性は大きく向上。',
    bestFor: ['実装が好き', '要件を整理して形にできる', '商談ができる'],
  },
  // ── フリーランス副業市場（参入しやすい領域） ──
  {
    id: 'design', label: 'デザイン制作',
    freelanceAccessibility: 4, aiLeverage: 4, meetingNeed: 'light',
    unitPriceRange: { min: 10000, max: 200000, unit: '案件' },
    presentation: 'バナー/資料/ブランドの「伝わる見た目」を作る',
    summary: 'バナー・LP・資料・ロゴ等。需要安定。多くはテキストやり取りで進むが、要件次第で軽い打合せが入る。',
    bestFor: ['視覚表現が好き', '細部にこだわれる'],
  },
  {
    id: 'web_production', label: 'Web/LP制作',
    freelanceAccessibility: 4, aiLeverage: 4, meetingNeed: 'light',
    unitPriceRange: { min: 80000, max: 600000, unit: '案件' },
    presentation: 'ノーコード/コードでサイト・LPを作り集客に貢献',
    summary: 'コーポレート/LP/EC構築。成果（CV）まで語れると単価が上がる。要件ヒアリングで軽い打合せが入ることが多い。',
    bestFor: ['作って完成させるのが好き', 'マーケ視点を持てる'],
  },
  {
    id: 'online_assistant', label: 'オンライン秘書/事務代行',
    freelanceAccessibility: 5, aiLeverage: 4, meetingNeed: 'light',
    unitPriceRange: { min: 30000, max: 150000, unit: '月' },
    presentation: '経営者/個人事業主の事務・調整・運用を巻き取る',
    summary: '事務/リサーチ/調整代行。参入容易で継続課金。やり取りは必要だが商談負荷は軽い。AIで効率化し複数社を持てると伸びる。',
    bestFor: ['段取り・調整が得意', '人のサポートが好き'],
  },
  {
    id: 'form_sales_agency', label: 'フォーム営業代行',
    freelanceAccessibility: 5, aiLeverage: 5, meetingNeed: 'light',
    unitPriceRange: { min: 50000, max: 300000, unit: '月' },
    presentation: '問い合わせフォーム経由でリード獲得を代行する',
    summary: 'フォーム営業でアポ/リードを供給。実務は商談不要だが、クライアント獲得時に軽い商談が入る。AIで文面・リスト精度を高めやすく、本講座とも相性が良い。',
    bestFor: ['仮説検証が好き', '数をこなして改善できる'],
  },
  {
    id: 'ai_enablement', label: 'AIコンサルタント',
    freelanceAccessibility: 4, aiLeverage: 5, meetingNeed: 'required',
    unitPriceRange: { min: 100000, max: 800000, unit: '案件/月' },
    presentation: '現場の面倒をAI/自動化で解き、定着まで伴走する',
    summary: '生成AI導入・GPTs/RPA・自動化構築を支援。商談で課題をヒアリングし提案する前提。需要急増中で、現場理解と実装/運用設計が価値の源泉。',
    bestFor: ['新しいツールを試すのが好き', '業務改善に燃える', '商談ができる'],
  },
];

// ── 業界 ─────────────────────────────────────────────────────
// pains:                 現場の代表的な痛み（ネット情報＋現場知見ベース）
// aiOpportunity:         AIによる業務効率化/人手代替の余地（1-5）
// freelanceAccessibility: フリーランス/個人が入り込みやすいか（1-5）
// formSalesFit:          フォーム営業で接点を作りやすいか（1-5）
// unitPriceFeel:         発注単価の体感（低/中/高）
export const INDUSTRIES = [
  {
    id: 'saas_it', label: 'SaaS/IT',
    pains: ['採用難でリソース不足', 'コンテンツ/マーケ運用が回らない', '解約率改善・オンボーディング工数'],
    aiOpportunity: 5, freelanceAccessibility: 5, formSalesFit: 4, unitPriceFeel: '中',
    note: 'デジタル耐性が高く外注に慣れている。フリーランス需要が最も厚い。',
  },
  {
    id: 'care', label: '介護',
    pains: ['深刻な人手不足', '記録・請求などの事務負担', '採用・定着難', 'IT化の遅れ'],
    aiOpportunity: 4, freelanceAccessibility: 3, formSalesFit: 3, unitPriceFeel: '低〜中',
    note: '人手不足が構造的で自動化余地大。ITリテラシーは低めで丁寧な伴走が要る。',
  },
  {
    id: 'construction', label: '建設',
    pains: ['職人の高齢化・人手不足', '見積/書類作成の煩雑さ', '集客がアナログ', '2024年問題の工数'],
    aiOpportunity: 4, freelanceAccessibility: 3, formSalesFit: 4, unitPriceFeel: '中',
    note: 'アナログ業務が多く効率化余地大。現場理解があると一気に刺さる。',
  },
  {
    id: 'manufacturing', label: '製造業',
    pains: ['属人化・技能伝承', '生産管理/在庫の非効率', '販路拡大の苦手', 'DX人材不足'],
    aiOpportunity: 4, freelanceAccessibility: 3, formSalesFit: 4, unitPriceFeel: '中〜高',
    note: '中小製造の販路開拓・DX需要。専門性があると単価が高い。',
  },
  {
    id: 'primary', label: '一次産業（農林水産）',
    pains: ['後継者不足', '販路/ブランディング弱', '価格決定力が弱い', 'IT化の遅れ'],
    aiOpportunity: 3, freelanceAccessibility: 3, formSalesFit: 2, unitPriceFeel: '低',
    note: '販路/EC/ブランディング支援に余地。補助金活用が鍵。フォーム営業は届きにくい。',
  },
  {
    id: 'logistics', label: '物流',
    pains: ['ドライバー不足・2024年問題', '配車/在庫の非効率', '受発注のアナログさ'],
    aiOpportunity: 4, freelanceAccessibility: 3, formSalesFit: 4, unitPriceFeel: '中',
    note: '人手不足と効率化圧力が強い。自動化/業務改善の余地大。',
  },
  {
    id: 'realestate', label: '不動産',
    pains: ['集客のアナログさ', '反響対応の遅さ', '物件資料/接客の属人化'],
    aiOpportunity: 4, freelanceAccessibility: 4, formSalesFit: 4, unitPriceFeel: '中',
    note: '広告/集客/接客自動化の需要。発注に積極的でフォーム営業も通りやすい。',
  },
  {
    id: 'food', label: '飲食',
    pains: ['人手不足', '販促/SNSが回らない', '原価高騰', '予約/オペ管理'],
    aiOpportunity: 3, freelanceAccessibility: 4, formSalesFit: 3, unitPriceFeel: '低',
    note: '店舗単位は予算小だが数が多い。SNS/集客支援は入りやすい。',
  },
  {
    id: 'beauty', label: '美容/サロン',
    pains: ['集客競争の激化', 'リピート/予約管理', 'SNS運用の負担'],
    aiOpportunity: 3, freelanceAccessibility: 4, formSalesFit: 3, unitPriceFeel: '低〜中',
    note: 'SNS/予約/集客支援に余地。個人店が多く意思決定が速い。',
  },
  {
    id: 'shigyo', label: '士業（税理士/社労士等）',
    pains: ['定型業務の工数', '新規集客が苦手', '価格競争'],
    aiOpportunity: 4, freelanceAccessibility: 4, formSalesFit: 4, unitPriceFeel: '中',
    note: '定型業務の自動化・Web集客に余地。発注予算があり堅い。',
  },
  {
    id: 'ec', label: 'EC/小売',
    pains: ['広告費高騰・CPA悪化', 'CRM/リピート設計', 'コンテンツ制作量'],
    aiOpportunity: 5, freelanceAccessibility: 5, formSalesFit: 4, unitPriceFeel: '中',
    note: '運用代行・制作・CRMの需要が厚く、成果が数字で示しやすい。',
  },
  {
    id: 'medical', label: '医療/クリニック',
    pains: ['予約/問診の効率', '集患のWeb化', '事務負担'],
    aiOpportunity: 4, freelanceAccessibility: 3, formSalesFit: 3, unitPriceFeel: '中〜高',
    note: '規制配慮は要るが予算は堅い。Web集患/業務効率化に余地。',
  },
  {
    id: 'education', label: '教育/スクール',
    pains: ['集客とLTV', 'コンテンツ制作', '運営の属人化'],
    aiOpportunity: 4, freelanceAccessibility: 5, formSalesFit: 4, unitPriceFeel: '中',
    note: 'コンテンツ/集客/運用代行の需要。AIと相性が良く参入しやすい。',
  },
];

// ── 領域×業界の相性補正（1-5、未指定は中立 3） ─────────────────
// 「その領域がその業界で特に効くか」をピンポイントで上書きしたいときのみ記載。
export const DOMAIN_INDUSTRY_AFFINITY = {
  ai_enablement: { care: 5, construction: 5, manufacturing: 5, logistics: 5, shigyo: 5, medical: 4 },
  ops_agency: { ec: 5, beauty: 4, food: 4, realestate: 4, saas_it: 4 },
  form_sales_agency: { saas_it: 5, realestate: 4, shigyo: 4, manufacturing: 4 },
  content_sales: { education: 5 },
  web_production: { realestate: 4, food: 4, beauty: 4, medical: 4 },
  consulting: { manufacturing: 4, saas_it: 4, medical: 4 },
};

// 便利な索引
export const DOMAIN_BY_ID = MONETIZATION_DOMAINS.reduce((a, d) => { a[d.id] = d; return a; }, {});
export const INDUSTRY_BY_ID = INDUSTRIES.reduce((a, d) => { a[d.id] = d; return a; }, {});

export function domainIndustryAffinity(domainId, industryId) {
  const row = DOMAIN_INDUSTRY_AFFINITY[domainId];
  if (row && typeof row[industryId] === 'number') return row[industryId];
  return 3; // 中立
}
