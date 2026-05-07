import { C } from '../../../constants/colors';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

export default function RewardDetailModal({ rewardId, rewardMap, onClose }) {
  if (!rewardId || !rewardMap[rewardId]) return null;
  const rm = rewardMap[rewardId];

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)', zIndex: 20002,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
          width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '12px 24px', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 15 }}>
          報酬体系 {rewardId}: {rm.name}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: 400 }}>
            {rm.timing} ・ {rm.basis} ・ {rm.tax}
          </div>
        </div>
        <div style={{ padding: '12px 18px' }}>
          {rm.tiers.map((t, ti) => (
            <div
              key={ti}
              style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 16px', fontSize: 12,
                background: ti % 2 === 0 ? '#fff' : GRAY_50,
                borderBottom: '1px solid ' + GRAY_200,
                verticalAlign: 'middle',
              }}
            >
              <span style={{ color: C.textDark }}>{t.memo}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
                ¥{Number(t.price).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 18px', borderTop: '1px solid ' + GRAY_200, textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 4, border: 'none', background: NAVY,
              cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
