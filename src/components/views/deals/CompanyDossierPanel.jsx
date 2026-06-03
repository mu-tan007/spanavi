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
  MASP_MEMO_ORDER,
} from '../../../types/dossier';
import { useDossierSpec } from '../../../hooks/useDossierSpec';

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
  engagementId = null,
}) {
  // engagement 別 spec (M&A ニュース / SaaS 導入トレンド / 採用市場 等)
  const { spec } = useDossierSpec(engagementId);
  // セクションラベルを spec.newsSectionLabel と spec.maspMemoLabels で上書き
  const sectionLabels = {
    ...DOSSIER_SECTION_LABELS,
    industry_ma_news: spec.newsSectionLabel,
  };
  const maspMemoLabels = spec.maspMemoLabels;
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
    const stringKeys = new Set(['executive_summary']);
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
              label={sectionLabels[key]}
              value={dossier.content?.[key]}
              editing={editingKey === key}
              draft={editingDraft}
              setDraft={setEditingDraft}
              canEditDossier={canEditDossier}
              onEdit={() => startEdit(key)}
              onCancel={cancelEdit}
              onSave={saveEdit}
              saving={saving}
              sourceUrl={getSectionSourceUrl(key, dossier.sources)}
              maspMemoLabels={maspMemoLabels}
            />
          ))}

        </div>
      )}

      {errorMsg && <div style={errStyle}>{errorMsg}</div>}
    </div>
  );
}

// セクション key → 該当するソース URL を返す。
// HP 由来のセクション（exec_summary / business / strengths）は type='hp' を、
// industry_ma_news は web_search source の代表を、各セクションヘッダー右の出典リンクとして使う。
// basic_info は社内DB由来なのでリンクなし、masp_memo はアポ取得報告由来なのでリンクなし。
function getSectionSourceUrl(sectionKey, sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  if (['executive_summary', 'business', 'strengths'].includes(sectionKey)) {
    const hp = sources.find(s => s.type === 'hp' && s.url);
    return hp?.url || null;
  }
  if (sectionKey === 'industry_ma_news') {
    // industry_ma_news は各アイテムに url 既設のため、ヘッダーには代表ソースを出さない
    return null;
  }
  return null;
}

function DossierSection({ sectionKey, label, value, editing, draft, setDraft, canEditDossier, onEdit, onCancel, onSave, saving, sourceUrl, maspMemoLabels }) {
  const stringKeys = new Set(['executive_summary']);
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={{ fontSize: font.size.sm + 1, fontWeight: font.weight.semibold, color: color.navy }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: font.size.xs - 1,
                color: color.textLight,
                textDecoration: 'none',
                borderBottom: `1px dotted ${color.textLight}`,
                paddingBottom: 1,
              }}
              title={sourceUrl}
            >出典 ↗</a>
          )}
          {canEditDossier && !editing && (
            <button onClick={onEdit} style={editButtonStyle}>編集</button>
          )}
        </div>
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
        <SectionRender sectionKey={sectionKey} value={value} maspMemoLabels={maspMemoLabels} />
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

