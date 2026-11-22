create table public.shared_debts (
  id uuid primary key default gen_random_uuid(),
  invite_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete cascade,
  owner_name text not null,
  guest_name text not null,
  owner_owes boolean not null,
  title text not null check (char_length(btrim(title)) between 1 and 70),
  amount_cents integer not null check (amount_cents between 1 and 99999900),
  stage text not null default 'Pendiente' check (stage in ('Pendiente', 'Propuesta', 'Aceptada', 'Saldada')),
  proposer_id uuid,
  method text check (method in ('Dinero', 'Comida', 'Bebida', 'Favor', 'Recompensa')),
  detail text check (char_length(btrim(detail)) between 1 and 240),
  check (guest_id is distinct from owner_id)
);

create index shared_debts_owner_idx on public.shared_debts (owner_id);
create index shared_debts_guest_idx on public.shared_debts (guest_id);

alter table public.shared_debts enable row level security;
revoke all on public.shared_debts from public, anon, authenticated;
grant select on public.shared_debts to authenticated;
create policy "Participants can read their debts" on public.shared_debts
  for select to authenticated using ((select auth.uid()) in (owner_id, guest_id));

create function public.pacta_create_debt(p_title text, p_guest text, p_owner_owes boolean, p_cents integer)
returns public.shared_debts language plpgsql security definer set search_path = '' as $$
declare
  result public.shared_debts;
  actor uuid := auth.uid();
begin
  if actor is null or p_guest is null or char_length(btrim(p_guest)) not between 1 and 40 then
    raise exception 'Invalid debt';
  end if;
  insert into public.shared_debts (owner_id, owner_name, guest_name, owner_owes, title, amount_cents)
  values (actor, coalesce(nullif(left(btrim(auth.jwt()->'user_metadata'->>'display_name'), 50), ''), 'Tu amigo'),
    btrim(p_guest), p_owner_owes, btrim(p_title), p_cents)
  returning * into result;
  return result;
end;
$$;

create function public.pacta_join_debt(p_token uuid)
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
    and created_at > now() - interval '7 days'
  returning id into result;
  if result is null then
    select id into result from public.shared_debts
    where invite_token = p_token and actor in (owner_id, guest_id);
  end if;
  if result is null then raise exception 'Invitation unavailable'; end if;
  return result;
end;
$$;

create function public.pacta_update_debt(p_id uuid, p_action text, p_method text default null, p_detail text default null)
returns public.shared_debts language plpgsql security definer set search_path = '' as $$
declare
  debt public.shared_debts;
  actor uuid := auth.uid();
  next_stage text;
begin
  select * into debt from public.shared_debts
  where id = p_id and actor in (owner_id, guest_id) and guest_id is not null
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

revoke execute on function public.pacta_create_debt(text, text, boolean, integer) from public, anon;
revoke execute on function public.pacta_join_debt(uuid) from public, anon;
revoke execute on function public.pacta_update_debt(uuid, text, text, text) from public, anon;
grant execute on function public.pacta_create_debt(text, text, boolean, integer) to authenticated;
grant execute on function public.pacta_join_debt(uuid) to authenticated;
grant execute on function public.pacta_update_debt(uuid, text, text, text) to authenticated;
