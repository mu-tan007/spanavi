import { useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import OverdueRecallsPanel from './OverdueRecallsPanel';
import UnconnectedFollowupPanel from './UnconnectedFollowupPanel';
import NewProspectsPanel from './NewProspectsPanel';

// スマートキュー本体：3サブタブ
//   A 期限超過再コール（リスト跨ぎ・全件）
//   B 未接続フォロー（キーマン不在/不通/受付ブロックを業種×時間帯マッチでスコア順）
//   C 新規開拓（未架電を業種×時間帯マッチでスコア順）
//   D 再アプローチ（キーマン断り KEEP） は AI バッチ後に追加

const SUBTABS = [
  { value: 'overdue',     label: 'A. 期限超過再コール',     hint: 'リスト跨ぎ・全件' },
  { value: 'unconnected', label: 'B. 未接続フォロー',       hint: '不在/不通/受付ブロック × 時間帯マッチ' },
  { value: 'new',         label: 'C. 新規開拓',             hint: '未架電 × 業種×時間帯マッチ' },
];

export default function SmartQueueTab({ setCallFlowScreen }) {
  const [subTab, setSubTab] = useState('overdue');

  return (
    <div>
      <div style={{
        display: 'flex', gap: space[1], marginBottom: space[3],
        borderBottom: `1px solid ${color.border}`,
      }}>
        {SUBTABS.map(t => {
          const active = subTab === t.value;
          return (
            <button key={t.value} onClick={() => setSubTab(t.value)} style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? color.navy : 'transparent'}`,
              fontSize: font.size.sm,
              fontWeight: active ? font.weight.bold : font.weight.semibold,
              color: active ? color.navy : color.textMid, cursor: 'pointer',
              fontFamily: font.family.sans, transition: 'all 0.12s', marginBottom: -1,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = color.textMid; }}
            >
              <span>{t.label}</span>
              <span style={{
                fontSize: 9.5, color: color.textLight, fontWeight: font.weight.medium,
                letterSpacing: 0.2,
              }}>{t.hint}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'overdue'     && <OverdueRecallsPanel     setCallFlowScreen={setCallFlowScreen} />}
      {subTab === 'unconnected' && <UnconnectedFollowupPanel setCallFlowScreen={setCallFlowScreen} />}
      {subTab === 'new'         && <NewProspectsPanel       setCallFlowScreen={setCallFlowScreen} />}
    </div>
  );
}
