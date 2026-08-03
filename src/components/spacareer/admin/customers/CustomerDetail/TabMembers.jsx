import React, { useState, useEffect } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Button, Select, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { useTrainers } from '../lib/useCustomers';

// ============================================================
// 8. メンバータブ
// 仕様書 §7.1 中央タブ#8：担当トレーナー・運営の一覧 + アサイン操作
// ============================================================
// spacareer_customers.status の表示名（DB制約 pre_kickoff/in_progress/graduated/cancelled と一致）
const STATUS_LABEL = {
  pre_kickoff: 'キックオフ前',
  in_progress: '受講中',
  graduated: '卒業',
  cancelled: '解約',
};

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TabMembers({ detail, isAdmin, canAssign, onRefresh }) {
  const { customer, trainer } = detail || {};
  const customerId = customer?.id;
  // アサイン操作の表示可否。全体adminに加え、スパキャリ運営（小山）にも開放する。
  // DB側の spacareer_is_admin()（admin もしくは koyama@ma-sp.co）と権限範囲を揃える。
  const canAssignTrainer = isAdmin || canAssign;
  const trainers = useTrainers();
  const [pick, setPick] = useState(customer?.assigned_trainer_id || '');
  const [saving, setSaving] = useState(false);
  // 受講ステータス。卒業・解約にするとDBトリガーが担当期間を閉じ、以降そのトレーナーの
  // 固定給の担当人数から外れる（むー様指示 2026-08-03）。
  const [statusPick, setStatusPick] = useState(customer?.status || 'in_progress');
  const [statusSaving, setStatusSaving] = useState(false);
  useEffect(() => { setStatusPick(customer?.status || 'in_progress'); }, [customer?.status]);

  async function handleAssign() {
    if (!customerId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('spacareer_customers')
        .update({
          assigned_trainer_id: pick || null,
          assigned_at: pick ? new Date().toISOString() : null,
        })
        .eq('id', customerId);
      if (error) throw error;
      onRefresh && onRefresh();
    } catch (e) {
      console.error('[TabMembers] assign error:', e);
      alert(`アサインに失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusSave() {
    if (!customerId) return;
    const ending = statusPick === 'graduated' || statusPick === 'cancelled';
    if (ending && !window.confirm(
      `この受講生を「${STATUS_LABEL[statusPick]}」にします。\n担当トレーナーの担当期間がこの時点で終了し、以降は固定給の担当人数に数えられなくなります。\n\nよろしいですか？`)) return;
    setStatusSaving(true);
    try {
      const { error } = await supabase
        .from('spacareer_customers')
        .update({
          status: statusPick,
          // 卒業・解約の時点を契約終了日として残す（未設定のときだけ入れる）
          ...(ending && !customer?.contract_ended_at ? { contract_ended_at: new Date().toISOString() } : {}),
        })
        .eq('id', customerId);
      if (error) throw error;
      onRefresh && onRefresh();
    } catch (e) {
      console.error('[TabMembers] status update error:', e);
      alert(`ステータスの変更に失敗しました: ${e.message || e}`);
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md" title="担当トレーナー">
        {trainer ? (
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1fr auto',
            gap: space[3], alignItems: 'center',
            padding: space[3], background: color.cream, borderRadius: radius.md,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: radius.pill,
              background: color.navy, color: color.white,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: font.weight.bold, fontSize: font.size.md,
            }}>{(trainer.name || '?').slice(0, 1)}</div>
            <div>
              <div style={{ fontWeight: font.weight.semibold, color: color.textDark }}>
                {trainer.name}
              </div>
              <div style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono }}>
                {trainer.email}
              </div>
            </div>
            <Badge variant="primary" dot>アサイン日 {fmtDate(customer?.assigned_at)}</Badge>
          </div>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>
            担当トレーナー未アサイン
          </div>
        )}
      </Card>

      {canAssignTrainer && (
        <Card padding="md" title="アサイン操作（運営のみ）"
          description="トレーナーを変更すると、担当が即時切り替わります。">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: space[2], alignItems: 'end' }}>
            <Select label="担当トレーナー"
              value={pick} onChange={(e) => setPick(e.target.value)}
              options={[
                { value: '', label: '— 未アサイン —' },
                ...trainers.map((t) => ({ value: t.id, label: `${t.name}（${t.rank || '—'}）` })),
              ]} />
            <Button variant="primary" loading={saving} onClick={handleAssign}>
              アサイン
            </Button>
          </div>
        </Card>
      )}

      {canAssignTrainer && (
        <Card padding="md" title="受講ステータス（運営のみ）"
          description="卒業・解約にすると、その時点で担当トレーナーの担当期間が終了します。以降はトレーナー報酬の固定給の担当人数に数えられません。受講中に戻すと、戻した時点から数え直します。">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: space[2], alignItems: 'end' }}>
            <Select label="ステータス"
              value={statusPick} onChange={(e) => setStatusPick(e.target.value)}
              options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
            <Button variant="primary" loading={statusSaving}
              disabled={statusPick === (customer?.status || 'in_progress')}
              onClick={handleStatusSave}>
              変更
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
