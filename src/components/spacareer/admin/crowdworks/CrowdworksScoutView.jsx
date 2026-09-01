import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { color, space, radius, font, shadow } from '../../../../constants/design';
import { Badge, DataTable, Button } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import SubTabs from '../_shared/SubTabs';
import { supabase } from '../../../../lib/supabase';

// ============================================================
// スパキャリ 自動送信システム（CrowdWorks スカウトツール管理 / admin限定）
//
//   配布先のPCで動くボットが、15分ごとに稼働報告(heartbeat)を送ってくる。
//   その稼働状況・送信数・ライセンス設定をここから見る。
//
//   データ源は cw_* の5テーブル（すべて admin のみ参照可のRLS付き）。
//     cw_licenses            利用者1人につき1行
//     cw_heartbeats          15分ごとの稼働報告
//     cw_daily_stats         日次集計
//     cw_sent_workers_global 送信済みワーカー（全ライセンス横断の重複防止）
//     cw_bot_files           ボットへ配信するファイル
//
//   ボット本体は crowdworks-admin.vercel.app（Vercel）が受けており、
//   この画面は書き込みをせず参照に徹する。設定変更は移譲完了後に足す。
// ============================================================

// 2Captcha の単価。管理サーバー側(daily-report.ts)と同じ値を使う。
const CAPTCHA_UNIT_COST_USD = 2.99 / 1000;

// 最終ハートビートからこれを超えたら接続が切れたとみなす（管理サーバーと同じ30分）
const DISCONNECT_MINUTES = 30;

const TABS = [
  { key: 'licenses', label: 'ライセンス' },
  { key: 'workers', label: '送信済みワーカー' },
  { key: 'files', label: '配信ファイル' },
];

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

// Asia/Tokyo の YYYY-MM-DD。cw_daily_stats.date は管理サーバー側が
// en-CA 形式（＝YYYY-MM-DD）の日本時間で入れているので合わせる。
function todayJst() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function monthPrefixJst() {
  return todayJst().slice(0, 7);
}

/**
 * 稼働ステータスの判定。管理サーバー(daily-report.ts)と同じ規則。
 * 絵文字は使わず Badge の variant で表す。
 */
function deriveStatus(hb) {
  if (!hb) return { label: '未接続', variant: 'neutral' };

  const status = hb.status || '';
  const ageMin = (Date.now() - new Date(hb.created_at).getTime()) / 60000;

  if (status === 'error') return { label: 'エラー', variant: 'danger' };
  if (status === 'finished') return { label: '完了', variant: 'success' };
  if (ageMin > DISCONNECT_MINUTES) return { label: '接続切れ', variant: 'warn' };
  if (status === 'running') return { label: '稼働中', variant: 'primary' };
  if (status === 'idle') return { label: '待機中', variant: 'info' };
  return { label: status || '不明', variant: 'neutral' };
}

const LICENSE_STATUS = {
  active: { label: '有効', variant: 'success' },
  suspended: { label: '停止', variant: 'danger' },
  expired: { label: '期限切れ', variant: 'neutral' },
};

