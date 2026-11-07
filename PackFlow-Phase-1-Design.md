# PackFlow ERP — Phase 1 design proposal

Status: **Phase 1 approved by the user's “please go ahead” instruction after confirming rows 30 and 31.** Row 32's truncated specification, most units and all opening quantities remain pending before material import. Phase 2 has begun separately.

## 1. Material master verification

Source: [WhatsApp photograph](</Users/gaganchugh/Downloads/WhatsApp Image 2026-11-01 at 12.35.20 PM.jpeg>), supplied after the brief. It shows **32 visible rows** across five tables. The transcription below preserves the photographed item labels, codes and specification wording as closely as legibility allows. `—` means the photograph provides no value; it is **not zero**. No opening stock quantities are visible. Codes are text identifiers, including leading zeroes.

| # | Item category on photograph | Specification on photograph | Item code | Unit explicitly stated | Review note |
|---:|---|---|---|---|---|
| 1 | D-Carton Non Std | 800X605X780 | Z0000002-530479 | — | |
| 2 | D-Carton Non Std | 800X605X580 | Z0000002-530472 | — | |
| 3 | D-Carton Non Std | 800X605X380 | Z0000001-993263 | — | |
| 4 | D-Carton Non Std | 800X605X200 | Z0000002-487876 | — | |
| 5 | CAP (Top & Btm) | 815X620X100 | RJ006007-001018 | — | |
| 6 | D Carton | 1140X785X770 | Z0000001-993268 | — | |
| 7 | CAP (Top & Btm) | 1160X805X100 | RJ006005-231914 | — | |
| 8 | Space Box | 530X150X770 | Z0000001-993112 | — | |
| 9 | D Carton | 1095X695X600 | Z0000001-993264 | — | |
| 10 | CAP (Top & Btm) | 1115X715X100 | Z0000001-862556 | — | |
| 11 | D-Carton | 1130X720X780 | Z0000002-299332 | — | |
| 12 | CAP (Top & Btm) | 1145X730X100 | Z0000002-299333 | — | |
| 13 | Space Box | 515X100X780 | Z0000002-299343 | — | |
| 14 | D-Carton | 1170X790X900 | Z0000002-472894 | — | |
| 15 | CAP (Top & Btm) | 1190X810X100 | Z0000002-472904 | — | |
| 16 | Space Box | 550X165X900 | Z0000002-472908 | — | |
| 17 | CAP (Top & Btm) USA | 1200X965X100 | Z0000001-862545 | — | |
| 18 | Ply Wood Box | 1200X800X820 | Z0000002-530488 | — | |
| 19 | Ply Wood Box | 800X600X800 | Z0000002-530486 | — | |
| 20 | Ply Wood Box | 800X600X600 | Z0000002-530485 | — | |
| 21 | Ply Wood Box | 800X600X400 | RJ004002-159048 | — | |
| 22 | Ply Wood Box | 800X600X200 | Z0000002-503705 | — | |
| 23 | Wooden Pallet | 1200X800X123 | RJ004002-001549 | — | |
| 24 | Wooden Pallet | 800X600X123 | Z0000002-528138 | — | |
| 25 | Wooden Pallet (US) | 1000X1200X120 | Z0000001-760194 | — | |
| 26 | Strech Film Machine Grade | Strech Film Machine Grade H-20” T-20 Micron Transparent non printed LDPE, Roll weight ~12 Kg UOM KG | Z0000002-100115 | KG | Spelling `Strech` follows source; confirm 20-inch notation. |
| 27 | Strech Film Machine Grade | Strech Film Machine Grade H-10” T-20 Micron Transparent non printed LDPE, Roll weight ~06 Kg | Z0000002-576771 | — | Unit is not explicitly labelled `UOM` on this row; confirm stock unit. |
| 28 | Bubble Sheet Roll | BUBBLE WRAP-W1100 MM 50 MICRON,IN METER | RH00300G-001583 | Meter | Unit appears in specification; confirm stock unit. |
| 29 | CORNER ANGLE | 75X75mm, 1000mm | Z0000000-369844 | — | |
| 30 | STEEL STRAP APEX 3423 | 40 kg / Roll | RI004006-004846 | — | `RI` prefix confirmed by user. |
| 31 | Corner Angle Board | CORNER ANGLE PROTECTOR (40X40MM),Thickness : 3mm ; Length : 75mm | RC000001-004545 | — | `75mm` length confirmed by user. |
| 32 | BAND-PP | PET STRAP W-16MM, T-0.7MM, COIL L-1600MTR,COLOR-GREEN, CORE DIA - 400MM,CORE … | Z0000001-691278 | — | Specification continues below photograph edge; obtain the missing portion. |

