import { useState } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import {
  fetchRewardTypes, insertRewardType, updateRewardType, deleteRewardType,
  insertRewardTier, updateRewardTier, deleteRewardTier,
  fetchRewardMaster,
} from '../../lib/supabaseWrite';

const TIMING_OPTIONS = ['面談実施', '基本合意'];
const BASIS_OPTIONS  = ['売上高', '当期純利益', '-'];
const TAX_OPTIONS    = ['税別', '税込'];
const CALC_TYPE_OPTIONS = [
  { value: 'rate',           label: '売上額×階段単価' },
  { value: 'fixed_per_appo', label: 'アポ1件 定額（単価のみ）' },
];

const fmt = (n) => n != null && n !== '' ? '¥' + Number(n).toLocaleString() : '-';

export default function RewardMasterView({ rewardMaster, setRewardMaster }) {
  const [types, setTypes] = useState(null); // null = 未ロード
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [loading, setLoading] = useState(false);

  // タイプ一覧をロード
  const loadTypes = async () => {
    setLoading(true);
    const { data } = await fetchRewardTypes();
    setTypes(data || []);
    setLoading(false);
  };
  if (types === null && !loading) { loadTypes(); }

  // 全体の rewardMaster を再取得して親の state を更新
  const refreshMaster = async () => {
    const { data } = await fetchRewardMaster();
    if (data) setRewardMaster(data);
  };

  const selectedType = types?.find(t => t.type_id === selectedTypeId) || null;

  // ── タイプ追加 ───────────────────────────────────────────
  const [addTypeForm, setAddTypeForm] = useState(null);
  const handleAddType = async () => {
    if (!addTypeForm?.type_id || !addTypeForm?.name) { alert('タイプIDと名称は必須です'); return; }
    const { error } = await insertRewardType({
      type_id: addTypeForm.type_id.toUpperCase(),
      name: addTypeForm.name,
      timing: addTypeForm.timing || '面談実施',
      basis: addTypeForm.basis || '売上高',
      tax: addTypeForm.tax || '税別',
      calc_type: addTypeForm.calc_type || 'rate',
      sort_order: (types?.length || 0) + 1,
    });
    if (error) { alert('追加に失敗しました: ' + error.message); return; }
    setAddTypeForm(null);
    await loadTypes();
    await refreshMaster();
  };

  // ── タイプ編集 ───────────────────────────────────────────
  const [editTypeForm, setEditTypeForm] = useState(null);
  const handleUpdateType = async () => {
    if (!editTypeForm?.name) { alert('名称は必須です'); return; }
    const { error } = await updateRewardType(editTypeForm.type_id, {
      name: editTypeForm.name,
      timing: editTypeForm.timing,
      basis: editTypeForm.basis,
      tax: editTypeForm.tax,
      calc_type: editTypeForm.calc_type || 'rate',
    });
    if (error) { alert('更新に失敗しました: ' + error.message); return; }
    setEditTypeForm(null);
    await loadTypes();
    await refreshMaster();
  };

  // ── タイプ削除 ───────────────────────────────────────────
  const handleDeleteType = async (typeId) => {
    if (!window.confirm(`タイプ "${typeId}" を削除しますか？\n（関連する全てのティアも削除されます）`)) return;
    const { error } = await deleteRewardType(typeId);
    if (error) { alert('削除に失敗しました: ' + error.message); return; }
    if (selectedTypeId === typeId) setSelectedTypeId(null);
    await loadTypes();
    await refreshMaster();
  };

  // ── ティア追加 ───────────────────────────────────────────
  const [addTierForm, setAddTierForm] = useState(null);
  const handleAddTier = async () => {
    if (!selectedTypeId) return;
    const lo = Number(addTierForm?.lo ?? 0);
    const hi = Number(addTierForm?.hi ?? 999999999999);
    const price = Number(addTierForm?.price ?? 0);
    if (isNaN(lo) || isNaN(hi) || isNaN(price)) { alert('数値を正しく入力してください'); return; }
    const { error } = await insertRewardTier({
      type_id: selectedTypeId,
      lo, hi, price,
      memo: addTierForm?.memo || '',
      sort_order: (selectedType?.reward_tiers?.length || 0) + 1,
    });
    if (error) { alert('追加に失敗しました: ' + error.message); return; }
    setAddTierForm(null);
    await loadTypes();
    await refreshMaster();
  };

  // ── ティア編集 ───────────────────────────────────────────
  const [editTierId, setEditTierId] = useState(null);
  const [editTierForm, setEditTierForm] = useState(null);
  const handleUpdateTier = async () => {
    const lo = Number(editTierForm?.lo ?? 0);
    const hi = Number(editTierForm?.hi ?? 999999999999);
    const price = Number(editTierForm?.price ?? 0);
    if (isNaN(lo) || isNaN(hi) || isNaN(price)) { alert('数値を正しく入力してください'); return; }
    const { error } = await updateRewardTier(editTierId, { lo, hi, price, memo: editTierForm?.memo || '' });
    if (error) { alert('更新に失敗しました: ' + error.message); return; }
    setEditTierId(null);
    setEditTierForm(null);
    await loadTypes();
    await refreshMaster();
  };

  // ── ティア削除 ───────────────────────────────────────────
  const handleDeleteTier = async (tierId) => {
    if (!window.confirm('このティアを削除しますか？')) return;
    const { error } = await deleteRewardTier(tierId);
    if (error) { alert('削除に失敗しました: ' + error.message); return; }
    await loadTypes();
    await refreshMaster();
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: space[10] }}>
      <div style={{ marginBottom: space[5], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>料金テーブル管理</h2>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>報酬タイプと階段単価を管理します</div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setAddTypeForm({ type_id: '', name: '', timing: '面談実施', basis: '売上高', tax: '税別', calc_type: 'rate' })}
        >
          ＋ 新規タイプ追加
        </Button>
      </div>

      {loading && <div style={{ color: color.textLight, fontSize: font.size.base }}>読み込み中...</div>}

      <div style={{ display: 'flex', gap: space[5], alignItems: 'flex-start' }}>
        {/* ── 左: タイプ一覧 ── */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textMid, marginBottom: space[2] }}>報酬タイプ一覧</div>
          {(types || []).map(t => (
            <div key={t.type_id}
              onClick={() => setSelectedTypeId(t.type_id)}
              style={{
                padding: '10px 14px', marginBottom: 6, borderRadius: radius.md, cursor: 'pointer',
                border: '1px solid ' + (selectedTypeId === t.type_id ? color.navy : color.borderLight),
                background: selectedTypeId === t.type_id ? alpha(color.navy, 0.06) : color.white,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy, marginRight: 8 }}>{t.type_id}</span>
                  <span style={{ fontSize: font.size.xs, color: color.textDark }}>{t.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); setEditTypeForm({ ...t }); }}>編集</Button>
                  <Button variant="danger" size="sm" onClick={e => { e.stopPropagation(); handleDeleteType(t.type_id); }}>削除</Button>
                </div>
              </div>
              <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 4 }}>
                {t.calc_type === 'fixed_per_appo' ? 'アポ1件 定額' : '売上×階段'} / {t.timing} / {t.tax} / {t.reward_tiers?.length || 0}段階
              </div>
            </div>
          ))}
        </div>

        {/* ── 右: ティア一覧 ── */}
        <div style={{ flex: 1 }}>
          {!selectedType ? (
            <div style={{ color: color.textLight, fontSize: font.size.base, paddingTop: space[5] }}>左のタイプを選択してください</div>
          ) : (
            <>
              <div style={{ marginBottom: space[3], display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>{selectedType.type_id} — {selectedType.name}</span>
                  <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: 10 }}>{selectedType.timing} / {selectedType.basis} / {selectedType.tax}</span>
                </div>
                <Button variant="primary" size="sm" onClick={() => setAddTierForm({ lo: '', hi: '', price: '', memo: '' })}>
                  ＋ 段階を追加
                </Button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
                <thead>
                  <tr style={{ background: '#0D2247' }}>
                    {['下限（円）', '上限（円）', '単価（円）', 'メモ', ''].map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: font.size.xs, color: color.white, fontWeight: font.weight.semibold, borderBottom: '2px solid #0D2247' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(selectedType.reward_tiers || [])
                    .sort((a, b) => a.sort_order - b.sort_order || a.lo - b.lo)
                    .map(tier => (
                      editTierId === tier.id ? (
                        <tr key={tier.id} style={{ background: color.gray50 }}>
                          <td style={{ padding: '8px 8px' }}><Input type="number" size="sm" value={editTierForm.lo} onChange={e => setEditTierForm(p => ({ ...p, lo: e.target.value }))} containerStyle={{ width: 120 }} /></td>
                          <td style={{ padding: '8px 8px' }}><Input type="number" size="sm" value={editTierForm.hi} onChange={e => setEditTierForm(p => ({ ...p, hi: e.target.value }))} containerStyle={{ width: 120 }} /></td>
                          <td style={{ padding: '8px 8px' }}><Input type="number" size="sm" value={editTierForm.price} onChange={e => setEditTierForm(p => ({ ...p, price: e.target.value }))} containerStyle={{ width: 100 }} /></td>
                          <td style={{ padding: '8px 8px' }}><Input type="text" size="sm" value={editTierForm.memo} onChange={e => setEditTierForm(p => ({ ...p, memo: e.target.value }))} /></td>
                          <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                            <Button variant="primary" size="sm" onClick={handleUpdateTier} style={{ marginRight: 4 }}>保存</Button>
                            <Button variant="secondary" size="sm" onClick={() => { setEditTierId(null); setEditTierForm(null); }}>キャンセル</Button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={tier.id} style={{ borderBottom: `1px solid ${color.gray200}` }}>
                          <td style={{ padding: '8px 16px', fontFamily: font.family.mono }}>{fmt(tier.lo)}</td>
                          <td style={{ padding: '8px 16px', fontFamily: font.family.mono }}>{tier.hi >= 999999999999 ? '上限なし' : fmt(tier.hi)}</td>
                          <td style={{ padding: '8px 16px', fontWeight: font.weight.semibold, color: color.navy, fontFamily: font.family.mono }}>{fmt(tier.price)}</td>
                          <td style={{ padding: '8px 16px', color: color.textMid }}>{tier.memo}</td>
                          <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                            <Button variant="secondary" size="sm" onClick={() => { setEditTierId(tier.id); setEditTierForm({ lo: tier.lo, hi: tier.hi, price: tier.price, memo: tier.memo }); }} style={{ marginRight: 4 }}>編集</Button>
                            <Button variant="danger" size="sm" onClick={() => handleDeleteTier(tier.id)}>削除</Button>
                          </td>
                        </tr>
                      )
                    ))}
                </tbody>
              </table>

              {/* 段階追加フォーム */}
              {addTierForm && (
                <Card variant="subtle" padding="sm" style={{ marginTop: space[3] }}>
                  <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>新しい段階を追加</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                    <Input type="number" size="sm" label="下限（円）" placeholder="0" value={addTierForm.lo} onChange={e => setAddTierForm(p => ({ ...p, lo: e.target.value }))} />
                    <Input type="number" size="sm" label="上限（円）" placeholder="999999999999" value={addTierForm.hi} onChange={e => setAddTierForm(p => ({ ...p, hi: e.target.value }))} />
                    <Input type="number" size="sm" label="単価（円）" placeholder="100000" value={addTierForm.price} onChange={e => setAddTierForm(p => ({ ...p, price: e.target.value }))} />
                    <Input type="text" size="sm" label="メモ" placeholder="例: 30億未満：10万円" value={addTierForm.memo} onChange={e => setAddTierForm(p => ({ ...p, memo: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" size="sm" onClick={handleAddTier}>追加</Button>
                    <Button variant="secondary" size="sm" onClick={() => setAddTierForm(null)}>キャンセル</Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* タイプ追加モーダル */}
      {addTypeForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: color.white, borderRadius: radius.lg, width: 420, padding: space[6], boxShadow: shadow.lg }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[4] }}>新規タイプ追加</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Input type="text" size="sm" label="タイプID（英大文字1〜3文字）" maxLength={3} placeholder="例: O" value={addTypeForm.type_id} onChange={e => setAddTypeForm(p => ({ ...p, type_id: e.target.value }))} />
              <Input type="text" size="sm" label="名称" placeholder="例: 固定20万円" value={addTypeForm.name} onChange={e => setAddTypeForm(p => ({ ...p, name: e.target.value }))} />
              <Select size="sm" label="計算方式" value={addTypeForm.calc_type || 'rate'} onChange={e => setAddTypeForm(p => ({ ...p, calc_type: e.target.value }))} options={CALC_TYPE_OPTIONS} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Select size="sm" label="タイミング" value={addTypeForm.timing} onChange={e => setAddTypeForm(p => ({ ...p, timing: e.target.value }))} options={TIMING_OPTIONS.map(o => ({ value: o, label: o }))} />
                <Select size="sm" label="基準" value={addTypeForm.basis} onChange={e => setAddTypeForm(p => ({ ...p, basis: e.target.value }))} options={BASIS_OPTIONS.map(o => ({ value: o, label: o }))} />
                <Select size="sm" label="税" value={addTypeForm.tax} onChange={e => setAddTypeForm(p => ({ ...p, tax: e.target.value }))} options={TAX_OPTIONS.map(o => ({ value: o, label: o }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: space[4], justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setAddTypeForm(null)}>キャンセル</Button>
              <Button variant="primary" size="sm" onClick={handleAddType}>追加</Button>
            </div>
          </div>
        </div>
      )}

      {/* タイプ編集モーダル */}
      {editTypeForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: color.white, borderRadius: radius.lg, width: 420, padding: space[6], boxShadow: shadow.lg }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: 4 }}>タイプ編集 — {editTypeForm.type_id}</div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[4] }}>※ タイプIDは変更できません</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Input type="text" size="sm" label="名称" value={editTypeForm.name} onChange={e => setEditTypeForm(p => ({ ...p, name: e.target.value }))} />
              <Select size="sm" label="計算方式" value={editTypeForm.calc_type || 'rate'} onChange={e => setEditTypeForm(p => ({ ...p, calc_type: e.target.value }))} options={CALC_TYPE_OPTIONS} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Select size="sm" label="タイミング" value={editTypeForm.timing} onChange={e => setEditTypeForm(p => ({ ...p, timing: e.target.value }))} options={TIMING_OPTIONS.map(o => ({ value: o, label: o }))} />
                <Select size="sm" label="基準" value={editTypeForm.basis} onChange={e => setEditTypeForm(p => ({ ...p, basis: e.target.value }))} options={BASIS_OPTIONS.map(o => ({ value: o, label: o }))} />
                <Select size="sm" label="税" value={editTypeForm.tax} onChange={e => setEditTypeForm(p => ({ ...p, tax: e.target.value }))} options={TAX_OPTIONS.map(o => ({ value: o, label: o }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: space[4], justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setEditTypeForm(null)}>キャンセル</Button>
              <Button variant="primary" size="sm" onClick={handleUpdateType}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
