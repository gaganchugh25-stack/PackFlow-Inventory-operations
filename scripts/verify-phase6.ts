import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { buildDashboard,defaultDashboardFilters } from '../src/lib/dashboard';
import { buildReport,emptyFilters,reportDefinitions,sortReport } from '../src/lib/reporting';
import { excelBuffer,pdfBuffer } from '../src/lib/report-export';
import { todayIst } from '../src/lib/phase4';
import type { ReportData } from '../src/lib/report-data';

async function main(){
const today=todayIst();
const data:ReportData={
  categories:[{id:'c1',name:'Carton'},{id:'c2',name:'Film'}],
  materials:[
    {id:'m1',item_code:'0001',category_id:'c1',specification:'D Carton 800×605×780',unit:'PCS',status:'active',opening_stock_qty:5,minimum_stock_level:3,reorder_level:4,reorder_quantity:10,maximum_stock_level:20,created_at:'2026-01-01T00:00:00Z'},
    {id:'m2',item_code:'Z0002',category_id:'c2',specification:'Film 20 micron',unit:'KG',status:'active',opening_stock_qty:0,minimum_stock_level:2,reorder_level:5,reorder_quantity:6,maximum_stock_level:20,created_at:'2026-01-01T00:00:00Z'},
  ],
  balances:[{material_id:'m1',current_qty:2},{material_id:'m2',current_qty:0}],
  inward:[{id:'i1',reference_number:'IN-001',business_date:today,material_id:'m1',quantity:3,supplier_name:'Test supplier',purchase_order_reference:'PO-1',received_by:'u1',posted_at:`${today}T08:00:00Z`}],
  outward:[{id:'o1',reference_number:'OUT-001',business_date:today,material_id:'m1',quantity:6,order_item_id:'l1',issued_to:'Packing',issued_by:'u1',posted_at:`${today}T09:00:00Z`}],
  orders:[{id:'order1',order_number:'PF-000001',order_date:today,status:'partially_fulfilled',created_at:`${today}T06:00:00Z`}],
  orderItems:[{id:'l1',order_id:'order1',line_number:1,material_id:'m1',required_qty:10}],
  reconciliations:[{id:'r1',reference_number:'REC-001',count_date:today,status:'pending_approval',counted_by:'u1',approved_by:null,approved_at:null,created_at:`${today}T10:00:00Z`}],
  adjustments:[{id:'a1',reconciliation_id:'r1',material_id:'m2',counted_system_qty:0,physical_qty:0,difference_qty:0,reason:'Physical check',posted_at:null}],
  movements:[
    {id:'mv1',material_id:'m1',movement_type:'opening',signed_qty:5,before_qty:0,after_qty:5,business_date:'2026-01-01',posted_at:'2026-01-01T00:00:00Z'},
    {id:'mv2',material_id:'m1',movement_type:'inward',signed_qty:3,before_qty:5,after_qty:8,business_date:today,posted_at:`${today}T08:00:00Z`},
    {id:'mv3',material_id:'m1',movement_type:'outward',signed_qty:-6,before_qty:8,after_qty:2,business_date:today,posted_at:`${today}T09:00:00Z`},
  ],
  alerts:[{id:'al1',material_id:'m1',condition:'low_stock',opened_at:`${today}T09:00:00Z`,resolved_at:null},{id:'al2',material_id:'m1',condition:'reorder_required',opened_at:`${today}T09:00:00Z`,resolved_at:null},{id:'al3',material_id:'m2',condition:'out_of_stock',opened_at:`${today}T09:00:00Z`,resolved_at:null}],
};
const dashboard=buildDashboard(data,defaultDashboardFilters);
assert.equal(dashboard.activeCount,2);assert.equal(dashboard.lowCount,1);assert.equal(dashboard.outCount,1);assert.equal(dashboard.reorderCount,1);
assert.deepEqual(dashboard.stockByUnit,[{unit:'KG',quantity:0},{unit:'PCS',quantity:2}]);
assert.equal(dashboard.inwardToday.count,1);assert.equal(dashboard.outwardToday.count,1);
const expected:Record<string,number>={current_stock:2,stock_inward:1,stock_outward:1,category_stock:2,material_stock:2,order_status:1,reconciliation:1,low_stock:1,reorder_required:1,out_of_stock:1,movement_history:3};
for(const def of reportDefinitions){const report=buildReport(def.key,data,emptyFilters);assert.equal(report.rows.length,expected[def.key],def.key);}
const sorted=sortReport(buildReport('current_stock',data,emptyFilters),{key:'item_code',direction:'desc'});
assert.equal(sorted.rows[0].item_code,'Z0002');
const categories=buildReport('category_stock',data,emptyFilters);
assert.deepEqual(categories.rows.map(r=>[r.unit,r.quantity]),[['PCS',2],['KG',0]]);
const asOf=buildReport('current_stock',data,{...emptyFilters,to:'2026-01-01'});
assert.equal(asOf.rows.find(r=>r.item_code==='0001')?.current,5);
const inward=buildReport('stock_inward',data,{...emptyFilters,from:today,to:today});
assert.equal(inward.rows.length,1);
assert.equal(buildReport('stock_inward',data,{...emptyFilters,to:'2026-01-01'}).rows.length,0);
const now=new Date();
const xlsx=await excelBuffer(buildReport('current_stock',data,emptyFilters),emptyFilters,'current_stock',data,now);
const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx as unknown as Parameters<typeof workbook.xlsx.load>[0]);
assert.equal(workbook.worksheets[0].getCell('A7').value,'0001');
assert.equal(workbook.worksheets[0].getCell('F7').value,2);
const pdf=await pdfBuffer(inward,{...emptyFilters,from:today,to:today},'stock_inward',data,now);
assert.equal(pdf.subarray(0,4).toString(),'%PDF');
await writeFile('/tmp/packflow-phase6-sample.xlsx',xlsx);
await writeFile('/tmp/packflow-phase6-sample.pdf',pdf);
await writeFile('/tmp/packflow-phase6-wide.pdf',await pdfBuffer(buildReport('reconciliation',data,emptyFilters),emptyFilters,'reconciliation',data,now));
console.log(`Passed: 11 reports, mixed units, dashboard figures, date filtering, leading-zero Excel code, PDF/XLSX generation (${xlsx.length} and ${pdf.length} bytes).`);

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
