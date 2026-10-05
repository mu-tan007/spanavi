import { useEffect, useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { Card, Badge, DataTable } from '../../ui';
import { fetchRoundReportHistory } from '../../../lib/supabaseWrite';
import RoundReportsCard from '../RoundReportsCard';
import PrecheckDraftsCard from '../PrecheckDraftsCard';

/**
 * 案件 > 報告（社内だけ・クライアントポータルには出さない）
 * 選んでいるクライアント様へ送る報告をここにまとめる（2026-10-05 篠宮）
 *   上：送信待ち（周回報告・事前確認の報告）
 *   下：送った・片付けた周回報告の履歴
 * クライアント様を選んでいないときは、全クライアント様の送信待ちを並べる。
 * 旧「事前確認」画面（サイドバーから外れていた）の送信待ちの欄はここへ移した。
 */
const STATUS = {
  sent: { label: '送信済み', variant: 'success' },
  gmail_draft: { label: 'Gmailに下書き', variant: 'info' },
  dismissed: { label: '片付けた', variant: 'neutral' },
};
const DELIVERY = { slack: 'Slack', chatwork: 'Chatwork', email: 'メール' };
const listLabel = (name = '') => { const i = name.indexOf(' - '); return i >= 0 ? name.slice(i + 3) : name; };
const ymd = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function ReportsTab({ client, clientData = [], callListData = [], onCountsChanged = null }) {
  const clientId = client?.id || null;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const loadHistory = async () => {
    setLoading(true);
    setHistory(await fetchRoundReportHistory(clientId));
    setLoading(false);
  };
  useEffect(() => { loadHistory(); }, [clientId]);

  // 送信待ちが動いたら、件数と履歴を読み直す
  const onChanged = () => { onCountsChanged?.(); loadHistory(); };
  const opened = history.find(h => h.id === openId);

  return (
    <div>
      <RoundReportsCard clientData={clientData} callListData={callListData} isAdmin clientId={clientId} onChanged={onChanged} />
      <PrecheckDraftsCard clientData={clientData} isAdmin clientId={clientId} onChanged={onChanged} />

      <Card padding="md" title="これまでの周回報告" description="行を押すと送った文面が出ます">
        <DataTable
          columns={[
            { key: 'when', label: '日時', width: 110, align: 'right', render: r => ymd(r.sent_at || r.updated_at) },
            ...(clientId ? [] : [{ key: 'client', label: 'クライアント', width: 220, align: 'left', render: r => (r.list?.name || '').split(' - ')[0] }]),
            { key: 'list', label: 'リスト', width: 200, align: 'left', render: r => listLabel(r.list?.name) },
            { key: 'round', label: '周回', width: 90, align: 'center', render: r => (r.kind === 'manual' ? '途中報告' : `${r.round}周目`) },
            { key: 'delivery', label: '送り方', width: 90, align: 'center', render: r => DELIVERY[r.delivery] || '' },
            { key: 'status', label: '状態', width: 120, align: 'center',
              render: r => <Badge size="sm" variant={STATUS[r.status]?.variant || 'neutral'} dot>{STATUS[r.status]?.label || r.status}</Badge> },
          ]}
          rows={history}
          rowKey="id"
          loading={loading}
          emptyMessage="まだ周回報告はありません"
          onRowClick={r => setOpenId(id => (id === r.id ? null : r.id))}
          height={Math.min(420, 56 + history.length * 40)}
        />
        {opened && (
          <div style={{
            whiteSpace: 'pre-wrap', fontSize: font.size.sm, color: color.textDark,
            background: color.cream, border: `1px solid ${color.borderLight}`,
            padding: space[3], marginTop: space[2],
          }}>
            {opened.mail_to && <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>宛先：{opened.mail_to}</div>}
            {opened.sent_text || opened.draft_text}
          </div>
        )}
      </Card>
    </div>
  );
}
