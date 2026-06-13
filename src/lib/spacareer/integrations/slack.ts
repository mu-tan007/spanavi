// ============================================================
// スパキャリ Slack 連携
// 仕様書 §9.1 Slack連携
// ----------------------------------------------------------------
// 認証情報（Bot Token）は環境変数で管理し、UI から触らない。
// 本フロント側ヘルパーは Edge Function を経由して Slack API を叩く。
//
// Edge Function 一覧:
//   - spacareer-slack-channel-create  : ゲストチャンネル作成
//   - spacareer-slack-notify          : テンプレ通知送信
//
// 既存 supabase/functions/post-to-slack（Webhook 方式）も
// 通知用には流用可能。設定キー: slack_webhook_spacareer
// ============================================================
import { supabase } from '../../supabase';
import { getOrgId } from '../../orgContext';

export type SpacareerSlackNotifyKey =
  | 'permission_granted'        // 診断完了→スパナビ権限付与
  | 'homework_reminder'         // 事後課題未着手3日前
  | 'due_reminder'              // 締切当日
  | 'portal_published'          // クライアントポータル反映完了
  | 'feedback_request';         // セッション後の満足度アンケート案内

const TEMPLATE_VARS = [
  '顧客名',
  'セッション番号',
  'セッション日時',
  '締切日',
  '担当トレーナー',
  'ポータルURL',
] as const;
export type SpacareerSlackTemplateVar = (typeof TEMPLATE_VARS)[number];

export type SpacareerSlackTemplate = {
  key: SpacareerSlackNotifyKey;
  body: string; // {顧客名} などの変数を含むテキスト
};

// ----------------------------------------------------------------
// 1. Slack ゲストチャンネル作成（フルネーム漢字で命名）
// ----------------------------------------------------------------
export type CreateSlackChannelInput = {
  customerId: string;
  channelName: string; // フルネーム漢字（例: 山田太郎）
  inviteEmails?: string[]; // 顧客本人＋担当トレーナー＋運営
};

export type CreateSlackChannelResult = {
  ok: boolean;
  channelId?: string;
  channelName?: string;
  error?: string;
};

export async function createSlackGuestChannel(
  input: CreateSlackChannelInput,
): Promise<CreateSlackChannelResult> {
  const { data, error } = await supabase.functions.invoke('spacareer-slack-channel-create', {
    body: {
      org_id: getOrgId(),
      customer_id: input.customerId,
      channel_name: input.channelName,
      invite_emails: input.inviteEmails ?? [],
    },
  });
  if (error) {
    console.error('[spacareer/slack] createSlackGuestChannel error:', error);
    return { ok: false, error: (error as { message?: string }).message ?? 'unknown' };
  }
  if (!data?.ok) {
    return { ok: false, error: data?.error || 'channel creation failed' };
  }

  // spacareer_slack_channels に保存
  const { error: dbErr } = await supabase
    .from('spacareer_slack_channels')
    .insert({
      org_id: getOrgId(),
      customer_id: input.customerId,
      channel_id: data.channel_id,
      channel_name: data.channel_name,
    });
  if (dbErr) console.error('[DB] spacareer_slack_channels insert error:', dbErr);

  return {
    ok: true,
    channelId: data.channel_id,
    channelName: data.channel_name,
  };
}

// ----------------------------------------------------------------
// 2. テンプレ通知送信
// ----------------------------------------------------------------
export type NotifySlackInput = {
  customerId: string;
  notifyKey: SpacareerSlackNotifyKey;
  vars?: Partial<Record<SpacareerSlackTemplateVar, string>>;
  customMessage?: string; // 指定があればテンプレを使わず直接送信
};

export type NotifySlackResult = {
  ok: boolean;
  error?: string;
};

export async function notifySlackChannel(
  input: NotifySlackInput,
): Promise<NotifySlackResult> {
  const { data, error } = await supabase.functions.invoke('spacareer-slack-notify', {
    body: {
      org_id: getOrgId(),
      customer_id: input.customerId,
      notify_key: input.notifyKey,
      vars: input.vars ?? {},
      custom_message: input.customMessage ?? null,
    },
  });
  if (error) {
    console.error('[spacareer/slack] notifySlackChannel error:', error);
    return { ok: false, error: (error as { message?: string }).message ?? 'unknown' };
  }
  return { ok: !!data?.ok, error: data?.error };
}

// ----------------------------------------------------------------
// 3. テンプレ変数 substitution（フロント側プレビュー用）
// ----------------------------------------------------------------
export function renderTemplateBody(
  body: string,
  vars: Partial<Record<SpacareerSlackTemplateVar, string>>,
): string {
  return TEMPLATE_VARS.reduce((acc, key) => {
    const v = vars[key] ?? '';
    return acc.split(`{${key}}`).join(v);
  }, body);
}

export const SPACAREER_SLACK_TEMPLATE_VARS = TEMPLATE_VARS;
