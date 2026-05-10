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
- 手数料体系 - FA譲渡側 (feeFaSeller): "" / "yes"(成功報酬有り) / "no"
- 手数料体系 - FA譲受側 (feeFaBuyer): "" / "yes" / "no"
- 手数料体系 - 仲介譲渡側 (feeBrokerSeller): "" / "yes" / "no"
- 手数料体系 - 仲介譲受側 (feeBrokerBuyer): "" / "yes" / "no"
- 接触ステータス (statuses): **配列**。["not_contacted"](未接触)/["contacted"](接触済)/["partner"](取引先)を任意に組み合わせ可。複数指定で OR 結合。空配列 [] ですべて。
  - 取引先(partner) = 当社の CRM clients に「支援中/準備中/停止中/保留」として登録されている機関
- 連絡先有無 (contact): "" / "any"(メールorフォームあり) / "email"(メアドあり) / "form"(フォームのみ・メアド無) / "none"(連絡先なし)
- 自由テキスト (keywords): 機関名や所在地に含まれそうな単語の配列。OR/AND は logic で指定
- ロジック (logic): "AND" または "OR" (デフォルト AND)

## 値マッピングの目安

### 地域 (prefectures)
- 「首都圏」「関東」「東京近郊」 → ["東京都","神奈川県","千葉県","埼玉県"]
- 「北関東」 → ["茨城県","栃木県","群馬県"]
- 「南関東」 → ["東京都","神奈川県","千葉県","埼玉県"]
- 「関西」「近畿」 → ["大阪府","京都府","兵庫県","奈良県","滋賀県","和歌山県"]
- 「東海」「中部」 → ["愛知県","岐阜県","三重県","静岡県"]
- 「北陸」 → ["新潟県","富山県","石川県","福井県"]
- 「甲信越」 → ["新潟県","山梨県","長野県"]
- 「中国地方」 → ["鳥取県","島根県","岡山県","広島県","山口県"]
- 「四国」 → ["徳島県","香川県","愛媛県","高知県"]
- 「九州」 → ["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県"]
- 「九州・沖縄」「南九州」 → 上記+["沖縄県"]
- 「東北」 → ["青森県","岩手県","宮城県","秋田県","山形県","福島県"]
- 「北海道・東北」 → ["北海道", ...東北]
- 「東日本」 → 北海道 + 東北 + 関東 + 甲信越 + 北陸 + 静岡県 (約23県)
- 「西日本」 → 関西 + 中国 + 四国 + 九州・沖縄 + 三重県 + 愛知県 + 岐阜県 (約24県)
- 「政令市レベル」「3大都市圏」 → ["東京都","大阪府","愛知県"]
- 「全国」「全件」「どこでもいい」 → prefectures: [] (空配列で全国)

### 規模 (staffMin / staffMax)
- 「個人事務所規模」「小規模」「個人事務所系」 → staffMin: 1, staffMax: 3
- 「中堅」「中規模」 → staffMin: 4, staffMax: 20
- 「大手」「大規模」「大規模機関」 → staffMin: 21
- 「超大手」 → staffMin: 50
- 「3人以上」「複数人体制」「最低3人」 → staffMin: 3
- 「10人以上」 → staffMin: 10
- 「専従者がいる機関」「専門会社」「専門人材を抱える」 → excludeStaffNull: true (登録のある機関のみ)

### 手数料体系 (feeFaSeller / feeFaBuyer / feeBrokerSeller / feeBrokerBuyer)
- 「FAやってる」「FA可能」「FA業務あり」 → feeFaSeller: "yes" AND feeFaBuyer: "yes"
- 「FA専門」「FAだけやってる」 → feeFaSeller: "yes", feeFaBuyer: "yes", feeBrokerSeller: "no", feeBrokerBuyer: "no"
- 「仲介やってる」「仲介可能」 → feeBrokerSeller: "yes" AND feeBrokerBuyer: "yes"
- 「仲介専門」「仲介だけ」 → feeBrokerSeller: "yes", feeBrokerBuyer: "yes", feeFaSeller: "no", feeFaBuyer: "no"
- 「FAも仲介もやってる」「両方対応」 → 4つ全部 "yes"
- 「売り手側に強い」「譲渡側専門」 → feeFaSeller: "yes" or feeBrokerSeller: "yes"
- 「買い手側支援」「譲受側専門」 → feeFaBuyer: "yes" or feeBrokerBuyer: "yes"
- 「事業承継特化」「事業承継支援」 → 譲渡側 (feeFaSeller / feeBrokerSeller) を "yes" + keywords に「事業承継」を入れない (機関名にあまり含まれない)。手数料体系で表現する。

### 接触ステータス (statuses) — 配列で複数指定可
- 「未接触」「まだアプローチしてない」「新規開拓候補」「未開拓」 → statuses: ["not_contacted"]
- 「接触済み」「すでに連絡した」「アプローチ済み」 → statuses: ["contacted"]
- 「取引先」「うちのクライアント」「契約のある機関」「支援中の機関」「自社が支援している機関」 → statuses: ["partner"]
- 「接触済みと取引先」「接触済 OR 取引先」「すでに何らかの関係がある機関」 → statuses: ["contacted", "partner"]
- 「未接触と接触済み」 → statuses: ["not_contacted", "contacted"]
- 「全部」「全ステータス」 → statuses: []
- 「取引先と接触済みを除いて」「未接触のみ」「新規開拓リスト」 → statuses: ["not_contacted"] (取引先と接触済みは含まない)

### 連絡先有無 (contact)
- 「メアドあり」「メールアドレスがある機関」「すぐメール送れる機関」 → contact: "email"
- 「フォームしか連絡先ない」「問い合わせフォームだけ」 → contact: "form"
- 「連絡先がある機関」「どっちかでも連絡先取れる」 → contact: "any"
- 「連絡先なし」「連絡先未取得」「アタックリストの新規候補」 → contact: "none"
- 「すぐ配信できる機関」 → contact: "any" + statuses: ["not_contacted"] の組み合わせも可

### キーワード (keywords)
- 「会計事務所」「税理士法人」「コンサル」「FAS」「監査法人」「投資銀行」「ブティック」など、機関名に含まれそうな業態の語 → keywords に入れる (AND/OR は logic で)
- 「○○系」「××派」のような曖昧表現は keywords に入れて OR
- 重要: keywords は機関名 (name) と本店所在地 (prefecture) に対する ILIKE。事業内容の自由テキスト DB 列は無いため、keywords は機関名から推測されるパターンに限定する。

## デフォルトの logic
- 業態キーワード（会計事務所/税理士法人/コンサル など）の組み合わせは **OR** 推奨
- 規模 + 地域 + 手数料 など、性質の違うフィルタを束ねるときは **AND** がデフォルト
- ユーザーが「○○または××」と言ったら logic: "OR"
- 「○○かつ××」「○○で××」と言ったら logic: "AND"

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
    "feeFaSeller": "",
    "feeFaBuyer": "",
    "feeBrokerSeller": "",
    "feeBrokerBuyer": "",
    "statuses": [],
    "contact": ""
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
