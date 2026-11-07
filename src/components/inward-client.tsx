'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowUpRight, ClipboardCheck, PackagePlus, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, Textarea } from './ui';
import { supabase, type Category, type Material } from '@/lib/supabase';

function todayIst() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

const schema = z.object({
  reference_number: z.string().trim().min(1, 'Enter the inward reference number'),
  business_date: z.string().min(1, 'Choose a date'),
  material_id: z.string().uuid('Choose a material'),
  quantity: z.string().refine(v => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Enter a quantity above zero (up to 3 decimals)'),
  supplier_name: z.string(),
  purchase_order_reference: z.string(),
  remarks: z.string(),
});
type FormValues = z.infer<typeof schema>;
type InwardRow = { id: string; reference_number: string; business_date: string; quantity: number; supplier_name: string | null; posted_at: string; materials: { item_code: string; specification: string; unit: string; material_categories: { name: string } | null } | null };
function balanceOf(material: Material) { const b = material.inventory_balances; return Array.isArray(b) ? b[0]?.current_qty ?? null : b?.current_qty ?? null; }

export function InwardClient() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<InwardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [formCategory, setFormCategory] = useState('all');
  const [canPost, setCanPost] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pending, setPending] = useState<FormValues | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [success, setSuccess] = useState('');
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { reference_number: '', business_date: todayIst(), material_id: '', quantity: '', supplier_name: '', purchase_order_reference: '', remarks: '' } });
  const { register, handleSubmit, watch, reset, formState: { errors } } = form;
  const selectedId = watch('material_id');
  const selected = materials.find(m => m.id === selectedId);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const client = supabase();
    const [{ data: m, error: me }, { data: c, error: ce }, { data: r, error: re }, { data: { user } }] = await Promise.all([
      client.from('materials').select('*, material_categories(name), inventory_balances(current_qty)').eq('status','active').order('item_code'),
      client.from('material_categories').select('id,name').eq('is_active',true).order('name'),
      client.from('stock_inward').select('id,reference_number,business_date,quantity,supplier_name,posted_at,materials(item_code,specification,unit,material_categories(name))').order('posted_at',{ascending:false}).limit(100),
      client.auth.getUser(),
    ]);
    if (me || ce || re) setError(me?.message || ce?.message || re?.message || 'Could not load stock inward');
    setMaterials((m ?? []) as unknown as Material[]); setCategories((c ?? []) as Category[]); setRows((r ?? []) as unknown as InwardRow[]);
    if (user) {
      setUserEmail(user.email ?? '');
      const { data: roles } = await client.from('user_roles').select('role_code').eq('user_id',user.id);
      setCanPost((roles ?? []).some((role: { role_code: string }) => ['super_admin','inventory_manager','inventory_operator'].includes(role.role_code)));
    }
    setLoading(false);
  }, []);
  useEffect(() => {const date=new URLSearchParams(window.location.search).get('business_date');if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))setDateFilter(date);void load();}, [load]);

  const visibleRows = useMemo(() => rows.filter(r => {
    const q = search.trim().toLowerCase();
    return (!dateFilter || r.business_date === dateFilter) && (!q || `${r.reference_number} ${r.materials?.item_code ?? ''} ${r.materials?.specification ?? ''}`.toLowerCase().includes(q))
      && (category === 'all' || r.materials?.material_categories?.name === categories.find(c => c.id === category)?.name);
  }), [rows, search, category, categories, dateFilter]);
  const formMaterials = materials.filter(m => (formCategory === 'all' || m.category_id === formCategory) && balanceOf(m) !== null);
  const projected = selected && balanceOf(selected) !== null && pending ? Number(balanceOf(selected)) + Number(pending.quantity) : null;

  function start() { reset({ reference_number:'',business_date:todayIst(),material_id:'',quantity:'',supplier_name:'',purchase_order_reference:'',remarks:'' }); setFormCategory('all'); setPostError(''); setSuccess(''); setFormOpen(true); }
  function review(values: FormValues) { setPending(values); setFormOpen(false); setReviewOpen(true); }
  async function post() {
    if (!pending) return;
    setPosting(true); setPostError('');
    const { error } = await supabase().rpc('post_stock_inward', {
      p_reference_number: pending.reference_number.trim(), p_business_date: pending.business_date,
      p_material_id: pending.material_id, p_quantity: Number(pending.quantity),
      p_supplier_name: pending.supplier_name.trim() || null,
      p_purchase_order_reference: pending.purchase_order_reference.trim() || null,
      p_remarks: pending.remarks.trim() || null,
    });
    setPosting(false);
    if (error) { setPostError(error.message); return; }
    setReviewOpen(false); setPending(null); setSuccess(`Inward ${pending.reference_number} posted. Stock and alerts are updated.`); window.dispatchEvent(new Event('packflow:stock-updated')); await load();
  }

  return <>
    <div className="page-heading"><div><p className="breadcrumb">Inventory / Stock Inward</p><h1>Stock Inward</h1><p className="page-subtitle">Receive packing materials and keep every movement traceable.</p></div>{canPost && <Button onClick={start}><Plus size={18} /> Post inward</Button>}</div>
    <div className="summary-strip"><div><span>Posted transactions</span><strong>{rows.length}</strong></div><div><span>Received today</span><strong>{rows.filter(r => r.business_date === todayIst()).length}</strong></div><div><span>Materials ready to receive</span><strong>{materials.filter(m => balanceOf(m) !== null).length}</strong></div></div>
    {success && <div className="notice notice-success" role="status"><ClipboardCheck size={17} />{success}</div>}
    <section className="data-panel"><div className="table-toolbar"><div className="search-box"><Search size={18} /><Input aria-label="Search inward transactions" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reference, code or specification" /></div><div className="filter-controls"><Input aria-label="Business date filter" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} /><SlidersHorizontal size={17} /><Select aria-label="Category filter" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div></div>
      {error && <div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}
      {loading ? <div className="empty-state">Loading inward history…</div> : visibleRows.length ? <div className="table-scroll"><table><thead><tr><th>Inward reference</th><th>Date</th><th>Item code</th><th>Specification</th><th>Quantity received</th><th>Supplier</th><th>Posted</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.id}><td className="code-cell">{row.reference_number}</td><td>{row.business_date}</td><td className="code-cell">{row.materials?.item_code ?? '—'}</td><td className="spec-cell">{row.materials?.specification ?? '—'}</td><td className="quantity-cell">{row.quantity} {row.materials?.unit ?? ''}</td><td>{row.supplier_name ?? '—'}</td><td>{new Date(row.posted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table></div> : <div className="empty-state"><PackagePlus size={30} /><h2>No inward transactions yet</h2><p>Post the first receipt once a material’s unit and opening quantity have been confirmed.</p>{canPost && <Button onClick={start}><Plus size={17} /> Post inward</Button>}</div>}
      <div className="table-footer">{visibleRows.length} of {rows.length} recent transactions</div></section>

    <Modal open={formOpen} onOpenChange={setFormOpen} title="Post stock inward" description="Check the material and received quantity before posting."><form className="material-form" onSubmit={handleSubmit(review)}><div className="form-grid"><FormField label="Inward reference number" error={errors.reference_number?.message}><Input {...register('reference_number')} placeholder="Unique receipt reference" /></FormField><FormField label="Date" error={errors.business_date?.message}><Input {...register('business_date')} type="date" /></FormField><FormField label="Material category"><Select value={formCategory} onChange={e => setFormCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField><FormField label="Item code" error={errors.material_id?.message}><Select {...register('material_id')}><option value="">Choose material</option>{formMaterials.map(m => <option key={m.id} value={m.id}>{m.item_code}</option>)}</Select></FormField><div className="form-span material-readout"><span>Specification</span><strong>{selected?.specification ?? 'Choose an item code'}</strong><span>Current stock</span><strong>{selected && balanceOf(selected) !== null ? `${balanceOf(selected)} ${selected.unit}` : '—'}</strong></div><FormField label={`Quantity received${selected ? ` (${selected.unit})` : ''}`} error={errors.quantity?.message}><Input {...register('quantity')} inputMode="decimal" placeholder="Quantity" /></FormField><FormField label="Supplier name"><Input {...register('supplier_name')} placeholder="Optional" /></FormField><FormField label="Purchase order reference"><Input {...register('purchase_order_reference')} placeholder="Optional" /></FormField><FormField label="Received by"><Input value={userEmail} disabled readOnly /></FormField><div className="form-span"><FormField label="Remarks"><Textarea {...register('remarks')} rows={2} placeholder="Optional receiving note" /></FormField></div></div><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit">Review inward <ArrowUpRight size={17} /></Button></div></form></Modal>
    <Modal open={reviewOpen} onOpenChange={setReviewOpen} title="Review stock inward" description="Posting increases stock and creates a permanent transaction record."><div className="review-list"><div><span>Reference</span><strong>{pending?.reference_number}</strong></div><div><span>Material</span><strong>{selected?.item_code} — {selected?.specification}</strong></div><div><span>Received</span><strong>{pending?.quantity} {selected?.unit}</strong></div><div><span>New stock</span><strong>{projected === null ? '—' : `${projected} ${selected?.unit}`}</strong></div></div>{postError && <div className="notice notice-error" role="alert">{postError}</div>}<div className="form-actions"><Button variant="secondary" onClick={() => { setReviewOpen(false); setFormOpen(true); }}>Edit details</Button><Button onClick={post} disabled={posting}>{posting ? 'Posting…' : 'Confirm and post'}</Button></div></Modal>
  </>;
}
