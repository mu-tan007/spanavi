import { useState, useEffect, useRef, useMemo } from 'react';
import { C } from '../../constants/colors';
import { prepareAudioForWhisper, needsConversion, isVideoFile } from '../../lib/convertAudio';
import {
  fetchTrainingProgress,
  upsertTrainingStage,
  fetchRoleplaySessions,
  insertRoleplaySession,
  updateRoleplaySession,
  deleteRoleplaySession,
  uploadRoleplayRecording,
  invokeAnalyzeRoleplay,
  initResumableUpload,
  uploadFileToGdriveResumable,
  setDrivePermissions,
  pollRoleplayAnalysis,
  downloadDriveFileViaProxy,
} from '../../lib/supabaseWrite';

// Google Drive ファイルIDを抽出
const extractDriveId = (url) => {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url.trim())) return url.trim();
  return null;
};

// ── 研修ステージ定義 ───────────────────────────────────────────────────────
const DAY1_STAGES = [
  { key: 'day1_philosophy', label: '理念・インターン22箇条の学習', desc: '' },
  { key: 'day1_workflow',   label: '業務フロー・Spanaviの使用方法の習得', desc: '' },
];

// ── タブ ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'training', label: '研修' },
  { id: 'weekly',   label: 'ロープレ' },
];

// ── セッション種別ラベル ────────────────────────────────────────────────
const SESSION_TYPE_LABEL = {
  training_day2_member: 'Day2 メンバーロープレ',
  training_day2_final:  'Day2 合否ロープレ',
  weekly:               '週次ロープレ',
};

