import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// 買収タブの一覧データ（案件・仲介会社・担当者）をまとめて読む。
// 件数は数百件までの想定なので、一覧は全件を読んで画面側で絞り込む。
export function useAcqData() {
  const [deals, setDeals] = useState([]);
  const [firms, setFirms] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    const [d, f, c] = await Promise.all([
      supabase.from('acq_deal_list').select('*').order('received_on', { ascending: false, nullsFirst: false }),
      supabase.from('acq_firm_stats').select('*').order('name'),
      supabase.from('acq_contacts').select('*, firm:acq_firms(id,name)').order('name'),
    ]);
    const err = d.error || f.error || c.error;
    if (err) { setError(err); setLoading(false); return; }
    setDeals(d.data || []);
    setFirms(f.data || []);
    setContacts(c.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { deals, firms, contacts, loading, error, reload };
}

// 書類の鍵は ASCII だけ（Supabase Storage は日本語の鍵を受けない）。元の名前は DB に持つ。
export function buildDocKey(orgId, dealId, fileName) {
  const ext = (String(fileName).match(/\.([A-Za-z0-9]{1,8})$/) || [])[1];
  const rand = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${orgId}/${dealId}/${rand}${ext ? '.' + ext.toLowerCase() : ''}`;
}

// 押した瞬間に空のタブを開いてから署名付きURLへ移す（待ってから開くとポップアップとして止められる）
export async function openDocument(storagePath) {
  const win = window.open('', '_blank');
  try {
    const { data, error } = await supabase.storage.from('acq-docs').createSignedUrl(storagePath, 600);
    if (error) throw error;
    if (win) { win.opener = null; win.location.href = data.signedUrl; } else { window.location.assign(data.signedUrl); }
  } catch (e) {
    win?.close();
    throw e;
  }
}
