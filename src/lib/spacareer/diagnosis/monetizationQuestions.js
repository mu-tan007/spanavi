// ============================================================
// マネタイズ領域診断 設問セット（40分・セクション制）
// ----------------------------------------------------------------
// 各設問は dimension タグを持ち、エンジンが回答を領域/業界/強み/資源スコアへ
// 機械的に集計できるようにしている。
//
// type:
//   'rating' … 1〜5（scaleId が指す5段階ラベル）
//   'single' … 選択肢から1つ
//   'multi'  … 選択肢から複数
//
// dimension（エンジンが解釈するキー）:
//   { kind:'domain_interest', domain }      … 領域への「やってみたい/面白そう」度（最重視）
//   { kind:'strength', axis }               … 強み4軸（execution/influencing/relationship/strategic）
//   { kind:'industry_expertise', industry } … 業界の詳しさ・経験
//   { kind:'presentation', tag }            … 見せ方・発信スタイルの傾向
//   { kind:'resource', key }                … 稼働時間・志向などの制約
// ============================================================

import { MONETIZATION_DOMAINS, INDUSTRIES } from './monetizationKnowledgeBase';

export const RATING_SCALES = {
  interest: [
    { value: 1, label: '全くやりたくない' },
    { value: 2, label: 'あまり惹かれない' },
    { value: 3, label: 'どちらでもない' },
    { value: 4, label: 'やってみたい' },
    { value: 5, label: 'すごくワクワクする' },
  ],
  familiarity: [
    { value: 1, label: '全く知らない' },
    { value: 2, label: '少し知っている' },
    { value: 3, label: 'ある程度わかる' },
    { value: 4, label: '実務経験がある' },
    { value: 5, label: '人に教えられる' },
  ],
  agree: [
    { value: 1, label: '全く当てはまらない' },
    { value: 2, label: 'あまり当てはまらない' },
    { value: 3, label: 'どちらでもない' },
    { value: 4, label: 'やや当てはまる' },
    { value: 5, label: '非常に当てはまる' },
  ],
};

export const SECTIONS = [
  { id: 'interest', label: '興味・モチベーション', desc: '「面白そう」「やってみたい」という感情を最優先で測ります。直感でお答えください。' },
  { id: 'strength', label: '強み', desc: 'あなたが自然に発揮できる力を測ります。' },
  { id: 'industry', label: '業界の経験・専門性', desc: 'どの業界に詳しいか・関わったことがあるかを測ります。' },
  { id: 'presentation', label: '見せ方・発信スタイル', desc: 'どんな形で価値を届けたいかを測ります。' },
  { id: 'resource', label: '使える時間・スタンス', desc: '無理なく続けられる前提条件を確認します。' },
];

// ── Section A: 領域への興味（13問・最重視） ──
const interestQuestions = MONETIZATION_DOMAINS.map((d, i) => ({
  id: `interest_${d.id}`,
  section: 'interest',
  type: 'rating',
  scaleId: 'interest',
  text: `「${d.label}」をやってみたいと感じますか？`,
  hint: d.summary,
  dimension: { kind: 'domain_interest', domain: d.id },
}));

// ── Section B: 強み（8問・4軸×2） ──
const strengthQuestions = [
  { axis: 'execution', text: '決めたことを最後までやり切るのが得意だ' },
  { axis: 'execution', text: '地道な作業もコツコツ継続できる' },
  { axis: 'influencing', text: '人を巻き込んだり、説得するのが得意だ' },
  { axis: 'influencing', text: '自分の考えを発信・表現するのが好きだ' },
  { axis: 'relationship', text: '相手の気持ちを汲み取り、信頼関係を築くのが得意だ' },
  { axis: 'relationship', text: '人のサポートや調整役になるのが好きだ' },
  { axis: 'strategic', text: '物事を構造化し、戦略的に考えるのが得意だ' },
  { axis: 'strategic', text: '新しい情報を集めて分析するのが好きだ' },
].map((q, i) => ({
  id: `strength_${q.axis}_${i}`,
  section: 'strength',
  type: 'rating',
  scaleId: 'agree',
  text: q.text,
  dimension: { kind: 'strength', axis: q.axis },
}));