export default function TrainingRoleplaySection({ currentUser, userId, members, isAdmin }) {
  // 対象メンバー切替（全員が閲覧のみ他人のロープレを見られる / アップロード等はisAdmin維持）
  const [targetMemberName, setTargetMemberName] = useState(null);
  if (targetMemberName && members) {
    const sel = members.find(m => m.name === targetMemberName);
    if (sel?.user_id) {
      currentUser = sel.name;
      userId = sel.user_id;
    }
  }

  // Slack 通知は analyze-roleplay Edge Function 側で発火（クライアントが
  // ポーリング途中で離脱しても通知が落ちないようサーバー側で完結させる）
  const [activeTab, setActiveTab] = useState('weekly');
  const [progress, setProgress]   = useState([]);   // training_progress rows
  const [sessions, setSessions]   = useState([]);   // roleplay_sessions rows
  const [loading, setLoading]     = useState(true);

  // モーダル状態
  const [addModalOpen, setAddModalOpen]       = useState(false);
  const [addForm, setAddForm]                 = useState({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
  const [addDay2Type, setAddDay2Type]         = useState('member'); // 'member' | 'final' — Day2追加時に使用
  const [addRecordingFile, setAddRecordingFile] = useState(null);   // モーダル内で選択したファイル
  const [addRecordingUrl, setAddRecordingUrl]   = useState('');     // ページからドラッグしたURL
  const [dragOver, setDragOver]               = useState(false);    // ドラッグオーバー中
  const addFileInputRef = useRef(null);

  // 操作中フラグ
  const [savingStage, setSavingStage]     = useState(null);
  const [uploadingId, setUploadingId]     = useState(null);
  const [analyzingId, setAnalyzingId]     = useState(null);
  const [analyzeErrors, setAnalyzeErrors] = useState({});  // { [sessionId]: errorMsg }
  const [deletingId, setDeletingId]       = useState(null);
  const [addingSess, setAddingSess]       = useState(false);
  const [convertStatus, setConvertStatus] = useState('');
  const [driveUploadProgress, setDriveUploadProgress] = useState(null); // null | 0-100
  const [videoModal, setVideoModal]       = useState(null); // 再生中の Drive file ID

  // Google Drive URL 入力（既存セッション用）
  const [driveInputId, setDriveInputId]   = useState(null);  // 入力中のセッションID
  const [driveInputVal, setDriveInputVal] = useState('');

  // 追加モーダル用 Drive URL
  const [addDriveUrl, setAddDriveUrl]     = useState('');

  // 展開中のセッション（複数同時展開可）
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpanded = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const setExpandedId = (id) => {
    if (id === null) return;
    setExpandedIds(prev => { const next = new Set(prev); next.add(id); return next; });
  };

  // エラーメッセージ
  const [errorMsg, setErrorMsg]           = useState('');

  const fileInputRef = useRef(null);
  const fileTargetSessionId = useRef(null);
  const pollingAbortRef = useRef(null);

  // ── データ取得 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      fetchTrainingProgress(userId),
      fetchRoleplaySessions(userId),
    ]).then(([p, s]) => {
      setProgress(p.data || []);
      const loadedSessions = s.data || [];
      setSessions(loadedSessions);
      setLoading(false);

      // processing 状態のセッションがあればポーリング再開
      const processingSessions = loadedSessions.filter(sess => sess.ai_status === 'processing');
      processingSessions.forEach(sess => {
        setAnalyzingId(sess.id);
        const controller = new AbortController();
        pollingAbortRef.current = controller;
        pollRoleplayAnalysis(sess.id, { signal: controller.signal }).then(result => {
          pollingAbortRef.current = null;
          if (result.ai_status === 'done') {
            setSessions(prev => prev.map(s2 =>
              s2.id === sess.id ? { ...s2, transcript: result.transcript, ai_feedback: result.ai_feedback, ai_status: 'done' } : s2
            ));
          } else {
            setSessions(prev => prev.map(s2 => s2.id === sess.id ? { ...s2, ai_status: 'error' } : s2));
            setAnalyzeErrors(prev => ({ ...prev, [sess.id]: result.error }));
          }
          setAnalyzingId(null);
        });
      });
    });

    return () => {
      if (pollingAbortRef.current) pollingAbortRef.current.abort();
    };
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
    setErrorMsg('');

    const { data: newSession, error: insertError } = await insertRoleplaySession(userId, addForm);
    if (insertError || !newSession?.id) {
      setErrorMsg('セッションの作成に失敗しました。再度お試しください。');
      setAddingSess(false);
      return;
    }

    // Google Drive URL があれば保存（video_url + recording_urlの両方に保存して再分析も可能に）
    const driveId = extractDriveId(addDriveUrl);
    if (driveId) {
      await updateRoleplaySession(newSession.id, { video_url: addDriveUrl.trim(), recording_url: addDriveUrl.trim() });
    }

    // 録音ファイル or URL（Drive含む）があればアップロード → AI分析まで自動実行
    const hasRecording = addRecordingFile || addRecordingUrl || addDriveUrl;
    if (hasRecording) {
      let storagePath = null;
      let recordingUrl = addRecordingUrl || addDriveUrl || null;
      let driveUrlFromUpload = null;

      if (addRecordingFile) {
        const isVideo = isVideoFile(addRecordingFile);

        // ── 並行処理: [A] Google Drive直接アップロード + [B] MP3変換→Storage ──
        const origName = addRecordingFile.name || `roleplay_${newSession.id}.mp4`;
        const dateStr = addForm.session_date || new Date().toISOString().slice(0, 10);
        const driveName = `${currentUser}_${addForm.partner_name || 'RP'}_${dateStr}_${origName}`;

        // [A] 動画の場合: Google Driveにresumable upload
        const drivePromise = isVideo ? (async () => {
          const { data: initData, error: initErr } = await initResumableUpload(driveName);
          if (initErr || !initData?.upload_uri) throw new Error('Resumable upload init failed');
          setDriveUploadProgress(0);
          const { fileId } = await uploadFileToGdriveResumable(
            addRecordingFile, initData.upload_uri,
            (pct) => setDriveUploadProgress(pct)
          );
          setDriveUploadProgress(null);
          const { data: permData } = await setDrivePermissions(fileId);
          return permData?.drive_url || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
        })() : Promise.resolve(null);

        // [B] MP3変換 → Storage アップロード
        const mp3Promise = (async () => {
          let fileToUpload = addRecordingFile;
          if (needsConversion(addRecordingFile)) {
            fileToUpload = await prepareAudioForWhisper(addRecordingFile, setConvertStatus);
            setConvertStatus('');
          }
          const { path, url, error: uploadError } = await uploadRoleplayRecording(userId, newSession.id, fileToUpload);
          if (uploadError || !path) throw new Error('MP3 upload failed');
          return { path, url };
        })();

        // 両方の完了を待つ
        const [driveResult, mp3Result] = await Promise.allSettled([drivePromise, mp3Promise]);
        setDriveUploadProgress(null);
        setConvertStatus('');

        // Drive結果処理
        if (driveResult.status === 'fulfilled' && driveResult.value) {
          driveUrlFromUpload = driveResult.value;
          await updateRoleplaySession(newSession.id, { video_url: driveUrlFromUpload });
          setSessions(prev => prev.map(s => s.id === newSession.id ? { ...s, video_url: driveUrlFromUpload } : s));
        } else if (driveResult.status === 'rejected') {
          console.warn('[Drive upload] failed:', driveResult.reason);
        }

        // MP3結果処理
        if (mp3Result.status === 'fulfilled') {
          storagePath = mp3Result.value.path;
          recordingUrl = mp3Result.value.url;
          await updateRoleplaySession(newSession.id, { recording_path: storagePath, recording_url: recordingUrl });
        } else {
          console.error('[MP3] failed:', mp3Result.reason);
          setErrorMsg('音声ファイルの変換/アップロードに失敗しました。');
          const { data: refreshed } = await fetchRoleplaySessions(userId);
          setSessions(refreshed || []);
          setAddModalOpen(false);
          setAddForm({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
          setAddRecordingFile(null); setAddRecordingUrl(''); setAddDriveUrl('');
          setAddingSess(false);
          return;
        }
      } else if (addDriveUrl && extractDriveId(addDriveUrl)) {
        // Drive URL: プロキシ経由でDL → ffmpegで音声抽出(MP3) → Storage upload
        try {
          setConvertStatus('動画をダウンロード中...');
          const driveFileId = extractDriveId(addDriveUrl);
          const videoFile = await downloadDriveFileViaProxy(driveFileId, setConvertStatus);
          setConvertStatus('音声を抽出中...');
          const mp3File = await prepareAudioForWhisper(videoFile, setConvertStatus);
          setConvertStatus('アップロード中...');
          const { path, url, error: uploadError } = await uploadRoleplayRecording(userId, newSession.id, mp3File);
          setConvertStatus('');
          if (uploadError || !path) {
            setErrorMsg('音声ファイルのアップロードに失敗しました。');
            const { data: refreshed } = await fetchRoleplaySessions(userId);
            setSessions(refreshed || []);
            setAddModalOpen(false);
            setAddForm({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
            setAddRecordingFile(null); setAddRecordingUrl(''); setAddDriveUrl('');
            setAddingSess(false);
            return;
          }
          storagePath = path;
          recordingUrl = url;
          await updateRoleplaySession(newSession.id, { recording_path: path, recording_url: url });
        } catch (convErr) {
          console.error('[Drive convert] error:', convErr);
          setConvertStatus('');
          setErrorMsg(`動画の変換に失敗しました: ${convErr.message}`);
          const { data: refreshed } = await fetchRoleplaySessions(userId);
          setSessions(refreshed || []);
          setAddModalOpen(false);
          setAddForm({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
          setAddRecordingFile(null); setAddRecordingUrl(''); setAddDriveUrl('');
          setAddingSess(false);
          return;
        }
      } else if (addRecordingUrl) {
        await updateRoleplaySession(newSession.id, { recording_url: addRecordingUrl });
      }

      const { data } = await fetchRoleplaySessions(userId);
      setSessions(data || []);
      setAddModalOpen(false);
      setAddForm({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
      setAddRecordingFile(null);
      setAddRecordingUrl('');
      setAddDriveUrl('');
      setAddingSess(false);
      setAnalyzingId(newSession.id);
      setExpandedId(newSession.id);

      const payload = storagePath
        ? { storage_path: storagePath, session_id: newSession.id }
        : { recording_url: recordingUrl, session_id: newSession.id };

      await startAnalysisAndPoll(newSession.id, payload);
      return;
    }

    const { data } = await fetchRoleplaySessions(userId);
    setSessions(data || []);
    setAddModalOpen(false);
    setAddForm({ partner_name: '', session_type: 'weekly', session_date: '', notes: '' });
    setAddRecordingFile(null);
    setAddRecordingUrl('');
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

  // ── Google Drive URL 保存（既存セッション） ──────────────────────────
  const handleSaveDriveUrl = async (sessionId) => {
    const driveId = extractDriveId(driveInputVal);
    if (!driveId) {
      setErrorMsg('Google Drive の共有URLを正しく入力してください。');
      return;
    }
    await updateRoleplaySession(sessionId, { video_url: driveInputVal.trim() });
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, video_url: driveInputVal.trim() } : s));
    setDriveInputId(null);
    setDriveInputVal('');
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
    } else {
      alert('録音ファイルのアップロードに失敗しました。\nエラー: ' + (error?.message || JSON.stringify(error)));
    }
    setUploadingId(null);
    fileTargetSessionId.current = null;
  };

  // ── AI 分析共通ヘルパー: Edge Function 呼び出し + ポーリング ─────────
  // Slack 通知は analyze-roleplay の完了時にサーバー側で発火する
  const startAnalysisAndPoll = async (sessionId, payload) => {
    const { data, error } = await invokeAnalyzeRoleplay(payload);

    // Case 1: 直接レスポンス（従来の同期処理 or ローカルテスト用フォールバック）
    if (!error && data && !data.error && data.transcript) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, transcript: data.transcript, ai_feedback: data.ai_feedback, ai_status: 'done' }
          : s
      ));
      setAnalyzeErrors(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      setExpandedId(sessionId);
      setAnalyzingId(null);
      return;
    }

    // Case 2: バックグラウンド処理 → ポーリングで結果を待つ
    if (!error && data && data.status === 'processing') {
      const controller = new AbortController();
      pollingAbortRef.current = controller;
      const result = await pollRoleplayAnalysis(sessionId, { signal: controller.signal });
      pollingAbortRef.current = null;

      if (result.ai_status === 'done') {
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, transcript: result.transcript, ai_feedback: result.ai_feedback, ai_status: 'done' }
            : s
        ));
        setAnalyzeErrors(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        setExpandedId(sessionId);
      } else {
        await updateRoleplaySession(sessionId, { ai_status: 'error' });
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ai_status: 'error' } : s));
        setAnalyzeErrors(prev => ({ ...prev, [sessionId]: result.error }));
      }
      setAnalyzingId(null);
      return;
    }

    // Case 3: 即時エラー
    const msg = data?.error || error?.message || 'AI分析でエラーが発生しました。';
    await updateRoleplaySession(sessionId, { ai_status: 'error' });
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ai_status: 'error' } : s));
    setAnalyzeErrors(prev => ({ ...prev, [sessionId]: msg }));
    setAnalyzingId(null);
  };

  // ── AI 分析実行 ───────────────────────────────────────────────────────
  const handleAnalyze = async (session) => {
    if (!session.recording_path && !session.recording_url && !session.video_url) return;
    setAnalyzingId(session.id);
    await updateRoleplaySession(session.id, { ai_status: 'processing' });
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ai_status: 'processing' } : s));

    // storage_path がなく recording_url が Drive URL の場合はブラウザ側で音声抽出
    let payload;
    const driveIdForAnalyze = !session.recording_path
      ? (extractDriveId(session.recording_url) || extractDriveId(session.video_url))
      : null;

    if (driveIdForAnalyze) {
      try {
        setConvertStatus('動画をダウンロード中...');
        const videoFile = await downloadDriveFileViaProxy(driveIdForAnalyze, setConvertStatus);
        setConvertStatus('音声を抽出中...');
        const mp3File = await prepareAudioForWhisper(videoFile, setConvertStatus);
        setConvertStatus('アップロード中...');
        const { path, url, error: uploadError } = await uploadRoleplayRecording(userId, session.id, mp3File);
        setConvertStatus('');
        if (uploadError || !path) {
          await updateRoleplaySession(session.id, { ai_status: 'error' });
          setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ai_status: 'error' } : s));
          setAnalyzeErrors(prev => ({ ...prev, [session.id]: 'MP3のアップロードに失敗しました。' }));
          setAnalyzingId(null);
          return;
        }
        await updateRoleplaySession(session.id, { recording_path: path, recording_url: url });
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, recording_path: path, recording_url: url } : s));
        payload = { storage_path: path, session_id: session.id };
      } catch (err) {
        console.error('[handleAnalyze convert] error:', err);
        setConvertStatus('');
        await updateRoleplaySession(session.id, { ai_status: 'error' });
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ai_status: 'error' } : s));
        setAnalyzeErrors(prev => ({ ...prev, [session.id]: `動画の変換に失敗しました: ${err.message}` }));
        setAnalyzingId(null);
        return;
      }
    } else {
      payload = session.recording_path
        ? { storage_path: session.recording_path, session_id: session.id }
        : { recording_url: session.recording_url, session_id: session.id };
    }

    await startAnalysisAndPoll(session.id, payload);
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
        background: completed ? C.green + '0a' : '#F8F9FA',
        border: '1px solid ' + (completed ? C.green + '30' : '#E5E7EB'),
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
    const isExpanded = expandedIds.has(session.id);
    const isUploading = uploadingId === session.id;
    const isAnalyzing = analyzingId === session.id;
    const isDeleting = deletingId === session.id;
    const fb = session.ai_feedback;
    const hasFeedback = session.ai_status === 'done' && fb;
    const driveId = extractDriveId(session.video_url);
    const showDriveInput = driveInputId === session.id;

    return (
      <div style={{
        border: '1px solid ' + (isExpanded ? C.navy + '30' : C.borderLight),
        borderRadius: 8, marginBottom: 8, overflow: 'hidden',
        background: hasFeedback ? C.navy + '04' : C.white,
        transition: 'border-color 0.15s',
      }}>
        {/* ── クリックで開閉するヘッダー行 ── */}
        <div
          onClick={() => toggleExpanded(session.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {/* 開閉シェブロン */}
          <span style={{
            fontSize: 10, color: C.textLight, flexShrink: 0,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            display: 'inline-block',
          }}>▼</span>

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
              {session.ai_status === 'processing' && (
                <span style={{ fontSize: 9, color: C.textLight }}>分析中...</span>
              )}
            </div>
          </div>
        </div>

        {/* ── 展開パネル ── */}
        {isExpanded && (
          <div style={{ borderTop: '1px solid ' + C.borderLight }}>
            {/* 動画サムネイル（Google Drive） */}
            {driveId && (
              <div style={{ padding: '10px 14px 0' }}>
                <div
                  onClick={e => { e.stopPropagation(); setVideoModal(driveId); }}
                  style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
                >
                  <img
                    src={`https://drive.google.com/thumbnail?id=${driveId}&sz=w400`}
                    alt="ロープレ動画"
                    style={{
                      display: 'block', width: 200, height: 113,
                      objectFit: 'cover', borderRadius: 6,
                      background: '#000',
                    }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    borderRadius: 6, background: 'rgba(0,0,0,0.25)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.9)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16,
                    }}>▶</div>
                  </div>
                </div>
              </div>
            )}

            {/* アクションボタン行 */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 14px', alignItems: 'center' }}>
              {/* 録音アップロード（未録音時のみ表示） */}
              {!session.recording_url && (
                <button
                  onClick={e => { e.stopPropagation(); fileTargetSessionId.current = session.id; fileInputRef.current?.click(); }}
                  disabled={isUploading}
                  title="録音をアップロード"
                  style={{
                    padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    border: '1px solid ' + C.borderLight,
                    background: C.white, color: C.textLight,
                    cursor: isUploading ? 'default' : 'pointer', opacity: isUploading ? 0.6 : 1,
                    fontFamily: "'Noto Sans JP'",
                  }}
                >
                  {isUploading ? '...' : '録音↑'}
                </button>
              )}

              {/* Google Drive URL 入力（動画未設定時のみ表示） */}
              {!driveId && showDriveInput ? (
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
                  <input
                    autoFocus
                    value={driveInputVal}
                    onChange={e => setDriveInputVal(e.target.value)}
                    placeholder="Google Drive 共有URL"
                    style={{
                      flex: 1, padding: '3px 7px', borderRadius: 4, fontSize: 10,
                      border: '1px solid ' + C.navy + '40', fontFamily: "'Noto Sans JP'",
                      minWidth: 0,
                    }}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); handleSaveDriveUrl(session.id); }}
                    style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, border: 'none', background: C.navy, color: C.white, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' }}
                  >保存</button>
                  <button
                    onClick={e => { e.stopPropagation(); setDriveInputId(null); setDriveInputVal(''); }}
                    style={{ padding: '3px 6px', borderRadius: 4, fontSize: 10, border: '1px solid ' + C.borderLight, background: 'transparent', color: C.textLight, cursor: 'pointer' }}
                  >✕</button>
                </div>
              ) : !driveId ? (
                <button
                  onClick={e => { e.stopPropagation(); setDriveInputId(session.id); setDriveInputVal(''); }}
                  title="Google Drive URLを設定"
                  style={{
                    padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    border: '1px solid ' + C.borderLight,
                    background: C.white, color: C.textLight,
                    cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                  }}
                >
                  🎬 Drive URL
                </button>
              ) : null}

              {/* AI 分析（分析済み以外のみ表示） */}
              {(session.recording_url || session.recording_path) && session.ai_status !== 'done' && (
                <button
                  onClick={e => { e.stopPropagation(); handleAnalyze(session); }}
                  disabled={isAnalyzing || session.ai_status === 'processing'}
                  style={{
                    padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    border: '1px solid ' + C.borderLight,
                    background: C.white, color: C.textMid,
                    cursor: (isAnalyzing || session.ai_status === 'processing') ? 'default' : 'pointer',
                    opacity: (isAnalyzing || session.ai_status === 'processing') ? 0.6 : 1,
                    fontFamily: "'Noto Sans JP'",
                  }}
                >
                  {session.ai_status === 'processing' || isAnalyzing
                    ? '分析中...'
                    : session.ai_status === 'error'
                    ? '再分析'
                    : '✨ AI分析'}
                </button>
              )}

              {/* 削除（管理者のみ） */}
              {isAdmin && (
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}
                  disabled={isDeleting}
                  style={{
                    padding: '4px 8px', borderRadius: 5, fontSize: 10,
                    border: '1px solid ' + C.borderLight,
                    background: 'transparent', color: C.red,
                    cursor: isDeleting ? 'default' : 'pointer', opacity: isDeleting ? 0.6 : 1,
                    fontFamily: "'Noto Sans JP'",
                    marginLeft: 'auto',
                  }}
                >
                  削除
                </button>
              )}
            </div>

        {/* AI エラー表示 */}
        {isExpanded && session.ai_status === 'error' && (
          <div style={{
            borderTop: '1px solid #fecaca',
            padding: '10px 16px',
            background: '#fff5f5',
            fontSize: 11,
            color: '#c0392b',
          }}>
            ⚠️ {analyzeErrors[session.id] || 'AI分析でエラーが発生しました。'}
          </div>
        )}

        {/* AI フィードバック */}
        {isExpanded && fb && (
          <div style={{
            borderTop: '1px solid ' + C.borderLight,
            background: '#fff',
            padding: '16px 18px',
          }}>
            {/* ヘッダー */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              paddingBottom: 10, marginBottom: 14,
              borderBottom: '1px solid ' + C.border,
            }}>
              <div style={{ width: 3, height: 13, background: C.navy, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.navy, textTransform: 'uppercase' }}>
                AI Analysis Report
              </span>
              {session.session_date && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textLight, fontFamily: 'monospace' }}>
                  {session.session_date}
                </span>
              )}
            </div>

            {/* 総評 */}
            {fb.overall && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', color: C.navy, fontWeight: 700, textTransform: 'uppercase', marginBottom: 7 }}>
                  Executive Summary
                </div>
                <div style={{
                  fontSize: 11, color: C.textMid, lineHeight: 1.85,
                  borderLeft: '2px solid ' + C.navy + '30', paddingLeft: 10,
                  whiteSpace: 'pre-wrap',
                }}>
                  {fb.overall}
                </div>
              </div>
            )}

            {/* 課題点 */}
            {fb.issues?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', color: C.navy, fontWeight: 700, textTransform: 'uppercase', marginBottom: 7 }}>
                  Key Issues
                </div>
                {fb.issues.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 9, color: C.navy, fontFamily: 'monospace', fontWeight: 700, minWidth: 22, flexShrink: 0, marginTop: 2, opacity: 0.6 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 11, color: C.textMid, lineHeight: 1.75 }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action Plan（新形式: 課題ごとに方針 + ドリルを統合） */}
            {fb.actionPlan?.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', color: C.navy, fontWeight: 700, textTransform: 'uppercase', marginBottom: 7 }}>
                  Action Plan
                </div>
                {fb.actionPlan.map((item, i) => {
                  const principle = typeof item === 'string' ? item : (item?.principle || '');
                  const drill = typeof item === 'string' ? '' : (item?.drill || '');
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 9, color: C.navy, fontFamily: 'monospace', fontWeight: 700, minWidth: 22, flexShrink: 0, marginTop: 2, opacity: 0.6 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.75 }}>{principle}</div>
                        {drill && (
                          <div style={{ marginTop: 4, fontSize: 10.5, color: C.textLight, lineHeight: 1.75, paddingLeft: 10, borderLeft: '2px solid ' + C.navy + '20' }}>
                            <span style={{ fontWeight: 700, color: C.navy + 'dd', marginRight: 6 }}>実践</span>
                            {drill}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 旧形式 fallback: solutions / practice（後方互換） */}
            {!fb.actionPlan?.length && fb.solutions?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', color: C.navy, fontWeight: 700, textTransform: 'uppercase', marginBottom: 7 }}>
                  Recommendations
                </div>
                {fb.solutions.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 9, color: C.navy, fontFamily: 'monospace', fontWeight: 700, minWidth: 22, flexShrink: 0, marginTop: 2, opacity: 0.6 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 11, color: C.textMid, lineHeight: 1.75 }}>{item}</span>
                  </div>
                ))}
              </div>
            )}
            {!fb.actionPlan?.length && fb.practice?.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', color: C.navy, fontWeight: 700, textTransform: 'uppercase', marginBottom: 7 }}>
                  Training Protocol
                </div>
                {fb.practice.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 9, color: C.navy, fontFamily: 'monospace', fontWeight: 700, minWidth: 22, flexShrink: 0, marginTop: 2, opacity: 0.6 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 11, color: C.textMid, lineHeight: 1.75 }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 文字起こし */}
            {session.transcript && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 9, color: C.textLight, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none' }}>
                  Transcript ▾
                </summary>
                <div style={{
                  fontSize: 10, color: C.textLight, lineHeight: 1.75,
                  marginTop: 8, whiteSpace: 'pre-wrap',
                  maxHeight: 200, overflowY: 'auto',
                  background: C.cream, padding: '10px 12px', borderRadius: 4,
                  border: '1px solid ' + C.borderLight,
                }}>
                  {session.transcript}
                </div>
              </details>
            )}
          </div>
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
  const showWeekly = isAdmin || memberInfo?.role === 'メンバー' || memberInfo?.rank;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: C.textLight, fontSize: 12 }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div>
      {/* hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 対象メンバー切替（閲覧用。非adminでも他メンバー選択可） */}
      {members && members.length > 0 && (
        <TargetMemberPicker
          members={members}
          value={targetMemberName}
          onChange={setTargetMemberName}
          fallbackLabel={currentUser}
        />
      )}

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
                width: 28, height: 28, borderRadius: 4, background: C.navy,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: C.white, flexShrink: 0,
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
          {/* 今週の状況バナー（役職がメンバーの人のみ表示） */}
          {memberInfo?.role === 'メンバー' && <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: thisWeekDone ? C.green + '0a' : '#FFF7ED',
            border: '1px solid ' + (thisWeekDone ? C.green + '30' : '#FED7AA'),
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: thisWeekDone ? C.green : '#F59E0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: C.white,
            }}>
              {thisWeekDone ? '✓' : '!'}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: thisWeekDone ? C.green : '#92400E' }}>
                今週のロープレ: {thisWeekDone ? '実施済み' : '未実施'}
              </div>
              <div style={{ fontSize: 10, color: C.textLight }}>
                {thisWeekDone
                  ? '今週のロープレは完了しています'
                  : '毎週1回、篠宮とのロープレが必要です'}
              </div>
            </div>
          </div>}

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
          onClick={() => { setAddModalOpen(false); setAddRecordingFile(null); setAddRecordingUrl(''); setAddDriveUrl(''); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: 4, padding: '24px 28px',
              width: 360, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
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
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                // ファイル（OSやファイルマネージャーから）
                const file = e.dataTransfer.files?.[0];
                if (file) { setAddRecordingFile(file); setAddRecordingUrl(''); return; }
                // URL（別タブ・別ページからドラッグ）
                const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
                if (url && url.startsWith('http')) { setAddRecordingUrl(url.trim()); setAddRecordingFile(null); }
              }}
              style={{
                padding: '14px 12px', borderRadius: 6, marginBottom: 12,
                border: '1.5px dashed ' + (dragOver ? C.gold : (addRecordingFile || addRecordingUrl) ? C.navy + '60' : C.borderLight),
                background: dragOver ? C.gold + '10' : (addRecordingFile || addRecordingUrl) ? C.navy + '06' : C.offWhite,
                cursor: 'pointer', fontSize: 11,
                color: dragOver ? '#c8860a' : (addRecordingFile || addRecordingUrl) ? C.navy : C.textLight,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'border-color 0.15s, background 0.15s',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 22 }}>{dragOver ? '📂' : (addRecordingFile || addRecordingUrl) ? '🎵' : '🎙️'}</span>
              {addRecordingFile ? (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 11 }}>{addRecordingFile.name}</span>
                  {needsConversion(addRecordingFile) && (
                    <div style={{ fontSize: 10, color: '#c8860a', marginTop: 3 }}>
                      🔄 アップロード時に自動でMP3へ変換されます
                    </div>
                  )}
                </div>
              ) : addRecordingUrl ? (
                <span style={{ fontWeight: 600, fontSize: 11, wordBreak: 'break-all', maxWidth: '100%' }}>
                  {addRecordingUrl.length > 60 ? addRecordingUrl.slice(0, 60) + '…' : addRecordingUrl}
                </span>
              ) : (
                <>
                  <span style={{ fontWeight: 600, fontSize: 11 }}>
                    {dragOver ? 'ここにドロップ' : 'ドラッグ＆ドロップ、またはクリックして選択'}
                  </span>
                  <span style={{ fontSize: 10, color: C.textLight }}>MP3 / MP4 / M4A / WAV / MOV など対応 / 25MB超・MOV は自動でMP3に変換</span>
                </>
              )}
              {(addRecordingFile || addRecordingUrl) && (
                <button
                  onClick={e => { e.stopPropagation(); setAddRecordingFile(null); setAddRecordingUrl(''); setAddDriveUrl(''); if (addFileInputRef.current) addFileInputRef.current.value = ''; }}
                  style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 11, marginTop: 2 }}
                >✕ 取り消す</button>
              )}
            </div>

            {/* Google Drive URL */}
            <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 }}>
              動画（Google Drive 共有URL）（任意）
            </label>
            <input
              type="text"
              value={addDriveUrl}
              onChange={e => setAddDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid ' + C.borderLight, fontSize: 12, marginBottom: 12,
                boxSizing: 'border-box', fontFamily: "'Noto Sans JP'",
              }}
            />

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

            {errorMsg && (
              <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: '#fff0f0', border: '1px solid #f5c6c6', fontSize: 11, color: '#c0392b' }}>
                {errorMsg}
              </div>
            )}
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
                {driveUploadProgress != null
                  ? `動画アップロード中... ${driveUploadProgress}%`
                  : convertStatus
                    ? convertStatus
                    : addingSess
                      ? (addRecordingFile ? 'アップロード中...' : addDriveUrl ? 'ダウンロード・変換中...' : '追加中...')
                      : (addRecordingFile
                          ? (needsConversion(addRecordingFile) ? '変換→アップロード→AI分析' : '追加してAI分析する')
                          : addDriveUrl
                            ? '追加してAI分析する（動画から自動変換）'
                            : '追加する')
                }
              </button>
              <button
                onClick={() => { setAddModalOpen(false); setAddRecordingFile(null); setAddRecordingUrl(''); setAddDriveUrl(''); }}
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

      {/* ── 動画プレーヤーモーダル（Google Drive iframe） ── */}
      {videoModal && (
        <div
          onClick={() => setVideoModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '90vw', maxWidth: 900 }}>
            <iframe
              src={`https://drive.google.com/file/d/${videoModal}/preview`}
              width="100%"
              height="500"
              allow="autoplay"
              style={{ border: 'none', borderRadius: 8, display: 'block' }}
            />
            <button
              onClick={() => setVideoModal(null)}
              style={{
                position: 'absolute', top: -14, right: -14,
                width: 30, height: 30, borderRadius: '50%',
                background: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 16, fontWeight: 700, color: '#333',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// admin用 対象メンバー切替（検索+オートコンプリート）
function TargetMemberPicker({ members, value, onChange, fallbackLabel }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const candidates = useMemo(() => {
    return (members || []).filter(m => m?.name && m?.user_id);
  }, [members]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(m => (m.name || '').toLowerCase().includes(q));
  }, [candidates, query]);

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (name) => {
    onChange(name || null);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, matches.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight === 0) pick(null);
      else {
        const m = matches[highlight - 1];
        if (m) pick(m.name);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const placeholder = value
    ? `選択中: ${value}`
    : `自分 (${fallbackLabel})`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      padding: '10px 12px', background: '#F8F9FA', border: '1px solid ' + C.borderLight, borderRadius: 6,
    }}>
      <span style={{ fontSize: 10, color: C.textLight, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        対象メンバー
      </span>
      <div ref={wrapRef} style={{ position: 'relative', flex: '0 1 280px', minWidth: 200 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid ' + C.border, borderRadius: 3,
          padding: '4px 8px', background: C.white,
        }}>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 12, fontFamily: "'Noto Sans JP',sans-serif",
              color: C.textDark, background: 'transparent',
            }}
          />
          {value && (
            <button type="button" onClick={() => pick(null)} title="自分に戻す"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                color: C.textLight, fontSize: 14, padding: '0 4px' }}
            >×</button>
          )}
        </div>
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
            background: C.white, border: '1px solid ' + C.border, borderRadius: 3,
            boxShadow: '0 6px 20px rgba(13,34,71,0.08)',
            maxHeight: 280, overflowY: 'auto', zIndex: 50,
          }}>
            <PickerItem
              label={`自分 (${fallbackLabel})`}
              active={!value}
              highlighted={highlight === 0}
              onHover={() => setHighlight(0)}
              onClick={() => pick(null)}
            />
            {matches.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>
                該当なし
              </div>
            )}
            {matches.map((m, i) => (
              <PickerItem
                key={m._supaId || m.user_id}
                label={m.name}
                active={value === m.name}
                highlighted={highlight === i + 1}
                onHover={() => setHighlight(i + 1)}
                onClick={() => pick(m.name)}
                query={query}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickerItem({ label, active, highlighted, onHover, onClick, query }) {
  const bg = highlighted ? '#F3F4F6' : (active ? '#F5F7FB' : '#fff');
  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      style={{
        padding: '8px 12px', fontSize: 12, cursor: 'pointer',
        background: bg, color: active ? C.navy : C.textDark,
        fontWeight: active ? 600 : 400, fontFamily: "'Noto Sans JP', sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <span>{query ? highlightMatch(label, query) : label}</span>
      {active && <span style={{ fontSize: 11, color: C.gold }}>●</span>}
    </div>
  );
}

function highlightMatch(text, query) {
  if (!text) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: '#FEF3C7', fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
