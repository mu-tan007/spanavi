import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

const btn = (variant = 'default', extra = {}) => ({
  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
  border: variant === 'danger' ? '1px solid #fca5a5' : '1px solid #E5E5E5',
  background: variant === 'danger' ? 'transparent' : variant === 'primary' ? NAVY : '#fff',
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
  const [sheetCreating, setSheetCreating] = useState(null); // client_id
  const [shareModal, setShareModal] = useState(null); // { client, defaultEmail }

  // ポータル認証発行モーダル: { client, mode: 'create'|'reset' }
  const [credentialsModal, setCredentialsModal] = useState(null);
  // 発行結果 (admin に表示するだけ、DB には保存しない)
  const [issuedCredentials, setIssuedCredentials] = useState(null);

  // クライアント名から ID 候補を作る簡易ローマ字化 (admin が編集する前提)
  const suggestUsername = (name) => {
    if (!name) return '';
    // 全角英数 → 半角、英字と数字だけ抜き出す
    const ascii = name.normalize('NFKC').toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return (ascii || 'client') + '2026';
  };

  const callCredsFn = async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_client_credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) throw new Error(payload?.error || text || `HTTP ${res.status}`);
    return payload;
  };

  const load = async () => {
    setLoading(true);
    const { data: clientData, error } = await supabase
      .from('clients')
      .select('id, name, created_at, auth_user_id, portal_username')
      .eq('org_id', getOrgId())
      .order('name');
    if (error) { onToast('クライアントの取得に失敗しました', 'error'); setLoading(false); return; }

    const { data: listData } = await supabase
      .from('call_lists')
      .select('id, name, client_id, created_at')
      .eq('org_id', getOrgId())
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

    // Sheets連携情報を取得
    const { data: sheetsData } = await supabase
      .from('client_sheets')
      .select('client_id, spreadsheet_url, spreadsheet_id, shared_with, last_synced_at')
      .in('client_id', (clientData || []).map(c => c.id));
    const sheetByClient = {};
    (sheetsData || []).forEach(s => { sheetByClient[s.client_id] = s; });

    const enriched = (clientData || []).map(c => ({
      ...c,
      lists: listsByClient[c.id] || [],
      totalItems: (listsByClient[c.id] || []).reduce((s, l) => s + l.itemCount, 0),
      sheet: sheetByClient[c.id] || null,
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

  const handleCreateSheet = async (client, email) => {
    setSheetCreating(client.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-client-sheet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ client_id: client.id, share_email: email }),
        }
      );
      const json = await res.json();
      console.log('[create-client-sheet] response:', res.status, json);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}: ${JSON.stringify(json)}`);
      onToast('Sheets連携を作成しました ✓ 初回同期を実行中...');
      setShareModal(null);
      await load();
      // クリップボードへコピー
      try { await navigator.clipboard.writeText(json.spreadsheet_url); } catch {}
    } catch (e) {
      onToast('Sheets連携に失敗: ' + e.message, 'error');
    }
    setSheetCreating(null);
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
            <div key={client.id} style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', overflow: 'hidden' }}>
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
                      {client.sheet ? (
                        <button
                          onClick={() => window.open(client.sheet.spreadsheet_url, '_blank')}
                          style={btn('primary', { background: '#0F9D58' })}
                          title={`共有先: ${client.sheet.shared_with || '—'}`}
                        >📊 Sheets</button>
                      ) : (
                        <button
                          onClick={() => setShareModal({ client, defaultEmail: 'fujii@noahub.jp' })}
                          style={btn()}
                          disabled={sheetCreating === client.id}
                        >📊 Sheets連携</button>
                      )}
                      <button onClick={() => { setEditClientId(client.id); setEditClientName(client.name); }} style={btn()}>名前編集</button>
                      {client.auth_user_id ? (
                        <button
                          onClick={() => setCredentialsModal({ client, mode: 'reset' })}
                          style={btn()}
                          title={`ID: ${client.portal_username || '(設定なし)'}`}
                        >パスワード再発行</button>
                      ) : (
                        <button
                          onClick={() => setCredentialsModal({ client, mode: 'create' })}
                          style={btn('primary', { background: GOLD })}
                        >ポータル発行</button>
                      )}
                      <button onClick={() => setDeleteConfirm({ type: 'client', item: client })} style={btn('danger')}>削除</button>
                    </>
                  )}
                </div>
              </div>

              {/* リスト展開 */}
              {expanded && (
                <div style={{ borderTop: '1px solid #F3F4F6', background: '#F8F9FA' }}>
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

      {/* Sheets連携モーダル */}
      {shareModal && (
        <div onClick={() => setShareModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, padding: '28px 32px', width: 460, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
              📊 Google Sheets 連携を作成
            </div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
              「{shareModal.client.name}」用のスプレッドシートを作成し、下記メールアドレスに <b>閲覧者（コメント可）</b> で共有します。
            </p>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
              架電結果の更新は約30秒以内にスプレッドシートへ自動反映されます。
            </p>
            <input
              type="email"
              value={shareModal.defaultEmail}
              onChange={e => setShareModal({ ...shareModal, defaultEmail: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, marginBottom: 20 }}
              placeholder="共有先メールアドレス"
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShareModal(null)} style={btn()}>キャンセル</button>
              <button
                onClick={() => handleCreateSheet(shareModal.client, shareModal.defaultEmail)}
                style={btn('primary', { padding: '7px 20px' })}
                disabled={sheetCreating === shareModal.client.id}
              >{sheetCreating === shareModal.client.id ? '作成中...' : '作成して共有'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, padding: '28px 32px', width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>
              {deleteConfirm.type === 'list' ? 'リスト削除の確認' : 'クライアント削除の確認'}
            </div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
              「{deleteConfirm.item.name}」を削除しますか？
            </p>
            <p style={{ fontSize: 12, color: '#EF4444', background: '#FEF2F2', padding: '8px 12px', borderRadius: 4, marginBottom: 20 }}>
              ⚠ このリストに紐づく架電データも全て削除されます。この操作は元に戻せません。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={btn()}>キャンセル</button>
              <button onClick={confirmDelete} style={btn('danger', { padding: '7px 20px' })}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {credentialsModal && (
        <CredentialsModal
          client={credentialsModal.client}
          mode={credentialsModal.mode}
          suggestUsername={suggestUsername}
          onClose={() => { setCredentialsModal(null); setIssuedCredentials(null); }}
          onIssue={async (payload) => {
            try {
              const result = await callCredsFn(payload);
              setIssuedCredentials({
                username: result.username,
                password: result.password,
                clientName: credentialsModal.client.name,
                mode: credentialsModal.mode,
              });
              await load();
            } catch (e) {
              onToast(e?.message || '発行に失敗しました', 'error');
            }
          }}
          issued={issuedCredentials}
        />
      )}
    </div>
  );
}

// ─── ポータル認証発行モーダル ──────────────────────────────
function CredentialsModal({ client, mode, suggestUsername, onClose, onIssue, issued }) {
  const [username, setUsername] = useState(mode === 'create' ? suggestUsername(client.name) : (client.portal_username || ''));
  const [customPw, setCustomPw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const copied = (text) => navigator.clipboard?.writeText(text);

  const handleSubmit = async () => {
    setSubmitting(true);
    const body = { client_id: client.id };
    if (mode === 'create') body.username = username.trim();
    if (mode === 'reset')  body.reset = true;
    if (customPw.trim()) body.password = customPw.trim();
    await onIssue(body);
    setSubmitting(false);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 4, width: '100%', maxWidth: 480,
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D2247' }}>
            {mode === 'create' ? 'ポータル・アカウント発行' : 'パスワード再発行'}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{client.name}</div>
        </div>

        {!issued ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>
              {mode === 'create'
                ? 'ユーザー ID とパスワードを発行します。発行後の画面でコピーし、クライアントにお伝えください (メールは送信されません)。'
                : `現在の ID「${client.portal_username || '(未設定)'}」はそのままで、新しいパスワードを発行します。`}
            </div>

            {mode === 'create' && (
              <label style={{ fontSize: 11, color: '#374151' }}>
                ユーザー ID (半角英小文字+数字+ . _ -)
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase())}
                  placeholder="例: fullerene2026"
                  style={{
                    display: 'block', width: '100%', marginTop: 4,
                    padding: '8px 10px', fontSize: 13,
                    border: '1px solid #E5E5E5', borderRadius: 3, fontFamily: "'JetBrains Mono',monospace",
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            )}

            <label style={{ fontSize: 11, color: '#374151' }}>
              パスワード (空欄なら自動生成・推奨)
              <input
                type="text"
                value={customPw}
                onChange={e => setCustomPw(e.target.value)}
                placeholder="自動生成する場合は空欄のまま"
                style={{
                  display: 'block', width: '100%', marginTop: 4,
                  padding: '8px 10px', fontSize: 13,
                  border: '1px solid #E5E5E5', borderRadius: 3, fontFamily: "'JetBrains Mono',monospace",
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={onClose} disabled={submitting}
                style={{ padding: '7px 14px', border: '1px solid #E5E5E5', background: '#fff', color: '#374151', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={submitting || (mode === 'create' && !username)}
                style={{
                  padding: '7px 18px', border: 'none', background: '#0D2247', color: '#fff',
                  borderRadius: 4, fontSize: 12, fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: submitting || (mode === 'create' && !username) ? 0.5 : 1,
                }}>
                {submitting ? '処理中...' : mode === 'create' ? '発行' : 'パスワード再発行'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', padding: '8px 12px', borderRadius: 4, border: '1px solid #A7F3D0' }}>
              ✓ {issued.mode === 'create' ? 'アカウントを発行しました' : 'パスワードを更新しました'}。以下をクライアントへお伝えください。この画面を閉じた後は再表示できません (再発行は可能)。
            </div>
            <CopyRow label="ログイン URL" value={`${window.location.origin}/client/login`} onCopy={copied} />
            <CopyRow label="ユーザー ID" value={issued.username} onCopy={copied} />
            <CopyRow label="パスワード"  value={issued.password} onCopy={copied} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={onClose}
                style={{ padding: '7px 18px', border: 'none', background: '#0D2247', color: '#fff', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyRow({ label, value, onCopy }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <input readOnly value={value}
          onClick={e => e.currentTarget.select()}
          style={{
            flex: 1, padding: '7px 10px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
            border: '1px solid #E5E5E5', borderRadius: 3, background: '#F9FAFB', boxSizing: 'border-box',
          }} />
        <button onClick={() => { onCopy(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          style={{
            padding: '0 12px', fontSize: 11, fontWeight: 600,
            background: copied ? '#10B981' : '#fff', color: copied ? '#fff' : '#374151',
            border: '1px solid ' + (copied ? '#10B981' : '#E5E5E5'),
            borderRadius: 3, cursor: 'pointer',
          }}>{copied ? '✓ コピー済' : 'コピー'}</button>
      </div>
    </div>
  );
}
