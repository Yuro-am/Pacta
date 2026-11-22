begin;

alter table public.pacta_messages add column photo_path text;
alter table public.pacta_messages add constraint pacta_direct_photo_path check (
  photo_path is null or (
    audio_path is null and body = 'Foto'
    and photo_path ~ ('^' || sender_id::text || '/' || recipient_id::text || '/' || id::text || '[.](jpg|png|webp|gif)$')
  )
);
grant insert (photo_path) on public.pacta_messages to authenticated;
create unique index pacta_direct_photo_path_idx on public.pacta_messages (photo_path) where photo_path is not null;

alter table public.pacta_group_messages add column photo_path text;
alter table public.pacta_group_messages add constraint pacta_group_photo_path check (
  photo_path is null or (
    audio_path is null and body = 'Foto'
    and photo_path ~ ('^groups/' || group_id::text || '/' || sender_id::text || '/' || id::text || '[.](jpg|png|webp|gif)$')
  )
);
grant insert (photo_path) on public.pacta_group_messages to authenticated;
create unique index pacta_group_photo_path_idx on public.pacta_group_messages (photo_path) where photo_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pacta-photos', 'pacta-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "PACTA members can upload photos to their chats"
on storage.objects for insert to authenticated with check (
  bucket_id = 'pacta-photos'
  and case when split_part(name, '/', 1) = 'groups' then
    name ~ '^groups/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f-]{36}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}[.](jpg|png|webp|gif)$'
    and split_part(name, '/', 3) = (select auth.uid())::text
    and public.pacta_is_group_member(
      case when split_part(name, '/', 2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        then split_part(name, '/', 2)::uuid end
    )
  else
    name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}[.](jpg|png|webp|gif)$'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and public.pacta_can_message(
      case when split_part(name, '/', 2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        then split_part(name, '/', 2)::uuid end
    )
  end
);

create policy "PACTA participants can download photos from their chats"
on storage.objects for select to authenticated using (
  bucket_id = 'pacta-photos'
  and (
    exists (select 1 from public.pacta_messages m where m.photo_path = storage.objects.name
      and (select auth.uid()) in (m.sender_id, m.recipient_id))
    or exists (select 1 from public.pacta_group_messages m where m.photo_path = storage.objects.name
      and public.pacta_is_group_member(m.group_id))
  )
);

commit;
