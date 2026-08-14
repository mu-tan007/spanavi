import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';

/**
 * 行アクション用のドロップダウンメニュー。
 *
 * 通常の position:absolute でメニューを出すと、表のラッパー（overflow: auto/hidden）
 * に切り取られて一部しか見えなくなる。この部品は document.body へ portal で描画し
 * position:fixed で置くため、どんなスクロール領域の中にあっても必ず全体が見える。
 * さらに下端に余裕が無い場合はボタンの上側へ自動で反転する。
 *
 * items: [{ key?, label, onClick, danger?, disabled?, title? }] （falsy 要素は無視）
 */
export default function ActionMenu({
  items = [],
  icon = '✎',
  title = 'メニュー',
  align = 'right',      // メニューの右端をボタンに揃える / 'left' で左端揃え
  disabled = false,
  buttonStyle,
  minWidth = 130,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);   // null の間は測定前（非表示）
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const list = items.filter(Boolean);

  // ボタン位置からメニューの表示位置を決める。
  // 下に入りきらなければ上側へ反転し、それでも入らなければ画面内に収める。
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const GAP = 4;
    const EDGE = 8;
    const b = btnRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let top = b.bottom + GAP;
    if (top + m.height > window.innerHeight - EDGE) {
      const above = b.top - GAP - m.height;
      top = above >= EDGE ? above : Math.max(EDGE, window.innerHeight - EDGE - m.height);
    }
    let left = align === 'left' ? b.left : b.right - m.width;
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - EDGE - m.width));
    setPos({ top, left });
  }, [open, align, list.length]);

  // 外側クリック / ESC で閉じる。
  // position:fixed はスクロールに追従しないので、スクロール・リサイズ時も閉じる。
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDocDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => { if (!open) setPos(null); }, [open]);

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 24, height: 24, padding: 0, fontSize: 13,
          background: open ? alpha(color.navy, 0.07) : 'transparent',
          color: open ? color.navy : color.textMid,
          border: 'none', borderRadius: radius.sm,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          fontFamily: font.family.sans, lineHeight: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          ...buttonStyle,
        }}
        onMouseEnter={e => { if (disabled) return; e.currentTarget.style.background = alpha(color.navy, 0.07); e.currentTarget.style.color = color.navy; }}
        onMouseLeave={e => { if (disabled) return; e.currentTarget.style.background = open ? alpha(color.navy, 0.07) : 'transparent'; e.currentTarget.style.color = open ? color.navy : color.textMid; }}
      >{icon}</button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            top: pos ? pos.top : 0,
            left: pos ? pos.left : 0,
            visibility: pos ? 'visible' : 'hidden',
            minWidth, zIndex: 9500,
            background: color.white, border: `1px solid ${color.border}`,
            borderRadius: radius.md, boxShadow: shadow.lg,
            padding: space[1], display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {list.map((it, i) => (
            <button
              key={it.key || i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              title={it.title}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              style={{
                padding: '6px 10px', fontSize: font.size.xs, fontWeight: font.weight.medium,
                background: 'transparent',
                color: it.danger ? color.danger : color.navy,
                border: 'none', borderRadius: radius.sm,
                cursor: it.disabled ? 'not-allowed' : 'pointer',
                opacity: it.disabled ? 0.5 : 1,
                textAlign: 'left', whiteSpace: 'nowrap', fontFamily: font.family.sans,
              }}
              onMouseEnter={e => { if (it.disabled) return; e.currentTarget.style.background = alpha(it.danger ? color.danger : color.navy, 0.07); }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >{it.label}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
