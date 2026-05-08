import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';

import { getOrgId } from '../../lib/orgContext';

export default function IncomingCallBanner({ onNavigateToIncoming, onOpenCompany }) {
  const [banners, setBanners] = useState([]); // [{ id, company_name, caller_number, recordId, item_id }]
  const timersRef = useRef({});

  const dismiss = async (bannerId, recordId) => {
    // タイマーをクリア
    if (timersRef.current[bannerId]) {
      clearTimeout(timersRef.current[bannerId]);
      delete timersRef.current[bannerId];
    }
    // DBを対応済みに更新
    await supabase
      .from('incoming_calls')
      .update({ status: '対応済み' })
      .eq('id', recordId);
    setBanners(prev => prev.filter(b => b.id !== bannerId));
  };

  const autoDismiss = (bannerId, recordId) => {
    timersRef.current[bannerId] = setTimeout(() => {
      setBanners(prev => prev.filter(b => b.id !== bannerId));
      delete timersRef.current[bannerId];
    }, 10000);
  };

  useEffect(() => {
    const channel = supabase
      .channel('incoming-calls-banner')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'incoming_calls',
        filter: `org_id=eq.${getOrgId()}`,
      }, (payload) => {
        const rec = payload.new;
        const bannerId = rec.id;
        setBanners(prev => [...prev, {
          id: bannerId,
          company_name: rec.company_name || '不明',
          caller_number: rec.caller_number || '番号不明',
          recordId: rec.id,
          item_id: rec.item_id || null,
        }]);
        autoDismiss(bannerId, rec.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  if (banners.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: space[2.5],
      zIndex: 9999,
    }}>
      {banners.map(b => (
        <div key={b.id} style={{
          background: color.navyDeep,
          borderRadius: 12,
          padding: `${space[3] + 2}px ${space[4] + 2}px`,
          boxShadow: shadow.xl,
          minWidth: 300,
          animation: 'slideIn 0.3s ease',
          border: `1px solid ${alpha(color.gold, 0.4)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
            <div>
              <div style={{ fontSize: font.size.xs, color: color.goldLight, fontWeight: font.weight.bold, marginBottom: 4 }}>
                着信
              </div>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.white, marginBottom: 2 }}>
                {b.company_name}
              </div>
              <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.6), fontFamily: font.family.mono }}>
                {b.caller_number}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => dismiss(b.id, b.recordId)}
                style={{
                  padding: '5px 12px', borderRadius: radius.lg, border: 'none',
                  background: color.gold, color: color.navyDeep,
                  fontSize: font.size.xs, fontWeight: font.weight.bold, cursor: 'pointer',
                  fontFamily: font.family.sans,
                }}
              >
                対応済み
              </button>
              {onOpenCompany && b.item_id && (
                <button
                  onClick={() => { onOpenCompany(b.item_id); dismiss(b.id, b.recordId); }}
                  style={{
                    padding: '5px 12px', borderRadius: radius.lg,
                    border: `1px solid ${alpha(color.gold, 0.5)}`,
                    background: 'transparent', color: color.goldLight,
                    fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, cursor: 'pointer',
                    fontFamily: font.family.sans,
                  }}
                >
                  企業ページを開く
                </button>
              )}
              {onNavigateToIncoming && (
                <button
                  onClick={() => { onNavigateToIncoming(); dismiss(b.id, b.recordId); }}
                  style={{
                    padding: '5px 12px', borderRadius: radius.lg,
                    border: `1px solid ${alpha(color.white, 0.2)}`,
                    background: 'transparent', color: alpha(color.white, 0.7),
                    fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, cursor: 'pointer',
                    fontFamily: font.family.sans,
                  }}
                >
                  履歴を見る
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
