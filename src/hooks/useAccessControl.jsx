import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const AccessControlContext = createContext(null);

/**
 * メンバーごとの「事業タブ閲覧権限」と「ページ閲覧権限」を管理する Context。
 *
 * - 事業タブの閲覧可否は member_engagements で管理（既存テーブル再利用）
 *   ※ ただし MASP は engagements に存在しない仮想 engagement のため、
 *      member_page_permissions に masp の何らかのページ行があれば閲覧可、と判定する
 * - ページの閲覧可否は member_page_permissions で管理
 * - role === 'admin' のユーザーは全閲覧可（テーブル無視）
 */
export function AccessControlProvider({ children }) {
  const { profile, isAdmin, loading: authLoading } = useAuth();
  const [memberId, setMemberId] = useState(null);
  const [engagementSlugs, setEngagementSlugs] = useState(new Set()); // 自分が見られる engagement_slug
  const [pageKeys, setPageKeys] = useState(new Map()); // engagement_slug -> Set<page_key>
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (authLoading) return;
    if (!profile?.id || !profile?.org_id) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1) 自分の members.id を取得
    const { data: me } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', profile.id)
      .eq('org_id', profile.org_id)
      .maybeSingle();

    let resolvedMemberId = me?.id || null;

    // フォールバック: email pattern user_<id>@masp-internal.com から抽出
    if (!resolvedMemberId && profile.email) {
      const match = profile.email.match(/^user_(.+)@(?:masp-internal\.com|[a-f0-9-]+\.spanavi\.internal)$/);
      if (match) resolvedMemberId = match[1];
    }
    // フォールバック: 実メールで members.email
    if (!resolvedMemberId && profile.email) {
      const { data: byEmail } = await supabase
        .from('members')
        .select('id')
        .eq('email', profile.email)
        .eq('org_id', profile.org_id)
        .maybeSingle();
      if (byEmail) resolvedMemberId = byEmail.id;
    }

    setMemberId(resolvedMemberId);

    if (!resolvedMemberId) {
      setEngagementSlugs(new Set());
      setPageKeys(new Map());
      setLoading(false);
      return;
    }

    // 2) member_engagements (DB engagements の slug)
    const { data: meRows } = await supabase
      .from('member_engagements')
      .select('engagement:engagements(slug)')
      .eq('member_id', resolvedMemberId);

    const slugs = new Set();
    (meRows || []).forEach(r => {
      const s = r.engagement?.slug;
      if (s) slugs.add(s);
    });

    // 3) member_page_permissions
    const { data: ppRows } = await supabase
      .from('member_page_permissions')
      .select('engagement_slug, page_key')
      .eq('member_id', resolvedMemberId);

    const pmap = new Map();
    (ppRows || []).forEach(r => {
      if (!pmap.has(r.engagement_slug)) pmap.set(r.engagement_slug, new Set());
      pmap.get(r.engagement_slug).add(r.page_key);
    });

    setEngagementSlugs(slugs);
    setPageKeys(pmap);
    setLoading(false);
  }, [authLoading, profile?.id, profile?.org_id, profile?.email]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const canViewEngagement = useCallback((slug) => {
    if (isAdmin) return true;
    if (!slug) return false;
    return engagementSlugs.has(slug);
  }, [isAdmin, engagementSlugs]);

  const canViewPage = useCallback((slug, pageKey) => {
    if (isAdmin) return true;
    if (!slug || !pageKey) return false;
    const set = pageKeys.get(slug);
    return !!(set && set.has(pageKey));
  }, [isAdmin, pageKeys]);

  const value = useMemo(() => ({
    memberId,
    canViewEngagement,
    canViewPage,
    loading: loading || authLoading,
    refresh: fetchAll,
  }), [memberId, canViewEngagement, canViewPage, loading, authLoading, fetchAll]);

  return (
    <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>
  );
}

export function useAccessControl() {
  const ctx = useContext(AccessControlContext);
  if (!ctx) {
    // Provider 未マウント時は常に許可（admin と同等の挙動）。
    // 設計上はアプリ全体を Provider で包むので通常通らないが、
    // テストや特殊画面（ログイン前など）でフェイルオープンするためのフォールバック。
    return {
      memberId: null,
      canViewEngagement: () => true,
      canViewPage: () => true,
      loading: false,
      refresh: () => {},
    };
  }
  return ctx;
}
