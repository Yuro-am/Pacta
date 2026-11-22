grant delete on public.shared_debts to authenticated;

create policy "Owners can delete unclaimed debts" on public.shared_debts
  for delete to authenticated
  using (owner_id = (select auth.uid()) and guest_id is null);
