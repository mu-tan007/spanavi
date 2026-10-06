import React from 'react';
import './PageTitle.css';

// 新しいデザイン（2026-10 ルール v2）のページの題名。どのページもこれを使い、位置をそろえる。
// - 上の帯から 16px 下（スマホは 10px）
// - 題名 24px／700／紺、補足 12px、下に 16px
// - right: 右側の切り替え・ボタン
export default function PageTitle({ title, sub, right }) {
  return (
    <div className="sp-pt">
      <div className="sp-pt__l">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="sp-pt__r">{right}</div>}
    </div>
  );
}
