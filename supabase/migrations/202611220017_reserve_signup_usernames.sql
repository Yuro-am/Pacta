begin;

create function public.pacta_username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(lower(btrim(p_username)) ~ '^[a-z0-9_]{3,24}$', false)
    and not exists (
      select 1 from public.pacta_usernames where username = lower(btrim(p_username))
    )
$$;

revoke execute on function public.pacta_username_available(text) from public;
grant execute on function public.pacta_username_available(text) to anon, authenticated;

create function public.pacta_reserve_signup_username()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  handle text := lower(btrim(new.raw_user_meta_data ->> 'requested_username'));
begin
  if handle is not null then
    insert into public.pacta_usernames (user_id, username)
    values (new.id, handle);
  end if;
  return new;
end;
$$;

revoke execute on function public.pacta_reserve_signup_username() from public, anon, authenticated;

create trigger pacta_reserve_signup_username
after insert on auth.users
for each row execute function public.pacta_reserve_signup_username();

commit;
