import React, { useState, useEffect } from 'react';
import { color, space, font, radius } from '../../../../../constants/design';
import { Card, Button } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';

// ============================================================
// 7. メモタブ（トレーナー用フリーメモ、顧客非公開）
// 仕様書 §7.1 中央タブ#7
// ============================================================
export default function TabMemo({ detail }) {
  const customerId = detail?.customer?.id;
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasColumn, setHasColumn] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const { data, error } = await supabase
        .from('spacareer_customers')
        .select('trainer_memo')
        .eq('id', customerId)
        .maybeSingle();
      if (error) { setHasColumn(false); return; }
      setHasColumn(true);
      setMemo(data?.trainer_memo || '');
    })();
  }, [customerId]);

  async function handleSave() {
    if (!customerId || !hasColumn) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('spacareer_customers')
        .update({ trainer_memo: memo })
        .eq('id', customerId);
      if (error) throw error;
      setSavedAt(new Date());
    } catch (e) {
      console.error('[TabMemo] save error:', e);
      alert(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md"
      title="トレーナー用メモ"
      description="顧客には公開されません。担当トレーナー・運営のみ閲覧可能です。"
    >
      {hasColumn === false && (
        <div style={{
          marginBottom: space[3], padding: space[3],
          background: color.warnSoft, border: `1px solid ${color.warn}`,
          borderRadius: radius.md, fontSize: font.size.sm, color: '#A0651F',
        }}>
          ※ 現在のスキーマに <code>trainer_memo</code> カラムがありません。
          スキーマ追加までメモは保存できません（UI のみ表示中）。
        </div>
      )}
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={12}
        placeholder="例) 第3回までは慎重に話を聞く方が良い。前職の人間関係に強い思い入れ…"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: space[3], fontSize: font.size.sm,
          fontFamily: font.family.sans, color: color.textDark,
          background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.md, outline: 'none', resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[3] }}>
        <Button variant="primary" size="sm" loading={saving} disabled={!hasColumn} onClick={handleSave}>
          保存
        </Button>
        {savedAt && (
          <span style={{ fontSize: font.size.xs, color: color.success }}>
            保存しました（{savedAt.toLocaleTimeString()}）
          </span>
        )}
      </div>
    </Card>
  );
}
