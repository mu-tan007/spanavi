-- スパキャリ セッション感想テンプレ: 「セッションの時間（長さ）は適切でしたか」(id=duration) を削除
-- むー様指示 2026-06-23。
set local search_path = public, extensions;

update public.spacareer_templates
set content = jsonb_set(
      content,
      '{questions}',
      coalesce((
        select jsonb_agg(q order by ord)
        from jsonb_array_elements(content->'questions') with ordinality as t(q, ord)
        where q->>'id' <> 'duration'
      ), '[]'::jsonb)
    ),
    updated_at = now()
where template_type = 'session_feedback'
  and content ? 'questions'
  and content->'questions' @> '[{"id":"duration"}]';
