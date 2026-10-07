import { useEffect, useState } from 'react';
import './SettingsOverview.css';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';

// 設定（2026-10-07 むー様決定）：設定の変更は基本は Claude Code のターミナルで行う。
// ここに残すのは「連携が設定してあるかの確認」と「いまの値の確認」だけ。
// ポータル発行は顧客管理の詳細へ、メンバーの追加と権限はメンバーのページへ移した。

const LINKS = [
  { key: 'slack', label: 'Slack', mark: 'S', bg: '#4A154B', note: 'アポ報告・事前確認・架電報告・ランキング', keys: ['slack_webhook_precheck', 'slack_webhook_keiden', 'slack_webhook_ranking'] },
  { key: 'zoom', label: 'Zoom Phone', mark: 'Z', bg: '#0B5CFF', note: '架電と録音', keys: ['zoom_account_id', 'zoom_client_id', 'zoom_client_secret'] },
  { key: 'chatwork', label: 'Chatwork', mark: 'C', bg: '#E8383D', note: 'アポ報告（Chatworkのクライアント）', keys: ['chatwork_api_token'] },
];

const GONE = [
  ['KPI目標', '「10月の目標をアポ45件に」'],
  ['報酬・給与設定', '「スパルタンの率を27%に」'],
  ['事業設定（ランク・役割・通知先）', '「通知先を#営業代行に」'],
  ['アポ取得報告テンプレ', '「◯◯様のテンプレに売上高を足して」'],
  ['業務委託契約書テンプレ', '「契約書の第5条を直して」'],
  ['架電設定', '最初に1回だけ'],
  ['タイプ仕分け', 'リストを足したとき'],
  ['組織設定・事業マスタ・商材マスタ', '最初に1回だけ'],
  ['Slack・Zoom の値', 'Webhook や鍵を変えるとき'],
];

export default function SettingsOverview({ engagementId, onGo, onOpenLegacy }) {
  const [vals, setVals] = useState(null);
  const [ranks, setRanks] = useState([]);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.from('org_settings').select('setting_key, setting_value').eq('org_id', getOrgId())
      .then(({ data }) => { if (alive) setVals(Object.fromEntries((data || []).map(r => [r.setting_key, !!(r.setting_value && String(r.setting_value).trim())]))); });
    if (engagementId) {
      supabase.from('engagement_ranks').select('id, name, display_order, default_incentive_rate').eq('engagement_id', engagementId).order('display_order')
        .then(({ data }) => { if (alive) setRanks(data || []); });
    }
    return () => { alive = false; };
  }, [engagementId]);
  const ask = '「プレイヤーの率を25%にして」';
  return (
    <div className="so">
      <div className="so-card so-lead"><span className="so-t">&gt;_</span><div><b>設定の変更は、基本は Claude Code のターミナルで</b><span>率・ランク・テンプレ・マスタなどは、ここを開かずにターミナルで「○○を△△に変えて」と頼む。ここには、連携が設定してあるかと、いまの値の確認だけを残す</span></div></div>

      <div className="so-sec"><b>ここに残すもの</b><span>2つ</span></div>
      <div className="so-grid2">
        <div className="so-card so-pad">
          <h4><span>連携</span><span>設定してあるか（値を変えるときはターミナルで）</span></h4>
          {LINKS.map(l => {
            const ok = vals ? l.keys.every(k => vals[k]) : null;
            return (
              <div key={l.key} className="so-cn"><span className="so-lg" style={{ background: l.bg }}>{l.mark}</span><span>{l.label}<small>{l.note}</small></span>
                <span className={`so-st ${ok == null ? '' : ok ? 'ok' : 'ng'}`}>{ok == null ? '確認中' : ok ? '設定済み' : '未設定'}</span></div>
            );
          })}
        </div>
        <div className="so-card so-pad">
          <h4><span>いまの値（見るだけ）</span><span>変えるときはターミナルで</span></h4>
          {ranks.length > 0 && (
            <div className="so-ladder">{ranks.map(r => <i key={r.id}>{r.name}<b>{r.default_incentive_rate != null ? `${Math.round(Number(r.default_incentive_rate) * 100)}%` : '—'}</b></i>)}</div>
          )}
          <div className="so-r1"><span>報酬の流れ</span><b>月末締め → 翌月20日に確定 → 月末に振込</b></div>
          <div className="so-r1"><span>アポ報告のテンプレ</span><b>クライアントごと</b></div>
          <div className="so-ask"><span>例）{ask}</span><button type="button" onClick={() => { try { navigator.clipboard.writeText(ask.replace(/[「」]/g, '')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 写せなくても困らない */ } }}>{copied ? '写しました' : '頼み方を写す'}</button></div>
        </div>
      </div>

      <div className="so-sec"><b>ほかのページへ移したもの</b><span>日常で使うので、その場で押せるように</span></div>
      <div className="so-card" style={{ padding: '4px 16px' }}>
        <div className="so-mv"><span>クライアントポータルの発行<small>ID・パスワード・案内メールの文案</small></span><em>→</em><span><button type="button" onClick={() => onGo('crm')}>顧客管理</button> の詳細に「ポータル」タブ<small>その会社を開いて、その場で発行</small></span></div>
        <div className="so-mv"><span>メンバーの追加・見られるページの権限<small>入社のたびに使う</small></span><em>→</em><span><button type="button" onClick={() => onGo('members')}>メンバー</button> の「メンバーを追加」「見られるページ」<small>追加と権限を1か所で</small></span></div>
      </div>

      <div className="so-sec"><b>外したもの</b><span>Claude Code のターミナルで変える</span></div>
      <div className="so-gone">{GONE.map(([t, s]) => <div key={t} className="so-gn"><b>{t}</b><span>{s}</span></div>)}</div>
      <div style={{ textAlign: 'right', marginTop: 10 }}><button type="button" className="so-legacy" onClick={onOpenLegacy}>以前の設定画面を開く（ターミナルが使えないとき）</button></div>
    </div>
  );
}
