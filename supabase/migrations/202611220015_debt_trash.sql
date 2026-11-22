begin;

alter table public.shared_debts add column if not exists trashed_at timestamptz;
revoke delete on public.shared_debts from authenticated;
drop policy if exists "Owners can delete unclaimed debts" on public.shared_debts;

create or replace function public.pacta_debt_trash(p_id uuid, p_action text)
returns public.shared_debts language plpgsql security definer set search_path = '' as $$
declare
  debt public.shared_debts;
begin
  select * into debt from public.shared_debts
  where id = p_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Debt unavailable' using errcode = '42501';
  end if;

  if p_action = 'trash' and debt.stage in ('Pendiente', 'Propuesta') then
    update public.shared_debts set trashed_at = coalesce(trashed_at, now())
    where id = p_id returning * into debt;
  elsif p_action = 'restore' then
    update public.shared_debts set trashed_at = null
    where id = p_id returning * into debt;
  elsif p_action = 'purge' and debt.trashed_at is not null then
    delete from public.shared_debts where id = p_id;
  else
    raise exception 'Invalid trash operation' using errcode = '22023';
  end if;

  return debt;
end;
$$;

revoke execute on function public.pacta_debt_trash(uuid, text) from public, anon;
grant execute on function public.pacta_debt_trash(uuid, text) to authenticated;

create or replace function public.pacta_join_debt(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result uuid;
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  update public.shared_debts
  set guest_id = actor,
    guest_name = coalesce(nullif(left(btrim(auth.jwt()->'user_metadata'->>'display_name'), 50), ''), guest_name)
  where invite_token = p_token and owner_id <> actor and guest_id is null
    and trashed_at is null and created_at > now() - interval '7 days'
  returning id into result;
  if result is null then
    select id into result from public.shared_debts
    where invite_token = p_token and trashed_at is null and actor in (owner_id, guest_id);
  end if;
  if result is null then raise exception 'Invitation unavailable'; end if;
  return result;
end;
$$;

create or replace function public.pacta_update_debt(p_id uuid, p_action text, p_method text default null, p_detail text default null)
returns public.shared_debts language plpgsql security definer set search_path = '' as $$
declare
  debt public.shared_debts;
  actor uuid := auth.uid();
  next_stage text;
begin
  select * into debt from public.shared_debts
  where id = p_id and actor in (owner_id, guest_id) and guest_id is not null and trashed_at is null
  for update;
  if not found then raise exception 'Debt unavailable'; end if;

  if p_action = 'propose' and debt.stage = 'Pendiente' and p_method is not null and p_detail is not null then
    next_stage := 'Propuesta';
  elsif p_action in ('accept', 'reject') and debt.stage = 'Propuesta' and debt.proposer_id <> actor then
    next_stage := case when p_action = 'accept' then 'Aceptada' else 'Pendiente' end;
  elsif p_action = 'settle' and debt.stage = 'Aceptada'
    and actor = (case when debt.owner_owes then debt.guest_id else debt.owner_id end) then
    next_stage := 'Saldada';
  else
    raise exception 'Invalid debt transition';
  end if;

  update public.shared_debts set
    stage = next_stage,
    proposer_id = case when p_action = 'propose' then actor when p_action = 'reject' then null else debt.proposer_id end,
    method = case when p_action = 'propose' then p_method when p_action = 'reject' then null else debt.method end,
    detail = case when p_action = 'propose' then btrim(p_detail) when p_action = 'reject' then null else debt.detail end
  where id = p_id returning * into debt;
  return debt;
end;
$$;

create or replace function public.pacta_group_balances(p_group uuid)
returns table (user_id uuid, name text, owes_cents bigint, owed_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select from public.pacta_group_members m
    where m.group_id = p_group and m.user_id = auth.uid() and m.accepted
  ) then
    raise exception 'Group membership required' using errcode = '42501';
  end if;

  return query
  with members as (
    select m.user_id from public.pacta_group_members m where m.group_id = p_group and m.accepted
  ), amounts as (
    select movement.member_id, sum(movement.owes) as owes, sum(movement.owed) as owed
    from public.shared_debts d
    join members as owner_member on owner_member.user_id = d.owner_id
    join members as guest_member on guest_member.user_id = d.guest_id
    cross join lateral (values
      (case when d.owner_owes then d.owner_id else d.guest_id end, d.amount_cents, 0),
      (case when d.owner_owes then d.guest_id else d.owner_id end, 0, d.amount_cents)
    ) movement(member_id, owes, owed)
    where d.trashed_at is null and d.group_id = p_group and d.guest_id is not null and d.stage <> 'Saldada'
    group by movement.member_id
  )
  select m.user_id, public.pacta_display_name(m.user_id), coalesce(a.owes, 0), coalesce(a.owed, 0)
  from members m left join amounts a on a.member_id = m.user_id
  order by public.pacta_display_name(m.user_id), m.user_id;
end;
$$;

create or replace function public.pacta_inbox()
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
