import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';

// 通話時間をフォーマット
const formatDuration = (startIso) => {
  if (!startIso) return '0:00';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// モニタリング誘導モーダル
function MonitorModal({ call, onClose }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const callerName = call.caller_name || '不明';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={{ padding: '14px 20px', background: NAVY, borderRadius: '8px 8px 0 0', color: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>通話モニタリング</div>
          <div style={{ fontSize: 11, color: '#93C5FD', marginTop: 2 }}>{callerName} の通話</div>
        </div>

        {/* 通話情報 */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '12px 14px', background: '#F0FFF4', borderRadius: 6, border: '1px solid #2E844A30' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2E844A', animation: 'pulse 2s infinite', boxShadow: '0 0 0 3px #2E844A20', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{callerName}</div>
              <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>
                → {call.callee_name || call.callee_number || '不明'}
              </div>
              {call.callee_number && call.callee_name && (
                <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: "'JetBrains Mono'", marginTop: 1 }}>{call.callee_number}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#2E844A', fontFamily: "'JetBrains Mono'" }}>
                {formatDuration(call.connected_at || call.started_at)}
              </div>
              {call.list_name && <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>{call.list_name}</div>}
            </div>
          </div>

          {/* Zoomモニタリング手順 */}
          <div style={{ background: '#F8F9FA', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Zoom Phoneでモニタリングする手順</div>
            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.8 }}>
              <div>1. Zoomデスクトップアプリを開く</div>
              <div>2. <b>Phone</b> → <b>Lines</b> タブを選択</div>
              <div>3. <b>Others</b> セクションで <b>{callerName}</b> を見つける</div>
              <div>4. 通話中のアイコンからモニタリングを開始</div>
            </div>
          </div>

          {/* モニタリングモード説明 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: '#EFF6FF', borderRadius: 6, padding: '10px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>🎧</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY }}>Listen</div>
              <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2, lineHeight: 1.4 }}>相手に気づかれず傍聴</div>
            </div>
            <div style={{ background: '#FFF7ED', borderRadius: 6, padding: '10px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>🗣️</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY }}>Whisper</div>
              <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2, lineHeight: 1.4 }}>架電者にだけアドバイス</div>
            </div>
            <div style={{ background: '#FEF2F2', borderRadius: 6, padding: '10px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>📞</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY }}>Barge</div>
              <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2, lineHeight: 1.4 }}>3者通話として参加</div>
            </div>
          </div>

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="zoommtg://zoom.us/"
              style={{ flex: 1, display: 'block', textAlign: 'center', padding: '10px 0', background: NAVY, color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none', fontFamily: "'Noto Sans JP'" }}>
              Zoom Phoneを開く
            </a>
            <button onClick={onClose}
              style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#374151', fontFamily: "'Noto Sans JP'" }}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CallMonitorPanel() {
  const [activeCalls, setActiveCalls] = useState([]);
  const [, setTick] = useState(0); // 通話時間更新用
  const tickRef = useRef(null);
  const [selectedCall, setSelectedCall] = useState(null);

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
          // 選択中の通話が終了したらモーダルを閉じる
          setSelectedCall(prev => prev?.id === rec.id ? null : prev);
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
            <div key={call.id}
              onClick={() => setSelectedCall(call)}
              style={{
                padding: '12px 14px', borderRadius: 8, border: '1.5px solid #2E844A40',
                background: '#F0FFF4', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#DCFCE7'; e.currentTarget.style.borderColor = '#2E844A80'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F0FFF4'; e.currentTarget.style.borderColor = '#2E844A40'; }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                {call.list_name && (
                  <span style={{ fontSize: 9, color: '#9CA3AF' }}>{call.list_name}</span>
                )}
                <span style={{ fontSize: 9, color: '#2E844A', fontWeight: 600, marginLeft: 'auto' }}>クリックでモニタリング →</span>
              </div>
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

      {/* モニタリング誘導モーダル */}
      {selectedCall && (
        <MonitorModal call={selectedCall} onClose={() => setSelectedCall(null)} />
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
