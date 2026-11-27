begin;

create or replace function public.pacta_queue_mobile_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  dispatch_url text;
  dispatch_secret text;
  recipient uuid;
  circle uuid;
  sender uuid;
  kind text;
  debt_event text;
  notice_id text;
  device record;
begin
  case tg_table_name
    when 'pacta_messages' then
      recipient := new.recipient_id; kind := 'message'; notice_id := new.id::text;
    when 'pacta_debt_notifications' then
      recipient := new.recipient_id; kind := 'debt'; notice_id := new.id::text;
      debt_event := new.kind;
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
        'auth', device.auth, 'kind', kind, 'id', notice_id)
        || case when debt_event is null then '{}'::jsonb else jsonb_build_object('debt_event', debt_event) end,
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

commit;
