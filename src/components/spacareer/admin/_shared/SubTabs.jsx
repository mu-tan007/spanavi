import React from 'react';
import { color, space, font } from '../../../../constants/design';

// スパキャリ運営ダッシュボード共通サブタブバー
// 6 画面のタブ実装を 1 種類に統一する
//
// @prop tabs        [{ key, label, badge?, accent? }]
// @prop activeKey   現在のタブ key
// @prop onChange    (key) => void
// @prop dense       true で padding を縮小（テンプレ等カウントバッジ付きタブ用）
export default function SubTabs({ tabs, activeKey, onChange, dense = false, style }) {
  return (
    <div style={{
      display: 'flex',
      gap: 0,
      borderBottom: `1px solid ${color.border}`,
      marginBottom: space[4],
      overflowX: 'auto',
      ...style,
    }}>
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              padding: dense
                ? `${space[2]}px ${space[3]}px`
                : `${space[2] + 2}px ${space[4]}px`,
              fontSize: font.size.sm,
              fontWeight: font.weight.semibold,
              fontFamily: font.family.sans,
              color: active ? color.navy : color.textMid,
              background: 'transparent',
              border: 'none',
              borderBottom: active
                ? `2px solid ${color.navy}`
                : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[1.5],
              transition: 'color 0.15s ease',
            }}
          >
            <span>{t.label}</span>
            {(t.badge !== undefined && t.badge !== null) && (
              <span style={{
                fontSize: font.size.xs,
                fontWeight: font.weight.bold,
                background: active
                  ? color.navy
                  : (t.accent === 'danger' && Number(t.badge) > 0)
                    ? color.danger
                    : color.gray200,
                color: active
                  ? color.white
                  : (t.accent === 'danger' && Number(t.badge) > 0)
                    ? color.white
                    : color.textMid,
                padding: '1px 8px',
                borderRadius: 999,
                fontFamily: font.family.mono,
                minWidth: 18,
                textAlign: 'center',
              }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
