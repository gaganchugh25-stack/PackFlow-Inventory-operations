-- PackFlow ERP, Phase 2. Apply only to the dedicated PackFlow project.
-- Stock-posting functions are added in their respective later phases.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  code text primary key check (code in ('super_admin','inventory_manager','inventory_operator','viewer')),
  name text not null unique
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_code text not null references public.roles(code),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique check (length(btrim(item_code)) > 0),
  source_category_label text,
  category_id uuid not null references public.material_categories(id),
  specification text not null check (length(btrim(specification)) > 0),
  unit text not null check (length(btrim(unit)) > 0),
  opening_stock_qty numeric(18,3) check (opening_stock_qty >= 0),
  minimum_stock_level numeric(18,3) check (minimum_stock_level >= 0),
  reorder_level numeric(18,3) check (reorder_level >= 0),
  reorder_quantity numeric(18,3) check (reorder_quantity > 0),
  maximum_stock_level numeric(18,3) check (maximum_stock_level >= 0),
  supplier_id uuid references public.suppliers(id),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_threshold_order check (
    minimum_stock_level is null or reorder_level is null or minimum_stock_level <= reorder_level
  ),
  constraint material_maximum_order check (
    maximum_stock_level is null or (
      (minimum_stock_level is null or maximum_stock_level >= minimum_stock_level)
      and (reorder_level is null or maximum_stock_level >= reorder_level)
    )
  )
);

create table public.inventory_balances (
  material_id uuid primary key references public.materials(id),
  current_qty numeric(18,3) not null default 0 check (current_qty >= 0),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  order_date date not null,
  status text not null default 'draft' check (status in ('draft','pending','partially_fulfilled','completed','cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  line_number integer not null check (line_number > 0),
  material_id uuid not null references public.materials(id),
  required_qty numeric(18,3) not null check (required_qty > 0),
  unique (order_id, line_number)
);

create table public.stock_inward (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  business_date date not null,
  material_id uuid not null references public.materials(id),
  quantity numeric(18,3) not null check (quantity > 0),
  supplier_id uuid references public.suppliers(id),
  supplier_name text,
  purchase_order_reference text,
  remarks text,
  received_by uuid not null references public.profiles(id),
  posted_at timestamptz not null default now(),
  correction_of uuid references public.stock_inward(id)
);

create table public.stock_outward (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  business_date date not null,
  material_id uuid not null references public.materials(id),
  quantity numeric(18,3) not null check (quantity > 0),
  order_item_id uuid not null references public.order_items(id),
  issued_to text not null,
  remarks text,
  issued_by uuid not null references public.profiles(id),
  posted_at timestamptz not null default now(),
  correction_of uuid references public.stock_outward(id)
);

create table public.stock_reconciliation (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  count_date date not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','posted','cancelled')),
  counted_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  remarks text,
  created_at timestamptz not null default now()
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.stock_reconciliation(id),
  material_id uuid not null references public.materials(id),
  counted_system_qty numeric(18,3) not null check (counted_system_qty >= 0),
  physical_qty numeric(18,3) not null check (physical_qty >= 0),
  difference_qty numeric(18,3) generated always as (physical_qty - counted_system_qty) stored,
  reason text not null,
  posted_by uuid references public.profiles(id),
  posted_at timestamptz,
  unique (reconciliation_id, material_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id),
  movement_type text not null check (movement_type in ('opening','inward','outward','adjustment','reversal')),
  source_id uuid not null,
  signed_qty numeric(18,3) not null check (signed_qty <> 0),
  before_qty numeric(18,3) not null check (before_qty >= 0),
  after_qty numeric(18,3) not null check (after_qty >= 0),
  business_date date not null,
  posted_by uuid not null references public.profiles(id),
  posted_at timestamptz not null default now(),
  unique (movement_type, source_id),
  check (after_qty = before_qty + signed_qty)
);

create table public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id),
  condition text not null check (condition in ('out_of_stock','low_stock','reorder_required')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  latest_qty numeric(18,3) not null check (latest_qty >= 0)
);

create unique index inventory_alerts_one_open on public.inventory_alerts(material_id, condition) where resolved_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default now()
);

