import { useState, useRef, useEffect } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';
import { sendChatToAi } from '../../lib/agencyChatApi';

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

export default function AgencyChatPanel({ open, onClose, currentFilters, onApply }) {
  const [messages, setMessages] = useState([]); // { role, content, filters? }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

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
    } catch (e) {
      console.error('[AgencyChatPanel] send error', e);
      setError(e.message || 'AI 応答に失敗しました');
    } finally {
      setSending(false);
    }
  }

  function applyAndClose(aiFilters) {
    if (!aiFilters) return;
    onApply?.(aiFilters);
    onClose?.();
  }

  function reset() {
    setMessages([]);
    setError(null);
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
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset}>新規</Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
          </div>
        </div>

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
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="primary" onClick={() => applyAndClose(m.filters)}>
                    この条件で検索
                  </Button>
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
