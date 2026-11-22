begin;

create table public.pacta_friendships (
  requester uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  check (requester <> recipient)
);
create unique index pacta_friend_pair on public.pacta_friendships (least(requester, recipient), greatest(requester, recipient));
create index pacta_friend_recipient on public.pacta_friendships (recipient);
create index pacta_friend_requester on public.pacta_friendships (requester);

create table public.pacta_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  owner_id uuid not null references auth.users(id) on delete cascade
);
create table public.pacta_group_members (
  group_id uuid not null references public.pacta_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  primary key (group_id, user_id)
);
create index pacta_group_member_user on public.pacta_group_members (user_id);

alter table public.pacta_friendships enable row level security;
alter table public.pacta_groups enable row level security;
alter table public.pacta_group_members enable row level security;
revoke all on public.pacta_friendships, public.pacta_groups, public.pacta_group_members from public, anon, authenticated;

alter table public.shared_debts add column group_id uuid references public.pacta_groups(id) on delete set null;

create function public.pacta_display_name(p_user uuid)
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'), 50), ''), 'Usuario de PACTA')
  from auth.users where id = p_user
$$;
revoke all on function public.pacta_display_name(uuid) from public, anon, authenticated;

create function public.pacta_social()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', peer.id, 'name', public.pacta_display_name(peer.id), 'accepted', f.accepted, 'incoming', f.recipient = auth.uid()
      ) order by public.pacta_display_name(peer.id))
      from public.pacta_friendships f
      cross join lateral (select case when f.requester = auth.uid() then f.recipient else f.requester end as id) peer
      where auth.uid() in (f.requester, f.recipient)
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'owner', g.owner_id = auth.uid(), 'accepted', mine.accepted,
        'members', case when mine.accepted then coalesce((
          select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', public.pacta_display_name(m.user_id)))
          from public.pacta_group_members m where m.group_id = g.id and m.accepted
        ), '[]'::jsonb) else '[]'::jsonb end
      ) order by g.name)
      from public.pacta_group_members mine
      join public.pacta_groups g on g.id = mine.group_id
      where mine.user_id = auth.uid()
    ), '[]'::jsonb)
  )
$$;

create function public.pacta_friend(p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or p_user is null or p_user = actor then raise exception 'Invalid friend'; end if;
  if p_action = 'request' then
    if not exists (select from auth.users where id = p_user and email_confirmed_at is not null) then
      raise exception 'Invalid friend';
    end if;
    insert into public.pacta_friendships (requester, recipient) values (actor, p_user)
    on conflict do nothing;
  elsif p_action = 'accept' then
    update public.pacta_friendships set accepted = true where requester = p_user and recipient = actor;
    if not found then raise exception 'Request unavailable'; end if;
  elsif p_action = 'reject' then
    delete from public.pacta_friendships where requester = p_user and recipient = actor and not accepted;
  else
    raise exception 'Invalid action';
  end if;
end;
$$;

create function public.pacta_request_friend(p_identifier text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  identifier text := lower(btrim(p_identifier));
  other_user uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if identifier ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    select id into other_user from auth.users where id = identifier::uuid and email_confirmed_at is not null;
  elsif char_length(identifier) <= 254 then
    select id into other_user from auth.users where lower(email) = identifier and email_confirmed_at is not null;
  end if;
  if other_user is not null and other_user <> actor then
    perform public.pacta_friend(other_user, 'request');
  end if;
end;
$$;

create function public.pacta_create_group(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  new_group uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  insert into public.pacta_groups (name, owner_id) values (btrim(p_name), actor) returning id into new_group;
  insert into public.pacta_group_members (group_id, user_id, accepted) values (new_group, actor, true);
  return new_group;
end;
$$;

create function public.pacta_group_member(p_group uuid, p_action text, p_user uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_action = 'invite' then
    if not exists (select from public.pacta_groups where id = p_group and owner_id = actor)
      or not exists (select from public.pacta_friendships where accepted
        and least(requester, recipient) = least(actor, p_user) and greatest(requester, recipient) = greatest(actor, p_user))
      then raise exception 'Group invitation unavailable'; end if;
    insert into public.pacta_group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
  elsif p_action = 'accept' then
    update public.pacta_group_members set accepted = true where group_id = p_group and user_id = actor;
    if not found then raise exception 'Group invitation unavailable'; end if;
  elsif p_action = 'reject' then
    delete from public.pacta_group_members where group_id = p_group and user_id = actor and not accepted;
  else
    raise exception 'Invalid action';
  end if;
end;
$$;

create function public.pacta_create_friend_debt(p_title text, p_friend uuid, p_owner_owes boolean, p_cents integer, p_group uuid default null)
returns public.shared_debts language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result public.shared_debts;
begin
  if actor is null or p_friend is null or p_friend = actor
    or not exists (select from public.pacta_friendships where accepted
      and least(requester, recipient) = least(actor, p_friend) and greatest(requester, recipient) = greatest(actor, p_friend))
    then raise exception 'Friendship required'; end if;
  if p_group is not null and (select count(*) from public.pacta_group_members
    where group_id = p_group and accepted and user_id in (actor, p_friend)) <> 2
    then raise exception 'Group membership required'; end if;

  insert into public.shared_debts (owner_id, guest_id, owner_name, guest_name, owner_owes, title, amount_cents, group_id)
  values (actor, p_friend, public.pacta_display_name(actor), public.pacta_display_name(p_friend), p_owner_owes, btrim(p_title), p_cents, p_group)
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.pacta_social(), public.pacta_friend(uuid, text), public.pacta_request_friend(text), public.pacta_create_group(text), public.pacta_group_member(uuid, text, uuid), public.pacta_create_friend_debt(text, uuid, boolean, integer, uuid) from public, anon;
grant execute on function public.pacta_social(), public.pacta_friend(uuid, text), public.pacta_request_friend(text), public.pacta_create_group(text), public.pacta_group_member(uuid, text, uuid), public.pacta_create_friend_debt(text, uuid, boolean, integer, uuid) to authenticated;

commit;
