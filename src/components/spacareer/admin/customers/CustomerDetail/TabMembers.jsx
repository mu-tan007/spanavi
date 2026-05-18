import React, { useState } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Button, Select, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { useTrainers } from '../lib/useCustomers';

// ============================================================
// 8. メンバータブ
// 仕様書 §7.1 中央タブ#8：担当トレーナー・運営の一覧 + アサイン操作
// ============================================================
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TabMembers({ detail, isAdmin, onRefresh }) {
  const { customer, trainer } = detail || {};
  const customerId = customer?.id;
  const trainers = useTrainers();
  const [pick, setPick] = useState(customer?.assigned_trainer_id || '');
  const [saving, setSaving] = useState(false);

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

      {isAdmin && (
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
    </div>
  );
}
