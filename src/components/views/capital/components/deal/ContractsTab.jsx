import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAudit } from '../../lib/audit'
import { MasterContractBanner } from '../firm/FirmContractsPanel'
import Icon from '../ui/Icon'
import { color, space, radius, font, shadow, alpha } from '../../../../../constants/design'
import { Button, Input, Select, Card } from '../../../../ui'

// 案件契約書タブ — 進行順フォルダ構造
const FOLDERS = [
  { key: 'loi',              label: 'LOI (意向表明書)',   color: color.navy, hint: '買収の意向・価格・条件の初期提示' },
  { key: 'mou',              label: 'MOU (覚書)',          color: color.navy, hint: '主要論点の合意・排他交渉期間等' },
  { key: 'basic_agreement',  label: '基本合意書',           color: '#0c6a80', hint: 'クロージングまでの工程・価格調整機構' },
  { key: 'spa',              label: 'SPA (株式譲渡契約)',   color: color.navy, hint: '最終契約・表明保証・前提条件' },
  { key: 'other',            label: 'その他 (付属・エスクロー等)', color: color.textLight, hint: '経営委任契約・エスクロー・競業避止' },
]

const STATUS_STYLE = {
  drafting:  { bg: color.gray100, color: color.textLight, label: 'ドラフト中' },
  review:    { bg: color.warnSoft, color: '#A08040', label: 'レビュー中' },
  negotiating:{ bg: color.gray50, color: color.navy, label: '交渉中' },
  signed:    { bg: color.successSoft, color: color.success, label: '締結済' },
  terminated:{ bg: color.dangerSoft, color: color.danger, label: '終了' },
}

