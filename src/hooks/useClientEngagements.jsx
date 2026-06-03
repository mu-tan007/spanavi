import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// クライアントが実際に動いている engagement の一覧を appointments から動的に検出する。
//
// 戻り値: { engagements, loading }
//   engagements: [{ id, slug, name }] 表示順 (name でソート、null は除外)
//
// なぜ appointments ベースか:
//   clients.engagement_id は単一値のため、LST のように「売り手も買い手もやってる」
//   兼業クライアントを表現できない。アポ実績ベースで横断的に拾うことで、
//   実態に即した engagement 切替えタブを表示できる。

export function useClientEngagements(clientId, orgId) {
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId || !orgId) { setEngagements([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // appointments から distinct な engagement_id を取得
      const { data: appoRows } = await supabase
        .from('appointments')
        .select('engagement_id')
        .eq('org_id', orgId)
        .eq('client_id', clientId)
        .not('engagement_id', 'is', null);
      if (cancelled) return;
      const distinctIds = [...new Set((appoRows || []).map(r => r.engagement_id))];
      if (distinctIds.length === 0) {
        setEngagements([]);
        setLoading(false);
        return;
      }
      // engagements マスタから対応行を取得
      const { data: engRows } = await supabase
        .from('engagements')
        .select('id, slug, name')
        .in('id', distinctIds);
      if (cancelled) return;
      setEngagements((engRows || []).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja')));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, orgId]);

  return { engagements, loading };
}
