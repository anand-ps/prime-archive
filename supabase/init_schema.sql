-- =========================================================
-- File: /supabase/init_schema.sql
-- Purpose:
-- 1. Persist anonymous browser clients
-- 2. Manage resumable client sessions
-- 3. Track analytics events through Edge Functions only
-- 4. Store persistent visitor/admin conversations
-- 5. Enforce database access through privileged backend code
-- =========================================================

create extension if not exists pgcrypto;

------------------------------------------------------------
-- UPDATED_AT TRIGGER HELPER
------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

------------------------------------------------------------
-- CLIENTS
------------------------------------------------------------

create table if not exists public.clients (

    id bigint generated always as identity primary key,

    public_client_id uuid not null unique,

    client_name text,

    browser text not null default '',

    device_type text not null default '',

    timezone text not null default '',

    screen_width integer not null default 0,

    screen_height integer not null default 0,

    referrer text not null default '',

    last_seen_page text not null default '/',

    last_seen_at timestamptz not null default now(),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint clients_screen_width_nonnegative
        check (screen_width >= 0),

    constraint clients_screen_height_nonnegative
        check (screen_height >= 0)
);

------------------------------------------------------------
-- CLIENT SESSIONS
------------------------------------------------------------

create table if not exists public.client_sessions (

    id uuid primary key default gen_random_uuid(),

    client_id bigint not null
        references public.clients (id)
        on delete cascade,

    entry_page text not null default '/',

    last_page text not null default '/',

    started_at timestamptz not null default now(),

    last_activity_at timestamptz not null default now(),

    ended_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint client_sessions_activity_after_start
        check (last_activity_at >= started_at)
);

------------------------------------------------------------
-- CONVERSATIONS
------------------------------------------------------------

create table if not exists public.conversations (

    id uuid primary key default gen_random_uuid(),

    client_id bigint not null
        references public.clients (id)
        on delete cascade,

    active_session_id uuid
        references public.client_sessions (id)
        on delete set null,

    status text not null default 'open',

    closed_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    constraint conversations_status_allowed
        check (status in ('open', 'closed'))
);

------------------------------------------------------------
-- PAGE EVENTS
------------------------------------------------------------

