import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { Card, Badge, DataTable } from '../../ui';
import { InlineAudioPlayer } from '../../common/InlineAudioPlayer';
import { supabase } from '../../../lib/supabase';

// 「dorayaki AI」タブ。ギフト同梱DMの配送と二次元コードの読み取りを出す。
// 社内の案件ページとクライアントポータルの両方から同じものを使う
// （表示内容は常に一致させる）。
//
// 数えるのは gift_shipment_stats ビュー1本に寄せてある。画面側で数えない。
// 読み取り件数は機械（クローラー）を除いた人の読み取りだけ。

const GIFT_LABEL = { beer: 'ビール', dorayaki: 'どら焼き' };

// call_records.status は日本語ラベルで入っている（id ではない）
const CALL_BADGE = {
  'アポ獲得': 'success',
  'キーマン再コール': 'info',
  '受付再コール': 'info',
  '問い合わせフォーム': 'info',
  'キーマン断り': 'warn',
  '除外': 'danger',
};

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return y ? `${Number(m)}/${Number(day)}` : '';
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Tile({ label, value, sub }) {
  return (
    <Card padding="sm" style={{ flex: '1 1 0', minWidth: 148 }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>
        {label}
      </div>
      <div style={{
        fontSize: font.size['2xl'], fontWeight: font.weight.semibold,
        color: color.navy, lineHeight: font.lineHeight.tight,
      }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[1] }}>
          {sub}
        </div>
      ) : null}
    </Card>
  );
}

