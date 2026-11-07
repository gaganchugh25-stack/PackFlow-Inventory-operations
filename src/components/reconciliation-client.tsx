'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Search } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, Textarea } from './ui';
import { supabase, type Category, type Material } from '@/lib/supabase';
import { balanceOf, todayIst } from '@/lib/phase4';
import { reconciliationSelect, type Reconciliation } from '@/lib/phase5';

type CountForm = { reference_number: string; count_date: string; material_id: string; physical_qty: string; reason: string };
const blank = (): CountForm => ({reference_number:'',count_date:todayIst(),material_id:'',physical_qty:'',reason:''});
const validQty = (value:string) => /^\d+(\.\d{1,3})?$/.test(value);

export function ReconciliationClient() {
  const [rows,setRows] = useState<Reconciliation[]>([]);
  const [materials,setMaterials] = useState<Material[]>([]);
  const [categories,setCategories] = useState<Category[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const [canCount,setCanCount] = useState(false);
  const [canApprove,setCanApprove] = useState(false);
  const [userId,setUserId] = useState('');
  const [email,setEmail] = useState('');
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all');
  const [category,setCategory] = useState('all');
  const [formCategory,setFormCategory] = useState('all');
  const [form,setForm] = useState<CountForm>(blank());
  const [revising,setRevising] = useState<string | null>(null);
  const [formOpen,setFormOpen] = useState(false);
  const [reviewOpen,setReviewOpen] = useState(false);
  const [approveRow,setApproveRow] = useState<Reconciliation | null>(null);
  const [freshBalance,setFreshBalance] = useState<{current_qty:number;version:number} | null>(null);
  const [busy,setBusy] = useState(false);
  const [formError,setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);setError('');
    const client=supabase();
    const [{data:r,error:re},{data:m,error:me},{data:c,error:ce},{data:{user}}] = await Promise.all([
      client.from('stock_reconciliation').select(reconciliationSelect).order('created_at',{ascending:false}).limit(200),
      client.from('materials').select('id,item_code,specification,unit,category_id,status,inventory_balances(current_qty)').eq('status','active').order('item_code'),
      client.from('material_categories').select('id,name').eq('is_active',true).order('name'),
      client.auth.getUser(),
    ]);
    if(re||me||ce) setError(re?.message||me?.message||ce?.message||'Could not load reconciliations');
    setRows((r??[]) as unknown as Reconciliation[]);setMaterials((m??[]) as unknown as Material[]);setCategories((c??[]) as Category[]);
    if(user){setUserId(user.id);setEmail(user.email??'');const {data:roles}=await client.from('user_roles').select('role_code').eq('user_id',user.id);
      const codes=(roles??[]).map((x:{role_code:string})=>x.role_code);
      setCanCount(codes.some((code:string)=>['super_admin','inventory_manager','inventory_operator'].includes(code)));
      setCanApprove(codes.some((code:string)=>['super_admin','inventory_manager'].includes(code)));
    }
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);

  const visible=useMemo(()=>rows.filter(row=>{
    const adj=row.stock_adjustments?.[0];const q=search.trim().toLowerCase();
    return (filter==='all'||row.status===filter) && (category==='all'||adj?.materials?.category_id===category)
      && (!q||`${row.reference_number} ${adj?.materials?.item_code??''} ${adj?.materials?.specification??''}`.toLowerCase().includes(q));
  }),[rows,search,filter,category]);
  const material=materials.find(m=>m.id===form.material_id);
  const qty=material?balanceOf(material):null;
  const difference=qty===null||!validQty(form.physical_qty)?null:Number(form.physical_qty)-Number(qty);
  function update(change:Partial<CountForm>){setForm(current=>({...current,...change}));}
  function start(row?:Reconciliation){
    const adj=row?.stock_adjustments?.[0];setRevising(row?.id??null);
    setForm(row&&adj?{reference_number:row.reference_number,count_date:todayIst(),material_id:adj.material_id,physical_qty:String(adj.physical_qty),reason:adj.reason}:blank());
    setFormCategory('all');setFormError('');setFormOpen(true);
  }
  function review(){
    if(!form.reference_number.trim()||!form.count_date||!form.material_id||!validQty(form.physical_qty)||!form.reason.trim()){
      setFormError('Enter a reference, date, material, non-negative physical quantity and reason. Use up to 3 decimals.');return;
    }
    if(!material||qty===null){setFormError('Choose a material with confirmed opening stock.');return;}
    setFormError('');setFormOpen(false);setReviewOpen(true);
  }
  async function saveCount(){
    setBusy(true);setFormError('');
    const response=revising
      ?await supabase().rpc('revise_stock_count',{p_reconciliation_id:revising,p_count_date:form.count_date,p_physical_qty:Number(form.physical_qty),p_reason:form.reason.trim()})
      :await supabase().rpc('create_stock_count',{p_reference_number:form.reference_number.trim(),p_count_date:form.count_date,p_material_id:form.material_id,p_physical_qty:Number(form.physical_qty),p_reason:form.reason.trim()});
    setBusy(false);
    if(response.error){setFormError(response.error.message);return;}
    setReviewOpen(false);setSuccess(revising?'Count refreshed for approval. No stock changed.':'Physical count submitted for approval. No stock changed.');await load();
  }
  async function openApproval(row:Reconciliation){
    const adj=row.stock_adjustments?.[0];if(!adj)return;
    setFormError('');setFreshBalance(null);setApproveRow(row);
    const {data,error:balanceError}=await supabase().from('inventory_balances').select('current_qty,version').eq('material_id',adj.material_id).single();
    if(balanceError){setFormError(balanceError.message);return;}
    setFreshBalance(data as {current_qty:number;version:number});
  }
  async function approve(){
    if(!approveRow)return;
    setBusy(true);setFormError('');
    const {error:postError}=await supabase().rpc('post_stock_reconciliation',{p_reconciliation_id:approveRow.id});
    setBusy(false);
    if(postError){setFormError(postError.message);return;}
    setApproveRow(null);setSuccess(`${approveRow.reference_number} posted. The balance and alerts are updated.`);
    window.dispatchEvent(new Event('packflow:stock-updated'));await load();
  }
  const pending=rows.filter(r=>r.status==='pending_approval').length;
  const approveAdj=approveRow?.stock_adjustments?.[0];
  const stale=Boolean(approveAdj&&freshBalance&&(Number(freshBalance.current_qty)!==Number(approveAdj.counted_system_qty)||Number(freshBalance.version)!==Number(approveAdj.counted_balance_version)));

  return <>
    <div className="page-heading"><div><p className="breadcrumb">Inventory / Reconciliation</p><h1>Stock Reconciliation</h1><p className="page-subtitle">Compare a physical count with system stock, then approve any adjustment.</p></div>{canCount&&<Button onClick={()=>start()}><Plus size={18}/> Record count</Button>}</div>
    <div className="summary-strip"><div><span>Counts recorded</span><strong>{rows.length}</strong></div><div><span>Pending approval</span><strong>{pending}</strong></div><div><span>Posted</span><strong>{rows.filter(r=>r.status==='posted').length}</strong></div></div>
    {success&&<div className="notice notice-success" role="status">{success}</div>}
    <section className="data-panel"><div className="table-toolbar"><div className="search-box"><Search size={18}/><Input aria-label="Search counts" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reference or item code"/></div><div className="filter-controls"><Select aria-label="Category filter" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Select aria-label="Status filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option><option value="pending_approval">Pending approval</option><option value="posted">Posted</option></Select></div></div>
      {error&&<div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}
      {loading?<div className="empty-state">Loading counts…</div>:visible.length?<div className="table-scroll"><table><thead><tr><th>Reference</th><th>Count date</th><th>Item code</th><th>System</th><th>Physical</th><th>Difference</th><th>Reason</th><th>Reconciled by</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map(row=>{const adj=row.stock_adjustments?.[0];return <tr key={row.id}><td className="code-cell">{row.reference_number}</td><td>{row.count_date}</td><td className="code-cell">{adj?.materials?.item_code??'—'}</td><td>{adj?.counted_system_qty} {adj?.materials?.unit}</td><td>{adj?.physical_qty} {adj?.materials?.unit}</td><td className="quantity-cell">{Number(adj?.difference_qty??0)>0?'+':''}{adj?.difference_qty} {adj?.materials?.unit}</td><td className="spec-cell">{adj?.reason??'—'}</td><td>{row.counted_by===userId?email:`User ${row.counted_by.slice(0,8)}`}</td><td><span className={`status-badge ${row.status==='posted'?'status-healthy':'status-warning'}`}>{row.status.replaceAll('_',' ')}</span></td><td><div className="badge-row">{row.status==='pending_approval'&&canCount&&<button className="text-link" onClick={()=>start(row)}>Recount</button>}{row.status==='pending_approval'&&canApprove&&<button className="text-link" onClick={()=>void openApproval(row)}>Review / post</button>}</div></td></tr>;})}</tbody></table></div>:<div className="empty-state"><ClipboardCheck size={30}/><h2>No physical counts yet</h2><p>Record a count only for a material with confirmed opening stock.</p>{canCount&&<Button onClick={()=>start()}><Plus size={17}/> Record count</Button>}</div>}
      <div className="table-footer">{visible.length} of {rows.length} recent counts</div></section>

    <Modal open={formOpen} onOpenChange={setFormOpen} title={revising?'Recount material':'Record physical count'} description={revising?'Confirm a fresh physical count against the latest system balance.':'The count awaits manager approval; it does not change stock yet.'}><div className="material-form"><div className="form-grid"><FormField label="Reconciliation reference"><Input value={form.reference_number} disabled={!!revising} onChange={e=>update({reference_number:e.target.value})} placeholder="Unique count reference"/></FormField><FormField label="Reconciliation date"><Input type="date" value={form.count_date} onChange={e=>update({count_date:e.target.value})}/></FormField><FormField label="Material category"><Select value={formCategory} disabled={!!revising} onChange={e=>{setFormCategory(e.target.value);update({material_id:''});}}><option value="all">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField><FormField label="Item code"><Select value={form.material_id} disabled={!!revising} onChange={e=>update({material_id:e.target.value})}><option value="">Choose material</option>{materials.filter(m=>balanceOf(m)!==null&&(formCategory==='all'||m.category_id===formCategory)).map(m=><option key={m.id} value={m.id}>{m.item_code}</option>)}</Select></FormField><div className="form-span material-readout"><span>Specification</span><strong>{material?.specification??'Choose an item code'}</strong><span>System stock</span><strong>{qty===null?'—':`${qty} ${material?.unit}`}</strong><span>Difference</span><strong>{difference===null?'—':`${difference>0?'+':''}${difference} ${material?.unit}`}</strong></div><FormField label={`Physical stock${material?` (${material.unit})`:''}`}><Input inputMode="decimal" value={form.physical_qty} onChange={e=>update({physical_qty:e.target.value})} placeholder="Verified physical count"/></FormField><FormField label="Reconciled by"><Input value={email} disabled readOnly/></FormField><div className="form-span"><FormField label="Reason for difference"><Textarea value={form.reason} onChange={e=>update({reason:e.target.value})} rows={2} placeholder="Explain the count and any variance"/></FormField></div></div>{formError&&<div className="notice notice-error" role="alert">{formError}</div>}<div className="form-actions"><Button variant="secondary" onClick={()=>setFormOpen(false)}>Cancel</Button><Button onClick={review}>Review count</Button></div></div></Modal>
    <Modal open={reviewOpen} onOpenChange={setReviewOpen} title="Review physical count" description="Submitting this count does not change stock. A manager must approve it."><div className="review-list"><div><span>Reference</span><strong>{form.reference_number}</strong></div><div><span>Material</span><strong>{material?.item_code} — {material?.specification}</strong></div><div><span>System stock</span><strong>{qty} {material?.unit}</strong></div><div><span>Physical stock</span><strong>{form.physical_qty} {material?.unit}</strong></div><div><span>Difference</span><strong>{difference===null?'—':`${difference>0?'+':''}${difference} ${material?.unit}`}</strong></div><div><span>Reason</span><strong>{form.reason}</strong></div></div>{formError&&<div className="notice notice-error" role="alert">{formError}</div>}<div className="form-actions"><Button variant="secondary" onClick={()=>{setReviewOpen(false);setFormOpen(true);}}>Edit count</Button><Button disabled={busy} onClick={saveCount}>{busy?'Saving…':'Submit for approval'}</Button></div></Modal>
    <Modal open={Boolean(approveRow)} onOpenChange={open=>{if(!open)setApproveRow(null);}} title={`Approve ${approveRow?.reference_number??'count'}`} description="Posting changes the inventory balance and writes a permanent adjustment record."><div className="review-list"><div><span>Material</span><strong>{approveAdj?.materials?.item_code} — {approveAdj?.materials?.specification}</strong></div><div><span>Counted system stock</span><strong>{approveAdj?.counted_system_qty} {approveAdj?.materials?.unit}</strong></div><div><span>Current system stock</span><strong>{freshBalance?`${freshBalance.current_qty} ${approveAdj?.materials?.unit}`:'Checking…'}</strong></div><div><span>Physical stock</span><strong>{approveAdj?.physical_qty} {approveAdj?.materials?.unit}</strong></div><div><span>Adjustment</span><strong>{approveAdj?.difference_qty} {approveAdj?.materials?.unit}</strong></div><div><span>Reason</span><strong>{approveAdj?.reason}</strong></div></div>{stale&&<div className="notice notice-error" role="alert">Stock changed after this count. Recount and refresh the pending record before approval.</div>}{formError&&<div className="notice notice-error" role="alert">{formError}</div>}<div className="form-actions"><Button variant="secondary" onClick={()=>setApproveRow(null)}>Close</Button>{stale&&approveRow&&<Button variant="secondary" onClick={()=>{const row=approveRow;setApproveRow(null);start(row);}}>Recount</Button>}<Button disabled={busy||!freshBalance||stale} onClick={approve}>{busy?'Posting…':'Approve and post'}</Button></div></Modal>
  </>;
}
