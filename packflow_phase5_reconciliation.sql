-- Phase 5: physical counts, approval and atomic stock adjustments.
-- Stock alerts continue to use private.refresh_material_alerts from Phase 3.

alter table public.stock_adjustments
  add column counted_balance_version bigint not null default 0
  check (counted_balance_version >= 0);

create index if not exists stock_reconciliation_status_date_idx
  on public.stock_reconciliation(status, count_date desc);

create function public.create_stock_count(
  p_reference_number text,
  p_count_date date,
  p_material_id uuid,
  p_physical_qty numeric,
  p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.stock_reconciliation%rowtype;
  v_adjustment public.stock_adjustments%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_id uuid;
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager','inventory_operator']) then
    raise exception 'Not authorised to record stock counts';
  end if;
  if nullif(btrim(p_reference_number),'') is null or p_count_date is null
     or p_material_id is null or p_physical_qty is null or p_physical_qty < 0
     or nullif(btrim(p_reason),'') is null then
    raise exception 'Reference, date, material, physical quantity and reason are required';
  end if;
  if p_physical_qty <> round(p_physical_qty,3)
     or p_physical_qty > 999999999999999.999 then
    raise exception 'Quantity supports at most three decimal places';
  end if;
  p_reference_number := btrim(p_reference_number);
  p_reason := btrim(p_reason);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reference_number,2));
  select * into v_existing from public.stock_reconciliation where reference_number=p_reference_number;
  if found then
    select * into v_adjustment from public.stock_adjustments where reconciliation_id=v_existing.id;
    if v_existing.count_date=p_count_date and v_adjustment.material_id=p_material_id
       and v_adjustment.physical_qty=p_physical_qty and v_adjustment.reason=p_reason
       and v_existing.counted_by=v_actor then
      return v_existing.id;
    end if;
    raise exception 'Reconciliation reference already belongs to a different count';
  end if;
  if not exists (select 1 from public.materials where id=p_material_id and status='active') then
    raise exception 'Active material not found';
  end if;
  select * into v_balance from public.inventory_balances
    where material_id=p_material_id for update;
  if not found then raise exception 'Opening stock must be confirmed before counting'; end if;

  insert into public.stock_reconciliation(reference_number,count_date,status,counted_by)
  values (p_reference_number,p_count_date,'pending_approval',v_actor)
  returning id into v_id;
  insert into public.stock_adjustments(reconciliation_id,material_id,counted_system_qty,
    counted_balance_version,physical_qty,reason)
  values (v_id,p_material_id,v_balance.current_qty,v_balance.version,p_physical_qty,p_reason);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values (v_actor,'count','stock_reconciliation',v_id,
    jsonb_build_object('material_id',p_material_id,'system_qty',v_balance.current_qty,
      'balance_version',v_balance.version,'physical_qty',p_physical_qty,'reason',p_reason));
  return v_id;
end; $$;

