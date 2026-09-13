import { useEffect, useRef, useState } from 'react';
import { X, Building2, History, Files, Pencil } from 'lucide-react';
import { Button, Input, Select, Card, Badge, DataTable } from '../ui';
import { color, space, font, radius, shadow, alpha } from '../../constants/design';
import { COMPANY_CRM_STAGES, COMPANY_REGISTRY_STATUSES } from '../../utils/companyProfileIdentity';
import { fetchCompanyProfile, saveCompanyProfile, resolveCompanyReview, mergeCompanyReview } from '../../lib/companyProfileApi';
import CompanyImportedFields from './CompanyImportedFields';

const homeLabels = { available: '住所あり', unknown: '住所未確認', conflict: '住所の相違あり' };
const fieldLabels = { company_name: '企業名', representative: '代表者', phone: '会社電話番号', address: '会社住所',
  business: '事業内容', industry: '業種', corporate_number: '法人番号', representative_address: '代表者自宅住所',
  crm_stage: '対応状況', owner_name: '担当者', next_action_at: '次回対応日時', next_action_note: '次回の対応内容',
  shared_memo: '共有メモ', registry_status: '登記の確認状況', registry_source: '登記確認の出典・根拠' };
const dateText = value => !value ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? value.replaceAll('-', '/') : new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formFor(profile) {
  return Object.fromEntries(Object.keys(fieldLabels).map(key => [key, key === 'next_action_at' ? localDate(profile[key]) : profile[key] ?? '']));
}
const textAreaStyle = { width: '100%', boxSizing: 'border-box', padding: space[3], border: `1px solid ${color.border}`,
  borderRadius: radius.md, fontFamily: font.family.sans, fontSize: font.size.sm, color: color.textDark, background: color.white, lineHeight: font.lineHeight.relaxed };

