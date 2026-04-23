import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toRomaji } from 'wanakana';

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

  // クライアント名から ID 候補を作る。
  //   1. 全角→半角に正規化
  //   2. 法人格 (株式会社 / 合同会社 / 有限会社 / (株) / (有) 等) を除去
  //   3. wanakana で 平仮名・片仮名 → ローマ字。漢字は変換不可なので残る。
  //   4. 残った非 ASCII を除去し、小文字 + 英数に整形
  //   5. 有効な ID が作れなければ空文字 (admin に手入力させる)
  const suggestUsername = (name) => {
    if (!name) return '';
    const norm = name.normalize('NFKC');
    // 法人格除去
    const stripped = norm
      .replace(/株式会社|合同会社|有限会社|合資会社|一般社団法人|公益社団法人|医療法人|学校法人|\(株\)|\(有\)|\(合\)/g, '')
      .trim();
    // 平仮名/片仮名だけローマ字化 (漢字は変換不可なので残る)
    const romaji = toRomaji(stripped, { IMEMode: false });
    const ascii = romaji.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ascii.length < 2) return '';          // 漢字のみ等で変換できなかった場合
    return `${ascii.slice(0, 30)}2026`;        // 長すぎる場合は 30 文字で打ち切り
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

                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
                  {isEditingName ? (
                    <>
                      <button onClick={() => saveClientName(client.id)} style={btn('primary')}>保存</button>
                      <button onClick={() => setEditClientId(null)} style={btn()}>✕</button>
                    </>
                  ) : (
                    <>
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
                {!username && (
                  <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: '#B45309', background: '#FFFBEB', padding: '4px 8px', borderRadius: 3, border: '1px solid #FCD34D' }}>
                    社名のローマ字表記を入力してください (例: {suggestUsername('フラーレン') || 'fullerene'}2026)
                  </span>
                )}
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
          <IssuedCredentialsView
            issued={issued}
            clientName={client.name}
            onClose={onClose}
            onCopy={copied}
          />
        )}
      </div>
    </div>
  );
}

// 発行完了後のビュー: 3 行コピー + メール文案生成
function IssuedCredentialsView({ issued, clientName, onClose, onCopy }) {
  const [showMail, setShowMail] = useState(false);
  const [mailCopied, setMailCopied] = useState(false);
  const portalUrl = 'https://spanavi.jp/client/login';

  const subject = '【Spanavi】クライアントポータルご案内のお知らせ';
  const body = buildMailBody({ clientName, portalUrl, username: issued.username, password: issued.password });

  const handleCopyMail = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setMailCopied(true);
      setTimeout(() => setMailCopied(false), 1500);
    } catch {
      // fallback: select the textarea
    }
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', padding: '8px 12px', borderRadius: 4, border: '1px solid #A7F3D0' }}>
        ✓ {issued.mode === 'create' ? 'アカウントを発行しました' : 'パスワードを更新しました'}。以下をクライアントへお伝えください。この画面を閉じた後は再表示できません (再発行は可能)。
      </div>
      <CopyRow label="ログイン URL" value={portalUrl} onCopy={onCopy} />
      <CopyRow label="ユーザー ID" value={issued.username} onCopy={onCopy} />
      <CopyRow label="パスワード"  value={issued.password} onCopy={onCopy} />

      {showMail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <div style={{ fontSize: 10, color: '#6B7280' }}>
            件名: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{subject}</span>
          </div>
          <textarea
            readOnly
            value={body}
            rows={16}
            style={{
              width: '100%', padding: 10, fontSize: 11,
              fontFamily: "'Noto Sans JP', 'JetBrains Mono', monospace",
              border: '1px solid #E5E5E5', borderRadius: 3, background: '#F9FAFB',
              resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-start' }}>
            <button onClick={handleCopyMail}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: mailCopied ? '#10B981' : '#0D2247', color: '#fff',
                border: 'none', borderRadius: 3, cursor: 'pointer',
              }}>{mailCopied ? '✓ コピーしました' : '本文をコピー'}</button>
            <a href={mailtoHref}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: '#fff', color: '#0D2247',
                border: '1px solid #E5E5E5', borderRadius: 3, cursor: 'pointer',
                textDecoration: 'none',
              }}>メーラーで開く</a>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button onClick={() => setShowMail(v => !v)}
          style={{
            padding: '7px 14px', fontSize: 11, fontWeight: 600,
            background: showMail ? '#F3F4F6' : '#fff', color: '#0D2247',
            border: '1px solid #E5E5E5', borderRadius: 4, cursor: 'pointer',
          }}>
          {showMail ? '閉じる' : 'メール文案を自動生成'}
        </button>
        <button onClick={onClose}
          style={{ padding: '7px 18px', border: 'none', background: '#0D2247', color: '#fff', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          閉じる
        </button>
      </div>
    </div>
  );
}

function buildMailBody({ clientName, portalUrl, username, password }) {
  return `${clientName || '貴社'} 御中

平素より大変お世話になっております。
M&Aソーシングパートナーズの篠宮でございます。

この度、貴社にご依頼いただいておりますM&A候補先へのアプローチ状況を
リアルタイムでご確認いただける、弊社CTIツール「Spanavi (スパナビ)」の
クライアントポータルをご用意いたしました。

ログイン情報は下記の通りでございます。


━━━━━━━━━━━━━━━━━━━━━━
▼ ログイン情報
━━━━━━━━━━━━━━━━━━━━━━
 URL      : ${portalUrl}
 ユーザーID : ${username}
 パスワード : ${password}


━━━━━━━━━━━━━━━━━━━━━━
▼ ポータルでご確認いただける内容
━━━━━━━━━━━━━━━━━━━━━━

◎ 架電結果
  ・総架電件数 / 社長接続数 / 社長接続率
  ・アポ獲得数 / アポ獲得率
  ・リスト別の詳細集計 (業種ごとの成果)
  ・日別の架電件数グラフ
  ・各企業への架電履歴
   (何回目にどのステータスだったか、対応者まで表示)
  ・Excel 形式でのダウンロード

◎ 獲得アポの詳細
  ・取得したアポ企業の一覧
   (企業名 / 業種 / 売上高 / エリア / 面談日 / ステータス)
  ・社長のM&A意向の内訳
   (前向き / 様子見 / 消極的 / 不明)
  ・エリア分布・売上高レンジ分布のグラフ
  ・キャンセル / リスケジュール件数

◎ 期間の切替
  ・トータル / 月次 / 週次 / 日次 で自由に切替可能
  ・任意の月・週・日のデータにフォーカスして分析いただけます


━━━━━━━━━━━━━━━━━━━━━━
▼ ご利用にあたって
━━━━━━━━━━━━━━━━━━━━━━
・上記URLよりログインをお願いいたします
・パスワードの再発行をご希望の場合は弊社までご連絡ください
・ご不明点・ご要望等ございましたらお気軽にお申し付けください


本ポータルを通じて、貴社の買収戦略推進の一助となれば幸いでございます。
引き続き、何卒よろしくお願い申し上げます。

─────────────────────────
M&Aソーシングパートナーズ株式会社
代表取締役 篠宮 拓武
E-mail: shinomiya@ma-sp.co
─────────────────────────
`;
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
