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
import { PAYMENT_SITE_OPTIONS } from './utils';
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
  // 報酬体系マスタから1件選択用
  const [selectedMasterRewardType, setSelectedMasterRewardType] = useState('');
  const [customClauses, setCustomClauses] = useState('');
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  // HP から自動取得
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillResult, setAutoFillResult] = useState(null); // { hp_url, confidence, reason }

  // チャット会話履歴 (タブ撤去後はフォーム内の折りたたみ details に表示)
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

  // 報酬体系マスタの選択肢 (type_id 単位に集約)
  const rewardTypeOptions = useMemo(() => {
    const map = new Map();
    (rewardMaster || []).forEach(r => {
      if (!map.has(r.id)) {
        map.set(r.id, {
          id: r.id, name: r.name, tax: r.tax, basis: r.basis, calc_type: r.calc_type, tiers: [],
        });
      }
      map.get(r.id).tiers.push({ lo: r.lo, hi: r.hi, price: r.price, memo: r.memo, _tierSort: r._tierSort });
    });
    // tierソート + type sort
    [...map.values()].forEach(o => o.tiers.sort((a, b) => (a._tierSort ?? 0) - (b._tierSort ?? 0)));
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [rewardMaster]);

  // マスタから1件選択 → reward_table_text と税区分に反映
  const applyRewardTypeFromMaster = (rewardTypeId) => {
    setSelectedMasterRewardType(rewardTypeId);
    if (!rewardTypeId) return;
    const r = rewardTypeOptions.find(x => x.id === rewardTypeId);
    if (!r) return;
    const summary = [{
      rid: r.id, name: r.name, tax: r.tax, basis: r.basis,
      tiers: r.tiers, categories: [],
    }];
    setRewardTableText(formatRewardTable(summary));
    if (r.tax) setTax(r.tax);
  };

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

  // チャットは折りたたみ open 時に自動起動する代わりに、ユーザーが送信した時に initialize

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

          {/* HP から自動取得 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleAutoFillFromHomepage}
              disabled={autoFilling || !clientName.trim()}
              style={{
                padding: '5px 14px', fontSize: 11, fontWeight: font.weight.semibold,
                background: autoFilling ? color.gray100 : color.navy,
                color: autoFilling ? color.textLight : color.white,
                border: 'none', borderRadius: radius.sm,
                cursor: autoFilling || !clientName.trim() ? 'not-allowed' : 'pointer',
                fontFamily: font.family.sans,
              }}
            >
              {autoFilling ? '取得中… (10〜30秒)' : 'HPから自動取得'}
            </button>
            {autoFillResult?.hp_url && (
              <a href={autoFillResult.hp_url} target="_blank" rel="noreferrer"
                style={{ fontSize: 10, color: color.textMid, textDecoration: 'underline' }}>
                {autoFillResult.hp_url}
              </a>
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

          {/* 支払条件 (消費税は報酬体系マスタの tax に連動するので別欄不要) */}
          <div>
            <label style={label}>
              支払サイト
              <span style={{ marginLeft: 6, fontSize: 10, color: color.textLight, fontWeight: font.weight.normal }}>
                (候補から選択、または自由入力可)
              </span>
            </label>
            <input
              list="payment-site-options"
              value={paymentSite}
              onChange={e => setPaymentSite(e.target.value)}
              style={input}
            />
            <datalist id="payment-site-options">
              {PAYMENT_SITE_OPTIONS.map(o => <option key={o} value={o} />)}
            </datalist>
          </div>

          {/* 報酬体系 (自動 / マスタ選択 / 手動編集) */}
          <div>
            <label style={label}>報酬体系</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: color.textLight }}>報酬体系マスタから選択:</span>
              <select
                value={selectedMasterRewardType}
                onChange={e => applyRewardTypeFromMaster(e.target.value)}
                style={{ ...input, width: 'auto', minWidth: 240, padding: '4px 8px', fontSize: font.size.xs }}
              >
                <option value="">— 選択してください —</option>
                {rewardTypeOptions.map(r => (
                  <option key={r.id} value={r.id}>{r.id} : {r.name}</option>
                ))}
              </select>
              <span style={{ fontSize: 10, color: color.textLight }}>
                or
              </span>
              <button
                type="button"
                onClick={() => setSelectedMasterRewardType('')}
                style={{
                  padding: '3px 10px', fontSize: 10,
                  border: `1px solid ${color.border}`, background: color.white,
                  color: color.textMid, borderRadius: radius.sm, cursor: 'pointer',
                }}
              >下のテキストを直接編集</button>
            </div>
            <textarea
              value={rewardTableText}
              onChange={e => {
                setRewardTableText(e.target.value);
                setSelectedMasterRewardType(''); // 手動編集したらマスタ選択解除
              }}
              rows={8}
              style={{ ...input, fontFamily: font.family.mono, fontSize: font.size.xs, lineHeight: 1.6, resize: 'vertical' }}
              placeholder="CRMの「報酬体系(タイプ別)」から自動入力、またはマスタから選択。手動編集可"
            />
            <div style={{ fontSize: 10, color: color.textLight, marginTop: 2 }}>
              ※ デフォルトは CRM のクライアント別「報酬体系(タイプ別)」から自動生成。マスタ選択でテンプレ型に切替可
            </div>
          </div>

          {/* AI と対話で入力 (追加条項や上のフォーム値の一括変更に使う) */}
          <details style={{ border: `1px dashed ${color.border}`, borderRadius: radius.sm, padding: '8px 12px' }}>
            <summary style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, cursor: 'pointer' }}>
              AI と対話で入力 / 追加条項を決める (任意)
              <span style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.normal, marginLeft: 6 }}>
                — 「6月1日開始、1年契約」のような自然文で上のフォームに一括反映。
                「報告は毎週金曜午後に Slack で」等と伝えれば特約条項として差し込み
              </span>
            </summary>
            <div style={{
              marginTop: 10, background: color.gray50, borderRadius: radius.sm,
              border: `1px solid ${color.border}`, padding: 10,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{
                background: color.white, borderRadius: radius.sm, padding: 8,
                minHeight: 120, maxHeight: 300, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 6,
                border: `1px solid ${color.borderLight}`,
              }}>
                {chatMessages.length === 0 && !chatSending ? (
                  <div style={{ fontSize: font.size.xs, color: color.textLight, textAlign: 'center', padding: 12 }}>
                    {clientName.trim() ? 'AI に話しかけて契約書情報を一括入力' : 'まずクライアント企業名を入力してください'}
                  </div>
                ) : (
                  chatMessages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%', padding: '6px 10px', borderRadius: radius.md,
                      background: m.role === 'user' ? color.navy : alpha(color.navy, 0.06),
                      color: m.role === 'user' ? color.white : color.textDark,
                      fontSize: font.size.xs, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    }}>{m.content}</div>
                  ))
                )}
                {chatSending && (
                  <div style={{ alignSelf: 'flex-start', fontSize: 10, color: color.textLight, padding: '4px 10px' }}>考え中…</div>
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
                  placeholder={chatReady ? '準備完了 — 下の「契約書をダウンロード」を押してください' : '例: 契約は6月1日開始、1年契約'}
                  disabled={chatSending || !clientName.trim()}
                  style={{
                    flex: 1, padding: '6px 10px', border: `1px solid ${color.border}`,
                    borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.sans,
                    color: color.textDark, outline: 'none',
                  }}
                />
                <button
                  onClick={() => sendChat(chatInput)}
                  disabled={chatSending || !chatInput.trim() || !clientName.trim()}
                  style={{
                    padding: '6px 14px', background: color.navy, color: color.white,
                    border: 'none', borderRadius: radius.sm, fontSize: font.size.xs,
                    fontWeight: font.weight.semibold, cursor: chatSending ? 'wait' : 'pointer',
                    fontFamily: font.family.sans, opacity: !chatInput.trim() ? 0.4 : 1,
                  }}
                >送信</button>
              </div>
              {chatReady && (
                <div style={{ fontSize: 10, color: color.success, fontWeight: font.weight.semibold }}>
                  AI が「準備完了」を確認。上のフォームで値を最終確認してダウンロードボタンを押してください。
                </div>
              )}
            </div>
          </details>

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
