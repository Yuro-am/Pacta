begin;

create table public.pacta_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$')
);
alter table public.pacta_usernames enable row level security;
revoke all on public.pacta_usernames from public, anon, authenticated;

create function public.pacta_my_username()
returns text language sql stable security definer set search_path = '' as $$
  select username from public.pacta_usernames where user_id = auth.uid()
$$;

create function public.pacta_set_username(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  handle text := lower(btrim(p_username));
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if handle is null or handle !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;

  insert into public.pacta_usernames (user_id, username)
  values (actor, handle)
  on conflict (user_id) do update set username = excluded.username;
  return handle;
end;
$$;

create or replace function public.pacta_request_friend(p_identifier text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  handle text := regexp_replace(lower(btrim(p_identifier)), '^@', '');
  other_user uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select user_id into other_user from public.pacta_usernames where username = handle;
  if other_user is not null and other_user <> actor then
    insert into public.pacta_friendships (requester, recipient) values (actor, other_user)
    on conflict do nothing;
  end if;
end;
$$;

revoke execute on function public.pacta_my_username(), public.pacta_set_username(text), public.pacta_request_friend(text) from public, anon;
grant execute on function public.pacta_my_username(), public.pacta_set_username(text), public.pacta_request_friend(text) to authenticated;

create or replace function public.pacta_social()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', peer.id, 'name', public.pacta_display_name(peer.id), 'username', account.username, 'accepted', f.accepted, 'incoming', f.recipient = auth.uid()
      ) order by public.pacta_display_name(peer.id))
      from public.pacta_friendships f
      cross join lateral (select case when f.requester = auth.uid() then f.recipient else f.requester end as id) peer
      left join public.pacta_usernames account on account.user_id = peer.id
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

commit;
