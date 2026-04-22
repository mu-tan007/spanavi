import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const PHASES = [
  { key: 'day100', label: '100日計画' },
  { key: 'day180', label: '180日' },
  { key: 'year1',  label: '1年目' },
  { key: 'ongoing', label: '継続' },
]
const CATEGORIES = ['org','system','finance','hr','sales','culture','other']
const CAT_LABELS = { org:'組織', system:'システム', finance:'財務', hr:'人事', sales:'営業', culture:'文化', other:'その他' }
const STATUS_STYLE = {
  not_started: { bg: '#F3F2F2', color: '#A0A0A0', label: '未着手' },
  in_progress: { bg: '#F8F8F8', color: '#032D60', label: '進行中' },
  done:        { bg: '#E1F5EE', color: '#2E844A', label: '完了' },
  delayed:     { bg: '#FAF3E0', color: '#A08040', label: '遅延' },
}

const PMI_TEMPLATES = {
  day100: [
    { category: 'org',     title: '経営チームとの信頼関係構築' },
    { category: 'org',     title: '組織図・役割分担の確定' },
    { category: 'finance', title: '月次報告体制の構築' },
    { category: 'finance', title: '銀行口座・経理フロー統合' },
    { category: 'hr',      title: '主要人材の処遇確定・流出防止' },
    { category: 'system',  title: '基幹システム連携方針の決定' },
    { category: 'sales',   title: '既存顧客への挨拶・関係維持' },
    { category: 'culture', title: '企業文化・価値観の共有' },
  ],
}

// Day 1 必須チェックリスト (クロージング当日)
const DAY1_CHECKLIST = [
  { category: 'org',     title: '新経営陣の発表' },
  { category: 'org',     title: '取締役会の改組・新役員就任' },
  { category: 'finance', title: '銀行口座の権限切替' },
  { category: 'finance', title: '支払い承認フローの移管' },
  { category: 'hr',      title: '全社員への通達' },
  { category: 'hr',      title: 'キーマンへの継続確認' },
  { category: 'system',  title: 'アクセス権限の棚卸し' },
  { category: 'sales',   title: '主要顧客への通達' },
]

