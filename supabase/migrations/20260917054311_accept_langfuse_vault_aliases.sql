create or replace function public.get_agentic_demo_secrets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
  result jsonb;
begin
  if caller_role <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'persora_langfuse_public_key', coalesce(
      max(decrypted_secret) filter (where name = 'persora_langfuse_public_key'),
      max(decrypted_secret) filter (where name = 'LANGFUSE_PUBLIC_KEY')
    ),
    'persora_langfuse_secret_key', coalesce(
      max(decrypted_secret) filter (where name = 'persora_langfuse_secret_key'),
      max(decrypted_secret) filter (where name = 'LANGFUSE_SECRET_KEY')
    ),
    'persora_langfuse_base_url', coalesce(
      max(decrypted_secret) filter (where name = 'persora_langfuse_base_url'),
      max(decrypted_secret) filter (where name = 'LANGFUSE_BASE_URL')
    )
  ))
    into result
  from vault.decrypted_secrets
  where name in (
    'persora_langfuse_public_key',
    'persora_langfuse_secret_key',
    'persora_langfuse_base_url',
    'LANGFUSE_PUBLIC_KEY',
    'LANGFUSE_SECRET_KEY',
    'LANGFUSE_BASE_URL'
  );

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_agentic_demo_secrets() from public;
revoke all on function public.get_agentic_demo_secrets() from anon;
revoke all on function public.get_agentic_demo_secrets() from authenticated;
grant execute on function public.get_agentic_demo_secrets() to service_role;
