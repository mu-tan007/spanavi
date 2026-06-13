// ============================================================
// スパキャリ AI機能 mock 集約
// 仕様書: tasks/spacareer-spec.md §8 AI機能
// ----------------------------------------------------------------
// 並列実装エージェント #1〜#5 が即座に画面実装を進められるよう、
// AI機能 5種＋補助機能 すべての固定レスポンス mock を提供する。
//
// すべて async / Promise<T> で本物の API シグネチャと揃えている。
// 実装エージェント #6 が本物の Claude / Whisper 呼び出しに差し替え可能。
// 差し替え時は、各 mock 関数名と同名の本実装を `./<feature>.ts` に置き、
// 画面コードの import 元を mock.ts → 本実装ファイルへ差し替えるだけで済む。
// ============================================================

// ----------------------------------------------------------------
// 共通型
// ----------------------------------------------------------------

export type SocialStyleType = 'analytical' | 'driver' | 'expressive' | 'amiable';

export const SOCIAL_STYLE_LABELS: Record<SocialStyleType, string> = {
  analytical: '論理分析型',
  driver: '行動推進型',
  expressive: '感情表現型',
  amiable: '協調共感型',
};

// ============================================================
// §8.5 フレーズ抽出（あなたの原動力）
// ============================================================

export type PhraseExtractionInput = {
  customerId: string;
  // 第1回事後課題の所定項目テキスト群（生い立ち／動機／ゴール設計）
  homeworkTexts: string[];
};

export type PhraseExtractionResult = {
  phrase: string;
  generatedAt: string;
};

/**
 * §8.5 フレーズ抽出（あなたの原動力）
 * 第1回事後課題から「自分に伝えたいフレーズ」を1〜2文で抽出。
 */
