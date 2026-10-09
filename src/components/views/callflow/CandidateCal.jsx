import { toT } from './useCandidateDates';

// カレンダーのタブの上：訪問担当者の空き（2026-10-09 むー様・見本 call.html）
// 台本の二択（金）・その他候補（薄い金）・空き（青）・当社のアポ（紺）・移動の余白（斜線）。空きを押すと時刻を選べる
const H0 = 10, H1 = 19, PX = 26;

export default function CandidateCal({ data, visitor, onPick }) {
  const { cands = [], days = [], source, loading, startLabel } = data || {};
  if (loading && !days.length) return <div className="calh"><b>{visitor ? `${visitor}様の空き` : '訪問担当者の空き'}</b><span>読み込み中…</span></div>;
  const pick2 = cands.slice(0, 2).map(c => c.k), rest = cands.slice(2).map(c => c.k);
  const nAp = days.reduce((a, d) => a + d.appos.length, 0);
  const weeks = [days.slice(0, 5), days.slice(5, 10)].filter(w => w.length);
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="calh"><b>{visitor ? `${visitor}様の空き` : '訪問担当者の空き'}</b>
        <span>{source === 'calendar' ? 'Googleカレンダーから読み込み' : 'カレンダー未連携（注意事項の「いつから」だけで出しています）'}・{startLabel}以降・面談60分</span></div>
      <div className="calap">当社で取ったこのクライアントのアポ：{nAp}件。対面は移動の余白を前後に取り、その時間は候補に出さない</div>
      <div className="callg"><span><i className="cp" />台本の二択</span><span><i className="cr" />その他候補</span><span><i className="cf" />空き</span><span><i className="ca" />当社のアポ</span><span><i className="cb" />移動の余白</span></div>
      {weeks.map((w, wi) => (
        <div key={wi} className="calw">
          <div className="calt">{[...Array(H1 - H0 + 1)].map((_, i) => <span key={i} style={{ top: i * PX }}>{H0 + i}</span>)}</div>
          {w.map(d => {
            const cls = pick2.includes(d.k) ? 'cp' : rest.includes(d.k) ? 'cr' : '';
            return (
              <div key={d.k} className={`cald ${cls}`}>
                <div className="cdh">{d.md}<small>{d.w}</small></div>
                <div className="cdb" style={{ height: (H1 - H0) * PX }}>
                  {d.free.map(([a, b]) => (
                    <i key={a} className="tipd" title={`${d.md}（${d.w}）${toT(a)}〜${toT(b)} 空き・押すと時刻を選べる`} style={{ top: (a - H0) * PX, height: (b - a) * PX - 2, cursor: 'pointer' }}
                      onClick={() => onPick && onPick({ ...d, t: toT(a) })}>{toT(a)}</i>
                  ))}
                  {d.appos.map((x, i) => {
                    const ba = Math.max(H0, x.s - x.buf), bb = Math.min(H1, x.e + x.buf);
                    return [
                      <u key={`u${i}`} className="buf tipd" title={`移動の余白 ${toT(x.s - x.buf)}〜${toT(x.s)}・${toT(x.e)}〜${toT(x.e + x.buf)}（${x.loc || (x.online ? 'オンライン' : '場所未記入')}）`} style={{ top: (ba - H0) * PX, height: (bb - ba) * PX - 2 }} />,
                      <s key={`s${i}`} className="ap tipd" title={`当社のアポ ${toT(x.s)}〜${toT(x.e)} ${x.name}・${x.online ? 'オンライン' : '対面'}`} style={{ top: (x.s - H0) * PX, height: (x.e - x.s) * PX - 2 }}>{toT(x.s)}<br />アポ</s>,
                    ];
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
