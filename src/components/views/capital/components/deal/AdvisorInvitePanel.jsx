import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Select, Card, Badge } from '../../../../ui'

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
    <div style={{ background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.xl, padding: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMid }}>担当者ポータル招待</div>
        <Button size="sm" onClick={() => setCreating(!creating)}>+ 招待リンク発行</Button>
      </div>

      {creating && (
        <form onSubmit={createInvitation} style={{ background: color.gray50, borderRadius: radius.xl, padding: 14, marginBottom: space[3], display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 3 }}>担当者（任意）</label>
            <Select
              size="sm"
              value={selectedContact}
              onChange={e => setSelectedContact(e.target.value)}
              options={[
                { value: '', label: '指定しない' },
                ...(contacts || []).map(c => ({ value: c.id, label: `${c.name} ${c.email ? `<${c.email}>` : ''}` })),
              ]}
            />
          </div>
          <div>
            <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 3 }}>有効期限</label>
            <Select
              size="sm"
              value={expiryDays}
              onChange={e => setExpiryDays(Number(e.target.value))}
              options={[
                { value: 3, label: '3日間' },
                { value: 7, label: '7日間' },
                { value: 14, label: '14日間' },
                { value: 30, label: '30日間' },
              ]}
            />
          </div>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button type="button" variant="outline" size="sm" style={{ flex: 1 }} onClick={() => setCreating(false)}>
              キャンセル
            </Button>
            <Button type="submit" size="sm" style={{ flex: 1 }} loading={saving}>
              {saving ? '発行中...' : '発行'}
            </Button>
          </div>
        </form>
      )}

      {invitations.length === 0 ? (
        <div style={{ fontSize: font.size.sm, color: color.textMid, textAlign: 'center', padding: '12px 0' }}>
          招待リンクがありません
        </div>
      ) : (
        invitations.map((inv, i) => {
          const isExpired = new Date(inv.expires_at) < new Date()
          const statusColor = !inv.is_active ? color.border : isExpired ? '#F0B4B4' : color.success
          const statusLabel = !inv.is_active ? '無効' : isExpired ? '期限切れ' : '有効'
          return (
            <div key={inv.id} style={{ padding: '8px 0', borderBottom: i < invitations.length - 1 ? `0.5px solid ${color.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ fontSize: font.size.sm, color: color.navy, flex: 1 }}>
                  {inv.contacts?.name || '担当者未指定'}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: statusColor }}>{statusLabel}</div>
              </div>
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 4 }}>
                期限: {new Date(inv.expires_at).toLocaleDateString('ja-JP')}
                {inv.last_accessed_at && ` • 最終アクセス: ${new Date(inv.last_accessed_at).toLocaleDateString('ja-JP')}`}
              </div>
              {inv.is_active && !isExpired && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => copyUrl(inv.token_hash, inv.id)}
                    style={{ height: 24, padding: '0 10px', background: copied === inv.id ? '#E1F5EE' : color.gray100, border: `0.5px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.xs - 1, color: copied === inv.id ? color.success : color.textMid, cursor: 'pointer' }}>
                    {copied === inv.id ? 'コピーしました' : 'URLをコピー'}
                  </button>
                  <button onClick={() => deactivate(inv.id)}
                    style={{ height: 24, padding: '0 8px', background: color.white, border: `0.5px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.xs - 1, color: color.textMid, cursor: 'pointer' }}>
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
