import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { color, space, font } from '../../constants/design';
import { Card, Badge, DataTable } from '../ui';
import PageHeader from '../common/PageHeader';
import EmailCampaignConsole from './email/EmailCampaignConsole';

const STATUS_LABEL = {
  draft:     { text: '下書き',     variant: 'neutral' },
  scheduled: { text: '予約済',     variant: 'info' },
  sending:   { text: '配信中',     variant: 'warn' },
  sent:      { text: '配信完了',   variant: 'success' },
  canceled:  { text: 'キャンセル', variant: 'neutral' },
  failed:    { text: '失敗',       variant: 'danger' },
};

function formatJpDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function pct(num, denom) {
  if (!denom) return '-';
  return `${Math.round((num / denom) * 1000) / 10}%`;
}

export default function EmailMarketingView({ orgId }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const loadCampaigns = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) console.error('load campaigns failed:', error);
    else setCampaigns(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const selected = useMemo(
    () => campaigns.find(c => c.id === selectedId) || null,
    [campaigns, selectedId]
  );

  const columns = useMemo(() => [
    {
      key: 'subject', label: '件名', width: 320, align: 'left',
      render: (row) => (
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: font.weight.semibold, color: color.textDark, fontSize: font.size.sm }}>
            {row.subject || '(件名なし)'}
          </div>
          {row.name && (
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>{row.name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status', label: 'ステータス', width: 110, align: 'center',
      render: (row) => {
        const s = STATUS_LABEL[row.status] || { text: row.status, variant: 'neutral' };
        return <Badge variant={s.variant} dot>{s.text}</Badge>;
      },
    },
    {
      key: 'scheduled_at', label: '配信日時', width: 110, align: 'right',
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid }}>
          {formatJpDate(row.sent_at || row.scheduled_at)}
        </span>
      ),
    },
    {
      key: 'total_recipients', label: '対象', width: 70, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm }}>{row.total_recipients || 0}</span>,
    },
    {
      key: 'open_rate', label: '開封率', width: 80, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm, color: color.textDark }}>{pct(row.opened_count, row.sent_count)}</span>,
    },
    {
      key: 'click_rate', label: 'クリック率', width: 90, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm, color: color.textDark }}>{pct(row.clicked_count, row.sent_count)}</span>,
    },
    {
      key: 'bounced', label: 'バウンス', width: 80, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: row.bounced_count ? color.danger : color.textMid }}>{row.bounced_count || 0}</span>,
    },
    {
      key: 'unsubscribed', label: '停止', width: 70, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid }}>{row.unsubscribed_count || 0}</span>,
    },
  ], []);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="メルマガ"
        description="件名をタップすると、プレビュー・送付先の選択・送信ができます"
        style={{ marginBottom: 16 }}
      />

      <div>
        <Card padding="none">
          <DataTable
            columns={columns}
            rows={campaigns}
            rowKey="id"
            loading={loading}
            emptyMessage="配信するメルマガがありません。"
            onRowClick={(row) => setSelectedId(row.id)}
            height="calc(100vh - 220px)"
            fillWidth
          />
        </Card>
      </div>

      {selected && (
        <EmailCampaignConsole
          campaign={selected}
          orgId={orgId}
          onClose={(changed) => { setSelectedId(null); if (changed) loadCampaigns(); }}
        />
      )}
    </div>
  );
}
