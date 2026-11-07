import type { Material } from './supabase';

export type OrderLine = {
  id: string; line_number: number; material_id: string; required_qty: number;
  materials: { item_code: string; specification: string; unit: string; category_id: string } | null;
  stock_outward: { quantity: number }[];
};
export type Order = {
  id: string; order_number: string; order_date: string; status: 'draft'|'pending'|'partially_fulfilled'|'completed'|'cancelled';
  created_at: string; order_items: OrderLine[];
};
export type OutwardRow = {
  id: string; reference_number: string; business_date: string; quantity: number; issued_to: string;
  posted_at: string; materials: { item_code: string; specification: string; unit: string } | null;
  order_items: { orders: { order_number: string } | null } | null;
};
export function todayIst() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function balanceOf(material: Material) {
  const balance = material.inventory_balances;
  return Array.isArray(balance) ? balance[0]?.current_qty ?? null : balance?.current_qty ?? null;
}
export function issuedQty(line: OrderLine) {
  return (line.stock_outward ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
}
export const orderSelect = 'id,order_number,order_date,status,created_at,order_items(id,line_number,material_id,required_qty,materials(item_code,specification,unit,category_id),stock_outward(quantity))';
