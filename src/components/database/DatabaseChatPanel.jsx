// Database 画面 自然言語チャット検索パネル
//   - AI が自然言語から検索条件を抽出 → 日本語で要約 → ユーザー確認 → 既存フィルタへバルク適用
//   - 会話履歴は database_chat_sessions / database_chat_messages に保存
//   - 検索条件は saved_company_searches に保存・呼び出し可能
//
// UX:
//   1) ユーザーが自然言語で送信
//   2) AI が要約 + filters を返す → assistant メッセージとして表示
//   3) 「この条件で検索」「修正する」ボタンを表示
//      - 「この条件で検索」押下 → 親に filters を渡してバルク反映＆検索実行
//      - 「修正する」押下 → 何もせず次の入力待ち
//   4) needsClarification: true の場合はボタンを出さず聞き返し文だけ表示

import { useState, useEffect, useRef, useCallback } from 'react';
import { color, space, radius, font, shadow, alpha, transition } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { MessageSquare, Send, Save, BookmarkCheck, Trash2, ChevronDown, ChevronUp, RotateCcw, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  createChatSession, listChatSessions, loadChatMessages, appendChatMessage, deleteChatSession,
  sendChatToAi, applyAiFiltersToBase,
  saveSearch, listSavedSearches, deleteSavedSearch,
  pickPersistableFilters,
} from '../../lib/databaseChatApi';

