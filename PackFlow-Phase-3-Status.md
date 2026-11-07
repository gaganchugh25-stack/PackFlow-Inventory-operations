# PackFlow ERP — Phase 3 review

Status: **Implemented and tested; initial material import awaits verified source data.** Phase 4 has not started.

## Built

- Local Next.js/React/TypeScript app with responsive login, Material Master and Stock Inward screens. Tailwind CSS, Radix-based shadcn-style dialog components, React Hook Form and Zod are installed and used. The browser client uses only the Supabase publishable key.
- Material Master supports add, edit, search, category and stock-condition filters, archive status, reorder thresholds, CSV export, and a CSV import preview that requires a confirmed unit and opening quantity for each row. The import RPC posts the reviewed batch atomically; any invalid row rolls back the whole batch.
- Opening stock initialises a balance and an opening ledger movement when positive. A confirmed zero creates a zero balance and an out-of-stock alert without a fabricated positive movement. Opening stock cannot be changed after confirmation.
- Inward posting checks role, active material, confirmed opening balance, positive quantity and unique reference. It increases the balance, writes the inward record and ledger entry, updates alerts and writes an audit entry in one database transaction. Repeating an identical reference returns the original posting without adding stock again.
- The ten categories named in the approved brief are present in Supabase. No photographed material row has been imported; all 32 still lack an opening quantity, and most lack a confirmed unit. Row 32's full specification is still unavailable.

## Verification

- `npm run typecheck` and `npm run build` passed. The production build uses webpack because Turbopack could not bind a helper port inside the restricted build sandbox.
- Browser inspection confirmed the login page at desktop and mobile sizes. An authenticated material or inward screen could not be exercised through the browser until the invited account completes sign-in; database workflows were tested under a simulated authenticated role.
- Rolled-back database test: 5 PCS opening + 4 PCS inward = 9 PCS. Duplicate posting kept one inward ledger row. Low and reorder alerts resolved as stock recovered.
- Rolled-back import test: a confirmed zero opening created a zero balance and one out-of-stock alert. A separate threshold edit test ended with no open reorder alert after the threshold moved below current stock.
- After rollback, Supabase shows 10 categories, 0 live materials, 0 inward postings and 0 stock movements.

## Security and limits

- `post_stock_inward` and `import_materials` are intentionally callable by signed-in users but check database roles inside narrowly scoped `SECURITY DEFINER` functions with an empty search path. Supabase's generic security advisor flags these two callable functions for review: [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Anonymous users have no EXECUTE grant.
- Supabase also reports that [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) is disabled at project level. Invite-only sign-ups remain enabled.
- Live UI sign-in and material import depend on the user's invite acceptance and verified unit/opening-stock file. Do not enter assumed values to make the source list importable.

## Local run

From `/Users/gaganchugh/Desktop/Inventory`: `npm install`, then `npm run dev -- --webpack -H 127.0.0.1`; open `http://127.0.0.1:3000/login`. `.env.local` contains the project URL and publishable key only. No service-role or database secret key is in the frontend.

## Invitation redirect repair

The initial Supabase invitation used its default `http://localhost:3000` site URL, while the local app was served at `127.0.0.1`; the app also lacked a password-completion page. The Supabase site and allowed redirect URL now point to `http://127.0.0.1:3000/auth/recovery`. The app has a recovery page that accepts a fresh password-reset link and lets the account holder set their own password. This local URL must be changed to the deployed domain in Phase 7.
