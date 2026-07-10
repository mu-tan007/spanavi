import React, { useState } from 'react';
import { color, space, radius, font } from '../../../../../constants/design';
import { Badge, Button } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { invokeAdminImpersonateSpacareerCustomer } from '../../../../../lib/supabaseWrite';
import { useAuth } from '../../../../../hooks/useAuth';
import { useCustomerDetail } from '../lib/useCustomers';
import { orderSessions, sessionLabel } from '../../../../../lib/spacareer/sessionOrder';

// 代理ログイン時に現在の管理者セッションを退避する localStorage キー。
// 営業代行ポータルの `spanavi_admin_session_backup` とは別キーで管理し、
// 両ポータルで代理ログイン中に session を取り違える事故を物理的に防ぐ。
const ADMIN_BACKUP_KEY_SPACAREER = 'spanavi_admin_session_backup_spacareer';

// スパキャリ受講生の代理ログインを許可されたメンバーのメールアドレス。
// 全体 admin（isAdmin=true）以外で代理ログインを使う人をここに追加する。
// Edge Function `admin-impersonate-spacareer-customer` の SUPER_ADMIN_EMAILS と
// 必ず同じ内容を保つこと（片方だけ追加するとボタンは出るが押すと403になる、もしくは押せない）。
const SPACAREER_IMPERSONATE_ALLOWED_EMAILS = [
  'koyama@ma-sp.co', // 小山（スパキャリ事業責任者）
];
import ProgressStepper from './ProgressStepper';
import TabBasicInfo from './TabBasicInfo';
import TabKickoffHearing from './TabKickoffHearing';
import TabKickoff from './TabKickoff';
import TabSessionManage from './TabSessionManage';
import TabSessionHistory from './TabSessionHistory';
import TabSessionFeedback from './TabSessionFeedback';
import TabHomework from './TabHomework';
import TabFiles from './TabFiles';
import TabMemo from './TabMemo';
import TabMembers from './TabMembers';
import TabVideoLogs from './TabVideoLogs';
import RightSidebar from './RightSidebar';
import { SessionJobsProvider } from './SessionJobsContext';

