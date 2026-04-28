import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
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

const MAX_RECORD_SEC = 300

function formatSec(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * 音声録音 + Whisper + Claude 処理を 1 アイコンで実現するインライン UI。
 * デフォルトはアイコンのみの控えめな表示。録音時のみタイマーと停止ボタンを出す。
 *
 * Props:
 *  - targetKind: 'contact_memo' | 'client_update' | 'client_create'
 *  - contactId, clientId: 紐付け対象
 *  - onProcessed({ voiceInputId, transcript, ai_summary, ai_extracted, target_kind })
 *  - onError(msg): エラー時のフィードバック
 *  - tooltip: ホバー時のラベル（デフォルト: "ボイスモードを使用"）
 *  - size: アイコンボタンの一辺 px (デフォルト 30)
 *  - disabled
 */
export default function VoiceRecorderInline({
  targetKind,
  contactId = null,
  clientId = null,
  onProcessed,
  onError,
  tooltip = 'ボイスモードを使用',
  size = 30,
  disabled = false,
}) {
  const { profile } = useAuth()
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

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
        onError?.('録音中にエラーが発生しました')
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
      onError?.('マイクへのアクセスが許可されていません')
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
      onError?.('録音データが空でした')
      return
    }
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
    const ext = mime?.includes('mp4') ? 'm4a' : mime?.includes('ogg') ? 'ogg' : 'webm'
    const duration = elapsedSec
    setProcessing(true)
    try {
      const { data: vi, error: viErr } = await insertContactVoiceInput({
        targetKind,
        contactId,
        clientId,
        durationSec: duration,
        uploadedByUserId: profile?.id || null,
        uploadedByName: profile?.name || null,
      })
      if (viErr || !vi?.id) throw new Error(viErr?.message || 'voice_input 作成失敗')

      const { path, error: upErr } = await uploadContactAudio(vi.id, blob, ext)
      if (upErr || !path) throw new Error(upErr?.message || 'アップロード失敗')

      await updateContactVoiceInput(vi.id, { audio_url: path, duration_sec: duration })

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
      onError?.(e.message || String(e))
    } finally {
      setProcessing(false)
    }
  }

  const baseBtn = {
    width: size,
    height: size,
    borderRadius: 4,
    border: `1px solid ${GRAY_200}`,
    background: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: NAVY,
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
    padding: 0,
    fontFamily: "'Noto Sans JP', sans-serif",
  }

  if (processing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span title="AI 整理中" style={{ ...baseBtn, color: C.textLight, cursor: 'progress' }}>
          <Loader2 size={Math.round(size * 0.5)} style={{ animation: 'voiceRecSpin 0.9s linear infinite' }} />
        </span>
        <style>{`@keyframes voiceRecSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </span>
    )
  }

  if (recording) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={stop}
          title="録音を停止して AI 整理"
          style={{
            ...baseBtn,
            background: BLUE,
            borderColor: BLUE,
            color: '#fff',
          }}
        >
          <Square size={Math.round(size * 0.42)} fill="#fff" />
        </button>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: BLUE,
          fontVariantNumeric: 'tabular-nums',
        }}>{formatSec(elapsedSec)}</span>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: BLUE,
          animation: 'voiceRecPulse 1.4s ease-in-out infinite',
        }} />
        <style>{`@keyframes voiceRecPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      title={tooltip}
      aria-label={tooltip}
      style={{
        ...baseBtn,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = GRAY_50
        e.currentTarget.style.borderColor = NAVY
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fff'
        e.currentTarget.style.borderColor = GRAY_200
      }}
    >
      <Mic size={Math.round(size * 0.5)} />
    </button>
  )
}