**Verification before import:** rows 30 and 31 are confirmed. Confirm the unit for every item, supply opening stock per item, and provide the continuation of row 32 if available. The visible codes are distinct in this transcription. Item codes and dimensions should remain text to preserve leading zeroes and `X` notation. The photo does not establish whether dimensions are millimetres unless the row explicitly says so.

The ten categories in the brief remain the proposed application categories. Map the photograph's labels to them only after review; retain the original label separately so `D Carton`, `D-Carton`, and `D-Carton Non Std` are not silently rewritten. Proposed mappings include `Ply Wood Box` → Plywood Boxes, `Strech Film Machine Grade` → Stretch Film / Shrink Wrap, `BAND-PP` and steel strap → Strapping Materials, and both corner-angle labels → Corner Angles and Protectors.

## 2. Operating model and information architecture

Primary users are warehouse inventory operators and managers handling export packing materials. The main workflow is **find a material → post an inward or outward movement → see the new balance and alerts → trace the transaction**. Orders describe demand; stock changes only when outward is posted.

| Navigation | Route | Main job |
|---|---|---|
| Dashboard | `/dashboard` | Read today's movements, exceptions and pending orders |
| Material Master | `/inventory/materials` | Find, add, edit and archive materials |
| Stock Inward | `/inventory/inward` | Receive and post materials |
| Stock Outward | `/inventory/outward` | Issue materials against orders |
| Order Management | `/orders` | Manage demand and fulfilment |
| Stock Reconciliation | `/inventory/reconciliation` | Record physical counts and post approved differences |
| Reorder Management | `/inventory/reorder` | Monitor thresholds and unresolved alerts |
| Reports | `/reports` | Filter and export the eleven requested reports |
| User Management | `/admin/users` | Assign roles; Super Admin only |
| Settings | `/admin/settings` | Application settings; Super Admin only |
| Login | `/login` | Authenticate |

The sidebar is collapsible on desktop and becomes a labelled drawer on mobile. Reorder and out-of-stock counts appear beside their navigation item. The active page has a clear title, one primary action and a persistent breadcrumb on detail screens.

## 3. Visual and interaction design

Use an **operations-first** interface: dense enough for daily warehouse work, with clear status colour and strong table readability. Proposed light palette: ink `#172B3A`, canvas `#F5F7F8`, steel `#D6E0E5`, action blue `#176B91`, warning amber `#A96200`, critical red `#B42332`. Dark mode uses the same semantic status meanings with adjusted contrast. Use a legible sans family such as Inter for labels/body and tabular numerals for quantities, references and dates. Colour never carries status alone; each badge has text.

Desktop content is left aligned in a 12-column layout. Tables show sticky headers and item code/specification columns. On mobile, records become compact cards with the primary quantity and status visible before secondary fields. Search, filters and sort remain accessible above each list. Dialogs explain the stock effect before posting; keyboard focus and error messages remain visible.

### Dashboard `/dashboard`

```text
┌ Sidebar ────────┬ Dashboard                  Date ▾  Category ▾ ┐
│ Dashboard       │ [Active] [Inward today] [Outward today]       │
│ Materials       │ [Low] [Out] [Reorder] [Pending orders]       │
│ Inward / Outward│ Inward vs outward     Category distribution  │
│ Orders          │ Stock trend           Order status           │
│ Reorder  [n]    │ Low / reorder priority table                 │
│ Reports         │ Recent transactions  Pending orders         │
└─────────────────┴───────────────────────────────────────────────┘
```

All cards and charts query Supabase in the eventual build. Clicking a count applies the corresponding list filter. “Today” uses the Asia/Kolkata calendar day. Date filters act on the transaction's business date; a separate `posted_at` records when it was entered. **Total Stock Quantity cannot be one meaningful number across PCS, KG, rolls and metres.** Replace that card with quantities grouped by unit (for example, separate PCS and KG figures) or a count of stocked materials; do not sum unlike units.

### Material Master `/inventory/materials` and detail

