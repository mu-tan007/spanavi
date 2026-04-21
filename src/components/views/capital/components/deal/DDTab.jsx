import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const CATEGORIES = [
  { key: 'commercial', label: '商業DD',     hint: '市場/競合/顧客/成長ドライバー' },
  { key: 'financial',  label: '財務DD',     hint: 'QoE/運転資本/CAPEX/ネットデット' },
  { key: 'legal',      label: '法務DD',     hint: '契約/訴訟/許認可/知財' },
  { key: 'hr',         label: '人事DD',     hint: 'キーマン/組織/報酬/リテンション' },
  { key: 'it_ops',     label: 'IT・オペDD', hint: 'システム/BCP/サイバー/オペ' },
  { key: 'tax',        label: '税務DD',     hint: '税体系/コンプラ/繰越欠損金' },
  { key: 'esg',        label: 'ESG/サステナ', hint: 'E/S/G 各論、土壌汚染等' },
]

const STATUS_STYLE = {
  pending:      { bg: '#F3F2F2', color: '#A0A0A0', label: '未対応' },
  requested:    { bg: '#F8F8F8', color: '#032D60', label: '依頼済' },
  received:     { bg: '#E1F5EE', color: '#2E844A', label: '受領済' },
  issue_found:  { bg: '#FAF3E0', color: '#A08040', label: '要確認' },
  cleared:      { bg: '#032D60', color: '#fff',    label: '完了' },
}

const DD_TEMPLATES = {
  commercial: [
    '対象市場の規模・成長率 (TAM/SAM/SOM)',
    '主要競合・市場シェア',
    '顧客集中度 (上位5-10社シェア)',
    'チャネル・販売チャネル構成',
    '成長ドライバー・構造変化',
    '参入障壁・差別化要因',
    '顧客/取引先インタビュー',
    '価格弾力性・値上げ余地',
  ],
  financial: [
    '過去3-5期財務諸表',
    'QoE (ワンタイム損益調整後 EBITDA)',
    '月次試算表 (直近)',
    '運転資本サイクル (DSO/DPO/DIO)',
    '維持CAPEX vs 成長CAPEX',
    '予算精度 (予実対比)',
    '事業別・セグメント別収益性',
    '借入・有利子負債・コミットメント',
    'ネットデット調整項目',
    '固定資産台帳',
  ],
  legal: [
    '定款・登記事項証明書',
    '重要契約書 (顧客/仕入/ライセンス)',
    '訴訟・係争・クレーム一覧',
    '許認可・ライセンス一覧',
    '知的財産権 (特許/商標/著作)',
    '独禁法・競争法コンプラ',
    '個人情報保護・GDPR対応',
    '株主/出資関係書類',
  ],
  hr: [
    '組織図・階層・人員数推移',
    'キーマン特定・離職リスク',
    '役員報酬・ESOP',
    '就業規則・労働協約',
    '未払い残業・労務リスク',
    '退職金規程・DB/DC',
    '社員満足度・離職率',
    '後継者計画',
  ],
  it_ops: [
    '主要システム一覧・構成図',
    'SaaS/ライセンス契約',
    'セキュリティポリシー・インシデント履歴',
    'BCP/DR計画',
    'データ保護・バックアップ',
    '主要オペレーションプロセス',
    'サプライチェーン依存度',
    'ベンダー集中度・契約更新リスク',
  ],
  tax: [
    '過去3-5期法人税申告書',
    '税務調査履歴・指摘事項',
    '繰越欠損金・税額控除',
    '消費税申告・経過措置',
    '移転価格税制・国際税務',
    'タックスストラクチャリング余地',
  ],
  esg: [
    '環境規制対応状況・許認可',
    '土壌汚染・環境リスク調査',
    'CO2排出量・削減目標',
    '労働安全衛生',
    'ガバナンス体制',
    'サプライチェーンESG',
    '社会インパクト・CSR',
  ],
}

