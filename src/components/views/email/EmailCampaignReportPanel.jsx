import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, shadow } from '../../../constants/design';
import { Button, Card, Badge, DataTable } from '../../ui';

const RECIPIENT_STATUS_LABEL = {
  queued:       { text: '待機',     variant: 'neutral' },
  sent:         { text: '送信済',   variant: 'info' },
  delivered:    { text: '到達',     variant: 'info' },
  opened:       { text: '開封',     variant: 'success' },
  clicked:      { text: 'クリック', variant: 'success' },
  bounced:      { text: 'バウンス', variant: 'danger' },
  complained:   { text: '苦情',     variant: 'danger' },
  unsubscribed: { text: '停止',     variant: 'warn' },
  failed:       { text: '失敗',     variant: 'danger' },
};

function KpiTile({ label, value, sub }) {
  return (
    <div style={{
      flex: 1, padding: space[2], background: color.snow,
      borderRadius: radius.md, border: `1px solid ${color.borderLight}`,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid }}>{label}</div>
      <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.navy, fontFamily: font.family.mono }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: color.textLight, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

export default function EmailCampaignReportPanel({ campaign, onClose, onDuplicate, onReload }) {
  const [recipients, setRecipients] = useState([]);
  const [clickStats, setClickStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaign?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: recData, error: recErr } = await supabase
        .from('email_campaign_recipients')
        .select('id,email,display_name,status,sent_at,first_opened_at,first_clicked_at,recipient_type,error_message')
        .eq('campaign_id', campaign.id)
        .order('first_opened_at', { ascending: false, nullsFirst: false })
        .limit(500);
      if (cancelled) return;
      if (recErr) console.error('recipients load failed:', recErr);
      const recipientList = recData || [];
      setRecipients(recipientList);

      if (recipientList.length > 0) {
        const recipientIds = recipientList.map(r => r.id);
        const { data: clickData, error: clickErr } = await supabase
          .from('email_events')
          .select('clicked_url')
          .eq('event_type', 'clicked')
          .not('clicked_url', 'is', null)
          .in('recipient_id', recipientIds);
        if (cancelled) return;
        if (clickErr) console.error('click stats load failed:', clickErr);
        const counts = {};
        for (const ev of clickData || []) {
          if (!ev.clicked_url) continue;
          counts[ev.clicked_url] = (counts[ev.clicked_url] || 0) + 1;
        }
        setClickStats(
          Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([url, count]) => ({ url, count }))
        );
      } else {
        setClickStats([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaign?.id, campaign?.org_id]);

  const openRate = campaign.sent_count
    ? `${Math.round((campaign.opened_count / campaign.sent_count) * 1000) / 10}%`
    : '-';
  const clickRate = campaign.sent_count
    ? `${Math.round((campaign.clicked_count / campaign.sent_count) * 1000) / 10}%`
    : '-';
  const bounceRate = campaign.sent_count
    ? `${Math.round((campaign.bounced_count / campaign.sent_count) * 1000) / 10}%`
    : '-';

  const recipientColumns = useMemo(() => [
    {
      key: 'display_name', label: '宛先', width: 180, align: 'left',
      render: (row) => (
        <div>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textDark }}>
            {row.display_name || '(名前なし)'}
          </div>
          <div style={{ fontSize: 10, color: color.textMid, fontFamily: font.family.mono }}>
            {row.email}
          </div>
        </div>
      ),
    },
    {
      key: 'status', label: '状態', width: 90, align: 'center',
      render: (row) => {
        const s = RECIPIENT_STATUS_LABEL[row.status] || { text: row.status, variant: 'neutral' };
        return <Badge variant={s.variant}>{s.text}</Badge>;
      },
    },
    {
      key: 'first_opened_at', label: '開封', width: 90, align: 'right',
      render: (row) => row.first_opened_at
        ? <span style={{ fontSize: 11, fontFamily: font.family.mono, color: color.success }}>
            {new Date(row.first_opened_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        : <span style={{ color: color.textLight, fontSize: 11 }}>-</span>,
    },
  ], []);

  return (
    <Card padding="md">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space[2] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.xs, color: color.textMid }}>キャンペーン</div>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>
            {campaign.subject}
          </div>
        </div>
        <button type="button" onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: color.textMid, fontSize: 18 }}>
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: space[1], marginBottom: space[3] }}>
        <KpiTile label="配信" value={campaign.sent_count || 0} sub={`/ ${campaign.total_recipients || 0}件`} />
        <KpiTile label="開封率" value={openRate} sub={`${campaign.opened_count || 0}件`} />
        <KpiTile label="クリック率" value={clickRate} sub={`${campaign.clicked_count || 0}件`} />
      </div>
      <div style={{ display: 'flex', gap: space[1], marginBottom: space[3] }}>
        <KpiTile label="バウンス" value={bounceRate} sub={`${campaign.bounced_count || 0}件`} />
        <KpiTile label="停止" value={campaign.unsubscribed_count || 0} sub="件" />
      </div>

      {clickStats.length > 0 && (
        <div style={{ marginBottom: space[3] }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textDark, marginBottom: space[1] }}>
            クリックされたURL
          </div>
          <ul style={{ margin: 0, paddingLeft: space[3], fontSize: font.size.xs, color: color.textMid }}>
            {clickStats.slice(0, 5).map((c, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                <code style={{ fontFamily: font.family.mono, fontSize: 10 }}>{c.url.slice(0, 50)}{c.url.length > 50 ? '...' : ''}</code>
                <span style={{ marginLeft: space[1], color: color.navy }}>{c.count}回</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: space[2] }}>
        <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textDark, marginBottom: space[1] }}>
          受信者 ({recipients.length}件)
        </div>
        <DataTable
          columns={recipientColumns}
          rows={recipients}
          rowKey="id"
          loading={loading}
          emptyMessage="受信者なし"
          height={300}
          fillWidth
        />
      </div>

      <div style={{ display: 'flex', gap: space[1], justifyContent: 'flex-end' }}>
        <Button variant="outline" size="sm" onClick={onDuplicate}>複製して新規作成</Button>
        <Button variant="ghost" size="sm" onClick={onReload}>再読込</Button>
      </div>
    </Card>
  );
}
