import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge, DataTable } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';
import VideoUploadModal from './VideoUploadModal';
import CourseCategoryEditor from './CourseCategoryEditor';

// ============================================================
// AI講座管理 メインビュー
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-spec.md §7.5
// 3タブ構成:
//   1. 動画一覧（カテゴリ別グループ、↑↓並び替え、編集、無効化）
//   2. 視聴ログ（横断ビュー: 全顧客×全動画の視聴状況サマリ）
//   3. お気に入り分析（ランキング、需要分析）
// ============================================================

function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
}

function formatDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

export default function SpacareerCoursesView() {
  const [tab, setTab] = useState('videos'); // videos | views | favorites
  const [categories, setCategories] = useState([]);
  const [videos, setVideos] = useState([]);
  const [views, setViews] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgId = getOrgId();
      const [catRes, vidRes, viewRes, favRes] = await Promise.all([
        supabase.from('spacareer_course_categories')
          .select('id, name, position, is_active')
          .eq('org_id', orgId)
          .order('position', { ascending: true }),
        supabase.from('spacareer_course_videos')
          .select('id, title, description, duration_seconds, thumbnail_url, storage_path, video_url, category_id, position, is_active, created_at')
          .eq('org_id', orgId)
          .order('position', { ascending: true }),
        supabase.from('spacareer_video_views')
          .select('id, customer_id, video_id, progress_percent, watched_seconds, status, last_viewed_at')
          .eq('org_id', orgId),
        supabase.from('spacareer_video_favorites')
          .select('id, customer_id, video_id, created_at')
          .eq('org_id', orgId),
      ]);
      if (catRes.error) throw catRes.error;
      if (vidRes.error) throw vidRes.error;
      if (viewRes.error) throw viewRes.error;
      if (favRes.error) throw favRes.error;
      setCategories(catRes.data || []);
      setVideos(vidRes.data || []);
      setViews(viewRes.data || []);
      setFavorites(favRes.data || []);
    } catch (e) {
      console.error('[CoursesView] load error:', e);
      setError(e?.message || 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const activeCategories = useMemo(
    () => categories.filter(c => c.is_active),
    [categories]
  );

  const videosByCategory = useMemo(() => {
    const map = new Map();
    for (const c of activeCategories) map.set(c.id, []);
    for (const v of videos) {
      if (!v.is_active) continue;
      if (!map.has(v.category_id)) map.set(v.category_id, []);
      map.get(v.category_id).push(v);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.position || 0) - (b.position || 0));
    }
    return map;
  }, [activeCategories, videos]);

  const kpis = useMemo(() => {
    const totalVideos = videos.filter(v => v.is_active).length;
    const totalViews = views.length;
    const watched = views.filter(v => v.status === 'watched').length;
    const totalFavorites = favorites.length;
    return { totalVideos, totalViews, watched, totalFavorites };
  }, [videos, views, favorites]);

  const handleMoveVideo = async (video, dir) => {
    const list = videosByCategory.get(video.category_id) || [];
    const idx = list.findIndex(v => v.id === video.id);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= list.length) return;
    const a = list[idx];
    const b = list[target];
    try {
      // swap position
      await Promise.all([
        supabase.from('spacareer_course_videos').update({ position: b.position }).eq('id', a.id),
        supabase.from('spacareer_course_videos').update({ position: a.position }).eq('id', b.id),
      ]);
      await loadAll();
    } catch (e) {
      console.error('[CoursesView] reorder error:', e);
      setError(e?.message || '並び替えに失敗しました');
    }
  };

  const handleDisableVideo = async (video) => {
    if (!confirm(`「${video.title}」を非表示にしますか？\n（削除ではなく無効化されます。元に戻すには DB 直編集が必要です）`)) return;
    try {
      const { error: updErr } = await supabase
        .from('spacareer_course_videos')
        .update({ is_active: false })
        .eq('id', video.id);
      if (updErr) throw updErr;
      await loadAll();
    } catch (e) {
      console.error('[CoursesView] disable error:', e);
      setError(e?.message || '無効化に失敗しました');
    }
  };

  const handleEdit = (video) => {
    setEditTarget(video);
    setUploadOpen(true);
  };

  return (
    <div style={{ paddingBottom: space[6] }}>
      {/* ===== Header ===== */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: space[4], flexWrap: 'wrap', gap: space[3],
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: font.size['2xl'], fontWeight: font.weight.bold,
            color: color.navy, letterSpacing: font.letterSpacing.tight,
          }}>
            AI講座管理
          </h1>
          <div style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
            動画アップロード・カテゴリ管理・視聴ログ・お気に入り分析
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button variant="outline" onClick={() => setCategoryEditorOpen(true)}>カテゴリ管理</Button>
          <Button variant="primary" onClick={() => { setEditTarget(null); setUploadOpen(true); }}>
            + 動画をアップロード
          </Button>
        </div>
      </div>

      {/* ===== KPI ===== */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: space[3], marginBottom: space[4],
      }}>
        <KpiCard label="動画本数" value={kpis.totalVideos} accent={color.navy} />
        <KpiCard label="視聴記録" value={kpis.totalViews} accent={color.info} />
        <KpiCard label="視聴完了" value={kpis.watched} accent={color.success} />
        <KpiCard label="お気に入り" value={kpis.totalFavorites} accent={color.warn} />
      </div>

      {/* ===== Tabs ===== */}
      <div style={{ display: 'flex', gap: space[2], marginBottom: space[3], borderBottom: `1px solid ${color.border}` }}>
        {[
          { key: 'videos',    label: '動画一覧' },
          { key: 'views',     label: '視聴ログ' },
          { key: 'favorites', label: 'お気に入り分析' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: `${space[2]}px ${space[3]}px`,
              fontSize: font.size.sm,
              fontWeight: tab === t.key ? font.weight.semibold : font.weight.normal,
              color: tab === t.key ? color.navy : color.textMid,
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t.key ? color.navy : 'transparent'}`,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: space[3], marginBottom: space[3],
          background: alpha(color.danger, 0.08),
          border: `1px solid ${alpha(color.danger, 0.3)}`,
          borderRadius: radius.md, color: color.danger, fontSize: font.size.sm,
        }}>{error}</div>
      )}

      {tab === 'videos' && (
        <VideosTab
          loading={loading}
          activeCategories={activeCategories}
          videosByCategory={videosByCategory}
          onMove={handleMoveVideo}
          onEdit={handleEdit}
          onDisable={handleDisableVideo}
        />
      )}

      {tab === 'views' && (
        <ViewsTab loading={loading} videos={videos} views={views} />
      )}

      {tab === 'favorites' && (
        <FavoritesTab loading={loading} videos={videos} favorites={favorites} />
      )}

      {/* Modals */}
      <VideoUploadModal
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); setEditTarget(null); }}
        categories={activeCategories}
        editTarget={editTarget}
        onUploaded={loadAll}
      />
      <CourseCategoryEditor
        open={categoryEditorOpen}
        onClose={() => setCategoryEditorOpen(false)}
        categories={categories}
        onChange={loadAll}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <Card padding="md">
      <div style={{ fontSize: font.size.xs, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: space[1] }}>
        {label}
      </div>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: accent || color.navy, lineHeight: 1 }}>
        {value}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
function VideosTab({ loading, activeCategories, videosByCategory, onMove, onEdit, onDisable }) {
  if (loading) {
    return (
      <Card padding="lg">
        <div style={{ color: color.textMid, fontSize: font.size.sm, textAlign: 'center' }}>読み込み中...</div>
      </Card>
    );
  }
  if (!activeCategories.length) {
    return (
      <Card padding="lg">
        <div style={{ color: color.textMid, fontSize: font.size.sm, textAlign: 'center' }}>
          カテゴリが未登録です。右上の「カテゴリ管理」から追加してください。
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {activeCategories.map(cat => {
        const list = videosByCategory.get(cat.id) || [];
        return (
          <Card key={cat.id} padding="none">
            <div style={{
              padding: `${space[3]}px ${space[4]}px`,
              borderBottom: `1px solid ${color.borderLight}`,
              background: color.cream,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>
                {cat.name}
              </div>
              <Badge variant="neutral">{list.length} 本</Badge>
            </div>
            {list.length === 0 ? (
              <div style={{ padding: space[4], color: color.textLight, fontSize: font.size.sm, textAlign: 'center' }}>
                このカテゴリに動画はまだありません
              </div>
            ) : (
              <div>
                {list.map((v, idx) => (
                  <div
                    key={v.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 96px 1fr 110px 100px 220px',
                      gap: space[3],
                      alignItems: 'center',
                      padding: `${space[2]}px ${space[4]}px`,
                      borderBottom: idx === list.length - 1 ? 'none' : `1px solid ${color.borderLight}`,
                      background: idx % 2 === 1 ? color.cream : color.white,
                    }}
                  >
                    {/* reorder buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => onMove(v, -1)} disabled={idx === 0} style={iconBtn(idx === 0)}>▲</button>
                      <button onClick={() => onMove(v, 1)} disabled={idx === list.length - 1} style={iconBtn(idx === list.length - 1)}>▼</button>
                    </div>

                    {/* thumbnail */}
                    <div style={{
                      width: 96, height: 54,
                      background: color.gray100,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: font.size.xs, color: color.textLight,
                    }}>
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} alt={v.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : 'No image'}
                    </div>

                    {/* title + description */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{v.title}</div>
                      {v.description && (
                        <div style={{
                          fontSize: font.size.xs, color: color.textMid, marginTop: 2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{v.description}</div>
                      )}
                    </div>

                    {/* duration */}
                    <div style={{ fontSize: font.size.sm, color: color.textMid, fontFamily: font.family.mono, textAlign: 'right' }}>
                      {formatDuration(v.duration_seconds)}
                    </div>

                    {/* status */}
                    <div style={{ textAlign: 'center' }}>
                      {v.video_url
                        ? <Badge variant="success" dot>公開中</Badge>
                        : <Badge variant="warn">未アップ</Badge>}
                    </div>

                    {/* actions */}
                    <div style={{ display: 'flex', gap: space[1], justifyContent: 'flex-end' }}>
                      {v.video_url && (
                        <Button size="sm" variant="outline" onClick={() => window.open(v.video_url, '_blank')}>再生</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => onEdit(v)}>編集</Button>
                      <Button size="sm" variant="danger" onClick={() => onDisable(v)}>非表示</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const iconBtn = (disabled) => ({
  width: 22, height: 18, padding: 0,
  fontSize: 10, lineHeight: 1,
  background: color.white, color: disabled ? color.textLight : color.navy,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

// ────────────────────────────────────────────────────────────
function ViewsTab({ loading, videos, views }) {
  // 動画ごとに視聴サマリを集計
  const summary = useMemo(() => {
    const byVideo = new Map();
    for (const v of videos) byVideo.set(v.id, { video: v, total: 0, watched: 0, watching: 0, lastViewedAt: null });
    for (const r of views) {
      const s = byVideo.get(r.video_id);
      if (!s) continue;
      s.total++;
      if (r.status === 'watched') s.watched++;
      else if (r.status === 'watching') s.watching++;
      if (r.last_viewed_at && (!s.lastViewedAt || new Date(r.last_viewed_at) > new Date(s.lastViewedAt))) {
        s.lastViewedAt = r.last_viewed_at;
      }
    }
    return Array.from(byVideo.values())
      .filter(s => s.video.is_active)
      .sort((a, b) => (b.total) - (a.total));
  }, [videos, views]);

  const columns = [
    { key: 'title', label: '動画タイトル', width: 320, align: 'left',
      render: (r) => (
        <span style={{ color: color.textDark, fontSize: font.size.sm }}>{r.video.title}</span>
      ) },
    { key: 'duration', label: '所要時間', width: 100, align: 'right',
      cellStyle: { fontFamily: font.family.mono },
      render: (r) => formatDuration(r.video.duration_seconds) },
    { key: 'total', label: '視聴開始', width: 90, align: 'right',
      render: (r) => r.total },
    { key: 'watching', label: '視聴中', width: 90, align: 'right',
      render: (r) => r.watching },
    { key: 'watched', label: '視聴完了', width: 100, align: 'right',
      render: (r) => r.watched },
    { key: 'rate', label: '完了率', width: 100, align: 'right',
      render: (r) => r.total ? `${Math.round((r.watched / r.total) * 100)}%` : '—' },
    { key: 'lastViewedAt', label: '最終視聴', width: 130, align: 'right',
      render: (r) => formatDateTime(r.lastViewedAt) || '—' },
  ];

  return (
    <DataTable
      columns={columns}
      rows={summary}
      rowKey={(r) => r.video.id}
      loading={loading}
      emptyMessage="視聴ログはまだありません"
      height="auto"
    />
  );
}

// ────────────────────────────────────────────────────────────
function FavoritesTab({ loading, videos, favorites }) {
  const ranking = useMemo(() => {
    const counts = new Map();
    for (const f of favorites) {
      counts.set(f.video_id, (counts.get(f.video_id) || 0) + 1);
    }
    return videos
      .filter(v => v.is_active)
      .map(v => ({ video: v, count: counts.get(v.id) || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [videos, favorites]);

  const maxCount = ranking[0]?.count || 1;

  if (loading) {
    return (
      <Card padding="lg">
        <div style={{ color: color.textMid, fontSize: font.size.sm, textAlign: 'center' }}>読み込み中...</div>
      </Card>
    );
  }
  if (!ranking.length) {
    return (
      <Card padding="lg">
        <div style={{ color: color.textMid, fontSize: font.size.sm, textAlign: 'center' }}>動画が登録されていません</div>
      </Card>
    );
  }

  return (
    <Card padding="md" title="お気に入り数ランキング" description="お気に入り上位の動画＝受講生の需要が高い領域。次回アップロード選定の参考に。">
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {ranking.map((r, idx) => {
          const pct = maxCount > 0 ? (r.count / maxCount) * 100 : 0;
          return (
            <div key={r.video.id} style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 80px',
              alignItems: 'center',
              gap: space[3],
              padding: `${space[2]}px ${space[3]}px`,
              background: idx === 0 ? alpha(color.gold, 0.06) : color.white,
              border: `1px solid ${color.borderLight}`,
              borderRadius: radius.md,
            }}>
              <div style={{
                fontSize: font.size.lg, fontWeight: font.weight.bold,
                color: idx < 3 ? color.gold : color.textMid,
                textAlign: 'center',
              }}>
                {idx + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.video.title}
                </div>
                <div style={{ height: 4, background: color.gray100, borderRadius: radius.pill, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color.gold, transition: 'width 0.3s ease' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: font.family.mono, color: color.textDark, fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
                {r.count}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
