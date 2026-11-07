import type { ReportData,MaterialRow,MovementRow } from './report-data';
import { todayIst } from './phase4';

export const reportDefinitions = [
  {key:'current_stock',title:'Current Stock Report'},
  {key:'stock_inward',title:'Stock Inward Report'},
  {key:'stock_outward',title:'Stock Outward Report'},
  {key:'category_stock',title:'Category-wise Stock Report'},
  {key:'material_stock',title:'Material-wise Stock Report'},
  {key:'order_status',title:'Order Status Report'},
  {key:'reconciliation',title:'Stock Reconciliation Report'},
  {key:'low_stock',title:'Low Stock Report'},
  {key:'reorder_required',title:'Reorder Required Report'},
  {key:'out_of_stock',title:'Out-of-Stock Report'},
  {key:'movement_history',title:'Stock Transaction History'},
] as const;
export type ReportKey=typeof reportDefinitions[number]['key'];
export type ReportFilters={from:string;to:string;categoryId:string;materialId:string;search:string};
export const emptyFilters:ReportFilters={from:'',to:'',categoryId:'all',materialId:'all',search:''};
export type ReportColumn={key:string;label:string;kind?:'number'|'text'};
export type ReportRow=Record<string,string|number|null>;
export type ReportResult={title:string;columns:ReportColumn[];rows:ReportRow[];note:string};
const c=(key:string,label:string,kind?:'number'|'text'):ReportColumn=>({key,label,kind});
const round=(value:number)=>Math.round(value*1000)/1000;
const ist=(value:string|null)=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'—';
const dateIn=(date:string,filters:ReportFilters)=> (!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to);
export function reportTitle(key:ReportKey){return reportDefinitions.find(r=>r.key===key)?.title??'Report';}
export function stockAsOf(material:MaterialRow,data:ReportData,to:string):number|null{
  const balance=data.balances.find(b=>b.material_id===material.id);
  if(!balance)return null;
  if(!to||to>=todayIst())return Number(balance.current_qty);
  if(material.created_at.slice(0,10)>to)return null;
  return round(data.movements.filter(m=>m.material_id===material.id&&m.business_date<=to).reduce((n,m)=>n+Number(m.signed_qty),0));
}
export function currentStock(material:MaterialRow,data:ReportData):number|null{
  const row=data.balances.find(b=>b.material_id===material.id);
  return row?Number(row.current_qty):null;
}
export function conditions(material:MaterialRow,data:ReportData):string[]{
  if(material.status!=='active')return [];
  const qty=currentStock(material,data);if(qty===null)return [];
  if(qty===0)return ['out_of_stock'];
  const result:string[]=[];
  if(material.minimum_stock_level!==null&&qty<Number(material.minimum_stock_level))result.push('low_stock');
  if(material.reorder_level!==null&&qty<=Number(material.reorder_level))result.push('reorder_required');
  return result;
}
export function categoryName(id:string,data:ReportData){return data.categories.find(c=>c.id===id)?.name??'Uncategorised';}
function matchesMaterial(m:MaterialRow,data:ReportData,f:ReportFilters){
  const q=f.search.trim().toLowerCase();
  return (f.categoryId==='all'||m.category_id===f.categoryId)
    &&(f.materialId==='all'||m.id===f.materialId)
    &&(!q||`${m.item_code} ${m.specification} ${categoryName(m.category_id,data)}`.toLowerCase().includes(q));
}
function matchesTransaction(m:MaterialRow|undefined,reference:string,data:ReportData,f:ReportFilters){
  if(!m)return false;
  const q=f.search.trim().toLowerCase();
  return (f.categoryId==='all'||m.category_id===f.categoryId)
    &&(f.materialId==='all'||m.id===f.materialId)
    &&(!q||`${reference} ${m.item_code} ${m.specification} ${categoryName(m.category_id,data)}`.toLowerCase().includes(q));
}
function status(qty:number|null,m:MaterialRow){
  if(m.status!=='active')return 'Archived';
  if(qty===null)return 'Awaiting opening stock';
  if(qty===0)return 'Out of stock';
  const flags:string[]=[];
  if(m.minimum_stock_level!==null&&qty<Number(m.minimum_stock_level))flags.push('Low stock');
  if(m.reorder_level!==null&&qty<=Number(m.reorder_level))flags.push('Reorder required');
  return flags.join(', ')||'Healthy';
}
const materialColumns=[c('item_code','Item code','text'),c('category','Category'),c('specification','Specification'),c('unit','Unit')];
const stockColumns=[...materialColumns,c('opening','Opening stock','number'),c('current','Current stock','number'),c('minimum','Minimum stock','number'),c('reorder','Reorder level','number'),c('status','Stock status')];
const alertColumns=[...materialColumns,c('current','Current stock','number'),c('minimum','Minimum stock','number'),c('reorder','Reorder level','number'),c('suggested','Suggested reorder qty','number'),c('status','Stock status')];
function stockRow(m:MaterialRow,data:ReportData,qty:number|null):ReportRow{return {item_code:m.item_code,category:categoryName(m.category_id,data),specification:m.specification,unit:m.unit,opening:m.opening_stock_qty,current:qty,minimum:m.minimum_stock_level,reorder:m.reorder_level,status:status(qty,m)};}
function alertRow(m:MaterialRow,data:ReportData):ReportRow{return {item_code:m.item_code,category:categoryName(m.category_id,data),specification:m.specification,unit:m.unit,current:currentStock(m,data),minimum:m.minimum_stock_level,reorder:m.reorder_level,suggested:m.reorder_quantity,status:status(currentStock(m,data),m)};}
function movementRows(movements:MovementRow[],data:ReportData,f:ReportFilters){return movements.filter(x=>dateIn(x.business_date,f)&&matchesTransaction(data.materials.find(m=>m.id===x.material_id),x.movement_type,data,f));}

