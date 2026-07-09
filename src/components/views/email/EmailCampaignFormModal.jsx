import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { useEngagements } from '../../../hooks/useEngagements';

const CLIENT_STATUSES = ['支援中', '準備中', '面談予定', '中期フォロー', '保留', '停止中'];

const MERGE_VARS = [
  { key: 'client_name', label: 'クライアント企業名 (担当者向け)' },
  { key: 'contact_name', label: '担当者名 (担当者向け)' },
  { key: 'status', label: 'CRMステータス (担当者向け)' },
  { key: 'engagement_name', label: '商材名 (担当者向け)' },
  { key: 'company_name', label: '見込み客 企業名' },
  { key: 'representative', label: '見込み客 代表者名' },
  { key: 'business', label: '見込み客 事業内容' },
  { key: 'prefecture', label: '見込み客 都道府県' },
  { key: 'display_name', label: '宛名 (手動指定時)' },
];

const DEFAULT_BODY = `<div style="font-family:'Helvetica Neue','Hiragino Sans',sans-serif;font-size:14px;color:#333;line-height:1.8;max-width:600px;margin:0 auto;padding:24px;">
  <p>{{contact_name}} 様</p>
  <p>いつもお世話になっております。M&Aソーシングパートナーズです。</p>
  <p>ここに本文を記入してください。</p>
  <p style="margin-top:32px;">--<br/>M&Aソーシングパートナーズ株式会社<br/>篠宮 拓武</p>
</div>`;

