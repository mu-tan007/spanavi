import { useState, useRef, useCallback } from 'react';

/**
 * 架電ページを最小化したときの小窓（2026-10-09 むー様・見本 call.html の minicall）
 * 右下に「架電中（最小化）」・会社名・何社目。「終了」で架電を終え、「元に戻す」で架電ページへ戻る。つかんで動かせる
 */
export default function PiPWidget({ title, subtitle, onMaximize, onClose }) {
  const [pos, setPos] = useState(null); // null = 右下
  const widgetRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const onMouseMove = (ev) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - rect.width, ev.clientX - offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - rect.height, ev.clientY - offsetY)),
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const posStyle = pos ? { top: pos.y, left: pos.x } : { bottom: 20, right: 20 };
  const btn = { height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid #E3E6EB', background: '#fff', color: '#032D60', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div ref={widgetRef} onMouseDown={onMouseDown}
      style={{ position: 'fixed', ...posStyle, zIndex: 10050, width: 260, background: '#fff', border: '1px solid #E3E6EB', borderRadius: 12,
        boxShadow: '0 12px 32px rgba(1,18,38,.18)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
        fontFamily: '"Noto Sans JP", sans-serif', cursor: 'grab', userSelect: 'none', animation: 'pipIn .25s both' }}>
      <style>{'@keyframes pipIn{from{opacity:0;transform:translateY(6px)}}'}</style>
      <div style={{ fontSize: 11, color: '#8692A0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2E844A', boxShadow: '0 0 0 3px rgba(46,132,74,.18)' }} />架電中（最小化）
      </div>
      <b style={{ fontSize: 14, color: '#032D60', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>{title}</b>
      {subtitle && <span style={{ fontSize: 12, color: '#4B5868' }}>{subtitle}</span>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
        <button style={btn} onClick={onClose}>終了</button>
        <button style={{ ...btn, background: '#032D60', borderColor: '#032D60', color: '#fff' }} onClick={onMaximize}>元に戻す</button>
      </div>
    </div>
  );
}
