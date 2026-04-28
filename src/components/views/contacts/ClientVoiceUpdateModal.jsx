import { useState, useRef, useEffect } from 'react';
import { C } from '../../../constants/colors';
import {
  insertContactVoiceInput,
  updateContactVoiceInput,
  uploadContactAudio,
  invokeProcessContactVoice,
  insertClientContact,
} from '../../../lib/supabaseWrite';
import { useAuth } from '../../../hooks/useAuth';
import { CLIENT_DB_TO_FE, CLIENT_FIELD_LABELS } from '../../../utils/clientFieldsMap';

const NAVY = '#0D2247';
const BLUE = '#1E40AF';
const GRAY_200 = '#E5E7EB';
const GRAY_100 = '#F3F4F6';
const GRAY_50 = '#F8F9FA';
const GOLD = '#B8860B';

const MAX_RECORD_SEC = 600;

const formatSec = (sec) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// マッピング・ラベルは clientFieldsMap.js に集約
const DB_TO_FE = CLIENT_DB_TO_FE;
const FIELD_LABELS = CLIENT_FIELD_LABELS;

/**
 * ClientVoiceUpdateModal — クライアント情報を音声で更新する
 *
 * Props:
 *  - isOpen
 *  - onClose
 *  - client: 現在のクライアントオブジェクト（_supaId 必須、その他既存値）
 *  - onApply: (patch, contactsToAdd) => Promise<void>
 *      patch: { company?, status?, ... } FE-key 形式
 *      contactsToAdd: [{ name, email, phone, role, slack_member_id }]
 */
