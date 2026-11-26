begin;

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

  if p_action = 'trash' and debt.stage in ('Pendiente', 'Propuesta', 'Saldada') then
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

commit;
