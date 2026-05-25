import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Badge, Input, Card, Select } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';

// 仕様書: tasks/spacareer-spec.md §6.2A / §7.6
// 実装todo: tasks/spacareer-kickoff-hearing-todo.md Phase G
//
// 第1回前70問キックオフヒアリング用のテンプレ管理エディタ。
// spacareer_kickoff_hearing_questions テーブル直結（mock不使用）。
// 編集権限はadminのみ（RLS で実DB側でも担保）。
//
// 機能:
//  - セクションA〜J + BONUS の折りたたみ表示
//  - 既存設問のinline編集（質問文/必須・任意/文字数上限/placeholder/help_text/answer_type/display_order）
//  - 新規追加（セクション選択+question_number指定）
//  - 論理削除（is_active=false）
//  - セクション一括での必須/任意トグル

const ANSWER_TYPE_OPTIONS = [
  { value: 'short_text', label: '短文 (short_text)' },
  { value: 'long_text',  label: '長文 (long_text)' },
  { value: 'date',       label: '日付 (date)' },
  { value: 'number',     label: '数値 (number)' },
  { value: 'select_one', label: '単一選択 (select_one)' },
  { value: 'select_many', label: '複数選択 (select_many)' },
];

const SECTION_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'BONUS'];

export default function KickoffHearingTemplateEditor() {
  const { profile, orgId } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);

  // 編集中のドラフト: {id: { field: value, ... }}
  const [drafts, setDrafts] = useState({});

  const fetchAll = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('spacareer_kickoff_hearing_questions')
        .select('*')
        .eq('org_id', orgId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      setQuestions(data || []);
      setDrafts({});
    } catch (e) {
      console.error('[KickoffHearingTemplateEditor] fetch error:', e);
      alert('読み込みに失敗しました: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [orgId]);

  const visibleQuestions = useMemo(
    () => questions.filter((q) => showInactive || q.is_active),
    [questions, showInactive],
  );

  const sections = useMemo(() => {
    const map = new Map();
    visibleQuestions.forEach((q) => {
      if (!map.has(q.section_code)) {
        map.set(q.section_code, { code: q.section_code, name: q.section_name, items: [] });
      }
      map.get(q.section_code).items.push(q);
    });
    // 全セクションを表示順で
    return SECTION_ORDER
      .map((code) => map.get(code))
      .filter(Boolean);
  }, [visibleQuestions]);

  const getField = (q, field) => {
    if (drafts[q.id] && Object.prototype.hasOwnProperty.call(drafts[q.id], field)) {
      return drafts[q.id][field];
    }
    return q[field];
  };
  const setField = (q, field, value) => {
    setDrafts((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [field]: value } }));
  };
  const isDirty = (q) => drafts[q.id] && Object.keys(drafts[q.id]).length > 0;

  const handleSave = async (q) => {
    if (!isAdmin) { alert('編集はadminのみ可能です'); return; }
    if (!isDirty(q)) return;
    setSavingId(q.id);
    try {
      const patch = drafts[q.id];
      const { error } = await supabase
        .from('spacareer_kickoff_hearing_questions')
        .update(patch)
        .eq('id', q.id);
      if (error) throw error;
      // ローカル反映
      setQuestions((prev) => prev.map((r) => r.id === q.id ? { ...r, ...patch } : r));
      setDrafts((prev) => {
        const m = { ...prev };
        delete m[q.id];
        return m;
      });
    } catch (e) {
      alert('保存に失敗しました: ' + (e.message || e));
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (q) => {
    if (!isAdmin) { alert('編集はadminのみ可能です'); return; }
    const newActive = !q.is_active;
    if (!newActive && !window.confirm(`Q${q.question_number} を「無効」にします。受講生画面には表示されなくなります。よろしいですか？`)) return;
    setSavingId(q.id);
    try {
      const { error } = await supabase
        .from('spacareer_kickoff_hearing_questions')
        .update({ is_active: newActive })
        .eq('id', q.id);
      if (error) throw error;
      setQuestions((prev) => prev.map((r) => r.id === q.id ? { ...r, is_active: newActive } : r));
    } catch (e) {
      alert('更新に失敗しました: ' + (e.message || e));
    } finally {
      setSavingId(null);
    }
  };

  const handleSectionToggleRequired = async (sec, makeRequired) => {
    if (!isAdmin) { alert('編集はadminのみ可能です'); return; }
    const targetIds = sec.items.filter((q) => q.is_required !== makeRequired).map((q) => q.id);
    if (targetIds.length === 0) return;
    if (!window.confirm(`セクション「${sec.name}」の ${targetIds.length} 問を一括で「${makeRequired ? '必須' : '任意'}」に変更します。よろしいですか？`)) return;
    try {
      const { error } = await supabase
        .from('spacareer_kickoff_hearing_questions')
        .update({ is_required: makeRequired })
        .in('id', targetIds);
      if (error) throw error;
      setQuestions((prev) => prev.map((r) => targetIds.includes(r.id) ? { ...r, is_required: makeRequired } : r));
    } catch (e) {
      alert('一括変更に失敗しました: ' + (e.message || e));
    }
  };

  const handleAddNew = async (sectionCode, sectionName) => {
    if (!isAdmin) { alert('追加はadminのみ可能です'); return; }
    const sameSection = questions.filter((q) => q.section_code === sectionCode);
    const maxNumber = questions.reduce((m, q) => Math.max(m, q.question_number), 0);
    const maxOrder = questions.reduce((m, q) => Math.max(m, q.display_order), 0);
    const inputText = window.prompt('新しい設問の質問文を入力してください', '');
    if (!inputText || !inputText.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase
        .from('spacareer_kickoff_hearing_questions')
        .insert({
          org_id: orgId,
          section_code: sectionCode,
          section_name: sectionName,
          question_number: maxNumber + 1,
          question_text: inputText.trim(),
          answer_type: 'long_text',
          is_required: sectionCode !== 'G' && sectionCode !== 'I' && sectionCode !== 'BONUS',
          char_limit: 1000,
          display_order: maxOrder + 1,
          is_active: true,
        });
      if (error) throw error;
      await fetchAll();
    } catch (e) {
      alert('追加に失敗しました: ' + (e.message || e));
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <Card padding="lg">
        <div style={{ color: color.textLight, fontSize: font.size.sm }}>読み込み中...</div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* 上部バー */}
      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space[3] }}>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
              キックオフヒアリング 70問マスタ
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 4, lineHeight: font.lineHeight.relaxed }}>
              受講生が第1回セッション前に回答する設問の本体。編集は{isAdmin ? '可能' : 'adminのみ'}。
              無効化した設問は受講生画面に表示されません。
            </div>
          </div>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.xs, color: color.textMid }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                style={{ accentColor: color.navy }}
              />
              無効を表示
            </label>
            <Button size="sm" variant="outline" onClick={fetchAll}>再読み込み</Button>
          </div>
        </div>
      </Card>

      {/* セクションごと */}
      {sections.map((sec) => {
        const isCollapsed = !!collapsed[sec.code];
        const requiredCount = sec.items.filter((q) => q.is_required).length;
        const allRequired = requiredCount === sec.items.length;
        const allOptional = requiredCount === 0;
        return (
          <Card key={sec.code} padding="none">
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: `${space[3]}px ${space[4]}px`,
              borderBottom: isCollapsed ? 'none' : `1px solid ${color.borderLight}`,
            }}>
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [sec.code]: !prev[sec.code] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: space[2],
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy,
                }}
              >
                {sec.name}
                <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.regular }}>
                  ({sec.items.length}問 / 必須 {requiredCount})
                </span>
              </button>
              {isAdmin && (
                <div style={{ display: 'flex', gap: space[1] }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSectionToggleRequired(sec, true)}
                    disabled={allRequired}
                  >全必須</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSectionToggleRequired(sec, false)}
                    disabled={allOptional}
                  >全任意</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddNew(sec.code, sec.name)}
                    loading={adding}
                  >+ 追加</Button>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {sec.items.map((q) => (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    isAdmin={isAdmin}
                    getField={getField}
                    setField={setField}
                    isDirty={isDirty(q)}
                    saving={savingId === q.id}
                    onSave={() => handleSave(q)}
                    onToggleActive={() => handleToggleActive(q)}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function QuestionRow({ q, isAdmin, getField, setField, isDirty, saving, onSave, onToggleActive }) {
  const disabled = !isAdmin;
  return (
    <div style={{
      padding: `${space[3]}px ${space[4]}px`,
      borderTop: `1px solid ${color.borderLight}`,
      background: q.is_active ? color.white : alpha(color.warn, 0.04),
      opacity: q.is_active ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
          Q{q.question_number}
        </span>
        <div style={{ flex: 1 }}>
          <Input
            size="sm"
            value={getField(q, 'question_text') || ''}
            onChange={(e) => setField(q, 'question_text', e.target.value)}
            disabled={disabled}
          />
        </div>
        {!q.is_active && <Badge variant="neutral" size="sm">無効</Badge>}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '180px 100px 120px 1fr 1fr',
        gap: space[2],
        alignItems: 'center',
        marginBottom: space[2],
      }}>
        <Select
          size="sm"
          value={getField(q, 'answer_type') || 'long_text'}
          onChange={(e) => setField(q, 'answer_type', e.target.value)}
          options={ANSWER_TYPE_OPTIONS}
          disabled={disabled}
        />
        <Select
          size="sm"
          value={getField(q, 'is_required') ? 'true' : 'false'}
          onChange={(e) => setField(q, 'is_required', e.target.value === 'true')}
          options={[
            { value: 'true', label: '必須' },
            { value: 'false', label: '任意' },
          ]}
          disabled={disabled}
        />
        <Input
          size="sm"
          type="number"
          placeholder="文字数上限"
          value={getField(q, 'char_limit') ?? ''}
          onChange={(e) => setField(q, 'char_limit', e.target.value ? parseInt(e.target.value, 10) : null)}
          disabled={disabled}
        />
        <Input
          size="sm"
          placeholder="placeholder (例:◯◯)"
          value={getField(q, 'placeholder') || ''}
          onChange={(e) => setField(q, 'placeholder', e.target.value || null)}
          disabled={disabled}
        />
        <Input
          size="sm"
          placeholder="help_text (補助テキスト)"
          value={getField(q, 'help_text') || ''}
          onChange={(e) => setField(q, 'help_text', e.target.value || null)}
          disabled={disabled}
        />
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <span style={{ fontSize: font.size.xs, color: color.textMid }}>display_order:</span>
            <Input
              size="sm"
              type="number"
              value={getField(q, 'display_order') ?? ''}
              onChange={(e) => setField(q, 'display_order', e.target.value ? parseInt(e.target.value, 10) : 0)}
              style={{ width: 80 }}
              containerStyle={{ width: 80 }}
            />
          </div>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button size="sm" variant="ghost" onClick={onToggleActive} disabled={saving}>
              {q.is_active ? '無効化' : '有効化'}
            </Button>
            <Button size="sm" variant="primary" onClick={onSave} disabled={!isDirty || saving} loading={saving}>
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
