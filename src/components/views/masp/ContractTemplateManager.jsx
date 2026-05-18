// =====================================================================
// 業務委託契約書 テンプレ管理セクション (MASP Members ページ内)
// ---------------------------------------------------------------------
// admin 専用。.docx テンプレを複数アップロード/削除できる。
// プレースホルダ命名規則をユーザーに見せておく。
// =====================================================================

import { useEffect, useState, useRef } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Card } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { templateStoragePath } from '../../../lib/contractGenerator';

const PLACEHOLDER_LIST = [
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

export default function ContractTemplateManager({ isAdmin }) {
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
      .select('id, name, file_path, uploaded_at, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false });
    if (err) setError(err.message);
    else setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

    // 1. contract_templates に INSERT して id を確定
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error: insErr } = await supabase
      .from('contract_templates')
      .insert({
        org_id: orgId,
        name: baseName,
        file_path: 'pending',
        uploaded_by: user?.id || null,
      })
      .select('id')
      .single();
    if (insErr) {
      setError(`登録失敗: ${insErr.message}`);
      setUploading(false);
      return;
    }

    // 2. Storage アップロード
    const path = templateStoragePath(orgId, row.id);
    const { error: upErr } = await supabase.storage
      .from('contract-templates')
      .upload(path, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });
    if (upErr) {
      // ロールバック: 行も消す
      await supabase.from('contract_templates').delete().eq('id', row.id);
      setError(`アップロード失敗: ${upErr.message}`);
      setUploading(false);
      return;
    }

    // 3. file_path を更新
    await supabase.from('contract_templates').update({ file_path: path }).eq('id', row.id);

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  };

  const handleDelete = async (t) => {
    if (!confirm(`テンプレ「${t.name}」を削除しますか？`)) return;
    // Storage から削除
    await supabase.storage.from('contract-templates').remove([t.file_path]);
    // is_active=false で論理削除（過去 contracts からの参照は残す）
    await supabase.from('contract_templates').update({ is_active: false }).eq('id', t.id);
    load();
  };

  return (
    <Card
      variant="default"
      padding="md"
      style={{ borderRadius: radius.md, marginBottom: space[4] }}
      bodyStyle={{ padding: space[4] }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>業務委託契約書テンプレ</div>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
            Word (.docx) をアップロードしておくと、メンバー追加時にワンクリックで差し込み生成できます
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

      {showHelp && (
        <div style={{
          background: color.cream, border: `1px solid ${color.border}`,
          borderRadius: radius.sm, padding: space[3], marginBottom: space[3],
          fontSize: font.size.xs, lineHeight: font.lineHeight.relaxed, color: color.textDark,
        }}>
          <div style={{ fontWeight: font.weight.bold, color: color.navy, marginBottom: 4 }}>
            Word テンプレ作成時のルール
          </div>
          差し込みたい箇所に以下のプレースホルダをそのまま記入してください。Word で「{'{{'}name{'}}'} 様」のように書けば、生成時に氏名へ置換されます。
          <table style={{ marginTop: 8, fontFamily: font.family.mono, fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {PLACEHOLDER_LIST.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '2px 12px 2px 0', color: color.navy, fontWeight: font.weight.bold }}>{k}</td>
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
