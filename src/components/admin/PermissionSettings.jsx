import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge, DataTable } from '../ui';
import { PAGE_REGISTRY, ENGAGEMENT_LABELS } from '../../constants/pageRegistry';

// 一括権限管理: メンバーごとに「閲覧可能な事業タブ」と「事業タブ内の閲覧可能ページ」を編集する。
// - 事業タブ閲覧権: member_engagements (既存)。masp は仮想 engagement のため除外。
// - ページ権限: member_page_permissions (新規)。masp は member_page_permissions の masp 行のみで判定。
// - admin (users.role='admin') は権限テーブル無視で全閲覧可。UIでは編集不可・バッジ表示。
// - 未設定メンバー（行が無い）は「現状見えているもの＝全部」を pre-check 状態とする。

export default function PermissionSettings({ onToast }) {
  const orgId = getOrgId();
  const [members, setMembers] = useState([]);
  const [adminUserIds, setAdminUserIds] = useState(new Set()); // role='admin' なメンバーの user_id
  const [engagementsByDb, setEngagementsByDb] = useState([]); // [{id, slug, name}]
  const [permissionCounts, setPermissionCounts] = useState({}); // { member_id: count }
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

  // ─── 初期ロード: メンバー一覧 + admin判定 + DB engagements + 全メンバーの権限件数
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgId) { setLoading(false); return; }
      setLoading(true);
      const [m, e, u, mpp] = await Promise.all([
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
        supabase.from('member_page_permissions')
          .select('member_id')
          .eq('org_id', orgId),
      ]);
      if (cancelled) return;
      setMembers(m.data || []);
      setEngagementsByDb(e.data || []);
      setAdminUserIds(new Set((u.data || []).map(r => r.id)));
      const counts = {};
      (mpp.data || []).forEach(r => { counts[r.member_id] = (counts[r.member_id] || 0) + 1; });
      setPermissionCounts(counts);
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

  // 表示対象の事業slug: 'masp'（仮想・常時表示）+ DBに存在し PAGE_REGISTRY にも定義がある active engagement
  // → DBから事業を archived/削除すれば自動的にこの画面からも消える
  const displayedSlugs = useMemo(() => {
    const dbSlugs = engagementsByDb.map(e => e.slug).filter(s => PAGE_REGISTRY[s]);
    const arr = [];
    if (PAGE_REGISTRY.masp) arr.push('masp');
    dbSlugs.forEach(s => { if (s !== 'masp') arr.push(s); });
    return arr;
  }, [engagementsByDb]);

  // 表示用ラベル: DB engagements.name を優先、無ければ ENGAGEMENT_LABELS フォールバック
  const labelFor = useCallback((slug) => {
    if (slug === 'masp') return ENGAGEMENT_LABELS.masp;
    const eng = engBySlug[slug];
    return eng?.name || ENGAGEMENT_LABELS[slug] || slug;
  }, [engBySlug]);

  // 表示対象事業の合計ページ数（権限カウント表示の分母）
  const totalDisplayedPages = useMemo(
    () => displayedSlugs.reduce((sum, slug) => sum + (PAGE_REGISTRY[slug]?.length || 0), 0),
    [displayedSlugs]
  );

  // 「全部許可」のデフォルト状態を生成（displayedSlugs 全てのページを set に積む）
  const buildAllAllowed = useCallback(() => {
    const out = {};
    displayedSlugs.forEach(slug => {
      out[slug] = new Set((PAGE_REGISTRY[slug] || []).map(p => p.key));
    });
    return out;
  }, [displayedSlugs]);

  // 「全DB engagement に所属している」のデフォルト engagement_id Set
  const buildAllEngagementIds = useCallback(() => {
    const set = new Set();
    displayedSlugs.forEach(slug => {
      if (slug === 'masp') return;
      if (engBySlug[slug]) set.add(engBySlug[slug].id);
    });
    return set;
  }, [displayedSlugs, engBySlug]);

  // ─── 選択メンバーの権限を読み込み
  // member_page_permissions に該当メンバーの行が0件なら「未設定 = 現状全部見える」と解釈し、
  // displayedSlugs の全ページを pre-check した状態で UI を初期化する。
  // 同様に member_engagements が0件なら全DB engagementに所属していると解釈する。
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

    // ── ページ権限
    let pages;
    if (!mpp.data || mpp.data.length === 0) {
      // 未設定 → 全部許可で pre-check
      pages = buildAllAllowed();
    } else {
      pages = {};
      mpp.data.forEach(r => {
        if (!pages[r.engagement_slug]) pages[r.engagement_slug] = new Set();
        pages[r.engagement_slug].add(r.page_key);
      });
      // 表示対象 slug のキーを初期化（rows に無くても空 Set を用意）
      displayedSlugs.forEach(s => { if (!pages[s]) pages[s] = new Set(); });
    }

    // ── 事業所属
    let engIds;
    if (!me.data || me.data.length === 0) {
      // 未設定 → 全DB engagement に所属している扱い
      engIds = buildAllEngagementIds();
    } else {
      engIds = new Set(me.data.map(r => r.engagement_id));
    }

    setOrigEngagementIds(engIds);
    setOrigPages(pages);
    // ステートは Set のディープコピー
    setSelectedPages(Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, new Set(v)])));
    setMemberLoading(false);
  }, [buildAllAllowed, buildAllEngagementIds, displayedSlugs]);

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
      displayedSlugs.forEach(slug => {
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
      displayedSlugs.forEach(slug => {
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
      setPermissionCounts(prev => ({ ...prev, [selectedMemberId]: ppRows.length }));
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
    displayedSlugs.forEach(slug => {
      if (slug === 'masp') return;
      if (isEngagementOn(slug) && engBySlug[slug]) desiredEngIds.add(engBySlug[slug].id);
    });
    if (desiredEngIds.size !== origEngagementIds.size) return true;
    for (const id of desiredEngIds) if (!origEngagementIds.has(id)) return true;
    // pages
    for (const slug of displayedSlugs) {
      const cur = selectedPages[slug] || new Set();
      const orig = origPages[slug] || new Set();
      if (cur.size !== orig.size) return true;
      for (const k of cur) if (!orig.has(k)) return true;
    }
    return false;
  }, [selectedMemberId, selectedIsAdmin, selectedPages, origPages, origEngagementIds, engBySlug, displayedSlugs]);

  // ─── DataTable 用の列定義（揃え: 名前/役職=left, ロール=center, 権限ページ数=right）
  const memberColumns = useMemo(() => [
    {
      key: 'name', label: 'メンバー', width: 140, align: 'left',
      render: (m) => (
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: font.weight.semibold, color: color.textDark }}>
          {m.name}
        </div>
      ),
    },
    {
      key: 'position', label: '役職', width: 100, align: 'left',
      render: (m) => (
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.textMid }}>
          {m.position || '-'}
        </div>
      ),
    },
    {
      key: 'role', label: 'ロール', width: 80, align: 'center',
      render: (m) => {
        const isAdminMember = m.user_id && adminUserIds.has(m.user_id);
        return isAdminMember
          ? <Badge variant="primary">admin</Badge>
          : <span style={{ fontSize: font.size.xs, color: color.textLight }}>member</span>;
      },
    },
    {
      key: 'permCount', label: '権限ページ', width: 110, align: 'right',
      render: (m) => {
        const isAdminMember = m.user_id && adminUserIds.has(m.user_id);
        if (isAdminMember) {
          return <span style={{ fontSize: font.size.sm, color: color.textLight, fontFamily: font.family.mono }}>—</span>;
        }
        const count = permissionCounts[m.id] || 0;
        // 0件 = 未設定（現状全部見える状態）。そのことが分かるよう neutral バッジで明示。
        if (count === 0) {
          return <Badge variant="neutral">未設定</Badge>;
        }
        return (
          <span style={{
            fontFamily: font.family.mono,
            fontSize: font.size.sm,
            color: color.textDark,
            fontWeight: font.weight.medium,
          }}>
            {count} / {totalDisplayedPages}
          </span>
        );
      },
    },
  ], [adminUserIds, permissionCounts, totalDisplayedPages]);

  return (
    <div style={{ display: 'flex', gap: space[5], minHeight: 600 }}>
      {/* 左: メンバー一覧 (DataTable) */}
      <div style={{ width: 460, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: space[3] }}>
          <Input
            placeholder="メンバー検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DataTable
          ariaLabel="権限管理メンバー一覧"
          columns={memberColumns}
          rows={filteredMembers}
          rowKey="id"
          loading={loading}
          emptyMessage="メンバーがいません"
          onRowClick={(m) => setSelectedMemberId(m.id)}
          rowAccent={(m) => m.id === selectedMemberId ? 'primary' : null}
          rowBackground={(m) => m.id === selectedMemberId ? alpha(color.navyLight, 0.08) : null}
          height="calc(100vh - 320px)"
          showCount
        />
      </div>

      {/* 右: 権限編集 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedMemberId ? (
          <div style={{
            padding: space[10], textAlign: 'center', color: color.textMid, fontSize: font.size.base,
            background: color.cream, border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
          }}>
            左のメンバー一覧から編集対象を選択してください
          </div>
        ) : memberLoading ? (
          <div style={{ padding: space[10], textAlign: 'center', color: color.textMid, fontSize: font.size.base }}>
            読み込み中...
          </div>
        ) : (
          <div>
            {/* ヘッダー Card */}
            <Card
              padding="md"
              title={selectedMember?.name || ''}
              description={selectedMember?.position || ''}
              action={selectedIsAdmin ? <Badge variant="primary">管理者：全権限保有（編集不可）</Badge> : null}
              style={{ marginBottom: space[4] }}
            >
              {selectedIsAdmin && (
                <div style={{
                  fontSize: font.size.sm,
                  color: color.textMid,
                  lineHeight: font.lineHeight.relaxed,
                }}>
                  管理者ロール（users.role = 'admin'）のメンバーは権限テーブルを無視して全画面を閲覧できます。権限を制限したい場合は、まずロールを admin から変更してください。
                </div>
              )}
            </Card>

            {/* 事業ごとのカード — DBに存在する active engagement のみ */}
            {displayedSlugs.map(slug => {
              const pages = PAGE_REGISTRY[slug];
              const set = selectedPages[slug] || new Set();
              const allOn = pages.length > 0 && pages.every(p => set.has(p.key));
              const anyOn = set.size > 0;
              return (
                <Card
                  key={slug}
                  padding="md"
                  title={labelFor(slug)}
                  action={
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                      <Badge variant={anyOn ? 'success' : 'neutral'} dot>
                        {anyOn ? '閲覧可' : '非表示'}
                      </Badge>
                      <span style={{
                        fontSize: font.size.xs,
                        color: color.textLight,
                        fontFamily: font.family.mono,
                      }}>
                        {set.size} / {pages.length}
                      </span>
                    </div>
                  }
                  style={{ marginBottom: space[4] }}
                >
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
