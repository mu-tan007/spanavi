import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { color, space, font } from '../../../../constants/design';
import { Badge, DataTable, Button, Select } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import { loadZoomArchive, openZoomArchive } from '../../../../lib/spacareer/zoomArchive';

// ============================================================
// スパキャリ Zoom録画（admin限定）
//
//   Zoomのクラウド録画を R2 へ移したものの一覧と再生（2026-10-08〜）。
//   Zoomの容量（アカウント全体40GB）が満杯で録画が止まったため、移してからZoomのゴミ箱へ送っている。
//   Zoomから外したあとも、ここから見られる。
// ============================================================

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)}GB` : `${Math.round(bytes / 1e6)}MB`;
}

export default function SpacareerZoomRecordingsView() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [host, setHost] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setMeetings((await loadZoomArchive()).meetings); }
    catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hostOptions = useMemo(() => {
    const hosts = [...new Set(meetings.map((m) => m.host_email).filter(Boolean))].sort();
    return [{ value: '', label: 'すべて' }, ...hosts.map((h) => ({ value: h, label: h }))];
  }, [meetings]);

  const rows = useMemo(
    () => meetings.filter((m) => !host || m.host_email === host),
    [meetings, host],
  );

  const play = async (key) => {
    try { await openZoomArchive(key); } catch (e) { setError(e.message); }
  };

  const columns = [
    { key: 'start_time', label: '開始', width: 130, align: 'right', sortable: true, sortValue: (m) => new Date(m.start_time).getTime(),
      render: (m) => <span style={{ color: color.textMid }}>{fmtDateTime(m.start_time)}</span> },
    { key: 'host_email', label: 'ホスト', width: 230, mobilePrimary: true,
      render: (m) => <span style={{ color: color.textDark }}>{m.host_email || '—'}</span> },
    { key: 'topic', label: '会議名', width: 260, mobileHidden: true,
      render: (m) => <span style={{ color: color.textMid }}>{m.topic || '—'}</span> },
    { key: 'duration_min', label: '長さ', width: 70, align: 'right', sortable: true, sortValue: (m) => m.duration_min ?? 0,
      render: (m) => <span style={{ color: color.textMid }}>{m.duration_min != null ? `${m.duration_min}分` : '—'}</span> },
    { key: 'size', label: '大きさ', width: 80, align: 'right', sortable: true, sortValue: (m) => m.size,
      render: (m) => <span style={{ color: color.textMid }}>{fmtSize(m.size)}</span> },
    { key: '_state', label: '保存', width: 120, align: 'center',
      render: (m) => (m.archived
        ? <Badge variant="success" size="sm" dot>{m.trashed ? 'スパナビのみ' : 'スパナビ・Zoom'}</Badge>
        : <Badge variant="warn" size="sm" dot>移送待ち</Badge>) },
    { key: '_play', label: '再生', width: 80, align: 'center',
      render: (m) => (m.play
        ? <Button size="sm" variant="outline" onClick={() => play(m.play.r2_key)}>再生</Button>
        : <span style={{ color: color.textLight }}>—</span>) },
  ];

  return (
    <div>
      <PageHeader
        title="Zoom録画"
        description="Zoomのクラウド録画をスパナビに移したもの。Zoomから外したあとも、ここから再生できる。"
        compact
      />
      <div style={{ paddingTop: space[4] }}>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', marginBottom: space[4], flexWrap: 'wrap' }}>
          <div style={{ width: 260 }}>
            <Select size="sm" label="ホスト" value={host} onChange={(e) => setHost(e.target.value)} options={hostOptions} fullWidth />
          </div>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>{rows.length}件</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="uuid"
          loading={loading}
          error={error}
          emptyMessage="移した録画なし"
          height="calc(100vh - 260px)"
        />
      </div>
    </div>
  );
}
