-- Preserve the meaning of posted stock movements.
create function private.guard_material_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.inventory_movements m where m.material_id = old.id
  ) and (
    old.item_code is distinct from new.item_code
    or old.unit is distinct from new.unit
    or old.opening_stock_qty is distinct from new.opening_stock_qty
  ) then
    raise exception 'Item code, unit and opening stock cannot change after stock movement';
  end if;
  new.updated_at := now();
  return new;
end; $$;

revoke all on function private.guard_material_history() from public, anon, authenticated;
create trigger packflow_guard_material_history
before update on public.materials
for each row execute function private.guard_material_history();

create function private.audit_material_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    auth.uid(),
    lower(tg_op),
    'material',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end; $$;

revoke all on function private.audit_material_change() from public, anon, authenticated;
create trigger packflow_audit_material_change
after insert or update on public.materials
for each row execute function private.audit_material_change();
