import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { Button } from '../ui';
import { PAGE_REGISTRY, ENGAGEMENT_LABELS } from '../../constants/pageRegistry';
import './PermissionSettings.css';

// 一括権限管理: メンバーごとに「事業タブ内の閲覧可能ページ」をホワイトリスト方式で編集する。
//
// 役割分担：
// - 事業タブ閲覧権 = MASP > Members の所属チェックボックス（member_engagements）が唯一のソース
//   → この画面では事業のON/OFFは扱わない（所属している事業のみページ単位で編集可能）
// - ページ権限 = この画面で編集（member_page_permissions）
// - MASP（全社） = admin 専用ハードコード。一般メンバー設定の対象外
// - admin (users.role='admin') は権限テーブル無視で全閲覧可。UIでは編集不可・バッジ表示
// - 未設定メンバー（行が無い）は「現状見えているもの＝所属事業の全ページ」を pre-check で表示

// engagementId を渡すと、その事業に所属する人とその事業のページだけを出す（メンバーのページから開くとき・2026-10-08）
export default function PermissionSettings({ onToast, engagementId = null }) {
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
          .select('member_id, engagement_slug')
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
      (mpp.data || []).forEach(r => {
        const c = counts[r.member_id] || (counts[r.member_id] = {});
        c[r.engagement_slug] = (c[r.engagement_slug] || 0) + 1;
      });
      setPermissionCounts(counts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // 検索フィルタ
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inScope = engagementId
      ? members.filter(m => (memberEngagementMap.get(m.id) || new Set()).has(engagementId) && m.rank !== 'student')
      : members;
    if (!q) return inScope;
    return inScope.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  }, [members, search, engagementId, memberEngagementMap]);

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
      .filter(e => !engagementId || e.id === engagementId)
      .map(e => e.slug);
  }, [selectedMemberId, memberEngagementMap, engagementsByDb, engagementId]);

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
      // 画面に出している事業の分だけ消して入れ直す（他の事業の権限は触らない・2026-10-08）
      if (displayedSlugs.length === 0) { setSaving(false); return; }
      const { error: delErr } = await supabase.from('member_page_permissions')
        .delete()
        .eq('member_id', selectedMemberId)
        .in('engagement_slug', displayedSlugs);
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
      setPermissionCounts(prev => ({ ...prev, [selectedMemberId]: { ...(prev[selectedMemberId] || {}), ...Object.fromEntries(displayedSlugs.map(sl => [sl, (selectedPages[sl] || new Set()).size])) } }));
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

  // その人の「見られるページ数 / 全ページ数」（画面に出す事業の分だけ）
  const meterOf = (m) => {
    const memberEngs = memberEngagementMap.get(m.id) || new Set();
    const slugs = engagementsByDb
      .filter(e => e.slug !== 'masp' && PAGE_REGISTRY[e.slug] && memberEngs.has(e.id) && (!engagementId || e.id === engagementId))
      .map(e => e.slug);
    const denom = slugs.reduce((n, sl) => n + PAGE_REGISTRY[sl].length, 0);
    const c = permissionCounts[m.id] || {};
    const count = slugs.reduce((n, sl) => n + Math.min(c[sl] || 0, PAGE_REGISTRY[sl].length), 0);
    return { count, denom };
  };
  const initial = (m) => (m?.name || '?').trim().charAt(0);
  const avatar = (m) => <span className="ps-av">{m?.avatar_url ? <img src={m.avatar_url} alt="" /> : initial(m)}</span>;

  // 区分ごとに並べる（PAGE_REGISTRY の group）
  const groupsOf = (slug) => {
    const out = [];
    (PAGE_REGISTRY[slug] || []).forEach(pg => {
      let g = out.find(x => x.name === pg.group);
      if (!g) { g = { name: pg.group, pages: [] }; out.push(g); }
      g.pages.push(pg);
    });
    return out;
  };
  const setGroup = (slug, keys, on) => {
    if (selectedIsAdmin) return;
    setSelectedPages(prev => {
      const set = new Set(prev[slug] || []);
      keys.forEach(k => (on ? set.add(k) : set.delete(k)));
      return { ...prev, [slug]: set };
    });
  };
  const totalOn = displayedSlugs.reduce((n, sl) => n + (selectedPages[sl]?.size || 0), 0);
  const totalAll = displayedSlugs.reduce((n, sl) => n + PAGE_REGISTRY[sl].length, 0);
  let changed = 0;
  displayedSlugs.forEach(sl => {
    const cur = selectedPages[sl] || new Set();
    const orig = origPages[sl] || new Set();
    cur.forEach(k => { if (!orig.has(k)) changed++; });
    orig.forEach(k => { if (!cur.has(k)) changed++; });
  });

  return (
    <div className="ps">
      <div className="ps-l">
        <input className="ps-search" placeholder="名前・メールで探す" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ps-list">
          {loading && <div className="ps-empty" style={{ border: 0 }}>読み込み中…</div>}
          {!loading && filteredMembers.length === 0 && <div className="ps-empty" style={{ border: 0 }}>該当する人がいません</div>}
          {!loading && filteredMembers.map((m, i) => {
            const isAdminMember = m.user_id && adminUserIds.has(m.user_id);
            const { count, denom } = meterOf(m);
            return (
              <div key={m.id} className={`ps-p${m.id === selectedMemberId ? ' on' : ''}`} style={{ animationDelay: `${Math.min(i, 14) * 0.02}s` }} onClick={() => setSelectedMemberId(m.id)}>
                {avatar(m)}
                <span style={{ minWidth: 0 }}><b>{m.name}</b><small>{m.position || m.rank || 'メンバー'}</small></span>
                {isAdminMember
                  ? <span className="ps-meter admin">管理者</span>
                  : <span className="ps-meter">{denom ? `${count}/${denom}` : '—'}<i><span style={{ width: denom ? `${(count / denom) * 100}%` : 0 }} /></i></span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ps-r">
        {!selectedMemberId ? (
          <div className="ps-empty">左から人を選ぶと、見られるページを切り替えられます</div>
        ) : memberLoading ? (
          <div className="ps-empty">読み込み中…</div>
        ) : (
          <>
            <div className="ps-head" key={selectedMemberId}>
              {avatar(selectedMember)}
              <div className="grow">
                <h3>{selectedMember?.name}</h3>
                <p>{selectedIsAdmin ? '管理者はすべてのページを見られます' : `${displayedSlugs.map(labelFor).join('・') || '所属している事業がありません'}${displayedSlugs.length ? 'のページ' : ''}`}</p>
              </div>
              {!selectedIsAdmin && totalAll > 0 && <span className="ps-big">{totalOn}<small>/ {totalAll}</small></span>}
            </div>
            {selectedIsAdmin && <div className="ps-lock">管理者の権限は、この画面では変えられません。</div>}
            {!selectedIsAdmin && displayedSlugs.length === 0 && <div className="ps-empty">この人はまだ事業に所属していません。メンバーの追加・名簿で所属を付けると、ここに出ます。</div>}
            {displayedSlugs.map(slug => {
              const set = selectedPages[slug] || new Set();
              return (
                <div key={slug} className="ps-groups">
                  {groupsOf(slug).map((g, gi) => {
                    const keys = g.pages.map(pg => pg.key);
                    const allOn = keys.every(k => set.has(k));
                    return (
                      <section key={g.name} className="ps-g" style={{ animationDelay: `${gi * 0.04}s` }}>
                        <header>
                          <b>{g.name}</b>
                          <button type="button" disabled={selectedIsAdmin} onClick={() => setGroup(slug, keys, !allOn)}>{allOn ? 'すべて外す' : 'すべて見せる'}</button>
                        </header>
                        {g.pages.map(pg => {
                          const on = selectedIsAdmin || set.has(pg.key);
                          return (
                            <div key={pg.key} className={`ps-row${on ? '' : ' off'}${selectedIsAdmin ? ' lock' : ''}`} onClick={() => togglePage(slug, pg.key)} role="switch" aria-checked={on}>
                              <span>{pg.label}</span><i className="ps-sw" />
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
              );
            })}
            {isDirty && (
              <div className="ps-save">
                <span><b>{changed}</b> か所を変えました</span>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} style={{ color: '#fff' }}>元に戻す</Button>
                <Button size="sm" variant="primary" onClick={onSave} loading={saving}>保存</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
