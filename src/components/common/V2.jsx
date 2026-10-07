import React from 'react';
import '../../styles/v2.css';

// 新しい見た目（ルール v2）の引き出し・小窓・見出し・タブ（2026-10-08）。見た目は styles/v2.css
// 旧い画面の紺の帯の見出しをこれに置き換えて、各画面の押した後の見た目をそろえる。

/** 見出し：小さな肩書き・題名（金の短い線）・補足・右の操作・閉じる */
export function V2Head({ eyebrow, title, sub, icon, right, onClose, closeDisabled, as: Tag = 'h2' }) {
  return (
    <div className="v2-head">
      {icon && <span className="v2-ic">{icon}</span>}
      <div className="v2-tt">
        {eyebrow && <div className="v2-eyebrow">{eyebrow}</div>}
        <Tag>{title}</Tag>
        {sub && <div className="v2-sub">{sub}</div>}
      </div>
      {(right || onClose) && (
        <div className="v2-right">
          {right}
          {onClose && <button type="button" className="v2-x" aria-label="閉じる" disabled={closeDisabled} onClick={onClose}>×</button>}
        </div>
      )}
    </div>
  );
}

/** タブ（下線は金）。tabs: [{ key, label, count }] */
export function V2Tabs({ tabs, value, onChange, right }) {
  return (
    <div className="v2-tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={`v2-tab${value === t.key ? ' on' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <small>{t.count}</small>}
        </button>
      ))}
      {right && <span className="v2-tabs-r">{right}</span>}
    </div>
  );
}

/** 右から出る引き出し。中身は V2Head・V2Tabs・<div className="v2-body"> を自由に並べる */
export function V2Drawer({ width = 760, onClose, closeDisabled, children, ariaLabel, dialogRef, onKeyDown, zIndex }) {
  return (
    <div className="v2 v2-veil" style={zIndex ? { zIndex } : undefined} onClick={() => !closeDisabled && onClose?.()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1} className="v2-drawer" style={{ maxWidth: width }}
        onClick={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  );
}

/** 小窓 */
export function V2Modal({ width = 640, onClose, closeDisabled, children, ariaLabel, zIndex }) {
  return (
    <div className="v2 v2-modal-veil" style={zIndex ? { zIndex } : undefined} onClick={() => !closeDisabled && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={ariaLabel} className="v2-modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
