# PackFlow ERP — Phase 2 status

Project: `PackFlow ERP` in the user's `Gagan` Supabase organisation, Mumbai (`ap-south-1`). The project reference and URL are kept in local environment settings.

## Completed

- Created a separate Supabase project at the quoted $0 monthly project cost; other projects were not changed.
- Applied [foundation schema](./packflow_phase2_schema.sql), [material guards](./packflow_phase2_guards.sql), and [foreign-key indexes](./packflow_phase2_indexes.sql).
- Created 16 tables: profiles, roles, user_roles, material_categories, suppliers, materials, inventory_balances, orders, order_items, stock_inward, stock_outward, stock_reconciliation, stock_adjustments, inventory_movements, inventory_alerts, audit_logs.
- Enabled RLS on all 16 public tables and added 25 role-based policies. Anonymous users have no material-table SELECT grant; authenticated users have no direct balance UPDATE grant. No transaction or ledger table has direct browser write grants.
- Invited the requested email through Supabase Auth, confirmed that the Auth user and linked profile exist, and assigned `super_admin` in `user_roles` after checking the exact Auth user ID and email. This role is stored in the database, not inferred from a frontend email check.
- Disabled public self-sign-up after the user's separate approval. The Supabase Auth dashboard showed `Allow new users to sign up = off` after a page reload; future users must be invited by an administrator.
- Added a trigger that blocks item-code, unit and opening-quantity changes after stock movement, plus a material-change audit trigger.

## Verification performed

- Supabase reports 16 public tables with RLS enabled and four seeded roles.
- The Super Admin role resolves true for the invited user under a simulated authenticated JWT; Inventory Manager resolves false.
- A simulated authenticated user with no assigned role sees zero role rows.
- Materials, balances and movements remain empty. The photographed material list and opening quantities were not imported.
- Supabase's security advisor has no table/RLS findings. It reports a project-level warning that **leaked-password protection is disabled**: [Supabase password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- The performance advisor's unindexed-foreign-key findings were cleared by the index migration. Its remaining “unused index” notices are expected for an empty new database.

## Pending before Phase 2 approval

- The invitee must accept the email invitation and set their own credential. No password was created or handled here; a real sign-in test requires that user action.
- The first attempt to save invite-only sign-ups was rejected by automatic approval review because the prior approval covered the invitation and role grant only. The user later explicitly approved the Auth setting change. It is now saved and verified after reload.
- Stock-posting functions, application screens and material imports belong to subsequent phases. No Phase 3 work has started.