export default function PMITab({ dealId }) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState('day100')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCat, setNewCat] = useState('org')

  const { data: tasks = [] } = useQuery({
    queryKey: ['pmi', dealId],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deal_pmi_tasks').select('*').eq('deal_id', dealId).order('created_at')
      return data || []
    },
  })

  async function addFromTemplate() {
    const templates = PMI_TEMPLATES[phase] || []
    const existing = tasks.filter(t => t.phase === phase).map(t => t.title)
    const toAdd = templates.filter(t => !existing.includes(t.title))
    if (!toAdd.length) return
    await supabase.from('cap_deal_pmi_tasks').insert(
      toAdd.map(t => ({ deal_id: dealId, phase, category: t.category, title: t.title, status: 'not_started' }))
    )
    qc.invalidateQueries({ queryKey: ['pmi', dealId] })
  }

  async function addCustom(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    await supabase.from('cap_deal_pmi_tasks').insert({ deal_id: dealId, phase, category: newCat, title: newTitle.trim(), status: 'not_started' })
    qc.invalidateQueries({ queryKey: ['pmi', dealId] })
    setNewTitle('')
    setAdding(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('cap_deal_pmi_tasks').update({ status }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['pmi', dealId] })
  }

  const filtered = tasks.filter(t => t.phase === phase)
  const total = tasks.length
  const done  = tasks.filter(t => t.status === 'done').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* 全体進捗 */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>PMI全体進捗</div>
          <div style={{ fontSize: 12, color: '#032D60', fontWeight: 500 }}>{done} / {total} 完了</div>
        </div>
        <div style={{ height: 6, background: '#F3F2F2', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: total > 0 ? `${(done/total)*100}%` : '0%', height: '100%', background: '#032D60', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid #E5E5E5' }}>
        {PHASES.map(p => (
          <button key={p.key} onClick={() => setPhase(p.key)}
            style={{
              padding: '7px 14px', border: 'none', background: 'transparent',
              fontSize: 12, fontWeight: phase === p.key ? 500 : 400,
              color: phase === p.key ? '#032D60' : '#A0A0A0',
              borderBottom: phase === p.key ? '2px solid #032D60' : '2px solid transparent',
              cursor: 'pointer',
            }}>
            {p.label}
            <span style={{ fontSize: 10, color: '#E5E5E5', marginLeft: 4 }}>
              {tasks.filter(t => t.phase === p.key && t.status === 'done').length}/{tasks.filter(t => t.phase === p.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>タスク</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {phase === 'day100' && (
              <button onClick={addFromTemplate}
                style={{ height: 28, padding: '0 10px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, color: '#706E6B', cursor: 'pointer' }}>
                テンプレから追加
              </button>
            )}
            <button onClick={() => setAdding(true)}
              style={{ height: 28, padding: '0 10px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 11, color: '#fff', cursor: 'pointer' }}>
              + 追加
            </button>
          </div>
        </div>

        {filtered.length === 0 && !adding ? (
          <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '20px 0' }}>タスクがありません</div>
        ) : (
          <div>
            {filtered.map((t, i) => {
              const ss = STATUS_STYLE[t.status] || STATUS_STYLE.not_started
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid #f0f2f5' }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', background: '#F3F2F2', color: '#A0A0A0', borderRadius: 3, flexShrink: 0 }}>
                    {CAT_LABELS[t.category] || t.category}
                  </span>
                  <div style={{ flex: 1, fontSize: 12, color: t.status === 'done' ? '#E5E5E5' : '#FFFFFF', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                    {t.title}
                  </div>
                  {t.due_date && <div style={{ fontSize: 10, color: '#A0A0A0', flexShrink: 0 }}>{t.due_date}</div>}
                  <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                    style={{ height: 26, padding: '0 6px', border: `0.5px solid ${ss.bg === '#F3F2F2' ? '#E5E5E5' : ss.bg}`, borderRadius: 4, fontSize: 10, background: ss.bg, color: ss.color, outline: 'none', cursor: 'pointer' }}>
                    {Object.entries(STATUS_STYLE).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        )}

        {adding && (
          <form onSubmit={addCustom} style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <select value={newCat} onChange={e => setNewCat(e.target.value)}
              style={{ height: 32, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="タスクを入力..."
              style={{ flex: 1, height: 32, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }} />
            <button type="submit" style={{ height: 32, padding: '0 12px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 12, color: '#fff', cursor: 'pointer' }}>追加</button>
            <button type="button" onClick={() => setAdding(false)}
              style={{ height: 32, padding: '0 10px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, color: '#706E6B', cursor: 'pointer' }}>×</button>
          </form>
        )}
      </div>

      {/* Day 1 チェックリスト */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#032D60', marginBottom: 4 }}>Day 1 必須チェックリスト</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>クロージング当日に完了すべき事項</div>
        {DAY1_CHECKLIST.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < DAY1_CHECKLIST.length - 1 ? '0.5px solid #f0f2f5' : 'none' }}>
            <div style={{ width: 14, height: 14, border: '0.5px solid #E5E5E5', borderRadius: 3, flexShrink: 0 }} />
            <span style={{ fontSize: 10, padding: '1px 6px', background: '#F3F2F2', color: '#A0A0A0', borderRadius: 3, flexShrink: 0 }}>{CAT_LABELS[item.category]}</span>
            <div style={{ flex: 1, fontSize: 12, color: '#032D60' }}>{item.title}</div>
          </div>
        ))}
      </div>

      {/* シナジー追跡 */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#032D60', marginBottom: 4 }}>シナジー追跡</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>コスト削減 / 売上拡大 / CAPEX 効率化の実現額追跡</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <SynergyCell label="コストシナジー" target="—" realized="—" hint="本社機能統合・共通購買" />
          <SynergyCell label="売上シナジー" target="—" realized="—" hint="クロスセル・地域展開" />
          <SynergyCell label="CAPEX シナジー" target="—" realized="—" hint="共通設備投資・拠点統廃合" />
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#FAFAFA', border: '0.5px dashed #E5E5E5', borderRadius: 6, fontSize: 11, color: '#706E6B', textAlign: 'center' }}>
          目標額・実現額の編集UIは次ビルドで追加。AIチャットで「シナジー目標として5年で3億円のコスト削減」と言うと自動で設定されます。
        </div>
      </div>

      {/* KPI ダッシュボード */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#032D60', marginBottom: 4 }}>クローズ後 KPI ダッシュボード</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>月次で追跡する財務・非財務 KPI の骨組み</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {['売上高', 'EBITDA', 'EBITDA マージン', 'フリーCF', '主要顧客離脱', 'キーマン離職', '新規契約', 'NPS / CS'].map(k => (
            <div key={k} style={{ padding: 12, background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: '#A0A0A0', marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 14, color: '#E5E5E5', fontWeight: 500 }}>—</div>
            </div>
          ))}
        </div>
      </div>

      {/* 経営陣インセンティブ */}
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#032D60', marginBottom: 4 }}>経営陣インセンティブ設計</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>MBO / ESOP / 業績連動報酬 の構造</div>
        <div style={{ padding: '20px 16px', background: '#FAFAFA', border: '0.5px dashed #E5E5E5', borderRadius: 6, fontSize: 11, color: '#706E6B', textAlign: 'center' }}>
          エクイティ配分 (オーナー / CEO / 経営チーム / ファンド) + ベスティング条件の設計は次ビルドで追加
        </div>
      </div>
    </div>
  )
}

function SynergyCell({ label, target, realized, hint }) {
  return (
    <div style={{ padding: 14, background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 9, color: '#A0A0A0' }}>目標</div>
          <div style={{ fontSize: 14, color: '#032D60', fontWeight: 600 }}>{target}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#A0A0A0' }}>実現</div>
          <div style={{ fontSize: 14, color: '#2E844A', fontWeight: 600 }}>{realized}</div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#A0A0A0' }}>{hint}</div>
    </div>
  )
}
