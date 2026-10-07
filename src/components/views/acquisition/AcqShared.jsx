import React, { useEffect } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button } from '../../ui';
import { PROGRESS_STAGES, STAGE_BY_VALUE } from './acqConstants';

// 買収タブで使う小さな部品（モーダル・項目の並び・複数行入力）

export function AcqModal({ title, onClose, children, footer, width = 640 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
      }}
    >
      <div style={{
        width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl, overflow: 'hidden',
      }}>
        <div className="v2-mhead" style={{
          background: color.navy, color: color.white, padding: `${space[3]}px ${space[4]}px`,
          fontFamily: font.family.sans, fontSize: font.size.md, fontWeight: font.weight.semibold,
        }}>{title}</div>
        <div style={{ padding: space[4], overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: space[2],
            padding: `${space[3]}px ${space[4]}px`, borderTop: `1px solid ${color.borderLight}`,
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

export function ModalButtons({ onCancel, onSave, saving, saveLabel = '保存', danger }) {
  return (
    <>
      {danger}
      <div style={{ flex: 1 }} />
      <Button variant="outline" onClick={onCancel}>キャンセル</Button>
      <Button variant="primary" onClick={onSave} loading={saving}>{saveLabel}</Button>
    </>
  );
}

export function FormGrid({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: space[3] }}>
      {children}
    </div>
  );
}

export function TextArea({ label, value, onChange, rows = 4, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space[1], gridColumn: '1 / -1' }}>
      {label && <span style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.medium }}>{label}</span>}
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box', padding: `${space[2]}px ${space[3]}px`,
          border: `1px solid ${color.border}`, borderRadius: radius.md, resize: 'vertical',
          fontFamily: font.family.sans, fontSize: font.size.md, color: color.textDark, lineHeight: 1.6,
        }}
      />
    </label>
  );
}

// 詳細画面の「項目名：値」の並び
export function InfoRows({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: space[2], columnGap: space[3] }}>
      {rows.filter(Boolean).map(([k, v]) => (
        <React.Fragment key={k}>
          <div style={{ fontSize: font.size.sm, color: color.textLight }}>{k}</div>
          <div style={{ fontSize: font.size.sm, color: color.textDark, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v ?? '—'}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

// 上段の大きな数字
export function KeyFigure({ label, value, sub }) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 140, padding: `${space[3]}px ${space[4]}px`,
      background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[1] }}>{label}</div>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.navy, fontFamily: font.family.mono }}>{value}</div>
      {sub && <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[0.5] }}>{sub}</div>}
    </div>
  );
}

export function SubTabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: space[1], borderBottom: `1px solid ${color.border}`, marginBottom: space[3] }}>
      {tabs.map(t => {
        const active = t.value === value;
        return (
          <Button
            key={t.value}
            variant="ghost"
            size="sm"
            onClick={() => onChange(t.value)}
            style={{
              borderRadius: 0, marginBottom: -1,
              borderBottom: `2px solid ${active ? color.gold : 'transparent'}`,
              color: active ? color.navy : color.textMid,
              fontWeight: active ? font.weight.semibold : font.weight.normal,
            }}
          >{t.label}{t.count != null ? `（${t.count}）` : ''}</Button>
        );
      })}
    </div>
  );
}

export function LinkText({ children, onClick }) {
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
      style={{ color: color.info, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >{children}</span>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div style={{
      marginBottom: space[3], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
      background: color.dangerSoft, color: color.danger, fontSize: font.size.sm,
    }}>{typeof error === 'string' ? error : (error.message || '保存に失敗しました')}</div>
  );
}

// 消す・進捗を動かす操作の前に、画面中央に1枚挟む確認
export function ConfirmDialog({ title, sub, okLabel = '実行', danger, busy, onOk, onCancel }) {
  return (
    <AcqModal
      title={title}
      onClose={onCancel}
      width={460}
      footer={(
        <>
          <Button variant="outline" onClick={onCancel}>やめる</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onOk} loading={busy}>{okLabel}</Button>
        </>
      )}
    >
      {sub && <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: 1.6 }}>{sub}</div>}
    </AcqModal>
  );
}

// 進み具合の点（受領〜CLの8段）。終了した案件は止まった段まで塗り、終了の印を右に付ける
export function ProgressDots({ progressStage, closedStage, compact }) {
  const reached = STAGE_BY_VALUE[progressStage]?.rank || 0;
  const closed = !!closedStage;
  const size = compact ? 7 : 9;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 2 : 3 }}>
      {PROGRESS_STAGES.map(s => {
        const on = s.rank <= reached;
        const here = s.rank === reached;
        return (
          <span key={s.value} title={s.label} style={{
            width: size, height: size, borderRadius: '50%',
            background: on ? (closed ? color.gray400 : (here ? color.gold : color.navy)) : color.white,
            border: `1px solid ${on ? (closed ? color.gray400 : color.navy) : color.border}`,
          }} />
        );
      })}
    </span>
  );
}
