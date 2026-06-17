import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge, DataTable } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import KpiCard from '../_shared/KpiCard';
import SubTabs from '../_shared/SubTabs';
import { supabase } from '../../../../lib/supabase';
import { getOrgId } from '../../../../lib/orgContext';
import VideoUploadModal from './VideoUploadModal';
import VideoAssignModal from './VideoAssignModal';
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
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignCounts, setAssignCounts] = useState({}); // video_id -> 配信人数
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgId = getOrgId();
      const [catRes, vidRes, viewRes, favRes, asgRes] = await Promise.all([
        supabase.from('spacareer_course_categories')
          .select('id, name, position, is_active')
          .eq('org_id', orgId)
          .order('position', { ascending: true }),
        supabase.from('spacareer_course_videos')
          .select('id, title, description, duration_seconds, thumbnail_url, storage_path, video_url, category_id, position, is_active, audience, created_at')
          .eq('org_id', orgId)
          .order('position', { ascending: true }),
        supabase.from('spacareer_video_views')
          .select('id, customer_id, video_id, progress_percent, watched_seconds, status, last_viewed_at')
          .eq('org_id', orgId),
        supabase.from('spacareer_video_favorites')
          .select('id, customer_id, video_id, created_at')
          .eq('org_id', orgId),
        supabase.from('spacareer_video_assignments')
          .select('video_id')
          .eq('org_id', orgId),
      ]);
      if (catRes.error) throw catRes.error;
      if (vidRes.error) throw vidRes.error;
      if (viewRes.error) throw viewRes.error;
      if (favRes.error) throw favRes.error;
      if (asgRes.error) throw asgRes.error;
      setCategories(catRes.data || []);
      setVideos(vidRes.data || []);
      setViews(viewRes.data || []);
      setFavorites(favRes.data || []);
      const counts = {};
      (asgRes.data || []).forEach(r => { counts[r.video_id] = (counts[r.video_id] || 0) + 1; });
      setAssignCounts(counts);
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
    <div style={{ paddingBottom: space[6], animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="AI講座管理"
        description="動画アップロード・カテゴリ管理・視聴ログ・お気に入り分析"
        right={(
          <>
            <Button variant="outline" onClick={() => setCategoryEditorOpen(true)}>カテゴリ管理</Button>
            <Button variant="primary" onClick={() => { setEditTarget(null); setUploadOpen(true); }}>
              動画をアップロード
            </Button>
          </>
        )}
        style={{ marginBottom: space[4] }}
      />

      {/* ===== KPI ===== */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: space[3], marginBottom: space[4],
      }}>
        <KpiCard label="動画本数"   value={kpis.totalVideos}    unit="本" tone="navy" />
        <KpiCard label="視聴記録"   value={kpis.totalViews}     unit="件" tone="info" />
        <KpiCard label="視聴完了"   value={kpis.watched}        unit="件" tone="success" />
        <KpiCard label="お気に入り" value={kpis.totalFavorites} unit="件" tone="warn" />
      </div>

      <SubTabs
        tabs={[
          { key: 'videos',    label: '動画一覧' },
          { key: 'views',     label: '視聴ログ' },
          { key: 'favorites', label: 'お気に入り分析' },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

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
          assignCounts={assignCounts}
          onMove={handleMoveVideo}
          onEdit={handleEdit}
          onDisable={handleDisableVideo}
          onAssign={(v) => setAssignTarget(v)}
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
      <VideoAssignModal
        open={!!assignTarget}
        video={assignTarget}
        onClose={() => setAssignTarget(null)}
        onSaved={loadAll}
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
function VideosTab({ loading, activeCategories, videosByCategory, assignCounts = {}, onMove, onEdit, onDisable, onAssign }) {
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
        const columns = [
          { key: '_order', label: '並び', width: 56, align: 'center',
            render: (v) => {
              const idx = list.findIndex(x => x.id === v.id);
              const isFirst = idx === 0;
              const isLast = idx === list.length - 1;
              return (
                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(v, -1); }}
                    disabled={isFirst}
                    style={reorderBtn(isFirst)}
                    aria-label="上へ"
                  >▲</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(v, 1); }}
                    disabled={isLast}
                    style={reorderBtn(isLast)}
                    aria-label="下へ"
                  >▼</button>
                </div>
              );
            }},
          { key: '_thumb', label: 'サムネ', width: 110, align: 'center',
            render: (v) => (
              <div style={{
                width: 96, height: 54,
                background: color.gray100,
                borderRadius: radius.md,
                overflow: 'hidden',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: font.size.xs, color: color.textLight,
              }}>
                {v.thumbnail_url
                  ? <img src={v.thumbnail_url} alt={v.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : 'No image'}
              </div>
            )},
          { key: 'title', label: 'タイトル', width: 360, align: 'left',
            render: (v) => (
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
            )},
          { key: 'duration', label: '所要時間', width: 110, align: 'right',
            cellStyle: { fontFamily: font.family.mono },
            render: (v) => formatDuration(v.duration_seconds) },
          { key: 'status', label: 'ステータス', width: 100, align: 'center',
            render: (v) => v.video_url
              ? <Badge variant="success" dot>公開中</Badge>
              : <Badge variant="warn">未アップ</Badge> },
          { key: '_audience', label: '配信先', width: 110, align: 'center',
            render: (v) => v.audience === 'assigned'
              ? <Badge variant="info" dot>指定 {assignCounts[v.id] || 0}名</Badge>
              : <Badge variant="neutral">全員</Badge> },
          { key: '_actions', label: '操作', width: 280, align: 'center',
            render: (v) => (
              <div style={{ display: 'inline-flex', gap: space[1], justifyContent: 'center' }}>
                {v.video_url && (
                  <Button size="sm" variant="outline"
                    onClick={(e) => { e.stopPropagation(); window.open(v.video_url, '_blank'); }}>再生</Button>
                )}
                <Button size="sm" variant="primary"
                  onClick={(e) => { e.stopPropagation(); onAssign(v); }}>配信</Button>
                <Button size="sm" variant="outline"
                  onClick={(e) => { e.stopPropagation(); onEdit(v); }}>編集</Button>
                <Button size="sm" variant="danger"
                  onClick={(e) => { e.stopPropagation(); onDisable(v); }}>非表示</Button>
              </div>
            )},
        ];
        return (
          <Card
            key={cat.id}
            padding="none"
            title={cat.name}
            action={<Badge variant="neutral">{list.length} 本</Badge>}
          >
            <DataTable
              columns={columns}
              rows={list}
              rowKey="id"
              emptyMessage="このカテゴリに動画はまだありません"
              height="auto"
              showCount={false}
              fillWidth
              style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
            />
          </Card>
        );
      })}
    </div>
  );
}

const reorderBtn = (disabled) => ({
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
