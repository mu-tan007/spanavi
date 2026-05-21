import React, { useState, useEffect, useMemo } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';
import VoiceRecorderInline from '../contacts/VoiceRecorderInline';
import { NAVY, GRAY_200, GRAY_50, STATUS_LIST } from './utils';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import { getOrgId } from '../../../lib/orgContext';

const textareaStyle = {
  width: '100%', padding: '6px 10px', borderRadius: radius.md,
  border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.sans,
  outline: 'none', background: color.gray50, color: color.textDark,
  boxSizing: 'border-box',
};
const labelStyle = {
  fontSize: font.size.xs, fontWeight: font.weight.semibold,
  color: color.textMid, marginBottom: 2, display: 'block',
  letterSpacing: font.letterSpacing.wide,
};

export default function ClientFormModal({
  mode,                       // 'add' | 'edit'
  form,
  setForm,
  onSave,
  onCancel,
  onDelete,                   // edit のみ
  saving = false,
  rewardMaster = [],
  rewardMap = {},
  pendingContacts = [],
  onClearPendingContacts,
  voiceTargetKind,            // 'client_create' | 'client_update'
  voiceClientId = null,
  onVoiceProcessed,
}) {
  if (!form) return null;

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const rewardIds = [...new Set(rewardMaster.map(r => r.id))].sort();
  const isEdit = mode === 'edit';

  const title = isEdit ? `顧客情報を編集 — ${form.company}` : '新規顧客を追加';

  // タイプ別報酬上書き（client_engagement_reward_settings）
  const { engagements } = useEngagements();
  const salesAgencyEngs = useMemo(() => {
    const order = ['seller_sourcing', 'matching', 'client_acquisition'];
    return (engagements || [])
      .filter(e => order.includes(e.slug))
      .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  }, [engagements]);
  const [engRewards, setEngRewards] = useState({}); // { [engagement_id]: reward_type }
  const [engRewardsLoaded, setEngRewardsLoaded] = useState(false);
  useEffect(() => {
    if (!isEdit || !form?._supaId) { setEngRewardsLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('client_engagement_reward_settings')
        .select('engagement_id, reward_type')
        .eq('client_id', form._supaId);
      if (cancelled) return;
      const map = {};
      (data || []).forEach(r => { map[r.engagement_id] = r.reward_type; });
      setEngRewards(map);
      setEngRewardsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [isEdit, form?._supaId]);

  // 保存ボタンの拡張ラッパー: 親の onSave 後に engRewards も upsert/delete
  const handleSaveAll = async () => {
    await onSave?.();
    if (!isEdit || !form?._supaId) return;
    // 既存設定との差分を upsert/delete
    const orgId = getOrgId();
    const ops = [];
    for (const eng of salesAgencyEngs) {
      const newType = (engRewards[eng.id] || '').trim();
      if (newType) {
        ops.push(
          supabase.from('client_engagement_reward_settings').upsert({
            org_id: orgId, client_id: form._supaId, engagement_id: eng.id, reward_type: newType,
          }, { onConflict: 'org_id,client_id,engagement_id' })
        );
      } else {
        ops.push(
          supabase.from('client_engagement_reward_settings')
            .delete()
            .eq('org_id', orgId).eq('client_id', form._supaId).eq('engagement_id', eng.id)
        );
      }
    }
    await Promise.all(ops);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 580, maxHeight: '90vh', overflow: 'auto', boxShadow: shadow.xl }}>
        <div style={{ padding: '12px 24px', background: color.navy, borderRadius: `${radius.md}px ${radius.md}px 0 0`, color: color.white, fontWeight: font.weight.semibold, fontSize: font.size.md, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
          <span>{title}</span>
          <span style={{ display: 'inline-flex' }}>
            <VoiceRecorderInline
              targetKind={voiceTargetKind}
              clientId={voiceClientId}
              onProcessed={onVoiceProcessed}
              onError={msg => alert(msg)}
              size={28}
            />
          </span>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {pendingContacts.length > 0 && (
            <div style={{
              marginBottom: space[3], padding: '6px 10px',
              fontSize: font.size.xs, color: color.navy,
              background: alpha(color.gold, 0.08), border: `1px solid ${alpha(color.gold, 0.4)}`,
              borderRadius: radius.sm,
            }}>
              AI から担当者 {pendingContacts.length} 名の追加候補があります。保存時にまとめて登録されます。
              <button
                onClick={onClearPendingContacts}
                style={{
                  background: 'none', border: 'none', color: color.textLight,
                  fontSize: font.size.xs, marginLeft: 6, cursor: 'pointer',
                  fontFamily: font.family.sans, textDecoration: 'underline',
                }}
              >クリア</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2.5] }}>
            <div>
              <label style={labelStyle}>ステータス</label>
              <Select
                size="sm"
                value={form.status || ''}
                onChange={e => u('status', e.target.value)}
                options={STATUS_LIST.map(s => ({ value: s, label: s }))}
              />
            </div>
            <div>
              <label style={labelStyle}>契約</label>
              <Select
                size="sm"
                value={form.contract || ''}
                onChange={e => u('contract', e.target.value)}
                options={[
                  { value: '済', label: '済' },
                  { value: '未', label: '未' },
                ]}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              {isEdit ? (
                <label style={labelStyle}>企業名</label>
              ) : (
                <label style={{ ...labelStyle, color: color.danger }}>企業名 <span style={{ fontWeight: font.weight.normal }}>*</span></label>
              )}
              <Input
                size="sm"
                value={form.company || ''}
                onChange={e => u('company', e.target.value)}
                placeholder={isEdit ? '' : '株式会社○○'}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>商材</label>
              <Input size="sm" value={form.industry || ''} onChange={e => u('industry', e.target.value)} placeholder="例: M&A仲介、IFA、不動産" />
            </div>

            <div>
              <label style={labelStyle}>報酬体系（デフォルト）</label>
              <Select
                size="sm"
                value={form.rewardType || ''}
                onChange={e => u('rewardType', e.target.value)}
                options={[
                  { value: '', label: '-' },
                  ...rewardIds.map(id => ({ value: id, label: `${id} - ${rewardMap[id] ? rewardMap[id].name : ''}` })),
                ]}
              />
            </div>

            {/* タイプ別の報酬上書き（既存クライアントのみ表示） */}
            {isEdit && salesAgencyEngs.length > 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: color.cream, borderRadius: radius.md, border: `1px solid ${color.border}` }}>
                <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 6 }}>
                  タイプ別の報酬上書き
                  <span style={{ marginLeft: 8, fontSize: 10, color: color.textLight, fontWeight: font.weight.normal }}>
                    （空欄=上の「報酬体系（デフォルト）」を使用）
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6, alignItems: 'center' }}>
                  {salesAgencyEngs.map(eng => (
                    <React.Fragment key={eng.id}>
                      <span style={{ fontSize: font.size.xs, color: color.textMid }}>{eng.name}</span>
                      <Select
                        size="sm"
                        value={engRewards[eng.id] || ''}
                        onChange={e => setEngRewards(prev => ({ ...prev, [eng.id]: e.target.value }))}
                        options={[
                          { value: '', label: '-（デフォルト使用）' },
                          ...rewardIds.map(id => ({ value: id, label: `${id} - ${rewardMap[id] ? rewardMap[id].name : ''}` })),
                        ]}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>支払サイト</label>
              <Input size="sm" value={form.paySite || ''} onChange={e => u('paySite', e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>支払特記事項</label>
              <Input size="sm" value={form.payNote || ''} onChange={e => u('payNote', e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>リスト負担</label>
              <Select
                size="sm"
                value={form.listSrc || ''}
                onChange={e => u('listSrc', e.target.value)}
                options={[
                  { value: '', label: '-' },
                  { value: '当社持ち', label: '当社持ち' },
                  { value: '先方持ち', label: '先方持ち' },
                  { value: '両方', label: '両方' },
                ]}
              />
            </div>

            <div>
              <label style={labelStyle}>カレンダー</label>
              <Select
                size="sm"
                value={form.calendar || ''}
                onChange={e => u('calendar', e.target.value)}
                options={[
                  { value: '', label: '-' },
                  { value: 'Google', label: 'Google' },
                  { value: 'Spir', label: 'Spir' },
                  { value: 'Outlook', label: 'Outlook' },
                  { value: 'なし', label: 'なし' },
                  { value: '調整アポ', label: '調整アポ' },
                  { value: 'Google(入力)', label: 'Google(入力)' },
                ]}
              />
            </div>

            <div>
              <label style={labelStyle}>連絡手段</label>
              <Select
                size="sm"
                value={form.contact || ''}
                onChange={e => u('contact', e.target.value)}
                options={[
                  { value: '', label: '-' },
                  { value: 'LINE', label: 'LINE' },
                  { value: 'Slack', label: 'Slack' },
                  { value: 'Chatwork', label: 'Chatwork' },
                  { value: 'メール', label: 'メール' },
                ]}
              />
            </div>

            <div>
              <label style={labelStyle}>メールアドレス</label>
              <Input size="sm" value={form.clientEmail || ''} onChange={e => u('clientEmail', e.target.value)} placeholder="client@example.com" />
            </div>

            {form.contact === 'Slack' && (
              <div>
                <label style={labelStyle}>Slack Webhook URL（アポ報告用）</label>
                <Input size="sm" value={form.slackWebhookUrl || ''} onChange={e => u('slackWebhookUrl', e.target.value)} placeholder="https://hooks.slack.com/services/..." />
              </div>
            )}

            {form.contact === 'Chatwork' && (
              <div>
                <label style={labelStyle}>Chatwork ルームID</label>
                <Input size="sm" value={form.chatworkRoomId || ''} onChange={e => u('chatworkRoomId', e.target.value)} placeholder="123456789" />
              </div>
            )}

            <div>
              <label style={labelStyle}>Slack Webhook URL（社内報告用）</label>
              <Input size="sm" value={form.slackWebhookUrlInternal || ''} onChange={e => u('slackWebhookUrlInternal', e.target.value)} placeholder="https://hooks.slack.com/services/..." />
            </div>

            {(form.calendar === 'Google' || form.calendar === 'Google(入力)') && (
              <div>
                <label style={labelStyle}>Google Calendar ID</label>
                <Input size="sm" value={form.googleCalendarId || ''} onChange={e => u('googleCalendarId', e.target.value)} placeholder="クライアントのGoogleメールアドレス" />
              </div>
            )}

            {(form.calendar === 'Spir' || form.calendar === '調整アポ') && (
              <div>
                <label style={labelStyle}>日程調整URL</label>
                <Input size="sm" value={form.schedulingUrl || ''} onChange={e => u('schedulingUrl', e.target.value)} placeholder="https://app.spir.com/..." />
              </div>
            )}

            {/* 備考: add は初回面談のみ、edit は3つ */}
            {isEdit ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy, borderBottom: `2px solid ${color.navy}`, paddingBottom: 6, marginBottom: 12, marginTop: 4 }}>備考</div>
                <div style={{ marginBottom: space[2] }}>
                  <label style={labelStyle}>初回面談時</label>
                  <textarea value={(form.noteFirst || '').replace(/\\n/g, '\n')} onChange={e => u('noteFirst', e.target.value)} rows={4} style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div style={{ marginBottom: space[2] }}>
                  <label style={labelStyle}>キックオフミーティング時</label>
                  <textarea value={(form.noteKickoff || '').replace(/\\n/g, '\n')} onChange={e => u('noteKickoff', e.target.value)} rows={4} style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div>
                  <label style={labelStyle}>定期ミーティング時</label>
                  <textarea value={(form.noteRegular || '').replace(/\\n/g, '\n')} onChange={e => u('noteRegular', e.target.value)} rows={4} style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
              </div>
            ) : (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>初回面談メモ</label>
                <textarea value={form.noteFirst || ''} onChange={e => u('noteFirst', e.target.value)} rows={4} style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 20px', borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: isEdit ? 'space-between' : 'flex-end' }}>
          {isEdit && (
            <Button variant="danger" size="sm" onClick={onDelete}>削除</Button>
          )}
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button variant="outline" size="sm" onClick={onCancel}>キャンセル</Button>
            <Button variant="primary" size="sm" onClick={handleSaveAll} loading={saving} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
