import React from 'react';
import PageHeader from '../common/PageHeader';
import MASPMembersView from './MASPMembersView';

// 全社タブの「メンバー」（2026-10-08）。営業代行・スパキャリなど全事業の人を1つの名簿で見る。
// 事業ごとの絞り込み・所属の付け外し・追加・編集は名簿の中で行う。
export default function CompanyMembersView({ isAdmin }) {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader title="メンバー" description="全事業の人を1つの名簿で ・ 札で事業ごとに絞る・所属を付け外しする" />
      <MASPMembersView isAdmin={isAdmin} companyMode />
    </div>
  );
}
