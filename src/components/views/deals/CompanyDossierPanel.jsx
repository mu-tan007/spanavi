import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Badge } from '../../ui';
import {
  fetchDossierByAppointment,
  invokeGenerateCompanyDossier,
  invokeUpdateCompanyDossier,
  subscribeDossierByAppointment,
} from '../../../lib/dossierApi';
import { DOSSIER_SECTION_KEYS, DOSSIER_SECTION_LABELS } from '../../../types/dossier';

// =====================================================================
// CompanyDossierPanel
//   AppointmentsTab の行展開エリア内で表示する企業ドシエパネル。
//   閲覧（クライアント）/ 編集（MASP代理ログイン中）を両立。
// =====================================================================

const STATUS_LABEL = {
  queued:    '生成待機中',
  running:   '生成中',
  succeeded: '生成完了',
  partial:   '一部のみ取得',
  failed:    '生成失敗',
};

const STATUS_BADGE = {
  queued:    { variant: 'neutral', dot: false },
  running:   { variant: 'info',    dot: true },
  succeeded: { variant: 'success', dot: true },
  partial:   { variant: 'warn',    dot: true },
  failed:    { variant: 'danger',  dot: true },
};

function fmtJp(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${dy} ${hh}:${mm}`;
  } catch { return '—'; }
}

export default function CompanyDossierPanel({
  appointment,
  initialDossier = null,
  isImpersonating = false,
  adminAccessToken = null,
}) {
  const [dossier, setDossier] = useState(initialDossier);
  const [loading, setLoading] = useState(!initialDossier);
  const [kickingoff, setKickingoff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [editingFreeNotes, setEditingFreeNotes] = useState(false);
  const [freeNotesDraft, setFreeNotesDraft] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const appointmentId = appointment?.id;

  // 初期取得（initialDossier が無いとき）
  useEffect(() => {
    if (!appointmentId || initialDossier) return;
    let cancelled = false;
    setLoading(true);
    fetchDossierByAppointment(appointmentId).then(({ data }) => {
      if (cancelled) return;
      setDossier(data || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [appointmentId, initialDossier]);

  // Realtime: 生成中なら status 遷移を監視
  useEffect(() => {
    if (!appointmentId) return;
    const unsub = subscribeDossierByAppointment(appointmentId, (next) => {
      setDossier(prev => ({ ...(prev || {}), ...next }));
    });
    return unsub;
  }, [appointmentId]);

  const handleGenerate = async () => {
    if (!appointmentId || kickingoff) return;
    setKickingoff(true);
    setErrorMsg('');
    const { error } = await invokeGenerateCompanyDossier({
      appointment_id: appointmentId,
      org_id: appointment?.org_id,
    });
    if (error) setErrorMsg(error.message || '生成リクエストに失敗しました');
    // Realtime で status 遷移を拾うので、ここでは何もしない
    setTimeout(() => setKickingoff(false), 1500);
  };

  const handleRegenerate = async () => {
    if (!dossier?.id) return handleGenerate();
    if (!isImpersonating || !adminAccessToken) {
      // 代理ログインしていない場合は generate を直接叩く
      return handleGenerate();
    }
    setKickingoff(true);
    setErrorMsg('');
    const { error } = await invokeUpdateCompanyDossier(
      { dossier_id: dossier.id, regenerate: true },
      adminAccessToken,
    );
    if (error) setErrorMsg(error.message || '再生成リクエストに失敗しました');
    setTimeout(() => setKickingoff(false), 1500);
  };

  const startEdit = (sectionKey) => {
    if (!isImpersonating) return;
    setEditingKey(sectionKey);
    const val = dossier?.content?.[sectionKey];
    setEditingDraft(typeof val === 'string' ? val : JSON.stringify(val ?? '', null, 2));
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingDraft('');
  };

  const saveEdit = async () => {
    if (!dossier?.id || !editingKey || !adminAccessToken) return;
    setSaving(true);
    setErrorMsg('');
    // 文字列セクションは string、それ以外は JSON parse 試行
    let nextVal;
    if (['overview', 'mna_relevance'].includes(editingKey)) {
      nextVal = editingDraft;
    } else {
      try { nextVal = JSON.parse(editingDraft); }
      catch (e) { setErrorMsg('JSONとして解釈できませんでした: ' + e.message); setSaving(false); return; }
    }
    const nextContent = { ...(dossier.content || {}), [editingKey]: nextVal };
    const { data, error } = await invokeUpdateCompanyDossier(
      { dossier_id: dossier.id, content: nextContent },
      adminAccessToken,
    );
    if (error) {
      setErrorMsg(error.message || '保存に失敗しました');
    } else {
      setDossier(prev => ({ ...prev, content: nextContent, edited_at: new Date().toISOString(), edited_by: data?.edited_by || prev.edited_by }));
      cancelEdit();
    }
    setSaving(false);
  };

  const startEditFreeNotes = () => {
    if (!isImpersonating) return;
    setEditingFreeNotes(true);
    setFreeNotesDraft(dossier?.free_notes || '');
  };

  const saveFreeNotes = async () => {
    if (!dossier?.id || !adminAccessToken) return;
    setSaving(true);
    setErrorMsg('');
    const { error } = await invokeUpdateCompanyDossier(
      { dossier_id: dossier.id, free_notes: freeNotesDraft },
      adminAccessToken,
    );
    if (error) {
      setErrorMsg(error.message || '保存に失敗しました');
    } else {
      setDossier(prev => ({ ...prev, free_notes: freeNotesDraft, edited_at: new Date().toISOString() }));
      setEditingFreeNotes(false);
    }
    setSaving(false);
  };

  const lowSourceCount = useMemo(() => {
    if (!dossier?.sources) return 0;
    return dossier.sources.filter(s => s.identity_match === 'low').length;
  }, [dossier]);

  if (loading) {
    return <div style={panelStyle}><div style={{ color: color.textMid, fontSize: font.size.sm }}>読み込み中...</div></div>;
  }

  // 未生成
  if (!dossier) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] }}>
          <div style={{ fontSize: font.size.sm, color: color.textMid }}>
            この企業のドシエはまだ生成されていません
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={kickingoff} loading={kickingoff}>
            {kickingoff ? '生成リクエスト中...' : 'ドシエ生成'}
          </Button>
        </div>
        {errorMsg && <div style={errStyle}>{errorMsg}</div>}
      </div>
    );
  }

  const status = dossier.generation_status;
  const badgeCfg = STATUS_BADGE[status] || STATUS_BADGE.queued;

  return (
    <div style={panelStyle}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: space[2], marginBottom: space[3],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.sm + 1, fontWeight: font.weight.semibold, color: color.navy }}>
            企業ドシエ
          </span>
          <Badge variant={badgeCfg.variant} dot={badgeCfg.dot} size="sm">{STATUS_LABEL[status] || status}</Badge>
          {lowSourceCount > 0 && (
            <Badge variant="warn" size="sm" dot>※同定強度 low の情報源 {lowSourceCount} 件</Badge>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], fontSize: font.size.xs - 1, color: color.textLight }}>
          <span>生成: {fmtJp(dossier.generated_at)}</span>
          {dossier.edited_at && <span>編集: {fmtJp(dossier.edited_at)}</span>}
          {isImpersonating && status !== 'running' && status !== 'queued' && (
            <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={kickingoff}>再生成</Button>
          )}
        </div>
      </div>

      {/* 生成中 / 失敗時 */}
      {(status === 'running' || status === 'queued') && (
        <div style={{ padding: space[4], textAlign: 'center', color: color.textMid, fontSize: font.size.sm }}>
          生成中... HP取得・公開情報収集・構造化（約30〜90秒）
        </div>
      )}

      {status === 'failed' && (
        <div style={{ padding: space[3], background: color.dangerSoft, borderRadius: radius.md, color: color.danger, fontSize: font.size.sm }}>
          生成に失敗しました: {dossier.generation_error || '原因不明'}
        </div>
      )}

      {/* 本体セクション */}
      {(status === 'succeeded' || status === 'partial') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {DOSSIER_SECTION_KEYS.map(key => (
            <DossierSection
              key={key}
              sectionKey={key}
              label={DOSSIER_SECTION_LABELS[key]}
              value={dossier.content?.[key]}
              editing={editingKey === key}
              draft={editingDraft}
              setDraft={setEditingDraft}
              isImpersonating={isImpersonating}
              onEdit={() => startEdit(key)}
              onCancel={cancelEdit}
              onSave={saveEdit}
              saving={saving}
            />
          ))}

          {/* 自由記述欄 */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>
                MASP メモ（自由記述）
              </span>
              {isImpersonating && !editingFreeNotes && (
                <button onClick={startEditFreeNotes} style={editButtonStyle}>編集</button>
              )}
            </div>
            {editingFreeNotes ? (
              <div>
                <textarea
                  value={freeNotesDraft}
                  onChange={e => setFreeNotesDraft(e.target.value)}
                  rows={4}
                  style={textareaStyle}
                />
                <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
                  <Button size="sm" onClick={saveFreeNotes} disabled={saving} loading={saving}>保存</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingFreeNotes(false)} disabled={saving}>キャンセル</Button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: font.size.sm, color: dossier.free_notes ? color.textDark : color.textLight, whiteSpace: 'pre-wrap' }}>
                {dossier.free_notes || '（未記入）'}
              </div>
            )}
          </div>

          {/* 情報源 */}
          {dossier.sources && dossier.sources.length > 0 && (
            <div style={sectionStyle}>
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1.5] }}>
                情報源
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dossier.sources.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.xs - 1, color: color.textMid }}>
                    <span style={{ fontFamily: font.family.mono, color: color.textLight, minWidth: 80 }}>{s.type}</span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: color.navy, textDecoration: 'underline', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url || '(URL不明)'}</a>
                    <Badge size="sm" variant={s.identity_match === 'high' ? 'success' : s.identity_match === 'medium' ? 'info' : 'warn'} dot>
                      {s.identity_match}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && <div style={errStyle}>{errorMsg}</div>}
    </div>
  );
}

function DossierSection({ sectionKey, label, value, editing, draft, setDraft, isImpersonating, onEdit, onCancel, onSave, saving }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy }}>{label}</span>
        {isImpersonating && !editing && (
          <button onClick={onEdit} style={editButtonStyle}>編集</button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={['overview', 'mna_relevance'].includes(sectionKey) ? 5 : 8}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
            <Button size="sm" onClick={onSave} disabled={saving} loading={saving}>保存</Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>キャンセル</Button>
          </div>
        </div>
      ) : (
        <SectionRender sectionKey={sectionKey} value={value} />
      )}
    </div>
  );
}

function SectionRender({ sectionKey, value }) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <div style={{ fontSize: font.size.sm, color: color.textLight }}>（情報なし）</div>;
  }
  // 文字列セクション
  if (sectionKey === 'overview' || sectionKey === 'mna_relevance') {
    return <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, whiteSpace: 'pre-wrap' }}>{value}</div>;
  }
  // string[] セクション
  if (sectionKey === 'business_segments' || sectionKey === 'key_topics') {
    return (
      <ul style={listStyle}>
        {value.map((v, i) => <li key={i} style={liStyle}>{v}</li>)}
      </ul>
    );
  }
  // history: [{year, event}]
  if (sectionKey === 'history') {
    return (
      <ul style={listStyle}>
        {value.map((v, i) => (
          <li key={i} style={liStyle}>
            <span style={{ fontFamily: font.family.mono, color: color.textMid, marginRight: space[2] }}>{v.year}</span>
            {v.event}
          </li>
        ))}
      </ul>
    );
  }
  // leadership: [{role, name}]
  if (sectionKey === 'leadership') {
    return (
      <ul style={listStyle}>
        {value.map((v, i) => (
          <li key={i} style={liStyle}>
            <span style={{ color: color.textMid, marginRight: space[2] }}>{v.role}</span>
            <span style={{ fontWeight: font.weight.medium }}>{v.name}</span>
          </li>
        ))}
      </ul>
    );
  }
  // financials: {revenue, employees, established, capital}
  if (sectionKey === 'financials') {
    const labels = { revenue: '売上高', employees: '従業員数', established: '設立', capital: '資本金' };
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: space[1.5] }}>
        {Object.entries(labels).map(([k, lbl]) => (
          <div key={k} style={{ fontSize: font.size.sm }}>
            <span style={{ color: color.textMid, marginRight: space[2] }}>{lbl}:</span>
            <span style={{ color: value[k] ? color.textDark : color.textLight }}>{value[k] || '—'}</span>
          </div>
        ))}
      </div>
    );
  }
  // press_releases / news: [{date, title, url, summary, ...}]
  if (sectionKey === 'press_releases' || sectionKey === 'news') {
    return (
      <ul style={{ ...listStyle, gap: space[2] }}>
        {value.map((v, i) => (
          <li key={i} style={{ ...liStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono }}>
              {v.date || '—'}{v.source ? ` ・ ${v.source}` : ''}
            </div>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textDark }}>
              {v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: color.navy, textDecoration: 'underline' }}>{v.title}</a> : v.title}
            </div>
            {v.summary && <div style={{ fontSize: font.size.xs, color: color.textMid }}>{v.summary}</div>}
          </li>
        ))}
      </ul>
    );
  }
  // フォールバック: JSON.stringify
  return <pre style={{ fontSize: font.size.xs - 1, color: color.textMid, background: color.gray50, padding: space[2], borderRadius: radius.sm, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</pre>;
}

// ────── styles ──────
const panelStyle = {
  background: color.white,
  border: `1px solid ${color.borderLight}`,
  borderRadius: radius.md,
  padding: space[3],
};
const sectionStyle = {
  borderBottom: `1px solid ${color.borderLight}`,
  paddingBottom: space[3],
};
const sectionHeaderStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: space[1.5],
};
const editButtonStyle = {
  background: 'none', border: `1px solid ${color.border}`,
  borderRadius: radius.sm, padding: '2px 8px',
  fontSize: font.size.xs - 1, color: color.navy, cursor: 'pointer',
  fontFamily: font.family.sans,
};
const textareaStyle = {
  width: '100%', padding: space[2],
  border: `1px solid ${color.border}`, borderRadius: radius.md,
  fontSize: font.size.sm, fontFamily: font.family.sans, color: color.textDark,
  resize: 'vertical', outline: 'none',
  boxSizing: 'border-box',
};
const listStyle = { listStyle: 'disc', paddingLeft: space[5], display: 'flex', flexDirection: 'column', gap: space[1], margin: 0 };
const liStyle = { fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed };
const errStyle = {
  marginTop: space[2],
  padding: space[2],
  background: color.dangerSoft,
  borderRadius: radius.sm,
  color: color.danger,
  fontSize: font.size.xs,
};
