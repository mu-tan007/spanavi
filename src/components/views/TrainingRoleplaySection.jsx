import { useState, useEffect, useRef } from 'react';
import { C } from '../../constants/colors';
import {
  fetchTrainingProgress,
  upsertTrainingStage,
  fetchRoleplaySessions,
  insertRoleplaySession,
  updateRoleplaySession,
  deleteRoleplaySession,
  uploadRoleplayRecording,
  invokeAnalyzeRoleplay,
} from '../../lib/supabaseWrite';

// ── 研修ステージ定義 ───────────────────────────────────────────────────────
const DAY1_STAGES = [
  { key: 'day1_philosophy', label: '理念・インターン22箇条の学習', desc: '' },
  { key: 'day1_workflow',   label: '業務フロー・Spanaviの使用方法の習得', desc: '' },
];

// ── タブ ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'training', label: '研修進捗' },
  { id: 'weekly',   label: '日々のロープレ' },
];

// ── セッション種別ラベル ────────────────────────────────────────────────
const SESSION_TYPE_LABEL = {
  training_day2_member: 'Day2 メンバーロープレ',
  training_day2_final:  'Day2 合否ロープレ',
  weekly:               '週次ロープレ',
};

export default function TrainingRoleplaySection({ currentUser, userId, members, isAdmin }) {
  const [activeTab, setActiveTab] = useState('training');
  const [progress, setProgress]   = useState([]);   // training_progress rows
  const [sessions, setSessions]   = useState([]);   // roleplay_sessions rows
  const [loading, setLoading]     = useState(true);

  // モーダル状態
  const [addModalOpen, setAddModalOpen]       = useState(false);
  const [addForm, setAddForm]                 = useState({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
  const [addDay2Type, setAddDay2Type]         = useState('member'); // 'member' | 'final' — Day2追加時に使用
  const [addRecordingFile, setAddRecordingFile] = useState(null);   // モーダル内で選択した録音ファイル
  const addFileInputRef = useRef(null);

  // 操作中フラグ
  const [savingStage, setSavingStage]     = useState(null);   // stageKey
  const [uploadingId, setUploadingId]     = useState(null);   // sessionId
  const [analyzingId, setAnalyzingId]     = useState(null);   // sessionId
  const [deletingId, setDeletingId]       = useState(null);   // sessionId
  const [addingSess, setAddingSess]       = useState(false);

  // 展開中の AI フィードバック
  const [expandedId, setExpandedId]       = useState(null);

  const fileInputRef = useRef(null);
  const fileTargetSessionId = useRef(null);

  // ── データ取得 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      fetchTrainingProgress(userId),
      fetchRoleplaySessions(userId),
    ]).then(([p, s]) => {
      setProgress(p.data || []);
      setSessions(s.data || []);
      setLoading(false);
    });
  }, [userId]);

  const progressMap = Object.fromEntries(progress.map(p => [p.stage_key, p]));

  // ── 今週の開始日（月曜）────────────────────────────────────────────────
  const getWeekStart = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff)).toISOString().slice(0, 10);
  };

  // ── ステージ完了トグル（管理者のみ） ─────────────────────────────────
  const handleToggleStage = async (stageKey, currentCompleted) => {
    if (!isAdmin) return;
    setSavingStage(stageKey);
    const newCompleted = !currentCompleted;
    await upsertTrainingStage(userId, stageKey, {
      completed: newCompleted,
      completed_by: currentUser,
    });
    const { data } = await fetchTrainingProgress(userId);
    setProgress(data || []);
    setSavingStage(null);
  };

  // ── Day2 合否ロープレ 合否設定（管理者のみ） ─────────────────────────
  const handleDay2Final = async (passed) => {
    if (!isAdmin) return;
    setSavingStage('day2_final');
    const existing = sessions.find(s => s.session_type === 'training_day2_final');
    if (existing) {
      await updateRoleplaySession(existing.id, { passed });
    } else {
      await insertRoleplaySession(userId, {
        session_type: 'training_day2_final',
        partner_name: currentUser,
        session_date: new Date().toISOString().slice(0, 10),
        passed,
      });
    }
    // training_progress の day2_final も更新
    await upsertTrainingStage(userId, 'day2_final', {
      completed: true,
      passed,
      completed_by: currentUser,
    });
    const [p, s] = await Promise.all([fetchTrainingProgress(userId), fetchRoleplaySessions(userId)]);
    setProgress(p.data || []);
    setSessions(s.data || []);
    setSavingStage(null);
  };

  // ── セッション追加 ─────────────────────────────────────────────────────
  const handleAddSession = async () => {
    if (!addForm.session_date) return;
    setAddingSess(true);
    const { data: newSession } = await insertRoleplaySession(userId, addForm);
    // 録音ファイルが選択されていればアップロード
    if (newSession?.id && addRecordingFile) {
      const { path, url } = await uploadRoleplayRecording(userId, newSession.id, addRecordingFile);
      if (path) await updateRoleplaySession(newSession.id, { recording_path: path, recording_url: url });
    }
    const { data } = await fetchRoleplaySessions(userId);
    setSessions(data || []);
    setAddModalOpen(false);
    setAddForm({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
    setAddRecordingFile(null);
    setAddingSess(false);
  };

  // ── セッション削除 ────────────────────────────────────────────────────
  const handleDeleteSession = async (id) => {
    if (!window.confirm('このセッションを削除しますか？')) return;
    setDeletingId(id);
    await deleteRoleplaySession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    setDeletingId(null);
  };

  // ── 録音アップロード ──────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !fileTargetSessionId.current) return;
    const sessionId = fileTargetSessionId.current;
    setUploadingId(sessionId);
    const { path, url, error } = await uploadRoleplayRecording(userId, sessionId, file);
    if (!error && path) {
      await updateRoleplaySession(sessionId, { recording_path: path, recording_url: url });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, recording_path: path, recording_url: url } : s));
    }
    setUploadingId(null);
    fileTargetSessionId.current = null;
  };

  // ── AI 分析実行 ───────────────────────────────────────────────────────
  const handleAnalyze = async (session) => {
    if (!session.recording_path) return;
    setAnalyzingId(session.id);
    await updateRoleplaySession(session.id, { ai_status: 'processing' });
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ai_status: 'processing' } : s));
    const { data, error } = await invokeAnalyzeRoleplay({
      storage_path: session.recording_path,
      session_id: session.id,
    });
    if (!error && data) {
      setSessions(prev => prev.map(s =>
        s.id === session.id
          ? { ...s, transcript: data.transcript, ai_feedback: data.ai_feedback, ai_status: 'done' }
          : s
      ));
      setExpandedId(session.id);
    } else {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ai_status: 'error' } : s));
    }
    setAnalyzingId(null);
  };

  // ── 描画ヘルパー ──────────────────────────────────────────────────────
  const StageRow = ({ stageKey, label, desc }) => {
    const p = progressMap[stageKey];
    const completed = p?.completed || false;
    const saving = savingStage === stageKey;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderRadius: 8,
        background: completed ? C.green + '0a' : C.offWhite,
        border: '1px solid ' + (completed ? C.green + '30' : C.borderLight),
        marginBottom: 8,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: completed ? C.green : C.borderLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: C.white, fontWeight: 700,
        }}>
          {completed ? '✓' : ''}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: completed ? C.green : C.textMid }}>{label}</div>
          <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>{desc}</div>
          {completed && p?.completed_at && (
            <div style={{ fontSize: 9, color: C.textLight, marginTop: 2 }}>
              {p.completed_by ? `${p.completed_by} が完了マーク` : ''} {new Date(p.completed_at).toLocaleDateString('ja-JP')}
            </div>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => handleToggleStage(stageKey, completed)}
            disabled={saving}
            style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
              border: '1px solid ' + (completed ? C.red + '50' : C.green + '50'),
              background: completed ? C.red + '0a' : C.green + '0a',
              color: completed ? C.red : C.green,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
              fontFamily: "'Noto Sans JP'",
            }}
          >
            {saving ? '...' : completed ? '取消' : '完了'}
          </button>
        )}
      </div>
    );
  };

  const SessionRow = ({ session }) => {
    const isExpanded = expandedId === session.id;
    const isUploading = uploadingId === session.id;
    const isAnalyzing = analyzingId === session.id;
    const isDeleting = deletingId === session.id;
    const fb = session.ai_feedback;

    return (
      <div style={{
        border: '1px solid ' + C.borderLight, borderRadius: 8,
        marginBottom: 8, overflow: 'hidden',
        background: session.ai_status === 'done' ? C.navy + '04' : C.white,
      }}>
        {/* セッション行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>
                {session.session_date || '日付未設定'}
              </span>
              {session.partner_name && (
                <span style={{ fontSize: 10, color: C.textMid }}>
                  {session.partner_name} とのロープレ
                </span>
              )}
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 3,
                background: C.navy + '10', color: C.navy, fontWeight: 600,
              }}>
                {SESSION_TYPE_LABEL[session.session_type] || session.session_type}
              </span>
              {session.passed === true && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: C.green + '15', color: C.green, fontWeight: 700 }}>合格</span>
              )}
              {session.passed === false && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: C.red + '15', color: C.red, fontWeight: 700 }}>不合格</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {/* 録音アップロード */}
            <button
              onClick={() => { fileTargetSessionId.current = session.id; fileInputRef.current?.click(); }}
              disabled={isUploading}
              title={session.recording_url ? '録音を再アップロード' : '録音をアップロード'}
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                border: '1px solid ' + (session.recording_url ? C.navy + '40' : C.borderLight),
                background: session.recording_url ? C.navy + '08' : C.white,
                color: session.recording_url ? C.navy : C.textLight,
                cursor: isUploading ? 'default' : 'pointer', opacity: isUploading ? 0.6 : 1,
                fontFamily: "'Noto Sans JP'",
              }}
            >
              {isUploading ? '...' : session.recording_url ? '🎵 録音済' : '録音↑'}
            </button>

            {/* AI 分析 */}
            {session.recording_url && (
              <button
                onClick={() => session.ai_status === 'done' ? setExpandedId(isExpanded ? null : session.id) : handleAnalyze(session)}
                disabled={isAnalyzing || session.ai_status === 'processing'}
                style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  border: '1px solid ' + (session.ai_status === 'done' ? C.gold + '60' : C.borderLight),
                  background: session.ai_status === 'done' ? C.gold + '10' : C.white,
                  color: session.ai_status === 'done' ? '#c8860a' : C.textMid,
                  cursor: (isAnalyzing || session.ai_status === 'processing') ? 'default' : 'pointer',
                  opacity: (isAnalyzing || session.ai_status === 'processing') ? 0.6 : 1,
                  fontFamily: "'Noto Sans JP'",
                }}
              >
                {session.ai_status === 'processing' || isAnalyzing
                  ? '分析中...'
                  : session.ai_status === 'done'
                  ? (isExpanded ? '▲ AI分析' : '▼ AI分析')
                  : session.ai_status === 'error'
                  ? '再分析'
                  : '✨ AI分析'}
              </button>
            )}

            {/* 削除（管理者のみ） */}
            {isAdmin && (
              <button
                onClick={() => handleDeleteSession(session.id)}
                disabled={isDeleting}
                style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 10,
                  border: '1px solid ' + C.borderLight,
                  background: 'transparent', color: C.red,
                  cursor: isDeleting ? 'default' : 'pointer', opacity: isDeleting ? 0.6 : 1,
                  fontFamily: "'Noto Sans JP'",
                }}
              >
                削除
              </button>
            )}
          </div>
        </div>

        {/* AI フィードバック展開 */}
        {isExpanded && fb && (
          <div style={{
            borderTop: '1px solid ' + C.borderLight,
            padding: '14px 16px',
            background: C.offWhite,
          }}>
            {fb.overall && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 }}>総評</div>
                <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{fb.overall}</div>
              </div>
            )}
            {fb.issues?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 4 }}>課題点</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {fb.issues.map((item, i) => (
                    <li key={i} style={{ fontSize: 11, color: C.textMid, lineHeight: 1.7, marginBottom: 2 }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {fb.solutions?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0070f3', marginBottom: 4 }}>解決策</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {fb.solutions.map((item, i) => (
                    <li key={i} style={{ fontSize: 11, color: C.textMid, lineHeight: 1.7, marginBottom: 2 }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {fb.practice?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 4 }}>練習方法</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {fb.practice.map((item, i) => (
                    <li key={i} style={{ fontSize: 11, color: C.textMid, lineHeight: 1.7, marginBottom: 2 }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.transcript && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 10, color: C.textLight, cursor: 'pointer' }}>文字起こしを表示</summary>
                <div style={{ fontSize: 10, color: C.textLight, lineHeight: 1.6, marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                  {session.transcript}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Day2 セクション ────────────────────────────────────────────────────
  const day2MemberSessions = sessions.filter(s => s.session_type === 'training_day2_member');
  const day2FinalSession   = sessions.find(s => s.session_type === 'training_day2_final');
  const day2FinalProgress  = progressMap['day2_final'];

  // ── 週次ロープレ ──────────────────────────────────────────────────────
  const weeklySessions  = sessions.filter(s => s.session_type === 'weekly').sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''));
  const thisWeekStart   = getWeekStart();
  const thisWeekDone    = weeklySessions.some(s => s.session_date >= thisWeekStart);

  // メンバー役職かどうか
  const memberInfo = members?.find(m => m.name === currentUser);
  const showWeekly = isAdmin || memberInfo?.position === 'メンバー' || memberInfo?.rank;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: C.textLight, fontSize: 12 }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div>
      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* タブ */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: '1px solid ' + C.borderLight,
              background: activeTab === tab.id ? C.navy : C.white,
              color: activeTab === tab.id ? C.white : C.textMid,
              cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: 研修進捗 ──────────────────────────────────────────── */}
      {activeTab === 'training' && (
        <div>
          {/* Day 1 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: C.navy,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: C.white, flexShrink: 0,
              }}>D1</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Day 1 — 座学・ツール習得</span>
            </div>
            {DAY1_STAGES.map(s => (
              <StageRow key={s.key} stageKey={s.key} label={s.label} desc={s.desc} />
            ))}
          </div>

          {/* Day 2 */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: C.gold,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: C.navyDeep, flexShrink: 0,
              }}>D2</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Day 2 — ロープレ実施</span>
            </div>

            {/* (a) メンバーとのロープレ */}
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              border: '1px solid ' + C.borderLight,
              background: C.white, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>(a) メンバーとのロープレ</span>
                  <span style={{ fontSize: 10, color: C.textLight, marginLeft: 8 }}>
                    {day2MemberSessions.length} 件実施済み
                  </span>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setAddForm({ partner_name: '', session_type: 'training_day2_member', session_date: new Date().toISOString().slice(0, 10), notes: '' });
                      setAddModalOpen(true);
                    }}
                    style={{
                      padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      border: '1px solid ' + C.navy + '40',
                      background: C.navy + '08', color: C.navy,
                      cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                    }}
                  >
                    + 追加
                  </button>
                )}
              </div>
              {day2MemberSessions.length === 0 ? (
                <div style={{ fontSize: 11, color: C.textLight, padding: '8px 0' }}>まだ実施記録がありません</div>
              ) : (
                day2MemberSessions.map(s => <SessionRow key={s.id} session={s} />)
              )}
            </div>

            {/* (b) チームリーダー合否ロープレ */}
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              border: '1px solid ' + (day2FinalSession?.passed === true ? C.green + '40' : day2FinalSession?.passed === false ? C.red + '40' : C.borderLight),
              background: day2FinalSession?.passed === true ? C.green + '06' : day2FinalSession?.passed === false ? C.red + '04' : C.white,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>(b) チームリーダー 合否ロープレ</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {day2FinalSession?.passed === true && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.green }}>✓ 合格</span>
                  )}
                  {day2FinalSession?.passed === false && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.red }}>✗ 不合格</span>
                  )}
                  {!day2FinalSession && (
                    <span style={{ fontSize: 10, color: C.textLight }}>未実施</span>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleDay2Final(true)}
                        disabled={savingStage === 'day2_final'}
                        style={{
                          padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                          border: '1px solid ' + C.green + '50', background: C.green + '0a',
                          color: C.green, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                        }}
                      >
                        合格
                      </button>
                      <button
                        onClick={() => handleDay2Final(false)}
                        disabled={savingStage === 'day2_final'}
                        style={{
                          padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                          border: '1px solid ' + C.red + '50', background: C.red + '0a',
                          color: C.red, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                        }}
                      >
                        不合格
                      </button>
                    </>
                  )}
                </div>
              </div>
              {day2FinalSession && (
                <SessionRow session={day2FinalSession} />
              )}
              {day2FinalSession?.passed === true && (
                <div style={{ fontSize: 10, color: C.green, marginTop: 4, fontWeight: 600 }}>
                  次の稼働日から現場に立つことができます
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: 日々のロープレ ─────────────────────────────────── */}
      {activeTab === 'weekly' && (
        <div>
          {/* 今週の状況バナー */}
          <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: thisWeekDone ? C.green + '0a' : C.gold + '0a',
            border: '1px solid ' + (thisWeekDone ? C.green + '30' : C.gold + '40'),
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: thisWeekDone ? C.green : C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: C.white,
            }}>
              {thisWeekDone ? '✓' : '!'}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: thisWeekDone ? C.green : '#c8860a' }}>
                今週のロープレ: {thisWeekDone ? '実施済み' : '未実施'}
              </div>
              <div style={{ fontSize: 10, color: C.textLight }}>
                {thisWeekDone
                  ? '今週のロープレは完了しています'
                  : '毎週1回、篠宮とのロープレが必要です'}
              </div>
            </div>
          </div>

          {/* セッション一覧 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
              セッション履歴 ({weeklySessions.length}件)
            </span>
            {isAdmin && (
              <button
                onClick={() => {
                  setAddForm({ partner_name: currentUser, session_type: 'weekly', session_date: new Date().toISOString().slice(0, 10), notes: '' });
                  setAddModalOpen(true);
                }}
                style={{
                  padding: '5px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  border: '1px solid ' + C.navy + '40',
                  background: C.navy + '08', color: C.navy,
                  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                }}
              >
                + 新規追加
              </button>
            )}
          </div>

          {weeklySessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.textLight, fontSize: 12 }}>
              まだセッションの記録がありません
            </div>
          ) : (
            weeklySessions.map(s => <SessionRow key={s.id} session={s} />)
          )}
        </div>
      )}

      {/* ── セッション追加モーダル ────────────────────────────────────── */}
      {addModalOpen && (
        <div
          onClick={() => { setAddModalOpen(false); setAddRecordingFile(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: 14, padding: '24px 28px',
              width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 16 }}>
              ロープレセッションを追加
            </div>

            {/* 日付 */}
            <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 }}>
              実施日 <span style={{ color: C.red }}>*</span>
            </label>
            <input
              type="date"
              value={addForm.session_date}
              onChange={e => setAddForm(f => ({ ...f, session_date: e.target.value }))}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid ' + C.borderLight, fontSize: 12, marginBottom: 12,
                boxSizing: 'border-box', fontFamily: "'Noto Sans JP'",
              }}
            />

            {/* 相手名 */}
            <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 }}>
              相手の名前
            </label>
            <input
              type="text"
              value={addForm.partner_name}
              onChange={e => setAddForm(f => ({ ...f, partner_name: e.target.value }))}
              placeholder="例: 篠宮"
              list="member-list"
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid ' + C.borderLight, fontSize: 12, marginBottom: 12,
                boxSizing: 'border-box', fontFamily: "'Noto Sans JP'",
              }}
            />
            <datalist id="member-list">
              {(members || []).map(m => <option key={m._supaId || m.name} value={m.name} />)}
            </datalist>

            {/* 録音ファイル */}
            <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 }}>
              録音ファイル（任意）
            </label>
            <input
              ref={addFileInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg"
              onChange={e => setAddRecordingFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => addFileInputRef.current?.click()}
              style={{
                padding: '8px 12px', borderRadius: 6, marginBottom: 12,
                border: '1.5px dashed ' + (addRecordingFile ? C.navy + '60' : C.borderLight),
                background: addRecordingFile ? C.navy + '06' : C.offWhite,
                cursor: 'pointer', fontSize: 11,
                color: addRecordingFile ? C.navy : C.textLight,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>🎵</span>
              {addRecordingFile
                ? <span style={{ fontWeight: 600 }}>{addRecordingFile.name}</span>
                : <span>クリックして録音ファイルを選択</span>
              }
              {addRecordingFile && (
                <button
                  onClick={e => { e.stopPropagation(); setAddRecordingFile(null); if (addFileInputRef.current) addFileInputRef.current.value = ''; }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}
                >✕</button>
              )}
            </div>

            {/* メモ */}
            <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 }}>
              メモ
            </label>
            <textarea
              value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="備考・所感など"
              rows={2}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid ' + C.borderLight, fontSize: 12, marginBottom: 16,
                boxSizing: 'border-box', resize: 'vertical', fontFamily: "'Noto Sans JP'",
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleAddSession}
                disabled={addingSess || !addForm.session_date}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8, border: 'none',
                  background: addingSess || !addForm.session_date ? C.borderLight : C.navy,
                  color: addingSess || !addForm.session_date ? C.textLight : C.white,
                  fontSize: 12, fontWeight: 700,
                  cursor: (addingSess || !addForm.session_date) ? 'default' : 'pointer',
                  fontFamily: "'Noto Sans JP'",
                }}
              >
                {addingSess ? '追加中...' : '追加する'}
              </button>
              <button
                onClick={() => { setAddModalOpen(false); setAddRecordingFile(null); }}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8,
                  border: '1px solid ' + C.borderLight, background: 'transparent',
                  color: C.textMid, fontSize: 12, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
