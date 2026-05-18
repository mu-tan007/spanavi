import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Badge } from '../../../ui';
import { generateHomework30Items } from '../../../../lib/spacareer/ai/mock';
import { buildDraftItems, STATUS_INDEX } from './mockData';

// エージェント#6 の HomeworkItem シグネチャに合わせて変換
// 入力 : { position, question_text, question_hint, is_required, max_length }
// 出力 : { id, order, title, body, required, category }
function toEditableItems(items, customerId, sessionNumber) {
  return (items || []).map((it, idx) => ({
    id: `${customerId}_${sessionNumber}_${it.position || idx + 1}`,
    order: it.position || idx + 1,
    title: (it.question_text || '').split('。')[0].slice(0, 40),
    body: it.question_text || '',
    required: !!it.is_required,
    category: idx < 10 ? '振り返り' : idx < 20 ? '価値観' : '行動計画',
    maxLength: it.max_length || null,
    hint: it.question_hint || null,
  }));
}

// 右カラム3タブ
// 仕様書: §7.3 個別顧客の課題設定パネル
const TABS = [
  { key: 'edit',     label: '課題設定' },
  { key: 'preview',  label: '課題プレビュー' },
  { key: 'ai',       label: 'AI自動生成' },
];

export default function HomeworkEditPanel({ selected, customer, status, onClose, onNotify }) {
  const [tab, setTab] = useState('edit');
  const [items, setItems] = useState(() => selected ? buildDraftItems(selected.customerId, selected.sessionNumber) : []);
  const [aiBusy, setAiBusy] = useState(false);
  const [lastGen, setLastGen] = useState(null);

  useEffect(() => {
    if (selected) {
      setItems(buildDraftItems(selected.customerId, selected.sessionNumber));
      setTab('edit');
    }
  }, [selected?.customerId, selected?.sessionNumber]);

  const statusMeta = status ? STATUS_INDEX[status] : null;

  const requiredCount = useMemo(() => items.filter(i => i.required).length, [items]);

  const handleUpdate = (id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };
  const handleDelete = (id) => setItems(prev => prev.filter(it => it.id !== id));
  const handleAdd = () => {
    const nextOrder = items.length + 1;
    setItems(prev => [...prev, {
      id: `manual_${Date.now()}`,
      order: nextOrder,
      title: '新規項目',
      body: '',
      required: false,
      category: '振り返り',
    }]);
  };

  const handleAIGenerate = async () => {
    if (!selected) return;
    setAiBusy(true);
    try {
      // エージェント#6 提供の mock 経由で 30 項目を取得し、編集用フォーマットへ変換
      const raw = await generateHomework30Items({
        customerId: selected.customerId,
        nextSessionNo: selected.sessionNumber,
      });
      const next = toEditableItems(raw, selected.customerId, selected.sessionNumber);
      setItems(next);
      setLastGen(new Date().toISOString());
      setTab('edit');
    } catch (e) {
      // mock 呼び出し失敗時はドラフトに戻す（並列実装中の暫定挙動）
      setItems(buildDraftItems(selected.customerId, selected.sessionNumber));
    } finally {
      setAiBusy(false);
    }
  };

  if (!selected) {
    return (
      <aside style={panelShell()}>
        <EmptyHint />
      </aside>
    );
  }

  return (
    <aside style={panelShell()}>
      <header style={{
        padding: `${space[4]}px ${space[4]}px ${space[3]}px`,
        borderBottom: `1px solid ${color.borderLight}`,
        background: color.white,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.size.xs, color: color.textLight, letterSpacing: font.letterSpacing.wide, fontWeight: font.weight.semibold }}>
              個別顧客の課題設定
            </div>
            <div style={{ marginTop: 4, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
              {customer?.name || selected.customerId}
              <span style={{ marginLeft: 8, fontWeight: font.weight.normal, color: color.textMid, fontSize: font.size.md }}>
                第{selected.sessionNumber}回事前課題
              </span>
            </div>
            {statusMeta && (
              <div style={{ marginTop: 6 }}>
                <Badge variant={statusMeta.variant} dot>{statusMeta.label}</Badge>
                {selected.sessionNumber === 3 && (
                  <span style={{ marginLeft: 8 }}>
                    <Badge variant="warn">第3回 返金保証カットオフ</Badge>
                  </span>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>閉じる</Button>
        </div>
        <Tabs tab={tab} setTab={setTab} />
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: space[4] }}>
        {tab === 'edit' && (
          <EditView items={items} onUpdate={handleUpdate} onDelete={handleDelete} onAdd={handleAdd} />
        )}
        {tab === 'preview' && <PreviewView items={items} customer={customer} sessionNumber={selected.sessionNumber} />}
        {tab === 'ai' && (
          <AIGenerateView busy={aiBusy} lastGen={lastGen} onGenerate={handleAIGenerate} items={items} />
        )}
      </div>

      <footer style={{
        padding: `${space[3]}px ${space[4]}px`,
        borderTop: `1px solid ${color.borderLight}`,
        background: color.cream,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space[3],
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          項目数：<strong style={{ color: color.textDark }}>{items.length}</strong>
          <span style={{ margin: '0 8px', color: color.borderDark }}>|</span>
          必須：<strong style={{ color: color.textDark }}>{requiredCount}</strong>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button variant="outline" size="md">下書き保存</Button>
          <Button variant="primary" size="md" onClick={() => onNotify && onNotify(items)}>
            完了・通知
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function panelShell() {
  return {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: color.white,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.sm,
    overflow: 'hidden',
  };
}

function Tabs({ tab, setTab }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginTop: space[3], borderBottom: `1px solid ${color.borderLight}` }}>
      {TABS.map(t => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: `${space[2]}px ${space[3]}px`,
              fontSize: font.size.sm,
              fontWeight: font.weight.semibold,
              fontFamily: font.family.sans,
              color: active ? color.navy : color.textMid,
              background: 'transparent',
              border: 'none',
              borderBottom: active ? `2px solid ${color.navy}` : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function EditView({ items, onUpdate, onDelete, onAdd }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[3] }}>
        <div style={{ fontSize: font.size.sm, color: color.textMid }}>
          30項目をAI生成後、必要に応じて編集してください。
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>＋ 項目追加</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {items.map((it, idx) => (
          <ItemRow key={it.id} item={it} index={idx + 1} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item, index, onUpdate, onDelete }) {
  return (
    <div style={{
      border: `1px solid ${color.borderLight}`,
      borderRadius: radius.md,
      padding: space[3],
      background: color.white,
    }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
        <span style={{
          fontFamily: font.family.mono,
          fontSize: font.size.xs,
          color: color.textLight,
          minWidth: 28,
        }}>
          #{String(index).padStart(2, '0')}
        </span>
        <input
          value={item.title}
          onChange={(e) => onUpdate(item.id, { title: e.target.value })}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: font.size.md,
            fontWeight: font.weight.semibold,
            color: color.textDark,
            background: 'transparent',
            fontFamily: font.family.sans,
          }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.textMid, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={item.required}
            onChange={(e) => onUpdate(item.id, { required: e.target.checked })}
          />
          必須
        </label>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: color.textLight, padding: 4, fontSize: font.size.xs,
          }}
          title="削除"
        >
          削除
        </button>
      </div>
      <textarea
        value={item.body}
        onChange={(e) => onUpdate(item.id, { body: e.target.value })}
        rows={2}
        style={{
          width: '100%',
          border: `1px solid ${color.borderLight}`,
          borderRadius: radius.sm,
          padding: space[2],
          fontSize: font.size.sm,
          color: color.textDark,
          background: color.snow,
          fontFamily: font.family.sans,
          outline: 'none',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function PreviewView({ items, customer, sessionNumber }) {
  return (
    <div>
      <div style={{
        padding: space[3],
        background: alpha(color.navyLight, 0.06),
        border: `1px solid ${alpha(color.navyLight, 0.18)}`,
        borderRadius: radius.md,
        marginBottom: space[4],
        fontSize: font.size.xs,
        color: color.textMid,
      }}>
        受講生からの見え方（クライアントポータル）。これは確定前のプレビューです。
      </div>
      <h3 style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy, marginBottom: 4 }}>
        第{sessionNumber}回 事前課題
      </h3>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[4] }}>
        {customer?.name || '受講生'}様、次回セッションをより有意義にするために、以下にご回答ください。
      </p>
      <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {items.map((it, idx) => (
          <li key={it.id} style={{
            padding: space[3],
            border: `1px solid ${color.borderLight}`,
            borderRadius: radius.md,
            background: color.white,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2], marginBottom: 4 }}>
              <div style={{ fontWeight: font.weight.semibold, color: color.textDark }}>
                <span style={{ fontFamily: font.family.mono, color: color.textLight, marginRight: 8 }}>
                  Q{String(idx + 1).padStart(2, '0')}
                </span>
                {it.title}
              </div>
              {it.required && <Badge variant="danger" size="sm">必須</Badge>}
            </div>
            <div style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[2] }}>{it.body}</div>
            <div style={{
              border: `1px dashed ${color.border}`, borderRadius: radius.sm,
              minHeight: 40, padding: space[2], color: color.textLight, fontSize: font.size.xs,
            }}>
              （ここに受講生が回答入力）
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AIGenerateView({ busy, lastGen, onGenerate, items }) {
  return (
    <div>
      <div style={{
        padding: space[4],
        background: color.snow,
        border: `1px solid ${color.borderLight}`,
        borderRadius: radius.md,
        marginBottom: space[4],
      }}>
        <h4 style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>
          AIに30項目を自動生成させる
        </h4>
        <p style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[3], lineHeight: font.lineHeight.normal }}>
          直近セッションの議事録・ヒアリングシート・過去事前課題・ソーシャルスタイル診断結果を入力として、
          Claude が次回事前課題ドラフトを生成します。生成後、課題設定タブで手動編集できます。
        </p>
        <Button variant="primary" loading={busy} onClick={onGenerate}>
          {items.length > 0 ? '再生成' : '30項目を生成'}
        </Button>
        {lastGen && (
          <div style={{ marginTop: space[3], fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
            最終生成：{new Date(lastGen).toLocaleString('ja-JP')}
          </div>
        )}
      </div>

      <div style={{
        padding: space[3],
        background: color.cream,
        borderRadius: radius.md,
        fontSize: font.size.xs,
        color: color.textMid,
        lineHeight: font.lineHeight.normal,
      }}>
        AIプロンプトはテンプレート管理 &gt; 事前課題 &gt; AIプロンプト（運営のみ編集可）から変更できます。
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: space[6], color: color.textLight, textAlign: 'center', gap: space[2],
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.4 }}>
        <rect x="8" y="10" width="40" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <line x1="14" y1="20" x2="42" y2="20" stroke="currentColor" strokeWidth="1.5" />
        <line x1="14" y1="28" x2="36" y2="28" stroke="currentColor" strokeWidth="1.5" />
        <line x1="14" y1="36" x2="30" y2="36" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
        左のマトリクスからセルを選択してください
      </div>
      <div style={{ fontSize: font.size.xs }}>
        個別顧客×回の事前課題を編集・プレビュー・AI生成できます。
      </div>
    </div>
  );
}
