import { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Badge, Select } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { applyTaxIfPretax } from '../../utils/money';
import {
  insertAppointment, invokeTranscribeAndExtract,
  invokeLookupCompanyHomepage, invokeGetZoomRecording, updateCallListItem,
  ensureProspectingClient, createGcalEvent, updateAppointmentMeta,
  fetchZoomUserId, invokeAppoAiReport,
} from '../../lib/supabaseWrite';
import {
  resolveApplicableTemplates, renderBody, buildInitialFormValues, buildAiExtractionInstruction,
  formatJpAmountFromThousand,
} from '../../lib/templateRenderer';
import { fetchCompanyMasterByName } from '../../lib/companyMasterApi';
import { invokeGenerateCompanyDossier } from '../../lib/dossierApi';
import { getOrgId } from '../../lib/orgContext';
import { supabase } from '../../lib/supabase';
import { resolveActiveRewardType, fetchPastDoneCount } from '../../lib/rewardResolver';

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
  // 当社売上の手動編集フラグ。ユーザーが ourSales を触ったら自動計算で上書きしない
  const [ourSalesEdited, setOurSalesEdited] = useState(false);
  // テンプレ切替時のみ初期化。initialValues は親の再レンダリングで毎回新参照になり
  // form リセットを引き起こすため、template.id の変化のみで判定する。
  // （ユーザーが入力中・AI添削中に initialValues 参照変更で消える事故への対策）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(initialValues); setOurSalesEdited(false); }, [template?.id]);
  const set = (key, value) => {
    if (key === 'ourSales') setOurSalesEdited(true);
    setForm(p => ({ ...p, [key]: value }));
  };

  // クライアント×タイプの報酬体系を購読 (当社売上の onChange 自動計算用)
  // intro 切替 (例: 1〜3 件目は固定、4 件目以降は売上連動) にも対応。
  const [rewardRows, setRewardRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clientInfo = (clientData || []).find(c => c.company === list?.company);
      if (!clientInfo?._supaId || !list?.engagement_id) { if (!cancelled) setRewardRows([]); return; }
      const { data: setting } = await supabase
        .from('client_engagement_reward_settings')
        .select('reward_type, intro_count, intro_reward_type')
        .eq('client_id', clientInfo._supaId)
        .eq('engagement_id', list.engagement_id)
        .maybeSingle();
      if (cancelled) return;
      if (!setting) { setRewardRows([]); return; }
      // intro 期間内かどうかは status='面談済' の累計件数で判定する
      const pastDone = (Number(setting.intro_count) || 0) > 0
        ? await fetchPastDoneCount(clientInfo._supaId, list.engagement_id)
        : 0;
      if (cancelled) return;
      const activeTypeId = resolveActiveRewardType(setting, pastDone);
      setRewardRows(activeTypeId ? (rewardMaster || []).filter(r => r.id === activeTypeId) : []);
    })();
    return () => { cancelled = true; };
  }, [list?.engagement_id, list?.company, clientData, rewardMaster]);

  // 日本語金額テキスト ("5.0億円" "3000万円" "120,000千" 等) を円に変換
  const parseJpAmount = (str) => {
    if (!str) return null;
    const s = String(str)
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[,，\s]/g, '');
    let m;
    if ((m = s.match(/^([0-9.]+)億([0-9.]+)?万?/))) return Math.round(parseFloat(m[1]) * 1e8 + (m[2] ? parseFloat(m[2]) * 1e4 : 0));
    if ((m = s.match(/^([0-9.]+)千万/))) return Math.round(parseFloat(m[1]) * 1e7);
    if ((m = s.match(/^([0-9.]+)万/))) return Math.round(parseFloat(m[1]) * 1e4);
    if ((m = s.match(/^([0-9.]+)千/))) return Math.round(parseFloat(m[1]) * 1e3);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  // 件数連動型 (basis='アポ件数') 用: 当月の同getter+同クライアントの既存アポ件数
  const [priorApoCount, setPriorApoCount] = useState(null);
  const acquirerNameForCount = form.acquirer || currentUser;
  useEffect(() => {
    if (!rewardRows.length) return;
    const basis = rewardRows[0].basis;
    if (basis !== 'アポ件数' && basis !== '累計アポ件数') return;
    if (!acquirerNameForCount || !list?._supaId) return;
    // 当月 YYYY-MM (JST)
    const ym = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
    const monthStart = ym + '-01';
    const [y, m] = ym.split('-').map(Number);
    const monthEndDay = new Date(y, m, 0).getDate();
    const monthEnd = ym + '-' + String(monthEndDay).padStart(2, '0');
    let cancelled = false;
    (async () => {
      const { count, error } = await (await import('../../lib/supabase')).supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('list_id', list._supaId)
        .eq('getter_name', acquirerNameForCount)
        .gte('appointment_date', monthStart)
        .lte('appointment_date', monthEnd);
      if (cancelled) return;
      if (error) { console.warn('[appo-count] fetch error:', error); return; }
      setPriorApoCount(count || 0);
    })();
    return () => { cancelled = true; };
  }, [rewardRows, acquirerNameForCount, list?._supaId]);

  // 当社売上を rewardRows + salesAmount/netIncome から自動計算
  // 旧 AppoReportModal の computeOurSales 相当。手動編集後は上書きしない。
  useEffect(() => {
    if (ourSalesEdited) return;
    if (!rewardRows.length) return;
    const applyTax = p => applyTaxIfPretax(p, rewardRows[0].tax);
    const basis = rewardRows[0].basis;
    let computed = null;
    if (basis === '-') {
      computed = applyTax(rewardRows[0].price);
    } else if (basis === 'アポ件数' || basis === '累計アポ件数') {
      // 件数連動: 当月既存件数 + 1 (今登録するアポ自身) で tier 判定
      if (priorApoCount == null) return;
      const nextCount = priorApoCount + 1;
      const match = rewardRows.find(r => nextCount >= r.lo && nextCount < r.hi);
      if (match) computed = applyTax(match.price);
    } else {
      // テキスト入力 ("5.0億円" 等) を優先、無ければマスタの revenue/net_income (千円) を円換算
      const salesYen = parseJpAmount(form.salesAmount) ?? (row?.revenue != null ? row.revenue * 1000 : null);
      const netYen   = parseJpAmount(form.netIncome)   ?? (row?.net_income != null ? row.net_income * 1000 : null);
      const amount = basis === '売上高' ? salesYen : netYen;
      if (amount == null) return;
      const match = rewardRows.find(r => amount >= r.lo && amount < r.hi);
      if (match) computed = applyTax(match.price);
    }
    if (computed != null) {
      const next = String(computed);
      setForm(prev => prev.ourSales === next ? prev : { ...prev, ourSales: next });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.salesAmount, form.netIncome, rewardRows, row?.revenue, row?.net_income, ourSalesEdited, priorApoCount]);

  // 録音URL + 状態
  const [recordingUrl, setRecordingUrl] = useState(initialRecordingUrl);
  const [recLoading, setRecLoading] = useState(false);
  // 録音URL 手動再取得（FieldRenderer の「再取得」ボタンから呼ぶ）
  const handleRefetchRecording = async () => {
    if (!onFetchRecordingUrl || recLoading) return;
    setRecLoading(true);
    try {
      const url = await onFetchRecordingUrl();
      if (url) {
        setRecordingUrl(url);
        if (template?.schema?.some(f => f.key === 'recordingUrl')) {
          setForm(prev => ({ ...prev, recordingUrl: url }));
        }
      }
    } catch (e) { console.warn('[TemplateModal] 録音URL再取得失敗:', e); }
    finally { setRecLoading(false); }
  };
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
        if (url) {
          setRecordingUrl(url);
          if (template?.schema?.some(f => f.key === 'recordingUrl')) {
            setForm(prev => ({ ...prev, recordingUrl: url }));
          }
        }
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
      const { extracted, transcript, publicRecordingUrl, keyman_ma_intent } = await invokeTranscribeAndExtract({
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
        // keyman_ma_intent は AI 判定結果を常に保持（保存時に insertAppointment へ渡す）
        if (keyman_ma_intent) next.keymanMaIntent = keyman_ma_intent;
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

  // テンプレ切替時 / 画面オープン時、auto_fetch='homepage_url' のフィールドが
  // 空なら裏で自動取得。アポインターが HP取得ボタンを押し忘れても URL が入る。
  useEffect(() => {
    if (!template?.schema || !row?.company) return;
    const hpField = template.schema.find(f => f.auto_fetch === 'homepage_url');
    if (!hpField) return;
    if (form[hpField.key]) return;
    let cancelled = false;
    setHpLoadingKey(hpField.key);
    invokeLookupCompanyHomepage({
      company_name: row.company,
      address: row.address || '',
      representative: row.representative || '',
    }).then(({ url }) => {
      if (cancelled || !url) return;
      setForm(p => (p[hpField.key] ? p : { ...p, [hpField.key]: url }));
    }).catch(() => {})
      .finally(() => { if (!cancelled) setHpLoadingKey(null); });
    return () => { cancelled = true; };
    // 既存値がある状態で form を依存に入れると無限ループするので template/company だけで発火
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, row?.company]);

  // 売上高 / 当期純利益が架電リスト側で空のとき、自社 company_master (約49万社/TSR)
  // から会社名 + 補助情報 (電話/代表者/住所) で 1 社に特定して自動補完する。
  // 同名異会社のリスクを避けるため、補助情報で一意に絞れない場合 (ambiguous) は
  // 自動入力をスキップし、アポインターに手動入力させる。
  useEffect(() => {
    if (!template?.schema || !row?.company) return;
    const salesField = template.schema.find(f => f.auto_fill === 'sales_thousand');
    const netField = template.schema.find(f => f.auto_fill === 'net_income_thousand');
    if (!salesField && !netField) return;
    const needSales = salesField && !form[salesField.key] && (row.revenue == null);
    const needNet = netField && !form[netField.key] && (row.net_income == null);
    if (!needSales && !needNet) return;
    let cancelled = false;
    fetchCompanyMasterByName({
      company_name: row.company,
      representative: row.representative,
      phone: row.phone,
      address: row.address,
    }).then(({ match, confidence, candidates }) => {
      if (cancelled) return;
      if (!match) {
        if (confidence === 'ambiguous') {
          console.info(`[appo-report] 財務自動補完スキップ: 同名候補${candidates}件、補助情報で絞り込めず`);
        }
        return;
      }
      setForm(p => {
        const next = { ...p };
        if (needSales && match.revenue_k != null && !next[salesField.key]) {
          next[salesField.key] = formatJpAmountFromThousand(match.revenue_k);
        }
        if (needNet && match.net_income_k != null && !next[netField.key]) {
          next[netField.key] = formatJpAmountFromThousand(match.net_income_k);
        }
        return next;
      });
      console.info(`[appo-report] 財務自動補完: confidence=${confidence}`);
    }).catch(() => {});
    return () => { cancelled = true; };
    // form を依存に入れると無限ループ。template/company の変化のみで発火する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, row?.company]);

  // 保存
  const [saving, setSaving] = useState(false);
  // 二重押下の最終防御: saving state の非同期更新を待たず、useRef で同期的にロック。
  // (saving state は描画後に true になるため、ミリ秒単位の連打を素通ししてしまう)
  const savingRef = useRef(false);
  const handleSave = async () => {
    if (savingRef.current) return;
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
    savingRef.current = true;
    setAiError(null);
    setSaving(true);
    try {
      // body 生成（{{company_name}} などにも対応するため company_name 等の特殊キーを含める）
      // recordingUrl は form と useState の二系統で保持しているため、ここで両方から取り出す
      // （schema に recordingUrl が無いテンプレでも、useState 側に値があれば反映される）
      // ourSales は ¥ + カンマ区切り表記で本文に展開（旧 AppoReportModal と同じ運用）
      const ourSalesRaw = form.ourSales;
      const ourSalesDisplay = (ourSalesRaw != null && String(ourSalesRaw).trim() !== '')
        ? '¥' + Number(ourSalesRaw).toLocaleString()
        : '';
      const renderData = {
        ...form,
        company_name: row?.company || form.company_name || '',
        recordingUrl: form.recordingUrl || recordingUrl || '',
        // form.acquirer が空（モーダル初期化時に currentUser がまだ届いてなかった等）でも、
        // 必ず currentUser をフォールバックに使う
        acquirer: form.acquirer || currentUser || '',
        ourSales: ourSalesDisplay,
      };
      const reportNote = renderBody(template.body_template, renderData, template.schema);

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
      // basis === '-' は「売上/利益基準ではない固定単価」(当社売上計算用フラグ)
      // calc_type === 'fixed_per_appo' は「アポ1件あたり完全定額で個別レート計算しない」(インターン報酬計算用フラグ)
      // 旧 AppoReportModal はこの2つを区別していたが新モーダルで isFixed 一本にしていたため、
      // ブティックス (basis='-', calc_type='rate') で intern_reward が誤って sales そのまま入る事故が発生
      const isFixed = rewardRows.length > 0 && rewardRows[0].basis === '-';
      const isFixedPerAppo = rewardRows.length > 0 && rewardRows[0].calc_type === 'fixed_per_appo';
      const initialOurSales = (() => {
        if (!rewardRows.length) return 0;
        const applyTax = p => applyTaxIfPretax(p, rewardRows[0].tax);
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
      const rewardVal = isFixedPerAppo ? salesVal : (salesVal && acquirerRate ? Math.round(salesVal * acquirerRate) : 0);

      // 軸①（クライアント開拓ではない）でクライアントの reward_settings が未登録の場合に確認
      // LGアセット事例（IFAクライアント開拓で報酬未登録 → sales=0 で保存事故）の予防
      if (!list?.is_prospecting && rewardRows.length === 0) {
        const proceed = window.confirm(
          `このクライアント（${list?.company || ''}）の業務種別「${list?.engagement_id ? '該当タイプ' : ''}」に報酬体系が登録されていません。\n\nこのまま保存すると当社売上・インターン報酬が ¥0 で記録されます。\n\nそれでも保存しますか？\n（CRM のクライアント編集モーダルで報酬体系を登録してから保存し直すのが推奨）`
        );
        if (!proceed) { savingRef.current = false; setSaving(false); return; }
      }

      // クライアント開拓 (is_prospecting) のみ:
      // ① CRM clients テーブルへ upsert（面談予定として現れるようにする）
      // ② 篠宮 Google カレンダーへイベント作成 → gcalEventId を appointments に紐付け
      // 旧 QuickAppoModal にしか実装されておらず TemplateDrivenAppoReportModal
      // 経由ではクライアント開拓のアポが CRM/GCal に飛ばない事故への対応。
      let gcalEventId = null;
      if (list?.is_prospecting) {
        try {
          // engagementId は渡さない: clients は営業代行(seller_sourcing)に集約。
          // 商材区分は call_lists.engagement_id 側で保持する。
          await ensureProspectingClient({
            name: row?.company || '',
            industry: list?.type || list?.list_type || '',
            contactPerson: form.contactName || '',
            contactEmail: form.email || '',
            contactPhone: row?.phone || form.phone || '',
            nextContactAt: form.appoDate && form.appoTime
              ? `${form.appoDate}T${form.appoTime}:00+09:00`
              : null,
          });
        } catch (e) { console.warn('[TemplateModal] ensureProspectingClient failed:', e); }

        if (form.appoDate && form.appoTime) {
          try {
            const startISO = `${form.appoDate}T${form.appoTime}:00+09:00`;
            // デフォルト30分枠
            const endISO   = new Date(new Date(startISO).getTime() + 30 * 60 * 1000).toISOString();
            const summary  = `${form.contactName || ''}様 ${row?.company || ''}`.trim();
            const description = [
              `面談場所: ${form.visitLocation || form.meeting_format || ''}`,
              `アポ取得者: ${acquirerName}`,
              form.contactName ? `担当者: ${form.contactName}様` : null,
              form.email ? `メール: ${form.email}` : null,
              (row?.phone || form.phone) ? `電話: ${row?.phone || form.phone}` : null,
            ].filter(Boolean).join('\n');
            const { eventId } = await createGcalEvent({
              summary, description, startISO, endISO,
              location: form.visitLocation || form.meeting_format || '',
            });
            gcalEventId = eventId;
          } catch (e) { console.warn('[TemplateModal] createGcalEvent failed:', e); }
        }
      }

      // テンプレが独自フィールド (meeting_datetime / meetingDate 等) に「6月2日 火曜日 19時〜」
      // のような自由テキストで面談日時を入れているケース (ブティックス専用テンプレ 等)、
      // それを parse して meetDate/meetTime に紐付ける。これがないと DB の meeting_date 列が null になる。
      const customMeetText = form.meeting_datetime || form.meetingDate || '';
      const parsedMeet = (() => {
        const out = { date: null, time: null };
        if (!customMeetText) return out;
        const s = String(customMeetText).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2}).*?(\d{1,2})[時:](\d{0,2})/);
        if (m) { out.date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; out.time = `${String(m[4]).padStart(2,'0')}:${String(m[5]||'00').padStart(2,'0')}`; return out; }
        m = s.match(/(\d{1,2})月\s*(\d{1,2})日.*?(\d{1,2})[時:](\d{0,2})/);
        if (m) {
          const today = new Date();
          let year = today.getFullYear();
          const month = parseInt(m[1]); const day = parseInt(m[2]);
          if (new Date(year, month - 1, day).getTime() < today.getTime() - 86400000) year++;
          out.date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          out.time = `${String(m[3]).padStart(2,'0')}:${String(m[4]||'00').padStart(2,'0')}`;
          return out;
        }
        m = s.match(/(\d{1,2})月\s*(\d{1,2})日/);
        if (m) {
          const today = new Date();
          let year = today.getFullYear();
          const month = parseInt(m[1]); const day = parseInt(m[2]);
          if (new Date(year, month - 1, day).getTime() < today.getTime() - 86400000) year++;
          out.date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }
        return out;
      })();

      const { result: insResult, error: insError } = await insertAppointment({
        company: row?.company || '',
        client:  list?.company || '',
        meetDate: form.appoDate || form.hearing_date || parsedMeet.date || null,
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
        keymanMaIntent: form.keymanMaIntent || null,
        reportStyle: form.reportStyle || null,
        reportSupplement: form.reportSupplement || null,
        meetTime: form.appoTime || parsedMeet.time || null,
        meetLocation: form.visitLocation || null,
        isOnline: form.meeting_format === 'オンライン' || form.meeting_format === 'Web',
        reportTemplateIdSnapshot: template.id,
        reportData: form,
        gcalEventId,
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

      // 保存時の自動AI添削 fire-and-forget
      // 録音URLが取得済み & AI抽出対象フィールドが全部空 のときだけ自動で
      // transcribe-and-extract を実行し、結果を appointments に書き戻す。
      // アポインターが「文字起こし+AI添削」ボタンを押し忘れても自動で添削される。
      const effectiveRecordingUrl = form.recordingUrl || recordingUrl;
      if (insResult?.id && effectiveRecordingUrl) {
        const aiTargetFields = (template.schema || [])
          .filter(f => f.ai_extract)
          .map(f => ({ key: f.key, label: f.label, options: f.options || [] }));
        const allEmpty = aiTargetFields.length > 0 && aiTargetFields.every(f => !form[f.key]);
        if (allEmpty) {
          (async () => {
            try {
              const { extracted, keyman_ma_intent, publicRecordingUrl } = await invokeTranscribeAndExtract({
                recording_url: effectiveRecordingUrl,
                item_id: row?._supaId || row?.id,
                ai_prompt: template.ai_prompt || '',
                extract_fields: aiTargetFields,
              });
              if (!extracted) return;
              const merged = { ...form };
              for (const k of Object.keys(extracted)) {
                if (extracted[k]) merged[k] = extracted[k];
              }
              if (keyman_ma_intent) merged.keymanMaIntent = keyman_ma_intent;
              const finalRecUrl = publicRecordingUrl || effectiveRecordingUrl;
              merged.recordingUrl = finalRecUrl;
              const ourSalesDisp = (merged.ourSales != null && String(merged.ourSales).trim() !== '')
                ? '¥' + Number(merged.ourSales).toLocaleString() : '';
              const newReportNote = renderBody(template.body_template, {
                ...merged,
                company_name: row?.company || '',
                recordingUrl: finalRecUrl,
                acquirer: merged.acquirer || currentUser || '',
                ourSales: ourSalesDisp,
              }, template.schema);
              await supabase.from('appointments').update({
                report_data: merged,
                appo_report: newReportNote,
                recording_url: finalRecUrl,
                keyman_ma_intent: keyman_ma_intent || null,
              }).eq('id', insResult.id);
              console.info('[TemplateModal] 自動AI添削 完了:', insResult.id);
            } catch (e) {
              console.warn('[TemplateModal] 自動AI添削 失敗:', e);
            }
          })();
        }
      }

      // appo-ai-report (Zoom録音→Claude強化レポート) を fire-and-forget で呼ぶ
      // 旧 AppoReportModal で呼ばれていたが新モーダルでは抜けていた経路を復活
      try {
        const zoomUserId = await fetchZoomUserId(currentUser);
        invokeAppoAiReport({
          zoom_user_id: zoomUserId,
          callee_phone: row?.phone || form.phone || null,
          report_text: reportNote,
          company_name: row?.company || '',
          client_name: list?.company || '',
        }).catch(e => console.warn('[TemplateModal] appo-ai-report failed:', e));
      } catch (e) { console.warn('[TemplateModal] fetchZoomUserId failed:', e); }

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
      // DB trigger からの重複保存防止エラーを分かりやすく
      const msg = String(e?.message || '');
      if (msg.includes('重複保存防止')) {
        setAiError('同じリスト・同じ企業・同じアポ日のアポが既に登録されています。既存アポを編集してください。');
      } else {
        setAiError(msg || '保存に失敗しました');
      }
    } finally {
      savingRef.current = false;
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
                onRefetchRecording={field.key === 'recordingUrl' ? handleRefetchRecording : undefined}
                recordingRefetching={field.key === 'recordingUrl' ? recLoading : false}
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

function FieldRenderer({ field, value, onChange, onFetchHp, hpLoading, onRefetchRecording, recordingRefetching }) {
  const isFullWidth = field.type === 'textarea' || field.key === 'recordingUrl';
  const hasAutoFetch = field.auto_fetch === 'homepage_url';
  const isRecording = field.key === 'recordingUrl';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: isFullWidth ? '1 / -1' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>
          {field.label}{field.required && <span style={{ color: color.danger }}> *</span>}
        </label>
        {field.ai_extract && <Badge variant="info">AI抽出</Badge>}
        {field.auto_fill && <Badge variant="neutral">自動入力</Badge>}
        {isRecording && value && !recordingRefetching && (
          <span style={{ fontSize: 10, color: color.success, fontWeight: font.weight.semibold }}>自動取得済み</span>
        )}
        {isRecording && recordingRefetching && (
          <span style={{ fontSize: 10, color: color.textLight }}>取得中…</span>
        )}
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
        {isRecording && onRefetchRecording && (
          <button
            type="button"
            onClick={onRefetchRecording}
            disabled={recordingRefetching}
            title="録音URLを再取得"
            style={{
              marginLeft: 'auto', padding: '2px 8px', fontSize: 10, borderRadius: radius.sm,
              border: `1px solid ${color.border}`, background: color.white, color: color.navy,
              cursor: recordingRefetching ? 'wait' : 'pointer', fontFamily: font.family.sans,
            }}
          >{recordingRefetching ? '取得中…' : '再取得'}</button>
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
  // 特殊フィールド: appoTime (面談時間) は 9:00〜20:00 30分刻みのプルダウン
  // 旧 AppoReportModal の時刻 select UI を移植
  if (field.key === 'appoTime') {
    const timeOpts = Array.from({ length: 23 }, (_, i) => {
      const total = 540 + i * 30; // 9:00 から
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });
    return (
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={baseStyle}>
        <option value="">— 選択 —</option>
        {timeOpts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
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
