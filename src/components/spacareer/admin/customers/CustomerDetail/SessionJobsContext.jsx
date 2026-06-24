import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../../constants/design';
import { uploadSessionVideoWithAudio, generateSessionMinutes } from '../../../../../lib/spacareer/sessionMinutes';

// ============================================================
// スパキャリ セッション動画アップロード/AI議事録 ジョブ常駐コンテキスト
// ----------------------------------------------------------------
// むー様指示 2026-06-24:
//   アップロードやAI議事録生成の実行中に別タブ/別画面へ移動しても、
//   裏側で処理が止まらないようにする。
//
// 従来は各タブ(TabKickoff / TabSessionManage / SessionCompleteFlow)が
// ローカル state で処理を回していたため、タブ切替でアンマウントされると
// 進捗表示が消え、ユーザーには「止まった」ように見えていた。
//
// このProviderを顧客詳細(CustomerDetail)階層に常駐させ、処理を Provider 側で
// 実行することで、タブ切替・顧客切替をしても処理とその進捗表示が継続する。
// ジョブはセッションID単位で保持し、画面右下にフローティング進捗を出す。
// ============================================================

const SessionJobsContext = createContext(null);

export function useSessionJobs() {
  const ctx = useContext(SessionJobsContext);
  if (!ctx) {
    // Provider 外で誤用された場合のフォールバック（no-op）
    return { jobs: {}, startUpload: async () => {}, startMinutes: async () => {} };
  }
  return ctx;
}

const BUCKET_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

export function SessionJobsProvider({ customerId, refresh, children }) {
  const [jobs, setJobs] = useState({}); // sessionId -> { phase, pct, status, error, label }
  // refresh は再レンダリングで参照が変わるため ref 経由で常に最新を呼ぶ
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const customerIdRef = useRef(customerId);
  useEffect(() => { customerIdRef.current = customerId; }, [customerId]);

  const update = (sessionId, patch) =>
    setJobs(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] || {}), ...patch } }));
  const clear = (sessionId) =>
    setJobs(prev => { const n = { ...prev }; delete n[sessionId]; return n; });

  const labelOf = (session) =>
    session?.session_no === 0 ? 'キックオフ' : `第${session?.session_no}回`;

  async function runMinutes(session, videoId) {
    if (!session) return;
    update(session.id, { phase: 'minutes', error: null, status: 'AI議事録を生成中...（文字起こし含め数分かかります）', label: labelOf(session) });
    try {
      await generateSessionMinutes({ sessionId: session.id, customerId: customerIdRef.current, videoId });
      clear(session.id);
      if (refreshRef.current) await refreshRef.current();
    } catch (e) {
      console.error('[SessionJobs] minutes error:', e);
      update(session.id, { phase: 'error', status: null, error: `議事録生成に失敗しました: ${e.message || e}` });
    }
  }

  async function startUpload(session, file) {
    if (!session || !file) return;
    if (file.size > BUCKET_LIMIT_BYTES) {
      update(session.id, { phase: 'error', error: `動画サイズ ${(file.size / 1024 / 1024).toFixed(1)} MB はバケット上限の 2 GB を超えています。動画を分割してください。`, label: labelOf(session) });
      return;
    }
    update(session.id, { phase: 'uploading', pct: 0, status: null, error: null, label: labelOf(session) });
    let videoId = null;
    try {
      const { videoId: vid, audioWarning, error: upErr } = await uploadSessionVideoWithAudio({
        customerId: customerIdRef.current,
        sessionId: session.id,
        file,
        onVideoProgress: (pct) => update(session.id, { phase: 'uploading', pct }),
        onStatus: (msg) => update(session.id, { phase: 'extracting', status: msg }),
      });
      if (upErr) throw upErr;
      videoId = vid;
      if (audioWarning) update(session.id, { warning: audioWarning });
      if (refreshRef.current) await refreshRef.current();
    } catch (e) {
      console.error('[SessionJobs] upload error:', e);
      update(session.id, { phase: 'error', status: null, error: `アップロードに失敗しました: ${e.message || e}` });
      return;
    }
    // アップロード完了後そのままAI議事録生成へ
    if (videoId) await runMinutes(session, videoId);
  }

  async function startMinutes(session, videoId = null) {
    await runMinutes(session, videoId);
  }

  const value = { jobs, startUpload, startMinutes };

  return (
    <SessionJobsContext.Provider value={value}>
      {children}
      <JobsIndicator jobs={jobs} onDismiss={clear} />
    </SessionJobsContext.Provider>
  );
}

// 画面右下のフローティング進捗。タブ/画面を移動しても表示され続ける。
function JobsIndicator({ jobs, onDismiss }) {
  const entries = Object.entries(jobs);
  if (!entries.length) return null;
  return (
    <div style={{
      position: 'fixed', right: space[4], bottom: space[4], zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: space[2], maxWidth: 360,
    }}>
      {entries.map(([sessionId, job]) => {
        const isError = job.phase === 'error';
        const title = isError ? `${job.label || ''} 処理エラー`
          : job.phase === 'uploading' ? `${job.label || ''} 動画アップロード中 ${job.pct ?? 0}%`
          : job.phase === 'extracting' ? `${job.label || ''} 音声抽出中`
          : job.phase === 'minutes' ? `${job.label || ''} AI議事録を生成中`
          : `${job.label || ''} 処理中`;
        const detail = isError ? job.error : (job.status || '別の画面に移動しても処理は継続します。');
        return (
          <div key={sessionId} style={{
            background: color.white,
            border: `1px solid ${isError ? color.danger : color.border}`,
            borderLeft: `4px solid ${isError ? color.danger : color.navy}`,
            borderRadius: radius.md,
            boxShadow: shadow.lg,
            padding: `${space[2]}px ${space[3]}px`,
            fontSize: font.size.sm,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
              <span style={{ fontWeight: font.weight.bold, color: isError ? color.danger : color.navy }}>{title}</span>
              {(isError || job.warning) && (
                <button onClick={() => onDismiss(sessionId)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.textLight, fontSize: font.size.md, lineHeight: 1, padding: 0 }}
                  aria-label="閉じる">×</button>
              )}
            </div>
            {job.phase === 'uploading' && (
              <div style={{ marginTop: space[1], height: 6, borderRadius: 999, background: color.gray200, overflow: 'hidden' }}>
                <div style={{ width: `${job.pct ?? 0}%`, height: '100%', background: color.navy, transition: 'width 0.3s' }} />
              </div>
            )}
            <div style={{ marginTop: space[1], fontSize: font.size.xs, color: isError ? color.danger : color.textMid, lineHeight: font.lineHeight.relaxed }}>
              {detail}
            </div>
            {job.warning && !isError && (
              <div style={{ marginTop: space[1], fontSize: font.size.xs, color: color.warn }}>{job.warning}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
