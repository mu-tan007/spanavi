import React from 'react';
import { C } from '../../constants/colors';
import GoalSettingsPanel from '../admin/GoalSettingsPanel';

// Sourcing の独立ページ「Goals」。全員閲覧可、編集は admin 全権限 or 非admin は自分のみ。
export default function GoalsView({ isAdmin }) {
  return (
    <div style={{ background: C.offWhite, margin: -28, marginTop: 0, marginBottom: 0, minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ padding: '14px 20px 12px', background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
          Sourcing · Goals
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 2px', color: C.navy, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
          目標設定
        </h1>
        <p style={{ fontSize: 11, color: C.textMid, margin: 0 }}>
          組織 / チーム / メンバー別の KPI 目標。全員閲覧可、編集は admin か自分のみ
        </p>
      </div>
      <GoalSettingsPanel isAdmin={isAdmin} onToast={(msg, type) => {
        // 独立ページなので簡易 alert。Toast 統合は AdminView にしかないので
        if (type === 'error') console.warn(msg);
        else console.log(msg);
        // alertは鬱陶しいので window.alert は使わない。画面内通知は別途入れる場合は拡張
      }} />
    </div>
  );
}