export function buildReport(key:ReportKey,data:ReportData,f:ReportFilters):ReportResult{
  const title=reportTitle(key);
  const selected=data.materials.filter(m=>matchesMaterial(m,data,f));
  if(key==='current_stock')return {title,columns:stockColumns,rows:selected.filter(m=>!f.to||m.created_at.slice(0,10)<=f.to).map(m=>stockRow(m,data,stockAsOf(m,data,f.to))),note:f.to?`Stock as at ${f.to}, reconstructed from ledger business dates. Current thresholds are shown.`:'Current balances at generation time. Date From does not alter this snapshot.'};
  if(key==='category_stock'){
    const groups=new Map<string,{category:string;unit:string;materials:number;confirmed:number;pending:number;quantity:number}>();
    for(const m of selected){if(f.to&&m.created_at.slice(0,10)>f.to)continue;const category=categoryName(m.category_id,data);const k=`${category}\u0000${m.unit}`;const qty=stockAsOf(m,data,f.to);
      const g=groups.get(k)??{category,unit:m.unit,materials:0,confirmed:0,pending:0,quantity:0};g.materials++;if(qty===null)g.pending++;else{g.confirmed++;g.quantity=round(g.quantity+qty);}groups.set(k,g);}
    return {title,columns:[c('category','Category'),c('unit','Unit'),c('materials','Materials','number'),c('confirmed','Confirmed balances','number'),c('pending','Pending balances','number'),c('quantity','Stock quantity','number')],rows:[...groups.values()].sort((a,b)=>a.category.localeCompare(b.category)||a.unit.localeCompare(b.unit)),note:f.to?`Stock as at ${f.to} by business date. Quantities are never added across units.`:'Current stock grouped by category and unit. Quantities are never added across units.'};
  }
  if(key==='material_stock'){
    const rows=selected.filter(m=>!f.to||m.created_at.slice(0,10)<=f.to).map(m=>{
      const mv=movementRows(data.movements.filter(x=>x.material_id===m.id),data,{...f,search:''});
      const total=(type:string)=>round(mv.filter(x=>x.movement_type===type).reduce((n,x)=>n+Math.abs(Number(x.signed_qty)),0));
      return {...stockRow(m,data,stockAsOf(m,data,f.to)),inward:total('inward'),outward:total('outward'),adjustment:round(mv.filter(x=>x.movement_type==='adjustment').reduce((n,x)=>n+Number(x.signed_qty),0))};
    });
    return {title,columns:[...stockColumns.slice(0,6),c('inward','Inward in period','number'),c('outward','Outward in period','number'),c('adjustment','Adjustment in period','number'),c('status','Stock status')],rows,note:'Current/as-of stock is a snapshot; inward, outward and adjustments use the selected business-date period. Each row retains its unit.'};
  }
  if(key==='low_stock'||key==='reorder_required'||key==='out_of_stock')return {title,columns:alertColumns,rows:selected.filter(m=>conditions(m,data).includes(key)).map(m=>alertRow(m,data)),note:'Live stock condition using current balances and current thresholds. Date filters do not alter this live alert report.'};
  if(key==='stock_inward'){
    const rows=data.inward.filter(x=>dateIn(x.business_date,f)&&matchesTransaction(data.materials.find(m=>m.id===x.material_id),x.reference_number,data,f)).sort((a,b)=>b.business_date.localeCompare(a.business_date)||b.posted_at.localeCompare(a.posted_at)).map(x=>{const m=data.materials.find(m=>m.id===x.material_id)!;return {reference:x.reference_number,date:x.business_date,item_code:m.item_code,category:categoryName(m.category_id,data),specification:m.specification,quantity:Number(x.quantity),unit:m.unit,supplier:x.supplier_name??'—',purchase_order:x.purchase_order_reference??'—',posted_at:ist(x.posted_at)};});
    return {title,columns:[c('reference','Inward reference','text'),c('date','Business date'),...materialColumns.slice(0,3),c('quantity','Quantity','number'),c('unit','Unit'),c('supplier','Supplier'),c('purchase_order','PO reference','text'),c('posted_at','Posted (IST)')],rows,note:'Date filters use the business date; posting timestamp is shown separately in IST.'};
  }
  if(key==='stock_outward'){
    const rows=data.outward.filter(x=>dateIn(x.business_date,f)&&matchesTransaction(data.materials.find(m=>m.id===x.material_id),x.reference_number,data,f)).sort((a,b)=>b.business_date.localeCompare(a.business_date)||b.posted_at.localeCompare(a.posted_at)).map(x=>{const m=data.materials.find(m=>m.id===x.material_id)!;const line=data.orderItems.find(i=>i.id===x.order_item_id);const order=data.orders.find(o=>o.id===line?.order_id);return {reference:x.reference_number,date:x.business_date,order:order?.order_number??'—',item_code:m.item_code,category:categoryName(m.category_id,data),specification:m.specification,quantity:Number(x.quantity),unit:m.unit,issued_to:x.issued_to,posted_at:ist(x.posted_at)};});
    return {title,columns:[c('reference','Outward reference','text'),c('date','Business date'),c('order','Order number','text'),...materialColumns.slice(0,3),c('quantity','Quantity','number'),c('unit','Unit'),c('issued_to','Issued to'),c('posted_at','Posted (IST)')],rows,note:'Date filters use the business date; posting timestamp is shown separately in IST.'};
  }
  if(key==='order_status'){
    const rows=data.orderItems.flatMap(line=>{const o=data.orders.find(o=>o.id===line.order_id),m=data.materials.find(m=>m.id===line.material_id);if(!o||!m||!dateIn(o.order_date,f)||!matchesTransaction(m,o.order_number,data,f))return [];
      const issued=round(data.outward.filter(x=>x.order_item_id===line.id).reduce((n,x)=>n+Number(x.quantity),0));return [{order:o.order_number,date:o.order_date,status:o.status,line:line.line_number,item_code:m.item_code,specification:m.specification,required:Number(line.required_qty),issued,remaining:round(Number(line.required_qty)-issued),unit:m.unit}];});
    rows.sort((a,b)=>b.date.localeCompare(a.date)||a.order.localeCompare(b.order)||a.line-b.line);
    return {title,columns:[c('order','Order number','text'),c('date','Order date'),c('status','Status'),c('line','Line','number'),c('item_code','Item code','text'),c('specification','Specification'),c('required','Required','number'),c('issued','Issued','number'),c('remaining','Remaining','number'),c('unit','Unit')],rows,note:'One row per order line. Issued quantities come only from posted outward transactions.'};
  }
  if(key==='reconciliation'){
    const rows=data.adjustments.flatMap(a=>{const r=data.reconciliations.find(r=>r.id===a.reconciliation_id),m=data.materials.find(m=>m.id===a.material_id);if(!r||!m||!dateIn(r.count_date,f)||!matchesTransaction(m,r.reference_number,data,f))return [];
      return [{reference:r.reference_number,date:r.count_date,item_code:m.item_code,category:categoryName(m.category_id,data),system:Number(a.counted_system_qty),physical:Number(a.physical_qty),difference:Number(a.difference_qty),unit:m.unit,reason:a.reason,status:r.status,counted_by:r.counted_by,approved_by:r.approved_by??'—',posted_at:ist(a.posted_at)}];});
    rows.sort((a,b)=>b.date.localeCompare(a.date));
    return {title,columns:[c('reference','Reference','text'),c('date','Count date'),c('item_code','Item code','text'),c('category','Category'),c('system','System','number'),c('physical','Physical','number'),c('difference','Difference','number'),c('unit','Unit'),c('reason','Reason'),c('status','Status'),c('counted_by','Counted by','text'),c('approved_by','Approved by','text'),c('posted_at','Posted (IST)')],rows,note:'Pending counts have not changed stock. A posted non-zero difference has a linked adjustment ledger entry.'};
  }
  const rows=movementRows(data.movements,data,f).sort((a,b)=>b.business_date.localeCompare(a.business_date)||b.posted_at.localeCompare(a.posted_at)).map(x=>{const m=data.materials.find(m=>m.id===x.material_id)!;return {date:x.business_date,type:x.movement_type,item_code:m.item_code,category:categoryName(m.category_id,data),specification:m.specification,change:Number(x.signed_qty),unit:m.unit,before:Number(x.before_qty),after:Number(x.after_qty),posted_at:ist(x.posted_at)};});
  return {title,columns:[c('date','Business date'),c('type','Movement'),...materialColumns.slice(0,3),c('change','Change','number'),c('unit','Unit'),c('before','Before','number'),c('after','After','number'),c('posted_at','Posted (IST)')],rows,note:'Movement history uses the ledger. Date filters use business date; posted timestamp is shown in IST.'};
}

