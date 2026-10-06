import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { color, space, font, radius } from '../../../constants/design';
import { Button } from '../../ui';
import { supabase } from '../../../lib/supabase';
import {
  priceRange, priceBasisLabel, schemeLabel, channelLabel, yen, fmtDate, DEFENSE_RELATIONS,
} from './acqConstants';
import { InfoRows, SubTabs, LinkText, ErrorNote, ConfirmDialog } from './AcqShared';
import AcqDealFormModal from './AcqDealFormModal';
import AcqDocuments from './AcqDocuments';
import AcqFinancials from './AcqFinancials';
import AcqDealProgress from './AcqDealProgress';
import AcqTimeline from './AcqTimeline';
import { useActivities, ActivityFormModal } from './AcqActivities';

// 買収 > 案件のページ（Phalanx の企業情報ページの作りにそろえる）
//   上から：一覧へ戻る → ヘッダー（企業名・紹介元・数字）→ 進捗 → 2列（左：概要／書類／財務のタブ、右：活動履歴）
//   右の活動履歴は幅400pxで画面に貼り付け、中だけスクロール。幅が狭いときは1列にする
const card = { background: color.white, border: `1px solid ${color.borderLight}`, borderRadius: radius.xl, padding: `${space[3]}px ${space[4]}px` };

function Figure({ label, value, sub }) {
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{ fontSize: 10.5, color: color.textLight }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: font.weight.semibold, color: color.navy, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: color.textLight, whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  );
}

