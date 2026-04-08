import { useState, useEffect, useMemo } from 'react';

export default function TsrIndustryModal({ onClose }) {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    import('../constants/tsrIndustry.json').then(m => setData(m.default));
  }, []);

  const toggle = (code) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.map(maj => {
      const mids = maj.mids.map(mid => {
        const details = mid.details.filter(d => d.name.toLowerCase().includes(q) || d.code.includes(q));
        if (details.length > 0 || mid.name.toLowerCase().includes(q)) return { ...mid, details: details.length > 0 ? details : mid.details };
        return null;
      }).filter(Boolean);
      if (mids.length > 0 || maj.name.toLowerCase().includes(q)) return { ...maj, mids: mids.length > 0 ? mids : maj.mids };
      return null;
    }).filter(Boolean);
  }, [data, search]);

  // 検索時は自動展開
  useEffect(() => {
    if (search && filtered.length > 0 && filtered.length <= 10) {
      setExpanded(new Set(filtered.map(m => m.code)));
    }
  }, [search, filtered]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 4, width: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        {/* ヘッダー */}
        <div style={{ padding: '12px 24px', background: '#0D2247', borderRadius: '4px 4px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>TSR業種分類一覧</div>
            <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 2 }}>東京商工リサーチ　大分類20種 / 中分類99種 / 細分類1,217種</div>
          </div>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
        {/* 検索 */}
        <div style={{ padding: '10px 24px', borderBottom: '1px solid #E5E7EB' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="業種名・コードで検索..."
            style={{ width: '100%', padding: '6px 12px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: "'Noto Sans JP'", outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {!data && <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>読み込み中...</div>}
          {data && filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>該当する業種がありません</div>}
          {filtered.map(maj => (
            <div key={maj.code}>
              <div onClick={() => toggle(maj.code)}
                style={{ padding: '8px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: expanded.has(maj.code) ? '#F0F4FF' : 'transparent' }}
                onMouseEnter={e => { if (!expanded.has(maj.code)) e.currentTarget.style.background = '#F8F9FA'; }}
                onMouseLeave={e => { if (!expanded.has(maj.code)) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: 10, color: '#9CA3AF', width: 12 }}>{expanded.has(maj.code) ? '▼' : '▶'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0D2247', fontFamily: "'JetBrains Mono'", width: 20 }}>{maj.code}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>{maj.name}</span>
                <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{maj.mids.length}中分類</span>
              </div>
              {expanded.has(maj.code) && maj.mids.map(mid => (
                <div key={mid.code}>
                  <div style={{ padding: '5px 24px 5px 48px', display: 'flex', alignItems: 'center', gap: 8, borderLeft: '2px solid #E5E7EB', marginLeft: 30 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', fontFamily: "'JetBrains Mono'", width: 24 }}>{mid.code}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{mid.name}</span>
                  </div>
                  {mid.details.map(d => (
                    <div key={d.code} style={{ padding: '3px 24px 3px 80px', display: 'flex', alignItems: 'center', gap: 8, borderLeft: '2px solid #F3F4F6', marginLeft: 30 }}>
                      <span style={{ fontSize: 10, color: '#9CA3AF', fontFamily: "'JetBrains Mono'", width: 36 }}>{d.code}</span>
                      <span style={{ fontSize: 11, color: '#4B5563' }}>{d.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
