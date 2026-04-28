import { useState, useRef, useEffect } from 'react'
import { C } from '../../../constants/colors'
import {
  insertContactVoiceInput,
  updateContactVoiceInput,
  uploadContactAudio,
  invokeProcessContactVoice,
} from '../../../lib/supabaseWrite'
import { useAuth } from '../../../hooks/useAuth'

const NAVY = '#0D2247'
const BLUE = '#1E40AF'
const GRAY_200 = '#E5E7EB'
const GRAY_50 = '#F8F9FA'
const GOLD = '#B8860B'

const MAX_RECORD_SEC = 300 // 5 分

function formatSec(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * 音声録音 + Whisper + Claude 処理を 1 ボタンで実現するインライン UI。
 * 録音停止後、自動的にアップロード + 処理 → onProcessed(result) を呼ぶ。
 *
 * Props:
 *  - targetKind: 'contact_memo' | 'client_update' | 'client_create'
 *  - contactId, clientId: 紐付け対象
 *  - onProcessed({ voiceInputId, transcript, ai_summary, ai_extracted, target_kind }): 結果コールバック
 *  - placeholder: 録音前のヒント文 (任意)
 *  - compact: 余白を詰めるモード (任意)
 *  - disabled: ボタン無効化
 */
export default function VoiceRecorderInline({
  targetKind,
  contactId = null,
  clientId = null,
  onProcessed,
  placeholder,
  compact = false,
  disabled = false,
}) {
  const { profile } = useAuth()
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startedAtRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try { recorderRef.current.stop() } catch { /* ignore */ }
      }
    }
  }, [])

  const start = async () => {
    if (recording || processing || disabled) return
    setErrorMsg('')
    chunksRef.current = []
    setElapsedSec(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeOrder = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      let mime = ''
      for (const m of mimeOrder) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break }
      }
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => handleStopped(stream, recorder.mimeType || mime || 'audio/webm')
      recorder.onerror = (e) => {
        console.error('[VoiceRecorder] onerror', e)
        setErrorMsg('録音中にエラーが発生しました')
        setRecording(false)
      }
      recorderRef.current = recorder
      recorder.start()
      startedAtRef.current = Date.now()
      setRecording(true)
      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setElapsedSec(sec)
        if (sec >= MAX_RECORD_SEC) stop()
      }, 250)
    } catch (e) {
      console.error('[VoiceRecorder] mic permission error', e)
      setErrorMsg('マイクへのアクセスが許可されていません。ブラウザの権限を確認してください。')
    }
  }

  const stop = () => {
    if (!recording) return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setRecording(false)
    try {
      const r = recorderRef.current
      if (r && r.state === 'recording') r.stop()
    } catch (e) {
      console.error('[VoiceRecorder] stop error', e)
    }
  }

  const handleStopped = async (stream, mime) => {
    try {
      stream.getTracks().forEach(t => t.stop())
    } catch { /* ignore */ }
    if (chunksRef.current.length === 0) {
      setErrorMsg('録音データが空でした。マイクを確認して再度お試しください。')
      return
    }
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
    const ext = mime?.includes('mp4') ? 'm4a' : mime?.includes('ogg') ? 'ogg' : 'webm'
    const duration = elapsedSec
    setProcessing(true)
    try {
      // 1) voice_input レコード作成
      const { data: vi, error: viErr } = await insertContactVoiceInput({
        targetKind,
        contactId,
        clientId,
        durationSec: duration,
        uploadedByUserId: profile?.id || null,
        uploadedByName: profile?.name || null,
      })
      if (viErr || !vi?.id) throw new Error(viErr?.message || 'voice_input 作成失敗')

      // 2) Storage アップロード
      const { path, error: upErr } = await uploadContactAudio(vi.id, blob, ext)
      if (upErr || !path) throw new Error(upErr?.message || 'アップロード失敗')

      // 3) audio_url 更新
      await updateContactVoiceInput(vi.id, { audio_url: path, duration_sec: duration })

      // 4) Edge Function 呼び出し
      const { data: result, error: procErr } = await invokeProcessContactVoice(vi.id)
      if (procErr) throw new Error(typeof procErr === 'string' ? procErr : (procErr.message || 'AI 処理失敗'))

      onProcessed?.({
        voiceInputId: vi.id,
        transcript: result?.transcript || '',
        ai_summary: result?.ai_summary || '',
        ai_extracted: result?.ai_extracted || {},
        target_kind: result?.target_kind || targetKind,
      })
    } catch (e) {
      console.error('[VoiceRecorder] process error', e)
      setErrorMsg(e.message || String(e))
    } finally {
      setProcessing(false)
    }
  }

  const padY = compact ? 8 : 12
  const padX = compact ? 12 : 16

  return (
    <div style={{
      border: `1px solid ${GRAY_200}`,
      borderRadius: 4,
      background: GRAY_50,
      padding: `${padY}px ${padX}px`,
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {!recording && !processing && (
          <button
            onClick={start}
            disabled={disabled}
            style={{
              padding: '7px 14px',
              borderRadius: 4,
              border: `1px solid ${NAVY}`,
              background: '#fff',
              color: NAVY,
              fontSize: 12,
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            録音開始
          </button>
        )}
        {recording && (
          <button
            onClick={stop}
            style={{
              padding: '7px 14px',
              borderRadius: 4,
              border: `1px solid ${BLUE}`,
              background: BLUE,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            録音停止して整理
          </button>
        )}
        {processing && (
          <button disabled style={{
            padding: '7px 14px',
            borderRadius: 4,
            border: `1px solid ${GRAY_200}`,
            background: '#fff',
            color: C.textLight,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'not-allowed',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}>
            AI 整理中...
          </button>
        )}

        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: recording ? BLUE : C.textLight,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatSec(elapsedSec)} / {formatSec(MAX_RECORD_SEC)}
        </span>

        {recording && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, color: BLUE, fontWeight: 600,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: BLUE,
              animation: 'voiceRecPulse 1.4s ease-in-out infinite',
            }} />
            REC
          </span>
        )}
      </div>

      {placeholder && !recording && !processing && (
        <div style={{ fontSize: 10, color: C.textLight, marginTop: 8, lineHeight: 1.5 }}>
          {placeholder}
        </div>
      )}

      {errorMsg && (
        <div style={{
          fontSize: 10,
          color: '#DC2626',
          marginTop: 8,
          padding: '6px 8px',
          background: '#FEF2F2',
          borderRadius: 3,
          border: '1px solid #FECACA',
        }}>
          {errorMsg}
        </div>
      )}

      <style>{`
        @keyframes voiceRecPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
