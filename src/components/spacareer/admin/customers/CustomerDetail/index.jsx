import React, { useState } from 'react';
import { color, space, radius, font } from '../../../../../constants/design';
import { Badge } from '../../../../ui';
import { useCustomerDetail } from '../lib/useCustomers';
import ProgressStepper from './ProgressStepper';
import TabBasicInfo from './TabBasicInfo';
import TabKickoff from './TabKickoff';
import TabSessionHistory from './TabSessionHistory';
import TabHomework from './TabHomework';
import TabStrengths from './TabStrengths';
import TabFiles from './TabFiles';
import TabMemo from './TabMemo';
import TabMembers from './TabMembers';
import TabVideoLogs from './TabVideoLogs';
import RightSidebar from './RightSidebar';

// ============================================================
// 個人ページ（中央＋右カラム）
// 仕様書 §7.1：8タブ＋視聴ログタブ
// ============================================================
const TABS = [
  { id: 'basic',      label: '基本情報' },
  { id: 'kickoff',    label: 'キックオフ管理' },
  { id: 'sessions',   label: 'セッション履歴' },
  { id: 'homework',   label: '事前課題' },
  { id: 'strengths',  label: '強み・価値観' },
  { id: 'files',      label: 'ファイル' },
  { id: 'memo',       label: 'メモ' },
  { id: 'members',    label: 'メンバー' },
  { id: 'video_logs', label: '視聴ログ' },
];

function ageFromBirthdate(b) {
  if (!b) return null;
  const d = new Date(b);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export default function CustomerDetail({ customerId, isAdmin }) {
  const { detail, loading, refresh } = useCustomerDetail(customerId);
  const [tab, setTab] = useState('basic');

  if (!customerId) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color.white, border: `1px solid ${color.border}`,
        borderRadius: radius.lg, color: color.textLight, fontSize: font.size.md,
      }}>左の一覧から顧客を選択してください</div>
    );
  }
  if (loading || !detail) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color.white, border: `1px solid ${color.border}`,
        borderRadius: radius.lg, color: color.textLight, fontSize: font.size.sm,
      }}>読み込み中…</div>
    );
  }

  const { customer } = detail;
  const member = customer?.member || {};
  const age = ageFromBirthdate(customer?.birthdate);

  let CenterContent = null;
  switch (tab) {
    case 'basic':       CenterContent = <TabBasicInfo detail={detail} />; break;
    case 'kickoff':     CenterContent = <TabKickoff detail={detail} onRefresh={refresh} />; break;
    case 'sessions':    CenterContent = <TabSessionHistory detail={detail} onRefresh={refresh} />; break;
    case 'homework':    CenterContent = <TabHomework detail={detail} />; break;
    case 'strengths':   CenterContent = <TabStrengths detail={detail} />; break;
    case 'files':       CenterContent = <TabFiles detail={detail} />; break;
    case 'memo':        CenterContent = <TabMemo detail={detail} />; break;
    case 'members':     CenterContent = <TabMembers detail={detail} isAdmin={isAdmin} onRefresh={refresh} />; break;
    case 'video_logs':  CenterContent = <TabVideoLogs detail={detail} />; break;
    default:            CenterContent = null;
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 300px',
      gap: space[3], height: '100%', minHeight: 0,
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: color.white, border: `1px solid ${color.border}`,
        borderRadius: radius.lg, overflow: 'hidden', minHeight: 0,
      }}>
        <div style={{
          padding: `${space[4]}px ${space[4]}px ${space[3]}px`,
          borderBottom: `1px solid ${color.borderLight}`,
          background: color.cream,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{
              width: 48, height: 48, borderRadius: radius.pill,
              background: customer?.profile_image_url
                ? `url(${customer.profile_image_url}) center/cover`
                : color.navy,
              color: color.white,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: font.weight.bold, fontSize: font.size.lg, flexShrink: 0,
            }}>
              {!customer?.profile_image_url && (member.name || '?').slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: font.size.xl, fontWeight: font.weight.bold,
                color: color.textDark,
                display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap',
              }}>
                {member.name || '(名前未設定)'}
                {customer?.nickname && (
                  <span style={{ fontSize: font.size.sm, color: color.textMid }}>（{customer.nickname}）</span>
                )}
                {customer?.status && (
                  <Badge variant={customer.status === 'graduated' ? 'success'
                    : customer.status === 'cancelled' ? 'danger' : 'primary'} dot>
                    {customer.status}
                  </Badge>
                )}
              </div>
              <div style={{
                fontSize: font.size.xs, color: color.textMid, marginTop: 4,
                display: 'flex', gap: space[3], flexWrap: 'wrap',
              }}>
                {age !== null && <span>{age}歳</span>}
                {customer?.occupation && <span>{customer.occupation}</span>}
                {customer?.contract_started_at && (
                  <span>登録 {new Date(customer.contract_started_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: space[3] }}>
            <ProgressStepper sessions={detail.sessions} status={customer?.status} />
          </div>
        </div>

        <div style={{
          display: 'flex', overflowX: 'auto',
          borderBottom: `1px solid ${color.border}`,
          background: color.white,
        }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: `${space[3]}px ${space[3]}px`,
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
                color: tab === t.id ? color.navy : color.textMid,
                background: 'transparent', border: 'none',
                borderBottom: tab === t.id ? `2px solid ${color.navy}` : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
                letterSpacing: font.letterSpacing.wide,
              }}>{t.label}</button>
          ))}
        </div>

        <div style={{
          flex: 1, overflowY: 'auto',
          padding: space[4], background: color.offWhite,
        }}>{CenterContent}</div>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        <RightSidebar detail={detail} activeTab={tab} />
      </div>
    </div>
  );
}
