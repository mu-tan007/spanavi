import './AppoOverview.css';
import { todoCounts, weekDays, weekMeetings, shortCompany, TODO_RULES } from '../../../utils/appoOverview';

// アポ一覧の上の段（2026-10-07 むー様確認の見本どおり）
//   数字3つ＋月ごとの有効アポの棒 ／ やること3つ（押すと表を絞る） ／ 今週の面談（押すとそのアポを開く）
const TODOS = [
  // 2026-10-08 むー様：左端に新着アポ（押すとすぐ詳細が開き、そこから報告を送る）
  { key: 'new', cls: 'nv', label: '新着アポ', desc: 'アポ取得報告をまだ送っていない' },
  // 2026-10-08 むー様：本日の事前確認・リスケ中・キャンセルの3つにする
  { key: 'today_pre', cls: 'blu', label: '本日の事前確認', desc: '面談が当日〜2営業日後でまだ確認していない' },
  { key: 'res', cls: 'amb', label: 'リスケ中', desc: '直近60日 ・ 新しい日程を追う' },
  { key: 'cancel', cls: 'red', label: 'キャンセル', desc: '面談日が直近60日' },
];
const CHIP = { '事前確認済': 'ok', 'アポ取得': 'wait', 'リスケ中': 'res', 'キャンセル': 'can', '面談済': 'done' };
const man = (yen) => {
  const v = (yen || 0) / 10000;
  return v >= 100 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toLocaleString();
};

export default function AppoOverview({ appoData, today, countable, totalSales, totalReward, periodLabel, monthStats, activeMonth, onPickMonth, todo, onTodo, onOpen }) {
  const counts = todoCounts(appoData, today);
  // 新着は取得日の古い順（先に取ったものから報告する）
  const newOnes = appoData.filter(a => TODO_RULES.new(a, today)).sort((a, b) => (a.getDate || '').localeCompare(b.getDate || ''));
  const days = weekDays(today);
  const byDay = weekMeetings(appoData, days);
  // 先の月（まだ始まっていない月）は出さない。古い月が左
  const months = monthStats.filter(m => m.yyyymm <= today.slice(0, 7));
  const mx = Math.max(1, ...months.map(m => m.count));

  return (
    <div className="ao">
      <div className="ao-kpi">
        <div className="ao-card ao-k"><span className="ao-lbl">{periodLabel}の有効アポ</span><div className="ao-v ao-num">{countable}<small>件</small></div><div className="ao-s">キャンセル・リスケ中を除く</div></div>
        <div className="ao-card ao-k"><span className="ao-lbl">当社売上</span><div className="ao-v ao-num">{man(totalSales)}<small>万円</small></div><div className="ao-s">{periodLabel}の有効アポ分</div></div>
        <div className="ao-card ao-k"><span className="ao-lbl">インターン報酬</span><div className="ao-v ao-num">{man(totalReward)}<small>万円</small></div><div className="ao-s">{periodLabel}の有効アポ分</div></div>
        <div className="ao-card ao-k">
          <span className="ao-lbl">月ごとの有効アポ</span>
          <div className="ao-months">
            {months.map((m, i) => (
              <button key={m.yyyymm} type="button" className={`ao-m${m.yyyymm === activeMonth ? ' is-on' : ''}`} onClick={() => onPickMonth(m.yyyymm)} title={`${m.month} ${m.count}件（押すと${m.month}の表示に切り替え）`}>
                <b className="ao-num">{m.count}</b>
                <i style={{ height: Math.max(2, (m.count / mx) * 40), animationDelay: `${i * 0.04}s` }} />
                <span>{m.month}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ao-todo">
        {TODOS.map(t => (
          <button key={t.key} type="button" className={`ao-card ao-td ${t.cls}${todo === t.key ? ' is-on' : ''}${counts[t.key] ? '' : ' is-zero'}`}
            onClick={() => {
              // 新着は表を絞ったうえで、いちばん古いものの詳細をすぐ開く（送信画面も開いた状態）
              if (t.key === 'new' && newOnes.length) { onTodo('new'); onOpen(newOnes[0], { compose: true }); return; }
              onTodo(todo === t.key ? '' : t.key);
            }}>
            <span className="ao-n ao-num">{counts[t.key]}</span>
            <span><span className="ao-t">{t.label}</span><span className="ao-d">{t.key === 'new' && newOnes.length ? newOnes.slice(0, 2).map(a => shortCompany(a.company)).join('・') + (newOnes.length > 2 ? ' ほか' : '') : t.desc}</span></span>
          </button>
        ))}
      </div>

      <div className="ao-card ao-week">
        <div className="ao-wh"><b>今週の面談</b><span className="ao-lbl">押すとそのアポを開く ・ 緑＝事前確認済　青＝確認前　黄＝リスケ中　赤線＝キャンセル</span></div>
        <div className="ao-days">
          {days.map(d => {
            const its = byDay[d.date] || [];
            const isToday = d.date === today;
            return (
              <div key={d.date} className={`ao-day${isToday ? ' is-today' : ''}`}>
                <h5><span>{d.label}（{d.dow}）{isToday ? ' 今日' : ''}</span><span className="ao-num">{its.length}件</span></h5>
                {its.length === 0 && <span className="ao-empty">なし</span>}
                {its.map((a, i) => (
                  <button key={a._supaId || i} type="button" className={`ao-chip ${CHIP[a.status] || ''}`} style={{ animationDelay: `${i * 0.04}s` }} onClick={() => onOpen(a)} title={`${a.company} ・ ${a.client} ・ ${a.status}`}>
                    <b className="ao-num">{(a.meetTime || '').slice(0, 5) || '—'}</b>{shortCompany(a.company)}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
