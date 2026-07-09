import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Card, Badge, DataTable } from '../ui';
import PageHeader from '../common/PageHeader';
import EmailCampaignFormModal from './email/EmailCampaignFormModal';
import EmailCampaignReportPanel from './email/EmailCampaignReportPanel';

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

export default function EmailMarketingView({ orgId, currentUser, isAdmin }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
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
    if (error) {
      console.error('load campaigns failed:', error);
    } else {
      setCampaigns(data || []);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

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
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
              {row.name}
            </div>
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
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm }}>
          {row.total_recipients || 0}
        </span>
      ),
    },
    {
      key: 'open_rate', label: '開封率', width: 80, align: 'right',
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm, color: color.textDark }}>
          {pct(row.opened_count, row.sent_count)}
        </span>
      ),
    },
    {
      key: 'click_rate', label: 'クリック率', width: 90, align: 'right',
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.sm, color: color.textDark }}>
          {pct(row.clicked_count, row.sent_count)}
        </span>
      ),
    },
    {
      key: 'bounced', label: 'バウンス', width: 80, align: 'right',
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: row.bounced_count ? color.danger : color.textMid }}>
          {row.bounced_count || 0}
        </span>
      ),
    },
    {
      key: 'unsubscribed', label: '停止', width: 70, align: 'right',
      render: (row) => (
        <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid }}>
          {row.unsubscribed_count || 0}
        </span>
      ),
    },
  ], []);

  const handleNewCampaign = () => {
    setEditCampaign(null);
    setShowForm(true);
  };

  const handleDuplicate = (campaign) => {
    setEditCampaign({
      ...campaign,
      id: null,
      status: 'draft',
      name: campaign.name + ' (複製)',
      sent_at: null,
      scheduled_at: null,
      total_recipients: 0,
      sent_count: 0,
      bounced_count: 0,
      opened_count: 0,
      clicked_count: 0,
      unsubscribed_count: 0,
    });
    setShowForm(true);
  };

  // 下書きは編集フォームを直接開く。配信済み等はレポート(実績)を開く。
  const handleRowClick = (row) => {
    if (row.status === 'draft') {
      setEditCampaign(row);
      setShowForm(true);
    } else {
      setSelectedId(row.id === selectedId ? null : row.id);
    }
  };

  const handleFormClose = (didChange) => {
    setShowForm(false);
    setEditCampaign(null);
    if (didChange) loadCampaigns();
  };

  return (
    <div style={{ padding: space[4], background: color.snow, minHeight: '100vh' }}>
      <PageHeader
        title="メルマガ"
        description="クライアント・見込み客へのHTML一斉配信、開封率/クリック率トラッキング"
        right={
          <Button variant="primary" size="md" onClick={handleNewCampaign}>
            新規キャンペーン
          </Button>
        }
      />

      <div style={{ marginTop: space[4] }}>
        <Card padding="none">
          <DataTable
            columns={columns}
            rows={campaigns}
            rowKey="id"
            loading={loading}
            emptyMessage="まだキャンペーンがありません。「新規キャンペーン」から作成してください。"
            onRowClick={handleRowClick}
            rowAccent={(row) => row.id === selectedId ? 'primary' : null}
            height="calc(100vh - 220px)"
            fillWidth
          />
        </Card>
      </div>

      {selected && (
        <div
          onClick={() => setSelectedId(null)}
          style={{
            position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5),
            zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: space[4],
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 880, maxHeight: '90vh',
              background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
              overflow: 'auto',
            }}
          >
            <EmailCampaignReportPanel
              campaign={selected}
              onClose={() => setSelectedId(null)}
              onDuplicate={() => handleDuplicate(selected)}
              onReload={loadCampaigns}
            />
          </div>
        </div>
      )}

      {showForm && (
        <EmailCampaignFormModal
          orgId={orgId}
          currentUser={currentUser}
          initial={editCampaign}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
