import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font } from '../../constants/design';
import { Button, Input, Card } from '../ui';

const NAVY = color.navy;

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

  if (loading) return <div style={{ padding: space[10], textAlign: 'center', color: color.gray400 }}>読み込み中...</div>;

  const previewPrimary = values.brand_color_primary || '#032D60';
  const previewAccent = values.brand_color_accent || '#0176D3';
  const previewHighlight = values.brand_color_highlight || '#C8A84B';
  const previewName = values.brand_org_name || 'Spanavi';

  const sectionCardStyle = { padding: `${space[5]}px ${space[6]}px`, marginBottom: space[5] };
  const sectionTitleStyle = {
    fontSize: font.size.base,
    fontWeight: font.weight.bold,
    color: NAVY,
    marginBottom: space[4],
    paddingBottom: space[2.5],
    borderBottom: `2px solid ${NAVY}`,
    display: 'inline-block',
  };
  const labelStyle = { fontSize: font.size.base, color: color.gray700, fontWeight: font.weight.medium };
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* 組織名 */}
      <Card variant="default" padding="none" style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          組織情報
        </div>
        {BRAND_KEYS.filter(k => k.type === 'text').map(item => (
          <div key={item.key} style={rowStyle}>
            <label style={labelStyle}>{item.label}</label>
            <div style={{ width: 240 }}>
              <Input
                size="sm"
                type="text"
                value={values[item.key] ?? item.defaultVal}
                onChange={e => handleChange(item.key, e.target.value)}
              />
            </div>
          </div>
        ))}

        {/* ロゴ */}
        <div style={{ ...rowStyle, marginBottom: 0 }}>
          <label style={labelStyle}>ロゴ画像</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2.5] }}>
            {logoUrl && (
              <img src={logoUrl} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: radius.md, border: `1px solid ${color.border}` }} />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              loading={uploading}
            >
              {uploading ? 'アップロード中...' : logoUrl ? '変更' : 'アップロード'}
            </Button>
            {logoUrl && (
              <Button variant="danger" size="sm" onClick={removeLogo}>
                削除
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          </div>
        </div>
      </Card>

      {/* テーマカラー */}
      <Card variant="default" padding="none" style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          テーマカラー
        </div>
        {BRAND_KEYS.filter(k => k.type === 'color').map(item => (
          <div key={item.key} style={rowStyle}>
            <label style={labelStyle}>{item.label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <input
                type="color"
                value={values[item.key] || item.defaultVal}
                onChange={e => handleChange(item.key, e.target.value)}
                style={{ width: 36, height: 28, border: `1px solid ${color.border}`, borderRadius: radius.md, cursor: 'pointer', padding: 0 }}
              />
              <div style={{ width: 90 }}>
                <Input
                  size="sm"
                  type="text"
                  value={values[item.key] || item.defaultVal}
                  onChange={e => handleChange(item.key, e.target.value)}
                  style={{ fontFamily: font.family.mono, fontSize: font.size.sm }}
                />
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* プレビュー */}
      <Card variant="default" padding="none" style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          プレビュー
        </div>
        <div style={{ background: previewPrimary, borderRadius: radius.lg, padding: `${space[4]}px ${space[5]}px`, display: 'flex', alignItems: 'center', gap: space[3] }}>
          {logoUrl ? (
            <img src={logoUrl} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: radius.md, background: previewAccent, opacity: 0.6 }} />
          )}
          <span style={{ fontSize: 18, fontWeight: font.weight.black, letterSpacing: 1.5 }}>
            <span style={{ color: previewAccent }}>{previewName.slice(0, Math.ceil(previewName.length / 2))}</span>
            <span style={{ color: previewHighlight }}>{previewName.slice(Math.ceil(previewName.length / 2))}</span>
          </span>
        </div>
      </Card>

      {/* 保存 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={save} disabled={saving} loading={saving}>
          {saving ? '保存中...' : '保存する'}
        </Button>
      </div>
    </div>
  );
}
