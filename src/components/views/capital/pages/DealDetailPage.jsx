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

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', borderBottom: '0.5px solid #f0f2f5', padding: '7px 0' }}>
      <div style={{ fontSize: 11, color: '#A0A0A0', width: 120, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#032D60' }}>{value || '—'}</div>
    </div>
  )
}

function ScoreBar({ label, value }) {
  if (!value) return null
  const color = value >= 80 ? '#2E844A' : value >= 60 ? '#032D60' : '#EA001E'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#706E6B', width: 90 }}>{label}</div>
      <div style={{ flex: 1, height: 5, background: '#F3F2F2', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, color: '#A0A0A0', width: 28, textAlign: 'right' }}>{value}</div>
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

  if (isLoading) return <div style={{ padding: 24, color: '#A0A0A0', fontSize: 13 }}>読み込み中...</div>
  if (error || !data?.deal) return <div style={{ padding: 24, color: '#EA001E', fontSize: 13 }}>案件が見つかりません</div>

  const { deal, company, financials, meetings, todos, valuation, lbo } = data
  const ss = STATUS_STYLE[deal.status] || { bg: '#f0f0f0', color: '#555', label: deal.status }
  const score = deal.score || {}

  async function handleStatusChange(e) {
    e.preventDefault()
    await updateStatus.mutateAsync({ id, status: newStatus, reason })
    setStatusModal(false)
    setReason('')
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#A0A0A0', marginBottom: 16 }}>
        <Link to="/deals" style={{ color: '#032D60' }}>案件一覧</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span>{deal.name}</span>
      </div>

      {/* Deal header */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500, background: ss.bg, color: ss.color }}>
                {ss.label}
              </span>
              <span style={{ fontSize: 10, color: '#A0A0A0' }}>
                優先度: {deal.priority === 1 ? '高' : deal.priority === 2 ? '中' : '低'}
              </span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: '#032D60', marginBottom: 6 }}>{deal.name}</h1>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {deal.intermediaries?.name && (
                <span style={{ fontSize: 12, color: '#706E6B' }}>仲介: {deal.intermediaries.name}</span>
              )}
              {deal.contacts?.name && (
                <span style={{ fontSize: 12, color: '#706E6B' }}>担当: {deal.contacts.name}</span>
              )}
              {deal.industry_label && (
                <span style={{ fontSize: 12, color: '#706E6B' }}>業種: {deal.industry_label}</span>
              )}
              {deal.ev_estimate && (
                <span style={{ fontSize: 12, color: '#706E6B' }}>
                  EV: ¥{(deal.ev_estimate/100000000).toFixed(1)}億
                </span>
              )}
            </div>
          </div>

          {/* Score + Status change */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexShrink: 0 }}>
            {score.total && (
              <div style={{ textAlign: 'center', padding: '8px 16px', background: '#F3F2F2', borderRadius: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 500, color: '#032D60' }}>{score.total}</div>
                <div style={{ fontSize: 10, color: '#A0A0A0' }}>買収スコア</div>
              </div>
            )}
            <button
              onClick={() => { setNewStatus(deal.status); setStatusModal(true) }}
              style={{ height: 36, padding: '0 14px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 12, color: '#032D60', cursor: 'pointer' }}
            >
              ステータス変更
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '0.5px solid #E5E5E5', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px', border: 'none', background: 'transparent',
              fontSize: 13, fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? '#032D60' : '#A0A0A0',
              borderBottom: tab === t.key ? '2px solid #032D60' : '2px solid transparent',
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
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>企業情報</div>
            <InfoRow label="売り手企業名" value={company?.seller_name} />
            <InfoRow label="設立年" value={company?.founded_year} />
            <InfoRow label="従業員数" value={company?.employees ? `${company.employees}名` : null} />
            <InfoRow label="所在地" value={company?.hq_address} />
            <InfoRow label="事業概要" value={company?.business_summary} />
          </div>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>仲介会社・担当者</div>
            <InfoRow label="仲介会社" value={deal?.intermediaries?.name} />
            <InfoRow label="種別" value={deal?.intermediaries?.type === 'fa' ? 'FA' : deal?.intermediaries?.type === 'intermediary' ? '仲介' : deal?.intermediaries?.type} />
            <InfoRow label="担当者" value={deal?.contacts?.name} />
            <InfoRow label="役職" value={deal?.contacts?.title} />
            <InfoRow label="メール" value={deal?.contacts?.email} />
            <InfoRow label="ソース" value={deal?.source_type === 'intermediary' ? '仲介紹介' : deal?.source_type === 'self' ? '自社ソーシング' : deal?.source_type === 'platform' ? 'プラットフォーム' : deal?.source_type} />
            <InfoRow label="優先度" value={deal?.priority === 1 ? '高' : deal?.priority === 2 ? '中' : deal?.priority === 3 ? '低' : null} />
            <InfoRow label="想定EV" value={deal?.ev_estimate ? `¥${(deal.ev_estimate / 100000000).toFixed(1)}億` : null} />
          </div>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>買収スコア</div>
            <ScoreBar label="財務健全性"   value={score.financial} />
            <ScoreBar label="シナジー"     value={score.synergy} />
            <ScoreBar label="PMI難度"      value={score.pmi} />
            <ScoreBar label="市場成長性"   value={score.market} />
            <ScoreBar label="バリュエーション" value={score.valuation} />
            {!score.total && <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '20px 0' }}>スコアデータなし</div>}
          </div>
          <div style={{ ...card, gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B', marginBottom: 12 }}>TODO</div>
            {todos.length === 0 ? (
              <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '12px 0' }}>タスクはありません</div>
            ) : todos.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < todos.length-1 ? '0.5px solid #f0f2f5' : 'none', alignItems: 'center' }}>
                <div style={{ width: 13, height: 13, border: '0.5px solid #E5E5E5', borderRadius: 3 }} />
                <div style={{ flex: 1, fontSize: 12, color: '#032D60' }}>{t.title}</div>
                {t.due_date && <div style={{ fontSize: 10, color: '#A0A0A0' }}>{t.due_date}</div>}
              </div>
            ))}
          </div>
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
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 380 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 20 }}>ステータス変更</h2>
            <form onSubmit={handleStatusChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>新しいステータス</label>
                <select
                  value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}
                >
                  {Object.entries(STATUS_STYLE).map(([v,s]) => (
                    <option key={v} value={v}>{s.label}</option>
                  ))}
                </select>
              </div>
              {['stop','break'].includes(newStatus) && (
                <div>
                  <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>
                    {newStatus === 'stop' ? 'ストップ理由' : 'ブレイク理由'}
                  </label>
                  <textarea
                    value={reason} onChange={e => setReason(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setStatusModal(false)}
                  style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>
                  キャンセル
                </button>
                <button type="submit" disabled={updateStatus.isPending}
                  style={{ flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
                  {updateStatus.isPending ? '更新中...' : '更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
