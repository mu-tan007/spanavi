import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import * as gcal from '../lib/gcal'
import { useAuth } from '../hooks/useAuth'

const TYPE_LABELS = {
  new_deal: { label: '新規案件', bg: '#F8F8F8', fg: '#032D60' },
  existing_deal_update: { label: '既存案件更新', bg: '#E1F5EE', fg: '#2E844A' },
  admin: { label: '事務連絡', bg: '#f0f0f0', fg: '#6a7a8a' },
  social: { label: '社交', bg: '#f4ecf8', fg: '#6a3a8a' },
  irrelevant: { label: '無関係', bg: '#f8f0f0', fg: '#9a7a7a' },
}

const ACTION_LABELS = {
  create_intermediary: '仲介会社を追加',
  create_contact: '担当者を追加',
  create_deal: '新規案件を登録',
  link_deal: '既存案件に紐付け',
  update_status: 'ステータスを変更',
}

function formatYen(v) {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}億円`
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}万円`
  return `${n}円`
}

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

function useEmails() {
  return useQuery({
    queryKey: ['emails'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_emails')
        .select('*, deals(id, name), contacts(id, name, email)')
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200)
      return data || []
    },
  })
}

function useDealsSimple() {
  return useQuery({
    queryKey: ['deals-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deals').select('id, name').order('name')
      return data || []
    },
  })
}

function useContactsSimple() {
  return useQuery({
    queryKey: ['contacts-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_contacts').select('id, name, email, intermediaries(name)').not('email', 'is', null).order('name')
      return data || []
    },
  })
}

function formatRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'たった今'
  if (m < 60)  return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}時間前`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}日前`
  return new Date(ts).toLocaleDateString('ja-JP')
}

const TEMPLATES = {
  ng: (dealName) =>
    `お世話になっております。\n\n「${dealName}」のご提案につきまして、\n社内で精査いたしました結果、今回は見送らせていただくこととなりました。\n\n今回ご紹介いただきました機会には感謝申し上げます。\n引き続きよろしくお願いいたします。`,
  question: (dealName) =>
    `お世話になっております。\n\n「${dealName}」につきまして、以下の点をご確認させていただけますでしょうか。\n\n1. \n2. \n3. \n\nお手数をおかけしますが、ご回答いただけますと幸いです。\nよろしくお願いいたします。`,
  meeting: (dealName) =>
    `お世話になっております。\n\n「${dealName}」に関しまして、一度お打合せの機会をいただけますでしょうか。\n\n以下の日程でご都合はいかがでしょうか。\n\n・\n・\n・\n\nご調整のほど、よろしくお願いいたします。`,
  loi: (dealName) =>
    `お世話になっております。\n\n「${dealName}」につきまして、弊社として前向きに検討を進めたく存じます。\nつきましては、LOIを提出させていただきたいと考えております。\n\n詳細につきましては、別途ご送付いたします。\nどうぞよろしくお願いいたします。`,
}

