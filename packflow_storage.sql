-- Private material documents for the existing PackFlow project.
-- The inventory tables already exist; no sample inventory rows are inserted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'packflow-material-files',
  'packflow-material-files',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do nothing;

create policy packflow_material_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'packflow-material-files'
  and (select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer']))
);

create policy packflow_material_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'packflow-material-files'
  and (storage.foldername(name))[1] = 'materials'
  and exists (
    select 1 from public.materials m
    where m.id::text = (storage.foldername(name))[2]
  )
  and (select private.has_role(array['super_admin','inventory_manager']))
);
