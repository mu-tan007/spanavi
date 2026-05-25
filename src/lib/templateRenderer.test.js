import { describe, it, expect } from 'vitest';
import { renderBody } from './templateRenderer';

describe('renderBody', () => {
  const schema = [
    { key: 'company_name', type: 'text' },
    { key: 'getDate',  type: 'date' },
    { key: 'appoDate', type: 'date' },
    { key: 'appoTime', type: 'text' },
    { key: 'recordingUrl', type: 'text' },
  ];

  it('replaces simple {{key}} placeholders', () => {
    const tpl = '会社：{{company_name}}';
    const out = renderBody(tpl, { company_name: 'パソコンレスキュー' }, schema);
    expect(out).toBe('会社：パソコンレスキュー');
  });

  it('renders type=date fields with Japanese weekday', () => {
    const tpl = 'アポ取得日：{{getDate}}\n面談日：{{appoDate}}';
    const out = renderBody(tpl, { getDate: '2026-05-25', appoDate: '2026-06-01' }, schema);
    expect(out).toBe('アポ取得日：2026-05-25（月）\n面談日：2026-06-01（月）');
  });

  it('does not append weekday for non-date fields', () => {
    const out = renderBody('{{appoTime}}', { appoTime: '15:00' }, schema);
    expect(out).toBe('15:00');
  });

  it('expands missing keys to empty string', () => {
    const out = renderBody('録音URL：{{recordingUrl}}', {}, schema);
    expect(out).toBe('録音URL：');
  });

  it('handles {{#if key == "value"}}...{{/if}} blocks', () => {
    const tpl = '{{#if meeting_format == "対面"}}訪問先：{{visitLocation}}\n{{/if}}事業内容：x';
    const inner = renderBody(tpl, { meeting_format: '対面', visitLocation: '東京' }, []);
    expect(inner).toBe('訪問先：東京\n事業内容：x');
    const outer = renderBody(tpl, { meeting_format: 'オンライン', visitLocation: '東京' }, []);
    expect(outer).toBe('事業内容：x');
  });

  it('falls back to plain replacement when schema is omitted', () => {
    const out = renderBody('日付：{{getDate}}', { getDate: '2026-05-25' });
    expect(out).toBe('日付：2026-05-25');
  });

  it('preserves invalid date strings without crashing', () => {
    const out = renderBody('{{getDate}}', { getDate: 'invalid' }, schema);
    expect(out).toBe('invalid');
  });
});
