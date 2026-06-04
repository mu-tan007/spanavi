import { useState } from 'react'
import { Link } from '../lib/miniRouter'
import { useDeals, useCreateDeal } from '../hooks/useDeals'
import { DEAL_STATUSES } from '../lib/constants'
import PageHeader from '../../../common/PageHeader'
import { color, space, radius, font, shadow, alpha } from '../../../../constants/design'
import { Button, Input, Select } from '../../../ui'
import { useIsMobile } from '../../../../hooks/useIsMobile'

const STATUS_STYLE = {
  nn_review:       { bg: color.gray100,  fg: '#2a4a7a',     label: 'NN精査' },
  im_review:       { bg: color.gray50,   fg: color.navy,    label: 'IM精査' },
  top_meeting:     { bg: '#dce8f5',      fg: '#144080',     label: 'トップ面談' },
  loi_prep:        { bg: color.navy,     fg: color.white,   label: 'LOI準備' },
  dd:              { bg: '#0f3060',      fg: color.white,   label: 'DD実施' },
  spa_negotiation: { bg: color.navy,     fg: color.white,   label: 'SPA・最終交渉' },
  stop:            { bg: '#FAF3E0',      fg: '#A08040',     label: 'ストップ' },
  break:           { bg: '#FAECE7',      fg: color.danger,  label: 'ブレイク' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#f0f0f0', fg: '#555', label: status }
  return (
    <span style={{ fontSize: font.size.xs - 1, padding: '2px 7px', borderRadius: radius.sm, fontWeight: font.weight.medium, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function PriDot({ p }) {
  const c = p === 1 ? color.navy : p === 2 ? color.navy : '#9fbedd'
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
}

function Score({ score }) {
  const total = score?.total
  if (!total) return <span style={{ color: color.textMid, fontSize: font.size.xs }}>—</span>
  const c = total >= 80 ? color.success : total >= 60 ? color.navy : color.danger
  return <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: c }}>{total}</span>
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
  const isMobile = useIsMobile()
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
          <Button
            size="sm"
            onClick={() => setModal(true)}
            style={{ borderRadius: radius.md }}
          >
            + 案件を追加
          </Button>
        }
      />
      <div style={{ padding: isMobile ? '0 12px' : '0 24px' }}>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="案件名で検索..."
          fullWidth={false}
          containerStyle={{ width: isMobile ? '100%' : 240 }}
          style={{ color: color.navy }}
        />
        <Select
          value={filterStatus}
          onChange={e => setFilter(e.target.value)}
          fullWidth={false}
          containerStyle={{ width: isMobile ? '100%' : 160 }}
          style={{ color: color.navy }}
        >
          <option value="">全ステータス</option>
          {Object.entries(STATUS_STYLE).map(([v, s]) => (
            <option key={v} value={v}>{s.label}</option>
          ))}
        </Select>
      </div>

      {/* モバイル: カード形式 */}
      {isMobile && (
        <div>
          {isLoading ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>読み込み中...</div>
          ) : deals.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>案件がありません</div>
          ) : (
            deals.map((d) => {
              const fin = getLatest(d)
              const netCash = (fin.cash != null && fin.interest_bearing_debt != null)
                ? fin.cash - fin.interest_bearing_debt
                : null
              return (
                <Link
                  key={d.id}
                  to={`/deals/${d.id}`}
                  style={{
                    display: 'block', textDecoration: 'none',
                    background: color.white, border: `1px solid ${color.border}`,
                    borderRadius: radius.md, padding: '12px 14px', marginBottom: space[2],
                    minHeight: 44,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], marginBottom: space[1] }}>
                    <PriDot p={d.priority} />
                    <StatusBadge status={d.status} />
                    <span style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textMid }}>{d.industry_label || '—'}</span>
                  </div>
                  <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, marginBottom: space[1] }}>
                    {d.name}
                  </div>
                  {d.intermediaries?.name && (
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>{d.intermediaries.name}</div>
                  )}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: space[1], fontSize: font.size.xs, color: color.textMid,
                  }}>
                    <div>
                      <div style={{ color: color.textLight }}>売上</div>
                      <div style={{ color: color.navy, fontWeight: font.weight.medium }}>{fmtK(fin.revenue)}</div>
                    </div>
                    <div>
                      <div style={{ color: color.textLight }}>EBITDA</div>
                      <div style={{ color: color.navy, fontWeight: font.weight.medium }}>{fmtK(fin.ebitda)}</div>
                    </div>
                    <div>
                      <div style={{ color: color.textLight }}>スコア</div>
                      <Score score={d.score} />
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      )}

      {/* Table */}
      {!isMobile && (
      <div style={{ background: color.white, border: `0.5px solid ${color.border}`, borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 0,
          padding: '8px 16px',
          borderBottom: `0.5px solid ${color.border}`,
          background: '#edf2fa',
          minWidth: 960,
        }}>
          {HEADERS.map((h, i) => (
            <div key={i} style={{
              fontSize: font.size.xs - 1, color: color.textMid, fontWeight: font.weight.medium, letterSpacing: '0.3px',
              textAlign: i >= 5 && i <= 10 ? 'right' : 'left',
              paddingRight: i >= 5 && i <= 10 ? 8 : 0,
            }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>読み込み中...</div>
        ) : deals.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>案件がありません</div>
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
                  borderBottom: i < deals.length - 1 ? `0.5px solid ${color.gray50}` : 'none',
                  alignItems: 'center',
                  textDecoration: 'none',
                  transition: 'background 0.1s',
                  minWidth: 960,
                }}
                onMouseEnter={e => e.currentTarget.style.background = color.gray50}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: font.size.xs, color: color.textMid }}>{i + 1}</div>
                <PriDot p={d.priority} />
                <div style={{ minWidth: 0, paddingRight: 12 }}>
                  <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.name}
                  </div>
                  {d.intermediaries?.name && (
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>{d.intermediaries.name}</div>
                  )}
                </div>
                <div style={{ fontSize: font.size.xs, color: color.textMid, paddingRight: 8 }}>{d.industry_label || '—'}</div>
                <StatusBadge status={d.status} />
                <div style={{ fontSize: font.size.xs, color: color.navy, textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.revenue)}</div>
                <div style={{ fontSize: font.size.xs, color: color.navy, textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.operating_income)}</div>
                <div style={{ fontSize: font.size.xs, color: color.navy, textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.ebitda)}</div>
                <div style={{ fontSize: font.size.xs, color: color.navy, textAlign: 'right', paddingRight: 8 }}>{fmtK(fin.net_assets)}</div>
                <div style={{ fontSize: font.size.xs, color: netCash != null && netCash < 0 ? color.danger : color.navy, textAlign: 'right', paddingRight: 8 }}>{fmtK(netCash)}</div>
                <div style={{ textAlign: 'right', paddingRight: 8 }}><Score score={d.score} /></div>
                <div style={{ fontSize: font.size.xs, color: color.textMid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.contacts?.name || '—'}
                </div>
              </Link>
            )
          })
        )}
      </div>
      )}

      {/* New deal modal */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModal(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div style={{ background: color.white, borderRadius: 12, padding: 28, width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: 16, fontWeight: font.weight.medium, color: color.navy, marginBottom: 20 }}>案件を追加</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>案件名 *</label>
                <Input
                  value={newName} onChange={e => setNewName(e.target.value)} required
                  placeholder="例：国際漢方研究所"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>ステータス</label>
                  <Select
                    value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  >
                    {Object.entries(STATUS_STYLE).slice(0,6).map(([v,s]) => (
                      <option key={v} value={v}>{s.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>優先度</label>
                  <Select
                    value={newPriority} onChange={e => setNewPri(e.target.value)}
                  >
                    <option value={1}>高</option>
                    <option value={2}>中</option>
                    <option value={3}>低</option>
                  </Select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Button
                  type="button" variant="secondary" fullWidth
                  onClick={() => setModal(false)}
                >キャンセル</Button>
                <Button
                  type="submit" loading={saving} disabled={saving} fullWidth
                >{saving ? '保存中...' : '追加'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
