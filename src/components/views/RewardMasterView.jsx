import { useState } from 'react';
import { C } from '../../constants/colors';
import {
  fetchRewardTypes, insertRewardType, updateRewardType, deleteRewardType,
  insertRewardTier, updateRewardTier, deleteRewardTier,
  fetchRewardMaster,
} from '../../lib/supabaseWrite';

const TIMING_OPTIONS = ['面談実施', '基本合意'];
const BASIS_OPTIONS  = ['売上高', '当期純利益', '-'];
const TAX_OPTIONS    = ['税別', '税込'];

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

  const inputStyle = { padding: '5px 8px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', width: '100%' };
  const btnPrimary = { padding: '5px 14px', borderRadius: 5, background: C.navy, color: C.white, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: "'Noto Sans JP'" };
  const btnDanger  = { padding: '3px 10px', borderRadius: 4, background: '#e74c3c', color: C.white, border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: "'Noto Sans JP'" };
  const btnGhost   = { padding: '3px 10px', borderRadius: 4, background: 'transparent', color: C.navy, border: '1px solid ' + C.border, cursor: 'pointer', fontSize: 10, fontFamily: "'Noto Sans JP'" };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: 40 }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: 0 }}>料金テーブル管理</h2>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>報酬タイプと階段単価を管理します</div>
        </div>
        <button onClick={() => setAddTypeForm({ type_id: '', name: '', timing: '面談実施', basis: '売上高', tax: '税別' })} style={btnPrimary}>
          ＋ 新規タイプ追加
        </button>
      </div>

      {loading && <div style={{ color: C.textLight, fontSize: 13 }}>読み込み中...</div>}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* ── 左: タイプ一覧 ── */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 8 }}>報酬タイプ一覧</div>
          {(types || []).map(t => (
            <div key={t.type_id}
              onClick={() => setSelectedTypeId(t.type_id)}
              style={{
                padding: '10px 14px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                border: '1px solid ' + (selectedTypeId === t.type_id ? C.navy : C.borderLight),
                background: selectedTypeId === t.type_id ? C.navy + '0f' : C.white,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginRight: 8 }}>{t.type_id}</span>
                  <span style={{ fontSize: 11, color: C.textDark }}>{t.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); setEditTypeForm({ ...t }); }} style={btnGhost}>編集</button>
                  <button onClick={e => { e.stopPropagation(); handleDeleteType(t.type_id); }} style={btnDanger}>削除</button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 4 }}>
                {t.timing} / {t.basis} / {t.tax} / {t.reward_tiers?.length || 0}段階
              </div>
            </div>
          ))}
        </div>

        {/* ── 右: ティア一覧 ── */}
        <div style={{ flex: 1 }}>
          {!selectedType ? (
            <div style={{ color: C.textLight, fontSize: 13, paddingTop: 20 }}>左のタイプを選択してください</div>
          ) : (
            <>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{selectedType.type_id} — {selectedType.name}</span>
                  <span style={{ fontSize: 11, color: C.textLight, marginLeft: 10 }}>{selectedType.timing} / {selectedType.basis} / {selectedType.tax}</span>
                </div>
                <button onClick={() => setAddTierForm({ lo: '', hi: '', price: '', memo: '' })} style={btnPrimary}>
                  ＋ 段階を追加
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.offWhite }}>
                    {['下限（円）', '上限（円）', '単価（円）', 'メモ', ''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#6B7280', fontWeight: 600, borderBottom: '1px solid ' + C.borderLight, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(selectedType.reward_tiers || [])
                    .sort((a, b) => a.sort_order - b.sort_order || a.lo - b.lo)
                    .map(tier => (
                      editTierId === tier.id ? (
                        <tr key={tier.id} style={{ background: '#fffbe6' }}>
                          <td style={{ padding: '6px 6px' }}><input type="number" value={editTierForm.lo} onChange={e => setEditTierForm(p => ({ ...p, lo: e.target.value }))} style={{ ...inputStyle, width: 120 }} /></td>
                          <td style={{ padding: '6px 6px' }}><input type="number" value={editTierForm.hi} onChange={e => setEditTierForm(p => ({ ...p, hi: e.target.value }))} style={{ ...inputStyle, width: 120 }} /></td>
                          <td style={{ padding: '6px 6px' }}><input type="number" value={editTierForm.price} onChange={e => setEditTierForm(p => ({ ...p, price: e.target.value }))} style={{ ...inputStyle, width: 100 }} /></td>
                          <td style={{ padding: '6px 6px' }}><input type="text" value={editTierForm.memo} onChange={e => setEditTierForm(p => ({ ...p, memo: e.target.value }))} style={{ ...inputStyle, width: '100%' }} /></td>
                          <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                            <button onClick={handleUpdateTier} style={{ ...btnPrimary, marginRight: 4 }}>保存</button>
                            <button onClick={() => { setEditTierId(null); setEditTierForm(null); }} style={btnGhost}>キャンセル</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={tier.id} style={{ borderBottom: '1px solid ' + C.borderLight }}>
                          <td style={{ padding: '8px 10px' }}>{fmt(tier.lo)}</td>
                          <td style={{ padding: '8px 10px' }}>{tier.hi >= 999999999999 ? '上限なし' : fmt(tier.hi)}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: C.navy }}>{fmt(tier.price)}</td>
                          <td style={{ padding: '8px 10px', color: C.textMid }}>{tier.memo}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <button onClick={() => { setEditTierId(tier.id); setEditTierForm({ lo: tier.lo, hi: tier.hi, price: tier.price, memo: tier.memo }); }} style={{ ...btnGhost, marginRight: 4 }}>編集</button>
                            <button onClick={() => handleDeleteTier(tier.id)} style={btnDanger}>削除</button>
                          </td>
                        </tr>
                      )
                    ))}
                </tbody>
              </table>

              {/* 段階追加フォーム */}
              {addTierForm && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#f0f7ff', borderRadius: 8, border: '1px solid ' + C.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 8 }}>新しい段階を追加</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                    <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>下限（円）</label><input type="number" placeholder="0" value={addTierForm.lo} onChange={e => setAddTierForm(p => ({ ...p, lo: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>上限（円）</label><input type="number" placeholder="999999999999" value={addTierForm.hi} onChange={e => setAddTierForm(p => ({ ...p, hi: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>単価（円）</label><input type="number" placeholder="100000" value={addTierForm.price} onChange={e => setAddTierForm(p => ({ ...p, price: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>メモ</label><input type="text" placeholder="例: 30億未満：10万円" value={addTierForm.memo} onChange={e => setAddTierForm(p => ({ ...p, memo: e.target.value }))} style={inputStyle} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleAddTier} style={btnPrimary}>追加</button>
                    <button onClick={() => setAddTierForm(null)} style={btnGhost}>キャンセル</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* タイプ追加モーダル */}
      {addTypeForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.white, borderRadius: 12, width: 420, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 16 }}>新規タイプ追加</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>タイプID（英大文字1〜3文字）</label><input type="text" maxLength={3} placeholder="例: O" value={addTypeForm.type_id} onChange={e => setAddTypeForm(p => ({ ...p, type_id: e.target.value }))} style={inputStyle} /></div>
              <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>名称</label><input type="text" placeholder="例: 固定20万円" value={addTypeForm.name} onChange={e => setAddTypeForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>タイミング</label>
                  <select value={addTypeForm.timing} onChange={e => setAddTypeForm(p => ({ ...p, timing: e.target.value }))} style={inputStyle}>
                    {TIMING_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>基準</label>
                  <select value={addTypeForm.basis} onChange={e => setAddTypeForm(p => ({ ...p, basis: e.target.value }))} style={inputStyle}>
                    {BASIS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>税</label>
                  <select value={addTypeForm.tax} onChange={e => setAddTypeForm(p => ({ ...p, tax: e.target.value }))} style={inputStyle}>
                    {TAX_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setAddTypeForm(null)} style={btnGhost}>キャンセル</button>
              <button onClick={handleAddType} style={btnPrimary}>追加</button>
            </div>
          </div>
        </div>
      )}

      {/* タイプ編集モーダル */}
      {editTypeForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.white, borderRadius: 12, width: 420, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 4 }}>タイプ編集 — {editTypeForm.type_id}</div>
            <div style={{ fontSize: 11, color: C.textLight, marginBottom: 16 }}>※ タイプIDは変更できません</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>名称</label><input type="text" value={editTypeForm.name} onChange={e => setEditTypeForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>タイミング</label>
                  <select value={editTypeForm.timing} onChange={e => setEditTypeForm(p => ({ ...p, timing: e.target.value }))} style={inputStyle}>
                    {TIMING_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>基準</label>
                  <select value={editTypeForm.basis} onChange={e => setEditTypeForm(p => ({ ...p, basis: e.target.value }))} style={inputStyle}>
                    {BASIS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 10, color: C.textMid, display: 'block', marginBottom: 2 }}>税</label>
                  <select value={editTypeForm.tax} onChange={e => setEditTypeForm(p => ({ ...p, tax: e.target.value }))} style={inputStyle}>
                    {TAX_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditTypeForm(null)} style={btnGhost}>キャンセル</button>
              <button onClick={handleUpdateType} style={btnPrimary}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
