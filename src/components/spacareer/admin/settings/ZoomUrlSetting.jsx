import React, { useState, useEffect } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Button, Input, Card, Badge } from '../../../ui';
import { supabase } from '../../../../lib/supabase';

// Zoom URL 設定
// - 当初は手入力で全顧客共通の固定URL
// - 将来 TimeRex API 連携で自動生成（仕様書 §7.8 / §9.3）
// - 保存先：spacareer_settings テーブル（key='zoom_url'）想定
//   （未実装なら設定保存処理は no-op に近い形で配置）
export default function ZoomUrlSetting() {
  const [url, setUrl] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  // 設定値ロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('spacareer_settings')
          .select('setting_value')
          .eq('setting_key', 'zoom_url')
          .maybeSingle();
        if (cancelled) return;
        if (err && err.code !== 'PGRST116') {
          // テーブル未作成等の場合はサイレントスルー
          console.warn('[ZoomUrlSetting] load:', err.message);
        }
        const v = data?.setting_value?.url || '';
        setUrl(v);
        setInitial(v);
      } catch (e) {
        console.warn('[ZoomUrlSetting] load exception:', e?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isValidUrl = (s) => {
    if (!s) return true; // 空欄も許可（未設定）
    try {
      const u = new URL(s);
      return u.protocol === 'https:' && /zoom\.us|zoomgov\.com/.test(u.hostname);
    } catch {
      return false;
    }
  };

  const dirty = url !== initial;
  const valid = isValidUrl(url);

  const handleSave = async () => {
    if (!valid) {
      setError('Zoom の https URL を入力してください');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from('spacareer_settings')
        .upsert({ setting_key: 'zoom_url', setting_value: { url } }, { onConflict: 'setting_key' });
      if (err) throw err;
      setInitial(url);
      setSavedAt(new Date());
    } catch (e) {
      setError('保存に失敗しました: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="md" title="Zoom URL（全顧客共通）" description="第1〜8回セッションで共通利用する Zoom 固定URL。将来 TimeRex 連携で自動生成予定。">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Input
          label="Zoom URL"
          placeholder="https://us02web.zoom.us/j/0000000000"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading || saving}
          required
        />
        {!valid && url && (
          <div style={{ fontSize: font.size.xs, color: color.danger }}>
            Zoom の https URL を入力してください
          </div>
        )}
        {error && (
          <div style={{ fontSize: font.size.xs, color: color.danger }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={!dirty || !valid || loading}
            loading={saving}
          >
            保存
          </Button>
          {savedAt && (
            <Badge variant="success" dot>
              保存しました（{savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）
            </Badge>
          )}
          {!dirty && initial && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              現在の設定値が表示されています
            </span>
          )}
        </div>

        <div style={{
          padding: space[3],
          background: color.cream,
          border: `1px dashed ${color.border}`,
          borderRadius: radius.md,
          fontSize: font.size.xs,
          color: color.textMid,
        }}>
          ※ Zoom URL は <code style={{ fontFamily: font.family.mono, color: color.navy }}>spacareer_settings</code> テーブルに
          <code style={{ fontFamily: font.family.mono, color: color.navy }}> setting_key='zoom_url' </code>
          で保存されます。クライアントポータルのセッション履歴・Slackテンプレでも参照されます。
        </div>
      </div>
    </Card>
  );
}
