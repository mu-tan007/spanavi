import React from 'react';
import { color, space, font, radius } from '../../../../constants/design';
import { DataTable } from '../../../ui';

// 仕様書: §7.6 変更履歴（誰が・いつ・何を）
export default function TemplateHistory({ history, templates, onSelectTemplate }) {
  const labelByKey = (key) => templates.find(t => t.key === key)?.label || key;

  const columns = [
    { key: 'at',       label: '日時',         width: 160, align: 'right',
      cellStyle: { fontFamily: font.family.mono } },
    { key: 'tpl',      label: 'テンプレート', width: 220, align: 'left',
      render: (r) => (
        <button
          type="button"
          onClick={() => onSelectTemplate && onSelectTemplate(r.templateKey)}
          style={{
            padding: 0, border: 'none', background: 'transparent',
            color: color.navy, fontWeight: font.weight.semibold, cursor: 'pointer',
            fontSize: font.size.sm, textAlign: 'left',
            textDecoration: 'underline',
          }}
        >
          {labelByKey(r.templateKey)}
        </button>
      ) },
    { key: 'by',       label: '更新者',       width: 140, align: 'left' },
    { key: 'summary',  label: '変更内容',     width: 380, align: 'left' },
  ];

  return (
    <div>
      <div style={{
        padding: space[3],
        background: color.snow,
        border: `1px solid ${color.borderLight}`,
        borderRadius: radius.md,
        marginBottom: space[3],
        fontSize: font.size.sm,
        color: color.textMid,
        lineHeight: font.lineHeight.normal,
      }}>
        テンプレート変更履歴。配信済み事後課題は旧版のまま固定され、未配信のみ新版が適用されます。
        ロールバック機能は運用開始後に必要に応じて追加します。
      </div>
      <DataTable
        columns={columns}
        rows={history}
        rowKey="id"
        emptyMessage="変更履歴はありません"
        height="auto"
      />
    </div>
  );
}
