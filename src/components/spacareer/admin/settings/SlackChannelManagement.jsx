import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Button, Input, Select, Card, Badge, DataTable } from '../../../ui';
import { supabase } from '../../../../lib/supabase';

// Slack連携 / 顧客チャンネル作成UI
// - API認証情報（Bot token等）はエンジニア管理の環境変数。本UIでは触らない
// - 顧客ごとに1チャンネル作成（フルネーム漢字命名）
// - チャンネル作成は Edge Function 経由（slack.web.api）。未実装なら一覧表示のみ
export default function SlackChannelManagement() {
  const [customers, setCustomers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [channelNameDraft, setChannelNameDraft] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: c }, { data: ch }] = await Promise.all([
          supabase
            .from('spacareer_customers')
            .select('id, full_name, status')
            .order('full_name', { ascending: true }),
          supabase
            .from('spacareer_slack_channels')
            .select('id, customer_id, channel_id, channel_name, created_at'),
        ]);
        if (cancelled) return;
        setCustomers(c || []);
        setChannels(ch || []);
      } catch (e) {
        console.warn('[SlackChannelManagement] load:', e?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const channelByCustomer = useMemo(() => {
    const m = new Map();
    channels.forEach(c => m.set(c.customer_id, c));
    return m;
  }, [channels]);

  const customerOptions = useMemo(() => {
    return customers
      .filter(c => !channelByCustomer.has(c.id))
      .map(c => ({ value: c.id, label: c.full_name || '（氏名未設定）' }));
  }, [customers, channelByCustomer]);

  // 顧客選択時、デフォルトのチャンネル名を生成
  useEffect(() => {
    if (!selectedCustomerId) {
      setChannelNameDraft('');
      return;
    }
    const c = customers.find(x => x.id === selectedCustomerId);
    if (c) setChannelNameDraft(c.full_name || '');
  }, [selectedCustomerId, customers]);

  const handleCreate = async () => {
    if (!selectedCustomerId || !channelNameDraft.trim()) {
      setError('顧客とチャンネル名を入力してください');
      return;
    }
    setError('');
    setInfo('');
    setCreating(true);
    try {
      // Edge Function 'spacareer-create-slack-channel' を呼ぶ想定
      // 未実装の場合はサーバー側で 404/Not Found → UI でエラー表示
      const { data, error: err } = await supabase.functions.invoke('spacareer-create-slack-channel', {
        body: { customer_id: selectedCustomerId, channel_name: channelNameDraft.trim() },
      });
      if (err) throw err;
      // Edge Function 側で spacareer_slack_channels への insert を行う想定
      setInfo(`チャンネル「${channelNameDraft}」を作成しました${data?.channel_id ? `（ID: ${data.channel_id}）` : ''}`);
      // リストを再取得
      const { data: ch } = await supabase
        .from('spacareer_slack_channels')
        .select('id, customer_id, channel_id, channel_name, created_at');
      setChannels(ch || []);
      setSelectedCustomerId('');
      setChannelNameDraft('');
    } catch (e) {
      setError('チャンネル作成に失敗しました: ' + (e?.message || 'Edge Function 未実装の可能性があります'));
    } finally {
      setCreating(false);
    }
  };

  const rows = useMemo(() => {
    return customers
      .map(c => {
        const ch = channelByCustomer.get(c.id);
        return {
          id: c.id,
          customer: c.full_name || '（氏名未設定）',
          status: c.status,
          channelName: ch?.channel_name || '',
          channelId: ch?.channel_id || '',
          createdAt: ch?.created_at || '',
        };
      });
  }, [customers, channelByCustomer]);

  const columns = [
    { key: 'customer', label: '顧客',          width: 180, align: 'left' },
    { key: 'status',   label: 'ステータス',    width: 100, align: 'center',
      render: (r) => r.status ? <Badge variant="default">{r.status}</Badge> : '—',
    },
    { key: 'channelName', label: 'チャンネル名', width: 200, align: 'left',
      render: (r) => r.channelName ? (
        <span style={{ fontFamily: font.family.mono, color: color.navy }}>#{r.channelName}</span>
      ) : <Badge variant="neutral">未作成</Badge>,
    },
    { key: 'channelId', label: 'チャンネルID',  width: 160, align: 'left',
      cellStyle: { fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid },
    },
    { key: 'createdAt', label: '作成日', width: 120, align: 'right',
      render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString('ja-JP') : '—',
      cellStyle: { fontFamily: font.family.mono, fontSize: font.size.xs },
    },
  ];

  return (
    <Card padding="md" title="Slack連携 / 顧客チャンネル作成"
          description="API認証情報はエンジニアが環境変数で管理。本画面では顧客ごとのSlackゲストチャンネル作成のみ実施。">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        <div style={{
          display: 'flex',
          gap: space[3],
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          padding: space[3],
          background: color.cream,
          borderRadius: radius.md,
          border: `1px solid ${color.borderLight}`,
        }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Select
              label="顧客を選択"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              options={[{ value: '', label: '— 選択してください —' }, ...customerOptions]}
              disabled={loading || creating}
            />
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input
              label="チャンネル名（フルネーム漢字）"
              placeholder="例: 山田太郎"
              value={channelNameDraft}
              onChange={(e) => setChannelNameDraft(e.target.value)}
              disabled={!selectedCustomerId || creating}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleCreate}
            disabled={!selectedCustomerId || !channelNameDraft.trim() || creating}
            loading={creating}
          >
            チャンネル作成
          </Button>
        </div>

        {error && (
          <div style={{
            padding: space[3],
            background: color.dangerSoft,
            border: `1px solid ${color.danger}`,
            borderRadius: radius.md,
            fontSize: font.size.sm,
            color: color.danger,
          }}>{error}</div>
        )}
        {info && (
          <div style={{
            padding: space[3],
            background: color.successSoft,
            border: `1px solid ${color.success}`,
            borderRadius: radius.md,
            fontSize: font.size.sm,
            color: color.success,
          }}>{info}</div>
        )}

        <div>
          <div style={{
            fontSize: font.size.xs,
            color: color.textLight,
            fontWeight: font.weight.bold,
            letterSpacing: font.letterSpacing.wide,
            textTransform: 'uppercase',
            marginBottom: space[2],
          }}>
            既存チャンネル一覧
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey="id"
            loading={loading}
            emptyMessage="顧客がまだ登録されていません"
            height={320}
            fillWidth
          />
        </div>

        <div style={{
          padding: space[3],
          background: color.cream,
          border: `1px dashed ${color.border}`,
          borderRadius: radius.md,
          fontSize: font.size.xs,
          color: color.textMid,
        }}>
          ※ チャンネル作成は Edge Function 経由で Slack API を呼び出します
          （顧客本人／担当トレーナー／運営の3者を自動招待）。Bot token・Webhook URLは <code style={{ fontFamily: font.family.mono, color: color.navy }}>SPACAREER_SLACK_BOT_TOKEN</code> 等の環境変数で管理します。
        </div>
      </div>
    </Card>
  );
}
