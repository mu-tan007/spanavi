import React from 'react';
import { C } from '../../constants/colors';
import GoalSettingsPanel from '../admin/GoalSettingsPanel';
import PageHeader from '../common/PageHeader';

// Sourcing の独立ページ「KPI」。閲覧専用。編集はマイページから。
export default function GoalsView({ isAdmin }) {
  return (
    <div style={{ background: C.offWhite, minHeight: 'calc(100vh - 120px)', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="KPI 目標"
        description="組織 / チーム / メンバー別の KPI 目標 (閲覧のみ)"
      />
      <GoalSettingsPanel isAdmin={isAdmin} readOnly onToast={() => {}} />
    </div>
  );
}
