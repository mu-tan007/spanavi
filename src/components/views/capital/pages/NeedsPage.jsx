import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const card = { background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 12, padding: 16 }

const PRIORITY_STYLE = {
  1: { bg: '#032D60', color: '#fff',    label: '高' },
  2: { bg: '#F8F8F8', color: '#032D60', label: '中' },
  3: { bg: '#F3F2F2', color: '#A0A0A0', label: '低' },
}

const INDUSTRY_OPTIONS = [
  '製造業', 'IT・ソフトウェア', '建設・不動産', '医療・介護', '食品・飲料',
  '小売・流通', '物流・運輸', '金融・保険', 'サービス業', 'エネルギー',
  '農業・林業・水産業', '教育', 'メディア・エンターテイメント', 'その他',
]

function fmt(v) {
  if (!v) return '—'
  return v >= 100000000 ? `¥${(v/100000000).toFixed(0)}億` : `¥${(v/10000).toFixed(0)}万`
}

export default function NeedsPage() {
  const qc = useQueryClient()
  const [showModal, setModal] = useState(false)
  const [showBroadcast, setBroadcast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    industry_label: '', ev_min: '', ev_max: '',
    ebitda_multiple_max: '', region: '', priority: 2, notes: '',
  })
  const [broadcastBody, setBroadcastBody] = useState('')

  const { data: needs = [], isLoading } = useQuery({
    queryKey: ['needs'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_acquisition_needs').select('*').order('priority').order('created_at', { ascending: false })
      return data || []
    },
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['all-contacts'],
    queryFn: async () => {
      const { data } = await supabase.from('cap_contacts').select('id, name, email, intermediaries(name)').not('email', 'is', null)
      return data || []
    },
  })

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, priority: Number(form.priority) }
    ;['ev_min','ev_max','ebitda_multiple_max'].forEach(k => { if (!payload[k]) payload[k] = null })
    await supabase.from('cap_acquisition_needs').insert(payload)
    qc.invalidateQueries({ queryKey: ['needs'] })
    setSaving(false)
    setModal(false)
    setForm({ industry_label: '', ev_min: '', ev_max: '', ebitda_multiple_max: '', region: '', priority: 2, notes: '' })
  }

  async function handleBroadcast(need) {
    setBroadcast(need)
    setBroadcastBody(
      `お世話になっております。\n\n弊社では現在、以下の条件での買収先を探しております。\n\n` +
      `【業種】${need.industry_label || '—'}\n` +
      `【EV目安】${fmt(need.ev_min)} 〜 ${fmt(need.ev_max)}\n` +
      `【地域】${need.region || '—'}\n` +
      `【備考】${need.notes || '—'}\n\n` +
      `ご案件がございましたら、ぜひご紹介いただけますと幸いです。\nどうぞよろしくお願いいたします。`
    )
  }

  async function handleSendBroadcast() {
    if (!showBroadcast) return
    setSaving(true)
    await supabase.from('cap_need_broadcasts').insert({
      need_id: showBroadcast.id,
      subject: `【買収ニーズ】${showBroadcast.industry_label || '業種未指定'} EV ${fmt(showBroadcast.ev_min)}〜${fmt(showBroadcast.ev_max)}`,
      body: broadcastBody,
      sent_to: contacts.map(c => ({ contact_id: c.id, email: c.email })),
      sent_at: new Date().toISOString(),
    })
    setSaving(false)
    setBroadcast(null)
    alert(`${contacts.length}件の担当者に送信しました（実際の送信はEdge Function連携後に有効になります）`)
  }

  async function toggleActive(need) {
    await supabase.from('cap_acquisition_needs').update({ is_active: !need.is_active }).eq('id', need.id)
    qc.invalidateQueries({ queryKey: ['needs'] })
  }

  const inp = (key, type = 'text', placeholder = '') => (
    <input type={type} value={form[key]} placeholder={placeholder}
      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }} />
  )

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: '#FFFFFF' }}>買収ニーズ</h1>
          <p style={{ fontSize: 12, color: '#A0A0A0', marginTop: 3 }}>
            有効 {needs.filter(n => n.is_active).length} 件 / 全 {needs.length} 件
          </p>
        </div>
        <button onClick={() => setModal(true)}
          style={{ height: 36, padding: '0 16px', background: '#032D60', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          + ニーズを追加
        </button>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 13, color: '#E5E5E5', textAlign: 'center', padding: '40px 0' }}>読み込み中...</div>
      ) : needs.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 13, color: '#E5E5E5', marginBottom: 8 }}>買収ニーズが登録されていません</div>
          <div style={{ fontSize: 12, color: '#E5E5E5' }}>「+ ニーズを追加」から登録してください</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {needs.map(need => {
            const ps = PRIORITY_STYLE[need.priority] || PRIORITY_STYLE[2]
            return (
              <div key={need.id} style={{ ...card, opacity: need.is_active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 500, background: ps.bg, color: ps.color }}>
                        優先度 {ps.label}
                      </span>
                      {!need.is_active && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#F3F2F2', color: '#A0A0A0' }}>無効</span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#FFFFFF' }}>{need.industry_label || '業種未指定'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#A0A0A0', marginBottom: 2 }}>EV目安</div>
                        <div style={{ fontSize: 13, color: '#FFFFFF' }}>{fmt(need.ev_min)} 〜 {fmt(need.ev_max)}</div>
                      </div>
                      {need.ebitda_multiple_max && (
                        <div>
                          <div style={{ fontSize: 10, color: '#A0A0A0', marginBottom: 2 }}>EBITDA倍率上限</div>
                          <div style={{ fontSize: 13, color: '#FFFFFF' }}>{need.ebitda_multiple_max}x</div>
                        </div>
                      )}
                      {need.region && (
                        <div>
                          <div style={{ fontSize: 10, color: '#A0A0A0', marginBottom: 2 }}>地域</div>
                          <div style={{ fontSize: 13, color: '#FFFFFF' }}>{need.region}</div>
                        </div>
                      )}
                    </div>
                    {need.notes && (
                      <div style={{ fontSize: 12, color: '#706E6B', marginTop: 8, lineHeight: 1.6 }}>{need.notes}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleBroadcast(need)}
                      style={{ height: 30, padding: '0 12px', background: '#F8F8F8', border: 'none', borderRadius: 5, fontSize: 11, color: '#032D60', cursor: 'pointer', fontWeight: 500 }}>
                      一斉配信
                    </button>
                    <button onClick={() => toggleActive(need)}
                      style={{ height: 30, padding: '0 12px', background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 5, fontSize: 11, color: '#706E6B', cursor: 'pointer' }}>
                      {need.is_active ? '無効化' : '有効化'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add modal */}
      {showModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFF', marginBottom: 20 }}>買収ニーズを追加</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>業種 *</label>
                <select value={form.industry_label} onChange={e => setForm(f => ({ ...f, industry_label: e.target.value }))} required
                  style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                  <option value="">選択してください</option>
                  {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>EV下限（円）</label>
                  {inp('ev_min', 'number', '例: 300000000')}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>EV上限（円）</label>
                  {inp('ev_max', 'number', '例: 1000000000')}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>EBITDA倍率上限</label>
                  {inp('ebitda_multiple_max', 'number', '例: 8')}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>優先度</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    style={{ width: '100%', height: 36, padding: '0 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                    <option value={1}>高</option>
                    <option value={2}>中</option>
                    <option value={3}>低</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>地域</label>
                {inp('region', 'text', '例: 関東圏、全国可')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>備考・詳細条件</label>
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

      {/* Broadcast modal */}
      {showBroadcast && (
        <div onClick={e => { if (e.target === e.currentTarget) setBroadcast(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 560 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFF', marginBottom: 4 }}>買収ニーズ一斉配信</h2>
            <p style={{ fontSize: 12, color: '#A0A0A0', marginBottom: 16 }}>
              登録済み担当者 {contacts.length} 名に送信されます
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#A0A0A0', display: 'block', marginBottom: 4 }}>メール本文</label>
              <textarea value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} rows={10}
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 12, outline: 'none', resize: 'vertical', lineHeight: 1.8 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setBroadcast(null)}
                style={{ flex: 1, height: 36, background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 6, fontSize: 13, color: '#706E6B', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={handleSendBroadcast} disabled={saving}
                style={{ flex: 1, height: 36, background: '#032D60', border: 'none', borderRadius: 6, fontSize: 13, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>
                {saving ? '送信中...' : `${contacts.length}件に送信`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
