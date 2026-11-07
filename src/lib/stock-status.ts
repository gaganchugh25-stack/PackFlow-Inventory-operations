import type { Material } from './supabase';
import { balanceOf } from './phase4';

export type StockCondition = 'out_of_stock'|'low_stock'|'reorder_required';
export function stockConditions(material: Material): StockCondition[] {
  if(material.status!=='active') return [];
  const current=balanceOf(material);
  if(current===null) return [];
  if(Number(current)===0) return ['out_of_stock'];
  const conditions:StockCondition[]=[];
  if(material.minimum_stock_level!==null&&Number(current)<Number(material.minimum_stock_level)) conditions.push('low_stock');
  if(material.reorder_level!==null&&Number(current)<=Number(material.reorder_level)) conditions.push('reorder_required');
  return conditions;
}
export function priority(material:Material){
  const flags=stockConditions(material);
  return flags.includes('out_of_stock')?0:flags.includes('low_stock')?1:flags.includes('reorder_required')?2:balanceOf(material)===null?4:3;
}
export const conditionLabel:Record<StockCondition,string>={out_of_stock:'Out of stock',low_stock:'Low stock',reorder_required:'Reorder required'};
