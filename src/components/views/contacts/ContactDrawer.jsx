import { useState, useEffect, useRef } from 'react'
import { C } from '../../../constants/colors'
import {
  insertClientContact,
  updateClientContact,
  deleteClientContact,
  setPrimaryContact,
  fetchContactMemoEvents,
  insertContactMemoEvent,
} from '../../../lib/supabaseWrite'
import { useAuth } from '../../../hooks/useAuth'
import VoiceRecorderInline from './VoiceRecorderInline'

const NAVY = '#0D2247'
const BLUE = '#1E40AF'
const GRAY_200 = '#E5E7EB'
const GRAY_100 = '#F3F4F6'
const GRAY_50 = '#F8F9FA'
const GOLD = '#B8860B'

const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 4,
  border: `1px solid ${GRAY_200}`,
  fontSize: 12,
  fontFamily: "'Noto Sans JP', sans-serif",
  outline: 'none',
  background: '#fff',
}
const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 3, display: 'block' }

function emptyContactForm() {
  return {
    name: '',
    email: '',
    slackMemberId: '',
    googleCalendarId: '',
    schedulingUrl: '',
    schedulingUrl2: '',
    schedulingLabel: '',
    schedulingLabel2: '',
    schedulingNotes: '',
    isPrimary: false,
  }
}

function fmtDate(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch { return '' }
}

/**
 * Contact Drawer — 担当者の編集・新規追加 + 性格メモ管理
 *
 * Props:
 *  - isOpen: 開閉
 *  - onClose: 閉じる
 *  - mode: 'add' | 'edit'
 *  - clientSupaId: 親クライアント UUID
 *  - clientContactMethod: 親クライアントの連絡手段（Slack ID 表示判定用）
 *  - existingContact: mode='edit' 時の既存データ（id, name, email, slackMemberId, ... isPrimary）
 *  - onChanged: 変更通知 ({ type, contact })
 *      type: 'added' | 'updated' | 'deleted' | 'primary_changed'
 */
