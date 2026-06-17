import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';

// ============================================================
// AI講座 動画の配信モーダル
// ----------------------------------------------------------------
// 動画ごとに「全員に公開」か「指定した受講生のみに配信」を選び、
// 指定配信の場合はチェックボックスで送付先を複数選択（全選択あり）。
// 保存内容:
//   - spacareer_course_videos.audience を 'all' / 'assigned' に更新
//   - 'assigned' のときは spacareer_video_assignments を選択集合に同期
// ============================================================

export default function VideoAssignModal({ open, onClose, video, onSaved }) {
  const [audience, setAudience] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !video) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const orgId = getOrgId();
        const [custRes, asgRes] = await Promise.all([
          supabase.from('spacareer_customers')
            .select('id, nickname, status, member:members!spacareer_customers_member_id_fkey ( name )')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false }),
          supabase.from('spacareer_video_assignments')
            .select('customer_id')
            .eq('video_id', video.id),
        ]);
        if (custRes.error) throw custRes.error;
        if (asgRes.error) throw asgRes.error;
        if (cancelled) return;
        setCustomers(custRes.data || []);
        setSelected(new Set((asgRes.data || []).map(r => r.customer_id)));
        setAudience(video.audience === 'assigned' ? 'assigned' : 'all');
      } catch (e) {
        if (!cancelled) setError(e?.message || '読み込みに失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, video]);

  const allChecked = customers.length > 0 && selected.size === customers.length;
  const someChecked = selected.size > 0 && selected.size < customers.length;

  const toggleAll = () => {
    setSelected(prev => (prev.size === customers.length ? new Set() : new Set(customers.map(c => c.id))));
  };
  const toggleOne = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const displayName = (c) => c.member?.name || c.nickname || '(名前未設定)';

  const handleSave = async () => {
    if (!video) return;
    if (audience === 'assigned' && selected.size === 0) {
      setError('配信先の受講生を1名以上選択するか、「全員に公開」を選んでください。');
      return;
    }
    setSaving(true); setError(null);
    try {
      const orgId = getOrgId();
      // 1. 公開範囲を更新
      const { error: updErr } = await supabase
        .from('spacareer_course_videos')
        .update({ audience })
        .eq('id', video.id);
      if (updErr) throw updErr;

      // 2. 指定配信なら割当を選択集合に同期（差分のみ反映）
      if (audience === 'assigned') {
        const { data: existing, error: exErr } = await supabase
          .from('spacareer_video_assignments')
          .select('id, customer_id')
          .eq('video_id', video.id);
        if (exErr) throw exErr;
        const existingIds = new Set((existing || []).map(r => r.customer_id));

        const toAdd = [...selected].filter(id => !existingIds.has(id));
        const toRemove = (existing || []).filter(r => !selected.has(r.customer_id)).map(r => r.id);

        if (toAdd.length) {
          const payload = toAdd.map(cid => ({
            org_id: orgId, video_id: video.id, customer_id: cid,
          }));
          const { error: insErr } = await supabase
            .from('spacareer_video_assignments').insert(payload);
          if (insErr) throw insErr;
        }
        if (toRemove.length) {
          const { error: delErr } = await supabase
            .from('spacareer_video_assignments').delete().in('id', toRemove);
          if (delErr) throw delErr;
        }
      }

      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      console.error('[VideoAssignModal] save error:', e);
      setError(e?.message || '配信の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !video) return null;

  return (
    <div
      onClick={() => !saving && onClose && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh',
          background: color.white, borderRadius: radius.lg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[4]}px ${space[5]}px`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold }}>動画を配信</div>
            <div style={{
              fontSize: font.size.xs, opacity: 0.85, marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420,
            }}>{video.title}</div>
          </div>
          <button onClick={onClose} disabled={saving} style={{
            background: 'transparent', color: color.white, border: 'none',
            fontSize: font.size.xl, cursor: saving ? 'not-allowed' : 'pointer',
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: space[5], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {error && (
            <div style={{
              padding: space[3],
              background: alpha(color.danger, 0.08),
              border: `1px solid ${alpha(color.danger, 0.3)}`,
              borderRadius: radius.md, color: color.danger, fontSize: font.size.sm,
            }}>{error}</div>
          )}

          {/* 公開範囲 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <RadioRow
              checked={audience === 'all'}
              onChange={() => setAudience('all')}
              title="全員に公開"
              desc="現在および今後の全受講生のAI講座に表示されます。"
            />
            <RadioRow
              checked={audience === 'assigned'}
              onChange={() => setAudience('assigned')}
              title="指定した受講生のみに配信"
              desc="チェックした受講生だけに表示されます。"
            />
          </div>

          {/* 受講生チェックリスト */}
          {audience === 'assigned' && (
            <Card variant="subtle" padding="none" style={{ overflow: 'hidden' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: space[2],
                padding: `${space[2]}px ${space[3]}px`,
                borderBottom: `1px solid ${color.borderLight}`,
                background: color.cream, cursor: 'pointer',
                fontWeight: font.weight.semibold, fontSize: font.size.sm, color: color.textDark,
              }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                />
                すべて選択（{selected.size} / {customers.length} 名）
              </label>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: space[4], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読み込み中...</div>
                ) : customers.length === 0 ? (
                  <div style={{ padding: space[4], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>受講生がいません</div>
                ) : customers.map(c => (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: space[2],
                    padding: `${space[2]}px ${space[3]}px`,
                    borderBottom: `1px solid ${color.borderLight}`,
                    cursor: 'pointer', fontSize: font.size.sm, color: color.textDark,
                    background: selected.has(c.id) ? alpha(color.navyLight, 0.06) : 'transparent',
                  }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    <span style={{ flex: 1 }}>{displayName(c)}</span>
                    {c.status && (
                      <span style={{ fontSize: font.size.xs, color: color.textLight }}>{c.status}</span>
                    )}
                  </label>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div style={{
          padding: `${space[3]}px ${space[5]}px`,
          borderTop: `1px solid ${color.borderLight}`,
          background: color.cream,
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
        }}>
          <Button variant="outline" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>配信を保存</Button>
        </div>
      </div>
    </div>
  );
}

function RadioRow({ checked, onChange, title, desc }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: space[2],
      padding: space[3],
      border: `1px solid ${checked ? color.navy : color.border}`,
      background: checked ? alpha(color.navyLight, 0.05) : color.white,
      borderRadius: radius.md, cursor: 'pointer',
    }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{title}</div>
        <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>{desc}</div>
      </div>
    </label>
  );
}
