// =====================================================================
// クライアント契約書 (NDA / 業務委託) 生成モーダル
// ---------------------------------------------------------------------
// CRMクライアント詳細から起動。テンプレ選択 → 必要情報入力 → docx ダウンロード
// =====================================================================

import { useEffect, useState, useMemo } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { useEngagements } from '../../../hooks/useEngagements';
import { invokeExtractClientProfileForContract, invokeChatContractAssistant } from '../../../lib/supabaseWrite';
import {
  generateAndDownloadClientContract,
  calcPeriodEnd,
  normalizeAddressToCompanyStyle,
  formatRewardTable,
} from '../../../lib/contractGenerator';

export default function GenerateClientContractModal({ client, rewardMaster = [], onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [clientName, setClientName] = useState(client?.company || '');
  const [clientAddress, setClientAddress] = useState('');
  const [clientRepresentative, setClientRepresentative] = useState('');
  const [contractDate, setContractDate] = useState(
    new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [periodStart, setPeriodStart] = useState(
    new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [periodMonths, setPeriodMonths] = useState(12);
  const [periodEnd, setPeriodEnd] = useState('');
  const [tax, setTax] = useState('税別');
  const [paymentSite, setPaymentSite] = useState('毎月末日〆翌月15日払い');
  const [rewardTableText, setRewardTableText] = useState('');
  const [customClauses, setCustomClauses] = useState('');
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  // HP から自動取得
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillResult, setAutoFillResult] = useState(null); // { hp_url, confidence, reason }

  // 入力モード切替: 'form' | 'chat'
  const [inputMode, setInputMode] = useState('form');
  // チャット会話履歴
  const [chatMessages, setChatMessages] = useState([]); // [{ role, content }]
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatReady, setChatReady] = useState(false);

  // 契約期間自動算出
  useEffect(() => {
    if (!periodStart) return;
    setPeriodEnd(calcPeriodEnd(periodStart, Number(periodMonths) || 12));
  }, [periodStart, periodMonths]);

  // テンプレ一覧取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orgId = getOrgId();
      const { data } = await supabase
        .from('contract_templates')
        .select('id, name, file_path')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .eq('scope_type', 'client')
        .order('uploaded_at', { ascending: false });
      if (cancelled) return;
      setTemplates(data || []);
      if (data && data.length > 0) setTemplateId(data[0].id);
      setLoadingTemplates(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // クライアントの報酬体系 + engagement 情報を取得 → 報酬体系テキスト自動生成
  const { engagements, products, categories } = useEngagements();
  useEffect(() => {
    if (!client?._supaId) return;
    let cancelled = false;
    (async () => {
      const { data: settings } = await supabase
        .from('client_engagement_reward_settings')
        .select('engagement_id, reward_type')
        .eq('client_id', client._supaId);
      if (cancelled) return;
      // reward_type → 詳細マップ
      const rewardMap = {};
      (rewardMaster || []).forEach(r => {
        if (!rewardMap[r.id]) rewardMap[r.id] = { name: r.name, tax: r.tax, basis: r.basis, timing: r.timing, tiers: [] };
        rewardMap[r.id].tiers.push({ lo: r.lo, hi: r.hi, price: r.price, memo: r.memo, _tierSort: r._tierSort });
      });
      // 集約: reward_type ごと + 対応する商材名リスト
      const grouped = new Map();
      (settings || []).forEach(s => {
        if (!s.reward_type) return;
        const eng = (engagements || []).find(e => e.id === s.engagement_id);
        if (!eng) return;
        const cat = (categories || []).find(c => c.id === eng.category_id);
        const catName = cat?.name || '';
        const key = s.reward_type;
        if (!grouped.has(key)) {
          const detail = rewardMap[key] || { name: key, tiers: [], tax: '', basis: '' };
          grouped.set(key, {
            rid: key, name: detail.name, tax: detail.tax, basis: detail.basis,
            tiers: detail.tiers, categories: new Set(),
          });
        }
        grouped.get(key).categories.add(`${catName ? catName + ' ' : ''}${eng.name || ''}`);
      });
      const summary = [...grouped.values()].map(g => ({
        ...g, categories: [...g.categories],
      }));
      const text = formatRewardTable(summary);
      setRewardTableText(text);
      // 税区分も最初のentryに合わせて自動セット
      if (summary[0]?.tax) setTax(summary[0].tax);
    })();
    return () => { cancelled = true; };
  }, [client?._supaId, engagements, products, categories, rewardMaster]);

  // HP から「住所・代表者・HP URL」を一括取得 (Claude + web search)
  const handleAutoFillFromHomepage = async () => {
    if (!clientName.trim()) {
      setError('まずクライアント企業名を入力してください');
      return;
    }
    setAutoFilling(true);
    setError(null);
    setAutoFillResult(null);
    const res = await invokeExtractClientProfileForContract({
      company_name: clientName.trim(),
      address_hint: clientAddress.trim() || undefined,
    });
    setAutoFilling(false);
    setAutoFillResult(res);
    // 既存入力を上書きしすぎないよう、空欄のみセット (確信度 high の場合は上書き)
    const overwrite = res.confidence === 'high';
    if (res.address && (overwrite || !clientAddress.trim())) {
      // 念のため当社表記に整形をかけ直す
      setClientAddress(normalizeAddressToCompanyStyle(res.address));
    }
    if (res.representative && (overwrite || !clientRepresentative.trim())) {
      setClientRepresentative(res.representative);
    }
  };

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === templateId),
    [templates, templateId]
  );

  // チャット送信: 抽出値を既存フォームに反映
  const sendChat = async (userText) => {
    if (!userText.trim() || chatSending) return;
    const newMessages = [...chatMessages, { role: 'user', content: userText.trim() }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatSending(true);
    setError(null);
    const current = {
      address: clientAddress,
      representative: clientRepresentative,
      contract_date: contractDate,
      period_start: periodStart,
      period_months: periodMonths,
      tax,
      payment_site: paymentSite,
      custom_clauses: customClauses,
    };
    const res = await invokeChatContractAssistant({
      conversation: newMessages,
      client_name: clientName.trim(),
      reward_table_text: rewardTableText,
      current_values: current,
    });
    setChatSending(false);
    if (res.error) {
      setError(`チャット失敗: ${res.error}`);
      return;
    }
    setChatMessages([...newMessages, { role: 'assistant', content: res.reply || '' }]);
    setChatReady(!!res.ready);
    // 抽出値をフォームに反映
    const ex = res.extracted || {};
    if (ex.client_address) setClientAddress(ex.client_address);
    if (ex.client_representative) setClientRepresentative(ex.client_representative);
    if (ex.contract_date) setContractDate(ex.contract_date);
    if (ex.period_start) setPeriodStart(ex.period_start);
    if (ex.period_months) setPeriodMonths(Number(ex.period_months) || 12);
    if (ex.tax) setTax(ex.tax);
    if (ex.payment_site) setPaymentSite(ex.payment_site);
    if (ex.custom_clauses) setCustomClauses(ex.custom_clauses);
  };

  // チャット初回起動: 自動で挨拶
  const startChat = async () => {
    if (chatMessages.length > 0) return;
    setChatSending(true);
    setError(null);
    const current = {
      address: clientAddress, representative: clientRepresentative,
      contract_date: contractDate, period_start: periodStart, period_months: periodMonths,
      tax, payment_site: paymentSite, custom_clauses: customClauses,
    };
    const res = await invokeChatContractAssistant({
      conversation: [],
      client_name: clientName.trim(),
      reward_table_text: rewardTableText,
      current_values: current,
    });
    setChatSending(false);
    if (res.error) { setError(`チャット失敗: ${res.error}`); return; }
    setChatMessages([{ role: 'assistant', content: res.reply || '' }]);
    setChatReady(!!res.ready);
  };

  useEffect(() => {
    if (inputMode === 'chat' && chatMessages.length === 0 && clientName.trim()) {
      startChat();
    }
    // eslint-disable-next-line
  }, [inputMode]);

  const handleGenerate = async () => {
    if (!selectedTemplate) { setError('テンプレを選択してください'); return; }
    if (!clientName.trim()) { setError('クライアント企業名を入力してください'); return; }
    setGenerating(true);
    setError(null);
    try {
      const { filename, placeholders } = await generateAndDownloadClientContract({
        template: selectedTemplate,
        clientName: clientName.trim(),
        clientAddress: clientAddress.trim(),
        clientRepresentative: clientRepresentative.trim(),
        contractDate,
        periodStart,
        periodEnd,
        rewardTableText,
        tax,
        paymentSite: paymentSite.trim(),
        customClauses: customClauses.trim(),
      });
      // 履歴に記録
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('contracts').insert({
        org_id: getOrgId(),
        client_id: client._supaId,
        template_id: selectedTemplate.id,
        start_date: periodStart || null,
        end_date: periodEnd || null,
        payload: placeholders,
        generated_by: user?.id || null,
      });
      console.log('[contract] generated:', filename);
      onClose?.();
    } catch (e) {
      setError(String(e?.message || e));
    }
    setGenerating(false);
  };

  const label = { fontSize: 11, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: 4, display: 'block' };
  const input = {
    width: '100%', padding: '6px 10px', border: `1px solid ${color.border}`,
    borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family.sans,
    color: color.textDark, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, width: 700, maxWidth: '95vw',
          maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          fontFamily: font.family.sans,
        }}
      >
        <div style={{
          padding: '12px 20px', background: color.navy, color: color.white,
          borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>
            契約書作成 — {client?.company || ''}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: color.white, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 入力モード切替 */}
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${color.border}`, paddingBottom: 8 }}>
            {[
              { key: 'form', label: 'フォーム入力' },
              { key: 'chat', label: 'AI と対話で入力' },
            ].map(t => {
              const active = inputMode === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setInputMode(t.key)}
                  style={{
                    padding: '6px 14px', fontSize: font.size.xs, fontWeight: font.weight.semibold,
                    border: 'none', background: 'transparent',
                    color: active ? color.navy : color.textLight,
                    borderBottom: '2px solid ' + (active ? color.navy : 'transparent'),
                    cursor: 'pointer', fontFamily: font.family.sans,
                  }}
                >{t.label}</button>
              );
            })}
          </div>

          {/* チャット入力パネル */}
          {inputMode === 'chat' && (
            <div style={{
              background: color.gray50, borderRadius: radius.sm,
              border: `1px solid ${color.border}`, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{
                background: color.white, borderRadius: radius.sm, padding: 10,
                minHeight: 200, maxHeight: 360, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 8,
                border: `1px solid ${color.borderLight}`,
              }}>
                {chatMessages.length === 0 && !chatSending ? (
                  <div style={{ fontSize: font.size.xs, color: color.textLight, textAlign: 'center', padding: 20 }}>
                    {clientName.trim() ? 'AI に話しかけて契約書情報を入力してください' : 'まずクライアント企業名を入力してください'}
                  </div>
                ) : (
                  chatMessages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      padding: '8px 12px',
                      borderRadius: radius.md,
                      background: m.role === 'user' ? color.navy : alpha(color.navy, 0.06),
                      color: m.role === 'user' ? color.white : color.textDark,
                      fontSize: font.size.xs,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.content}
                    </div>
                  ))
                )}
                {chatSending && (
                  <div style={{ alignSelf: 'flex-start', fontSize: 10, color: color.textLight, padding: '4px 10px' }}>
                    考え中…
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendChat(chatInput);
                    }
                  }}
                  placeholder={chatReady ? '✓ 準備完了 — 下の「契約書をダウンロード」を押してください' : '例: 契約は6月1日開始、1年契約、報酬は税別で'}
                  disabled={chatSending || !clientName.trim()}
                  style={{
                    flex: 1, padding: '8px 12px', border: `1px solid ${color.border}`,
                    borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.sans,
                    color: color.textDark, outline: 'none',
                  }}
                />
                <button
                  onClick={() => sendChat(chatInput)}
                  disabled={chatSending || !chatInput.trim() || !clientName.trim()}
                  style={{
                    padding: '6px 16px', background: color.navy, color: color.white,
                    border: 'none', borderRadius: radius.sm, fontSize: font.size.xs,
                    fontWeight: font.weight.semibold, cursor: chatSending ? 'wait' : 'pointer',
                    fontFamily: font.family.sans,
                    opacity: !chatInput.trim() ? 0.4 : 1,
                  }}
                >送信</button>
              </div>
              {chatReady && (
                <div style={{ fontSize: 10, color: color.success, fontWeight: font.weight.semibold }}>
                  ✓ AI が「準備完了」を確認。下のフォームで値を最終確認し「契約書をダウンロード」を押してください。
                </div>
              )}
            </div>
          )}

          {/* テンプレ選択 */}
          <div>
            <label style={label}>契約書テンプレ</label>
            {loadingTemplates ? (
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>読み込み中…</div>
            ) : templates.length === 0 ? (
              <div style={{ fontSize: font.size.xs, color: color.danger }}>
                クライアント向けテンプレがまだ登録されていません。
                <strong>CRM {'>'} 「契約書テンプレ」サブタブ</strong> から事前にアップロードしてください。
              </div>
            ) : (
              <select
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                style={input}
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* HP から自動取得バー */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: color.gray50, borderRadius: radius.sm,
            border: `1px dashed ${color.border}`,
          }}>
            <span style={{ fontSize: 10, color: color.textMid }}>
              HP から住所・代表者・HP URL を自動取得 (Claude + web search):
            </span>
            <button
              type="button"
              onClick={handleAutoFillFromHomepage}
              disabled={autoFilling || !clientName.trim()}
              style={{
                padding: '3px 12px', fontSize: 11, fontWeight: font.weight.semibold,
                background: autoFilling ? color.gray100 : color.navy,
                color: autoFilling ? color.textLight : color.white,
                border: 'none', borderRadius: radius.sm,
                cursor: autoFilling || !clientName.trim() ? 'not-allowed' : 'pointer',
                fontFamily: font.family.sans,
              }}
            >
              {autoFilling ? '取得中… (10〜30秒)' : 'HPから自動取得'}
            </button>
            {autoFillResult && (
              <span style={{
                fontSize: 10,
                color: autoFillResult.confidence === 'high' ? color.success
                  : autoFillResult.confidence === 'medium' ? color.gold : color.danger,
              }}>
                {autoFillResult.confidence === 'high' ? '✓ ' : autoFillResult.confidence === 'medium' ? '△ ' : '⚠ '}
                {autoFillResult.confidence} — {autoFillResult.reason || ''}
                {autoFillResult.hp_url && (
                  <a href={autoFillResult.hp_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: color.navy }}>
                    {autoFillResult.hp_url}
                  </a>
                )}
              </span>
            )}
          </div>

          {/* クライアント基本情報 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>クライアント企業名</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>代表者氏名</label>
              <input value={clientRepresentative} onChange={e => setClientRepresentative(e.target.value)} placeholder="例: 山田 太郎" style={input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>
                住所
                <span style={{ marginLeft: 6, fontSize: 10, color: color.textLight, fontWeight: font.weight.normal }}>
                  (HPから自動取得時は当社表記「赤坂一丁目11-44」に自動整形されます)
                </span>
              </label>
              <input
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
                placeholder="例: 東京都港区赤坂1-11-44"
                style={input}
              />
            </div>
          </div>

          {/* 契約日 / 期間 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>契約締結日</label>
              <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>開始日</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>期間 (月)</label>
              <input type="number" min="1" value={periodMonths} onChange={e => setPeriodMonths(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>終了日 (自動)</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={input} />
            </div>
          </div>

          {/* 支払条件 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label style={label}>消費税</label>
              <select value={tax} onChange={e => setTax(e.target.value)} style={input}>
                <option value="税別">税別</option>
                <option value="税込">税込</option>
              </select>
            </div>
            <div>
              <label style={label}>支払サイト</label>
              <input value={paymentSite} onChange={e => setPaymentSite(e.target.value)} style={input} />
            </div>
          </div>

          {/* 報酬体系 (テキスト編集可) */}
          <div>
            <label style={label}>報酬体系 (CRMの「報酬体系(タイプ別)」から自動生成、編集可)</label>
            <textarea
              value={rewardTableText}
              onChange={e => setRewardTableText(e.target.value)}
              rows={8}
              style={{ ...input, fontFamily: font.family.mono, fontSize: font.size.xs, lineHeight: 1.6, resize: 'vertical' }}
              placeholder="CRMの報酬体系から自動入力されます。編集可"
            />
          </div>

          {/* 追加条項 (任意) */}
          <div>
            <label style={label}>
              追加条項 (任意)
              <span style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.normal, marginLeft: 6 }}>
                — ひな形と異なる特約や個別条項があればここに記入 (テンプレ {'{{custom_clauses}}'} に差し込み)
              </span>
            </label>
            <textarea
              value={customClauses}
              onChange={e => setCustomClauses(e.target.value)}
              rows={5}
              style={{ ...input, fontSize: font.size.xs, lineHeight: 1.6, resize: 'vertical' }}
              placeholder={'例:\n1. 報告は毎週金曜午後に Slack で実施するものとする。\n2. 振込口座は ●●銀行 ●●支店 限定とする。'}
            />
          </div>

          {error && (
            <div style={{ fontSize: font.size.xs, color: color.danger, padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: radius.sm }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button
            variant="primary" size="sm"
            onClick={handleGenerate}
            loading={generating}
            disabled={generating || !templateId}
          >
            {generating ? '生成中…' : '契約書をダウンロード (.docx)'}
          </Button>
        </div>
      </div>
    </div>
  );
}
