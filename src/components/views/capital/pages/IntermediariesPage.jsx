import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import FirmContractsPanel from '../components/firm/FirmContractsPanel'
import PageHeader from '../../../common/PageHeader'

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

const TYPE_STYLE = {
  intermediary: { bg: '#F8F8F8', color: '#032D60', label: '仲介会社' },
  fa:           { bg: '#E1F5EE', color: '#2E844A', label: 'FA' },
  self:         { bg: '#F3F2F2', color: '#706E6B', label: '自社' },
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

export default function IntermediariesPage() {
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
    <input type={type} value={val[key]} placeholder={placeholder}
      onChange={e => setter(f => ({ ...f, [key]: e.target.value }))}
      style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }} />
  )

  return (
    <div style={{ maxWidth: '100%', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        bleed={false}
        eyebrow="Spartia Capital · 仲介"
        title="仲介会社・FA"
        description={`${intermediaries.length} 社登録中`}
        style={{ marginBottom: 20 }}
        right={
          <button onClick={() => setModal(true)}
            style={{ height: 32, padding: '0 14px', background: '#032D60', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + 追加
          </button>
        }
      />
      <div style={{ padding: '0 24px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14 }}>
        {/* List */}
        <div style={card}>
          <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 10, letterSpacing: '0.5px' }}>一覧</div>
          {isLoading ? (
            <div style={{ fontSize: 12, color: '#706E6B', textAlign: 'center', padding: '20px 0' }}>読み込み中...</div>
          ) : intermediaries.length === 0 ? (
            <div style={{ fontSize: 12, color: '#706E6B', textAlign: 'center', padding: '20px 0' }}>登録がありません</div>
          ) : (
            intermediaries.map(i => {
              const ts = TYPE_STYLE[i.type] || TYPE_STYLE.intermediary
              const isSelected = selected?.id === i.id
              return (
                <div key={i.id} onClick={() => setSelected(i)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                    background: isSelected ? '#f0f5ff' : 'transparent',
                    border: isSelected ? '0.5px solid #c0d0f0' : '0.5px solid transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#032D60', flex: 1 }}>{i.name}</div>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: ts.bg, color: ts.color }}>{ts.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#706E6B' }}>
                    担当者 {i.contacts?.length || 0} 名
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Detail */}
        <div>
          {!selected ? (
            <div style={{ ...card, textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: 13, color: '#706E6B' }}>左の一覧から会社を選択してください</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 500, color: '#032D60' }}>{selectedFull?.name}</h2>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: TYPE_STYLE[selectedFull?.type]?.bg, color: TYPE_STYLE[selectedFull?.type]?.color }}>
                        {TYPE_STYLE[selectedFull?.type]?.label}
                      </span>
                    </div>
                    {selectedFull?.website && (
                      <a href={selectedFull.website} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: '#032D60' }}>{selectedFull.website}</a>
                    )}
                  </div>
                </div>
                {selectedFull?.notes && (
                  <div style={{ fontSize: 12, color: '#706E6B', lineHeight: 1.7, padding: '10px 0', borderTop: '0.5px solid #E5E5E5' }}>
                    {selectedFull.notes}
                  </div>
                )}
              </div>

              {/* Contacts */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#706E6B' }}>担当者一覧</div>
                  <button onClick={() => setContactModal(true)}
                    style={{ height: 28, padding: '0 10px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 11, color: '#fff', cursor: 'pointer' }}>
                    + 担当者追加
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#706E6B', textAlign: 'center', padding: '16px 0' }}>担当者がいません</div>
                ) : (
                  contacts.map((c, i) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < contacts.length - 1 ? '0.5px solid #E5E5E5' : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F8F8F8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#032D60', flexShrink: 0 }}>
                        {c.name?.slice(0, 1)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#032D60' }}>{c.name}</div>
                        {c.title && <div style={{ fontSize: 11, color: '#706E6B' }}>{c.title}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: '#706E6B' }}>{c.email}</div>
                      {c.phone && <div style={{ fontSize: 12, color: '#706E6B' }}>{c.phone}</div>}
                    </div>
                  ))
                )}
              </div>

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
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 20 }}>仲介会社・FAを追加</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>会社名 *</label>
                {inp('name', form, setForm, 'text', '例：M&Aキャピタルパートナーズ')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>種別</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                  <option value="intermediary">仲介会社</option>
                  <option value="fa">FA</option>
                  <option value="self">自社</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>Webサイト</label>
                {inp('website', form, setForm, 'url', 'https://')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>メモ</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setModal(false)}
                  style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>
                  キャンセル
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? '保存中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add contact modal */}
      {showContactModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setContactModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#032D60', marginBottom: 6 }}>担当者を追加</h2>
            <p style={{ fontSize: 12, color: '#706E6B', marginBottom: 20 }}>{selected?.name}</p>
            <form onSubmit={handleContactSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>氏名 *</label>
                {inp('name', contactForm, setContactForm)}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>役職</label>
                {inp('title', contactForm, setContactForm, 'text', '例：シニアアドバイザー')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>メールアドレス</label>
                {inp('email', contactForm, setContactForm, 'email')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#706E6B', display: 'block', marginBottom: 4 }}>電話番号</label>
                {inp('phone', contactForm, setContactForm, 'tel')}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setContactModal(false)}
                  style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>
                  キャンセル
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? '保存中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