function SectionRender({ sectionKey, value, maspMemoLabels }) {
  if (isEmptyValue(value)) return emptyHint();

  // 1. 基本情報（全項目を1つの表に統合）
  if (sectionKey === 'basic_info') return <BasicInfoRender value={value} />;

  // 2. 沿革（独立タイムライン）
  if (sectionKey === 'history') return <HistoryRender items={value} />;

  // 3, 4. 事業内容 / 特徴・強み（番号付きカード）
  if (sectionKey === 'business' || sectionKey === 'strengths') {
    return <NumberedCardList items={value} />;
  }

  // 5. M&Aニュース (engagement 別: M&A/SaaS導入/採用ニュース等)
  if (sectionKey === 'industry_ma_news') return <MaNewsRender items={value} />;

  // 6. MASP メモ (engagement 別ラベル)
  if (sectionKey === 'masp_memo') return <MaspMemoRender value={value} labels={maspMemoLabels} />;

  // フォールバック
  return <pre style={{ fontSize: font.size.xs - 1, color: color.textMid, background: color.gray50, padding: space[2], borderRadius: radius.sm, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</pre>;
}

// 住所文字列を整形:
//   - 末尾の「/」（TSR 系データの建物名 separator 残り）を削除
//   - 文字列途中の「/」は半角スペースに置換（番地と建物名の区切り）
//     例: "丸の内1-2-3/○○ビル5F" → "丸の内1-2-3 ○○ビル5F"
function cleanAddress(addr) {
  if (!addr) return '';
  return String(addr)
    .replace(/[\/／]\s*$/, '')          // 末尾の / or ／ を削除
    .replace(/\s*[\/／]\s*/g, ' ')      // 内部の / を半角スペースに
    .replace(/\s+/g, ' ')               // 連続スペースを1つに
    .trim();
}

// 住所を統合: full_address があれば最優先、無ければ prefecture+city+address を連結
function buildFullAddress(v) {
  if (!v) return '';
  const raw = v.full_address
    || [v.prefecture, v.city, v.address].filter(p => p && String(p).trim()).join('');
  return cleanAddress(raw);
}

// ── 1. 基本情報レンダラ（全項目を1つの表に統合） ──
// 短文/長文の区別なく、ラベル + 値の表形式で表示。
// 長文項目（事業内容DB登録/役員/株主構成/主要取引先/仕入先/備考）は
// 1行のセル内で折り返し表示される。
function BasicInfoRender({ value }) {
  const baseEntries = BASIC_INFO_ORDER
    .map(k => {
      // 住所は prefecture/city/address を統合
      if (k === 'address') return ['address', buildFullAddress(value)];
      return [k, value[k]];
    })
    .filter(([_, v]) => v !== null && v !== undefined && v !== '' && v !== 0);

  if (baseEntries.length === 0) return emptyHint();

  // 長文項目は表内で全幅セル、短文は2列セルに配置するため分離
  const longKeys = new Set(['officers', 'shareholders', 'clients', 'suppliers', 'remarks', 'business_description']);

  // 配置: 短文を2列で並べ、長文は全幅行として表の末尾に追加
  const shortEntries = baseEntries.filter(([k]) => !longKeys.has(k));
  const longEntries  = baseEntries.filter(([k]) =>  longKeys.has(k));

  const labelCellStyle = {
    color: color.textMid, padding: `${space[1.5]}px ${space[2]}px`,
    minWidth: 110, background: alpha(color.navyLight, 0.05),
    borderRight: `1px solid ${color.borderLight}`,
    fontWeight: font.weight.medium,
    display: 'flex', alignItems: 'flex-start',
  };
  const valueCellStyle = {
    color: color.textDark, padding: `${space[1.5]}px ${space[2]}px`,
    flex: 1, whiteSpace: 'pre-wrap', lineHeight: font.lineHeight.relaxed,
    wordBreak: 'break-word',
  };

  return (
    <div style={{
      border: `1px solid ${color.borderLight}`,
      borderRadius: radius.sm,
      overflow: 'hidden',
      fontSize: font.size.sm,
    }}>
      {/* 短文項目: 2列グリッド */}
      {shortEntries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {shortEntries.map(([k, v], idx) => (
            <div key={k} style={{
              display: 'flex',
              borderBottom: (idx >= shortEntries.length - 2 && longEntries.length === 0)
                ? 'none'
                : `1px solid ${color.borderLight}`,
              borderRight: idx % 2 === 0 ? `1px solid ${color.borderLight}` : 'none',
              background: Math.floor(idx / 2) % 2 === 1 ? color.cream : color.white,
            }}>
              <span style={labelCellStyle}>{BASIC_INFO_LABELS[k] || k}</span>
              <span style={valueCellStyle}>{formatBasicValue(k, v)}</span>
            </div>
          ))}
        </div>
      )}
      {/* 長文項目: 全幅1列 */}
      {longEntries.length > 0 && (
        <div>
          {longEntries.map(([k, v], idx) => (
            <div key={k} style={{
              display: 'flex',
              borderBottom: idx === longEntries.length - 1 ? 'none' : `1px solid ${color.borderLight}`,
              background: idx % 2 === 0 ? color.white : color.cream,
            }}>
              <span style={labelCellStyle}>{BASIC_INFO_LABELS[k] || k}</span>
              <span style={valueCellStyle}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 2. 沿革タイムラインレンダラ（独立セクション） ──
function HistoryRender({ items }) {
  if (!Array.isArray(items) || items.length === 0) return emptyHint();
  return (
    <div style={{ position: 'relative', paddingLeft: space[5] }}>
      {/* 縦線 */}
      <div style={{
        position: 'absolute', left: 10, top: 4, bottom: 4,
        width: 2, background: alpha(color.navyLight, 0.3),
      }} />
      {items.map((h, i) => (
        <div key={i} style={{ position: 'relative', marginBottom: i === items.length - 1 ? 0 : space[2] }}>
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

// ── 7. MASP メモ ── (engagement 別ラベル)
function MaspMemoRender({ value, labels }) {
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
            {labels?.[k] || k}
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
