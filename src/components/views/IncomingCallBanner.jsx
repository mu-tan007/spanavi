import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/colors';

const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

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
        filter: `org_id=eq.${ORG_ID}`,
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
      display: 'flex', flexDirection: 'column', gap: 10,
      zIndex: 9999,
    }}>
      {banners.map(b => (
        <div key={b.id} style={{
          background: C.navyDeep,
          borderRadius: 12,
          padding: '14px 18px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          minWidth: 300,
          animation: 'slideIn 0.3s ease',
          border: '1px solid ' + C.gold + '60',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: C.goldLight, fontWeight: 700, marginBottom: 4 }}>
                着信
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 2 }}>
                {b.company_name}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: "'JetBrains Mono'" }}>
                {b.caller_number}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => dismiss(b.id, b.recordId)}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: C.gold, color: C.navyDeep,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'",
                }}
              >
                対応済み
              </button>
              {onOpenCompany && b.item_id && (
                <button
                  onClick={() => { onOpenCompany(b.item_id); dismiss(b.id, b.recordId); }}
                  style={{
                    padding: '5px 12px', borderRadius: 6,
                    border: '1px solid ' + C.gold + '80',
                    background: 'transparent', color: C.goldLight,
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'Noto Sans JP'",
                  }}
                >
                  企業ページを開く
                </button>
              )}
              {onNavigateToIncoming && (
                <button
                  onClick={() => { onNavigateToIncoming(); dismiss(b.id, b.recordId); }}
                  style={{
                    padding: '5px 12px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'transparent', color: 'rgba(255,255,255,0.7)',
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'Noto Sans JP'",
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
