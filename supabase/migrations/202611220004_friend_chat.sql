begin;

create table public.pacta_messages (
  id uuid primary key,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index pacta_messages_pair_history
  on public.pacta_messages (sender_id, recipient_id, created_at desc, id desc);

create function public.pacta_can_message(p_peer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.pacta_friendships
    where accepted
      and least(requester, recipient) = least(auth.uid(), p_peer)
      and greatest(requester, recipient) = greatest(auth.uid(), p_peer)
  )
$$;

revoke execute on function public.pacta_can_message(uuid) from public, anon;
grant execute on function public.pacta_can_message(uuid) to authenticated;

alter table public.pacta_messages enable row level security;
revoke all on public.pacta_messages from public, anon, authenticated;
grant select, insert (id, recipient_id, body) on public.pacta_messages to authenticated;

create policy "Participants can read their messages" on public.pacta_messages
  for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));

create policy "Friends can send messages" on public.pacta_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and public.pacta_can_message(recipient_id)
  );

commit;
