import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';
import { calcRankAndRate } from '../../utils/calculations';
import { formatCurrency } from '../../utils/formatters';
import { updateAppointment, insertAppointment, deleteAppointment, updateAppoCounted, updateMember, insertMember, deleteMember, updateMemberReward, invokeSyncZoomUsers, invokeGetZoomRecording, invokeTranscribeRecording, updateEmailStatus, invokeSendEmail, invokeSendAppoReport, fetchMatchingListItemsByCompanyNames, fetchCallListItemByAppo, fetchCallListItemById, uploadAppoRecording, invokeLookupCompanyHomepage, updateCallListItem, saveSentInvoiceArchive, createInvoiceSignedUrl, invokeSendInvoiceToChannel } from '../../lib/supabaseWrite';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { useImeSafeInput } from '../../lib/useImeSafe';
import PageHeader from '../common/PageHeader';
import { useUrlState } from '../../hooks/useUrlState';
import { useSearchParams } from 'react-router-dom';

const APPO_COLS = [
  { key: 'client', width: 240, align: 'left' },
  { key: 'company', width: 230, align: 'left' },
  { key: 'getter', width: 60, align: 'left' },
  { key: 'getDate', width: 105, align: 'right' },
  { key: 'meetDate', width: 110, align: 'right' },
  { key: 'status', width: 200, align: 'center' },
  { key: 'revenue', width: 90, align: 'right' },
  { key: 'incentive', width: 110, align: 'right' },
];

const EMAIL_STATUS_LABELS = {
  pending: { label: '未送信', color: '#F59E0B', bg: '#FEF3C7' },
  sent: { label: '送信済', color: '#10B981', bg: '#D1FAE5' },
  failed: { label: '失敗', color: '#EF4444', bg: '#FEE2E2' },
};