export default function CompanyProfileDialog({ target, onClose, onChanged, onSelectCompany }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview'), [editing, setEditing] = useState(false), [form, setForm] = useState({});
  const [saving, setSaving] = useState(false), [attempt, setAttempt] = useState(0), [historyBusy, setHistoryBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState({}), [saved, setSaved] = useState(false);
  const targetKey = `${target.companyId || ''}:${target.masterId || ''}:${target.itemId || ''}`;
  const activeKey = useRef(targetKey); activeKey.current = targetKey;
  const dialogRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    activeKey.current = targetKey; setSaving(false); setHistoryBusy(false);
    setData(null); setError(''); setLoading(true); setEditing(false); setSaved(false); setReviewNotes({}); setTab('overview');
    fetchCompanyProfile(target, controller.signal).then(result => {
      if (active) { setData(result); setForm(formFor(result.profile)); }
    }).catch(e => { if (active) setError(e.message || '企業カルテを読み込めませんでした'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; activeKey.current = null; controller.abort(); };
  }, [targetKey, attempt]); // target fields are represented by targetKey
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const profile = data?.profile;
  const save = async () => {
    const key = targetKey; setSaving(true); setError('');
    const original = formFor(profile), changes = {};
    for (const [field, value] of Object.entries(form)) if (value !== original[field]) {
      changes[field] = field === 'next_action_at' ? (value ? new Date(value).toISOString() : null) : value;
    }
    if (!Object.keys(changes).length) { setEditing(false); setSaving(false); return; }
    try {
      const result = await saveCompanyProfile(profile.id, profile.version, changes);
      if (activeKey.current !== key) return;
      setData(result); setForm(formFor(result.profile)); setEditing(false); setSaved(true); onChanged?.(result.profile);
    } catch (e) { if (activeKey.current === key) setError(e.message || '保存できませんでした'); }
    finally { if (activeKey.current === key) setSaving(false); }
  };
  const moreHistory = async () => {
    const key = targetKey; setHistoryBusy(true);
    try {
      const result = await fetchCompanyProfile({ companyId: profile.id }, undefined, data.history.length);
      if (activeKey.current === key) setData(prev => ({ ...prev, history: [...prev.history, ...result.history], history_count: result.history_count }));
    } catch (e) { if (activeKey.current === key) setError(e.message); }
    finally { if (activeKey.current === key) setHistoryBusy(false); }
  };
  const resolve = async (review, merge = false) => {
    if (merge && !window.confirm(`${review.companies.length}社を「${profile.company_name}」の企業カルテにまとめます。元リストは保持し、現在のカルテで確認した共有情報を優先します。同一企業として統合しますか？`)) return;
    const key = targetKey; setSaving(true); setError('');
    try {
      if (merge) await mergeCompanyReview(review.id, profile.id, reviewNotes[review.id] || '');
      else await resolveCompanyReview(review.id, reviewNotes[review.id] || '');
      const result = await fetchCompanyProfile({ companyId: profile.id });
      if (activeKey.current === key) { setData(result); setForm(formFor(result.profile)); onChanged?.(result.profile); }
    } catch (e) { if (activeKey.current === key) setError(e.message); }
    finally { if (activeKey.current === key) setSaving(false); }
  };
  const change = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const input = (field, props = {}) => <Input key={field} label={fieldLabels[field]} aria-label={fieldLabels[field]}
    value={form[field] || ''} onChange={e => change(field, e.target.value)} {...props} />;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: alpha(color.navyDeep, 0.5), padding: space[4], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="企業カルテ" tabIndex={-1}
        onKeyDown={e => {
          // Keep shortcuts in the underlying call screen from receiving keystrokes.
          e.stopPropagation();
          if (e.key === 'Escape' && !saving && !editing) onClose();
          if (e.key === 'Tab') {
            const controls = [...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
          }
        }}
        style={{ width: '100%', maxWidth: 1120, height: '92vh', background: color.offWhite, borderRadius: radius.lg, boxShadow: shadow.xl, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: space[4], background: color.navy, color: color.white, display: 'flex', alignItems: 'center', gap: space[3] }}>
          <Building2 size={24} /><div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.size.xs, marginBottom: space[1] }}>企業カルテ</div>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, overflowWrap: 'anywhere' }}>{profile?.company_name || '読み込み中…'}</div>
          </div>
          <Button variant="ghost" size="sm" aria-label="企業カルテを閉じる" disabled={saving} onClick={onClose} style={{ color: color.white }}><X size={20} /></Button>
        </div>
        {profile && <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', padding: `${space[3]}px ${space[4]}px`, background: color.white, borderBottom: `1px solid ${color.border}` }}>
          {[['overview', '基本情報・対応', Building2], ['history', `対応履歴（${data.history_count}）`, History], ['sources', '出典・名寄せ', Files]].map(([key, label, Icon]) => (
            <Button key={key} variant={tab === key ? 'primary' : 'ghost'} size="sm" iconLeft={<Icon size={16} />} onClick={() => setTab(key)}>{label}</Button>
          ))}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', color: color.textMid, fontSize: font.size.sm }}>
            {profile.master_count > 0 ? '企業DBと共有' : '架電リストから登録'} · {profile.list_count}リスト
          </span>
        </div>}
        <div style={{ flex: 1, overflow: 'auto', padding: space[4] }}>
          {error && <Card style={{ marginBottom: space[3], background: color.dangerSoft }}><div role="alert" style={{ color: color.danger }}>{error}</div>
            <Button variant="outline" size="sm" onClick={() => setAttempt(n => n + 1)}>再読み込み</Button></Card>}
          {loading && <div role="status">企業情報を読み込んでいます…</div>}
          {profile && tab === 'overview' && <>
            <Card style={{ marginBottom: space[3] }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] }}>
                <Badge variant="primary">{profile.crm_stage}</Badge>
                <Badge variant={profile.home_state === 'conflict' ? 'warn' : profile.home_state === 'available' ? 'success' : 'neutral'}>{homeLabels[profile.home_state]}</Badge>
                {profile.needs_review && <Badge variant="warn">名寄せ・情報の確認が必要</Badge>}
                {profile.registry_status === 'closed' && <Badge variant="danger">登記閉鎖確認済み</Badge>}
                <div style={{ marginLeft: 'auto' }}>
                  {!editing && <Button size="sm" variant="outline" iconLeft={<Pencil size={14} />} onClick={() => { setEditing(true); setSaved(false); }}>共有情報を編集</Button>}
                </div>
              </div>
              {saved && <div role="status" style={{ color: color.success, marginBottom: space[3] }}>共有情報を保存しました。紐付いた企業のカルテと住所検索に反映されます。</div>}
              <div style={{ color: color.textMid, fontSize: font.size.sm, marginBottom: space[4] }}>会社情報と共有メモを、企業DB・各架電リストで共有します。リストごとの架電先番号は「出典・名寄せ」で確認できます。</div>
              {editing ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: space[3] }}>
                {['company_name','representative','phone','corporate_number','address','representative_address','industry','business'].map(field => input(field))}
                <Select label="対応状況" aria-label="対応状況" value={form.crm_stage} onChange={e => change('crm_stage', e.target.value)} options={COMPANY_CRM_STAGES.map(value => ({ value, label: value }))} />
                {input('owner_name')}{input('next_action_at', { type: 'datetime-local' })}{input('next_action_note')}
                <Select label="登記の確認状況" aria-label="登記の確認状況" value={form.registry_status} onChange={e => change('registry_status', e.target.value)} options={COMPANY_REGISTRY_STATUSES} />
                {input('registry_source', { hint: '確認済みにする場合は、確認に使った資料やURLを記録してください。' })}
                <label style={{ gridColumn: '1 / -1', fontSize: font.size.sm, color: color.textMid }}>共有メモ
                  <textarea aria-label="共有メモ" rows={5} value={form.shared_memo} onChange={e => change('shared_memo', e.target.value)} style={textAreaStyle} />
                </label>
              </div> : <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: space[4], margin: 0 }}>
                {Object.entries(fieldLabels).map(([key, label]) => <div key={key} style={{ gridColumn: key === 'shared_memo' ? '1 / -1' : undefined }}>
                  <dt style={{ color: color.textMid, fontSize: font.size.xs, marginBottom: space[1] }}>{label}</dt>
                  <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
                    {key === 'registry_status' ? COMPANY_REGISTRY_STATUSES.find(v => v.value === profile[key])?.label : key === 'next_action_at' ? dateText(profile[key]) : profile[key] || '—'}
                  </dd>
                </div>)}
              </dl>}
              {profile.home_source?.label && <div style={{ marginTop: space[4], fontSize: font.size.xs, color: color.textMid }}>
                代表者住所の出典：{profile.home_source.label}{profile.home_source.row ? ` ／ ${profile.home_source.row}行目` : ''}
              </div>}
              {profile.home_state === 'conflict' && <div style={{ marginTop: space[3], color: color.warn, fontSize: font.size.sm }}>同じ代表者の住所に相違があります。「出典・名寄せ」で確認し、正しい住所を共有情報に保存してください。</div>}
              {editing && <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', marginTop: space[4] }}>
                <Button variant="outline" disabled={saving} onClick={() => { setForm(formFor(profile)); setEditing(false); }}>キャンセル</Button>
                <Button loading={saving} onClick={save}>共有情報を保存</Button>
              </div>}
            </Card>
          </>}
          {profile && tab === 'overview' && <CompanyImportedFields companyId={profile.id} />}
          {profile && tab === 'history' && <>
            <Card title="リストをまたぐ架電履歴" style={{ marginBottom: space[3] }}>
              <DataTable ariaLabel="企業の架電履歴" columns={[
                { key: 'called_at', label: '架電日時', width: 165, align: 'right', render: r => dateText(r.called_at) },
                { key: 'list_name', label: '架電リスト', width: 240, align: 'left' },
                { key: 'status', label: '結果', width: 120, align: 'center', render: r => <Badge>{r.status || '—'}</Badge> },
                { key: 'getter_name', label: '担当者', width: 100, align: 'left' },
                { key: 'memo', label: '対応内容', width: 320, align: 'left' },
              ]} rows={data.history} rowKey="id" height={360} emptyMessage="架電履歴はまだありません" />
              {data.history.length < data.history_count && <Button variant="outline" loading={historyBusy} onClick={moreHistory}>続きの履歴を表示（全{data.history_count.toLocaleString()}件）</Button>}
            </Card>
            <Card title="アポイント・商談（直近50件）" style={{ marginBottom: space[3] }}>
              <DataTable ariaLabel="企業のアポイント" columns={[
                { key: 'meeting_date', label: '商談日時', width: 160, align: 'right', render: r => dateText(r.meeting_date || r.appointment_date) },
                { key: 'list_name', label: '架電リスト', width: 240, align: 'left' },
                { key: 'status', label: '状況', width: 110, align: 'center' },
                { key: 'getter_name', label: '担当者', width: 100, align: 'left' },
                { key: 'notes', label: 'メモ', width: 320, align: 'left' },
              ]} rows={data.appointments} rowKey="id" height={220} emptyMessage="紐付いたアポイントはありません" />
              {data.deals.length > 0 && <DataTable ariaLabel="企業の商談" columns={[
                { key: 'prospect_company', label: '商談先', width: 240, align: 'left' }, { key: 'stage', label: '進捗', width: 120, align: 'center' },
                { key: 'deal_value', label: '金額', width: 110, align: 'right', render: r => r.deal_value == null ? '—' : Number(r.deal_value).toLocaleString() },
                { key: 'notes', label: 'メモ', width: 360, align: 'left' },
              ]} rows={data.deals} rowKey="id" height={220} />}
            </Card>
            <Card title="共有情報の更新履歴（直近50件）">
              {data.events.length ? data.events.map(event => <div key={event.id} style={{ borderBottom: `1px solid ${color.borderLight}`, padding: `${space[2]}px 0`, fontSize: font.size.sm, color: color.textDark }}>
                <span style={{ color: color.textMid }}>{dateText(event.created_at)}　</span>
                {event.event_type === 'shared_updated' ? `共有情報を更新：${Object.keys(event.changes.updated || {}).map(k => fieldLabels[k] || k).join('、')}` : event.event_type === 'identity_reviewed' ? `別会社として確認：${event.changes.note}` : event.event_type === 'company_merged' ? `同一企業として統合：${event.changes.note}` : '取込データを更新'}
              </div>) : <div style={{ color: color.textMid }}>共有情報の更新履歴はまだありません。</div>}
            </Card>
          </>}
          {profile && tab === 'sources' && <>
            <CompanyImportedFields companyId={profile.id} showOriginal />
            <Card title={`紐付いた企業データ（${profile.source_count.toLocaleString()}件）`} style={{ marginBottom: space[3] }}>
              <DataTable ariaLabel="企業情報の出典" columns={[
                { key: 'source', label: '出典', width: 240, align: 'left', render: r => !r.item_id ? `企業DB：${r.source_data.source_file || ''}` : `${r.list_name || '架電リスト'}${r.is_archived ? '（アーカイブ）' : ''}` },
                { key: 'company', label: '企業名', width: 200, align: 'left', render: r => r.source_data.company_name },
                { key: 'representative', label: '代表者', width: 100, align: 'left', render: r => r.source_data.representative },
                { key: 'phone', label: '登録電話番号', width: 130, align: 'left', render: r => r.source_data.phone },
                { key: 'address', label: '会社住所', width: 300, align: 'left', render: r => r.source_data.address },
                { key: 'link_reason', label: '紐付けの根拠', width: 240, align: 'left' },
              ]} rows={data.sources} rowKey="id" height={280} />
              {profile.source_count > data.sources.length && <div>先頭{data.sources.length}件を表示しています。</div>}
            </Card>
            <Card title={`住所・法人番号の取込情報（${data.fact_count}件）`} style={{ marginBottom: space[3] }}>
              <DataTable ariaLabel="住所と法人番号の出典" columns={[
                { key: 'field', label: '項目', width: 130, align: 'left', render: r => fieldLabels[r.field] },
                { key: 'value', label: '元の記載', width: 350, align: 'left' },
                { key: 'source', label: '出典', width: 330, align: 'left', render: r => `${r.source.label || '取込データ'}${r.source.row ? ` ／ ${r.source.row}行目` : ''}` },
              ]} rows={data.facts} rowKey="id" height={260} emptyMessage="住所・法人番号の取込情報はありません" />
            </Card>
            {data.reviews.map(review => <Card key={review.id} title={review.reason} style={{ marginBottom: space[3], borderColor: color.warn }}>
              <div style={{ fontSize: font.size.sm, marginBottom: space[3], color: color.textMid }}>識別情報に相違があるため、以下の企業は別々に保持しています。</div>
              <DataTable ariaLabel="名寄せの確認候補" columns={[
                { key: 'company_name', label: '企業名', width: 220, align: 'left', render: r => onSelectCompany && r.id !== profile.id ? <Button variant="ghost" size="sm" onClick={() => onSelectCompany(r.id)}>{r.company_name}</Button> : r.company_name },
                { key: 'representative', label: '代表者', width: 110, align: 'left' }, { key: 'phone', label: '電話番号', width: 130, align: 'left' },
                { key: 'address', label: '住所', width: 270, align: 'left' }, { key: 'corporate_number', label: '法人番号', width: 140, align: 'center' },
              ]} rows={review.companies || []} rowKey="id" height={200} />
              <Input aria-label="名寄せの判断根拠" placeholder="同一企業・別会社と判断した根拠" value={reviewNotes[review.id] || ''} onChange={e => setReviewNotes(prev => ({ ...prev, [review.id]: e.target.value }))} />
              <Button variant="outline" size="sm" loading={saving} disabled={(reviewNotes[review.id] || '').trim().length < 2} onClick={() => resolve(review)} style={{ marginTop: space[2] }}>別会社として確認済みにする</Button>
              <Button size="sm" loading={saving} disabled={(reviewNotes[review.id] || '').trim().length < 2 || (review.companies || []).length < 2}
                onClick={() => resolve(review, true)} style={{ marginTop: space[2], marginLeft: space[2] }}>同一企業としてこのカルテに統合</Button>
            </Card>)}
          </>}
        </div>
      </div>
    </div>
  );
}
