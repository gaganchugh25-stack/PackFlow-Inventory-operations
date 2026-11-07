# PackFlow ERP — Phase 4 review

Status: **Implemented and verified with rolled-back database transactions.** Phase 5 has not started.

## Built

- Order Management at `/orders`: unique generated order numbers, draft creation and editing, multiple material lines, submit/cancel actions, status/search filters, and per-line required/issued/remaining quantities. Order creation and editing record demand only.
- Stock Outward at `/inventory/outward`: order and material selection, category filter, stock and order-remaining readouts, quantity/recipient/reference validation, review before posting, and transaction history.
- Database functions in `packflow_phase4_orders_outward.sql`: transactional order saves and status changes; outward posting locks the order and balance, rejects insufficient stock and over-issue, updates order fulfilment and alerts, writes source and ledger rows, and audits the posting. An identical retry of the same outward reference returns the original posting without a second deduction.
- Only Super Admin, Inventory Manager and Inventory Operator roles can call the write functions. Anonymous users have no EXECUTE grant; all data remains behind RLS.

## Verification

- `npm run typecheck` and `npm run build` passed.
- A rolled-back database workflow exercised draft creation/editing, submission, partial issue, duplicate retry, insufficient-stock and over-order rejection, low/reorder/out-of-stock alerts, inward replenishment and completion. After rollback, the live project still has 0 materials, 0 orders and 0 outward postings.
- Supabase security advisor reports the three new authenticated `SECURITY DEFINER` RPCs as review warnings. These are intentionally callable by signed-in users and check the database role inside the function. The earlier inward/import warnings and disabled leaked-password protection warning remain.

## Current limit

The 32 photographed materials still have no confirmed opening quantities, and most units remain unconfirmed. They have not been imported. The order and outward forms will show no eligible materials until verified material data is provided. UI posting with the invited account cannot be exercised until its password recovery and sign-in are completed.
