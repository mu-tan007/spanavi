import React, { useState, useRef } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Input, Select, Card } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';

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

const MAX_BYTES = 24 * 1024 * 1024; // 24MB（既存ロープレ動画上限と同一）
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

export default function VideoUploadModal({ open, onClose, categories, onUploaded, editTarget = null }) {
  const isEdit = !!editTarget;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  React.useEffect(() => {
    if (open) {
      if (isEdit && editTarget) {
        setTitle(editTarget.title || '');
        setDescription(editTarget.description || '');
        setCategoryId(editTarget.category_id || '');
        setThumbnailUrl(editTarget.thumbnail_url || '');
        setDuration(editTarget.duration_seconds || null);
        setFile(null);
      } else {
        setTitle('');
        setDescription('');
        setCategoryId(categories?.[0]?.id || '');
        setThumbnailUrl('');
        setDuration(null);
        setFile(null);
      }
      setProgress(null);
      setError(null);
    }
  }, [open, editTarget, isEdit, categories]);

  if (!open) return null;

  const handleFile = async (f) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) {
      setError(`動画サイズが上限24MBを超えています（${formatBytes(f.size)}）`);
      setFile(null);
      return;
    }
    setFile(f);
    const dur = await readVideoDuration(f);
    if (dur) setDuration(dur);
  };

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
      let durationSeconds = duration ?? editTarget?.duration_seconds ?? null;

      if (file) {
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        const newId = editTarget?.id || (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const path = `${orgId}/${newId}.${ext}`;

        setProgress('アップロード中...');
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { contentType: file.type || 'video/mp4', upsert: true });
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        storagePath = path;
        videoUrl = urlData?.publicUrl || null;
      }

      setProgress('メタデータを保存中...');
      if (isEdit) {
        const { error: updErr } = await supabase
          .from('spacareer_course_videos')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            category_id: categoryId,
            thumbnail_url: thumbnailUrl.trim() || null,
            duration_seconds: durationSeconds,
            storage_path: storagePath,
            video_url: videoUrl,
          })
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
            org_id: orgId,
            category_id: categoryId,
            title: title.trim(),
            description: description.trim() || null,
            thumbnail_url: thumbnailUrl.trim() || null,
            duration_seconds: durationSeconds,
            storage_path: storagePath,
            video_url: videoUrl,
            position: nextPos,
            is_active: true,
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
            options={(categories || []).map(c => ({ value: c.id, label: c.name }))}
          />

          <Input
            label="サムネイル URL（任意）"
            placeholder="https://..."
            value={thumbnailUrl}
            onChange={e => setThumbnailUrl(e.target.value)}
          />

          {/* File picker */}
          <div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: space[1] }}>
              動画ファイル{isEdit ? '（差し替える場合のみ選択）' : ' (必須)'}
            </div>
            <Card variant="subtle" padding="md">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={e => handleFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  ファイルを選択
                </Button>
                <div style={{ fontSize: font.size.sm, color: color.textDark, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file ? `${file.name} (${formatBytes(file.size)})` : (isEdit ? '差し替えなし' : '未選択')}
                </div>
              </div>
              <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
                上限 24MB / 推奨形式 MP4(H.264) / 既存ロープレ動画基盤と同一ロジック
              </div>
              {duration != null && (
                <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
                  所要時間: {Math.floor(duration / 60)}分{duration % 60}秒
                </div>
              )}
            </Card>
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
