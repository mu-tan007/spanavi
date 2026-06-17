import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Card, Badge } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';

// 仕様書: tasks/spacareer-spec.md §6.4 AI講座
// 参考: イメージ画像①
//
// 仕様要点:
//  - 学習進捗パネル（視聴済み/視聴中/未視聴 + 円グラフ）
//  - フィルタタブ：すべて／未視聴／視聴中／視聴済み／お気に入り
//  - カテゴリ別グループ表示
//  - 動画カード：サムネ／タイトル／所要時間／カテゴリバッジ／視聴ステータス／お気に入り
//  - 80%以上再生で「視聴済み」判定
//  - お気に入り機能

const FILTERS = [
  { id: 'all', label: 'すべて' },
  { id: 'not_watched', label: '未視聴' },
  { id: 'watching', label: '視聴中' },
  { id: 'watched', label: '視聴済み' },
  { id: 'favorite', label: 'お気に入り' },
];

export default function ClientCoursesView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [views, setViews] = useState({});
  const [favorites, setFavorites] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: member } = await supabase
        .from('members').select('id').eq('user_id', profile.id).maybeSingle();
      if (!member) { setLoading(false); return; }
      const { data: cust } = await supabase
        .from('spacareer_customers').select('id').eq('member_id', member.id).maybeSingle();
      if (cancelled) return;
      setCustomer(cust);
      if (!cust) { setLoading(false); return; }

      const [{ data: cats }, { data: vids }, { data: viewRows }, { data: favRows }, { data: asgRows }] = await Promise.all([
        supabase.from('spacareer_course_categories').select('*').eq('is_active', true).order('position', { ascending: true }),
        supabase.from('spacareer_course_videos').select('*').eq('is_active', true).order('position', { ascending: true }),
        supabase.from('spacareer_video_views').select('*').eq('customer_id', cust.id),
        supabase.from('spacareer_video_favorites').select('video_id').eq('customer_id', cust.id),
        supabase.from('spacareer_video_assignments').select('video_id').eq('customer_id', cust.id),
      ]);
      if (cancelled) return;
      setCategories(cats || []);
      // 表示対象: 全員公開(audience='all' または未設定) ＋ 自分に個別配信された動画のみ
      const assignedSet = new Set((asgRows || []).map(r => r.video_id));
      const visibleVids = (vids || []).filter(
        v => (v.audience || 'all') === 'all' || assignedSet.has(v.id)
      );
      setVideos(visibleVids);
      const vMap = {};
      (viewRows || []).forEach(v => { vMap[v.video_id] = v; });
      setViews(vMap);
      setFavorites(new Set((favRows || []).map(r => r.video_id)));
      setLoading(false);
    })().catch(err => {
      console.error('[ClientCourses] load error:', err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const handleProgress = async (video, watchedSeconds, duration) => {
    if (!customer || !duration) return;
    const pct = Math.min(100, Math.round((watchedSeconds / duration) * 100));
    let status = 'not_watched';
    if (pct >= 80) status = 'watched';
    else if (pct >= 1) status = 'watching';

    const current = views[video.id];
    const lastPct = current ? Math.round(Number(current.progress_percent) || 0) : 0;
    if (current?.status === 'watched' && status === 'watched') return;
    if (Math.abs(pct - lastPct) < 10 && status === current?.status) return;

    const payload = {
      org_id: profile?.org_id,
      customer_id: customer.id,
      video_id: video.id,
      progress_percent: pct,
      watched_seconds: Math.floor(watchedSeconds),
      status,
      first_viewed_at: current?.first_viewed_at || new Date().toISOString(),
      last_viewed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('spacareer_video_views')
      .upsert(payload, { onConflict: 'customer_id,video_id' });
    if (error) { console.warn('[Courses] progress save error:', error); return; }
    setViews(prev => ({ ...prev, [video.id]: { ...prev[video.id], ...payload } }));
  };

  // 視聴後アウトプット（200文字程度）の保存。視聴記録(views)行に追記する。
  const saveReflection = async (video, text) => {
    if (!customer) return;
    const current = views[video.id];
    const nowIso = new Date().toISOString();
    const payload = {
      org_id: profile?.org_id,
      customer_id: customer.id,
      video_id: video.id,
      // 既存の視聴ステータスは保持（未視聴のまま感想だけ書くケースは status を維持）
      status: current?.status || 'watching',
      progress_percent: current?.progress_percent ?? 0,
      watched_seconds: current?.watched_seconds ?? 0,
      first_viewed_at: current?.first_viewed_at || nowIso,
      last_viewed_at: current?.last_viewed_at || nowIso,
      reflection_text: text || null,
      reflection_submitted_at: text ? nowIso : null,
    };
    const { error } = await supabase
      .from('spacareer_video_views')
      .upsert(payload, { onConflict: 'customer_id,video_id' });
    if (error) throw error;
    setViews(prev => ({ ...prev, [video.id]: { ...prev[video.id], ...payload } }));
  };

  const toggleFavorite = async (videoId) => {
    if (!customer) return;
    const isFav = favorites.has(videoId);
    if (isFav) {
      const { error } = await supabase
        .from('spacareer_video_favorites')
        .delete()
        .eq('customer_id', customer.id).eq('video_id', videoId);
      if (error) { console.warn(error); return; }
      setFavorites(prev => {
        const n = new Set(prev); n.delete(videoId); return n;
      });
    } else {
      const { error } = await supabase.from('spacareer_video_favorites').insert({
        org_id: profile?.org_id,
        customer_id: customer.id,
        video_id: videoId,
      });
      if (error) { console.warn(error); return; }
      setFavorites(prev => {
        const n = new Set(prev); n.add(videoId); return n;
      });
    }
  };

  const stats = useMemo(() => {
    let watched = 0, watching = 0, notWatched = 0;
    videos.forEach(v => {
      const st = views[v.id]?.status || 'not_watched';
      if (st === 'watched') watched += 1;
      else if (st === 'watching') watching += 1;
      else notWatched += 1;
    });
    return { watched, watching, notWatched, total: videos.length };
  }, [videos, views]);

  const filteredVideos = useMemo(() => {
    if (filter === 'all') return videos;
    if (filter === 'favorite') return videos.filter(v => favorites.has(v.id));
    return videos.filter(v => (views[v.id]?.status || 'not_watched') === filter);
  }, [videos, views, favorites, filter]);

  const videosByCategory = useMemo(() => {
    const map = new Map();
    categories.forEach(c => map.set(c.id, []));
    map.set('__uncategorized', []);
    filteredVideos.forEach(v => {
      const k = v.category_id || '__uncategorized';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(v);
    });
    return map;
  }, [filteredVideos, categories]);

  if (loading) return <Centered>読み込み中...</Centered>;
  if (!customer) return <Centered>受講情報が見つかりません。運営にお問い合わせください。</Centered>;

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <Heading />

      <Card padding="md">
        <div style={{ display: 'flex', alignItems: 'center', gap: space[6] }}>
          <Donut pct={stats.total ? Math.round((stats.watched / stats.total) * 100) : 0} />
          <StatBox label="視聴済み" value={stats.watched} variant="success" />
          <StatBox label="視聴中" value={stats.watching} variant="info" />
          <StatBox label="未視聴" value={stats.notWatched} variant="neutral" />
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>全動画</div>
            <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy }}>{stats.total}</div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: space[1], borderBottom: `1px solid ${color.border}` }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            style={{
              padding: `${space[2]}px ${space[4]}px`,
              fontSize: font.size.sm,
              fontWeight: font.weight.semibold,
              color: filter === f.id ? color.navy : color.textMid,
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${filter === f.id ? color.navy : 'transparent'}`,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {videos.length === 0 ? (
        <Card title="まだお客様にカスタマイズされた講座はありません" padding="lg">
          <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
            随時、研修内容に合わせた講座をお送りいたします。
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
          {[...categories, { id: '__uncategorized', name: 'その他' }].map(cat => {
            const list = videosByCategory.get(cat.id) || [];
            if (!list.length) return null;
            return (
              <div key={cat.id}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: space[2],
                  marginBottom: space[3],
                  paddingBottom: space[2],
                  borderBottom: `1px solid ${color.borderLight}`,
                }}>
                  <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
                    {cat.name}
                  </h2>
                  <span style={{ fontSize: font.size.xs, color: color.textLight }}>{list.length}本</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: space[4] }}>
                  {list.map(v => (
                    <VideoCard
                      key={v.id}
                      video={v}
                      category={categories.find(c => c.id === v.category_id)}
                      view={views[v.id]}
                      favorite={favorites.has(v.id)}
                      onToggleFavorite={() => toggleFavorite(v.id)}
                      onPlay={() => setPlayingVideo(v)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {playingVideo && (
        <VideoPlayerModal
          video={playingVideo}
          initialProgress={views[playingVideo.id]?.watched_seconds || 0}
          initialReflection={views[playingVideo.id]?.reflection_text || ''}
          reflectionSubmittedAt={views[playingVideo.id]?.reflection_submitted_at || null}
          onClose={() => setPlayingVideo(null)}
          onProgress={(s, d) => handleProgress(playingVideo, s, d)}
          onSaveReflection={(text) => saveReflection(playingVideo, text)}
        />
      )}
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>AI講座</h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
        あなた専用に用意された講座動画です。スキマ時間に学習を進めていきましょう。
      </p>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>
  );
}

function StatBox({ label, value, variant }) {
  return (
    <div>
      <Badge variant={variant} dot size="sm">{label}</Badge>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, marginTop: space[1] }}>
        {value}
      </div>
    </div>
  );
}

function Donut({ pct }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={96} height={96} viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke={color.gray200} strokeWidth="10" />
      <circle
        cx="48" cy="48" r={r} fill="none"
        stroke={color.navyLight} strokeWidth="10"
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={c / 4}
        transform="rotate(-90 48 48)"
        strokeLinecap="round"
      />
      <text x="48" y="54" textAnchor="middle" fontSize="20" fontWeight="700" fill={color.navy}>{pct}%</text>
    </svg>
  );
}

function VideoCard({ video, category, view, favorite, onToggleFavorite, onPlay }) {
  const status = view?.status || 'not_watched';
  const pct = Math.round(Number(view?.progress_percent) || 0);

  const statusBadge = status === 'watched'
    ? <Badge variant="success" dot>視聴済み</Badge>
    : status === 'watching'
      ? <Badge variant="info" dot>視聴中 {pct}%</Badge>
      : <Badge variant="neutral" dot>未視聴</Badge>;

  return (
    <Card padding="none" interactive style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={onPlay}
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: video.thumbnail_url ? `center / cover no-repeat url(${video.thumbnail_url})` : color.navyDark,
          cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: alpha(color.navyDeep, 0.25),
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: alpha(color.white, 0.95),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: shadow.md,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={color.navy}>
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        {video.duration_seconds && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            padding: '2px 6px',
            background: alpha(color.navyDeep, 0.78),
            color: color.white,
            borderRadius: radius.sm,
            fontSize: font.size.xs,
            fontFamily: font.family.mono,
          }}>
            {formatDuration(video.duration_seconds)}
          </div>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          aria-label="お気に入り"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 32, height: 32, borderRadius: '50%',
            background: alpha(color.white, 0.92),
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: shadow.sm,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={favorite ? color.gold : 'none'} stroke={favorite ? color.gold : color.textMid} strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
        {pct > 0 && pct < 100 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 3, background: alpha(color.white, 0.30),
          }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color.navyLight }}/>
          </div>
        )}
      </div>
      <div style={{ padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2], flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          {category && <Badge variant="primary" size="sm">{category.name}</Badge>}
          {statusBadge}
        </div>
        <div style={{
          fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark,
          lineHeight: font.lineHeight.tight,
        }}>
          {video.title}
        </div>
        {video.description && (
          <div style={{
            fontSize: font.size.xs, color: color.textMid,
            lineHeight: font.lineHeight.relaxed,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {video.description}
          </div>
        )}
      </div>
    </Card>
  );
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const REFLECTION_TARGET = 200; // アウトプットの目安文字数

function VideoPlayerModal({ video, initialProgress, initialReflection = '', reflectionSubmittedAt = null, onClose, onProgress, onSaveReflection }) {
  const videoRef = useRef(null);
  const [reflection, setReflection] = useState(initialReflection);
  const [savingReflection, setSavingReflection] = useState(false);
  const [savedAt, setSavedAt] = useState(reflectionSubmittedAt);
  useEffect(() => {
    if (videoRef.current && initialProgress) {
      try { videoRef.current.currentTime = initialProgress; } catch { /* noop */ }
    }
  }, [initialProgress]);

  const handleSaveReflection = async () => {
    setSavingReflection(true);
    try {
      await onSaveReflection?.(reflection.trim());
      setSavedAt(new Date().toISOString());
      alert('アウトプットを保存しました。学んだことを言葉にすると定着率が上がります。お疲れさまでした！');
    } catch (e) {
      alert('保存に失敗しました: ' + (e.message || e));
    } finally {
      setSavingReflection(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(color.navyDeep, 0.65),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: space[6],
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white,
          borderRadius: radius.lg,
          boxShadow: shadow.xl,
          maxWidth: 960, width: '100%',
          maxHeight: '90vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: `${space[3]}px ${space[4]}px`,
          background: color.navy, color: color.white,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontWeight: font.weight.semibold }}>{video.title}</div>
          <Button size="sm" variant="ghost" onClick={onClose} style={{ color: color.white }}>閉じる</Button>
        </div>
        {/* 営業代行ページ(ライブラリ)と同じ 16:9 レスポンシブ枠のプレーヤー */}
        <div style={{ padding: space[4], paddingBottom: 0 }}>
          <div style={{
            position: 'relative', width: '100%', paddingTop: '56.25%',
            borderRadius: radius.md, overflow: 'hidden', background: '#000',
          }}>
            <video
              ref={videoRef}
              src={video.video_url}
              controls
              autoPlay
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              onTimeUpdate={e => {
                const t = e.currentTarget.currentTime;
                const d = e.currentTarget.duration;
                if (d) onProgress(t, d);
              }}
              onEnded={e => {
                const d = e.currentTarget.duration;
                if (d) onProgress(d, d);
              }}
            />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {video.description && (
            <div style={{ padding: `${space[4]}px ${space[4]}px 0`, fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed }}>
              {video.description}
            </div>
          )}

          {/* 視聴後アウトプット欄 */}
          <div style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
                視聴後のアウトプット
              </span>
              {savedAt && <Badge variant="success" dot>保存済み</Badge>}
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textMid, lineHeight: font.lineHeight.relaxed }}>
              この動画を通じて<strong>理解したこと</strong>、そして<strong>今後ご自身で活かしてみたいこと</strong>を、200文字程度でご記入ください。学んだことを言葉にすると定着率が上がります。
            </div>
            <textarea
              value={reflection}
              onChange={e => setReflection(e.target.value)}
              placeholder="例）この動画で〇〇の使い方が理解できた。今後は△△の業務で実際に試してみたい。"
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: `${space[2]}px ${space[3]}px`,
                fontSize: font.size.sm, fontFamily: font.family.sans,
                color: color.textDark, border: `1px solid ${color.border}`,
                borderRadius: radius.md, outline: 'none', resize: 'vertical',
                lineHeight: font.lineHeight.relaxed,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
              <span style={{
                fontSize: font.size.xs,
                color: reflection.length >= REFLECTION_TARGET ? color.success : color.textLight,
              }}>
                {reflection.length} 文字（目安 {REFLECTION_TARGET} 文字）
              </span>
              <Button
                size="sm" variant="primary"
                loading={savingReflection}
                disabled={!reflection.trim()}
                onClick={handleSaveReflection}
              >アウトプットを保存</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
