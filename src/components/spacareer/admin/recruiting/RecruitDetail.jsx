import React, { useState, useEffect, useCallback } from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Button, Select, Badge } from '../../../ui';
import {
  updateApplicant, getPhotoSignedUrl,
  JOB_TYPE_LABELS, JOB_TYPE_BADGE,
  PIPELINE_STATUS_OPTIONS,
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

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

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
  const [pipeline, setPipeline] = useState(applicant?.pipeline_status || 'scheduling');
  const [interviewAt, setInterviewAt] = useState(toLocalInput(applicant?.interview_at));
  const [memo, setMemo] = useState(applicant?.staff_memo || '');
  const [savingMemo, setSavingMemo] = useState(false);

  useEffect(() => {
    setPipeline(applicant?.pipeline_status || 'scheduling');
    setInterviewAt(toLocalInput(applicant?.interview_at));
    setMemo(applicant?.staff_memo || '');
    setPhotoUrl(null);
    let alive = true;
    if (applicant?.photo_path) {
      getPhotoSignedUrl(applicant.photo_path).then(u => { if (alive) setPhotoUrl(u); });
    }
    return () => { alive = false; };
  }, [applicant?.id, applicant?.photo_path, applicant?.pipeline_status, applicant?.interview_at, applicant?.staff_memo]);

  const persist = useCallback(async (patch) => {
    try {
      await updateApplicant(applicant.id, patch);
      onChanged && onChanged();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
  }, [applicant, onChanged]);

  const onChangePipeline = (e) => { setPipeline(e.target.value); persist({ pipeline_status: e.target.value }); };
  const onChangeInterview = (e) => {
    setInterviewAt(e.target.value);
    persist({ interview_at: e.target.value ? new Date(e.target.value).toISOString() : null });
  };
  const onSaveMemo = async () => {
    setSavingMemo(true);
    await persist({ staff_memo: memo || null });
    setSavingMemo(false);
  };

  if (!applicant) return null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: color.white, padding: space[5] }}>
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
            <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
              {applicant.full_name}
            </h2>
            {JOB_TYPE_LABELS[applicant.job_type] && (
              <Badge variant={JOB_TYPE_BADGE[applicant.job_type]} dot>
                {JOB_TYPE_LABELS[applicant.job_type]}
              </Badge>
            )}
          </div>
          {applicant.furigana && (
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>{applicant.furigana}</div>
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

      {/* 面接日 + ステータス */}
      <div style={{ marginTop: space[4], display: 'flex', gap: space[3] }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>面接日</label>
          <input type="datetime-local" value={interviewAt} onChange={onChangeInterview} style={fieldStyle} />
        </div>
        <div style={{ width: 160 }}>
          <label style={labelStyle}>ステータス</label>
          <Select options={PIPELINE_STATUS_OPTIONS} value={pipeline} onChange={onChangePipeline} />
        </div>
      </div>

      <div style={{ marginTop: space[3] }}>
        <a href={FUKUGYO_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <Button variant="outline" size="sm">複業クラウドで開く</Button>
        </a>
      </div>

      {/* 自己PR */}
      <div style={{ marginTop: space[4] }}>
        <label style={labelStyle}>自己PR / プロフィール</label>
        <div style={{
          whiteSpace: 'pre-wrap', fontSize: font.size.sm, lineHeight: font.lineHeight?.relaxed || 1.7,
          color: color.textDark, background: color.snow, border: `1px solid ${color.borderLight}`,
          borderRadius: radius.md, padding: space[3], maxHeight: 320, overflowY: 'auto',
        }}>
          {applicant.profile_text || '（本文なし）'}
        </div>
      </div>

      {/* メモ */}
      <div style={{ marginTop: space[4] }}>
        <label style={labelStyle}>メモ</label>
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
    </div>
  );
}
