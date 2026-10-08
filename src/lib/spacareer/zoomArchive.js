import { supabase } from '../supabase';

// ============================================================
// Zoomのクラウド録画を R2 へ移したもの（2026-10-08〜）
//
//   zoom_cloud_recordings   ファイル1本＝1行（会議1回に動画・音声・文字起こし等が数本）
//   zoom_cloud_share_links  Slackの面談報告に貼られる /media/share/<ID> と会議の対応
//
//   どちらも管理者だけが読める。再生は r2 の sign-get（kind: zoomcloud）で
//   その場限りのURLをもらう。Zoomから外したあとも見られる。
// ============================================================

// 見るファイルの優先順。画面共有＋全員の映る動画 → 話者の動画 → 音声だけ。
const PLAY_ORDER = [
  (f) => f.file_type === 'MP4' && f.recording_type === 'shared_screen_with_gallery_view',
  (f) => f.file_type === 'MP4',
  (f) => f.file_type === 'M4A',
];

function pickPlayable(files) {
  for (const match of PLAY_ORDER) {
    const hit = files.filter(match).sort((a, b) => b.file_size - a.file_size)[0];
    if (hit) return hit;
  }
  return null;
}

// 会議ごとにまとめて返す。R2に入っていない会議は play が null。
export async function loadZoomArchive() {
  const all = [];
  // ⚠️ PostgREST は1回1000行まで。ファイルは1,400本を超えるので区切って読む。
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('zoom_cloud_recordings')
      .select('zoom_meeting_uuid, host_email, topic, start_time, duration_min, file_type, recording_type, file_size, r2_key, copied_at, zoom_trashed_at')
      .order('start_time', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { data: links, error: linkErr } = await supabase
    .from('zoom_cloud_share_links')
    .select('share_id, zoom_meeting_uuid');
  if (linkErr) throw linkErr;

  const byMeeting = new Map();
  for (const f of all) {
    const m = byMeeting.get(f.zoom_meeting_uuid) || {
      uuid: f.zoom_meeting_uuid, host_email: f.host_email, topic: f.topic,
      start_time: f.start_time, duration_min: f.duration_min, files: [],
    };
    m.files.push(f);
    byMeeting.set(f.zoom_meeting_uuid, m);
  }
  const meetings = [...byMeeting.values()].map((m) => {
    const copied = m.files.filter((f) => f.copied_at);
    return {
      ...m,
      size: m.files.reduce((a, f) => a + Number(f.file_size || 0), 0),
      archived: copied.length === m.files.length,
      trashed: m.files.every((f) => f.zoom_trashed_at),
      play: pickPlayable(copied),
    };
  });
  const meetingByShare = new Map(
    (links || []).filter((l) => l.zoom_meeting_uuid).map((l) => [l.share_id, byMeeting.has(l.zoom_meeting_uuid) ? l.zoom_meeting_uuid : null]),
  );
  return { meetings, meetingByShare };
}

// Slackに貼られたZoomの共有URLから共有IDを取り出す。それ以外のURLは null。
export function zoomShareIdOf(url) {
  const m = /zoom\.us\/media\/share\/([0-9A-Fa-f-]{36})/.exec(url || '');
  return m ? m[1].toUpperCase() : null;
}

// 再生する。⚠️ 署名をもらう往復のあいだにポップアップを止められないよう、
//    クリックした瞬間に空のタブを開いておき、URLが届いたらそこへ送る。
export async function openZoomArchive(r2Key) {
  const win = window.open('', '_blank');
  const { data, error } = await supabase.functions.invoke('r2', {
    body: { action: 'sign-get', kind: 'zoomcloud', key: r2Key, expires: 3600 },
  });
  if (error || !data?.ok || !data.url) {
    if (win) win.close();
    throw new Error(data?.error || error?.message || '録画を開けませんでした');
  }
  if (win) win.location.href = data.url; else window.location.href = data.url;
}