export default function GiftDmTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlyScanned, setOnlyScanned] = useState(false);
  const [activeRec, setActiveRec] = useState(null); // { id, company, url }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('gift_shipment_stats')
        .select('*')
        .eq('client_id', client.id)
        .order('company', { ascending: true });
      if (cancelled) return;
      if (err) console.error('[GiftDmTab] fetch error:', err);
      setError(err ? '読み込みに失敗しました' : null);
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const stats = useMemo(() => {
    const n = rows.length;
    // 受取拒否・返送は到着に数えない（配送業者の記録上は配達完了でも、先方の手元に残っていない）
    const returned = rows.filter(r => r.return_status).length;
    const delivered = rows.filter(r => r.delivered_on && !r.return_status).length;
    const scanned = rows.filter(r => r.first_scan_at).length;
    const clicked = rows.filter(r => r.clicked_calendar || r.clicked_deck || r.clicked_website).length;
    const calendar = rows.filter(r => r.clicked_calendar).length;
    const booked = rows.filter(r => r.booked_at).length;
    const called = rows.filter(r => r.call_called_at).length;
    const recorded = rows.filter(r => r.recording_url).length;
    const pct = (v) => (n ? `${Math.round((v / n) * 1000) / 10}%` : '—');
    return { n, delivered, returned, scanned, clicked, calendar, booked, called, recorded, pct };
  }, [rows]);

  // 読み取りのあった会社を上に、新しい順。まだの会社は社名順で下に続ける。
  const sorted = useMemo(() => {
    const list = onlyScanned ? rows.filter(r => r.first_scan_at) : rows;
    return [...list].sort((a, b) => {
      if (a.first_scan_at && b.first_scan_at) return b.first_scan_at.localeCompare(a.first_scan_at);
      if (a.first_scan_at) return -1;
      if (b.first_scan_at) return 1;
      return (a.company || '').localeCompare(b.company || '', 'ja');
    });
  }, [rows, onlyScanned]);

  const columns = useMemo(() => [
    {
      key: 'company', label: '会社名', width: 300, align: 'left', mobilePrimary: true,
      render: (r) => (
        <span style={{ fontWeight: r.first_scan_at ? font.weight.semibold : font.weight.normal }}>
          {r.company}
        </span>
      ),
    },
    {
      key: 'gift_type', label: 'ギフト', width: 110, align: 'center',
      render: (r) => (
        <Badge variant={r.gift_type === 'beer' ? 'info' : 'neutral'}>
          {GIFT_LABEL[r.gift_type] || r.gift_type}
        </Badge>
      ),
    },
    {
      key: 'shipped_on', label: '発送', width: 84, align: 'right',
      render: (r) => fmtDate(r.shipped_on) || '—',
    },
    {
      key: 'delivered_on', label: '到着', width: 84, align: 'right',
      cellStyle: { color: color.textMid },
      render: (r) => (r.return_status
        ? <Badge variant="warn">{r.return_status}</Badge>
        : (fmtDate(r.delivered_on) || '—')),
    },
    {
      key: 'first_scan_at', label: '読み取り', width: 170, align: 'right',
      render: (r) => (r.first_scan_at ? (
        <span>
          {fmtDateTime(r.first_scan_at)}
          {r.scan_count > 1 ? (
            <span style={{ color: color.textLight }}>{`　計${r.scan_count}回`}</span>
          ) : null}
        </span>
      ) : '—'),
    },
    {
      key: 'pressed', label: '押された導線', width: 200, align: 'left',
      render: (r) => [
        r.clicked_calendar ? '日程調整' : null,
        r.clicked_deck ? '会社紹介資料' : null,
        r.clicked_website ? 'ホームページ' : null,
      ].filter(Boolean).join('・') || '—',
    },
    {
      key: 'call_status', label: 'フォロー架電', width: 150, align: 'left',
      render: (r) => (r.call_status ? (
        <span>
          <Badge variant={CALL_BADGE[r.call_status] || 'neutral'}>{r.call_status}</Badge>
          {r.call_count > 1 ? (
            <span style={{ color: color.textLight, fontSize: font.size.xs }}>{`　計${r.call_count}回`}</span>
          ) : null}
        </span>
      ) : '—'),
    },
    {
      key: 'call_called_at', label: '架電日', width: 150, align: 'right',
      cellStyle: { color: color.textMid },
      render: (r) => (r.call_called_at ? (
        <span>
          {fmtDateTime(r.call_called_at)}
          {r.caller_name ? (
            <span style={{ color: color.textLight, fontSize: font.size.xs }}>{`　${r.caller_name}`}</span>
          ) : null}
        </span>
      ) : '—'),
    },
    {
      key: 'recording_url', label: '録音', width: 88, align: 'center',
      render: (r) => (r.recording_url ? (
        <button
          type="button"
          onClick={() => setActiveRec({ id: r.id, company: r.company, url: r.recording_url })}
          style={{
            border: `1px solid ${color.border}`, background: color.surface,
            color: color.navy, borderRadius: 4, padding: '2px 10px',
            fontSize: font.size.xs, cursor: 'pointer',
          }}
        >再生</button>
      ) : '—'),
    },
  ], []);

  // 録音のある行が1つも無いうちは、空の列を出さない
  const visibleColumns = useMemo(
    () => (rows.some(r => r.recording_url) ? columns : columns.filter(c => c.key !== 'recording_url')),
    [columns, rows],
  );

  const shippedOn = rows.find(r => r.shipped_on)?.shipped_on;

  return (
    <div>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <Tile label="送付" value={stats.n} sub={shippedOn ? `${fmtDate(shippedOn)} 発送` : null} />
        <Tile
          label="到着"
          value={stats.delivered}
          sub={[
            stats.delivered ? stats.pct(stats.delivered) : '配送データ待ち',
            stats.returned ? `返送・受取拒否 ${stats.returned}` : null,
          ].filter(Boolean).join('　')}
        />
        <Tile label="二次元コードの読み取り" value={stats.scanned} sub={stats.pct(stats.scanned)} />
        <Tile label="導線のクリック" value={stats.clicked} sub={`うち日程調整 ${stats.calendar}`} />
        <Tile label="日程調整の予約" value={stats.booked} sub={stats.pct(stats.booked)} />
        <Tile
          label="フォロー架電"
          value={stats.called}
          sub={stats.called ? `${stats.pct(stats.called)}　録音 ${stats.recorded}` : '架電前'}
        />
      </div>

      {activeRec ? (
        <Card padding="sm" style={{ marginBottom: space[3] }}>
          <div style={{
            fontSize: font.size.xs, color: color.textMid, marginBottom: space[1],
          }}>
            {activeRec.company}
          </div>
          <InlineAudioPlayer url={activeRec.url} onClose={() => setActiveRec(null)} />
        </Card>
      ) : null}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: space[2], gap: space[3], flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          読み取りは機械による取得を除いた件数
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: space[1],
          fontSize: font.size.xs, color: color.textMid, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={onlyScanned}
            onChange={(e) => setOnlyScanned(e.target.checked)}
          />
          読み取りのあった会社のみ
        </label>
      </div>

      <DataTable
        fillWidth
        columns={visibleColumns}
        rows={sorted}
        rowKey="id"
        loading={loading}
        error={error}
        emptyMessage="ギフト同梱DMの送付先がまだありません"
        rowAccent={(r) => (r.first_scan_at ? 'primary' : (r.return_status ? 'warn' : null))}
        height="calc(100vh - 380px)"
        ariaLabel="ギフト同梱DMの送付先"
      />
    </div>
  );
}
