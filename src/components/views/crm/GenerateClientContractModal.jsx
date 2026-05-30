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

  const handleNormalizeAddress = () => {
    setClientAddress(prev => normalizeAddressToCompanyStyle(prev));
  };

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === templateId),
    [templates, templateId]
  );

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
                クライアント向けテンプレがまだ登録されていません。MASP {'>'} メンバー画面の
                「契約書テンプレ管理」→「クライアント向け」タブから事前にアップロードしてください。
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
                <button
                  type="button"
                  onClick={handleNormalizeAddress}
                  style={{
                    marginLeft: 8, padding: '1px 8px', fontSize: 10,
                    border: `1px solid ${color.navy}`, background: color.white,
                    color: color.navy, borderRadius: radius.sm, cursor: 'pointer',
                  }}
                >当社表記に整形 (一丁目1-2)</button>
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
