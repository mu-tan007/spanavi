import React from 'react';
import { color, space, font, radius, alpha } from '../../../../../constants/design';

// ============================================================
// 進捗ステップバー（個人ページヘッダー）
// 仕様書 §7.1 中央：個人ページ
//   - キックオフ(K) + 各回ノード + 卒業ノード
//   - 強化コース=第1〜8回（9ノード）、応用コース=各回(1)(2)で最大17ノード
//   - 進捗率は 完了数 / 全セッション数（コースに応じて自動で分母が変わる）
// ============================================================
export default function ProgressStepper({ sessions = [], status }) {
  // 順序(session_no, part)で並べる。応用は (0)→(1,1)→(1,2)→(2,1)… の順。
  const ordered = [...sessions].sort(
    (a, b) => (a.session_no - b.session_no) || ((a.part || 1) - (b.part || 1)));
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const total = sessions.length || 1;
  const pct = Math.round((completedCount / total) * 1000) / 10;

  const nodes = ordered.map((s) => {
    const part = s.part || 1;
    const label = s.session_no === 0 ? 'K' : (part === 2 ? `${s.session_no}'` : String(s.session_no));
    const title = s.session_no === 0 ? 'キックオフ' : `第${s.session_no}回${part === 2 ? '(2)' : ''}`;
    return { key: `${s.session_no}-${part}`, label, title, status: s.status };
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[2] }}>
        <div style={{
          fontSize: font.size.xs, color: color.textMid,
          letterSpacing: font.letterSpacing.wide, fontWeight: font.weight.semibold,
        }}>進捗</div>
        <div style={{
          fontFamily: font.family.mono, fontSize: font.size.sm,
          color: color.textDark, fontWeight: font.weight.bold,
        }}>{completedCount}/{sessions.length}・{pct.toFixed(1)}%</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: space[2] }}>
        {nodes.map((n, idx) => {
          const done = n.status === 'completed';
          const next = n.status === 'next_up';
          const nextDone = nodes[idx + 1]?.status === 'completed';
          return (
            <React.Fragment key={n.key}>
              <Node label={n.label} title={n.title}
                state={done ? 'done' : next ? 'next' : 'todo'} />
              {idx < nodes.length - 1 && <Bar done={done && nextDone} />}
            </React.Fragment>
          );
        })}
        <div style={{ width: space[3] }} />
        <Node label="卒" title="卒業" state={status === 'graduated' ? 'done' : 'todo'} accent />
      </div>
    </div>
  );
}

function Node({ label, title, state, accent }) {
  const palette = {
    done: { bg: color.success, fg: color.white, border: color.success },
    next: { bg: color.white, fg: color.navy, border: color.navy },
    todo: { bg: color.white, fg: color.textLight, border: color.border },
  };
  const p = palette[state] || palette.todo;
  return (
    <div title={title} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 28, height: 28, borderRadius: radius.pill,
        background: accent && state === 'done' ? color.gold : p.bg,
        border: `2px solid ${accent && state === 'done' ? color.gold : p.border}`,
        color: p.fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: font.size.sm, fontWeight: font.weight.bold,
        fontFamily: font.family.mono,
        boxShadow: state === 'next' ? `0 0 0 3px ${alpha(color.navyLight, 0.18)}` : 'none',
      }}>{label}</div>
      <div style={{ fontSize: font.size.xs, color: color.textLight, letterSpacing: font.letterSpacing.wide }}>
        {title}
      </div>
    </div>
  );
}

function Bar({ done }) {
  return (
    <div style={{
      flex: 1, height: 3,
      background: done ? color.success : color.border,
      margin: '0 6px', marginTop: -16, borderRadius: radius.sm,
    }}/>
  );
}
