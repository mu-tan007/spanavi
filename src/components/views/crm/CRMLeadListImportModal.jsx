import { useState } from 'react';
import { C } from '../../../constants/colors';
import { insertClientLeadList, insertClientLeadCompaniesBulk } from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50, parseCSVText } from './utils';

export default function CRMLeadListImportModal({ currentUser, onClose, onImported }) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [scriptBody, setScriptBody] = useState('');
  const [parsed, setParsed] = useState(null); // { rows, headers, mapping }
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const result = parseCSVText(text);
    setParsed(result);
    if (!name) {
      // ファイル名（拡張子除く）をリスト名のデフォルトに
      setName(file.name.replace(/\.csv$/i, ''));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { alert('リスト名を入力してください'); return; }
    if (!parsed || parsed.rows.length === 0) { alert('CSV を読み込んでください（企業名列が必要）'); return; }
    setSaving(true);
    const { data: list, error: e1 } = await insertClientLeadList({
      name: name.trim(),
      industry: industry.trim() || null,
      scriptBody: scriptBody || null,
      createdByName: currentUser || null,
    });
    if (e1 || !list) {
      setSaving(false);
      alert('リスト作成に失敗しました: ' + (e1?.message || ''));
      return;
    }
    const { error: e2 } = await insertClientLeadCompaniesBulk(list.id, parsed.rows);
    if (e2) {
      setSaving(false);
      alert('企業データの保存に失敗しました: ' + (e2.message || ''));
      return;
    }
    setSaving(false);
    if (onImported) onImported(list);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 4,
    border: '1px solid ' + GRAY_200, fontSize: 12, fontFamily: "'Noto Sans JP'",
    outline: 'none', background: GRAY_50,
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 4, display: 'block' };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 20001,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
        width: 560, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ padding: '12px 20px', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 14 }}>
          新規開拓リストの取り込み（CSV）
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>リスト名 <span style={{ color: C.red }}>*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例: 製造業 関東 50件" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>業界（任意）</label>
            <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="例: 製造業" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>架電トークスクリプト（任意・後から編集可）</label>
            <textarea
              value={scriptBody}
              onChange={e => setScriptBody(e.target.value)}
              rows={6}
              placeholder={"このリスト向けの営業トーク台本を貼り付け\n（業界別に最適化したい場合に使用）"}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>CSV ファイル <span style={{ color: C.red }}>*</span></label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => handleFile(e.target.files?.[0])}
              style={{ fontSize: 11 }}
            />
            <div style={{ fontSize: 10, color: C.textLight, marginTop: 4 }}>
              先頭行を見出しとして自動認識（企業名/電話番号/代表者/事業内容/住所/都道府県/メール 等）
            </div>
          </div>

          {parsed && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: '#FFFBEB',
              border: '1px solid ' + C.gold + '60', borderRadius: 3,
              fontSize: 11,
            }}>
              <div style={{ marginBottom: 6, fontWeight: 700, color: NAVY }}>
                {fileName} を読み込み
              </div>
              <div style={{ color: C.textMid }}>
                取り込み対象: <strong>{parsed.rows.length}</strong> 件 / ヘッダー: {parsed.headers.length} 列
              </div>
              <div style={{ marginTop: 4, color: C.textMid, fontSize: 10 }}>
                自動マッピング: {Object.keys(parsed.mapping).map(k => k).join(', ') || 'なし'}
              </div>
              {parsed.rows.length === 0 && (
                <div style={{ marginTop: 6, color: C.red, fontWeight: 600 }}>
                  企業名（company）列が認識できませんでした。CSV のヘッダー名を確認してください。
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{
          padding: '10px 20px', borderTop: '1px solid ' + GRAY_200,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: '8px 16px', borderRadius: 4,
            border: '1px solid ' + NAVY, background: '#fff',
            color: NAVY, fontSize: 12, fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving || !parsed || parsed.rows.length === 0} style={{
            padding: '8px 16px', borderRadius: 4, border: 'none',
            background: (saving || !parsed || parsed.rows.length === 0) ? C.textLight : NAVY,
            color: '#fff', fontSize: 12, fontWeight: 500,
            cursor: (saving || !parsed || parsed.rows.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}>{saving ? '取り込み中...' : '取り込む'}</button>
        </div>
      </div>
    </div>
  );
}
