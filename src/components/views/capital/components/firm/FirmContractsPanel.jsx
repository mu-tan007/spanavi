import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import Icon from '../ui/Icon'

const CONTRACT_TYPES = [
  { value: 'nda',          label: '包括NDA' },
  { value: 'advisory',     label: 'アドバイザリー契約' },
  { value: 'other_master', label: 'その他マスター契約' },
]
const TYPE_COLOR = {
  nda:          { bg: '#F8F8F8', color: '#032D60' },
  advisory:     { bg: '#E1F5EE', color: '#2E844A' },
  other_master: { bg: '#f5ecf8', color: '#6830a0' },
}

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

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
        .from('firm_contracts')
        .select('*')
        .eq('intermediary_id', intermediaryId)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!tenantId) return
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
        tenant_id: tenantId,
        intermediary_id: intermediaryId,
        contract_type: form.contract_type,
        signed_at: form.signed_at || null,
        expires_at: form.expires_at || null,
        notes: form.notes || null,
        storage_path, file_name,
      }
      const { data, error } = await supabase.from('firm_contracts').insert(payload).select().single()
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
    await supabase.from('firm_contracts').delete().eq('id', c.id)
    logAudit({ action: 'delete', resourceType: 'firm_contract', resourceId: c.id })
    qc.invalidateQueries({ queryKey: ['firm-contracts', intermediaryId] })
  }

  const today = new Date().toISOString().slice(0, 10)
  const inp = { width: '100%', height: 32, padding: '0 10px', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 12, outline: 'none' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>包括契約 (NDA・アドバイザリー等)</div>
          <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2 }}>案件横断で有効なマスター契約</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ height: 28, padding: '0 10px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 11, color: '#fff', cursor: 'pointer' }}>
          {showForm ? 'キャンセル' : '+ 契約を追加'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14, padding: 12, background: '#FAFAFA', borderRadius: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>種別 *</label>
            <select value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))} style={inp}>
              {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>締結日</label>
            <input type="date" value={form.signed_at} max={today} onChange={e => setForm(f => ({ ...f, signed_at: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>有効期限 (無期限なら空)</label>
            <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>原本PDF</label>
            <input ref={fileRef} type="file" accept=".pdf" onChange={e => setPendingFile(e.target.files?.[0] || null)}
              style={{ fontSize: 11 }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 10, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>メモ</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} placeholder="条件・特記事項" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="submit" disabled={saving}
              style={{ height: 30, padding: '0 16px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 12, color: '#fff', cursor: 'pointer' }}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      )}

      {contracts.length === 0 ? (
        <div style={{ fontSize: 11, color: '#E5E5E5', textAlign: 'center', padding: '16px 0' }}>まだ契約がありません</div>
      ) : (
        contracts.map((c, i) => {
          const expired = c.expires_at && c.expires_at < today
          const tc = TYPE_COLOR[c.contract_type] || TYPE_COLOR.other_master
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < contracts.length - 1 ? '0.5px solid #f0f2f5' : 'none' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', background: tc.bg, color: tc.color, borderRadius: 3, flexShrink: 0 }}>
                {CONTRACT_TYPES.find(t => t.value === c.contract_type)?.label || c.contract_type}
              </span>
              <div style={{ flex: 1, fontSize: 11, color: '#FFFFFF' }}>
                {c.signed_at ? `${c.signed_at} 締結` : '日付未設定'}
                {c.expires_at && <span style={{ color: expired ? '#EA001E' : '#706E6B', marginLeft: 10 }}>
                  {expired ? '⚠ 期限切れ ' : '有効期限 '}{c.expires_at}
                </span>}
                {c.notes && <div style={{ fontSize: 10, color: '#A0A0A0', marginTop: 2 }}>{c.notes}</div>}
              </div>
              {c.file_name && (
                <button onClick={() => download(c)}
                  style={{ background: 'none', border: 'none', color: '#032D60', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                  title={c.file_name}>
                  <Icon name="download" size={11} /> DL
                </button>
              )}
              <button onClick={() => deleteContract(c)}
                style={{ background: 'none', border: 'none', color: '#EA001E', cursor: 'pointer', fontSize: 11 }}>
                ×
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

// 案件詳細の契約書タブに入れるバナー: 仲介の包括NDA/アドバイザリー状況
export function MasterContractBanner({ intermediaryId, intermediaryName }) {
  const { data: contracts = [] } = useQuery({
    queryKey: ['firm-contracts', intermediaryId],
    enabled: !!intermediaryId,
    queryFn: async () => {
      const { data } = await supabase
        .from('firm_contracts')
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
      fontSize: 11, padding: '4px 10px',
      background: ok ? '#E1F5EE' : '#FAF3E0',
      color: ok ? '#2E844A' : '#A08040',
      border: '0.5px solid ' + (ok ? '#b8d4b8' : '#e8c8a0'),
      borderRadius: 20,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <Icon name={ok ? 'check' : 'bell'} size={11} />
      {label}{ok && signed ? ` (${signed})` : ok ? '' : ' 未締結'}
    </span>
  )

  return (
    <div style={{ padding: '10px 16px', background: '#FAFAFA', border: '0.5px solid #E5E5E5', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, marginBottom: 14 }}>
      <span style={{ color: '#706E6B' }}>仲介: <strong style={{ color: '#FFFFFF' }}>{intermediaryName}</strong> — 包括契約:</span>
      <Pill ok={!!nda} label="包括NDA" signed={nda?.signed_at} />
      <Pill ok={!!aa} label="アドバイザリー契約" signed={aa?.signed_at} />
    </div>
  )
}
