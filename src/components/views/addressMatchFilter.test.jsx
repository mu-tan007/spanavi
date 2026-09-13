import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/supabaseWrite', () => ({
  fetchCallListItems: vi.fn(), fetchCallFlowRecords: vi.fn(), fetchCallListFilterSummary: vi.fn(),
  fetchCallListItemById: vi.fn(), fetchCallRecordsByItem: vi.fn(), fetchSetting: vi.fn(),
  insertCallRecord: vi.fn(), findRecentApoCallRecord: vi.fn(), updateCallRecordFields: vi.fn(),
  updateCallListItem: vi.fn(), unlinkIncomingCallsByCallerNumber: vi.fn(),
  insertCallSession: vi.fn(async () => ({})), updateCallSession: vi.fn(async () => null),
  updateCallRecordRecordingUrl: vi.fn(), updateAppoReportRecordingUrl: vi.fn(), invokeGetZoomRecording: vi.fn(),
  closeOpenCallSessionsForList: vi.fn(async () => null), deleteCallRecord: vi.fn(), invokeGenerateCompanyInfo: vi.fn(),
  insertAppointment: vi.fn(), updateClientContact: vi.fn(), completeRecallsForItem: vi.fn(),
  getCompanyOverviewPdfSignedUrl: vi.fn(), updateCallListCautions: vi.fn(), insertBuyerNeedsHearing: vi.fn(),
  deleteCallRecordsByListId: vi.fn(), deleteCallListItemsByListId: vi.fn(), updateCallListCount: vi.fn(), insertCallListItems: vi.fn(),
}));
vi.mock('../../lib/zoomPhoneStore', () => ({ zoomPhone: {} }));
vi.mock('../../utils/phone', () => ({ dialPhone: vi.fn() }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../../hooks/useCallStatuses', () => ({ useCallStatuses: () => ({
  statuses: [], shortcuts: [], keymanConnectLabels: [], excludedIds: [], getStatusColor: () => ({}),
}) }));
vi.mock('./CallHistoryPanel', () => ({ default: () => null }));
vi.mock('./RecallModal', () => ({ default: () => null }));
vi.mock('./AppoReportModal', () => ({ default: () => null }));
vi.mock('../common/InlineAudioPlayer', () => ({ InlineAudioPlayer: () => null }));
vi.mock('../common/ClientCalendarPanel', () => ({ default: () => null }));
vi.mock('../common/MultiCalendarPanel', () => ({ default: () => null }));
vi.mock('../common/QuickAppoModal', () => ({ default: () => null }));
vi.mock('../common/ScriptBody', () => ({ default: () => null }));
vi.mock('../common/ScriptTreeGuide', () => ({ default: () => null }));

import DetailModal from './DetailModal';
import CallFlowView from './CallFlowView';
import { fetchCallListItems, fetchCallFlowRecords, fetchCallListFilterSummary, fetchSetting, insertCallSession } from '../../lib/supabaseWrite';
import { getCompanyAddressMatch } from '../../utils/companyAddressMatch';
import { dialPhone } from '../../utils/phone';

const list = { id: 'address-test', _supaId: 'address-test', company: '検証リスト', industry: '全業種', count: 4, recommendation: {} };
const address = '東京都千代田区丸の内1-2-3';
const rows = [
  { id: 'a', no: 1, company: '一致企業', address, revenue: 200000, memo: JSON.stringify({ '代表者現住所': address }), phone: '' },
  { id: 'b', no: 2, company: '不一致企業', address, revenue: 200000, memo: JSON.stringify({ '代表者住所詳細': '東京都千代田区丸の内1-2-4' }), phone: '' },
  { id: 'c', no: 3, company: '住所なし企業', address, revenue: 200000, memo: null, phone: '' },
  { id: 'd', no: 4, company: '一致低売上企業', address, revenue: 50000, memo: JSON.stringify({ '代表者現住所': address }), phone: '' },
];
let renderer;
const select = () => renderer.root.findAllByType('select').find(node => node.props['aria-label'] === '会社住所と代表者自宅住所');
const button = text => renderer.root.findAllByType('button').find(node => node.children.includes(text));
const companies = () => renderer.root.findAllByType('td').map(node => node.children[0]).filter(text => rows.some(row => row.company === text));
async function mountFlow(extra = {}) {
  await act(async () => { renderer = create(<MemoryRouter><CallFlowView list={list} onClose={vi.fn()} {...extra} /></MemoryRouter>); });
}
beforeEach(() => {
  vi.clearAllMocks();
  fetchCallListItems.mockImplementation(async (_, opts = {}) => ({ data: rows.filter(row =>
    (!opts.addressMatch || getCompanyAddressMatch(row) === opts.addressMatch)
    && (opts.startNo == null || row.no >= opts.startNo) && (opts.endNo == null || row.no <= opts.endNo)
  ) }));
  fetchCallFlowRecords.mockResolvedValue({ data: [] });
  fetchCallListFilterSummary.mockResolvedValue({ data: { count: 4, prefectures: ['東京都'] } });
  fetchSetting.mockResolvedValue({ value: null });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); renderer = null; vi.unstubAllGlobals(); });