export async function extractDrivingPhrase(
  _input: PhraseExtractionInput,
): Promise<PhraseExtractionResult> {
  return {
    phrase: '自分が信じた道を、最後まで自分の足で歩ききること。',
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// §8.6 今日のひとこと
// ============================================================

export type DailyMessageInput = {
  customerId: string;
  // プロフィール／直近の事後課題サマリ／直近の議事録サマリ
  profileSummary?: string;
  recentHomeworkSummary?: string;
  recentMinutesSummary?: string;
};

export type DailyMessageResult = {
  message: string;
  generatedAt: string;
};

/**
 * §8.6 今日のひとこと
 * 日次バッチで生成、マイページ右下に表示。
 */
export async function generateDailyMessage(
  _input: DailyMessageInput,
): Promise<DailyMessageResult> {
  const messages = [
    '昨日より一歩前に出た自分を、今日はちゃんと褒めてあげましょう。',
    'まだ言葉にできない違和感こそ、次の問いの種です。',
    '正しさより、自分が納得できる選択を。',
    '迷ったときは、3年後の自分が「やってよかった」と言える方を選ぶ。',
    '進みが遅くても、止まっていなければ前進です。',
    '今日のあなたの努力は、未来のあなたを必ず助けます。',
    '違和感を放置しない。それがキャリアの一番の防衛策です。',
  ];
  const idx = new Date().getDate() % messages.length;
  return {
    message: messages[idx],
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// 補助：マイページ「あなたの目標」3カード抽出
// ============================================================

export type GoalExtractionInput = {
  customerId: string;
  homeworkAnswers: Record<string, string>;
};

export type GoalCard = {
  title: string;
  body: string;
};

/**
 * 第1回事後課題から「あなたの目標」3カードを抽出。
 * 仕様書 §6.1：
 *   ・今回のスパキャリで絶対に手に入れたいもの
 *   ・お金以外で本当に達成したい価値観
 *   ・尊敬している人物とその理由
 */
export async function extractGoalCards(
  _input: GoalExtractionInput,
): Promise<GoalCard[]> {
  return [
    {
      title: '今回のスパキャリで絶対に手に入れたいもの',
      body: '事後課題に回答すると、ここに自動引用されます。',
    },
    {
      title: 'お金以外で本当に達成したい価値観',
      body: '事後課題に回答すると、ここに自動引用されます。',
    },
    {
      title: '尊敬している人物とその理由',
      body: '事後課題に回答すると、ここに自動引用されます。',
    },
  ];
}

// ============================================================
// §8.1 AI 議事録自動生成（mock）
// ============================================================

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
  // 本物は Whisper → Claude のパイプラインだが mock は固定文字列
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
      '- 事後課題への回答',
      '- 興味のある求人をピックアップ',
      '',
      '### 3. トレーナー所感',
      '本人の言語化が進み、思考が深くなっている印象。',
      '',
      '※ AI 生成ドラフトです。トレーナーが必ず確認・修正してください。',
    ].join('\n'),
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// §8.2 AI 事後課題 30 項目自動生成（mock）
// ============================================================

export type HomeworkItemsInput = {
  customerId: string;
  nextSessionNo: number;            // 1〜8
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

/**
 * 次回事後課題30項目をAIで生成する mock。
 * 本実装はトレーナーが手動編集後「完了・通知」で確定。
 */
export async function generateHomework30Items(
  input: HomeworkItemsInput,
): Promise<HomeworkItem[]> {
  const n = input?.nextSessionNo ?? 1;
  const templates: Array<Omit<HomeworkItem, 'position'>> = [
    { question_text: `前回（第${Math.max(n - 1, 0)}回）セッションを振り返り、最も印象に残った気づきを3つ挙げてください。`, is_required: true, max_length: 800 },
    { question_text: '前回設定したアクションのうち、実行できたものを具体的に教えてください。', is_required: true, max_length: 800 },
    { question_text: '実行できなかったアクションについて、阻害要因を分析してください。', is_required: true, max_length: 600 },
    { question_text: '今週1週間の中で、自分の「強み」が活きた場面を1つ詳述してください。', is_required: true, max_length: 600 },
    { question_text: '逆に「課題」を感じた場面を1つ詳述してください。', is_required: true, max_length: 600 },
    { question_text: '現職で達成したい3ヶ月以内の目標を再定義してください。', is_required: true, max_length: 400 },
    { question_text: '転職活動を行う場合、譲れない条件を5つ優先順位付きで列挙してください。', is_required: true, max_length: 400 },
    { question_text: '上記5条件のうち、家族に共有済みの条件はいくつありますか？理由も添えてください。', is_required: false, max_length: 300 },
    { question_text: '尊敬する人物のキャリア軌跡から学べる「再現可能な行動」を3つ抽出してください。', is_required: true, max_length: 600 },
    { question_text: '次の1週間で必ず実行する小さな行動を3つ挙げてください。', is_required: true, max_length: 400 },
    { question_text: '自分が「お金以外で」報われたと感じた直近の出来事を教えてください。', is_required: true, max_length: 500 },
    { question_text: '5年後の自分が今の自分にかける言葉を、自分自身に向けて書いてください。', is_required: true, max_length: 400 },
    { question_text: '直近1ヶ月で、自分の判断を後悔した出来事はありますか？', is_required: false, max_length: 500 },
    { question_text: 'もし1年間の有給休暇が貰えたら、最初の3ヶ月で何をしますか？', is_required: false, max_length: 400 },
    { question_text: '現職で得たスキルのうち、転職市場で武器になると思うものを3つ選んでください。', is_required: true, max_length: 500 },
    { question_text: '逆に、市場で通用しないと感じているスキル・経験を率直に書いてください。', is_required: true, max_length: 500 },
    { question_text: 'これまでに「成長した」と実感した瞬間を、起点となった出来事と合わせて記述してください。', is_required: true, max_length: 600 },
    { question_text: '自分の「不機嫌スイッチ」が入る典型パターンを3つ言語化してください。', is_required: false, max_length: 400 },
    { question_text: 'チームの中で自然と任される役割は何ですか？', is_required: true, max_length: 400 },
    { question_text: '上記の役割は、自分が望んでいるものですか？理由も添えてください。', is_required: true, max_length: 400 },
    { question_text: '今の働き方を10点満点で点数化し、減点ポイントを具体的に列挙してください。', is_required: true, max_length: 500 },
    { question_text: '健康・睡眠・運動に関する、現状の課題と改善案を書いてください。', is_required: false, max_length: 400 },
    { question_text: '直近で「自分らしくない」と感じた選択はありますか？', is_required: false, max_length: 400 },
    { question_text: '同じ業界の同年代と比べて、自分の強みは何だと思いますか？', is_required: true, max_length: 500 },
    { question_text: `次回（第${n}回）セッションで必ず議論したい論点を1つ挙げてください。`, is_required: true, max_length: 300 },
    { question_text: '次回セッションまでに読みたい本・記事・動画を1つ決めて理由を書いてください。', is_required: false, max_length: 300 },
    { question_text: '自分の感情の起伏を1週間メモした結果を共有してください（任意フォーマット）。', is_required: false, max_length: 600 },
    { question_text: '配偶者・パートナー・家族との対話の中で、キャリアについて出た言葉を共有してください。', is_required: false, max_length: 500 },
    { question_text: '今回の宿題で最も時間をかけた質問はどれですか？理由も。', is_required: false, max_length: 300 },
    { question_text: 'トレーナーに次回最も深掘ってほしいテーマを1つ指定してください。', is_required: true, max_length: 300 },
  ];

  return templates.map((tpl, idx) => ({
    position: idx + 1,
    question_hint: idx % 5 === 0 ? '前回のセッションを踏まえて具体的に記述してください。' : null,
    ...tpl,
  }));
}

// ============================================================
// §8.3 ソーシャルスタイル診断（30問判定）
// ============================================================

export type SocialStyleQuestion = {
  no: number; // 1〜30
  text: string;
  axis: 'assertiveness' | 'responsiveness'; // 主張軸 or 感情表出軸
  reverse: boolean; // true なら逆転項目
};

export type SocialStyleAnswer = {
  no: number;
  score: 1 | 2 | 3 | 4 | 5; // 5段階リッカート
};

export type SocialStyleScores = {
  analytical: number;
  driver: number;
  expressive: number;
  amiable: number;
  assertiveness_raw: number; // -2.0〜+2.0
  responsiveness_raw: number;
};

export type SocialStyleResult = {
  result_type: SocialStyleType;
  result_label: string;
  result_scores: SocialStyleScores;
  description: string;
  approach_tips: string; // 接し方ポイント（運営内部のみ）
};

/**
 * 30問の素案。論文・公表データに基づくソーシャルスタイル理論（Merrill & Reid, 1981）の2軸：
 *   - 主張性（assertiveness）：高＝主張する／低＝受け止める
 *   - 感情表出（responsiveness）：高＝感情を表に出す／低＝感情を抑える
 *
 * 4タイプの位置関係（主張×感情の象限）：
 *   - Analytical（論理分析型）= 低主張 × 低感情表出
 *   - Driver（行動推進型）   = 高主張 × 低感情表出
 *   - Expressive（感情表現型）= 高主張 × 高感情表出
 *   - Amiable（協調共感型）  = 低主張 × 高感情表出
 *
 * 各軸15問、計30問。逆転項目を含む（reverse=true）。
 */
export const SOCIAL_STYLE_QUESTIONS: SocialStyleQuestion[] = [
  // 主張性軸（15問）
  { no: 1, text: '会議で自分の意見を明確に主張する方だ。', axis: 'assertiveness', reverse: false },
  { no: 2, text: '結論を早く出すことを好む。', axis: 'assertiveness', reverse: false },
  { no: 3, text: '初対面でも相手に対して自分から話を切り出すことが多い。', axis: 'assertiveness', reverse: false },
  { no: 4, text: '物事を決める時は、議論より直感で動くタイプだ。', axis: 'assertiveness', reverse: false },
  { no: 5, text: '人と意見が合わないとき、自分の立場を譲るより主張を通したい。', axis: 'assertiveness', reverse: false },
  { no: 6, text: '相手の話を最後まで聞いてから発言する方だ。', axis: 'assertiveness', reverse: true },
  { no: 7, text: '判断を急かされると不快に感じる。', axis: 'assertiveness', reverse: true },
  { no: 8, text: '集団の中ではリーダー役を担うことが多い。', axis: 'assertiveness', reverse: false },
  { no: 9, text: '指示を出すより指示を受ける方が落ち着く。', axis: 'assertiveness', reverse: true },
  { no: 10, text: '交渉やプレゼンに前向きである。', axis: 'assertiveness', reverse: false },
  { no: 11, text: '初対面の相手とは控えめに接することが多い。', axis: 'assertiveness', reverse: true },
  { no: 12, text: '物事のスピード感を重視する。', axis: 'assertiveness', reverse: false },
  { no: 13, text: '反対意見を言われても、根拠があれば自分の主張を曲げない。', axis: 'assertiveness', reverse: false },
  { no: 14, text: '行動より先に十分な検討期間を取りたい。', axis: 'assertiveness', reverse: true },
  { no: 15, text: '自分から働きかけて状況を変えることが多い。', axis: 'assertiveness', reverse: false },
  // 感情表出軸（15問）
  { no: 16, text: '嬉しさや悲しさを表情や声に出す方だ。', axis: 'responsiveness', reverse: false },
  { no: 17, text: '雑談で個人的なエピソードを共有することに抵抗がない。', axis: 'responsiveness', reverse: false },
  { no: 18, text: '感情より事実・データを重視する。', axis: 'responsiveness', reverse: true },
  { no: 19, text: '人前で自分の気持ちを表現するのは得意な方だ。', axis: 'responsiveness', reverse: false },
  { no: 20, text: '初対面の人とも雑談で打ち解けやすい。', axis: 'responsiveness', reverse: false },
  { no: 21, text: '人と関わるよりひとりで作業する方が落ち着く。', axis: 'responsiveness', reverse: true },
  { no: 22, text: 'ユーモアを交えて会話することが多い。', axis: 'responsiveness', reverse: false },
  { no: 23, text: '客観的・論理的な議論を好む。', axis: 'responsiveness', reverse: true },
  { no: 24, text: '他人の感情の変化に敏感である。', axis: 'responsiveness', reverse: false },
  { no: 25, text: '相手を励ましたり共感したりすることが自然にできる。', axis: 'responsiveness', reverse: false },
  { no: 26, text: '感情を表に出さず、冷静に振る舞うことが多い。', axis: 'responsiveness', reverse: true },
  { no: 27, text: 'チームの雰囲気を盛り上げる役割を担うことが多い。', axis: 'responsiveness', reverse: false },
  { no: 28, text: '結論より背景の物語に興味を持つ方だ。', axis: 'responsiveness', reverse: false },
  { no: 29, text: '感情よりプロセスや手順を優先する。', axis: 'responsiveness', reverse: true },
  { no: 30, text: '人とのつながり・関係性を仕事のモチベーションにしている。', axis: 'responsiveness', reverse: false },
];

/**
 * 30問の回答からタイプ判定を行う。
 * 1. 各項目を 1〜5 から -2〜+2 にセンタリング（reverse は符号反転）。
 * 2. 軸ごとに平均（assertiveness_raw / responsiveness_raw）→ 0 を閾値に4象限分類。
 * 3. 4タイプそれぞれのスコアを 0〜100 のパーセンタイル形式に変換。
 */
export async function evaluateSocialStyle(
  answers: SocialStyleAnswer[],
): Promise<SocialStyleResult> {
  const byNo = new Map(answers.map((a) => [a.no, a.score]));
  const centered = SOCIAL_STYLE_QUESTIONS.map((q) => {
    const raw = byNo.get(q.no) ?? 3;
    const cen = raw - 3; // -2 〜 +2
    return { ...q, value: q.reverse ? -cen : cen };
  });

  const avg = (axis: 'assertiveness' | 'responsiveness') => {
    const xs = centered.filter((c) => c.axis === axis).map((c) => c.value);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  const A = avg('assertiveness'); // -2〜+2
  const R = avg('responsiveness'); // -2〜+2

  let result_type: SocialStyleType;
  if (A >= 0 && R < 0) result_type = 'driver';
  else if (A >= 0 && R >= 0) result_type = 'expressive';
  else if (A < 0 && R >= 0) result_type = 'amiable';
  else result_type = 'analytical';

  const to100 = (v: number) => Math.max(0, Math.min(100, Math.round(((v + 2) / 4) * 100)));
  const scores: SocialStyleScores = {
    driver: to100(Math.min(A, -R)),
    expressive: to100(Math.min(A, R)),
    amiable: to100(Math.min(-A, R)),
    analytical: to100(Math.min(-A, -R)),
    assertiveness_raw: Number(A.toFixed(3)),
    responsiveness_raw: Number(R.toFixed(3)),
  };

  const desc: Record<SocialStyleType, { description: string; approach_tips: string }> = {
    analytical: {
      description:
        '論理分析型。事実・データ・プロセスを重視し、十分な検討期間を経て意思決定を行う。慎重で正確、一貫性を好む。短期的な勢いより長期的な質を優先する傾向がある。',
      approach_tips:
        '結論を急がせない。データ・根拠・前例を準備して提示。感情論ではなく事実ベースで対話を進める。沈黙を恐れず思考時間を許容する。',
    },
    driver: {
      description:
        '行動推進型。結果・スピード・効率を重視し、即断即決を好む。リーダーシップを発揮しやすく、目標達成への執着が強い。プロセスより成果に関心が向く。',
      approach_tips:
        '要点を先に伝える（結論→根拠の順）。雑談は短く。選択肢を提示し本人に決定権を渡す。曖昧な合意を避け、必ず次のアクションを確定させる。',
    },
    expressive: {
      description:
        '感情表現型。アイデア・ビジョン・人とのつながりを重視。明るく社交的、新しい刺激を好む。プロセスより共感と高揚を求める。',
      approach_tips:
        '本人の物語・夢に共感を示す。ビジョンを大きく描く対話を意識。細かいタスク管理は本人にとって苦痛なので、大枠の方向性合意を優先する。',
    },
    amiable: {
      description:
        '協調共感型。人間関係・調和・安心感を重視。傾聴が得意で、周囲のサポート役を担うことが多い。急激な変化を避け、安定したペースを好む。',
      approach_tips:
        '本人の不安を丁寧に汲み取る。「正解を出す」より「一緒に考える」スタンス。締め切りより本人の納得感を優先。否定的フィードバックは関係性ベースで包む。',
    },
  };

  return {
    result_type,
    result_label: SOCIAL_STYLE_LABELS[result_type],
    result_scores: scores,
    description: desc[result_type].description,
    approach_tips: desc[result_type].approach_tips,
  };
}

// ============================================================
// §8.4 強み診断（mock）
// ============================================================

export type StrengthQuestion = {
  no: number;
  text: string;
  category: 'execution' | 'influencing' | 'relationship' | 'strategic';
};

export type StrengthAnswer = {
  no: number;
  score: 1 | 2 | 3 | 4 | 5;
};

export type StrengthDiagnosisInput = {
  customerId: string;
  answers: StrengthAnswer[] | Record<string, unknown>;
  valuesText?: string;
};

export type StrengthDiagnosisResult = {
  strengths: string[];        // 旧シグネチャ互換
  topStrengths: Array<{ name: string; description: string; score: number }>;
  values_text: string;
  scores: {
    execution: number;
    influencing: number;
    relationship: number;
    strategic: number;
    [k: string]: number;
  };
};

/**
 * Gallup CliftonStrengths の4ドメインに基づく簡易版。
 * 各カテゴリ5問×4＝20問。Top3の強みを言語化して返す。
 */
export const STRENGTH_QUESTIONS: StrengthQuestion[] = [
  // 実行力（execution）
  { no: 1, text: 'やると決めたタスクは最後までやり切る。', category: 'execution' },
  { no: 2, text: '計画通りに物事を進めることが得意だ。', category: 'execution' },
  { no: 3, text: '責任ある立場を任されると力を発揮する。', category: 'execution' },
  { no: 4, text: '締め切りを設定すると集中できる。', category: 'execution' },
  { no: 5, text: '日々のルーティンを大切にしている。', category: 'execution' },
  // 影響力（influencing）
  { no: 6, text: '人前で話すことに抵抗が少ない。', category: 'influencing' },
  { no: 7, text: '自分の考えで他者を動かすことができる。', category: 'influencing' },
  { no: 8, text: '競争状況で力を発揮するタイプだ。', category: 'influencing' },
  { no: 9, text: '人を巻き込んで何かを成し遂げた経験が多い。', category: 'influencing' },
  { no: 10, text: '自分が前に出ることでチームが進むと感じる。', category: 'influencing' },
  // 人間関係構築力（relationship）
  { no: 11, text: '人の話を最後まで聴くのが得意だ。', category: 'relationship' },
  { no: 12, text: '周りの人の感情の変化に気づきやすい。', category: 'relationship' },
  { no: 13, text: '対立した場面で仲裁役になることが多い。', category: 'relationship' },
  { no: 14, text: '一対一の関係性を深めるのが好きだ。', category: 'relationship' },
  { no: 15, text: '誰かを支えることでエネルギーをもらえる。', category: 'relationship' },
  // 戦略的思考力（strategic）
  { no: 16, text: '物事の全体像を捉えるのが得意だ。', category: 'strategic' },
  { no: 17, text: '複雑な情報からパターンを見出すことができる。', category: 'strategic' },
  { no: 18, text: '長期的な視点で物事を考えるのが好きだ。', category: 'strategic' },
  { no: 19, text: '新しいアイデアを生み出すことに喜びを感じる。', category: 'strategic' },
  { no: 20, text: '情報収集・リサーチが好きだ。', category: 'strategic' },
];

const STRENGTH_LABEL: Record<StrengthQuestion['category'], { name: string; description: string }> = {
  execution: {
    name: '実行力',
    description: 'やると決めたことを最後までやり切る力。締め切りを設定し、計画通りに前進させる。任せられた責任を果たすことで信頼を獲得していくタイプ。',
  },
  influencing: {
    name: '影響力',
    description: '自分の考えで人を動かし、チームを前進させる力。プレゼン・交渉・営業の場面で輝く。「自分が前に出ることでチームが進む」感覚を持っている。',
  },
  relationship: {
    name: '人間関係構築力',
    description: '人と深く関わり、信頼関係をベースにチームを支える力。傾聴・共感・仲裁が自然にでき、一対一の関係性を磨くことで成果を出す。',
  },
  strategic: {
    name: '戦略的思考力',
    description: '複雑な情報からパターンを抽出し、長期視点で道筋を描く力。新しいアイデアの起点となり、情報収集とリサーチに知的喜びを感じる。',
  },
};

export async function diagnoseStrengths(
  input: StrengthDiagnosisInput,
): Promise<StrengthDiagnosisResult> {
  const answersArray: StrengthAnswer[] = Array.isArray(input.answers)
    ? (input.answers as StrengthAnswer[])
    : [];
  const byNo = new Map(answersArray.map((a) => [a.no, a.score]));

  const categoryScore = (cat: StrengthQuestion['category']) => {
    const xs = STRENGTH_QUESTIONS.filter((q) => q.category === cat).map((q) => byNo.get(q.no) ?? 3);
    const avg = xs.reduce((a, b) => a + b, 0) / xs.length; // 1〜5
    return Math.round(((avg - 1) / 4) * 100); // 0〜100
  };

  const scores = {
    execution: categoryScore('execution'),
    influencing: categoryScore('influencing'),
    relationship: categoryScore('relationship'),
    strategic: categoryScore('strategic'),
  };

  const sorted = (Object.keys(scores) as Array<keyof typeof scores>)
    .map((k) => ({ key: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score);

  const topStrengths = sorted.slice(0, 3).map((s) => ({
    name: STRENGTH_LABEL[s.key].name,
    description: STRENGTH_LABEL[s.key].description,
    score: s.score,
  }));

  return {
    strengths: topStrengths.map((s) => s.name),
    topStrengths,
    values_text:
      input.valuesText?.trim() ||
      '人との繋がりを大切にしながら、自分の納得感を軸に意思決定する。お金以外で得たい報酬は「信頼」と「自分らしさ」。',
    scores,
  };
}
