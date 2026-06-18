import React, { useState, useRef } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Input, Select } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';
import { uploadVideoResumable, uploadCourseThumbnail } from '../../../../lib/spacareer/integrations/videoUpload';
import { useFileDrop } from '../../_shared/useFileDrop';

// ============================================================
// AI講座 動画アップロードモーダル
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-spec.md §7.5 / §9.2
// - 既存ロープレ動画アップロード基盤を流用（Supabase Storage直接アップ）
// - サイズ上限: 24MB（ロープレと同一）
// - AI議事録生成は不要（教材なので）
// - メタデータ: title / description / duration_seconds / category_id / thumbnail_url
// - Storage バケット: spacareer-course-videos
// ============================================================

// Resumable Upload(TUS)経由のため bucket 側 file_size_limit(2GB)まで通る。
// 標準 upload() の 50MB 制限には縛られない。
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const STORAGE_BUCKET = 'spacareer-course-videos';

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function readVideoDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Math.round(v.duration) || null);
      };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      v.src = url;
    } catch { resolve(null); }
  });
}

// 動画の冒頭フレームをJPEGとして切り出す（自動サムネイル用）。
// 真っ黒になりがちな先頭を避けるため、長さに応じて 1秒地点（短尺は0.1秒）を採用。
// 戻り値: { blob, dataUrl } または null（失敗時はサムネなしで続行）。
async function captureVideoThumbnail(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        resolve(result);
      };
      v.onloadedmetadata = () => {
        const target = (v.duration && v.duration > 2) ? 1 : 0.1;
        try { v.currentTime = target; } catch { finish(null); }
      };
      v.onseeked = () => {
        try {
          const w = v.videoWidth || 1280;
          const h = v.videoHeight || 720;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(v, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          canvas.toBlob(
            (blob) => finish(blob ? { blob, dataUrl } : null),
            'image/jpeg',
            0.8,
          );
        } catch { finish(null); }
      };
      v.onerror = () => finish(null);
      v.src = url;
    } catch { resolve(null); }
  });
}

