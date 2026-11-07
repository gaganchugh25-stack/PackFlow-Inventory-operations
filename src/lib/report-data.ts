import type { SupabaseClient } from '@supabase/supabase-js';

export type CategoryRow = { id:string; name:string };
export type MaterialRow = { id:string; item_code:string; category_id:string; specification:string; unit:string; status:string; opening_stock_qty:number|null; minimum_stock_level:number|null; reorder_level:number|null; reorder_quantity:number|null; maximum_stock_level:number|null; created_at:string };
export type BalanceRow = { material_id:string; current_qty:number };
export type InwardRow = { id:string; reference_number:string; business_date:string; material_id:string; quantity:number; supplier_name:string|null; purchase_order_reference:string|null; received_by:string; posted_at:string };
export type OutwardRow = { id:string; reference_number:string; business_date:string; material_id:string; quantity:number; order_item_id:string; issued_to:string; issued_by:string; posted_at:string };
export type OrderRow = { id:string; order_number:string; order_date:string; status:string; created_at:string };
export type OrderItemRow = { id:string; order_id:string; line_number:number; material_id:string; required_qty:number };
export type ReconciliationRow = { id:string; reference_number:string; count_date:string; status:string; counted_by:string; approved_by:string|null; approved_at:string|null; created_at:string };
export type AdjustmentRow = { id:string; reconciliation_id:string; material_id:string; counted_system_qty:number; physical_qty:number; difference_qty:number; reason:string; posted_at:string|null };
export type MovementRow = { id:string; material_id:string; movement_type:string; signed_qty:number; before_qty:number; after_qty:number; business_date:string; posted_at:string };
export type AlertRow = { id:string; material_id:string; condition:string; opened_at:string; resolved_at:string|null };
export type ReportData = {
  categories:CategoryRow[]; materials:MaterialRow[]; balances:BalanceRow[];
  inward:InwardRow[]; outward:OutwardRow[]; orders:OrderRow[]; orderItems:OrderItemRow[];
  reconciliations:ReconciliationRow[]; adjustments:AdjustmentRow[]; movements:MovementRow[]; alerts:AlertRow[];
};

async function allRows<T>(client:SupabaseClient,table:string,orderColumn='id'):Promise<T[]>{
  const rows:T[]=[];let offset=0;
  while(true){
    const {data,error}=await client.from(table).select('*').order(orderColumn).range(offset,offset+999);
    if(error)throw new Error(`${table}: ${error.message}`);
    const page=(data??[]) as T[];rows.push(...page);
    if(page.length<1000)break;
    offset+=1000;
  }
  return rows;
}
export async function loadReportData(client:SupabaseClient):Promise<ReportData>{
  const [categories,materials,balances,inward,outward,orders,orderItems,reconciliations,adjustments,movements,alerts]=await Promise.all([
    allRows<CategoryRow>(client,'material_categories'),allRows<MaterialRow>(client,'materials'),
    allRows<BalanceRow>(client,'inventory_balances','material_id'),allRows<InwardRow>(client,'stock_inward'),
    allRows<OutwardRow>(client,'stock_outward'),allRows<OrderRow>(client,'orders'),
    allRows<OrderItemRow>(client,'order_items'),allRows<ReconciliationRow>(client,'stock_reconciliation'),
    allRows<AdjustmentRow>(client,'stock_adjustments'),allRows<MovementRow>(client,'inventory_movements'),
    allRows<AlertRow>(client,'inventory_alerts'),
  ]);
  return {categories,materials,balances,inward,outward,orders,orderItems,reconciliations,adjustments,movements,alerts};
}
