begin;

create table if not exists public.academy_progress (
    user_id uuid primary key references auth.users(id) on delete cascade,
    revision bigint not null default 1 check (revision > 0),
    generation bigint not null default 0 check (generation >= 0),
    data jsonb not null check (
        (pg_catalog.jsonb_typeof(data) = 'object'
        and data -> 'version' = '1'::jsonb
        and pg_catalog.jsonb_typeof(data -> 'lessons') = 'object'
        and pg_catalog.octet_length(data::text) <= 2000000) is true
    )
);

alter table public.academy_progress enable row level security;

revoke all on table public.academy_progress from public, anon, authenticated;
grant select on table public.academy_progress to authenticated;

drop policy if exists academy_progress_read_own on public.academy_progress;
create policy academy_progress_read_own on public.academy_progress
    for select to authenticated
    using ((select auth.uid()) = user_id);

create or replace function public.save_academy_progress(
    account_id uuid,
    expected_revision bigint,
    progress_payload jsonb,
    replace_progress boolean
)
returns table (revision bigint, generation bigint, data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := auth.uid();
    generation_change integer := case when replace_progress then 1 else 0 end;
begin
    if caller_id is null or caller_id is distinct from account_id then
        raise exception 'Progress belongs to another account' using errcode = '42501';
    end if;
    if expected_revision = 0 then
        return query
        insert into public.academy_progress as progress (user_id, generation, data)
        values (caller_id, generation_change, progress_payload)
        on conflict (user_id) do nothing
        returning progress.revision, progress.generation, progress.data;
    else
        return query
        update public.academy_progress as progress
        set revision = progress.revision + 1,
            generation = progress.generation + generation_change,
            data = progress_payload
        where progress.user_id = caller_id and progress.revision = expected_revision
        returning progress.revision, progress.generation, progress.data;
    end if;
end;
$$;

revoke all on function public.save_academy_progress(uuid, bigint, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_academy_progress(uuid, bigint, jsonb, boolean) to authenticated;

commit;
