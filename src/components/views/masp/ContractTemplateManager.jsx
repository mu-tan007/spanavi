// =====================================================================
// 業務委託契約書 / NDA テンプレ管理セクション
// ---------------------------------------------------------------------
// admin 専用。.docx テンプレを複数アップロード/削除できる。
// scope_type で「メンバー向け (業務委託)」と「クライアント向け (NDA/業務委託)」
// を分けて管理する。
// =====================================================================

import { useEffect, useState, useRef } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Card } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { templateStoragePath } from '../../../lib/contractGenerator';

// メンバー向け (既存仕様)
const MEMBER_PLACEHOLDERS = [
  ['{{name}}', '氏名'],
  ['{{address}}', '住所'],
  ['{{start_date}}', '契約開始日 (例: 2026年5月18日)'],
  ['{{end_date}}', '契約終了日 (例: 2027年5月17日)'],
  ['{{bank_name}}', '銀行名'],
  ['{{bank_branch}}', '支店名'],
  ['{{account_type}}', '口座種別 (普通/当座/貯蓄)'],
  ['{{account_number}}', '口座番号'],
  ['{{account_holder}}', '口座名義'],
];

// クライアント向け (新規)
const CLIENT_PLACEHOLDERS = [
  ['{{client_name}}', 'クライアント企業名 (例: 株式会社○○)'],
  ['{{client_address}}', 'クライアント住所 (漢数字込みの当社表記)'],
  ['{{client_representative}}', 'クライアント代表者氏名'],
  ['{{contract_date}}', '契約締結日 (例: 令和8年6月1日)'],
  ['{{period_start}}', '契約開始日 (例: 令和8年6月1日)'],
  ['{{period_end}}', '契約終了日 (例: 令和9年5月31日)'],
  ['{{reward_table}}', '報酬体系 (タイプ別) — CRMの「報酬体系(タイプ別)」を自動表記化'],
  ['{{tax}}', '消費税表記 (例: 税別 / 税込)'],
  ['{{payment_site}}', '支払サイト (例: 毎月末日〆翌月15日払い)'],
];

const SCOPE_TABS = [
  { key: 'member', label: 'メンバー向け', desc: '業務委託契約書' },
  { key: 'client', label: 'クライアント向け', desc: 'NDA / 業務委託契約書' },
];

export default function ContractTemplateManager({ isAdmin }) {
  const [scopeType, setScopeType] = useState('member');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const orgId = getOrgId();
    const { data, error: err } = await supabase
      .from('contract_templates')
      .select('id, name, file_path, uploaded_at, is_active, scope_type')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('scope_type', scopeType)
      .order('uploaded_at', { ascending: false });
    if (err) setError(err.message);
    else setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scopeType]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Word ファイル (.docx) を選択してください');
      return;
    }
    setUploading(true);
    setError(null);
    const orgId = getOrgId();
    const baseName = file.name.replace(/\.docx$/i, '').slice(0, 80);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error: insErr } = await supabase
      .from('contract_templates')
      .insert({
        org_id: orgId,
        name: baseName,
        file_path: 'pending',
        uploaded_by: user?.id || null,
        scope_type: scopeType,
      })
      .select('id')
      .single();
    if (insErr) {
      setError(`登録失敗: ${insErr.message}`);
      setUploading(false);
      return;
    }

    const path = templateStoragePath(orgId, row.id);
    const { error: upErr } = await supabase.storage
      .from('contract-templates')
      .upload(path, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });
    if (upErr) {
      await supabase.from('contract_templates').delete().eq('id', row.id);
      setError(`アップロード失敗: ${upErr.message}`);
      setUploading(false);
      return;
    }

    await supabase.from('contract_templates').update({ file_path: path }).eq('id', row.id);

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  };

  const handleDelete = async (t) => {
    if (!confirm(`テンプレ「${t.name}」を削除しますか？`)) return;
    await supabase.storage.from('contract-templates').remove([t.file_path]);
    await supabase.from('contract_templates').update({ is_active: false }).eq('id', t.id);
    load();
  };

  const placeholderList = scopeType === 'client' ? CLIENT_PLACEHOLDERS : MEMBER_PLACEHOLDERS;
  const currentDesc = scopeType === 'client'
    ? 'クライアントとの契約開始時に、CRMクライアント詳細画面から差し込み生成できます (NDA / 業務委託)'
    : 'メンバー追加時にワンクリックで差し込み生成できます (業務委託契約書)';

  return (
    <Card
      variant="default"
      padding="md"
      style={{ borderRadius: radius.md, marginBottom: space[4] }}
      bodyStyle={{ padding: space[4] }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>契約書テンプレ管理</div>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
            Word (.docx) ひな形を事前アップロード、差し込みで自動生成
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button size="sm" variant="outline" onClick={() => setShowHelp(s => !s)}>
            {showHelp ? 'プレースホルダ説明を閉じる' : 'プレースホルダ説明'}
          </Button>
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => handleUpload(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                loading={uploading}
                disabled={uploading}
              >
                {uploading ? 'アップロード中…' : '+ テンプレを追加'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* scope タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: space[3] }}>
        {SCOPE_TABS.map(t => {
          const active = scopeType === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setScopeType(t.key)}
              style={{
                padding: '6px 14px', borderRadius: radius.sm,
                fontSize: font.size.xs, fontWeight: font.weight.semibold,
                cursor: 'pointer', fontFamily: font.family.sans,
                border: '1px solid ' + (active ? color.navy : color.border),
                background: active ? color.navy : color.white,
                color: active ? color.white : color.textMid,
              }}
            >
              {t.label}
              <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 6 }}>{t.desc}</span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: color.textLight, marginBottom: space[2] }}>
        {currentDesc}
      </div>

      {showHelp && (
        <div style={{
          background: color.cream, border: `1px solid ${color.border}`,
          borderRadius: radius.sm, padding: space[3], marginBottom: space[3],
          fontSize: font.size.xs, lineHeight: font.lineHeight.relaxed, color: color.textDark,
        }}>
          <div style={{ fontWeight: font.weight.bold, color: color.navy, marginBottom: 4 }}>
            Word テンプレ作成時のルール ({scopeType === 'client' ? 'クライアント向け' : 'メンバー向け'})
          </div>
          差し込みたい箇所に以下のプレースホルダをそのまま記入してください。
          <table style={{ marginTop: 8, fontFamily: font.family.mono, fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {placeholderList.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '2px 12px 2px 0', color: color.navy, fontWeight: font.weight.bold, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                  <td style={{ padding: '2px 0', color: color.textMid, fontFamily: font.family.sans }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: space[2], fontSize: font.size.xs, color: color.danger }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: space[3], color: color.textMid, fontSize: font.size.xs }}>読み込み中…</div>
      ) : templates.length === 0 ? (
        <div style={{ padding: space[3], color: color.textLight, fontSize: font.size.xs, textAlign: 'center', background: color.gray50, borderRadius: radius.sm }}>
          テンプレがまだありません。{isAdmin ? '右上の「+ テンプレを追加」から Word ファイルをアップロードしてください。' : '管理者にアップロードを依頼してください。'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', background: color.white,
              border: `1px solid ${color.borderLight}`, borderRadius: radius.sm,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span style={{ fontSize: 10, color: color.textLight, fontFamily: font.family.mono, whiteSpace: 'nowrap' }}>
                  {(t.uploaded_at || '').slice(0, 10)}
                </span>
              </div>
              {isAdmin && (
                <Button size="sm" variant="ghost" onClick={() => handleDelete(t)} style={{ color: color.danger, fontSize: 11, minHeight: 24, padding: '2px 8px' }}>
                  削除
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
