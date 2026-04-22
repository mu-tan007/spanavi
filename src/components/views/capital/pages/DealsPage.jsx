import { useState } from 'react'
import { Link } from '../lib/miniRouter'
import { useDeals, useCreateDeal } from '../hooks/useDeals'
import { DEAL_STATUSES } from '../lib/constants'
import PageHeader from '../../../common/PageHeader'

const STATUS_STYLE = {
  nn_review:       { bg: '#F3F2F2', color: '#2a4a7a', label: 'NN精査' },
  im_review:       { bg: '#F8F8F8', color: '#032D60', label: 'IM精査' },
  top_meeting:     { bg: '#dce8f5', color: '#144080', label: 'トップ面談' },
  loi_prep:        { bg: '#032D60', color: '#fff',    label: 'LOI準備' },
  dd:              { bg: '#0f3060', color: '#fff',    label: 'DD実施' },
  spa_negotiation: { bg: '#032D60', color: '#fff',    label: 'SPA・最終交渉' },
  stop:            { bg: '#FAF3E0', color: '#A08040', label: 'ストップ' },
  break:           { bg: '#FAECE7', color: '#EA001E', label: 'ブレイク' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#f0f0f0', color: '#555', label: status }
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function PriDot({ p }) {
  const c = p === 1 ? '#032D60' : p === 2 ? '#032D60' : '#9fbedd'
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
}

function Score({ score }) {
  const total = score?.total
  if (!total) return <span style={{ color: '#706E6B', fontSize: 11 }}>—</span>
  const color = total >= 80 ? '#2E844A' : total >= 60 ? '#032D60' : '#EA001E'
  return <span style={{ fontSize: 12, fontWeight: 500, color }}>{total}</span>
}

// 千円単位でフォーマット
function fmtK(v) {
  if (v == null) return '—'
  const k = v / 1000
  if (k >= 100000) return `${(k / 10000).toFixed(0)}億`
  if (k >= 10000) return `${(k / 10000).toFixed(1)}億`
  if (k >= 1000) return `${(k / 1000).toFixed(0)}千万`
  return `${k.toFixed(0)}千`
}

// deal_financials から最新期を取得
function getLatest(deal) {
  const fins = deal.deal_financials
  if (!fins || fins.length === 0) return {}
  return fins.reduce((a, b) => (b.fiscal_year > a.fiscal_year ? b : a), fins[0])
}

const COLS = '32px 10px 1fr 120px 90px 80px 80px 80px 80px 80px 56px 90px'
const HEADERS = ['#', '', '案件名', '業種', 'ステータス', '売上高', '営業利益', 'EBITDA', '純資産', 'Nキャッシュ', 'スコア', '担当']

export default function DealsPage() {
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showModal, setModal]     = useState(false)
  const [newName, setNewName]     = useState('')
  const [newStatus, setNewStatus] = useState('nn_review')
  const [newPriority, setNewPri]  = useState(2)
  const [saving, setSaving]       = useState(false)

  const { data: deals = [], isLoading } = useDeals({ search, status: filterStatus || undefined })
  const createDeal = useCreateDeal()

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await createDeal.mutateAsync({ name: newName, status: newStatus, priority: Number(newPriority) })
      setModal(false)
      setNewName('')
    } catch (err) {
      alert('案件の作成に失敗しました: ' + (err?.message || '不明なエラー'))
    } finally {
      setSaving(false)
    }
  }

  const active  = deals.filter(d => !['stop','break'].includes(d.status))
  const stopped = deals.filter(d => d.status === 'stop')
  const broken  = deals.filter(d => d.status === 'break')

  return (
    <div style={{ maxWidth: '100%', animation: 'fadeIn 0.3s ease' }}>

      <PageHeader
        bleed={false}
        eyebrow="Spartia Capital · 案件"
        title="Deals"
        description={`進行中 ${active.length} 件　ストップ ${stopped.length} 件　ブレイク ${broken.length} 件`}
        style={{ marginBottom: 20 }}
        right={
          <button
            onClick={() => setModal(true)}
            style={{
              height: 32, padding: '0 14px', background: '#032D60', border: 'none',
              borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + 案件を追加
          </button>
        }
      />
      <div style={{ padding: '0 24px' }}>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="案件名で検索..."
          style={{
            height: 36, padding: '0 12px', background: '#ffffff',
            border: '0.5px solid #E5E5E5', borderRadius: 6,
            fontSize: 13, color: '#032D60', width: 240, outline: 'none',
          }}
        />
        <select
          value={filterStatus}
          onChange={e => setFilter(e.target.value)}
          style={{
            height: 36, padding: '0 10px', background: '#ffffff',
            border: '0.5px solid #E5E5E5', borderRadius: 6,
            fontSize: 13, color: '#032D60', outline: 'none',
          }}
        >
          <option value="">全ステータス</option>
          {Object.entries(STATUS_STYLE).map(([v, s]) => (
            <option key={v} value={v}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#ffffff', border: '0.5px solid #E5E5E5', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 0,
          padding: '8px 16px',
          borderBottom: '0.5px solid #E5E5E5',
          background: '#edf2fa',
          minWidth: 960,
        }}>
          {HEADERS.map((h, i) => (
            <div key={i} style={{
              fontSize: 10, color: '#706E6B', fontWeight: 500, letterSpacing: '0.3px',
              textAlign: i >= 5 && i <= 10 ? 'right' : 'left',
              paddingRight: i >= 5 && i <= 10 ? 8 : 0,
            }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#706E6B', fontSize: 13 }}>読み込み中...</div>
        ) : deals.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#706E6B', fontSize: 13 }}>案件がありません</div>
        ) : (
          deals.map((d, i) => {
            const fin = getLatest(d)
            const netCash = (fin.cash != null && fin.interest_bearing_debt != null)
              ? fin.cash - fin.interest_bearing_debt
              : null
            return (
              <Link
                key={d.id}
                to={`/deals/${d.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: COLS,
                  gap: 0,
                  padding: '10px 16px',
                  borderBottom: i < deals.length - 1 ? '0.5px solid #F8F8F8' : 'none',
                  alignItems: 'center',
                  textDecoration: 'none',
                  transition: 'background 0.1s',
                  minWidth: 960,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: 11, color: '#706E6B' }}>{i + 1}</div>
                <PriDot p={d.priority} />
                <div style={{ minWidth: 0, paddingRight: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#032D60', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.name}
                  </div>
                  {d.intermediaries?.name && (
                    <div style={{ fontSize: 11, color: '#706E6B', marginTop: 2 }}>{d.intermediaries.name}</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#706E6B', paddingRight: 8 }}>{d.industry_label || '—'}</div>
                <StatusBadge status={d.status} />
                <div style={{ fontSize: 11, color: '#032D60', textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.revenue)}</div>
                <div style={{ fontSize: 11, color: '#032D60', textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.operating_income)}</div>
                <div style={{ fontSize: 11, color: '#032D60', textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.ebitda)}</div>
                <div style={{ fontSize: 11, color: '#032D60', textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.net_assets)}</div>
                <div style={{ fontSize: 11, color: netCash != null && netCash < 0 ? '#EA001E' : '#032D60', textAlign: 'right', paddingRight: 8 }}>{fmtK(netCash)}</div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}><Score score={d.score} /></div>
                <div style={{ fontSize: 11, color: '#706E6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.contacts?.name || '—'}
                </div>
              </Link>
            )
          })
        )}
      </div>

      {/* New deal modal */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModal(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 28, width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 20 }}>案件を追加</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>案件名 *</label>
                <input
                  value={newName} onChange={e => setNewName(e.target.value)} required
                  placeholder="例：国際漢方研究所"
                  style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>ステータス</label>
                  <select
                    value={newStatus} onChange={e => setNewStatus(e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}
                  >
                    {Object.entries(STATUS_STYLE).slice(0,6).map(([v,s]) => (
                      <option key={v} value={v}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>優先度</label>
                  <select
                    value={newPriority} onChange={e => setNewPri(e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}
                  >
                    <option value={1}>高</option>
                    <option value={2}>中</option>
                    <option value={3}>低</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button" onClick={() => setModal(false)}
                  style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}
                >キャンセル</button>
                <button
                  type="submit" disabled={saving}
                  style={{ flex: 1, height: 36, background: saving ? '#A0A0A0' : '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}
                >{saving ? '保存中...' : '追加'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
