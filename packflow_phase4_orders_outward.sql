-- Phase 4: order demand and atomic outward stock posting.
-- Order edits are allowed only while draft; stock changes only in post_stock_outward.

create sequence if not exists private.order_number_seq;
revoke all on sequence private.order_number_seq from public, anon, authenticated;

alter table public.order_items add constraint order_items_one_material_per_order unique (order_id, material_id);
create index if not exists stock_outward_order_item_idx on public.stock_outward(order_item_id);

create function public.save_draft_order(p_order_id uuid, p_order_date date, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_id uuid;
  v_line jsonb;
  v_material_id uuid;
  v_qty numeric;
  v_line_number integer := 0;
  v_count integer;
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager','inventory_operator']) then
    raise exception 'Not authorised to save orders';
  end if;
  if p_order_date is null or p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Order date and material lines are required';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 1 or v_count > 100 then
    raise exception 'An order needs 1 to 100 material lines';
  end if;

  if p_order_id is null then
    insert into public.orders(order_number,order_date,status,created_by)
    values ('PF-' || to_char(p_order_date,'YYYYMMDD') || '-' ||
      lpad(nextval('private.order_number_seq'::regclass)::text,6,'0'),
      p_order_date,'draft',v_actor)
    returning id into v_id;
  else
    select * into v_order from public.orders where id = p_order_id for update;
    if not found or v_order.status <> 'draft' then
      raise exception 'Only a draft order can be edited';
    end if;
    v_id := p_order_id;
    update public.orders set order_date = p_order_date, updated_at = now() where id = v_id;
    delete from public.order_items where order_id = v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_number := v_line_number + 1;
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line->>'material_id','') = ''
       or coalesce(v_line->>'required_qty','') = '' then
      raise exception 'Every line needs a material and required quantity';
    end if;
    v_material_id := (v_line->>'material_id')::uuid;
    v_qty := (v_line->>'required_qty')::numeric;
    if v_qty <= 0 or v_qty <> round(v_qty,3) or v_qty > 999999999999999.999 then
      raise exception 'Order quantities must be positive with at most three decimal places';
    end if;
    if not exists (select 1 from public.materials where id = v_material_id and status = 'active') then
      raise exception 'Order line material is not active';
    end if;
    insert into public.order_items(order_id,line_number,material_id,required_qty)
    values (v_id,v_line_number,v_material_id,v_qty);
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values (v_actor, case when p_order_id is null then 'create' else 'update' end,
    'order',v_id,jsonb_build_object('order_date',p_order_date,'lines',p_lines));
  return v_id;
end; $$;