const SECTION_TITLE_STYLE = {
  fontSize: font.size.sm,
  fontWeight: font.weight.semibold,
  color: color.navy,
  margin: `0 0 ${space[2]}px 0`,
  paddingBottom: space[1],
  borderBottom: `1px solid ${color.borderLight}`,
};

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `${space[1]}px ${space[2.5]}px`,
        borderRadius: radius.pill,
        border: `1px solid ${active ? color.navy : color.border}`,
        background: active ? color.navy : color.white,
        color: active ? color.white : color.textDark,
        fontSize: font.size.xs,
        fontWeight: active ? font.weight.semibold : font.weight.normal,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export default function EmailCampaignFormModal({ orgId, currentUser, initial, onClose }) {
  const { engagements } = useEngagements();
  const realEngagements = useMemo(
    () => engagements.filter(e => !e.isVirtual),
    [engagements]
  );

  const [leadLists, setLeadLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [previewMode, setPreviewMode] = useState('edit'); // 'edit' | 'preview'

  // ----- フォーム状態 -----
  const [name, setName] = useState(initial?.name || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [fromName, setFromName] = useState(initial?.from_name || 'M&Aソーシングパートナーズ株式会社');
  const [replyTo, setReplyTo] = useState(initial?.reply_to ?? 'shinomiya@ma-sp.co');
  const [bodyHtml, setBodyHtml] = useState(initial?.body_html || DEFAULT_BODY);
  const [templateId, setTemplateId] = useState(initial?.template_id || '');

  // セグメント
  const initialSeg = initial?.segment_definition || {};
  const [ccEnabled, setCcEnabled] = useState(initialSeg.client_contacts?.enabled ?? true);
  const [ccStatuses, setCcStatuses] = useState(initialSeg.client_contacts?.statuses || [...CLIENT_STATUSES]);
  const [ccEngagements, setCcEngagements] = useState(initialSeg.client_contacts?.engagement_ids || []);
  const [ccPrimaryOnly, setCcPrimaryOnly] = useState(initialSeg.client_contacts?.primary_only ?? true);
  const [lcEnabled, setLcEnabled] = useState(initialSeg.lead_companies?.enabled ?? false);
  const [lcLists, setLcLists] = useState(initialSeg.lead_companies?.list_ids || []);
  const [lcExclPromo, setLcExclPromo] = useState(initialSeg.lead_companies?.exclude_promoted ?? true);
  const [lcExclExcl, setLcExclExcl] = useState(initialSeg.lead_companies?.exclude_excluded ?? true);
  const [manualText, setManualText] = useState(
    (initialSeg.manual_emails || []).map(m => `${m.display_name || ''},${m.email}`).join('\n')
  );

  // 送信タイミング
  const [sendTiming, setSendTiming] = useState(initial?.scheduled_at ? 'scheduled' : 'now');
  const [scheduledAt, setScheduledAt] = useState(
    initial?.scheduled_at ? new Date(initial.scheduled_at).toISOString().slice(0, 16) : ''
  );

  // プレビュー結果
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 送信中
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ----- 初期データロード -----
  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      supabase.from('client_lead_lists').select('id,name').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('email_templates').select('id,name,subject_template,body_html').eq('org_id', orgId).order('updated_at', { ascending: false }).limit(50),
    ]).then(([listRes, tmplRes]) => {
      if (!listRes.error) setLeadLists(listRes.data || []);
      if (!tmplRes.error) setTemplates(tmplRes.data || []);
    });
  }, [orgId]);

  // ----- セグメント JSON 構築 -----
  const segmentDefinition = useMemo(() => {
    const manual = manualText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) return { display_name: parts[0], email: parts[1] };
        return { display_name: '', email: parts[0] };
      })
      .filter(m => /.+@.+\..+/.test(m.email));
    return {
      client_contacts: ccEnabled ? {
        enabled: true,
        statuses: ccStatuses,
        engagement_ids: ccEngagements,
        primary_only: ccPrimaryOnly,
      } : { enabled: false },
      lead_companies: lcEnabled ? {
        enabled: true,
        list_ids: lcLists,
        exclude_promoted: lcExclPromo,
        exclude_excluded: lcExclExcl,
      } : { enabled: false },
      manual_emails: manual,
    };
  }, [ccEnabled, ccStatuses, ccEngagements, ccPrimaryOnly, lcEnabled, lcLists, lcExclPromo, lcExclExcl, manualText]);

  // ----- 配信先プレビュー -----
  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    const { data, error } = await supabase
      .rpc('preview_campaign_recipients', { p_segment: segmentDefinition, p_limit: 20 });
    setPreviewLoading(false);
    if (error) {
      setError('プレビュー取得失敗: ' + error.message);
      return;
    }
    setPreviewResult(data?.[0] || null);
  }, [segmentDefinition]);

  // ----- テンプレ適用 -----
  const handleTemplateApply = useCallback((tid) => {
    setTemplateId(tid);
    const t = templates.find(t => t.id === tid);
    if (t) {
      if (!subject) setSubject(t.subject_template || '');
      if (!bodyHtml || bodyHtml === DEFAULT_BODY) setBodyHtml(t.body_html || '');
    }
  }, [templates, subject, bodyHtml]);

  // ----- 差込変数挿入 (件名 or 本文) -----
  const insertMergeVar = (target, key) => {
    const tag = `{{${key}}}`;
    if (target === 'subject') setSubject(s => s + tag);
    else setBodyHtml(s => s + tag);
  };

  // ----- 保存 (draft / scheduled / send) -----
  const handleSave = useCallback(async (action) => {
    setError(null);
    if (!subject.trim()) { setError('件名を入力してください'); return; }
    if (!bodyHtml.trim()) { setError('本文を入力してください'); return; }
    if (action === 'send' || action === 'schedule') {
      if (!previewResult || previewResult.unique_emails === 0) {
        setError('先に「配信先プレビュー」で対象を確認してください');
        return;
      }
    }
    if (action === 'schedule' && !scheduledAt) {
      setError('予約日時を指定してください');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        template_id: templateId || null,
        name: name.trim() || subject.trim(),
        subject: subject.trim(),
        from_email: 'noreply@newsletter.ma-sp.co',
        from_name: fromName.trim() || 'M&Aソーシングパートナーズ株式会社',
        reply_to: replyTo.trim() || null,
        body_html: bodyHtml,
        body_text: null,
        segment_definition: segmentDefinition,
        status: action === 'send' ? 'scheduled' : action === 'schedule' ? 'scheduled' : 'draft',
        scheduled_at: action === 'send'
          ? new Date().toISOString()
          : action === 'schedule'
            ? new Date(scheduledAt).toISOString()
            : null,
      };

      let campaignId;
      if (initial?.id) {
        const { error } = await supabase
          .from('email_campaigns').update(payload).eq('id', initial.id);
        if (error) throw error;
        campaignId = initial.id;
      } else {
        const { data, error } = await supabase
          .from('email_campaigns').insert(payload).select('id').single();
        if (error) throw error;
        campaignId = data.id;
      }

      // 即時送信なら send-campaign を即 invoke (cron 待たない)
      if (action === 'send') {
        const { error: invokeError } = await supabase.functions.invoke('send-campaign', {
          body: { campaign_id: campaignId },
        });
        if (invokeError) {
          throw new Error('送信実行に失敗: ' + invokeError.message);
        }
      }

      onClose(true);
    } catch (e) {
      console.error('save campaign failed:', e);
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [orgId, templateId, name, subject, fromName, replyTo, bodyHtml, segmentDefinition, scheduledAt, previewResult, initial, onClose]);

  const toggleArrayItem = (arr, item) =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  // ----- 描画 -----
  return (
    <div
      onClick={() => !saving && onClose(false)}
      style={{
        position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5),
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
          width: '100%', maxWidth: 1180, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[3]}px ${space[5]}px`,
          borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.semibold }}>
            {initial?.id ? 'メルマガキャンペーン編集' : '新規メルマガキャンペーン'}
          </h2>
          <button
            type="button"
            onClick={() => !saving && onClose(false)}
            style={{
              background: 'transparent', border: 'none', color: color.white,
              fontSize: 20, cursor: 'pointer', padding: space[1],
            }}
          >×</button>
        </div>

        {/* Body (2-column: form | preview) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* Form */}
          <div style={{ overflow: 'auto', padding: space[5], borderRight: `1px solid ${color.border}` }}>
            <h3 style={SECTION_TITLE_STYLE}>基本情報</h3>
            <div style={{ display: 'grid', gap: space[2], marginBottom: space[4] }}>
              <Input
                label="キャンペーン名 (社内識別用)"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例: 6月度ニュースレター"
              />
              {templates.length > 0 && (
                <Select
                  label="テンプレートから読込 (任意)"
                  value={templateId}
                  onChange={e => handleTemplateApply(e.target.value)}
                  options={[
                    { value: '', label: '— テンプレ未使用 —' },
                    ...templates.map(t => ({ value: t.id, label: t.name })),
                  ]}
                />
              )}
              <div>
                <Input
                  label="件名"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="例: {{contact_name}} 様、6月のご案内"
                  required
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginTop: space[1] }}>
                  <span style={{ fontSize: font.size.xs, color: color.textMid, alignSelf: 'center' }}>差込:</span>
                  {MERGE_VARS.slice(0, 4).map(v => (
                    <button key={v.key} type="button" onClick={() => insertMergeVar('subject', v.key)}
                      style={{
                        fontSize: font.size.xs, padding: `2px ${space[1.5]}px`, border: `1px solid ${color.border}`,
                        background: color.gray50, color: color.textMid, borderRadius: radius.sm, cursor: 'pointer',
                        fontFamily: font.family.mono,
                      }}>
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="差出人 表示名"
                value={fromName}
                onChange={e => setFromName(e.target.value)}
                placeholder="M&Aソーシングパートナーズ"
              />
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: -space[1] }}>
                送信元アドレス: <code style={{ fontFamily: font.family.mono }}>noreply@newsletter.ma-sp.co</code> (固定)
              </div>
              <Input
                label="返信先アドレス (Reply-To)"
                value={replyTo}
                onChange={e => setReplyTo(e.target.value)}
                placeholder="shinomiya@ma-sp.co"
              />
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: -space[1] }}>
                受信者が「返信」した際の宛先。空欄なら送信元アドレスに返信されます。
              </div>
            </div>

            <h3 style={SECTION_TITLE_STYLE}>本文 (HTML)</h3>
            <div style={{ display: 'flex', gap: space[1], marginBottom: space[2] }}>
              <button type="button" onClick={() => setPreviewMode('edit')}
                style={{
                  padding: `${space[1]}px ${space[2]}px`, fontSize: font.size.xs,
                  border: `1px solid ${color.border}`, borderRadius: radius.sm, cursor: 'pointer',
                  background: previewMode === 'edit' ? color.navy : color.white,
                  color: previewMode === 'edit' ? color.white : color.textDark,
                }}>編集</button>
              <button type="button" onClick={() => setPreviewMode('preview')}
                style={{
                  padding: `${space[1]}px ${space[2]}px`, fontSize: font.size.xs,
                  border: `1px solid ${color.border}`, borderRadius: radius.sm, cursor: 'pointer',
                  background: previewMode === 'preview' ? color.navy : color.white,
                  color: previewMode === 'preview' ? color.white : color.textDark,
                }}>プレビュー</button>
            </div>
            {previewMode === 'edit' ? (
              <textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                style={{
                  width: '100%', minHeight: 300, padding: space[2],
                  border: `1px solid ${color.border}`, borderRadius: radius.md,
                  fontFamily: font.family.mono, fontSize: font.size.xs,
                  resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            ) : (
              <iframe
                title="本文プレビュー"
                srcDoc={bodyHtml}
                style={{
                  width: '100%', minHeight: 300, border: `1px solid ${color.border}`,
                  borderRadius: radius.md, background: color.white,
                }}
              />
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginTop: space[2] }}>
              <span style={{ fontSize: font.size.xs, color: color.textMid, alignSelf: 'center' }}>差込変数:</span>
              {MERGE_VARS.map(v => (
                <button key={v.key} type="button" onClick={() => insertMergeVar('body', v.key)}
                  style={{
                    fontSize: font.size.xs, padding: `2px ${space[1.5]}px`, border: `1px solid ${color.border}`,
                    background: color.gray50, color: color.textMid, borderRadius: radius.sm, cursor: 'pointer',
                    fontFamily: font.family.mono,
                  }}
                  title={v.label}>
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Segment / Preview */}
          <div style={{ overflow: 'auto', padding: space[5] }}>
            <h3 style={SECTION_TITLE_STYLE}>配信先セグメント</h3>

            {/* クライアント担当者 */}
            <div style={{ marginBottom: space[3], padding: space[3], background: color.cream, borderRadius: radius.md }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', marginBottom: space[2] }}>
                <input type="checkbox" checked={ccEnabled} onChange={e => setCcEnabled(e.target.checked)} />
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>
                  クライアント企業の担当者に送る
                </span>
              </label>
              {ccEnabled && (
                <div style={{ paddingLeft: space[3], display: 'grid', gap: space[2] }}>
                  <div>
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>
                      CRMステータス (複数選択可、未選択=全て)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
                      {CLIENT_STATUSES.map(s => (
                        <Chip key={s} active={ccStatuses.includes(s)}
                          onClick={() => setCcStatuses(prev => toggleArrayItem(prev, s))}>
                          {s}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {realEngagements.length > 0 && (
                    <div>
                      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>
                        商材で絞り込み (未選択=全商材)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
                        {realEngagements.map(e => (
                          <Chip key={e.id} active={ccEngagements.includes(e.id)}
                            onClick={() => setCcEngagements(prev => toggleArrayItem(prev, e.id))}>
                            {e.name}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', fontSize: font.size.xs, color: color.textDark }}>
                    <input type="checkbox" checked={ccPrimaryOnly} onChange={e => setCcPrimaryOnly(e.target.checked)} />
                    主担当者のみに送る (チェック外すと全担当者)
                  </label>
                </div>
              )}
            </div>

            {/* 見込み客 */}
            <div style={{ marginBottom: space[3], padding: space[3], background: color.cream, borderRadius: radius.md }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', marginBottom: space[2] }}>
                <input type="checkbox" checked={lcEnabled} onChange={e => setLcEnabled(e.target.checked)} />
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>
                  見込み客に送る (営業メルマガ)
                </span>
              </label>
              {lcEnabled && (
                <div style={{ paddingLeft: space[3], display: 'grid', gap: space[2] }}>
                  <div>
                    <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>
                      対象リスト (未選択=全リスト)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], maxHeight: 120, overflow: 'auto' }}>
                      {leadLists.length === 0 && (
                        <span style={{ fontSize: font.size.xs, color: color.textMid }}>架電リストがありません</span>
                      )}
                      {leadLists.map(l => (
                        <Chip key={l.id} active={lcLists.includes(l.id)}
                          onClick={() => setLcLists(prev => toggleArrayItem(prev, l.id))}>
                          {l.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', fontSize: font.size.xs, color: color.textDark }}>
                    <input type="checkbox" checked={lcExclPromo} onChange={e => setLcExclPromo(e.target.checked)} />
                    既にクライアント昇格済みは除外
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', fontSize: font.size.xs, color: color.textDark }}>
                    <input type="checkbox" checked={lcExclExcl} onChange={e => setLcExclExcl(e.target.checked)} />
                    除外フラグ付きを除外
                  </label>
                </div>
              )}
            </div>

            {/* 手動メール */}
            <div style={{ marginBottom: space[3], padding: space[3], background: color.cream, borderRadius: radius.md }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark, marginBottom: space[2] }}>
                手動指定メール (テスト送信用)
              </div>
              <textarea
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder={`1行1件、「氏名,メアド」形式\n例:\n篠宮拓武,shinomiya@ma-sp.co`}
                style={{
                  width: '100%', minHeight: 70, padding: space[2],
                  border: `1px solid ${color.border}`, borderRadius: radius.sm,
                  fontFamily: font.family.mono, fontSize: font.size.xs,
                  resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* プレビュー */}
            <h3 style={SECTION_TITLE_STYLE}>配信先プレビュー</h3>
            <div style={{ marginBottom: space[3] }}>
              <Button variant="outline" size="sm" onClick={handlePreview} loading={previewLoading}>
                対象件数を取得
              </Button>
              {previewResult && (
                <div style={{ marginTop: space[2], padding: space[2], background: color.gray50, borderRadius: radius.sm }}>
                  <div style={{ display: 'flex', gap: space[3], fontSize: font.size.sm, marginBottom: space[1] }}>
                    <span><b style={{ color: color.navy, fontSize: font.size.lg }}>{previewResult.unique_emails}</b> 件 (重複排除後)</span>
                    <span style={{ color: color.textMid, fontSize: font.size.xs, alignSelf: 'flex-end' }}>
                      総候補 {previewResult.total_count} 件
                    </span>
                  </div>
                  {previewResult.sample && previewResult.sample.length > 0 && (
                    <details style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
                      <summary style={{ cursor: 'pointer' }}>先頭{previewResult.sample.length}件のサンプル</summary>
                      <ul style={{ margin: `${space[1]}px 0 0`, paddingLeft: space[3], fontFamily: font.family.mono }}>
                        {previewResult.sample.slice(0, 20).map((s, i) => (
                          <li key={i}>{s.display_name} &lt;{s.email}&gt; <Badge variant="neutral">{s.recipient_type}</Badge></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* 送信タイミング */}
            <h3 style={SECTION_TITLE_STYLE}>送信タイミング</h3>
            <div style={{ display: 'flex', gap: space[3], marginBottom: space[2] }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer', fontSize: font.size.sm }}>
                <input type="radio" checked={sendTiming === 'now'} onChange={() => setSendTiming('now')} />
                即時送信
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer', fontSize: font.size.sm }}>
                <input type="radio" checked={sendTiming === 'scheduled'} onChange={() => setSendTiming('scheduled')} />
                予約送信
              </label>
            </div>
            {sendTiming === 'scheduled' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{
                  padding: space[2], border: `1px solid ${color.border}`, borderRadius: radius.md,
                  fontSize: font.size.sm, fontFamily: font.family.sans,
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: `${space[3]}px ${space[5]}px`, borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2],
          background: color.snow,
        }}>
          <div style={{ flex: 1, fontSize: font.size.xs, color: color.danger, minHeight: 16 }}>
            {error}
          </div>
          <Button variant="outline" size="md" onClick={() => onClose(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="ghost" size="md" onClick={() => handleSave('draft')} loading={saving}>
            下書き保存
          </Button>
          {sendTiming === 'scheduled' ? (
            <Button variant="primary" size="md" onClick={() => handleSave('schedule')} loading={saving}>
              予約登録
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={() => {
              if (window.confirm(`${previewResult?.unique_emails || '?'}件のメールを即時送信します。よろしいですか?`)) {
                handleSave('send');
              }
            }} loading={saving}>
              即時送信
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
