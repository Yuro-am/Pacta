begin;

alter table public.shared_debts add column split_id uuid;
create index shared_debts_owner_split_idx on public.shared_debts (owner_id, split_id) where split_id is not null;

create function public.pacta_split_group_debt(
  p_group uuid, p_title text, p_owner_owes boolean, p_cents integer,
  p_include_self boolean, p_members uuid[], p_split_id uuid
)
returns setof public.shared_debts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  peers uuid[];
  shares integer;
begin
  if actor is null or p_split_id is null or p_cents is null or p_cents not between 1 and 99999900
    or p_include_self is null or p_owner_owes is null then
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

  shares := cardinality(peers) + case when p_include_self then 1 else 0 end;
  if p_cents < shares then raise exception 'Amount too small'; end if;

  return query
  insert into public.shared_debts (owner_id, guest_id, owner_name, guest_name, owner_owes, title, amount_cents, group_id, split_id)
  select actor, member.id, public.pacta_display_name(actor), public.pacta_display_name(member.id), p_owner_owes,
    btrim(p_title), p_cents / shares + case when member.position <= p_cents % shares then 1 else 0 end, p_group, p_split_id
  from unnest(peers) with ordinality as member(id, position)
  returning *;
end;
$$;

revoke execute on function public.pacta_split_group_debt(uuid, text, boolean, integer, boolean, uuid[], uuid) from public, anon;
grant execute on function public.pacta_split_group_debt(uuid, text, boolean, integer, boolean, uuid[], uuid) to authenticated;

commit;