The list displays item code, category, specification, unit, current stock, minimum, reorder level, suggested quantity, status and last movement. Search covers code/specification; filters cover category, material status and stock condition. A detail page has **Overview**, **Stock settings**, **Transactions** and **Audit** tabs. The stock settings form shows unit beside every threshold, validates `0 ≤ minimum ≤ reorder`, and optionally `reorder ≤ maximum`. Changes prompt a before/after review and recalculate alerts.

### Inward and outward

Both pages have a transaction list and a `Post inward` / `Post outward` action. The form sequence is reference/date → find material by code or category → read-only specification/unit/current stock → quantity and counterpart details → review → post. Outward additionally requires order reference and issued-to. Show projected balance before confirmation. On outward, prevent submission when the issue exceeds available stock and repeat the check in the database transaction. A retry with the same reference displays the original posting, never a second movement. Corrections create a traceable reversal and replacement entry, rather than editing posted history.

### Orders `/orders`

The list shows order number, date, required quantities, issued quantities and status. Detail has editable lines while draft, a fulfilment progress column per material and linked outward postings. Statuses: draft, pending, partially fulfilled, completed, cancelled. Creating or editing an order changes demand only. Posting outward against a line increments its issued quantity, bounded by its remaining requirement unless the order is explicitly amended by an authorised user. Cancellation does not reverse historical issues; a separate authorised correction handles those movements.

### Reconciliation `/inventory/reconciliation`

The count entry screen shows system stock at count time, physical stock, difference and reason. A confirmation view shows the proposed adjustment and who approves/posts it. A posted adjustment becomes immutable and links to its ledger entry and audit record. If stock changed between count and approval, the approver sees the new balance and must review the difference again; this prevents an old count overwriting a newer movement.

### Reorder `/inventory/reorder`

Top row: counts for **Reorder required**, **Low stock** and **Out of stock**. Below: category breakdown and priority table with item code, category, specification, current stock, minimum, reorder level, suggested reorder quantity, unit and badges. Search, sort and the four requested filters are visible. Clicking a row opens the material. Only authorised users see `Edit stock levels`.

The alert logic is represented by separate flags, because one item may be low **and** reorder required:

| Condition | Rule | Alert |
|---|---|---|
| Out of stock | `current = 0` | Out of stock |
| Low stock | `current > 0 AND current < minimum` | Low stock |
| Reorder required | `current > 0 AND reorder is set AND current ≤ reorder` | Reorder required |
| Healthy | Above configured thresholds | None |

If reorder level is blank, show `Not configured` and generate no reorder alert. If preferred reorder quantity is blank, show `Not configured` rather than calculating a quantity. A zero-stock item appears in the out-of-stock filter and highest-priority list; it does not create a second “reorder required” flag under the supplied rules. At each stock movement or threshold change, open the newly true alerts and resolve alerts whose condition has cleared. Keep one unresolved alert per material and condition.

## 4. Application architecture

```text
Next.js / React / TypeScript
  ├─ Tailwind + shadcn/ui: shell, forms, tables, dialogs
  ├─ React Hook Form + Zod: client feedback and input parsing
  ├─ Recharts: dashboard visualisation
  └─ Supabase Auth session / publishable key
          ↓
Supabase Postgres
  ├─ RLS + grants: read and permitted master-data changes
  ├─ Transactional posting functions: inward, outward, adjustment
  ├─ Inventory balances + immutable movement ledger
  └─ Alert reconciliation + audit records
```

