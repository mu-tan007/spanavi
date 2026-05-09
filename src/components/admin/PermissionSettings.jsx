import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge } from '../ui';
import { PAGE_REGISTRY, ENGAGEMENT_LABELS, ALL_ENGAGEMENT_SLUGS } from '../../constants/pageRegistry';

// 一括権限管理: メンバーごとに「閲覧可能な事業タブ」と「事業タブ内の閲覧可能ページ」を編集する。
// - 事業タブ閲覧権: member_engagements (既存)。masp は仮想 engagement のため除外。
// - ページ権限: member_page_permissions (新規)。masp は member_page_permissions の masp 行のみで判定。
// - admin (users.role='admin') は権限テーブル無視で全閲覧可。UIでは編集不可・バッジ表示。

export default function PermissionSettings({ onToast }) {
  const orgId = getOrgId();
  const [members, setMembers] = useState([]);
  const [adminUserIds, setAdminUserIds] = useState(new Set()); // role='admin' なメンバーの user_id
  const [engagementsByDb, setEngagementsByDb] = useState([]); // [{id, slug, name}]
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 編集対象メンバーの権限ステート
  const [memberLoading, setMemberLoading] = useState(false);
  // 選択中: { 'masp': Set<page_key>, 'seller_sourcing': Set<page_key>, ... }
  const [selectedPages, setSelectedPages] = useState({});
  // 元の状態（差分検出用）
  const [origPages, setOrigPages] = useState({});
  const [origEngagementIds, setOrigEngagementIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  // ─── 初期ロード: メンバー一覧 + admin判定 + DB engagements
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgId) { setLoading(false); return; }
      setLoading(true);
      const [m, e, u] = await Promise.all([
        supabase.from('members')
          .select('id, name, email, position, rank, user_id, is_active, avatar_url')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('name'),
        supabase.from('engagements')
          .select('id, slug, name')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .order('display_order'),
        supabase.from('users')
          .select('id, role')
          .eq('role', 'admin'),
      ]);
      if (cancelled) return;
      setMembers(m.data || []);
      setEngagementsByDb(e.data || []);
      setAdminUserIds(new Set((u.data || []).map(r => r.id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // 検索フィルタ
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  }, [members, search]);

  const selectedMember = useMemo(
    () => members.find(m => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );
  const selectedIsAdmin = !!(selectedMember && selectedMember.user_id && adminUserIds.has(selectedMember.user_id));

  // engagement_slug → engagement_id の逆引き
  const engBySlug = useMemo(() => {
    const map = {};
    engagementsByDb.forEach(e => { map[e.slug] = e; });
    return map;
  }, [engagementsByDb]);

  // ─── 選択メンバーの権限を読み込み
  const loadMemberPermissions = useCallback(async (memberId) => {
    if (!memberId) return;
    setMemberLoading(true);
    const [me, mpp] = await Promise.all([
      supabase.from('member_engagements')
        .select('engagement_id')
        .eq('member_id', memberId),
      supabase.from('member_page_permissions')
        .select('engagement_slug, page_key')
        .eq('member_id', memberId),
    ]);
    const engIds = new Set((me.data || []).map(r => r.engagement_id));
    const pages = {};
    (mpp.data || []).forEach(r => {
      if (!pages[r.engagement_slug]) pages[r.engagement_slug] = new Set();
      pages[r.engagement_slug].add(r.page_key);
    });
    // 全 slug のキーを初期化
    ALL_ENGAGEMENT_SLUGS.forEach(s => { if (!pages[s]) pages[s] = new Set(); });

    setOrigEngagementIds(engIds);
    setOrigPages(pages);
    // ステートは Set のディープコピー
    setSelectedPages(Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, new Set(v)])));
    setMemberLoading(false);
  }, []);

  useEffect(() => {
    if (selectedMemberId) loadMemberPermissions(selectedMemberId);
  }, [selectedMemberId, loadMemberPermissions]);

  // ─── トグル操作
  const togglePage = (slug, pageKey) => {
    if (selectedIsAdmin) return;
    setSelectedPages(prev => {
      const next = { ...prev };
      const set = new Set(next[slug] || []);
      if (set.has(pageKey)) set.delete(pageKey); else set.add(pageKey);
      next[slug] = set;
      return next;
    });
  };
  const setEngagementAll = (slug, on) => {
    if (selectedIsAdmin) return;
    setSelectedPages(prev => {
      const next = { ...prev };
      next[slug] = new Set(on ? PAGE_REGISTRY[slug].map(p => p.key) : []);
      return next;
    });
  };

  // 事業タブ閲覧可否は「その事業のページが1つでも選択されているか」で判定
  const isEngagementOn = (slug) => {
    const set = selectedPages[slug];
    return !!(set && set.size > 0);
  };

  // ─── 保存
  const onSave = async () => {
    if (!selectedMemberId || selectedIsAdmin) return;
    setSaving(true);
    try {
      // 1) member_engagements を再構築（masp 以外）
      const desiredEngIds = new Set();
      ALL_ENGAGEMENT_SLUGS.forEach(slug => {
        if (slug === 'masp') return; // 仮想 engagement
        if (isEngagementOn(slug) && engBySlug[slug]) desiredEngIds.add(engBySlug[slug].id);
      });
      const toInsert = [...desiredEngIds].filter(id => !origEngagementIds.has(id));
      const toDelete = [...origEngagementIds].filter(id => !desiredEngIds.has(id));

      if (toDelete.length > 0) {
        const { error } = await supabase.from('member_engagements')
          .delete()
          .eq('member_id', selectedMemberId)
          .in('engagement_id', toDelete);
        if (error) throw error;
      }
      if (toInsert.length > 0) {
        const rows = toInsert.map(eid => ({ org_id: orgId, member_id: selectedMemberId, engagement_id: eid }));
        const { error } = await supabase.from('member_engagements').insert(rows);
        // 23505 は同時挿入時の重複（無視）
        if (error && error.code !== '23505') throw error;
      }

      // 2) member_page_permissions を再構築（全削除→insert で差分計算をシンプルに）
      const { error: delErr } = await supabase.from('member_page_permissions')
        .delete()
        .eq('member_id', selectedMemberId);
      if (delErr) throw delErr;

      const ppRows = [];
      ALL_ENGAGEMENT_SLUGS.forEach(slug => {
        const set = selectedPages[slug] || new Set();
        set.forEach(page_key => {
          ppRows.push({ org_id: orgId, member_id: selectedMemberId, engagement_slug: slug, page_key });
        });
      });
      if (ppRows.length > 0) {
        const { error: insErr } = await supabase.from('member_page_permissions').insert(ppRows);
        if (insErr) throw insErr;
      }

      // ステート更新
      setOrigEngagementIds(new Set(desiredEngIds));
      setOrigPages(Object.fromEntries(Object.entries(selectedPages).map(([k, v]) => [k, new Set(v)])));
      onToast?.({ type: 'success', message: '権限を保存しました' });
    } catch (err) {
      console.error('[PermissionSettings] save error', err);
      onToast?.({ type: 'error', message: '保存に失敗しました: ' + (err.message || '不明') });
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setSelectedPages(Object.fromEntries(Object.entries(origPages).map(([k, v]) => [k, new Set(v)])));
  };

  // 差分検出
  const isDirty = useMemo(() => {
    if (!selectedMemberId || selectedIsAdmin) return false;
    // engagement
    const desiredEngIds = new Set();
    ALL_ENGAGEMENT_SLUGS.forEach(slug => {
      if (slug === 'masp') return;
      if (isEngagementOn(slug) && engBySlug[slug]) desiredEngIds.add(engBySlug[slug].id);
    });
    if (desiredEngIds.size !== origEngagementIds.size) return true;
    for (const id of desiredEngIds) if (!origEngagementIds.has(id)) return true;
    // pages
    for (const slug of ALL_ENGAGEMENT_SLUGS) {
      const cur = selectedPages[slug] || new Set();
      const orig = origPages[slug] || new Set();
      if (cur.size !== orig.size) return true;
      for (const k of cur) if (!orig.has(k)) return true;
    }
    return false;
  }, [selectedMemberId, selectedIsAdmin, selectedPages, origPages, origEngagementIds, engBySlug]);

  // ─── レンダリング
  if (loading) {
    return (
      <div style={{ padding: space[10], textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: space[5], minHeight: 600 }}>
      {/* 左: メンバー一覧 */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <div style={{ marginBottom: space[3] }}>
          <Input
            placeholder="メンバー検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          background: color.white,
          maxHeight: 600,
          overflowY: 'auto',
        }}>
          {filteredMembers.map(m => {
            const active = m.id === selectedMemberId;
            const isAdminMember = m.user_id && adminUserIds.has(m.user_id);
            return (
              <div
                key={m.id}
                onClick={() => setSelectedMemberId(m.id)}
                style={{
                  padding: `${space[2]}px ${space[3]}px`,
                  borderLeft: active ? `3px solid ${color.navy}` : '3px solid transparent',
                  background: active ? alpha(color.navyLight, 0.08) : 'transparent',
                  borderBottom: `1px solid ${color.borderLight}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space[2],
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = alpha(color.navyLight, 0.04); }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.position || ''}
                  </div>
                </div>
                {isAdminMember && <Badge variant="primary">admin</Badge>}
              </div>
            );
          })}
          {filteredMembers.length === 0 && (
            <div style={{ padding: space[6], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
              メンバーがいません
            </div>
          )}
        </div>
      </div>

      {/* 右: 権限編集 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedMemberId ? (
          <div style={{ padding: space[10], textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>
            左のメンバー一覧から編集対象を選択してください
          </div>
        ) : memberLoading ? (
          <div style={{ padding: space[10], textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>
            読み込み中...
          </div>
        ) : (
          <div>
            {/* ヘッダー */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: space[3],
              padding: space[3], marginBottom: space[4],
              background: color.cream, borderRadius: radius.md,
              border: `1px solid ${color.border}`,
            }}>
              <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.textDark }}>
                {selectedMember?.name}
              </div>
              <div style={{ fontSize: font.size.sm, color: color.textMid }}>{selectedMember?.position}</div>
              <div style={{ flex: 1 }} />
              {selectedIsAdmin && (
                <Badge variant="primary">管理者：全権限保有（編集不可）</Badge>
              )}
            </div>

            {selectedIsAdmin && (
              <div style={{
                padding: space[3],
                marginBottom: space[4],
                background: color.infoSoft || alpha(color.info, 0.08),
                color: color.textDark,
                fontSize: font.size.sm,
                borderRadius: radius.md,
                border: `1px solid ${alpha(color.info, 0.25)}`,
              }}>
                管理者ロール（users.role = 'admin'）のメンバーは権限テーブルを無視して全画面を閲覧できます。権限を制限したい場合は、まずロールを admin から変更してください。
              </div>
            )}

            {/* 事業ごとのカード */}
            {ALL_ENGAGEMENT_SLUGS.map(slug => {
              const pages = PAGE_REGISTRY[slug];
              const set = selectedPages[slug] || new Set();
              const allOn = pages.length > 0 && pages.every(p => set.has(p.key));
              const anyOn = set.size > 0;
              return (
                <Card key={slug} padding="md" title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
                    <span>{ENGAGEMENT_LABELS[slug]}</span>
                    <Badge variant={anyOn ? 'success' : 'neutral'} dot>
                      {anyOn ? '閲覧可' : '非表示'}
                    </Badge>
                    <span style={{ fontSize: font.size.xs, color: color.textLight }}>
                      {set.size} / {pages.length} ページ
                    </span>
                  </div>
                } style={{ marginBottom: space[4] }}>
                  <div style={{ display: 'flex', gap: space[2], marginBottom: space[3] }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedIsAdmin || allOn}
                      onClick={() => setEngagementAll(slug, true)}
                    >全選択</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedIsAdmin || !anyOn}
                      onClick={() => setEngagementAll(slug, false)}
                    >全解除</Button>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: space[2],
                  }}>
                    {pages.map(p => {
                      const checked = set.has(p.key);
                      return (
                        <label
                          key={p.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: space[2],
                            padding: `${space[2]}px ${space[3]}px`,
                            border: `1px solid ${checked ? color.navy : color.border}`,
                            borderRadius: radius.md,
                            background: checked ? alpha(color.navyLight, 0.06) : color.white,
                            cursor: selectedIsAdmin ? 'not-allowed' : 'pointer',
                            opacity: selectedIsAdmin ? 0.6 : 1,
                            fontSize: font.size.sm,
                            color: color.textDark,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={selectedIsAdmin}
                            onChange={() => togglePage(slug, p.key)}
                            style={{ cursor: selectedIsAdmin ? 'not-allowed' : 'pointer' }}
                          />
                          <span style={{ flex: 1 }}>{p.label}</span>
                          {p.group && (
                            <span style={{ fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
                              {p.group}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Card>
              );
            })}

            {/* 保存ボタン */}
            <div style={{
              position: 'sticky',
              bottom: 0,
              background: color.white,
              padding: space[3],
              marginTop: space[4],
              borderTop: `1px solid ${color.border}`,
              display: 'flex',
              gap: space[2],
              justifyContent: 'flex-end',
              boxShadow: shadow.sm,
            }}>
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={selectedIsAdmin || !isDirty || saving}
              >キャンセル</Button>
              <Button
                variant="primary"
                onClick={onSave}
                disabled={selectedIsAdmin || !isDirty || saving}
                loading={saving}
              >保存</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
