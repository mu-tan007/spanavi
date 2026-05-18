import React from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Badge } from '../../../../ui';

// ============================================================
// 5. 強み・価値観タブ
// 仕様書 §7.1 中央タブ#5
// ============================================================
export default function TabStrengths({ detail }) {
  const s = detail?.strength;
  if (!s || !s.completed_at) {
    return (
      <Card padding="md" title="強み診断" description="第2回事前課題のタイミングで受講生が実施します。">
        <div style={{ color: color.textLight, fontSize: font.size.sm }}>
          まだ診断が完了していません
        </div>
      </Card>
    );
  }
  const strengths = Array.isArray(s.strengths) ? s.strengths : [];
  const scores = s.scores && typeof s.scores === 'object' ? s.scores : null;
  const maxScore = scores ? Math.max(...Object.values(scores).map((v) => Number(v) || 0)) : 0;

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md" title="抽出された強み">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
          {strengths.length === 0 ? (
            <span style={{ color: color.textLight, fontSize: font.size.sm }}>—</span>
          ) : strengths.map((label, i) => (
            <Badge key={i} variant="primary" size="md" solid>{label}</Badge>
          ))}
        </div>
      </Card>

      <Card padding="md" title="価値観">
        <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
          {s.values_text || '—'}
        </div>
      </Card>

      <Card padding="md" title="スコアバランス" description={`完了日：${new Date(s.completed_at).toLocaleDateString()}`}>
        {scores ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {Object.entries(scores).map(([label, val]) => {
              const ratio = maxScore > 0 ? (Number(val) / maxScore) * 100 : 0;
              return (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', alignItems: 'center', gap: space[2] }}>
                  <span style={{ fontSize: font.size.sm, color: color.textMid }}>{label}</span>
                  <div style={{ height: 8, background: color.gray100, borderRadius: radius.pill, overflow: 'hidden' }}>
                    <div style={{ width: `${ratio}%`, height: '100%', background: color.navyLight }}/>
                  </div>
                  <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm, color: color.textDark, textAlign: 'right' }}>
                    {val}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>—</div>
        )}
      </Card>
    </div>
  );
}
