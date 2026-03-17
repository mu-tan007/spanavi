import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

const INDUSTRY_MAP = {
  '製造': ['製造', '製造②', 'ニッチ製造', '食品製造①', '食品製造②', '食品製造③', '食品製造④', '食品製造⑤', '食品関連', '食料品製造', '食料飲料卸', '食肉関連', '給食', '福祉用具', '金属製品', '溶接・加工', '表面処理', '衣服裁縫修理業', '古紙', 'エレベーター'],
  'IT': ['IT', 'IT・人材', 'IT・人材②', 'IT・人材派遣', 'IT・人材派遣②', '人材派遣', '受託開発', '情報通信'],
  '建設': ['建設', '建築', '土木・建築', '建設コンサルタント', 'ビルメンテナンス', '建物サービス業', '電気工事', '電気・設備工事事業', '管工事', 'リフォーム工事', 'サブコン', '産業廃棄物処理'],
  '物流': ['物流', '倉庫業', '倉庫・不動産管理', 'タクシー', '自動車整備', '自動車・電子機械器具卸', 'ガス'],
  '全業種': ['全業種', '全業種①', '全業種②', '全業種③', '全業種④', '全業種⑤', 'リユース', 'ゴルフ'],
  '医療・ヘルスケア': ['介護', '動物病院', '調剤薬局'],
  '不動産': ['不動産', '不動産管理', '不動産管理②'],
  '飲食': ['飲食業'],
  'サービス': ['リネンサプライ', '税理士法人', '警備業'],
};

const INDUSTRY_RULES = {
  '製造': {
    label: 'Manufacturing',
    successRate: '後継者不在率 42.4% ／ M&A成約件数 業界No.1',
    goldenTime: ['8〜10時', '13〜14時（昼休憩後）', '16〜18時'],
    presidentPattern: '10〜15時は工場・現場確認に出ていることが多い。工場があるため自宅兼事務所はほぼなく、事務所番号に電話。',
    painPoints: ['設備の老朽化・設備投資の重さ', '技術者の高齢化', '後継者問題'],
  },
  'IT': {
    label: 'IT',
    successRate: '後継者不在率 高い ／ 創業者オーナー企業が多く1回目の事業承継タイミングの企業が多い',
    goldenTime: ['月曜の朝（ミーティングで出社しているケースが多い）', '10〜11時', '15〜17時'],
    presidentPattern: 'フレックス・リモート勤務が多く在席時間が読みにくいが、比較的在宅率が高い。自宅兼事務所率が非常に高い（特に小規模）。家業化していないためM&Aへの心理的抵抗感が低い。',
    painPoints: ['エンジニア人材の確保・採用難', '2次請け・3次請け構造からの脱却', '創業者の出口戦略'],
  },
  '建設': {
    label: 'Construction',
    successRate: '後継者不在率 57.3%（全業種中最高水準）',
    goldenTime: ['8〜10時（現場出発前）', '16〜18時（現場から帰社後）', '雨の日は終日チャンス'],
    presidentPattern: '10〜15時は現場巡回に出ていることが多い。売上1億円未満の会社ほど自宅兼事務所率が高く、社長が直接電話に出やすい。',
    painPoints: ['職人の高齢化・技術継承問題', '人手不足'],
  },
  '物流': {
    label: 'Logistics',
    successRate: '後継者不在率 高い ／ 2024年問題で業界全体がM&Aに積極化',
    goldenTime: ['8〜10時（ドライバー出発後）', '13〜14時（昼休憩後）', '16〜18時（ドライバー帰社後）'],
    presidentPattern: '早朝から動いており日中は外出・配車管理が中心。2024年問題の影響を直接受けており、大手グループ傘下へのM&Aを現実的に検討し始めている会社が多い。',
    painPoints: ['ドライバー不足・採用難', '2024年問題', '燃料費高騰'],
  },
  '全業種': {
    label: 'All Industries',
    successRate: '全業種共通',
    goldenTime: ['10〜11時', '14〜16時'],
    presidentPattern: '業種を問わず架電可能なリスト。リユース業は個人オーナーが多く、社長直通になりやすい。',
    painPoints: ['後継者問題', '人手不足', '業績の先行き不安'],
  },
  '医療・ヘルスケア': {
    label: 'Healthcare',
    successRate: '後継者不在率 高い ／ 調剤薬局は業界再編が加速中',
    goldenTime: ['13〜15時（午後診療・業務開始前の空き時間が最も確実）'],
    presidentPattern: '診療・業務スケジュールで1日が完全固定されており空き時間が限られる。受付スタッフによるブロックが強い業種のひとつ。',
    painPoints: ['後継者問題', '医師・看護師・介護士不足', '設備投資の重さ', '調剤報酬改定（調剤薬局）'],
  },
  '不動産': {
    label: 'Real Estate',
    successRate: '後継者不在率 中程度 ／ 従業員10名未満の事業者が9割以上',
    goldenTime: ['9〜10時（開店直後）', '16〜17時（夕方の来客が落ち着く時間帯）'],
    presidentPattern: '物件案内で日中は外出していることが多い。水曜・日曜は避けた方が無難。小規模事務所が多く社長が直接電話に出ることも多い。',
    painPoints: ['市場縮小・人口減少エリアの将来不安', '後継者問題'],
  },
  '飲食': {
    label: 'Food & Beverage',
    successRate: '後継者不在率 中程度',
    goldenTime: ['10〜11時（仕込み開始前）', '14〜16時（ランチ後・ディナー仕込み前）'],
    presidentPattern: '仕込みと営業時間の合間が唯一の電話対応できる窓。個人店オーナーは感情的に動きやすく、雑談からアポに繋がりやすいケースもある。',
    painPoints: ['食材・光熱費の高騰', '人手不足・アルバイト採用難', '後継者問題'],
  },
  'サービス': {
    label: 'Services',
    successRate: '後継者不在率 高い ／ 税理士法人は業界再編が急加速中',
    goldenTime: ['10〜11時', '15〜17時'],
    presidentPattern: '業種によって行動パターンが異なる。税理士法人は顧問先訪問で外出が多いが、事務所規模が小さく所長が直接電話に出る率が高い。警備業は24時間体制のため時間帯を問わず繋がりやすい。',
    painPoints: ['高齢化・後継者問題', '規模の経済・合併ニーズ', '人手不足'],
  },
};

