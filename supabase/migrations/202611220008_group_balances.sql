begin;

create index shared_debts_pending_group_idx
  on public.shared_debts (group_id)
  where group_id is not null and guest_id is not null and stage <> 'Saldada';

create function public.pacta_group_balances(p_group uuid)
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
    where d.group_id = p_group and d.guest_id is not null and d.stage <> 'Saldada'
    group by movement.member_id
  )
  select m.user_id, public.pacta_display_name(m.user_id), coalesce(a.owes, 0), coalesce(a.owed, 0)
  from members m left join amounts a on a.member_id = m.user_id
  order by public.pacta_display_name(m.user_id), m.user_id;
end;
$$;

revoke execute on function public.pacta_group_balances(uuid) from public, anon;
grant execute on function public.pacta_group_balances(uuid) to authenticated;

commit;
