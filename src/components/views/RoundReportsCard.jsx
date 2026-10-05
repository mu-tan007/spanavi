import { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font } from '../../constants/design';
import { Button, Card, Badge, Select, Input } from '../ui';
import { fetchPendingRoundReports, updateRoundReport, invokeRoundReports, invokeSendAppoReport } from '../../lib/supabaseWrite';

const SCRIPT_PLACEHOLDER = '（篠宮と相談のうえ記入）';

const textareaStyle = {
  width: '100%', boxSizing: 'border-box', padding: space[2], resize: 'vertical',
  fontSize: font.size.sm, fontFamily: font.family.sans, color: color.textDark,
  border: `1px solid ${color.border}`, borderRadius: radius.md, outline: 'none',
};

const listLabel = (name = '') => { const i = name.indexOf(' - '); return i >= 0 ? name.slice(i + 3) : name; };
const pct = (n, d) => (d ? `${(Math.round((n / d) * 1000) / 10).toFixed(1)}%` : '—');

/**
 * 架電の周回報告（送信待ち）。リストを1周かけ終えるたびに round-reports が毎朝下書きを作る。
 * スクリプトの改善案の欄は空けてあり、篠宮と相談して書き込むまで送れない。
 * 「相談用の材料」は断られ方のまとめで、先方には出さない。
 */