export default function AcqDealDetail({ dealId, data, onBack, onOpenFirm, onOpenContact }) {
  const { firms, contacts, deals, reload: reloadAll } = data;
  const [deal, setDeal] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const acts = useActivities({ dealId });
  const wrapRef = useRef(null);
  const [wide, setWide] = useState(true);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width > 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, [deal]);

  const load = useCallback(async () => {
    const [d, e] = await Promise.all([
      supabase.from('acq_deal_list').select('*').eq('id', dealId).maybeSingle(),
      supabase.from('acq_deal_stage_events').select('*').eq('deal_id', dealId).order('occurred_on').order('seq'),
    ]);
    if (d.error || e.error) { setError(d.error || e.error); return; }
    setDeal(d.data); setEvents(e.data || []);
  }, [dealId]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await Promise.all([load(), reloadAll(), acts.reload()]); };

  const removeDeal = async () => {
    setBusy(true);
    try {
      const { data: docs } = await supabase.from('acq_documents').select('storage_path').eq('deal_id', dealId);
      if (docs?.length) {
        const { error: e1 } = await supabase.storage.from('acq-docs').remove(docs.map(x => x.storage_path));
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase.from('acq_deals').delete().eq('id', dealId);
      if (e2) throw e2;
      await reloadAll();
      onBack();
    } catch (e) {
      setError(e); setDeleting(false);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div><Button variant="outline" size="sm" onClick={onBack}>← 一覧へ戻る</Button><div style={{ marginTop: space[3] }}><ErrorNote error={error} /></div></div>;
  if (!deal) return <div style={{ color: color.textLight }}>読み込み中…</div>;

  const title = deal.im_disclosed ? (deal.name || '企業名が未入力（IM開示後）') : deal.project_name;
  const ebitda = deal.ebitda_ours ?? deal.ebitda_im;

  const overview = (
    <div style={card}>
      <InfoRows rows={[
        ['企業名', deal.name || (deal.im_disclosed ? '未入力（IMの商号を入れてください）' : '（IM開示前）')],
        ['ノンネームの名称', deal.project_name],
        ['PJ名・呼び名', deal.pj_code],
        ['業種・地域', [deal.industry, deal.region].filter(Boolean).join('・') || '—'],
        ['紹介元', deal.source_firm_id ? <LinkText onClick={() => onOpenFirm(deal.source_firm_id)}>{deal.source_firm_name}</LinkText> : '—'],
        ['担当者', deal.source_contact_id ? <LinkText onClick={() => onOpenContact(deal.source_contact_id)}>{deal.source_contact_name}様</LinkText> : '—'],
        ['売り手側FA', deal.sell_side_firm_id ? <LinkText onClick={() => onOpenFirm(deal.sell_side_firm_id)}>{deal.sell_side_firm_name}</LinkText> : '—'],
        ['入口', channelLabel(deal.channel)],
        ['受領日', fmtDate(deal.received_on)],
        ['スキーム', schemeLabel(deal.scheme)],
        ['希望価格の原文', deal.asking_price_text],
        ['次の期限', deal.next_deadline_on ? `${fmtDate(deal.next_deadline_on)} ${deal.next_deadline_label || ''}` : (deal.next_deadline_label || '—')],
        ['防衛関連の領域', deal.scope_domain],
        ['防衛との関わり', DEFENSE_RELATIONS.find(x => x.value === deal.defense_relation)?.label || '—'],
        ['法人番号', deal.corporate_number],
        ['案件フォルダ', deal.folder_path],
        ['概要', deal.summary],
        ['結果・理由', deal.closed_reason],
      ]} />
      <div style={{ marginTop: space[4], display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>この案件を削除</Button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: space[2] }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← 一覧へ戻る</Button>
      </div>

      {/* ヘッダー：企業名・紹介元・数字 */}
      <div style={{ ...card, marginBottom: space[3], display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[4] }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: 19, fontWeight: font.weight.bold, color: deal.im_disclosed && !deal.name ? color.danger : color.textDark }}>{title}</span>
            <span style={{ fontSize: 12, color: color.textLight }}>{deal.im_disclosed ? 'IM開示後' : 'IM開示前（ノンネーム）'}</span>
            {deal.pj_code && <span style={{ fontSize: 12, color: color.textLight }}>・{deal.pj_code}</span>}
          </div>
          <div style={{ fontSize: 12, color: color.textMid, marginTop: 2, display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <span>{[deal.industry, deal.region].filter(Boolean).join('・')}</span>
            {deal.source_firm_id && (
              <span style={{ padding: '1px 8px', borderRadius: radius.pill, background: color.navy, color: color.white, fontSize: 11 }}>
                {deal.source_firm_name}{deal.source_contact_name ? `・${deal.source_contact_name}様` : ''}
              </span>
            )}
            <span style={{ color: color.textLight }}>受領 {fmtDate(deal.received_on)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap' }}>
          <Figure label="希望価格" value={priceRange(deal.asking_price_min, deal.asking_price_max)}
            sub={deal.asking_price_min != null || deal.asking_price_max != null ? priceBasisLabel(deal.asking_price_basis) : null} />
          <Figure label="倍率" value={deal.multiple != null ? `${deal.multiple}倍` : '—'} />
          <Figure label="修正EBITDA" value={yen(ebitda)} sub={deal.ebitda_ours != null ? '弊社修正' : (deal.ebitda_im != null ? 'IMの値' : null)} />
          <Figure label="売上" value={yen(deal.revenue)} />
          <Figure label="ネットキャッシュ" value={yen(deal.net_cash)} />
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>編集</Button>
          <Button variant="outline" size="sm" onClick={() => setRecording(true)}>やり取りを記録</Button>
        </div>
      </div>

      {/* 進捗 */}
      <AcqDealProgress dealId={dealId} deal={deal} events={events} onChanged={refresh} />

      {/* 2列：左はタブ、右は活動履歴 */}
      <div ref={wrapRef} style={{ display: 'grid', gridTemplateColumns: wide ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr)', gap: space[3], alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ height: 32 }}>
            <SubTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'overview', label: '概要' },
                { value: 'docs', label: '書類', count: deal.doc_count ?? 0 },
                { value: 'financials', label: '財務' },
              ]}
            />
          </div>
          <div style={{ marginTop: space[2] }}>
            {tab === 'overview' && overview}
            {tab === 'docs' && <div style={card}><AcqDocuments dealId={dealId} onChanged={refresh} /></div>}
            {tab === 'financials' && <div style={card}><AcqFinancials dealId={dealId} onChanged={refresh} /></div>}
          </div>
        </div>
        <div style={wide ? { position: 'sticky', top: space[4] } : undefined}>
          <div style={{ height: 32, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: font.weight.semibold, color: color.navy }}>
            活動履歴
          </div>
          <div style={{ ...card, marginTop: space[2], maxHeight: wide ? 'calc(100vh - 300px)' : undefined, overflowY: wide ? 'auto' : undefined }}>
            <AcqTimeline dealId={dealId} acts={acts} events={events} onOpenContact={onOpenContact} onChanged={refresh} />
          </div>
        </div>
      </div>

      {editing && (
        <AcqDealFormModal
          deal={deal}
          firms={firms}
          contacts={contacts}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await refresh(); }}
        />
      )}
      {recording && (
        <ActivityFormModal
          contacts={contacts}
          deals={deals}
          defaults={{ dealId, contactId: deal.source_contact_id }}
          onClose={() => setRecording(false)}
          onSaved={async () => { setRecording(false); await refresh(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`案件「${title}」を削除`}
          sub="書類・やり取りのひも付け・段階の履歴・財務もまとめて消え、元に戻せません"
          okLabel="削除する"
          danger
          busy={busy}
          onOk={removeDeal}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
