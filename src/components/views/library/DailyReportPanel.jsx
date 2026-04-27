import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { C } from '../../../constants/colors';
import InlineAudioPlayer from '../../common/InlineAudioPlayer';
import { useEngagements } from '../../../hooks/useEngagements';
import { useMemberProfile } from '../../common/MemberProfileDrawer';

export default function DailyReportPanel({ currentUser, userId, isAdmin }) {
  const { engagements } = useEngagements();
  const sourcing = useMemo(() => (engagements || []).find(e => e.slug === 'seller_sourcing'), [engagements]);

  const [reports, setReports] = useState([]); // 直近 30 日分
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sourcing) return;
    (async () => {
      setLoading(true);
      const orgId = getOrgId();
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('daily_reports')
        .select('id, team_id, team_name, report_date, payload')
        .eq('org_id', orgId).eq('engagement_id', sourcing.id)
        .gte('report_date', since.toISOString().slice(0, 10))
        .order('report_date', { ascending: false });
      setReports(data || []);
      // 最新日付を選択
      if ((data || []).length > 0) {
        setSelectedDate(data[0].report_date);
        setSelectedTeamId(data[0].team_id);
      }
      setLoading(false);
    })();
  }, [sourcing]);

  const dates = useMemo(() => {
    return Array.from(new Set(reports.map(r => r.report_date))).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const teamsForDate = useMemo(() => {
    return reports.filter(r => r.report_date === selectedDate);
  }, [reports, selectedDate]);

  const allTeamsForDate = teamsForDate;

  const selected = reports.find(r => r.report_date === selectedDate && r.team_id === selectedTeamId);

  if (!sourcing) return <Empty>ソーシング事業が見つかりません</Empty>;
  if (loading) return <Empty>読み込み中…</Empty>;
  if (reports.length === 0) {
    return (
      <Empty>
        まだ Daily Report はありません。<br />
        平日 18:00 JST に自動で生成されます。
      </Empty>
    );
  }

  return (
    <div>
      {/* 日付・チーム切替 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600 }}>日付:</span>
        <select value={selectedDate || ''} onChange={e => {
          setSelectedDate(e.target.value);
          const t = reports.find(r => r.report_date === e.target.value);
          setSelectedTeamId(t?.team_id || null);
        }} style={selectStyle}>
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, marginLeft: 8 }}>チーム:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {teamsForDate.map(t => (
            <button key={t.team_id || 'org'} onClick={() => setSelectedTeamId(t.team_id)}
              style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 600,
                border: `1px solid ${selectedTeamId === t.team_id ? C.navy : C.border}`,
                background: selectedTeamId === t.team_id ? C.navy : C.white,
                color: selectedTeamId === t.team_id ? C.white : C.navy,
                borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              }}>{t.team_name || 'チーム未設定'}</button>
          ))}
        </div>
      </div>

      {selected && (
        <ReportBody
          report={selected}
          allTeamsForDate={allTeamsForDate}
          isAdmin={isAdmin}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

function ReportBody({ report, allTeamsForDate, isAdmin, currentUser }) {
  const p = report.payload || {};
  const kpi = p.kpi || {};
  const members = p.members || [];
  const coaching = p.coaching_picks || {};
  const shiftNoCall = p.shift_no_call || [];
  const lists = p.list_breakdown || [];
  const hourly = p.hourly_calls || [];
  const { openProfile } = useMemberProfile();

  // 他チーム比較
  const otherTeams = allTeamsForDate.filter(t => t.team_id !== report.team_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* 1. ヘッダー */}
      <div>
        <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, letterSpacing: '0.06em' }}>
          {report.team_name} ・ {report.report_date}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginTop: 4 }}>
          本日: 架電 {kpi.calls || 0} ・ 接続 {kpi.ceo_connects || 0} ・ アポ {kpi.appointments || 0}件 ・ 売上 ¥{(kpi.sales || 0).toLocaleString()}
        </div>
      </div>

      {/* 2. KPI スコアボード */}
      <Section title="KPI スコアボード（他チーム比較）">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 520 }}>
            <thead>
              <tr style={{ background: '#F8F9FA', borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...th, textAlign: 'left' }}>指標</th>
                <th style={th}>{report.team_name}</th>
                {otherTeams.map(t => <th key={t.team_id} style={th}>{t.team_name}</th>)}
              </tr>
            </thead>
            <tbody>
              <KpiRow label="出勤者 / 稼働者" value={`${kpi.active_members ?? '-'} / ${kpi.active_members ?? '-'}`}
                others={otherTeams.map(t => `${t.payload?.kpi?.active_members ?? '-'} / ${t.payload?.kpi?.active_members ?? '-'}`)} />
              <KpiRow label="架電件数" value={kpi.calls} others={otherTeams.map(t => t.payload?.kpi?.calls ?? 0)} />
              <KpiRow label="社長接続数" value={kpi.ceo_connects} others={otherTeams.map(t => t.payload?.kpi?.ceo_connects ?? 0)} />
              <KpiRow label="アポ獲得数" value={kpi.appointments} others={otherTeams.map(t => t.payload?.kpi?.appointments ?? 0)} />
              <KpiRow label="社長接続率" value={`${kpi.ceo_connect_rate ?? 0}%`} others={otherTeams.map(t => `${t.payload?.kpi?.ceo_connect_rate ?? 0}%`)} />
              <KpiRow label="アポ獲得率" value={`${kpi.appointment_rate ?? 0}%`} others={otherTeams.map(t => `${t.payload?.kpi?.appointment_rate ?? 0}%`)} />
              <KpiRow label="売上 (¥)" value={(kpi.sales || 0).toLocaleString()}
                others={otherTeams.map(t => (t.payload?.kpi?.sales || 0).toLocaleString())} />
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. メンバー別ボード */}
      <Section title={`メンバー別ボード（稼働 ${members.length}名）`}>
        {members.length === 0 ? <Empty>本日稼働したメンバーはいません</Empty> : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {members.map(m => <MemberCard key={m.member_id} m={m} report={report} isAdmin={isAdmin} openProfile={openProfile} />)}
          </div>
        )}
      </Section>

      {/* 4. コーチングピック */}
      <Section title="コーチングピック（自動抽出）">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          <PickList title="① 時間あたり架電数 < 平均 70%" items={coaching.low_calls_per_hour || []} />
          <PickList title="② 社長接続率 < 平均 70%" items={coaching.low_connect_rate || []} />
          <PickList title="③ アポ獲得 0件" items={coaching.zero_appointments || []} />
        </div>
      </Section>

      {/* 5. シフト提出済み + 架電0件 */}
      {shiftNoCall.length > 0 && (
        <Section title="シフト提出済みなのに架電 0 件">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {shiftNoCall.map(s => (
              <span key={s.member_id} style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600,
                background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 12 }}>
                {s.name}{s.shift_start ? ` (${s.shift_start.slice(0, 5)}-${s.shift_end?.slice(0, 5) || ''})` : ''}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 6. リスト別実績 */}
      <Section title="リスト別実績">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#F8F9FA', borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...th, textAlign: 'left' }}>リスト名</th>
                <th style={th}>架電</th>
                <th style={th}>接続</th>
                <th style={th}>アポ</th>
                <th style={th}>接続率</th>
                <th style={th}>アポ率</th>
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</td></tr>
              ) : lists.map(l => (
                <tr key={l.list_id} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: C.navy }}>{l.list_name}</td>
                  <td style={td}>{l.calls}</td>
                  <td style={td}>{l.connects}</td>
                  <td style={td}>{l.appointments}</td>
                  <td style={td}>{l.connect_rate}%</td>
                  <td style={td}>{l.appointment_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 7. 時間別架電グラフ */}
      <Section title="時間別架電件数">
        <HourlyChart data={hourly} />
      </Section>
    </div>
  );
}

