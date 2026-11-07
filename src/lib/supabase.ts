import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function supabase() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase public configuration is missing');
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}

// Recovery emails may open in a different browser from the one that requested them.
// An implicit recovery redirect carries a one-time session in the URL fragment,
// which the recovery page immediately removes and stores in the normal cookie client.
export function recoveryEmailClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase public configuration is missing');
  return createClient(url, key, { auth: {
    flowType: 'implicit', detectSessionInUrl: false,
    persistSession: false, autoRefreshToken: false,
  } });
}

export type Material = {
  id: string;
  item_code: string;
  source_category_label: string | null;
  specification: string;
  unit: string;
  opening_stock_qty: number | null;
  minimum_stock_level: number | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  maximum_stock_level: number | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  category_id: string;
  supplier_id: string | null;
  material_categories: { name: string } | null;
  suppliers: { name: string } | null;
  inventory_balances: { current_qty: number } | { current_qty: number }[] | null;
};

export type Category = { id: string; name: string };
