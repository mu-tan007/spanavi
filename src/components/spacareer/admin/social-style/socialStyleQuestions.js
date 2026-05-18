// ============================================================
// ソーシャルスタイル診断 30問素案
// ----------------------------------------------------------------
// Merrill & Reid (1981) のソーシャルスタイル理論に基づく素案。
// 「主張度（Assertiveness：聞く ⇔ 述べる）」と
// 「情緒度（Responsiveness：抑制 ⇔ 表出）」の2軸を測定し、
// 4タイプ（analytical / driver / expressive / amiable）に分類する。
//
//   主張度 高 + 情緒度 低 = driver        （行動推進型）
//   主張度 高 + 情緒度 高 = expressive    （感情表現型）
//   主張度 低 + 情緒度 低 = analytical    （論理分析型）
//   主張度 低 + 情緒度 高 = amiable       （協調共感型）
//
// 各設問は4タイプいずれかに 1 票投じる構造。最終的に最多得票タイプを採用する。
// 5段階リッカート（1=全く当てはまらない 〜 5=非常に当てはまる）で回答。
// 配点：選択値 3 を中立とし、(value - 3) を該当タイプに加算する。
//
// 本ファイルは初期 seed としても、テンプレマスタ
// （spacareer_templates.template_type='social_style_questions'）の
// 既定値としても利用される。運営はテンプレ管理画面で書き換え可。
// ============================================================

export const SOCIAL_STYLE_QUESTIONS = [
  // ---- driver（行動推進型）: 主張度高 + 情緒度低 ----
  { id: 1,  type: 'driver',     text: '結論を素早く出し、迷わず意思決定する方だ' },
  { id: 2,  type: 'driver',     text: '会議では自分の意見を遠慮なく主張する' },
  { id: 3,  type: 'driver',     text: 'プロセスより結果・成果を重視する' },
  { id: 4,  type: 'driver',     text: '雑談より本題に入る方が落ち着く' },
  { id: 5,  type: 'driver',     text: '目標達成のために他者を強くリードしている' },
  { id: 6,  type: 'driver',     text: '時間配分には厳しく、無駄な議論を嫌う' },
  { id: 7,  type: 'driver',     text: '人の意見より、自分の判断を優先しがちだ' },
  { id: 8,  type: 'driver',     text: '困難な状況でも前進し続けるのが好きだ' },

  // ---- expressive（感情表現型）: 主張度高 + 情緒度高 ----
  { id: 9,  type: 'expressive', text: '新しいアイデアを思いつくと、すぐ周囲に共有したくなる' },
  { id: 10, type: 'expressive', text: '人前で話すことや注目を浴びることは苦にならない' },
  { id: 11, type: 'expressive', text: '感情や熱意をストレートに表現する' },
  { id: 12, type: 'expressive', text: '雑談から新しい関係性を作るのが得意だ' },
  { id: 13, type: 'expressive', text: '楽観的で、未来は良くなると信じている' },
  { id: 14, type: 'expressive', text: '同じ作業の繰り返しは退屈に感じる' },
  { id: 15, type: 'expressive', text: 'チームのムードメーカー的な役割を担うことが多い' },

  // ---- amiable（協調共感型）: 主張度低 + 情緒度高 ----
  { id: 16, type: 'amiable',    text: '相手の気持ちや表情の変化に気づきやすい' },
  { id: 17, type: 'amiable',    text: '対立を避け、できる限り穏便に物事を進めたい' },
  { id: 18, type: 'amiable',    text: '人の話は最後までじっくり聞く方だ' },
  { id: 19, type: 'amiable',    text: 'チームの和を保つことを重要だと考える' },
  { id: 20, type: 'amiable',    text: '困っている人がいたら自分から手助けしたくなる' },
  { id: 21, type: 'amiable',    text: '急な変化や決断を迫られると気疲れする' },
  { id: 22, type: 'amiable',    text: '自分の主張より、相手の意向を優先することが多い' },

  // ---- analytical（論理分析型）: 主張度低 + 情緒度低 ----
  { id: 23, type: 'analytical', text: '判断する前に、データや根拠を必ず確認する' },
  { id: 24, type: 'analytical', text: '感情よりも論理で物事を考える方だ' },
  { id: 25, type: 'analytical', text: '計画や手順を緻密に組み立ててから動きたい' },
  { id: 26, type: 'analytical', text: '正確さや細部へのこだわりが強い' },
  { id: 27, type: 'analytical', text: '初対面の相手と打ち解けるには時間がかかる' },
  { id: 28, type: 'analytical', text: '即断より、選択肢を比較してから決めたい' },
  { id: 29, type: 'analytical', text: '感情を表に出すよりも、冷静さを保ちたい' },
  { id: 30, type: 'analytical', text: 'リスクや想定外の事態を事前に洗い出しておきたい' },
];

