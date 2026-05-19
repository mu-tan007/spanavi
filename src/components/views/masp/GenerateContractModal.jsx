// =====================================================================
// 業務委託契約書 生成モーダル (MASP Members 画面から呼び出し)
// ---------------------------------------------------------------------
// 対象メンバーを受け取り、テンプレを選んで以下を入力:
//   ① 氏名 (members.name から既定値)
//   ② 住所 (members.address に永続化)
//   ③ 契約開始日 / 終了日 (1年自動算出、手動上書き可)
//   ④ 口座情報 (members.bank_info に永続化)
// 入力後「契約書を生成」で .docx をダウンロード + contracts に履歴登録。
// =====================================================================

import { useEffect, useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { autoEndDate, generateAndDownloadContract, buildPlaceholders } from '../../../lib/contractGenerator';

const ACCOUNT_TYPES = [
  { value: '', label: '（選択）' },
  { value: 'ordinary', label: '普通' },
  { value: 'checking', label: '当座' },
  { value: 'savings', label: '貯蓄' },
];

export default function GenerateContractModal({ member, onClose, onGenerated }) {
  const [templates, setTemplates] = useState([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [templateId, setTemplateId] = useState('');
  // 契約開始日のデフォルトはメンバーの入社日 (= 契約開始日)
  const [form, setForm] = useState({
    name: member?.name || '',
    address: '',
    start_date: member?.start_date || '',
    end_date: autoEndDate(member?.start_date || ''),
    bank_name: '',
    branch_name: '',
    account_type: '',
    account_number: '',
    account_holder: member?.name || '',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // テンプレ一覧 + member_invoice_profiles の既存口座情報をロード
  useEffect(() => {
    (async () => {
      const orgId = getOrgId();

      const [tplRes, ipRes] = await Promise.all([
        supabase
          .from('contract_templates')
          .select('id, name, file_path')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('uploaded_at', { ascending: false }),
        supabase
          .from('member_invoice_profiles')
          .select('address, bank_name, branch_name, account_type, account_number, account_holder_kana')
          .eq('member_id', member.id)
          .maybeSingle(),
      ]);

      if (tplRes.error) setError(tplRes.error.message);
      else {
        setTemplates(tplRes.data || []);
        if (tplRes.data && tplRes.data.length === 1) setTemplateId(tplRes.data[0].id);
      }

      const ip = ipRes.data;
      if (ip) {
        setForm(s => ({
          ...s,
          address: ip.address || s.address,
          bank_name: ip.bank_name || s.bank_name,
          branch_name: ip.branch_name || s.branch_name,
          account_type: ip.account_type || s.account_type,
          account_number: ip.account_number || s.account_number,
          account_holder: ip.account_holder_kana || s.account_holder,
        }));
      }
      setLoadingTpl(false);
    })();
  }, [member.id]);

  // 開始日を変えたら終了日を自動算出（手動入力されていない場合のみ）
  const onStartDateChange = (v) => {
    setForm(s => ({
      ...s,
      start_date: v,
      end_date: s.end_date && s.end_date !== autoEndDate(s.start_date) ? s.end_date : autoEndDate(v),
    }));
  };

  const set = (k) => (e) => setForm(s => ({ ...s, [k]: e.target.value }));

  const handleGenerate = async () => {
    setError(null);
    if (!templateId) { setError('契約書テンプレを選択してください'); return; }
    if (!form.name.trim()) { setError('氏名を入力してください'); return; }
    if (!form.start_date) { setError('契約開始日を入力してください'); return; }
    if (!form.end_date) { setError('契約終了日を入力してください'); return; }

    const template = templates.find(t => t.id === templateId);
    if (!template) { setError('テンプレが見つかりません'); return; }

    setGenerating(true);

    const bank = {
      bank_name: form.bank_name,
      branch_name: form.branch_name,
      account_type: form.account_type,
      account_number: form.account_number,
      account_holder: form.account_holder,
    };

    try {
      // 永続化: members.name + member_invoice_profiles（請求書と契約書で共用）
      const orgId = getOrgId();
      if (form.name.trim() !== (member?.name || '')) {
        await supabase.from('members').update({ name: form.name.trim() }).eq('id', member.id);
      }
      await supabase.from('member_invoice_profiles').upsert({
        member_id: member.id,
        org_id: orgId,
        address: form.address.trim() || null,
        bank_name: bank.bank_name || null,
        branch_name: bank.branch_name || null,
        account_type: bank.account_type || null,
        account_number: bank.account_number || null,
        account_holder_kana: bank.account_holder || null,
      }, { onConflict: 'member_id' });

      // .docx 生成 + ダウンロード
      const { placeholders, filename } = await generateAndDownloadContract({
        template,
        member: { ...member, name: form.name.trim(), address: form.address.trim() },
        startDate: form.start_date,
        endDate: form.end_date,
        bank,
      });

      // contracts に履歴登録
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('contracts').insert({
        org_id: orgId,
        member_id: member.id,
        template_id: template.id,
        start_date: form.start_date,
        end_date: form.end_date,
        payload: { placeholders, filename, template_name: template.name },
        generated_by: user?.id || null,
      });

      setGenerating(false);
      onGenerated?.({ filename });
      onClose?.();
    } catch (e) {
      setError(e.message || '生成に失敗しました');
      setGenerating(false);
    }
  };

  return (
    <div
      onClick={() => !generating && onClose?.()}
      style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.5), zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl,
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          fontFamily: font.family.sans,
        }}
      >
        <div style={{ background: color.navy, color: color.white, padding: '14px 22px', borderRadius: `${radius.lg}px ${radius.lg}px 0 0` }}>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold }}>業務委託契約書を生成</div>
          <div style={{ fontSize: font.size.xs, opacity: 0.85, marginTop: 2 }}>
            対象: {member?.name || '—'}
          </div>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Row label="契約書テンプレ *">
            {loadingTpl ? (
              <div style={{ fontSize: font.size.xs, color: color.textMid }}>読み込み中…</div>
            ) : templates.length === 0 ? (
              <div style={{ fontSize: font.size.xs, color: color.danger }}>
                テンプレが登録されていません。MASP Members の「業務委託契約書テンプレ」セクションで Word ファイルを追加してください。
              </div>
            ) : (
              <Select
                size="sm"
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                options={[{ value: '', label: '（選択）' }, ...templates.map(t => ({ value: t.id, label: t.name }))]}
              />
            )}
          </Row>

          <SectionLabel>① 氏名 / ② 住所</SectionLabel>
          <Row label="氏名 *">
            <Input size="sm" value={form.name} onChange={set('name')} />
          </Row>
          <Row label="住所">
            <Input size="sm" value={form.address} onChange={set('address')} placeholder="例: 東京都港区六本木1-2-3 マンション101" />
          </Row>

          <SectionLabel>③ 契約期間 (1年・自動更新)</SectionLabel>
          <Row label="開始日 *">
            <Input size="sm" type="date" value={form.start_date} onChange={e => onStartDateChange(e.target.value)} style={{ fontFamily: font.family.mono }} />
          </Row>
          <Row label="終了日 *">
            <Input size="sm" type="date" value={form.end_date} onChange={set('end_date')} style={{ fontFamily: font.family.mono }} />
            <div style={{ fontSize: 10, color: color.textLight, marginTop: 3 }}>
              開始日 + 1年 - 1日 で自動算出。必要に応じて変更可。
            </div>
          </Row>

          <SectionLabel>④ 口座情報</SectionLabel>
          <Row label="銀行名">
            <Input size="sm" value={form.bank_name} onChange={set('bank_name')} placeholder="例: 三井住友銀行 / みずほ信用金庫" />
          </Row>
          <Row label="支店名">
            <Input size="sm" value={form.branch_name} onChange={set('branch_name')} placeholder="例: 六本木支店 / 本店営業部" />
          </Row>
          <Row label="口座種別">
            <Select size="sm" value={form.account_type} onChange={set('account_type')} options={ACCOUNT_TYPES} />
          </Row>
          <Row label="口座番号">
            <Input size="sm" value={form.account_number} onChange={set('account_number')} placeholder="数字のみ" style={{ fontFamily: font.family.mono }} />
          </Row>
          <Row label="口座名義">
            <Input size="sm" value={form.account_holder} onChange={set('account_holder')} placeholder="例: ヤマダ タロウ" />
          </Row>

          {error && (
            <div style={{ fontSize: font.size.xs, color: color.danger, background: alpha(color.danger, 0.06), border: `1px solid ${alpha(color.danger, 0.3)}`, padding: '8px 10px', borderRadius: radius.sm }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: 11, color: color.textMid, padding: '10px 12px', background: color.gray50, borderRadius: radius.sm, lineHeight: 1.6 }}>
            ・住所と口座情報はメンバー情報に保存されます（次回入力省略のため）<br />
            ・生成された .docx をダウンロードし、PDF 化のうえ GMOサインへアップロードしてください
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button variant="secondary" disabled={generating} onClick={() => onClose?.()}>キャンセル</Button>
            <Button loading={generating} disabled={generating || templates.length === 0} onClick={handleGenerate}>
              {generating ? '生成中…' : '契約書を生成 (.docx)'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 110, paddingTop: 6, fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: font.weight.bold, color: color.textMid,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      borderBottom: `1px solid ${color.borderLight}`, paddingBottom: 4, marginTop: 4,
    }}>
      {children}
    </div>
  );
}
