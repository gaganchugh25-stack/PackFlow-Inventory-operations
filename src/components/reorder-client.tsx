'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Search } from 'lucide-react';
import { Input, Select } from './ui';
import { supabase, type Category, type Material } from '@/lib/supabase';
import { balanceOf } from '@/lib/phase4';
import { conditionLabel, priority, stockConditions, type StockCondition } from '@/lib/stock-status';

type AlertRow={id:string;material_id:string;condition:StockCondition;opened_at:string};
export function ReorderClient(){
  const [materials,setMaterials]=useState<Material[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [alerts,setAlerts]=useState<AlertRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('all');
  const [condition,setCondition]=useState('all');
  const [sort,setSort]=useState('priority');
  const [canEdit,setCanEdit]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError('');const client=supabase();
    const [{data:m,error:me},{data:c,error:ce},{data:a,error:ae},{data:{user}}]=await Promise.all([
      client.from('materials').select('*,material_categories(name),inventory_balances(current_qty)').eq('status','active').order('item_code'),
      client.from('material_categories').select('id,name').eq('is_active',true).order('name'),
      client.from('inventory_alerts').select('id,material_id,condition,opened_at').is('resolved_at',null).order('opened_at',{ascending:false}),
      client.auth.getUser(),
    ]);
    if(me||ce||ae)setError(me?.message||ce?.message||ae?.message||'Could not load reorder data');
    setMaterials((m??[]) as unknown as Material[]);setCategories((c??[]) as Category[]);setAlerts((a??[]) as AlertRow[]);
    if(user){const {data:roles}=await client.from('user_roles').select('role_code').eq('user_id',user.id);
      setCanEdit((roles??[]).some((r:{role_code:string})=>['super_admin','inventory_manager'].includes(r.role_code)));
    }
    setLoading(false);
  },[]);
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get('condition');if(['low_stock','out_of_stock','reorder_required'].includes(requested??''))setCondition(requested!);void load();const refresh=()=>void load();window.addEventListener('packflow:stock-updated',refresh);return()=>window.removeEventListener('packflow:stock-updated',refresh);},[load]);
  const openIds=useMemo(()=>new Set(alerts.map(a=>a.material_id)),[alerts]);
  const count=(name:StockCondition)=>alerts.filter(a=>a.condition===name).length;
  const visible=useMemo(()=>materials.filter(m=>{
    const q=search.trim().toLowerCase();
    return (!q||`${m.item_code} ${m.specification} ${m.material_categories?.name??''}`.toLowerCase().includes(q))
      &&(category==='all'||m.category_id===category)
      &&(condition==='all'||stockConditions(m).includes(condition as StockCondition));
  }).sort((a,b)=>{
    if(sort==='code')return a.item_code.localeCompare(b.item_code);
    if(sort==='stock')return Number(balanceOf(a)??Infinity)-Number(balanceOf(b)??Infinity)||a.item_code.localeCompare(b.item_code);
    if(sort==='category')return (a.material_categories?.name??'').localeCompare(b.material_categories?.name??'')||a.item_code.localeCompare(b.item_code);
    return priority(a)-priority(b)||a.item_code.localeCompare(b.item_code);
  }),[materials,search,category,condition,sort]);
  const categoryCounts=useMemo(()=>categories.map(c=>({name:c.name,count:materials.filter(m=>m.category_id===c.id&&openIds.has(m.id)&&stockConditions(m).includes('reorder_required')).length})).filter(c=>c.count>0).sort((a,b)=>b.count-a.count),[categories,materials,openIds]);

  return <>
    <div className="page-heading"><div><p className="breadcrumb">Inventory / Reorder Management</p><h1>Reorder Management</h1><p className="page-subtitle">Monitor thresholds, open alerts and preferred reorder quantities.</p></div></div>
    <div className="summary-strip"><div><span>Reorder required</span><strong>{count('reorder_required')}</strong></div><div><span>Low stock</span><strong>{count('low_stock')}</strong></div><div><span>Out of stock</span><strong>{count('out_of_stock')}</strong></div></div>
    <div className="reorder-context"><section className="data-panel reorder-category-panel"><div className="reorder-section-head"><h2>Category-wise reorder needs</h2><span>Materials, not mixed units</span></div>{categoryCounts.length?<div className="reorder-category-list">{categoryCounts.map(c=><div key={c.name}><span>{c.name}</span><strong>{c.count}</strong></div>)}</div>:<p className="reorder-empty">No categories currently have a reorder alert.</p>}</section><section className="data-panel reorder-guidance"><div className="reorder-section-head"><h2>Open alerts</h2><span>{alerts.length} condition{alerts.length===1?'':'s'}</span></div>{alerts.length?<div className="reorder-alert-list">{alerts.slice(0,5).map(a=>{const m=materials.find(item=>item.id===a.material_id);return <Link key={a.id} href={`/inventory/materials/${a.material_id}`}><span className={`status-badge ${a.condition==='out_of_stock'?'status-critical':'status-warning'}`}>{conditionLabel[a.condition]}</span><strong>{m?.item_code??'Material'}</strong><span>{m?.material_categories?.name??'—'}</span></Link>;})}</div>:<p className="reorder-empty">No open stock alerts.</p>}</section></div>
    <section className="data-panel"><div className="reorder-section-head"><h2>Reorder priority list</h2><span>Open a material to review its stock settings and transactions.</span></div><div className="table-toolbar"><div className="search-box"><Search size={18}/><Input aria-label="Search reorder materials" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code, specification or category"/></div><div className="filter-controls"><Select aria-label="Category filter" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Select aria-label="Stock condition filter" value={condition} onChange={e=>setCondition(e.target.value)}><option value="all">All conditions</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option><option value="reorder_required">Reorder required</option></Select><Select aria-label="Sort materials" value={sort} onChange={e=>setSort(e.target.value)}><option value="priority">Priority</option><option value="code">Item code</option><option value="stock">Current stock</option><option value="category">Category</option></Select></div></div>
      {error&&<div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}
      {loading?<div className="empty-state">Loading reorder status…</div>:visible.length?<div className="table-scroll"><table><thead><tr><th>Item code</th><th>Category</th><th>Specification</th><th>Current stock</th><th>Minimum</th><th>Reorder level</th><th>Suggested quantity</th><th>Unit</th><th>Stock status</th><th></th></tr></thead><tbody>{visible.map(m=>{const flags=stockConditions(m);return <tr key={m.id}><td className="code-cell"><Link className="text-link" href={`/inventory/materials/${m.id}`}>{m.item_code}</Link></td><td>{m.material_categories?.name??'—'}</td><td className="spec-cell">{m.specification}</td><td className="quantity-cell">{balanceOf(m)===null?'Pending':balanceOf(m)}</td><td className="quantity-cell">{m.minimum_stock_level??'Not configured'}</td><td className="quantity-cell">{m.reorder_level??'Not configured'}</td><td className="quantity-cell">{m.reorder_quantity??'Not configured'}</td><td>{m.unit}</td><td><div className="badge-row">{flags.length?flags.map(flag=><span key={flag} className={`status-badge ${flag==='out_of_stock'?'status-critical':'status-warning'}`}>{conditionLabel[flag]}</span>):<span className="status-badge status-healthy">{balanceOf(m)===null?'Awaiting opening stock':'Healthy'}</span>}</div></td><td><Link className="text-link" href={`/inventory/materials/${m.id}`}>{canEdit?'View / edit':'View'}</Link></td></tr>;})}</tbody></table></div>:<div className="empty-state"><Bell size={30}/><h2>{materials.length?'No materials match these filters':'No verified materials yet'}</h2><p>{materials.length?'Change the filters to see more records.':'Materials appear here after their unit and opening quantity have been confirmed.'}</p></div>}
      <div className="table-footer">{visible.length} of {materials.length} active materials</div></section>
  </>;
}
