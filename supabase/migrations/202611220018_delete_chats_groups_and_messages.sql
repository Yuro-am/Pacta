begin;

create table public.pacta_chat_clears (
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id uuid not null references auth.users(id) on delete cascade,
  cleared_at timestamptz not null,
  primary key (user_id, peer_id)
);
alter table public.pacta_chat_clears enable row level security;
revoke all on public.pacta_chat_clears from public, anon, authenticated;

create function public.pacta_chat_cleared_at(p_peer uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce((
    select cleared_at from public.pacta_chat_clears
    where user_id = auth.uid() and peer_id = p_peer
  ), '-infinity'::timestamptz)
$$;

create function public.pacta_clear_chat(p_peer uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_peer is null or p_peer = auth.uid() then
    raise exception 'Invalid chat' using errcode = '22023';
  end if;

  insert into public.pacta_chat_clears as clears (user_id, peer_id, cleared_at)
  values (auth.uid(), p_peer, statement_timestamp())
  on conflict (user_id, peer_id) do update
    set cleared_at = greatest(clears.cleared_at, excluded.cleared_at);
end;
$$;

alter policy "Participants can read their messages" on public.pacta_messages using (
  ((select auth.uid()) = sender_id and created_at > public.pacta_chat_cleared_at(recipient_id))
  or ((select auth.uid()) = recipient_id and created_at > public.pacta_chat_cleared_at(sender_id))
);

create function public.pacta_delete_chat_message(p_message uuid, p_group boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  if p_group then
    delete from public.pacta_group_messages
    where id = p_message and sender_id = auth.uid() and public.pacta_is_group_member(group_id);
  else
    delete from public.pacta_messages where id = p_message and sender_id = auth.uid();
  end if;

  if not found then raise exception 'Message unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.pacta_delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.pacta_groups where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'Group unavailable' using errcode = '42501'; end if;
end;
$$;

revoke execute on function public.pacta_chat_cleared_at(uuid), public.pacta_clear_chat(uuid),
  public.pacta_delete_chat_message(uuid, boolean), public.pacta_delete_group(uuid) from public, anon;
grant execute on function public.pacta_chat_cleared_at(uuid), public.pacta_clear_chat(uuid),
  public.pacta_delete_chat_message(uuid, boolean), public.pacta_delete_group(uuid) to authenticated;

create or replace function public.pacta_inbox()
returns jsonb language sql stable security definer set search_path = '' as $$
  with my_messages as (
    select recipient_id as peer, body, created_at, id, true as mine, false as unread
    from public.pacta_messages where sender_id = auth.uid()
      and created_at > public.pacta_chat_cleared_at(recipient_id)
    union all
    select sender_id as peer, body, created_at, id, false as mine, read_at is null as unread
    from public.pacta_messages where recipient_id = auth.uid()
      and created_at > public.pacta_chat_cleared_at(sender_id)
  ), latest as (
    select distinct on (peer) peer, body, created_at, mine from my_messages
    order by peer, created_at desc, id desc
  ), unread as (
    select peer, count(*) as total from my_messages where unread group by peer
  ), conversations as (
    select latest.*, coalesce(unread.total, 0) as unread_count
    from latest left join unread using (peer)
    order by (coalesce(unread.total, 0) > 0) desc, latest.created_at desc
    limit 30
  ), notices as (
    select n.*, d.title
    from public.pacta_debt_notifications n
    join public.shared_debts d on d.id = n.debt_id
    where d.trashed_at is null and n.recipient_id = auth.uid()
    order by (n.read_at is null) desc, n.created_at desc
    limit 30
  )
  select jsonb_build_object(
    'conversations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', peer, 'name', public.pacta_display_name(peer), 'body', body,
      'created_at', created_at, 'mine', mine, 'unread_count', unread_count
    ) order by (unread_count > 0) desc, created_at desc) from conversations), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'debt_id', debt_id, 'kind', kind, 'title', title,
      'name', public.pacta_display_name(actor_id), 'created_at', created_at, 'unread', read_at is null
    ) order by (read_at is null) desc, created_at desc) from notices), '[]'::jsonb),
    'unread_messages', coalesce((select sum(total) from unread), 0),
    'unread_debts', (select count(*) from public.pacta_debt_notifications n join public.shared_debts d on d.id = n.debt_id where n.recipient_id = auth.uid() and n.read_at is null and d.trashed_at is null)
  )
$$;

commit;