Frontend validation improves usability; database constraints and posting functions enforce stock rules. The browser uses only a publishable key. Privileged account provisioning and any secret key stay server-side. Supabase Auth identity is linked to `profiles`; role assignments in database tables, never an email comparison in the UI, determine permissions. RLS applies to every exposed table, with narrowly granted function execution. [Supabase's API security guidance](https://supabase.com/docs/guides/api/securing-your-api) separates SQL grants from RLS; [its Auth guidance](https://supabase.com/docs/guides/auth/managing-user-data) recommends a protected profile table linked to `auth.users`.

## 5. Database schema proposal

Use UUID primary keys, `timestamptz` audit timestamps, `numeric(18,3)` quantities with non-negative/positive constraints, and a fixed material unit. Store the business transaction date separately from `posted_at`. Proposed key fields:

| Table | Key fields and relationships |
|---|---|
| `profiles` | `id` FK to `auth.users.id`, display name, active flag, timestamps |
| `roles` | `id`, unique role code: super_admin, inventory_manager, inventory_operator, viewer |
| `user_roles` | composite unique `(user_id, role_id)`, assigned_by, assigned_at |
| `material_categories` | `id`, unique name, active flag |
| `suppliers` | `id`, name, contact fields if approved, active flag |
| `materials` | `id`, unique original `item_code`, category FK, verbatim specification, `unit`, minimum, nullable reorder level/quantity/maximum, supplier FK nullable, active/archived status, timestamps |
| `inventory_balances` | unique material FK, `current_qty`, version, updated_at; update only through posting routines |
| `stock_inward` | `id`, unique reference, material FK, quantity, business date, supplier FK/entered supplier name, PO reference, remarks, received_by FK, posted_at, correction link nullable |
| `stock_outward` | `id`, unique reference, material FK, quantity, business date, order item FK, issued_to, remarks, issued_by FK, posted_at, correction link nullable |
| `orders` | `id`, unique number, business date, status, created_by, timestamps |
| `order_items` | `id`, order FK, material FK, required_qty, issued_qty derived from linked posted outward rows where practical, unique line position |
| `stock_reconciliation` | `id`, reference, count date, status, counted_by, approved_by, approved_at, remarks |
| `stock_adjustments` | `id`, reconciliation FK, material FK, counted system quantity, physical quantity, difference, reason, posted_by/at, ledger link |
| `inventory_movements` | `id`, material FK, source type/id unique, signed quantity, before_qty, after_qty, business date, posted_at/by; append-only ledger |
| `inventory_alerts` | `id`, material FK, condition, opened_at, resolved_at, latest balance, unique unresolved `(material_id, condition)` |
| `audit_logs` | `id`, actor FK, action, entity, entity ID, before/after JSON, recorded_at |

`inventory_movements` is the explicit auditable ledger required by the brief, in addition to its named tables. Opening stock should be posted as a traceable opening movement only after the material rows and quantities are verified. A zero balance is never inferred from an unverified blank source.

### Posting and integrity rules

1. Receive/issue/adjust through dedicated database transactions. Lock the material balance row, verify permissions and reference uniqueness, validate quantity and order state, insert source and ledger entries, update balance and order fulfilment, reconcile alerts, write audit, then commit together.
2. Use database uniqueness on inward/outward references and source ledger IDs for idempotency. Reject a reused reference with different details.
3. `current_qty ≥ 0`; inward/outward quantities `> 0`; threshold values `≥ 0`; minimum `≤` configured reorder; optional maximum `≥` reorder. Archive a material instead of deleting it once referenced.
4. Posted movements are append-only. Corrections add linked reversing and replacement movements with reason, actor and timestamp; list screens retain the original.
5. Index item code, category/status, business dates, material/date on transactions and ledger, order status, and unresolved alerts.

### Role permissions proposal

| Capability | Super Admin | Manager | Operator | Viewer |
|---|:---:|:---:|:---:|:---:|
| Read materials, balances, orders, alerts and reports | ✓ | ✓ | ✓ | ✓ |
| Add/edit/archive materials and thresholds | ✓ | ✓ | — | — |
| Post inward/outward | ✓ | ✓ | ✓ | — |
| Create/edit draft orders | ✓ | ✓ | ✓ | — |
| Approve/post reconciliation adjustments | ✓ | ✓ | — | — |
| Manage users/settings and read full audit | ✓ | — | — | — |
| Export reports | ✓ | ✓ | — | — |

This matrix is a proposal for approval. It is enforced by RLS and posting functions, including checks inside any privileged function. Super Admin provisioning for the specified email happens only in Phase 2 after the project and secure access method are approved. Do not make a profile admin merely because its email matches. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) also notes that views need `security_invoker` to respect underlying RLS.

## 6. Reports and verification criteria

All eleven named reports share date/category/material filters and export the **filtered** data to Excel/PDF, with report title, filter summary, generation timestamp in IST, unit labels and row counts. Stock reports use the current balance or an explicit as-of date from the ledger; transaction reports show business date and posting timestamp. Category totals are separated by unit. Export permissions match the role matrix.

Before material import, confirm the remaining photographed ambiguity in row 32, units and opening quantities. The role matrix, order over-issue rule, backdated reporting behaviour and proposed manager approval for reconciliation remain documented design assumptions for review. The user's “please go ahead” instruction after confirming rows 30 and 31 was treated as Phase 1 approval to begin Phase 2; it does not authorise inventing or importing the missing item data.
