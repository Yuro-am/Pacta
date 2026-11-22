begin;

create function public.pacta_is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.pacta_group_members
    where group_id = p_group and user_id = auth.uid() and accepted
  )
$$;

revoke execute on function public.pacta_is_group_member(uuid) from public, anon;
grant execute on function public.pacta_is_group_member(uuid) to authenticated;

create table public.pacta_group_messages (
  id uuid primary key,
  group_id uuid not null references public.pacta_groups(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  audio_path text unique,
  created_at timestamptz not null default now(),
  check (
    audio_path is null or (
      audio_path ~ ('^groups/' || group_id::text || '/' || sender_id::text || '/' || id::text || '[.](webm|mp4|ogg|wav)$')
      and body = 'Mensaje de voz'
    )
  )
);
create index pacta_group_messages_history on public.pacta_group_messages (group_id, created_at desc, id desc);

alter table public.pacta_group_messages enable row level security;
revoke all on public.pacta_group_messages from public, anon, authenticated;
grant select, insert (id, group_id, body, audio_path) on public.pacta_group_messages to authenticated;

create policy "PACTA accepted members can read group messages"
on public.pacta_group_messages for select to authenticated using (public.pacta_is_group_member(group_id));

create policy "PACTA accepted members can send their own group messages"
on public.pacta_group_messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and public.pacta_is_group_member(group_id)
);

create policy "PACTA group members can upload their own voice notes"
on storage.objects for insert to authenticated with check (
  bucket_id = 'pacta-voice'
  and name ~ '^groups/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f-]{36}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}[.](webm|mp4|ogg|wav)$'
  and split_part(name, '/', 3) = (select auth.uid())::text
  and public.pacta_is_group_member(
    case when split_part(name, '/', 2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then split_part(name, '/', 2)::uuid end
  )
);

create policy "PACTA group members can download sent group voice notes"
on storage.objects for select to authenticated using (
  bucket_id = 'pacta-voice'
  and exists (
    select 1 from public.pacta_group_messages m
    where m.audio_path = storage.objects.name and public.pacta_is_group_member(m.group_id)
  )
);

commit;
