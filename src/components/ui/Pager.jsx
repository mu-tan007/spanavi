import { useEffect } from 'react';
import Button from './Button';
import { color, font, radius } from '../../constants/design';

// =====================================================================
// ページ送り（Phalanx の Pager にならう）
//   下の中央に「← 前へ」「[ページ番号] / 全ページ（a〜b件目 / N件）」「次へ →」。
//   ページ番号は打って Enter で飛べる。範囲外は端に寄せる。全角数字も読む。
//   Ctrl + ← → でも送れる（入力欄に文字を打っている間は効かない）。
// =====================================================================

const fmt = (n) => Number(n).toLocaleString('ja-JP');

export default function Pager({ page, pageSize, total, unit = '件', onPage, disabled = false, keyboard = true }) {
  const known = total != null && Number.isFinite(Number(total));
  const pages = known ? Math.max(1, Math.ceil(Number(total) / pageSize)) : null;
  const atStart = page <= 0;
  const atEnd = pages != null ? page >= pages - 1 : true;
  const prev = () => { if (!disabled && !atStart) onPage(page - 1); };
  const next = () => { if (!disabled && !atEnd) onPage(page + 1); };

  useEffect(() => {
    if (!keyboard || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const empty = known && Number(total) <= 0;
  return (
    <nav aria-label="ページ送り" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, width: '100%', flexWrap: 'wrap' }}>
      <Button size="sm" variant="ghost" disabled={disabled || atStart} onClick={prev} title="前のページ（Ctrl + ←）">← 前へ</Button>
      <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: color.textMid, whiteSpace: 'nowrap' }}>
        {empty ? `0${unit}` : <>
          {pages != null ? (
            <>
              <input key={page} disabled={disabled} defaultValue={page + 1} inputMode="numeric"
                aria-label={`ページ番号（1〜${fmt(pages)}）`}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const raw = String(e.currentTarget.value).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9-]/g, '');
                  const n0 = parseInt(raw, 10);
                  if (!Number.isFinite(n0)) { e.currentTarget.value = page + 1; return; }
                  const n = Math.min(pages, Math.max(1, n0));
                  e.currentTarget.value = n;
                  if (n - 1 !== page) onPage(n - 1);
                }}
                onBlur={(e) => { e.currentTarget.value = page + 1; }}
                style={{
                  width: 62, padding: '4px 6px', textAlign: 'right', fontSize: 12, fontFamily: font.family.sans,
                  border: `1px solid ${color.border}`, borderRadius: radius.md, outline: 'none', color: color.textDark,
                }} />
              / {fmt(pages)}
            </>
          ) : <span>{fmt(page + 1)}ページ目</span>}
          {known && (
            <span>（{fmt(page * pageSize + 1)}〜{fmt(Math.min((page + 1) * pageSize, Number(total)))}{unit}目 / {fmt(total)}{unit}）</span>
          )}
        </>}
      </span>
      <Button size="sm" variant="ghost" disabled={disabled || atEnd} onClick={next} title="次のページ（Ctrl + →）">次へ →</Button>
    </nav>
  );
}
