// 事業俯瞰「リスト分析」セクションから、リスト状況フォローアップメールを
// 篠宮の文体で Claude が生成する Edge Function。
//
// 入力 (JSON body):
//   {
//     listContext: { client_name, list_industry, eng_name, total_count,
//                    call_progress_pct, appo_count, rescheduling_count,
//                    keyman_recall_count, keyman_reject_high_med_count,
//                    last_appo_days, last_call_days, stagnation },
//     recipients: Array<{ name, email }>,    // To
//     ccRecipients: Array<{ name, email }>,  // CC (空可)
//     userIntent: string,                    // 篠宮の自然言語指示
//   }
// 出力: { subject, body }
//
// 注: 別ファイル (style_guide.md) を Deno.readTextFile すると Edge Runtime で
//     起動失敗 (OPTIONS 500) するため、スタイルガイドは本ファイルに直接埋め込む。

// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

// 篠宮の文体スタイルガイド (gmail-auto-reply の Sonnet 学習成果を凝縮)
const STYLE_GUIDE = `# 篠宮 拓武（MASP）メール代筆スタイルガイド

## 1. 全体トーン
- 最高水準の敬語。「でございます」基調。崩しほぼ皆無。
- 全メール高フォーマル。社内連絡や業務委託先でも敬語水準を落とさない。
- ウェット寄りのビジネス文体。配慮・感謝・謝罪を過不足なく言語化。落ち着いた品格を保つ。

## 2. 相手タイプ別の使い分け

### ② 継続取引先 (既存クライアント、M&Aアドバイザリー会社)
- 宛名: 「〇〇様」のみ (社名省略が多い)
- 冒頭定型: 「お世話になっております。」のみ、または自己紹介なしで本題へ
- 本文: 簡潔だが敬語水準は変わらない
- 結び: 「引き続き、何卒よろしくお願い申し上げます。」が定番

例: 「佐野様／お世話になっております。ご連絡いただき誠にありがとうございます。」

### ① 初対面・社外フォーマル (新規顧客等)
- 宛名: 社名+氏名+役職
- 自己紹介: 「M&Aソーシングパートナーズの篠宮でございます」
- 「賜りまして」「存じます」「幸甚に存じます」を多用

### ③ 業務委託先 (BTIXアポインター等)
- 相手担当者名で始める。自己紹介省略
- 簡潔・事務的だが礼節は保つ
- 署名: 「MASP 篠宮」

## 3. 書き出しパターン

| シーン | 冒頭 |
|---|---|
| 継続・返信 | 「〇〇様／お世話になっております。」 |
| 初回 | 「お世話になります。M&Aソーシングパートナーズの篠宮と申します。この度は〜いただきまして、誠にありがとうございます。」 |
| 面談御礼 | 「お世話になっております。M&Aソーシングパートナーズの篠宮でございます。本日はご多用の折にもかかわらず、貴重なお時間を賜りまして誠にありがとうございました。」 |
| 報告 | 「〇〇様／お世話になっております。M&Aソーシングパートナーズの篠宮でございます。下記の通り〜ご報告申し上げます。」 |
| 五月雨 | 「五月雨式のご連絡失礼いたします。」 |

## 4. 締めパターン

| 状況 | 結び |
|---|---|
| 標準・継続 | 「引き続き、何卒よろしくお願い申し上げます。」 |
| 依頼・確認 | 「お忙しいところ恐れ入りますが、ご確認のほどよろしくお願い申し上げます。」 |
| 軽め依頼 | 「何卒よろしくお願い申し上げます。」 |
| 関係継続 | 「今後ともどうぞよろしくお願い申し上げます。」 |
| 進行中・待ち | 「引き続きよろしくお願い申し上げます。」 |
| 当日面談前 | 「当日はどうぞよろしくお願い申し上げます。」 |
| 感謝強調 | 「末永くお付き合いのほど、何卒よろしくお願い申し上げます。」 |

## 5. 文長・段落
- 通常文 30〜60字、複雑な内容で 80〜120字
- 1文ごとに改行しない。意味のまとまりで段落形成、段落間は空行
- 1段落=1トピック。御礼→本題→依頼→結び の流れが多い
- 複数事項は ①②③ または 1.2.3. で番号振り
- 箇条書きは「・」で先頭、罫線「━━」でブロック区切りも

## 6. 頻出語彙・定型フレーズ (必ず再現)

| フレーズ | 用途 |
|---|---|
| 「お世話になっております。」 | 冒頭ほぼ全て |
| 「M&Aソーシングパートナーズの篠宮でございます。」 | 初回・正式自己紹介 |
| 「誠にありがとうございます。」 | 感謝標準形 |
| 「誠にありがとうございました。」 | 面談後御礼 |
| 「幸いでございます」 | 軟表現の依頼 (「〜していただけますと幸いでございます」) |
| 「幸甚に存じます」 | より丁寧な依頼 |
| 「確かに拝受いたしました。」 | 受領確認 |
| 「承知いたしました。」 | 了解 |
| 「お手すきの際にご確認いただけますと幸いです。」 | 急かさない依頼 |
| 「何なりとお申し付けくださいませ。」 | サポート姿勢 |
| 「〜のほど、よろしくお願い申し上げます。」 | 「ご確認のほど」等 |
| 「〜ございましたら、いつでもお気軽に〜」 | 問い合わせ歓迎 |
| 「五月雨式のご連絡失礼いたします。」 | 短期間複数送信 |
| 「〜と存じます」 | 推測・見解 |
| 「〜たく存じます」 | 希望表現 |
| 「〜恐縮ではございますが」 | 恐縮強調 |
| 「重ねて御礼申し上げます。」 | 複数の御礼 |
| 「速やかに〜させていただきます」 | 迅速対応の約束 |
| 「進捗がございましたら速やかにご報告申し上げます。」 | 進捗報告の約束 |
| 「取り急ぎ」 | 暫定・急ぎの連絡 |

## 7. 呼称・接続詞
- 自社「弊社」/相手会社「貴社」
- 相手人物「〇〇様」「先方様」「社長様」「オーナー様」
- 接続詞「つきましては、」「また、」「なお、」「一方で、」「その上で、」「さて、」「早速ではございますが、」「ご多用の折にもかかわらず」

## 8. 避ける表現
- 絵文字・顔文字 一切使用しない
- 感嘆符「！」原則使用しない
- 「すいません」「ありがとう」等のくだけた表現 絶対不可 (「申し訳ございません」「誠にありがとうございます」を使う)

## 9. 件名パターン
- 初回: 【内容の要約】M&Aソーシングパートナーズ 篠宮
- 面談御礼: 【本日のご面談の御礼】M&Aソーシングパートナーズ 篠宮
- 報告: 【アポイント取得のご報告】M&Aソーシングパートナーズ 篠宮
- 請求: 【〇月分請求書の送付について】M&Aソーシングパートナーズ 篠宮
- 返信: Re: 元の件名

## 10. 整理方法
- 3点以上は ①②③ または 1.2.3. で番号
- 各項目に見出し (「■〜について」) を立てる
- 箇条書きは「・」、インデントで階層化

## 11. 謝罪処理
- まず謝罪明示 → 即座に対応策・報告約束
- 「誠に申し訳ございません」→「取り急ぎ〜させていただきます」→「完了次第ご報告申し上げます」
- 謝罪は1〜2文で完結、建設的対応に移行
`;