create function public.revise_stock_count(
  p_reconciliation_id uuid,
  p_count_date date,
  p_physical_qty numeric,
  p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_reconciliation public.stock_reconciliation%rowtype;
  v_adjustment public.stock_adjustments%rowtype;
  v_balance public.inventory_balances%rowtype;
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager','inventory_operator']) then
    raise exception 'Not authorised to revise stock counts';
  end if;
  if p_count_date is null or p_physical_qty is null or p_physical_qty < 0
     or p_physical_qty <> round(p_physical_qty,3)
     or p_physical_qty > 999999999999999.999
     or nullif(btrim(p_reason),'') is null then
    raise exception 'Date, non-negative physical quantity and reason are required';
  end if;
  select * into v_reconciliation from public.stock_reconciliation
    where id=p_reconciliation_id for update;
  if not found or v_reconciliation.status <> 'pending_approval' then
    raise exception 'Only a pending count can be revised';
  end if;
  select * into v_adjustment from public.stock_adjustments
    where reconciliation_id=p_reconciliation_id for update;
  if not found then raise exception 'Count adjustment not found'; end if;
  if not exists (select 1 from public.materials where id=v_adjustment.material_id and status='active') then
    raise exception 'Active material not found';
  end if;
  select * into v_balance from public.inventory_balances
    where material_id=v_adjustment.material_id for update;
  update public.stock_reconciliation
  set count_date=p_count_date,counted_by=v_actor where id=p_reconciliation_id;
  update public.stock_adjustments
  set counted_system_qty=v_balance.current_qty,
      counted_balance_version=v_balance.version,
      physical_qty=p_physical_qty,reason=btrim(p_reason)
  where id=v_adjustment.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values (v_actor,'revise_count','stock_reconciliation',p_reconciliation_id,
    jsonb_build_object('system_qty',v_adjustment.counted_system_qty,
      'balance_version',v_adjustment.counted_balance_version,
      'physical_qty',v_adjustment.physical_qty,'reason',v_adjustment.reason),
    jsonb_build_object('system_qty',v_balance.current_qty,
      'balance_version',v_balance.version,'physical_qty',p_physical_qty,'reason',btrim(p_reason)));
  return p_reconciliation_id;
end; $$;

create function public.post_stock_reconciliation(p_reconciliation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_reconciliation public.stock_reconciliation%rowtype;
  v_adjustment public.stock_adjustments%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_difference numeric(18,3);
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager']) then
    raise exception 'Only an inventory manager or Super Admin can approve adjustments';
  end if;
  select * into v_reconciliation from public.stock_reconciliation
    where id=p_reconciliation_id for update;
  if not found then raise exception 'Reconciliation not found'; end if;
  if v_reconciliation.status='posted' then return v_reconciliation.id; end if;
  if v_reconciliation.status <> 'pending_approval' then
    raise exception 'Only a pending count can be posted';
  end if;
  select * into v_adjustment from public.stock_adjustments
    where reconciliation_id=p_reconciliation_id for update;
  if not found then raise exception 'Count adjustment not found'; end if;
  if not exists (select 1 from public.materials where id=v_adjustment.material_id and status='active') then
    raise exception 'Active material not found';
  end if;
  select * into v_balance from public.inventory_balances
    where material_id=v_adjustment.material_id for update;
  if not found then raise exception 'Material balance not found'; end if;
  if v_balance.version <> v_adjustment.counted_balance_version
     or v_balance.current_qty <> v_adjustment.counted_system_qty then
    raise exception 'Stock changed after this count. Recount and refresh the pending record before approval';
  end if;
  v_difference := v_adjustment.physical_qty-v_balance.current_qty;
  if v_difference <> 0 then
    update public.inventory_balances
    set current_qty=v_adjustment.physical_qty,
        version=version+1,updated_at=now()
    where material_id=v_adjustment.material_id;
    insert into public.inventory_movements(material_id,movement_type,source_id,signed_qty,
      before_qty,after_qty,business_date,posted_by)
    values (v_adjustment.material_id,'adjustment',v_adjustment.id,v_difference,
      v_balance.current_qty,v_adjustment.physical_qty,v_reconciliation.count_date,v_actor);
  end if;
  update public.stock_adjustments
  set posted_by=v_actor,posted_at=now() where id=v_adjustment.id;
  update public.stock_reconciliation
  set status='posted',approved_by=v_actor,approved_at=now()
  where id=p_reconciliation_id;
  perform private.refresh_material_alerts(v_adjustment.material_id);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values (v_actor,'post','stock_reconciliation',p_reconciliation_id,
    jsonb_build_object('system_qty',v_balance.current_qty),
    jsonb_build_object('physical_qty',v_adjustment.physical_qty,
      'difference_qty',v_difference,'adjustment_id',v_adjustment.id));
  return p_reconciliation_id;
end; $$;

revoke all on function public.create_stock_count(text,date,uuid,numeric,text) from public, anon;
revoke all on function public.revise_stock_count(uuid,date,numeric,text) from public, anon;
revoke all on function public.post_stock_reconciliation(uuid) from public, anon;
grant execute on function public.create_stock_count(text,date,uuid,numeric,text) to authenticated;
grant execute on function public.revise_stock_count(uuid,date,numeric,text) to authenticated;
grant execute on function public.post_stock_reconciliation(uuid) to authenticated;