// ── Section C: 業界の詳しさ（13問） ──
const industryQuestions = INDUSTRIES.map((ind) => ({
  id: `industry_${ind.id}`,
  section: 'industry',
  type: 'rating',
  scaleId: 'familiarity',
  text: `「${ind.label}」についてどのくらい詳しいですか？`,
  hint: ind.note,
  dimension: { kind: 'industry_expertise', industry: ind.id },
}));

// ── Section D: 見せ方・発信スタイル（3問） ──
const presentationQuestions = [
  {
    id: 'pres_style',
    section: 'presentation',
    type: 'single',
    text: '価値の届け方として、いちばんしっくりくるのは？',
    options: [
      { value: 'broadcast', label: '発信して多くの人に届けたい（教材・記事・動画）' },
      { value: 'handson', label: '手を動かして成果物で貢献したい（制作・運用・開発）' },
      { value: 'advisory', label: '相手に寄り添い課題解決を支援したい（相談・代行・伴走）' },
    ],
    dimension: { kind: 'presentation', tag: 'style' },
  },
  {
    id: 'pres_stockflow',
    section: 'presentation',
    type: 'single',
    text: '理想の収益の形に近いのは？',
    options: [
      { value: 'stock', label: '作った資産が積み上がり、後から効いてくる形' },
      { value: 'flow', label: '動いた分だけ確実に報酬になる形' },
      { value: 'either', label: 'どちらでもよい' },
    ],
    dimension: { kind: 'presentation', tag: 'stockflow' },
  },
  {
    id: 'pres_public',
    section: 'presentation',
    type: 'single',
    text: '顔や名前を出した発信について、どう感じますか？',
    options: [
      { value: 'love', label: '積極的にやりたい' },
      { value: 'ok', label: '必要ならやる' },
      { value: 'avoid', label: 'できれば避けたい' },
    ],
    dimension: { kind: 'presentation', tag: 'public' },
  },
];

// ── Section E: 使える時間・スタンス（4問） ──
const resourceQuestions = [
  {
    id: 'res_time',
    section: 'resource',
    type: 'single',
    text: '副業に使える時間は、週どのくらいですか？',
    options: [
      { value: 'low', label: '〜5時間' },
      { value: 'mid', label: '5〜15時間' },
      { value: 'high', label: '15時間以上' },
    ],
    dimension: { kind: 'resource', key: 'time' },
  },
  {
    id: 'res_speed',
    section: 'resource',
    type: 'single',
    text: 'どちらの立ち上がり方が好みですか？',
    options: [
      { value: 'fast', label: 'まず早く小さく稼ぎ始めたい' },
      { value: 'build', label: '時間をかけても大きく育てたい' },
    ],
    dimension: { kind: 'resource', key: 'speed' },
  },
  {
    id: 'res_skill',
    section: 'resource',
    type: 'multi',
    text: '今、ある程度できることはどれですか？（複数選択可）',
    options: [
      { value: 'writing', label: '文章を書く' },
      { value: 'design', label: 'デザイン/画像編集' },
      { value: 'video', label: '動画編集' },
      { value: 'coding', label: 'プログラミング' },
      { value: 'marketing', label: 'マーケ/SNS運用' },
      { value: 'sales', label: '営業/コミュニケーション' },
      { value: 'ai_tools', label: '生成AIツールの活用' },
      { value: 'none', label: '特になし（これから身につける）' },
    ],
    dimension: { kind: 'resource', key: 'skills' },
  },
  {
    id: 'res_risk',
    section: 'resource',
    type: 'single',
    text: '収入の安定性について、近いのは？',
    options: [
      { value: 'stable', label: '不安定でも上限が高いほうがよい' },
      { value: 'safe', label: '少なくても安定しているほうがよい' },
      { value: 'either', label: 'どちらでもよい' },
    ],
    dimension: { kind: 'resource', key: 'risk' },
  },
];

export const MONETIZATION_QUESTIONS = [
  ...interestQuestions,
  ...strengthQuestions,
  ...industryQuestions,
  ...presentationQuestions,
  ...resourceQuestions,
];

export const TOTAL_QUESTIONS = MONETIZATION_QUESTIONS.length;

export function getScale(scaleId) {
  return RATING_SCALES[scaleId] || RATING_SCALES.agree;
}
