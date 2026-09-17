create extension if not exists supabase_vault with schema vault;

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

  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    into result
  from vault.decrypted_secrets
  where name in (
    'persora_langfuse_public_key',
    'persora_langfuse_secret_key',
    'persora_langfuse_base_url'
  );

  return result;
end;
$$;

revoke all on function public.get_agentic_demo_secrets() from public;
revoke all on function public.get_agentic_demo_secrets() from anon;
revoke all on function public.get_agentic_demo_secrets() from authenticated;
grant execute on function public.get_agentic_demo_secrets() to service_role;

comment on function public.get_agentic_demo_secrets() is
  'Returns only the allow-listed Persora interview-demo credentials to service-role callers.';