// 4タイプの説明テキスト（運営内部含む全項目）
export const SOCIAL_STYLE_DESCRIPTIONS = {
  analytical: {
    label: '論理分析型',
    headline: 'データと論理で判断する慎重な思考家',
    summary: '情報を緻密に集め、論理的に分析してから動くタイプ。正確さ・体系性を重んじ、感情よりも事実で判断する。',
    strengths: ['緻密な計画力', '客観的な分析力', '冷静で安定した判断', '専門性の深さ'],
    cautions: ['即断が苦手で機会を逃すことがある', '感情表現が控えめで距離を感じられやすい', '完璧主義に陥りやすい'],
    coach_tips: ['結論より過程を丁寧に説明する', '根拠データを揃えてから提案する', '感情よりロジックで対話する', '即決を迫らない'],
  },
  driver: {
    label: '行動推進型',
    headline: '結果と推進力を最優先する実行者',
    summary: '意思決定が早く、目標達成に向けて強くリードするタイプ。プロセスより成果、雑談より本題を好む。',
    strengths: ['推進力と決断力', '目標達成志向', '効率重視で時間を無駄にしない', '困難を恐れない'],
    cautions: ['指示が強く周囲を萎縮させやすい', '感情面への配慮が後回しになりがち', '対立を生みやすい'],
    coach_tips: ['結論ファーストで話す', '選択肢と数値を提示し本人に決めさせる', '時間を区切って端的に', '雑談を引きずらない'],
  },
  expressive: {
    label: '感情表現型',
    headline: 'アイデアと熱意でチームを動かす発信者',
    summary: 'オープンで熱量が高く、アイデアを次々と発信するタイプ。人との関係構築や場を盛り上げることに長ける。',
    strengths: ['発想力と発信力', '人を巻き込む力', '楽観性と前向きさ', '関係構築の早さ'],
    cautions: ['細部の詰めや継続が苦手', '気分のムラが出やすい', '注目を求めすぎる傾向'],
    coach_tips: ['共感とリアクションを多めに', 'ビジョンや未来像で動機づける', '細かい管理より対話で前進させる', '雑談の余白を残す'],
  },
  amiable: {
    label: '協調共感型',
    headline: 'チームの調和と相手への寄り添いを大切にする伴走者',
    summary: '相手の感情に敏感で、対立を避け穏便に物事を進めるタイプ。聞き上手で、人の支援に喜びを感じる。',
    strengths: ['共感力と傾聴力', 'チームの安心感を作る', '信頼関係の構築', '穏やかさ'],
    cautions: ['意思決定が遅くなりがち', '自己主張が弱く損をしやすい', '急な変化に弱い'],
    coach_tips: ['急かさず安心感を作る', '感謝や承認を言葉で伝える', '本人の意向を聞いてから提案する', '対立を煽らず合意形成を丁寧に'],
  },
};

// ----- 採点ロジック -----
// answers: [{ question_id, value: 1..5 }]
// 戻り値: { type, scores: { analytical, driver, expressive, amiable } }
export function scoreSocialStyle(answers) {
  const scores = { analytical: 0, driver: 0, expressive: 0, amiable: 0 };
  if (!Array.isArray(answers)) return { type: null, scores };
  const qMap = new Map(SOCIAL_STYLE_QUESTIONS.map(q => [q.id, q]));
  for (const a of answers) {
    const q = qMap.get(a.question_id);
    if (!q) continue;
    const v = Number(a.value);
    if (!Number.isFinite(v)) continue;
    scores[q.type] += (v - 3); // 3=中立を基準にズレを加算
  }
  let bestType = null;
  let bestVal = -Infinity;
  for (const t of Object.keys(scores)) {
    if (scores[t] > bestVal) { bestVal = scores[t]; bestType = t; }
  }
  return { type: bestType, scores };
}
