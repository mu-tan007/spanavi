import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Card } from '../../../../ui'

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
  pending:      { bg: color.gray100, color: color.textLight, label: '未対応' },
  requested:    { bg: color.gray50, color: color.navy, label: '依頼済' },
  received:     { bg: color.successSoft, color: color.success, label: '受領済' },
  issue_found:  { bg: color.warnSoft, color: '#A08040', label: '要確認' },
  cleared:      { bg: color.navy, color: color.white, label: '完了' },
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
      const { data } = await supabase.from('cap_deal_dd_checklists').select('*').eq('deal_id', dealId).order('created_at')
      return data || []
    },
  })

  async function addFromTemplate() {
    const templates = DD_TEMPLATES[activeCategory] || []
    const existing = items.filter(i => i.category === activeCategory).map(i => i.item)
    const toAdd = templates.filter(t => !existing.includes(t))
    if (toAdd.length === 0) return
    await supabase.from('cap_deal_dd_checklists').insert(
      toAdd.map(item => ({ deal_id: dealId, category: activeCategory, item, status: 'pending' }))
    )
    qc.invalidateQueries({ queryKey: ['dd', dealId] })
  }

  async function addCustom(e) {
    e.preventDefault()
    if (!newItem.trim()) return
    await supabase.from('cap_deal_dd_checklists').insert({ deal_id: dealId, category: activeCategory, item: newItem.trim(), status: 'pending' })
    qc.invalidateQueries({ queryKey: ['dd', dealId] })
    setNewItem('')
    setAdding(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('cap_deal_dd_checklists').update({ status }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['dd', dealId] })
  }

  const filtered = items.filter(i => i.category === activeCategory)
  const total = items.length
  const cleared = items.filter(i => i.status === 'cleared').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Progress */}
      <Card padding="md">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textLight }}>DD進捗</div>
          <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.medium }}>{cleared} / {total} 完了</div>
        </div>
        <div style={{ height: 6, background: color.gray100, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: total > 0 ? `${(cleared/total)*100}%` : '0%', height: '100%', background: color.navy, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_STYLE).map(([k, s]) => {
            const count = items.filter(i => i.status === k).length
            return count > 0 ? (
              <span key={k} style={{ fontSize: font.size.xs, padding: '2px 7px', borderRadius: radius.sm, background: s.bg, color: s.color }}>
                {s.label} {count}
              </span>
            ) : null
          })}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14 }}>

        {/* Category sidebar */}
        <Card padding="none" style={{ height: 'fit-content', padding: '8px 0' }}>
          {CATEGORIES.map(c => {
            const count = items.filter(i => i.category === c.key).length
            const done  = items.filter(i => i.category === c.key && i.status === 'cleared').length
            return (
              <div key={c.key} onClick={() => setActiveCat(c.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 14px', cursor: 'pointer', fontSize: font.size.sm,
                  color: activeCategory === c.key ? color.navy : color.textLight,
                  background: activeCategory === c.key ? color.gray100 : 'transparent',
                  fontWeight: activeCategory === c.key ? font.weight.medium : font.weight.normal,
                }}>
                <span>{c.label}</span>
                {count > 0 && <span style={{ fontSize: font.size.xs, color: done === count ? color.success : color.gray400 }}>{done}/{count}</span>}
              </div>
            )
          })}
        </Card>

        {/* Items */}
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: color.navy }}>
                {CATEGORIES.find(c => c.key === activeCategory)?.label}
              </div>
              <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>
                {CATEGORIES.find(c => c.key === activeCategory)?.hint}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={addFromTemplate}>
                テンプレから追加
              </Button>
              <Button size="sm" onClick={() => setAdding(true)}>
                + 追加
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div style={{ fontSize: font.size.sm, color: color.textLight, textAlign: 'center', padding: '20px 0' }}>読み込み中...</div>
          ) : filtered.length === 0 && !adding ? (
            <div style={{ fontSize: font.size.sm, color: color.textLight, textAlign: 'center', padding: '20px 0' }}>
              項目がありません。テンプレートから追加してください。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {filtered.map((item, i) => {
                const ss = STATUS_STYLE[item.status] || STATUS_STYLE.pending
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${color.borderLight}` }}>
                    <div style={{ flex: 1, fontSize: font.size.sm, color: item.status === 'cleared' ? color.border : color.white,
                      textDecoration: item.status === 'cleared' ? 'line-through' : 'none' }}>
                      {item.item}
                    </div>
                    {item.risk_note && (
                      <div style={{ fontSize: font.size.xs, color: '#A08040', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ⚠ {item.risk_note}
                      </div>
                    )}
                    <select value={item.status} onChange={e => updateStatus(item.id, e.target.value)}
                      style={{ height: 26, padding: '0 6px', border: `0.5px solid ${ss.bg === color.gray100 ? color.border : ss.bg}`, borderRadius: radius.md, fontSize: font.size.xs, background: ss.bg, color: ss.color, cursor: 'pointer', outline: 'none' }}>
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
              <Input size="sm" autoFocus value={newItem} onChange={e => setNewItem(e.target.value)}
                placeholder="確認項目を入力..."
                containerStyle={{ flex: 1 }} />
              <Button type="submit" size="sm">追加</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>×</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
