// 事業俯瞰「リスト分析」セクションから、リスト状況フォローアップメールを
// 篠宮の文体で Claude が生成する Edge Function。
//
// 入力 (JSON body):
//   {
//     listContext: {
//       client_name: string,            // 例: "株式会社ユニヴィスコンサルティング"
//       list_industry: string,          // 例: "金融商品仲介業者"
//       eng_name: string,               // 例: "売り手ソーシング"
//       total_count: number,            // 社数
//       call_progress_pct: number,      // 架電進捗率
//       appo_count: number,             // 累計アポ数
//       rescheduling_count: number,     // リスケ中件数
//       keyman_recall_count: number,    // キーマン再コール件数
//       keyman_reject_high_med_count: number, // キーマン断り(温度感高/中)件数
//       last_appo_days: number | null,  // 最終アポからの日数
//       last_call_days: number | null,  // 最終架電からの日数
//       stagnation: number,             // 停滞度 0-5
//     },
//     recipients: Array<{ name: string, email: string }>,  // To (複数可)
//     ccRecipients: Array<{ name: string, email: string }>,// CC (空配列可)
//     userIntent: string,               // 篠宮の自然言語指示
//   }
// 出力: { subject: string, body: string }
//
// 注: 署名は Edge Function 側では付けず、フロントの「送信」ボタン直前で
//     SIG_DEFAULT を append する (gmail-auto-reply と同じ運用)。

// @ts-ignore: Deno 環境
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

// スタイルガイドは Edge Function バンドルに同梱
const STYLE_GUIDE = await Deno.readTextFile(new URL("./style_guide.md", import.meta.url));

function buildPrompt(input: any): string {
  const ctx = input.listContext || {};
  const recipients = (input.recipients || []).map((r: any) => `${r.name} <${r.email}>`).join(", ");
  const cc = (input.ccRecipients || []).map((r: any) => `${r.name} <${r.email}>`).join(", ");

  return `
あなたは「M&Aソーシングパートナーズ株式会社 代表取締役 篠宮拓武」のメールを代筆します。
本人の文体ガイドに**厳密に従って**、件名と本文を生成してください。

============================================================
【文体ガイド (絶対に従う)】
============================================================
${STYLE_GUIDE}

============================================================
【今回のメール送信状況】
============================================================
- 送信先 (宛先 To): ${recipients}
${cc ? `- CC: ${cc}` : ""}
- このメールが扱うリスト: 「${ctx.client_name || "—"}」向け 「${ctx.eng_name || "—"}」 案件の「${ctx.list_industry || "—"}」リスト

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
`.trim();
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
  try {
    body = await req.json();
  } catch {
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
    // JSON部分だけ抽出 (前後余白対策)
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return new Response(JSON.stringify({ error: "AI 応答から JSON を抽出できませんでした", raw: text }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try {
      parsed = JSON.parse(m[0]);
    } catch (e) {
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
