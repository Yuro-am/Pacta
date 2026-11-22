begin;

alter table public.pacta_messages add column audio_path text;
alter table public.pacta_messages add constraint pacta_audio_uses_message_path check (
  audio_path is null or (
    audio_path ~ ('^' || sender_id::text || '/' || recipient_id::text || '/' || id::text || '[.](webm|mp4|ogg|wav)$')
    and body = 'Mensaje de voz'
  )
);
grant insert (audio_path) on public.pacta_messages to authenticated;
create unique index pacta_message_audio_path on public.pacta_messages (audio_path) where audio_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pacta-voice', 'pacta-voice', false, 5242880, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']);

create policy "PACTA friends can upload their own voice notes"
on storage.objects for insert to authenticated with check (
  bucket_id = 'pacta-voice'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}[.](webm|mp4|ogg|wav)$'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.pacta_can_message(
    case when split_part(name, '/', 2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then split_part(name, '/', 2)::uuid end
  )
);

create policy "PACTA participants can download sent voice notes"
on storage.objects for select to authenticated using (
  bucket_id = 'pacta-voice'
  and exists (
    select 1 from public.pacta_messages m
    where m.audio_path = storage.objects.name
      and (select auth.uid()) in (m.sender_id, m.recipient_id)
  )
);

commit;
