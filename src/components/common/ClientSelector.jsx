import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../../constants/colors';

export default function ClientSelector({ clients, selectedClientId, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => (c.name || '').toLowerCase().includes(q));
  }, [clients, query]);

  useEffect(() => {
    const onClick = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (id) => {
    onSelect(id);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, matches.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight === 0) pick(null);
      else {
        const m = matches[highlight - 1];
        if (m) pick(m.id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const placeholder = selectedClient
    ? `選択中: ${selectedClient.name}`
    : 'クライアント名を入力（例: トリ…）';

  return (
    <div style={{
      padding: '10px 20px',
      background: C.white,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{
        fontSize: 10, color: C.textLight, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        fontFamily: "'Outfit','Noto Sans JP',sans-serif",
      }}>CLIENT</span>

      <div ref={wrapRef} style={{ position: 'relative', flex: '0 1 360px', minWidth: 220 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          border: `1px solid ${C.border}`, borderRadius: 3,
          padding: '4px 8px', background: C.white,
        }}>
          <span style={{ fontSize: 11, color: C.textLight }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 12, fontFamily: "'Noto Sans JP',sans-serif",
              color: C.textDark, background: 'transparent',
            }}
          />
          {selectedClient && (
            <button
              type="button"
              onClick={() => pick(null)}
              title="選択解除"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: C.textLight, fontSize: 14, padding: '0 4px',
              }}
            >×</button>
          )}
        </div>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 3,
            boxShadow: '0 6px 20px rgba(13,34,71,0.08)',
            maxHeight: 280, overflowY: 'auto', zIndex: 50,
          }}>
            <Item
              label="All（すべて表示）"
              active={selectedClientId === null}
              highlighted={highlight === 0}
              onHover={() => setHighlight(0)}
              onClick={() => pick(null)}
            />
            {matches.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>
                該当なし
              </div>
            )}
            {matches.map((c, i) => (
              <Item
                key={c.id}
                label={c.name}
                active={selectedClientId === c.id}
                highlighted={highlight === i + 1}
                onHover={() => setHighlight(i + 1)}
                onClick={() => pick(c.id)}
                query={query}
              />
            ))}
          </div>
        )}
      </div>

      {clients.length === 0 && (
        <span style={{ fontSize: 11, color: C.textLight, fontStyle: 'italic' }}>
          対象クライアントがありません
        </span>
      )}
    </div>
  );
}

function Item({ label, active, highlighted, onHover, onClick, query }) {
  const bg = highlighted ? C.offWhite : (active ? '#F5F7FB' : C.white);
  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      style={{
        padding: '8px 12px', fontSize: 12, cursor: 'pointer',
        background: bg,
        color: active ? C.navy : C.textDark,
        fontWeight: active ? 600 : 400,
        fontFamily: "'Noto Sans JP',sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <span>{query ? highlightMatch(label, query) : label}</span>
      {active && <span style={{ fontSize: 11, color: C.gold }}>●</span>}
    </div>
  );
}

function highlightMatch(text, query) {
  if (!text) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: '#FEF3C7', fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
