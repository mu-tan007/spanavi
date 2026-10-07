import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { useEngagements } from '../../hooks/useEngagements';
import { useEngagementMembers } from '../../hooks/useMemberEngagements';
import { invokeSyncZoomUsers } from '../../lib/supabaseWrite';
import PageHeader from '../common/PageHeader';
import { useMemberProfile } from '../common/MemberProfileDrawer';
import { supabase } from '../../lib/supabase';
import { memberStatus, memberKpis, monthStartIso, nowJst } from '../../utils/memberStatus';
import { MembersKpis, RankLadder, MemberLine, MemberDrawer } from './members/MembersParts';
import MASPMembersView from './MASPMembersView';
import PermissionSettings from '../admin/PermissionSettings';

// 各事業タブの「Members」ページ。
// admin はドラッグ&ドロップでチーム間移動/チーム内並び替えが可能。
// 非 admin は閲覧のみ。
export default function EngagementMembersView({ engagementOverride, bleed = true, isAdmin = false }) {
  const { currentEngagement } = useEngagements();
  const engagement = engagementOverride || currentEngagement;
  const { members, teamGroups, ranks, roles, loading, applyTeamGroups, updateMemberRank, updateMemberRole, updateMemberOverride, refresh } = useEngagementMembers(engagement?.id);
  const [filter, setFilter] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [localGroups, setLocalGroups] = useState(null); // DnD 最中のオーバーレイ状態
  const [zoomSyncing, setZoomSyncing] = useState(false);
  const [zoomResult, setZoomResult] = useState(null);
  // 今月の架電（人ごと）・今日以降2週間のシフト・今月のアポ。5分ごとに取り直す（2026-10-07 見本どおり）
  const [extra, setExtra] = useState({ stats: [], shifts: [], appos: [] });
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState(null);
  // 2026-10-07：設定から移した（メンバーの追加・見られるページの権限）
  const [adminSheet, setAdminSheet] = useState(null); // 'add' | 'perm'
  const [sheetMsg, setSheetMsg] = useState('');
  useEffect(() => {
    let alive = true;
    const today = nowJst().date;
    const until = new Date(Date.parse(today + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
    Promise.all([
      supabase.rpc('member_call_stats', { p_from: monthStartIso() }),
      supabase.from('shifts').select('member_id, shift_date, start_time, end_time').gte('shift_date', today).lte('shift_date', until),
      supabase.from('appointments').select('getter_name, intern_reward, status').gte('created_at', monthStartIso()).neq('status', 'キャンセル'),
    ]).then(([st, sh, ap]) => {
      if (!alive) return;
      setExtra({ stats: st.data || [], shifts: sh.data || [], appos: ap.data || [] });
    });
    const t = setInterval(() => setTick(n => n + 1), 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [tick]);
  const { openProfile } = useMemberProfileSafe();

  const handleZoomSync = async () => {
    setZoomSyncing(true);
    setZoomResult(null);
    const { data, error } = await invokeSyncZoomUsers();
    setZoomSyncing(false);
    if (error || !data) {
      setZoomResult({ error: error?.message || 'Zoom Phone 連携に失敗しました' });
      return;
    }
    setZoomResult(data);
    await refresh?.();
    setTimeout(() => setZoomResult(null), 10000);
  };

  // filter が空のときは localGroups (DnD 中) を優先、そうでなければ teamGroups
  const workingGroups = localGroups || teamGroups;

  const matcher = (m) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (m.name || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.position || '').toLowerCase().includes(q)
      || (m.team || '').toLowerCase().includes(q);
  };

  // 表示用 (フィルタ後)。DnD は filter 非適用時のみ有効 (インデックスがずれるため)
  const canDrag = isAdmin && !filter.trim();
  const visibleGroups = useMemo(() => {
    if (canDrag) return workingGroups || [];
    return (workingGroups || [])
      .map(g => ({ ...g, members: (g.members || []).filter(matcher) }))
      .filter(g => g.members.length > 0);
  }, [workingGroups, filter, canDrag]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // id → {team_id, member} を引く helper
  const findLocation = (memberId, groups) => {
    for (const g of groups) {
      const idx = g.members.findIndex(m => m.id === memberId);
      if (idx !== -1) return { teamId: g.id, index: idx };
    }
    return null;
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    setLocalGroups(teamGroups); // DnD 中は独自コピーで差分計算
  };

  const handleDragOver = (event) => {
    if (!localGroups) return;
    const { active, over } = event;
    if (!over) return;
    const activeMid = active.id;
    const overId = over.id;

    const src = findLocation(activeMid, localGroups);
    if (!src) return;

    // over がチーム ID (ドロップゾーン) の場合
    const isTeam = localGroups.some(g => g.id === overId);
    if (isTeam && overId !== src.teamId) {
      const next = localGroups.map(g => ({ ...g, members: [...g.members] }));
      const srcGroup = next.find(g => g.id === src.teamId);
      const dstGroup = next.find(g => g.id === overId);
      const [m] = srcGroup.members.splice(src.index, 1);
      dstGroup.members.push(m);
      setLocalGroups(next);
      return;
    }

    // over が別メンバー行
    const dst = findLocation(overId, localGroups);
    if (!dst) return;
    if (src.teamId === dst.teamId && src.index === dst.index) return;
    const next = localGroups.map(g => ({ ...g, members: [...g.members] }));
    if (src.teamId === dst.teamId) {
      const g = next.find(g => g.id === src.teamId);
      g.members = arrayMove(g.members, src.index, dst.index);
    } else {
      const srcGroup = next.find(g => g.id === src.teamId);
      const dstGroup = next.find(g => g.id === dst.teamId);
      const [m] = srcGroup.members.splice(src.index, 1);
      dstGroup.members.splice(dst.index, 0, m);
    }
    setLocalGroups(next);
  };

  const handleDragEnd = async () => {
    setActiveId(null);
    if (!localGroups) return;
    const next = localGroups;
    setLocalGroups(null);
    // 差分を DB に反映 (楽観的更新は applyTeamGroups 内で実行)
    const { error } = await applyTeamGroups(next);
    if (error) {
      console.error('[EngagementMembers] applyTeamGroups failed:', error);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setLocalGroups(null);
  };

  if (!engagement) return null;
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: color.textMid }}>読み込み中…</div>;
  }

  const activeMember = activeId
    ? (workingGroups || []).flatMap(g => g.members).find(m => m.id === activeId)
    : null;

  const statByName = Object.fromEntries(extra.stats.map(r => [r.getter_name, r]));
  const apposByName = extra.appos.reduce((m, a) => { m[a.getter_name] = (m[a.getter_name] || 0) + 1; return m; }, {});
  const statOf = (m) => ({ ...(statByName[m.name] || {}), appos: apposByName[m.name] || 0 });
  const statusOf = (m) => memberStatus({ lastCalledAt: statByName[m.name]?.last_called_at, shifts: extra.shifts.filter(s => s.member_id === m.id) });
  const kpis = memberKpis({ members, stats: extra.stats, shifts: extra.shifts, appos: extra.appos });
  const callingSet = new Set(kpis.calling);
  const openMember = openId ? members.find(m => m.id === openId) : null;
  const sortedRanks = [...(ranks || [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const lineProps = { ranks: sortedRanks, statOf, statusOf, onOpen: (m) => setOpenId(m.id) };

  return (
    <div className="mb" style={{ background: color.offWhite, minHeight: 'calc(100vh - 120px)', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        bleed={bleed}
        title="メンバー"
        description={`${visibleGroups.length}チーム ・ ${members.length}名 ・ ${canDrag ? '⋮⋮ をつかんでチームの移動・並べ替え' : '入社日順'}${isAdmin && filter.trim() ? '（検索中は並べ替え不可）' : ''}`}
        right={isAdmin ? (
          <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="outline" onClick={() => setAdminSheet('perm')}>見られるページ</Button>
          <Button size="sm" variant="outline" onClick={() => setAdminSheet('add')}>＋ メンバーを追加</Button>
          <Button
            size="sm"
            loading={zoomSyncing}
            onClick={handleZoomSync}
            title="Zoom Phone の user_id をメンバーに紐付けます (新メンバー追加後に実行)"
          >
            {zoomSyncing ? '連携中...' : 'Zoom Phone 連携'}
          </Button>
          </div>
        ) : null}
      >
        <Input
          size="sm"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="氏名 / メール / チーム / ポジションで検索"
          fullWidth={false}
          containerStyle={{ width: 320, marginTop: 12 }}
        />
        {zoomResult && (
          <div style={{
            marginTop: 10, padding: '8px 10px', fontSize: font.size.xs, borderRadius: radius.sm,
            background: zoomResult.error ? alpha(color.danger, 0.06) : alpha(color.success, 0.08),
            color: zoomResult.error ? '#c0392b' : '#065F46',
            border: `1px solid ${zoomResult.error ? alpha(color.danger, 0.25) : alpha(color.success, 0.3)}`,
          }}>
            {zoomResult.error
              ? `連携に失敗しました: ${zoomResult.error}`
              : (zoomResult.updated || []).length > 0
                ? `Zoom Phone 連携完了：新たに連携 ${zoomResult.updated.join('・')}（連携済み ${(zoomResult.skipped || []).length}名）`
                : `全員連携済みです（${(zoomResult.skipped || []).length}名・変更なし）`}
            {!zoomResult.error && (zoomResult.unmatched || []).length > 0 && (
              ` ／ Spanaviに見つからないZoomユーザー: ${zoomResult.unmatched.map(u => u.name || u.email).join('・')}`
            )}
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '16px 16px 24px' }}>
        <MembersKpis k={kpis} />
        {sortedRanks.length > 0 && <RankLadder ranks={sortedRanks} members={members} callingSet={callingSet} onOpen={(m) => setOpenId(m.id)} />}

        {visibleGroups.length === 0 ? (
          <Card padding="lg" style={{ textAlign: 'center', color: color.textLight }}>
            {members.length === 0 ? 'この事業に所属するメンバーはいません' : '該当するメンバーがいません'}
          </Card>
        ) : canDrag ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="mb-teams">
              {visibleGroups.map(g => <TeamCard key={g.id} group={g} draggable {...lineProps} />)}
            </div>
            <DragOverlay>
              {activeMember ? <MemberRowContent m={activeMember} dragging /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="mb-teams">
            {visibleGroups.map(g => <TeamCard key={g.id} group={g} draggable={false} {...lineProps} />)}
          </div>
        )}
      </div>

      {adminSheet && (
        <div onClick={() => setAdminSheet(null)} style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.35), zIndex: 300, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '32px 16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100, background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${color.borderLight}` }}>
              <b style={{ color: color.navy, fontSize: font.size.md }}>{adminSheet === 'add' ? 'メンバーの追加・名簿' : '見られるページ（人ごとの権限）'}</b>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {sheetMsg && <span style={{ fontSize: 12, color: color.success }}>{sheetMsg}</span>}
                <Button size="sm" variant="outline" onClick={() => { setAdminSheet(null); refresh?.(); }}>閉じる</Button>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {adminSheet === 'add'
                ? <MASPMembersView isAdmin={isAdmin} />
                : <PermissionSettings onToast={(t) => { setSheetMsg(t?.message || ''); setTimeout(() => setSheetMsg(''), 3000); }} />}
            </div>
          </div>
        </div>
      )}

      {openMember && (
        <MemberDrawer
          m={openMember}
          ranks={sortedRanks}
          roles={roles || []}
          stat={statOf(openMember)}
          status={statusOf(openMember)}
          editable={isAdmin}
          onClose={() => setOpenId(null)}
          onRankChange={updateMemberRank}
          onRoleChange={updateMemberRole}
          onOverrideChange={updateMemberOverride}
          onOpenProfile={openProfile ? (id) => { setOpenId(null); openProfile(id); } : null}
        />
      )}
    </div>
  );
}

// プロフィールの引き出しが無い画面でも落ちないように
function useMemberProfileSafe() {
  try { return useMemberProfile() || {}; } catch { return {}; }
}

// ─── チーム 1 枚（2026-10-07 見本どおり） ─────────────────────
function TeamCard({ group, draggable, ranks, statOf, statusOf, onOpen }) {
  const items = group.members.map(m => m.id);
  const calls = group.members.reduce((t, m) => t + Number(statOf(m).calls || 0), 0);
  const appos = group.members.reduce((t, m) => t + Number(statOf(m).appos || 0), 0);
  const line = (m) => ({ m, ranks, stat: statOf(m), status: statusOf(m), onOpen });
  return (
    <div className="mb-card mb-team">
      <div className="mb-team-h">
        <b>{group.name}{group.id === '__unassigned' ? '' : 'チーム'}</b>
        <span>{group.members.length}名 ・ 今月 架電 <span className="mb-num">{calls.toLocaleString()}</span> ・ アポ <span className="mb-num">{appos}</span></span>
      </div>
      {draggable ? (
        <SortableContext items={items} strategy={verticalListSortingStrategy} id={group.id}>
          {group.members.length === 0
            ? <EmptyTeamDropZone teamId={group.id} />
            : group.members.map(m => <SortableMemberLine key={m.id} {...line(m)} />)}
        </SortableContext>
      ) : group.members.map(m => <MemberLine key={m.id} {...line(m)} />)}
    </div>
  );
}

function SortableMemberLine(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.m.id });
  return (
    <MemberLine {...props} grip={listeners} rowRef={setNodeRef} rowProps={attributes}
      rowStyle={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} />
  );
}

// DragOverlay 用（つかんでいる間に見える札）
function MemberRowContent({ m }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: color.white, border: `1px solid ${color.gold}`, borderRadius: radius.md,
      padding: '6px 12px', fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.semibold,
      boxShadow: shadow.lg,
    }}>
      <span style={{ color: color.textLight }}>⋮⋮</span>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: color.navy, color: color.white,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: font.size.xs, fontWeight: font.weight.semibold, flexShrink: 0,
      }}>
        {(m.name || '?')[0]}
      </div>
      {m.name}
    </div>
  );
}

// 空チームのドロップ先
function EmptyTeamDropZone({ teamId }) {
  const { setNodeRef, isOver } = useSortable({ id: `__empty:${teamId}` });
  return <div ref={setNodeRef} className={`mb-drop${isOver ? ' over' : ''}`}>ここにドロップしてチームに追加</div>;
}
