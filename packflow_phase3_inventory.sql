-- Phase 3: confirmed opening stock and atomic stock inward posting.

create or replace function private.guard_material_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.opening_stock_qty is not null
     and old.opening_stock_qty is distinct from new.opening_stock_qty then
    raise exception 'Opening stock cannot change after confirmation';
  end if;
  if exists (select 1 from public.inventory_movements where material_id = old.id)
     and (old.item_code is distinct from new.item_code
       or old.unit is distinct from new.unit) then
    raise exception 'Item code and unit cannot change after stock movement';
  end if;
  new.updated_at := now();
  return new;
end; $$;

create function private.refresh_material_alerts(p_material_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_material public.materials%rowtype;
  v_qty numeric(18,3);
  v_condition text;
  v_should_open boolean;
begin
  select * into v_material from public.materials where id = p_material_id;
  select current_qty into v_qty from public.inventory_balances where material_id = p_material_id;
  if not found then return; end if;

  foreach v_condition in array array['out_of_stock','low_stock','reorder_required'] loop
    v_should_open := v_material.status = 'active' and case v_condition
      when 'out_of_stock' then v_qty = 0
      when 'low_stock' then v_qty > 0 and v_material.minimum_stock_level is not null
        and v_qty < v_material.minimum_stock_level
      when 'reorder_required' then v_qty > 0 and v_material.reorder_level is not null
        and v_qty <= v_material.reorder_level
      else false end;

    if v_should_open then
      insert into public.inventory_alerts(material_id, condition, latest_qty)
      values (p_material_id, v_condition, v_qty)
      on conflict (material_id, condition) where resolved_at is null
      do update set latest_qty = excluded.latest_qty;
    else
      update public.inventory_alerts
      set resolved_at = now(), latest_qty = v_qty
      where material_id = p_material_id and condition = v_condition and resolved_at is null;
    end if;
  end loop;
end; $$;

revoke all on function private.refresh_material_alerts(uuid) from public, anon, authenticated;

create function private.initialise_material_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if new.opening_stock_qty is null then return new; end if;
  if v_actor is null then raise exception 'Authenticated user required to confirm opening stock'; end if;
  if exists (select 1 from public.inventory_balances where material_id = new.id) then return new; end if;

  insert into public.inventory_balances(material_id, current_qty)
  values (new.id, new.opening_stock_qty);

  if new.opening_stock_qty > 0 then
    insert into public.inventory_movements
      (material_id, movement_type, source_id, signed_qty, before_qty, after_qty, business_date, posted_by)
    values (new.id, 'opening', new.id, new.opening_stock_qty, 0,
      new.opening_stock_qty, (now() at time zone 'Asia/Kolkata')::date, v_actor);
  end if;

  perform private.refresh_material_alerts(new.id);
  return new;
end; $$;

revoke all on function private.initialise_material_balance() from public, anon, authenticated;
create trigger packflow_initialise_material_balance
after insert or update of opening_stock_qty on public.materials
for each row execute function private.initialise_material_balance();

create function private.refresh_alerts_after_material_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.minimum_stock_level, old.reorder_level, old.status)
     is distinct from (new.minimum_stock_level, new.reorder_level, new.status) then
    perform private.refresh_material_alerts(new.id);
  end if;
  return new;
end; $$;

revoke all on function private.refresh_alerts_after_material_change() from public, anon, authenticated;
create trigger packflow_refresh_alerts_after_material_change
after update of minimum_stock_level, reorder_level, status on public.materials
for each row execute function private.refresh_alerts_after_material_change();

create function public.post_stock_inward(
  p_reference_number text,
  p_business_date date,
  p_material_id uuid,
  p_quantity numeric,
  p_supplier_name text default null,
  p_purchase_order_reference text default null,
  p_remarks text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.stock_inward%rowtype;
  v_material public.materials%rowtype;
  v_before numeric(18,3);
  v_inward_id uuid;
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager','inventory_operator']) then
    raise exception 'Not authorised to post stock inward';
  end if;
  if p_reference_number is null or btrim(p_reference_number) = ''
     or p_business_date is null or p_material_id is null
     or p_quantity is null or p_quantity <= 0 then
    raise exception 'Reference, date, material and positive quantity are required';
  end if;
  if p_quantity <> round(p_quantity, 3) then
    raise exception 'Quantity supports at most three decimal places';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reference_number, 0));
  select * into v_existing from public.stock_inward where reference_number = p_reference_number;
  if found then
    if v_existing.material_id = p_material_id
       and v_existing.business_date = p_business_date
       and v_existing.quantity = p_quantity
       and v_existing.supplier_name is not distinct from p_supplier_name
       and v_existing.purchase_order_reference is not distinct from p_purchase_order_reference
       and v_existing.remarks is not distinct from p_remarks
       and v_existing.received_by = v_actor then
      return v_existing.id;
    end if;
    raise exception 'Inward reference already belongs to a different posting';
  end if;

  select * into v_material from public.materials where id = p_material_id;
  if not found or v_material.status <> 'active' then
    raise exception 'Active material not found';
  end if;
  select current_qty into v_before from public.inventory_balances
  where material_id = p_material_id for update;
  if not found then
    raise exception 'Opening stock must be confirmed before inward posting';
  end if;

  insert into public.stock_inward
    (reference_number, business_date, material_id, quantity, supplier_name,
     purchase_order_reference, remarks, received_by)
  values (p_reference_number, p_business_date, p_material_id, p_quantity,
    p_supplier_name, p_purchase_order_reference, p_remarks, v_actor)
  returning id into v_inward_id;

  update public.inventory_balances
  set current_qty = v_before + p_quantity, version = version + 1, updated_at = now()
  where material_id = p_material_id;

  insert into public.inventory_movements
    (material_id, movement_type, source_id, signed_qty, before_qty, after_qty,
     business_date, posted_by)
  values (p_material_id, 'inward', v_inward_id, p_quantity,
    v_before, v_before + p_quantity, p_business_date, v_actor);

  perform private.refresh_material_alerts(p_material_id);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (v_actor, 'post', 'stock_inward', v_inward_id,
    pg_catalog.jsonb_build_object('reference_number',p_reference_number,
      'material_id',p_material_id,'quantity',p_quantity,
      'before_qty',v_before,'after_qty',v_before+p_quantity));
  return v_inward_id;
end; $$;

revoke all on function public.post_stock_inward(text,date,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.post_stock_inward(text,date,uuid,numeric,text,text,text) to authenticated;
