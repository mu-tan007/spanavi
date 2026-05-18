// スパキャリ AI機能 mock（並列実装用の暫定スタブ）
// 仕様書: tasks/spacareer-spec.md §8 AI機能仕様 / §12.5 mock戦略
//
// このファイルは画面側エージェント (#1〜#5) が画面実装で即座に使えるよう、
// 固定レスポンスを返す暫定 mock。本実装はエージェント #6 が swap で差し替える。
// シグネチャは同名関数で揃え、async/Promise<T> を維持する。

const DELAY_MS = 600;
const delay = (ms = DELAY_MS) => new Promise((r) => setTimeout(r, ms));

// ─── §8.2 事前課題30項目生成 ─────────────────────────────────
// 入力: { customerId, nextSessionNo, minutesText?, hearingSheet?, ... }
// 出力: HomeworkItem[]  ({position, question_text, question_hint, is_required, max_length})
export async function generateHomework30Items({ customerId, nextSessionNo = 1 } = {}) {
  await delay();
  const templates = [
    { question_text: `前回（第${Math.max(nextSessionNo - 1, 0)}回）セッションを振り返り、最も印象に残った気づきを3つ挙げてください。`, is_required: true, max_length: 800 },
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
    { question_text: `次回（第${nextSessionNo}回）セッションで必ず議論したい論点を1つ挙げてください。`, is_required: true, max_length: 300 },
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

// ─── §8.1 議事録ドラフト ─────────────────────────────────────
export async function generateMinutesDraft({ customerId, sessionNumber } = {}) {
  await delay();
  return {
    text:
      '【議事録(mock)】\n本セッションでは、受講生のキャリア軸の言語化を中心に対話を行いました。' +
      '主な論点: ① 現職での課題感の整理、② 半年後の理想像、③ 次回までのアクション。',
    generatedAt: new Date().toISOString(),
  };
}

// ─── §8.5 フレーズ抽出 ───────────────────────────────────────
export async function extractDrivingPhrase({ customerId, items } = {}) {
  await delay(400);
  return { phrase: '自分の人生を、自分の言葉で定義し直す。' };
}

// ─── §8.6 今日のひとこと ─────────────────────────────────────
export async function generateDailyMessage({ customerId } = {}) {
  await delay(300);
  return { quote: '小さな一歩でも、止まらなければ必ず景色は変わります。' };
}

// ─── §8.4 強み診断 ───────────────────────────────────────────
export async function diagnoseStrengths({ customerId, responses } = {}) {
  await delay();
  return {
    strengths: [
      { name: '構造化思考', score: 88 },
      { name: '共感性', score: 76 },
      { name: '実行力', score: 71 },
    ],
    summary: '論理的に物事を整理しつつ、相手の感情に配慮できるバランス型。',
  };
}

// ─── §8.3 ソーシャルスタイル判定 ─────────────────────────────
export async function evaluateSocialStyle({ responses } = {}) {
  await delay();
  return {
    type: '論理分析型',
    scores: { logic: 72, action: 48, emotion: 35, harmony: 55 },
  };
}

export default {
  generateHomework30Items,
  generateMinutesDraft,
  extractDrivingPhrase,
  generateDailyMessage,
  diagnoseStrengths,
  evaluateSocialStyle,
};