export default function ContactDrawer({
  isOpen,
  onClose,
  mode,
  clientSupaId,
  clientContactMethod,
  existingContact = null,
  onChanged,
}) {
  const { profile } = useAuth()
  const [tab, setTab] = useState('basic')
  const [form, setForm] = useState(emptyContactForm())
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // メモ系
  const [memoEvents, setMemoEvents] = useState([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [manualMemoText, setManualMemoText] = useState('')
  const [manualMemoSaving, setManualMemoSaving] = useState(false)
  const [voicePending, setVoicePending] = useState(null) // {voiceInputId, transcript, ai_summary, ai_extracted}
  const [showRawTranscriptId, setShowRawTranscriptId] = useState(null)

  const drawerRef = useRef(null)

  // 既存担当者のデータをフォームに反映
  useEffect(() => {
    if (!isOpen) return
    setTab('basic')
    setErrorMsg('')
    setManualMemoText('')
    setVoicePending(null)
    if (mode === 'edit' && existingContact) {
      setForm({
        name: existingContact.name || '',
        email: existingContact.email || '',
        slackMemberId: existingContact.slackMemberId || '',
        googleCalendarId: existingContact.googleCalendarId || '',
        schedulingUrl: existingContact.schedulingUrl || '',
        schedulingUrl2: existingContact.schedulingUrl2 || '',
        schedulingLabel: existingContact.schedulingLabel || '',
        schedulingLabel2: existingContact.schedulingLabel2 || '',
        schedulingNotes: existingContact.schedulingNotes || '',
        isPrimary: existingContact.isPrimary === true,
      })
    } else {
      setForm(emptyContactForm())
    }
  }, [isOpen, mode, existingContact])

  // メモ履歴ロード
  useEffect(() => {
    if (!isOpen || mode !== 'edit' || !existingContact?.id) { setMemoEvents([]); return }
    let cancelled = false
    setMemosLoading(true)
    fetchContactMemoEvents(existingContact.id).then(({ data }) => {
      if (!cancelled) {
        setMemoEvents(data || [])
        setMemosLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [isOpen, mode, existingContact?.id])

  const u = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSaveBasic = async () => {
    if (!form.name?.trim()) { setErrorMsg('名前は必須です'); return }
    setErrorMsg('')
    setSaving(true)
    try {
      if (mode === 'add') {
        const { data, error } = await insertClientContact(clientSupaId, form)
        if (error) throw new Error(error.message || '保存に失敗しました')
        // is_primary を別ステップで処理（unique index 競合回避）
        if (form.isPrimary && data?.id) {
          const { error: pErr } = await setPrimaryContact(clientSupaId, data.id)
          if (pErr) throw new Error(pErr.message || '主担当の設定に失敗しました')
        }
        onChanged?.({
          type: 'added',
          contact: {
            id: data.id,
            name: data.name,
            email: data.email,
            slackMemberId: data.slack_member_id || '',
            googleCalendarId: data.google_calendar_id || '',
            schedulingUrl: data.scheduling_url || '',
            schedulingUrl2: data.scheduling_url_2 || '',
            schedulingLabel: data.scheduling_label || '',
            schedulingLabel2: data.scheduling_label_2 || '',
            schedulingNotes: data.scheduling_notes || '',
            isPrimary: form.isPrimary,
          },
        })
        onClose?.()
        return
      }

      // edit
      const id = existingContact?.id
      if (!id) throw new Error('編集対象 ID が不明です')
      // 主担当切替は別関数で（自身を主担当に上げる場合）
      const wasPrimary = existingContact.isPrimary === true
      const wantsPrimary = form.isPrimary === true
      // is_primary 以外のフィールドだけ先に更新
      const error = await updateClientContact(id, { ...form, isPrimary: undefined })
      if (error) throw new Error(error.message || '保存に失敗しました')
      if (!wasPrimary && wantsPrimary) {
        const { error: pErr } = await setPrimaryContact(clientSupaId, id)
        if (pErr) throw new Error(pErr.message || '主担当の設定に失敗しました')
      } else if (wasPrimary && !wantsPrimary) {
        // 主担当を外す（誰も主担当でない状態）
        const eOff = await updateClientContact(id, { name: form.name, email: form.email, isPrimary: false })
        if (eOff) throw new Error(eOff.message || '主担当の解除に失敗しました')
      }
      onChanged?.({
        type: 'updated',
        contact: { id, ...form },
      })
      onClose?.()
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (mode !== 'edit' || !existingContact?.id) return
    if (!window.confirm(`${existingContact.name} を削除しますか？\n（性格メモも削除されます）`)) return
    setSaving(true)
    try {
      const error = await deleteClientContact(existingContact.id)
      if (error) throw new Error(error.message || '削除に失敗しました')
      onChanged?.({ type: 'deleted', contact: { id: existingContact.id } })
      onClose?.()
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // メモ: 手入力で追記
  const handleAppendManualMemo = async () => {
    const body = manualMemoText.trim()
    if (!body) return
    if (!existingContact?.id) { setErrorMsg('既存の担当者でのみメモ追記が可能です。先に基本情報を保存してください。'); return }
    setManualMemoSaving(true)
    try {
      const { data, error } = await insertContactMemoEvent({
        contactId: existingContact.id,
        bodyMd: body,
        source: 'manual',
        authorUserId: profile?.id || null,
        authorName: profile?.name || null,
      })
      if (error) throw new Error(error.message || '追記に失敗しました')
      setMemoEvents(prev => [data, ...prev])
      setManualMemoText('')
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setManualMemoSaving(false)
    }
  }

  // メモ: 音声録音 → AI 整理結果のプレビュー
  const handleVoiceProcessed = (result) => {
    setVoicePending(result)
  }

  // メモ: AI 整理結果を承認して追記
  const handleConfirmVoiceMemo = async () => {
    if (!voicePending || !existingContact?.id) return
    setManualMemoSaving(true)
    try {
      const { data, error } = await insertContactMemoEvent({
        contactId: existingContact.id,
        bodyMd: voicePending.ai_summary || voicePending.transcript || '',
        rawTranscript: voicePending.transcript || '',
        voiceInputId: voicePending.voiceInputId,
        source: 'voice_ai',
        extracted: voicePending.ai_extracted || {},
        authorUserId: profile?.id || null,
        authorName: profile?.name || null,
      })
      if (error) throw new Error(error.message || '追記に失敗しました')
      setMemoEvents(prev => [data, ...prev])
      setVoicePending(null)
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setManualMemoSaving(false)
    }
  }

  const handleDiscardVoiceMemo = () => setVoicePending(null)

  if (!isOpen) return null

  const isSlack = clientContactMethod === 'Slack'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 25000,
        animation: 'cdFadeIn 0.15s ease',
      }}
    >
      <div
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(560px, 100vw)',
          background: '#fff',
          borderLeft: `1px solid ${GRAY_200}`,
          boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Noto Sans JP', sans-serif",
          animation: 'cdSlideIn 0.18s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          background: NAVY,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5 }}>
              {mode === 'add' ? '担当者を追加' : '担当者の編集'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
              {mode === 'edit' ? (existingContact?.name || '担当者') : '新規担当者'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent',
              color: '#fff',
              fontSize: 12,
              padding: '4px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >閉じる</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${GRAY_200}`,
          background: '#fff',
        }}>
          {[
            { id: 'basic', label: '基本' },
            { id: 'memo', label: 'メモ', disabled: mode === 'add' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => !t.disabled && setTab(t.id)}
              disabled={t.disabled}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'transparent',
                color: tab === t.id ? NAVY : (t.disabled ? '#ccc' : C.textLight),
                fontSize: 12,
                fontWeight: tab === t.id ? 700 : 500,
                fontFamily: "'Noto Sans JP', sans-serif",
                cursor: t.disabled ? 'not-allowed' : 'pointer',
                borderBottom: tab === t.id ? `2px solid ${NAVY}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.id === 'memo' && t.disabled && (
                <span style={{ fontSize: 9, color: '#aaa', marginLeft: 6 }}>(保存後)</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {errorMsg && (
            <div style={{
              fontSize: 11, color: '#DC2626', background: '#FEF2F2',
              border: '1px solid #FECACA', borderRadius: 4,
              padding: '8px 12px', marginBottom: 12,
            }}>
              {errorMsg}
            </div>
          )}

          {tab === 'basic' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>名前 <span style={{ color: '#DC2626' }}>*</span></label>
                <input value={form.name} onChange={e => u('name', e.target.value)} style={inputStyle} placeholder="田中 一郎" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>メールアドレス</label>
                <input value={form.email} onChange={e => u('email', e.target.value)} style={inputStyle} placeholder="tanaka@example.com" />
              </div>

              {isSlack && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Slack メンバー ID</label>
                  <input value={form.slackMemberId} onChange={e => u('slackMemberId', e.target.value)} style={inputStyle} placeholder="@U123ABCDE" />
                </div>
              )}

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Google カレンダー ID</label>
                <input value={form.googleCalendarId} onChange={e => u('googleCalendarId', e.target.value)} style={inputStyle} placeholder="xxxx@gmail.com" />
              </div>

              <div>
                <label style={labelStyle}>日程調整ラベル①</label>
                <input value={form.schedulingLabel} onChange={e => u('schedulingLabel', e.target.value)} style={inputStyle} placeholder="例: 対面" />
              </div>
              <div>
                <label style={labelStyle}>日程調整 URL①</label>
                <input value={form.schedulingUrl} onChange={e => u('schedulingUrl', e.target.value)} style={inputStyle} placeholder="https://..." />
              </div>
              <div>
                <label style={labelStyle}>日程調整ラベル②</label>
                <input value={form.schedulingLabel2} onChange={e => u('schedulingLabel2', e.target.value)} style={inputStyle} placeholder="例: WEB" />
              </div>
              <div>
                <label style={labelStyle}>日程調整 URL②</label>
                <input value={form.schedulingUrl2} onChange={e => u('schedulingUrl2', e.target.value)} style={inputStyle} placeholder="https://..." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>日程調整に関するメモ</label>
                <input value={form.schedulingNotes} onChange={e => u('schedulingNotes', e.target.value)} style={inputStyle} />
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: '10px 12px', border: `1px solid ${GRAY_200}`, borderRadius: 4, background: GRAY_50 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isPrimary === true}
                    onChange={e => u('isPrimary', e.target.checked)}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>この担当者を主担当に設定</span>
                </label>
                <div style={{ fontSize: 10, color: C.textLight, marginTop: 4, lineHeight: 1.5 }}>
                  CRM 一覧の「主担当」列にこの担当者が表示されます。1 クライアントに 1 名のみ。
                </div>
              </div>
            </div>
          )}

          {tab === 'memo' && (
            <div>
              {/* 入力エリア（手入力 + 右上のマイクアイコン） */}
              <div style={{
                position: 'relative',
                marginBottom: 12,
              }}>
                <div style={{
                  position: 'absolute', top: 6, right: 6, zIndex: 1,
                }}>
                  <VoiceRecorderInline
                    targetKind="contact_memo"
                    contactId={existingContact?.id}
                    onProcessed={handleVoiceProcessed}
                    onError={(msg) => setErrorMsg(msg)}
                    disabled={!!voicePending}
                    size={28}
                  />
                </div>
                <textarea
                  value={manualMemoText}
                  onChange={e => setManualMemoText(e.target.value)}
                  rows={4}
                  placeholder="メモを入力するか、右上のマイクから音声で追記"
                  style={{
                    ...inputStyle,
                    paddingRight: 44,
                    resize: 'vertical',
                    lineHeight: 1.6,
                    background: '#fff',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <button
                    onClick={handleAppendManualMemo}
                    disabled={!manualMemoText.trim() || manualMemoSaving}
                    style={{
                      padding: '6px 14px', borderRadius: 4,
                      border: `1px solid ${NAVY}`,
                      background: '#fff', color: NAVY,
                      fontSize: 11, fontWeight: 600,
                      cursor: (!manualMemoText.trim() || manualMemoSaving) ? 'not-allowed' : 'pointer',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      opacity: (!manualMemoText.trim() || manualMemoSaving) ? 0.5 : 1,
                    }}
                  >{manualMemoSaving ? '追記中...' : '追記する'}</button>
                </div>
              </div>

              {voicePending && (
                <div style={{
                  border: `1px solid ${GOLD}`,
                  borderLeft: `3px solid ${GOLD}`,
                  borderRadius: 4,
                  padding: '12px 14px',
                  marginBottom: 12,
                  background: '#FFFBF0',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 6 }}>
                    AI 整理プレビュー
                  </div>
                  <div style={{
                    whiteSpace: 'pre-wrap', fontSize: 12, color: C.textDark, lineHeight: 1.7,
                    background: '#fff', padding: 10, borderRadius: 3, border: `1px solid ${GRAY_200}`,
                  }}>
                    {voicePending.ai_summary || '(AI から空の応答が返りました)'}
                  </div>
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 10, color: C.textLight, cursor: 'pointer' }}>元の文字起こしを見る</summary>
                    <div style={{
                      whiteSpace: 'pre-wrap', fontSize: 11, color: C.textMid, lineHeight: 1.6,
                      background: GRAY_50, padding: 8, borderRadius: 3, border: `1px solid ${GRAY_200}`, marginTop: 6,
                    }}>
                      {voicePending.transcript || '(文字起こし空)'}
                    </div>
                  </details>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      onClick={handleDiscardVoiceMemo}
                      disabled={manualMemoSaving}
                      style={{
                        padding: '6px 14px', borderRadius: 4,
                        border: `1px solid ${GRAY_200}`, background: '#fff',
                        fontSize: 11, color: C.textMid, cursor: manualMemoSaving ? 'not-allowed' : 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif",
                      }}
                    >破棄</button>
                    <button
                      onClick={handleConfirmVoiceMemo}
                      disabled={manualMemoSaving}
                      style={{
                        padding: '6px 14px', borderRadius: 4,
                        border: 'none', background: NAVY, color: '#fff',
                        fontSize: 11, fontWeight: 600,
                        cursor: manualMemoSaving ? 'not-allowed' : 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif",
                        opacity: manualMemoSaving ? 0.6 : 1,
                      }}
                    >{manualMemoSaving ? '追記中...' : 'これで追記する'}</button>
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 16, paddingTop: 12, borderTop: `1px solid ${GRAY_200}`,
                fontSize: 11, fontWeight: 700, color: NAVY,
              }}>
                これまでのメモ（{memoEvents.length}件）
              </div>
              {memosLoading && (
                <div style={{ fontSize: 11, color: C.textLight, padding: 12 }}>読み込み中...</div>
              )}
              {!memosLoading && memoEvents.length === 0 && (
                <div style={{ fontSize: 11, color: C.textLight, padding: 12 }}>
                  まだメモはありません。
                </div>
              )}
              {memoEvents.map(ev => {
                const tag = ev.source === 'voice_ai' ? '音声+AI'
                          : ev.source === 'voice_raw' ? '音声(原文)'
                          : ev.source === 'manual_ai' ? '手入力+AI'
                          : '手入力'
                const tagColor = ev.source?.startsWith('voice') ? GOLD : NAVY
                return (
                  <div key={ev.id} style={{
                    border: `1px solid ${GRAY_200}`,
                    borderRadius: 4,
                    padding: '10px 12px',
                    marginTop: 8,
                    background: '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: C.textLight }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(ev.created_at)}</span>
                      <span>·</span>
                      <span>{ev.author_name || '不明'}</span>
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        color: tagColor, padding: '1px 6px',
                        border: `1px solid ${tagColor}40`,
                        borderRadius: 3,
                      }}>{tag}</span>
                    </div>
                    <div style={{
                      whiteSpace: 'pre-wrap', fontSize: 12, color: C.textDark, lineHeight: 1.7,
                      marginTop: 6,
                    }}>
                      {ev.body_md}
                    </div>
                    {ev.raw_transcript && (
                      <details style={{ marginTop: 6 }}>
                        <summary
                          style={{ fontSize: 10, color: C.textLight, cursor: 'pointer' }}
                          onClick={() => setShowRawTranscriptId(prev => prev === ev.id ? null : ev.id)}
                        >元の文字起こしを見る</summary>
                        <div style={{
                          whiteSpace: 'pre-wrap', fontSize: 10, color: C.textMid, lineHeight: 1.6,
                          background: GRAY_50, padding: 8, borderRadius: 3, border: `1px solid ${GRAY_200}`, marginTop: 4,
                        }}>
                          {ev.raw_transcript}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${GRAY_200}`,
          display: 'flex',
          justifyContent: 'space-between',
          background: '#fff',
        }}>
          <div>
            {mode === 'edit' && (
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: '8px 16px', borderRadius: 4,
                  border: '1px solid #DC2626',
                  background: '#fff', color: '#DC2626',
                  fontSize: 12, fontWeight: 500,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: "'Noto Sans JP', sans-serif",
                  opacity: saving ? 0.5 : 1,
                }}
              >削除</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 4,
                border: `1px solid ${NAVY}`,
                background: '#fff', color: NAVY,
                fontSize: 12, fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: "'Noto Sans JP', sans-serif",
              }}
            >キャンセル</button>
            <button
              onClick={handleSaveBasic}
              disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 4,
                border: 'none',
                background: NAVY, color: '#fff',
                fontSize: 12, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: "'Noto Sans JP', sans-serif",
                opacity: saving ? 0.6 : 1,
              }}
            >{saving ? '保存中...' : (mode === 'add' ? '追加' : '保存')}</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cdFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cdSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  )
}
