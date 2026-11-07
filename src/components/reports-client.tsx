'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, FileText, Search } from 'lucide-react';
import { Button, Input, Select } from './ui';
import { supabase } from '@/lib/supabase';
import { loadReportData,type ReportData } from '@/lib/report-data';
import { buildReport,emptyFilters,filterSummary,reportDefinitions,sortReport,type ReportSort,type ReportFilters,type ReportKey,type ReportColumn,type ReportRow } from '@/lib/reporting';

function cellValue(row:ReportRow,column:ReportColumn){
  const v=row[column.key];if(v!==null&&v!==undefined&&v!=='')return String(v);
  if(['suggested','reorder','minimum'].includes(column.key))return 'Not configured';
  if(column.key==='current')return 'Pending';
  return '—';
}
export function ReportsClient(){
  const [data,setData]=useState<ReportData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [exportError,setExportError]=useState('');
  const [canExport,setCanExport]=useState(false);
  const [key,setKey]=useState<ReportKey>('current_stock');
  const [filters,setFilters]=useState<ReportFilters>(emptyFilters);
  const [page,setPage]=useState(0);
  const [sort,setSort]=useState<ReportSort>({key:'',direction:'asc'});
  const [exporting,setExporting]=useState<'xlsx'|'pdf'|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError('');const client=supabase();
    try{const [{data:{user}},rows]=await Promise.all([client.auth.getUser(),loadReportData(client)]);setData(rows);
      if(user){const {data:roles}=await client.from('user_roles').select('role_code').eq('user_id',user.id);
        setCanExport((roles??[]).some((r:{role_code:string})=>['super_admin','inventory_manager'].includes(r.role_code)));}
    }catch(e){setError(e instanceof Error?e.message:'Could not load reports');}
    setLoading(false);
  },[]);
  useEffect(()=>{const report=new URLSearchParams(window.location.search).get('report');if(reportDefinitions.some(def=>def.key===report))setKey(report as ReportKey);void load();},[load]);
  const report=useMemo(()=>data?sortReport(buildReport(key,data,filters),sort):null,[key,data,filters,sort]);
  const categoryName=(id:string)=>data?.categories.find(c=>c.id===id)?.name??'—';
  const materials=(data?.materials??[]).filter(m=>filters.categoryId==='all'||m.category_id===filters.categoryId).sort((a,b)=>a.item_code.localeCompare(b.item_code));
  const invalidDate=Boolean(filters.from&&filters.to&&filters.from>filters.to);
  function changeFilters(change:Partial<ReportFilters>){setFilters(f=>({...f,...change}));setPage(0);}
  async function exportFile(format:'xlsx'|'pdf'){
    if(!report||!canExport||invalidDate)return;
    setExportError('');setExporting(format);
    try{
      const response=await fetch('/api/reports/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,format,filters,sort})});
      if(!response.ok){const result=await response.json().catch(()=>({error:'Could not export report'}));throw new Error(result.error??'Could not export report');}
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download=`packflow-${key}-${new Date().toISOString().slice(0,10)}.${format}`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){setExportError(e instanceof Error?e.message:'Could not export report');}
    setExporting(null);
  }
  const pageRows=report?.rows.slice(page*100,(page+1)*100)??[];
  const pageCount=Math.max(1,Math.ceil((report?.rows.length??0)/100));
  return <>
    <div className="page-heading"><div><p className="breadcrumb">Analytics / Reports</p><h1>Reports</h1><p className="page-subtitle">Live inventory, order and stock movement reports from Supabase.</p></div><div className="heading-actions">{canExport&&<><Button variant="secondary" disabled={loading||!!exporting||invalidDate} onClick={()=>void exportFile('xlsx')}><ArrowDownToLine size={17}/>{exporting==='xlsx'?'Preparing Excel…':'Export Excel'}</Button><Button variant="secondary" disabled={loading||!!exporting||invalidDate} onClick={()=>void exportFile('pdf')}><ArrowDownToLine size={17}/>{exporting==='pdf'?'Preparing PDF…':'Export PDF'}</Button></>}</div></div>
    <div className="report-tabs" role="tablist" aria-label="Report type">{reportDefinitions.map(def=><button key={def.key} role="tab" aria-selected={key===def.key} className={`report-tab ${key===def.key?'report-tab-active':''}`} onClick={()=>{setKey(def.key);setPage(0);setSort({key:'',direction:'asc'});setExportError('');}}>{def.title.replace(' Report','')}</button>)}</div>
    <section className="data-panel report-filter-panel"><div className="report-filters"><label className="form-field"><span className="form-label">Date from</span><Input type="date" value={filters.from} onChange={e=>changeFilters({from:e.target.value})}/></label><label className="form-field"><span className="form-label">Date to / as at</span><Input type="date" value={filters.to} onChange={e=>changeFilters({to:e.target.value})}/></label><label className="form-field"><span className="form-label">Category</span><Select value={filters.categoryId} onChange={e=>changeFilters({categoryId:e.target.value,materialId:'all'})}><option value="all">All categories</option>{data?.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><label className="form-field"><span className="form-label">Material</span><Select value={filters.materialId} onChange={e=>changeFilters({materialId:e.target.value})}><option value="all">All materials</option>{materials.map(m=><option key={m.id} value={m.id}>{m.item_code} · {categoryName(m.category_id)}</option>)}</Select></label><label className="form-field report-search"><span className="form-label">Search</span><span className="search-box"><Search size={17}/><Input aria-label="Search report" value={filters.search} onChange={e=>changeFilters({search:e.target.value})} placeholder="Item code, specification or reference"/></span></label></div>{invalidDate&&<p className="field-error report-filter-error">Date From must be before Date To.</p>}</section>
    {error&&<div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}{exportError&&<div className="notice notice-error" role="alert">{exportError}</div>}
    <section className="data-panel"><div className="reorder-section-head"><h2>{report?.title??'Loading report…'}</h2><span>{report?.rows.length??0} rows</span></div>{data&&<div className="report-metadata"><span>{filterSummary(filters,data,key)}</span><span>Generated {new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} IST</span></div>}{report&&<p className="report-note">{report.note}</p>}
      {loading?<div className="empty-state">Loading report data…</div>:report?.rows.length?<div className="table-scroll"><table><thead><tr>{report.columns.map(c=><th key={c.key}><button className="report-sort-button" onClick={()=>{setSort(current=>({key:c.key,direction:current.key===c.key&&current.direction==='asc'?'desc':'asc'}));setPage(0);}} aria-label={`Sort by ${c.label}`}>{c.label}{sort.key===c.key?sort.direction==='asc'?' ↑':' ↓':''}</button></th>)}</tr></thead><tbody>{pageRows.map((row,index)=><tr key={`${page}-${index}`}>{report.columns.map(c=><td key={c.key} className={`${c.kind==='number'?'quantity-cell':''} ${c.key==='specification'||c.key==='reason'?'spec-cell':''} ${c.kind==='text'?'code-cell':''}`}>{cellValue(row,c)}</td>)}</tr>)}</tbody></table></div>:<div className="empty-state"><FileText size={30}/><h2>No rows match this report</h2><p>Try another report or change the date and material filters. No values have been invented.</p></div>}
      <div className="table-footer report-footer"><span>{report?.rows.length??0} total rows · Showing {report?.rows.length?`${page*100+1}–${Math.min((page+1)*100,report.rows.length)}`:'0'}</span><span className="report-pager"><Button variant="secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1} of {pageCount}</span><Button variant="secondary" disabled={page>=pageCount-1} onClick={()=>setPage(p=>p+1)}>Next</Button></span></div>
    </section>
  </>;
}
