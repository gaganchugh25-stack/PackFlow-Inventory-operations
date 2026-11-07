# PackFlow ERP · Supabase backend

## Project

- Organisation: Gagan
- Project: PackFlow ERP, Mumbai region (`ap-south-1`)
- Local app: `http://127.0.0.1:3000/login`
- The browser uses the publishable key; no secret or service-role key is bundled into the frontend.

## Database

The existing schema contains materials, categories, suppliers, balances, orders, inward and outward transactions, reconciliations, alerts, movements and audit logs. Row-level security is enabled on each public table. Stock changes use checked database functions so the balance and movement ledger update together.

The ten material categories are the packing-material taxonomy. They are retained so a user can select one when adding a material. No photographed item was imported without a confirmed unit and opening quantity. At the time of this change, the live project had zero materials, orders, stock movements and material files.

## Storage

Migration: [`packflow_storage.sql`](./packflow_storage.sql)

- Bucket: `packflow-material-files`, private, 10 MB per file.
- Accepted files: PDF, JPG, PNG, WebP, CSV and XLSX.
- Signed-in PackFlow role holders can read material files. Super Admins and Inventory Managers can upload to an existing material's folder. Anonymous users have no file policy.
- Open a material's detail page to attach or download its files. The app does not place sample files in the bucket.

## Entering your own data

1. Sign in with the invited PackFlow account.
2. Open **Material Master** and add an item with its confirmed item code, category, specification, unit and opening stock.
3. Open that item's detail page to set thresholds or attach a source document.
4. Post receipts, orders, issues and physical counts through their respective modules. These create the stock history and reports.

The earlier browser-only demo has been removed from the app. Its local storage key is cleared when the updated app opens in that browser.
