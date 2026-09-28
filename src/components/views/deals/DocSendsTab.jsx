import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { Card, Badge, Button, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';

// 「フォーム営業」タブ。問い合わせフォーム・メールで送った資料リンク（/d/:token）の閲覧を出す。
// 数えるのは doc_send_stats ビュー1本。画面側で数えない。閲覧は機械の取得を除いた件数。
// 設計: tasks/sekkei_form_eigyo_doc_tracking.md

const CHANNEL_LABEL = { form: 'フォーム', email: 'メール', sns: 'SNS' };

const CALL_BADGE = {
  'アポ獲得': 'success',
  'キーマン再コール': 'info',
  '受付再コール': 'info',
  '問い合わせフォーム': 'info',
  'キーマン断り': 'warn',
  '除外': 'danger',
};

const PUBLIC_BASE = 'https://spanavi.jp/d/';

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// 閲覧のあとにまだ電話していない（＝今すぐかける先）
const needsCall = (r) => r.first_view_at && (!r.call_called_at || r.call_called_at < r.first_view_at);

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

export default function DocSendsTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlyViewed, setOnlyViewed] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('doc_send_stats')
        .select('*')
        .eq('client_id', client.id)
        .order('company', { ascending: true });
      if (cancelled) return;
      if (err) console.error('[DocSendsTab] fetch error:', err);
      setError(err ? '読み込みに失敗しました' : null);
      setRows(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const stats = useMemo(() => {
    const sent = rows.filter(r => r.sent_at).length;
    const viewed = rows.filter(r => r.first_view_at).length;
    const waiting = rows.filter(needsCall).length;
    const appo = rows.filter(r => r.first_view_at && r.call_status === 'アポ獲得').length;
    const pct = (v, n) => (n ? `${Math.round((v / n) * 1000) / 10}%` : '—');
    return { n: rows.length, sent, viewed, waiting, appo, pct };
  }, [rows]);

  // 閲覧後に未架電の会社 → 閲覧のあった会社（新しい順）→ 残りは社名順
  const sorted = useMemo(() => {
    const list = onlyViewed ? rows.filter(r => r.first_view_at) : rows;
    const rank = (r) => (needsCall(r) ? 0 : r.first_view_at ? 1 : 2);
    return [...list].sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d) return d;
      if (a.first_view_at && b.first_view_at) return b.first_view_at.localeCompare(a.first_view_at);
      return (a.company || '').localeCompare(b.company || '', 'ja');
    });
  }, [rows, onlyViewed]);

  const copyUrl = async (r) => {
    try {
      await navigator.clipboard.writeText(PUBLIC_BASE + r.token);
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(c => (c === r.id ? null : c)), 1500);
    } catch (e) {
      console.error('[DocSendsTab] copy failed:', e);
    }
  };

  const toggleSent = async (r) => {
    const next = r.sent_at ? null : new Date().toISOString();
    setSavingId(r.id);
    const { data, error: err } = await supabase
      .from('doc_sends').update({ sent_at: next }).eq('id', r.id).select('id');
    setSavingId(null);
    // RLS で弾かれると 0 行のまま成功が返るので、行数で確かめる
    if (err || !data?.length) {
      console.error('[DocSendsTab] update failed:', err);
      setError('送付状態を保存できませんでした');
      return;
    }
    setRows(prev => prev.map(x => (x.id === r.id ? { ...x, sent_at: next } : x)));
  };

  const columns = useMemo(() => [
    {
      key: 'company', label: '会社名', width: 280, align: 'left', mobilePrimary: true,
      render: (r) => (
        <span style={{ fontWeight: r.first_view_at ? font.weight.semibold : font.weight.normal }}>
          {r.company}
        </span>
      ),
    },
    {
      key: 'channel', label: '経路', width: 84, align: 'center',
      render: (r) => <Badge variant="neutral">{CHANNEL_LABEL[r.channel] || r.channel}</Badge>,
    },
    {
      key: 'sent_to', label: '送付先', width: 90, align: 'center',
      render: (r) => (r.sent_to ? (
        r.channel !== 'email'
          ? <a href={r.sent_to} target="_blank" rel="noopener noreferrer" style={{ color: color.navy, fontSize: font.size.xs }}>{r.channel === 'sns' ? 'SNS' : 'フォーム'}</a>
          : <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.sent_to.split('\n')[0]}</span>
      ) : '—'),
    },
    {
      key: 'token', label: 'リンク', width: 96, align: 'center',
      render: (r) => (
        <Button variant="outline" size="sm" onClick={() => copyUrl(r)}>
          {copiedId === r.id ? 'コピー済み' : 'コピー'}
        </Button>
      ),
    },
    {
      key: 'sent_at', label: '送付', width: 130, align: 'center',
      render: (r) => (
        <Button
          variant={r.sent_at ? 'ghost' : 'outline'}
          size="sm"
          loading={savingId === r.id}
          onClick={() => toggleSent(r)}
          title={r.sent_at ? '押すと未送付に戻す' : '送ったら押す'}
        >
          {r.sent_at ? fmtDateTime(r.sent_at) : '送付済みにする'}
        </Button>
      ),
    },
    {
      key: 'first_view_at', label: '閲覧', width: 170, align: 'right',
      render: (r) => (r.first_view_at ? (
        <span>
          {fmtDateTime(r.first_view_at)}
          {r.view_count > 1 ? (
            <span style={{ color: color.textLight }}>{`　計${r.view_count}回`}</span>
          ) : null}
        </span>
      ) : '—'),
    },
    {
      key: 'call_status', label: '最新の架電結果', width: 150, align: 'left',
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
  ], [copiedId, savingId]);

  return (
    <div>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <Tile label="リンク発行" value={stats.n} />
        <Tile label="送付済み" value={stats.sent} sub={stats.pct(stats.sent, stats.n)} />
        <Tile label="資料の閲覧" value={stats.viewed} sub={stats.sent ? `送付の ${stats.pct(stats.viewed, stats.sent)}` : null} />
        <Tile label="閲覧後に未架電" value={stats.waiting} sub={stats.waiting ? '上から順に架電' : null} />
        <Tile label="閲覧からのアポ" value={stats.appo} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: space[2], gap: space[3], flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          閲覧は機械による取得を除いた件数
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: space[1],
          fontSize: font.size.xs, color: color.textMid, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={onlyViewed}
            onChange={(e) => setOnlyViewed(e.target.checked)}
          />
          閲覧のあった会社のみ
        </label>
      </div>

      <DataTable
        fillWidth
        columns={columns}
        rows={sorted}
        rowKey="id"
        loading={loading}
        error={error}
        emptyMessage="フォーム営業の送付先がまだありません"
        rowAccent={(r) => (needsCall(r) ? 'primary' : null)}
        height="calc(100vh - 340px)"
        ariaLabel="フォーム営業の送付先"
      />
    </div>
  );
}
