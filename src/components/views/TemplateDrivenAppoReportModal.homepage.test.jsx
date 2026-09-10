import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../../lib/supabaseWrite', () => ({
  insertAppointment: vi.fn(), invokeLookupCompanyHomepage: vi.fn(),
  invokeTranscribeAndExtract: vi.fn(), invokeGetZoomRecording: vi.fn(), updateCallListItem: vi.fn(),
  ensureProspectingClient: vi.fn(), createGcalEvent: vi.fn(), fetchZoomUserId: vi.fn(), invokeAppoAiReport: vi.fn(),
}));
vi.mock('../../lib/companyMasterApi', () => ({ fetchCompanyMasterByName: vi.fn() }));
vi.mock('../../lib/dossierApi', () => ({ invokeGenerateCompanyDossier: vi.fn() }));
vi.mock('../../lib/orgContext', () => ({ getOrgId: () => 'test-org' }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/rewardResolver', () => ({ resolveActiveRewardType: vi.fn(), fetchPastDoneCount: vi.fn() }));
import { insertAppointment, invokeLookupCompanyHomepage } from '../../lib/supabaseWrite';
import TemplateDrivenAppoReportModal from './TemplateDrivenAppoReportModal';

const row = { id: 'tokyo-company', company: '白石工務店', representative: '白石悟', address: '東京都昭島市', phone: '042-555-0100' };
const list = { _supaId: 'test-list', appoUnitPrice: 10000 };
const emptyRows = [];
const contactsByClient = {};
const templates = [{
  id: 'report-template', name: '検証報告', scope_level: 'list', list_id: 'test-list',
  body_template: '{{company_name}} HP:{{hpUrl}} メモ:{{notes}}',
  schema: [
    { key: 'hpUrl', label: 'ホームページ', type: 'text', auto_fetch: 'homepage_url', placeholder: 'HP確認用' },
    { key: 'notes', label: 'メモ', type: 'textarea', placeholder: 'メモ確認用' },
  ],
}];
let renderer;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const input = placeholder => renderer.root.findAll(node => node.props.placeholder === placeholder && typeof node.type === 'string')[0];
const button = label => renderer.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.includes(label)));
const props = extra => ({ row, list, templates, members: emptyRows, clientData: emptyRows, rewardMaster: emptyRows, contactsByClient, currentUser: '検証担当', onClose: vi.fn(), onSave: vi.fn(), onDone: vi.fn(), ...extra });
async function mount(extra = {}) { await act(async () => { renderer = create(<TemplateDrivenAppoReportModal {...props(extra)} />); }); }

beforeEach(() => {
  vi.clearAllMocks();
  insertAppointment.mockResolvedValue({ result: null, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.stubGlobal('window', { confirm: vi.fn(() => true) });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); renderer = null; vi.unstubAllGlobals(); });

describe('アポ取得報告のHP照合中の操作と遅延応答', () => {
  it('照合が未完了でもメモ入力と保存を完了し、未確認HPを報告に載せない', async () => {
    const pending = deferred();
    invokeLookupCompanyHomepage.mockReturnValue(pending.promise);
    const onSave = vi.fn();
    await mount({ onSave });
    expect(invokeLookupCompanyHomepage).toHaveBeenCalledWith(expect.objectContaining({ company_name: row.company, address: row.address, representative: row.representative, phone: row.phone }));
    expect(button('取得中').props.disabled).toBe(true);
    expect(input('メモ確認用').props.disabled).not.toBe(true);
    await act(async () => { input('メモ確認用').props.onChange({ target: { value: '面談内容を入力済み' } }); });
    const saveButton = button('保存');
    expect(saveButton.props.disabled).not.toBe(true);
    await act(async () => { await saveButton.props.onClick(); });
    expect(insertAppointment).toHaveBeenCalledWith(expect.objectContaining({
      reportData: expect.objectContaining({ hpUrl: '', notes: '面談内容を入力済み' }),
      appoReport: expect.stringContaining('面談内容を入力済み'),
    }));
    expect(onSave).toHaveBeenCalled();
  });

  it('照合中に入力したHPを遅れて届く自動取得で上書きしない', async () => {
    const pending = deferred();
    invokeLookupCompanyHomepage.mockReturnValue(pending.promise);
    await mount();
    await act(async () => { input('HP確認用').props.onChange({ target: { value: 'https://manual.example/' } }); });
    await act(async () => { pending.resolve({ url: 'https://automatic.example/', verified: true, confidence: 'high' }); });
    expect(input('HP確認用').props.value).toBe('https://manual.example/');
  });

  it('照合中にHPを入力してから消した場合も空欄にする意思を維持する', async () => {
    const pending = deferred();
    invokeLookupCompanyHomepage.mockReturnValue(pending.promise);
    await mount();
    await act(async () => { input('HP確認用').props.onChange({ target: { value: 'https://discarded.example/' } }); });
    await act(async () => { input('HP確認用').props.onChange({ target: { value: '' } }); });
    await act(async () => { pending.resolve({ url: 'https://automatic.example/' }); });
    expect(input('HP確認用').props.value).toBe('');
  });

  it('手動HP取得を待つ間に修正したHPも上書きしない', async () => {
    const pending = deferred();
    invokeLookupCompanyHomepage.mockResolvedValueOnce({ url: null }).mockReturnValueOnce(pending.promise);
    await mount();
    await act(async () => { button('HP取得').props.onClick(); });
    await act(async () => { input('HP確認用').props.onChange({ target: { value: 'https://manual.example/' } }); });
    await act(async () => { pending.resolve({ url: 'https://automatic.example/' }); });
    expect(input('HP確認用').props.value).toBe('https://manual.example/');
  });

  it('同名の別会社へ切り替えた後に届いた旧会社のURLを入力しない', async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    invokeLookupCompanyHomepage.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    await mount();
    const nextRow = { ...row, id: 'ehime-company', address: '愛媛県新居浜市', representative: '白石誠一', phone: '0897-00-0000' };
    await act(async () => { renderer.update(<TemplateDrivenAppoReportModal {...props({ row: nextRow })} />); });
    await act(async () => { oldRequest.resolve({ url: 'https://tokyo.example/' }); });
    expect(input('HP確認用').props.value).toBe('');
    await act(async () => { newRequest.resolve({ url: 'https://ehime.example/' }); });
    expect(input('HP確認用').props.value).toBe('https://ehime.example/');
    expect(invokeLookupCompanyHomepage).toHaveBeenCalledTimes(2);
  });

  it('取得済みHPも会社を切り替えたら消して新しい会社を確認する', async () => {
    invokeLookupCompanyHomepage.mockResolvedValueOnce({ url: 'https://tokyo.example/' }).mockReturnValueOnce(deferred().promise);
    await mount();
    expect(input('HP確認用').props.value).toBe('https://tokyo.example/');
    await act(async () => { renderer.update(<TemplateDrivenAppoReportModal {...props({ row: { ...row, id: 'another-company' } })} />); });
    expect(input('HP確認用').props.value).toBe('');
    expect(invokeLookupCompanyHomepage).toHaveBeenCalledTimes(2);
  });
});
