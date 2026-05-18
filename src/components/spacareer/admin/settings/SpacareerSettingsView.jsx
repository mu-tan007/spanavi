import React, { useState } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import PageHeader from '../../../common/PageHeader';
import PermissionsView from './PermissionsView';
import ZoomUrlSetting from './ZoomUrlSetting';
import SlackChannelManagement from './SlackChannelManagement';
import CourseManagement from './CourseManagement';
import AIUsageStatus from './AIUsageStatus';

// スパキャリ 設定 View（シェル）
//
// 仕様書 §7.8 のセクション構成：
// - 権限管理（3ロール表示のみ）
// - Zoom URL（全顧客共通の固定URL）
// - コース管理（単一コース）
// - Slack連携（顧客チャンネル作成UI、認証はエンジニア管理）
// - AI利用状況（分析レポートのAIコストタブと同データ）
//
// 仕様書で「実装しない」と明記：
// - トレーナー稼働管理 / 祝日・休業日 / データ保持 / 返金保証ルール編集
const SECTIONS = [
  { key: 'permissions', label: '権限管理' },
  { key: 'zoom',        label: 'Zoom URL' },
  { key: 'course',      label: 'コース管理' },
  { key: 'slack',       label: 'Slack連携' },
  { key: 'ai_usage',    label: 'AI利用状況' },
];

export default function SpacareerSettingsView() {
  const [section, setSection] = useState('permissions');

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="設定"
        description="権限・Zoom URL・コース・Slack・AI利用状況"
        style={{ marginBottom: space[4] }}
      />

      {/* セクションタブ */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: space[4],
        borderBottom: `1px solid ${color.border}`,
        flexWrap: 'wrap',
      }}>
        {SECTIONS.map(s => {
          const active = section === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              style={{
                padding: '10px 16px',
                fontSize: font.size.md,
                fontWeight: active ? font.weight.bold : font.weight.medium,
                color: active ? color.navy : color.textMid,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? color.navy : 'transparent'}`,
                cursor: 'pointer',
                fontFamily: font.family.sans,
                marginBottom: -1,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {section === 'permissions' && <PermissionsView />}
      {section === 'zoom'        && <ZoomUrlSetting />}
      {section === 'course'      && <CourseManagement />}
      {section === 'slack'       && <SlackChannelManagement />}
      {section === 'ai_usage'    && <AIUsageStatus />}

      <div style={{
        marginTop: space[5],
        padding: space[3],
        background: color.cream,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        fontSize: font.size.xs,
        color: color.textMid,
      }}>
        ※ 仕様書 §7.8 により、トレーナー稼働管理／祝日・休業日／データ保持／返金保証ルール編集 は本画面では提供しません。
      </div>
    </div>
  );
}
