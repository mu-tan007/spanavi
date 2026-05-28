// 面談録音から「概要」「Next Action」を生成して client_meetings を更新する Edge Function。
// フロントから fire-and-forget で呼び出され、内部で
//   recording_url ダウンロード → Whisper 文字起こし → Claude 要約 → DB 更新
// を実行する。
//
// 入力:
//   { meeting_id: uuid, recording_url: string }
// 即座に { status: 'started' } を返し、実処理はバックグラウンド (EdgeRuntime.waitUntil)。
// フロントは client_meetings.summary をポーリングして完了を検知する。

// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

async function processInBackground(meetingId: string, recordingUrl: string) {
  try {
    // 1. ステータス更新 (解析開始マーカー)
    await supabase.from("client_meetings").update({
      summary: "[AI解析中... 1〜2分お待ちください]",
    }).eq("id", meetingId);

    // 2. 録音ファイルをダウンロード
    const audioRes = await fetch(recordingUrl, { signal: AbortSignal.timeout(120_000) });
    if (!audioRes.ok) throw new Error(`録音のダウンロードに失敗: HTTP ${audioRes.status}`);
    const audioBuffer = await audioRes.arrayBuffer();
    const ext = (recordingUrl.split(".").pop() || "mp4").toLowerCase().replace(/\?.*$/, "");

    // 3. Whisper API で文字起こし (日本語)
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY が設定されていません");
    const form = new FormData();
    form.append("file", new Blob([audioBuffer]), `meeting.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "ja");
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      throw new Error(`Whisper HTTP ${whisperRes.status}: ${errText.slice(0, 300)}`);
    }
    const whisperJson = await whisperRes.json();
    const transcript: string = (whisperJson.text || "").trim();
    if (!transcript) throw new Error("文字起こしが空でした");

    // 4. Claude (Haiku 4.5) で要約 (概要 + Next Action)
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が設定されていません");
    const prompt = `以下はM&Aソーシングパートナーズ株式会社 (篠宮) と先方クライアントの面談の文字起こしです。
2項目「概要」と「Next Action」を抽出してください。

【出力ルール】
- 「概要」: 面談で話された内容を3-5行程度で簡潔にまとめる。誰が何を言ったかではなく「何が話されたか」を中心に
- 「Next Action」: 篠宮 (M&Aソーシングパートナーズ) 側がやるべき次のアクションを箇条書きで列挙
- 出力は JSON 形式のみ (前置き・後書き・コードブロック禁止)
- body 内の改行は \\n で表現

{"summary":"...","next_action":"..."}

【文字起こし】
${transcript.slice(0, 30000)}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude HTTP ${claudeRes.status}: ${errText.slice(0, 300)}`);
    }
    const claudeJson = await claudeRes.json();
    const text: string = claudeJson.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let summary = "";
    let nextAction = "";
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        summary = parsed.summary || "";
        nextAction = parsed.next_action || "";
      } catch {
        summary = text;
      }
    } else {
      summary = text;
    }

    // 5. DB 更新
    await supabase.from("client_meetings").update({
      transcript,
      summary,
      next_action: nextAction,
    }).eq("id", meetingId);

  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error("[summarize-meeting-recording] failed:", msg);
    await supabase.from("client_meetings").update({
      summary: `[AI解析エラー: ${msg}]`,
    }).eq("id", meetingId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { meeting_id, recording_url } = body;
  if (!meeting_id || !recording_url) {
    return new Response(JSON.stringify({ error: "meeting_id and recording_url are required" }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // バックグラウンド処理開始、即レスポンス
  // @ts-ignore Edge Runtime
  EdgeRuntime.waitUntil(processInBackground(meeting_id, recording_url));

  return new Response(JSON.stringify({ status: "started" }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
