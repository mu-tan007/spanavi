import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../ui';
import { color, space, radius, shadow, font, alpha } from '../../constants/design';

// 「除外」を付けるときに理由の種類を選んでもらう（2026-10-05 むー様指示）。
// company だけが、取り込み時の自動除外で他のリストへ伝わる（auto_exclude_known_excluded）。
export const EXCLUDE_SCOPES = [
  { value: 'company',   key: '1', label: '会社の事情',             desc: '廃業・番号不使用・はっきり断られた など。他のリストでも外れる' },
  { value: 'client',    key: '2', label: 'このクライアントの条件外', desc: '売上・地域・業種など。他のリストには影響しない' },
  { value: 'duplicate', key: '3', label: '同じリスト内の重複',       desc: '同じ会社が2行ある。他のリストには影響しない' },
];

function Picker({ onPick }) {
  useEffect(() => {
    // 架電ページのショートカット（数字キー）に先回りして受け取る
    const onKey = (e) => {
      const hit = EXCLUDE_SCOPES.find(s => s.key === e.key);
      if (hit || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onPick(hit ? hit.value : null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onPick]);

  return (
    <div
      onClick={() => onPick(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: alpha(color.navyDeep, 0.5),
               display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.family.sans }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 420, background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl, overflow: 'hidden' }}
      >
        <div style={{ background: color.navy, color: color.white, padding: `${space[3]}px ${space[4]}px`,
                      fontSize: font.size.md, fontWeight: font.weight.bold }}>
          除外の理由
        </div>
        <div style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {EXCLUDE_SCOPES.map(s => (
            <Button
              key={s.value}
              variant="secondary"
              fullWidth
              onClick={() => onPick(s.value)}
              style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', letterSpacing: 0,
                       padding: `${space[2]}px ${space[3]}px` }}
            >
              <span style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: font.size.md, color: color.textDark }}>
                  <span style={{ fontFamily: font.family.mono, color: color.textLight, marginRight: space[2] }}>{s.key}</span>
                  {s.label}
                </span>
                <span style={{ display: 'block', fontSize: font.size.sm, fontWeight: font.weight.normal, color: color.textMid, marginTop: 2 }}>
                  {s.desc}
                </span>
              </span>
            </Button>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[1] }}>
            <Button variant="outline" size="sm" onClick={() => onPick(null)}>キャンセル（Esc）</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 選ばれた種類（'company' | 'client' | 'duplicate'）を返す。キャンセルなら null。
export function pickExcludeReason() {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(<Picker onPick={done} />);
  });
}
