import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/companyProfileApi', () => ({ fetchCompanyProfile: vi.fn(), saveCompanyProfile: vi.fn(), resolveCompanyReview: vi.fn(), mergeCompanyReview: vi.fn() }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
import { fetchCompanyProfile, saveCompanyProfile } from '../../lib/companyProfileApi';
import CompanyProfileDialog from './CompanyProfileDialog';

const response = (name = '企業A', id = 'a') => ({ profile: { id, company_name: name, representative: '代表者甲', phone: '', address: '',
  corporate_number: null, representative_address: null, home_state: 'unknown', home_source: {}, crm_stage: '未設定', registry_status: 'unknown',
  source_count: 2, master_count: 1, list_count: 1, shared_memo: '', version: 7 }, sources: [], facts: [], fact_count: 0,
  history_count: 0, history: [], appointments: [], deals: [], events: [], reviews: [] });
let renderer;
const button = text => renderer.root.findAllByType('button').find(node => node.children.includes(text));
beforeEach(() => { vi.clearAllMocks(); fetchCompanyProfile.mockResolvedValue(response()); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); renderer = null; });

describe('企業カルテの共有編集', () => {
  it('変更した項目だけを企業ID・表示時のバージョンと一緒に保存する', async () => {
    const changed = vi.fn();
    await act(async () => { renderer = create(<CompanyProfileDialog target={{ itemId: 'list-a-item' }} onClose={vi.fn()} onChanged={changed} />); });
    await act(async () => { button('共有情報を編集').props.onClick(); });
    await act(async () => { renderer.root.findByType('textarea').props.onChange({ target: { value: '次回は午後に連絡' } }); });
    saveCompanyProfile.mockResolvedValue({ ...response(), profile: { ...response().profile, shared_memo: '次回は午後に連絡', version: 8 } });
    await act(async () => { button('共有情報を保存').props.onClick(); });
    expect(saveCompanyProfile).toHaveBeenCalledWith('a', 7, { shared_memo: '次回は午後に連絡' });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ version: 8, shared_memo: '次回は午後に連絡' }));
  });
  it('企業を切り替えたあとに届いた古い応答を表示しない', async () => {
    let finishA;
    fetchCompanyProfile.mockImplementation(target => target.companyId === 'a' ? new Promise(resolve => { finishA = resolve; }) : Promise.resolve(response('企業B','b')));
    await act(async () => { renderer = create(<CompanyProfileDialog target={{ companyId: 'a' }} onClose={vi.fn()} />); });
    await act(async () => { renderer.update(<CompanyProfileDialog target={{ companyId: 'b' }} onClose={vi.fn()} />); });
    await act(async () => { finishA(response()); });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('企業B'); expect(rendered).not.toContain('企業A');
  });
  it('同時更新のエラー時は入力を残し、再読み込みの選択を示す', async () => {
    await act(async () => { renderer = create(<CompanyProfileDialog target={{ companyId: 'a' }} onClose={vi.fn()} />); });
    await act(async () => { button('共有情報を編集').props.onClick(); });
    await act(async () => { renderer.root.findByType('textarea').props.onChange({ target: { value: '入力を保持' } }); });
    saveCompanyProfile.mockRejectedValue(new Error('企業情報が更新されました。再読込してから保存してください'));
    await act(async () => { button('共有情報を保存').props.onClick(); });
    expect(renderer.root.findByType('textarea').props.value).toBe('入力を保持'); expect(button('再読み込み')).toBeDefined();
  });
  it('Enterキーを背後の架電ショートカットに渡さない', async () => {
    await act(async () => { renderer = create(<CompanyProfileDialog target={{ companyId: 'a' }} onClose={vi.fn()} />); });
    const stop = vi.fn();
    renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown({ key: 'Enter', stopPropagation: stop });
    expect(stop).toHaveBeenCalledOnce();
  });
});
