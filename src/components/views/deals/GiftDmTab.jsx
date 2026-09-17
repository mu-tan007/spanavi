import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';

// 「dorayaki AI」タブ。ギフト同梱DMの配送と二次元コードの読み取りを出す。
// 社内の案件ページとクライアントポータルの両方から同じものを使う
// （表示内容は常に一致させる）。
//
// 数えるのは gift_shipment_stats ビュー1本に寄せてある。画面側で数えない。
// 読み取り件数は機械（クローラー）を除いた人の読み取りだけ。

const GIFT_LABEL = { beer: 'ビール', dorayaki: 'どら焼き' };

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
    <div style={{
      flex: '1 1 0', minWidth: 132,
      background: color.white, border: `1px solid ${color.border}`,
      borderRadius: radius.md, padding: `${space[3]}px ${space[4]}px`,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: font.weight.semibold, color: color.navy, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

const th = {
  textAlign: 'left', padding: `${space[2]}px ${space[3]}px`,
  fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.normal,
  borderBottom: `1px solid ${color.border}`, whiteSpace: 'nowrap',
};
const td = {
  padding: `${space[2] + 2}px ${space[3]}px`,
  fontSize: font.size.sm, color: color.textDark,
  borderBottom: `1px solid ${color.borderLight}`, verticalAlign: 'top',
};

export default function GiftDmTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyScanned, setOnlyScanned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('gift_shipment_stats')
        .select('*')
        .eq('client_id', client.id)
        .order('company', { ascending: true });
      if (cancelled) return;
      if (error) console.error('[GiftDmTab] fetch error:', error);
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const stats = useMemo(() => {
    const n = rows.length;
    const delivered = rows.filter(r => r.delivered_on).length;
    const scanned = rows.filter(r => r.first_scan_at).length;
    const clicked = rows.filter(r => r.clicked_calendar || r.clicked_deck || r.clicked_website).length;
    const calendar = rows.filter(r => r.clicked_calendar).length;
    const booked = rows.filter(r => r.booked_at).length;
    const pct = (v) => (n ? `${Math.round((v / n) * 1000) / 10}%` : '—');
    return { n, delivered, scanned, clicked, calendar, booked, pct };
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

  if (loading) {
    return (
      <div style={{ padding: space[6], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
        読み込み中...
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: space[8], textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
        ギフト同梱DMの送付先がまだありません。
      </div>
    );
  }

  const shippedOn = rows.find(r => r.shipped_on)?.shipped_on;

  return (
    <div>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <Tile label="送付" value={stats.n} sub={shippedOn ? `${fmtDate(shippedOn)} 発送` : null} />
        <Tile label="到着" value={stats.delivered} sub={stats.delivered ? stats.pct(stats.delivered) : '配送データ待ち'} />
        <Tile label="二次元コードの読み取り" value={stats.scanned} sub={stats.pct(stats.scanned)} />
        <Tile label="導線のクリック" value={stats.clicked} sub={`うち日程調整 ${stats.calendar}`} />
        <Tile label="日程調整の予約" value={stats.booked} sub={stats.pct(stats.booked)} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: space[2], gap: space[3], flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          読み取りは機械による取得を除いた件数
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
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

      <div style={{
        border: `1px solid ${color.border}`, borderRadius: radius.md,
        background: color.white, overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>会社名</th>
              <th style={th}>ギフト</th>
              <th style={th}>発送</th>
              <th style={th}>到着</th>
              <th style={th}>読み取り</th>
              <th style={th}>押された導線</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const pressed = [
                r.clicked_calendar ? '日程調整' : null,
                r.clicked_deck ? '会社紹介資料' : null,
                r.clicked_website ? 'ホームページ' : null,
              ].filter(Boolean).join('・');
              return (
                <tr key={r.id} style={r.first_scan_at ? { background: color.goldGlow } : undefined}>
                  <td style={{ ...td, fontWeight: r.first_scan_at ? font.weight.semibold : font.weight.normal }}>
                    {r.company}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{GIFT_LABEL[r.gift_type] || r.gift_type}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.shipped_on)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: r.delivered_on ? color.textDark : color.textLight }}>
                    {r.delivered_on ? fmtDate(r.delivered_on) : '—'}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {r.first_scan_at ? (
                      <span>
                        {fmtDateTime(r.first_scan_at)}
                        {r.scan_count > 1 ? (
                          <span style={{ color: color.textLight }}>{`　計${r.scan_count}回`}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span style={{ color: color.textLight }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, color: pressed ? color.textDark : color.textLight }}>
                    {pressed || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
