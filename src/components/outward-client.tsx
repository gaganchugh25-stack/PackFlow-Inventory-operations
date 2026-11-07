'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { ArrowUpRight, PackageMinus, Plus, Search } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, Textarea } from './ui';
import { supabase, type Category, type Material } from '@/lib/supabase';
import { balanceOf, issuedQty, orderSelect, todayIst, type Order, type OrderLine, type OutwardRow } from '@/lib/phase4';

const outwardSchema = z.object({
  reference_number: z.string().trim().min(1,'Enter an outward reference'),
  business_date: z.string().min(1,'Choose a date'),
  order_id: z.string().uuid('Choose an order'),
  order_item_id: z.string().uuid('Choose an order line'),
  quantity: z.string().refine(v => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0,'Enter a positive quantity with up to 3 decimals'),
  issued_to: z.string().trim().min(1,'Enter who received the material'),
  remarks: z.string(),
});
type Form = z.infer<typeof outwardSchema>;
const initial = (): Form => ({reference_number:'',business_date:todayIst(),order_id:'',order_item_id:'',quantity:'',issued_to:'',remarks:''});

export function OutwardClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<OutwardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [canPost, setCanPost] = useState(false);
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [formCategory, setFormCategory] = useState('all');
  const [form, setForm] = useState<Form>(initial());
  const [formOpen, setFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const client = supabase();
    const [{data:o,error:oe},{data:m,error:me},{data:c,error:ce},{data:r,error:re},{data:{user}}] = await Promise.all([
      client.from('orders').select(orderSelect).in('status',['pending','partially_fulfilled']).order('order_date',{ascending:false}).limit(200),
      client.from('materials').select('id,item_code,specification,unit,status,category_id,inventory_balances(current_qty)').eq('status','active').order('item_code'),
      client.from('material_categories').select('id,name').eq('is_active',true).order('name'),
      client.from('stock_outward').select('id,reference_number,business_date,quantity,issued_to,posted_at,materials(item_code,specification,unit),order_items(orders(order_number))').order('posted_at',{ascending:false}).limit(100),
      client.auth.getUser(),
    ]);
    if (oe || me || ce || re) setError(oe?.message || me?.message || ce?.message || re?.message || 'Could not load stock outward');
    setOrders((o??[]) as unknown as Order[]); setMaterials((m??[]) as unknown as Material[]);
    setCategories((c??[]) as Category[]); setRows((r??[]) as unknown as OutwardRow[]);
    if (user) {
      setEmail(user.email ?? '');
      const {data:roles} = await client.from('user_roles').select('role_code').eq('user_id',user.id);
      setCanPost((roles??[]).some((role:{role_code:string}) => ['super_admin','inventory_manager','inventory_operator'].includes(role.role_code)));
    }
    setLoading(false);
  }, []);
  useEffect(() => {void load();},[load]);

  const order = orders.find(o => o.id === form.order_id);
  const eligibleLines = (order?.order_items ?? []).filter(line => {
    const material = materials.find(m => m.id === line.material_id);
    return material && (formCategory === 'all' || material.category_id === formCategory) && issuedQty(line) < Number(line.required_qty);
  });
  const line: OrderLine | undefined = order?.order_items.find(item => item.id === form.order_item_id);
  const material = materials.find(m => m.id === line?.material_id);
  const available = material ? balanceOf(material) : null;
  const remaining = line ? Number(line.required_qty)-issuedQty(line) : null;
  const projected = available === null ? null : Number(available)-Number(form.quantity || 0);
  const visible = useMemo(() => rows.filter(row => {
    const q = search.trim().toLowerCase();
    const match = `${row.reference_number} ${row.order_items?.orders?.order_number ?? ''} ${row.materials?.item_code ?? ''} ${row.materials?.specification ?? ''}`.toLowerCase().includes(q);
    const material = materials.find(m => m.item_code === row.materials?.item_code);
    return match && (!dateFilter || row.business_date === dateFilter) && (category === 'all' || material?.category_id === category);
  }),[rows,search,category,materials,dateFilter]);

  function update(change: Partial<Form>) {setForm(current => ({...current,...change}));}
  function start() {setForm(initial());setFormCategory('all');setFormError('');setSuccess('');setFormOpen(true);}
  function review() {
    const parsed = outwardSchema.safeParse(form);
    if (!parsed.success) {setFormError(parsed.error.issues[0]?.message ?? 'Check the form');return;}
    if (!material || available === null || remaining === null) {setFormError('Choose an order line with confirmed stock.');return;}
    if (Number(form.quantity) > Number(available)) {setFormError('Quantity exceeds available stock.');return;}
    if (Number(form.quantity) > remaining) {setFormError('Quantity exceeds the remaining order requirement.');return;}
    setFormError('');setFormOpen(false);setReviewOpen(true);
  }
  async function post() {
    setPosting(true);setFormError('');
    const {error:postError} = await supabase().rpc('post_stock_outward',{
      p_reference_number:form.reference_number.trim(),p_business_date:form.business_date,
      p_order_item_id:form.order_item_id,p_quantity:Number(form.quantity),
      p_issued_to:form.issued_to.trim(),p_remarks:form.remarks.trim() || null,
    });
    setPosting(false);
    if (postError) {setFormError(postError.message);return;}
    setReviewOpen(false);setSuccess(`Outward ${form.reference_number} posted. Stock, order fulfilment and alerts are updated.`);window.dispatchEvent(new Event('packflow:stock-updated'));await load();
  }

  return <>
    <div className="page-heading"><div><p className="breadcrumb">Inventory / Stock Outward</p><h1>Stock Outward</h1><p className="page-subtitle">Issue materials against orders with a permanent stock movement record.</p></div>{canPost && <Button onClick={start}><Plus size={18}/> Post outward</Button>}</div>
    <div className="summary-strip"><div><span>Posted transactions</span><strong>{rows.length}</strong></div><div><span>Issues today</span><strong>{rows.filter(r => r.business_date===todayIst()).length}</strong></div><div><span>Orders ready for issue</span><strong>{orders.length}</strong></div></div>
    {success && <div className="notice notice-success" role="status">{success}</div>}
    <section className="data-panel"><div className="table-toolbar"><div className="search-box"><Search size={18}/><Input aria-label="Search outward transactions" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reference, order or item code"/></div><div className="filter-controls"><Input aria-label="Business date filter" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/><Select aria-label="Category filter" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div></div>
      {error && <div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}
      {loading ? <div className="empty-state">Loading outward history…</div> : visible.length ? <div className="table-scroll"><table><thead><tr><th>Outward reference</th><th>Date</th><th>Order</th><th>Item code</th><th>Specification</th><th>Quantity issued</th><th>Issued to</th><th>Posted</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td className="code-cell">{row.reference_number}</td><td>{row.business_date}</td><td className="code-cell">{row.order_items?.orders?.order_number ?? '—'}</td><td className="code-cell">{row.materials?.item_code ?? '—'}</td><td className="spec-cell">{row.materials?.specification ?? '—'}</td><td className="quantity-cell">{row.quantity} {row.materials?.unit ?? ''}</td><td>{row.issued_to}</td><td>{new Date(row.posted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table></div> : <div className="empty-state"><PackageMinus size={30}/><h2>No outward transactions yet</h2><p>Submit an order with verified materials and confirmed stock before posting an issue.</p>{canPost && <Button onClick={start}><Plus size={17}/> Post outward</Button>}</div>}
      <div className="table-footer">{visible.length} of {rows.length} recent transactions</div></section>

    <Modal open={formOpen} onOpenChange={setFormOpen} title="Post stock outward" description="Choose a pending order line. The issue cannot exceed available stock or remaining demand."><div className="material-form"><div className="form-grid"><FormField label="Outward reference number"><Input value={form.reference_number} onChange={e => update({reference_number:e.target.value})} placeholder="Unique issue reference"/></FormField><FormField label="Date"><Input type="date" value={form.business_date} onChange={e => update({business_date:e.target.value})}/></FormField><FormField label="Order reference"><Select value={form.order_id} onChange={e => update({order_id:e.target.value,order_item_id:''})}><option value="">Choose pending order</option>{orders.map(o => <option key={o.id} value={o.id}>{o.order_number} · {o.status.replaceAll('_',' ')}</option>)}</Select></FormField><FormField label="Material category"><Select value={formCategory} onChange={e => {setFormCategory(e.target.value);update({order_item_id:''});}}><option value="all">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField><FormField label="Item code"><Select value={form.order_item_id} onChange={e => update({order_item_id:e.target.value})}><option value="">Choose order line</option>{eligibleLines.map(item => <option key={item.id} value={item.id}>{item.materials?.item_code} · {Number(item.required_qty)-issuedQty(item)} {item.materials?.unit} remaining</option>)}</Select></FormField><FormField label={`Quantity issued${material ? ` (${material.unit})` : ''}`}><Input inputMode="decimal" value={form.quantity} onChange={e => update({quantity:e.target.value})} placeholder="0"/></FormField><div className="form-span material-readout"><span>Specification</span><strong>{material?.specification ?? 'Choose an item code'}</strong><span>Available stock</span><strong>{available === null ? '—' : `${available} ${material?.unit}`}</strong><span>Order remaining</span><strong>{remaining === null ? '—' : `${remaining} ${material?.unit}`}</strong></div><FormField label="Issued to"><Input value={form.issued_to} onChange={e => update({issued_to:e.target.value})} placeholder="Person or department"/></FormField><FormField label="Issued by"><Input value={email} disabled readOnly/></FormField><div className="form-span"><FormField label="Remarks"><Textarea value={form.remarks} onChange={e => update({remarks:e.target.value})} rows={2} placeholder="Optional issue note"/></FormField></div></div>{formError && <div className="notice notice-error" role="alert">{formError}</div>}<div className="form-actions"><Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button><Button onClick={review}>Review outward <ArrowUpRight size={17}/></Button></div></div></Modal>
    <Modal open={reviewOpen} onOpenChange={setReviewOpen} title="Review stock outward" description="Posting deducts stock and writes an immutable ledger entry."><div className="review-list"><div><span>Reference</span><strong>{form.reference_number}</strong></div><div><span>Order</span><strong>{order?.order_number}</strong></div><div><span>Material</span><strong>{material?.item_code} — {material?.specification}</strong></div><div><span>Issued to</span><strong>{form.issued_to}</strong></div><div><span>Quantity</span><strong>{form.quantity} {material?.unit}</strong></div><div><span>New stock</span><strong>{projected === null ? '—' : `${projected} ${material?.unit}`}</strong></div></div>{formError && <div className="notice notice-error" role="alert">{formError}</div>}<div className="form-actions"><Button variant="secondary" onClick={() => {setReviewOpen(false);setFormOpen(true);}}>Edit details</Button><Button disabled={posting} onClick={post}>{posting ? 'Posting…' : 'Confirm and post'}</Button></div></Modal>
  </>;
}
