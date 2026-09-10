import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createCallActionGuard } from '../../lib/callActionGuard';
const source = readFileSync(new URL('./CallFlowView.jsx', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  const handleResult ='), source.indexOf('  const handleDeleteRecord ='));
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(extra = {}) {
  const row = { id: 'current', no: 1, phone: '0300000000' }, next = { id: 'next', phone: '0300000001' };
  const c = {
    callActionGuard: { current: createCallActionGuard() }, zoomPhone: { hangUp: vi.fn() },
    selectedRow: row, selectedRound: 1, callRecords: [], lastDialedPhone: '', localMemo: '', currentUser: 'fixture',
    list: { _supaId: 'list' }, items: [row,next], sorted: [row,next],
    setAppoModal: vi.fn(), setRecallModal: vi.fn(), insertCallRecord: vi.fn(),
    AI_EXCLUDE_REASON: 'AI', EXCLUDED_STATUSES: new Set(), RECALL_STATUSES: new Set(),
    updateCallListItem: vi.fn(async () => null), completeRecallsForItem: vi.fn(async () => null),
    setItems: vi.fn(), setCallRecords: vi.fn(), _updateSessionProgress: vi.fn(),
    singleItemMode: false, onResultSubmit: vi.fn(), onClose: vi.fn(), setSelectedRow: vi.fn(),
    autoDial: true, dialPhone: vi.fn(), fetchRecordingUrl: vi.fn(async () => null),
    updateCallRecordRecordingUrl: vi.fn(), uploadRecordingToStorage: vi.fn(), setTimeout: vi.fn(),
    console: { log() {}, warn() {}, error() {} }, ...extra,
  };
  c.run = new Function(...Object.keys(c), code + '; return handleResult;')(...Object.values(c));
  return c;
}
const result = { result: { id: 'record', item_id: 'current', status: '不在', round: 1 } };
describe('result save guard preserving existing call flow', () => {
  it('keeps automatic next dialing after save, but suppresses a second in-flight result', async () => {
    const c = fixture(), save = pending(); c.insertCallRecord.mockReturnValue(save.promise);
    const task = c.run('不在'); await c.run('除外');
    expect(c.insertCallRecord).toHaveBeenCalledTimes(1);
    expect(c.zoomPhone.hangUp).toHaveBeenCalledTimes(1);
    expect(c.dialPhone).not.toHaveBeenCalled(); expect(c.setSelectedRow).not.toHaveBeenCalled();
    save.resolve(result); await task;
    expect(c.dialPhone).toHaveBeenCalledExactlyOnceWith('0300000001');
    expect(c.setSelectedRow).toHaveBeenCalledTimes(1);
  });
  it('keeps auto OFF: next selection still advances, but does not dial', async () => {
    const c=fixture({ autoDial:false }); c.insertCallRecord.mockResolvedValue(result); await c.run('不在');
    expect(c.setSelectedRow).toHaveBeenCalledTimes(1); expect(c.dialPhone).not.toHaveBeenCalled();
  });
  it('does not advance on failed saving and permits retry', async () => {
    const c=fixture(); c.insertCallRecord.mockResolvedValue({error:{message:'network'}});
    await c.run('不在'); await c.run('不在');
    expect(c.insertCallRecord).toHaveBeenCalledTimes(2);
    expect(c.setSelectedRow).not.toHaveBeenCalled(); expect(c.dialPhone).not.toHaveBeenCalled();
  });
  it('keeps queue forwarding exactly once during a pending save', async () => {
    const c=fixture({singleItemMode:true}), save=pending(); c.insertCallRecord.mockReturnValue(save.promise);
    const task=c.run('不在'); await c.run('不在'); save.resolve(result); await task;
    expect(c.onResultSubmit).toHaveBeenCalledExactlyOnceWith('不在'); expect(c.dialPhone).not.toHaveBeenCalled();
  });
  it('preserves persisted auto-call ON and queue auto-start, without placing a real call', () => {
    const pref=source.slice(source.indexOf('  const [autoDial, setAutoDial]'),source.indexOf('  const [listMode'));
    const effect=source.slice(source.indexOf('  const _autoDialFiredRef ='),source.indexOf('  // PiP: isMinimized'));
    const mount=new Function('useState','useRef','useEffect','localStorage','autoDialOnLoad','selectedRow','defaultItemId','dialPhone','setLastDialedPhone',pref+effect);
    for(const enabled of [true,false]) {
      const dial=vi.fn();
      mount(init=>[init(),vi.fn()],value=>({current:value}),fn=>fn(),{getItem:()=>String(enabled)},true,{id:'next',phone:'0300000001'},'next',dial,vi.fn());
      expect(dial).toHaveBeenCalledTimes(enabled?1:0);
    }
  });
});
