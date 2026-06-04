import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import FirmContractsPanel from '../components/firm/FirmContractsPanel'
import PageHeader from '../../../common/PageHeader'
import { color, space, radius, font, shadow, alpha } from '../../../../constants/design'
import { Button, Input, Select, Card } from '../../../ui'
import { useIsMobile } from '../../../../hooks/useIsMobile'

const TYPE_STYLE = {
  intermediary: { bg: color.gray50,   fg: color.navy,    label: '仲介会社' },
  fa:           { bg: color.successSoft, fg: color.success, label: 'FA' },
  self:         { bg: color.gray100,  fg: color.textMid, label: '自社' },
}

function useIntermediaries() {
  return useQuery({
    queryKey: ['intermediaries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_intermediaries')
        .select('*, contacts(id, name, email, title)')
        .order('name')
      return data || []
    },
  })
}

function useContacts(intermediaryId) {
  return useQuery({
    queryKey: ['contacts', intermediaryId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cap_contacts')
        .select('*')
        .eq('intermediary_id', intermediaryId)
        .order('name')
      return data || []
    },
    enabled: !!intermediaryId,
  })
}

export default function PartnersPage() {
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const { data: intermediaries = [], isLoading } = useIntermediaries()
  const [selected, setSelected] = useState(null)
  const [showModal, setModal] = useState(false)
  const [showContactModal, setContactModal] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'intermediary', website: '', notes: '' })
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', title: '' })
  const [saving, setSaving] = useState(false)

  const { data: contacts = [] } = useContacts(selected?.id)

  const selectedFull = intermediaries.find(i => i.id === selected?.id)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('cap_intermediaries').insert(form)
    qc.invalidateQueries({ queryKey: ['intermediaries'] })
    setSaving(false)
    setModal(false)
    setForm({ name: '', type: 'intermediary', website: '', notes: '' })
  }

  async function handleContactSave(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('cap_contacts').insert({ ...contactForm, intermediary_id: selected.id })
    qc.invalidateQueries({ queryKey: ['contacts', selected.id] })
    qc.invalidateQueries({ queryKey: ['intermediaries'] })
    setSaving(false)
    setContactModal(false)
    setContactForm({ name: '', email: '', phone: '', title: '' })
  }

  const inp = (key, val, setter, type = 'text', placeholder = '') => (
    <Input type={type} value={val[key]} placeholder={placeholder}
      onChange={e => setter(f => ({ ...f, [key]: e.target.value }))} />
  )

  return (
    <div style={{ maxWidth: '100%', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        bleed={false}
        eyebrow="Spartia Capital · Partners"
        title="業務提携先"
        description={`${intermediaries.length} 社登録中`}
        style={{ marginBottom: 20 }}
        right={
          <Button size="sm" onClick={() => setModal(true)} style={{ borderRadius: radius.md }}>
            + 追加
          </Button>
        }
      />
      <div style={{ padding: isMobile ? '0 12px' : '0 24px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: 14 }}>
        {/* List */}
        <Card padding="md" style={{ borderRadius: 12 }}>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 10, letterSpacing: '0.5px' }}>一覧</div>
          {isLoading ? (
            <div style={{ fontSize: font.size.sm, color: color.textMid, textAlign: 'center', padding: '20px 0' }}>読み込み中...</div>
          ) : intermediaries.length === 0 ? (
            <div style={{ fontSize: font.size.sm, color: color.textMid, textAlign: 'center', padding: '20px 0' }}>登録がありません</div>
          ) : (
            intermediaries.map(i => {
              const ts = TYPE_STYLE[i.type] || TYPE_STYLE.intermediary
              const isSelected = selected?.id === i.id
              return (
                <div key={i.id} onClick={() => setSelected(i)}
                  style={{
                    padding: '10px 12px', borderRadius: radius.xl, cursor: 'pointer', marginBottom: 4,
                    background: isSelected ? '#f0f5ff' : 'transparent',
                    border: isSelected ? '0.5px solid #c0d0f0' : '0.5px solid transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy, flex: 1 }}>{i.name}</div>
                    <span style={{ fontSize: font.size.xs - 1, padding: '1px 6px', borderRadius: radius.sm, background: ts.bg, color: ts.fg }}>{ts.label}</span>
                  </div>
                  <div style={{ fontSize: font.size.xs, color: color.textMid }}>
                    担当者 {i.contacts?.length || 0} 名
                  </div>
                </div>
              )
            })
          )}
        </Card>

        {/* Detail */}
        <div>
          {!selected ? (
            <Card padding="md" style={{ textAlign: 'center', padding: '60px 24px', borderRadius: 12 }}>
              <div style={{ fontSize: font.size.base, color: color.textMid }}>左の一覧から会社を選択してください</div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card padding="md" style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: font.weight.medium, color: color.navy }}>{selectedFull?.name}</h2>
                      <span style={{ fontSize: font.size.xs - 1, padding: '2px 7px', borderRadius: radius.sm, background: TYPE_STYLE[selectedFull?.type]?.bg, color: TYPE_STYLE[selectedFull?.type]?.fg }}>
                        {TYPE_STYLE[selectedFull?.type]?.label}
                      </span>
                    </div>
                    {selectedFull?.website && (
                      <a href={selectedFull.website} target="_blank" rel="noreferrer"
                        style={{ fontSize: font.size.sm, color: color.navy }}>{selectedFull.website}</a>
                    )}
                  </div>
                </div>
                {selectedFull?.notes && (
                  <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.7, padding: '10px 0', borderTop: `0.5px solid ${color.border}` }}>
                    {selectedFull.notes}
                  </div>
                )}
              </Card>

              {/* Contacts */}
              <Card padding="md" style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMid }}>担当者一覧</div>
                  <Button size="sm" onClick={() => setContactModal(true)} style={{ height: 28, padding: '0 10px', fontSize: font.size.xs }}>
                    + 担当者追加
                  </Button>
                </div>
                {contacts.length === 0 ? (
                  <div style={{ fontSize: font.size.sm, color: color.textMid, textAlign: 'center', padding: '16px 0' }}>担当者がいません</div>
                ) : (
                  contacts.map((c, i) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < contacts.length - 1 ? `0.5px solid ${color.border}` : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: color.gray50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.navy, flexShrink: 0 }}>
                        {c.name?.slice(0, 1)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: font.size.base, fontWeight: font.weight.medium, color: color.navy }}>{c.name}</div>
                        {c.title && <div style={{ fontSize: font.size.xs, color: color.textMid }}>{c.title}</div>}
                      </div>
                      <div style={{ fontSize: font.size.sm, color: color.textMid }}>{c.email}</div>
                      {c.phone && <div style={{ fontSize: font.size.sm, color: color.textMid }}>{c.phone}</div>}
                    </div>
                  ))
                )}
              </Card>

              {/* Master contracts */}
              <FirmContractsPanel intermediaryId={selected.id} intermediaryName={selectedFull?.name} />
            </div>
          )}
        </div>
      </div>

      {/* Add intermediary modal */}
      {showModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: color.white, borderRadius: 12, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: font.weight.medium, color: color.navy, marginBottom: 20 }}>仲介会社・FAを追加</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>会社名 *</label>
                {inp('name', form, setForm, 'text', '例：M&Aキャピタルパートナーズ')}
              </div>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>種別</label>
                <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="intermediary">仲介会社</option>
                  <option value="fa">FA</option>
                  <option value="self">自社</option>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>Webサイト</label>
                {inp('website', form, setForm, 'url', 'https://')}
              </div>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>メモ</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: `0.5px solid ${color.border}`, borderRadius: radius.lg, fontSize: font.size.base, outline: 'none', resize: 'vertical', color: color.textDark, fontFamily: font.family.sans, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Button type="button" variant="secondary" fullWidth onClick={() => setModal(false)}>
                  キャンセル
                </Button>
                <Button type="submit" loading={saving} disabled={saving} fullWidth>
                  {saving ? '保存中...' : '追加'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add contact modal */}
      {showContactModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setContactModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: color.white, borderRadius: 12, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: font.weight.medium, color: color.navy, marginBottom: 6 }}>担当者を追加</h2>
            <p style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: 20 }}>{selected?.name}</p>
            <form onSubmit={handleContactSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>氏名 *</label>
                {inp('name', contactForm, setContactForm)}
              </div>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>役職</label>
                {inp('title', contactForm, setContactForm, 'text', '例：シニアアドバイザー')}
              </div>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>メールアドレス</label>
                {inp('email', contactForm, setContactForm, 'email')}
              </div>
              <div>
                <label style={{ fontSize: font.size.xs, color: color.textMid, display: 'block', marginBottom: 4 }}>電話番号</label>
                {inp('phone', contactForm, setContactForm, 'tel')}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Button type="button" variant="secondary" fullWidth onClick={() => setContactModal(false)}>
                  キャンセル
                </Button>
                <Button type="submit" loading={saving} disabled={saving} fullWidth>
                  {saving ? '保存中...' : '追加'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