describe('住所照合条件を詳細モーダルから架電対象まで維持', () => {
  it('詳細モーダルの全件・番号範囲の両経路で条件を渡す', async () => {
    const open = vi.fn();
    await act(async () => { renderer = create(<DetailModal list={list} onClose={vi.fn()} industryRules={[]} now={new Date()} callListData={[list]} setCallFlowScreen={open} />); });
    await act(async () => { select().props.onChange({ target: { value: 'different' } }); });
    act(() => button('全件').props.onClick());
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ addressMatchFilter: 'different', startNo: null, endNo: null }));
    for (const [placeholder, value] of [['開始', '1'], ['終了', '3']]) {
      await act(async () => { renderer.root.findAllByType('input').find(node => node.props.placeholder === placeholder).props.onChange({ target: { value } }); });
    }
    act(() => button('検索').props.onClick());
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ addressMatchFilter: 'different', startNo: 1, endNo: 3 }));
    expect(fetchCallListItems).not.toHaveBeenCalled();
    expect(fetchCallListFilterSummary).toHaveBeenCalledWith(list._supaId);
  });

  it('一致条件を売上・ステータス条件とANDで適用し、一覧から変更・解除できる', async () => {
    const changed = vi.fn();
    await mountFlow({ initialAddressMatchFilter: 'same', initialRevenueMin: 100000, statusFilter: ['未架電'], onAddressMatchFilterChange: changed });
    expect(companies()).toEqual(['一致企業']);
    expect(fetchCallListItems).toHaveBeenCalledWith(list._supaId, expect.objectContaining({ addressMatch: 'same' }));
    expect(fetchCallFlowRecords).toHaveBeenCalledWith(list._supaId, expect.objectContaining({ addressMatch: 'same' }));
    await act(async () => { select().props.onChange({ target: { value: 'different' } }); });
    expect(companies()).toEqual(['不一致企業']);
    expect(changed).toHaveBeenLastCalledWith('different');
    await act(async () => { select().props.onChange({ target: { value: 'unknown' } }); });
    expect(companies()).toEqual(['住所なし企業']);
    await act(async () => { select().props.onChange({ target: { value: '' } }); });
    expect(companies()).toEqual(['一致企業', '不一致企業', '住所なし企業']);
    expect(changed).toHaveBeenLastCalledWith('');
    expect(insertCallSession).not.toHaveBeenCalled();
    expect(dialPhone).not.toHaveBeenCalled();
  });

  it('番号範囲と一致条件を組み合わせ、該当企業がなければ架電開始を無効にする', async () => {
    await mountFlow({ startNo: 2, endNo: 3, initialAddressMatchFilter: 'same' });
    expect(companies()).toEqual([]);
    expect(button('架電開始').props.disabled).toBe(true);
  });

  it('架電開始後に選ばれる企業も住所条件を満たす（発信はモック）', async () => {
    await mountFlow({ initialAddressMatchFilter: 'different' });
    await act(async () => { button('架電開始').props.onClick(); });
    expect(renderer.root.findAllByType('td').some(node => node.children.includes('一致企業'))).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain('不一致企業');
    expect(dialPhone).not.toHaveBeenCalled();
  });

  it('履歴待ち・取得失敗中は架電開始できず、不完全な結果を表示しない', async () => {
    let finish;
    fetchCallFlowRecords.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await mountFlow({ initialAddressMatchFilter: 'same' });
    expect(button('架電開始').props.disabled).toBe(true);
    expect(companies()).toEqual([]);
    await act(async () => { finish({ data: [], error: { message: 'timeout' } }); });
    expect(button('架電開始').props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain('企業一覧を取得できませんでした');
    await act(async () => { button('再読み込み').props.onClick(); });
    expect(companies()).toEqual(['一致企業', '一致低売上企業']);
    expect(button('架電開始').props.disabled).toBe(false);
  });

  it('条件を素早く変更しても遅れて到着した古い検索結果で上書きしない', async () => {
    let finishOld;
    fetchCallListItems.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    await mountFlow({ initialAddressMatchFilter: 'same' });
    await act(async () => { select().props.onChange({ target: { value: 'different' } }); });
    expect(companies()).toEqual(['不一致企業']);
    await act(async () => { finishOld({ data: [rows[0], rows[3]] }); });
    expect(companies()).toEqual(['不一致企業']);
    expect(fetchCallListItems.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
