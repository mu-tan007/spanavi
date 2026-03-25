import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';

const BRAND_KEYS = [
  { key: 'brand_org_name',        label: '組織名',           type: 'text',  defaultVal: 'Spanavi' },
  { key: 'brand_color_primary',   label: 'プライマリカラー', type: 'color', defaultVal: '#032D60' },
  { key: 'brand_color_accent',    label: 'アクセントカラー', type: 'color', defaultVal: '#0176D3' },
  { key: 'brand_color_highlight', label: 'ハイライトカラー', type: 'color', defaultVal: '#C8A84B' },
];

export default function BrandingSettings({ onToast, onBrandingChange }) {
  const [values, setValues] = useState({});
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const allKeys = [...BRAND_KEYS.map(k => k.key), 'brand_logo_url'];
    const { data, error } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', getOrgId())
      .in('setting_key', allKeys);
    if (error) { onToast('ブランド設定の取得に失敗しました', 'error'); }
    else {
      const map = {};
      (data || []).forEach(r => { map[r.setting_key] = r.setting_value; });
      setValues(map);
      setLogoUrl(map.brand_logo_url || '');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleChange = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { onToast('画像ファイルを選択してください', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { onToast('ファイルサイズは2MB以下にしてください', 'error'); return; }

    setUploading(true);
    const orgId = getOrgId();
    const ext = file.name.split('.').pop();
    const path = `${orgId}/logo.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('org-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      onToast('ロゴのアップロードに失敗しました', 'error');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path);
    const url = urlData?.publicUrl || '';
    setLogoUrl(url);
    setValues(prev => ({ ...prev, brand_logo_url: url }));
    setUploading(false);
  };

  const removeLogo = () => {
    setLogoUrl('');
    setValues(prev => ({ ...prev, brand_logo_url: '' }));
  };

  const save = async () => {
    setSaving(true);
    const allKeys = [...BRAND_KEYS.map(k => k.key), 'brand_logo_url'];
    const upsertRows = allKeys.map(key => ({
      org_id: getOrgId(),
      setting_key: key,
      setting_value: String(values[key] ?? ''),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('org_settings')
      .upsert(upsertRows, { onConflict: 'org_id,setting_key' });
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    onToast('ブランド設定を保存しました');
    if (onBrandingChange) onBrandingChange();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>読み込み中...</div>;

  const previewPrimary = values.brand_color_primary || '#032D60';
  const previewAccent = values.brand_color_accent || '#0176D3';
  const previewHighlight = values.brand_color_highlight || '#C8A84B';
  const previewName = values.brand_org_name || 'Spanavi';

  return (
    <div style={{ maxWidth: 600 }}>
      {/* 組織名 */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
          組織情報
        </div>
        {BRAND_KEYS.filter(k => k.type === 'text').map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{item.label}</label>
            <input
              type="text"
              value={values[item.key] ?? item.defaultVal}
              onChange={e => handleChange(item.key, e.target.value)}
              style={{ width: 240, padding: '6px 10px', borderRadius: 6, border: '1px solid #E5E5E5', fontSize: 13 }}
            />
          </div>
        ))}

        {/* ロゴ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>ロゴ画像</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {logoUrl && (
              <img src={logoUrl} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, border: '1px solid #E5E5E5' }} />
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid #E5E5E5', background: '#fff', color: '#374151', cursor: 'pointer' }}
            >
              {uploading ? 'アップロード中...' : logoUrl ? '変更' : 'アップロード'}
            </button>
            {logoUrl && (
              <button
                onClick={removeLogo}
                style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
              >
                削除
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          </div>
        </div>
      </div>

      {/* テーマカラー */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
          テーマカラー
        </div>
        {BRAND_KEYS.filter(k => k.type === 'color').map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{item.label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={values[item.key] || item.defaultVal}
                onChange={e => handleChange(item.key, e.target.value)}
                style={{ width: 36, height: 28, border: '1px solid #E5E5E5', borderRadius: 4, cursor: 'pointer', padding: 0 }}
              />
              <input
                type="text"
                value={values[item.key] || item.defaultVal}
                onChange={e => handleChange(item.key, e.target.value)}
                style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E5E5', fontSize: 12, fontFamily: "'JetBrains Mono'" }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* プレビュー */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
          プレビュー
        </div>
        <div style={{ background: previewPrimary, borderRadius: 6, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 4, background: previewAccent, opacity: 0.6 }} />
          )}
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1.5 }}>
            <span style={{ color: previewAccent }}>{previewName.slice(0, Math.ceil(previewName.length / 2))}</span>
            <span style={{ color: previewHighlight }}>{previewName.slice(Math.ceil(previewName.length / 2))}</span>
          </span>
        </div>
      </div>

      {/* 保存 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '9px 28px', borderRadius: 4, fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', border: 'none',
            background: saving ? '#9CA3AF' : NAVY, color: '#fff',
            fontFamily: "'Noto Sans JP'",
          }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}
