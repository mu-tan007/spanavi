import React from 'react';
import { color, space, radius, font } from '../../../../constants/design';
import { Card, Badge, DataTable } from '../../../ui';

// 権限管理
// 3ロール（運営／トレーナー／受講生）の権限マトリクスを表示のみ。
// ロール自体の編集は admin RPC 経由（このUIからは触らない）。
export default function PermissionsView() {
  const rows = [
    { area: '顧客一覧',        admin: '全顧客',    trainer: '担当顧客のみ', student: '不可' },
    { area: 'セッション管理',   admin: '全顧客',    trainer: '担当顧客のみ', student: '自分のみ閲覧' },
    { area: '事後課題',         admin: '全顧客',    trainer: '担当顧客のみ', student: '自分のみ（回答）' },
    { area: 'AI講座',           admin: '管理可',    trainer: '視聴可',       student: '視聴可' },
    { area: 'テンプレート管理', admin: '編集可',    trainer: '11種編集可',   student: '不可' },
    { area: '分析レポート',     admin: '可',        trainer: '担当顧客分のみ', student: '不可' },
    { area: '設定',             admin: '可',        trainer: '一部閲覧のみ', student: '不可' },
  ];

  const columns = [
    { key: 'area',    label: '機能',         width: 200, align: 'left' },
    { key: 'admin',   label: '運営',         width: 160, align: 'left',
      render: (r) => <Badge variant="primary" dot>{r.admin}</Badge>,
    },
    { key: 'trainer', label: 'トレーナー',   width: 200, align: 'left',
      render: (r) => <Badge variant="info" dot>{r.trainer}</Badge>,
    },
    { key: 'student', label: '受講生',       width: 200, align: 'left',
      render: (r) => r.student === '不可'
        ? <Badge variant="neutral">{r.student}</Badge>
        : <Badge variant="success" dot>{r.student}</Badge>,
    },
  ];

  return (
    <Card padding="md" title="権限マトリクス" description="ロール自体の編集は管理者RPC経由で実施（このUIは閲覧のみ）">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="area"
        height="auto"
        showCount={false}
        fillWidth
      />
    </Card>
  );
}
