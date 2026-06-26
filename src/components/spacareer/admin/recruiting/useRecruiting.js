// ============================================================
// スパキャリ 採用管理（複業クラウド）データ取得・更新 hook
//   recruit_applicants（候補者） / recruit_interviews（面接枠）
//   org_id は RLS でスコープされるが、明示フィルタも付ける。
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';

const PHOTO_BUCKET = 'recruit-applicant-photos';

/** 候補者一覧 */
export function useRecruitApplicants() {
  const { orgId } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('recruit_applicants')
        .select('id, full_name, furigana, job_type, job_title, profile_text, photo_path, status, staff_memo, applied_at, source, created_at')
        .eq('org_id', orgId)
        .order('applied_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (e) throw e;
      setRows(data || []);
    } catch (err) {
      console.error('[recruiting] 候補者取得エラー:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { rows, loading, error, refresh };
}

/** 候補者のステータス／メモ更新 */
export async function updateApplicant(id, patch) {
  const { error } = await supabase
    .from('recruit_applicants')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

/** 顔写真の署名付きURL（非公開バケットのため必須） */
export async function getPhotoSignedUrl(photoPath, expiresSec = 3600) {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photoPath, expiresSec);
  if (error) {
    console.error('[recruiting] 署名付きURL生成エラー:', error);
    return null;
  }
  return data?.signedUrl || null;
}

/** 指定候補者の面接枠一覧 */
export function useInterviews(applicantId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!applicantId) { setRows([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recruit_interviews')
        .select('id, applicant_id, scheduled_at, method, location, note, result, created_at')
        .eq('applicant_id', applicantId)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error('[recruiting] 面接取得エラー:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { rows, loading, refresh };
}

/** 面接枠を追加 */
export async function addInterview(orgId, applicantId, payload) {
  const { error } = await supabase
    .from('recruit_interviews')
    .insert({ org_id: orgId, applicant_id: applicantId, ...payload });
  if (error) throw error;
}

/** 面接枠を更新 */
export async function updateInterview(id, patch) {
  const { error } = await supabase
    .from('recruit_interviews')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

/** 面接枠を削除 */
export async function deleteInterview(id) {
  const { error } = await supabase
    .from('recruit_interviews')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ---- 表示用ラベル定義 ----
export const JOB_TYPE_LABELS = { sales: '営業', trainer: 'トレーナー' };
export const JOB_TYPE_BADGE = { sales: 'primary', trainer: 'info' };

export const STATUS_OPTIONS = [
  { value: 'new', label: '新規' },
  { value: 'screening', label: '書類選考' },
  { value: 'interview', label: '面接' },
  { value: 'passed', label: '合格' },
  { value: 'rejected', label: '見送り' },
];
export const STATUS_LABELS = STATUS_OPTIONS.reduce((a, o) => (a[o.value] = o.label, a), {});
export const STATUS_BADGE = {
  new: 'info', screening: 'warn', interview: 'primary', passed: 'success', rejected: 'neutral',
};

export const INTERVIEW_RESULT_OPTIONS = [
  { value: 'scheduled', label: '予定' },
  { value: 'done', label: '実施済' },
  { value: 'passed', label: '合格' },
  { value: 'rejected', label: '見送り' },
  { value: 'noshow', label: '不参加' },
  { value: 'canceled', label: 'キャンセル' },
];
export const INTERVIEW_RESULT_LABELS = INTERVIEW_RESULT_OPTIONS.reduce((a, o) => (a[o.value] = o.label, a), {});
export const INTERVIEW_RESULT_BADGE = {
  scheduled: 'primary', done: 'info', passed: 'success', rejected: 'neutral', noshow: 'warn', canceled: 'neutral',
};
