create table public.agentic_demo_approvals (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  thread_id text not null,
  request_message text not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.agentic_demo_approvals enable row level security;
revoke all on table public.agentic_demo_approvals from public, anon, authenticated;
grant select, insert, update on table public.agentic_demo_approvals to service_role;

comment on table public.agentic_demo_approvals is
  'Server-only, session-bound decisions for the Persora interview demo; never represents a Netflix-side mutation.';
