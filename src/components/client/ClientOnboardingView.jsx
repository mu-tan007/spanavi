import React, { useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';

// 進捗ステータス
const STATUS = {
  todo:   { label: '未着手', bg: alpha(color.textLight, 0.12), fg: color.textMid,  border: color.border },
  doing:  { label: '進行中', bg: alpha(color.gold, 0.16),       fg: color.gold,     border: alpha(color.gold, 0.4) },
  done:   { label: '完了',   bg: alpha(color.success, 0.16),    fg: color.success,  border: alpha(color.success, 0.4) },
};

// オンボーディング 4ステップ定義
const STEPS = [
  {
    id: 'contract',
    number: 1,
    title: '契約締結',
    summary: '弊社の雛形またはクライアント様提供の雛形をベースに、修正事項をすり合わせの上で GMO サインにて電子契約を締結します。',
    details: ['雛形のアップロード / 共有', '修正事項のすり合わせ', 'GMO サインによる電子契約'],
    cta: '契約書を確認・締結する',
  },
  {
    id: 'list',
    number: 2,
    title: '架電リストの準備',
    summary: '弊社の東京商工リサーチ 50万社 DB / クライアント様提供リスト / 両者持ち寄りのいずれかでリストを作成します。1,000 件以上を推奨。',
    details: ['希望条件 (業種・売上規模・エリア) の入力', 'リストファイルのアップロード (任意)', '精査・最終確定'],
    cta: 'リストの条件を入力する',
  },
  {
    id: 'script',
    number: 3,
    title: 'トークスクリプトの作成',
    summary: 'クライアント様にベースがあれば共有いただき微調整、なければ弊社にてゼロから作成します。',
    details: ['ベーススクリプトの共有 (任意)', '弊社による調整', '最終版の確認'],
    cta: 'スクリプトを共有・作成する',
  },
  {
    id: 'calendar',
    number: 4,
    title: 'カレンダー連携と日程調整ルールの設定',
    summary: '面談担当者のカレンダーと日程調整ツールを連携いただき、調整ルール (バッファー / 空き時間 / 土日対応) を設定します。',
    details: ['カレンダー (Google / Outlook) の連携', '日程調整ツール URL の共有', 'バッファー / 前後空き時間 / 土日対応'],
    cta: 'カレンダーを連携する',
  },
];

const NAVY = color.navy;
const MASCOT_SRC = '/spi-mascot.jpg';

export default function ClientOnboardingView({ client }) {
  // スケルトン段階: 進捗は localStorage に仮保存 (後で onboarding_status テーブルに移行)
  const storageKey = `spanavi.onboarding.${client?.id || 'demo'}`;
  const [statusMap, setStatusMap] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { contract: 'todo', list: 'todo', script: 'todo', calendar: 'todo' };
  });

  const updateStatus = (id, next) => {
    setStatusMap(prev => {
      const merged = { ...prev, [id]: next };
      try { localStorage.setItem(storageKey, JSON.stringify(merged)); } catch {}
      return merged;
    });
  };

  const completed = STEPS.filter(s => statusMap[s.id] === 'done').length;
  const total = STEPS.length;
  const allDone = completed === total;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 320px',
      gap: space[5],
      alignItems: 'start',
      maxWidth: 1280,
      margin: '0 auto',
    }}>
      {/* メイン: 4ステップ */}
      <div>
        {/* ヘッダー */}
        <div style={{
          background: color.white,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: `${space[5]}px ${space[6]}px`,
          marginBottom: space[5],
          display: 'flex',
          alignItems: 'center',
          gap: space[5],
          boxShadow: shadow.sm,
        }}>
          <img src={MASCOT_SRC} alt="スピスピ君"
            style={{ width: 80, height: 80, objectFit: 'contain', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: NAVY, marginBottom: 4 }}>
              オンボーディングへようこそ
            </div>
            <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6 }}>
              架電開始までの 4 ステップを、スピスピがサポートします。<br />
              不明点はいつでも右の<strong>スピスピチャット</strong>からお気軽にどうぞ。
            </div>
            {/* 進捗バー */}
            <div style={{ marginTop: space[3] }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: font.size.xs, color: color.textMid, marginBottom: 4,
              }}>
                <span>進捗</span>
                <span style={{ fontWeight: font.weight.semibold }}>{completed} / {total} ステップ</span>
              </div>
              <div style={{
                height: 6, background: color.borderLight, borderRadius: radius.pill, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(completed / total) * 100}%`,
                  height: '100%',
                  background: allDone ? color.success : NAVY,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* 4ステップカード */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {STEPS.map(step => {
            const st = STATUS[statusMap[step.id]] || STATUS.todo;
            return (
              <div key={step.id} style={{
                background: color.white,
                border: `1px solid ${color.border}`,
                borderLeft: `4px solid ${statusMap[step.id] === 'done' ? color.success : statusMap[step.id] === 'doing' ? color.gold : color.border}`,
                borderRadius: radius.lg,
                padding: `${space[5]}px ${space[6]}px`,
                boxShadow: shadow.sm,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[4] }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[2] }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: '50%',
                        background: NAVY, color: color.white,
                        fontSize: font.size.xs, fontWeight: font.weight.bold,
                      }}>{step.number}</span>
                      <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.textDark }}>
                        {step.title}
                      </span>
                      <span style={{
                        marginLeft: space[1],
                        padding: '2px 10px', borderRadius: radius.pill,
                        background: st.bg, color: st.fg,
                        border: `1px solid ${st.border}`,
                        fontSize: 10, fontWeight: font.weight.semibold,
                        letterSpacing: font.letterSpacing.wide,
                      }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6, marginBottom: space[2] }}>
                      {step.summary}
                    </div>
                    <ul style={{
                      margin: 0, paddingLeft: space[5],
                      fontSize: font.size.xs, color: color.textLight, lineHeight: 1.7,
                    }}>
                      {step.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                </div>
                <div style={{
                  marginTop: space[3], paddingTop: space[3],
                  borderTop: `1px dashed ${color.borderLight}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
                }}>
                  <div style={{ fontSize: font.size.xs, color: color.textLight }}>
                    {statusMap[step.id] === 'done' ? '完了済み' :
                     statusMap[step.id] === 'doing' ? '進行中です' :
                     '準備が整ったらこちらから進めてください'}
                  </div>
                  <div style={{ display: 'flex', gap: space[2] }}>
                    {statusMap[step.id] !== 'done' && (
                      <Button
                        variant={statusMap[step.id] === 'doing' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          // スケルトン: 詳細画面は未実装。状態だけ進める
                          if (statusMap[step.id] === 'todo') updateStatus(step.id, 'doing');
                          else updateStatus(step.id, 'done');
                        }}
                      >
                        {statusMap[step.id] === 'todo' ? step.cta : '完了にする'}
                      </Button>
                    )}
                    {statusMap[step.id] === 'done' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus(step.id, 'doing')}
                      >やり直す</Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {allDone && (
          <div style={{
            marginTop: space[5], padding: `${space[5]}px ${space[6]}px`,
            background: alpha(color.success, 0.08),
            border: `1px solid ${alpha(color.success, 0.3)}`,
            borderRadius: radius.lg,
            display: 'flex', alignItems: 'center', gap: space[4],
          }}>
            <img src={MASCOT_SRC} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.success, marginBottom: 4 }}>
                オンボーディング完了！
              </div>
              <div style={{ fontSize: font.size.sm, color: color.textMid }}>
                ありがとうございます。順次架電を開始しますので、進捗は「アポ・面談」タブをご確認ください。
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右サイド: スピスピチャット (UI のみ・AI 未接続) */}
      <SpiChatPanel />
    </div>
  );
}

