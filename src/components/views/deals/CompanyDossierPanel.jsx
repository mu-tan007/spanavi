import React, { useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Badge } from '../../ui';
import { supabase } from '../../../lib/supabase';
import {
  fetchDossierByAppointment,
  invokeGenerateCompanyDossier,
  invokeUpdateCompanyDossier,
  subscribeDossierByAppointment,
} from '../../../lib/dossierApi';
import {
  DOSSIER_SECTION_KEYS,
  DOSSIER_SECTION_LABELS,
  BASIC_INFO_LABELS,
  BASIC_INFO_ORDER,
  MASP_MEMO_LABELS,
  MASP_MEMO_ORDER,
} from '../../../types/dossier';

// =====================================================================
// CompanyDossierPanel
//   AppointmentsTab の行展開エリア内で表示する企業情報パネル（7セクション）。
//   1. Executive Summary
//   2. 基本情報（沿革内包）
//   3. 事業内容
//   4. 特徴・強み
//   5. 市場動向
//   6. 同業界のM&Aニュース
//   7. MASPメモ（アポ取得報告から自動抽出）
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

// canEditDossier=true は MASP メンバー権限あり（管理画面 or クライアントポータル代理ログイン中）。
// adminAccessToken は代理ログイン中の編集経路で使う admin の access_token。
//   - あり: update-company-dossier Edge Function 経由（admin token 検証 + service_role 書込）
//   - なし: supabase 直接 update（RLS でメンバー権限チェック）
export default function CompanyDossierPanel({
  appointment,
  initialDossier = null,
  canEditDossier = false,
  adminAccessToken = null,
}) {
  const [dossier, setDossier] = useState(initialDossier);
  const [loading, setLoading] = useState(!initialDossier);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const appointmentId = appointment?.id;

  // 編集 API: adminAccessToken があれば Edge Function、なければ supabase 直接
  const writeDossier = async (payload) => {
    if (adminAccessToken) {
      return invokeUpdateCompanyDossier({ dossier_id: dossier.id, ...payload }, adminAccessToken);
    }
    const updatePayload = { edited_at: new Date().toISOString() };
    if (payload.content !== undefined) updatePayload.content = payload.content;
    if (payload.free_notes !== undefined) updatePayload.free_notes = payload.free_notes;
    const { error } = await supabase
      .from('company_dossiers')
      .update(updatePayload)
      .eq('id', dossier.id);
    return { data: error ? null : { success: true }, error };
  };

  // 初期取得
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

  // Realtime
  useEffect(() => {
    if (!appointmentId) return;
    const unsub = subscribeDossierByAppointment(appointmentId, (next) => {
      setDossier(prev => ({ ...(prev || {}), ...next }));
    });
    return unsub;
  }, [appointmentId]);

  const startEdit = (sectionKey) => {
    if (!canEditDossier) return;
    setEditingKey(sectionKey);
    const val = dossier?.content?.[sectionKey];
    setEditingDraft(typeof val === 'string' ? val : JSON.stringify(val ?? '', null, 2));
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingDraft('');
  };

  const saveEdit = async () => {
    if (!dossier?.id || !editingKey || !canEditDossier) return;
    setSaving(true);
    setErrorMsg('');
    // 文字列セクションは string、それ以外は JSON parse
    const stringKeys = new Set(['executive_summary', 'market_trend']);
    let nextVal;
    if (stringKeys.has(editingKey)) {
      nextVal = editingDraft;
    } else {
      try { nextVal = JSON.parse(editingDraft); }
      catch (e) { setErrorMsg('JSONとして解釈できませんでした: ' + e.message); setSaving(false); return; }
    }
    const nextContent = { ...(dossier.content || {}), [editingKey]: nextVal };
    const { error } = await writeDossier({ content: nextContent });
    if (error) {
      setErrorMsg(error.message || '保存に失敗しました');
    } else {
      setDossier(prev => ({ ...prev, content: nextContent, edited_at: new Date().toISOString() }));
      cancelEdit();
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
  if (!dossier || dossier.generation_status === 'queued') {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: font.size.sm, color: color.textMid }}>
          {canEditDossier
            ? 'この企業の企業情報はまだ生成されていません。右側の「作成」ボタンから生成してください。'
            : 'この企業の企業情報はまだ生成されていません。'}
        </div>
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
            企業情報
          </span>
          <Badge variant={badgeCfg.variant} dot={badgeCfg.dot} size="sm">{STATUS_LABEL[status] || status}</Badge>
          {lowSourceCount > 0 && (
            <Badge variant="warn" size="sm" dot>※同定強度 low の情報源 {lowSourceCount} 件</Badge>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], fontSize: font.size.xs - 1, color: color.textLight }}>
          <span>生成: {fmtJp(dossier.generated_at)}</span>
          {dossier.edited_at && <span>編集: {fmtJp(dossier.edited_at)}</span>}
        </div>
      </div>

      {status === 'running' && (
        <div style={{ padding: space[4], textAlign: 'center', color: color.textMid, fontSize: font.size.sm }}>
          生成中... HP取得・公開情報収集・構造化（約30〜90秒）
        </div>
      )}

      {status === 'failed' && (
        <div style={{ padding: space[3], background: color.dangerSoft, borderRadius: radius.md, color: color.danger, fontSize: font.size.sm }}>
          生成に失敗しました: {dossier.generation_error || '原因不明'}
        </div>
      )}

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
              canEditDossier={canEditDossier}
              onEdit={() => startEdit(key)}
              onCancel={cancelEdit}
              onSave={saveEdit}
              saving={saving}
            />
          ))}

          {/* 情報源 */}
          {dossier.sources && dossier.sources.length > 0 && (
            <div style={{ ...sectionStyle, borderBottom: 'none' }}>
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

function DossierSection({ sectionKey, label, value, editing, draft, setDraft, canEditDossier, onEdit, onCancel, onSave, saving }) {
  const stringKeys = new Set(['executive_summary', 'market_trend']);
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={{ fontSize: font.size.sm + 1, fontWeight: font.weight.semibold, color: color.navy }}>{label}</span>
        {canEditDossier && !editing && (
          <button onClick={onEdit} style={editButtonStyle}>編集</button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={stringKeys.has(sectionKey) ? 5 : 10}
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

// 千円→億円整形、年齢に「歳」など
function formatBasicValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  const moneyKeys = new Set(['revenue_k', 'ordinary_income_k', 'net_income_k', 'capital_k']);
  if (moneyKeys.has(key)) {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (!isNaN(num)) {
      if (Math.abs(num) >= 100000) return `${(num / 100000).toFixed(1).replace(/\.0$/, '')}億円`;
      if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(0)}百万円`;
      return `${num.toLocaleString()}千円`;
    }
  }
  if (key === 'representative_age' && /^\d+$/.test(String(value))) return `${value}歳`;
  if (key === 'employee_count' && /^\d+$/.test(String(value))) return `${value}名`;
  if (key === 'established_year' && /^\d+$/.test(String(value))) return `${value}年`;
  return String(value);
}

function emptyHint() {
  return <div style={{ fontSize: font.size.sm, color: color.textLight }}>（情報なし）</div>;
}

function isEmptyValue(v) {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
  return false;
}

function SectionRender({ sectionKey, value }) {
  if (isEmptyValue(value)) return emptyHint();

  // 1. Executive Summary（短文）
  if (sectionKey === 'executive_summary') {
    return (
      <div style={{
        fontSize: font.size.sm + 1, color: color.textDark, lineHeight: font.lineHeight.relaxed,
        whiteSpace: 'pre-wrap', padding: space[2], background: alpha(color.navyLight, 0.05),
        borderLeft: `3px solid ${color.gold}`, borderRadius: radius.sm,
      }}>{value}</div>
    );
  }

  // 2. 基本情報（表 + 沿革タイムライン）
  if (sectionKey === 'basic_info') return <BasicInfoRender value={value} />;

  // 3, 4. 事業内容 / 特徴・強み（番号付きカード）
  if (sectionKey === 'business' || sectionKey === 'strengths') {
    return <NumberedCardList items={value} />;
  }

  // 5. 市場動向（文章）
  if (sectionKey === 'market_trend') {
    return <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, whiteSpace: 'pre-wrap' }}>{value}</div>;
  }

  // 6. 同業界 M&A ニュース
  if (sectionKey === 'industry_ma_news') return <MaNewsRender items={value} />;

  // 7. MASP メモ
  if (sectionKey === 'masp_memo') return <MaspMemoRender value={value} />;

  // フォールバック
  return <pre style={{ fontSize: font.size.xs - 1, color: color.textMid, background: color.gray50, padding: space[2], borderRadius: radius.sm, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</pre>;
}

// ── 2. 基本情報レンダラ ──
function BasicInfoRender({ value }) {
  // history は別扱い
  const history = Array.isArray(value.history) ? value.history : [];
  const baseEntries = BASIC_INFO_ORDER
    .map(k => [k, value[k]])
    .filter(([_, v]) => v !== null && v !== undefined && v !== '' && v !== 0);

  if (baseEntries.length === 0 && history.length === 0) return emptyHint();

  const longKeys = new Set(['officers', 'shareholders', 'clients', 'suppliers', 'remarks', 'business_description']);
  const shortEntries = baseEntries.filter(([k]) => !longKeys.has(k));
  const longEntries  = baseEntries.filter(([k]) =>  longKeys.has(k));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* 基本データ表 */}
      {(shortEntries.length > 0 || longEntries.length > 0) && (
        <div>
          {shortEntries.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0,
              border: `1px solid ${color.borderLight}`, borderRadius: radius.sm, overflow: 'hidden',
            }}>
              {shortEntries.map(([k, v], idx) => (
                <div key={k} style={{
                  display: 'flex', fontSize: font.size.sm,
                  borderBottom: `1px solid ${color.borderLight}`,
                  borderRight: idx % 2 === 0 ? `1px solid ${color.borderLight}` : 'none',
                  background: idx % 4 < 2 ? color.white : color.cream,
                }}>
                  <span style={{ color: color.textMid, padding: `${space[1.5]}px ${space[2]}px`, minWidth: 110, background: alpha(color.navyLight, 0.05), borderRight: `1px solid ${color.borderLight}`, fontWeight: font.weight.medium }}>
                    {BASIC_INFO_LABELS[k] || k}
                  </span>
                  <span style={{ color: color.textDark, padding: `${space[1.5]}px ${space[2]}px`, flex: 1 }}>
                    {formatBasicValue(k, v)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {longEntries.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[2] }}>
              {longEntries.map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, marginBottom: 2 }}>
                    {BASIC_INFO_LABELS[k] || k}
                  </div>
                  <div style={{ fontSize: font.size.sm, color: color.textDark, whiteSpace: 'pre-wrap', lineHeight: font.lineHeight.relaxed }}>
                    {String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 沿革タイムライン */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, marginBottom: space[2] }}>
            沿革
          </div>
          <div style={{ position: 'relative', paddingLeft: space[5] }}>
            {/* 縦線 */}
            <div style={{
              position: 'absolute', left: 10, top: 4, bottom: 4,
              width: 2, background: alpha(color.navyLight, 0.3),
            }} />
            {history.map((h, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: i === history.length - 1 ? 0 : space[2] }}>
                {/* ドット */}
                <div style={{
                  position: 'absolute', left: -19, top: 6,
                  width: 10, height: 10, borderRadius: '50%',
                  background: color.gold, border: `2px solid ${color.white}`,
                  boxShadow: `0 0 0 1px ${alpha(color.navyLight, 0.4)}`,
                }} />
                <div style={{ display: 'flex', gap: space[3], alignItems: 'baseline' }}>
                  <span style={{
                    fontFamily: font.family.mono, fontSize: font.size.sm,
                    color: color.navy, fontWeight: font.weight.semibold, minWidth: 50,
                  }}>{h.year}</span>
                  <span style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
                    {h.event}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 3, 4. 番号付きカードリスト（事業内容・強み）──
function NumberedCardList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return emptyHint();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
      {items.map((v, i) => (
        <div key={i} style={{
          display: 'flex', gap: space[2], alignItems: 'flex-start',
          padding: space[2], background: color.white, borderRadius: radius.sm,
          border: `1px solid ${color.borderLight}`,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%',
            background: color.navy, color: color.white,
            fontSize: font.size.xs, fontWeight: font.weight.semibold,
            flexShrink: 0,
          }}>{i + 1}</span>
          <span style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, flex: 1 }}>
            {String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 6. M&A ニュース ──
function MaNewsRender({ items }) {
  if (!Array.isArray(items) || items.length === 0) return emptyHint();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {items.map((v, i) => (
        <div key={i} style={{
          padding: space[2.5], background: color.white,
          border: `1px solid ${color.borderLight}`, borderRadius: radius.sm,
          borderLeft: `3px solid ${color.gold}`,
        }}>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>
              {v.date || '日付不明'}
            </span>
            {v.deal_type && <Badge size="sm" variant="primary">{v.deal_type}</Badge>}
            {v.source && (
              <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
                出典: {v.source}
              </span>
            )}
          </div>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark, marginBottom: 4 }}>
            {v.url
              ? <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: color.navy, textDecoration: 'underline' }}>{v.title}</a>
              : v.title}
          </div>
          {v.summary && (
            <div style={{ fontSize: font.size.xs + 1, color: color.textMid, lineHeight: font.lineHeight.relaxed }}>
              {v.summary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 7. MASP メモ ──
function MaspMemoRender({ value }) {
  const entries = MASP_MEMO_ORDER
    .map(k => [k, value[k]])
    .filter(([_, v]) => v !== null && v !== undefined && v !== '' && v !== '確認できず');
  if (entries.length === 0) return emptyHint();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{
          padding: space[2], background: alpha(color.gold, 0.06),
          borderRadius: radius.sm, border: `1px solid ${alpha(color.gold, 0.2)}`,
        }}>
          <div style={{ fontSize: font.size.xs, color: color.navy, fontWeight: font.weight.semibold, marginBottom: 4 }}>
            {MASP_MEMO_LABELS[k] || k}
          </div>
          <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, whiteSpace: 'pre-wrap' }}>
            {String(v)}
          </div>
        </div>
      ))}
    </div>
  );
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
  marginBottom: space[2],
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
const errStyle = {
  marginTop: space[2],
  padding: space[2],
  background: color.dangerSoft,
  borderRadius: radius.sm,
  color: color.danger,
  fontSize: font.size.xs,
};
