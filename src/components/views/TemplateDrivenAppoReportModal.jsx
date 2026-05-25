import { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Badge, Select } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  insertAppointment, invokeTranscribeAndExtract,
  invokeLookupCompanyHomepage, invokeGetZoomRecording, updateCallListItem,
} from '../../lib/supabaseWrite';
import {
  resolveApplicableTemplates, renderBody, buildInitialFormValues, buildAiExtractionInstruction,
} from '../../lib/templateRenderer';
import { invokeGenerateCompanyDossier } from '../../lib/dossierApi';
import { getOrgId } from '../../lib/orgContext';
import { supabase } from '../../lib/supabase';

/**
 * テンプレ駆動アポ取得報告モーダル。
 * row(call_list_items), list(call_lists), template(s) を元に schema 駆動で
 * フォームを動的レンダリング、AI添削、HP自動取得、保存まで完結する。
 *
 * Props:
 *   row, list, currentUser, members, clientData, rewardMaster, contactsByClient
 *   templates: 全 active テンプレ (resolveApplicableTemplates で絞り込む)
 *   onClose, onSave, onDone
 *   initialRecordingUrl, onFetchRecordingUrl
 */
export default function TemplateDrivenAppoReportModal({
  row, list, currentUser = '', members = [],
  clientData = [], rewardMaster = [], contactsByClient = {},
  templates = [],
  onClose, onSave, onDone,
  initialRecordingUrl = '', onFetchRecordingUrl,
}) {
  const isMobile = useIsMobile();

  // 適用可能テンプレ + 選択中テンプレ
  const applicable = useMemo(() => resolveApplicableTemplates(templates, list), [templates, list]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(applicable[0]?.id || '');
  const template = useMemo(
    () => applicable.find(t => t.id === selectedTemplateId) || applicable[0] || null,
    [applicable, selectedTemplateId]
  );

  // フォーム初期化（テンプレ切替時に再計算）
  const initialValues = useMemo(() => {
    if (!template) return {};
    return buildInitialFormValues(template, { row, list, currentUser, contactsByClient });
  }, [template, row, list, currentUser, contactsByClient]);

  const [form, setForm] = useState(initialValues);
  useEffect(() => { setForm(initialValues); }, [initialValues]);
  const set = (key, value) => setForm(p => ({ ...p, [key]: value }));

  // 録音URL + 状態
  const [recordingUrl, setRecordingUrl] = useState(initialRecordingUrl);
  const [recLoading, setRecLoading] = useState(false);
  // キーマン携帯番号から録音検索（既存番号があれば自動展開）
  const [keymanMobileInput, setKeymanMobileInput] = useState(row?.keyman_mobile || '');
  const [keymanLookupStep, setKeymanLookupStep] = useState('idle'); // 'idle' | 'fetching' | 'done' | 'error'
  const [showKeymanLookup, setShowKeymanLookup] = useState(!!row?.keyman_mobile);
  const recFetchedRef = useRef(false);
  useEffect(() => {
    if (recFetchedRef.current) return;
    recFetchedRef.current = true;
    (async () => {
      if (!onFetchRecordingUrl) return;
      setRecLoading(true);
      try {
        const url = await onFetchRecordingUrl();
        if (url) setRecordingUrl(url);
      } catch (e) { console.warn('[TemplateModal] 録音URL取得失敗:', e); }
      finally { setRecLoading(false); }
    })();
  }, [onFetchRecordingUrl]);

  // AI 添削
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const handleAiExtract = async () => {
    if (!template) return;
    if (!recordingUrl) { setAiError('録音URLが未取得です'); return; }
    setAiLoading(true);
    setAiError(null);
    try {
      const extractFields = (template.schema || []).filter(f => f.ai_extract).map(f => ({
        key: f.key, label: f.label, options: f.options || [],
      }));
      if (extractFields.length === 0) { setAiError('このテンプレにAI抽出対象フィールドがありません'); setAiLoading(false); return; }
      const ai_prompt = template.ai_prompt || '';
      const { extracted, transcript, publicRecordingUrl } = await invokeTranscribeAndExtract({
        recording_url: recordingUrl,
        item_id: row?._supaId || row?.id,
        ai_prompt, extract_fields: extractFields,
      });
      // 抽出結果をフォームへマージ（既存値は維持、空の場合のみ上書き）
      setForm(prev => {
        const next = { ...prev };
        for (const k of Object.keys(extracted || {})) {
          const v = extracted[k];
          if (v && !next[k]) next[k] = v;
        }
        return next;
      });
      if (publicRecordingUrl && !recordingUrl.includes('supabase')) setRecordingUrl(publicRecordingUrl);
      // recordingUrl フィールドが schema にあれば自動入力
      if (template.schema?.some(f => f.key === 'recordingUrl') && publicRecordingUrl) {
        setForm(prev => ({ ...prev, recordingUrl: publicRecordingUrl }));
      }
    } catch (e) {
      console.warn('[TemplateModal] AI抽出失敗:', e);
      setAiError(e?.message || '抽出に失敗しました');
    } finally {
      setAiLoading(false);
    }
  };

  // キーマン携帯番号から Zoom 録音を検索
  const handleLookupKeyman = async () => {
    if (keymanLookupStep !== 'idle') return;
    const raw = (keymanMobileInput || '').replace(/[^\d+]/g, '');
    if (!raw) { setKeymanLookupStep('error'); setTimeout(() => setKeymanLookupStep('idle'), 3000); return; }
    setKeymanLookupStep('fetching');
    try {
      const getterName = form.acquirer || currentUser;
      const member = (members || []).find(m => (typeof m === 'string' ? m : m.name) === getterName);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
      if (!zoomUserId) { setKeymanLookupStep('error'); setTimeout(() => setKeymanLookupStep('idle'), 4000); return; }
      const { data, error } = await invokeGetZoomRecording({
        zoom_user_id: zoomUserId, callee_phone: raw, called_at: null, prev_called_at: null,
      });
      if (error || !data?.recording_url) { setKeymanLookupStep('error'); setTimeout(() => setKeymanLookupStep('idle'), 4000); return; }
      setRecordingUrl(data.recording_url);
      // recordingUrl フィールドが schema にあれば自動入力
      if (template?.schema?.some(f => f.key === 'recordingUrl')) {
        setForm(prev => ({ ...prev, recordingUrl: data.recording_url }));
      }
      // item の keyman_mobile を保存（次回以降の自動検索のため）
      if (row?._supaId || row?.id) {
        try { await updateCallListItem(row._supaId || row.id, { keyman_mobile: raw }); }
        catch (e) { console.warn('[TemplateModal] updateCallListItem error:', e); }
      }
      setKeymanLookupStep('done');
      setTimeout(() => setKeymanLookupStep('idle'), 3000);
    } catch (e) {
      console.error('[TemplateModal] keyman lookup error:', e);
      setKeymanLookupStep('error');
      setTimeout(() => setKeymanLookupStep('idle'), 4000);
    }
  };

  // HP 取得
  const [hpLoadingKey, setHpLoadingKey] = useState(null);
  const handleFetchHp = async (key) => {
    setHpLoadingKey(key);
    try {
      const { url, confidence, reason } = await invokeLookupCompanyHomepage({
        company_name: row?.company || '',
        address: row?.address || '',
        representative: row?.representative || '',
      });
      if (url) {
        set(key, url);
      } else {
        setAiError(`HP取得失敗: ${reason || '不明'}`);
      }
    } catch (e) {
      setAiError('HP取得に失敗しました');
    } finally {
      setHpLoadingKey(null);
    }
  };

  // 保存
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!template) return;
    // 必須チェック
    for (const f of template.schema || []) {
      if (f.required) {
        if (!form[f.key]) {
          setAiError(`「${f.label}」は必須です`);
          return;
        }
      }
    }
    setAiError(null);
    setSaving(true);
    try {
      // body 生成（{{company_name}} などにも対応するため company_name 等の特殊キーを含める）
      const renderData = {
        ...form,
        company_name: row?.company || form.company_name || '',
      };
      const reportNote = renderBody(template.body_template, renderData);

      // クライアント情報（売上計算用）
      const clientInfo = (clientData || []).find(c => c.company === list?.company);
      // クライアント × タイプ単位の報酬体系を引く（一本化後）。
      // 設定がなければ報酬計算なし（クライアント開拓など売上対象外を含む）。
      let rewardType = '';
      if (clientInfo?._supaId && list?.engagement_id) {
        const { data: setting } = await supabase
          .from('client_engagement_reward_settings')
          .select('reward_type')
          .eq('client_id', clientInfo._supaId)
          .eq('engagement_id', list.engagement_id)
          .maybeSingle();
        if (setting?.reward_type) rewardType = setting.reward_type;
      }
      const rewardRows = rewardType ? (rewardMaster || []).filter(r => r.id === rewardType) : [];
      const isFixed = rewardRows.length > 0 && rewardRows[0].basis === '-';
      const initialOurSales = (() => {
        if (!rewardRows.length) return 0;
        const applyTax = p => rewardRows[0].tax === '税別' ? Math.round(p * 1.1) : p;
        if (isFixed) return applyTax(rewardRows[0].price);
        const basis = rewardRows[0].basis;
        const amount = basis === '売上高'
          ? (row?.revenue    != null ? row.revenue    * 1000 : null)
          : (row?.net_income != null ? row.net_income * 1000 : null);
        if (amount === null) return 0;
        const match = rewardRows.find(r => amount >= r.lo && amount < r.hi);
        return match ? applyTax(match.price) : 0;
      })();
      const salesVal  = parseInt(form.ourSales) || initialOurSales || 0;
      const acquirerName = form.acquirer || currentUser;
      const acquirerMember = members.find(m => (typeof m === 'string' ? m : (m.name || '')) === acquirerName);
      const acquirerRate = parseFloat(acquirerMember?.rate ?? acquirerMember?.incentive_rate ?? 0) || 0;
      const rewardVal = isFixed ? salesVal : (salesVal && acquirerRate ? Math.round(salesVal * acquirerRate) : 0);

      const { result: insResult, error: insError } = await insertAppointment({
        company: row?.company || '',
        client:  list?.company || '',
        meetDate: form.appoDate || form.hearing_date || null,
        getDate:  form.getDate || form.hearing_date || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
        getter:   acquirerName,
        appoReport: reportNote,
        status:   list?.is_prospecting ? '事前確認済' : 'アポ取得',
        sales:    salesVal,
        reward:   rewardVal,
        list_id:  list?._supaId || null,
        item_id:  row?._supaId || row?.id || null,
        phone:    row?.phone || form.phone || null,
        recording_url: form.recordingUrl || recordingUrl || null,
        meetTime: form.appoTime || null,
        meetLocation: form.visitLocation || null,
        isOnline: form.meeting_format === 'オンライン' || form.meeting_format === 'Web',
        reportTemplateIdSnapshot: template.id,
        reportData: form,
      });
      if (insError) throw insError;

      // #アポ取得報告チャンネルへSlack即時投稿（LegacyAppoReportModalと同等）
      try {
        const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
        const anonKeyEnv     = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const slackRes = await fetch(`${supabaseUrlEnv}/functions/v1/post-appo-to-slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKeyEnv },
          body: JSON.stringify({ text: reportNote }),
        });
        if (!slackRes.ok) console.warn('[TemplateModal] post-appo-to-slack failed:', slackRes.status);
      } catch (e) { console.warn('[TemplateModal] post-appo-to-slack error:', e); }

      // 企業ドシエ非同期生成
      if (insResult?.id) {
        invokeGenerateCompanyDossier({ appointment_id: insResult.id, org_id: getOrgId() }).catch(() => {});
      }

      onSave?.({
        company: row?.company || '',
        client:  list?.company || '',
        getter:  acquirerName,
        getDate: form.getDate,
        meetDate: form.appoDate,
        appoReport: reportNote,
        status:  list?.is_prospecting ? '事前確認済' : 'アポ取得',
        sales:   salesVal,
        reward:  rewardVal,
        month:   form.appoDate ? (parseInt(form.appoDate.slice(5, 7), 10) + '月') : '',
        _supaId: insResult?.id || null,
      });
      onDone?.();
      onClose?.();
    } catch (e) {
      console.error('[TemplateModal] 保存失敗:', e);
      setAiError(e?.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!template) {
    return null;
  }

  // visible_when 解釈
  const visibleFields = (template.schema || []).filter(f => {
    if (!f.visible_when) return true;
    return form[f.visible_when.field] === f.visible_when.equals;
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: alpha('#000', 0.5), zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        background: color.white, borderRadius: isMobile ? 0 : radius.md,
        width: isMobile ? '100vw' : 600, maxWidth: isMobile ? 'none' : undefined,
        height: isMobile ? '100vh' : 'auto', maxHeight: isMobile ? '100vh' : '92vh',
        display: 'flex', flexDirection: 'column', boxShadow: shadow.xl,
      }}>
        {/* ヘッダー */}
        <div style={{ padding: `${space[3]}px ${space[5]}px`, background: color.navy, color: color.white, borderRadius: `${radius.md}px ${radius.md}px 0 0`, flexShrink: 0 }}>
          <div style={{ fontSize: font.size.md + 1, fontWeight: font.weight.semibold }}>アポ取得報告</div>
          <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.7), marginTop: 2 }}>{row?.company || ''}</div>
        </div>

        {/* テンプレ選択（複数applicable のとき） */}
        <div style={{ padding: `${space[2]}px ${space[5]}px`, background: color.cream, borderBottom: `1px solid ${color.border}`, display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid }}>テンプレ:</span>
          {applicable.length > 1 ? (
            <Select
              size="sm"
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              options={applicable.map(t => ({ value: t.id, label: `${t.name} (${t.scope_level})` }))}
            />
          ) : (
            <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{template.name}</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: color.textLight }}>
            scope: {template.scope_level}
          </span>
        </div>

        {/* AI 添削 + 録音状態 + キーマン携帯（控えめなディスクロージャ） */}
        <div style={{ padding: `${space[3]}px ${space[5]}px`, background: color.offWhite, borderBottom: `1px solid ${color.border}`, display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAiExtract}
              loading={aiLoading}
              disabled={aiLoading || !recordingUrl}
            >
              {aiLoading ? '抽出中…' : '文字起こし＋AI添削'}
            </Button>
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              {recLoading ? '録音URL取得中…' : (recordingUrl ? '録音準備OK' : '録音URL未取得')}
            </span>
            <button
              type="button"
              onClick={() => setShowKeymanLookup(v => !v)}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                color: color.navy, cursor: 'pointer',
                fontSize: font.size.xs, fontFamily: font.family.sans,
                textDecoration: 'underline', padding: 0,
              }}
            >{showKeymanLookup ? '▲ 閉じる' : '▼ キーマン携帯から録音検索'}</button>
            {aiError && <span style={{ fontSize: font.size.xs, color: color.danger, marginLeft: 'auto' }}>{aiError}</span>}
          </div>
          {showKeymanLookup && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingLeft: space[2] }}>
              <span style={{ fontSize: 10, color: color.textLight, whiteSpace: 'nowrap' }}>携帯番号</span>
              <input
                type="tel"
                value={keymanMobileInput}
                onChange={e => setKeymanMobileInput(e.target.value)}
                placeholder="例: 09012345678"
                style={{ flex: 1, minWidth: 140, padding: '3px 8px', borderRadius: radius.sm, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.mono, outline: 'none', background: color.white }}
              />
              <Button
                variant="outline" size="sm"
                onClick={handleLookupKeyman}
                disabled={keymanLookupStep !== 'idle' || !keymanMobileInput.trim()}>
                {keymanLookupStep === 'fetching' && '検索中…'}
                {keymanLookupStep === 'done'     && '取得完了'}
                {keymanLookupStep === 'error'    && '見つかりませんでした'}
                {keymanLookupStep === 'idle'     && '録音を取得'}
              </Button>
            </div>
          )}
        </div>

        {/* 動的フォーム */}
        <div style={{ padding: `${space[4]}px ${space[5]}px`, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: space[3] }}>
            {visibleFields.map(field => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={form[field.key] ?? ''}
                onChange={(v) => set(field.key, v)}
                onFetchHp={() => handleFetchHp(field.key)}
                hpLoading={hpLoadingKey === field.key}
              />
            ))}
          </div>
        </div>

        {/* フッター */}
        <div style={{ padding: `${space[3]}px ${space[5]}px`, borderTop: `1px solid ${color.border}`, display: 'flex', gap: space[2], background: color.white, borderRadius: `0 0 ${radius.md}px ${radius.md}px`, flexShrink: 0 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>キャンセル</Button>
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange, onFetchHp, hpLoading }) {
  const isFullWidth = field.type === 'textarea';
  const hasAutoFetch = field.auto_fetch === 'homepage_url';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: isFullWidth ? '1 / -1' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>
          {field.label}{field.required && <span style={{ color: color.danger }}> *</span>}
        </label>
        {field.ai_extract && <Badge variant="info">AI抽出</Badge>}
        {field.auto_fill && <Badge variant="neutral">自動入力</Badge>}
        {hasAutoFetch && (
          <button
            type="button"
            onClick={onFetchHp}
            disabled={hpLoading}
            style={{
              marginLeft: 'auto', padding: '2px 8px', fontSize: 10, borderRadius: radius.sm,
              border: `1px solid ${color.border}`, background: color.white, color: color.navy,
              cursor: hpLoading ? 'wait' : 'pointer', fontFamily: font.family.sans,
            }}
          >{hpLoading ? '取得中…' : 'HP取得'}</button>
        )}
      </div>
      {renderInputByType(field, value, onChange)}
    </div>
  );
}

function renderInputByType(field, value, onChange) {
  const baseStyle = {
    width: '100%', padding: '6px 10px', borderRadius: radius.md,
    border: `1px solid ${color.border}`, fontSize: font.size.sm,
    fontFamily: field.type === 'number' ? font.family.mono : font.family.sans,
    outline: 'none', background: color.white, color: color.textDark,
    boxSizing: 'border-box',
  };
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          style={{ ...baseStyle, minHeight: 60, resize: 'vertical' }}
        />
      );
    case 'select':
      return (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={baseStyle}
        >
          <option value="">— 選択 —</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'number':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          style={baseStyle}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={baseStyle}
        />
      );
    case 'boolean':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.sm, color: color.textDark }}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
          <span>{field.label}</span>
        </label>
      );
    case 'text':
    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          style={baseStyle}
        />
      );
  }
}