export function filterSummary(f:ReportFilters,data:ReportData,key:ReportKey){
  const parts=[`Date: ${f.from||'Any'} to ${f.to||'Any'}`,`Category: ${f.categoryId==='all'?'All':categoryName(f.categoryId,data)}`,
    `Material: ${f.materialId==='all'?'All':data.materials.find(m=>m.id===f.materialId)?.item_code??'Unknown'}`];
  if(f.search.trim())parts.push(`Search: ${f.search.trim()}`);
  if(['low_stock','reorder_required','out_of_stock'].includes(key))parts.push('Live condition; date filter not applied');
  return parts.join(' | ');
}
export type ReportSort={key:string;direction:'asc'|'desc'};
export function sortReport(report:ReportResult,sort:ReportSort):ReportResult{
  const column=report.columns.find(c=>c.key===sort.key);
  if(!column)return report;
  const factor=sort.direction==='asc'?1:-1;
  const rows=[...report.rows].sort((a,b)=>{
    const av=a[column.key],bv=b[column.key];
    if(av===null||av===undefined)return bv===null||bv===undefined?0:1;
    if(bv===null||bv===undefined)return -1;
    if(column.kind==='number')return (Number(av)-Number(bv))*factor;
    return String(av).localeCompare(String(bv),'en-IN',{numeric:false,sensitivity:'base'})*factor;
  });
  return {...report,rows};
}
