begin;

create extension if not exists pg_net;

-- The outgoing queue contains device credentials and the webhook secret.
revoke select on net.http_request_queue from public, anon, authenticated;

create table if not exists public.pacta_push_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%' and length(endpoint) <= 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  primary key (user_id, endpoint)
);
alter table public.pacta_push_subscriptions enable row level security;
revoke all on table public.pacta_push_subscriptions from public, anon, authenticated;
grant select (user_id, endpoint), delete on public.pacta_push_subscriptions to authenticated;
drop policy if exists pacta_own_push on public.pacta_push_subscriptions;
create policy pacta_own_push on public.pacta_push_subscriptions
  for all to authenticated using (user_id = (select auth.uid()));

create or replace function public.pacta_enable_mobile_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if (select count(distinct name) from vault.decrypted_secrets
      where name in ('pacta_push_url', 'pacta_push_secret') and nullif(decrypted_secret, '') is not null) <> 2 then
    raise exception 'Push configuration unavailable';
  end if;

  perform 1 from auth.users where id = actor for update;
  if (select count(*) from public.pacta_push_subscriptions where user_id = actor) >= 10
    and not exists (select 1 from public.pacta_push_subscriptions where user_id = actor and endpoint = p_endpoint) then
    raise exception 'Device limit reached';
  end if;
  insert into public.pacta_push_subscriptions (user_id, endpoint, p256dh, auth)
  values (actor, p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.pacta_enable_mobile_push(text, text, text) from public, anon;
grant execute on function public.pacta_enable_mobile_push(text, text, text) to authenticated;

create or replace function public.pacta_queue_mobile_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  dispatch_url text;
  dispatch_secret text;
  recipient uuid;
  circle uuid;
  sender uuid;
  kind text;
  notice_id text;
  device record;
begin
  case tg_table_name
    when 'pacta_messages' then
      recipient := new.recipient_id; kind := 'message'; notice_id := new.id::text;
    when 'pacta_debt_notifications' then
      recipient := new.recipient_id; kind := 'debt'; notice_id := new.id::text;
    when 'pacta_group_messages' then
      circle := new.group_id; sender := new.sender_id; kind := 'group_message'; notice_id := new.id::text;
    when 'pacta_friendships' then
      recipient := new.recipient; kind := 'request'; notice_id := new.requester::text;
    when 'pacta_group_members' then
      recipient := new.user_id; kind := 'group_invite'; notice_id := new.group_id::text;
  end case;

  select decrypted_secret into dispatch_url from vault.decrypted_secrets where name = 'pacta_push_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'pacta_push_secret';
  if dispatch_url is null or dispatch_secret is null then return new; end if;

  for device in
    select s.endpoint, s.p256dh, s.auth
    from public.pacta_push_subscriptions s
    where s.user_id = recipient
      or (circle is not null and s.user_id <> sender and exists (
        select 1 from public.pacta_group_members m
        where m.group_id = circle and m.user_id = s.user_id and m.accepted
      ))
  loop
    perform net.http_post(
      url := dispatch_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || dispatch_secret),
      body := jsonb_build_object('endpoint', device.endpoint, 'p256dh', device.p256dh,
        'auth', device.auth, 'kind', kind, 'id', notice_id),
      timeout_milliseconds := 7000
    );
  end loop;
  return new;
exception when others then
  -- An unavailable push service must not roll back a message or debt.
  raise log 'PACTA push queue failed (%)', sqlstate;
  return new;
end;
$$;
revoke execute on function public.pacta_queue_mobile_push() from public, anon, authenticated;

create or replace trigger pacta_message_push after insert on public.pacta_messages
  for each row execute function public.pacta_queue_mobile_push();
create or replace trigger pacta_debt_push after insert on public.pacta_debt_notifications
  for each row execute function public.pacta_queue_mobile_push();
create or replace trigger pacta_group_message_push after insert on public.pacta_group_messages
  for each row execute function public.pacta_queue_mobile_push();
create or replace trigger pacta_friend_request_push after insert on public.pacta_friendships
  for each row when (not new.accepted) execute function public.pacta_queue_mobile_push();
create or replace trigger pacta_group_invite_push after insert on public.pacta_group_members
  for each row when (not new.accepted) execute function public.pacta_queue_mobile_push();

commit;
