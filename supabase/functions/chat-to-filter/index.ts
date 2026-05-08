// Database 画面 自然言語チャット → 検索条件JSON への変換 Edge Function
//   - Anthropic claude-haiku-4-5 を使用
//   - 入力: 過去の会話履歴 + 最新ユーザー発話 + TSR 大分類リスト
//   - 出力: 日本語要約 + INITIAL_FILTERS と同シェイプの filters JSON
//   - DB保存はクライアント側で行う（このFnは推論のみ。RLSをユーザーJWTで通すため）
//
// 環境変数:
//   ANTHROPIC_API_KEY (Required)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];          // 直近の会話（最新がユーザー発話）
  daibunruiList: string[];          // クライアントから送られる大分類一覧
  currentFilters?: Record<string, unknown>; // ユーザーが既に手動で入れている条件（参考）
}

const SYSTEM_PROMPT = (daibunruiList: string[], currentFilters?: Record<string, unknown>) => `
あなたは企業データベース検索アシスタントです。
ユーザーの自然言語のリクエストから、検索条件を抽出してJSONで返します。

【データベースのスキーマ】
- 大分類 (daibunrui): 以下のリストから選択（複数可）
${daibunruiList.map(d => '  - ' + d).join('\n')}
- 細分類ヒント (industryHint): 細分類を絞り込むためのキーワード（部分一致用、例: "製造業", "ソフトウェア", "ガソリン"）
- 都道府県 (prefecture): 47都道府県名から複数選択（必ず "東京都"・"大阪府"・"北海道" 等の正式名称）
- 市区町村 (city): 市区郡名（部分一致、文字列）
- キーワード (keyword): 企業名・事業内容を部分一致検索（例: "AI"、"半導体"）
- 売上高 (revenueMin / revenueMax): 単位は千円。例: 1億円 → 100000、10億円 → 1000000、100億円 → 10000000
- 当期純利益 (netIncomeMin / netIncomeMax): 単位は千円
- 従業員数 (employeeMin / employeeMax): 整数
- 代表者年齢 (ageMin / ageMax): 整数
- 設立年 (establishedMin / establishedMax): 西暦4桁
- 電話番号 (phonePattern): 前方一致パターン（例: "03"、"090"）
- 株主タイプ (shareholderType): 配列。値は "individual"(個人のみ)/"corporate"(法人のみ)/"mixed"(個人&法人)/"empty"(空欄) から複数可
- 代表・株主一致 (repShareholderMatch): boolean。代表者名が株主欄に含まれる企業のみ
- ロジック (logic): "AND" または "OR"（デフォルト AND）
- 空欄ハンドリング: revenueNullMode / netIncomeNullMode / employeeNullMode / ageNullMode は "" / "include" / "exclude" のいずれか

${currentFilters ? `\n【ユーザーが既に手動で入れている条件】\n${JSON.stringify(currentFilters, null, 2)}\n会話で言及されない条件は維持してください。\n` : ''}

【返却フォーマット】
必ず以下のJSON形式のみを返してください。マークダウンや説明文は不要、JSONのみ：
{
  "summary": "（日本語1〜2文で『〜で検索します』形式の要約）",
  "filters": {
    "keyword": "...",
    "daibunrui": [...],
    "industryHint": "...",
    "prefecture": [...],
    "city": "...",
    "revenueMin": 数値 or null,
    "revenueMax": 数値 or null,
    "revenueNullMode": "",
    "netIncomeMin": 数値 or null,
    "netIncomeMax": 数値 or null,
    "netIncomeNullMode": "",
    "ageMin": 数値 or null,
    "ageMax": 数値 or null,
    "ageNullMode": "",
    "employeeMin": 数値 or null,
    "employeeMax": 数値 or null,
    "employeeNullMode": "",
    "establishedMin": 数値 or null,
    "establishedMax": 数値 or null,
    "phonePattern": "",
    "shareholderType": [],
    "repShareholderMatch": false,
    "logic": "AND"
  },
  "needsClarification": false,
  "clarifyQuestion": null
}

【ルール】
- 値が指定されていない項目は空文字 "" / 空配列 [] / null にする（フィールド自体は省略しない）
- "社員50人以上" → employeeMin: 50（"以上" は inclusive）
- "売上10億円以上" → revenueMin: 1000000（千円単位を厳守）
- "60代" → ageMin: 60, ageMax: 69
- "東京、大阪" → prefecture: ["東京都", "大阪府"]
- 業種が不明確（例：「IT系」「製造業」のような幅広い表現）は industryHint に入れる
- 業種が明らかに大分類リストにある場合は daibunrui にも入れる
- ユーザーが「やっぱり〜も」「追加で〜」と言ったら、過去の会話で定まった条件に上書き／追加する
- 文意が曖昧で確認が必要なときのみ needsClarification: true、clarifyQuestion に日本語で1文の質問を書く
- 絵文字は使わない（プロフェッショナル用途）
- summary は誇張せず、入った条件を正直に列挙
`.trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

    const body: RequestBody = await req.json();
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: 'messages is required' }, 400);
    }
    if (!Array.isArray(body.daibunruiList) || body.daibunruiList.length === 0) {
      return json({ error: 'daibunruiList is required' }, 400);
    }

    // トークン節約のため直近10往復にトリム
    const recent = body.messages.slice(-20);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT(body.daibunruiList, body.currentFilters),
        messages: recent.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[chat-to-filter] Anthropic error', data);
      return json({ error: data.error?.message || 'Anthropic API error' }, res.status);
    }

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    let parsed: {
      summary?: string;
      filters?: Record<string, unknown>;
      needsClarification?: boolean;
      clarifyQuestion?: string | null;
    } = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[chat-to-filter] JSON parse failed', text);
      return json({
        summary: text || '回答を解析できませんでした。もう一度お試しください。',
        filters: null,
        needsClarification: true,
        clarifyQuestion: '条件をもう少し具体的に教えていただけますか？',
      });
    }

    return json({
      summary: parsed.summary || '',
      filters: parsed.filters || null,
      needsClarification: parsed.needsClarification === true,
      clarifyQuestion: parsed.clarifyQuestion || null,
    });
  } catch (err) {
    console.error('[chat-to-filter] Error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