export default function DDTab({ dealId }) {
  const qc = useQueryClient()
  const [activeCategory, setActiveCat] = useState('commercial')
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['dd', dealId],
    queryFn: async () => {
      const { data } = await supabase.from('deal_dd_checklists').select('*').eq('deal_id', dealId).order('created_at')
      return data || []
    },
  })

  async function addFromTemplate() {
    const templates = DD_TEMPLATES[activeCategory] || []
    const existing = items.filter(i => i.category === activeCategory).map(i => i.item)
    const toAdd = templates.filter(t => !existing.includes(t))
    if (toAdd.length === 0) return
    await supabase.from('deal_dd_checklists').insert(
      toAdd.map(item => ({ deal_id: dealId, category: activeCategory, item, status: 'pending' }))
    )
    qc.invalidateQueries({ queryKey: ['dd', dealId] })
  }

  async function addCustom(e) {
    e.preventDefault()
    if (!newItem.trim()) return
    await supabase.from('deal_dd_checklists').insert({ deal_id: dealId, category: activeCategory, item: newItem.trim(), status: 'pending' })
    qc.invalidateQueries({ queryKey: ['dd', dealId] })
    setNewItem('')
    setAdding(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('deal_dd_checklists').update({ status }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['dd', dealId] })
  }

  const filtered = items.filter(i => i.category === activeCategory)
  const total = items.length
  const cleared = items.filter(i => i.status === 'cleared').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Progress */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>DD進捗</div>
          <div style={{ fontSize: 12, color: '#032D60', fontWeight: 500 }}>{cleared} / {total} 完了</div>
        </div>
        <div style={{ height: 6, background: '#F3F2F2', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: total > 0 ? `${(cleared/total)*100}%` : '0%', height: '100%', background: '#032D60', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_STYLE).map(([k, s]) => {
            const count = items.filter(i => i.status === k).length
            return count > 0 ? (
              <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: s.bg, color: s.color }}>
                {s.label} {count}
              </span>
            ) : null
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14 }}>

        {/* Category sidebar */}
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: '8px 0', height: 'fit-content' }}>
          {CATEGORIES.map(c => {
            const count = items.filter(i => i.category === c.key).length
            const done  = items.filter(i => i.category === c.key && i.status === 'cleared').length
            return (
              <div key={c.key} onClick={() => setActiveCat(c.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 14px', cursor: 'pointer', fontSize: 12,
                  color: activeCategory === c.key ? '#032D60' : '#706E6B',
                  background: activeCategory === c.key ? '#F3F2F2' : 'transparent',
                  fontWeight: activeCategory === c.key ? 500 : 400,
                }}>
                <span>{c.label}</span>
                {count > 0 && <span style={{ fontSize: 10, color: done === count ? '#2E844A' : '#A0A0A0' }}>{done}/{count}</span>}
              </div>
            )
          })}
        </div>

        {/* Items */}
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>
                {CATEGORIES.find(c => c.key === activeCategory)?.label}
              </div>
              <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2 }}>
                {CATEGORIES.find(c => c.key === activeCategory)?.hint}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addFromTemplate}
                style={{ height: 28, padding: '0 10px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, color: '#706E6B', cursor: 'pointer' }}>
                テンプレから追加
              </button>
              <button onClick={() => setAdding(true)}
                style={{ height: 28, padding: '0 10px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 11, color: '#fff', cursor: 'pointer' }}>
                + 追加
              </button>
            </div>
          </div>

          {isLoading ? (
            <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '20px 0' }}>読み込み中...</div>
          ) : filtered.length === 0 && !adding ? (
            <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '20px 0' }}>
              項目がありません。テンプレートから追加してください。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {filtered.map((item, i) => {
                const ss = STATUS_STYLE[item.status] || STATUS_STYLE.pending
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #f0f2f5' }}>
                    <div style={{ flex: 1, fontSize: 12, color: item.status === 'cleared' ? '#E5E5E5' : '#FFFFFF',
                      textDecoration: item.status === 'cleared' ? 'line-through' : 'none' }}>
                      {item.item}
                    </div>
                    {item.risk_note && (
                      <div style={{ fontSize: 10, color: '#A08040', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ⚠ {item.risk_note}
                      </div>
                    )}
                    <select value={item.status} onChange={e => updateStatus(item.id, e.target.value)}
                      style={{ height: 26, padding: '0 6px', border: `0.5px solid ${ss.bg === '#F3F2F2' ? '#E5E5E5' : ss.bg}`, borderRadius: 4, fontSize: 10, background: ss.bg, color: ss.color, cursor: 'pointer', outline: 'none' }}>
                      {Object.entries(STATUS_STYLE).map(([v, s]) => (
                        <option key={v} value={v}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          )}

          {adding && (
            <form onSubmit={addCustom} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input autoFocus value={newItem} onChange={e => setNewItem(e.target.value)}
                placeholder="確認項目を入力..."
                style={{ flex: 1, height: 32, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }} />
              <button type="submit" style={{ height: 32, padding: '0 12px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 12, color: '#fff', cursor: 'pointer' }}>追加</button>
              <button type="button" onClick={() => setAdding(false)}
                style={{ height: 32, padding: '0 10px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, color: '#706E6B', cursor: 'pointer' }}>×</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
