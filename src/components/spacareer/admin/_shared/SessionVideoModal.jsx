import React, { useState, useEffect } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../../constants/design';
import { Button } from '../../../ui';
import { createSessionVideoSignedUrl } from '../../../../lib/spacareer/integrations/videoUpload';

// ============================================================
// セッション録画 画面内プレーヤー（モーダル）
// ----------------------------------------------------------------
// 営業代行ロープレの動画参照と同じく、別タブに飛ばさず管理画面内で
// そのまま録画を再生する。spacareer-session-videos は非公開バケットのため
// 署名付きURL（1時間）を発行して <video> に渡す（getPublicUrl は 404 になる）。
//
// props:
//   open        : 表示フラグ
//   onClose     : 閉じるハンドラ
//   storagePath : spacareer-session-videos 内のパス（v.storage_path）
//   title       : ヘッダーに出す見出し（例「第3回 録画」）
// ============================================================
export default function SessionVideoModal({ open, onClose, storagePath, title }) {
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || !storagePath) return;
    setSignedUrl(null);
    setErr(null);
    setLoading(true);
    createSessionVideoSignedUrl(storagePath)
      .then((url) => {
        if (cancelled) return;
        if (url) setSignedUrl(url);
        else setErr('録画の再生URLを取得できませんでした。');
      })
      .catch((e) => { if (!cancelled) setErr(e?.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, storagePath]);

  // Esc キーで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 960,
          background: color.white,
          borderRadius: radius.lg,
          boxShadow: shadow.xl,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${space[2]}px ${space[3]}px`,
          background: color.navy,
        }}>
          <div style={{ color: color.white, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
            {title || 'セッション録画'}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}
            style={{ color: color.white }}>閉じる</Button>
        </div>

        <div style={{ background: '#000', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <div style={{ color: color.white, fontSize: font.size.sm, padding: space[6] }}>
              録画を読み込み中…
            </div>
          )}
          {err && !loading && (
            <div style={{ color: color.white, fontSize: font.size.sm, padding: space[6], textAlign: 'center' }}>
              {err}
            </div>
          )}
          {signedUrl && !loading && (
            <video
              src={signedUrl}
              controls
              autoPlay
              controlsList="nodownload"
              style={{ width: '100%', maxHeight: '75vh', display: 'block', background: '#000' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
