import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../constants/design';
import { Button, Input } from './ui';

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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: alpha('#000000', 0.55), zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: color.white, borderRadius: radius.md, width: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
        {/* ヘッダー */}
        <div style={{ padding: `${space[3]}px ${space[6]}px`, background: color.navy, borderRadius: `${radius.md}px ${radius.md}px 0 0`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: font.size.md + 1, fontWeight: font.weight.semibold, color: color.white }}>TSR業種分類一覧</div>
            <div style={{ fontSize: font.size.xs - 1, color: '#CBD5E1', marginTop: 2 }}>東京商工リサーチ　大分類20種 / 中分類99種 / 細分類1,217種</div>
          </div>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: radius.lg, background: alpha(color.white, 0.15), border: 'none', cursor: 'pointer', color: color.white, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
        {/* 検索 */}
        <div style={{ padding: `${space[2.5]}px ${space[6]}px`, borderBottom: `1px solid ${color.border}` }}>
          <Input
            size="sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="業種名・コードで検索..."
          />
        </div>
        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: `${space[2]}px 0` }}>
          {!data && <div style={{ padding: space[6], textAlign: 'center', color: color.gray400, fontSize: font.size.sm }}>読み込み中...</div>}
          {data && filtered.length === 0 && <div style={{ padding: space[6], textAlign: 'center', color: color.gray400, fontSize: font.size.sm }}>該当する業種がありません</div>}
          {filtered.map(maj => (
            <div key={maj.code}>
              <div onClick={() => toggle(maj.code)}
                style={{ padding: `${space[2]}px ${space[6]}px`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: space[2], background: expanded.has(maj.code) ? '#F0F4FF' : 'transparent' }}
                onMouseEnter={e => { if (!expanded.has(maj.code)) e.currentTarget.style.background = color.gray50; }}
                onMouseLeave={e => { if (!expanded.has(maj.code)) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: font.size.xs - 1, color: color.gray400, width: 12 }}>{expanded.has(maj.code) ? '▼' : '▶'}</span>
                <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, fontFamily: font.family.mono, width: 20 }}>{maj.code}</span>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{maj.name}</span>
                <span style={{ fontSize: font.size.xs - 1, color: color.gray400, marginLeft: 'auto' }}>{maj.mids.length}中分類</span>
              </div>
              {expanded.has(maj.code) && maj.mids.map(mid => (
                <div key={mid.code}>
                  <div style={{ padding: `5px ${space[6]}px 5px 48px`, display: 'flex', alignItems: 'center', gap: space[2], borderLeft: `2px solid ${color.border}`, marginLeft: 30 }}>
                    <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.gray500, fontFamily: font.family.mono, width: 24 }}>{mid.code}</span>
                    <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.gray700 }}>{mid.name}</span>
                  </div>
                  {mid.details.map(d => (
                    <div key={d.code} style={{ padding: `3px ${space[6]}px 3px 80px`, display: 'flex', alignItems: 'center', gap: space[2], borderLeft: `2px solid ${color.gray100}`, marginLeft: 30 }}>
                      <span style={{ fontSize: font.size.xs - 1, color: color.gray400, fontFamily: font.family.mono, width: 36 }}>{d.code}</span>
                      <span style={{ fontSize: font.size.xs, color: color.gray600 }}>{d.name}</span>
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
