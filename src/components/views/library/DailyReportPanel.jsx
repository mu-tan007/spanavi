import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { useRecordingPlayer } from '../../common/RecordingPlayerProvider';
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

  if (!sourcing) return <Empty>営業代行（売り手ソーシング）事業が見つかりません</Empty>;
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
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={goPrevDate}
          disabled={dateIdx >= dates.length - 1}
          title="前の日付"
          style={{ minHeight: 28, padding: 0, width: 28, fontSize: 16 }}
        >‹</Button>
        <Input
          type="date"
          size="sm"
          value={selectedDate || ''}
          onChange={e => onDateInput(e.target.value)}
          fullWidth={false}
          style={{ fontFamily: font.family.mono, color: color.navy, fontWeight: font.weight.semibold }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={goNextDate}
          disabled={dateIdx <= 0}
          title="後の日付"
          style={{ minHeight: 28, padding: 0, width: 28, fontSize: 16 }}
        >›</Button>

        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, marginLeft: 12 }}>チーム:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {teamsForDate.map(t => (
            <Button
              key={t.team_id || 'org'}
              size="sm"
              variant={selectedTeamId === t.team_id ? 'primary' : 'outline'}
              onClick={() => setSelectedTeamId(t.team_id)}
              style={{ minHeight: 26, padding: '4px 12px', fontSize: 11 }}
            >{t.team_name || 'チーム未設定'}</Button>
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
  lines.push(`接続,${k.keyman_connects ?? 0}`);
  lines.push(`アポ,${k.appointments ?? 0}`);
  lines.push(`接続率,${k.keyman_connect_rate ?? 0}%`);
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
  const csv = '﻿' + lines.join('\n');
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
        <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold, letterSpacing: '0.06em' }}>
          {report.team_name} ・ {report.report_date}
        </div>
        <div style={{ fontSize: 18, fontWeight: font.weight.bold, color: color.navy, marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <SummaryNum label="架電" cur={kpi.calls} prev={ykpi?.calls} />
          <SummaryNum label="接続" cur={kpi.keyman_connects} prev={ykpi?.keyman_connects} />
          <SummaryNum label="アポ" cur={kpi.appointments} prev={ykpi?.appointments} suffix="件" />
          <SummaryNum label="売上" cur={kpi.sales} prev={ykpi?.sales} prefix="¥" formatter={v => v.toLocaleString()} />
        </div>
      </div>

      {/* 2. KPI スコアボード（チーム比較に ▲/▼ delta） */}
      <Section title="KPI スコアボード（他チーム比較）">
        <div style={{ overflowX: 'auto', borderRadius: radius.md, border: `1px solid ${color.border}` }}>
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
              <KpiRow label="キーマン接続数" value={kpi.keyman_connects} others={otherTeams.map(t => t.payload?.kpi?.keyman_connects ?? 0)} />
              <KpiRow label="アポ獲得数" value={kpi.appointments} others={otherTeams.map(t => t.payload?.kpi?.appointments ?? 0)} />
              <KpiRow label="キーマン接続率" value={kpi.keyman_connect_rate} others={otherTeams.map(t => t.payload?.kpi?.keyman_connect_rate ?? 0)} suffix="%" />
              <KpiRow label="アポ獲得率" value={kpi.appointment_rate} others={otherTeams.map(t => t.payload?.kpi?.appointment_rate ?? 0)} suffix="%" />
              <KpiRow label="売上 (¥)" value={kpi.sales || 0} others={otherTeams.map(t => t.payload?.kpi?.sales ?? 0)}
                formatter={v => v.toLocaleString()} />
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. メンバー別ボード（ソート付き） */}
      <Section title={`メンバー別ボード（稼働 ${members.length}名）`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2], fontSize: font.size.xs }}>
          <span style={{ color: color.textMid, fontWeight: font.weight.semibold }}>並び替え:</span>
          {[
            { k: 'appointments', label: 'アポ獲得' },
            { k: 'connect_rate', label: '接続率' },
            { k: 'calls', label: '架電数' },
            { k: 'sales', label: '売上' },
          ].map(({ k, label }) => (
            <Button
              key={k}
              size="sm"
              variant={sortKey === k ? 'primary' : 'outline'}
              onClick={() => {
                if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                else { setSortKey(k); setSortDir('desc'); }
              }}
              style={{ minHeight: 24, padding: '3px 10px', fontSize: 10.5 }}
            >
              {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
            </Button>
          ))}
        </div>
        {members.length === 0 ? <Empty>本日稼働したメンバーはいません</Empty> : (
          <div style={{ display: 'grid', gap: space[2.5], gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {sortedMembers.map(m => <MemberCard key={m.member_id} m={m} report={report} isAdmin={isAdmin}
              openProfile={openProfile} currentUser={currentUser} />)}
          </div>
        )}
      </Section>

      {/* 4. コーチングピック（チーム平均値の根拠を表示） */}
      <Section title="コーチングピック（自動抽出）">
        <div style={{ display: 'grid', gap: space[2.5], gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          <PickList
            title="① 時間あたり架電数 < 平均 70%"
            sub={coaching.team_call_per_hour_avg != null
              ? `チーム平均 ${coaching.team_call_per_hour_avg}件/h × 70% 未満`
              : null}
            items={(coaching.low_calls_per_hour || []).map(i => ({ ...i, hint: `${i.calls_per_hour}件/h` }))}
          />
          <PickList
            title="② キーマン接続率 < 平均 70%"
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

      {/* 7. 時間別グラフ（架電/キーマン接続/アポ重ね描き + ピークラベル） */}
      <Section title="時間別 架電 / キーマン接続 / アポ">
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
  const deltaColor = delta == null || delta === 0 ? color.textLight : (delta > 0 ? '#059669' : '#DC2626');
  return (
    <span>
      <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, letterSpacing: '0.06em', marginRight: 4 }}>{label}</span>
      <span>{prefix}{fmt(cur || 0)}{suffix}</span>
      {delta != null && (
        <span style={{ fontSize: font.size.xs, color: deltaColor, fontWeight: font.weight.bold, marginLeft: 6 }}>
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
    <tr style={{ borderTop: `1px solid ${color.borderLight}` }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: font.weight.semibold, color: color.textMid }}>{label}</td>
      <td style={{ ...td, fontWeight: font.weight.bold, color: color.navy }}>{typeof value === 'number' ? `${fmt(value)}${suffix}` : value}</td>
      {others.map((o, i) => {
        const ov = num(o);
        let arrow = '', col = color.textDark;
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
    <div style={{ overflowX: 'auto', borderRadius: radius.md, border: `1px solid ${color.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 600 }}>
        <thead>
          <tr style={{ background: '#0D2247' }}>
            <th style={{ ...thNavy, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('list_name')}>
              リスト名 {sortKey === 'list_name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
            </th>
            <SortHead k="calls">架電</SortHead>
            <SortHead k="connects">キーマン接続</SortHead>
            <SortHead k="appointments">アポ</SortHead>
            <SortHead k="connect_rate">接続率</SortHead>
            <SortHead k="appointment_rate">アポ率</SortHead>
          </tr>
        </thead>
        <tbody>
          {lists.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>データなし</td></tr>
          ) : lists.map(l => (
            <tr key={l.list_id} style={{ borderTop: `1px solid ${color.borderLight}`, background: heat(l.calls || 0) }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: font.weight.semibold, color: color.navy }}>{l.list_name}</td>
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
          <div key={s.member_id} style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: radius.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: 11.5 }}>
              <span style={{ fontWeight: font.weight.bold, color: '#B91C1C' }}>{s.name}</span>
              {s.shift_start && (
                <span style={{ color: color.textMid, fontSize: 10, fontFamily: font.family.mono }}>
                  {s.shift_start.slice(0, 5)}–{s.shift_end?.slice(0, 5) || ''}
                </span>
              )}
              <span style={{ marginLeft: 'auto' }}>
                {editing === s.member_id ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditing(s.member_id); setDraft(r?.reason || ''); }}
                    style={{ minHeight: 22, padding: '2px 8px', fontSize: 10, color: '#B91C1C', border: '1px solid #FCA5A5', background: color.white }}
                  >
                    {r?.reason ? '理由を編集' : '理由を入力'}
                  </Button>
                )}
              </span>
            </div>
            {editing === s.member_id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2}
                  placeholder="例: 体調不良で休み"
                  style={{ width: '100%', padding: '5px 8px', fontSize: 11, border: `1px solid ${color.border}`, borderRadius: radius.sm, fontFamily: font.family.sans, boxSizing: 'border-box', resize: 'vertical', color: color.textDark }} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(null)}
                    disabled={saving}
                    style={{ minHeight: 24, padding: '3px 10px', fontSize: 10 }}
                  >キャンセル</Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => save(s.member_id)}
                    loading={saving}
                    disabled={saving}
                    style={{ minHeight: 24, padding: '3px 10px', fontSize: 10 }}
                  >
                    {saving ? '保存中…' : '保存'}
                  </Button>
                </div>
              </div>
            ) : r?.reason && (
              <div style={{ fontSize: 11, color: color.textMid, marginTop: 4, lineHeight: 1.6 }}>
                {r.reason}
                <span style={{ fontSize: 9, color: color.textLight, marginLeft: space[2] }}>
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

function MemberCard({ m, report, openProfile, currentUser }) {
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
    <Card
      variant="default"
      padding="none"
      style={{ borderRadius: radius.md }}
      bodyStyle={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* ヘッダー: アバター + 名前 + 売上 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2.5] }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: color.navy, color: color.white,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: font.weight.bold, overflow: 'hidden', flexShrink: 0,
        }}>
          {m.avatar_url ? <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.name || '?')[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => openProfile?.(m.member_id)}
            style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy, cursor: openProfile ? 'pointer' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.name}
          </div>
          {m.sales > 0 && (
            <div style={{ fontSize: 10, color: color.textMid, fontFamily: font.family.mono, marginTop: 1 }}>
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
                  style={{ color: color.navy, fontWeight: font.weight.medium, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.list_name}
                </span>
                <span style={{ color: color.textMid, fontSize: 10, fontFamily: font.family.mono, whiteSpace: 'nowrap' }}>
                  {r.start_no}–{r.end_no} <span style={{ color: color.textLight }}>({r.count})</span>
                </span>
              </div>
            ))}
            {hiddenRangeCount > 0 && (
              <button onClick={() => setShowAllRanges(true)}
                style={{ background: 'none', border: 'none', color: color.textMid, cursor: 'pointer', fontSize: 10, padding: 0, textAlign: 'left', textDecoration: 'underline', alignSelf: 'flex-start' }}>
                さらに {hiddenRangeCount} 件
              </button>
            )}
            {showAllRanges && m.call_ranges.length > RANGE_COLLAPSE_AT && (
              <button onClick={() => setShowAllRanges(false)}
                style={{ background: 'none', border: 'none', color: color.textMid, cursor: 'pointer', fontSize: 10, padding: 0, textAlign: 'left', textDecoration: 'underline', alignSelf: 'flex-start' }}>
                折りたたむ
              </button>
            )}
          </div>
        </div>
      )}

      {/* 録音（画面下部固定の統一プレイヤーで再生） */}
      {(m.appo_recordings?.length > 0 || m.rejection_recordings?.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2.5] }}>
          {m.appo_recordings?.length > 0 && (
            <RecordingGroup
              label="アポ獲得録音" count={m.appo_recordings.length} accent="#059669"
              records={m.appo_recordings} memberName={m.name}
            />
          )}
          {m.rejection_recordings?.length > 0 && (
            <RecordingGroup
              label="キーマン断り録音" count={m.rejection_recordings.length} accent="#DC2626"
              records={m.rejection_recordings} memberName={m.name}
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
          style={{ width: '100%', padding: '6px 9px', fontSize: 11, border: `1px solid ${color.border}`, borderRadius: radius.sm, fontFamily: font.family.sans, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6, color: color.textDark }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, gap: 6 }}>
          {feedbackMeta?.at ? (
            <span style={{ fontSize: 9, color: color.textLight }}>
              {feedbackMeta.by || '不明'} / {(feedbackMeta.at || '').slice(0, 16).replace('T', ' ')}
            </span>
          ) : <span />}
          <Button
            size="sm"
            variant={feedback !== feedbackSaved ? 'primary' : 'secondary'}
            onClick={saveFeedback}
            loading={savingFb}
            disabled={savingFb || feedback === feedbackSaved}
            style={{ minHeight: 24, padding: '3px 12px', fontSize: 10 }}
          >
            {savingFb ? '保存中…' : (feedback === feedbackSaved ? '保存済' : '保存')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CardEyebrow({ children }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: font.weight.bold, color: color.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function RecordingGroup({ label, count, accent, records, memberName }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: font.weight.bold, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label} ({count})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {records.map(r => (
          <RecordingRow key={r.id} r={r} accent={accent} memberName={memberName} label={label} />
        ))}
      </div>
    </div>
  );
}

function RecordingRow({ r, accent, memberName, label }) {
  const { play, isCurrent } = useRecordingPlayer();
  const playing = isCurrent(r.recording_url);
  const handleClick = () => {
    if (!r.recording_url) return;
    const title = `${r.company || '会社名不明'}（${label}）`;
    const subtitle = `${memberName || ''} ${(r.called_at || '').slice(11, 16)}`.trim();
    play(r.recording_url, title, subtitle);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: space[2], fontSize: 11, padding: '3px 0' }}>
      <span title={r.company || '会社名不明'}
        style={{ color: color.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.company || '会社名不明'}
      </span>
      <span style={{ color: color.textLight, fontSize: 10, fontFamily: font.family.mono }}>
        {(r.called_at || '').slice(11, 16)}
      </span>
      <button onClick={handleClick} disabled={!r.recording_url}
        style={{
          width: 24, height: 22, padding: 0, fontSize: 10, fontWeight: font.weight.semibold,
          background: playing ? (accent || color.navy) : color.white,
          color: playing ? color.white : (accent || color.navy),
          border: `1px solid ${accent || color.navy}`, borderRadius: radius.sm,
          cursor: r.recording_url ? 'pointer' : 'not-allowed',
          opacity: r.recording_url ? 1 : 0.4,
          fontFamily: font.family.sans,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{playing ? '■' : '▶'}</button>
    </div>
  );
}

function PickList({ title, sub, items }) {
  return (
    <div style={{ background: '#FEF7E6', border: '1px solid #F4D589', borderRadius: radius.md, padding: space[2.5] }}>
      <div style={{ fontSize: 10.5, fontWeight: font.weight.bold, color: '#92400E', marginBottom: 4 }}>{title}</div>
      {sub && <div style={{ fontSize: 9.5, color: '#A16207', marginBottom: 6, fontFamily: font.family.mono }}>{sub}</div>}
      {items.length === 0 ? (
        <div style={{ fontSize: 10.5, color: color.textLight }}>該当なし</div>
      ) : items.map(i => (
        <div key={i.member_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: color.navy, fontWeight: font.weight.semibold }}>・{i.name}</span>
          {i.hint && <span style={{ color: color.textMid, fontSize: 10, fontFamily: font.family.mono }}>{i.hint}</span>}
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
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, padding: '0 6px', borderBottom: `1px solid ${color.border}` }}>
          {data.map(d => {
            const totalH = Math.max(2, ((d.count || 0) / maxCount) * 130);
            const apposH = totalH * ((d.appointments || 0) / Math.max(1, d.count));
            const connectsH = totalH * (((d.connects || 0) - (d.appointments || 0)) / Math.max(1, d.count));
            const callsH = totalH - apposH - connectsH;
            const isPeak = d.hour === peakHour && (d.count || 0) > 0;
            const isHovered = hoverHour === d.hour;
            const tooltip = `${d.hour}時台\n架電 ${d.count || 0}件\nキーマン接続 ${d.connects || 0}件\nアポ獲得 ${d.appointments || 0}件`;
            return (
              <div key={d.hour}
                onMouseEnter={() => setHoverHour(d.hour)}
                onMouseLeave={() => setHoverHour(null)}
                title={tooltip}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 24, cursor: 'default', background: isHovered ? '#0D224708' : 'transparent', borderRadius: radius.md }}>
                <div style={{ fontSize: 9, fontWeight: font.weight.bold,
                  color: isPeak ? '#DC2626' : color.textMid,
                  display: 'flex', alignItems: 'center', gap: 2 }}>
                  {isPeak && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#FEF2F2', color: '#DC2626' }}>PEAK</span>}
                  {d.count || ''}
                </div>
                {d.count > 0 ? (
                  <div style={{ width: '100%', maxWidth: 28, height: totalH, display: 'flex', flexDirection: 'column-reverse', borderRadius: '3px 3px 0 0', overflow: 'hidden', boxShadow: isHovered ? '0 0 0 2px #0D224733' : 'none' }}>
                    <div style={{ height: callsH, background: color.navy + '60' }} />
                    <div style={{ height: connectsH, background: color.navy + 'cc' }} />
                    <div style={{ height: apposH, background: '#059669' }} />
                  </div>
                ) : (
                  <div style={{ width: '100%', maxWidth: 28, height: 2, background: color.borderLight, borderRadius: '3px 3px 0 0' }} />
                )}
                <div style={{ fontSize: 9, color: isPeak ? '#DC2626' : color.textLight, fontWeight: isPeak ? font.weight.bold : font.weight.normal }}>{d.hour}</div>
              </div>
            );
          })}
        </div>

        {/* リッチなホバー値表示（カーソル時間帯の集計を上部に表示） */}
        {hovered && (
          <div style={{
            position: 'absolute', top: 0, right: 0,
            background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
            padding: '6px 10px', fontSize: 10.5, color: color.textDark, lineHeight: 1.7,
            boxShadow: shadow.sm, minWidth: 140,
          }}>
            <div style={{ fontWeight: font.weight.bold, color: color.navy, marginBottom: 2 }}>{hovered.hour}時台</div>
            <div>架電件数 <span style={{ float: 'right', fontFamily: font.family.mono, fontWeight: font.weight.bold }}>{hovered.count || 0}</span></div>
            <div>キーマン接続数 <span style={{ float: 'right', fontFamily: font.family.mono, fontWeight: font.weight.bold, color: color.navy }}>{hovered.connects || 0}</span></div>
            <div>アポ獲得数 <span style={{ float: 'right', fontFamily: font.family.mono, fontWeight: font.weight.bold, color: '#059669' }}>{hovered.appointments || 0}</span></div>
          </div>
        )}
      </div>
      {/* 凡例 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: space[2], fontSize: 10, color: color.textMid }}>
        <LegendDot color={color.navy + '60'} label="架電" />
        <LegendDot color={color.navy + 'cc'} label="キーマン接続" />
        <LegendDot color="#059669" label="アポ獲得" />
      </div>
    </div>
  );
}

function LegendDot({ color: dotColor, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, background: dotColor, borderRadius: 2, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: space[2] }}>{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value, sub }) {
  return (
    <div style={{ background: color.cream, padding: '6px 8px', borderRadius: radius.sm, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: font.weight.bold, color: color.navy, fontFamily: font.family.mono }}>{value ?? 0}</div>
      {sub && <div style={{ fontSize: 9, color: color.textLight }}>{sub}</div>}
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ padding: 24, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>{children}</div>;
}

const th = { padding: '8px 10px', fontSize: 10.5, fontWeight: font.weight.bold, color: color.textMid, textAlign: 'center' };
const thNavy = { padding: '9px 10px', fontSize: 10.5, fontWeight: font.weight.bold, color: '#fff', textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', fontSize: 11.5, color: color.textDark, textAlign: 'center', fontFamily: font.family.mono };
const selectStyle = {
  padding: '5px 10px', fontSize: 12, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  fontFamily: font.family.sans, color: color.navy, fontWeight: font.weight.semibold,
};
const navBtnStyle = (disabled) => ({
  width: 28, height: 28, padding: 0, fontSize: 16, fontWeight: font.weight.semibold,
  background: disabled ? color.cream : color.white,
  color: disabled ? color.textLight : color.navy,
  border: `1px solid ${color.border}`, borderRadius: radius.sm,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: font.family.sans, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.5 : 1,
});
const iconBtnStyle = {
  padding: '5px 10px', fontSize: 10.5, fontWeight: font.weight.semibold,
  background: color.white, color: color.navy, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  cursor: 'pointer', fontFamily: font.family.sans,
};