// スピスピ君チャットパネル (スケルトン: AI 接続は次フェーズ)
function SpiChatPanel() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'spi',
      body: 'こんにちは！スピスピです。オンボーディングの 4 ステップを順番にご案内します。\nわからないことがあればお気軽にお尋ねください。',
    },
  ]);

  const send = () => {
    const v = input.trim();
    if (!v) return;
    setMessages(prev => [
      ...prev,
      { role: 'user', body: v },
      { role: 'spi', body: '(回答機能は現在準備中です。お時間をいただきますがしばらくお待ちください。)' },
    ]);
    setInput('');
  };

  return (
    <aside style={{
      position: 'sticky', top: space[5],
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - 120px)',
    }}>
      {/* ヘッダー */}
      <div style={{
        background: `linear-gradient(135deg, ${color.navy} 0%, ${color.navyDeep || '#081636'} 100%)`,
        color: color.white,
        padding: `${space[3]}px ${space[4]}px`,
        display: 'flex', alignItems: 'center', gap: space[2],
      }}>
        <img src={MASCOT_SRC} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
        <div>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, letterSpacing: font.letterSpacing.wide }}>
            スピスピ
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
            オンボーディング アシスタント
          </div>
        </div>
      </div>

      {/* メッセージ */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: space[3],
        display: 'flex', flexDirection: 'column', gap: space[2],
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: `${space[2]}px ${space[3]}px`,
              borderRadius: radius.lg,
              background: m.role === 'user' ? color.navy : alpha(color.navyLight || color.navy, 0.06),
              color: m.role === 'user' ? color.white : color.textDark,
              fontSize: font.size.xs,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              border: m.role === 'spi' ? `1px solid ${color.borderLight}` : 'none',
            }}>{m.body}</div>
          </div>
        ))}
      </div>

      {/* 入力 */}
      <div style={{
        borderTop: `1px solid ${color.border}`,
        padding: space[2],
        display: 'flex', gap: space[2], alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={2}
          placeholder="気軽に質問してください..."
          style={{
            flex: 1, padding: `${space[2]}px ${space[2]}px`,
            border: `1px solid ${color.border}`, borderRadius: radius.md,
            fontSize: font.size.xs, fontFamily: font.family.sans,
            resize: 'none', outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          style={{
            padding: `${space[2]}px ${space[3]}px`,
            background: color.navy, color: color.white,
            border: 'none', borderRadius: radius.md,
            fontSize: font.size.xs, fontWeight: font.weight.semibold,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            opacity: input.trim() ? 1 : 0.4,
            fontFamily: font.family.sans,
            whiteSpace: 'nowrap',
          }}
        >送信</button>
      </div>
    </aside>
  );
}