function useGoogleStatus() {
  return useQuery({
    queryKey: ['google-status'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return { connected: false, gmail: false, calendar: false }
      const r = await fetch('/api/gcal/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!r.ok) return { connected: false, gmail: false, calendar: false }
      return r.json()
    },
    staleTime: 60_000,
  })
}

export default function EmailsPage() {
  const qc = useQueryClient()
  const { tenantId } = useAuth()
  const { data: emails = [], isLoading } = useEmails()
  const { data: deals = [] } = useDealsSimple()
  const { data: contacts = [] } = useContactsSimple()
  const { data: googleStatus } = useGoogleStatus()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [applyingId, setApplyingId] = useState(null)
  const [applyError, setApplyError] = useState(null)

  async function applyProposals(email, proposals) {
    if (false) { setApplyError('tenant_id を取得できません'); return }
    setApplyingId(email.id)
    setApplyError(null)
    try {
      let intermediaryId = null
      let contactId = null
      let dealId = null

      for (const p of proposals.filter(x => x.kind === 'create_intermediary')) {
        const name = p.params?.name?.trim()
        if (!name) continue
        const { data: existing } = await supabase
          .from('cap_intermediaries').select('id').eq('name', name).maybeSingle()
        if (existing) { intermediaryId = existing.id; continue }
        const { data, error } = await supabase
          .from('cap_intermediaries').insert({ name, type: 'ma_firm' }).select('id').single()
        if (error) throw new Error(`仲介会社追加失敗: ${error.message}`)
        intermediaryId = data.id
      }

      for (const p of proposals.filter(x => x.kind === 'create_contact')) {
        const { name, email: contactEmail, title, intermediary_name } = p.params || {}
        if (!name) continue
        if (contactEmail) {
          const { data: existing } = await supabase
            .from('cap_contacts').select('id').eq('email', contactEmail).maybeSingle()
          if (existing) { contactId = existing.id; continue }
        }
        let imId = intermediaryId
        if (!imId && intermediary_name) {
          const { data } = await supabase
            .from('cap_intermediaries').select('id').eq('name', intermediary_name).maybeSingle()
          imId = data?.id || null
        }
        const { data, error } = await supabase
          .from('cap_contacts').insert({
            intermediary_id: imId, name,
            email: contactEmail || null, title: title || null,
          }).select('id').single()
        if (error) throw new Error(`担当者追加失敗: ${error.message}`)
        contactId = data.id
      }

      for (const p of proposals.filter(x => x.kind === 'create_deal')) {
        const { name, industry_label, ev_estimate } = p.params || {}
        if (!name) continue
        const { data, error } = await supabase
          .from('cap_deals').insert({
                        intermediary_id: intermediaryId,
            contact_id: contactId,
            name,
            source_type: 'email',
            status: 'new',
            priority: 3,
            industry_label: industry_label || null,
            ev_estimate: ev_estimate || null,
          }).select('id').single()
        if (error) throw new Error(`案件登録失敗: ${error.message}`)
        dealId = data.id
      }

      const link = proposals.find(x => x.kind === 'link_deal')
      const dealToLink = link?.params?.deal_id || dealId

      for (const p of proposals.filter(x => x.kind === 'update_status')) {
        const targetId = p.params?.deal_id || dealId
        const newStatus = p.params?.new_status
        if (targetId && newStatus) {
          const { error } = await supabase
            .from('cap_deals').update({ status: newStatus }).eq('id', targetId)
          if (error) throw new Error(`ステータス変更失敗: ${error.message}`)
        }
      }

      await supabase.from('cap_emails').update({
        deal_id: dealToLink || email.deal_id,
        ai_status: 'applied',
        reviewed_at: new Date().toISOString(),
      }).eq('id', email.id)

      qc.invalidateQueries({ queryKey: ['emails'] })
      qc.invalidateQueries({ queryKey: ['deals-simple'] })
      qc.invalidateQueries({ queryKey: ['contacts-simple'] })
    } catch (e) {
      setApplyError(e.message)
    } finally {
      setApplyingId(null)
    }
  }

  async function dismissEmail(email) {
    await supabase.from('cap_emails').update({
      ai_status: 'dismissed',
      reviewed_at: new Date().toISOString(),
    }).eq('id', email.id)
    qc.invalidateQueries({ queryKey: ['emails'] })
  }

  async function runGmailSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const auth = { Authorization: `Bearer ${session?.access_token}` }
      const r = await fetch('/api/gmail/sync', { method: 'POST', headers: auth })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setSyncResult({ ok: false, ...j }); return }
      qc.invalidateQueries({ queryKey: ['emails'] })
      setSyncResult({
        ok: true,
        inserted: j.inserted ?? 0,
        classified: j.classified ?? 0,
        classify_error: j.classify_error,
      })
    } catch (e) {
      setSyncResult({ ok: false, error: e.message })
    } finally {
      setSyncing(false)
    }
  }

  const [selected, setSelected] = useState(null)
  const [showCompose, setCompose] = useState(false)
  const [compose, setComposeForm] = useState({ deal_id: '', contact_id: '', subject: '', body: '', direction: 'outbound' })
  const [saving, setSaving] = useState(false)
  const [templateKey, setTemplateKey] = useState('')

  function applyTemplate(key) {
    const deal = deals.find(d => d.id === compose.deal_id)
    const dealName = deal?.name || '（案件名）'
    setComposeForm(f => ({ ...f, body: TEMPLATES[key]?.(dealName) || '' }))
    setTemplateKey(key)
  }

  async function handleSend(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...compose }
    if (!payload.deal_id) delete payload.deal_id
    if (!payload.contact_id) delete payload.contact_id
    await supabase.from('cap_emails').insert({ ...payload, sent_at: new Date().toISOString() })
    qc.invalidateQueries({ queryKey: ['emails'] })
    setSaving(false)
    setCompose(false)
    setComposeForm({ deal_id: '', contact_id: '', subject: '', body: '', direction: 'outbound' })
  }

  const pendingReview = emails.filter(e => e.ai_status === 'classified')
  const processed     = emails.filter(e => ['applied', 'dismissed'].includes(e.ai_status))
  const manual        = emails.filter(e => !e.gmail_message_id)
  const [tab, setTab] = useState('pending')
  const displayed =
    tab === 'pending' ? pendingReview :
    tab === 'processed' ? processed :
    tab === 'manual' ? manual :
    emails

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: '#032D60' }}>メール</h1>
          <p style={{ fontSize: 12, color: '#706E6B', marginTop: 3 }}>
            未処理 {pendingReview.length} 件　処理済み {processed.length} 件　手動 {manual.length} 件
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {googleStatus && !googleStatus.gmail && gcal.isConfigured() && (
            <span style={{ height: 32, padding: '0 10px', background: '#fff7e6', border: '0.5px solid #f0d8a8', borderRadius: 6, color: '#8a6020', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              Gmail 連携が未有効
            </span>
          )}
          {googleStatus && !googleStatus.gmail && gcal.isConfigured() && (
            <button onClick={() => gcal.signIn()} style={{
              height: 32, padding: '0 12px', background: '#fff', border: '0.5px solid #E5E5E5',
              borderRadius: 6, color: '#706E6B', fontSize: 11, cursor: 'pointer',
            }}>Gmail 連携を有効化</button>
          )}
          {googleStatus?.gmail && (
            <>
              <span style={{ height: 32, padding: '0 10px', background: '#E1F5EE', borderRadius: 6, color: '#2E844A', fontSize: 11, display: 'flex', alignItems: 'center' }}>
                ✓ Gmail 連携中
              </span>
              <button onClick={runGmailSync} disabled={syncing} style={{
                height: 32, padding: '0 12px', background: '#fff', border: '0.5px solid #E5E5E5',
                borderRadius: 6, color: '#706E6B', fontSize: 11, cursor: syncing ? 'wait' : 'pointer',
              }}>{syncing ? '同期中…' : '今すぐ同期'}</button>
              {syncResult && (
                <span style={{ fontSize: 11, color: syncResult.ok ? '#2E844A' : '#a33', marginLeft: 4 }}>
                  {syncResult.ok
                    ? `取込 ${syncResult.inserted ?? 0}件 / 分析 ${syncResult.classified ?? 0}件${syncResult.classify_error ? ` (分析失敗: ${syncResult.classify_error})` : ''}`
                    : (syncResult.error || 'エラー')}
                </span>
              )}
            </>
          )}
          <button onClick={() => setCompose(true)}
            style={{ height: 36, padding: '0 16px', background: '#032D60', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + メールを作成
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '0.5px solid #E5E5E5' }}>
        {[
          ['pending', `未処理 ${pendingReview.length}`],
          ['processed', `処理済み ${processed.length}`],
          ['manual', `手動 ${manual.length}`],
          ['all', 'すべて'],
        ].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 16px', border: 'none', background: 'transparent', fontSize: 13, fontWeight: tab===k?500:400, color: tab===k?'#032D60':'#A0A0A0', borderBottom: tab===k?'2px solid #032D60':'2px solid transparent', cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
        {/* Email list */}
        <div style={card}>
          {isLoading ? (
            <div style={{ fontSize: 12, color: '#706E6B', textAlign: 'center', padding: '20px 0' }}>読み込み中...</div>
          ) : displayed.length === 0 ? (
            <div style={{ fontSize: 12, color: '#706E6B', textAlign: 'center', padding: '20px 0' }}>メールがありません</div>
          ) : (
            displayed.map((email) => {
              const cls = email.ai_classification
              const typeMeta = cls?.type ? TYPE_LABELS[cls.type] : null
              const conf = cls?.confidence
              return (
                <div key={email.id} onClick={() => setSelected(email)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                    background: selected?.id === email.id ? '#f0f5ff' : 'transparent',
                    border: selected?.id === email.id ? '0.5px solid #c0d0f0' : '0.5px solid transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    {typeMeta ? (
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: typeMeta.bg, color: typeMeta.fg, flexShrink: 0 }}>
                        {typeMeta.label}{typeof conf === 'number' ? ` ${Math.round(conf * 100)}%` : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: email.direction === 'inbound' ? '#F8F8F8' : '#E1F5EE', color: email.direction === 'inbound' ? '#032D60' : '#2E844A', flexShrink: 0 }}>
                        {email.direction === 'inbound' ? '受信' : '送信'}
                      </span>
                    )}
                    {email.ai_status === 'pending' && email.gmail_message_id && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#f8f5e8', color: '#8a7020' }}>分析待ち</span>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#032D60', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {email.subject || '（件名なし）'}
                    </div>
                    <div style={{ fontSize: 10, color: '#706E6B', flexShrink: 0 }}>
                      {formatRelative(email.received_at || email.sent_at || email.created_at)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#706E6B', display: 'flex', gap: 8, overflow: 'hidden' }}>
                    {email.from_name || email.from_email ? (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email.from_name || email.from_email}
                      </span>
                    ) : email.contacts?.name && <span>{email.contacts.name}</span>}
                    {email.deals?.name && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{email.deals.name}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Email detail */}
        <div>
          {!selected ? (
            <div style={{ ...card, textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: 13, color: '#706E6B' }}>メールを選択してください</div>
            </div>
          ) : (
            <EmailDetail
              email={selected}
              onApply={applyProposals}
              onDismiss={dismissEmail}
              applying={applyingId === selected.id}
              applyError={applyError}
            />
          )}
        </div>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div onClick={e => { if (e.target === e.currentTarget) setCompose(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 600, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 20 }}>メールを作成</h2>

            {/* Templates */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: '#706E6B', alignSelf: 'center', marginRight: 4 }}>テンプレート:</div>
              {[['ng','NG通知'],['question','質問'],['meeting','打合せ依頼'],['loi','LOI意向']].map(([k,l]) => (
                <button key={k} onClick={() => applyTemplate(k)}
                  style={{ height: 26, padding: '0 10px', background: templateKey===k ? '#032D60' : '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 11, color: templateKey===k ? '#fff' : '#706E6B', cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>

            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>関連案件</label>
                  <select value={compose.deal_id} onChange={e => setComposeForm(f => ({ ...f, deal_id: e.target.value }))}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                    <option value="">選択しない</option>
                    {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>宛先担当者</label>
                  <select value={compose.contact_id} onChange={e => setComposeForm(f => ({ ...f, contact_id: e.target.value }))}
                    style={{ width: '100%', height: 36, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                    <option value="">選択しない</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name} {c.intermediaries?.name ? `(${c.intermediaries.name})` : ''}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>件名</label>
                <input value={compose.subject} onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
                  style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>本文</label>
                <textarea value={compose.body} onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))} rows={10}
                  style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.8 }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setCompose(false)}
                  style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>
                  キャンセル
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? '保存中...' : '送信（保存）'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const cardStyle = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

function EmailDetail({ email, onApply, onDismiss, applying, applyError }) {
  const cls = email.ai_classification
  const typeMeta = cls?.type ? TYPE_LABELS[cls.type] : null
  const proposals = Array.isArray(email.ai_proposals) ? email.ai_proposals : []
  const extracted = email.ai_extracted || {}
  const hasExtracted = Object.values(extracted).some(v => v != null && v !== '')
  const reviewable = email.ai_status === 'classified'

  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '0.5px solid #E5E5E5' }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#032D60', marginBottom: 8 }}>
          {email.subject || '（件名なし）'}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#706E6B' }}>
          {(email.from_name || email.from_email) && (
            <div>From: {email.from_name || ''}{email.from_email ? ` <${email.from_email}>` : ''}</div>
          )}
          {(email.to_emails || []).length > 0 && (
            <div>To: {email.to_emails.map(t => t.email).join(', ')}</div>
          )}
          <div style={{ color: '#706E6B' }}>
            {email.received_at ? new Date(email.received_at).toLocaleString('ja-JP') : ''}
          </div>
        </div>
      </div>

      {cls && (
        <div style={{ marginBottom: 16, padding: 12, background: '#fafbfd', borderRadius: 8, border: '0.5px solid #E5E5E5' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {typeMeta && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: typeMeta.bg, color: typeMeta.fg, fontWeight: 500 }}>
                {typeMeta.label}
              </span>
            )}
            {typeof cls.confidence === 'number' && (
              <span style={{ fontSize: 11, color: '#706E6B' }}>
                信頼度 {Math.round(cls.confidence * 100)}%
              </span>
            )}
          </div>
          {cls.reasoning && (
            <div style={{ fontSize: 12, color: '#4a5a6a', lineHeight: 1.7, marginBottom: hasExtracted || proposals.length ? 12 : 0 }}>
              <span style={{ color: '#706E6B' }}>AI判断: </span>{cls.reasoning}
            </div>
          )}
          {hasExtracted && (
            <div style={{ marginBottom: proposals.length ? 12 : 0 }}>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 6 }}>抽出データ</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12, color: '#032D60' }}>
                {extracted.industry && <div><span style={{ color: '#706E6B' }}>業種:</span> {extracted.industry}</div>}
                {extracted.revenue_jpy != null && <div><span style={{ color: '#706E6B' }}>売上:</span> {formatYen(extracted.revenue_jpy) || extracted.revenue_jpy}</div>}
                {extracted.ebitda_jpy != null && <div><span style={{ color: '#706E6B' }}>EBITDA:</span> {formatYen(extracted.ebitda_jpy) || extracted.ebitda_jpy}</div>}
                {extracted.ask_price_jpy != null && <div><span style={{ color: '#706E6B' }}>希望価格:</span> {formatYen(extracted.ask_price_jpy) || extracted.ask_price_jpy}</div>}
                {extracted.location && <div><span style={{ color: '#706E6B' }}>所在地:</span> {extracted.location}</div>}
                {extracted.intermediary_name && <div><span style={{ color: '#706E6B' }}>仲介:</span> {extracted.intermediary_name}</div>}
                {extracted.contact_name && <div><span style={{ color: '#706E6B' }}>担当:</span> {extracted.contact_name}{extracted.contact_title ? ` (${extracted.contact_title})` : ''}</div>}
                {extracted.contact_email && <div><span style={{ color: '#706E6B' }}>メール:</span> {extracted.contact_email}</div>}
              </div>
              {extracted.deal_description && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#4a5a6a' }}>{extracted.deal_description}</div>
              )}
            </div>
          )}
          {proposals.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 6 }}>提案アクション</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#032D60', lineHeight: 1.8 }}>
                {proposals.map((p, i) => (
                  <li key={i}>
                    <strong>{ACTION_LABELS[p.kind] || p.kind}</strong>
                    {p.params && (
                      <span style={{ color: '#706E6B' }}>
                        {' '}
                        — {Object.entries(p.params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'number' ? (formatYen(v) || v) : v}`).join(' / ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reviewable && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => onApply(email, proposals)}
                disabled={applying || proposals.length === 0}
                style={{ height: 32, padding: '0 14px', background: '#032D60', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 500, cursor: applying ? 'wait' : (proposals.length === 0 ? 'not-allowed' : 'pointer'), opacity: proposals.length === 0 ? 0.5 : 1 }}>
                {applying ? '実行中…' : '承認して実行'}
              </button>
              <button
                onClick={() => onDismiss(email)}
                disabled={applying}
                style={{ height: 32, padding: '0 14px', background: '#fff', border: '0.5px solid #e0c8c8', borderRadius: 6, color: '#a33', fontSize: 12, cursor: applying ? 'wait' : 'pointer' }}>
                却下
              </button>
            </div>
          )}
          {applyError && (
            <div style={{ fontSize: 12, color: '#a33', marginTop: 10 }}>エラー: {applyError}</div>
          )}
          {email.ai_status === 'applied' && (
            <div style={{ fontSize: 11, color: '#2E844A', marginTop: 10 }}>✓ 適用済み ({email.reviewed_at ? new Date(email.reviewed_at).toLocaleString('ja-JP') : ''})</div>
          )}
          {email.ai_status === 'dismissed' && (
            <div style={{ fontSize: 11, color: '#706E6B', marginTop: 10 }}>却下済み</div>
          )}
        </div>
      )}

      {email.has_attachments && (email.attachments || []).length > 0 && (
        <div style={{ marginBottom: 14, fontSize: 12, color: '#706E6B' }}>
          <span style={{ color: '#706E6B' }}>添付: </span>
          {email.attachments.map((a, i) => (
            <span key={i} style={{ marginRight: 10 }}>{a.name}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, color: '#032D60', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
        {email.body}
      </div>
    </div>
  )
}