export default function RoundReportsCard({ clientData = [], callListData = [], isAdmin = false }) {
  const [reports, setReports] = useState([]);
  const [texts, setTexts] = useState({});
  const [channels, setChannels] = useState({});
  const [openMaterials, setOpenMaterials] = useState({});
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});
  const [manualListId, setManualListId] = useState('');
  const [manualMsg, setManualMsg] = useState('');
  const [mails, setMails] = useState({});
  const [done, setDone] = useState('');

  const load = async () => {
    const rows = await fetchPendingRoundReports();
    setReports(rows);
    setTexts(prev => Object.fromEntries(rows.map(r => [r.id, prev[r.id] ?? r.draft_text ?? ''])));
    setChannels(prev => Object.fromEntries(rows.map(r => [r.id, prev[r.id] ?? r.slack_channel_id ?? ''])));
    setMails(prev => Object.fromEntries(rows.map(r => [r.id, prev[r.id] ?? { to: r.mail_to || '', cc: r.mail_cc || '' }])));
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const listOptions = useMemo(() => (callListData || [])
    .filter(l => !l.is_archived && l._supaId)
    .map(l => ({ value: l._supaId, label: `${l.company}${l.industry ? `｜${l.industry}` : ''}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja')), [callListData]);

  if (!isAdmin) return null;

  const setError = (id, msg) => setErrors(e => ({ ...e, [id]: msg }));

  const save = async (row) => {
    setBusy(row.id);
    const err = await updateRoundReport(row.id, { draft_text: texts[row.id], slack_channel_id: channels[row.id] || null });
    setError(row.id, err ? '保存に失敗しました' : '');
    setBusy(null);
  };

  const send = async (row, method) => {
    const text = (texts[row.id] || '').trim();
    if (text.includes(SCRIPT_PLACEHOLDER)) { setError(row.id, 'トークスクリプトの改善案がまだ空です。篠宮と相談のうえ書き込んでください'); return; }
    const cl = clientData.find(c => c._supaId === row.client_id);
    setBusy(row.id); setError(row.id, '');
    try {
      if (method === 'slack') {
        const { error } = await invokeRoundReports({ action: 'send_slack', report_id: row.id, text, channel_id: channels[row.id] });
        if (error) throw new Error(error);
      } else if (method === 'chatwork') {
        if (!cl?.chatworkRoomId) throw new Error('Chatwork ルームIDが未設定です');
        const { error } = await invokeSendAppoReport({ channel: 'chatwork', text, room_id: cl.chatworkRoomId });
        if (error) throw new Error(typeof error === 'string' ? error : error.message);
        await updateRoundReport(row.id, { status: 'sent', sent_at: new Date().toISOString(), sent_text: text });
      } else {
        // メール：Gmail に新しいメールの下書きを作る（宛先は直近のアポ取得報告メールと同じ）。送るのは Gmail で
        const { error } = await invokeRoundReports({ action: 'gmail_draft', report_id: row.id, text, to: mails[row.id]?.to, cc: mails[row.id]?.cc });
        if (error) throw new Error(error);
        setDone(`${cl?.company || ''}の報告をGmailの下書きに入れました。Gmailで確かめて送ってください`);
      }
      await load();
    } catch (e) {
      setError(row.id, e.message || '送信に失敗しました');
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (row) => {
    setBusy(row.id);
    await updateRoundReport(row.id, { status: 'dismissed' });
    await load();
    setBusy(null);
  };

  const createManual = async () => {
    if (!manualListId) return;
    setBusy('manual'); setManualMsg('');
    const { error } = await invokeRoundReports({ action: 'create_manual', list_id: manualListId });
    setManualMsg(error || '下書きを作りました');
    if (!error) { setManualListId(''); await load(); }
    setBusy(null);
  };

  return (
    <Card padding="md" title="周回報告（送信待ち）"
      description="リストを1周かけ終えると毎朝下書きができます。スクリプトの改善案を篠宮と相談して書き込んでから送ってください"
      style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[3] }}>
        <Select size="sm" value={manualListId} onChange={e => setManualListId(e.target.value)}
          options={[{ value: '', label: '周回の途中で報告を作るリストを選ぶ' }, ...listOptions]}
          containerStyle={{ flex: 1, maxWidth: 520 }} />
        <Button size="sm" variant="outline" disabled={!manualListId} loading={busy === 'manual'} onClick={createManual}>今の時点で報告を作る</Button>
        {manualMsg && <span style={{ fontSize: font.size.xs, color: color.textMid }}>{manualMsg}</span>}
      </div>

      {done && <div style={{ fontSize: font.size.sm, color: color.success, marginBottom: space[2] }}>{done}</div>}

      {reports.length === 0 && (
        <div style={{ fontSize: font.size.sm, color: color.textMid, padding: `${space[2]}px 0` }}>送信待ちの周回報告はありません</div>
      )}

      {reports.map(row => {
        const cl = clientData.find(c => c._supaId === row.client_id);
        const s = row.stats || {};
        const t = (row.kind === 'manual' ? s.total : s.this) || {};
        // 送り方は下書きを作ったときに決めたもの（Slack・Chatwork・メール）
        const method = row.delivery || 'slack';
        const chOptions = (row.slack_channel_options || []).map(o => ({ value: o.id, label: `#${o.name}` }));
        return (
          <div key={row.id} style={{ padding: `${space[3]}px 0`, borderTop: `1px solid ${color.borderLight}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1.5], fontSize: font.size.sm }}>
              <span style={{ fontWeight: font.weight.bold, color: color.navy }}>{cl?.company || ''}</span>
              <span style={{ color: color.textMid }}>{listLabel(row.list?.name)}</span>
              <Badge size="sm" variant={row.kind === 'manual' ? 'warn' : 'primary'}>
                {row.kind === 'manual' ? '途中報告' : `${row.round}周目`}
              </Badge>
              <span style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textMid }}>
                接続率 {pct(t.talks, t.calls)}・アポ {t.appo ?? 0}件（{(t.calls ?? 0).toLocaleString()}コール）
              </span>
            </div>

            {row.materials && (
              <div style={{ marginBottom: space[2] }}>
                <Button size="sm" variant="ghost" onClick={() => setOpenMaterials(o => ({ ...o, [row.id]: !o[row.id] }))}>
                  {openMaterials[row.id] ? '相談用の材料を閉じる' : '相談用の材料（断られ方のまとめ・先方には出さない）'}
                </Button>
                {openMaterials[row.id] && (
                  <div style={{
                    whiteSpace: 'pre-wrap', fontSize: font.size.xs, color: color.textDark, lineHeight: font.lineHeight.relaxed,
                    background: color.cream, border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
                    padding: space[2], marginTop: space[1],
                  }}>{row.materials}</div>
                )}
              </div>
            )}

            {method === 'email' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2], marginBottom: space[2] }}>
                <Input size="sm" label="宛先（To）" value={mails[row.id]?.to ?? ''}
                  onChange={e => setMails(m => ({ ...m, [row.id]: { ...m[row.id], to: e.target.value } }))} />
                <Input size="sm" label="Cc" value={mails[row.id]?.cc ?? ''}
                  onChange={e => setMails(m => ({ ...m, [row.id]: { ...m[row.id], cc: e.target.value } }))} />
                <div style={{ gridColumn: '1 / -1', fontSize: font.size.xs, color: color.textMid }}>件名：{row.mail_subject}</div>
              </div>
            )}
            {row.draft_error && <div style={{ fontSize: font.size.xs, color: color.warn, marginBottom: space[1] }}>{row.draft_error}</div>}

            <textarea value={texts[row.id] ?? ''} onChange={e => setTexts(x => ({ ...x, [row.id]: e.target.value }))} rows={16} style={textareaStyle} />
            {errors[row.id] && <div style={{ fontSize: font.size.xs, color: color.danger, marginTop: space[1] }}>{errors[row.id]}</div>}

            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', justifyContent: 'flex-end', marginTop: space[2] }}>
              {method === 'slack' && (
                <Select size="sm" value={channels[row.id] || ''} onChange={e => setChannels(c => ({ ...c, [row.id]: e.target.value }))}
                  options={[{ value: '', label: '送り先のチャンネルを選ぶ' }, ...chOptions]}
                  fullWidth={false} containerStyle={{ minWidth: 260 }} />
              )}
              <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => dismiss(row)}>送らずに片付ける</Button>
              <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => save(row)}>保存</Button>
              <Button size="sm" variant="primary" loading={busy === row.id}
                disabled={(method === 'slack' && !channels[row.id]) || (method === 'email' && !mails[row.id]?.to)}
                onClick={() => send(row, method)}>
                {method === 'slack' ? 'Slackで送信' : method === 'chatwork' ? 'Chatworkで送信' : 'Gmailに下書きを作る'}
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