// ============================================================
// 個人ページ（中央＋右カラム）
// 仕様書 §7.1：8タブ＋視聴ログタブ
// ============================================================
const TABS = [
  { id: 'basic',           label: '基本情報' },
  { id: 'kickoff_hearing', label: 'キックオフヒアリング' }, // §6.2A 第1回前70問
  { id: 'kickoff',         label: 'キックオフ管理' },        // §5.2 第0回キックオフ
  { id: 'sessions',        label: 'セッション履歴' },
  { id: 'feedback',        label: 'セッション感想' },
  { id: 'homework',        label: '事後課題' },
  { id: 'files',           label: 'ファイル' },
  { id: 'memo',            label: 'メモ' },
  { id: 'members',         label: 'メンバー' },
  { id: 'video_logs',      label: '視聴ログ' },
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
  const { profile } = useAuth();
  const [tab, setTab] = useState('basic');
  const [impersonating, setImpersonating] = useState(false);

  // 代理ログイン可否: 全体adminか、スパキャリ専用許可リストに載っているか
  const canImpersonate = isAdmin
    || SPACAREER_IMPERSONATE_ALLOWED_EMAILS.includes(profile?.email);

  // スパキャリ受講生として代理ログインする。営業代行 DealsView の handleImpersonate と同じ構造。
  // 退避キーだけ別物（ADMIN_BACKUP_KEY_SPACAREER）にしてあるため、営業代行ポータルとは混線しない。
  const handleImpersonate = async () => {
    const cust = detail?.customer;
    if (!cust?.id) return;
    setImpersonating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.refresh_token) {
        localStorage.setItem(ADMIN_BACKUP_KEY_SPACAREER, JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          saved_at: Date.now(),
          impersonating_customer_id: cust.id,
          impersonating_customer_name: cust.member?.name || '',
        }));
      }
    } catch (e) {
      console.warn('admin session backup failed', e);
    }
    const { data, error } = await invokeAdminImpersonateSpacareerCustomer(cust.id);
    setImpersonating(false);
    if (error) {
      alert('代理ログインに失敗しました: ' + (error.message || error.error || 'unknown'));
      return;
    }
    if (data?.error) {
      alert('代理ログインに失敗しました: ' + data.error);
      return;
    }
    if (data?.url) {
      window.open(data.url, '_blank', 'noopener,noreferrer');
    }
  };

  // ローディング/未選択時も SessionJobsProvider をルートに据えたまま中身だけ差し替える。
  // こうしないと AI議事録生成の完了 refresh(loading=true) や顧客切替のたびに
  // Provider ごとアンマウントされ、進捗インジケータが消え処理が止まって見えていた。
  // ルート要素の型(SessionJobsProvider)が常に同一なので React がジョブ状態を保持し続ける。
  if (!customerId) {
    return (
      <SessionJobsProvider customerId={customerId} refresh={refresh}>
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.lg, color: color.textLight, fontSize: font.size.md,
        }}>左の一覧から顧客を選択してください</div>
      </SessionJobsProvider>
    );
  }
  if (loading || !detail) {
    return (
      <SessionJobsProvider customerId={customerId} refresh={refresh}>
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.lg, color: color.textLight, fontSize: font.size.sm,
        }}>読み込み中…</div>
      </SessionJobsProvider>
    );
  }

  const { customer } = detail;
  const member = customer?.member || {};
  const age = ageFromBirthdate(customer?.birthdate);

  // 氏名の横（括弧内）に表示する呼称。キックオフヒアリングQ3「呼ばれたい呼称」を優先し、
  // 未回答ならニックネームにフォールバック。
  const calledName = (() => {
    const q3 = (detail.kickoffHearingQuestions || []).find((q) => q.question_number === 3);
    if (!q3) return null;
    const r = (detail.kickoffHearingResponses || []).find((x) => x.question_id === q3.id);
    return (r?.answer_text || '').trim() || null;
  })();
  const displayCallName = calledName || customer?.nickname || null;

  // セッション管理タブは「加入回 J 以降の interleave 順」（sessionOrder.js）で段階表示する。
  // ・強化＝第1〜8回のみ。応用＝加入回以降、各基本回の直後にプラスアルファ(α)を1本ずつ差し込み、
  //   第8回まで来たら残りのαを連番順で連続表示（過去回にαを差し込まないので虫食いが出ない）。
  // ・「直前の順序のセッションが完了」で当該回のタブが出現（第3回→α1→第4回…の順送り）。
  // ・next_up は表示条件にしない（キックオフ未完了なのに第1回が出る不具合を防ぐ。
  //   タブ出現の唯一のゲートは「直前が completed」。自身が completed なら常に表示）。
  const completedKeys = new Set(
    (detail.sessions || []).filter((s) => s.status === 'completed')
      .map((s) => `${s.session_no}-${s.part || 1}`));
  const orderedSessions = orderSessions(
    (detail.sessions || []).filter((s) => s.session_no >= 1),
    customer?.oyo_start_session_no);
  const sessionMgmtTabs = [];
  orderedSessions.forEach((s, i) => {
    const part = s.part || 1;
    const prev = i === 0 ? { session_no: 0, part: 1 } : orderedSessions[i - 1];
    const prevKey = `${prev.session_no}-${prev.part || 1}`;
    const revealed = s.status === 'completed' || completedKeys.has(prevKey);
    if (revealed) {
      sessionMgmtTabs.push({ id: `session-${s.session_no}-${part}`, label: `${sessionLabel(s)}セッション管理` });
    }
  });
  const tabs = sessionMgmtTabs.length
    ? TABS.flatMap((t) => (t.id === 'kickoff' ? [t, ...sessionMgmtTabs] : [t]))
    : TABS;

  let CenterContent = null;
  const sessionMgmtMatch = /^session-([1-8])-([12])$/.exec(tab);
  if (sessionMgmtMatch) {
    CenterContent = (
      <TabSessionManage detail={detail}
        sessionNo={parseInt(sessionMgmtMatch[1], 10)}
        part={parseInt(sessionMgmtMatch[2], 10)}
        onRefresh={refresh} />
    );
  } else {
    switch (tab) {
      case 'basic':           CenterContent = <TabBasicInfo detail={detail} />; break;
      case 'kickoff_hearing': CenterContent = <TabKickoffHearing detail={detail} onRefresh={refresh} />; break;
      case 'kickoff':         CenterContent = <TabKickoff detail={detail} onRefresh={refresh} />; break;
      case 'sessions':    CenterContent = <TabSessionHistory detail={detail} onRefresh={refresh} />; break;
      case 'feedback':    CenterContent = <TabSessionFeedback detail={detail} />; break;
      case 'homework':    CenterContent = <TabHomework detail={detail} customerId={customerId} onRefresh={refresh} />; break;
      case 'files':       CenterContent = <TabFiles detail={detail} onRefresh={refresh} />; break;
      case 'memo':        CenterContent = <TabMemo detail={detail} />; break;
      case 'members':     CenterContent = <TabMembers detail={detail} isAdmin={isAdmin} canAssign={canImpersonate} onRefresh={refresh} />; break;
      case 'video_logs':  CenterContent = <TabVideoLogs detail={detail} />; break;
      default:            CenterContent = null;
    }
  }

  return (
    <SessionJobsProvider customerId={customerId} refresh={refresh}>
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
                {displayCallName && (
                  <span style={{ fontSize: font.size.sm, color: color.textMid }}>（{displayCallName}）</span>
                )}
                {customer?.course === 'oyo' && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: `2px ${space[2]}px`,
                    background: color.gold, color: color.white,
                    borderRadius: radius.pill,
                    fontSize: font.size.xs, fontWeight: font.weight.bold,
                    letterSpacing: font.letterSpacing.wide,
                    boxShadow: `0 1px 2px ${color.goldDim}`,
                  }}>応用コース</span>
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
            {canImpersonate && (() => {
              const noPortalUser = !member?.user_id;
              const disabled = impersonating || noPortalUser;
              const label = impersonating
                ? '生成中...'
                : noPortalUser ? 'ポータル未招待' : '代理ログイン →';
              const title = noPortalUser
                ? `「${member.name || ''}」の受講生ポータルユーザー（auth.users）が紐付いていないため代理ログインできません。`
                : `「${member.name || ''}」のスパキャリ受講生ポータルを開く（代理ログイン）`;
              return (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={handleImpersonate}
                  title={title}
                  style={{ flexShrink: 0 }}
                >{label}</Button>
              );
            })()}
          </div>

          <div style={{ marginTop: space[3] }}>
            <ProgressStepper sessions={detail.sessions} status={customer?.status}
              oyoStartNo={customer?.oyo_start_session_no} />
          </div>
        </div>

        <div style={{
          display: 'flex', overflowX: 'auto',
          borderBottom: `1px solid ${color.border}`,
          background: color.white,
        }}>
          {tabs.map((t) => (
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
        <RightSidebar detail={detail} activeTab={tab} onRefresh={refresh} />
      </div>
    </div>
    </SessionJobsProvider>
  );
}