export default function ClientVoiceUpdateModal({ isOpen, onClose, client, onApply }) {
  const { profile } = useAuth();

  const [phase, setPhase] = useState('record'); // 'record' | 'processing' | 'preview' | 'applying'
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const [voiceInputId, setVoiceInputId] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [extracted, setExtracted] = useState({}); // { client_fields, contacts_to_add }
  const [acceptedFields, setAcceptedFields] = useState({}); // FE-key → bool
  const [acceptedContacts, setAcceptedContacts] = useState({}); // index → bool

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPhase('record');
      setErrorMsg('');
      setVoiceInputId(null);
      setTranscript('');
      setAiSummary('');
      setExtracted({});
      setAcceptedFields({});
      setAcceptedContacts({});
      setElapsedSec(0);
      setRecording(false);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const start = async () => {
    if (recording) return;
    setErrorMsg('');
    chunksRef.current = [];
    setElapsedSec(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeOrder = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      let mime = '';
      for (const m of mimeOrder) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      }
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => handleStopped(stream, recorder.mimeType || mime || 'audio/webm');
      recorder.onerror = (e) => {
        console.error('[ClientVoice] onerror', e);
        setErrorMsg('録音中にエラーが発生しました');
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= MAX_RECORD_SEC) stop();
      }, 250);
    } catch (e) {
      console.error('[ClientVoice] mic permission error', e);
      setErrorMsg('マイクへのアクセスが許可されていません');
    }
  };

  const stop = () => {
    if (!recording) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    try {
      const r = recorderRef.current;
      if (r && r.state === 'recording') r.stop();
    } catch (e) {
      console.error('[ClientVoice] stop error', e);
    }
  };

  const handleStopped = async (stream, mime) => {
    try { stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    if (chunksRef.current.length === 0) {
      setErrorMsg('録音データが空でした');
      return;
    }
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
    const ext = mime?.includes('mp4') ? 'm4a' : mime?.includes('ogg') ? 'ogg' : 'webm';
    setPhase('processing');
    try {
      const { data: vi, error: viErr } = await insertContactVoiceInput({
        targetKind: 'client_update',
        clientId: client?._supaId || null,
        durationSec: elapsedSec,
        uploadedByUserId: profile?.id || null,
        uploadedByName: profile?.name || null,
      });
      if (viErr || !vi?.id) throw new Error(viErr?.message || 'voice_input 作成失敗');
      setVoiceInputId(vi.id);
      const { path, error: upErr } = await uploadContactAudio(vi.id, blob, ext);
      if (upErr || !path) throw new Error(upErr?.message || 'アップロード失敗');
      await updateContactVoiceInput(vi.id, { audio_url: path, duration_sec: elapsedSec });
      const { data: result, error: procErr } = await invokeProcessContactVoice(vi.id);
      if (procErr) throw new Error(typeof procErr === 'string' ? procErr : (procErr.message || 'AI 処理失敗'));
      setTranscript(result?.transcript || '');
      setAiSummary(result?.ai_summary || '');
      const ext2 = result?.ai_extracted || {};
      setExtracted(ext2);
      // デフォルトで全てのフィールドを「反映」にチェック
      const cf = ext2.client_fields || {};
      const initFields = {};
      Object.entries(cf).forEach(([dbKey, val]) => {
        const feKey = DB_TO_FE[dbKey];
        if (!feKey) return;
        if (val === null || val === undefined || val === '') return;
        // 既存値と同じならスキップ
        if (String(client?.[feKey] ?? '') === String(val)) return;
        initFields[feKey] = true;
      });
      setAcceptedFields(initFields);
      const initContacts = {};
      (ext2.contacts_to_add || []).forEach((_, i) => { initContacts[i] = true; });
      setAcceptedContacts(initContacts);
      setPhase('preview');
    } catch (e) {
      console.error('[ClientVoice] process error', e);
      setErrorMsg(e.message || String(e));
      setPhase('record');
    }
  };

  const buildPatch = () => {
    const patch = {};
    const cf = extracted.client_fields || {};
    Object.entries(cf).forEach(([dbKey, val]) => {
      const feKey = DB_TO_FE[dbKey];
      if (!feKey) return;
      if (!acceptedFields[feKey]) return;
      patch[feKey] = val;
    });
    return patch;
  };

  const buildContacts = () => {
    const list = extracted.contacts_to_add || [];
    return list.filter((_, i) => acceptedContacts[i]);
  };

  const handleApply = async () => {
    setPhase('applying');
    try {
      const patch = buildPatch();
      const contacts = buildContacts();
      // 親コンポーネントに反映を委譲
      await onApply?.(patch, contacts);
      // voice_input を applied 状態に
      if (voiceInputId) await updateContactVoiceInput(voiceInputId, { status: 'applied' });
      onClose?.();
    } catch (e) {
      setErrorMsg(e.message || String(e));
      setPhase('preview');
    }
  };

  const handleDiscard = async () => {
    if (voiceInputId) {
      await updateContactVoiceInput(voiceInputId, { status: 'discarded' });
    }
    onClose?.();
  };

  const fieldRows = (() => {
    const cf = extracted.client_fields || {};
    const rows = [];
    Object.entries(cf).forEach(([dbKey, val]) => {
      const feKey = DB_TO_FE[dbKey];
      if (!feKey) return;
      if (val === null || val === undefined || val === '') return;
      const before = client?.[feKey];
      const beforeStr = before == null || before === '' ? '(未設定)' : String(before);
      const afterStr = String(val);
      if (beforeStr === afterStr) return;
      rows.push({ feKey, label: FIELD_LABELS[feKey] || feKey, before: beforeStr, after: afterStr });
    });
    return rows;
  })();

  const contactsToAdd = extracted.contacts_to_add || [];

  return (
    <div onClick={handleDiscard} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 25500,
      animation: 'cdFadeIn 0.15s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: `1px solid ${GRAY_200}`, borderRadius: 4,
        width: 'min(680px, 92vw)', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Noto Sans JP', sans-serif", color: C.textDark,
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', background: NAVY, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5 }}>音声で更新</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{client?.company || 'クライアント'}</div>
          </div>
          <button onClick={handleDiscard} style={{
            border: '1px solid rgba(255,255,255,0.3)', background: 'transparent',
            color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12,
            cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
          }}>閉じる</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {errorMsg && (
            <div style={{
              fontSize: 11, color: '#DC2626', background: '#FEF2F2',
              border: '1px solid #FECACA', borderRadius: 4,
              padding: '8px 12px', marginBottom: 12,
            }}>{errorMsg}</div>
          )}

          {phase === 'record' && (
            <div>
              <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7, marginBottom: 12 }}>
                話した内容から、AI が自動的に変更点を抽出します。確認画面で反映する項目を選んでから保存します。
              </div>
              <div style={{
                border: `1px solid ${GRAY_200}`, borderRadius: 4, background: GRAY_50,
                padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {!recording ? (
                    <button onClick={start} style={{
                      padding: '8px 16px', borderRadius: 4,
                      border: `1px solid ${NAVY}`, background: '#fff', color: NAVY,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Noto Sans JP', sans-serif",
                    }}>録音開始</button>
                  ) : (
                    <button onClick={stop} style={{
                      padding: '8px 16px', borderRadius: 4,
                      border: `1px solid ${BLUE}`, background: BLUE, color: '#fff',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Noto Sans JP', sans-serif",
                    }}>録音停止して AI 整理</button>
                  )}
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    color: recording ? BLUE : C.textLight,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{formatSec(elapsedSec)} / {formatSec(MAX_RECORD_SEC)}</span>
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
                <div style={{ fontSize: 11, color: C.textLight, marginTop: 12, lineHeight: 1.7 }}>
                  例：「○○M&A の月間目標を 15 件に変更。リスト負担を両方に。担当者として鈴木太郎を追加、メールは suzuki@example.com、電話は 03-xxxx-xxxx」
                </div>
              </div>
            </div>
          )}

          {phase === 'processing' && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: C.textMid }}>AI 整理中...</div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 6 }}>Whisper → Claude へ送信中</div>
            </div>
          )}

          {phase === 'preview' && (
            <div>
              <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.7, marginBottom: 12 }}>
                AI が抽出した変更点です。チェックを外せばその項目は反映されません。
              </div>

              {fieldRows.length === 0 && contactsToAdd.length === 0 ? (
                <div style={{
                  padding: 24, textAlign: 'center', fontSize: 11, color: C.textLight,
                  background: GRAY_50, borderRadius: 4, border: `1px solid ${GRAY_200}`,
                }}>
                  変更点が検出されませんでした。
                </div>
              ) : (
                <>
                  {fieldRows.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, letterSpacing: 1, marginBottom: 6 }}>
                        契約条件 / 備考
                      </div>
                      {fieldRows.map(row => (
                        <div key={row.feKey} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '10px 12px',
                          borderLeft: `3px solid ${GOLD}`,
                          border: `1px solid ${GRAY_200}`,
                          borderRadius: 4,
                          background: '#FFFBF0',
                          marginBottom: 6,
                        }}>
                          <input
                            type="checkbox"
                            checked={!!acceptedFields[row.feKey]}
                            onChange={(e) => setAcceptedFields(prev => ({ ...prev, [row.feKey]: e.target.checked }))}
                            style={{ marginTop: 3 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                              {row.label}
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, color: C.textLight, marginBottom: 2 }}>Before</div>
                                <div style={{ color: C.textMid }}>{row.before}</div>
                              </div>
                              <div style={{ alignSelf: 'center', color: C.textLight, fontSize: 12 }}>→</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, color: GOLD, marginBottom: 2 }}>After</div>
                                <div style={{ color: NAVY, fontWeight: 600 }}>{row.after}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {contactsToAdd.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, letterSpacing: 1, marginBottom: 6 }}>
                        担当者の追加 ({contactsToAdd.length})
                      </div>
                      {contactsToAdd.map((ct, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '10px 12px',
                          borderLeft: `3px solid ${GOLD}`,
                          border: `1px solid ${GRAY_200}`,
                          borderRadius: 4,
                          background: '#FFFBF0',
                          marginBottom: 6,
                        }}>
                          <input
                            type="checkbox"
                            checked={!!acceptedContacts[i]}
                            onChange={(e) => setAcceptedContacts(prev => ({ ...prev, [i]: e.target.checked }))}
                            style={{ marginTop: 3 }}
                          />
                          <div style={{ flex: 1, fontSize: 11 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
                              {ct.name || '(名前未抽出)'}
                              {ct.role && <span style={{ marginLeft: 8, fontSize: 10, color: C.textMid, fontWeight: 400 }}>{ct.role}</span>}
                            </div>
                            <div style={{ marginTop: 4, color: C.textMid, fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                              {ct.email && <span>{ct.email}</span>}
                              {ct.phone && <span>{ct.phone}</span>}
                              {ct.slack_member_id && <span>@{ct.slack_member_id}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {(transcript || aiSummary) && (
                <details style={{ marginTop: 12, fontSize: 11 }}>
                  <summary style={{ color: C.textLight, cursor: 'pointer', fontSize: 10 }}>
                    元の音声・文字起こし・AI 要約を表示
                  </summary>
                  <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    {aiSummary && (
                      <div>
                        <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>AI 要約</div>
                        <div style={{ background: GRAY_50, border: `1px solid ${GRAY_200}`, borderRadius: 3, padding: 8, whiteSpace: 'pre-wrap', fontSize: 11, color: C.textDark, lineHeight: 1.6 }}>{aiSummary}</div>
                      </div>
                    )}
                    {transcript && (
                      <div>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>文字起こし</div>
                        <div style={{ background: GRAY_50, border: `1px solid ${GRAY_200}`, borderRadius: 3, padding: 8, whiteSpace: 'pre-wrap', fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>{transcript}</div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {phase === 'applying' && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: C.textMid }}>反映中...</div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(phase === 'preview') && (
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${GRAY_200}`,
            display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff',
          }}>
            <button onClick={handleDiscard} style={{
              padding: '8px 16px', borderRadius: 4,
              border: `1px solid ${GRAY_200}`, background: '#fff', color: C.textMid,
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}>破棄</button>
            <button
              onClick={handleApply}
              disabled={fieldRows.length === 0 && contactsToAdd.length === 0}
              style={{
                padding: '8px 16px', borderRadius: 4,
                border: 'none', background: NAVY, color: '#fff',
                fontSize: 12, fontWeight: 600,
                cursor: (fieldRows.length === 0 && contactsToAdd.length === 0) ? 'not-allowed' : 'pointer',
                fontFamily: "'Noto Sans JP', sans-serif",
                opacity: (fieldRows.length === 0 && contactsToAdd.length === 0) ? 0.5 : 1,
              }}
            >全部反映して保存</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes cdFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes voiceRecPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