export default function ContractsTab({ dealId, intermediaryId, intermediaryName }) {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef()
  const [addingType, setAddingType] = useState(null)
  const [form, setForm] = useState({ title: '', signed_at: '', status: 'drafting', amount: '', counterparty: '', notes: '' })
  const [pendingFile, setPendingFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const { data: contracts = [] } = useQuery({
    queryKey: ['deal-contracts', dealId],
    queryFn: async () => {
      const { data } = await supabase.from('cap_deal_contracts').select('*').eq('deal_id', dealId).order('created_at', { ascending: false })
      return data || []
    },
  })

  function startAdd(type) { setAddingType(type); setForm({ title: '', signed_at: '', status: 'drafting', amount: '', counterparty: intermediaryName || '', notes: '' }); setPendingFile(null) }

  async function save() {
    if (false || !addingType) return
    setSaving(true)
    try {
      let storage_path = null, file_name = null
      if (pendingFile) {
        const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        storage_path = `deals/${dealId}/${Date.now()}_${safeName}`
        file_name = pendingFile.name
        const { error: upErr } = await supabase.storage.from('caesar-files').upload(storage_path, pendingFile, { cacheControl: '3600', upsert: false })
        if (upErr) { alert('アップロードエラー: ' + upErr.message); setSaving(false); return }
      }
      const payload = {
        deal_id: dealId,
        contract_type: addingType,
        title: form.title || FOLDERS.find(f => f.key === addingType)?.label,
        status: form.status,
        signed_at: form.signed_at || null,
        amount: form.amount ? Number(form.amount) : null,
        counterparty: form.counterparty || null,
        notes: form.notes || null,
        storage_path, file_name,
      }
      // executed_at は signed_at と同期
      if (form.status === 'signed' && form.signed_at) payload.executed_at = form.signed_at
      const { data, error } = await supabase.from('cap_deal_contracts').insert(payload).select().single()
      if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
      logAudit({ action: 'create', resourceType: 'deal_contract', resourceId: data?.id, resourceName: payload.title, metadata: { deal_id: dealId, type: addingType } })
      qc.invalidateQueries({ queryKey: ['deal-contracts', dealId] })
      setAddingType(null); setForm({}); setPendingFile(null)
    } finally { setSaving(false) }
  }

  async function download(c) {
    if (!c.storage_path) return
    try {
      const { data, error } = await supabase.storage.from('caesar-files').createSignedUrl(c.storage_path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank')
      logAudit({ action: 'view', resourceType: 'deal_contract', resourceId: c.id })
    } catch (e) { alert('DLエラー: ' + e.message) }
  }

  async function updateStatus(c, newStatus) {
    const patch = { status: newStatus }
    if (newStatus === 'signed' && !c.signed_at) patch.signed_at = new Date().toISOString().slice(0, 10)
    await supabase.from('cap_deal_contracts').update(patch).eq('id', c.id)
    logAudit({ action: 'update', resourceType: 'deal_contract', resourceId: c.id, metadata: { status: newStatus } })
    qc.invalidateQueries({ queryKey: ['deal-contracts', dealId] })
  }

  async function deleteContract(c) {
    if (!confirm(`${c.title} を削除しますか？`)) return
    if (c.storage_path) await supabase.storage.from('caesar-files').remove([c.storage_path])
    await supabase.from('cap_deal_contracts').delete().eq('id', c.id)
    logAudit({ action: 'delete', resourceType: 'deal_contract', resourceId: c.id })
    qc.invalidateQueries({ queryKey: ['deal-contracts', dealId] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MasterContractBanner intermediaryId={intermediaryId} intermediaryName={intermediaryName} />

      {FOLDERS.map(folder => {
        const list = contracts.filter(c => c.contract_type === folder.key)
        return (
          <Card key={folder.key} padding="lg">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: `0.5px solid ${color.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 28, background: folder.color, borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: color.navy }}>
                    {folder.label} <span style={{ fontSize: font.size.xs, fontWeight: font.weight.normal, color: color.textLight, marginLeft: 6 }}>({list.length})</span>
                  </div>
                  <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{folder.hint}</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => startAdd(folder.key)} style={{ color: folder.color, borderColor: folder.color }}>
                + 追加
              </Button>
            </div>

            {addingType === folder.key && (
              <div style={{ padding: 12, background: color.gray50, borderRadius: radius.lg, marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <Input size="sm" label="タイトル" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={folder.label} />
                <Input size="sm" label="相手方" value={form.counterparty} onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))} />
                <Select size="sm" label="ステータス" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  options={Object.entries(STATUS_STYLE).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Input size="sm" label="締結日" type="date" value={form.signed_at} onChange={e => setForm(f => ({ ...f, signed_at: e.target.value }))} />
                <Input size="sm" label="金額 (円)" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="任意" />
                <div>
                  <label style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 4, display: 'block' }}>PDF (任意)</label>
                  <input ref={fileRef} type="file" accept=".pdf" onChange={e => setPendingFile(e.target.files?.[0] || null)} style={{ fontSize: font.size.xs }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Input size="sm" label="メモ" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => setAddingType(null)}>キャンセル</Button>
                  <Button size="sm" onClick={save} disabled={saving} loading={saving}>{saving ? '保存中…' : '保存'}</Button>
                </div>
              </div>
            )}

            {list.length === 0 && addingType !== folder.key ? (
              <div style={{ padding: '20px 16px', background: color.gray50, border: `0.5px dashed ${color.border}`, borderRadius: radius.lg, fontSize: font.size.xs, color: color.textLight, textAlign: 'center' }}>
                この種別の契約書はまだありません
              </div>
            ) : (
              list.map((c, i) => {
                const ss = STATUS_STYLE[c.status] || STATUS_STYLE.drafting
                return (
                  <div key={c.id} style={{ padding: '10px 0', borderBottom: i < list.length - 1 ? `0.5px solid ${color.borderLight}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: font.size.base, color: color.navy, fontWeight: font.weight.medium, marginBottom: 3 }}>{c.title || folder.label}</div>
                      <div style={{ fontSize: font.size.xs, color: color.textLight, display: 'flex', gap: 12 }}>
                        {c.counterparty && <span>相手方: {c.counterparty}</span>}
                        {c.signed_at && <span>締結: {c.signed_at}</span>}
                        {c.amount && <span>金額: ¥{(c.amount / 100000000).toFixed(1)}億</span>}
                      </div>
                      {c.notes && <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 3 }}>{c.notes}</div>}
                    </div>
                    <select value={c.status || 'drafting'} onChange={e => updateStatus(c, e.target.value)}
                      style={{ height: 26, padding: '0 8px', background: ss.bg, color: ss.color, border: `0.5px solid ${ss.bg}`, borderRadius: radius.md, fontSize: font.size.xs, outline: 'none', cursor: 'pointer' }}>
                      {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {c.storage_path && (
                      <Button variant="ghost" size="sm" onClick={() => download(c)}>
                        <Icon name="download" size={11} /> DL
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteContract(c)} style={{ color: color.danger }}>×</Button>
                  </div>
                )
              })
            )}
          </Card>
        )
      })}
    </div>
  )
}
