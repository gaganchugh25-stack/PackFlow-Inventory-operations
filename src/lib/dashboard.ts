import type { ReportData } from './report-data';
import { categoryName, conditions, currentStock } from './reporting';
import { todayIst } from './phase4';

export type DashboardFilters={from:string;to:string;categoryId:string;unit:string;search:string};
export const defaultDashboardFilters:DashboardFilters={from:'',to:'',categoryId:'all',unit:'all',search:''};
const round=(n:number)=>Math.round(n*1000)/1000;
const dateIn=(d:string,f:DashboardFilters)=> (!f.from||d>=f.from)&&(!f.to||d<=f.to);
const monthKey=(d:string)=>d.slice(0,7);
export function buildDashboard(data:ReportData,f:DashboardFilters){
  const materialMap=new Map(data.materials.map(m=>[m.id,m]));
  const active=data.materials.filter(m=>m.status==='active'&&(f.categoryId==='all'||m.category_id===f.categoryId));
  const selectedIds=new Set(active.map(m=>m.id));
  const visibleMaterial=(id:string)=>selectedIds.has(id);
  const stockByUnit=[...active.reduce((map,m)=>{const qty=currentStock(m,data);if(qty!==null)map.set(m.unit,round((map.get(m.unit)??0)+qty));return map;},new Map<string,number>())].map(([unit,quantity])=>({unit,quantity})).sort((a,b)=>a.unit.localeCompare(b.unit));
  const today=todayIst();
  const inwardToday=data.inward.filter(x=>x.business_date===today&&visibleMaterial(x.material_id));
  const outwardToday=data.outward.filter(x=>x.business_date===today&&visibleMaterial(x.material_id));
  const unitTotals=(rows:{material_id:string;quantity:number}[])=>[...rows.reduce((map,x)=>{const unit=materialMap.get(x.material_id)?.unit;if(unit)map.set(unit,round((map.get(unit)??0)+Number(x.quantity)));return map;},new Map<string,number>())].map(([unit,quantity])=>({unit,quantity})).sort((a,b)=>a.unit.localeCompare(b.unit));
  const low=active.filter(m=>conditions(m,data).includes('low_stock')).sort((a,b)=>a.item_code.localeCompare(b.item_code));
  const reorder=active.filter(m=>conditions(m,data).includes('reorder_required')).sort((a,b)=>a.item_code.localeCompare(b.item_code));
  const out=active.filter(m=>conditions(m,data).includes('out_of_stock'));
  const orders=data.orders.filter(o=>{
    if(!dateIn(o.order_date,f))return false;
    return f.categoryId==='all'||data.orderItems.some(line=>line.order_id===o.id&&selectedIds.has(line.material_id));
  });
  const pending=orders.filter(o=>['pending','partially_fulfilled'].includes(o.status)).sort((a,b)=>b.order_date.localeCompare(a.order_date));
  const periodMovements=data.movements.filter(m=>visibleMaterial(m.material_id)&&dateIn(m.business_date,f)&&(!f.search.trim()||`${materialMap.get(m.material_id)?.item_code??''} ${m.movement_type}`.toLowerCase().includes(f.search.trim().toLowerCase())));
  const periodInward=data.inward.filter(x=>visibleMaterial(x.material_id)&&dateIn(x.business_date,f));
  const periodOutward=data.outward.filter(x=>visibleMaterial(x.material_id)&&dateIn(x.business_date,f));
  const monthSet=new Set([...periodInward,...periodOutward].map(x=>monthKey(x.business_date)));
  const monthly=[...monthSet].sort().map(month=>({month,
    inward:round(periodInward.filter(x=>monthKey(x.business_date)===month&&(f.unit==='all'||materialMap.get(x.material_id)?.unit===f.unit)).reduce((n,x)=>n+(f.unit==='all'?1:Number(x.quantity)),0)),
    outward:round(periodOutward.filter(x=>monthKey(x.business_date)===month&&(f.unit==='all'||materialMap.get(x.material_id)?.unit===f.unit)).reduce((n,x)=>n+(f.unit==='all'?1:Number(x.quantity)),0)),
  }));
  const distributionMap=new Map<string,number>();
  for(const m of active){const qty=currentStock(m,data);if(qty===null)continue;if(f.unit!=='all'&&m.unit!==f.unit)continue;
    const category=categoryName(m.category_id,data);distributionMap.set(category,round((distributionMap.get(category)??0)+(f.unit==='all'?(qty>0?1:0):qty)));}
  const distribution=[...distributionMap].map(([name,value])=>({name,value})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  const trendMap=new Map<string,{date:string;inward:number;outward:number;adjustment:number}>();
  for(const mv of periodMovements){const mat=materialMap.get(mv.material_id);if(!mat||(f.unit!=='all'&&mat.unit!==f.unit))continue;
    const date=mv.business_date;const row=trendMap.get(date)??{date,inward:0,outward:0,adjustment:0};
    const value=f.unit==='all'?1:Math.abs(Number(mv.signed_qty));
    if(mv.movement_type==='inward')row.inward=round(row.inward+value);
    if(mv.movement_type==='outward')row.outward=round(row.outward+value);
    if(mv.movement_type==='adjustment')row.adjustment=round(row.adjustment+value);
    trendMap.set(date,row);
  }
  const trend=[...trendMap.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const statusMap=new Map<string,number>();for(const order of orders)statusMap.set(order.status,(statusMap.get(order.status)??0)+1);
  const orderStatus=[...statusMap].map(([name,value])=>({name:name.replaceAll('_',' '),value}));
  const recent=periodMovements.sort((a,b)=>b.posted_at.localeCompare(a.posted_at)).slice(0,8).map(m=>({...m,material:materialMap.get(m.material_id)}));
  const priority=[...new Map([...out,...low,...reorder].map(m=>[m.id,m])).values()].filter(m=>!f.search.trim()||`${m.item_code} ${m.specification}`.toLowerCase().includes(f.search.trim().toLowerCase())).slice(0,8);
  return {activeCount:active.length,stockByUnit,inwardToday:{count:inwardToday.length,byUnit:unitTotals(inwardToday)},outwardToday:{count:outwardToday.length,byUnit:unitTotals(outwardToday)},lowCount:low.length,outCount:out.length,reorderCount:reorder.length,pendingCount:pending.length,monthly:!f.from&&!f.to?monthly.slice(-12):monthly,distribution,trend,orderStatus,priority,low:low.slice(0,7),reorder:reorder.slice(0,7),recent,pending:pending.slice(0,7)};
}
