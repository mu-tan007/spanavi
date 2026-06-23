import React, { useEffect, useState } from 'react';
import { color, space, font } from '../../../../../constants/design';
import { Card, Badge, DataTable } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import HomeworkFileLink from './HomeworkFileLink';

// ============================================================
// 6. ファイルタブ
// 仕様書 §7.1 中央タブ#6
// ============================================================
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

export default function TabFiles({ detail }) {
  const { homework = [] } = detail || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = homework.map((h) => h.id);
    if (!ids.length) { setItems([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('spacareer_homework_items')
        .select('id, homework_id, position, question_text, attached_files, submitted_at')
        .in('homework_id', ids)
        .eq('is_published', true)
        .not('attached_files', 'is', null);
      setItems(data || []);
      setLoading(false);
    })();
  }, [homework]);

  const rows = [];
  items.forEach((it) => {
    const hw = homework.find((h) => h.id === it.homework_id);
    const files = Array.isArray(it.attached_files) ? it.attached_files : [];
    files.forEach((f, idx) => {
      rows.push({
        id: `${it.id}_${idx}`,
        session_no: hw?.session_no,
        question_text: it.question_text,
        filename: f.name || f.filename || `添付${idx + 1}`,
        size: f.size || null,
        file: f,
        submitted_at: it.submitted_at,
      });
    });
  });

  return (
    <Card padding="md"
      title="顧客から添付された全ファイル"
      description="事後課題の項目単位で添付されたファイルを集約しています。"
      action={<Badge variant="primary" dot>{rows.length} 件</Badge>}
    >
      <DataTable
        columns={[
          { key: 'session_no', label: '回', width: 60, align: 'center',
            render: (r) => r.session_no ? `第${r.session_no}回` : '—' },
          { key: 'question_text', label: '設問', width: 'minmax(200px, 1fr)', align: 'left' },
          { key: 'filename', label: 'ファイル名', width: 220, align: 'left' },
          { key: 'size', label: 'サイズ', width: 80, align: 'right',
            render: (r) => fmtSize(r.size), cellStyle: { fontFamily: font.family.mono } },
          { key: 'submitted_at', label: '提出日', width: 90, align: 'right',
            render: (r) => fmtDate(r.submitted_at), cellStyle: { fontFamily: font.family.mono } },
          { key: '_dl', label: '閲覧', width: 70, align: 'center',
            render: (r) => <HomeworkFileLink file={r.file} compact /> },
        ]}
        rows={rows}
        rowKey="id"
        loading={loading}
        height="auto"
        emptyMessage="添付ファイルはまだありません"
      />
    </Card>
  );
}
