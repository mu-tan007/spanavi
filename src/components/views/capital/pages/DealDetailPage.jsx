import { useState } from 'react'
import { useParams, Link } from '../lib/miniRouter'
import { useDeal, useUpdateDealStatus } from '../hooks/useDeals'
import ValuationTab from '../components/deal/ValuationTab'
import DDTab from '../components/deal/DDTab'
import LBOTab from '../components/deal/LBOTab'
import PMITab from '../components/deal/PMITab'
import AdvisorInvitePanel from '../components/deal/AdvisorInvitePanel'
import ChatTab from '../components/deal/ChatTab'
import DealSummaryTab from '../components/deal/DealSummaryTab'
import LibraryTab from '../components/deal/LibraryTab'
import QATab from '../components/deal/QATab'
import { MasterContractBanner } from '../components/firm/FirmContractsPanel'
import ExecutiveSnapshot from '../components/deal/ExecutiveSnapshot'
import FinancialsTab from '../components/deal/FinancialsTab'
import MeetingsTab from '../components/deal/MeetingsTab'
import ContractsTab from '../components/deal/ContractsTab'
import { color, space, radius, font, shadow, alpha } from '../../../../constants/design'
import { Button, Select, Card } from '../../../ui'

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

const TABS = [
  { key: 'overview',  label: '概要' },
  { key: 'chat',      label: 'AIチャット' },
  { key: 'library',   label: 'ライブラリ' },
  { key: 'summary',   label: '案件詳細' },
  { key: 'financials',label: '財務' },
  { key: 'valuation', label: 'バリュエーション' },
  { key: 'dd',        label: 'DD' },
  { key: 'meetings',  label: '打合せ' },
  { key: 'qa',        label: 'QA' },
  { key: 'contracts', label: '契約書' },
  { key: 'lbo',       label: 'LBO' },
  { key: 'pmi',       label: 'PMI' },
]

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', borderBottom: `0.5px solid ${color.gray100}`, padding: '7px 0' }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, width: 120, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: font.size.sm, color: color.navy }}>{value || '—'}</div>
    </div>
  )
}

function ScoreBar({ label, value }) {
  if (!value) return null
  const c = value >= 80 ? color.success : value >= 60 ? color.navy : color.danger
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, width: 90 }}>{label}</div>
      <div style={{ flex: 1, height: 5, background: color.gray100, borderRadius: radius.sm, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: c, borderRadius: radius.sm }} />
      </div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, width: 28, textAlign: 'right' }}>{value}</div>
    </div>
  )
}

