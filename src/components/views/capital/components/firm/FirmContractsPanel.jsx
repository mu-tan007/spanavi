import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import Icon from '../ui/Icon'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Select, Card, Badge } from '../../../../ui'

const CONTRACT_TYPES = [
  { value: 'nda',          label: '包括NDA' },
  { value: 'advisory',     label: 'アドバイザリー契約' },
  { value: 'other_master', label: 'その他マスター契約' },
]
const TYPE_VARIANT = {
  nda:          'primary',
  advisory:     'success',
  other_master: 'info',
}

export default function FirmContractsPanel({ intermediaryId, intermediaryName }) {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ contract_type: 'nda', signed_at: '', expires_at: '', notes: '' })
  const [pendingFile, setPendingFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const { data: contracts = [] } = useQuery({
    queryKey: ['firm-contracts', intermediaryId],
    enabled: !!intermediaryId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_firm_contracts')
        .select('*')
        .eq('intermediary_id', intermediaryId)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  async function handleSave(e) {
    e.preventDefault()
    if (false) return
    setSaving(true)
    try {
      let storage_path = null
      let file_name = null
      if (pendingFile) {
        const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        storage_path = `firm_contracts/${intermediaryId}/${Date.now()}_${safeName}`
        file_name = pendingFile.name
        const { error: upErr } = await supabase.storage.from('caesar-files').upload(storage_path, pendingFile, { cacheControl: '3600', upsert: false })
        if (upErr) { alert('ファイルアップロード失敗: ' + upErr.message); setSaving(false); return }
      }
      const payload = {
                intermediary_id: intermediaryId,
        contract_type: form.contract_type,
        signed_at: form.signed_at || null,
        expires_at: form.expires_at || null,
        notes: form.notes || null,
        storage_path, file_name,
      }
      const { data, error } = await supabase.from('cap_firm_contracts').insert(payload).select().single()
      if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
      logAudit({ action: 'create', resourceType: 'firm_contract', resourceId: data?.id, resourceName: `${intermediaryName} / ${CONTRACT_TYPES.find(t => t.value === form.contract_type)?.label}` })
      qc.invalidateQueries({ queryKey: ['firm-contracts', intermediaryId] })
      setForm({ contract_type: 'nda', signed_at: '', expires_at: '', notes: '' })
      setPendingFile(null)
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function download(c) {
    if (!c.storage_path) return
    try {
      const { data, error } = await supabase.storage.from('caesar-files').createSignedUrl(c.storage_path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank')
      logAudit({ action: 'view', resourceType: 'firm_contract', resourceId: c.id })
    } catch (e) {
      alert('ダウンロードエラー: ' + e.message)
    }
  }

  async function deleteContract(c) {
    if (!confirm('この契約を削除しますか？')) return
    if (c.storage_path) await supabase.storage.from('caesar-files').remove([c.storage_path])
    await supabase.from('cap_firm_contracts').delete().eq('id', c.id)
    logAudit({ action: 'delete', resourceType: 'firm_contract', resourceId: c.id })
    qc.invalidateQueries({ queryKey: ['firm-contracts', intermediaryId] })
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <Card padding="md">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textLight }}>包括契約 (NDA・アドバイザリー等)</div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>案件横断で有効なマスター契約</div>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'キャンセル' : '+ 契約を追加'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14, padding: 12, background: color.gray50, borderRadius: radius.xl }}>
          <Select size="sm" label="種別 *" value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))}
            options={CONTRACT_TYPES.map(t => ({ value: t.value, label: t.label }))} />
          <Input size="sm" label="締結日" type="date" value={form.signed_at} max={today} onChange={e => setForm(f => ({ ...f, signed_at: e.target.value }))} />
          <Input size="sm" label="有効期限 (無期限なら空)" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
          <div>
            <label style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 4, display: 'block' }}>原本PDF</label>
            <input ref={fileRef} type="file" accept=".pdf" onChange={e => setPendingFile(e.target.files?.[0] || null)}
              style={{ fontSize: font.size.xs }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Input size="sm" label="メモ" type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="条件・特記事項" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="submit" size="sm" disabled={saving} loading={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      )}

      {contracts.length === 0 ? (
        <div style={{ fontSize: font.size.xs, color: color.textLight, textAlign: 'center', padding: '16px 0' }}>まだ契約がありません</div>
      ) : (
        contracts.map((c, i) => {
          const expired = c.expires_at && c.expires_at < today
          const variant = TYPE_VARIANT[c.contract_type] || 'info'
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < contracts.length - 1 ? `0.5px solid ${color.borderLight}` : 'none' }}>
              <Badge variant={variant} size="sm">
                {CONTRACT_TYPES.find(t => t.value === c.contract_type)?.label || c.contract_type}
              </Badge>
              <div style={{ flex: 1, fontSize: font.size.xs, color: color.navy }}>
                {c.signed_at ? `${c.signed_at} 締結` : '日付未設定'}
                {c.expires_at && <span style={{ color: expired ? color.danger : color.textLight, marginLeft: 10 }}>
                  {expired ? '⚠ 期限切れ ' : '有効期限 '}{c.expires_at}
                </span>}
                {c.notes && <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{c.notes}</div>}
              </div>
              {c.file_name && (
                <Button variant="ghost" size="sm" onClick={() => download(c)} title={c.file_name}>
                  <Icon name="download" size={11} /> DL
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => deleteContract(c)} style={{ color: color.danger }}>
                ×
              </Button>
            </div>
          )
        })
      )}
    </Card>
  )
}

// 案件詳細の契約書タブに入れるバナー: 仲介の包括NDA/アドバイザリー状況
export function MasterContractBanner({ intermediaryId, intermediaryName }) {
  const { data: contracts = [] } = useQuery({
    queryKey: ['firm-contracts', intermediaryId],
    enabled: !!intermediaryId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_firm_contracts')
        .select('*')
        .eq('intermediary_id', intermediaryId)
      return data || []
    },
  })

  if (!intermediaryId) return null

  const today = new Date().toISOString().slice(0, 10)
  const nda = contracts.find(c => c.contract_type === 'nda' && (!c.expires_at || c.expires_at >= today))
  const aa = contracts.find(c => c.contract_type === 'advisory' && (!c.expires_at || c.expires_at >= today))

  const Pill = ({ ok, label, signed }) => (
    <span style={{
      fontSize: font.size.xs, padding: '4px 10px',
      background: ok ? color.successSoft : color.warnSoft,
      color: ok ? color.success : '#A08040',
      border: `0.5px solid ${ok ? '#b8d4b8' : '#e8c8a0'}`,
      borderRadius: 20,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <Icon name={ok ? 'check' : 'bell'} size={11} />
      {label}{ok && signed ? ` (${signed})` : ok ? '' : ' 未締結'}
    </span>
  )

  return (
    <div style={{ padding: '10px 16px', background: color.gray50, border: `0.5px solid ${color.border}`, borderRadius: radius.xl, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: font.size.sm, marginBottom: 14 }}>
      <span style={{ color: color.textLight }}>仲介: <strong style={{ color: color.navy }}>{intermediaryName}</strong> — 包括契約:</span>
      <Pill ok={!!nda} label="包括NDA" signed={nda?.signed_at} />
      <Pill ok={!!aa} label="アドバイザリー契約" signed={aa?.signed_at} />
    </div>
  )
}
