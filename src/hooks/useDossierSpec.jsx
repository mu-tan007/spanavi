import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getDossierSpecBySlug, DEFAULT_DOSSIER_SPEC } from '../types/engagementDossierSpec';

// engagement_id から「アポ詳細レポート (CompanyDossierPanel)」spec を返すフック
//
// 戻り値: { spec, loading }
//   spec = engagementDossierSpec.js の SPECS_BY_SLUG エントリ
//          (axisLabel / newsSectionLabel / maspMemoLabels / aiTheme)
//   engagement_id が無い場合 = DEFAULT_DOSSIER_SPEC (M&A 売り手)
//
// メモリキャッシュ付き (engagement_id → slug)。

const slugCache = new Map();

export function useDossierSpec(engagementId) {
  const [spec, setSpec] = useState(() => {
    const slug = slugCache.get(engagementId);
    return slug ? getDossierSpecBySlug(slug) : DEFAULT_DOSSIER_SPEC;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!engagementId) { setSpec(DEFAULT_DOSSIER_SPEC); return; }
    const cached = slugCache.get(engagementId);
    if (cached !== undefined) { setSpec(getDossierSpecBySlug(cached)); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('engagements')
        .select('slug')
        .eq('id', engagementId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      const slug = data?.slug || null;
      slugCache.set(engagementId, slug);
      setSpec(getDossierSpecBySlug(slug));
    })();
    return () => { cancelled = true; };
  }, [engagementId]);

  return { spec, loading };
}
