import React, { useState } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { supabase } from '../../../../../lib/supabase';

// 事後課題の添付ファイルバケット（非公開）。
// 受講生アップロード時は getPublicUrl で url を保存しているが、非公開バケットのため
// その公開URLは管理画面から開くと「Bucket not found」404になる。
// ここでは path から署名付きURLを都度生成して開く。
const HOMEWORK_BUCKET = 'spacareer-homework-files';

function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `（${mb.toFixed(1)}MB）`;
  return `（${Math.round(bytes / 1024)}KB）`;
}

// file: { name, path, url, size }
export default function HomeworkFileLink({ file, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const name = file?.name || file?.filename || 'ファイル';

  async function open() {
    setBusy(true); setErr(null);
    try {
      // path があれば署名URLを生成（非公開バケット対応）。無ければ保存済みurlにフォールバック。
      if (file?.path) {
        const { data, error } = await supabase.storage
          .from(HOMEWORK_BUCKET).createSignedUrl(file.path, 60 * 10);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      } else if (file?.url) {
        window.open(file.url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('ファイルの場所が不明です');
      }
    } catch (e) {
      console.error('[HomeworkFileLink] open error:', e);
      setErr('開けませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
      <button type="button" onClick={open} disabled={busy}
        style={{
          border: `1px solid ${color.border}`, borderRadius: radius.sm,
          background: color.white, color: color.navyLight,
          padding: compact ? `2px ${space[2]}px` : `${space[1]}px ${space[2]}px`,
          fontSize: font.size.xs, fontWeight: font.weight.semibold,
          cursor: busy ? 'wait' : 'pointer',
        }}>
        {busy ? '生成中…' : '開く'}
      </button>
      {!compact && (
        <span style={{ fontSize: font.size.xs, color: color.textMid }}>
          {name}<span style={{ color: color.textLight }}>{fmtSize(file?.size)}</span>
        </span>
      )}
      {err && <span style={{ fontSize: font.size.xs, color: color.danger }}>{err}</span>}
    </span>
  );
}