export default function DealDetailPage() {
  const { id } = useParams()
  const { data, isLoading, error } = useDeal(id)
  const updateStatus = useUpdateDealStatus()
  const [tab, setTab] = useState('overview')
  const [showStatusModal, setStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [reason, setReason] = useState('')

  if (isLoading) return <div style={{ padding: 24, color: color.textMid, fontSize: font.size.base }}>読み込み中...</div>
  if (error || !data?.deal) return <div style={{ padding: 24, color: color.danger, fontSize: font.size.base }}>案件が見つかりません</div>

  const { deal, company, financials, meetings, todos, valuation, lbo } = data
  const ss = STATUS_STYLE[deal.status] || { bg: '#f0f0f0', fg: '#555', label: deal.status }
  const score = deal.score || {}

  async function handleStatusChange(e) {
    e.preventDefault()
    await updateStatus.mutateAsync({ id, status: newStatus, reason })
    setStatusModal(false)
    setReason('')
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%', animation: 'fadeIn 0.3s ease' }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: 16 }}>
        <Link to="/deals" style={{ color: color.navy }}>案件一覧</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span>{deal.name}</span>
      </div>

      {/* Deal header */}
      <Card padding="md" style={{ marginBottom: 20, borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: font.size.xs - 1, padding: '2px 7px', borderRadius: radius.sm, fontWeight: font.weight.medium, background: ss.bg, color: ss.fg }}>
                {ss.label}
              </span>
              <span style={{ fontSize: font.size.xs - 1, color: color.textMid }}>
                優先度: {deal.priority === 1 ? '高' : deal.priority === 2 ? '中' : '低'}
              </span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 6, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>{deal.name}</h1>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {deal.intermediaries?.name && (
                <span style={{ fontSize: font.size.sm, color: color.textMid }}>仲介: {deal.intermediaries.name}</span>
              )}
              {deal.contacts?.name && (
                <span style={{ fontSize: font.size.sm, color: color.textMid }}>担当: {deal.contacts.name}</span>
              )}
              {deal.industry_label && (
                <span style={{ fontSize: font.size.sm, color: color.textMid }}>業種: {deal.industry_label}</span>
              )}
              {deal.ev_estimate && (
                <span style={{ fontSize: font.size.sm, color: color.textMid }}>
                  EV: ¥{(deal.ev_estimate/100000000).toFixed(1)}億
                </span>
              )}
            </div>
          </div>

          {/* Score + Status change */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexShrink: 0 }}>
            {score.total && (
              <div style={{ textAlign: 'center', padding: '8px 16px', background: color.gray100, borderRadius: radius.xl }}>
                <div style={{ fontSize: 28, fontWeight: font.weight.medium, color: color.navy }}>{score.total}</div>
                <div style={{ fontSize: font.size.xs - 1, color: color.textMid }}>買収スコア</div>
              </div>
            )}
            <Button
              variant="secondary"
              onClick={() => { setNewStatus(deal.status); setStatusModal(true) }}
              style={{ height: 36, padding: '0 14px', fontSize: font.size.sm }}
            >
              ステータス変更
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `0.5px solid ${color.border}`, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px', border: 'none', background: 'transparent',
              fontSize: font.size.base, fontWeight: tab === t.key ? font.weight.medium : font.weight.normal,
              color: tab === t.key ? color.navy : '#A0A0A0',
              borderBottom: tab === t.key ? `2px solid ${color.navy}` : '2px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab contents */}
      {tab === 'overview' && (
        <>
        <ExecutiveSnapshot deal={deal} company={company} valuation={valuation} intermediaryId={deal?.intermediary_id} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Card padding="md" style={{ borderRadius: 12 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMid, marginBottom: 12 }}>企業情報</div>
            <InfoRow label="売り手企業名" value={company?.seller_name} />
            <InfoRow label="設立年" value={company?.founded_year} />
            <InfoRow label="従業員数" value={company?.employees ? `${company.employees}名` : null} />
            <InfoRow label="所在地" value={company?.hq_address} />
            <InfoRow label="事業概要" value={company?.business_summary} />
          </Card>
          <Card padding="md" style={{ borderRadius: 12 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMid, marginBottom: 12 }}>仲介会社・担当者</div>
            <InfoRow label="仲介会社" value={deal?.intermediaries?.name} />
            <InfoRow label="種別" value={deal?.intermediaries?.type === 'fa' ? 'FA' : deal?.intermediaries?.type === 'intermediary' ? '仲介' : deal?.intermediaries?.type} />
            <InfoRow label="担当者" value={deal?.contacts?.name} />
            <InfoRow label="役職" value={deal?.contacts?.title} />
            <InfoRow label="メール" value={deal?.contacts?.email} />
            <InfoRow label="ソース" value={deal?.source_type === 'intermediary' ? '仲介紹介' : deal?.source_type === 'self' ? '自社ソーシング' : deal?.source_type === 'platform' ? 'プラットフォーム' : deal?.source_type} />
            <InfoRow label="優先度" value={deal?.priority === 1 ? '高' : deal?.priority === 2 ? '中' : deal?.priority === 3 ? '低' : null} />
            <InfoRow label="想定EV" value={deal?.ev_estimate ? `¥${(deal.ev_estimate / 100000000).toFixed(1)}億` : null} />
          </Card>
          <Card padding="md" style={{ borderRadius: 12 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMid, marginBottom: 12 }}>買収スコア</div>
            <ScoreBar label="財務健全性"   value={score.financial} />
            <ScoreBar label="シナジー"     value={score.synergy} />
            <ScoreBar label="PMI難度"      value={score.pmi} />
            <ScoreBar label="市場成長性"   value={score.market} />
            <ScoreBar label="バリュエーション" value={score.valuation} />
            {!score.total && <div style={{ fontSize: font.size.sm, color: color.textMid, textAlign: 'center', padding: '20px 0' }}>スコアデータなし</div>}
          </Card>
          <Card padding="md" style={{ gridColumn: '1 / -1', borderRadius: 12 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMid, marginBottom: 12 }}>TODO</div>
            {todos.length === 0 ? (
              <div style={{ fontSize: font.size.sm, color: color.textMid, textAlign: 'center', padding: '12px 0' }}>タスクはありません</div>
            ) : todos.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < todos.length-1 ? `0.5px solid ${color.gray100}` : 'none', alignItems: 'center' }}>
                <div style={{ width: 13, height: 13, border: `0.5px solid ${color.border}`, borderRadius: radius.sm }} />
                <div style={{ flex: 1, fontSize: font.size.sm, color: color.navy }}>{t.title}</div>
                {t.due_date && <div style={{ fontSize: font.size.xs - 1, color: color.textMid }}>{t.due_date}</div>}
              </div>
            ))}
          </Card>
          <div style={{ gridColumn: '1 / -1' }}>
            <AdvisorInvitePanel dealId={id} contacts={deal?.contacts ? [deal.contacts] : []} />
          </div>
        </div>
        </>
      )}

      {tab === 'financials' && (
        <FinancialsTab financials={financials} company={company} />
      )}

      {tab === 'chat' && (
        <ChatTab dealId={id} />
      )}

      {tab === 'library' && (
        <LibraryTab dealId={id} />
      )}

      {tab === 'summary' && (
        <DealSummaryTab dealId={id} />
      )}

      {tab === 'meetings' && (
        <MeetingsTab dealId={id} />
      )}

      {tab === 'qa' && (
        <QATab dealId={id} />
      )}

      {tab === 'valuation' && (
        <ValuationTab dealId={id} valuation={valuation} financials={financials} />
      )}

      {tab === 'dd' && (
        <DDTab dealId={id} />
      )}

      {tab === 'lbo' && (
        <LBOTab dealId={id} lbo={lbo} financials={financials} />
      )}

      {tab === 'pmi' && (
        <PMITab dealId={id} />
      )}

      {tab === 'contracts' && (
        <ContractsTab dealId={id} intermediaryId={deal?.intermediary_id} intermediaryName={deal?.intermediaries?.name} />
      )}

      {/* Status change modal */}
      {showStatusModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setStatusModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div style={{ background: color.white, borderRadius: 12, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 16, fontWeight: font.weight.medium, color: color.navy, marginBottom: 20 }}>ステータス変更</h2>
            <form onSubmit={handleStatusChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>新しいステータス</label>
                <Select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                  {Object.entries(STATUS_STYLE).map(([v,s]) => (
                    <option key={v} value={v}>{s.label}</option>
                  ))}
                </Select>
              </div>
              {['stop','break'].includes(newStatus) && (
                <div>
                  <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>
                    {newStatus === 'stop' ? 'ストップ理由' : 'ブレイク理由'}
                  </label>
                  <textarea
                    value={reason} onChange={e => setReason(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: `0.5px solid ${color.border}`, borderRadius: radius.lg, fontSize: font.size.base, outline: 'none', resize: 'vertical', color: color.textDark, fontFamily: font.family.sans, boxSizing: 'border-box' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Button type="button" variant="secondary" fullWidth onClick={() => setStatusModal(false)}>
                  キャンセル
                </Button>
                <Button type="submit" loading={updateStatus.isPending} disabled={updateStatus.isPending} fullWidth>
                  {updateStatus.isPending ? '更新中...' : '更新'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
