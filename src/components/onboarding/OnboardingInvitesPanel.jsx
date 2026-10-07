import React, { useEffect, useState } from 'react';
import { color, space, font } from '../../constants/design';
import { Button, Input, Badge, DataTable } from '../ui';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { joinUrl } from '../../lib/onboarding';

// 入社の招待リンク（メンバーのページ → 招待リンク）。2026-10-07
// 発行 → LINEで本人に送る → 本人が4情報を入れる → 契約に同意 → Slack・LINE・Zoom
const STATUS = {
  sent: ['送付済み・入力待ち', 'neutral'],
  submitting: ['処理中', 'neutral'],
  submitted: ['入力済み・契約待ち', 'warn'],
  signed: ['契約済み', 'success'],
  done: ['完了', 'success'],
  revoked: ['取り消し', 'default'],
};
const md = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

export default function OnboardingInvitesPanel() {
  const orgId = getOrgId();
  const [rows, setRows] = useState([]);
  const [hint, setHint] = useState('');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [cfg, setCfg] = useState({ slack_invite_url: '', line_group_url: '' });
  const [cfgSaved, setCfgSaved] = useState(null);

  const load = async () => {
    const { data } = await supabase.from('onboarding_invites').select('*').order('created_at', { ascending: false }).limit(50);
    setRows(data || []);
  };
  useEffect(() => {
    load();
    supabase.from('onboarding_settings').select('*').eq('org_id', orgId).maybeSingle().then(({ data }) => {
      if (data) { setCfg({ slack_invite_url: data.slack_invite_url || '', line_group_url: data.line_group_url || '' }); setCfgSaved(data); }
    });
  }, [orgId]);

  const issue = async () => {
    setBusy(true); setMsg('');
    const { data, error } = await supabase.from('onboarding_invites')
      .insert({ org_id: orgId, name_hint: hint.trim() || null, start_date: start || null }).select('*').single();
    setBusy(false);
    if (error) { setMsg(`発行できませんでした：${error.message}`); return; }
    setHint(''); setStart('');
    await copy(data.token);
    load();
  };
  const copy = async (token) => {
    try { await navigator.clipboard.writeText(joinUrl(token)); setMsg('リンクをコピーしました。LINEで本人に送ってください'); }
    catch { setMsg(joinUrl(token)); }
    setTimeout(() => setMsg(''), 5000);
  };
  const revoke = async (id) => {
    await supabase.from('onboarding_invites').update({ status: 'revoked' }).eq('id', id).eq('status', 'sent');
    load();
  };
  const saveCfg = async () => {
    const slackChanged = cfg.slack_invite_url.trim() !== (cfgSaved?.slack_invite_url || '');
    const { data, error } = await supabase.from('onboarding_settings').upsert({
      org_id: orgId,
      slack_invite_url: cfg.slack_invite_url.trim() || null,
      line_group_url: cfg.line_group_url.trim() || null,
      ...(slackChanged ? { slack_invite_set_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' }).select('*').single();
    if (error) { setMsg(`保存できませんでした：${error.message}`); return; }
    setCfgSaved(data); setMsg('案内のリンクを保存しました'); setTimeout(() => setMsg(''), 3000);
  };
  const slackAge = cfgSaved?.slack_invite_set_at ? Math.floor((Date.now() - new Date(cfgSaved.slack_invite_set_at)) / 86400000) : null;

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 200 }}><Input size="sm" label="誰あてか（メモ）" value={hint} onChange={e => setHint(e.target.value)} placeholder="例：山田さん" /></div>
        <div style={{ width: 170 }}><Input size="sm" type="date" label="入社日＝契約開始日" value={start} onChange={e => setStart(e.target.value)} /></div>
        <Button size="sm" variant="primary" loading={busy} onClick={issue}>招待リンクを発行してコピー</Button>
        {msg && <span style={{ fontSize: font.size.xs, color: color.success, wordBreak: 'break-all' }}>{msg}</span>}
      </div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, lineHeight: 1.8 }}>
        リンクは14日間・1回だけ使えます。本人が氏名・メール・住所・口座を入れると、パスワード設定のメールが届き、ログインすると業務委託契約書への同意に進みます。入社日が空なら、入力した日が契約開始日になります。
      </div>

      <DataTable
        fillWidth
        rowKey="id"
        rows={rows}
        emptyMessage="まだ発行していません"
        columns={[
          { key: 'created_at', label: '発行', width: 64, align: 'right', render: (r) => md(r.created_at) },
          { key: 'name_hint', label: 'メモ', width: 120, align: 'left', render: (r) => r.name_hint || '—' },
          { key: 'who', label: '氏名・メール', width: 220, align: 'left', render: (r) => (
            <span>{r.submitted?.last_name ? `${r.submitted.last_name} ${r.submitted.first_name}` : '—'}<div style={{ fontSize: 11, color: color.textLight }}>{r.email || ''}</div></span>
          ) },
          { key: 'start_date', label: '入社日', width: 72, align: 'right', render: (r) => (r.start_date ? md(r.start_date + 'T00:00:00') : '入力日') },
          { key: 'status', label: '状態', width: 150, align: 'center', render: (r) => { const [l, v] = STATUS[r.status] || [r.status, 'default']; return <Badge variant={v} dot>{l}</Badge>; } },
          { key: 'slack', label: 'Slack', width: 70, align: 'center', render: (r) => (r.steps?.slack === 'joined' ? '参加' : '—') },
          { key: 'zoom', label: 'Zoom', width: 80, align: 'center', render: (r) => ({ active: '番号あり', invited: '承諾待ち', no_license: '空きなし' }[r.steps?.zoom] || '—') },
          { key: 'act', label: '', width: 160, align: 'center', render: (r) => (r.status === 'sent' ? (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); copy(r.token); }}>コピー</Button>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); revoke(r.id); }}>取り消す</Button>
            </span>
          ) : null) },
        ]}
      />

      <div style={{ display: 'grid', gap: space[2] }}>
        <b style={{ color: color.navy, fontSize: font.size.sm }}>入社した人に見せる案内のリンク</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: space[3], alignItems: 'flex-end' }}>
          <Input size="sm" label={`Slackの参加リンク${slackAge != null ? `（貼ってから${slackAge}日・30日で切れます）` : '（30日で切れます）'}`} value={cfg.slack_invite_url} onChange={e => setCfg(c => ({ ...c, slack_invite_url: e.target.value }))} placeholder="https://join.slack.com/t/..." />
          <Input size="sm" label="LINEグループの招待リンク" value={cfg.line_group_url} onChange={e => setCfg(c => ({ ...c, line_group_url: e.target.value }))} placeholder="https://line.me/R/ti/g/..." />
          <Button size="sm" variant="outline" onClick={saveCfg}>保存</Button>
        </div>
        {slackAge != null && slackAge >= 25 && <span style={{ fontSize: font.size.xs, color: color.danger }}>Slackの参加リンクがまもなく切れます。Slackで新しいリンクを作って貼り替えてください</span>}
      </div>
    </div>
  );
}