create index materials_category_status_idx on public.materials(category_id, status);
create index inward_material_date_idx on public.stock_inward(material_id, business_date desc);
create index outward_material_date_idx on public.stock_outward(material_id, business_date desc);
create index orders_status_date_idx on public.orders(status, order_date desc);
create index movements_material_date_idx on public.inventory_movements(material_id, posted_at desc);
create index adjustments_material_idx on public.stock_adjustments(material_id);
create index alerts_opened_idx on public.inventory_alerts(opened_at desc) where resolved_at is null;

insert into public.roles(code,name) values
  ('super_admin','Super Admin'),
  ('inventory_manager','Inventory Manager'),
  ('inventory_operator','Inventory Operator'),
  ('viewer','Viewer');

-- A new Auth user receives a profile, never an automatic role.
create function private.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end; $$;

create trigger packflow_auth_user_profile
after insert on auth.users
for each row execute function private.create_profile_for_auth_user();

-- Role lookup is isolated from user_roles RLS to avoid policy recursion.
create function private.has_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.is_active
      and ur.role_code = any(allowed_roles)
  );
$$;

revoke all on function private.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function private.has_role(text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_role(text[]) to authenticated;

-- Explicit Data API grants. Transactional writes will use checked RPCs later.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.roles, public.user_roles,
  public.material_categories, public.suppliers, public.materials,
  public.inventory_balances, public.orders, public.order_items,
  public.stock_inward, public.stock_outward, public.stock_reconciliation,
  public.stock_adjustments, public.inventory_movements, public.inventory_alerts,
  public.audit_logs to authenticated;
grant insert, update on public.material_categories, public.suppliers, public.materials to authenticated;
grant insert, update, delete on public.user_roles to authenticated;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.material_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.materials enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_inward enable row level security;
alter table public.stock_outward enable row level security;
alter table public.stock_reconciliation enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_alerts enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.has_role(array['super_admin'])));
create policy roles_read on public.roles for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy user_roles_read on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or (select private.has_role(array['super_admin'])));
create policy user_roles_insert on public.user_roles for insert to authenticated
with check ((select private.has_role(array['super_admin'])));
create policy user_roles_update on public.user_roles for update to authenticated
using ((select private.has_role(array['super_admin'])))
with check ((select private.has_role(array['super_admin'])));
create policy user_roles_delete on public.user_roles for delete to authenticated
using ((select private.has_role(array['super_admin'])));

create policy categories_read on public.material_categories for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy categories_insert on public.material_categories for insert to authenticated
with check ((select private.has_role(array['super_admin','inventory_manager'])));
create policy categories_update on public.material_categories for update to authenticated
using ((select private.has_role(array['super_admin','inventory_manager'])))
with check ((select private.has_role(array['super_admin','inventory_manager'])));

create policy suppliers_read on public.suppliers for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy suppliers_insert on public.suppliers for insert to authenticated
with check ((select private.has_role(array['super_admin','inventory_manager'])));
create policy suppliers_update on public.suppliers for update to authenticated
using ((select private.has_role(array['super_admin','inventory_manager'])))
with check ((select private.has_role(array['super_admin','inventory_manager'])));

create policy materials_read on public.materials for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy materials_insert on public.materials for insert to authenticated
with check ((select private.has_role(array['super_admin','inventory_manager'])));
create policy materials_update on public.materials for update to authenticated
using ((select private.has_role(array['super_admin','inventory_manager'])))
with check ((select private.has_role(array['super_admin','inventory_manager'])));

create policy balances_read on public.inventory_balances for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy orders_read on public.orders for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy order_items_read on public.order_items for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy inward_read on public.stock_inward for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy outward_read on public.stock_outward for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy reconciliation_read on public.stock_reconciliation for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy adjustments_read on public.stock_adjustments for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy movements_read on public.inventory_movements for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy alerts_read on public.inventory_alerts for select to authenticated
using ((select private.has_role(array['super_admin','inventory_manager','inventory_operator','viewer'])));
create policy audit_read on public.audit_logs for select to authenticated
using ((select private.has_role(array['super_admin'])));
