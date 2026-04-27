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
  const SEL_KEY = 'spanavi_daily_report_selection_v1';
  const [selectedDate, _setSelectedDate] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SEL_KEY) || 'null')?.date || null; }
    catch { return null; }
  });
  const [selectedTeamId, _setSelectedTeamId] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SEL_KEY) || 'null')?.teamId || null; }
    catch { return null; }
  });
  const setSelectedDate = (d) => {
    _setSelectedDate(d);
    try { localStorage.setItem(SEL_KEY, JSON.stringify({ date: d, teamId: selectedTeamId })); } catch {}
  };
  const setSelectedTeamId = (t) => {
    _setSelectedTeamId(t);
    try { localStorage.setItem(SEL_KEY, JSON.stringify({ date: selectedDate, teamId: t })); } catch {}
  };
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
      const rows = data || [];
      setReports(rows);
      // 永続化された選択を尊重しつつ、無効なら最新日付に
      if (rows.length > 0) {
        const savedDate = selectedDate;
        const savedTeam = selectedTeamId;
        const validRow = rows.find(r => r.report_date === savedDate && r.team_id === savedTeam)
          || rows.find(r => r.report_date === savedDate);
        if (validRow) {
          if (validRow.team_id !== savedTeam) setSelectedTeamId(validRow.team_id);
        } else {
          setSelectedDate(rows[0].report_date);
          setSelectedTeamId(rows[0].team_id);
        }
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

  // 前日比のための yesterday report を取得（hooks は early return 前に必ず呼ぶ）
  const yesterdayDate = useMemo(() => {
    if (!selectedDate) return null;
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [selectedDate]);
  const yesterdayReports = useMemo(() => reports.filter(r => r.report_date === yesterdayDate), [reports, yesterdayDate]);

  if (!sourcing) return <Empty>ソーシング事業が見つかりません</Empty>;
  if (loading) return <Empty>読み込み中…</Empty>;
  if (reports.length === 0) {
    return (
      <Empty>
        まだ Daily Report はありません。<br />
        平日 20:00 JST に自動で生成されます。
      </Empty>
    );
  }

  // 日付ナビゲーション（hook ではないので early return 後で OK）
  const dateIdx = dates.indexOf(selectedDate);
  const goPrevDate = () => {
    if (dateIdx < dates.length - 1) {
      const next = dates[dateIdx + 1];
      setSelectedDate(next);
      const t = reports.find(r => r.report_date === next);
      setSelectedTeamId(t?.team_id || null);
    }
  };
  const goNextDate = () => {
    if (dateIdx > 0) {
      const next = dates[dateIdx - 1];
      setSelectedDate(next);
      const t = reports.find(r => r.report_date === next);
      setSelectedTeamId(t?.team_id || null);
    }
  };
  const onDateInput = (v) => {
    if (!v) return;
    if (!dates.includes(v)) {
      setSelectedDate(v);
      setSelectedTeamId(null);
      return;
    }
    setSelectedDate(v);
    const t = reports.find(r => r.report_date === v);
    setSelectedTeamId(t?.team_id || null);
  };

  return (
    <div>
      {/* 日付ナビゲーション */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={goPrevDate} disabled={dateIdx >= dates.length - 1} title="前の日付"
          style={navBtnStyle(dateIdx >= dates.length - 1)}>‹</button>
        <input type="date" value={selectedDate || ''} onChange={e => onDateInput(e.target.value)}
          style={{ padding: '5px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", color: C.navy, fontWeight: 600 }} />
        <button onClick={goNextDate} disabled={dateIdx <= 0} title="後の日付"
          style={navBtnStyle(dateIdx <= 0)}>›</button>

        <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, marginLeft: 12 }}>チーム:</span>
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

      {selectedDate && !selected && (
        <Empty>{selectedDate} のレポートはまだありません。前後の日付に移動してください。</Empty>
      )}

      {selected && (
        <ReportBody
          report={selected}
          allTeamsForDate={allTeamsForDate}
          yesterdayReports={yesterdayReports}
          isAdmin={isAdmin}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

// ──── ユーティリティ: CSV / 再通知 ────
function downloadCsv(report) {
  const p = report.payload || {};
  const lines = [];
  lines.push(`Daily Report,${report.team_name},${report.report_date}`);
  lines.push('');
  lines.push('# KPI');
  const k = p.kpi || {};
  lines.push(`稼働メンバー,${k.active_members ?? 0}`);
  lines.push(`架電,${k.calls ?? 0}`);
  lines.push(`接続,${k.ceo_connects ?? 0}`);
  lines.push(`アポ,${k.appointments ?? 0}`);
  lines.push(`接続率,${k.ceo_connect_rate ?? 0}%`);
  lines.push(`アポ率,${k.appointment_rate ?? 0}%`);
  lines.push(`売上,${k.sales ?? 0}`);
  lines.push('');
  lines.push('# メンバー別');
  lines.push('氏名,架電,接続,アポ,接続率,アポ率,売上');
  for (const m of (p.members || [])) {
    lines.push(`${m.name},${m.calls},${m.connects},${m.appointments},${m.connect_rate}%,${m.appointment_rate}%,${m.sales || 0}`);
  }
  lines.push('');
  lines.push('# リスト別');
  lines.push('リスト名,架電,接続,アポ,接続率,アポ率');
  for (const l of (p.list_breakdown || [])) {
    lines.push(`${l.list_name},${l.calls},${l.connects},${l.appointments},${l.connect_rate}%,${l.appointment_rate}%`);
  }
  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `daily_report_${report.team_name}_${report.report_date}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function repostToSourcing(report, engagementId) {
  if (!confirm(`${report.report_date} のレポートを Sourcing 全員に再通知しますか？`)) return;
  const orgId = getOrgId();
  const k = report.payload?.kpi || {};
  const body = `[${report.team_name}] ${report.report_date}: 架電 ${k.calls || 0} / アポ ${k.appointments || 0}件`;
  // Sourcing 全員の user_id を取得
  const { data: assignments } = await supabase
    .from('member_engagements')
    .select('member:members!inner(user_id)')
    .eq('org_id', orgId).eq('engagement_id', engagementId);
  const userIds = (assignments || []).map(a => a.member?.user_id).filter(Boolean);
  if (userIds.length === 0) { alert('通知対象のユーザーがいません'); return; }
  const { error } = await supabase.functions.invoke('send-push', {
    body: {
      type: 'daily_report', title: 'デイリーレポート（再通知）',
      body, user_ids: userIds, org_id: orgId, engagement_id: engagementId,
    },
  });
  alert(error ? '送信に失敗しました: ' + error.message : '再通知を送信しました');
}

function ReportBody({ report, allTeamsForDate, yesterdayReports, isAdmin, currentUser }) {
  const p = report.payload || {};
  const kpi = p.kpi || {};
  const members = p.members || [];
  const coaching = p.coaching_picks || {};
  const shiftNoCall = p.shift_no_call || [];
  const lists = p.list_breakdown || [];
  const hourly = p.hourly_calls || [];
  const { openProfile } = useMemberProfile();

  // 昨日の同チーム
  const yesterdayMine = yesterdayReports?.find(r => r.team_id === report.team_id);
  const ykpi = yesterdayMine?.payload?.kpi || null;

  // 他チーム
  const otherTeams = allTeamsForDate.filter(t => t.team_id !== report.team_id);

  // メンバーソート
  const [sortKey, setSortKey] = useState('appointments');
  const [sortDir, setSortDir] = useState('desc');
  const sortedMembers = useMemo(() => {
    const arr = [...members];
    arr.sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'desc' ? vb - va : va - vb;
      return sortDir === 'desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return arr;
  }, [members, sortKey, sortDir]);

  // リストソート
  const [listSortKey, setListSortKey] = useState('calls');
  const [listSortDir, setListSortDir] = useState('desc');
  const sortedLists = useMemo(() => {
    const arr = [...lists];
    arr.sort((a, b) => {
      const va = a[listSortKey] ?? 0;
      const vb = b[listSortKey] ?? 0;
      if (typeof va === 'number' && typeof vb === 'number') return listSortDir === 'desc' ? vb - va : va - vb;
      return listSortDir === 'desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return arr;
  }, [lists, listSortKey, listSortDir]);

  const onListSort = (k) => {
    if (listSortKey === k) setListSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setListSortKey(k); setListSortDir('desc'); }
  };

  // グローバル単一再生制御
  const [globalPlayingId, setGlobalPlayingId] = useState(null);

  // ピーク時間
  const peakHour = useMemo(() => {
    let max = 0, peak = null;
    for (const h of hourly) if ((h.count || 0) > max) { max = h.count; peak = h.hour; }
    return peak;
  }, [hourly]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* 1. ヘッダー（前日比 delta 付き） */}
      <div>
        <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, letterSpacing: '0.06em' }}>
          {report.team_name} ・ {report.report_date}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <SummaryNum label="架電" cur={kpi.calls} prev={ykpi?.calls} />
          <SummaryNum label="接続" cur={kpi.ceo_connects} prev={ykpi?.ceo_connects} />
          <SummaryNum label="アポ" cur={kpi.appointments} prev={ykpi?.appointments} suffix="件" />
          <SummaryNum label="売上" cur={kpi.sales} prev={ykpi?.sales} prefix="¥" formatter={v => v.toLocaleString()} />
        </div>
      </div>

      {/* 2. KPI スコアボード（チーム比較に ▲/▼ delta） */}
      <Section title="KPI スコアボード（他チーム比較）">
        <div style={{ overflowX: 'auto', borderRadius: 4, border: `1px solid ${C.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 520 }}>
            <thead>
              <tr style={{ background: '#0D2247' }}>
                <th style={{ ...thNavy, textAlign: 'left' }}>指標</th>
                <th style={thNavy}>{report.team_name}</th>
                {otherTeams.map(t => <th key={t.team_id} style={thNavy}>{t.team_name}</th>)}
              </tr>
            </thead>
            <tbody>
              <KpiRow label="出勤者 / 稼働者" value={`${kpi.active_members ?? '-'} / ${kpi.active_members ?? '-'}`}
                others={otherTeams.map(t => `${t.payload?.kpi?.active_members ?? '-'} / ${t.payload?.kpi?.active_members ?? '-'}`)} compare={false} />
              <KpiRow label="架電件数" value={kpi.calls} others={otherTeams.map(t => t.payload?.kpi?.calls ?? 0)} />
              <KpiRow label="社長接続数" value={kpi.ceo_connects} others={otherTeams.map(t => t.payload?.kpi?.ceo_connects ?? 0)} />
              <KpiRow label="アポ獲得数" value={kpi.appointments} others={otherTeams.map(t => t.payload?.kpi?.appointments ?? 0)} />
              <KpiRow label="社長接続率" value={kpi.ceo_connect_rate} others={otherTeams.map(t => t.payload?.kpi?.ceo_connect_rate ?? 0)} suffix="%" />
              <KpiRow label="アポ獲得率" value={kpi.appointment_rate} others={otherTeams.map(t => t.payload?.kpi?.appointment_rate ?? 0)} suffix="%" />
              <KpiRow label="売上 (¥)" value={kpi.sales || 0} others={otherTeams.map(t => t.payload?.kpi?.sales ?? 0)}
                formatter={v => v.toLocaleString()} />
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. メンバー別ボード（ソート付き） */}
      <Section title={`メンバー別ボード（稼働 ${members.length}名）`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11 }}>
          <span style={{ color: C.textMid, fontWeight: 600 }}>並び替え:</span>
          {[
            { k: 'appointments', label: 'アポ獲得' },
            { k: 'connect_rate', label: '接続率' },
            { k: 'calls', label: '架電数' },
            { k: 'sales', label: '売上' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => {
              if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
              else { setSortKey(k); setSortDir('desc'); }
            }}
              style={{ padding: '3px 10px', fontSize: 10.5, fontWeight: 600,
                background: sortKey === k ? C.navy : C.white,
                color: sortKey === k ? C.white : C.navy,
                border: `1px solid ${sortKey === k ? C.navy : C.border}`,
                borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
              {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
            </button>
          ))}
        </div>
        {members.length === 0 ? <Empty>本日稼働したメンバーはいません</Empty> : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {sortedMembers.map(m => <MemberCard key={m.member_id} m={m} report={report} isAdmin={isAdmin}
              openProfile={openProfile} currentUser={currentUser}
              globalPlayingId={globalPlayingId} setGlobalPlayingId={setGlobalPlayingId} />)}
          </div>
        )}
      </Section>

      {/* 4. コーチングピック（チーム平均値の根拠を表示） */}
      <Section title="コーチングピック（自動抽出）">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          <PickList
            title="① 時間あたり架電数 < 平均 70%"
            sub={coaching.team_call_per_hour_avg != null
              ? `チーム平均 ${coaching.team_call_per_hour_avg}件/h × 70% 未満`
              : null}
            items={(coaching.low_calls_per_hour || []).map(i => ({ ...i, hint: `${i.calls_per_hour}件/h` }))}
          />
          <PickList
            title="② 社長接続率 < 平均 70%"
            sub={coaching.team_connect_rate_avg != null
              ? `チーム平均 ${coaching.team_connect_rate_avg}% × 70% 未満`
              : null}
            items={(coaching.low_connect_rate || []).map(i => ({ ...i, hint: `${i.connect_rate}%` }))}
          />
          <PickList
            title="③ アポ獲得 0件"
            sub="架電 20 件以上で 1 件もアポなし"
            items={(coaching.zero_appointments || []).map(i => ({ ...i, hint: `${i.calls}件架電` }))}
          />
        </div>
      </Section>

      {/* 5. シフト未稼働（理由入力可） */}
      {shiftNoCall.length > 0 && (
        <Section title="シフト提出済みなのに架電 0 件">
          <ShiftNoCallList items={shiftNoCall} report={report} currentUser={currentUser} />
        </Section>
      )}

      {/* 6. リスト別実績（ソート + ヒートマップ） */}
      <Section title="リスト別実績">
        <ListBreakdownTable lists={sortedLists} sortKey={listSortKey} sortDir={listSortDir} onSort={onListSort} />
      </Section>

      {/* 7. 時間別グラフ（架電/社長接続/アポ重ね描き + ピークラベル） */}
      <Section title="時間別 架電 / 社長接続 / アポ">
        <HourlyChart data={hourly} peakHour={peakHour} />
      </Section>
    </div>
  );
}

function SummaryNum({ label, cur = 0, prev = null, prefix = '', suffix = '', formatter }) {
  const fmt = formatter || (v => v);
  const delta = prev != null ? cur - prev : null;
  const pct = (prev != null && prev > 0) ? ((cur - prev) / prev * 100) : null;
  const arrow = delta == null || delta === 0 ? '' : (delta > 0 ? '▲' : '▼');
  const color = delta == null || delta === 0 ? C.textLight : (delta > 0 ? '#059669' : '#DC2626');
  return (
    <span>
      <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, letterSpacing: '0.06em', marginRight: 4 }}>{label}</span>
      <span>{prefix}{fmt(cur || 0)}{suffix}</span>
      {delta != null && (
        <span style={{ fontSize: 11, color, fontWeight: 700, marginLeft: 6 }}>
          {arrow}{Math.abs(delta).toLocaleString()}{pct != null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}
        </span>
      )}
    </span>
  );
}

function KpiRow({ label, value, others, compare = true, suffix = '', formatter }) {
  const fmt = formatter || (v => v);
  const v = typeof value === 'number' ? value : null;
  const num = (x) => typeof x === 'number' ? x : null;
  return (
    <tr style={{ borderTop: `1px solid ${C.borderLight}` }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: C.textMid }}>{label}</td>
      <td style={{ ...td, fontWeight: 700, color: C.navy }}>{typeof value === 'number' ? `${fmt(value)}${suffix}` : value}</td>
      {others.map((o, i) => {
        const ov = num(o);
        let arrow = '', col = C.textDark;
        if (compare && v != null && ov != null && v !== ov) {
          if (v > ov) { arrow = '▲'; col = '#059669'; } else { arrow = '▼'; col = '#DC2626'; }
        }
        return (
          <td key={i} style={{ ...td, color: col }}>
            {typeof o === 'number' ? `${fmt(o)}${suffix}` : o}
            {arrow && <span style={{ fontSize: 9, marginLeft: 3 }}>{arrow}</span>}
          </td>
        );
      })}
    </tr>
  );
}