export default function DatabaseChatPanel({ baseFilters, onApplyFilters }) {
  const { session, orgId, profile } = useAuth();
  const userId = session?.user?.id || profile?.id || null;

  const [open, setOpen] = useState(true);                  // パネル展開状態
  const [sessionId, setSessionId] = useState(null);        // 現アクティブなチャットセッション
  const [messages, setMessages] = useState([]);            // 表示中の会話
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [savedSearches, setSavedSearches] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savingMode, setSavingMode] = useState(false);

  const scrollRef = useRef(null);

  // 保存検索 を初回ロード（カテゴリは sendChatToAi 内で fetch される）
  useEffect(() => {
    if (!userId) return;
    listSavedSearches(userId).then(setSavedSearches).catch(console.warn);
  }, [userId]);

  // メッセージ追加時にスクロール最下部へ
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // セッション開始（送信時に自動作成）
  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    if (!userId || !orgId) throw new Error('ログイン情報が読み込めていません');
    const s = await createChatSession(orgId, userId);
    setSessionId(s.id);
    return s.id;
  }, [sessionId, userId, orgId]);

  // 送信
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setLoading(true);
    try {
      const sid = await ensureSession();

      // 楽観的UI更新
      const userMsg = { id: 'tmp-u-' + Date.now(), role: 'user', content: text };
      setMessages(prev => [...prev, userMsg]);
      setInput('');

      // DB保存（ユーザー側）
      await appendChatMessage(sid, 'user', text);

      // AIへ送信（直近履歴 + 新規user発話）
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const ai = await sendChatToAi({
        messages: history,
        currentFilters: pickPersistableFilters(baseFilters),
      });

      // 表示
      const assistantMsg = {
        id: 'tmp-a-' + Date.now(),
        role: 'assistant',
        content: ai.needsClarification ? (ai.clarifyQuestion || ai.summary || '') : (ai.summary || ''),
        filters_json: ai.needsClarification ? null : (ai.filters || null),
        needs_clarification: !!ai.needsClarification,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // DB保存（assistant側）
      await appendChatMessage(sid, 'assistant', assistantMsg.content, assistantMsg.filters_json, assistantMsg.needs_clarification);
    } catch (e) {
      console.error('chat send failed', e);
      setError(e.message || '送信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (filtersJson) => {
    if (!filtersJson) return;
    const merged = await applyAiFiltersToBase(baseFilters, filtersJson);
    onApplyFilters(merged);
  };

  const handleNewSession = async () => {
    setSessionId(null);
    setMessages([]);
    setInput('');
    setError(null);
  };

  const handleLoadSaved = async (id) => {
    const item = savedSearches.find(s => s.id === id);
    if (!item) return;
    const merged = { ...baseFilters, ...item.filters_json, page: 0 };
    onApplyFilters(merged);
    setShowSaved(false);
  };

  const handleSaveCurrent = async () => {
    const name = saveName.trim();
    if (!name) return;
    if (!userId || !orgId) {
      setError('ログイン情報が読み込めていません');
      return;
    }
    try {
      const saved = await saveSearch(orgId, userId, name, baseFilters);
      setSavedSearches(prev => [saved, ...prev]);
      setSaveName('');
      setSavingMode(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteSaved = async (id) => {
    if (!window.confirm('この保存条件を削除しますか？')) return;
    try {
      await deleteSavedSearch(id);
      setSavedSearches(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Card padding="none" style={{ marginBottom: space[4], overflow: 'hidden' }}>
      {/* ヘッダー（折りたたみトグル） */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${space[2.5]}px ${space[4]}px`,
        background: open ? alpha(color.navyLight, 0.06) : color.white,
        borderBottom: open ? `1px solid ${color.border}` : 'none',
        cursor: 'pointer', transition: transition.fast,
      }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <Sparkles size={16} color={color.navy} />
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.textDark }}>
            AIチャット検索
          </div>
          <Badge variant="primary" size="sm">Beta</Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>
            自然言語で条件を伝えるとAIが検索フィルタを組み立てます
          </span>
          {open ? <ChevronUp size={16} color={color.textMid} /> : <ChevronDown size={16} color={color.textMid} />}
        </div>
      </div>

      {open && (
        <div style={{ padding: space[4] }}>
          {/* 上部ツールバー：保存検索の呼び出し / 現在条件を保存 / 新規会話 */}
          <div style={{ display: 'flex', gap: space[2], marginBottom: space[3], flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Button variant="outline" size="sm" iconLeft={<BookmarkCheck size={14} />}
                onClick={() => setShowSaved(s => !s)}>
                保存済みの条件を呼び出す ({savedSearches.length})
              </Button>
              {showSaved && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                  background: color.white, border: `1px solid ${color.border}`,
                  borderRadius: radius.lg, boxShadow: shadow.lg, minWidth: 280, maxHeight: 320,
                  overflowY: 'auto', zIndex: 50,
                }}>
                  {savedSearches.length === 0 ? (
                    <div style={{ padding: space[3], fontSize: font.size.xs, color: color.textLight }}>
                      保存された条件はまだありません
                    </div>
                  ) : savedSearches.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${color.borderLight}`,
                    }}>
                      <button onClick={() => handleLoadSaved(s.id)} style={{
                        flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: font.size.sm, color: color.textDark, padding: 0,
                      }}>
                        {s.name}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSaved(s.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        title="削除">
                        <Trash2 size={14} color={color.textLight} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {savingMode ? (
              <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center' }}>
                <Input
                  size="sm" value={saveName} onChange={e => setSaveName(e.target.value)}
                  placeholder="条件名（例: 関東・製造業・社員50人〜）"
                  containerStyle={{ width: 280 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveCurrent(); }}
                />
                <Button size="sm" onClick={handleSaveCurrent} disabled={!saveName.trim()}>保存</Button>
                <Button size="sm" variant="ghost" onClick={() => { setSavingMode(false); setSaveName(''); }}>
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" iconLeft={<Save size={14} />}
                onClick={() => setSavingMode(true)}>
                現在の条件を保存
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconLeft={<RotateCcw size={14} />} onClick={handleNewSession}>
              新しい会話
            </Button>
          </div>

          {/* 会話表示エリア */}
          <div ref={scrollRef} style={{
            maxHeight: 320, overflowY: 'auto',
            background: color.cream, border: `1px solid ${color.borderLight}`,
            borderRadius: radius.md, padding: space[3], marginBottom: space[3],
            display: 'flex', flexDirection: 'column', gap: space[2],
          }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: space[4], color: color.textLight, fontSize: font.size.xs }}>
                <MessageSquare size={28} color={color.border} style={{ marginBottom: 6 }} />
                <div>例: 「東京都の製造業、社員50人以上、社長60代以上」</div>
                <div style={{ marginTop: 2 }}>例: 「関西のSaaS系で売上10〜30億円」</div>
              </div>
            ) : messages.map(m => (
              <ChatBubble key={m.id} message={m} onApply={handleApply} loading={loading} />
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', fontSize: font.size.xs, color: color.textLight, padding: `${space[1.5]}px ${space[2.5]}px` }}>
                AIが条件を組み立てています...
              </div>
            )}
          </div>

          {error && (
            <div style={{
              padding: `${space[2]}px ${space[3]}px`, background: alpha(color.danger, 0.08),
              color: color.danger, borderRadius: radius.md, fontSize: font.size.xs, marginBottom: space[2],
            }}>
              {error}
            </div>
          )}

          {/* 入力エリア */}
          <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="検索したい条件を入力（Ctrl+Enter で送信）"
              rows={2}
              style={{
                flex: 1, padding: `${space[2]}px ${space[3]}px`,
                border: `1px solid ${color.border}`, borderRadius: radius.md,
                fontSize: font.size.sm, fontFamily: font.family.base, resize: 'vertical',
                color: color.textDark, background: color.white, minHeight: 60,
                outline: 'none',
              }}
            />
            <Button onClick={handleSend} loading={loading} disabled={!input.trim()} iconLeft={<Send size={14} />}>
              送信
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// 個別メッセージバブル
// ============================================================
function ChatBubble({ message, onApply, loading }) {
  const isUser = message.role === 'user';
  const hasFilters = !isUser && message.filters_json && !message.needs_clarification;

  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{
        padding: `${space[2]}px ${space[3]}px`,
        background: isUser ? color.navy : color.white,
        color: isUser ? color.white : color.textDark,
        border: isUser ? 'none' : `1px solid ${color.border}`,
        borderRadius: radius.lg,
        fontSize: font.size.sm, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {message.content || '（空のメッセージ）'}
      </div>
      {hasFilters && (
        <div style={{ display: 'flex', gap: space[1.5], marginTop: 2 }}>
          <Button size="sm" onClick={() => onApply(message.filters_json)} disabled={loading}>
            この条件で検索
          </Button>
          <Button size="sm" variant="ghost" disabled={loading}>
            修正する（次のメッセージで指示）
          </Button>
        </div>
      )}
    </div>
  );
}
