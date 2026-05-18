import React from 'react';
import { color, space, font, radius, alpha } from '../../../../../constants/design';

// ============================================================
// 進捗ステップバー（個人ページヘッダー）
// 仕様書 §7.1 中央：個人ページ
//   - 第0〜第8回の9ノード + 卒業ノード10番目を別表示
//   - 進捗率は N/9
// ============================================================
const NODES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export default function ProgressStepper({ sessions = [], status }) {
  const stateBy = {};
  sessions.forEach((s) => { stateBy[s.session_no] = s; });
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const pct = Math.round((completedCount / 9) * 1000) / 10;

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
        }}>{completedCount}/9・{pct.toFixed(1)}%</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {NODES.map((no, idx) => {
          const sess = stateBy[no];
          const done = sess?.status === 'completed';
          const next = sess?.status === 'next_up';
          return (
            <React.Fragment key={no}>
              <Node label={no === 0 ? 'K' : String(no)} title={no === 0 ? 'キックオフ' : `第${no}回`}
                state={done ? 'done' : next ? 'next' : 'todo'} />
              {idx < NODES.length - 1 && <Bar done={done && stateBy[no + 1]?.status === 'completed'} />}
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
