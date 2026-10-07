import { useState, useEffect } from 'react';
import { color, radius, font, alpha } from '../../../constants/design';
import { Button } from '../../ui';
import ReportRulesEditor from './ReportRulesEditor';
import { daysSince } from '../../../utils/crmOverview';
import { formatCurrency } from '../../../utils/formatters';

// 顧客管理の詳細（右から出す・2026-10-07 見本どおり）。タブは 基本・担当者・報酬・注意事項・聞くこと・条件
// 細かい編集（契約・獲得・停止の記録など）は「詳細ページを開く」から。
const TABS = [
  { key: 'base', label: '基本' },
  { key: 'ppl', label: '担当者' },
  { key: 'fee', label: '報酬' },
  { key: 'cau', label: '注意事項' },
  { key: 'rule', label: '聞くこと・条件' },
];
const box = { border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: '12px 14px' };
const h4 = { fontSize: 12, color: color.textMid, fontWeight: font.weight.medium, margin: '0 0 8px', display: 'flex', justifyContent: 'space-between' };
const hint = { fontSize: 11, color: color.textLight };

function Kv({ rows }) {
  return (
    <dl className="co-kv">
      {rows.filter(Boolean).map(([k, v]) => [<dt key={`k${k}`}>{k}</dt>, <dd key={`v${k}`}>{v || '—'}</dd>])}
    </dl>
  );
}

