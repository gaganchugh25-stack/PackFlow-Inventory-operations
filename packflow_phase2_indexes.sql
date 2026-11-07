-- Cover foreign-key lookups used by later operational and audit screens.
create index audit_logs_actor_idx on public.audit_logs(actor_id);
create index movements_posted_by_idx on public.inventory_movements(posted_by);
create index materials_supplier_idx on public.materials(supplier_id);
create index order_items_material_idx on public.order_items(material_id);
create index orders_created_by_idx on public.orders(created_by);
create index adjustments_posted_by_idx on public.stock_adjustments(posted_by);
create index inward_correction_idx on public.stock_inward(correction_of);
create index inward_received_by_idx on public.stock_inward(received_by);
create index inward_supplier_idx on public.stock_inward(supplier_id);
create index outward_correction_idx on public.stock_outward(correction_of);
create index outward_issued_by_idx on public.stock_outward(issued_by);
create index outward_order_item_idx on public.stock_outward(order_item_id);
create index reconciliation_approved_by_idx on public.stock_reconciliation(approved_by);
create index reconciliation_counted_by_idx on public.stock_reconciliation(counted_by);
create index user_roles_assigned_by_idx on public.user_roles(assigned_by);
create index user_roles_role_code_idx on public.user_roles(role_code);