function ListBreakdownTable({ lists, sortKey, sortDir, onSort }) {
  const maxCalls = Math.max(1, ...lists.map(l => l.calls || 0));
  const heat = (n) => {
    const ratio = n / maxCalls;
    return `rgba(13, 34, 71, ${0.04 + ratio * 0.16})`;
  };
  const SortHead = ({ k, children }) => (
    <th onClick={() => onSort(k)} style={{ ...thNavy, cursor: 'pointer', userSelect: 'none' }}>
      {children} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  );
  return (
    <div style={{ overflowX: 'auto', borderRadius: 4, border: `1px solid ${C.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 600 }}>
        <thead>
          <tr style={{ background: '#0D2247' }}>
            <th style={{ ...thNavy, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('list_name')}>
              リスト名 {sortKey === 'list_name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
            </th>
            <SortHead k="calls">架電</SortHead>
            <SortHead k="connects">社長接続</SortHead>
            <SortHead k="appointments">アポ</SortHead>
            <SortHead k="connect_rate">接続率</SortHead>
            <SortHead k="appointment_rate">アポ率</SortHead>
          </tr>
        </thead>
        <tbody>
          {lists.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</td></tr>
          ) : lists.map(l => (
            <tr key={l.list_id} style={{ borderTop: `1px solid ${C.borderLight}`, background: heat(l.calls || 0) }}>
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
  );
}

function ShiftNoCallList({ items, report, currentUser }) {
  const [reasons, setReasons] = useState({});
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReasons(report.feedback?.shift_reasons || {});
  }, [report.feedback]);

  const save = async (memberId) => {
    setSaving(true);
    const next = { ...(report.feedback || {}), shift_reasons: { ...(report.feedback?.shift_reasons || {}), [memberId]: { reason: draft, by: currentUser, at: new Date().toISOString() } } };
    const { error } = await supabase.from('daily_reports').update({ feedback: next }).eq('id', report.id);
    setSaving(false);
    if (!error) {
      setReasons(next.shift_reasons);
      setEditing(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(s => {
        const r = reasons[s.member_id];
        return (
          <div key={s.member_id} style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
              <span style={{ fontWeight: 700, color: '#B91C1C' }}>{s.name}</span>
              {s.shift_start && (
                <span style={{ color: C.textMid, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.shift_start.slice(0, 5)}–{s.shift_end?.slice(0, 5) || ''}
                </span>
              )}
              <span style={{ marginLeft: 'auto' }}>
                {editing === s.member_id ? null : (
                  <button onClick={() => { setEditing(s.member_id); setDraft(r?.reason || ''); }}
                    style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600, background: C.white, color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
                    {r?.reason ? '理由を編集' : '理由を入力'}
                  </button>
                )}
              </span>
            </div>
            {editing === s.member_id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2}
                  placeholder="例: 体調不良で休み"
                  style={{ width: '100%', padding: '5px 8px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", boxSizing: 'border-box', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditing(null)} disabled={saving}
                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={() => save(s.member_id)} disabled={saving}
                    style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600, background: C.navy, color: C.white, border: 'none', borderRadius: 3, cursor: saving ? 'wait' : 'pointer', fontFamily: "'Noto Sans JP'" }}>
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            ) : r?.reason && (
              <div style={{ fontSize: 11, color: C.textMid, marginTop: 4, lineHeight: 1.6 }}>
                {r.reason}
                <span style={{ fontSize: 9, color: C.textLight, marginLeft: 8 }}>
                  ({r.by || '不明'} / {(r.at || '').slice(0, 16).replace('T', ' ')})
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberCard({ m, report, openProfile, currentUser, globalPlayingId, setGlobalPlayingId }) {
  const [feedback, setFeedback] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState(null);
  const [feedbackMeta, setFeedbackMeta] = useState(null); // { by, at }
  const [savingFb, setSavingFb] = useState(false);

  // フィードバックロード（meta は _meta_<member_id> キーで保存）
  useEffect(() => {
    const fbBlob = report.feedback?.[m.member_id];
    let text = '';
    let meta = null;
    if (typeof fbBlob === 'string') {
      text = fbBlob;
    } else if (fbBlob && typeof fbBlob === 'object') {
      text = fbBlob.text || '';
      meta = (fbBlob.by || fbBlob.at) ? { by: fbBlob.by, at: fbBlob.at } : null;
    }
    setFeedback(text);
    setFeedbackSaved(text);
    setFeedbackMeta(meta);
  }, [report.feedback, m.member_id]);

  const saveFeedback = async () => {
    setSavingFb(true);
    const meta = { by: currentUser || null, at: new Date().toISOString() };
    const next = {
      ...(report.feedback || {}),
      [m.member_id]: { text: feedback, ...meta },
    };
    const { error } = await supabase.from('daily_reports').update({ feedback: next }).eq('id', report.id);
    setSavingFb(false);
    if (!error) {
      setFeedbackSaved(feedback);
      setFeedbackMeta(meta);
    }
  };

  // 架電リストが多い場合は折りたたみ
  const [showAllRanges, setShowAllRanges] = useState(false);
  const RANGE_COLLAPSE_AT = 5;
  const visibleRanges = showAllRanges ? m.call_ranges : (m.call_ranges || []).slice(0, RANGE_COLLAPSE_AT);
  const hiddenRangeCount = (m.call_ranges?.length || 0) - (visibleRanges?.length || 0);

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ヘッダー: アバター + 名前 + 売上 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: C.navy, color: C.white,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, overflow: 'hidden', flexShrink: 0,
        }}>
          {m.avatar_url ? <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.name || '?')[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => openProfile?.(m.member_id)}
            style={{ fontSize: 13, fontWeight: 700, color: C.navy, cursor: openProfile ? 'pointer' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.name}
          </div>
          {m.sales > 0 && (
            <div style={{ fontSize: 10, color: C.textMid, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
              売上 ¥{m.sales.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        <Stat label="架電" value={m.calls} />
        <Stat label="接続" value={m.connects} sub={`${m.connect_rate}%`} />
        <Stat label="アポ" value={m.appointments} sub={`${m.appointment_rate}%`} />
      </div>

      {/* 架電したリスト（コンパクト 2 列レイアウト） */}
      {m.call_ranges?.length > 0 && (
        <div>
          <CardEyebrow>架電したリスト ({m.call_ranges.length})</CardEyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visibleRanges.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 6, fontSize: 11 }}>
                <span title={r.list_name}
                  style={{ color: C.navy, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.list_name}
                </span>
                <span style={{ color: C.textMid, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                  {r.start_no}–{r.end_no} <span style={{ color: C.textLight }}>({r.count})</span>
                </span>
              </div>
            ))}
            {hiddenRangeCount > 0 && (
              <button onClick={() => setShowAllRanges(true)}
                style={{ background: 'none', border: 'none', color: C.textMid, cursor: 'pointer', fontSize: 10, padding: 0, textAlign: 'left', textDecoration: 'underline', alignSelf: 'flex-start' }}>
                さらに {hiddenRangeCount} 件
              </button>
            )}
            {showAllRanges && m.call_ranges.length > RANGE_COLLAPSE_AT && (
              <button onClick={() => setShowAllRanges(false)}
                style={{ background: 'none', border: 'none', color: C.textMid, cursor: 'pointer', fontSize: 10, padding: 0, textAlign: 'left', textDecoration: 'underline', alignSelf: 'flex-start' }}>
                折りたたむ
              </button>
            )}
          </div>
        </div>
      )}

      {/* 録音（グローバル単一再生） */}
      {(m.appo_recordings?.length > 0 || m.rejection_recordings?.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {m.appo_recordings?.length > 0 && (
            <RecordingGroup
              label="アポ獲得録音" count={m.appo_recordings.length} accent="#059669"
              records={m.appo_recordings} playingId={globalPlayingId} setPlayingId={setGlobalPlayingId}
            />
          )}
          {m.rejection_recordings?.length > 0 && (
            <RecordingGroup
              label="社長お断り録音" count={m.rejection_recordings.length} accent="#DC2626"
              records={m.rejection_recordings} playingId={globalPlayingId} setPlayingId={setGlobalPlayingId}
            />
          )}
        </div>
      )}

      {/* フィードバック */}
      <div>
        <CardEyebrow>フィードバック</CardEyebrow>
        <textarea
          value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
          placeholder="リーダーからのコメント"
          style={{ width: '100%', padding: '6px 9px', fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, gap: 6 }}>
          {feedbackMeta?.at ? (
            <span style={{ fontSize: 9, color: C.textLight }}>
              {feedbackMeta.by || '不明'} / {(feedbackMeta.at || '').slice(0, 16).replace('T', ' ')}
            </span>
          ) : <span />}
          <button onClick={saveFeedback} disabled={savingFb || feedback === feedbackSaved}
            style={{
              padding: '3px 12px', fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'",
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

function CardEyebrow({ children }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function RecordingGroup({ label, count, accent, records, playingId, setPlayingId }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label} ({count})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {records.map(r => (
          <RecordingRow key={r.id} r={r} accent={accent}
            playing={playingId === r.id}
            onToggle={() => setPlayingId(playingId === r.id ? null : r.id)} />
        ))}
      </div>
    </div>
  );
}

function RecordingRow({ r, accent, playing, onToggle }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 0' }}>
        <span title={r.company || '会社名不明'}
          style={{ color: C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.company || '会社名不明'}
        </span>
        <span style={{ color: C.textLight, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          {(r.called_at || '').slice(11, 16)}
        </span>
        <button onClick={onToggle}
          style={{
            width: 24, height: 22, padding: 0, fontSize: 10, fontWeight: 600,
            background: playing ? (accent || C.navy) : C.white,
            color: playing ? C.white : (accent || C.navy),
            border: `1px solid ${accent || C.navy}`, borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{playing ? '■' : '▶'}</button>
      </div>
      {playing && <InlineAudioPlayer url={r.recording_url} onClose={() => onToggle()} />}
    </div>
  );
}

function PickList({ title, sub, items }) {
  return (
    <div style={{ background: '#FEF7E6', border: '1px solid #F4D589', borderRadius: 4, padding: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>{title}</div>
      {sub && <div style={{ fontSize: 9.5, color: '#A16207', marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{sub}</div>}
      {items.length === 0 ? (
        <div style={{ fontSize: 10.5, color: C.textLight }}>該当なし</div>
      ) : items.map(i => (
        <div key={i.member_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: C.navy, fontWeight: 600 }}>・{i.name}</span>
          {i.hint && <span style={{ color: C.textMid, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{i.hint}</span>}
        </div>
      ))}
    </div>
  );
}

function HourlyChart({ data, peakHour }) {
  const maxCount = Math.max(1, ...data.map(d => d.count));
  const [hoverHour, setHoverHour] = useState(null);
  const hovered = hoverHour != null ? data.find(d => d.hour === hoverHour) : null;
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, padding: '0 6px', borderBottom: `1px solid ${C.border}` }}>
          {data.map(d => {
            const totalH = Math.max(2, ((d.count || 0) / maxCount) * 130);
            const apposH = totalH * ((d.appointments || 0) / Math.max(1, d.count));
            const connectsH = totalH * (((d.connects || 0) - (d.appointments || 0)) / Math.max(1, d.count));
            const callsH = totalH - apposH - connectsH;
            const isPeak = d.hour === peakHour && (d.count || 0) > 0;
            const isHovered = hoverHour === d.hour;
            const tooltip = `${d.hour}時台\n架電 ${d.count || 0}件\n社長接続 ${d.connects || 0}件\nアポ獲得 ${d.appointments || 0}件`;
            return (
              <div key={d.hour}
                onMouseEnter={() => setHoverHour(d.hour)}
                onMouseLeave={() => setHoverHour(null)}
                title={tooltip}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 24, cursor: 'default', background: isHovered ? '#0D224708' : 'transparent', borderRadius: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700,
                  color: isPeak ? '#DC2626' : C.textMid,
                  display: 'flex', alignItems: 'center', gap: 2 }}>
                  {isPeak && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#FEF2F2', color: '#DC2626' }}>PEAK</span>}
                  {d.count || ''}
                </div>
                {d.count > 0 ? (
                  <div style={{ width: '100%', maxWidth: 28, height: totalH, display: 'flex', flexDirection: 'column-reverse', borderRadius: '3px 3px 0 0', overflow: 'hidden', boxShadow: isHovered ? '0 0 0 2px #0D224733' : 'none' }}>
                    <div style={{ height: callsH, background: C.navy + '60' }} />
                    <div style={{ height: connectsH, background: C.navy + 'cc' }} />
                    <div style={{ height: apposH, background: '#059669' }} />
                  </div>
                ) : (
                  <div style={{ width: '100%', maxWidth: 28, height: 2, background: C.borderLight, borderRadius: '3px 3px 0 0' }} />
                )}
                <div style={{ fontSize: 9, color: isPeak ? '#DC2626' : C.textLight, fontWeight: isPeak ? 700 : 400 }}>{d.hour}</div>
              </div>
            );
          })}
        </div>

        {/* リッチなホバー値表示（カーソル時間帯の集計を上部に表示） */}
        {hovered && (
          <div style={{
            position: 'absolute', top: 0, right: 0,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
            padding: '6px 10px', fontSize: 10.5, color: C.textDark, lineHeight: 1.7,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minWidth: 140,
          }}>
            <div style={{ fontWeight: 700, color: C.navy, marginBottom: 2 }}>{hovered.hour}時台</div>
            <div>架電件数 <span style={{ float: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{hovered.count || 0}</span></div>
            <div>社長接続数 <span style={{ float: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: C.navy }}>{hovered.connects || 0}</span></div>
            <div>アポ獲得数 <span style={{ float: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#059669' }}>{hovered.appointments || 0}</span></div>
          </div>
        )}
      </div>
      {/* 凡例 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 8, fontSize: 10, color: C.textMid }}>
        <LegendDot color={C.navy + '60'} label="架電" />
        <LegendDot color={C.navy + 'cc'} label="社長接続" />
        <LegendDot color="#059669" label="アポ獲得" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }} />
      {label}
    </span>
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
const thNavy = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: '#fff', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', fontSize: 11.5, color: C.textDark, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" };
const selectStyle = {
  padding: '5px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 3,
  fontFamily: "'Noto Sans JP'", color: C.navy, fontWeight: 600,
};
const navBtnStyle = (disabled) => ({
  width: 28, height: 28, padding: 0, fontSize: 16, fontWeight: 600,
  background: disabled ? C.cream : C.white,
  color: disabled ? C.textLight : C.navy,
  border: `1px solid ${C.border}`, borderRadius: 3,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: "'Noto Sans JP'", display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.5 : 1,
});
const iconBtnStyle = {
  padding: '5px 10px', fontSize: 10.5, fontWeight: 600,
  background: C.white, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 3,
  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
};
