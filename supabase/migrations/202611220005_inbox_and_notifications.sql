begin;

alter table public.pacta_messages add column read_at timestamptz;
create index pacta_messages_unread_recipient on public.pacta_messages (recipient_id, sender_id) where read_at is null;
create index pacta_messages_recipient_history on public.pacta_messages (recipient_id, sender_id, created_at desc, id desc);

create table public.pacta_debt_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.shared_debts(id) on delete cascade,
  kind text not null check (kind in ('new', 'joined', 'proposal', 'accepted', 'rejected', 'settled')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index pacta_debt_notifications_recipient on public.pacta_debt_notifications (recipient_id, created_at desc);
create index pacta_debt_notifications_debt on public.pacta_debt_notifications (debt_id);
alter table public.pacta_debt_notifications enable row level security;
revoke all on public.pacta_debt_notifications from public, anon, authenticated;

create function public.pacta_record_debt_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  recipient uuid;
  event_kind text;
begin
  if new.guest_id is null or actor is null or actor not in (new.owner_id, new.guest_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    event_kind := 'new';
  elsif old.guest_id is null then
    event_kind := 'joined';
  elsif new.stage is distinct from old.stage then
    event_kind := case new.stage
      when 'Propuesta' then 'proposal'
      when 'Aceptada' then 'accepted'
      when 'Pendiente' then 'rejected'
      when 'Saldada' then 'settled'
    end;
  end if;

  if event_kind is not null then
    recipient := case when actor = new.owner_id then new.guest_id else new.owner_id end;
    insert into public.pacta_debt_notifications (recipient_id, actor_id, debt_id, kind)
    values (recipient, actor, new.id, event_kind);
  end if;
  return new;
end;
$$;

create trigger pacta_notify_debt_changes
after insert or update of guest_id, stage on public.shared_debts
for each row execute function public.pacta_record_debt_notification();

create function public.pacta_inbox()
returns jsonb language sql stable security definer set search_path = '' as $$
  with my_messages as (
    select recipient_id as peer, body, created_at, id, true as mine, false as unread
    from public.pacta_messages where sender_id = auth.uid()
    union all
    select sender_id as peer, body, created_at, id, false as mine, read_at is null as unread
    from public.pacta_messages where recipient_id = auth.uid()
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
    where n.recipient_id = auth.uid()
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
    'unread_debts', (select count(*) from public.pacta_debt_notifications where recipient_id = auth.uid() and read_at is null)
  )
$$;

create function public.pacta_read_chat(p_message uuid)
returns void language sql security definer set search_path = '' as $$
  update public.pacta_messages m set read_at = now()
  from public.pacta_messages current_message
  where current_message.id = p_message and current_message.recipient_id = auth.uid()
    and m.recipient_id = current_message.recipient_id and m.sender_id = current_message.sender_id
    and (m.created_at, m.id) <= (current_message.created_at, current_message.id) and m.read_at is null
$$;

create function public.pacta_read_debt_notice(p_notice uuid)
returns void language sql security definer set search_path = '' as $$
  update public.pacta_debt_notifications set read_at = now()
  where id = p_notice and recipient_id = auth.uid() and read_at is null
$$;

revoke execute on function public.pacta_record_debt_notification(), public.pacta_inbox(), public.pacta_read_chat(uuid), public.pacta_read_debt_notice(uuid) from public, anon;
grant execute on function public.pacta_inbox(), public.pacta_read_chat(uuid), public.pacta_read_debt_notice(uuid) to authenticated;

commit;
