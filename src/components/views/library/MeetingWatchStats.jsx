import { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';
import { fetchWeeklyMeetingWatchLogs } from '../../../lib/supabaseWrite';
import { Badge, Button, DataTable } from '../../ui';
import { useIsMobile } from '../../../hooks/useIsMobile';

// 週次ミーティングの視聴状況。全員に見せる。
//   player    : 何秒から何秒まで見たか（2026-09-26から記録）
//   estimated : 記録を始める前の分。Cloudflare の再生記録からの推定分数（区間は無い）

// 合計の視聴時間。1時間を超えたら「3時間12分」
function fmtDuration(sec) {
  const min = Math.round(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)}時間${min % 60}分` : `${min}分`;
}

export function fmtSec(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}

function mergeIntervals(list) {
  const sorted = list.map(x => [x.start_sec, x.end_sec]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// 対象者：営業代行（売り手ソーシング）に所属し、在籍中で入社日のある人。役員は除く
const isTarget = (m) => m.is_active && m.start_date && !String(m.position || '').includes('取締役') && m.user_id;

export function useMeetingWatchData(refreshKey) {
  const [state, setState] = useState({ loading: true, logs: [], members: [], attended: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: logs }, { data: ms }, { data: att }, { data: sourcing }] = await Promise.all([
        fetchWeeklyMeetingWatchLogs(),
        supabase.from('members').select('id, user_id, name, start_date, team, position, is_active')
          .eq('is_active', true).not('start_date', 'is', null).order('start_date'),
        supabase.from('weekly_meeting_viewers').select('video_id, member_id').eq('reason', 'attended'),
        // スパキャリだけの人は対象にしない
        supabase.from('member_engagements').select('member_id, engagements!inner(slug)').eq('engagements.slug', 'seller_sourcing'),
      ]);
      const sourcingIds = new Set((sourcing || []).map(r => r.member_id));
      const members = (ms || []).filter(m => isTarget(m) && sourcingIds.has(m.id));
      if (alive) setState({ loading: false, logs: logs || [], members, attended: att || [] });
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  // stats[videoId][userId] = { intervals, coveredSec, estimatedSec, lastAt }
  const stats = useMemo(() => {
    const byKey = {};
    for (const l of state.logs) {
      const v = (byKey[l.video_id] ||= {});
      const u = (v[l.user_id] ||= { player: [], estimatedSec: 0, lastAt: null });
      if (l.source === 'player') u.player.push(l);
      else u.estimatedSec += l.watched_sec || 0;
      if (!u.lastAt || l.ended_at > u.lastAt) u.lastAt = l.ended_at;
    }
    for (const v of Object.values(byKey)) for (const u of Object.values(v)) {
      u.intervals = mergeIntervals(u.player);
      u.coveredSec = u.intervals.reduce((a, [s, e]) => a + (e - s), 0);
      u.totalSec = u.coveredSec || u.estimatedSec;
    }
    return byKey;
  }, [state.logs]);

  const attendedSet = useMemo(() => new Set(state.attended.map(a => `${a.video_id}:${a.member_id}`)), [state.attended]);
  // 出欠を記録している回（第23回以降）。記録の無い回は欠席と言えない
  const recordedIds = useMemo(() => new Set(state.attended.map(a => a.video_id)), [state.attended]);
  // 入社日より後に開かれた、出欠を記録している回で、出席していない
  // （入社日当日の回は入社前として扱う。Zoomの出欠集計と同じ）
  const isAbsent = (v, m) => recordedIds.has(v.id) && !!m.start_date && !!v.meeting_date
    && m.start_date < v.meeting_date && !attendedSet.has(`${v.id}:${m.id}`);
  return { ...state, stats, attendedSet, isAbsent };
}

// 推定は同じ回を何度か開いた分を足すので、動画の長さを上限にする
const watchedSec = (s, v) => Math.min(s?.totalSec || 0, v?.duration_sec || Infinity);

const NOTE = '「何秒〜何秒」は2026年9月26日から記録しています。それより前（6月30日以降）の分は、Cloudflareの再生記録とSpanaviのアクセス記録を突き合わせて推定した視聴分数です（区間なし）。6月29日以前は誰が見たかの記録が残っていません。';

// 一覧の上：人 × 回の視聴分数と出欠（最初から開いておき、閉じることもできる）
export function MeetingWatchOverview({ meetings, data }) {
  const [open, setOpen] = useState(true);
  const isMobile = useIsMobile();
  const { loading, members, stats, attendedSet, isAbsent } = data;
  if (loading) return null;


  return (
    <div style={{
      border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
      padding: space[3], marginBottom: space[3], background: color.gray50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <div style={{ fontWeight: font.weight.bold, color: color.navy, fontSize: font.size.base }}>視聴状況</div>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          対象 {members.length}人
        </div>
        <Button size="sm" variant={open ? 'primary' : 'outline'} onClick={() => setOpen(!open)} style={{ marginLeft: 'auto' }}>
          {open ? '■ 視聴データを閉じる' : '視聴データ'}
        </Button>
      </div>

      {open && (
        <div style={{ marginTop: space[3] }}>
          <DataTable
            columns={[
              { key: 'name', label: '名前', width: isMobile ? 84 : 110, align: 'left', sortable: true, sortType: 'string', sticky: true,
                cellStyle: { fontWeight: font.weight.semibold, color: color.navy } },
              { key: 'count', label: '見た回', width: 72, align: 'right', sortable: true },
              { key: 'totalSec', label: '視聴時間', width: 96, align: 'right', sortable: true,
                render: (r) => (r.totalSec ? fmtDuration(r.totalSec) : '—') },
              { key: 'attended', label: '出席', width: 64, align: 'right', sortable: true,
                render: (r) => `${r.attended}回` },
              ...meetings.map(v => ({
                key: v.id, label: shortTitle(v.title), width: 92, align: 'right', sortable: true,
                sortValue: (r) => r.cells[v.id]?.sec || 0,
                render: (r) => {
                  const c = r.cells[v.id];
                  const att = attendedSet.has(`${v.id}:${r.id}`);
                  const absent = isAbsent(v, r.member);
                  if (!c && !att && !absent) return <span style={{ color: color.gray300 }}>—</span>;
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
                      {att && <Badge variant="info" size="sm">出席</Badge>}
                      {absent && <Badge variant="danger" size="sm">欠席</Badge>}
                      {c && <span>{Math.max(1, Math.round(c.sec / 60))}分</span>}
                    </span>
                  );
                },
              })),
            ]}
            rows={members.map(m => {
              const cells = {};
              let totalSec = 0;
              for (const v of meetings) {
                const sec = watchedSec(stats[v.id]?.[m.user_id], v);
                if (sec > 0) { cells[v.id] = { sec }; totalSec += sec; }
              }
              const attended = meetings.filter(v => attendedSet.has(`${v.id}:${m.id}`)).length;
              return { id: m.id, name: m.name, member: m, count: Object.keys(cells).length, totalSec, attended, cells };
            })}
            rowKey="id"
            height="auto"
            mobileCards={false}
            showCount={false}
          />
          <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: space[1.5] }}>出席・欠席は第23回以降（Zoomの参加者記録から）。欠席は入社後に開かれた回だけに付けています。{NOTE}</div>
        </div>
      )}
    </div>
  );
}

// 各回の下：視聴率・人ごとの分数と区間・未視聴者
export function MeetingWatchPanel({ meeting, data }) {
  const { loading, members, stats, attendedSet } = data;
  if (loading) return <div style={{ fontSize: font.size.xs, color: color.textLight }}>読み込み中…</div>;
  const dur = meeting.duration_sec || 0;
  const per = stats[meeting.id] || {};
  const rows = members
    .map(m => ({ m, s: per[m.user_id] }))
    .filter(x => x.s?.totalSec > 0)
    .sort((a, b) => b.s.totalSec - a.s.totalSec);
  const unwatched = members.filter(m => !(per[m.user_id]?.totalSec > 0));

  return (
    <div style={{ border: `1px solid ${color.borderLight}`, borderRadius: radius.md, padding: space[3], background: color.white }}>
      <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Stat label="視聴率" value={members.length ? `${Math.round(rows.length / members.length * 100)}%` : '—'} sub={`${rows.length} / ${members.length}人`} />
        <Stat label="動画の長さ" value={dur ? fmtSec(dur) : '—'} />
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {rows.map(({ m, s }) => (
            <div key={m.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
                <span style={{ fontWeight: font.weight.bold, color: color.navy, fontSize: font.size.sm, minWidth: 88 }}>{m.name}</span>
                <span style={{ fontSize: font.size.sm, color: color.textDark }}>
                  {Math.max(1, Math.round(watchedSec(s, meeting) / 60))}分
                  {s.coveredSec > 0 && dur ? ` ・ ${Math.min(100, Math.round(s.coveredSec / dur * 100))}%` : ''}
                </span>
                {attendedSet.has(`${meeting.id}:${m.id}`) && <Tag>出席</Tag>}
                {s.lastAt && <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>最終 {fmtDateTime(s.lastAt)}</span>}
              </div>
              {s.coveredSec > 0 && dur > 0 && (
                <>
                  <div style={{ position: 'relative', height: 8, background: color.gray100, borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                    {s.intervals.map(([a, b], i) => (
                      <div key={i} style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${a / dur * 100}%`, width: `${Math.max(0.4, (b - a) / dur * 100)}%`, background: color.navy,
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: font.size.xs - 1, color: color.textMid, marginTop: 2, fontFamily: font.family.mono }}>
                    {s.intervals.map(([a, b]) => `${fmtSec(a)}〜${fmtSec(b)}`).join('　')}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: space[3] }}>
        <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textMid, marginBottom: space[1] }}>
          未視聴 {unwatched.length}人
        </div>
        {unwatched.length === 0
          ? <div style={{ fontSize: font.size.xs, color: color.textLight }}>いません</div>
          : <NameChips names={unwatched.map(m => attendedSet.has(`${meeting.id}:${m.id}`) ? `${m.name}（出席）` : m.name)} />}
      </div>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: space[2] }}>{NOTE}</div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight }}>{label}</div>
      <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
        {value}{sub && <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: 'normal', marginLeft: space[1.5] }}>{sub}</span>}
      </div>
    </div>
  );
}

function Tag({ children }) {
  return <span style={{ fontSize: font.size.xs - 1, padding: '0 6px', borderRadius: 4, background: color.infoSoft, color: color.info }}>{children}</span>;
}

function NameChips({ names, tone }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
      {names.map(n => (
        <span key={n} style={{
          fontSize: font.size.xs, padding: `1px ${space[2]}px`, borderRadius: 999,
          background: tone === 'danger' ? color.dangerSoft : color.gray100,
          color: tone === 'danger' ? color.danger : color.textMid,
        }}>{n}</span>
      ))}
    </div>
  );
}


function shortTitle(t) {
  const m = String(t || '').match(/第\s*(\d+)\s*回/);
  return m ? `第${m[1]}回` : String(t || '').slice(0, 6);
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
