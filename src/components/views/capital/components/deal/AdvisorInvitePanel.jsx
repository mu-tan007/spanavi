import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export default function AdvisorInvitePanel({ dealId, contacts }) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [selectedContact, setSelectedContact] = useState('')
  const [expiryDays, setExpiryDays] = useState(7)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)

  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations', dealId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_advisor_invitations')
        .select('*, contacts(name, email)')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  async function createInvitation(e) {
    e.preventDefault()
    setSaving(true)
    const token = crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('cap_advisor_invitations').insert({
      deal_id: dealId,
      contact_id: selectedContact || null,
      token_hash: token,
      permissions: { upload: true, input_qa: true, view_files: true },
      expires_at: expiresAt,
      is_active: true,
    })
    qc.invalidateQueries({ queryKey: ['invitations', dealId] })
    setSaving(false)
    setCreating(false)
    setSelectedContact('')
  }

  async function deactivate(id) {
    await supabase.from('cap_advisor_invitations').update({ is_active: false }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['invitations', dealId] })
  }

  function getPortalUrl(token) {
    return `${window.location.origin}/portal?token=${token}`
  }

  function copyUrl(token, id) {
    navigator.clipboard.writeText(getPortalUrl(token))
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>担当者ポータル招待</div>
        <button onClick={() => setCreating(!creating)}
          style={{ height: 28, padding: '0 10px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 11, color: '#fff', cursor: 'pointer' }}>
          + 招待リンク発行
        </button>
      </div>

      {creating && (
        <form onSubmit={createInvitation} style={{ background: '#FAFAFA', borderRadius: 8, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>担当者（任意）</label>
            <select value={selectedContact} onChange={e => setSelectedContact(e.target.value)}
              style={{ width: '100%', height: 32, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }}>
              <option value="">指定しない</option>
              {contacts?.map(c => <option key={c.id} value={c.id}>{c.name} {c.email ? `<${c.email}>` : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 3 }}>有効期限</label>
            <select value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))}
              style={{ width: '100%', height: 32, padding: '0 8px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }}>
              <option value={3}>3日間</option>
              <option value={7}>7日間</option>
              <option value={14}>14日間</option>
              <option value={30}>30日間</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setCreating(false)}
              style={{ flex: 1, height: 30, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, color: '#706E6B', cursor: 'pointer' }}>
              キャンセル
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 1, height: 30, background: '#032D60', border: 'none', borderRadius: 5, fontSize: 11, color: '#fff', cursor: 'pointer' }}>
              {saving ? '発行中...' : '発行'}
            </button>
          </div>
        </form>
      )}

      {invitations.length === 0 ? (
        <div style={{ fontSize: 12, color: '#E5E5E5', textAlign: 'center', padding: '12px 0' }}>
          招待リンクがありません
        </div>
      ) : (
        invitations.map((inv, i) => {
          const isExpired = new Date(inv.expires_at) < new Date()
          const statusColor = !inv.is_active ? '#E5E5E5' : isExpired ? '#F0B4B4' : '#2E844A'
          const statusLabel = !inv.is_active ? '無効' : isExpired ? '期限切れ' : '有効'
          return (
            <div key={inv.id} style={{ padding: '8px 0', borderBottom: i < invitations.length - 1 ? '0.5px solid #E5E5E5' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: '#FFFFFF', flex: 1 }}>
                  {inv.contacts?.name || '担当者未指定'}
                </div>
                <div style={{ fontSize: 10, color: statusColor }}>{statusLabel}</div>
              </div>
              <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 4 }}>
                期限: {new Date(inv.expires_at).toLocaleDateString('ja-JP')}
                {inv.last_accessed_at && ` • 最終アクセス: ${new Date(inv.last_accessed_at).toLocaleDateString('ja-JP')}`}
              </div>
              {inv.is_active && !isExpired && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => copyUrl(inv.token_hash, inv.id)}
                    style={{ height: 24, padding: '0 10px', background: copied === inv.id ? '#E1F5EE' : '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 10, color: copied === inv.id ? '#2E844A' : '#706E6B', cursor: 'pointer' }}>
                    {copied === inv.id ? 'コピーしました' : 'URLをコピー'}
                  </button>
                  <button onClick={() => deactivate(inv.id)}
                    style={{ height: 24, padding: '0 8px', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 10, color: '#A0A0A0', cursor: 'pointer' }}>
                    無効化
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
