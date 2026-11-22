begin;

-- Published UPDATE and DELETE operations need a replica identity.
alter table public.pacta_friendships add primary key (requester, recipient);

grant select on public.pacta_friendships, public.pacta_group_members to authenticated;

create policy "PACTA users receive their friendship changes"
on public.pacta_friendships for select to authenticated
using ((select auth.uid()) in (requester, recipient));

create policy "PACTA users receive their group invitations"
on public.pacta_group_members for select to authenticated
using (user_id = (select auth.uid()));

do $$
declare target text;
begin
  foreach target in array array['pacta_messages', 'pacta_group_messages', 'pacta_friendships', 'pacta_group_members'] loop
    if not exists (
      select from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end;
$$;

create function public.pacta_can_use_typing_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  first_user uuid;
  second_user uuid;
  uuid_pattern constant text := '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
begin
  if actor is null then return false; end if;
  if p_topic ~ ('^pacta-chat-group:' || uuid_pattern || '$') then
    return public.pacta_is_group_member(split_part(p_topic, ':', 2)::uuid);
  end if;
  if p_topic ~ ('^pacta-chat-friend:' || uuid_pattern || ':' || uuid_pattern || '$') then
    first_user := split_part(p_topic, ':', 2)::uuid;
    second_user := split_part(p_topic, ':', 3)::uuid;
    if actor = first_user then return public.pacta_can_message(second_user); end if;
    if actor = second_user then return public.pacta_can_message(first_user); end if;
  end if;
  return false;
end;
$$;

revoke execute on function public.pacta_can_use_typing_topic(text) from public, anon;
grant execute on function public.pacta_can_use_typing_topic(text) to authenticated;

create policy "PACTA chat participants can receive typing signals"
on realtime.messages for select to authenticated
using (extension = 'broadcast' and public.pacta_can_use_typing_topic((select realtime.topic())));

create policy "PACTA chat participants can send typing signals"
on realtime.messages for insert to authenticated
with check (extension = 'broadcast' and public.pacta_can_use_typing_topic((select realtime.topic())));

commit;
