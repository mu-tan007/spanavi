import React from 'react';
import { C } from '../../constants/colors';
import GoalSettingsPanel from '../admin/GoalSettingsPanel';
import PageHeader from '../common/PageHeader';

// Sourcing の独立ページ「KPI」。全員閲覧可、編集は admin 全権限 or 非admin は自分のみ。
export default function GoalsView({ isAdmin }) {
  return (
    <div style={{ background: C.offWhite, minHeight: 'calc(100vh - 120px)' }}>
      <PageHeader
        eyebrow="Sourcing · KPI"
        title="KPI 目標"
        description="組織 / チーム / メンバー別の KPI 目標。全員閲覧可、編集は admin か自分のみ"
      />
      <GoalSettingsPanel isAdmin={isAdmin} onToast={(msg, type) => {
        // 独立ページなので簡易 alert。Toast 統合は AdminView にしかないので
        if (type === 'error') console.warn(msg);
        else console.log(msg);
        // alertは鬱陶しいので window.alert は使わない。画面内通知は別途入れる場合は拡張
      }} />
    </div>
  );
}