create table if not exists public.page_events (

    id bigint generated always as identity primary key,

    client_id bigint not null
        references public.clients (id)
        on delete cascade,

    session_id uuid
        references public.client_sessions (id)
        on delete set null,

    event_type text not null,

    page_path text not null,

    page_title text not null default '',

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    constraint page_events_event_type_required
        check (length(btrim(event_type)) > 0),

    constraint page_events_page_path_required
        check (length(btrim(page_path)) > 0),

    constraint page_events_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

------------------------------------------------------------
-- MESSAGES
------------------------------------------------------------

create table if not exists public.messages (

    id bigint generated always as identity primary key,

    conversation_id uuid not null
        references public.conversations (id)
        on delete cascade,

    client_id bigint not null
        references public.clients (id)
        on delete cascade,

    session_id uuid
        references public.client_sessions (id)
        on delete set null,

    sender_type text not null,

    message_type text not null default 'text',

    message_text text not null,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    constraint messages_sender_type_allowed
        check (sender_type in ('client', 'admin')),

    constraint messages_message_type_allowed
        check (message_type in ('text')),

    constraint messages_message_text_required
        check (length(btrim(message_text)) > 0),

    constraint messages_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

------------------------------------------------------------
-- INDEXES
------------------------------------------------------------

create index if not exists idx_clients_public_client_id
    on public.clients (public_client_id);

create index if not exists idx_clients_last_seen_at
    on public.clients (last_seen_at desc);

create index if not exists idx_client_sessions_client_activity
    on public.client_sessions (client_id, last_activity_at desc);

create index if not exists idx_client_sessions_last_page
    on public.client_sessions (last_page);

create unique index if not exists idx_conversations_one_open_per_client
    on public.conversations (client_id)
    where status = 'open';

create index if not exists idx_conversations_client_updated
    on public.conversations (client_id, updated_at desc);

create index if not exists idx_page_events_page_path_type_created
    on public.page_events (page_path, event_type, created_at desc);

create index if not exists idx_page_events_client_created
    on public.page_events (client_id, created_at desc);

create index if not exists idx_messages_conversation_created
    on public.messages (conversation_id, created_at asc, id asc);

create index if not exists idx_messages_client_created
    on public.messages (client_id, created_at desc);

------------------------------------------------------------
-- UPDATED_AT TRIGGERS
------------------------------------------------------------

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

drop trigger if exists set_client_sessions_updated_at on public.client_sessions;
create trigger set_client_sessions_updated_at
before update on public.client_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

------------------------------------------------------------
-- ROW LEVEL SECURITY
------------------------------------------------------------

alter table public.clients
enable row level security;

alter table public.clients
force row level security;

alter table public.client_sessions
enable row level security;

alter table public.client_sessions
force row level security;

alter table public.page_events
enable row level security;

alter table public.page_events
force row level security;

alter table public.conversations
enable row level security;

alter table public.conversations
force row level security;

alter table public.messages
enable row level security;

alter table public.messages
force row level security;

------------------------------------------------------------
-- DIRECT PUBLIC TABLE ACCESS LOCKDOWN
------------------------------------------------------------

grant usage on schema public to anon, authenticated;

revoke all on public.clients from anon, authenticated;
revoke all on public.client_sessions from anon, authenticated;
revoke all on public.page_events from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;

revoke all on sequence public.clients_id_seq from anon, authenticated;
revoke all on sequence public.page_events_id_seq from anon, authenticated;
revoke all on sequence public.messages_id_seq from anon, authenticated;

drop policy if exists deny_clients_select on public.clients;
create policy deny_clients_select
on public.clients
for select
to anon, authenticated
using (false);

drop policy if exists deny_clients_insert on public.clients;
create policy deny_clients_insert
on public.clients
for insert
to anon, authenticated
with check (false);

drop policy if exists deny_clients_update on public.clients;
create policy deny_clients_update
on public.clients
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_clients_delete on public.clients;
create policy deny_clients_delete
on public.clients
for delete
to anon, authenticated
using (false);

drop policy if exists deny_client_sessions_select on public.client_sessions;
create policy deny_client_sessions_select
on public.client_sessions
for select
to anon, authenticated
using (false);

drop policy if exists deny_client_sessions_insert on public.client_sessions;
create policy deny_client_sessions_insert
on public.client_sessions
for insert
to anon, authenticated
with check (false);

drop policy if exists deny_client_sessions_update on public.client_sessions;
create policy deny_client_sessions_update
on public.client_sessions
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_client_sessions_delete on public.client_sessions;
create policy deny_client_sessions_delete
on public.client_sessions
for delete
to anon, authenticated
using (false);

drop policy if exists deny_page_events_select on public.page_events;
create policy deny_page_events_select
on public.page_events
for select
to anon, authenticated
using (false);

drop policy if exists deny_page_events_insert on public.page_events;
create policy deny_page_events_insert
on public.page_events
for insert
to anon, authenticated
with check (false);

drop policy if exists deny_page_events_update on public.page_events;
create policy deny_page_events_update
on public.page_events
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_page_events_delete on public.page_events;
create policy deny_page_events_delete
on public.page_events
for delete
to anon, authenticated
using (false);

drop policy if exists deny_conversations_select on public.conversations;
create policy deny_conversations_select
on public.conversations
for select
to anon, authenticated
using (false);

drop policy if exists deny_conversations_insert on public.conversations;
create policy deny_conversations_insert
on public.conversations
for insert
to anon, authenticated
with check (false);

drop policy if exists deny_conversations_update on public.conversations;
create policy deny_conversations_update
on public.conversations
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_conversations_delete on public.conversations;
create policy deny_conversations_delete
on public.conversations
for delete
to anon, authenticated
using (false);

drop policy if exists deny_messages_select on public.messages;
create policy deny_messages_select
on public.messages
for select
to anon, authenticated
using (false);

drop policy if exists deny_messages_insert on public.messages;
create policy deny_messages_insert
on public.messages
for insert
to anon, authenticated
with check (false);

drop policy if exists deny_messages_update on public.messages;
create policy deny_messages_update
on public.messages
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_messages_delete on public.messages;
create policy deny_messages_delete
on public.messages
for delete
to anon, authenticated
using (false);

------------------------------------------------------------
-- NOTES
------------------------------------------------------------

-- Frontend traffic must invoke Edge Functions only.
-- Edge Functions should use the service role key, which bypasses RLS.
-- Legacy tables such as public.page_views or public.chat_messages can be
-- removed separately after data migration if they are no longer needed.
