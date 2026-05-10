import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge, DataTable } from '../ui';
import { PAGE_REGISTRY, ENGAGEMENT_LABELS } from '../../constants/pageRegistry';

// 一括権限管理: メンバーごとに「事業タブ内の閲覧可能ページ」をホワイトリスト方式で編集する。
//
// 役割分担：
// - 事業タブ閲覧権 = MASP > Members の所属チェックボックス（member_engagements）が唯一のソース
//   → この画面では事業のON/OFFは扱わない（所属している事業のみページ単位で編集可能）
// - ページ権限 = この画面で編集（member_page_permissions）
// - MASP（全社） = admin 専用ハードコード。一般メンバー設定の対象外
// - admin (users.role='admin') は権限テーブル無視で全閲覧可。UIでは編集不可・バッジ表示
// - 未設定メンバー（行が無い）は「現状見えているもの＝所属事業の全ページ」を pre-check で表示

export default function PermissionSettings({ onToast }) {
  const orgId = getOrgId();
  const [members, setMembers] = useState([]);
  const [adminUserIds, setAdminUserIds] = useState(new Set()); // role='admin' なメンバーの user_id
  const [engagementsByDb, setEngagementsByDb] = useState([]); // [{id, slug, name}]
  const [memberEngagementMap, setMemberEngagementMap] = useState(new Map()); // member_id -> Set<engagement_id>
  const [permissionCounts, setPermissionCounts] = useState({}); // { member_id: count }
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 編集対象メンバーの権限ステート
  const [memberLoading, setMemberLoading] = useState(false);
  // 選択中: { 'seller_sourcing': Set<page_key>, ... }（所属事業のみ）
  const [selectedPages, setSelectedPages] = useState({});
  // 元の状態（差分検出用）
  const [origPages, setOrigPages] = useState({});
  const [saving, setSaving] = useState(false);

  // ─── 初期ロード: メンバー一覧 + admin判定 + DB engagements + 全メンバーの所属 + 権限件数
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgId) { setLoading(false); return; }
      setLoading(true);
      const [m, e, u, me, mpp] = await Promise.all([
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
        supabase.from('member_engagements')
          .select('member_id, engagement_id')
          .eq('org_id', orgId),
        supabase.from('member_page_permissions')
          .select('member_id')
          .eq('org_id', orgId),
      ]);
      if (cancelled) return;
      setMembers(m.data || []);
      setEngagementsByDb(e.data || []);
      setAdminUserIds(new Set((u.data || []).map(r => r.id)));

      const meMap = new Map();
      (me.data || []).forEach(r => {
        if (!meMap.has(r.member_id)) meMap.set(r.member_id, new Set());
        meMap.get(r.member_id).add(r.engagement_id);
      });
      setMemberEngagementMap(meMap);

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

  // 表示対象の事業slug: 「選択中メンバーが所属している事業（member_engagements）」 ∩
  // 「DBに存在 active」 ∩ 「PAGE_REGISTRY 定義済み」、masp は admin 専用なので必ず除外。
  // メンバー未選択のときは空配列（右ペインは空状態を表示）。
  const displayedSlugs = useMemo(() => {
    if (!selectedMemberId) return [];
    const memberEngs = memberEngagementMap.get(selectedMemberId) || new Set();
    return engagementsByDb
      .filter(e => e.slug !== 'masp')
      .filter(e => PAGE_REGISTRY[e.slug])
      .filter(e => memberEngs.has(e.id))
      .map(e => e.slug);
  }, [selectedMemberId, memberEngagementMap, engagementsByDb]);

  // 表示用ラベル: DB engagements.name を優先、無ければ ENGAGEMENT_LABELS フォールバック
  const labelFor = useCallback((slug) => {
    const eng = engBySlug[slug];
    return eng?.name || ENGAGEMENT_LABELS[slug] || slug;
  }, [engBySlug]);

  // 「所属事業の全ページ許可」のデフォルト状態を生成
  const buildAllAllowedForMember = useCallback((memberId) => {
    const out = {};
    const memberEngs = memberEngagementMap.get(memberId) || new Set();
    engagementsByDb
      .filter(e => e.slug !== 'masp' && PAGE_REGISTRY[e.slug] && memberEngs.has(e.id))
      .forEach(e => {
        out[e.slug] = new Set((PAGE_REGISTRY[e.slug] || []).map(p => p.key));
      });
    return out;
  }, [memberEngagementMap, engagementsByDb]);

  // ─── 選択メンバーの権限を読み込み
  // 事業所属は MASP > Members で管理されるため取得不要。ページ権限のみフェッチ。
  // member_page_permissions に行が0件のメンバーは「未設定 = 所属事業の全ページ見える」状態。
  const loadMemberPermissions = useCallback(async (memberId) => {
    if (!memberId) return;
    setMemberLoading(true);
    const { data: mppData } = await supabase
      .from('member_page_permissions')
      .select('engagement_slug, page_key')
      .eq('member_id', memberId);

    let pages;
    if (!mppData || mppData.length === 0) {
      // 未設定 → 所属事業の全ページを pre-check
      pages = buildAllAllowedForMember(memberId);
    } else {
      pages = {};
      mppData.forEach(r => {
        if (!pages[r.engagement_slug]) pages[r.engagement_slug] = new Set();
        pages[r.engagement_slug].add(r.page_key);
      });
    }

    setOrigPages(pages);
    setSelectedPages(Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, new Set(v)])));
    setMemberLoading(false);
  }, [buildAllAllowedForMember]);

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

  // ─── 保存（ページ権限のみ。事業所属は MASP > Members 側で管理）
  const onSave = async () => {
    if (!selectedMemberId || selectedIsAdmin) return;
    setSaving(true);
    try {
      // 全削除 → insert（差分計算をシンプルに）
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

  // 差分検出（ページのみ）
  const isDirty = useMemo(() => {
    if (!selectedMemberId || selectedIsAdmin) return false;
    for (const slug of displayedSlugs) {
      const cur = selectedPages[slug] || new Set();
      const orig = origPages[slug] || new Set();
      if (cur.size !== orig.size) return true;
      for (const k of cur) if (!orig.has(k)) return true;
    }
    return false;
  }, [selectedMemberId, selectedIsAdmin, selectedPages, origPages, displayedSlugs]);

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
        // 分母: そのメンバーが所属している事業の合計ページ数
        const memberEngs = memberEngagementMap.get(m.id) || new Set();
        const denom = engagementsByDb
          .filter(e => e.slug !== 'masp' && PAGE_REGISTRY[e.slug] && memberEngs.has(e.id))
          .reduce((sum, e) => sum + PAGE_REGISTRY[e.slug].length, 0);
        const count = permissionCounts[m.id] || 0;
        if (denom === 0) {
          // 所属事業ゼロ
          return <Badge variant="neutral">所属なし</Badge>;
        }
        if (count === 0) {
          // 行が無い = 未設定 = 所属事業の全ページ見える状態
          return <Badge variant="neutral">未設定</Badge>;
        }
        return (
          <span style={{
            fontFamily: font.family.mono,
            fontSize: font.size.sm,
            color: color.textDark,
            fontWeight: font.weight.medium,
          }}>
            {count} / {denom}
          </span>
        );
      },
    },
  ], [adminUserIds, permissionCounts, memberEngagementMap, engagementsByDb]);

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
              {selectedIsAdmin ? (
                <div style={{
                  fontSize: font.size.sm,
                  color: color.textMid,
                  lineHeight: font.lineHeight.relaxed,
                }}>
                  管理者ロール（users.role = 'admin'）のメンバーは権限テーブルを無視して全画面を閲覧できます。権限を制限したい場合は、まずロールを admin から変更してください。
                </div>
              ) : (
                <div style={{
                  fontSize: font.size.sm,
                  color: color.textMid,
                  lineHeight: font.lineHeight.relaxed,
                }}>
                  この画面で操作するのは <strong>ページ単位の閲覧権限</strong>のみ。事業タブ自体のON/OFFは <strong>MASP &gt; Members の所属事業チェックボックス</strong> で管理されています（このメンバーが所属している事業だけが下に表示されます）。MASP（全社）は admin 専用のため設定対象外です。
                </div>
              )}
            </Card>

            {/* 所属事業ゼロの空状態 */}
            {!selectedIsAdmin && displayedSlugs.length === 0 && (
              <div style={{
                padding: space[8], textAlign: 'center',
                background: color.cream, border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
                color: color.textMid, fontSize: font.size.base, lineHeight: font.lineHeight.relaxed,
              }}>
                このメンバーはまだ事業に所属していません。<br />
                <span style={{ fontSize: font.size.sm, color: color.textLight }}>
                  MASP &gt; Members 画面で所属事業をチェックすると、ここに事業ごとのページ権限が表示されます。
                </span>
              </div>
            )}

            {/* 事業ごとのカード — メンバーが所属している事業のみ */}
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
