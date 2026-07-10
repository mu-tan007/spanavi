import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Input, Badge, DataTable } from '../../ui';

// メルマガ「送信コンソール」: 件名タップで全画面表示。
// 本文はClaude側で作成する前提のため HTML 編集機能は持たない。
// - 全画面プレビュー
// - 設定(キャンペーン名/件名/差出人表示名/返信先) は編集可
// - 送付先を個別チェック/一括で選択 → 送信
// - 配信済みは実績(開封/クリック/受信者)を表示

const CLIENT_STATUSES = ['支援中', '準備中', '面談予定', '中期フォロー', '保留', '停止中'];

const STATUS_LABEL = {
  draft:     { text: '下書き',     variant: 'neutral' },
  scheduled: { text: '予約済',     variant: 'info' },
  sending:   { text: '配信中',     variant: 'warn' },
  sent:      { text: '配信完了',   variant: 'success' },
  failed:    { text: '失敗',       variant: 'danger' },
};

const RECIPIENT_STATUS_LABEL = {
  queued: { text: '待機', variant: 'neutral' }, sent: { text: '送信済', variant: 'info' },
  delivered: { text: '到達', variant: 'info' }, opened: { text: '開封', variant: 'success' },
  clicked: { text: 'クリック', variant: 'success' }, bounced: { text: 'バウンス', variant: 'danger' },
  complained: { text: '苦情', variant: 'danger' }, unsubscribed: { text: '停止', variant: 'warn' },
  failed: { text: '失敗', variant: 'danger' },
};

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: `3px ${space[2]}px`, fontSize: font.size.xs, cursor: 'pointer',
        border: `1px solid ${active ? color.navy : color.border}`, borderRadius: radius.pill,
        background: active ? color.navy : color.white, color: active ? color.white : color.textMid,
      }}>{children}</button>
  );
}

const SECTION_TITLE = {
  fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy,
  margin: `0 0 ${space[2]}px 0`, paddingBottom: space[1], borderBottom: `1px solid ${color.borderLight}`,
};

