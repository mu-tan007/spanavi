import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { C } from '../../constants/colors';

// 通話時間をフォーマット
const formatDuration = (startIso) => {
  if (!startIso) return '0:00';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function CallMonitorPanel() {
  const [activeCalls, setActiveCalls] = useState([]);
  const [, setTick] = useState(0); // 通話時間更新用
  const tickRef = useRef(null);

  // 初回ロード: 現在のactive callsを取得
  useEffect(() => {
    const orgId = getOrgId();
    if (!orgId) return;

    const load = async () => {
      const { data } = await supabase
        .from('active_calls')
        .select('*')
        .eq('org_id', orgId)
        .in('call_status', ['ringing', 'connected'])
        .order('started_at', { ascending: false });
      setActiveCalls(data || []);
    };
    load();

    // Supabase Realtimeでactive_callsを監視
    const channel = supabase
      .channel('active-calls-monitor')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'active_calls',
        filter: `org_id=eq.${orgId}`,
      }, (payload) => {
        const rec = payload.new;
        if (rec.call_status === 'ended') return;
        setActiveCalls(prev => {
          if (prev.some(c => c.id === rec.id)) return prev;
          return [rec, ...prev];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'active_calls',
        filter: `org_id=eq.${orgId}`,
      }, (payload) => {
        const rec = payload.new;
        if (rec.call_status === 'ended') {
          setActiveCalls(prev => prev.filter(c => c.id !== rec.id));
        } else {
          setActiveCalls(prev => prev.map(c => c.id === rec.id ? rec : c));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 通話時間を毎秒更新
  useEffect(() => {
    if (activeCalls.length > 0) {
      tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeCalls.length]);

  // 古いendedレコードのクリーンアップ（1時間以上前）
  useEffect(() => {
    const cleanup = async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await supabase.from('active_calls').delete().eq('call_status', 'ended').lt('ended_at', oneHourAgo);
    };
    cleanup();
  }, []);

  const connectedCalls = activeCalls.filter(c => c.call_status === 'connected');
  const ringingCalls = activeCalls.filter(c => c.call_status === 'ringing');

  if (activeCalls.length === 0) {
    return (
      <div style={{ padding: 20, background: C.white, borderRadius: 4, border: '1px solid #E5E7EB', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>通話モニター</span>
          <span style={{ fontSize: 10, color: C.textLight, background: '#F3F4F6', padding: '2px 8px', borderRadius: 10 }}>リアルタイム</span>
        </div>
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#9CA3AF', fontSize: 12 }}>
          現在通話中のメンバーはいません
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, background: C.white, borderRadius: 4, border: '1px solid #E5E7EB', marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>通話モニター</span>
        <span style={{ fontSize: 10, color: C.textLight, background: '#F3F4F6', padding: '2px 8px', borderRadius: 10 }}>リアルタイム</span>
        <span style={{ fontSize: 11, color: C.navy, fontWeight: 600, marginLeft: 'auto' }}>
          {connectedCalls.length}件 通話中{ringingCalls.length > 0 ? ` / ${ringingCalls.length}件 呼び出し中` : ''}
        </span>
      </div>

      {/* Connected Calls */}
      {connectedCalls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: ringingCalls.length > 0 ? 14 : 0 }}>
          {connectedCalls.map(call => (
            <div key={call.id} style={{
              padding: '12px 14px', borderRadius: 8, border: '1.5px solid #2E844A40',
              background: '#F0FFF4',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#2E844A',
                  animation: 'pulse 2s infinite',
                  boxShadow: '0 0 0 2px #2E844A30',
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{call.caller_name || '不明'}</span>
                <span style={{ fontSize: 11, color: '#2E844A', fontWeight: 600, marginLeft: 'auto', fontFamily: "'JetBrains Mono'" }}>
                  {formatDuration(call.connected_at || call.started_at)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>
                → {call.callee_name || call.callee_number || '不明'}
              </div>
              {call.callee_number && call.callee_name && (
                <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: "'JetBrains Mono'" }}>
                  {call.callee_number}
                </div>
              )}
              {call.list_name && (
                <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>
                  {call.list_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ringing Calls */}
      {ringingCalls.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 6 }}>呼び出し中</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {ringingCalls.map(call => (
              <div key={call.id} style={{
                padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                background: '#FAFAFA',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#F59E0B',
                    animation: 'pulse 1s infinite',
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{call.caller_name || '不明'}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>呼び出し中...</span>
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                  → {call.callee_name || call.callee_number || '不明'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
