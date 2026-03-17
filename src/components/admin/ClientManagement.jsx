import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

const btn = (variant = 'default', extra = {}) => ({
  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
  border: variant === 'danger' ? '1px solid #fca5a5' : '1px solid #E5E5E5',
  background: variant === 'danger' ? '#fee2e2' : variant === 'primary' ? NAVY : '#fff',
  color: variant === 'danger' ? '#dc2626' : variant === 'primary' ? '#fff' : '#374151',
  ...extra,
});

export default function ClientManagement({ onToast }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [editClientId, setEditClientId] = useState(null);
  const [editClientName, setEditClientName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'client'|'list', item }

  const load = async () => {
    setLoading(true);
    const { data: clientData, error } = await supabase
      .from('clients')
      .select('id, name, created_at')
      .eq('org_id', ORG_ID)
      .order('name');
    if (error) { onToast('クライアントの取得に失敗しました', 'error'); setLoading(false); return; }

    const { data: listData } = await supabase
      .from('call_lists')
      .select('id, name, client_id, created_at')
      .eq('org_id', ORG_ID)
      .order('name');

    // アイテム数を取得
    const { data: itemCounts } = await supabase
      .from('call_list_items')
      .select('list_id')
      .in('list_id', (listData || []).map(l => l.id));

    const countByList = {};
    (itemCounts || []).forEach(i => { countByList[i.list_id] = (countByList[i.list_id] || 0) + 1; });

    const listsByClient = {};
    (listData || []).forEach(l => {
      if (!listsByClient[l.client_id]) listsByClient[l.client_id] = [];
      listsByClient[l.client_id].push({ ...l, itemCount: countByList[l.id] || 0 });
    });

    const enriched = (clientData || []).map(c => ({
      ...c,
      lists: listsByClient[c.id] || [],
      totalItems: (listsByClient[c.id] || []).reduce((s, l) => s + l.itemCount, 0),
    }));

    setClients(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveClientName = async (id) => {
    if (!editClientName.trim()) return;
    const { error } = await supabase.from('clients').update({ name: editClientName.trim() }).eq('id', id);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    setClients(prev => prev.map(c => c.id === id ? { ...c, name: editClientName.trim() } : c));
    setEditClientId(null);
    onToast('クライアント名を更新しました ✓');
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { type, item } = deleteConfirm;

    if (type === 'list') {
      const { error } = await supabase.from('call_lists').delete().eq('id', item.id);
      if (error) { onToast('リスト削除に失敗しました', 'error'); setDeleteConfirm(null); return; }
      setClients(prev => prev.map(c => ({
        ...c,
        lists: c.lists.filter(l => l.id !== item.id),
        totalItems: c.id === item.client_id ? c.totalItems - item.itemCount : c.totalItems,
      })));
      onToast('リストを削除しました ✓');
    } else {
      const { error } = await supabase.from('clients').delete().eq('id', item.id);
      if (error) { onToast('クライアント削除に失敗しました', 'error'); setDeleteConfirm(null); return; }
      setClients(prev => prev.filter(c => c.id !== item.id));
      onToast('クライアントを削除しました ✓');
    }
    setDeleteConfirm(null);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>読み込み中...</div>;

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>
        クライアント一覧（{clients.length}件）
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {clients.map(client => {
          const expanded = expandedIds.has(client.id);
          const isEditingName = editClientId === client.id;
          return (
            <div key={client.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E5E5', overflow: 'hidden' }}>
              {/* クライアント行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => !isEditingName && toggleExpand(client.id)}>
                <span style={{ color: expanded ? NAVY : '#9CA3AF', fontSize: 12, transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', width: 16, flexShrink: 0 }}>▶</span>

                {isEditingName ? (
                  <input
                    value={editClientName}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setEditClientName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveClientName(client.id); if (e.key === 'Escape') setEditClientId(null); }}
                    autoFocus
                    style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #6366F1', fontSize: 13, fontWeight: 600 }}
                  />
                ) : (
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#111827' }}>{client.name}</span>
                )}

                <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                  リスト {client.lists.length}件 / 計 {client.totalItems.toLocaleString()}社
                </span>
                <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
                  {client.created_at ? new Date(client.created_at).toLocaleDateString('ja-JP') : '—'}
                </span>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {isEditingName ? (
                    <>
                      <button onClick={() => saveClientName(client.id)} style={btn('primary')}>保存</button>
                      <button onClick={() => setEditClientId(null)} style={btn()}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditClientId(client.id); setEditClientName(client.name); }} style={btn()}>名前編集</button>
                      <button onClick={() => setDeleteConfirm({ type: 'client', item: client })} style={btn('danger')}>削除</button>
                    </>
                  )}
                </div>
              </div>

              {/* リスト展開 */}
              {expanded && (
                <div style={{ borderTop: '1px solid #F3F4F6', background: '#FAFAFA' }}>
                  {client.lists.length === 0 ? (
                    <div style={{ padding: '12px 44px', fontSize: 12, color: '#9CA3AF' }}>リストなし</div>
                  ) : (
                    client.lists.map(list => (
                      <div key={list.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 44px', borderBottom: '1px solid #F3F4F6' }}>
                        <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{list.name}</span>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>{list.itemCount.toLocaleString()}社</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {list.created_at ? new Date(list.created_at).toLocaleDateString('ja-JP') : '—'}
                        </span>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'list', item: { ...list, client_id: client.id } })}
                          style={btn('danger')}
                        >
                          削除
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>
              {deleteConfirm.type === 'list' ? 'リスト削除の確認' : 'クライアント削除の確認'}
            </div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
              「{deleteConfirm.item.name}」を削除しますか？
            </p>
            <p style={{ fontSize: 12, color: '#EF4444', background: '#FEF2F2', padding: '8px 12px', borderRadius: 6, marginBottom: 20 }}>
              ⚠ このリストに紐づく架電データも全て削除されます。この操作は元に戻せません。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={btn()}>キャンセル</button>
              <button onClick={confirmDelete} style={btn('danger', { padding: '7px 20px' })}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
