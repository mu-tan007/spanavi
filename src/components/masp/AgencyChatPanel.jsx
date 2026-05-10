import { useState, useRef, useEffect } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';
import {
  sendChatToAi,
  createChatSession, listChatSessions, loadChatMessages,
  appendChatMessage, deleteChatSession,
} from '../../lib/agencyChatApi';

// MASP Firms (cap_ma_agencies) の自然言語検索チャットパネル。
// 右側スライドインのドロワー形式。シンプル運用 (履歴永続化は v2 で対応)。
//
// Props:
//   open: boolean
//   onClose: () => void
//   currentFilters: object  AI に渡す現在の手動フィルタ状態（差分維持に使う）
//   onApply: (aiFilters) => void  AI が返した filters を MaspFirmsView の state に流し込む

const SUGGESTIONS = [
  '東京の3人以上のFA会社',
  '関西で仲介業務をやっている支援機関',
  '専従者が10人以上の大手機関',
  '九州の未接触機関で情報共有加盟済み',
];

export default function AgencyChatPanel({ open, onClose, currentFilters, onApply, aiSession, userId, orgId }) {
  // messages: { role, content, filters?, appliedSessionId? }
  // appliedSessionId が aiSession.id と一致したら、そのメッセージの下にヒット件数を表示
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  // 永続化セッション
  const [sessionId, setSessionId] = useState(null); // 現在のセッション (Supabase)
  const [pastSessions, setPastSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // 起動時に過去セッション一覧を取得
  useEffect(() => {
    if (!open || !userId) return;
    listChatSessions(userId, 30).then(setPastSessions).catch(e => console.warn('[AgencyChatPanel] listChatSessions failed', e));
  }, [open, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  if (!open) return null;

  async function send(text) {
    const trimmed = (text || input).trim();
    if (!trimmed || sending) return;
    setError(null);
    setInput('');
    const userMsg = { role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setSending(true);

    // セッション確保 (初回のみ作成)
    let sid = sessionId;
    if (!sid && userId && orgId) {
      try {
        const s = await createChatSession(orgId, userId, trimmed.slice(0, 60));
        sid = s.id;
        setSessionId(sid);
        setPastSessions(prev => [s, ...prev]);
      } catch (e) {
        console.warn('[AgencyChatPanel] createChatSession failed', e);
      }
    }
    if (sid) {
      appendChatMessage(sid, 'user', trimmed).catch(e => console.warn('appendChatMessage user failed', e));
    }

    try {
      const res = await sendChatToAi({
        messages: next.map(m => ({ role: m.role, content: m.content })),
        currentFilters,
      });
      const summary = res?.summary || '（要約なし）';
      const aiMsg = {
        role: 'assistant',
        content: summary + (res?.clarifyQuestion ? `\n\n${res.clarifyQuestion}` : ''),
        filters: res?.filters || null,
        needsClarification: res?.needsClarification === true,
      };
      setMessages([...next, aiMsg]);
      if (sid) {
        appendChatMessage(sid, 'assistant', aiMsg.content, aiMsg.filters || null)
          .catch(e => console.warn('appendChatMessage assistant failed', e));
      }
    } catch (e) {
      console.error('[AgencyChatPanel] send error', e);
      setError(e.message || 'AI 応答に失敗しました');
    } finally {
      setSending(false);
    }
  }

  async function loadSession(s) {
    setShowHistory(false);
    try {
      const rows = await loadChatMessages(s.id);
      setMessages(rows.map(r => ({
        role: r.role,
        content: r.content,
        filters: r.filters || null,
        needsClarification: false, // 過去メッセージで再度 apply するときの整合性のため false 扱い
      })));
      setSessionId(s.id);
      setError(null);
    } catch (e) {
      console.error('[AgencyChatPanel] loadSession failed', e);
      setError('履歴の読み込みに失敗しました');
    }
  }

  async function handleDeleteSession(s, evt) {
    evt.stopPropagation();
    if (!confirm(`「${s.title || '無題'}」を削除しますか？`)) return;
    try {
      await deleteChatSession(s.id);
      setPastSessions(prev => prev.filter(x => x.id !== s.id));
      if (sessionId === s.id) {
        setMessages([]);
        setSessionId(null);
      }
    } catch (e) {
      alert('削除に失敗しました: ' + (e.message || e));
    }
  }

  function applyAndKeepOpen(aiFilters, msgIndex) {
    if (!aiFilters) return;
    onApply?.(aiFilters);
    // 該当メッセージに「次の aiSession.id で記録予定」フラグ
    const expectedId = (aiSession?.id || 0) + 1;
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, appliedSessionId: expectedId } : m));
    // ドロワーは開いたまま、結果件数を見せる
  }

  function reset() {
    setMessages([]);
    setError(null);
    setSessionId(null);
  }

  return (
    <>
      {/* 背景オーバーレイ */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.4),
          zIndex: 90,
        }}
      />
      {/* ドロワー */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '100vw',
        background: color.white, boxShadow: shadow.xl, zIndex: 91,
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.25s ease',
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: `${space[4]}px ${space[5]}px`,
          borderBottom: `1px solid ${color.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
        }}>
          <div>
            <div style={{ fontSize: font.size.xs, color: color.textMid, letterSpacing: 1, textTransform: 'uppercase' }}>
              MASP · AI Search
            </div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy, marginTop: 2 }}>
              支援機関を自然言語で検索
            </div>
          </div>
          <div style={{ display: 'flex', gap: space[1] }}>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(v => !v)}>
              履歴 ({pastSessions.length})
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset}>新規</Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
          </div>
        </div>

        {/* 履歴パネル (折りたたみ) */}
        {showHistory && (
          <div style={{
            borderBottom: `1px solid ${color.border}`,
            background: color.gray50,
            maxHeight: 220, overflowY: 'auto',
            padding: space[2],
          }}>
            {pastSessions.length === 0 ? (
              <div style={{ fontSize: font.size.xs, color: color.textLight, padding: space[2] }}>
                履歴はありません
              </div>
            ) : pastSessions.map(s => (
              <div key={s.id}
                onClick={() => loadSession(s)}
                style={{
                  padding: `${space[1]}px ${space[2]}px`,
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  background: sessionId === s.id ? alpha(color.navyLight, 0.1) : 'transparent',
                }}
                onMouseEnter={e => { if (sessionId !== s.id) e.currentTarget.style.background = color.white }}
                onMouseLeave={e => { if (sessionId !== s.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: font.size.xs, color: color.textDark,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.title || '(無題)'}
                  </div>
                  <div style={{ fontSize: 9, color: color.textLight }}>
                    {new Date(s.updated_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(s, e)}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: color.textLight, fontSize: font.size.xs, padding: '2px 4px',
                  }}
                  title="削除"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* メッセージ一覧 */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: space[4] }}>
          {messages.length === 0 && (
            <div>
              <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: 0, marginBottom: space[3] }}>
                条件を日本語で入力してください。AI が抽出してフィルタに反映します。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      textAlign: 'left', padding: `${space[2]}px ${space[3]}px`,
                      border: `0.5px solid ${color.border}`, borderRadius: radius.md,
                      background: color.white, color: color.navy,
                      fontSize: font.size.sm, cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: space[3],
              display: 'flex', flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '85%',
                padding: `${space[2]}px ${space[3]}px`,
                borderRadius: radius.lg,
                background: m.role === 'user' ? color.navy : color.gray50,
                color: m.role === 'user' ? color.white : color.textDark,
                fontSize: font.size.sm, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
              {m.role === 'assistant' && m.filters && !m.needsClarification && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                  <Button size="sm" variant="primary" onClick={() => applyAndKeepOpen(m.filters, i)}>
                    この条件で検索
                  </Button>
                  {m.appliedSessionId && aiSession?.id === m.appliedSessionId && aiSession?.count != null && (
                    <HitFeedback
                      count={aiSession.count}
                      onAskRefine={(text) => { setInput(text); }}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: font.size.xs, color: color.textMid,
              marginTop: space[2],
            }}>
              <span className="aspin" style={{
                width: 10, height: 10, borderRadius: '50%',
                border: `2px solid ${color.border}`, borderTopColor: color.navy,
                display: 'inline-block', animation: 'aspin 0.7s linear infinite',
              }} />
              AI が条件を解釈中...
            </div>
          )}

          {error && (
            <div style={{
              padding: `${space[2]}px ${space[3]}px`,
              borderRadius: radius.md,
              background: alpha(color.danger, 0.08),
              color: color.danger, fontSize: font.size.xs,
              marginTop: space[2],
            }}>
              {error}
            </div>
          )}
        </div>

        {/* 入力エリア */}
        <div style={{
          padding: space[3],
          borderTop: `1px solid ${color.border}`,
          background: color.white,
        }}>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="例: 東京の専従3人以上で情報共有加盟済み"
              disabled={sending}
              rows={2}
              style={{
                flex: 1, padding: `${space[2]}px ${space[3]}px`,
                border: `0.5px solid ${color.border}`, borderRadius: radius.md,
                fontSize: font.size.sm, fontFamily: font.family.sans,
                outline: 'none', resize: 'none', lineHeight: 1.5,
                color: color.textDark, background: color.white,
              }}
            />
            <Button
              size="sm" variant="primary"
              onClick={() => send()}
              disabled={!input.trim() || sending}
            >
              送信
            </Button>
          </div>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>
            Enter で送信 / Shift+Enter で改行
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes aspin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

function HitFeedback({ count, onAskRefine }) {
  // 件数に応じてサジェスト変更
  let tone, msg, suggest;
  if (count === 0) {
    tone = 'danger';
    msg = `0件 — 条件に該当する機関がありません`;
    suggest = '条件を緩めて再検索して';
  } else if (count <= 5) {
    tone = 'warn';
    msg = `${count}件 — 候補が少なめです`;
    suggest = 'もう少し広い条件で検索して';
  } else if (count <= 100) {
    tone = 'success';
    msg = `${count}件 ヒットしました`;
    suggest = null;
  } else if (count <= 500) {
    tone = 'info';
    msg = `${count}件 — やや多めです`;
    suggest = 'もっと絞り込んで';
  } else {
    tone = 'warn';
    msg = `${count}件 — かなり多いので絞り込み推奨`;
    suggest = '優先度の高い条件に絞って';
  }
  const bg = {
    danger: alpha(color.danger, 0.08),
    warn: alpha(color.warn, 0.1),
    success: alpha(color.success, 0.1),
    info: alpha(color.navyLight, 0.08),
  }[tone];
  const fg = {
    danger: color.danger,
    warn: color.warn,
    success: color.success,
    info: color.navy,
  }[tone];
  return (
    <div style={{
      padding: '6px 10px', borderRadius: radius.md,
      background: bg, color: fg,
      fontSize: font.size.xs, display: 'flex', alignItems: 'center', gap: 8,
      maxWidth: '100%',
    }}>
      <span style={{ fontWeight: font.weight.semibold }}>{msg}</span>
      {suggest && (
        <button
          onClick={() => onAskRefine?.(suggest)}
          style={{
            border: 'none', background: 'transparent',
            color: fg, fontSize: font.size.xs, cursor: 'pointer',
            textDecoration: 'underline', padding: 0,
          }}
        >
          {suggest}
        </button>
      )}
    </div>
  );
}
