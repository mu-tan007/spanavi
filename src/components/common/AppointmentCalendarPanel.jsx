import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, DataTable, Badge } from '../ui';
import { color, space, radius, font, alpha } from '../../constants/design';
import { fetchContactAppointments } from '../../lib/appointmentCalendar';
import { subscribeContactCalendar } from '../../lib/appointmentCalendarSubscription';
import { calendarMonth, jstDate, shiftCalendarMonth } from '../../utils/appointmentCalendar';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function AppointmentCalendarPanel({ clientId, contact }) {
  const [selectedDate, setSelectedDate] = useState(jstDate);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: '', loading: true, loaded: false, rows: [], error: '' });
  const [connectionError, setConnectionError] = useState('');
  const month = useMemo(() => calendarMonth(selectedDate), [selectedDate.slice(0, 7)]);
  const key = `${clientId}:${contact.id}:${month.start}`;
  const snapshot = useRef();
  snapshot.current = { rows: state.key === key ? state.rows : [], start: month.start, next: month.next };

  useEffect(() => {
    setConnectionError('');
    return subscribeContactCalendar({
      clientId, contactId: contact.id,
      getSnapshot: () => snapshot.current,
      onChange: () => setRevision(value => value + 1),
      onConnection: setConnectionError,
    });
  }, [clientId, contact.id]);

  useEffect(() => {
    let cancelled = false;
    setState(previous => ({ key, loading: true, loaded: previous.key === key && previous.loaded, rows: previous.key === key ? previous.rows : [], error: '' }));
    fetchContactAppointments({ clientId, contactId: contact.id, start: month.start, next: month.next })
      .then(rows => { if (!cancelled) setState({ key, loading: false, loaded: true, rows, error: '' }); })
      .catch(() => {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: previous.loaded
          ? '更新に失敗しました。前回取得した予定を表示しています。「更新」で再取得してください。'
          : '予定を取得できませんでした。「更新」で再取得してください。' }));
      });
    return () => { cancelled = true; };
  }, [key, revision]);

  const loading = state.key !== key || (!state.loaded && state.loading);
  const refreshing = state.key === key && state.loaded && state.loading;
  const error = state.key === key ? state.error : '';
  const rows = state.key === key && state.loaded ? state.rows : [];
  const daily = rows.filter(row => row.date === selectedDate);
  const today = jstDate();
  const columns = [
    { key: 'time', label: '開始時刻', width: 90, align: 'right', render: row => row.time || '時刻未登録' },
    { key: 'company', label: '訪問先・面談方法', width: 250, align: 'left', render: row => (
      <div style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', padding: `${space[1]}px 0` }}>
        <div style={{ fontWeight: font.weight.semibold }}>{row.company}</div>
        <div style={{ color: color.textMid, fontSize: font.size.xs, marginTop: space[1] }}>{row.online ? 'オンライン' : row.location || '訪問先未登録'}</div>
        {row.shared && <div style={{ color: color.textMid, fontSize: font.size.xs }}>複数担当の案件</div>}
      </div>
    ) },
    { key: 'area', label: 'エリア', width: 110, align: 'left' },
    { key: 'status', label: '状態', width: 95, align: 'center', render: row => <Badge variant={row.status === '面談済' ? 'success' : 'neutral'}>{row.status}</Badge> },
  ];

  return (
    <section aria-label={`${contact.name}さんの当社登録アポ`} style={{ fontFamily: font.family.sans, color: color.textDark }}>
      <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>{contact.name}さんの面談予定</div>
      <p style={{ fontSize: font.size.xs, color: color.textMid, margin: `${space[2]}px 0`, lineHeight: font.lineHeight.relaxed }}>
        当社登録のアポを、担当する全案件から表示します。空欄はご本人の空きを保証しません。終了時刻・移動時間は含みません。
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        <Button variant="outline" size="sm" aria-label="前月" onClick={() => setSelectedDate(date => shiftCalendarMonth(date, -1))}>‹</Button>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold }}>{month.start.slice(0, 4)}年{Number(month.start.slice(5, 7))}月</span>
        <Button variant="outline" size="sm" aria-label="翌月" onClick={() => setSelectedDate(date => shiftCalendarMonth(date, 1))}>›</Button>
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(jstDate())}>今日</Button>
        <Button variant="ghost" size="sm" disabled={loading || refreshing} onClick={() => setRevision(value => value + 1)}>更新</Button>
        <Input type="date" aria-label="表示する日" size="sm" value={selectedDate} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setSelectedDate(event.target.value); }} containerStyle={{ width: 155 }} />
      </div>
      <div aria-live="polite" style={{ minHeight: space[5], fontSize: font.size.xs, color: error ? color.danger : color.textMid }}>
        {loading ? '面談予定を読み込み中…' : error || connectionError || `${rows.length}件の面談予定（キャンセル・日時未確定のリスケは除外）`}
      </div>
      {state.key === key && state.loaded && (
        <div style={{ overflowX: 'auto', marginTop: space[1], marginBottom: space[3] }}>
          <div style={{ minWidth: 420, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: space[0.5] }}>
            {WEEKDAYS.map(day => <div key={day} style={{ textAlign: 'center', padding: space[1], background: color.navy, color: color.white, fontSize: font.size.xs }}>{day}</div>)}
            {Array.from({ length: month.offset }, (_, i) => <div key={`empty-${i}`} />)}
            {month.days.map(date => {
              const appointments = rows.filter(row => row.date === date);
              return (
                <Button key={date} variant={date === selectedDate ? 'secondary' : 'ghost'} size="sm"
                  aria-pressed={date === selectedDate}
                  aria-label={`${date} ${appointments.length}件${appointments.map(row => ` ${row.time || '時刻未登録'} ${row.area} ${row.company}`).join('')}`}
                  onClick={() => setSelectedDate(date)}
                  style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', minHeight: 80, padding: space[1], gap: space[1], border: `1px solid ${date === selectedDate ? color.navy : color.borderLight}`, borderRadius: radius.sm, whiteSpace: 'normal' }}>
                  <span style={{ textAlign: 'left', color: date === today ? color.info : color.textDark, fontWeight: font.weight.bold }}>{Number(date.slice(8))}{date === today ? ' 今日' : ''}</span>
                  {appointments.slice(0, 2).map(row => <span key={row.id} title={`${row.time || '時刻未登録'} ${row.company} ${row.location}`} style={{ display: 'block', fontSize: font.size.xs, fontWeight: font.weight.normal, background: alpha(color.gold, 0.15), borderRadius: radius.sm, lineHeight: font.lineHeight.normal }}>
                    {row.time || '時刻未登録'}<br />{row.area}
                  </span>)}
                  {appointments.length > 2 && <span style={{ fontSize: font.size.xs }}>ほか{appointments.length - 2}件</span>}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ fontWeight: font.weight.semibold, fontSize: font.size.sm, margin: `${space[2]}px 0` }}>{selectedDate.replaceAll('-', '/')}の面談</div>
      <DataTable columns={columns} rows={daily} rowKey="id" loading={loading} error={state.loaded && state.key === key ? '' : error} height={240} fillWidth
        ariaLabel="選択日の面談予定" emptyMessage="この日の当社登録アポはありません" />
    </section>
  );
}