export default function VideoUploadModal({ open, onClose, categories, onUploaded, editTarget = null }) {
  const isEdit = !!editTarget;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState(null);
  const [thumbBlob, setThumbBlob] = useState(null);      // 動画冒頭フレームの自動サムネ
  const [thumbPreview, setThumbPreview] = useState('');
  const [manualThumbFile, setManualThumbFile] = useState(null); // 管理者が手動アップした画像
  const [manualThumbPreview, setManualThumbPreview] = useState('');
  const [existingThumb, setExistingThumb] = useState(''); // 編集時の既存サムネ表示用
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const thumbInputRef = useRef(null);

  const selectedCat = (categories || []).find(c => c.id === categoryId);
  const isPersonalCat = !!selectedCat?.is_personal;

  React.useEffect(() => {
    if (open) {
      if (isEdit && editTarget) {
        setTitle(editTarget.title || '');
        setDescription(editTarget.description || '');
        setCategoryId(editTarget.category_id || '');
        setDuration(editTarget.duration_seconds || null);
        setExistingThumb(editTarget._thumbUrl || editTarget.thumbnail_url || '');
        setFile(null);
      } else {
        setTitle('');
        setDescription('');
        setCategoryId(categories?.[0]?.id || '');
        setDuration(null);
        setExistingThumb('');
        setFile(null);
      }
      setThumbBlob(null);
      setThumbPreview('');
      setManualThumbFile(null);
      setManualThumbPreview('');
      setProgress(null);
      setError(null);
    }
  }, [open, editTarget, isEdit, categories]);

  if (!open) return null;

  const handleFile = async (f) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) {
      setError(`動画サイズが上限2GBを超えています（${formatBytes(f.size)}）`);
      setFile(null);
      return;
    }
    setFile(f);
    const dur = await readVideoDuration(f);
    if (dur) setDuration(dur);
    // 冒頭フレームを自動サムネイルとして切り出す
    const thumb = await captureVideoThumbnail(f);
    if (thumb) {
      setThumbBlob(thumb.blob);
      setThumbPreview(thumb.dataUrl);
    } else {
      setThumbBlob(null);
      setThumbPreview('');
    }
  };

  // 管理者が手動でサムネイル画像を選択/ドロップしたとき
  const handleThumbFile = (f) => {
    setError(null);
    if (!f) return;
    if (!f.type?.startsWith('image/')) {
      setError('サムネイルには画像ファイルを指定してください');
      return;
    }
    setManualThumbFile(f);
    const url = URL.createObjectURL(f);
    setManualThumbPreview(url);
  };

  const { isOver: videoOver, dropHandlers: videoDrop } = useFileDrop(handleFile, saving);
  const { isOver: thumbOver, dropHandlers: thumbDrop } = useFileDrop(handleThumbFile, saving);
  // 表示するサムネプレビュー: 手動画像 > 自動冒頭フレーム > 既存サムネ
  const previewSrc = manualThumbPreview || thumbPreview || existingThumb;

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) { setError('タイトルを入力してください'); return; }
    if (!categoryId) { setError('カテゴリを選択してください'); return; }
    if (!isEdit && !file) { setError('動画ファイルを選択してください'); return; }

    setSaving(true);
    try {
      const orgId = getOrgId();
      let storagePath = editTarget?.storage_path || null;
      let videoUrl = editTarget?.video_url || null;
      let thumbnailPath = editTarget?.thumbnail_path || null;
      let durationSeconds = duration ?? editTarget?.duration_seconds ?? null;
      const videoId = editTarget?.id || (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

      if (file) {
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        const path = `${orgId}/${videoId}.${ext}`;

        setProgress('アップロード中... 0%');
        // Resumable Upload(TUS)。大容量(〜2GB)・回線断にも対応。
        const { error: upErr } = await uploadVideoResumable({
          bucket: STORAGE_BUCKET,
          path,
          file,
          contentType: file.type || 'video/mp4',
          upsert: true,
          onProgress: (uploaded, total) => {
            if (total > 0) setProgress(`アップロード中... ${Math.floor((uploaded / total) * 100)}%（大きい動画は数分かかります）`);
          },
        });
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        storagePath = path;
        videoUrl = urlData?.publicUrl || null;
      }

      // サムネイル: 手動アップ画像 > 動画冒頭フレームの自動サムネ。
      // どちらか新しい指定があれば保存（編集で動画差し替えなしでも更新可能）。
      const thumbSource = manualThumbFile
        ? { blob: manualThumbFile, ct: manualThumbFile.type || 'image/jpeg' }
        : (thumbBlob ? { blob: thumbBlob, ct: 'image/jpeg' } : null);
      if (thumbSource) {
        setProgress('サムネイルを保存中...');
        const tp = await uploadCourseThumbnail(orgId, videoId, thumbSource.blob, thumbSource.ct);
        if (tp) thumbnailPath = tp;
      }

      setProgress('メタデータを保存中...');
      if (isEdit) {
        const updatePayload = {
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId,
          thumbnail_path: thumbnailPath,
          duration_seconds: durationSeconds,
          storage_path: storagePath,
          video_url: videoUrl,
        };
        // 専用配信カテゴリーに移したら個別配信へ切替（配信先は配信モーダルで指定）
        if (isPersonalCat && editTarget?.audience !== 'assigned') {
          updatePayload.audience = 'assigned';
        }
        const { error: updErr } = await supabase
          .from('spacareer_course_videos')
          .update(updatePayload)
          .eq('id', editTarget.id);
        if (updErr) throw updErr;
      } else {
        // 同一カテゴリ内の末尾に置く
        const { data: maxRow } = await supabase
          .from('spacareer_course_videos')
          .select('position')
          .eq('category_id', categoryId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextPos = (maxRow?.position ?? -1) + 1;

        const { error: insErr } = await supabase
          .from('spacareer_course_videos')
          .insert({
            id: videoId,
            org_id: orgId,
            category_id: categoryId,
            title: title.trim(),
            description: description.trim() || null,
            thumbnail_path: thumbnailPath,
            duration_seconds: durationSeconds,
            storage_path: storagePath,
            video_url: videoUrl,
            position: nextPos,
            is_active: true,
            // 専用配信カテゴリーの動画は受講生ごとの個別配信が前提
            audience: isPersonalCat ? 'assigned' : 'all',
          });
        if (insErr) throw insErr;
      }

      setProgress(null);
      onUploaded && onUploaded();
      onClose && onClose();
    } catch (e) {
      console.error('[VideoUploadModal] save error:', e);
      setError(e?.message || 'アップロードに失敗しました');
      setProgress(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={() => !saving && onClose && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[4],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh',
          background: color.white, borderRadius: radius.lg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          background: color.navy, color: color.white,
          padding: `${space[4]}px ${space[5]}px`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold }}>
            {isEdit ? '動画情報を編集' : '動画をアップロード'}
          </div>
          <button onClick={onClose} disabled={saving} style={{
            background: 'transparent', color: color.white, border: 'none',
            fontSize: font.size.xl, cursor: saving ? 'not-allowed' : 'pointer',
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: space[5], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {error && (
            <div style={{
              padding: space[3],
              background: alpha(color.danger, 0.08),
              border: `1px solid ${alpha(color.danger, 0.3)}`,
              borderRadius: radius.md, color: color.danger, fontSize: font.size.sm,
            }}>{error}</div>
          )}

          <Input
            label="タイトル" required
            placeholder="例: ChatGPT で議事録を10分で作る"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: space[1] }}>
              説明文
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="動画の概要や学習ポイントを記入してください"
              style={{
                width: '100%',
                padding: `${space[2]}px ${space[3]}px`,
                fontSize: font.size.md,
                fontFamily: font.family.sans,
                color: color.textDark,
                background: color.white,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <Select
            label="カテゴリ" required
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            options={(categories || []).map(c => ({ value: c.id, label: c.is_personal ? `${c.name}（専用配信）` : c.name }))}
          />
          {isPersonalCat && (
            <div style={{
              padding: space[2],
              background: alpha(color.info, 0.08),
              border: `1px solid ${alpha(color.info, 0.3)}`,
              borderRadius: radius.md, color: color.info, fontSize: font.size.xs,
            }}>
              専用配信カテゴリーです。アップロード後、「配信」から対象の受講生を指定してください。受講生画面では「(氏名)さん専用のAI講座」として表示されます。
            </div>
          )}

          {/* 動画ファイル（クリック選択 ＋ ドラッグ＆ドロップ） */}
          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: space[1] }}>
              動画ファイル{isEdit ? '（差し替える場合のみ選択）' : ' (必須)'}
            </div>
            <div
              {...videoDrop}
              style={{
                background: videoOver ? alpha(color.navyLight, 0.08) : color.cream,
                border: `2px dashed ${videoOver ? color.navy : color.border}`,
                borderRadius: radius.md, padding: space[4],
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={e => handleFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                  ファイルを選択
                </Button>
                <div style={{ fontSize: font.size.sm, color: color.textDark, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file ? `${file.name} (${formatBytes(file.size)})` : (isEdit ? '差し替えなし' : 'ここに動画をドラッグ＆ドロップ')}
                </div>
              </div>
              <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
                上限 2GB / 推奨形式 MP4(H.264) / 大きい動画は分割アップロード(再開対応)で送信します
              </div>
              {duration != null && (
                <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
                  所要時間: {Math.floor(duration / 60)}分{duration % 60}秒
                </div>
              )}
            </div>
          </div>

          {/* サムネイル画像（クリック選択 ＋ ドラッグ＆ドロップ。未指定なら動画冒頭フレーム） */}
          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: space[1] }}>
              サムネイル画像（任意）
            </div>
            <div
              {...thumbDrop}
              style={{
                background: thumbOver ? alpha(color.navyLight, 0.08) : color.cream,
                border: `2px dashed ${thumbOver ? color.navy : color.border}`,
                borderRadius: radius.md, padding: space[4],
                display: 'flex', alignItems: 'center', gap: space[4],
              }}
            >
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                onChange={e => handleThumbFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="サムネイルプレビュー"
                  style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: radius.md, border: `1px solid ${color.border}`, flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 160, height: 90, flexShrink: 0,
                  background: color.gray100, borderRadius: radius.md,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: font.size.xs, color: color.textLight,
                }}>No image</div>
              )}
              <div style={{ minWidth: 0 }}>
                <Button variant="outline" onClick={() => thumbInputRef.current?.click()} disabled={saving}>
                  画像を選択
                </Button>
                <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
                  {manualThumbFile
                    ? `指定画像: ${manualThumbFile.name}`
                    : (thumbPreview ? '動画の冒頭フレームを自動使用中（画像を選ぶと差し替え）' : 'ここに画像をドラッグ＆ドロップ / 未指定なら動画の冒頭フレームを自動使用')}
                </div>
              </div>
            </div>
          </div>

          {progress && (
            <div style={{
              padding: space[3],
              background: alpha(color.info, 0.08),
              border: `1px solid ${alpha(color.info, 0.3)}`,
              borderRadius: radius.md,
              color: color.info,
              fontSize: font.size.sm,
            }}>{progress}</div>
          )}
        </div>

        <div style={{
          padding: `${space[3]}px ${space[5]}px`,
          borderTop: `1px solid ${color.borderLight}`,
          background: color.cream,
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
        }}>
          <Button variant="outline" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}>
            {isEdit ? '保存' : 'アップロード'}
          </Button>
        </div>
      </div>
    </div>
  );
}
