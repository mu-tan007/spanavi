import React, { useState, useEffect, useCallback } from 'react';
import { color, space, radius, font, alpha } from '../../../../constants/design';
import { Button, Select, Badge } from '../../../ui';
import {
  updateApplicant, getPhotoSignedUrl,
  useInterviews, addInterview, updateInterview, deleteInterview,
  JOB_TYPE_LABELS, JOB_TYPE_BADGE, STATUS_OPTIONS, STATUS_BADGE,
  INTERVIEW_RESULT_OPTIONS, INTERVIEW_RESULT_LABELS, INTERVIEW_RESULT_BADGE,
} from './useRecruiting';

const FUKUGYO_URL = 'https://cl.aw-anotherworks.com/';

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// 共通: token 化したネイティブ入力スタイル
const fieldStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: `${space[2]}px ${space[2]}px`,
  border: `1px solid ${color.border}`, borderRadius: radius.md,
  fontSize: font.size.sm, color: color.textDark, background: color.white,
  fontFamily: font.family.base,
};
const labelStyle = {
  display: 'block', fontSize: font.size.xs, fontWeight: font.weight.semibold,
  color: color.textMid, marginBottom: space[1],
};

export default function RecruitDetail({ applicant, orgId, onChanged, onClose }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [status, setStatus] = useState(applicant?.status || 'new');
  const [memo, setMemo] = useState(applicant?.staff_memo || '');
  const [savingMemo, setSavingMemo] = useState(false);

  const { rows: interviews, refresh: refreshInterviews } = useInterviews(applicant?.id);

  useEffect(() => {
    setStatus(applicant?.status || 'new');
    setMemo(applicant?.staff_memo || '');
    setPhotoUrl(null);
    let alive = true;
    if (applicant?.photo_path) {
      getPhotoSignedUrl(applicant.photo_path).then(u => { if (alive) setPhotoUrl(u); });
    }
    return () => { alive = false; };
  }, [applicant?.id, applicant?.photo_path, applicant?.status, applicant?.staff_memo]);

  const onChangeStatus = useCallback(async (e) => {
    const next = e.target.value;
    setStatus(next);
    try {
      await updateApplicant(applicant.id, { status: next });
      onChanged && onChanged();
    } catch (err) {
      alert('ステータス更新に失敗しました: ' + err.message);
    }
  }, [applicant, onChanged]);

  const onSaveMemo = useCallback(async () => {
    setSavingMemo(true);
    try {
      await updateApplicant(applicant.id, { staff_memo: memo });
      onChanged && onChanged();
    } catch (err) {
      alert('メモ保存に失敗しました: ' + err.message);
    } finally {
      setSavingMemo(false);
    }
  }, [applicant, memo, onChanged]);

  if (!applicant) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color.textLight, fontSize: font.size.sm,
        border: `1px dashed ${color.border}`, borderRadius: radius.lg, background: color.snow,
      }}>
        左の一覧から候補者を選択してください
      </div>
    );
  }

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: color.white,
      padding: space[5],
    }}>
      {/* 閉じるバー */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: space[2] }}>
        <Button variant="ghost" size="sm" onClick={onClose}>✕ 閉じる</Button>
      </div>
      {/* ヘッダー: 写真 + 氏名 */}
      <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-start' }}>
        <div style={{
          width: 96, height: 96, borderRadius: radius.lg, flexShrink: 0,
          background: color.cream, overflow: 'hidden', border: `1px solid ${color.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {photoUrl
            ? <img src={photoUrl} alt={applicant.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: font.size.xs, color: color.textLight }}>写真なし</span>}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <h2 style={{
              margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy,
            }}>{applicant.full_name}</h2>
            <Badge variant={JOB_TYPE_BADGE[applicant.job_type] || 'neutral'} dot>
              {JOB_TYPE_LABELS[applicant.job_type] || applicant.job_type}
            </Badge>
          </div>
          {applicant.furigana && (
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
              {applicant.furigana}
            </div>
          )}
          {applicant.job_title && (
            <div style={{ fontSize: font.size.sm, color: color.textDark, marginTop: space[1] }}>
              応募求人: {applicant.job_title}
            </div>
          )}
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[1] }}>
            応募日時: {fmtDateTime(applicant.applied_at)} ／ 流入元: 複業クラウド
          </div>
        </div>
      </div>

      {/* 選考ステータス */}
      <div style={{ marginTop: space[4], display: 'flex', gap: space[3], alignItems: 'flex-end' }}>
        <div style={{ width: 200 }}>
          <label style={labelStyle}>選考ステータス</label>
          <Select options={STATUS_OPTIONS} value={status} onChange={onChangeStatus} />
        </div>
        <a href={FUKUGYO_URL} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', marginBottom: 2 }}>
          <Button variant="outline" size="sm">複業クラウドで開く</Button>
        </a>
      </div>

      {/* 自己PR */}
      <div style={{ marginTop: space[4] }}>
        <label style={labelStyle}>自己PR / プロフィール</label>
        <div style={{
          whiteSpace: 'pre-wrap', fontSize: font.size.sm, lineHeight: font.lineHeight?.relaxed || 1.7,
          color: color.textDark, background: color.snow, border: `1px solid ${color.borderLight}`,
          borderRadius: radius.md, padding: space[3], maxHeight: 260, overflowY: 'auto',
        }}>
          {applicant.profile_text || '（本文なし）'}
        </div>
      </div>

      {/* 運営メモ */}
      <div style={{ marginTop: space[4] }}>
        <label style={labelStyle}>運営メモ</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          rows={3}
          placeholder="選考メモ（社内用）"
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        <div style={{ marginTop: space[2] }}>
          <Button variant="secondary" size="sm" loading={savingMemo} onClick={onSaveMemo}>メモを保存</Button>
        </div>
      </div>

      {/* 面接日程 */}
      <div style={{ marginTop: space[5], borderTop: `1px solid ${color.border}`, paddingTop: space[4] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[3] }}>
          面接日程
        </div>
        <InterviewList
          interviews={interviews}
          onResult={async (id, result) => { await updateInterview(id, { result }); refreshInterviews(); }}
          onDelete={async (id) => { if (confirm('この面接枠を削除しますか？')) { await deleteInterview(id); refreshInterviews(); } }}
        />
        <InterviewForm
          onAdd={async (payload) => {
            await addInterview(orgId, applicant.id, payload);
            refreshInterviews();
            // 面接枠を追加したらステータスも「面接」に寄せる（未設定時のみ）
            if (status === 'new' || status === 'screening') {
              setStatus('interview');
              await updateApplicant(applicant.id, { status: 'interview' });
              onChanged && onChanged();
            }
          }}
        />
      </div>
    </div>
  );
}

function InterviewList({ interviews, onResult, onDelete }) {
  if (!interviews.length) {
    return <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[3] }}>面接予定はまだありません。</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[3] }}>
      {interviews.map(iv => (
        <div key={iv.id} style={{
          display: 'flex', alignItems: 'center', gap: space[3],
          padding: `${space[2]}px ${space[3]}px`,
          border: `1px solid ${color.borderLight}`, borderRadius: radius.md, background: color.snow,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textDark }}>
              {fmtDateTime(iv.scheduled_at)}
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textMid }}>
              {[iv.method, iv.location].filter(Boolean).join(' / ') || '—'}
              {iv.note ? `　${iv.note}` : ''}
            </div>
          </div>
          <div style={{ width: 130, flexShrink: 0 }}>
            <Select
              options={INTERVIEW_RESULT_OPTIONS}
              value={iv.result}
              onChange={e => onResult(iv.id, e.target.value)}
            />
          </div>
          <Badge variant={INTERVIEW_RESULT_BADGE[iv.result] || 'neutral'}>
            {INTERVIEW_RESULT_LABELS[iv.result] || iv.result}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => onDelete(iv.id)}>削除</Button>
        </div>
      ))}
    </div>
  );
}

function InterviewForm({ onAdd }) {
  const [dt, setDt] = useState('');
  const [method, setMethod] = useState('オンライン');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!dt) { alert('面接日時を入力してください'); return; }
    setSaving(true);
    try {
      await onAdd({
        scheduled_at: new Date(dt).toISOString(),
        method: method || null,
        location: location || null,
        note: note || null,
        result: 'scheduled',
      });
      setDt(''); setLocation(''); setNote('');
    } catch (err) {
      alert('面接枠の追加に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border: `1px dashed ${color.border}`, borderRadius: radius.md,
      padding: space[3], background: alpha(color.navyLight, 0.04),
    }}>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[2] }}>
        面接枠を追加
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
        <div>
          <label style={labelStyle}>日時</label>
          <input type="datetime-local" value={dt} onChange={e => setDt(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>形式</label>
          <Select
            options={[{ value: 'オンライン', label: 'オンライン' }, { value: '対面', label: '対面' }, { value: '電話', label: '電話' }]}
            value={method} onChange={e => setMethod(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>場所 / URL</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Zoom URL 等" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>メモ</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="一次面接 等" style={fieldStyle} />
        </div>
      </div>
      <div style={{ marginTop: space[2], textAlign: 'right' }}>
        <Button variant="primary" size="sm" loading={saving} onClick={submit}>追加</Button>
      </div>
    </div>
  );
}
