// MASP Firms (cap_ma_agencies) 自然言語チャット → 検索条件JSON への変換 Edge Function
//   - chat-to-filter (TSR 業種版) のフォーク
//   - スキーマは中小企業庁 M&A支援機関データベース (cap_ma_agencies) 用
//   - prompt は短い (TSR 1120分類のような巨大データ無し) → cache hit でなくても応答1〜2秒
//
// 入力: { messages, currentFilters? }
// 出力: { summary, filters, needsClarification, clarifyQuestion }
//
// filters のシェイプ:
// {
//   keywords: string[],        // 機関名/所在地に含まれそうな語 (AND/OR は logic で指定)
//   logic: 'AND' | 'OR',
//   prefectures: string[],     // 47都道府県名
//   staffMin: number | null,   // M&A専従者数下限
//   staffMax: number | null,   // M&A専従者数上限
//   excludeStaffNull: boolean, // 専従者数未登録を除外
//   infoSharing: '' | 'yes' | 'no',
//   feeFaSeller: '' | 'yes' | 'no',
//   feeFaBuyer: '' | 'yes' | 'no',
//   feeBrokerSeller: '' | 'yes' | 'no',
//   feeBrokerBuyer: '' | 'yes' | 'no',
//   status: '' | 'not_contacted' | 'contacted'
// }

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
  messages: ChatMessage[];
  currentFilters?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `
あなたは「M&A支援機関データベース」検索アシスタントです。ユーザーの自然言語のリクエストから、検索条件を抽出してJSONで返します。
このDBは中小企業庁の登録M&A支援機関一覧 (約3400社、cap_ma_agencies テーブル) を扱います。

【データベースのスキーマ】

## 検索可能なフィールド
- 都道府県 (prefectures): 47都道府県名から複数選択。本店所在地。例: ["東京都","大阪府"]
- M&A専従者数 (staffMin / staffMax): 整数。M&A業務専従者の人数の下限/上限
- 専従者数 NULL 除外 (excludeStaffNull): boolean。未登録の機関を除外する場合 true
- 情報共有の仕組みへの加盟 (infoSharing): "" / "yes" / "no"
- 手数料体系 - FA譲渡側 (feeFaSeller): "" / "yes"(成功報酬有り) / "no"
- 手数料体系 - FA譲受側 (feeFaBuyer): "" / "yes" / "no"
- 手数料体系 - 仲介譲渡側 (feeBrokerSeller): "" / "yes" / "no"
- 手数料体系 - 仲介譲受側 (feeBrokerBuyer): "" / "yes" / "no"
- 接触ステータス (status): "" / "not_contacted"(未接触) / "contacted"(接触済)
- 自由テキスト (keywords): 機関名や所在地に含まれそうな単語の配列。OR/AND は logic で指定
- ロジック (logic): "AND" または "OR" (デフォルト AND)

## 値マッピングの目安
- 「東京・神奈川・千葉・埼玉」「首都圏」→ prefectures: ["東京都","神奈川県","千葉県","埼玉県"]
- 「関西」 → ["大阪府","京都府","兵庫県","奈良県","滋賀県","和歌山県"]
- 「東海」 → ["愛知県","岐阜県","三重県","静岡県"]
- 「九州」 → ["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]
- 「3人以上」「複数人体制」 → staffMin: 3
- 「専門会社」「専従者がいる機関」 → excludeStaffNull: true
- 「FAやってる」「FA可能」 → feeFaSeller か feeFaBuyer のいずれか or 両方を "yes"
- 「仲介専門」 → feeBrokerSeller: "yes" or feeBrokerBuyer: "yes" (両方推奨)
- 「未接触の機関だけ」 → status: "not_contacted"
- 「会計事務所」「税理士法人」「コンサル」のような業態キーワード → keywords に入れて OR (デフォルトは AND だが業態は OR が自然)

【返却フォーマット】必ず以下のJSONのみ返す:
{
  "summary": "（日本語1〜2文で『〜で検索します』形式の要約）",
  "filters": {
    "keywords": ["..."],
    "logic": "AND",
    "prefectures": ["..."],
    "staffMin": 数値 or null,
    "staffMax": 数値 or null,
    "excludeStaffNull": false,
    "infoSharing": "",
    "feeFaSeller": "",
    "feeFaBuyer": "",
    "feeBrokerSeller": "",
    "feeBrokerBuyer": "",
    "status": ""
  },
  "needsClarification": false,
  "clarifyQuestion": null
}

【ルール】
- 値が指定されていない項目は空配列 [] / 空文字 "" / null / false で埋める（フィールド省略禁止）
- 過去会話で定まった条件はユーザーが明示的に変更しない限り維持
- 文意が曖昧な時のみ needsClarification: true で clarifyQuestion を設定
- 絵文字禁止
- summary は誇張せず、入った条件を正直に列挙
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

    const recent = body.messages.slice(-20);

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
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
          ...(dynamicSuffix ? [{ type: 'text', text: dynamicSuffix }] : []),
        ],
        messages: recent.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[chat-to-filter-agency] Anthropic error', data);
      return json({ error: data.error?.message || 'Anthropic API error', detail: data }, res.status);
    }

    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    if (!text) {
      console.error('[chat-to-filter-agency] empty text', JSON.stringify(data).slice(0, 1000));
      return json({
        summary: 'AIからの応答が空でした。',
        filters: null,
        needsClarification: true,
        clarifyQuestion: 'もう一度お試しください。',
      });
    }

    let parsed: {
      summary?: string;
      filters?: Record<string, unknown>;
      needsClarification?: boolean;
      clarifyQuestion?: string | null;
    } = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[chat-to-filter-agency] JSON parse failed', text);
      return json({
        summary: text || '回答を解析できませんでした。',
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
    console.error('[chat-to-filter-agency] error', err);
    return json({ error: (err as Error).message }, 500);
  }
});
