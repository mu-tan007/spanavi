import { useState, useEffect, useMemo } from 'react';
import { C } from '../../../constants/colors';
import { rpcPerfRanking, fetchCallActivity, fetchAppoActivity, fetchCallSessionsForRange } from '../../../lib/supabaseWrite';
import ActivityRankingSection from '../../dashboard/ActivityRankingSection';
import TeamPerformanceTable from '../../dashboard/TeamPerformanceTable';
import { PersonDetailModal } from '../PerformanceView';

const NAVY = '#0D2247';

const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

export default function MemberRanking({ from, to, currentUser, members, appoData = [] }) {
  const [rankData, setRankData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [rankRecords, setRankRecords] = useState([]);
  const [appoRankRecords, setAppoRankRecords] = useState([]);
  const [sessionRecords, setSessionRecords] = useState([]);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setLoading(true);
    rpcPerfRanking(_jstStart(from), _jstEnd(to))
      .then(({ data }) => { if (!cancelled) setRankData(data || []); })
      .catch(err => console.error('[MemberRanking] rankFetch:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  const sessionMap = useMemo(() => {
    const result = {};
    rankData.forEach(r => { if (r.work_hours > 0) result[r.getter_name] = Number(r.work_hours); });
    return result;
  }, [rankData]);

  const rankByPerson = useMemo(
    () => rankData.map(r => ({ name: r.getter_name, call: r.calls, connect: r.ceo_connect, appo: r.appo })),
    [rankData]
  );

  const teamMap = useMemo(() => {
    const m = {};
    (members || [])
      .filter(mb => mb.is_active !== false && mb.name && !/^user_/i.test(mb.name))
      .forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  const reschedAppoData = useMemo(() => {
    if (!from || !to) return [];
    return (appoData || []).filter(a => {
      const d = (a.getDate || '').slice(0, 10);
      return d >= from && d <= to;
    });
  }, [appoData, from, to]);

  useEffect(() => {
    if (!selectedPerson || !from || !to) { setRankRecords([]); setAppoRankRecords([]); setSessionRecords([]); return; }
    Promise.all([
      fetchCallActivity(_jstStart(from), _jstEnd(to)),
      fetchAppoActivity(_jstStart(from), _jstEnd(to)),
      fetchCallSessionsForRange(_jstStart(from), _jstEnd(to)),
    ]).then(([calls, appos, sessions]) => {
      setRankRecords(calls.data || []);
      setAppoRankRecords(appos.data || []);
      setSessionRecords(sessions.data || []);
    }).catch(err => console.error('[MemberRanking] personDetailFetch:', err));
  }, [selectedPerson, from, to]);

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span>メンバー ランキング <span style={{ fontSize: 10, fontWeight: 500, color: C.textLight, marginLeft: 8 }}>{from === to ? from : `${from} 〜 ${to}`}</span></span>
      </div>

      {selectedPerson && (
        <PersonDetailModal
          person={selectedPerson}
          callRecords={rankRecords}
          appoRecords={appoRankRecords}
          sessions={sessionRecords}
          members={members}
          teamMap={teamMap}
          rankDateRange={{ from, to }}
          onClose={() => setSelectedPerson(null)}
        />
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>読込中…</div>
      ) : rankByPerson.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
      ) : (
        <>
          <ActivityRankingSection
            byPerson={rankByPerson}
            sessionMap={sessionMap}
            currentUser={currentUser}
            onSelectPerson={setSelectedPerson}
          />
          <div style={{ height: 20 }} />
          <TeamPerformanceTable
            byPerson={rankByPerson}
            teamMap={teamMap}
            sessionMap={sessionMap}
            reschedAppoData={reschedAppoData}
            members={members}
          />
        </>
      )}
    </section>
  );
}