export default function EmailCampaignConsole({ campaign, orgId, onClose }) {
  const editable = ['draft', 'scheduled', 'failed'].includes(campaign.status);
  const showStats = ['sent', 'sending', 'failed'].includes(campaign.status);
  const isSent = campaign.status === 'sent';   // 配信済みからの追加送信を許可

  // ----- 設定 -----
  const [name, setName] = useState(campaign.name || '');
  const [subject, setSubject] = useState(campaign.subject || '');
  const [fromName, setFromName] = useState(campaign.from_name || 'M&Aソーシングパートナーズ株式会社');
  const [replyTo, setReplyTo] = useState(campaign.reply_to ?? 'shinomiya@ma-sp.co');

  // ----- 送付先 -----
  const seg = campaign.segment_definition?.client_contacts || {};
  const [ccMode, setCcMode] = useState((seg.client_ids?.length > 0) ? 'individual' : 'filter');
  const [ccStatuses, setCcStatuses] = useState(seg.statuses?.length ? seg.statuses : [...CLIENT_STATUSES]);
  const [ccClientIds, setCcClientIds] = useState(seg.client_ids || []);
  const [ccPrimaryOnly, setCcPrimaryOnly] = useState(seg.primary_only ?? true);
  const [clientOptions, setClientOptions] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientStatusTab, setClientStatusTab] = useState('all');   // 個別選択時のステータス絞り込みタブ

  // ----- 送信タイミング -----
  const [sendTiming, setSendTiming] = useState((campaign.status !== 'sent' && campaign.scheduled_at) ? 'scheduled' : 'now');
  const [scheduledAt, setScheduledAt] = useState(
    campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : ''
  );

  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // 実績(配信済み)
  const [recipients, setRecipients] = useState([]);
  const [recLoading, setRecLoading] = useState(showStats);
  const [recFilter, setRecFilter] = useState('all');   // 受信者一覧の絞り込み

  // ----- 初期ロード -----
  useEffect(() => {
    if (!orgId) return;
    // 送付先の個別選択は下書き(初回送信)でも配信済み(追加送信)でも使うため常に取得
    supabase.from('clients').select('id,name,status').eq('org_id', orgId).order('name', { ascending: true })
      .then(({ data, error: e }) => { if (!e) setClientOptions(data || []); });
  }, [orgId]);

  useEffect(() => {
    if (!showStats || !campaign.id) return;
    let cancelled = false;
    setRecLoading(true);
    supabase.from('email_campaign_recipients')
      .select('id,email,display_name,status,first_opened_at,first_clicked_at')
      .eq('campaign_id', campaign.id)
      .order('first_opened_at', { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => { if (!cancelled) { setRecipients(data || []); setRecLoading(false); } });
    return () => { cancelled = true; };
  }, [showStats, campaign.id]);

  const segmentDefinition = useMemo(() => ({
    client_contacts: {
      enabled: true,
      statuses: ccMode === 'individual' ? [] : ccStatuses,
      engagement_ids: [],
      client_ids: ccMode === 'individual' ? ccClientIds : [],
      primary_only: ccPrimaryOnly,
    },
    lead_companies: { enabled: false },
    manual_emails: [],
  }), [ccMode, ccStatuses, ccClientIds, ccPrimaryOnly]);

  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const settingsPatch = useCallback(() => ({
    name: name.trim() || subject.trim(),
    subject: subject.trim(),
    from_name: fromName.trim() || 'M&Aソーシングパートナーズ株式会社',
    reply_to: replyTo.trim() || null,
    segment_definition: segmentDefinition,
  }), [name, subject, fromName, replyTo, segmentDefinition]);

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true); setPreviewResult(null); setError(null);
    const { data, error: e } = await supabase.rpc('preview_campaign_recipients', { p_segment: segmentDefinition, p_limit: 20 });
    setPreviewLoading(false);
    if (e) { setError('プレビュー取得失敗: ' + e.message); return; }
    setPreviewResult(data?.[0] || null);
  }, [segmentDefinition]);

  const handleSaveSettings = useCallback(async () => {
    setBusy(true); setError(null); setNotice(null);
    const { error: e } = await supabase.from('email_campaigns').update(settingsPatch()).eq('id', campaign.id);
    setBusy(false);
    if (e) { setError('保存に失敗: ' + e.message); return; }
    setNotice('設定を保存しました');
  }, [campaign.id, settingsPatch]);

  const handleSend = useCallback(async () => {
    if (!subject.trim()) { setError('件名を入力してください'); return; }
    if (!previewResult || previewResult.unique_emails === 0) { setError('先に「対象件数を取得」で送信先を確認してください'); return; }
    if (sendTiming === 'scheduled' && !scheduledAt) { setError('予約日時を指定してください'); return; }
    const cnt = previewResult.unique_emails;
    const msg = sendTiming === 'scheduled'
      ? `${cnt}件を ${scheduledAt} に予約送信します。よろしいですか?`
      : `${cnt}件のメールを今すぐ送信します。よろしいですか?`;
    if (!window.confirm(msg)) return;

    setBusy(true); setError(null);
    const patch = {
      ...settingsPatch(),
      status: 'scheduled',
      scheduled_at: sendTiming === 'scheduled' ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
    };
    const { error: e } = await supabase.from('email_campaigns').update(patch).eq('id', campaign.id);
    if (e) { setBusy(false); setError('更新に失敗: ' + e.message); return; }

    if (sendTiming === 'now') {
      const { error: invErr } = await supabase.functions.invoke('send-campaign', { body: { campaign_id: campaign.id } });
      if (invErr) { setBusy(false); setError('送信実行に失敗: ' + invErr.message); return; }
    }
    setBusy(false);
    onClose(true);
  }, [campaign.id, subject, previewResult, sendTiming, scheduledAt, settingsPatch, onClose]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('このキャンペーンを削除します。よろしいですか?\n(受信者・開封/クリック履歴も一緒に削除され、元に戻せません)')) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.from('email_campaigns').delete().eq('id', campaign.id);
    setBusy(false);
    if (e) { setError('削除に失敗: ' + e.message); return; }
    onClose(true);
  }, [campaign.id, onClose]);

  const st = STATUS_LABEL[campaign.status] || { text: campaign.status, variant: 'neutral' };
  const sentCount = campaign.sent_count || 0;
  const rate = (n) => sentCount ? `${Math.round((n / sentCount) * 1000) / 10}%` : '-';

  const recipientColumns = useMemo(() => [
    { key: 'display_name', label: '宛先', width: 200, align: 'left',
      render: (row) => (
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.display_name || '(名前なし)'}</div>
          <div style={{ fontSize: 10, color: color.textMid, fontFamily: font.family.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.email}</div>
        </div>
      ) },
    { key: 'status', label: '状態', width: 90, align: 'center',
      render: (row) => { const s = RECIPIENT_STATUS_LABEL[row.status] || { text: row.status, variant: 'neutral' }; return <Badge variant={s.variant}>{s.text}</Badge>; } },
    { key: 'first_opened_at', label: '開封', width: 84, align: 'right',
      render: (row) => row.first_opened_at
        ? <span style={{ fontSize: 11, fontFamily: font.family.mono, color: color.success }}>{new Date(row.first_opened_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        : <span style={{ color: color.textLight, fontSize: 11 }}>-</span> },
    { key: 'first_clicked_at', label: 'クリック', width: 84, align: 'right',
      render: (row) => row.first_clicked_at
        ? <span style={{ fontSize: 11, fontFamily: font.family.mono, color: color.navy }}>{new Date(row.first_clicked_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        : <span style={{ color: color.textLight, fontSize: 11 }}>-</span> },
  ], []);

  // 受信者一覧の絞り込みタブ定義
  const REC_TABS = [
    { key: 'all',      label: '全員',     match: () => true },
    { key: 'opened',   label: '開封',     match: (r) => !!r.first_opened_at },
    { key: 'clicked',  label: 'クリック', match: (r) => !!r.first_clicked_at },
    { key: 'unopened', label: '未開封',   match: (r) => !r.first_opened_at && !['bounced', 'unsubscribed'].includes(r.status) },
    { key: 'bounced',  label: 'バウンス', match: (r) => r.status === 'bounced' },
    { key: 'unsub',    label: '配信停止', match: (r) => r.status === 'unsubscribed' },
  ];
  const recMatch = REC_TABS.find((t) => t.key === recFilter)?.match ?? (() => true);
  const filteredRecipients = recipients.filter(recMatch);
  const copyEmails = () => {
    const list = filteredRecipients.map((r) => r.email).filter(Boolean).join('\n');
    if (list) navigator.clipboard?.writeText(list);
  };

  const filteredClients = clientOptions.filter(c =>
    (clientStatusTab === 'all' || c.status === clientStatusTab) &&
    (!clientSearch || (c.name || '').includes(clientSearch))
  );
  const statusCount = (s) => clientOptions.filter(c => s === 'all' || c.status === s).length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: color.white, zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: color.navy, color: color.white, padding: `${space[3]}px ${space[5]}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3] }}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: space[2] }}>
          <Badge variant={st.variant} dot>{st.text}</Badge>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {campaign.subject || '(件名なし)'}
          </span>
        </div>
        <button type="button" onClick={() => onClose(false)}
          style={{ background: 'transparent', border: `1px solid ${alpha(color.white, 0.5)}`, color: color.white, borderRadius: radius.sm, padding: `${space[1]}px ${space[3]}px`, cursor: 'pointer', flexShrink: 0 }}>
          閉じる ×
        </button>
      </div>

      {/* Body: 左パネル + 右プレビュー */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        {/* 右カラム(設定/送付先/送信) — DOMはこちらが先だが gridColumn:2 で右に配置 */}
        <div style={{ gridColumn: 2, overflow: 'auto', padding: space[5], background: color.snow }}>
          {showStats && (
            <>
              <h3 style={SECTION_TITLE}>配信実績</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: space[2], marginBottom: space[4] }}>
                {[
                  ['配信', `${sentCount}/${campaign.total_recipients || 0}`],
                  ['開封', `${rate(campaign.opened_count)} (${campaign.opened_count || 0})`],
                  ['クリック', `${rate(campaign.clicked_count)} (${campaign.clicked_count || 0})`],
                  ['停止', `${campaign.unsubscribed_count || 0}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ padding: space[2], background: color.white, borderRadius: radius.md, border: `1px solid ${color.borderLight}` }}>
                    <div style={{ fontSize: font.size.xs, color: color.textMid }}>{l}</div>
                    <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy, fontFamily: font.family.mono }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2], borderBottom: `1px solid ${color.borderLight}`, paddingBottom: space[1] }}>
                <h3 style={{ ...SECTION_TITLE, margin: 0, border: 'none', padding: 0 }}>受信者 ({filteredRecipients.length}件)</h3>
                <button type="button" onClick={copyEmails}
                  style={{ fontSize: 11, padding: `2px ${space[2]}px`, border: `1px solid ${color.border}`, borderRadius: radius.sm, background: color.white, color: color.navy, cursor: 'pointer' }}>
                  表示中のメールをコピー
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginBottom: space[2] }}>
                {REC_TABS.map((t) => {
                  const cnt = recipients.filter(t.match).length;
                  return (
                    <button key={t.key} type="button" onClick={() => setRecFilter(t.key)}
                      style={{ padding: `2px ${space[1.5]}px`, fontSize: 11, cursor: 'pointer', borderRadius: radius.sm,
                        border: `1px solid ${recFilter === t.key ? color.navy : color.border}`,
                        background: recFilter === t.key ? color.navy : color.white,
                        color: recFilter === t.key ? color.white : color.textMid }}>
                      {t.label}<span style={{ opacity: 0.7, marginLeft: 3 }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginBottom: space[4] }}>
                <DataTable columns={recipientColumns} rows={filteredRecipients} rowKey="id" loading={recLoading} emptyMessage="該当なし" height={300} fillWidth />
              </div>
            </>
          )}

          {(editable || isSent) && (
            <>
              {editable && (<>
              <h3 style={SECTION_TITLE}>設定</h3>
              <div style={{ display: 'grid', gap: space[2], marginBottom: space[4] }}>
                <Input label="キャンペーン名 (社内識別用)" value={name} onChange={e => setName(e.target.value)} placeholder="例: 6月度ニュースレター" />
                <Input label="件名" value={subject} onChange={e => setSubject(e.target.value)} required />
                <Input label="差出人 表示名" value={fromName} onChange={e => setFromName(e.target.value)} />
                <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: -space[1] }}>
                  送信元アドレス: <code style={{ fontFamily: font.family.mono }}>noreply@newsletter.ma-sp.co</code> (固定)
                </div>
                <Input label="返信先アドレス (Reply-To)" value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="shinomiya@ma-sp.co" />
                <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: -space[1] }}>
                  ※本文(HTML)はClaude側で作成します。この画面では本文編集はできません。
                </div>
              </div>
              </>)}

              <h3 style={SECTION_TITLE}>{isSent ? '他の企業にも送る' : '送付先'}</h3>
              {isSent && (
                <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[2] }}>
                  既に送信済みの宛先は自動でスキップされます（同じ相手に二重送信されません）。
                </div>
              )}
              <div style={{ display: 'grid', gap: space[2], marginBottom: space[4] }}>
                <div style={{ display: 'flex', gap: space[1] }}>
                  {[['filter', '条件で絞る'], ['individual', '個別に選ぶ']].map(([m, lbl]) => (
                    <button key={m} type="button" onClick={() => setCcMode(m)}
                      style={{ padding: `${space[1]}px ${space[2]}px`, fontSize: font.size.xs, border: `1px solid ${color.border}`, borderRadius: radius.sm, cursor: 'pointer',
                        background: ccMode === m ? color.navy : color.white, color: ccMode === m ? color.white : color.textDark }}>{lbl}</button>
                  ))}
                </div>

                {ccMode === 'filter' && (
                  <div>
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>CRMステータス (未選択=全て)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
                      {CLIENT_STATUSES.map(s => (
                        <Chip key={s} active={ccStatuses.includes(s)} onClick={() => setCcStatuses(prev => toggle(prev, s))}>{s}</Chip>
                      ))}
                    </div>
                  </div>
                )}

                {ccMode === 'individual' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1] }}>
                      <span style={{ fontSize: font.size.xs, color: color.textMid }}>送る企業を選択 ({ccClientIds.length}社)</span>
                      <div style={{ display: 'flex', gap: space[1] }}>
                        <button type="button" onClick={() => setCcClientIds(filteredClients.map(c => c.id))}
                          style={{ fontSize: 10, padding: `1px ${space[1]}px`, border: `1px solid ${color.border}`, borderRadius: radius.sm, background: color.white, color: color.textMid, cursor: 'pointer' }}>表示中を全選択</button>
                        <button type="button" onClick={() => setCcClientIds([])}
                          style={{ fontSize: 10, padding: `1px ${space[1]}px`, border: `1px solid ${color.border}`, borderRadius: radius.sm, background: color.white, color: color.textMid, cursor: 'pointer' }}>クリア</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginBottom: space[1] }}>
                      {['all', ...CLIENT_STATUSES].map(t => (
                        <button key={t} type="button" onClick={() => setClientStatusTab(t)}
                          style={{ padding: `2px ${space[1.5]}px`, fontSize: 11, cursor: 'pointer', borderRadius: radius.sm,
                            border: `1px solid ${clientStatusTab === t ? color.navy : color.border}`,
                            background: clientStatusTab === t ? color.navy : color.white,
                            color: clientStatusTab === t ? color.white : color.textMid }}>
                          {t === 'all' ? '全部' : t}<span style={{ opacity: 0.7, marginLeft: 3 }}>{statusCount(t)}</span>
                        </button>
                      ))}
                    </div>
                    <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="企業名で絞り込み"
                      style={{ width: '100%', padding: `${space[1]}px ${space[2]}px`, marginBottom: space[1], boxSizing: 'border-box', border: `1px solid ${color.border}`, borderRadius: radius.sm, fontSize: font.size.xs }} />
                    <div style={{ maxHeight: 240, overflow: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.sm, background: color.white }}>
                      {filteredClients.map(c => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px ${space[2]}px`, cursor: 'pointer', borderBottom: `1px solid ${color.borderLight}`, fontSize: font.size.xs }}>
                          <input type="checkbox" checked={ccClientIds.includes(c.id)} onChange={() => setCcClientIds(prev => toggle(prev, c.id))} />
                          <span style={{ flex: 1, color: color.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                          {c.status && <span style={{ fontSize: 10, color: color.textLight }}>{c.status}</span>}
                        </label>
                      ))}
                      {filteredClients.length === 0 && <div style={{ padding: space[2], fontSize: font.size.xs, color: color.textLight }}>該当なし</div>}
                    </div>
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', fontSize: font.size.xs, color: color.textDark }}>
                  <input type="checkbox" checked={ccPrimaryOnly} onChange={e => setCcPrimaryOnly(e.target.checked)} />
                  主担当者のみに送る (チェック外すと全担当者)
                </label>

                <div>
                  <Button variant="outline" size="sm" onClick={handlePreview} loading={previewLoading}>対象件数を取得</Button>
                  {previewResult && (
                    <span style={{ marginLeft: space[2], fontSize: font.size.sm }}>
                      <b style={{ color: color.navy, fontSize: font.size.lg }}>{previewResult.unique_emails}</b> 件
                    </span>
                  )}
                </div>
              </div>

              {editable && (<>
              <h3 style={SECTION_TITLE}>送信</h3>
              <div style={{ display: 'flex', gap: space[3], marginBottom: space[2] }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer', fontSize: font.size.sm }}>
                  <input type="radio" checked={sendTiming === 'now'} onChange={() => setSendTiming('now')} /> 即時送信
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer', fontSize: font.size.sm }}>
                  <input type="radio" checked={sendTiming === 'scheduled'} onChange={() => setSendTiming('scheduled')} /> 予約送信
                </label>
              </div>
              {sendTiming === 'scheduled' && (
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  style={{ padding: space[2], border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.sm, marginBottom: space[2] }} />
              )}
              </>)}
            </>
          )}

          {(error || notice) && (
            <div style={{ fontSize: font.size.xs, color: error ? color.danger : color.success, margin: `${space[2]}px 0`, minHeight: 16 }}>
              {error || notice}
            </div>
          )}

          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginTop: space[3] }}>
            <Button variant="danger" size="md" onClick={handleDelete} disabled={busy}>削除</Button>
            <div style={{ flex: 1 }} />
            {editable && (
              <>
                <Button variant="ghost" size="md" onClick={handleSaveSettings} disabled={busy}>設定を保存</Button>
                <Button variant="primary" size="md" onClick={handleSend} loading={busy}>
                  {sendTiming === 'scheduled' ? '予約送信' : '送信'}
                </Button>
              </>
            )}
            {isSent && (
              <Button variant="primary" size="md" onClick={handleSend} loading={busy}>追加送信</Button>
            )}
          </div>
        </div>

        {/* 左: 全画面プレビュー (gridColumn:1 で左に配置) */}
        <div style={{ gridColumn: 1, gridRow: 1, background: color.gray50, padding: space[3], overflow: 'hidden', borderRight: `1px solid ${color.border}` }}>
          <iframe title="本文プレビュー" srcDoc={campaign.body_html || '<p style="padding:24px;color:#888">本文がありません</p>'}
            style={{ width: '100%', height: '100%', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.white }} />
        </div>
      </div>
    </div>
  );
}
