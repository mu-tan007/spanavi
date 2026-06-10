import { useState } from 'react';
import { color, font } from '../../constants/design';
import { Card } from '../ui';
import PageHeader from '../common/PageHeader';
import TrainingRoleplaySection from './TrainingRoleplaySection';

// 「代表とのロープレ予約」「予約済み一覧」はもう使わないため削除済み。
// ロープレ履歴（録音アップロード・AI分析）だけを残している。
const NAVY = '#0D2247';

export default function RoleplayView({ currentUser, userId, members = [], isAdmin = false }) {
  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="ロープレ"
        description="ロープレ履歴"
      />

      {/* ロープレ履歴（録音アップロード・AI分析） */}
      <RoleplayHistorySection currentUser={currentUser} userId={userId} members={members} isAdmin={isAdmin} />
    </div>
  );
}

// ロープレ履歴の折り畳みラッパー
function RoleplayHistorySection({ currentUser, userId, members, isAdmin }) {
  const [open, setOpen] = useState(true);
  return (
    <Card padding="none" variant="default" style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY, textAlign: 'left',
        }}
      >
        <span>ロープレ履歴</span>
        <span style={{ fontSize: font.size.xs, color: color.gray400 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px 20px', borderTop: `1px solid ${color.gray100}` }}>
          <TrainingRoleplaySection
            currentUser={currentUser}
            userId={userId}
            members={members}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </Card>
  );
}