function StatCard({ label, value, sub, accent = color.navy }) {
  return (
    <div style={{
      background: color.white,
      border: `1px solid ${color.border}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      padding: space[4],
      minWidth: 0,
      flex: '1 1 160px',
    }}>
      <div style={{
        fontSize: font.size.xs,
        color: color.textMid,
        fontWeight: font.weight.semibold,
        letterSpacing: font.letterSpacing.wide,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: font.size.xl,
        fontWeight: font.weight.bold,
        color: color.textDark,
        fontFamily: font.family.display,
        marginTop: space[1],
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

export default function CrowdworksScoutView({ isAdmin }) {
  const [tab, setTab] = useState('licenses');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [licenses, setLicenses] = useState([]);
  const [heartbeats, setHeartbeats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [botFiles, setBotFiles] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 直近24時間のハートビートだけ引く。全件だと台数×96件/日で膨らむため。
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [lic, hb, ds, wk, bf] = await Promise.all([
      supabase.from('cw_licenses').select('*').order('created_at', { ascending: true }),
      supabase.from('cw_heartbeats').select('*').gte('created_at', since).order('created_at', { ascending: false }),
      supabase.from('cw_daily_stats').select('*').order('date', { ascending: false }).limit(500),
      supabase.from('cw_sent_workers_global').select('*').order('sent_at', { ascending: false }).limit(200),
      supabase.from('cw_bot_files').select('filename, updated_at').order('filename'),
    ]);

    const firstError = [lic, hb, ds, wk, bf].find((r) => r.error);
    if (firstError) {
      setError(firstError.error.message);
      setLoading(false);
      return;
    }

    setLicenses(lic.data || []);
    setHeartbeats(hb.data || []);
    setDailyStats(ds.data || []);
    setWorkers(wk.data || []);
    setBotFiles(bf.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ライセンスごとの最新ハートビート。heartbeats は created_at 降順なので最初に出たものが最新。
  const latestHbByKey = useMemo(() => {
    const m = new Map();
    for (const h of heartbeats) {
      if (!m.has(h.license_key)) m.set(h.license_key, h);
    }
    return m;
  }, [heartbeats]);

  const todayStatByKey = useMemo(() => {
    const t = todayJst();
    const m = new Map();
    for (const s of dailyStats) {
      if (s.date === t) m.set(s.license_key, s);
    }
    return m;
  }, [dailyStats]);

  const stats = useMemo(() => {
    const t = todayJst();
    const mp = monthPrefixJst();
    const activeCount = licenses.filter((l) => l.status === 'active').length;

    let sentToday = 0;
    let captchaToday = 0;
    let captchaMonth = 0;
    for (const s of dailyStats) {
      if (s.date === t) {
        sentToday += s.total_sent || 0;
        captchaToday += s.total_captcha || 0;
      }
      if (typeof s.date === 'string' && s.date.startsWith(mp)) {
        captchaMonth += s.total_captcha || 0;
      }
    }

    return {
      activeCount,
      total: licenses.length,
      sentToday,
      captchaToday,
      captchaMonth,
      costMonth: captchaMonth * CAPTCHA_UNIT_COST_USD,
    };
  }, [licenses, dailyStats]);

  const licenseRows = useMemo(() => licenses.map((l) => {
    const hb = latestHbByKey.get(l.license_key) || null;
    const ds = todayStatByKey.get(l.license_key) || null;
    return {
      ...l,
      _hb: hb,
      _status: deriveStatus(hb),
      _sentToday: ds?.total_sent ?? hb?.sent_today ?? 0,
      _lastSeen: hb?.created_at ?? null,
      _version: hb?.version ?? null,
      _errorMessage: hb?.status === 'error' ? hb?.error_message : null,
    };
  }), [licenses, latestHbByKey, todayStatByKey]);

  if (!isAdmin) {
    return (
      <div style={{ padding: space[6], color: color.textMid, fontSize: font.size.sm }}>
        このページは管理者のみ閲覧できます。
      </div>
    );
  }

  const licenseColumns = [
    {
      key: 'user_name', label: '利用者', width: 160, mobilePrimary: true,
      render: (r) => (
        <span style={{ fontWeight: font.weight.semibold, color: color.textDark }}>
          {r.user_name || '（名称未設定）'}
        </span>
      ),
    },
    {
      key: 'status', label: 'ライセンス', width: 96,
      render: (r) => {
        const m = LICENSE_STATUS[r.status] || { label: r.status || '—', variant: 'neutral' };
        return <Badge variant={m.variant} size="sm">{m.label}</Badge>;
      },
    },
    {
      key: '_status', label: '稼働', width: 110,
      render: (r) => <Badge variant={r._status.variant} size="sm" dot>{r._status.label}</Badge>,
    },
    {
      key: '_sentToday', label: '本日の送信', width: 110, align: 'right',
      sortable: true, sortValue: (r) => r._sentToday,
      render: (r) => (
        <span style={{ fontFamily: font.family.display }}>
          {r._sentToday} <span style={{ color: color.textLight }}>/ {r.daily_limit ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'filters', label: '抽出条件', width: 190,
      render: (r) => (
        <span style={{ color: color.textMid, fontSize: font.size.xs }}>
          受注実績 {r.min_completed_jobs ?? 0}〜{r.max_completed_jobs ?? '—'}件 ／ {r.age_range || '指定なし'} ／ {r.last_login_days ?? '—'}日以内
        </span>
      ),
    },
    {
      key: '_version', label: 'バージョン', width: 90,
      render: (r) => <span style={{ color: color.textMid }}>{r._version ? `v${r._version}` : '—'}</span>,
    },
    {
      key: '_lastSeen', label: '最終報告', width: 140,
      sortable: true, sortValue: (r) => (r._lastSeen ? new Date(r._lastSeen).getTime() : 0),
      render: (r) => <span style={{ color: color.textMid }}>{fmtDateTime(r._lastSeen)}</span>,
    },
    {
      key: 'expires_at', label: '有効期限', width: 110, mobileHidden: true,
      render: (r) => <span style={{ color: color.textMid }}>{fmtDate(r.expires_at)}</span>,
    },
  ];

  const workerColumns = [
    { key: 'worker_id', label: 'ワーカーID', width: 120, mobilePrimary: true },
    { key: 'worker_name', label: '氏名', width: 160, render: (r) => r.worker_name || '—' },
    {
      key: 'license_key', label: '送信した利用者', width: 180,
      render: (r) => {
        const l = licenses.find((x) => x.license_key === r.license_key);
        return <span style={{ color: color.textMid }}>{l?.user_name || r.license_key?.slice(0, 8) || '—'}</span>;
      },
    },
    {
      key: 'sent_at', label: '送信日時', width: 150,
      sortable: true, sortValue: (r) => new Date(r.sent_at).getTime(),
      render: (r) => <span style={{ color: color.textMid }}>{fmtDateTime(r.sent_at)}</span>,
    },
  ];

  const fileColumns = [
    { key: 'filename', label: 'ファイル名', width: 220, mobilePrimary: true },
    {
      key: 'updated_at', label: '最終更新', width: 160,
      sortable: true, sortValue: (r) => new Date(r.updated_at).getTime(),
      render: (r) => <span style={{ color: color.textMid }}>{fmtDateTime(r.updated_at)}</span>,
    },
  ];

  const errorRows = licenseRows.filter((r) => r._errorMessage);

  return (
    <div>
      <PageHeader
        title="自動送信システム"
        description="クラウドワークスのスカウト自動送信ツールの稼働状況。配布先のボットが15分ごとに報告します。"
        compact
        right={
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            {loading ? '読み込み中' : '再読み込み'}
          </Button>
        }
      />

      <div style={{ paddingTop: space[4] }}>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
          <StatCard label="稼働ライセンス" value={`${stats.activeCount}`} sub={`全 ${stats.total} 件`} />
          <StatCard label="本日の送信数" value={stats.sentToday.toLocaleString()} accent={color.navyLight} />
          <StatCard label="本日のCAPTCHA" value={stats.captchaToday.toLocaleString()} accent={color.navyLight} />
          <StatCard label="当月のCAPTCHA" value={stats.captchaMonth.toLocaleString()} accent={color.gold} />
          <StatCard
            label="当月のCAPTCHAコスト"
            value={`$${stats.costMonth.toFixed(2)}`}
            sub="1000件あたり $2.99"
            accent={color.gold}
          />
        </div>

        {errorRows.length > 0 && (
          <div style={{
            background: color.dangerSoft,
            border: `1px solid ${color.danger}`,
            borderRadius: radius.lg,
            padding: space[3],
            marginBottom: space[4],
            fontSize: font.size.sm,
            color: color.textDark,
          }}>
            <div style={{ fontWeight: font.weight.semibold, marginBottom: space[1] }}>
              エラー報告 {errorRows.length}件
            </div>
            {errorRows.map((r) => (
              <div key={r.id} style={{ color: color.textMid, fontSize: font.size.xs }}>
                {r.user_name}：{r._errorMessage}
              </div>
            ))}
            {errorRows.length === stats.activeCount && stats.activeCount > 0 && (
              <div style={{ marginTop: space[2], fontWeight: font.weight.semibold }}>
                稼働中の全ライセンスがエラーです。クラウドワークス側の画面変更を疑ってください。
              </div>
            )}
          </div>
        )}

        <SubTabs tabs={TABS} activeKey={tab} onChange={setTab} />

        {tab === 'licenses' && (
          <DataTable
            columns={licenseColumns}
            rows={licenseRows}
            rowKey="id"
            loading={loading}
            error={error}
            emptyMessage="ライセンスがまだありません。管理サーバーの移譲が済むとここに表示されます。"
            height="calc(100vh - 420px)"
          />
        )}

        {tab === 'workers' && (
          <DataTable
            columns={workerColumns}
            rows={workers}
            rowKey="id"
            loading={loading}
            error={error}
            emptyMessage="送信済みワーカーがまだありません。"
            height="calc(100vh - 420px)"
          />
        )}

        {tab === 'files' && (
          <DataTable
            columns={fileColumns}
            rows={botFiles}
            rowKey="filename"
            loading={loading}
            error={error}
            emptyMessage="配信ファイルがまだ登録されていません。"
            height="calc(100vh - 420px)"
          />
        )}
      </div>
    </div>
  );
}