create function public.change_order_status(p_order_id uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_new_status text;
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager','inventory_operator']) then
    raise exception 'Not authorised to change orders';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action = 'submit' and v_order.status = 'draft' then
    if not exists (select 1 from public.order_items where order_id = p_order_id) then
      raise exception 'Add an item before submitting the order';
    end if;
    v_new_status := 'pending';
  elsif p_action = 'cancel' and v_order.status in ('draft','pending','partially_fulfilled') then
    v_new_status := 'cancelled';
  else
    raise exception 'This status change is not allowed';
  end if;
  update public.orders set status = v_new_status, updated_at = now() where id = p_order_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values (v_actor,p_action,'order',p_order_id,
    jsonb_build_object('status',v_order.status),jsonb_build_object('status',v_new_status));
  return v_new_status;
end; $$;

create function public.post_stock_outward(
  p_reference_number text,
  p_business_date date,
  p_order_item_id uuid,
  p_quantity numeric,
  p_issued_to text,
  p_remarks text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.stock_outward%rowtype;
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_before numeric(18,3);
  v_issued numeric(18,3);
  v_outward_id uuid;
  v_all_fulfilled boolean;
begin
  if v_actor is null or not private.has_role(array['super_admin','inventory_manager','inventory_operator']) then
    raise exception 'Not authorised to post stock outward';
  end if;
  if nullif(btrim(p_reference_number),'') is null or p_business_date is null
     or p_order_item_id is null or p_quantity is null or p_quantity <= 0
     or nullif(btrim(p_issued_to),'') is null then
    raise exception 'Reference, date, order line, positive quantity and issued-to are required';
  end if;
  if p_quantity <> round(p_quantity,3) or p_quantity > 999999999999999.999 then
    raise exception 'Quantity supports at most three decimal places';
  end if;
  p_reference_number := btrim(p_reference_number);
  p_issued_to := btrim(p_issued_to);
  p_remarks := nullif(btrim(p_remarks),'');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reference_number, 1));
  select * into v_existing from public.stock_outward where reference_number = p_reference_number;
  if found then
    if v_existing.business_date = p_business_date
       and v_existing.order_item_id = p_order_item_id
       and v_existing.quantity = p_quantity
       and v_existing.issued_to = p_issued_to
       and v_existing.remarks is not distinct from p_remarks
       and v_existing.issued_by = v_actor then
      return v_existing.id;
    end if;
    raise exception 'Outward reference already belongs to a different posting';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then raise exception 'Order line not found'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  if v_order.status not in ('pending','partially_fulfilled') then
    raise exception 'Only a pending or partly fulfilled order can be issued';
  end if;
  if not exists (select 1 from public.materials where id = v_item.material_id and status = 'active') then
    raise exception 'Material is not active';
  end if;
  select coalesce(sum(quantity),0) into v_issued
  from public.stock_outward where order_item_id = p_order_item_id;
  if p_quantity > v_item.required_qty - v_issued then
    raise exception 'Issue exceeds remaining order quantity';
  end if;
  select current_qty into v_before from public.inventory_balances
  where material_id = v_item.material_id for update;
  if not found then raise exception 'Opening stock must be confirmed before outward posting'; end if;
  if p_quantity > v_before then raise exception 'Insufficient stock for this issue'; end if;

  insert into public.stock_outward(reference_number,business_date,material_id,quantity,
    order_item_id,issued_to,remarks,issued_by)
  values (p_reference_number,p_business_date,v_item.material_id,p_quantity,
    p_order_item_id,p_issued_to,p_remarks,v_actor)
  returning id into v_outward_id;
  update public.inventory_balances
  set current_qty = v_before - p_quantity, version = version + 1, updated_at = now()
  where material_id = v_item.material_id;
  insert into public.inventory_movements(material_id,movement_type,source_id,signed_qty,
    before_qty,after_qty,business_date,posted_by)
  values (v_item.material_id,'outward',v_outward_id,-p_quantity,
    v_before,v_before-p_quantity,p_business_date,v_actor);

  select bool_and(issued >= required_qty) into v_all_fulfilled from (
    select oi.required_qty, coalesce(sum(so.quantity),0) as issued
    from public.order_items oi left join public.stock_outward so on so.order_item_id = oi.id
    where oi.order_id = v_order.id group by oi.id,oi.required_qty
  ) lines;
  update public.orders
  set status = case when v_all_fulfilled then 'completed' else 'partially_fulfilled' end,
      updated_at = now()
  where id = v_order.id;
  perform private.refresh_material_alerts(v_item.material_id);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values (v_actor,'post','stock_outward',v_outward_id,
    jsonb_build_object('reference_number',p_reference_number,'order_id',v_order.id,
      'order_item_id',p_order_item_id,'material_id',v_item.material_id,
      'quantity',p_quantity,'before_qty',v_before,'after_qty',v_before-p_quantity));
  return v_outward_id;
end; $$;

revoke all on function public.save_draft_order(uuid,date,jsonb) from public, anon;
revoke all on function public.change_order_status(uuid,text) from public, anon;
revoke all on function public.post_stock_outward(text,date,uuid,numeric,text,text) from public, anon;
grant execute on function public.save_draft_order(uuid,date,jsonb) to authenticated;
grant execute on function public.change_order_status(uuid,text) to authenticated;
grant execute on function public.post_stock_outward(text,date,uuid,numeric,text,text) to authenticated;
