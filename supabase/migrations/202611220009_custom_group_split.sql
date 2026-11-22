begin;

create function public.pacta_split_group_debt_custom(
  p_group uuid, p_title text, p_owner_owes boolean,
  p_amounts integer[], p_members uuid[], p_split_id uuid
)
returns setof public.shared_debts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  peers uuid[];
begin
  if actor is null or p_split_id is null or p_owner_owes is null then
    raise exception 'Invalid group debt';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_split_id::text, 0));
  if exists (select from public.shared_debts where owner_id = actor and split_id = p_split_id) then
    return query select * from public.shared_debts where owner_id = actor and split_id = p_split_id;
    return;
  end if;

  if not exists (select from public.pacta_group_members where group_id = p_group and user_id = actor and accepted) then
    raise exception 'Group membership required';
  end if;

  select array_agg(user_id order by user_id) into peers
    from public.pacta_group_members where group_id = p_group and user_id <> actor and accepted;
  if peers is null or peers is distinct from p_members then
    raise exception 'Group members changed';
  end if;

  if cardinality(p_amounts) is distinct from cardinality(peers)
    or array_ndims(p_amounts) <> 1
    or exists (select from unnest(p_amounts) a(cents) where a.cents is null or a.cents < 0)
    or (select sum(a.cents) from unnest(p_amounts) a(cents)) not between 1 and 99999900 then
    raise exception 'Invalid individual amounts';
  end if;

  return query
  insert into public.shared_debts (owner_id, guest_id, owner_name, guest_name, owner_owes, title, amount_cents, group_id, split_id)
  select actor, member.id, public.pacta_display_name(actor), public.pacta_display_name(member.id), p_owner_owes,
    btrim(p_title), member.cents, p_group, p_split_id
  from unnest(peers, p_amounts) as member(id, cents)
  where member.cents > 0
  returning *;
end;
$$;

revoke execute on function public.pacta_split_group_debt_custom(uuid, text, boolean, integer[], uuid[], uuid) from public, anon;
grant execute on function public.pacta_split_group_debt_custom(uuid, text, boolean, integer[], uuid[], uuid) to authenticated;

commit;
