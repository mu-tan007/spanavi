import React, { useMemo, useState } from 'react';
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
    setTimeout(() => setZoomResult(null), 5000);
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

  return (
    <div style={{ background: color.offWhite, minHeight: 'calc(100vh - 120px)', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        bleed={bleed}
        title="メンバー"
        description={canDrag
          ? `${members.length} 名。行をドラッグしてチーム間の移動・チーム内の並び替えができます`
          : `${members.length} 名 (入社日順)${isAdmin && filter.trim() ? ' — 検索中はドラッグ不可' : ''}`}
        right={isAdmin ? (
          <Button
            size="sm"
            loading={zoomSyncing}
            onClick={handleZoomSync}
            title="Zoom Phone の user_id をメンバーに紐付けます (新メンバー追加後に実行)"
          >
            {zoomSyncing ? '連携中...' : 'Zoom Phone 連携'}
          </Button>
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
              : `Zoom Phone 連携完了 (更新: ${(zoomResult.updated || []).length}件)`}
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '24px 16px 16px', overflowX: 'auto' }}>
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
            {visibleGroups.map(g => (
              <TeamBlock key={g.id} group={g} draggable
                ranks={ranks} roles={roles} editable={isAdmin}
                onRankChange={updateMemberRank}
                onRoleChange={updateMemberRole}
                onOverrideChange={updateMemberOverride}
              />
            ))}
            <DragOverlay>
              {activeMember ? <MemberRowContent m={activeMember} dragging /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          visibleGroups.map(g => (
            <TeamBlock key={g.id} group={g} draggable={false}
              ranks={ranks} roles={roles} editable={isAdmin}
              onRankChange={updateMemberRank}
              onRoleChange={updateMemberRole}
              onOverrideChange={updateMemberOverride}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── チーム 1 ブロック ────────────────────────────────
function TeamBlock({ group, draggable, ranks, roles, editable, onRankChange, onRoleChange, onOverrideChange }) {
  const items = group.members.map(m => m.id);
  return (
    <div key={group.id} style={{ marginBottom: 16 }}>
      <div style={{
        padding: '8px 14px', background: color.navy, color: color.white,
        borderRadius: `${radius.md}px ${radius.md}px 0 0`,
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: font.size.sm, fontWeight: font.weight.semibold,
        letterSpacing: font.letterSpacing.wide,
      }}>
        <span>{group.name}</span>
        <span style={{ fontSize: 10, opacity: 0.8, fontWeight: font.weight.normal }}>({group.members.length}名)</span>
      </div>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        background: color.white, border: `1px solid ${color.border}`, borderTop: 'none',
        borderRadius: `0 0 ${radius.md}px ${radius.md}px`,
        fontSize: font.size.sm,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${color.border}`, background: color.cream }}>
            {draggable && <th style={{ ...th, width: 18, padding: '10px 2px' }}></th>}
            <th style={{ ...th, padding: '10px 4px' }}>入社日</th>
            <th style={{ ...th, textAlign: 'left' }}>氏名</th>
            <th style={{ ...th, textAlign: 'left' }}>ポジション</th>
            <th style={th}>ランク</th>
            <th style={th}>インセンティブ率</th>
            <th style={th}>累計売上</th>
          </tr>
        </thead>
        <tbody>
          {draggable ? (
            <SortableContext items={items} strategy={verticalListSortingStrategy} id={group.id}>
              {group.members.length === 0 ? (
                <EmptyTeamDropZone teamId={group.id} />
              ) : (
                group.members.map(m => <SortableMemberRow key={m.id} m={m} ranks={ranks} roles={roles} editable={editable} onRankChange={onRankChange} onRoleChange={onRoleChange} onOverrideChange={onOverrideChange} />)
              )}
            </SortableContext>
          ) : (
            group.members.map(m => <StaticMemberRow key={m.id} m={m} ranks={ranks} roles={roles} editable={editable} onRankChange={onRankChange} onRoleChange={onRoleChange} onOverrideChange={onOverrideChange} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── 並び替え可能な行 ─────────────────────────────────
function SortableMemberRow({ m, ranks, roles, editable, onRankChange, onRoleChange, onOverrideChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? color.cream : undefined,
  };
  return (
    <tr ref={setNodeRef} style={{ ...style, borderBottom: `1px solid ${color.borderLight}` }} {...attributes}>
      <td style={{ ...td, textAlign: 'center', width: 18, padding: '8px 2px', cursor: 'grab', color: color.textLight, userSelect: 'none' }} {...listeners}>
        ⋮⋮
      </td>
      <MemberRowCells m={m} ranks={ranks} roles={roles} editable={editable} onRankChange={onRankChange} onRoleChange={onRoleChange} onOverrideChange={onOverrideChange} />
    </tr>
  );
}

// DnD 無し時の静的な行
function StaticMemberRow({ m, ranks, roles, editable, onRankChange, onRoleChange, onOverrideChange }) {
  return (
    <tr style={{ borderBottom: `1px solid ${color.borderLight}` }}>
      <MemberRowCells m={m} ranks={ranks} roles={roles} editable={editable} onRankChange={onRankChange} onRoleChange={onRoleChange} onOverrideChange={onOverrideChange} />
    </tr>
  );
}

function MemberRowCells({ m, ranks = [], roles = [], editable, onRankChange, onRoleChange, onOverrideChange }) {
  const { openProfile } = useMemberProfile();
  const [overrideInput, setOverrideInput] = useState('');
  const [overrideEditing, setOverrideEditing] = useState(false);

  // 現在のランク情報
  const currentRank = ranks.find(r => r.id === m.rank_id);
  const defaultRate = currentRank?.default_incentive_rate ?? null;
  const override = m.incentive_rate_override;
  const effectiveRate = override != null ? Number(override) : (defaultRate != null ? Number(defaultRate) : null);

  const handleRankSelect = (e) => {
    const newRankId = e.target.value || null;
    onRankChange?.(m.id, newRankId);
  };

  const startOverrideEdit = () => {
    setOverrideInput(override != null ? String(Number(override) * 100) : '');
    setOverrideEditing(true);
  };

  const commitOverride = async () => {
    setOverrideEditing(false);
    const trimmed = overrideInput.trim();
    if (trimmed === '') {
      // 空入力 → override 解除（ランクのデフォルトに戻す）
      if (override != null) await onOverrideChange?.(m.id, null);
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0 || num > 100) return;
    const newOverride = num / 100;
    if (newOverride !== Number(override || 0)) {
      await onOverrideChange?.(m.id, newOverride);
    }
  };

  return (
    <>
      <td style={{ ...td, padding: '8px 4px', fontFamily: font.family.mono, color: color.textMid, whiteSpace: 'nowrap', textAlign: 'center' }}>
        {m.start_date || '—'}
      </td>
      <td style={{ ...td, textAlign: 'left', fontWeight: font.weight.medium, color: color.navy }}>
        <div onClick={() => openProfile?.(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: openProfile ? 'pointer' : 'default' }} title={openProfile ? 'プロフィールを開く' : undefined}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: color.navy, color: color.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: font.size.xs, fontWeight: font.weight.semibold, overflow: 'hidden', flexShrink: 0,
          }}>
            {m.avatar_url
              ? <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: '-webkit-optimize-contrast' }} />
              : (m.name || '?')[0]}
          </div>
          {m.name}
        </div>
      </td>
      <td style={{ ...td, textAlign: 'left', color: color.textDark }}>
        {editable ? (
          <Select
            size="sm"
            value={m.role_id || ''}
            onChange={e => onRoleChange?.(m.id, e.target.value || null)}
            fullWidth={false}
            containerStyle={{ minWidth: 120 }}
            options={[
              { value: '', label: '（なし）' },
              ...roles.map(r => ({ value: r.id, label: r.name })),
            ]}
          />
        ) : (roles.find(r => r.id === m.role_id)?.name || '—')}
      </td>
      <td style={{ ...td, color: color.textDark, textAlign: 'center' }}>
        {editable ? (
          <Select
            size="sm"
            value={m.rank_id || ''}
            onChange={handleRankSelect}
            fullWidth={false}
            containerStyle={{ minWidth: 130 }}
            options={[
              { value: '', label: '（未設定）' },
              ...ranks.map(r => ({ value: r.id, label: r.name })),
            ]}
          />
        ) : (currentRank?.name || '—')}
      </td>
      <td style={{ ...td, textAlign: 'right', color: color.textDark, fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums' }}>
        {overrideEditing && editable ? (
          <Input
            size="sm"
            type="number" step="0.1" min="0" max="100" autoFocus
            value={overrideInput}
            onChange={e => setOverrideInput(e.target.value)}
            onBlur={commitOverride}
            onKeyDown={e => { if (e.key === 'Enter') commitOverride(); if (e.key === 'Escape') setOverrideEditing(false); }}
            placeholder="例 24"
            fullWidth={false}
            containerStyle={{ width: 70 }}
            style={{ fontFamily: font.family.mono, textAlign: 'right' }}
          />
        ) : (
          <span
            onClick={editable ? startOverrideEdit : undefined}
            title={editable ? 'クリックで個別率を編集（空欄でランクのデフォルトに戻す）' : ''}
            style={{ cursor: editable ? 'pointer' : 'default', color: override != null ? color.navy : color.textMid, fontWeight: override != null ? font.weight.bold : font.weight.normal }}>
            {effectiveRate != null
              ? `${(effectiveRate * 100).toFixed(1).replace(/\.0$/, '')}%`
              : '—'}
            {override != null && <span style={{ fontSize: 9, color: color.gold, marginLeft: 4 }}>個別</span>}
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: 'right', color: color.textDark, fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums' }}>
        {m.cumulative_sales ? `¥${Number(m.cumulative_sales).toLocaleString()}` : '—'}
      </td>
    </>
  );
}

// DragOverlay 用のコンテンツ (tr の中身でなく div で別レンダ)
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

// 空チームのドロップゾーン
function EmptyTeamDropZone({ teamId }) {
  // SortableContext の空配列でもドロップできるように、専用の dummy row を置く。
  // collisionDetection は closestCenter なので tr でも当たる。
  const { setNodeRef, isOver } = useSortable({ id: `__empty:${teamId}` });
  return (
    <tr ref={setNodeRef}>
      <td colSpan={6} style={{
        padding: '18px 12px', textAlign: 'center', fontSize: font.size.xs,
        color: color.textLight,
        background: isOver ? color.cream : 'transparent',
        border: isOver ? `1px dashed ${color.gold}` : 'none',
      }}>
        ここにドロップしてチームに追加
      </td>
    </tr>
  );
}

const th = { padding: '10px 12px', textAlign: 'center', fontWeight: font.weight.semibold, color: color.navy, fontSize: font.size.xs, letterSpacing: font.letterSpacing.wide };
const td = { padding: '8px 12px', fontSize: font.size.sm, color: color.textDark };
