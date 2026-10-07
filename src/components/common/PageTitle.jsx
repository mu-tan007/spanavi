import React from 'react';
import './PageTitle.css';

// ページの題名（2026-10-07 全ページ共通の形）。PageHeader も同じ見た目で描く。
// - 題名 24px／700／紺＋金の短い線、補足 12px
// - right: 右側の切り替え・ボタン
export default function PageTitle({ title, sub, right, compact = false, children, style }) {
  return (
    <div className={`sp-pt${compact ? ' is-compact' : ''}`} style={style}>
      <div className="sp-pt__l">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
        {children}
      </div>
      {right && <div className="sp-pt__r">{right}</div>}
    </div>
  );
}