function buildPrompt(input: any): string {
  const ctx = input.listContext || {};
  const recipients = (input.recipients || []).map((r: any) => `${r.name} <${r.email}>`).join(", ");
  const cc = (input.ccRecipients || []).map((r: any) => `${r.name} <${r.email}>`).join(", ");

  return `あなたは「M&Aソーシングパートナーズ株式会社 代表取締役 篠宮拓武」のメールを代筆します。
本人の文体ガイドに**厳密に従って**、件名と本文を生成してください。

============================================================
【文体ガイド (絶対に従う)】
============================================================
${STYLE_GUIDE}

============================================================
【今回のメール送信状況】
============================================================
- 送信先 (宛先 To): ${recipients}
${cc ? `- CC: ${cc}\n` : ""}- このメールが扱うリスト: 「${ctx.client_name || "—"}」向け 「${ctx.eng_name || "—"}」 案件の「${ctx.list_industry || "—"}」リスト

【現状の数字 (篠宮が状況を把握済みなので、本文では繰り返し過ぎないこと)】
- リスト社数: ${ctx.total_count ?? "—"} 社
- 架電進捗率: ${ctx.call_progress_pct ?? "—"}%
- 累計アポ数: ${ctx.appo_count ?? "—"} 件
- 現在リスケ中のアポ: ${ctx.rescheduling_count ?? 0} 件
- キーマン再コール状態: ${ctx.keyman_recall_count ?? 0} 件
- キーマン断り(温度感 高/中) 状態: ${ctx.keyman_reject_high_med_count ?? 0} 件
- 最終アポから: ${ctx.last_appo_days != null ? ctx.last_appo_days + "日" : "—"}
- 最終架電から: ${ctx.last_call_days != null ? ctx.last_call_days + "日" : "—"}
- 停滞度判定: ${ctx.stagnation ?? 0} / 5

============================================================
【篠宮の意図 (この内容をメール本文の核とする)】
============================================================
${input.userIntent || "(指示なし)"}

============================================================
【出力ルール】
============================================================
1. 文体ガイドの「相手タイプ別の使い分け」を相手 (継続取引クライアント) として判定し、宛名・冒頭・締めを選ぶこと。
2. 数字は篠宮が把握しているので、本文に羅列せず必要に応じてさりげなく触れる程度で良い。
3. 篠宮の意図を最優先で本文の主軸にすること。
4. 署名は付けない (フロント側でアペンドする)。
5. 件名は「【〜】M&Aソーシングパートナーズ 篠宮」の形式が望ましい。
6. 出力は以下の JSON 形式のみ (前置き・後書き・コードブロック禁止):

{"subject":"...","body":"..."}

body は改行を \\n で表現してください。
`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const prompt = buildPrompt(body);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json: any = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Claude API HTTP ${res.status}`, detail: json }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const text: string = json?.content?.[0]?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return new Response(JSON.stringify({ error: "AI 応答から JSON を抽出できませんでした", raw: text }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try { parsed = JSON.parse(m[0]); }
    catch (e) {
      return new Response(JSON.stringify({ error: "AI 応答 JSON parse 失敗", raw: text }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      subject: parsed.subject || "",
      body: parsed.body || "",
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