// industryフィールドから業種カテゴリを逆引き
function resolveCategory(industry) {
  if (!industry) return null;
  for (const [cat, list] of Object.entries(INDUSTRY_MAP)) {
    if (list.includes(industry)) return cat;
  }
  return null;
}

function IndustryCard({ name, rule, highlight }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid ' + (highlight ? GOLD : C.borderLight),
      borderLeft: '3px solid ' + (highlight ? GOLD : C.borderLight),
      padding: '16px 20px',
      animation: 'fadeIn 0.3s ease',
      boxShadow: highlight ? '0 0 0 2px ' + GOLD + '20' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{name}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textLight, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{rule.label}</span>
        </div>
        {highlight && (
          <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid ' + GOLD + '60', borderRadius: 3, padding: '2px 6px' }}>
            現在のリスト
          </span>
        )}
      </div>

      {/* Success Rate */}
      <div style={{ fontSize: 11, color: '#374151', background: '#F8F9FA', borderRadius: 4, padding: '5px 10px', marginBottom: 12, fontWeight: 500 }}>
        {rule.successRate}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* Golden Time */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            Golden Time
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rule.goldenTime.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, flexShrink: 0, marginTop: 5 }} />
                <span style={{ fontSize: 11, color: C.textDark, lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* President Pattern */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: NAVY, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            President Pattern
          </div>
          <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, margin: 0 }}>{rule.presidentPattern}</p>
        </div>

        {/* Pain Points */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.orange, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            Pain Points
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rule.painPoints.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: 1, background: C.orange, flexShrink: 0, marginTop: 5 }} />
                <span style={{ fontSize: 11, color: C.textDark, lineHeight: 1.5 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RulesView({ currentIndustry }) {
  const activeCategory = resolveCategory(currentIndustry);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Industry Rules
        </div>
        <div style={{ fontSize: 13, color: C.textMid }}>
          業種別の架電ゴールデンタイム・社長の行動パターン・刺さる痛点
        </div>
        {activeCategory && (
          <div style={{ marginTop: 8, fontSize: 11, color: GOLD, fontWeight: 600 }}>
            現在のリスト業種「{currentIndustry}」→ {activeCategory} カテゴリを強調表示中
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(INDUSTRY_RULES).map(([name, rule]) => (
          <IndustryCard
            key={name}
            name={name}
            rule={rule}
            highlight={activeCategory === name}
          />
        ))}
      </div>
    </div>
  );
}
