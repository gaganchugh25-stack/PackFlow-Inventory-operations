# PackFlow ERP

Inventory operations for export packing materials, built with Next.js and Supabase. The app covers the material master, stock inward and outward, orders, reconciliation, reorder management, and reports.

## Run locally

1. Install dependencies: `npm ci`
2. Copy `.env.example` to `.env.local` and enter your own Supabase project URL and publishable key. Keep `.env.local` on your computer.
3. Start the app: `npm run dev`
4. Open <http://127.0.0.1:3000> and sign in with an invited account.

The project uses Supabase Auth, Postgres and Storage. Database and storage migration scripts are in the repository root. Apply them in phase order to a new Supabase project; the live project's data is not included in this repository.

## Checks

- `npm run typecheck`
- `npm run build`

Never commit `.env.local`, passwords, service-role keys, or customer data. The repository includes only the environment variable template.