function KpiRow({ label, value, others }) {
  return (
    <tr style={{ borderTop: `1px solid ${C.borderLight}` }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: C.textMid }}>{label}</td>
      <td style={{ ...td, fontWeight: 700, color: C.navy }}>{value}</td>
      {others.map((v, i) => <td key={i} style={td}>{v}</td>)}
    </tr>
  );
}

function MemberCard({ m, report, openProfile }) {
  const [feedback, setFeedback] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState(null);
  const [savingFb, setSavingFb] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  // フィードバックロード
  useEffect(() => {
    const fb = report.feedback?.[m.member_id] || '';
    setFeedback(fb);
    setFeedbackSaved(fb);
  }, [report.feedback, m.member_id]);

  const saveFeedback = async () => {
    setSavingFb(true);
    const next = { ...(report.feedback || {}), [m.member_id]: feedback };
    const { error } = await supabase.from('daily_reports').update({ feedback: next }).eq('id', report.id);
    setSavingFb(false);
    if (!error) setFeedbackSaved(feedback);
  };

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: C.navy, color: C.white,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, overflow: 'hidden',
        }}>
          {m.avatar_url ? <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.name || '?')[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => openProfile?.(m.member_id)}
            style={{ fontSize: 13, fontWeight: 700, color: C.navy, cursor: openProfile ? 'pointer' : 'default' }}>
            {m.name}
          </div>
        </div>
      </div>

      {/* 個人 KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
        <Stat label="架電" value={m.calls} />
        <Stat label="接続" value={m.connects} sub={`${m.connect_rate}%`} />
        <Stat label="アポ" value={m.appointments} sub={`${m.appointment_rate}%`} />
      </div>
      {m.sales > 0 && (
        <div style={{ fontSize: 11, color: C.navy, fontWeight: 700, marginBottom: 8 }}>
          売上 ¥{m.sales.toLocaleString()}
        </div>
      )}

      {/* 架電範囲 */}
      {m.call_ranges?.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.textMid, marginBottom: 10 }}>
          {m.call_ranges.map((r, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: C.navy, fontWeight: 600 }}>{r.list_name}</span>: No.{r.start_no}〜No.{r.end_no} ({r.count}件)
            </div>
          ))}
        </div>
      )}

      {/* 録音セクション */}
      {(m.appo_recordings?.length > 0 || m.rejection_recordings?.length > 0) && (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 8, marginBottom: 8 }}>
          {m.appo_recordings?.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', marginBottom: 4, letterSpacing: '0.04em' }}>アポ獲得録音 ({m.appo_recordings.length})</div>
              {m.appo_recordings.map(r => (
                <RecordingRow key={r.id} r={r} playing={playingId === r.id} onToggle={() => setPlayingId(playingId === r.id ? null : r.id)} />
              ))}
            </div>
          )}
          {m.rejection_recordings?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', marginBottom: 4, letterSpacing: '0.04em' }}>社長お断り録音 ({m.rejection_recordings.length})</div>
              {m.rejection_recordings.map(r => (
                <RecordingRow key={r.id} r={r} playing={playingId === r.id} onToggle={() => setPlayingId(playingId === r.id ? null : r.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* フィードバック欄 */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, marginBottom: 4 }}>フィードバック</div>
        <textarea
          value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
          placeholder="リーダーからのコメント"
          style={{ width: '100%', padding: '5px 8px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", boxSizing: 'border-box', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={saveFeedback} disabled={savingFb || feedback === feedbackSaved}
            style={{
              padding: '3px 10px', fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              background: feedback !== feedbackSaved ? C.navy : C.borderLight,
              color: feedback !== feedbackSaved ? C.white : C.textLight,
              border: 'none', borderRadius: 3,
              cursor: (savingFb || feedback === feedbackSaved) ? 'default' : 'pointer',
            }}>
            {savingFb ? '保存中…' : (feedback === feedbackSaved ? '保存済' : '保存')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordingRow({ r, playing, onToggle }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
        <span style={{ flex: 1, color: C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.company || '会社名不明'}
        </span>
        <span style={{ color: C.textLight, fontSize: 9 }}>{(r.called_at || '').slice(11, 16)}</span>
        <button onClick={onToggle}
          style={{
            padding: '2px 8px', fontSize: 10, fontWeight: 600,
            background: playing ? C.navy : C.white, color: playing ? C.white : C.navy,
            border: `1px solid ${C.navy}`, borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}>{playing ? '■' : '▶'}</button>
      </div>
      {playing && <InlineAudioPlayer url={r.recording_url} onClose={() => onToggle()} />}
    </div>
  );
}

function PickList({ title, items }) {
  return (
    <div style={{ background: '#FEF7E6', border: '1px solid #F4D589', borderRadius: 4, padding: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 10.5, color: C.textLight }}>該当なし</div>
      ) : items.map(i => (
        <div key={i.member_id} style={{ fontSize: 11, color: C.navy, fontWeight: 600, marginBottom: 2 }}>
          ・{i.name}
        </div>
      ))}
    </div>
  );
}

function HourlyChart({ data }) {
  const maxCount = Math.max(1, ...data.map(d => d.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, padding: '0 6px', borderBottom: `1px solid ${C.border}` }}>
      {data.map(d => {
        const h = Math.max(2, (d.count / maxCount) * 120);
        return (
          <div key={d.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 24 }}>
            <div style={{ fontSize: 9, color: C.textMid, fontWeight: 600 }}>{d.count || ''}</div>
            <div style={{ width: '100%', maxWidth: 28, height: h, background: d.count > 0 ? C.navy : C.borderLight, borderRadius: '3px 3px 0 0' }} />
            <div style={{ fontSize: 9, color: C.textLight }}>{d.hour}</div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value, sub }) {
  return (
    <div style={{ background: C.cream, padding: '6px 8px', borderRadius: 3, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.textMid, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono', monospace" }}>{value ?? 0}</div>
      {sub && <div style={{ fontSize: 9, color: C.textLight }}>{sub}</div>}
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>{children}</div>;
}

const th = { padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: C.textMid, textAlign: 'center' };
const td = { padding: '6px 10px', fontSize: 11.5, color: C.textDark, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" };
const selectStyle = {
  padding: '5px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 3,
  fontFamily: "'Noto Sans JP'", color: C.navy, fontWeight: 600,
};
