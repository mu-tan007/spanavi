import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { invokeAppoAiReport, invokeTranscribeRecording, fetchZoomUserId, insertAppointment } from '../../lib/supabaseWrite';
import { invokeGenerateCompanyDossier } from '../../lib/dossierApi';
import { getOrgId } from '../../lib/orgContext';
import { MemberSuggestInput } from './AppoListView';

export default function AppoReportModal({ row, list, currentUser = '', members = [], onClose, onSave, onDone, initialRecordingUrl = '', onFetchRecordingUrl, clientData = [], rewardMaster = [], dialedPhone = '' }) {
  const isMobile = useIsMobile();
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  // クライアントの報酬タイプを特定
  const clientInfo = (clientData || []).find(c => c.company === list.company);
  const rewardType = clientInfo?.rewardType || '';
  const rewardRows = (rewardMaster || []).filter(r => r.id === rewardType);
  const isFixed = rewardRows.length > 0 && rewardRows[0].basis === '-';

  // 右パネルと同じフォーマット（千円単位の数値 → "1,004,947千円"）
  const initialSalesAmount = row.revenue    != null ? Number(row.revenue).toLocaleString()    + '千円' : '';
  const initialNetIncome   = row.net_income != null ? Number(row.net_income).toLocaleString() + '千円' : '';
  // フォームオープン時に ourSales も計算済みにする
  const initialOurSales = (() => {
    if (!rewardRows.length) return '';
    const applyTax = p => rewardRows[0].tax === '税別' ? Math.round(p * 1.1) : p;
    if (isFixed) return String(applyTax(rewardRows[0].price));
    const basis = rewardRows[0].basis;
    const amount = basis === '売上高'
      ? (row.revenue    != null ? row.revenue    * 1000 : null)
      : (row.net_income != null ? row.net_income * 1000 : null);
    if (amount === null) return '';
    const match = rewardRows.find(r => amount >= r.lo && amount < r.hi);
    return match ? String(applyTax(match.price)) : '';
  })();

  const [form, setForm] = React.useState({
    contactName:    row.representative || '',
    contactTitle:   '代表取締役',
    getDate:        new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appoDate:       '',
    appoTime:       '',
    visitLocation:  (row.address || '').replace(/\/\s*$/, ''),
    businessDetail: row.business || '',
    salesAmount:    initialSalesAmount,
    netIncome:      initialNetIncome,
    phone:          row.phone || '',
    email:          '',
    hp:             '',
    personality:    '',
    meetingExp:     '',
    futureConsider: '',
    other:          '',
    keymanMaIntent: '',
    recordingUrl:   initialRecordingUrl,
    acquirer:       currentUser,
    ourSales:       initialOurSales,
    reportStyle:    row.report_style    || '',
    reportSupplement: row.report_supplement || '',
  });
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // 'idle' | 'saving' | 'slack' | 'ai' | 'done_slack' | 'done_no_slack' | 'error'
  const [aiStatus, setAiStatus] = React.useState('idle');
  const [slackAppoFailed, setSlackAppoFailed] = React.useState(false);
  // 'idle' | 'transcribing' | 'enhancing' | 'done' | 'error'
  const [generateStep, setGenerateStep] = React.useState('idle');
  const [recordingUrlLoading, setRecordingUrlLoading] = React.useState(false);
  const [recordingUrlError, setRecordingUrlError] = React.useState(false);
  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleRefetchRecordingUrl = async () => {
    if (!onFetchRecordingUrl) { setRecordingUrlError(true); return; }
    setRecordingUrlLoading(true);
    setRecordingUrlError(false);
    try {
      const url = await onFetchRecordingUrl();
      if (url) {
        setForm(prev => ({ ...prev, recordingUrl: url }));
        setRecordingUrlError(false);
      } else {
        setRecordingUrlError(true);
      }
    } catch (e) {
      console.warn('[AppoReportModal] 録音URL取得失敗:', e);
      setRecordingUrlError(true);
    } finally {
      setRecordingUrlLoading(false);
    }
  };

  // モーダルを開いた直後に今回の通話録音を Zoom API から取得（常に実行）
  React.useEffect(() => {
    handleRefetchRecordingUrl();
  }, []);

  // 日本語金額テキスト（"5.0億円"、"3000万円"等）を円に変換
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

  // REWARD_MASTERから当社売上を自動計算
  const computeOurSales = (salesYen, netYen) => {
    if (!rewardRows.length) return null;
    const applyTax = p => rewardRows[0].tax === '税別' ? Math.round(p * 1.1) : p;
    const basis = rewardRows[0].basis;
    if (basis === '-') return applyTax(rewardRows[0].price); // 固定単価
    const amount = basis === '売上高' ? salesYen : netYen;
    if (amount === null) return null;
    const match = rewardRows.find(r => amount >= r.lo && amount < r.hi);
    return match ? applyTax(match.price) : null;
  };

  const dateWithWeekday = (d) => {
    if (!d) return '';
    const [y, m, dy] = d.split('-').map(Number);
    const dow = WEEKDAYS[new Date(y, m - 1, dy).getDay()];
    return `${d}（${dow}）`;
  };

  const generateReport = () =>
`【アポ取得報告】
企業名：${row.company}
担当者：${form.contactName}様（${form.contactTitle}）
アポ取得日：${form.getDate}
面談日時：${dateWithWeekday(form.appoDate)} ${form.appoTime}～
訪問先：${form.visitLocation}
事業内容：${form.businessDetail}
財務：売上${form.salesAmount}、当期純利益${form.netIncome}
当社売上：${form.ourSales !== '' ? '¥' + Number(form.ourSales).toLocaleString() : ''}
電話番号：${form.phone}
メール：${form.email}
HP：${form.hp}
メモ：
　・先方のお人柄→${form.personality}
　・面談経験の有無→${form.meetingExp}
　・将来的な検討可否→${form.futureConsider}
　・その他→${form.other}
　・録音URL：${form.recordingUrl}
　・アポ取得者→${form.acquirer}`;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(generateReport()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { console.error('Copy failed:', e); }
  };

  const handleGenerateReport = async () => {
    if (!form.recordingUrl) {
      alert('録音URLを先に取得してください');
      return;
    }
    setGenerateStep('transcribing');
    try {
      const { data, error } = await invokeTranscribeRecording({
        recording_url:  form.recordingUrl,
        item_id:        row?.id || '',
        personality:    form.personality,
        meetingExp:     form.meetingExp,
        futureConsider: form.futureConsider,
        other:          form.other,
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setGenerateStep('enhancing');
      setForm(prev => ({
        ...prev,
        personality:      data.personality      || prev.personality,
        meetingExp:       data.meetingExp       || prev.meetingExp,
        futureConsider:   data.futureConsider   || prev.futureConsider,
        other:            data.other            || prev.other,
        keymanMaIntent:   data.keyman_ma_intent || prev.keymanMaIntent || '',
        recordingUrl:     data.publicRecordingUrl || prev.recordingUrl,
      }));
      setGenerateStep('done');
      setTimeout(() => setGenerateStep('idle'), 3000);
    } catch (e) {
      console.error('[handleGenerateReport]', e);
      setGenerateStep('error');
      setTimeout(() => setGenerateStep('idle'), 4000);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setAiStatus('saving');
    // 当社売上・アポインター報酬の計算
    //   定額型（reward_types.calc_type === 'fixed_per_appo'）の場合は
    //   ourSales 自体がアポ1件あたりの定額報酬になるので、個人rate掛けはスキップ
    const salesVal = parseInt(form.ourSales) || 0;
    const isFixedPerAppo = rewardRows.length > 0 && rewardRows[0].calc_type === 'fixed_per_appo';
    const acquirerMember = members.find(m => (typeof m === 'string' ? m : (m.name || '')) === form.acquirer);
    const acquirerRate = parseFloat(acquirerMember?.rate ?? acquirerMember?.incentive_rate ?? 0) || 0;
    const rewardVal = isFixedPerAppo
      ? salesVal
      : (salesVal && acquirerRate ? Math.round(salesVal * acquirerRate) : 0);
    const reportNote = generateReport();
    // Step 1: アポをDBに登録（appointments テーブルへ insert + ローカル状態更新）
    const { result: insResult } = await insertAppointment({
      company:    row.company,
      client:     list.company,
      meetDate:   form.appoDate,
      getDate:    form.getDate,
      getter:     form.acquirer,
      appoReport: reportNote,
      // クライアント開拓は事前確認を行わないため、デフォルトで事前確認済に
      status:     list?.is_prospecting ? '事前確認済' : 'アポ取得',
      sales:      salesVal,
      reward:     rewardVal,
      list_id:    list._supaId || null,
      item_id:    row.id || null,
      phone:      row.phone || null,
      recording_url: form.recordingUrl || null,
      reportStyle: form.reportStyle || null,
      reportSupplement: form.reportSupplement || null,
      keymanMaIntent: form.keymanMaIntent || null,
    });
    // Step 4: 企業ドシエ生成 fire-and-forget（バックグラウンドで Edge Function 完走、約30〜90秒）
    if (insResult?.id) {
      const orgId = getOrgId();
      invokeGenerateCompanyDossier({ appointment_id: insResult.id, org_id: orgId }).catch(e =>
        console.warn('[AppoReportModal] dossier generation kickoff failed:', e)
      );
    }
    await onSave({
      company:    row.company,
      client:     list.company,
      meetDate:   form.appoDate,
      getDate:    form.getDate,
      getter:     form.acquirer,
      appoReport: reportNote,
      sales:      salesVal,
      reward:     rewardVal,
      supaId:     insResult?.id,
    });
    // Step 2: #アポ取得報告チャンネルへSlack即時投稿
    setAiStatus('slack');
    setSlackAppoFailed(false);
    let slackAppoOk = false;
    try {
      const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
      const anonKeyEnv     = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const slackRes = await fetch(`${supabaseUrlEnv}/functions/v1/post-appo-to-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKeyEnv },
        body: JSON.stringify({ text: reportNote }),
      });
      slackAppoOk = slackRes.ok;
      if (!slackRes.ok) {
        console.warn('[handleSave] post-appo-to-slack failed:', slackRes.status);
        setSlackAppoFailed(true);
      }
    } catch (slackErr) {
      console.error('[handleSave] post-appo-to-slack error:', slackErr);
      setSlackAppoFailed(true);
    }

    // Step 3: zoom_user_id取得 → Edge Function（録音→Claude→Slack）
    setAiStatus('ai');
    try {
      const zoomUserId = await fetchZoomUserId(currentUser);
      const { data, error } = await invokeAppoAiReport({
        zoom_user_id: zoomUserId,
        // 実際に発信した番号（キーマン携帯/別事業所）を優先。未指定なら会社番号。
        // Zoom 録音の callee_number 一致フィルタに使われるため、ここを間違えると
        // AI 自動レポートが録音を見つけられず空のままになる。
        callee_phone: dialedPhone || form.phone,
        report_text:  generateReport(),
        company_name: row.company,
        client_name:  list.company,
      });
      if (error) throw error;
      const nextStatus = (data?.slackPosted || slackAppoOk) ? 'done_slack' : 'done_no_slack';
      setAiStatus(nextStatus);
      // 成功時は2秒後に自動クローズ
      setTimeout(() => { (onDone || onClose)(); }, 2000);
    } catch (err) {
      console.error('[AppoReportModal] Edge Function error:', err);
      setAiStatus(slackAppoOk ? 'done_slack' : 'error');
    }
    setSaving(false);
  };

  const iStyle = { width: '100%', padding: `${space[1.5]}px ${space[2.5]}px`, borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.sans, outline: 'none', background: color.offWhite, boxSizing: 'border-box', color: color.textDark };
  const lStyle = { fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.navy, marginBottom: 2, display: 'block' };

  const FIELDS = [
    { key: 'contactName',    label: '担当者名',       span: 1 },
    { key: 'contactTitle',   label: '役職',           span: 1 },
    { key: 'getDate',        label: 'アポ取得日',      span: 1, type: 'date' },
    { key: 'appoDate',       label: '面談日',          span: 1, type: 'date' },
    { key: 'visitLocation',  label: '訪問先',          span: 2, placeholder: '例：本社、Zoom等' },
    { key: 'businessDetail', label: '事業内容',        span: 2 },
    { key: 'salesAmount',    label: '売上',           span: 1, placeholder: '例：5.0億円' },
    { key: 'netIncome',      label: '当期純利益',       span: 1, placeholder: '例：3000万円' },
    { key: 'phone',          label: '電話番号',        span: 1 },
    { key: 'email',          label: 'メール',          span: 1 },
    { key: 'hp',             label: 'HP',             span: 2 },
    { key: 'personality',    label: '先方のお人柄',     span: 2 },
    { key: 'meetingExp',     label: '面談経験の有無',   span: 2 },
    { key: 'futureConsider', label: '将来的な検討可否', span: 2 },
    { key: 'other',          label: 'その他',          span: 2 },
    { key: 'recordingUrl',   label: '録音URL',         span: 2 },
    { key: 'ourSales',       label: '当社売上（自動計算・上書き可）', span: 2, type: 'number',
      placeholder: rewardType ? `タイプ${rewardType}（${rewardRows[0]?.name || ''}）に基づき自動計算` : 'クライアント不明 — 手動入力' },
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: alpha('#000', 0.5), zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: isMobile ? 0 : radius.md, width: isMobile ? '100vw' : 560, height: isMobile ? '100vh' : 'auto', maxHeight: isMobile ? '100vh' : '90vh', maxWidth: isMobile ? 'none' : undefined, display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
        {/* ヘッダー */}
        <div style={{ padding: `${space[3]}px ${space[6]}px`, background: color.navy, borderRadius: `${radius.md}px ${radius.md}px 0 0`, color: color.white, fontWeight: font.weight.semibold, fontSize: font.size.md + 1, flexShrink: 0 }}>
          <div style={{ fontSize: font.size.md + 1, fontWeight: font.weight.semibold }}>アポ取得報告</div>
          <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.7), marginTop: 2 }}>{row.company}</div>
        </div>
        {/* クライアント開拓リスト案内 */}
        {list?.is_prospecting && (
          <div style={{ padding: `${space[2]}px ${space[5]}px`, background: alpha(color.info, 0.08), borderBottom: `1px solid ${alpha(color.info, 0.25)}`, color: color.info, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
            クライアント開拓リストのアポイントです：売上集計からは除外され、インターン報酬のみ計上されます。
          </div>
        )}
        {/* フォーム */}
        <div style={{ padding: `${space[4]}px ${space[5]}px`, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2.5] }}>
            {FIELDS.map(f => {
              const isRecUrl = f.key === 'recordingUrl';
              const isLoading = isRecUrl && recordingUrlLoading;

              // 面談日：日付と時間プルダウンを1ラベル・横並びで表示
              if (f.key === 'appoDate') {
                const meetTimeOptions = Array.from({ length: 23 }, (_, i) => {
                  const total = 540 + i * 30; // 9:00〜20:00（30分刻み）
                  const h = Math.floor(total / 60);
                  const m = total % 60;
                  return {
                    label: `${h}:${String(m).padStart(2, '0')}`,
                    value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
                  };
                });
                return (
                  <div key="appoDate">
                    <label style={lStyle}>面談日</label>
                    <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center' }}>
                      <input type="date" value={form.appoDate}
                        onChange={e => { set('appoDate', e.target.value); if (!e.target.value) set('appoTime', ''); }}
                        style={{ ...iStyle, flex: '1 1 auto' }} />
                      {form.appoDate && (
                        <select value={form.appoTime} onChange={e => set('appoTime', e.target.value)}
                          style={{ ...iStyle, flex: '0 0 90px', cursor: 'pointer', appearance: 'auto' }}>
                          <option value="">時間</option>
                          {meetTimeOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={f.key} style={{ gridColumn: f.span === 2 ? '1 / -1' : undefined }}>
                  <label style={{ ...lStyle, display: 'flex', alignItems: 'center' }}>
                    <span>{f.label}</span>
                    {isRecUrl && isLoading && <span style={{ marginLeft: space[1.5], fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.normal }}>取得中...</span>}
                    {isRecUrl && !isLoading && form.recordingUrl && <span style={{ marginLeft: space[1.5], fontSize: font.size.xs - 1, color: color.success, fontWeight: font.weight.normal }}>自動取得済み</span>}
                    {isRecUrl && !isLoading && recordingUrlError && <span style={{ marginLeft: space[1.5], fontSize: font.size.xs - 1, color: color.danger, fontWeight: font.weight.normal }}>録音の準備中です。数秒後に再度お試しください</span>}
                    {isRecUrl && !isLoading && (
                      <button onClick={handleRefetchRecordingUrl}
                        title="録音URLを再取得"
                        style={{ marginLeft: space[1.5], fontSize: font.size.sm, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: color.navy }}>更新</button>
                    )}
                  </label>
                  <input type={f.type || 'text'} value={form[f.key]}
                    placeholder={isLoading ? '録音URLを取得中...' : (f.placeholder || '')}
                    disabled={isLoading}
                    onChange={e => {
                      const val = e.target.value;
                      set(f.key, val);
                      if (f.key === 'salesAmount' || f.key === 'netIncome') {
                        const salesYen = parseJpAmount(f.key === 'salesAmount' ? val : form.salesAmount);
                        const netYen   = parseJpAmount(f.key === 'netIncome'   ? val : form.netIncome);
                        const computed = computeOurSales(salesYen, netYen);
                        if (computed !== null) set('ourSales', String(computed));
                      }
                    }} style={isLoading ? { ...iStyle, background: color.gray100, color: color.textLight } : iStyle} />
                </div>
              );
            })}
            {/* アポ取得者：インクリメンタルサーチ */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lStyle}>アポ取得者</label>
              <MemberSuggestInput value={form.acquirer} onChange={v => set('acquirer', v)} members={members} style={iStyle} />
            </div>
            {/* アポ取得スタイル */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lStyle}>アポ取得スタイル</label>
              <div style={{ display: 'flex', gap: space[3], fontSize: font.size.xs, fontFamily: font.family.sans, color: color.navy }}>
                {['スムーズ', '説得'].map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="reportStyle" value={opt}
                      checked={form.reportStyle === opt}
                      onChange={() => set('reportStyle', opt)} />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lStyle}>補足（経緯・所感）</label>
              <textarea value={form.reportSupplement}
                onChange={e => set('reportSupplement', e.target.value)}
                placeholder="例：1回目で温度感薄かったが、事例紹介で前向きに転じてアポ獲得"
                style={{ ...iStyle, minHeight: 56, resize: 'vertical', fontFamily: font.family.sans }} />
            </div>
          </div>
          {/* 報告プレビュー */}
          <div style={{ marginTop: space[3] + 2 }}>
            <div style={{ fontSize: font.size.sm + 1, fontWeight: font.weight.bold, color: color.navy, paddingBottom: space[1.5], marginBottom: space[2.5] }}>報告プレビュー</div>
            <pre style={{ background: color.offWhite, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[2.5], fontSize: font.size.xs - 1, whiteSpace: 'pre-wrap', fontFamily: font.family.mono, lineHeight: font.lineHeight.relaxed, color: color.textDark, margin: 0 }}>{generateReport()}</pre>
          </div>
        </div>
        {/* フッター */}
        <div style={{ padding: `${space[2.5]}px ${space[5]}px`, borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: space[2] }}>
          <div style={{ display: 'flex', gap: space[1.5] }}>
            {/* 文字起こし＋AI添削ボタン */}
            <Button variant="outline" onClick={handleGenerateReport} disabled={saving || generateStep !== 'idle' || recordingUrlLoading}>
              {recordingUrlLoading               && '録音を取得中...'}
              {!recordingUrlLoading && generateStep === 'transcribing' && '文字起こし中...'}
              {!recordingUrlLoading && generateStep === 'enhancing'    && 'AI添削中...'}
              {!recordingUrlLoading && generateStep === 'done'         && '添削完了'}
              {!recordingUrlLoading && generateStep === 'error'        && 'エラー'}
              {!recordingUrlLoading && generateStep === 'idle'         && '録音から自動生成'}
            </Button>
            {/* コピーボタン */}
            <Button variant="outline" onClick={handleCopy} disabled={saving}>
              {copied ? 'コピー済み' : 'コピー'}
            </Button>
          </div>
          {/* AI処理ステータス表示 */}
          {aiStatus !== 'idle' && (
            <div style={{ fontFamily: font.family.sans }}>
              <div style={{ fontSize: font.size.xs, color: aiStatus === 'error' ? color.danger : aiStatus.startsWith('done') ? color.success : color.textMid }}>
                {aiStatus === 'saving'        && 'アポ登録中...'}
                {aiStatus === 'slack'         && '#アポ取得報告 に投稿中...'}
                {aiStatus === 'ai'            && 'AI処理中（録音取得・レポート強化・Slack投稿）...'}
                {aiStatus === 'done_slack'    && '完了！Slackに投稿しました'}
                {aiStatus === 'done_no_slack' && 'AI処理完了（Slack未設定）'}
                {aiStatus === 'error'         && 'AI処理でエラーが発生しました（アポ登録は完了）'}
              </div>
              {slackAppoFailed && aiStatus !== 'slack' && (
                <div style={{ fontSize: font.size.xs - 1, color: color.danger, marginTop: 2 }}>#アポ取得報告への投稿に失敗しました</div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: space[2] }}>
            {aiStatus === 'idle' && (
              <Button variant="outline" onClick={onClose}>キャンセル</Button>
            )}
            {aiStatus.startsWith('done') || aiStatus === 'error' ? (
              <Button variant="outline" onClick={onDone || onClose}>閉じる</Button>
            ) : (
              <Button onClick={handleSave} loading={saving} disabled={saving}>
                {saving ? '処理中...' : '保存してアポ登録'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}