export type Adjustment = {
  id: string; material_id: string; counted_system_qty: number; counted_balance_version: number;
  physical_qty: number; difference_qty: number; reason: string; posted_at: string | null;
  materials: { item_code: string; specification: string; unit: string; category_id: string } | null;
};
export type Reconciliation = {
  id: string; reference_number: string; count_date: string; status: string; counted_by: string;
  approved_by: string | null; approved_at: string | null; created_at: string;
  stock_adjustments: Adjustment[];
};
export const reconciliationSelect = 'id,reference_number,count_date,status,counted_by,approved_by,approved_at,created_at,stock_adjustments(id,material_id,counted_system_qty,counted_balance_version,physical_qty,difference_qty,reason,posted_at,materials(item_code,specification,unit,category_id))';