export default function ClientDrawer({ client: c, today, contacts = [], lists = [], rules = [], reward, engagementRewards = [], monthAppoCount = 0, isAdmin, currentUser, initialTab = 'base', onClose, onOpenPage, onRulesSaved }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); }, [c?._supaId, initialTab]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!c) return null;

  const days = daysSince(c.lastContactAt, today);
  const ruleCount = rules.reduce((n, r) => n + (r.items?.length || 0) + (r.conditions?.length || 0), 0);
  const activeLists = lists.filter(l => !l.is_archived);
  const primary = contacts.find(ct => ct.isPrimary) || contacts[0];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: alpha(color.navyDeep, 0.25), zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div className="co-drawer" onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '100vw', height: '100vh', background: color.white, boxShadow: '-12px 0 40px rgba(1,18,38,0.18)', display: 'flex', flexDirection: 'column', fontFamily: font.family.sans }}>
        <div style={{ padding: '16px 20px 0', borderBottom: `1px solid ${color.borderLight}` }}>
          <div style={{ fontSize: 18, fontWeight: font.weight.bold, color: color.navy, lineHeight: 1.35 }}>{c.company}</div>
          <div style={{ fontSize: 12, color: color.textMid }}>
            {[c.service, primary ? `${primary.name} 様` : '', `最後のやり取り ${days == null ? '記録なし' : days === 0 ? '今日' : `${days}日前`}`].filter(Boolean).join(' ・ ')}
          </div>
          <div className="co-tabs">
            {TABS.map(t => (
              <button key={t.key} type="button" className={tab === t.key ? 'is-on' : ''} onClick={() => setTab(t.key)}>
                {t.label}
                {t.key === 'ppl' && contacts.length > 0 && <span className="co-c">{contacts.length}</span>}
                {t.key === 'cau' && activeLists.length > 0 && <span className="co-c">{activeLists.length}</span>}
                {t.key === 'rule' && ruleCount > 0 && <span className="co-c">{ruleCount}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1 }}>
          {tab === 'base' && (
            <div className="co-pane">
              <Kv rows={[
                ['状態', c.status],
                ['段階', c.stage],
                ['サービス', c.service],
                ['次の一手', c.nextAction ? `${c.nextActionOwner ? `【${c.nextActionOwner}】` : ''}${c.nextAction}${c.nextActionDue ? `（期限 ${c.nextActionDue.replaceAll('-', '/')}）` : ''}` : ''],
                ['止まっている理由', c.blocker],
                ['最後のやり取り', c.lastContactAt ? `${c.lastContactAt.replaceAll('-', '/')}　${[c.lastContactChannel, c.lastContactFrom ? `${c.lastContactFrom}から` : ''].filter(Boolean).join('・')}\n${c.lastContactSummary || ''}` : ''],
                ['連絡の手段', c.contact],
                ['業界', c.industry],
                ['HP', c.hpUrl ? <a href={c.hpUrl} target="_blank" rel="noreferrer" style={{ color: color.navyLight }}>{c.hpUrl}</a> : ''],
              ]} />
              {(c.noteRegular || c.memo) && (
                <div style={box}><div style={h4}><span>メモ</span></div><div style={{ fontSize: 12, color: color.textDark, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{c.noteRegular || c.memo}</div></div>
              )}
            </div>
          )}

          {tab === 'ppl' && (
            <div className="co-pane">
              <div style={box}>
                <div style={h4}><span>先方の担当者</span><span style={hint}>追加・編集は詳細ページで</span></div>
                {contacts.length === 0 && <div style={hint}>担当者が登録されていません</div>}
                {contacts.map(ct => (
                  <div key={ct.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', padding: '8px 0', borderBottom: `1px solid ${color.borderLight}`, fontSize: 13 }}>
                    <span>{ct.name} 様{ct.isPrimary && <span style={{ marginLeft: 6, fontSize: 10, color: color.navy, border: `1px solid ${color.navy}`, borderRadius: 3, padding: '0 4px' }}>主</span>}
                      <span style={{ display: 'block', fontSize: 11, color: color.textLight }}>{ct.email || 'メールなし'}</span></span>
                    <span style={{ fontSize: 11, color: color.textLight, alignSelf: 'center' }}>{[ct.slackMemberId ? 'Slack' : '', ct.schedulingUrl ? '日程調整URL' : ''].filter(Boolean).join('・')}</span>
                  </div>
                ))}
              </div>
              <div style={box}>
                <div style={h4}><span>報告の送り先</span></div>
                <Kv rows={[
                  ['送り方', c.contact || 'メール'],
                  ['Slack', c.slackWebhookUrl ? '設定済み' : '未設定'],
                  ['Chatwork', c.chatworkRoomId ? `ルーム ${c.chatworkRoomId}` : '未設定'],
                  ['1枚資料', 'アポ報告と同時にPDFで添付'],
                ]} />
              </div>
            </div>
          )}

          {tab === 'fee' && (
            <div className="co-pane">
              <Kv rows={[
                ['報酬体系', reward ? `${reward.name}${reward.tax ? `（${reward.tax}）` : ''}` : (c.rewardType || (engagementRewards.length ? '事業ごと（下の表）' : ''))],
                reward?.tiers?.length ? ['単価', reward.tiers.map(t => (t.price ? formatCurrency(t.price) : '')).filter(Boolean).join(' ／ ')] : null,
                c.feeAmount != null ? ['固定の金額', formatCurrency(c.feeAmount)] : null,
                c.monthlyCap != null ? ['月の上限', `${c.monthlyCap}件`] : null,
                ['支払いサイト', c.paySite],
                c.payNote ? ['支払いの補足', c.payNote] : null,
                c.trialTerms ? ['テストの条件', c.trialTerms] : null,
              ]} />
              {engagementRewards.length > 0 && (
                <div style={box}><div style={h4}><span>事業ごとの報酬体系</span></div>
                  <Kv rows={engagementRewards.map(r => [`${r.categoryName} ・ ${r.engName}`, r.rewardName])} />
                </div>
              )}
              <div style={box}><div style={h4}><span>今月</span></div><Kv rows={[['有効アポ', `${monthAppoCount}件`]]} /></div>
            </div>
          )}

          {tab === 'cau' && (
            <div className="co-pane">
              <div style={hint}>架電中に使う注意事項。リストごとに入っている（編集は架電リストの設定から）</div>
              {activeLists.length === 0 && <div style={hint}>稼働中のリストがありません</div>}
              {activeLists.map(l => (
                <div key={l._supaId} style={box}>
                  <div style={h4}><span>{l.industry || '（名前なし）'}</span><span style={hint}>{l.status}{l.count ? ` ・ ${l.count.toLocaleString()}社` : ''}</span></div>
                  <div style={{ fontSize: 12, color: l.cautions ? color.textDark : color.textLight, whiteSpace: 'pre-wrap', lineHeight: 1.7, maxHeight: 220, overflow: 'auto' }}>{l.cautions || '注意事項が入っていません'}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'rule' && (
            <div className="co-pane">
              <ReportRulesEditor client={c} contacts={contacts} lists={lists} rules={rules} isAdmin={isAdmin} currentUser={currentUser} onSaved={onRulesSaved} />
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${color.borderLight}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="outline" size="sm" onClick={onClose}>閉じる</Button>
          <Button variant="secondary" size="sm" onClick={() => onOpenPage(c)}>詳細ページを開く</Button>
        </div>
      </div>
    </div>
  );
}
