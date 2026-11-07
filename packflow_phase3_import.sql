-- Atomic import of reviewed material-master CSV rows.
create function public.import_materials(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_category_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null or not private.has_role(array['super_admin','inventory_manager']) then
    raise exception 'Not authorised to import materials';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array'
     or pg_catalog.jsonb_array_length(p_rows) < 1
     or pg_catalog.jsonb_array_length(p_rows) > 500 then
    raise exception 'Import must contain between 1 and 500 material rows';
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    select id into v_category_id from public.material_categories
    where name = v_row->>'category' and is_active;
    if v_category_id is null then
      raise exception 'Unknown or inactive category: %', v_row->>'category';
    end if;
    if nullif(pg_catalog.btrim(v_row->>'unit'), '') is null
       or nullif(pg_catalog.btrim(v_row->>'item_code'), '') is null
       or nullif(pg_catalog.btrim(v_row->>'specification'), '') is null
       or nullif(pg_catalog.btrim(v_row->>'opening_stock_qty'), '') is null then
      raise exception 'Each row needs item code, specification, unit and verified opening stock';
    end if;

    insert into public.materials
      (item_code, source_category_label, category_id, specification, unit,
       opening_stock_qty, minimum_stock_level, reorder_level, reorder_quantity,
       maximum_stock_level, status)
    values (
      pg_catalog.btrim(v_row->>'item_code'),
      nullif(pg_catalog.btrim(v_row->>'source_category_label'), ''),
      v_category_id,
      pg_catalog.btrim(v_row->>'specification'),
      pg_catalog.btrim(v_row->>'unit'),
      (v_row->>'opening_stock_qty')::numeric,
      nullif(v_row->>'minimum_stock_level','')::numeric,
      nullif(v_row->>'reorder_level','')::numeric,
      nullif(v_row->>'reorder_quantity','')::numeric,
      nullif(v_row->>'maximum_stock_level','')::numeric,
      'active'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

revoke all on function public.import_materials(jsonb) from public, anon;
grant execute on function public.import_materials(jsonb) to authenticated;
