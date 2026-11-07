# PackFlow ERP

Inventory operations for export packing materials, built with Next.js and Supabase. The app covers the material master, stock inward and outward, orders, reconciliation, reorder management, and reports.

## Run locally

1. Install dependencies: `npm ci`
2. Copy `.env.example` to `.env.local` and enter your own Supabase project URL and publishable key. Keep `.env.local` on your computer.
3. Start the app: `npm run dev`
4. Open <http://127.0.0.1:3000> and sign in with an invited account.

The project uses Supabase Auth, Postgres and Storage. Database and storage migration scripts are in the repository root. Apply them in phase order to a new Supabase project; the live project's data is not included in this repository.

## Deploy on Hostinger

Use a Hostinger plan that supports Node.js applications and connect this repository as the application source. This is a Next.js server application, so deploy it as a Node.js app rather than a static website.

In the Hostinger application's **environment variables**, set both values from your local `.env.local` file:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |

Set these variables **before the production build**. Hostinger installs dependencies from `package.json` and the committed `package-lock.json`, then builds the app. If either `NEXT_PUBLIC_` value changes, run a new build so the browser bundle receives the updated value. Do not upload `.env.local`, `.next/` or `node_modules/` to GitHub or the deployment archive.

After the site has a final HTTPS domain, add that domain to the Supabase Auth site URL and redirect allow list. Then verify sign-in, a material list read, and a report export on the deployed site.

## Checks

- `npm run typecheck`
- `npm run build`

Never commit `.env.local`, passwords, service-role keys, or customer data. The repository includes only the environment variable template.
