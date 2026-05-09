// Database 画面 自然言語チャット → 検索条件JSON への変換 Edge Function (v3)
//   - A: keywords[] / industryHints[] を複数返せる
//   - B: 大分類 + 細分類1120個 全リストを system prompt に同梱（prompt caching で2回目以降90%割引）
//   - C: semanticQuery を返せる（pgvector 意味検索用、クライアントが embed-query で埋め込み生成）
//
// 入力: { messages, categoryGroups: [{daibunrui, saibunruis: string[]}], currentFilters? }
// 出力: { summary, filters, needsClarification, clarifyQuestion }

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

interface CategoryGroup {
  daibunrui: string;
  saibunruis: string[];
}

interface RequestBody {
  messages: ChatMessage[];
  categoryGroups: CategoryGroup[];
  currentFilters?: Record<string, unknown>;
}

const STATIC_SYSTEM_PROMPT = (categoryGroups: CategoryGroup[]) => `
あなたは企業データベース検索アシスタントです。ユーザーの自然言語のリクエストから、検索条件を抽出してJSONで返します。

【データベースのスキーマ】

## 業種カテゴリ（TSR分類）
大分類は「コード文字＋空白＋名称」で完全形（例: "E 製造業"）。細分類も完全な文字列を使う。

${categoryGroups.map(g => `### ${g.daibunrui}\n${g.saibunruis.join(', ')}`).join('\n\n')}

## その他のフィールド
- 都道府県 (prefecture): 47都道府県名から複数選択（必ず "東京都"・"大阪府"・"北海道" 等の正式名称）
- 市区町村 (city): 市区郡名（部分一致、文字列）
- 売上高 (revenueMin / revenueMax): 単位は千円。例: 1億円→100000、10億円→1000000、100億円→10000000
- 当期純利益 (netIncomeMin / netIncomeMax): 単位は千円
- 従業員数 (employeeMin / employeeMax): 整数
- 代表者年齢 (ageMin / ageMax): 整数
- 設立年 (establishedMin / establishedMax): 西暦4桁
- 電話番号 (phonePattern): 前方一致パターン（例: "03"、"090"）
- 株主タイプ (shareholderType): "individual"(個人のみ)/"corporate"(法人のみ)/"mixed"(個人&法人)/"empty"(空欄) から複数可
- 代表・株主一致 (repShareholderMatch): boolean
- ロジック (logic): "AND" または "OR"（デフォルト AND）
- 空欄ハンドリング: revenueNullMode / netIncomeNullMode / employeeNullMode / ageNullMode は "" / "include" / "exclude"

## 自由テキスト検索
- keywords (string[]): 企業名 or 事業内容に含まれそうな単語を **複数** 抽出（OR検索）。例: 「素材・鉄鋼・樹脂」→ ["素材","鉄鋼","樹脂"]
- semanticQuery (string | null): ユーザーの意図全体を1〜2文で要約した「意味検索クエリ」。具体的な業態・用途・ニュアンスが含まれているケースで設定（例: "上流工程の素材メーカー"、"自動車向け部品OEM"、"医療機器の研究開発に強い会社"）。単純なフィルタ条件だけのときは null。
- industryHints (string[]): 細分類リストから絞り込む追加ヒント（部分一致用）。saibunrui を直接選べないが業界のニュアンスがあるとき。例: ["樹脂"], ["金属加工"]

## 業種選定の優先順位（recall優先・狭く選びすぎない）
1. ユーザーが明示した業種が **大分類リストに完全一致**するなら daibunrui に入れる
2. **細分類リストから関連しそうな細分類を網羅的に saibunrui に入れる**
   - 「素材・上流工程・BtoB系・OEM・XX加工」のような広概念は、ぱっと見関連しそうなものを **20〜100 個** 選んで構わない
   - 例: 「金属・鉄鋼・樹脂などの素材」→ 製錬／圧延／鋳造／鍛造／プラスチック関連／化学／ガラス／パルプ／セメント／繊維／ゴム／非鉄金属／加工機械／金属製品 等を幅広く
   - **狭く絞りすぎると recall が大幅に下がる** ので、迷ったら入れる方を選ぶ（精度は他のフィルタで補正される）
3. saibunrui だけで拾いきれない概念は keywords にも入れる
   - 重要: keywords は「業種カテゴリ または 企業名/事業内容にキーワード含有」の **OR ブロック**として saibunrui と結合される（AND ではない）。
   - つまり saibunrui に該当する企業 OR 事業内容に keywords を含む企業の和集合になるので、keywords は saibunrui で漏れた企業を救う役割。
4. それでも捉えきれないニュアンス（抽象概念）は semanticQuery で意味検索

【返却フォーマット】必ず以下のJSONのみ返す:
{
  "summary": "（日本語1〜2文で『〜で検索します』形式の要約）",
  "filters": {
    "keywords": ["..."],
    "semanticQuery": "..." or null,
    "daibunrui": ["..."],
    "saibunrui": ["..."],
    "industryHints": ["..."],
    "prefecture": ["..."],
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
- 値が指定されていない項目は空配列 [] / 空文字 "" / null で埋める（フィールド省略禁止）
- "社員50人以上" → employeeMin: 50
- "売上10億円以上" → revenueMin: 1000000（千円単位）
- "60代" → ageMin: 60, ageMax: 69
- "東京、大阪" → prefecture: ["東京都", "大阪府"]
- 過去会話で定まった条件はユーザーが明示的に変更しない限り維持
- 文意が曖昧な時のみ needsClarification: true
- 絵文字禁止
- summary は誇張せず、入った条件を正直に列挙（semanticQuery を使ったときは「意味的に近い〜を上位表示します」のように明記）
`.trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

    const body: RequestBody = await req.json();
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: 'messages is required' }, 400);
    }
    if (!Array.isArray(body.categoryGroups) || body.categoryGroups.length === 0) {
      return json({ error: 'categoryGroups is required' }, 400);
    }

    const recent = body.messages.slice(-20);

    // 動的部分（currentFilters）は別 system block で短く
    const dynamicSuffix = body.currentFilters
      ? `\n\n【ユーザーが既に手動で入れている条件】\n${JSON.stringify(body.currentFilters, null, 2)}\n会話で言及されない条件は維持してください。`
      : '';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: [
          {
            type: 'text',
            text: STATIC_SYSTEM_PROMPT(body.categoryGroups),
            cache_control: { type: 'ephemeral' },  // ← 2回目以降90%割引
          },
          ...(dynamicSuffix ? [{ type: 'text', text: dynamicSuffix }] : []),
        ],
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
      usage: data.usage || null,
    });
  } catch (err) {
    console.error('[chat-to-filter] error', err);
    return json({ error: (err as Error).message }, 500);
  }
});
