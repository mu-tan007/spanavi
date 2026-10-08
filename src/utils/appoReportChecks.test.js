import { describe, it, expect } from 'vitest';
import { checkAppoReport, parseMeetingDateTime } from './appoReportChecks';

const STD = ['contactName', 'contactTitle', 'getDate', 'appoDate', 'appoTime', 'meeting_format', 'visitLocation', 'salesAmount', 'netIncome', 'phone', 'email', 'hp', 'recordingUrl'];
const ok = {
  contactName: '山田 太郎', contactTitle: '代表取締役', getDate: '2026-10-07', appoDate: '2026-10-20', appoTime: '14:00',
  meeting_format: '対面', visitLocation: '本社', salesAmount: '5億円', netIncome: '3,000万円', phone: '03-1234-5678',
  email: 'yamada@example.co.jp', hp: 'https://www.example.co.jp/', recordingUrl: 'https://x/rec.m4a',
};
const run = (patch, keys = STD) => checkAppoReport({ ...ok, ...patch }, keys, { today: '2026-10-07' });
const errs = r => r.filter(x => x.level === 'error').map(x => x.key);
const warns = r => r.filter(x => x.level === 'warn').map(x => x.key);

describe('アポ取得報告の登録前の検査', () => {
  it('正しく埋まっていれば何も出ない', () => {
    expect(run({})).toEqual([]);
  });
  it('空欄は止める（担当者・役職・日付・時刻・実施形式）', () => {
    expect(errs(run({ contactName: '' }))).toContain('name');
    expect(errs(run({ contactTitle: '' }))).toContain('title');
    expect(errs(run({ appoDate: '' }))).toContain('date');
    expect(errs(run({ appoTime: '' }))).toContain('date');
    expect(errs(run({ meeting_format: '' }))).toContain('format');
  });
  it('「様様」になる名前・仮の名前は止める、名字だけは注意', () => {
    expect(errs(run({ contactName: '山田様' }))).toContain('name');
    expect(errs(run({ contactName: '〇〇' }))).toContain('name');
    expect(warns(run({ contactName: '山田' }))).toContain('name');
  });
  it('過去の面談日・未来のアポ取得日は止め、土日・遠すぎる日・深夜は注意', () => {
    expect(errs(run({ appoDate: '2026-10-01' }))).toContain('date');
    expect(errs(run({ getDate: '2026-10-08' }))).toContain('getDate');
    expect(warns(run({ appoDate: '2026-10-24' }))).toContain('date'); // 土曜
    expect(warns(run({ appoDate: '2027-01-20' }))).toContain('date');
    expect(warns(run({ appoTime: '21:00' }))).toContain('date');
  });
  it('メールの形と綴りを見る・HPとドメインが違えば注意・オンラインなら必須', () => {
    expect(errs(run({ email: 'yamada@example' }))).toContain('email');
    expect(errs(run({ email: 'taro@gmail.con' }))).toContain('email');
    expect(errs(run({ email: 'taro@docomonejp.jp' }))).toContain('email');
    expect(warns(run({ email: 'taro@other.co.jp' }))).toContain('email');
    expect(warns(run({ email: 'taro@gmail.com' }))).not.toContain('email');
    expect(errs(run({ email: '', meeting_format: 'オンライン' }))).toContain('email');
    // 対面はメールも携帯も要らない（2026-10-08 むー様）
    expect(warns(run({ email: '' }))).not.toContain('email');
    expect(errs(run({ email: '' }))).not.toContain('email');
    // オンラインはメールか携帯のどちらかでよい
    expect(errs(run({ email: '090-1234-5678', meeting_format: 'オンライン' }))).not.toContain('email');
    expect(errs(run({ email: '', mobile_phone: '08012345678', meeting_format: 'オンライン' }, [...STD, 'mobile_phone']))).not.toContain('email');
    expect(errs(run({ email: '0544-58-1126', meeting_format: 'オンライン' }))).toContain('email');
  });
  it('金額の単位の重なり・電話番号の桁数・録音なし', () => {
    expect(errs(run({ salesAmount: '5億円円' }))).toContain('money');
    expect(errs(run({ netIncome: '30,000千円千円' }))).toContain('money');
    expect(warns(run({ phone: '03-1234-567' }))).toContain('phone');
    expect(warns(run({ recordingUrl: '' }))).toContain('recording');
  });
  it('テンプレに無い欄は見ない（ブティックス様の書式は日時が1欄）', () => {
    const keys = ['meeting_method', 'meeting_datetime', 'decision_maker_name', 'decision_maker_title', 'email', 'hp'];
    const r = checkAppoReport({ meeting_method: '対面', meeting_datetime: '10/20 14:00', decision_maker_name: '佐藤 一郎', decision_maker_title: '代表', email: 'sato@b.jp', hp: 'https://b.jp' }, keys, { today: '2026-10-07' });
    expect(r).toEqual([]);
    const r2 = checkAppoReport({ meeting_method: '対面', meeting_datetime: '10/20', decision_maker_name: '佐藤 一郎', decision_maker_title: '代表' }, keys, { today: '2026-10-07' });
    expect(errs(r2)).toContain('date');
  });
  it('日時の1欄から日付と時刻を拾う', () => {
    expect(parseMeetingDateTime('2026年10月20日（火）14:00〜', 2026)).toEqual({ date: '2026-10-20', time: '14:00', yearGuessed: false });
    expect(parseMeetingDateTime('10/20 14時', 2026)).toEqual({ date: '2026-10-20', time: '14:00', yearGuessed: true });
  });
  it('年を書かない日付は、過ぎていれば翌年とみなす', () => {
    const r = checkAppoReport({ meeting_method: '対面', meeting_datetime: '1/15 10:00', decision_maker_name: '佐藤 一郎', decision_maker_title: '代表' }, ['meeting_method', 'meeting_datetime', 'decision_maker_name', 'decision_maker_title'], { today: '2026-12-20' });
    expect(errs(r)).not.toContain('date');
  });
});
