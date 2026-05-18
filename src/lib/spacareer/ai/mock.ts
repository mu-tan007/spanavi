// ============================================================
// スパキャリ AI機能 mock 集約（最小スタブ）
// 仕様書: tasks/spacareer-spec.md §8 AI機能
// ----------------------------------------------------------------
// エージェント #6 が本物の Claude / Whisper 呼び出しを別ファイル
// （minutes.ts / homework30.ts / strength.ts ...）で提供する。
// 画面側はこの mock を import し、本実装に差し替える際は同シグネチャで swap する。
// ============================================================

export type SocialStyleType = 'analytical' | 'driver' | 'expressive' | 'amiable';

// ----------------------------------------------------------------
// §8.1 議事録生成
// ----------------------------------------------------------------
export type MinutesDraftInput = {
  sessionId: string;
  videoUrl?: string;
  storagePath?: string;
};
export type MinutesDraftResult = {
  transcript: string;
  minutesDraft: string;
  generatedAt: string;
};
export async function generateMinutesDraft(
  _input: MinutesDraftInput,
): Promise<MinutesDraftResult> {
  return {
    transcript: '（mock）セッションの会話テキスト全文がここに入ります。',
    minutesDraft: [
      '## セッション議事録（AI 自動生成ドラフト）',
      '',
      '### 1. 今回の到達点',
      '- お客様の現状整理が完了',
      '- 次回までの具体的な行動を確認',
      '',
      '### 2. 次回までの宿題',
      '- 事前課題への回答',
      '',
      '※ AI 生成ドラフトです。トレーナーが必ず確認・修正してください。',
    ].join('\n'),
    generatedAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------
// §8.2 事前課題30項目生成
// ----------------------------------------------------------------
export type HomeworkItemsInput = {
  customerId: string;
  nextSessionNo: number;
  minutesText?: string;
  hearingSheet?: Record<string, unknown>;
  pastHomeworkSummary?: string;
  profileSummary?: string;
  socialStyleType?: SocialStyleType;
  strengthSummary?: string;
};
export type HomeworkItem = {
  position: number;
  question_text: string;
  question_hint?: string | null;
  is_required: boolean;
  max_length?: number | null;
};
export async function generateHomework30Items(
  input: HomeworkItemsInput,
): Promise<HomeworkItem[]> {
  const n = input?.nextSessionNo ?? 1;
  return Array.from({ length: 30 }).map((_, i) => ({
    position: i + 1,
    question_text: `（mock）第${n}回 事前課題 設問 ${i + 1}`,
    question_hint: i % 5 === 0 ? '前回のセッションを踏まえて具体的に記述してください。' : null,
    is_required: i < 25,
    max_length: 1000,
  }));
}

// ----------------------------------------------------------------
// §8.5 フレーズ抽出
// ----------------------------------------------------------------
export type PhraseExtractionInput = {
  customerId: string;
  homeworkTexts: string[];
};
export type PhraseExtractionResult = { phrase: string; generatedAt: string };
export async function extractDrivingPhrase(
  _input: PhraseExtractionInput,
): Promise<PhraseExtractionResult> {
  return {
    phrase: '自分が信じた道を、最後まで自分の足で歩ききること。',
    generatedAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------
// §8.6 今日のひとこと
// ----------------------------------------------------------------
export type DailyMessageInput = {
  customerId: string;
  profileSummary?: string;
  recentHomeworkSummary?: string;
  recentMinutesSummary?: string;
};
export type DailyMessageResult = { message: string; generatedAt: string };
export async function generateDailyMessage(
  _input: DailyMessageInput,
): Promise<DailyMessageResult> {
  const msgs = [
    '昨日より一歩前に出た自分を、今日はちゃんと褒めてあげましょう。',
    '進みが遅くても、止まっていなければ前進です。',
    '違和感を放置しない。それがキャリアの一番の防衛策です。',
  ];
  const idx = new Date().getDate() % msgs.length;
  return { message: msgs[idx], generatedAt: new Date().toISOString() };
}

// ----------------------------------------------------------------
// 補助：マイページ「あなたの目標」3カード抽出
// ----------------------------------------------------------------
export type GoalExtractionInput = {
  customerId: string;
  homeworkAnswers: Record<string, string>;
};
export type GoalCard = { title: string; body: string };
export async function extractGoalCards(
  _input: GoalExtractionInput,
): Promise<GoalCard[]> {
  return [
    { title: '今回のスパキャリで絶対に手に入れたいもの', body: '事前課題に回答すると、ここに自動引用されます。' },
    { title: 'お金以外で本当に達成したい価値観', body: '事前課題に回答すると、ここに自動引用されます。' },
    { title: '尊敬している人物とその理由', body: '事前課題に回答すると、ここに自動引用されます。' },
  ];
}

// ----------------------------------------------------------------
// §8.3 ソーシャルスタイル判定
// ----------------------------------------------------------------
export type SocialStyleInput = { answers: Record<string, number> };
export type SocialStyleResult = {
  type: SocialStyleType;
  scores: Record<SocialStyleType, number>;
};
export async function evaluateSocialStyle(
  _input: SocialStyleInput,
): Promise<SocialStyleResult> {
  return {
    type: 'analytical',
    scores: { analytical: 82, driver: 60, expressive: 55, amiable: 70 },
  };
}

// ----------------------------------------------------------------
// §8.4 強み診断
// ----------------------------------------------------------------
export type StrengthDiagnosisInput = {
  customerId: string;
  answers: Record<string, unknown>;
};
export type StrengthDiagnosisResult = {
  strengths: string[];
  values_text: string;
  scores: Record<string, number>;
};
export async function diagnoseStrengths(
  _input: StrengthDiagnosisInput,
): Promise<StrengthDiagnosisResult> {
  return {
    strengths: ['共感力', '構造化思考', '実行力'],
    values_text: '人との繋がりを大切にしながら、自分の納得感を軸に意思決定する。',
    scores: { 共感: 82, 構造化: 75, 実行: 70, 創造: 60, 分析: 65 },
  };
}
