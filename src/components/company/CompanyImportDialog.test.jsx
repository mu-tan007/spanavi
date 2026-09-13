import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../../lib/companyImportApi', () => ({ fetchCompanyImportConfig: vi.fn(), saveCompanyImportField: vi.fn(), saveCompanyImportTemplate: vi.fn(),
  companyImportFingerprint: vi.fn(), executeCompanyImport: vi.fn(), fetchCompanyImportJob: vi.fn() }));
import { fetchCompanyImportConfig, saveCompanyImportTemplate, companyImportFingerprint, executeCompanyImport, fetchCompanyImportJob } from '../../lib/companyImportApi';
import { STANDARD_COMPANY_FIELDS } from '../../utils/companyImportFields';
import CompanyImportDialog from './CompanyImportDialog';

let renderer;
const button = text => renderer.root.findAllByType('button').find(node => node.children.includes(text));
const control = label => renderer.root.findAll(node => typeof node.type === 'string' && node.props['aria-label'] === label)[0];
const file = { name: '検証.csv', text: async () => '企業名,企業コード,売上高,未対応列\n検証社,00001,12,元の値' };
const result = { id: 'job', processed: 1, total: 1, saved: 1, rejected: 0, list_id: 'list', first_no: 9, last_no: 9, totalCount: 9 };
beforeEach(() => {
  vi.clearAllMocks();
  fetchCompanyImportConfig.mockResolvedValue({ fields: STANDARD_COMPANY_FIELDS, templates: [], jobs: [], can_manage: true });
  companyImportFingerprint.mockResolvedValue('fingerprint'); executeCompanyImport.mockResolvedValue(result);
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); renderer = null; });
const mount = async props => { await act(async () => { renderer = create(<CompanyImportDialog initialFile={file} listId="list" onClose={vi.fn()} {...props} />); }); };

describe('両入口で使う企業取込画面', () => {
  it('不明な金額単位を確認するまで登録せず、TDBの設定と元の全列を送る', async () => {
    const onDone = vi.fn(); await mount({ onDone });
    expect(button('取り込む').props.disabled).toBe(true);
    await act(async () => { control('取込データの出所').props.onChange({ target: { value: 'tdb' } }); });
    expect(control('2列目の取込先').props.value).toBe('tdb_code');
    expect(control('3列目の金額単位').props.value).toBe('百万円');
    await act(async () => { button('この単位で確認').props.onClick(); });
    expect(button('取り込む').props.disabled).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain('12000');
    await act(async () => { button('取り込む').props.onClick(); });
    expect(executeCompanyImport).toHaveBeenCalledWith(expect.objectContaining({ listId: 'list', fingerprint: 'fingerprint',
      metadata: expect.objectContaining({ provider: 'tdb', headers: ['企業名','企業コード','売上高','未対応列'] }),
      rows: [{ row_no: 1, source_row: 2, values: ['検証社','00001','12','元の値'] }] }));
    expect(onDone).toHaveBeenCalledWith(result);
    await act(async () => { button('別のファイルを取り込む').props.onClick(); });
    expect(control('取り込むCSVまたはExcel').props.disabled).toBe(false);
  });
  it('列の対応の保存だけでは企業を登録せず、企業の値をテンプレートに入れない', async () => {
    saveCompanyImportTemplate.mockResolvedValue({ id: 'template' }); await mount();
    await act(async () => { button('この単位で確認').props.onClick(); });
    await act(async () => { control('取込設定名').props.onChange({ target: { value: '提供会社の形式' } }); });
    await act(async () => { button('列の対応を保存').props.onClick(); });
    expect(executeCompanyImport).not.toHaveBeenCalled();
    expect(JSON.stringify(saveCompanyImportTemplate.mock.calls[0])).not.toContain('元の値');
    expect(saveCompanyImportTemplate.mock.calls[0][0].settings.columns[0]).toEqual({ header: '企業名', occurrence: 0, rule: { key: 'company_name' } });
  });
  it('過去の中断結果を見ても新しい取込の設定や再開状態に混ぜない', async () => {
    fetchCompanyImportConfig.mockResolvedValue({ fields: STANDARD_COMPANY_FIELDS, templates: [], jobs: [{ id: 'old', file_name: '過去.csv', processed: 25, total: 100, saved: 25 }], can_manage: true });
    fetchCompanyImportJob.mockResolvedValue({ id: 'old', processed: 25, total: 100, saved: 25 });
    await mount(); await act(async () => { button('取込履歴').props.onClick(); });
    await act(async () => { button('結果を確認').props.onClick(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('中断した取込');
    await act(async () => { button('ファイル取込').props.onClick(); });
    expect(control('取り込むCSVまたはExcel').props.disabled).toBe(false);
    expect(button('取込を再開')).toBeUndefined();
  });
  it('登録後の一覧更新だけが失敗しても取込を失敗扱いにせず結果を残す', async () => {
    await mount({ onDone: async () => { throw new Error('refresh failed'); } });
    await act(async () => { button('この単位で確認').props.onClick(); });
    await act(async () => { button('取り込む').props.onClick(); });
    const view = JSON.stringify(renderer.toJSON());
    expect(view).toContain('取込は完了しました'); expect(view).toContain('企業DBへの登録を確認しました');
    expect(button('取り込む')).toBeUndefined();
  });
});