export function MemberSuggestInput({ value, onChange, members = [], style, placeholder = '名前を入力して絞り込み' }) {
  const [suggs, setSuggs] = React.useState([]);
  const [show, setShow] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const inputRef = React.useRef(null);
  const memberNames = React.useMemo(
    () => members.map(m => typeof m === 'string' ? m : m.name || '').filter(Boolean),
    [members]
  );
  const open = (val) => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 2, left: r.left, width: r.width });
    const filtered = val ? memberNames.filter(n => n.includes(val)) : memberNames;
    setSuggs(filtered);
    setShow(filtered.length > 0);
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); open(e.target.value); }}
        onFocus={() => open('')}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        style={style}
        placeholder={placeholder}
      />
      {show && rect && (
        <div style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
          boxShadow: shadow.md, zIndex: 99999, maxHeight: 180, overflowY: 'auto' }}>
          {suggs.map((name, i) => (
            <div key={i}
              onMouseDown={() => { onChange(name); setShow(false); }}
              style={{ padding: '7px 12px', fontSize: font.size.xs, cursor: 'pointer', color: color.textDark, fontFamily: "'Noto Sans JP'" }}
              onMouseEnter={e => e.currentTarget.style.background = color.offWhite}
              onMouseLeave={e => e.currentTarget.style.background = color.white}
            >{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailApprovalSection({ appo, clientData = [], contactsByClient = {}, onStatusUpdate }) {
  const [emailStep, setEmailStep] = React.useState('idle'); // 'idle' | 'compose' | 'sending' | 'sent' | 'error'
  const [emailTo, setEmailTo] = React.useState('');
  const [emailCc, setEmailCc] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailBody, setEmailBody] = React.useState('');
  const [sendError, setSendError] = React.useState('');
  const [attachedFiles, setAttachedFiles] = React.useState([]);
  const fileInputRef = React.useRef(null);

  const cl = (clientData || []).find(c => c.company === appo.client);
  const es = EMAIL_STATUS_LABELS[appo.emailStatus] || EMAIL_STATUS_LABELS.pending;
  const contactMethod = cl?.contact || '';
  const isSlack = contactMethod === 'Slack';
  const isChatwork = contactMethod === 'Chatwork';
  const isChat = isSlack || isChatwork;
  const channelLabel = isSlack ? 'Slack' : isChatwork ? 'Chatwork' : 'メール';
  const channelIcon = isSlack ? '💼' : isChatwork ? '📝' : '✉';

  // 宛先候補リスト（メール送信用）
  const emailOptions = React.useMemo(() => {
    const contacts = cl?._supaId ? (contactsByClient[cl._supaId] || []) : [];
    const opts = contacts.map(ct => ({ label: `${ct.name} <${ct.email}>`, email: ct.email }));
    if (cl?.clientEmail && !contacts.some(ct => ct.email === cl.clientEmail)) {
      opts.push({ label: cl.clientEmail, email: cl.clientEmail });
    }
    return opts;
  }, [cl, contactsByClient]);

  // appoReportから「当社売上」行を除外したレポートテキスト
  const buildReportText = () => {
    return (appo.appoReport || '').split('\n').filter(line => !line.startsWith('当社売上：')).join('\n');
  };

  const initCompose = () => {
    const report = buildReportText();

    if (isChat) {
      // Slack/Chatwork: 本文のみ（宛先・件名不要）
      const clientLabel = cl?.company || appo.client || '';
      // Slackの場合、担当者のメンションを先頭に挿入
      const contacts = cl?._supaId ? (contactsByClient[cl._supaId] || []) : [];
      const mentions = isSlack
        ? contacts.filter(ct => ct.slackMemberId).map(ct => `<@${ct.slackMemberId}>`).join(' ')
        : '';
      const mentionLine = mentions ? `${mentions}\n` : '';
      setEmailBody(
        `${mentionLine}${clientLabel} 様\n\n` +
        `お世話になっております。\n` +
        `M&Aソーシングパートナーズの篠宮でございます。\n\n` +
        `下記企業のアポイントを取得いたしましたので、ご報告申し上げます。\n\n` +
        `---\n` +
        `${report}\n` +
        `---\n\n` +
        `以上でございます。\n` +
        `ご確認のほど、よろしくお願いいたします。`
      );
    } else {
      // メール: 宛先・件名・本文
      const selectedOpt = emailOptions.length > 0 ? emailOptions[0] : null;
      setEmailTo(selectedOpt ? selectedOpt.email : (cl?.clientEmail || ''));
      // クライアント別の件名デフォルト（ブティックス株式会社のみ独自フォーマット）
      const targetCompany = appo.company || '';
      const subject = (cl?.company === 'ブティックス株式会社')
        ? `【アウトバウンド外注】【M＆Aソーシングパートナーズ】アポ取得のお知らせ ${targetCompany}`
        : '【アポイント取得のご報告】M&Aソーシングパートナーズ 篠宮';
      setEmailSubject(subject);
      const contacts = cl?._supaId ? (contactsByClient[cl._supaId] || []) : [];
      const matchedContact = selectedOpt ? contacts.find(ct => ct.email === selectedOpt.email) : null;
      const greeting = matchedContact ? matchedContact.name : (cl?.company || appo.client || '');
      setEmailBody(
        `${greeting} 様\n\n` +
        `お世話になっております。\n` +
        `M&Aソーシングパートナーズの篠宮でございます。\n\n` +
        `下記企業のアポイントを取得いたしましたので、ご報告申し上げます。\n\n` +
        `---\n` +
        `${report}\n` +
        `---\n\n` +
        `以上でございます。\n` +
        `ご確認のほど、よろしくお願いいたします。\n\n` +
        `MASP 篠宮`
      );
      setEmailCc('');
    }
    setSendError('');
    setEmailStep('compose');
  };

  // CC候補（宛先に選ばれていない担当者）
  const ccOptions = React.useMemo(() => {
    return emailOptions.filter(o => o.email !== emailTo);
  }, [emailOptions, emailTo]);

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleSend = async () => {
    setEmailStep('sending');
    setSendError('');

    let error;
    if (isSlack) {
      if (!cl?.slackWebhookUrl) { setSendError('Slack Webhook URLが未設定です。CRMで設定してください。'); setEmailStep('compose'); return; }
      ({ error } = await invokeSendAppoReport({ channel: 'slack', text: emailBody, webhook_url: cl.slackWebhookUrl }));
    } else if (isChatwork) {
      if (!cl?.chatworkRoomId) { setSendError('Chatwork ルームIDが未設定です。CRMで設定してください。'); setEmailStep('compose'); return; }
      ({ error } = await invokeSendAppoReport({ channel: 'chatwork', text: emailBody, room_id: cl.chatworkRoomId }));
    } else {
      if (!emailTo) { setSendError('宛先メールアドレスを入力してください'); setEmailStep('compose'); return; }
      const emailAttachments = await Promise.all(
        attachedFiles.map(async (f) => ({ filename: f.name, data: await fileToBase64(f), mimeType: f.type || 'application/octet-stream' }))
      );
      ({ error } = await invokeSendEmail({ to: emailTo, subject: emailSubject, body: emailBody, cc: emailCc || undefined, attachments: emailAttachments.length > 0 ? emailAttachments : undefined }));
    }

    if (error) {
      setSendError(typeof error === 'string' ? error : error.message || '送信に失敗しました');
      setEmailStep('compose');
      return;
    }
    if (appo._supaId) await updateEmailStatus(appo._supaId, 'sent');
    onStatusUpdate?.('sent');
    setEmailStep('sent');
  };

  const iStyle = { width: '100%', padding: '6px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: 'none', background: color.white, boxSizing: 'border-box' };

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: radius.md, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: font.weight.bold, color: '#92400E' }}>{channelIcon} {channelLabel}で送信</div>
        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, background: es.bg, color: es.color, fontWeight: font.weight.semibold }}>{es.label}</span>
      </div>

      {appo.emailStatus === 'sent' && appo.emailSentAt && (
        <div style={{ fontSize: 10, color: color.textMid }}>送信日時: {new Date(appo.emailSentAt).toLocaleString('ja-JP')}</div>
      )}

      {emailStep === 'idle' && appo.emailStatus !== 'sent' && (
        <Button onClick={initCompose} disabled={!appo.appoReport} variant="primary" size="sm"
          title={!appo.appoReport ? 'アポ取得報告が未作成です' : ''}>
          アポ取得報告を送信
        </Button>
      )}

      {emailStep === 'sent' && (
        <div style={{ fontSize: font.size.sm, color: color.success, fontWeight: font.weight.semibold }}>{channelLabel}で送信しました</div>
      )}

      {(emailStep === 'compose' || emailStep === 'sending') && (
        <div style={{ marginTop: 8 }}>
          {/* メール送信の場合のみ: 宛先・CC・件名 */}
          {!isChat && (<>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, fontWeight: font.weight.semibold, color: '#92400E', display: 'block', marginBottom: 2 }}>宛先</label>
              {emailOptions.length > 0 ? (
                <select value={emailTo} onChange={e => {
                  const newEmail = e.target.value;
                  setEmailTo(newEmail);
                  const contacts = cl?._supaId ? (contactsByClient[cl._supaId] || []) : [];
                  const ct = contacts.find(c => c.email === newEmail);
                  const newGreeting = ct ? ct.name : (cl?.company || appo.client || '');
                  setEmailBody(prev => prev.replace(/^.+? 様/, `${newGreeting} 様`));
                }} style={iStyle}>
                  {emailOptions.map((opt, i) => <option key={i} value={opt.email}>{opt.label}</option>)}
                  <option value="">手入力...</option>
                </select>
              ) : null}
              {(emailOptions.length === 0 || emailTo === '' || !emailOptions.some(o => o.email === emailTo)) && (
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="client@example.com" style={{ ...iStyle, marginTop: emailOptions.length > 0 ? 4 : 0 }} />
              )}
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, fontWeight: font.weight.semibold, color: '#92400E', display: 'block', marginBottom: 2 }}>CC</label>
              {ccOptions.length > 0 ? (
                <select value={emailCc} onChange={e => setEmailCc(e.target.value)} style={iStyle}>
                  <option value="">なし</option>
                  {ccOptions.map((opt, i) => <option key={i} value={opt.email}>{opt.label}</option>)}
                </select>
              ) : (
                <input value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="cc@example.com（任意）" style={iStyle} />
              )}
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, fontWeight: font.weight.semibold, color: '#92400E', display: 'block', marginBottom: 2 }}>件名</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={iStyle} />
            </div>
          </>)}

          {/* Slack/Chatwork: 送信先情報 */}
          {isSlack && (
            <div style={{ marginBottom: 6, fontSize: 10, color: color.textMid }}>
              送信先: {cl?.slackWebhookUrl ? 'Webhook設定済み' : <span style={{ color: color.danger }}>未設定（CRMで設定してください）</span>}
            </div>
          )}
          {isChatwork && (
            <div style={{ marginBottom: 6, fontSize: 10, color: color.textMid }}>
              送信先: ルームID {cl?.chatworkRoomId || <span style={{ color: color.danger }}>未設定（CRMで設定してください）</span>}
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, fontWeight: font.weight.semibold, color: '#92400E', display: 'block', marginBottom: 2 }}>本文</label>
            <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={18}
              style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          {/* 添付ファイル */}
          {!isChat && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 9, fontWeight: font.weight.semibold, color: '#92400E', display: 'block', marginBottom: 2 }}>添付ファイル</label>
              <input ref={fileInputRef} type="file" multiple onChange={e => setAttachedFiles(prev => [...prev, ...Array.from(e.target.files)])} style={{ display: 'none' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ padding: '3px 10px', borderRadius: radius.md, border: `1px dashed ${color.border}`, background: color.white, cursor: 'pointer', fontSize: 10, color: color.textMid, fontFamily: "'Noto Sans JP'" }}>
                  + ファイルを追加
                </button>
                {attachedFiles.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF3C7', borderRadius: radius.md, padding: '2px 8px', fontSize: 9, color: '#92400E' }}>
                    {f.name}
                    <button type="button" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: font.size.xs, color: '#999', padding: 0, lineHeight: 1 }}>&times;</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {sendError && <div style={{ fontSize: 10, color: color.danger, marginBottom: 6 }}>{sendError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setEmailStep('idle')} variant="outline" size="sm">
              キャンセル
            </Button>
            <Button onClick={handleSend} disabled={emailStep === 'sending'} loading={emailStep === 'sending'} variant="primary" size="sm">
              {emailStep === 'sending' ? '送信中...' : `${channelLabel}で送信`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppoListView({ appoData, setAppoData, members = [], setMembers, clientData = [], rewardMaster = [], setCallFlowScreen, callListData = [], contactsByClient = {}, onDataRefetch }) {
  const isMobile = useIsMobile();
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");

  // engagements + categories マスタ (商材→タイプ 2階層フィルタ用)
  const [engagementMap, setEngagementMap] = useState({}); // { [engId]: { id, type, name, slug, categoryName } }
  const [categoryOrderedList, setCategoryOrderedList] = useState([]); // [{ name, display_order }]
  const [engsByCategory, setEngsByCategory] = useState({}); // { [categoryName]: [{ id, type, name, slug }] }

  // メンバーのインセンティブ率 (当社売上変更時のインターン報酬自動再計算用)
  // props.members は名前文字列配列なので、ここで別途フル情報を取得する
  const [memberRateByName, setMemberRateByName] = useState({}); // { '氏名': 0.22, ... }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orgId = getOrgId();
      if (!orgId) return;
      const { data } = await supabase.from('members')
        .select('name, incentive_rate')
        .eq('org_id', orgId)
        .eq('is_active', true);
      if (cancelled) return;
      const map = {};
      (data || []).forEach(m => {
        if (m.name) map[m.name] = parseFloat(m.incentive_rate || 0) || 0;
      });
      setMemberRateByName(map);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orgId = getOrgId();
      if (!orgId) return;
      const [{ data: engs }, { data: cats }] = await Promise.all([
        supabase.from('engagements').select('id, slug, name, type, category_id, product_id, display_order')
          .eq('org_id', orgId).eq('status', 'active'),
        supabase.from('business_categories').select('id, name, display_order')
          .eq('org_id', orgId).eq('is_active', true).order('display_order'),
      ]);
      if (cancelled) return;
      const catMap = new Map((cats || []).map(c => [c.id, c]));
      const map = {};
      const byCat = {};
      (engs || []).forEach(e => {
        const catName = catMap.get(e.category_id)?.name || null;
        map[e.id] = { id: e.id, type: e.type, slug: e.slug, name: e.name, categoryName: catName };
        if (catName) {
          if (!byCat[catName]) byCat[catName] = [];
          byCat[catName].push({ id: e.id, type: e.type, slug: e.slug, name: e.name, display_order: e.display_order || 0 });
        }
      });
      // 各 category 内で display_order 昇順に並べる
      Object.values(byCat).forEach(arr => arr.sort((a, b) => a.display_order - b.display_order));
      setEngagementMap(map);
      setCategoryOrderedList((cats || []).map(c => ({ name: c.name, display_order: c.display_order })));
      setEngsByCategory(byCat);
    })();
    return () => { cancelled = true; };
  }, []);
  // ── ランク・レート自動計算 ──────────────────────────────────────
  // ハードリロード/URL共有対応で URL クエリに同期。既存 localStorage は初期値だけ参照（後方互換）。
  const _ls = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const defaultApPeriod = _ls('spanavi_appo_period') || 'all';
  const _lsMonth = _ls('spanavi_appo_month');
  const defaultApMonth = (_lsMonth && AVAILABLE_MONTHS.some(m => m.yyyymm === _lsMonth))
    ? _lsMonth : (AVAILABLE_MONTHS[0]?.yyyymm || '2026-03');
  // URL クエリキーは画面間衝突を避けるため apo_ プレフィックス必須。
  // 例: CRM の ?status=面談予定 を そのまま読むとアポ一覧が全件除外になる事故が発生
  const [apPeriod, setApPeriod] = useUrlState('apo_period', defaultApPeriod);
  const [apSelectedMonth, setApSelectedMonth] = useUrlState('apo_month', defaultApMonth);
  const [apCustomFrom, setApCustomFrom] = useUrlState('apo_from', _ls('spanavi_appo_from') || '');
  const [apCustomTo, setApCustomTo] = useUrlState('apo_to', _ls('spanavi_appo_to') || '');
  const [statusFilter, setStatusFilter] = useUrlState('apo_status', 'all');
  // 商材 / タイプ フィルタ (engagement_id 経由)
  const [productFilter, setProductFilter] = useUrlState('apo_product', 'all'); // 'all' | 商材名
  const [typeFilter, setTypeFilter] = useUrlState('apo_type', 'all'); // 'all' | engagement.type
  const [search, setSearch] = useUrlState('apo_q', '');
  const [sortKey, setSortKey] = useUrlState('apo_sort', 'status');
  const [sortDir, setSortDir] = useUrlState('apo_dir', 'asc', { allowed: ['asc', 'desc'] });
  // sortKey + sortDir を同時更新する時は useUrlState 2 連続だと React Router の
  // searchParamsRef 遅延更新で 2 回目が 1 回目を上書きしてしまう (sort 切替不発)。
  // 単一 setSearchParams で両キーを同時に書き換える必要がある。
  const [, setSearchParams] = useSearchParams();
  const applySort = (nextKey, nextDir) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      if (nextKey === 'status') np.delete('apo_sort'); else np.set('apo_sort', nextKey);
      if (nextDir === 'asc') np.delete('apo_dir'); else np.set('apo_dir', nextDir);
      return np;
    }, { replace: true });
  };
  const toggleSort = (key) => {
    if (sortKey === key) applySort(key, sortDir === 'asc' ? 'desc' : 'asc');
    else applySort(key, 'asc');
  };
  const [editForm, setEditForm] = useState(null);
  const [addAppoForm, setAddAppoForm] = useState(null);
  const [addAppoSaving, setAddAppoSaving] = useState(false);
  const addAppoSavingRef = useRef(false);
  const [reportDetail, setReportDetail] = useState(null); // Appointment detail modal
  const [showRecordingDetail, setShowRecordingDetail] = useState(false);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailEditForm, setDetailEditForm] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailNavigating, setDetailNavigating] = useState(false);
  // ── Deal化 ──
  const [detailDealId, setDetailDealId] = useState(null);
  const [dealizing, setDealizing] = useState(false);
  // 'idle' | 'fetching' | 'transcribing' | 'enhancing' | 'done' | 'error'
  const [transcribeStep, setTranscribeStep] = React.useState('idle');
  const [hpStep, setHpStep] = React.useState('idle'); // 'idle' | 'fetching' | 'done' | 'error'
  const [keymanMobileInput, setKeymanMobileInput] = React.useState('');
  const [keymanLookupStep, setKeymanLookupStep] = React.useState('idle'); // 'idle' | 'fetching' | 'done' | 'error'
  const [showKeymanLookup, setShowKeymanLookup] = React.useState(false);
  // 録音URL差し替え用
  const [showReplaceUrl, setShowReplaceUrl] = useState(false);
  const [replaceUrl, setReplaceUrl] = useState('');
  // 'idle' | 'saving' | 'uploading' | 'transcribing' | 'enhancing' | 'done' | 'error'
  const [replaceStep, setReplaceStep] = useState('idle');
  const [dragOver, setDragOver] = useState(false);
  // ── 一括ステータス変更 ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // ── 請求書作成 ──
  const [invoiceModal, setInvoiceModal] = useState(false);
  // 単発請求書のメール送信プレビュー
  // toIds/ccIds: クライアント担当者の選択 (contact.id 配列)
  // extraTo/extraCc: フリー入力 (カンマ/空白/改行区切り、複数可)
  const [invoiceMailPreview, setInvoiceMailPreview] = useState(null);
  // { toIds, ccIds, extraTo, extraCc, subject, body, filename, pdfBase64, monthLabel, contacts: [{id,name,email}] }
  const [invoiceMailSending, setInvoiceMailSending] = useState(false);
  const [invoiceMailGenerating, setInvoiceMailGenerating] = useState(false);
  const [invoiceMonth, setInvoiceMonth] = useState(AVAILABLE_MONTHS[0]?.yyyymm || '');
  const [invoiceClient, setInvoiceClient] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([]);   // [{ company, quantity, unitPrice, amount }]
  const [invoiceExporting, setInvoiceExporting] = useState(false);
  const [invoiceIssueDate, setInvoiceIssueDate] = useState(() => {
    const mm = AVAILABLE_MONTHS[0]?.yyyymm || '';
    if (!mm) return '';
    const [y, m] = mm.split('-').map(Number);
    const d = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  // ── 請求書一斉送信 ──
  const [bulkSendModal, setBulkSendModal] = useState(false);
  const [bulkSendMonth, setBulkSendMonth] = useState(AVAILABLE_MONTHS[0]?.yyyymm || '');
  const [bulkSendChecked, setBulkSendChecked] = useState(new Set());  // クライアント名のSet
  const [bulkSendCc, setBulkSendCc] = useState({});      // { clientName: ccEmail }
  const [bulkSendTo, setBulkSendTo] = useState({});      // { clientName: email } — 選択した送信先
  const [bulkSendStatus, setBulkSendStatus] = useState({}); // { clientName: 'idle'|'sending'|'sent'|'error' }
  const [bulkSending, setBulkSending] = useState(false);
  // ── 請求書一括作成（ZIP） ──
  const [bulkInvoiceModal, setBulkInvoiceModal] = useState(false);
  const [bulkInvoiceMonth, setBulkInvoiceMonth] = useState(AVAILABLE_MONTHS[0]?.yyyymm || '');
  const [bulkInvoiceChecked, setBulkInvoiceChecked] = useState(new Set());  // クライアント名のSet
  const [bulkInvoiceStatus, setBulkInvoiceStatus] = useState({}); // { clientName: 'idle'|'generating'|'done'|'error' }
  const [bulkInvoiceGenerating, setBulkInvoiceGenerating] = useState(false);
  const [bulkInvoiceDrafts, setBulkInvoiceDrafts] = useState({});  // { clientName: items[] } — 編集済み明細
  const [bulkInvoiceEditingClient, setBulkInvoiceEditingClient] = useState(null);  // 編集モード中のクライアント名（単発モーダル流用フラグ）
  const [bulkInvoiceIssueDate, setBulkInvoiceIssueDate] = useState(() => {
    const mm = AVAILABLE_MONTHS[0]?.yyyymm || '';
    if (!mm) return '';
    const [y, m] = mm.split('-').map(Number);
    const d = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [droppedFileName, setDroppedFileName] = useState('');
  useEffect(() => {
    setShowRecordingDetail(false);
    setDetailEditing(false); setDetailEditForm(null);
    setShowReplaceUrl(false); setReplaceUrl(''); setReplaceStep('idle');
    setDetailDealId(null);
    // 詳細モーダルが開いたら appointments.deal_id を取得
    const supaId = reportDetail?._supaId;
    if (!supaId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('appointments')
        .select('deal_id')
        .eq('id', supaId)
        .maybeSingle();
      if (!cancelled) setDetailDealId(data?.deal_id || null);
    })();
    return () => { cancelled = true; };
  }, [reportDetail]);

  // アポからDealを作成
  const handleDealize = async () => {
    if (!reportDetail?._supaId || dealizing) return;
    setDealizing(true);
    try {
      const { data: aptRow, error: aErr } = await supabase
        .from('appointments')
        .select('id, engagement_id, client_id, item_id, company_name, representative, phone, deal_id')
        .eq('id', reportDetail._supaId)
        .single();
      if (aErr || !aptRow) { alert('アポ情報の取得に失敗しました'); return; }
      if (aptRow.deal_id) { setDetailDealId(aptRow.deal_id); alert('既にDeal化済みです'); return; }
      if (!aptRow.engagement_id) { alert('このアポに engagement が紐付いていません'); return; }
      const { data: newDeal, error: iErr } = await supabase
        .from('deals')
        .insert({
          org_id: getOrgId(),
          engagement_id: aptRow.engagement_id,
          client_id: aptRow.client_id,
          appointment_id: aptRow.id,
          call_list_item_id: aptRow.item_id,
          prospect_company: aptRow.company_name || '',
          prospect_name: aptRow.representative || '',
          prospect_phone: aptRow.phone || '',
          stage: 'first_meeting_done',
        })
        .select('id')
        .single();
      if (iErr || !newDeal) { alert('Dealの作成に失敗しました: ' + (iErr?.message || '')); return; }
      await supabase.from('appointments').update({ deal_id: newDeal.id }).eq('id', aptRow.id);
      setDetailDealId(newDeal.id);
      alert('Dealを作成しました');
    } finally {
      setDealizing(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('spanavi_appo_period', apPeriod);
    localStorage.setItem('spanavi_appo_month', apSelectedMonth);
    localStorage.setItem('spanavi_appo_from', apCustomFrom);
    localStorage.setItem('spanavi_appo_to', apCustomTo);
  }, [apPeriod, apSelectedMonth, apCustomFrom, apCustomTo]);

  // フィルター変更時に選択をクリア
  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, apPeriod, apSelectedMonth, apCustomFrom, apCustomTo, search, productFilter, typeFilter]);
  // 商材切替時、選択中の typeFilter が新商材に存在しなければ 'all' に戻す
  useEffect(() => {
    if (typeFilter === 'all') return;
    if (productFilter === 'all') { setTypeFilter('all'); return; }
    const list = engsByCategory[productFilter] || [];
    if (!list.some(e => e.id === typeFilter)) setTypeFilter('all');
  }, [productFilter, typeFilter, engsByCategory, setTypeFilter]);

  const statuses = [...new Set(appoData.map(a => a.status))];

  const statusOrder = { "面談済": 0, "事前確認済": 1, "アポ取得": 2, "リスケ中": 3, "キャンセル": 4 };
  const filtered = appoData.filter(a => {
    const dm = a.meetDate ? a.meetDate.slice(0, 7) : "";
    if (apPeriod === "month") { if (dm !== apSelectedMonth) return false; }
    else if (apPeriod === "custom") {
      if (apCustomFrom && dm < apCustomFrom) return false;
      if (apCustomTo && dm > apCustomTo) return false;
    }
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search && !a.company.includes(search) && !a.client.includes(search) && !a.getter.includes(search)) return false;
    // 商材/タイプ フィルタ
    if (productFilter !== 'all' || typeFilter !== 'all') {
      const eng = a.engagement_id ? engagementMap[a.engagement_id] : null;
      if (productFilter !== 'all' && eng?.categoryName !== productFilter) return false;
      if (typeFilter !== 'all' && eng?.id !== typeFilter) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortKey === 'status') {
      const sa = statusOrder[a.status] ?? 99;
      const sb = statusOrder[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return (a.meetDate || '').localeCompare(b.meetDate || '');
    }
    let valA, valB;
    if (sortKey === 'meetDate') { valA = a.meetDate || ''; valB = b.meetDate || ''; }
    else if (sortKey === 'client') { valA = a.client || ''; valB = b.client || ''; }
    else if (sortKey === 'getter') { valA = a.getter || ''; valB = b.getter || ''; }
    else if (sortKey === 'getDate') { valA = a.getDate || ''; valB = b.getDate || ''; }
    else { valA = a.meetDate || ''; valB = b.meetDate || ''; }
    const cmp = valA.localeCompare(valB);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const countableStatuses = ["面談済", "事前確認済", "アポ取得"];
  const countable = filtered.filter(a => countableStatuses.includes(a.status));
  // クライアント開拓リスト由来のアポは売上集計から除外（件数とインターン報酬は残す）
  const totalSales = countable.reduce((s, a) => s + (a.isProspecting ? 0 : (a.sales || 0)), 0);
  const totalReward = countable.reduce((s, a) => s + (a.reward || 0), 0);

  const monthStats = AVAILABLE_MONTHS.map(({ label, yyyymm }) => {
    const items = appoData.filter(a =>
      a.meetDate && a.meetDate.slice(0, 7) === yyyymm && countableStatuses.includes(a.status)
    );
    return { month: label, count: items.length,
      sales: items.reduce((s, a) => s + (a.isProspecting ? 0 : (a.sales || 0)), 0),
      reward: items.reduce((s, a) => s + (a.reward || 0), 0) };
  });

  const statusColor = (st) => {
    if (st === "面談済") return { bg: C.green + "12", color: C.green };
    if (st === "事前確認済") return { bg: '#1E40AF1a', color: '#1E40AF' };
    if (st === "アポ取得") return { bg: '#C8A84B1a', color: '#C8A84B' };
    if (st === "リスケ中") return { bg: "#ff980012", color: "#ff9800" };
    if (st === "キャンセル" || st.includes("キャンセル")) return { bg: "#e5383512", color: "#e53835" };
    return { bg: C.textLight + "10", color: C.textLight };
  };

  const { columns: appoCols, gridTemplateColumns: appoGrid, contentMinWidth: appoMinW, onResizeStart: appoResize } = useColumnConfig('appoList', APPO_COLS, { padding: 22, gap: 2 });

  // チェックボックス列を先頭に追加（useColumnConfigには影響しない）
  const appoGridWithCheckbox = setAppoData ? `28px ${appoGrid}` : appoGrid;
  const appoMinWWithCheckbox = setAppoData ? appoMinW + 28 : appoMinW;
  const selectableFiltered = filtered.filter(a => a._supaId);
  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every(a => selectedIds.has(a._supaId));
  const someSelected = selectableFiltered.some(a => selectedIds.has(a._supaId));
  const headerCheckboxRef = React.useRef(null);
  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  // ── 一括ステータス変更 ──────────────────────────────────────
  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selectedIds.size === 0 || bulkProcessing) return;
    const targetAppos = appoData.filter(a => selectedIds.has(a._supaId));
    const msg = `${targetAppos.length}件のアポイントメントのステータスを「${bulkStatus}」に変更します。よろしいですか？`;
    if (!window.confirm(msg)) return;
    setBulkProcessing(true);
    try {
      // 1. getter名でデルタを集計
      const memberDeltas = {};
      for (const appo of targetAppos) {
        const wasKanryo = appo.status === '面談済';
        const isKanryo = bulkStatus === '面談済';
        if (wasKanryo === isKanryo) continue;
        const delta = isKanryo ? (appo.sales || 0) : -(appo.sales || 0);
        if (delta === 0) continue;
        if (!memberDeltas[appo.getter]) memberDeltas[appo.getter] = { delta: 0, appos: [] };
        memberDeltas[appo.getter].delta += delta;
        memberDeltas[appo.getter].appos.push(appo);
      }
      // 2. メンバーの累計売上・ランク・インセンティブ率を更新
      const memberUpdates = [];
      if (setMembers) {
        for (const [getterName, { delta }] of Object.entries(memberDeltas)) {
          if (delta === 0) continue;
          const member = members.find(m => typeof m !== 'string' && m.name === getterName);
          if (!member?._supaId) continue;
          const newTotal = Math.max(0, (member.totalSales || 0) + delta);
          const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
          const rewardErr = await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
          if (rewardErr) { alert(`${getterName}の累計売上更新に失敗しました`); continue; }
          memberUpdates.push({ member, newTotal, newRank, newRate });
        }
      }
      // 3. 各アポのステータスとis_counted_in_cumulativeを更新
      const errors = [];
      for (const appo of targetAppos) {
        const wasKanryo = appo.status === '面談済';
        const isKanryo = bulkStatus === '面談済';
        const error = await updateAppointment(appo._supaId, { ...appo, status: bulkStatus });
        if (error) { errors.push(appo.company); continue; }
        if (wasKanryo !== isKanryo) await updateAppoCounted(appo._supaId, isKanryo);
      }
      // 4. ローカルstate反映
      setAppoData(prev => prev.map(a => selectedIds.has(a._supaId) ? { ...a, status: bulkStatus } : a));
      if (memberUpdates.length > 0 && setMembers) {
        setMembers(prev => prev.map(m => {
          const upd = memberUpdates.find(u => u.member._supaId === m._supaId);
          return upd ? { ...m, totalSales: upd.newTotal, rank: upd.newRank, rate: upd.newRate } : m;
        }));
      }
      if (errors.length > 0) alert(`${targetAppos.length - errors.length}件更新成功、${errors.length}件失敗しました。`);
      setSelectedIds(new Set());
      setBulkStatus('');
      // 一括更新後はデータ全体を refetch して画面表示と DB を完全同期
      if (memberUpdates.length > 0 && onDataRefetch) onDataRefetch();
    } catch (e) {
      alert('一括更新に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      setBulkProcessing(false);
    }
  };

  // ── 請求書PDF生成 ──────────────────────────────────────
  // クライアント選択時に明細行を自動生成
  // appoData.sales は消費税込みの金額 → 税別クライアントは税抜単価に変換
  const initInvoiceItems = (clientName, month) => {
    const client = clientData.find(c => c.company === clientName);
    const rm = client ? rewardMaster.find(r => r.id === client.rewardType) : null;
    const isTaxExcl = (rm?.tax || '税別') === '税別';
    // クライアント開拓リスト由来のアポは請求対象外（クライアント請求は通常リストのみ）
    const appos = appoData.filter(a =>
      a.status === '面談済' && a.client === clientName && !a.isProspecting && a.meetDate && a.meetDate.slice(0, 7) === month
    );
    setInvoiceItems(appos.map(a => {
      const raw = a.sales || 0;
      const unitPrice = isTaxExcl ? Math.round(raw / 1.1) : raw;
      return { company: a.company, quantity: 1, unitPrice, amount: unitPrice, note: '' };
    }));
  };

  const handleInvoiceExport = async () => {
    if (!invoiceMonth || !invoiceClient || invoiceExporting) return;
    const client = clientData.find(c => c.company === invoiceClient);
    if (!client) { alert('クライアントが見つかりません'); return; }
    if (invoiceItems.length === 0) { alert('明細行がありません'); return; }

    setInvoiceExporting(true);
    try {
      // 税区分の判定
      const rm = rewardMaster.find(r => r.id === client.rewardType);
      const taxType = rm?.tax || '税別';

      // 明細行はinvoiceItems stateから（編集済みの値を使用）
      const items = invoiceItems;
      const subtotal = items.reduce((s, it) => s + it.amount, 0);
      const tax = taxType === '税別'
        ? Math.floor(subtotal * 0.1)
        : Math.floor(subtotal - subtotal / 1.1);  // 内税の消費税額
      const total = taxType === '税別' ? subtotal + tax : subtotal;

      // 月ラベル
      const monthNum = parseInt(invoiceMonth.split('-')[1], 10);
      const monthLabel = monthNum + '月';

      // 発行日: ユーザー選択の日付を使用
      const [y, m] = invoiceMonth.split('-').map(Number);
      const [iy, im, id] = invoiceIssueDate.split('-').map(Number);
      const issueDate = `${iy}年${String(im).padStart(2, '0')}月${String(id).padStart(2, '0')}日`;

      // 請求番号
      const clientIdx = clientData.filter(c => c.status === '支援中').findIndex(c => c.company === invoiceClient);
      const invoiceNumber = `${iy}${String(im).padStart(2, '0')}${String(id).padStart(2, '0')}-${String((clientIdx >= 0 ? clientIdx : 0) + 1).padStart(3, '0')}`;

      // 支払期限: 対象月を基準にpaySiteから算出（翌月末をデフォルト）
      let paymentDeadline = '';
      const paySite = client.paySite || '';
      if (paySite.includes('翌月15日')) {
        const pd = new Date(y, m, 15); // 対象月の翌月15日
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月15日`;
      } else if (paySite.includes('翌月25日')) {
        const pd = new Date(y, m, 25); // 対象月の翌月25日
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月25日`;
      } else if (paySite.includes('翌月末')) {
        const pd = new Date(y, m + 1, 0); // 対象月の翌月末日
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
      } else if (paySite.includes('翌々月')) {
        const pd = paySite.includes('15日')
          ? new Date(y, m + 1, 15) // 対象月の翌々月15日
          : paySite.includes('25日')
            ? new Date(y, m + 1, 25) // 対象月の翌々月25日
            : new Date(y, m + 2, 0); // 対象月の翌々月末日
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
      } else {
        // デフォルト: 翌月末
        const pd = new Date(y, m + 1, 0);
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
      }

      // コンポーネント描画 → html2canvas → jsPDF
      const { default: InvoicePDF } = await import('./InvoicePDF');
      const ReactDOM = await import('react-dom/client');
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      const root = ReactDOM.createRoot(container);
      root.render(
        <InvoicePDF
          clientName={invoiceClient}
          month={monthLabel}
          items={items}
          subtotal={subtotal}
          tax={tax}
          total={total}
          taxType={taxType}
          invoiceNumber={invoiceNumber}
          issueDate={issueDate}
          paymentDeadline={paymentDeadline}
        />
      );

      await new Promise(resolve => setTimeout(resolve, 600));

      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const el = document.getElementById('invoice-pdf-page');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      pdf.save(`業務委託料_${monthLabel}分_${invoiceClient} 御中.pdf`);

      root.unmount();
      document.body.removeChild(container);
      setInvoiceModal(false);
    } catch (e) {
      console.error('[handleInvoiceExport]', e);
      alert('請求書の生成に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      setInvoiceExporting(false);
    }
  };

  // ── 請求書PDF生成（Base64返却用） ──────────────────────────
  // customItems を渡せば自動生成をスキップして編集済み明細を使う（一括作成の編集ドラフト用）
  const generateInvoicePdfBase64 = async (clientName, month, customIssueDate = null, customItems = null) => {
    const client = clientData.find(c => c.company === clientName);
    if (!client) throw new Error('クライアントが見つかりません');
    const rm = rewardMaster.find(r => r.id === client.rewardType);
    const taxType = rm?.tax || '税別';
    const isTaxExcl = taxType === '税別';

    let items;
    if (customItems && customItems.length > 0) {
      items = customItems;
    } else {
      const targetAppos = appoData.filter(a =>
        a.status === '面談済' && a.client === clientName && a.meetDate && a.meetDate.slice(0, 7) === month
      );
      items = targetAppos.map(a => {
        const raw = a.sales || 0;
        const unitPrice = isTaxExcl ? Math.round(raw / 1.1) : raw;
        return { company: a.company, quantity: 1, unitPrice, amount: unitPrice, note: '' };
      });
    }
    if (items.length === 0) throw new Error('対象の面談済アポがありません');

    const subtotal = items.reduce((s, it) => s + it.amount, 0);
    const tax = isTaxExcl ? Math.floor(subtotal * 0.1) : Math.floor(subtotal - subtotal / 1.1);
    const total = isTaxExcl ? subtotal + tax : subtotal;
    const monthNum = parseInt(month.split('-')[1], 10);
    const monthLabel = monthNum + '月';
    const [y, m] = month.split('-').map(Number);
    let issueDate, issueDateForNumber;
    if (customIssueDate) {
      const [iy, im, id] = customIssueDate.split('-').map(Number);
      issueDate = `${iy}年${String(im).padStart(2, '0')}月${String(id).padStart(2, '0')}日`;
      issueDateForNumber = `${iy}${String(im).padStart(2, '0')}${String(id).padStart(2, '0')}`;
    } else {
      const nextMonth = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
      issueDate = `${nextMonth.getFullYear()}年${String(nextMonth.getMonth() + 1).padStart(2, '0')}月01日`;
      issueDateForNumber = `${nextMonth.getFullYear()}${String(nextMonth.getMonth() + 1).padStart(2, '0')}01`;
    }
    const clientIdx = clientData.filter(c => c.status === '支援中').findIndex(c => c.company === clientName);
    const invoiceNumber = `${issueDateForNumber}-${String((clientIdx >= 0 ? clientIdx : 0) + 1).padStart(3, '0')}`;
    const paySite = client.paySite || '';
    let paymentDeadline = '';
    if (paySite.includes('翌月15日')) {
      const pd = new Date(y, m, 15); // 対象月の翌月15日
      paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月15日`;
    } else if (paySite.includes('翌月25日')) {
      const pd = new Date(y, m, 25); // 対象月の翌月25日
      paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月25日`;
    } else if (paySite.includes('翌月末')) {
      const pd = new Date(y, m + 1, 0); // 対象月の翌月末日
      paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
    } else if (paySite.includes('翌々月')) {
      const pd = paySite.includes('15日')
        ? new Date(y, m + 1, 15) // 対象月の翌々月15日
        : paySite.includes('25日')
          ? new Date(y, m + 1, 25) // 対象月の翌々月25日
          : new Date(y, m + 2, 0); // 対象月の翌々月末日
      paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
    } else {
      const pd = new Date(y, m + 1, 0); // デフォルト: 翌月末
      paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
    }

    const { default: InvoicePDF } = await import('./InvoicePDF');
    const ReactDOM = await import('react-dom/client');
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(
      <InvoicePDF clientName={clientName} month={monthLabel} items={items}
        subtotal={subtotal} tax={tax} total={total} taxType={taxType}
        invoiceNumber={invoiceNumber} issueDate={issueDate} paymentDeadline={paymentDeadline} />
    );
    await new Promise(resolve => setTimeout(resolve, 600));

    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');
    const el = document.getElementById('invoice-pdf-page');
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);

    // Base64取得
    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    const filename = `業務委託料_${monthLabel}分_${clientName} 御中.pdf`;

    root.unmount();
    document.body.removeChild(container);
    return { pdfBase64, filename, monthLabel };
  };

  // ── 一斉送信ロジック ──────────────────────────────────────
  const handleBulkSend = async () => {
    if (bulkSendChecked.size === 0 || bulkSending) return;
    const targets = [...bulkSendChecked];
    const noEmail = targets.filter(name => !bulkSendTo[name]);
    if (noEmail.length > 0) {
      alert(`以下のクライアントの送信先が選択されていません:\n${noEmail.join('\n')}`);
      return;
    }
    if (!window.confirm(`${targets.length}社に請求書メールを送信します。よろしいですか？`)) return;

    setBulkSending(true);
    const monthNum = parseInt(bulkSendMonth.split('-')[1], 10);
    const monthLabel = monthNum + '月';

    for (const clientName of targets) {
      setBulkSendStatus(prev => ({ ...prev, [clientName]: 'sending' }));
      try {
        const { pdfBase64, filename } = await generateInvoicePdfBase64(clientName, bulkSendMonth);
        const client = clientData.find(c => c.company === clientName);
        const emailBody = `${clientName} 様\n\nお世話になっております。\nM&Aソーシングパートナーズの篠宮でございます。\n\nこのたび、${monthLabel}分の請求書を添付にてお送り申し上げます。\n記載日までに、下記口座へお振込みいただけますと幸甚に存じます。\n\n― 振込先口座 ―\n GMOあおぞらネット銀行　法人営業部（101）\n 普通預金　2370528\n M&Aソーシングパートナーズ株式会社\n\n今後とも、貴社にとって有益となるアポイントの取得に尽力してまいりますので、変わらぬご高配を賜れますようお願い申し上げます。\n何卒よろしくお願い申し上げます。\n\nMASP 篠宮`;

        const subject = `【業務委託料_${monthLabel}分】M&Aソーシングパートナーズ`;
        const { error } = await invokeSendEmail({
          to: bulkSendTo[clientName],
          subject,
          body: emailBody,
          cc: bulkSendCc[clientName] || undefined,
          attachments: [{ filename, data: pdfBase64, mimeType: 'application/pdf' }],
        });
        if (!error) {
          // 自動保存: Storage + DB
          try {
            const byteChars = atob(pdfBase64);
            const byteArr = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
            const pdfBlob = new Blob([byteArr], { type: 'application/pdf' });
            const toEmails = String(bulkSendTo[clientName] || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
            const ccEmails = String(bulkSendCc[clientName] || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
            await saveSentInvoiceArchive({
              clientId: client?._supaId || null,
              clientName,
              invoiceMonth: bulkSendMonth,
              filename,
              pdfBlob,
              toEmails,
              ccEmails,
              subject,
            });
          } catch (saveErr) {
            console.warn(`[bulkSend] archive save failed for ${clientName}:`, saveErr);
          }
        }
        setBulkSendStatus(prev => ({ ...prev, [clientName]: error ? 'error' : 'sent' }));
      } catch (e) {
        console.error(`[bulkSend] ${clientName}:`, e);
        setBulkSendStatus(prev => ({ ...prev, [clientName]: 'error' }));
      }
    }
    setBulkSending(false);
  };

  // ── 一括作成（ZIP） ──────────────────────────────────────
  const handleBulkInvoiceExport = async () => {
    if (bulkInvoiceChecked.size === 0 || bulkInvoiceGenerating) return;
    const targets = [...bulkInvoiceChecked];
    setBulkInvoiceGenerating(true);
    const monthNum = parseInt(bulkInvoiceMonth.split('-')[1], 10);
    const monthLabel = monthNum + '月';

    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let successCount = 0;

      for (const clientName of targets) {
        setBulkInvoiceStatus(prev => ({ ...prev, [clientName]: 'generating' }));
        try {
          const draft = bulkInvoiceDrafts[clientName] || null;
          const { pdfBase64, filename } = await generateInvoicePdfBase64(clientName, bulkInvoiceMonth, bulkInvoiceIssueDate, draft);
          zip.file(filename, pdfBase64, { base64: true });
          setBulkInvoiceStatus(prev => ({ ...prev, [clientName]: 'done' }));
          successCount++;
        } catch (e) {
          console.error(`[bulkInvoiceExport] ${clientName}:`, e);
          setBulkInvoiceStatus(prev => ({ ...prev, [clientName]: 'error' }));
        }
      }

      if (successCount === 0) {
        alert('PDFを1件も生成できませんでした');
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `業務委託料_${monthLabel}分_一括.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[bulkInvoiceExport]', e);
      alert('ZIP生成に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      setBulkInvoiceGenerating(false);
    }
  };

  // キーマン携帯番号で Zoom 録音を検索し、見つかれば appoReport / item.keyman_mobile を更新
  const handleLookupRecordingByKeymanMobile = async () => {
    if (keymanLookupStep !== 'idle') return;
    const raw = (keymanMobileInput || '').replace(/[^\d+]/g, '');
    if (!raw) { setKeymanLookupStep('error'); setTimeout(() => setKeymanLookupStep('idle'), 3000); return; }
    setKeymanLookupStep('fetching');
    try {
      const getterName = detailEditForm?.getter || reportDetail?.getter || '';
      const member = (members || []).find(m => (typeof m === 'string' ? m : m.name) === getterName);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
      if (!zoomUserId) { setKeymanLookupStep('error'); setTimeout(() => setKeymanLookupStep('idle'), 4000); return; }
      const calledAt = reportDetail?.createdAtRaw || reportDetail?._createdAt || null;
      const { data, error } = await invokeGetZoomRecording({
        zoom_user_id: zoomUserId, callee_phone: raw, called_at: calledAt, prev_called_at: null,
      });
      if (error || !data?.recording_url) { setKeymanLookupStep('error'); setTimeout(() => setKeymanLookupStep('idle'), 4000); return; }
      const url = data.recording_url;
      // appoReport の「録音URL：」行を更新（無ければ末尾に追記）
      let report = detailEditForm?.appoReport || '';
      const recRe = /^　?・?録音URL[：:]\s*.*$/m;
      report = recRe.test(report) ? report.replace(recRe, `　・録音URL：${url}`) : `${report}\n　・録音URL：${url}`;
      setDetailEditForm(f => ({ ...f, appoReport: report }));
      // item の keyman_mobile を更新（同じ番号で次回以降の自動検索も効くように）
      if (reportDetail?.item_id) {
        try { await updateCallListItem(reportDetail.item_id, { keyman_mobile: raw }); }
        catch (e) { console.warn('[handleLookupRecordingByKeymanMobile] updateCallListItem error:', e); }
      }
      // appointment の recording_url も即時保存
      if (reportDetail?._supaId) {
        try {
          await updateAppointment(reportDetail._supaId, { ...reportDetail, appoReport: report, recording_url: url });
          if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === reportDetail._supaId ? { ...a, recordingUrl: url, appoReport: report } : a));
        } catch (e) {
          console.warn('[handleLookupRecordingByKeymanMobile] updateAppointment error:', e);
        }
      }
      setKeymanLookupStep('done');
      setTimeout(() => setKeymanLookupStep('idle'), 3000);
    } catch (e) {
      console.error('[handleLookupRecordingByKeymanMobile] error:', e);
      setKeymanLookupStep('error');
      setTimeout(() => setKeymanLookupStep('idle'), 4000);
    }
  };

  // 企業HPを自動取得して appoReport の「HP：」行を更新する
  const handleFetchHpDetail = async () => {
    if (hpStep !== 'idle') return;
    setHpStep('fetching');
    try {
      // 対象企業情報を call_list_items から引いて住所・代表者を補完
      let address = '';
      let representative = '';
      if (reportDetail?.item_id) {
        try {
          const { data: item } = await fetchCallListItemById(reportDetail.item_id);
          if (item) {
            address = (item.address || '').replace(/\/\s*$/, '');
            representative = item.representative || '';
          }
        } catch (e) {
          console.warn('[handleFetchHpDetail] fetchCallListItemById error:', e);
        }
      }
      const companyName = reportDetail?.company || detailEditForm?.company || '';
      if (!companyName) { setHpStep('error'); setTimeout(() => setHpStep('idle'), 3000); return; }
      const { url, confidence, reason } = await invokeLookupCompanyHomepage({
        company_name: companyName, address, representative,
      });
      if (!url) {
        console.warn('[handleFetchHpDetail] no url:', reason);
        setHpStep('error');
        setTimeout(() => setHpStep('idle'), 4000);
        return;
      }
      // 編集中の appoReport から「HP：」行を置換（無ければ追記）
      let report = detailEditForm?.appoReport || '';
      const hpLineRe = /^HP[：:]\s*.*$/m;
      if (hpLineRe.test(report)) {
        report = report.replace(hpLineRe, `HP：${url}`);
      } else {
        // 「法人名：」直後 or 末尾に追記
        const corpRe = /^(法人名[：:].*)$/m;
        report = corpRe.test(report) ? report.replace(corpRe, `$1\nHP：${url}`) : `${report}\nHP：${url}`;
      }
      setDetailEditForm(f => ({ ...f, appoReport: report }));
      // report_data にも反映（テンプレ駆動アポの場合）
      if (reportDetail?._supaId && reportDetail?.report_data) {
        const newReportData = { ...reportDetail.report_data, hp: url };
        try {
          await updateAppointment(reportDetail._supaId, { ...reportDetail, appoReport: report, report_data: newReportData });
        } catch (e) {
          console.warn('[handleFetchHpDetail] updateAppointment error:', e);
        }
      }
      setHpStep('done');
      setTimeout(() => setHpStep('idle'), 3000);
    } catch (e) {
      console.error('[handleFetchHpDetail] error:', e);
      setHpStep('error');
      setTimeout(() => setHpStep('idle'), 4000);
    }
  };

  const handleTranscribeDetail = async () => {
    if (transcribeStep !== 'idle') return;
    // Step 1: アポ取得報告または備考から録音URLを取得
    const src = detailEditForm?.appoReport || detailEditForm?.note || '';
    const urlMatch = src.match(/録音URL[：:]\s*(https?:\/\/\S+)/);
    let recordingUrl = urlMatch?.[1]?.trim() || '';
    if (!recordingUrl) {
      // Zoom APIから録音URLを取得
      // 後追い再生成シナリオ（携帯紐づけが後から行われたケース）にも対応するため：
      //   1) 紐づけられた call_list_item を引いて keyman_mobile / sub_phone_number / phone を全部試す
      //   2) called_at はアポ作成時刻 (createdAtRaw) を使い、Zoom 検索ウィンドウを当該日近辺に合わせる
      setTranscribeStep('fetching');
      const getterName = detailEditForm?.getter || '';
      const member = (members || []).find(m => (typeof m === 'string' ? m : m.name) === getterName);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;

      const phoneCandidates = [];
      if (reportDetail?.item_id) {
        try {
          const { data: item } = await fetchCallListItemById(reportDetail.item_id);
          if (item) {
            // キーマン携帯 → 別事業所 → 会社番号 の順で試す
            // （携帯通話の後付け再生成が一番ありがちなのでキーマン携帯を最優先）
            [item.keyman_mobile, item.sub_phone_number, item.phone].forEach(p => {
              const norm = (p || '').replace(/[^\d]/g, '');
              if (norm && !phoneCandidates.includes(norm)) phoneCandidates.push(norm);
            });
          }
        } catch (e) {
          console.warn('[handleTranscribeDetail] fetchCallListItemById error:', e);
        }
      }
      const fallbackPhone = (reportDetail?.phone || '').replace(/[^\d]/g, '');
      if (fallbackPhone && !phoneCandidates.includes(fallbackPhone)) phoneCandidates.push(fallbackPhone);

      const calledAt = reportDetail?.createdAtRaw || reportDetail?._createdAt || null;

      if (zoomUserId && phoneCandidates.length > 0) {
        for (const phone of phoneCandidates) {
          try {
            const { data } = await invokeGetZoomRecording({
              zoom_user_id: zoomUserId,
              callee_phone: phone,
              called_at: calledAt,
              prev_called_at: null,
            });
            if (data?.recording_url) { recordingUrl = data.recording_url; break; }
          } catch (e) {
            console.error('[handleTranscribeDetail] Zoom取得エラー:', phone, e);
          }
        }
      }
      if (!recordingUrl) {
        setTranscribeStep('error');
        setTimeout(() => setTranscribeStep('idle'), 3000);
        return;
      }
      // 取得できた録音URLを appointments.recording_url にも反映（次回以降の再生・再生成を高速化）
      if (reportDetail?._supaId) {
        try {
          await updateAppointment(reportDetail._supaId, { ...reportDetail, recording_url: recordingUrl });
          if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === reportDetail._supaId ? { ...a, recordingUrl } : a));
        } catch (e) {
          console.warn('[handleTranscribeDetail] recording_url 保存エラー:', e);
        }
      }
    }
    // Step 2: 文字起こし＋AI添削
    setTranscribeStep('transcribing');
    try {
      const { data, error } = await invokeTranscribeRecording({
        recording_url: recordingUrl,
        item_id: '',
        personality: '', meetingExp: '', futureConsider: '', other: '',
        appointment_id: reportDetail?._supaId || null,
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setTranscribeStep('enhancing');
      // アポ取得報告テキストの該当フィールドを添削結果で更新
      // 旧フォーマット「→」と新テンプレ駆動「：」両方にマッチ。テンプレ駆動側は「：」を使うので
      // 出力は「：」に統一。マッチしない場合は末尾追記をやめる（誤追記事故防止）。
      let report = detailEditForm?.appoReport || '';
      const replaceField = (text, pattern, value) => pattern.test(text) ? text.replace(pattern, value) : text;
      if (data.personality)    report = replaceField(report, /^　・(先方の温度感|先方のお人柄)[→:：].*$/m, `　・先方のお人柄：${data.personality}`);
      if (data.meetingExp)     report = replaceField(report, /^　・面談経験の有無[→:：].*$/m, `　・面談経験の有無：${data.meetingExp}`);
      if (data.futureConsider) report = replaceField(report, /^　・将来的な検討可否[→:：].*$/m, `　・将来的な検討可否：${data.futureConsider}`);
      if (data.other)          report = replaceField(report, /^　・その他[→:：].*$/m, `　・その他：${data.other}`);
      if (data.publicRecordingUrl) report = replaceField(report, /^　・録音URL[→:：].*$/m, `　・録音URL：${data.publicRecordingUrl}`);
      setDetailEditForm(f => ({ ...f, appoReport: report }));
      setTranscribeStep('done');
      setTimeout(() => setTranscribeStep('idle'), 3000);
    } catch (e) {
      console.error('[handleTranscribeDetail]', e);
      setTranscribeStep('error');
      setTimeout(() => setTranscribeStep('idle'), 4000);
    }
  };

  // 録音URL差し替え＋AI再分析
  const handleReplaceRecordingUrl = async () => {
    if (!replaceUrl || replaceStep !== 'idle') return;
    const supaId = reportDetail?._supaId;
    if (!supaId) return;

    // Step 1: recording_url を DB 更新
    setReplaceStep('saving');
    const updateErr = await updateAppointment(supaId, {
      ...reportDetail,
      recording_url: replaceUrl,
    });
    if (updateErr) {
      alert('録音URL保存に失敗しました: ' + (updateErr.message || ''));
      setReplaceStep('idle');
      return;
    }

    // appo_report 内の録音URLも差し替え
    let report = reportDetail.appoReport || '';
    const urlPattern = /^　・録音URL[：:]\s*.*$/m;
    if (urlPattern.test(report)) {
      report = report.replace(urlPattern, `　・録音URL：${replaceUrl}`);
    }

    // Step 2: transcribe-recording で AI 再分析
    setReplaceStep('transcribing');
    try {
      const { data, error } = await invokeTranscribeRecording({
        recording_url: replaceUrl,
        item_id: reportDetail.item_id || '',
        personality: '', meetingExp: '', futureConsider: '', other: '',
        appointment_id: reportDetail?._supaId || null,
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setReplaceStep('enhancing');

      // appo_report の4項目を更新（旧「→」/ 新「：」両対応、出力は「：」に統一）
      const replaceField = (text, pattern, value) =>
        pattern.test(text) ? text.replace(pattern, value) : text;
      if (data.personality)    report = replaceField(report, /^　・(先方の温度感|先方のお人柄)[→:：].*$/m, `　・先方のお人柄：${data.personality}`);
      if (data.meetingExp)     report = replaceField(report, /^　・面談経験の有無[→:：].*$/m, `　・面談経験の有無：${data.meetingExp}`);
      if (data.futureConsider) report = replaceField(report, /^　・将来的な検討可否[→:：].*$/m, `　・将来的な検討可否：${data.futureConsider}`);
      if (data.other)          report = replaceField(report, /^　・その他[→:：].*$/m, `　・その他：${data.other}`);
      if (data.publicRecordingUrl) report = replaceField(report, /^　・録音URL[→:：].*$/m, `　・録音URL：${data.publicRecordingUrl}`);

      // 更新された appo_report を DB 保存
      await updateAppointment(supaId, {
        ...reportDetail,
        appoReport: report,
        recording_url: data.publicRecordingUrl || replaceUrl,
      });

      // ローカル state 更新
      const updated = { ...reportDetail, appoReport: report, recordingUrl: data.publicRecordingUrl || replaceUrl };
      setReportDetail(updated);
      if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === supaId ? { ...a, appoReport: report, recordingUrl: data.publicRecordingUrl || replaceUrl } : a));

      setReplaceStep('done');
      setTimeout(() => { setReplaceStep('idle'); setShowReplaceUrl(false); }, 3000);
    } catch (e) {
      console.error('[handleReplaceRecordingUrl]', e);
      // URL保存は成功しているので state は更新
      const updated = { ...reportDetail, appoReport: report, recordingUrl: replaceUrl };
      setReportDetail(updated);
      if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === supaId ? { ...a, appoReport: report, recordingUrl: replaceUrl } : a));
      setReplaceStep('error');
      setTimeout(() => setReplaceStep('idle'), 4000);
    }
  };

  // ドラッグ&ドロップで音声ファイルをアップロード → AI再分析
  const handleDropRecording = async (file) => {
    const supaId = reportDetail?._supaId;
    if (!supaId || replaceStep !== 'idle') return;
    setDroppedFileName(file.name);
    setReplaceStep('uploading');
    try {
      const { url, error: upErr } = await uploadAppoRecording(supaId, file);
      if (upErr || !url) throw new Error(upErr?.message || 'アップロード失敗');
      setReplaceUrl(url);

      // recording_url を DB 保存
      setReplaceStep('saving');
      await updateAppointment(supaId, { ...reportDetail, recording_url: url });

      let report = reportDetail.appoReport || '';
      const urlPattern = /^　・録音URL[：:]\s*.*$/m;
      if (urlPattern.test(report)) report = report.replace(urlPattern, `　・録音URL：${url}`);

      // transcribe-recording で AI 再分析
      setReplaceStep('transcribing');
      const { data, error } = await invokeTranscribeRecording({
        recording_url: url,
        item_id: reportDetail.item_id || '',
        personality: '', meetingExp: '', futureConsider: '', other: '',
        appointment_id: reportDetail?._supaId || null,
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setReplaceStep('enhancing');

      const replaceField = (text, pattern, value) =>
        pattern.test(text) ? text.replace(pattern, value) : text;
      if (data.personality)    report = replaceField(report, /^　・(先方の温度感|先方のお人柄)→.*$/m, `　・先方のお人柄→${data.personality}`);
      if (data.meetingExp)     report = replaceField(report, /^　・面談経験の有無→.*$/m, `　・面談経験の有無→${data.meetingExp}`);
      if (data.futureConsider) report = replaceField(report, /^　・将来的な検討可否→.*$/m, `　・将来的な検討可否→${data.futureConsider}`);
      if (data.other)          report = replaceField(report, /^　・その他→.*$/m, `　・その他→${data.other}`);
      if (data.publicRecordingUrl) report = replaceField(report, /^　・録音URL[：:].*$/m, `　・録音URL：${data.publicRecordingUrl}`);

      const finalUrl = data.publicRecordingUrl || url;
      await updateAppointment(supaId, { ...reportDetail, appoReport: report, recording_url: finalUrl });
      const updated = { ...reportDetail, appoReport: report, recordingUrl: finalUrl };
      setReportDetail(updated);
      if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === supaId ? { ...a, appoReport: report, recordingUrl: finalUrl } : a));

      setReplaceStep('done');
      setTimeout(() => { setReplaceStep('idle'); setShowReplaceUrl(false); setDroppedFileName(''); }, 3000);
    } catch (e) {
      console.error('[handleDropRecording]', e);
      setReplaceStep('error');
      setTimeout(() => { setReplaceStep('idle'); setDroppedFileName(''); }, 4000);
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        title="アポ一覧"
        description="獲得アポイント一覧・進行管理"
        style={{ marginBottom: 24 }}
      />


      <>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
        overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>アポ一覧</span>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>{filtered.length}件</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input {...useImeSafeInput(search, setSearch)} placeholder="企業名・クライアント・取得者..."
            style={{ padding: "6px 12px", borderRadius: radius.lg, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none", width: 200 }} />
          {/* 月 / 期間指定 */}
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {[["all", "全月"], ["month", "月"], ["custom", "期間指定"]].map(([k, l]) => (
              <button key={k} onClick={() => setApPeriod(k)} style={{
                padding: "5px 10px", borderRadius: radius.md, fontSize: 10, fontWeight: font.weight.medium, cursor: "pointer",
                fontFamily: "'Noto Sans JP'",
                background: apPeriod === k ? color.navy : color.white,
                color: apPeriod === k ? color.white : color.textMid,
                border: `1px solid ${apPeriod === k ? color.navy : color.border}`,
              }}>{l}</button>
            ))}
            {apPeriod === "month" && (
              <select value={apSelectedMonth} onChange={e => setApSelectedMonth(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${color.border}`,
                  fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
              </select>
            )}
            {apPeriod === "custom" && (
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <select value={apCustomFrom} onChange={e => setApCustomFrom(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${color.border}`,
                    fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">開始月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
                <span style={{ fontSize: 10, color: color.textLight }}>〜</span>
                <select value={apCustomTo} onChange={e => setApCustomTo(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${color.border}`,
                    fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">終了月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: radius.lg, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none" }}>
            <option value="all">全ステータス</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {setAppoData && (
            <Button onClick={() => applySort('status', 'asc')}
              variant={sortKey === 'status' ? 'primary' : 'outline'} size="sm">
              デフォルト
            </Button>
          )}
          {setAppoData && (
            <Button onClick={() => setAddAppoForm({ client: "", company: "", getter: "", getDate: "", meetDate: "", status: "アポ取得", sales: 0, reward: 0, note: "" })}
              variant="primary" size="sm">
              ＋ アポ追加
            </Button>
          )}
          {setAppoData && (
            <Button onClick={() => { setInvoiceModal(true); setInvoiceClient(''); }} variant="outline" size="sm">
              請求書作成
            </Button>
          )}
          {setAppoData && (
            <Button onClick={() => { setBulkInvoiceModal(true); setBulkInvoiceChecked(new Set()); setBulkInvoiceStatus({}); setBulkInvoiceDrafts({}); }}
              variant="outline" size="sm">
              請求書一括作成
            </Button>
          )}
        </div>
      </div>

      {/* 商材 → タイプ の2階層フィルタ (架電リスト一覧と同じ仕様) */}
      {(() => {
        const pillStyle = (active) => ({
          padding: '6px 16px', borderRadius: radius.md, fontSize: font.size.sm, fontWeight: font.weight.semibold,
          cursor: 'pointer', transition: 'all 0.15s', fontFamily: font.family.sans,
          ...(active
            ? { background: color.navy, color: color.white, border: `1px solid ${color.navy}` }
            : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
        });
        const productList = categoryOrderedList.map(c => c.name);
        const typesForCategory = productFilter === 'all'
          ? []
          : (engsByCategory[productFilter] || []);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[3] }}>
            {/* Row 1: 商材 (productFilter と typeFilter を同時更新するため単一 setSearchParams を使用) */}
            <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, minWidth: 40 }}>商材:</span>
              <button onClick={() => setSearchParams(prev => {
                const np = new URLSearchParams(prev);
                np.delete('apo_product');
                np.delete('apo_type');
                return np;
              })} style={pillStyle(productFilter === 'all')}>全商材</button>
              {productList.map(p => (
                <button key={p} onClick={() => setSearchParams(prev => {
                  const np = new URLSearchParams(prev);
                  np.set('apo_product', p);
                  np.delete('apo_type');
                  return np;
                })} style={pillStyle(productFilter === p)}>{p}</button>
              ))}
            </div>
            {/* Row 2: タイプ (商材選択中のみ表示) */}
            {productFilter !== 'all' && typesForCategory.length > 0 && (
              <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, minWidth: 40 }}>タイプ:</span>
                <button onClick={() => setTypeFilter('all')} style={pillStyle(typeFilter === 'all')}>全て</button>
                {typesForCategory.map(e => (
                  <button key={e.id} onClick={() => setTypeFilter(e.id)} style={pillStyle(typeFilter === e.id)}>{e.name}</button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Summary */}
      <div style={{ marginBottom: 16 }}>
        {/* Total row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 10 }}>
          <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}` }}>
            <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>アポ件数 <span style={{ fontSize: 9, color: color.textLight + "90" }}>（有効）</span></div>
            <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: font.weight.black, color: color.navy, fontFamily: "'JetBrains Mono'" }}>{countable.length}<span style={{ fontSize: font.size.xs, fontWeight: font.weight.medium, color: color.textLight, marginLeft: 4 }}>/ {filtered.length}件</span></div>
          </div>
          <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}` }}>
            <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>当社売上合計</div>
            <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: font.weight.black, color: color.navy, fontFamily: "'JetBrains Mono'" }}>{formatCurrency(totalSales)}</div>
          </div>
          <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}` }}>
            <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>インターン報酬合計</div>
            <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: font.weight.black, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(totalReward)}</div>
          </div>
        </div>
        {/* Monthly breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + AVAILABLE_MONTHS.length + ", 1fr)", gap: isMobile ? 6 : 10, overflowX: isMobile ? 'auto' : 'visible' }}>
          {monthStats.map(ms => (
            <div key={ms.month} style={{
              padding: "10px 14px", background: color.white, borderRadius: radius.md,
              border: `1px solid ${color.border}`,
            }}>
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: 6, borderBottom: `1px solid ${color.border}`, paddingBottom: 4 }}>{ms.month}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: color.textLight }}>有効アポ</span>
                <span style={{ fontWeight: font.weight.bold, color: color.navy, fontFamily: "'JetBrains Mono'" }}>{ms.count}件</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: color.textLight }}>売上</span>
                <span style={{ fontWeight: font.weight.bold, color: color.navy, fontFamily: "'JetBrains Mono'" }}>{formatCurrency(ms.sales)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: color.textLight }}>報酬</span>
                <span style={{ fontWeight: font.weight.bold, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(ms.reward)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {setAppoData && selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: color.navy, borderRadius: '4px 4px 0 0',
          marginBottom: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.white, fontFamily: "'Noto Sans JP'" }}>
              {selectedIds.size}件選択中
            </span>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: radius.md, border: '1px solid #CBD5E1', fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: 'none' }}>
              <option value="">ステータスを選択</option>
              <option value="面談済">面談済</option>
              <option value="事前確認済">事前確認済</option>
              <option value="アポ取得">アポ取得</option>
              <option value="リスケ中">リスケ中</option>
              <option value="キャンセル">キャンセル</option>
            </select>
            <button onClick={handleBulkStatusChange} disabled={!bulkStatus || bulkProcessing}
              style={{
                padding: '5px 14px', borderRadius: radius.md, border: 'none', fontSize: font.size.xs, fontWeight: font.weight.semibold,
                fontFamily: "'Noto Sans JP'", cursor: !bulkStatus || bulkProcessing ? 'default' : 'pointer',
                background: !bulkStatus || bulkProcessing ? '#4B5563' : color.success, color: color.white,
              }}>
              {bulkProcessing ? '処理中...' : '一括変更'}
            </button>
          </div>
          <button onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); }}
            style={{ padding: '5px 12px', borderRadius: radius.md, border: '1px solid #CBD5E1', background: 'transparent', color: '#CBD5E1', fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", cursor: 'pointer' }}>
            選択解除
          </button>
        </div>
      )}

      {/* Table (mobile: card list) */}
      {isMobile && (
        <div>
          {filtered.length === 0 ? (
            <div style={{
              padding: '40px 16px', textAlign: 'center',
              background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
              color: color.textLight, fontSize: font.size.sm,
            }}>データがありません</div>
          ) : filtered.map((a, i) => {
            const sc = statusColor(a.status);
            const isSelected = a._supaId && selectedIds.has(a._supaId);
            return (
              <div
                key={i}
                onClick={() => setReportDetail(a)}
                style={{
                  background: isSelected ? '#EAF4FF' : color.white,
                  border: `1px solid ${color.border}`, borderRadius: radius.md,
                  padding: '12px 14px', marginBottom: space[2],
                  cursor: 'pointer', minHeight: 44,
                  borderLeft: `3px solid ${sc.color}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], marginBottom: space[1] }}>
                  {setAppoData && a._supaId && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={e => e.stopPropagation()}
                      onChange={() => setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(a._supaId)) next.delete(a._supaId); else next.add(a._supaId);
                        return next;
                      })}
                      style={{ cursor: 'pointer', accentColor: color.success, minWidth: 16, minHeight: 16 }}
                    />
                  )}
                  <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: sc.color }}>{a.status}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: font.family.mono, color: color.textLight }}>
                    取得 {a.getDate?.slice(5)} / 面談 {a.meetDate?.slice(5)}
                  </span>
                </div>
                <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: 2, textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                  {a.company}
                  {a.isProspecting && (
                    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: font.weight.semibold, color: color.info, background: alpha(color.info, 0.1), padding: '1px 5px', borderRadius: radius.sm }}>クライアント開拓</span>
                  )}
                </div>
                <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1] }}>{a.client}</div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  gap: space[1], fontSize: 10, color: color.textMid,
                }}>
                  <div>
                    <span style={{ color: color.textLight }}>取得者: </span>
                    <span style={{ fontWeight: font.weight.semibold, color: color.textDark }}>{a.getter}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: color.textLight }}>売上: </span>
                    <span style={{ fontFamily: font.family.mono, fontWeight: font.weight.semibold, color: a.isProspecting ? color.textLight : color.navy }}>
                      {a.isProspecting ? '-' : (a.sales > 0 ? formatCurrency(a.sales) : '-')}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: color.textLight }}>イン: </span>
                    <span style={{ fontFamily: font.family.mono }}>{a.reward > 0 ? formatCurrency(a.reward) : '-'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!isMobile && (
      <div style={{ background: color.white, borderRadius: selectedIds.size > 0 ? '0 0 4px 4px' : radius.md, overflowX: "auto", overflowY: "hidden", border: `1px solid ${color.border}` }}>
        <div style={{ minWidth: appoMinWWithCheckbox }}>
        <div style={{
          display: "grid", gridTemplateColumns: appoGridWithCheckbox,
          padding: isMobile ? "6px 4px 6px 10px" : "8px 6px 8px 16px", columnGap: 2, background: color.navy,
          fontSize: isMobile ? 10 : font.size.xs, fontWeight: font.weight.semibold, color: color.white,
          borderBottom: `1px solid ${color.border}`,
          alignItems: "center",
          verticalAlign: "middle",
        }}>
          {setAppoData && (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input type="checkbox" ref={headerCheckboxRef} checked={allSelected}
                onChange={() => {
                  if (allSelected) setSelectedIds(new Set());
                  else setSelectedIds(new Set(selectableFiltered.map(a => a._supaId)));
                }}
                style={{ cursor: 'pointer', accentColor: color.success }} />
            </span>
          )}
          {[
            { label: 'クライアント', key: 'client' },
            { label: '企業名', key: null },
            { label: '取得者', key: 'getter' },
            { label: '取得日', key: 'getDate' },
            { label: '面談日', key: 'meetDate' },
            { label: 'ステータス', key: null },
            { label: '当社売上', key: null },
            { label: 'インセンティブ', key: null },
          ].map(({ label, key }, i) => (
            <span key={label}
              onClick={key ? () => toggleSort(key) : undefined}
              style={{ position: 'relative', textAlign: appoCols[i]?.align || 'left', whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none', minWidth: 0 }}>
              {label}
              {key && (
                <span style={{ marginLeft: 2 }}>
                  <span style={{ color: sortKey === key && sortDir === 'asc' ? color.white : 'rgba(255,255,255,0.4)' }}>▲</span>
                  <span style={{ color: sortKey === key && sortDir === 'desc' ? color.white : 'rgba(255,255,255,0.4)' }}>▼</span>
                </span>
              )}
              <ColumnResizeHandle colIndex={i} onResizeStart={appoResize} />
            </span>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: color.textLight, fontSize: font.size.sm }}>データがありません</div>
        ) : filtered.map((a, i) => {
          const sc = statusColor(a.status);
          const isSelected = a._supaId && selectedIds.has(a._supaId);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: appoGridWithCheckbox,
              padding: "8px 6px 8px 16px", columnGap: 2, fontSize: font.size.xs, alignItems: "center",
              borderBottom: `1px solid ${color.border}`,
              background: isSelected ? '#EAF4FF' : (i % 2 === 0 ? color.white : '#F8F9FA'),
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#EAF4FF"; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? color.white : '#F8F9FA'; }}>
              {setAppoData && (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a._supaId ? (
                    <input type="checkbox" checked={isSelected}
                      onChange={() => setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(a._supaId)) next.delete(a._supaId); else next.add(a._supaId);
                        return next;
                      })}
                      style={{ cursor: 'pointer', accentColor: color.success }} />
                  ) : <span style={{ width: 13 }} />}
                </span>
              )}
              <span style={{ color: color.textMid, fontSize: 10, textAlign: appoCols[0]?.align || 'left' }}>{a.client}</span>
              <span style={{ fontWeight: font.weight.semibold, color: color.navy, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2, textAlign: appoCols[1]?.align || 'left' }} onClick={() => setReportDetail(a)}>
                {a.company}
                {a.isProspecting && (
                  <span style={{ marginLeft: 6, fontSize: 9, fontWeight: font.weight.semibold, color: color.info, background: alpha(color.info, 0.1), padding: '1px 5px', borderRadius: radius.sm }}>クライアント開拓</span>
                )}
              </span>
              <span style={{ color: color.textDark, textAlign: appoCols[2]?.align || 'left' }}>{a.getter}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: color.textLight, textAlign: appoCols[3]?.align || 'right', display: 'block' }}>{a.getDate.slice(5)}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: color.textLight, textAlign: appoCols[4]?.align || 'right', display: 'block' }}>{a.meetDate.slice(5)}</span>
              <span style={{
                display: 'block', textAlign: appoCols[5]?.align || 'center', fontSize: 10, padding: "2px 6px",
                color: sc.color,
                whiteSpace: 'nowrap',
              }}>{a.status}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: font.weight.semibold, color: a.isProspecting ? color.textLight : color.navy, textAlign: appoCols[6]?.align || 'right', fontVariantNumeric: 'tabular-nums' }}>{a.isProspecting ? "-" : (a.sales > 0 ? formatCurrency(a.sales) : "-")}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: color.textMid, textAlign: appoCols[7]?.align || 'right', fontVariantNumeric: 'tabular-nums' }}>{a.reward > 0 ? formatCurrency(a.reward) : "-"}</span>
            </div>
          );
        })}
        </div>
      </div>
      )}

      {/* Bulk Invoice Create Modal (ZIP) — 編集モーダル表示中は隠す */}
      {bulkInvoiceModal && setAppoData && !bulkInvoiceEditingClient && (() => {
        // クライアント開拓由来のアポは請求対象外
        const monthAppos = appoData.filter(a => a.status === '面談済' && !a.isProspecting && a.meetDate && a.meetDate.slice(0, 7) === bulkInvoiceMonth);
        const clientNames = [...new Set(monthAppos.map(a => a.client))].filter(Boolean).sort();
        const clientInfos = clientNames.map(name => {
          const c = clientData.find(cl => cl.company === name);
          const rm = c ? rewardMaster.find(r => r.id === c.rewardType) : null;
          const isTaxExcl = (rm?.tax || '税別') === '税別';
          const draft = bulkInvoiceDrafts[name];
          let count, subtotal;
          if (draft) {
            count = draft.length;
            subtotal = draft.reduce((s, it) => s + (it.amount || 0), 0);
          } else {
            const appos = monthAppos.filter(a => a.client === name);
            count = appos.length;
            subtotal = appos.reduce((s, a) => s + (isTaxExcl ? Math.round((a.sales || 0) / 1.1) : (a.sales || 0)), 0);
          }
          const total = isTaxExcl ? subtotal + Math.floor(subtotal * 0.1) : subtotal;
          return { name, count, total, edited: !!draft };
        });
        const allChecked = clientInfos.length > 0 && clientInfos.every(ci => bulkInvoiceChecked.has(ci.name));
        const statusLabel = { idle: '', generating: '生成中...', done: '生成済', error: '失敗' };
        const statusColor = { idle: '', generating: '#F59E0B', done: '#10B981', error: '#EF4444' };

        const openEditDraft = (name) => {
          setInvoiceMonth(bulkInvoiceMonth);
          setInvoiceIssueDate(bulkInvoiceIssueDate);
          setInvoiceClient(name);
          if (bulkInvoiceDrafts[name]) {
            setInvoiceItems(bulkInvoiceDrafts[name]);
          } else {
            initInvoiceItems(name, bulkInvoiceMonth);
          }
          setBulkInvoiceEditingClient(name);
          setInvoiceModal(true);
        };

        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 720, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
              <div style={{ padding: "12px 24px", background: color.navy, borderRadius: '4px 4px 0 0', color: color.white, fontWeight: font.weight.semibold, fontSize: 15, flexShrink: 0 }}>
                請求書一括作成（ZIP）
              </div>
              <div style={{ padding: "20px 24px", overflowY: 'auto', flex: 1 }}>
                {/* 月選択 + 請求日 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4, display: 'block' }}>対象月</label>
                    <select value={bulkInvoiceMonth} onChange={e => {
                      const v = e.target.value;
                      setBulkInvoiceMonth(v); setBulkInvoiceChecked(new Set()); setBulkInvoiceStatus({}); setBulkInvoiceDrafts({});
                      const [yy, mm] = v.split('-').map(Number);
                      const dd = mm === 12 ? new Date(yy + 1, 0, 1) : new Date(yy, mm, 1);
                      setBulkInvoiceIssueDate(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`);
                    }}
                      style={{ width: '100%', padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                      {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4, display: 'block' }}>請求日（全請求書共通）</label>
                    <input type="date" value={bulkInvoiceIssueDate} onChange={e => setBulkInvoiceIssueDate(e.target.value)}
                      style={{ width: '100%', padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", outline: "none" }} />
                  </div>
                </div>

                {/* クライアント一覧テーブル */}
                <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 110px 56px 70px', gap: 0, background: color.gray100, padding: '6px 10px', fontSize: 10, fontWeight: font.weight.semibold, color: color.gray700, alignItems: 'center' }}>
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      <input type="checkbox" checked={allChecked} onChange={() => {
                        if (allChecked) setBulkInvoiceChecked(new Set());
                        else setBulkInvoiceChecked(new Set(clientInfos.map(ci => ci.name)));
                      }} style={{ cursor: 'pointer' }} />
                    </span>
                    <span>クライアント</span>
                    <span style={{ textAlign: 'center' }}>件数</span>
                    <span style={{ textAlign: 'right' }}>請求金額</span>
                    <span style={{ textAlign: 'center' }}>編集</span>
                    <span style={{ textAlign: 'center' }}>状態</span>
                  </div>
                  {clientInfos.length === 0 ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: font.size.xs, color: color.textLight }}>対象クライアントがありません</div>
                  ) : clientInfos.map(ci => {
                    const st = bulkInvoiceStatus[ci.name] || 'idle';
                    return (
                      <div key={ci.name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 110px 56px 70px', gap: 4, padding: '6px 10px', borderTop: `1px solid ${color.border}`, alignItems: 'center', fontSize: font.size.xs }}>
                        <span style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={bulkInvoiceChecked.has(ci.name)} disabled={bulkInvoiceGenerating}
                            onChange={() => setBulkInvoiceChecked(prev => { const next = new Set(prev); if (next.has(ci.name)) next.delete(ci.name); else next.add(ci.name); return next; })}
                            style={{ cursor: bulkInvoiceGenerating ? 'default' : 'pointer' }} />
                        </span>
                        <span style={{ fontWeight: font.weight.medium, color: color.navy, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {ci.name}
                          {ci.edited && <Badge variant="success" size="sm">編集済</Badge>}
                        </span>
                        <span style={{ textAlign: 'center', fontFamily: "'JetBrains Mono'", color: color.navy }}>{ci.count}</span>
                        <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono'", fontWeight: font.weight.semibold, color: color.navy }}>{formatCurrency(ci.total)}</span>
                        <span style={{ textAlign: 'center' }}>
                          <Button onClick={() => openEditDraft(ci.name)} disabled={bulkInvoiceGenerating}
                            variant="outline" size="sm">
                            編集
                          </Button>
                        </span>
                        <span style={{ textAlign: 'center', fontSize: 10, fontWeight: font.weight.semibold, color: statusColor[st] }}>{statusLabel[st]}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12, fontSize: 10, color: color.textMid }}>
                  「編集」で個別に明細を調整できます（保存した内容はZIP生成時に反映されます）。未編集の行は面談済アポから自動生成されます。
                </div>
              </div>
              <div style={{ padding: "12px 24px", borderTop: `1px solid ${color.border}`, display: "flex", justifyContent: "space-between", alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: color.textMid }}>{bulkInvoiceChecked.size}社選択中</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button onClick={() => setBulkInvoiceModal(false)} disabled={bulkInvoiceGenerating} variant="outline" size="sm">
                    閉じる
                  </Button>
                  <Button
                    onClick={() => {
                      // 一斉送信モーダルを開く (対象月を引き継ぐ)
                      setBulkSendMonth?.(bulkInvoiceMonth);
                      setBulkSendChecked(new Set());
                      setBulkSendStatus({});
                      setBulkSendCc({});
                      setBulkSendTo({});
                      setBulkInvoiceModal(false);
                      setBulkSendModal(true);
                    }}
                    disabled={bulkInvoiceGenerating}
                    variant="outline" size="sm"
                  >
                    メールで一斉送信
                  </Button>
                  <Button onClick={handleBulkInvoiceExport} disabled={bulkInvoiceChecked.size === 0 || bulkInvoiceGenerating}
                    loading={bulkInvoiceGenerating} variant="primary" size="sm">
                    {bulkInvoiceGenerating ? '生成中...' : 'ZIPでダウンロード'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk Send Modal */}
      {bulkSendModal && setAppoData && (() => {
        // クライアント開拓由来のアポは一括送信対象外
        const monthAppos = appoData.filter(a => a.status === '面談済' && !a.isProspecting && a.meetDate && a.meetDate.slice(0, 7) === bulkSendMonth);
        const clientNames = [...new Set(monthAppos.map(a => a.client))].filter(Boolean).sort();
        const clientInfos = clientNames.map(name => {
          const c = clientData.find(cl => cl.company === name);
          const rm = c ? rewardMaster.find(r => r.id === c.rewardType) : null;
          const isTaxExcl = (rm?.tax || '税別') === '税別';
          const appos = monthAppos.filter(a => a.client === name);
          const subtotal = appos.reduce((s, a) => s + (isTaxExcl ? Math.round((a.sales || 0) / 1.1) : (a.sales || 0)), 0);
          const total = isTaxExcl ? subtotal + Math.floor(subtotal * 0.1) : subtotal;
          const contacts = c?._supaId ? (contactsByClient[c._supaId] || []) : [];
          // 従来のclientEmailもフォールバックとして含める
          const allEmails = [...contacts.map(ct => ({ label: `${ct.name} <${ct.email}>`, email: ct.email }))];
          if (c?.clientEmail && !contacts.some(ct => ct.email === c.clientEmail)) {
            allEmails.push({ label: c.clientEmail, email: c.clientEmail });
          }
          return { name, contacts: allEmails, count: appos.length, total };
        });
        const allChecked = clientInfos.length > 0 && clientInfos.every(ci => bulkSendChecked.has(ci.name));
        const monthNum = parseInt(bulkSendMonth.split('-')[1], 10);
        const statusLabel = { idle: '', sending: '送信中...', sent: '送信済', error: '失敗' };
        const statusColor = { idle: '', sending: '#F59E0B', sent: '#10B981', error: '#EF4444' };

        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 780, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
              <div style={{ padding: "12px 24px", background: color.navy, borderRadius: '4px 4px 0 0', color: color.white, fontWeight: font.weight.semibold, fontSize: 15, flexShrink: 0 }}>
                請求書一斉送信
              </div>
              <div style={{ padding: "20px 24px", overflowY: 'auto', flex: 1 }}>
                {/* 月選択 */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4, display: 'block' }}>対象月</label>
                  <select value={bulkSendMonth} onChange={e => { setBulkSendMonth(e.target.value); setBulkSendChecked(new Set()); setBulkSendStatus({}); }}
                    style={{ padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                    {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                  </select>
                </div>

                {/* クライアント一覧テーブル */}
                <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 200px 50px 90px 140px 60px', gap: 0, background: color.gray100, padding: '6px 10px', fontSize: 10, fontWeight: font.weight.semibold, color: color.gray700, alignItems: 'center' }}>
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      <input type="checkbox" checked={allChecked} onChange={() => {
                        if (allChecked) setBulkSendChecked(new Set());
                        else setBulkSendChecked(new Set(clientInfos.map(ci => ci.name)));
                      }} style={{ cursor: 'pointer' }} />
                    </span>
                    <span>クライアント</span>
                    <span>送信先</span>
                    <span style={{ textAlign: 'center' }}>件数</span>
                    <span style={{ textAlign: 'right' }}>請求金額</span>
                    <span style={{ paddingLeft: 8 }}>CC（任意）</span>
                    <span style={{ textAlign: 'center' }}>状態</span>
                  </div>
                  {clientInfos.length === 0 ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: font.size.xs, color: color.textLight }}>対象クライアントがありません</div>
                  ) : clientInfos.map(ci => {
                    const st = bulkSendStatus[ci.name] || 'idle';
                    return (
                      <div key={ci.name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 200px 50px 90px 140px 60px', gap: 4, padding: '6px 10px', borderTop: `1px solid ${color.border}`, alignItems: 'center', fontSize: font.size.xs }}>
                        <span style={{ display: 'flex', justifyContent: 'center' }}>
                          <input type="checkbox" checked={bulkSendChecked.has(ci.name)} disabled={st === 'sent'}
                            onChange={() => setBulkSendChecked(prev => { const next = new Set(prev); if (next.has(ci.name)) next.delete(ci.name); else next.add(ci.name); return next; })}
                            style={{ cursor: st === 'sent' ? 'default' : 'pointer' }} />
                        </span>
                        <span style={{ fontWeight: font.weight.medium, color: color.navy }}>{ci.name}</span>
                        {ci.contacts.length > 0 ? (
                          <select value={bulkSendTo[ci.name] || ''} onChange={e => setBulkSendTo(prev => ({ ...prev, [ci.name]: e.target.value }))}
                            disabled={st === 'sent'}
                            style={{ padding: '3px 6px', borderRadius: 3, border: `1px solid ${color.border}`, fontSize: 10, fontFamily: "'Noto Sans JP'", outline: 'none' }}>
                            <option value="">送信先を選択</option>
                            {ci.contacts.map((ct, i) => <option key={i} value={ct.email}>{ct.label}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 10, color: color.danger }}>担当者未登録</span>
                        )}
                        <span style={{ textAlign: 'center', fontFamily: "'JetBrains Mono'", color: color.navy }}>{ci.count}</span>
                        <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono'", fontWeight: font.weight.semibold, color: color.navy }}>{formatCurrency(ci.total)}</span>
                        <input value={bulkSendCc[ci.name] || ''} onChange={e => setBulkSendCc(prev => ({ ...prev, [ci.name]: e.target.value }))}
                          placeholder="CC" disabled={st === 'sent'}
                          style={{ padding: '3px 6px', borderRadius: 3, border: `1px solid ${color.border}`, fontSize: 10, fontFamily: "'Noto Sans JP'", outline: 'none' }} />
                        <span style={{ textAlign: 'center', fontSize: 10, fontWeight: font.weight.semibold, color: statusColor[st] }}>{statusLabel[st]}</span>
                      </div>
                    );
                  })}
                </div>

                {/* メール本文プレビュー */}
                <div style={{ marginTop: 16, padding: 12, background: '#F8F9FA', borderRadius: radius.md, border: `1px solid ${color.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 6 }}>メール本文（プレビュー）</div>
                  <pre style={{ fontSize: 10, color: color.gray700, lineHeight: 1.6, fontFamily: "'Noto Sans JP'", whiteSpace: 'pre-wrap', margin: 0 }}>
{`〇〇 様

お世話になっております。
M&Aソーシングパートナーズの篠宮でございます。

このたび、${monthNum}月分の請求書を添付にてお送り申し上げます。
記載日までに、下記口座へお振込みいただけますと幸甚に存じます。

― 振込先口座 ―
 GMOあおぞらネット銀行　法人営業部（101）
 普通預金　2370528
 M&Aソーシングパートナーズ株式会社

今後とも、貴社にとって有益となるアポイントの取得に尽力してまいりますので、
変わらぬご高配を賜れますようお願い申し上げます。
何卒よろしくお願い申し上げます。

MASP 篠宮`}
                  </pre>
                  <div style={{ fontSize: 9, color: color.gray400, marginTop: 4 }}>※「〇〇」は各クライアント名に自動置換されます</div>
                </div>
              </div>
              <div style={{ padding: "12px 24px", borderTop: `1px solid ${color.border}`, display: "flex", justifyContent: "space-between", alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: color.textMid }}>{bulkSendChecked.size}社選択中</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button onClick={() => setBulkSendModal(false)} variant="outline" size="sm">
                    閉じる
                  </Button>
                  <Button onClick={handleBulkSend} disabled={bulkSendChecked.size === 0 || bulkSending}
                    loading={bulkSending} variant="primary" size="sm">
                    {bulkSending ? '送信中...' : '一斉送信'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Invoice Modal */}
      {/* 単発請求書メール送信プレビュー */}
      {invoiceMailPreview && (
        <div
          onClick={() => !invoiceMailSending && setInvoiceMailPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 20001, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: color.white, borderRadius: radius.lg, width: 640, maxWidth: '95vw',
            maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            fontFamily: font.family.sans,
          }}>
            <div style={{
              padding: '12px 20px', background: color.navy, color: color.white,
              borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                請求書送付 — {invoiceClient}
              </span>
              <button onClick={() => !invoiceMailSending && setInvoiceMailPreview(null)} style={{
                background: 'none', border: 'none', color: color.white, fontSize: 18, cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 送付方法タブ */}
              <div>
                <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>送付方法</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { key: 'email', label: '✉ メール', enabled: true },
                    { key: 'slack', label: '💬 Slack', enabled: !!invoiceMailPreview.slackWebhookUrl, hint: invoiceMailPreview.slackWebhookUrl ? '' : 'クライアントに Slack Webhook URL が未登録' },
                    { key: 'chatwork', label: '💬 Chatwork', enabled: !!invoiceMailPreview.chatworkRoomId, hint: invoiceMailPreview.chatworkRoomId ? '' : 'クライアントに Chatwork ルームID が未登録' },
                  ].map(t => {
                    const active = invoiceMailPreview.channel === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => t.enabled && setInvoiceMailPreview(p => ({ ...p, channel: t.key }))}
                        disabled={!t.enabled}
                        title={t.hint}
                        style={{
                          padding: '5px 14px', fontSize: 11, fontWeight: font.weight.semibold,
                          border: '1px solid ' + (active ? color.navy : color.border),
                          background: active ? color.navy : color.white,
                          color: active ? color.white : (t.enabled ? color.textMid : color.textLight),
                          borderRadius: radius.sm,
                          cursor: t.enabled ? 'pointer' : 'not-allowed',
                          opacity: t.enabled ? 1 : 0.4,
                          fontFamily: font.family.sans,
                        }}
                      >{t.label}</button>
                    );
                  })}
                </div>
                {invoiceMailPreview.channel !== 'email' && (
                  <div style={{ fontSize: 10, color: color.textLight, marginTop: 4 }}>
                    Slack/Chatwork は PDF を本文中の<strong>署名付きURL</strong>として送付します (有効期限30日)
                  </div>
                )}
              </div>
              {/* メール時のみ: 宛先 (To): クライアント担当者から選択 + フリー入力 */}
              {invoiceMailPreview.channel === 'email' && (() => {
                const ContactChips = ({ ids, setIds, exclude = [] }) => {
                  const validContacts = invoiceMailPreview.contacts.filter(c => c.email);
                  if (validContacts.length === 0) {
                    return (
                      <div style={{ fontSize: 10, color: color.textLight, padding: '4px 0' }}>
                        このクライアントには担当者(メール付き)が登録されていません
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {validContacts.map(c => {
                        const checked = ids.includes(c.id);
                        const disabled = exclude.includes(c.id) && !checked;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              setIds(checked ? ids.filter(x => x !== c.id) : [...ids, c.id]);
                            }}
                            title={c.email}
                            style={{
                              padding: '3px 10px', borderRadius: radius.sm, fontSize: 11,
                              fontWeight: font.weight.semibold, fontFamily: font.family.sans,
                              border: '1px solid ' + (checked ? color.navy : color.border),
                              background: checked ? color.navy : color.white,
                              color: checked ? color.white : (disabled ? color.textLight : color.textMid),
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              opacity: disabled ? 0.4 : 1,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            {c.isPrimary && <span style={{ fontSize: 8, opacity: 0.7 }}>主</span>}
                            {c.name}
                            <span style={{ fontSize: 9, opacity: 0.7 }}>({c.email})</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                };
                return (
                  <>
                    <div>
                      <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>
                        宛先 (To) — 担当者から選択
                      </div>
                      <ContactChips
                        ids={invoiceMailPreview.toIds}
                        setIds={(ids) => setInvoiceMailPreview(p => ({ ...p, toIds: ids }))}
                        exclude={invoiceMailPreview.ccIds}
                      />
                      <input value={invoiceMailPreview.extraTo}
                        onChange={e => setInvoiceMailPreview(p => ({ ...p, extraTo: e.target.value }))}
                        placeholder="その他のメールアドレス (任意、複数はカンマ/空白/改行区切り)"
                        autoComplete="off"
                        style={{ width: '100%', marginTop: 4, padding: '5px 8px', border: `1px solid ${color.border}`,
                          borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.mono,
                          color: color.textDark, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>
                        Cc (任意) — 担当者から選択
                      </div>
                      <ContactChips
                        ids={invoiceMailPreview.ccIds}
                        setIds={(ids) => setInvoiceMailPreview(p => ({ ...p, ccIds: ids }))}
                        exclude={invoiceMailPreview.toIds}
                      />
                      <input value={invoiceMailPreview.extraCc}
                        onChange={e => setInvoiceMailPreview(p => ({ ...p, extraCc: e.target.value }))}
                        placeholder="その他のメールアドレス (任意、複数はカンマ/空白/改行区切り)"
                        autoComplete="off"
                        style={{ width: '100%', marginTop: 4, padding: '5px 8px', border: `1px solid ${color.border}`,
                          borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.mono,
                          color: color.textDark, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </>
                );
              })()}
              {/* Slack/Chatwork 時の宛先表示 */}
              {invoiceMailPreview.channel === 'slack' && (
                <div>
                  <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>Slack 投稿先 Webhook</div>
                  <div style={{ padding: '6px 10px', background: color.gray50, borderRadius: radius.sm,
                    fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {invoiceMailPreview.slackWebhookUrl}
                  </div>
                </div>
              )}
              {invoiceMailPreview.channel === 'chatwork' && (
                <div>
                  <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>Chatwork ルームID</div>
                  <div style={{ padding: '6px 10px', background: color.gray50, borderRadius: radius.sm,
                    fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono }}>
                    {invoiceMailPreview.chatworkRoomId}
                  </div>
                </div>
              )}
              {/* メール時のみ: 件名 */}
              {invoiceMailPreview.channel === 'email' && (
                <div>
                  <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>件名</div>
                  <input value={invoiceMailPreview.subject} onChange={e => setInvoiceMailPreview(p => ({ ...p, subject: e.target.value }))}
                    style={{ width: '100%', padding: '6px 10px', border: `1px solid ${color.border}`, borderRadius: radius.sm,
                      fontSize: font.size.sm, color: color.textDark, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>本文</div>
                <textarea value={invoiceMailPreview.body} onChange={e => setInvoiceMailPreview(p => ({ ...p, body: e.target.value }))}
                  rows={14}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${color.border}`, borderRadius: radius.sm,
                    fontSize: font.size.sm, color: color.textDark, outline: 'none', boxSizing: 'border-box',
                    fontFamily: font.family.sans, lineHeight: 1.6, resize: 'vertical' }} />
              </div>
              <div style={{
                padding: '8px 12px', background: color.gray50, borderRadius: radius.sm,
                fontSize: font.size.xs, color: color.textMid, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>📎 添付:</span>
                <span style={{ color: color.navy, fontWeight: font.weight.semibold }}>{invoiceMailPreview.filename}</span>
              </div>
            </div>
            <div style={{ padding: '10px 20px', borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="outline" size="sm" disabled={invoiceMailSending} onClick={() => setInvoiceMailPreview(null)}>
                キャンセル
              </Button>
              {(() => {
                const parseExtra = (raw) => String(raw || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
                const toContacts = invoiceMailPreview.contacts.filter(c => invoiceMailPreview.toIds.includes(c.id) && c.email);
                const ccContacts = invoiceMailPreview.contacts.filter(c => invoiceMailPreview.ccIds.includes(c.id) && c.email);
                const toEmails = [...toContacts.map(c => c.email), ...parseExtra(invoiceMailPreview.extraTo)];
                const ccEmails = [...ccContacts.map(c => c.email), ...parseExtra(invoiceMailPreview.extraCc)];
                const channel = invoiceMailPreview.channel;
                const canSend = !invoiceMailSending && (
                  channel === 'email' ? toEmails.length > 0
                  : channel === 'slack' ? !!invoiceMailPreview.slackWebhookUrl
                  : channel === 'chatwork' ? !!invoiceMailPreview.chatworkRoomId
                  : false
                );
                const btnLabel = invoiceMailSending ? '送信中…'
                  : channel === 'email' ? `送信する (To: ${toEmails.length}件${ccEmails.length > 0 ? ' / Cc: ' + ccEmails.length + '件' : ''})`
                  : channel === 'slack' ? 'Slack に送信'
                  : channel === 'chatwork' ? 'Chatwork に送信'
                  : '送信する';
                return (
                  <Button variant="primary" size="sm" loading={invoiceMailSending} disabled={!canSend}
                    onClick={async () => {
                      if (!canSend) return;
                      setInvoiceMailSending(true);

                      // (1) PDF Blob 作成 + (2) Storage 保存 + (3) DB履歴記録
                      const byteChars = atob(invoiceMailPreview.pdfBase64);
                      const byteArr = new Uint8Array(byteChars.length);
                      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
                      const pdfBlob = new Blob([byteArr], { type: 'application/pdf' });

                      let archiveFilePath = null;
                      let archiveError = null;
                      try {
                        const archiveRes = await saveSentInvoiceArchive({
                          clientId: invoiceMailPreview.clientId,
                          clientName: invoiceClient,
                          invoiceMonth: invoiceMonth,
                          filename: invoiceMailPreview.filename,
                          pdfBlob,
                          toEmails: channel === 'email' ? toEmails : [`(${channel})${channel === 'slack' ? invoiceMailPreview.slackWebhookUrl : invoiceMailPreview.chatworkRoomId}`],
                          ccEmails: channel === 'email' ? ccEmails : [],
                          subject: invoiceMailPreview.subject,
                        });
                        archiveFilePath = archiveRes.file_path;
                        archiveError = archiveRes.error;
                      } catch (e) {
                        console.warn('[invoice] archive save failed:', e);
                        archiveError = e;
                      }

                      // 送信処理
                      let sendError = null;
                      if (channel === 'email') {
                        const { error } = await invokeSendEmail({
                          to: toEmails.join(', '),
                          cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
                          subject: invoiceMailPreview.subject,
                          body: invoiceMailPreview.body,
                          attachments: [{
                            filename: invoiceMailPreview.filename,
                            data: invoiceMailPreview.pdfBase64,
                            mimeType: 'application/pdf',
                          }],
                        });
                        sendError = error;
                      } else {
                        // Slack/Chatwork: Storage 保存成功が前提 (PDF添付がURL形式のため)
                        if (!archiveFilePath) {
                          setInvoiceMailSending(false);
                          const errDetail = archiveError ? `\n\n詳細エラー:\n${archiveError.message || JSON.stringify(archiveError)}` : '';
                          alert('PDFのStorage保存に失敗したため、Slack/Chatwork送信を中断しました。' + errDetail);
                          return;
                        }
                        const { url: signedUrl, error: urlErr } = await createInvoiceSignedUrl(archiveFilePath);
                        if (!signedUrl) {
                          setInvoiceMailSending(false);
                          alert('PDFの署名URL生成に失敗: ' + (urlErr?.message || '不明'));
                          return;
                        }
                        const target = channel === 'slack' ? invoiceMailPreview.slackWebhookUrl : invoiceMailPreview.chatworkRoomId;
                        const { ok, error } = await invokeSendInvoiceToChannel({
                          channel_type: channel,
                          target,
                          text: invoiceMailPreview.body,
                          attachment_url: signedUrl,
                          attachment_filename: invoiceMailPreview.filename,
                        });
                        if (!ok) sendError = new Error(error || `${channel} 送信失敗`);
                      }

                      if (sendError) {
                        setInvoiceMailSending(false);
                        alert('送信失敗: ' + (sendError.message || sendError));
                        return;
                      }

                      // (1') ローカルDL (email/slack/chatwork どれでも控えとしてDL)
                      try {
                        const { saveAs } = await import('file-saver');
                        saveAs(pdfBlob, invoiceMailPreview.filename);
                      } catch (e) { console.warn(e); }

                      setInvoiceMailSending(false);
                      const channelName = channel === 'email' ? 'メール' : channel === 'slack' ? 'Slack' : 'Chatwork';
                      alert(`${invoiceClient} 様に請求書を${channelName}で送信しました\n\n請求書PDFをローカル保存 + Spanaviにアーカイブしました`);
                      setInvoiceMailPreview(null);
                      setInvoiceModal(false);
                    }}>
                    {btnLabel}
                  </Button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {invoiceModal && setAppoData && (() => {
        const isBulkEdit = !!bulkInvoiceEditingClient;
        const invoiceClientsBase = [...new Set(appoData.filter(a => a.status === '面談済' && a.meetDate && a.meetDate.slice(0, 7) === invoiceMonth).map(a => a.client))].filter(Boolean);
        // 3月イレギュラー: エムステージマネジメントソリューションズを追加
        if (invoiceMonth === '2026-03' && !invoiceClientsBase.includes('株式会社エムステージマネジメントソリューションズ')) {
          invoiceClientsBase.push('株式会社エムステージマネジメントソリューションズ');
        }
        const invoiceClients = invoiceClientsBase;
        const previewClient = clientData.find(c => c.company === invoiceClient);
        const previewRm = previewClient ? rewardMaster.find(r => r.id === previewClient.rewardType) : null;
        const previewTaxType = previewRm?.tax || '税別';
        const previewSubtotal = invoiceItems.reduce((s, it) => s + it.amount, 0);
        const previewTax = previewTaxType === '税別' ? Math.floor(previewSubtotal * 0.1) : Math.floor(previewSubtotal - previewSubtotal / 1.1);
        const previewGrandTotal = previewTaxType === '税別' ? previewSubtotal + previewTax : previewSubtotal;
        const invInputStyle = { padding: '4px 8px', borderRadius: 3, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: 'none', background: color.white };

        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 640, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
              <div style={{ padding: "12px 24px", background: color.navy, borderRadius: '4px 4px 0 0', color: color.white, fontWeight: font.weight.semibold, fontSize: 15, flexShrink: 0 }}>
                {isBulkEdit ? `請求書を編集 — ${bulkInvoiceEditingClient}` : '請求書作成'}
              </div>
              <div style={{ padding: "20px 24px", overflowY: 'auto', flex: 1 }}>
                {/* 月 + クライアント選択 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4, display: 'block' }}>対象月</label>
                    <select value={invoiceMonth} disabled={isBulkEdit}
                      onChange={e => {
                        const v = e.target.value;
                        setInvoiceMonth(v); setInvoiceClient(''); setInvoiceItems([]);
                        const [yy, mm] = v.split('-').map(Number);
                        const dd = mm === 12 ? new Date(yy + 1, 0, 1) : new Date(yy, mm, 1);
                        setInvoiceIssueDate(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`);
                      }}
                      style={{ width: '100%', padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", outline: "none", background: isBulkEdit ? color.gray100 : color.white, color: isBulkEdit ? color.textMid : 'inherit' }}>
                      {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4, display: 'block' }}>クライアント</label>
                    <select value={invoiceClient} disabled={isBulkEdit}
                      onChange={e => { setInvoiceClient(e.target.value); if (e.target.value) initInvoiceItems(e.target.value, invoiceMonth); else setInvoiceItems([]); }}
                      style={{ width: '100%', padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", outline: "none", background: isBulkEdit ? color.gray100 : color.white, color: isBulkEdit ? color.textMid : 'inherit' }}>
                      <option value="">選択してください</option>
                      {invoiceClients.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                </div>

                {/* 請求日 */}
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 4, display: 'block' }}>請求日</label>
                  <input type="date" value={invoiceIssueDate} onChange={e => setInvoiceIssueDate(e.target.value)}
                    style={{ padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", outline: "none" }} />
                </div>

                {/* 編集可能な明細テーブル */}
                {invoiceClient && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>明細（{invoiceItems.length}件）</span>
                      <Button onClick={() => setInvoiceItems(prev => [...prev, { company: '', quantity: 1, unitPrice: 0, amount: 0, note: '' }])}
                        variant="outline" size="sm">
                        ＋ 行を追加
                      </Button>
                    </div>
                    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
                      {/* テーブルヘッダー */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 90px 120px 28px', gap: 0, background: color.gray100, padding: '6px 10px', fontSize: 10, fontWeight: font.weight.semibold, color: color.gray700 }}>
                        <span>品名</span><span style={{ textAlign: 'center' }}>数量</span><span style={{ textAlign: 'right' }}>単価</span><span style={{ textAlign: 'right' }}>金額</span><span style={{ paddingLeft: 6 }}>備考</span><span></span>
                      </div>
                      {/* 明細行 */}
                      {invoiceItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 90px 120px 28px', gap: 4, padding: '5px 10px', borderTop: `1px solid ${color.border}`, alignItems: 'center' }}>
                          <input value={item.company} onChange={e => setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, company: e.target.value } : it))}
                            style={{ ...invInputStyle, width: '100%' }} />
                          <input type="number" value={item.quantity} onChange={e => { const q = Number(e.target.value) || 0; setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: q, amount: q * it.unitPrice } : it)); }}
                            style={{ ...invInputStyle, width: '100%', textAlign: 'center' }} />
                          <input type="number" value={item.unitPrice} onChange={e => { const p = Number(e.target.value) || 0; setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: p, amount: it.quantity * p } : it)); }}
                            style={{ ...invInputStyle, width: '100%', textAlign: 'right' }} />
                          <span style={{ textAlign: 'right', fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy, fontFamily: "'JetBrains Mono'", paddingRight: 4 }}>{formatCurrency(item.amount)}</span>
                          <input value={item.note || ''} onChange={e => setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, note: e.target.value } : it))}
                            placeholder="備考" style={{ ...invInputStyle, width: '100%', fontSize: 10 }} />
                          <button onClick={() => setInvoiceItems(prev => prev.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: color.danger, fontSize: 14, padding: 0, lineHeight: 1 }} title="削除">×</button>
                        </div>
                      ))}
                      {invoiceItems.length === 0 && (
                        <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: font.size.xs, color: color.textLight }}>明細行がありません</div>
                      )}
                    </div>

                    {/* 合計セクション */}
                    <div style={{ marginTop: 12, padding: 14, background: '#F8F9FA', borderRadius: radius.md, border: `1px solid ${color.border}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: font.size.xs }}>
                        <span style={{ color: color.textLight }}>小計</span>
                        <span style={{ fontWeight: font.weight.semibold, color: color.navy, textAlign: 'right', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(previewSubtotal)}</span>
                        {previewTaxType === '税別' && <>
                          <span style={{ color: color.textLight }}>消費税 (10%)</span>
                          <span style={{ fontWeight: font.weight.semibold, color: color.navy, textAlign: 'right', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(previewTax)}</span>
                        </>}
                        <span style={{ color: color.textLight, fontWeight: font.weight.semibold }}>ご請求金額</span>
                        <span style={{ fontWeight: font.weight.bold, color: color.navy, textAlign: 'right', fontSize: 14, fontFamily: "'JetBrains Mono'" }}>{formatCurrency(previewGrandTotal)}</span>
                        {previewTaxType === '税込' && (
                          <>
                            <span></span>
                            <span style={{ fontSize: 9, color: color.textMid, textAlign: 'right' }}>（内消費税 {formatCurrency(previewTax)}）</span>
                          </>
                        )}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 10, color: color.textMid }}>
                        税区分: {previewTaxType}　/　支払サイト: {previewClient?.paySite || '未設定'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: "12px 24px", borderTop: `1px solid ${color.border}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
                <Button onClick={() => {
                  setInvoiceModal(false);
                  if (isBulkEdit) {
                    setBulkInvoiceEditingClient(null);
                  } else {
                    setInvoiceItems([]);
                  }
                }} variant="outline" size="sm">
                  キャンセル
                </Button>
                {isBulkEdit ? (
                  <Button onClick={() => {
                    setBulkInvoiceDrafts(prev => ({ ...prev, [bulkInvoiceEditingClient]: invoiceItems }));
                    setInvoiceModal(false);
                    setBulkInvoiceEditingClient(null);
                  }} disabled={invoiceItems.length === 0} variant="primary" size="sm">
                    保存して一覧に戻る
                  </Button>
                ) : (
                  <>
                    <Button onClick={async () => {
                      if (!invoiceClient || invoiceItems.length === 0) return;
                      setInvoiceMailGenerating(true);
                      try {
                        const { pdfBase64, filename, monthLabel } = await generateInvoicePdfBase64(invoiceClient, invoiceMonth);
                        const client = clientData.find(c => c.company === invoiceClient);
                        const contacts = (client?._supaId && contactsByClient[client._supaId]) || [];
                        const primary = contacts.find(ct => ct.isPrimary) || contacts[0];
                        // 連絡手段の自動判定: メール優先、Slack/Chatworkは webhook/room_id が登録されていれば候補
                        const cm = client?.contact;
                        let defaultChannel = 'email';
                        if (cm === 'Slack' && client?.slackWebhookUrl) defaultChannel = 'slack';
                        else if (cm === 'Chatwork' && client?.chatworkRoomId) defaultChannel = 'chatwork';
                        const body = `${invoiceClient} 様\n\nお世話になっております。\nM&Aソーシングパートナーズの篠宮でございます。\n\nこのたび、${monthLabel}分の請求書を添付にてお送り申し上げます。\n記載日までに、下記口座へお振込みいただけますと幸甚に存じます。\n\n― 振込先口座 ―\n GMOあおぞらネット銀行　法人営業部（101）\n 普通預金　2370528\n M&Aソーシングパートナーズ株式会社\n\n今後とも、貴社にとって有益となるアポイントの取得に尽力してまいりますので、変わらぬご高配を賜れますようお願い申し上げます。\n何卒よろしくお願い申し上げます。\n\nMASP 篠宮`;
                        setInvoiceMailPreview({
                          channel: defaultChannel,
                          toIds: primary ? [primary.id] : [],
                          ccIds: [],
                          extraTo: '',
                          extraCc: '',
                          subject: `【業務委託料_${monthLabel}分】M&Aソーシングパートナーズ`,
                          body, filename, pdfBase64, monthLabel,
                          contacts: contacts.map(ct => ({ id: ct.id, name: ct.name, email: ct.email, isPrimary: ct.isPrimary })),
                          slackWebhookUrl: client?.slackWebhookUrl || '',
                          chatworkRoomId: client?.chatworkRoomId || '',
                          clientId: client?._supaId || null,
                        });
                      } catch (e) {
                        alert('PDF生成に失敗: ' + (e.message || ''));
                      }
                      setInvoiceMailGenerating(false);
                    }} disabled={!invoiceClient || invoiceItems.length === 0 || invoiceMailGenerating || invoiceExporting}
                      loading={invoiceMailGenerating} variant="outline" size="sm">
                      {invoiceMailGenerating ? 'PDF生成中…' : 'メールで送付'}
                    </Button>
                    <Button onClick={handleInvoiceExport} disabled={!invoiceClient || invoiceItems.length === 0 || invoiceExporting}
                      loading={invoiceExporting} variant="primary" size="sm">
                      {invoiceExporting ? 'PDF生成中...' : 'PDFダウンロード'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none", background: color.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 520, maxWidth: '95vw', maxHeight: "90vh", overflow: "auto", boxShadow: shadow.xl }}>
              <div style={{ padding: "12px 24px", background: color.navy, borderRadius: '4px 4px 0 0', color: color.white, fontWeight: font.weight.semibold, fontSize: 15 }}>
                <div style={{ fontSize: 15, fontWeight: font.weight.semibold }}>アポ情報を編集</div>
                <div style={{ fontSize: font.size.xs, color: '#CBD5E1', marginTop: 2 }}>{editForm.company}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント</label>
                    <select value={editForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                      setEditForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者</label><MemberSuggestInput value={editForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={editForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={editForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>
                      当社売上
                      <span style={{ marginLeft: 6, fontSize: 9, color: color.textLight, fontWeight: font.weight.normal }}>
                        ※ 変更するとインターン報酬を担当者のインセンティブ率で自動再計算
                      </span>
                    </label>
                    <input
                      type="number"
                      value={editForm.sales}
                      onChange={e => {
                        const newSales = Number(e.target.value) || 0;
                        // 担当アポインターのincentive率取得 (DBから取得した実マップを使用)
                        const rate = memberRateByName[editForm.getter] || 0;
                        // 該当クライアントの calc_type を判定
                        const client = clientData.find(c => c.company === editForm.client);
                        const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                        const isFixedPerAppo = rewardRow?.calc_type === 'fixed_per_appo';
                        // calc_type='fixed_per_appo' の場合は sales=reward 一律 (個別レート無視)
                        // それ以外 (rate) は sales × member.incentive_rate
                        const newReward = isFixedPerAppo ? newSales : (rate ? Math.round(newSales * rate) : 0);
                        setEditForm(p => ({ ...p, sales: newSales, reward: newReward }));
                      }}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      インターン報酬
                      <span style={{ marginLeft: 6, fontSize: 9, color: color.textLight, fontWeight: font.weight.normal }}>
                        (自動計算、手動上書き可)
                      </span>
                    </label>
                    <input type="number" value={editForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={editForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${color.border}`, display: "flex", justifyContent: "space-between" }}>
                <Button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteAppointment(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setAppoData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null);
                }} variant="outline" size="sm" style={{ borderColor: color.danger, color: color.danger }}>削除</Button>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={() => setEditForm(null)} variant="outline" size="sm">キャンセル</Button>
                  <Button variant="primary" size="sm" onClick={async () => {
                    const idx = editForm._idx;
                    const original = appoData[idx];
                    const updated = { ...editForm };
                    delete updated._idx;

                    const wasKanryo = original?.status === '面談済';
                    const isKanryo  = updated.status === '面談済';

                    // ── 面談済ステータス変更時の累計売上更新 ──────────
                    // intern_reward はアポ取得時の確定値を維持（上書きしない）
                    if ((isKanryo || wasKanryo) && setMembers) {
                      const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                      if (member?._supaId) {
                        // cumulative_sales の増減を 4パターン分岐:
                        // 1) アポ取得→面談済: +新売上
                        // 2) 面談済→アポ取得: -元売上
                        // 3) 面談済→面談済 (額変更): +(新売上-元売上) ← 売上額編集の差分
                        // 4) 両方面談済以外: 0
                        const delta = (isKanryo && !wasKanryo)  ?  (updated.sales  || 0)
                                    : (!isKanryo && wasKanryo)  ? -(original.sales || 0)
                                    : (isKanryo && wasKanryo)   ?  ((updated.sales || 0) - (original.sales || 0))
                                    : 0;
                        if (delta !== 0) {
                          const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                          const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                          const rewardErr = await updateMemberReward(member._supaId, {
                            cumulativeSales: newTotal,
                            rank: newRank,
                            incentiveRate: newRate,
                          });
                          if (rewardErr) { alert('累計売上の更新に失敗しました。管理者に連絡してください。'); }
                          else {
                            setMembers(prev => prev.map(m =>
                              (typeof m !== 'string' && m._supaId === member._supaId)
                                ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate }
                                : m
                            ));
                            if (original?._supaId) await updateAppoCounted(original._supaId, isKanryo);
                            // データ全体を refetch して画面表示と DB を完全同期
                            if (onDataRefetch) onDataRefetch();
                          }
                        }
                      }
                    }

                    if (updated._supaId) {
                      const error = await updateAppointment(updated._supaId, updated);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                    }
                    setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                    setEditForm(null);
                  }}>保存</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Appo Modal */}
      {addAppoForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none", background: color.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddAppoForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 520, maxWidth: '95vw', maxHeight: "90vh", overflow: "auto", boxShadow: shadow.xl }}>
              <div style={{ padding: "12px 24px", background: color.navy, borderRadius: '4px 4px 0 0', color: color.white, fontWeight: font.weight.semibold, fontSize: 15 }}>
                <div style={{ fontSize: 15, fontWeight: font.weight.semibold }}>アポを追加</div>
                <div style={{ fontSize: font.size.xs, color: '#CBD5E1', marginTop: 2 }}>新規アポイント登録</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント名</label>
                    <select value={addAppoForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                      setAddAppoForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名 <span style={{ color: "#e53835" }}>*</span></label><input value={addAppoForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者名</label><MemberSuggestInput value={addAppoForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addAppoForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={addAppoForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={addAppoForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={addAppoForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={addAppoForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={addAppoForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${color.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button onClick={() => setAddAppoForm(null)} variant="outline" size="sm">キャンセル</Button>
                <Button variant="primary" size="sm" disabled={addAppoSaving} onClick={async () => {
                  if (!addAppoForm.company.trim()) return;
                  if (addAppoSavingRef.current) return;
                  addAppoSavingRef.current = true;
                  setAddAppoSaving(true);
                  try {
                    const newAppo = {
                      client: addAppoForm.client,
                      company: addAppoForm.company,
                      getter: addAppoForm.getter,
                      getDate: addAppoForm.getDate,
                      meetDate: addAppoForm.meetDate,
                      status: addAppoForm.status,
                      sales: addAppoForm.sales,
                      reward: addAppoForm.reward,
                      note: addAppoForm.note,
                      month: addAppoForm.meetDate ? (parseInt(addAppoForm.meetDate.slice(5, 7), 10) + '月') : '',
                    };
                    const { result, error } = await insertAppointment(addAppoForm);
                    if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
                    newAppo._supaId = result.id;
                    setAppoData(prev => [...prev, newAppo]);
                    setAddAppoForm(null);
                  } finally {
                    addAppoSavingRef.current = false;
                    setAddAppoSaving(false);
                  }
                }}>{addAppoSaving ? '保存中…' : '保存'}</Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Appointment Detail Modal */}
      {reportDetail && (
        <div onClick={() => setReportDetail(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(10,25,41,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, animation: "fadeIn 0.2s ease",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, width: 520, maxWidth: '95vw', maxHeight: "80vh", overflow: "auto",
            boxShadow: "0 20px 60px rgba(10,25,41,0.3)",
          }}>
            <div style={{
              background: color.navy,
              padding: "12px 24px", borderRadius: "4px 4px 0 0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 15, fontWeight: font.weight.semibold, color: color.white }}>アポイント詳細</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {!detailEditing && setCallFlowScreen && (
                  <button disabled={detailNavigating} onClick={async () => {
                    setDetailNavigating(true);
                    try {
                      const phone = (reportDetail?.phone || '').replace(/[^\d]/g, '');
                      const { data } = await fetchCallListItemByAppo(reportDetail.company, phone, reportDetail.list_id, reportDetail.item_id);
                      if (!data?.list_id) { alert('架電リストが見つかりませんでした'); return; }
                      const list = callListData.find(l => l._supaId === data.list_id);
                      setCallFlowScreen({ list: list || { _supaId: data.list_id, id: data.list_id, company: '' }, defaultItemId: data.id, defaultListMode: false, singleItemMode: true });
                      setReportDetail(null);
                    } catch (e) {
                      console.error('[detailNavigate]', e);
                      alert('遷移に失敗しました');
                    } finally { setDetailNavigating(false); }
                  }}
                    style={{ padding: "4px 12px", borderRadius: radius.md, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: color.white, cursor: detailNavigating ? "default" : "pointer", opacity: detailNavigating ? 0.6 : 1, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'" }}>
                    {detailNavigating ? '検索中...' : '架電ページへ'}
                  </button>
                )}
                {!detailEditing ? (
                  <button onClick={async () => {
                    setDetailEditForm({ ...reportDetail, _idx: appoData.findIndex(a => a._supaId === reportDetail._supaId) });
                    setDetailEditing(true);
                    // call_list_items から既存のキーマン携帯番号を読み込み（録音検索のデフォルト値に）
                    setKeymanMobileInput('');
                    setShowKeymanLookup(false);
                    if (reportDetail?.item_id) {
                      try {
                        const { data: item } = await fetchCallListItemById(reportDetail.item_id);
                        if (item?.keyman_mobile) {
                          setKeymanMobileInput(item.keyman_mobile);
                          setShowKeymanLookup(true);
                        }
                      } catch (e) { console.warn('[detail edit] keyman_mobile load error:', e); }
                    }
                  }}
                    style={{ padding: "4px 12px", borderRadius: radius.md, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: color.white, cursor: "pointer", fontSize: font.size.xs, fontFamily: "'Noto Sans JP'" }}>
                    編集
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setDetailEditing(false); setDetailEditForm(null); }}
                      style={{ padding: "4px 12px", borderRadius: radius.md, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: 'rgba(255,255,255,0.8)', cursor: "pointer", fontSize: font.size.xs, fontFamily: "'Noto Sans JP'" }}>
                      キャンセル
                    </button>
                    <button disabled={detailSaving} onClick={async () => {
                      const idx = detailEditForm._idx;
                      const original = appoData[idx];
                      const updated = { ...detailEditForm };
                      delete updated._idx;
                      const wasKanryo = original?.status === '面談済';
                      const isKanryo  = updated.status === '面談済';
                      if ((isKanryo || wasKanryo) && setMembers) {
                        const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                        if (member?._supaId) {
                          // 4パターン: ①取得→面談済 +新売上 / ②面談済→取得 -元売上 / ③面談済→面談済 売上額差分 / ④それ以外 0
                          const delta = (isKanryo && !wasKanryo) ? (updated.sales || 0)
                                      : (!isKanryo && wasKanryo) ? -(original.sales || 0)
                                      : (isKanryo && wasKanryo)  ? ((updated.sales || 0) - (original.sales || 0))
                                      : 0;
                          if (delta !== 0) {
                            const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                            const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                            const rewardErr = await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
                            if (rewardErr) { alert('累計売上の更新に失敗しました。管理者に連絡してください。'); }
                            else {
                              setMembers(prev => prev.map(m => (typeof m !== 'string' && m._supaId === member._supaId) ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate } : m));
                              if (original?._supaId) await updateAppoCounted(original._supaId, isKanryo);
                              if (onDataRefetch) onDataRefetch();
                            }
                          }
                        }
                      }
                      setDetailSaving(true);
                      if (updated._supaId) {
                        const error = await updateAppointment(updated._supaId, updated);
                        setDetailSaving(false);
                        if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      } else { setDetailSaving(false); }
                      setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                      setReportDetail(updated);
                      setDetailEditing(false); setDetailEditForm(null);
                    }} style={{ padding: "4px 14px", borderRadius: radius.md, border: "none", background: detailSaving ? color.border : '#1E40AF', color: color.white, cursor: detailSaving ? "default" : "pointer", fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: "'Noto Sans JP'" }}>
                      {detailSaving ? '保存中…' : '保存'}
                    </button>
                  </>
                )}
                <button onClick={() => setReportDetail(null)} style={{ width: 28, height: 28, borderRadius: radius.md, background: 'rgba(255,255,255,0.15)', border: "none", color: color.white, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {(() => {
                const ef = detailEditForm;
                const iS = { width: "100%", padding: "4px 8px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: "none", background: color.white, boxSizing: "border-box" };
                const u = (k, v) => setDetailEditForm(p => ({ ...p, [k]: v }));
                return (
                  <>
                    {detailEditing
                      ? <input value={ef.company} onChange={e => u("company", e.target.value)} style={{ ...iS, fontSize: 16, fontWeight: font.weight.bold, marginBottom: 12, padding: "6px 10px" }} />
                      : <div style={{ fontSize: 18, fontWeight: font.weight.black, color: color.navy, marginBottom: 12 }}>{reportDetail.company}</div>
                    }
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      {/* クライアント */}
                      <div style={{ padding: "8px 12px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>クライアント</div>
                        {detailEditing
                          ? <select value={ef.client} onChange={e => { const name = e.target.value; const cl = clientOptions.find(c => c.company === name); const rr = cl?.rewardType ? rewardMaster.find(r => r.id === cl.rewardType) : null; u("client", name); if (name && rr) u("sales", rr.price); }} style={iS}>
                              <option value="">選択...</option>
                              {clientOptions.map(c => <option key={c._supaId || c.company} value={c.company}>{c.company}{c.status === "停止中" ? "（停止中）" : ""}</option>)}
                            </select>
                          : <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{reportDetail.client}</div>}
                      </div>
                      {/* 取得者 */}
                      <div style={{ padding: "8px 12px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>取得者</div>
                        {detailEditing
                          ? <MemberSuggestInput value={ef.getter} onChange={v => u("getter", v)} members={members} style={iS} />
                          : <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{reportDetail.getter}</div>}
                      </div>
                      {/* 取得日 */}
                      <div style={{ padding: "8px 12px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>取得日</div>
                        {detailEditing
                          ? <input type="date" value={ef.getDate} onChange={e => u("getDate", e.target.value)} style={iS} />
                          : <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{reportDetail.getDate}</div>}
                      </div>
                      {/* 面談日 */}
                      <div style={{ padding: "8px 12px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>面談日</div>
                        {detailEditing
                          ? <input type="date" value={ef.meetDate} onChange={e => u("meetDate", e.target.value)} style={iS} />
                          : <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{reportDetail.meetDate}</div>}
                      </div>
                      {/* ステータス */}
                      <div style={{ padding: "8px 12px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>ステータス</div>
                        {detailEditing
                          ? <select value={ef.status} onChange={e => u("status", e.target.value)} style={iS}>
                              <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                            </select>
                          : <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{reportDetail.status}</div>}
                      </div>
                      {/* 月（読み取り専用） */}
                      <div style={{ padding: "8px 12px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2 }}>月</div>
                        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
                          {(detailEditing ? ef.meetDate : reportDetail.meetDate) ? (parseInt((detailEditing ? ef.meetDate : reportDetail.meetDate).slice(5, 7), 10) + "月") : null}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      <div style={{ padding: "10px 14px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>当社売上</div>
                        {detailEditing
                          ? <input type="number" value={ef.sales} onChange={e => u("sales", Number(e.target.value))} style={iS} />
                          : <div style={{ fontSize: 20, fontWeight: font.weight.black, color: color.navy, fontFamily: "'JetBrains Mono'" }}>{reportDetail.sales > 0 ? "¥" + reportDetail.sales.toLocaleString() : "-"}</div>}
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}` }}>
                        <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>インターン報酬</div>
                        {detailEditing
                          ? <input type="number" value={ef.reward} onChange={e => u("reward", Number(e.target.value))} style={iS} />
                          : <div style={{ fontSize: 20, fontWeight: font.weight.black, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{reportDetail.reward > 0 ? "¥" + reportDetail.reward.toLocaleString() : "-"}</div>}
                      </div>
                    </div>
                    {detailEditing && (
                      <div style={{ marginBottom: 12, textAlign: "right" }}>
                        <Button onClick={async () => {
                          if (!reportDetail._supaId) return;
                          if (!window.confirm('このアポを削除しますか？')) return;
                          const error = await deleteAppointment(reportDetail._supaId);
                          if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                          if (setAppoData) setAppoData(prev => prev.filter(a => a._supaId !== reportDetail._supaId));
                          setReportDetail(null);
                        }} variant="outline" size="sm" style={{ borderColor: color.danger, color: color.danger }}>
                          削除
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
              {/* ── 備考 ── */}
              <div style={{ padding: "10px 14px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}`, marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>備考</div>
                {detailEditing ? (
                  <textarea
                    value={detailEditForm.note || ''}
                    onChange={e => setDetailEditForm(f => ({ ...f, note: e.target.value }))}
                    rows={4}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: radius.lg, border: `1px solid ${color.borderLight}`,
                      fontSize: font.size.sm, fontFamily: "'Noto Sans JP'", lineHeight: 1.7, resize: "vertical",
                      outline: "none", background: color.white, color: color.textDark, boxSizing: "border-box" }}
                  />
                ) : reportDetail.note ? (
                  <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.note}</div>
                ) : (
                  <div style={{ fontSize: font.size.xs, color: color.textLight }}>備考なし</div>
                )}
              </div>
              {/* ── アポ取得報告 ── */}
              <div style={{ padding: "10px 14px", borderRadius: radius.md, background: '#F8F9FA', border: `1px solid ${color.border}`, borderLeft: `3px solid ${color.navy}`, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.navy, marginBottom: 6 }}>アポ取得報告</div>
                {detailEditing ? (
                  <textarea
                    value={detailEditForm.appoReport || ''}
                    onChange={e => setDetailEditForm(f => ({ ...f, appoReport: e.target.value }))}
                    rows={10}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: radius.lg, border: `1px solid ${color.borderLight}`,
                      fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", lineHeight: 1.7, resize: "vertical",
                      outline: "none", background: color.white, color: color.textDark, boxSizing: "border-box" }}
                  />
                ) : reportDetail.appoReport ? (
                  <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.appoReport}</div>
                ) : (
                  <div style={{ fontSize: font.size.xs, color: color.textLight, textAlign: "center", padding: "8px 0" }}>
                    アポ取得報告はまだ登録されていません
                  </div>
                )}
                {detailEditing && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        onClick={handleTranscribeDetail}
                        disabled={transcribeStep !== 'idle'}
                        variant="outline" size="sm">
                        {transcribeStep === 'fetching'     && '録音を検索中...'}
                        {transcribeStep === 'transcribing' && '文字起こし中...'}
                        {transcribeStep === 'enhancing'    && 'AI添削中...'}
                        {transcribeStep === 'done'         && '添削完了'}
                        {transcribeStep === 'error'        && '録音データが見つかりませんでした'}
                        {transcribeStep === 'idle'         && '文字起こし＋AI添削'}
                      </Button>
                      <Button
                        onClick={handleFetchHpDetail}
                        disabled={hpStep !== 'idle'}
                        variant="outline" size="sm">
                        {hpStep === 'fetching' && 'HP取得中...'}
                        {hpStep === 'done'     && 'HP取得完了'}
                        {hpStep === 'error'    && 'HPが見つかりませんでした'}
                        {hpStep === 'idle'     && 'HP自動取得'}
                      </Button>
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
                    </div>
                    {showKeymanLookup && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 6 }}>
                        <span style={{ fontSize: 10, color: color.textLight, whiteSpace: 'nowrap' }}>携帯番号</span>
                        <input
                          type="tel"
                          value={keymanMobileInput}
                          onChange={e => setKeymanMobileInput(e.target.value)}
                          placeholder="例: 09012345678"
                          style={{ flex: 1, minWidth: 140, padding: '3px 8px', borderRadius: radius.sm, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.mono, outline: 'none', background: color.white }}
                        />
                        <Button
                          onClick={handleLookupRecordingByKeymanMobile}
                          disabled={keymanLookupStep !== 'idle' || !keymanMobileInput.trim()}
                          variant="outline" size="sm">
                          {keymanLookupStep === 'fetching' && '検索中…'}
                          {keymanLookupStep === 'done'     && '取得完了'}
                          {keymanLookupStep === 'error'    && '見つかりませんでした'}
                          {keymanLookupStep === 'idle'     && '録音を取得'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {(() => {
                const src = reportDetail.appoReport || reportDetail.note || '';
                const m = src.match(/録音URL[：:]\s*(https?:\/\/\S+)/);
                const recUrl = reportDetail.recordingUrl || m?.[1]?.trim() || '';
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ padding: '5px 8px', borderRadius: radius.md, background: '#F8F9FA',
                      display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, whiteSpace: 'nowrap' }}>録音</span>
                      {recUrl
                        ? <button onClick={() => setShowRecordingDetail(v => !v)}
                            title={showRecordingDetail ? "閉じる" : "録音を再生"}
                            style={{ fontSize: font.size.sm, background: 'none', border: 'none', cursor: 'pointer',
                              padding: 0, lineHeight: 1, color: showRecordingDetail ? color.danger : 'inherit' }}>録音</button>
                        : <span style={{ fontSize: font.size.xs, color: color.textLight }}>録音なし</span>
                      }
                      {!detailEditing && (
                        <Button onClick={() => { setShowReplaceUrl(v => !v); setReplaceUrl(''); setReplaceStep('idle'); }}
                          variant={showReplaceUrl ? 'primary' : 'outline'} size="sm"
                          style={{ marginLeft: 'auto' }}>
                          {showReplaceUrl ? '閉じる' : '差し替え'}
                        </Button>
                      )}
                    </div>
                    {showRecordingDetail && recUrl && (
                      <InlineAudioPlayer url={recUrl} onClose={() => setShowRecordingDetail(false)} />
                    )}
                    {showReplaceUrl && !detailEditing && (
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => {
                          e.preventDefault(); setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/') || /\.(mp3|mp4|m4a|wav|ogg|webm)$/i.test(file.name))) {
                            handleDropRecording(file);
                          } else if (file) {
                            alert('音声・動画ファイルを選択してください');
                          }
                        }}
                        style={{ marginTop: 6, padding: '8px 10px', borderRadius: radius.md,
                          background: dragOver ? '#E0E7FF' : '#F0F4FF',
                          border: dragOver ? `2px dashed ${color.navy}` : '1px solid #CBD5E1',
                          transition: 'all 0.15s' }}>
                        {/* ドロップゾーン */}
                        <div style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 6 }}>
                          URLを貼り付け、または音声ファイルをドラッグ&ドロップ
                        </div>
                        {droppedFileName && replaceStep !== 'idle' && (
                          <div style={{ fontSize: 10, color: color.textMid, marginBottom: 4 }}>{droppedFileName}</div>
                        )}
                        <input
                          type="text"
                          value={replaceUrl}
                          onChange={e => setReplaceUrl(e.target.value)}
                          placeholder="https://..."
                          disabled={replaceStep !== 'idle'}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: radius.md, border: `1px solid ${color.border}`,
                            fontSize: font.size.xs, fontFamily: "'Noto Sans JP'", outline: 'none', background: replaceStep !== 'idle' ? '#f0f0f0' : color.white,
                            boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                          <Button
                            onClick={handleReplaceRecordingUrl}
                            disabled={!replaceUrl || replaceStep !== 'idle'}
                            variant="primary" size="sm">
                            {replaceStep === 'saving'       && '保存中...'}
                            {replaceStep === 'uploading'    && 'アップロード中...'}
                            {replaceStep === 'transcribing' && '文字起こし中...'}
                            {replaceStep === 'enhancing'    && 'AI添削中...'}
                            {replaceStep === 'done'         && '完了'}
                            {replaceStep === 'error'        && 'エラー（リトライ可）'}
                            {replaceStep === 'idle'         && '保存＋AI再分析'}
                          </Button>
                          {replaceStep === 'idle' && (
                            <label style={{ padding: '6px 14px', borderRadius: radius.md, border: `1px solid ${color.navy}`,
                              background: color.white, color: color.navy, cursor: 'pointer',
                              fontSize: font.size.xs, fontWeight: font.weight.medium, fontFamily: "'Noto Sans JP'" }}>
                              ファイル選択
                              <input type="file" accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.ogg,.webm"
                                style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleDropRecording(f); e.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* ── メール承認・送信 ── */}
              <EmailApprovalSection
                appo={reportDetail}
                clientData={clientData}
                contactsByClient={contactsByClient}
                onStatusUpdate={(newStatus) => {
                  const updated = { ...reportDetail, emailStatus: newStatus };
                  setReportDetail(updated);
                  if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === updated._supaId ? { ...a, emailStatus: newStatus } : a));
                }}
              />
            </div>
          </div>
        </div>
      )}
      </>
    </div>
  );
}


// ============================================================
// Members View (Employee Directory)
// ============================================================
export function MembersView({ members, setMembers, onDataRefetch }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const filtered = members.filter(m => {
    if (search && !m.name.includes(search) && !m.university.includes(search)) return false;
    return true;
  });

  // Group by team
  const teamOrder = ["代表取締役", "営業統括", "成尾", "高橋", "クライアント開拓"];
  const grouped = {};
  filtered.forEach(m => {
    const t = m.team || (m.role === "営業統括" ? "営業統括" : null);
    if (!t) return; // チーム未設定は非表示
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(m);
  });
  const sortedTeams = Object.keys(grouped).sort((a, b) => {
    const ai = teamOrder.indexOf(a); const bi = teamOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const formatCurrency = (val) => {
    if (!val) return "-";
    return "¥" + Math.round(val).toLocaleString('ja-JP');
  };

  const MEMBER_COLS_BASE = [
    { key: 'no', width: 36, align: 'center' },
    { key: 'name', width: 120, align: 'left' },
    { key: 'university', width: 180, align: 'left' },
    { key: 'year', width: 45, align: 'center' },
    { key: 'role', width: 100, align: 'center' },
    { key: 'rank', width: 80, align: 'center' },
    { key: 'sales', width: 110, align: 'right' },
    { key: 'rate', width: 110, align: 'right' },
    { key: 'joinDate', width: 100, align: 'right' },
  ];
  const MEMBER_COLS_EDIT = [...MEMBER_COLS_BASE, { key: 'edit', width: 50, align: 'center' }];
  const { columns: memCols, gridTemplateColumns: memGrid, contentMinWidth: memMinW, onResizeStart: memResize } = useColumnConfig(setMembers ? 'membersEdit' : 'members', setMembers ? MEMBER_COLS_EDIT : MEMBER_COLS_BASE);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        title="名簿"
        description="従業員名簿"
        style={{ marginBottom: 24 }}
      />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: isMobile ? "10px 12px" : "14px 18px", background: color.white, borderRadius: radius.md,
        border: `1px solid ${color.border}`,
        overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: font.size.base, fontWeight: 700, color: color.navy }}>メンバー一覧</span>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>{members.length}名</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Input
            size="sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="名前・大学で検索..."
            fullWidth={false}
            containerStyle={{ width: 180 }}
          />
          {setMembers && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setAddForm({ name: "", university: "", year: 1, team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, referrerName: "" })}
            >
              + 追加
            </Button>
          )}
          {setMembers && (
            <Button
              variant="primary"
              size="sm"
              disabled={syncLoading}
              onClick={async () => {
                setSyncLoading(true);
                setSyncResult(null);
                const { data, error } = await invokeSyncZoomUsers();
                setSyncLoading(false);
                if (error || !data) {
                  setSyncResult({ error: error?.message || '通信エラーが発生しました' });
                } else {
                  setSyncResult(data);
                  // ページのmembersステートを更新（zoom_user_idをsetMembersで反映）
                  if (data.updated?.length > 0) {
                    setMembers(prev => prev.map(m => {
                      const matched = data._updatedMap?.[m._supaId];
                      return matched ? { ...m, zoomUserId: matched } : m;
                    }));
                  }
                }
              }}
              style={{ background: syncLoading ? color.gray400 : '#1a7f5a', whiteSpace: 'nowrap' }}
            >
              {syncLoading ? "同期中..." : "Zoom ID同期"}
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sortedTeams.map(team => (
          <div key={team} style={{
            background: color.white, borderRadius: radius.md, overflowX: "auto", overflowY: "hidden",
            border: `1px solid ${color.border}`,
          }}>
            <div style={{ minWidth: memMinW }}>
            <div style={{
              padding: "10px 16px", background: color.navy,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: font.size.base, fontWeight: 700, color: color.white }}>{(team === "営業統括" || team === "代表取締役") ? team : team + "チーム"}</span>
              <span style={{ fontSize: 10, color: alpha(color.white, 0.65) }}>{grouped[team].length}名</span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: memGrid,
              padding: "8px 16px", background: color.navy, borderBottom: `1px solid ${color.navy}`,
              fontSize: font.size.xs, fontWeight: 600, color: color.white,
            }}>
              {['No', '氏名', '大学名', '学年', '役職', 'ランク', '累計売上', 'インセンティブ率', '入社日', ...(setMembers ? [''] : [])].map((label, i) => (
                <span key={i} style={{ textAlign: memCols[i]?.align || 'left', position: 'relative', userSelect: 'none' }}>
                  {label}
                  <ColumnResizeHandle colIndex={i} onResizeStart={memResize} />
                </span>
              ))}
            </div>
            {grouped[team].sort((a, b) => {
              const order = { "チームリーダー": 0, "副リーダー": 1, "営業統括": 2, "メンバー": 3, "": 4 };
              return (order[a.role] ?? 4) - (order[b.role] ?? 4);
            }).map((m, idx) => (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: memGrid,
                padding: "8px 16px", fontSize: font.size.xs, alignItems: "center",
                borderBottom: `1px solid ${color.border}`,
                background: idx % 2 === 0 ? color.white : color.cream,
              }}>
                <span style={{ fontFamily: font.family.mono, fontSize: 10, color: color.textLight, textAlign: memCols[0]?.align }}>{idx + 1}</span>
                <span style={{ fontWeight: 600, color: color.navy, textAlign: memCols[1]?.align }}>{m.name}</span>
                <span style={{ color: color.textMid, fontSize: 10, textAlign: memCols[2]?.align }}>{m.university}</span>
                <span style={{ fontFamily: font.family.mono, color: color.textLight, textAlign: memCols[3]?.align }}>{m.year}</span>
                <span style={{ textAlign: memCols[4]?.align }}>
                  {m.role === "チームリーダー" ? (
                    <Badge variant="primary" size="sm">チームリーダー</Badge>
                  ) : m.role === "副リーダー" ? (
                    <Badge variant="info" size="sm">副リーダー</Badge>
                  ) : m.role === "営業統括" ? (
                    <Badge variant="success" size="sm">営業統括</Badge>
                  ) : (
                    <span style={{ fontSize: 9, color: color.textLight, fontWeight: 600 }}>{m.role || "メンバー"}</span>
                  )}
                </span>
                <span style={{ fontSize: 10, textAlign: memCols[5]?.align, color: color.textMid }}>{m.rank || "-"}</span>
                <span style={{ fontFamily: font.family.mono, fontSize: 10, fontWeight: 500, textAlign: memCols[6]?.align, fontVariantNumeric: 'tabular-nums', color: m.totalSales > 0 ? color.navy : color.textLight }}>{formatCurrency(m.totalSales)}</span>
                <span style={{ fontFamily: font.family.mono, fontSize: 10, textAlign: memCols[7]?.align, fontVariantNumeric: 'tabular-nums', color: m.rate > 0 ? color.success : color.textLight }}>{m.rate > 0 ? (m.rate * 100).toFixed(0) + "%" : "-"}</span>
                <span style={{ fontFamily: font.family.mono, fontSize: 9, textAlign: memCols[8]?.align, color: color.textLight }}>{(m.joinDate || '').slice(2)}</span>
                {setMembers && <span style={{ textAlign: memCols[9]?.align }}><button onClick={() => setEditForm({ ...m })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: font.size.base, padding: 2 }}>&#9998;</button></span>}
              </div>
            ))}
            </div>
          </div>
        ))}
      </div>


      {/* Zoom ID Sync Result Modal */}
      {syncResult && (
        <div
          onClick={() => setSyncResult(null)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: color.white, borderRadius: 12, width: 480, maxWidth: '95vw', maxHeight: "80vh", overflow: "auto", boxShadow: shadow.xl }}>
            <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #1a7f5a, #2da57a)", borderRadius: "12px 12px 0 0", color: color.white }}>
              <div style={{ fontSize: font.size.md, fontWeight: 700 }}>Zoom ID同期結果</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {syncResult.error ? (
                <div style={{ color: "#c0392b", fontSize: font.size.base, padding: "12px 16px", background: "#fdf0ef", borderRadius: 8, border: "1px solid #e8b4b0" }}>
                  エラー：{syncResult.error}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    <div style={{ padding: "10px 14px", background: "#f0faf5", borderRadius: 8, border: "1px solid #a8dfc5" }}>
                      <span style={{ fontSize: font.size.base, fontWeight: 700, color: "#1a7f5a" }}>
                        更新成功：{syncResult.updated?.length ?? 0}名
                      </span>
                      {syncResult.updated?.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: font.size.xs, color: "#2d6a4f", lineHeight: 1.8 }}>
                          {syncResult.updated.join('　/　')}
                        </div>
                      )}
                    </div>
                    {syncResult.skipped?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: color.cream, borderRadius: 8, border: `1px solid ${color.borderLight}` }}>
                        <span style={{ fontSize: font.size.sm, color: color.textMid }}>
                          登録済みスキップ：{syncResult.skipped.length}名
                        </span>
                      </div>
                    )}
                    {syncResult.unmatched?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#fff8f0", borderRadius: 8, border: "1px solid #f5c99a" }}>
                        <span style={{ fontSize: font.size.sm, fontWeight: 700, color: "#b05e00" }}>
                          未マッチ：{syncResult.unmatched.length}名
                        </span>
                        <div style={{ marginTop: 6, fontSize: font.size.xs, color: "#7a4200", lineHeight: 1.8 }}>
                          {syncResult.unmatched.map(u => (
                            <div key={u.email}>{u.name}（{u.email}）</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {syncResult.errors?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#fdf0ef", borderRadius: 8, border: "1px solid #e8b4b0" }}>
                        <span style={{ fontSize: font.size.sm, fontWeight: 700, color: "#c0392b" }}>
                          更新エラー：{syncResult.errors.length}名
                        </span>
                        <div style={{ marginTop: 6, fontSize: font.size.xs, color: "#7b241c" }}>{syncResult.errors.join('、')}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: font.size.xs, color: color.textLight, textAlign: "center" }}>クリックで閉じる</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editForm && setMembers && (() => {
        const labelStyle = { fontSize: 10, fontWeight: 600, color: color.navy, marginBottom: 2, display: "block" };
        const readOnlyInputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`,
          fontSize: font.size.xs, fontFamily: font.family.sans, outline: "none",
          background: '#f0f4f8', color: color.navy, fontWeight: 600,
        };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, borderRadius: 12, width: 440, boxShadow: shadow.xl }}>
              <div style={{ padding: "14px 20px", background: `linear-gradient(135deg, ${color.navyDeep}, ${color.navy})`, borderRadius: "12px 12px 0 0", color: color.white }}>
                <div style={{ fontSize: font.size.md, fontWeight: 700 }}>{editForm.name} を編集</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><Input size="sm" value={editForm.name} onChange={e => u("name", e.target.value)} /></div>
                  <div><label style={labelStyle}>大学名</label><Input size="sm" value={editForm.university || ""} onChange={e => u("university", e.target.value)} /></div>
                  <div><label style={labelStyle}>学年</label><Input size="sm" type="number" value={editForm.year} onChange={e => u("year", Number(e.target.value))} /></div>
                  <div>
                    <label style={labelStyle}>チーム</label>
                    <Select size="sm" value={editForm.team} onChange={e => u("team", e.target.value)} options={[
                      { value: "成尾", label: "成尾" },
                      { value: "高橋", label: "高橋" },
                      { value: "クライアント開拓", label: "クライアント開拓" },
                      { value: "", label: "営業統括" },
                    ]} />
                  </div>
                  <div>
                    <label style={labelStyle}>役職</label>
                    <Select size="sm" value={editForm.role} onChange={e => u("role", e.target.value)} options={[
                      { value: "メンバー", label: "メンバー" },
                      { value: "副リーダー", label: "副リーダー" },
                      { value: "チームリーダー", label: "チームリーダー" },
                      { value: "営業統括", label: "営業統括" },
                    ]} />
                  </div>
                  <div><label style={labelStyle}>累計売上 (¥)</label><Input size="sm" type="number" value={editForm.totalSales || 0} onChange={e => { const s = Number(e.target.value); const { rank, rate } = calcRankAndRate(s); setEditForm(p => ({ ...p, totalSales: s, rank, rate })); }} /></div>
                  <div><label style={labelStyle}>ランク <span style={{ fontWeight: 400, color: color.textLight }}>(自動)</span></label><input value={editForm.rank || 'トレーニー'} readOnly style={readOnlyInputStyle} /></div>
                  <div><label style={labelStyle}>内定先</label><Input size="sm" value={editForm.offer || ""} onChange={e => u("offer", e.target.value)} /></div>
                  <div><label style={labelStyle}>インセンティブ率 <span style={{ fontWeight: 400, color: color.textLight }}>(自動)</span></label><input value={((editForm.rate || 0) * 100).toFixed(0) + '%'} readOnly style={readOnlyInputStyle} /></div>
                  <div><label style={labelStyle}>入社日</label><Input size="sm" type="date" value={editForm.joinDate || ""} onChange={e => u("joinDate", e.target.value)} /></div>
                  <div>
                    <label style={labelStyle}>稼働開始日</label>
                    <Input size="sm" type="date" value={editForm.operationStartDate || ""} onChange={e => u("operationStartDate", e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>紹介者</label>
                    <Select size="sm" value={editForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} options={[
                      { value: "", label: "（なし）" },
                      ...members.filter(m => m.id !== editForm.id).map(m => ({ value: m.name, label: m.name })),
                    ]} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: color.gold }}>Zoom User ID <span style={{ fontWeight: 400, color: color.textLight }}>（管理者専用）</span></label>
                    <Input size="sm" value={editForm.zoomUserId || ""} onChange={e => u("zoomUserId", e.target.value)} placeholder="例: lXsqw8miT5iHmX7cKz0R5w" />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${color.borderLight}` }}>
                {deleteError && <div style={{ fontSize: font.size.xs, color: color.danger, marginBottom: 8, padding: "6px 10px", background: color.dangerSoft, borderRadius: radius.md }}>削除エラー: {deleteError}</div>}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={deleteSaving}
                    onClick={async () => {
                      if (!editForm._supaId) { setDeleteError('IDが見つかりません。ページを再読み込みしてください。'); return; }
                      if (!window.confirm(`「${editForm.name}」を削除しますか？`)) return;
                      setDeleteSaving(true);
                      setDeleteError(null);
                      const error = await deleteMember(editForm._supaId);
                      setDeleteSaving(false);
                      if (error) { setDeleteError(error.message || 'DBからの削除に失敗しました。'); return; }
                      setMembers(prev => prev.filter(x => x.id !== editForm.id));
                      setEditForm(null);
                      setDeleteError(null);
                      if (onDataRefetch) onDataRefetch();
                    }}
                  >
                    {deleteSaving ? '削除中...' : '削除'}
                  </Button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="outline" size="sm" onClick={() => { setEditForm(null); setDeleteError(null); }}>キャンセル</Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        if (!editForm.name.trim()) return;
                        if (editForm._supaId) {
                          const error = await updateMember(editForm._supaId, editForm);
                          if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                          await updateMemberReward(editForm._supaId, { cumulativeSales: editForm.totalSales || 0, rank: editForm.rank, incentiveRate: editForm.rate });
                        }
                        setMembers(prev => prev.map(m => m.id === editForm.id ? { ...m, ...editForm } : m));
                        setEditForm(null);
                        if (onDataRefetch) onDataRefetch();
                      }}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Member Modal */}
      {addForm && setMembers && (() => {
        const labelStyle = { fontSize: 10, fontWeight: 600, color: color.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: color.white, borderRadius: 12, width: 440, boxShadow: shadow.xl }}>
              <div style={{ padding: "14px 20px", background: `linear-gradient(135deg, ${color.navyDeep}, ${color.navy})`, borderRadius: "12px 12px 0 0", color: color.white }}>
                <div style={{ fontSize: font.size.md, fontWeight: 700 }}>従業員を追加</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><Input size="sm" value={addForm.name} onChange={e => u("name", e.target.value)} /></div>
                  <div><label style={labelStyle}>大学名</label><Input size="sm" value={addForm.university || ""} onChange={e => u("university", e.target.value)} /></div>
                  <div><label style={labelStyle}>学年</label><Input size="sm" type="number" value={addForm.year} onChange={e => u("year", Number(e.target.value))} /></div>
                  <div>
                    <label style={labelStyle}>チーム</label>
                    <Select size="sm" value={addForm.team} onChange={e => u("team", e.target.value)} options={[
                      { value: "成尾", label: "成尾" },
                      { value: "高橋", label: "高橋" },
                      { value: "クライアント開拓", label: "クライアント開拓" },
                      { value: "", label: "営業統括" },
                    ]} />
                  </div>
                  <div>
                    <label style={labelStyle}>役職</label>
                    <Select size="sm" value={addForm.role} onChange={e => u("role", e.target.value)} options={[
                      { value: "メンバー", label: "メンバー" },
                      { value: "副リーダー", label: "副リーダー" },
                      { value: "チームリーダー", label: "チームリーダー" },
                      { value: "営業統括", label: "営業統括" },
                    ]} />
                  </div>
                  <div>
                    <label style={labelStyle}>ランク</label>
                    <Select size="sm" value={addForm.rank} onChange={e => u("rank", e.target.value)} options={[
                      { value: "トレーニー", label: "トレーニー" },
                      { value: "プレイヤー", label: "プレイヤー" },
                    ]} />
                  </div>
                  <div>
                    <label style={labelStyle}>紹介者</label>
                    <Select size="sm" value={addForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} options={[
                      { value: "", label: "（なし）" },
                      ...members.map(m => ({ value: m.name, label: m.name })),
                    ]} />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${color.borderLight}` }}>
                {addError && <div style={{ fontSize: font.size.xs, color: color.danger, marginBottom: 8, padding: "6px 10px", background: color.dangerSoft, borderRadius: radius.md }}>エラー: {addError}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="outline" size="sm" onClick={() => { setAddForm(null); setAddError(null); }}>キャンセル</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!addForm.name.trim() || addSaving}
                    onClick={async () => {
                      if (!addForm.name.trim()) return;
                      setAddSaving(true);
                      setAddError(null);
                      const today = new Date().toISOString().slice(0, 10);
                      const { result, error } = await insertMember(addForm);
                      setAddSaving(false);
                      if (error || !result) {
                        setAddError(error?.message || 'DBへの保存に失敗しました。RLSポリシーを確認してください。');
                        return;
                      }
                      setMembers(prev => [...prev, {
                        ...addForm,
                        id: result.id,
                        _supaId: result.id,
                        offer: addForm.offer || "",
                        totalSales: 0,
                        joinDate: today,
                      }]);
                      setAddForm(null);
                      setAddError(null);
                      if (onDataRefetch) onDataRefetch();
                    }}
                  >
                    {addSaving ? '保存中...' : '追加'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Stats View (Performance Dashboard)
// ============================================================
// StatsView は src/components/views/StatsView.jsx に移動済み
