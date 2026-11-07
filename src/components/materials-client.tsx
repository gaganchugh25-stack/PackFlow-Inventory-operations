'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDownToLine, Boxes, Plus, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, Textarea } from './ui';
import { supabase, type Category, type Material } from '@/lib/supabase';
import { importHeaders, readMaterialCsv, type ImportRow } from '@/lib/material-import';

const quantity = (value: string) => value !== '' && /^\d+(\.\d{1,3})?$/.test(value);
const optionalQuantity = (value: string) => value === '' || quantity(value);
const schema = z.object({
  item_code: z.string().trim().min(1, 'Enter the original item code'),
  category_id: z.string().uuid('Choose a category'),
  specification: z.string().trim().min(1, 'Enter the specification'),
  unit: z.string().trim().min(1, 'Enter a confirmed unit'),
  supplier_name: z.string(),
  opening_stock_qty: z.string().refine(quantity, 'Enter a confirmed quantity (up to 3 decimals)'),
  minimum_stock_level: z.string().refine(optionalQuantity, 'Enter a non-negative quantity'),
  reorder_level: z.string().refine(optionalQuantity, 'Enter a non-negative quantity'),
  reorder_quantity: z.string().refine(v => v === '' || (quantity(v) && Number(v) > 0), 'Enter a quantity above zero'),
  maximum_stock_level: z.string().refine(optionalQuantity, 'Enter a non-negative quantity'),
  status: z.enum(['active', 'archived']),
}).superRefine((v, ctx) => {
  if (v.minimum_stock_level !== '' && v.reorder_level !== '' && Number(v.minimum_stock_level) > Number(v.reorder_level))
    ctx.addIssue({ code: 'custom', path: ['reorder_level'], message: 'Reorder level must be at least the minimum level' });
  if (v.maximum_stock_level !== '' && v.reorder_level !== '' && Number(v.maximum_stock_level) < Number(v.reorder_level))
    ctx.addIssue({ code: 'custom', path: ['maximum_stock_level'], message: 'Maximum must be at least the reorder level' });
});
type FormValues = z.infer<typeof schema>;
const blank: FormValues = { item_code: '', category_id: '', specification: '', unit: '', supplier_name: '', opening_stock_qty: '', minimum_stock_level: '', reorder_level: '', reorder_quantity: '', maximum_stock_level: '', status: 'active' };
const numericOrNull = (value: string) => value === '' ? null : Number(value);
function balanceOf(material: Material) { const b = material.inventory_balances; return Array.isArray(b) ? b[0]?.current_qty ?? null : b?.current_qty ?? null; }
function flags(material: Material) {
  if (material.status === 'archived') return ['Archived'];
  const stock = balanceOf(material);
  if (stock === null) return ['Awaiting opening stock'];
  if (stock === 0) return ['Out of stock'];
  const result: string[] = [];
  if (material.minimum_stock_level !== null && stock < material.minimum_stock_level) result.push('Low stock');
  if (material.reorder_level !== null && stock <= material.reorder_level) result.push('Reorder required');
  return result.length ? result : ['Healthy'];
}

export function MaterialsClient() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [condition, setCondition] = useState('all');
  const [editing, setEditing] = useState<Material | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank });
  const { register, handleSubmit, reset, formState: { errors } } = form;

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    const client = supabase();
    const [{ data: cats, error: catsError }, { data: rows, error: rowsError }, { data: { user } }] = await Promise.all([
      client.from('material_categories').select('id,name').eq('is_active', true).order('name'),
      client.from('materials').select('*, material_categories(name), suppliers(name), inventory_balances(current_qty)').order('item_code'),
      client.auth.getUser(),
    ]);
    if (catsError || rowsError) setLoadError(catsError?.message || rowsError?.message || 'Could not load materials');
    setCategories((cats ?? []) as Category[]);
    setMaterials((rows ?? []) as unknown as Material[]);
    if (user) {
      const { data: roles } = await client.from('user_roles').select('role_code').eq('user_id', user.id);
      setCanEdit((roles ?? []).some((r: { role_code: string }) => ['super_admin','inventory_manager'].includes(r.role_code)));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => materials.filter(m => {
    const q = search.trim().toLowerCase();
    return (!q || `${m.item_code} ${m.specification}`.toLowerCase().includes(q))
      && (category === 'all' || m.category_id === category)
      && (condition === 'all' || flags(m).includes(condition));
  }), [materials, search, category, condition]);

  function openNew() { setEditing(null); reset(blank); setSaveError(''); setDialogOpen(true); }
  function openEdit(m: Material) {
    setEditing(m); setSaveError('');
    reset({ item_code: m.item_code, category_id: m.category_id,
      specification: m.specification, unit: m.unit, supplier_name: m.suppliers?.name ?? '', opening_stock_qty: m.opening_stock_qty?.toString() ?? '',
      minimum_stock_level: m.minimum_stock_level?.toString() ?? '', reorder_level: m.reorder_level?.toString() ?? '',
      reorder_quantity: m.reorder_quantity?.toString() ?? '', maximum_stock_level: m.maximum_stock_level?.toString() ?? '', status: m.status });
    setDialogOpen(true);
  }

  async function save(values: FormValues) {
    setSaving(true); setSaveError('');
    const client = supabase();
    let supplierId: string | null = null;
    if (values.supplier_name.trim()) {
      const supplier = await client.from('suppliers').upsert({ name: values.supplier_name.trim() }, { onConflict: 'name' }).select('id').single();
      if (supplier.error) { setSaving(false); setSaveError(supplier.error.message); return; }
      supplierId = supplier.data.id;
    }
    const shared = { category_id: values.category_id, specification: values.specification.trim(), supplier_id: supplierId,
      minimum_stock_level: numericOrNull(values.minimum_stock_level), reorder_level: numericOrNull(values.reorder_level),
      reorder_quantity: numericOrNull(values.reorder_quantity), maximum_stock_level: numericOrNull(values.maximum_stock_level), status: values.status };
    const result = editing
      ? await client.from('materials').update(shared).eq('id', editing.id)
      : await client.from('materials').insert({ ...shared, item_code: values.item_code.trim(), unit: values.unit.trim().toUpperCase(), opening_stock_qty: Number(values.opening_stock_qty) });
    setSaving(false);
    if (result.error) { setSaveError(result.error.message); return; }
    setDialogOpen(false); window.dispatchEvent(new Event('packflow:stock-updated')); await load();
  }

  function exportCsv() {
    const fields = ['item_code','category','specification','unit','supplier','opening_stock_qty','current_stock','minimum_stock_level','reorder_level','reorder_quantity','maximum_stock_level','status','created_at','updated_at'];
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"','""')}"`;
    const lines = [fields.join(','), ...filtered.map(m => [m.item_code,m.material_categories?.name,m.specification,m.unit,m.suppliers?.name,m.opening_stock_qty,balanceOf(m),m.minimum_stock_level,m.reorder_level,m.reorder_quantity,m.maximum_stock_level,m.status,m.created_at,m.updated_at].map(quote).join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'packflow-material-master.csv'; link.click(); URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([importHeaders.join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'packflow-material-import-template.csv'; link.click(); URL.revokeObjectURL(url);
  }

  async function chooseImport(file?: File) {
    setImportRows([]); setImportErrors([]); setImportResult('');
    if (!file) return;
    try {
      const result = readMaterialCsv(await file.text(), categories.map(c => c.name), materials.map(m => m.item_code));
      setImportRows(result.rows); setImportErrors(result.errors);
    } catch (error) { setImportErrors([error instanceof Error ? error.message : 'Could not read CSV']); }
  }

  async function confirmImport() {
    if (!importRows.length || importErrors.length) return;
    setImporting(true); setImportResult('');
    const { data, error } = await supabase().rpc('import_materials', { p_rows: importRows });
    setImporting(false);
    if (error) { setImportErrors([error.message]); return; }
    setImportOpen(false); setImportRows([]); window.dispatchEvent(new Event('packflow:stock-updated')); setImportResult(`${data} verified materials imported.`); await load();
  }

  return <>
    <div className="page-heading"><div><p className="breadcrumb">Inventory / Material Master</p><h1>Material Master</h1><p className="page-subtitle">One reliable record for every export packing material.</p></div><div className="heading-actions"><Button variant="secondary" onClick={exportCsv} disabled={!materials.length}><ArrowDownToLine size={17} /> Export CSV</Button>{canEdit && <Button variant="secondary" onClick={() => { setImportOpen(true); setImportRows([]); setImportErrors([]); }}><Upload size={17} /> Import verified CSV</Button>}{canEdit && <Button onClick={openNew}><Plus size={18} /> Add material</Button>}</div></div>
    {importResult && <div className="notice notice-success" role="status">{importResult}</div>}
    <div className="summary-strip"><div><span>Active materials</span><strong>{materials.filter(m => m.status === 'active').length}</strong></div><div><span>Awaiting opening stock</span><strong>{materials.filter(m => balanceOf(m) === null).length}</strong></div><div><span>Reorder required</span><strong>{materials.filter(m => flags(m).includes('Reorder required')).length}</strong></div></div>
    <section className="data-panel"><div className="table-toolbar"><div className="search-box"><Search size={18} /><Input aria-label="Search materials" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item code or specification" /></div><div className="filter-controls"><SlidersHorizontal size={17} /><Select aria-label="Category filter" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Select aria-label="Stock filter" value={condition} onChange={e => setCondition(e.target.value)}><option value="all">All stock levels</option><option>Reorder required</option><option>Low stock</option><option>Out of stock</option><option>Healthy</option><option>Awaiting opening stock</option><option>Archived</option></Select></div></div>
      {loadError && <div className="notice notice-error" role="alert">{loadError} <button onClick={load}>Retry</button></div>}
      {loading ? <div className="empty-state">Loading materials…</div> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>Item code</th><th>Category</th><th>Specification</th><th>Current stock</th><th>Reorder level</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td className="code-cell"><Link className="text-link" href={`/inventory/materials/${m.id}`}>{m.item_code}</Link></td><td>{m.material_categories?.name ?? '—'}</td><td className="spec-cell">{m.specification}</td><td className="quantity-cell">{balanceOf(m) === null ? 'Pending' : `${balanceOf(m)} ${m.unit}`}</td><td className="quantity-cell">{m.reorder_level === null ? 'Not configured' : `${m.reorder_level} ${m.unit}`}</td><td><div className="badge-row">{flags(m).map(flag => <span key={flag} className={`status-badge ${flag === 'Healthy' ? 'status-healthy' : flag === 'Archived' ? 'status-neutral' : flag === 'Out of stock' ? 'status-critical' : 'status-warning'}`}>{flag}</span>)}</div></td><td>{canEdit && <button className="text-link" onClick={() => openEdit(m)}>View / edit</button>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Boxes size={30} /><h2>{materials.length ? 'No materials match these filters' : 'No materials posted yet'}</h2><p>{materials.length ? 'Change the search or filters to see more records.' : 'The photographed list remains pending until units and opening quantities are verified. You can add a fully verified material now.'}</p>{!materials.length && canEdit && <Button onClick={openNew}><Plus size={17} /> Add verified material</Button>}</div>}
      <div className="table-footer">{filtered.length} of {materials.length} materials</div></section>

    <Modal open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? editing.item_code : 'Add verified material'} description={editing ? 'Update its specification and stock thresholds.' : 'Enter the confirmed unit and opening quantity. Opening stock is posted once.'}>
      <form onSubmit={handleSubmit(save)} className="material-form"><div className="form-grid"><FormField label="Item code" error={errors.item_code?.message}><Input {...register('item_code')} disabled={!!editing} placeholder="Original item code" /></FormField><FormField label="Category" error={errors.category_id?.message}><Select {...register('category_id')}><option value="">Choose category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField><FormField label="Unit" error={errors.unit?.message}><Input {...register('unit')} disabled={!!editing} placeholder="PCS, KG, Roll, Meter…" /></FormField><FormField label="Supplier (optional)"><Input {...register('supplier_name')} placeholder="Supplier name" /></FormField><div className="form-span"><FormField label="Specification / dimensions" error={errors.specification?.message}><Textarea {...register('specification')} rows={3} placeholder="Preserve the verified specification" /></FormField></div><FormField label="Opening stock" error={errors.opening_stock_qty?.message} hint={editing ? 'Opening stock cannot be changed after confirmation.' : 'Enter 0 only if a verified physical count is zero.'}><Input {...register('opening_stock_qty')} disabled={!!editing} inputMode="decimal" placeholder="Confirmed quantity" /></FormField><FormField label="Minimum stock level" error={errors.minimum_stock_level?.message}><Input {...register('minimum_stock_level')} inputMode="decimal" placeholder="Optional" /></FormField><FormField label="Reorder level" error={errors.reorder_level?.message}><Input {...register('reorder_level')} inputMode="decimal" placeholder="Optional" /></FormField><FormField label="Preferred reorder quantity" error={errors.reorder_quantity?.message}><Input {...register('reorder_quantity')} inputMode="decimal" placeholder="Optional" /></FormField><FormField label="Maximum stock level" error={errors.maximum_stock_level?.message}><Input {...register('maximum_stock_level')} inputMode="decimal" placeholder="Optional" /></FormField><FormField label="Material status"><Select {...register('status')}><option value="active">Active</option><option value="archived">Archived</option></Select></FormField></div>{editing && <p className="field-hint">Created {new Date(editing.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})} · Updated {new Date(editing.updated_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</p>}{saveError && <div className="notice notice-error" role="alert">{saveError}</div>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add material'}</Button></div></form>
    </Modal>
    <Modal open={importOpen} onOpenChange={setImportOpen} title="Import verified materials" description="Every row needs a confirmed unit and opening quantity. The full file is checked before any row is posted.">
      <div className="import-box"><p>Use the approved category names and preserve original item codes as text. A blank opening quantity is rejected; enter 0 only when a physical count confirms zero.</p><Button variant="secondary" onClick={downloadTemplate}><ArrowDownToLine size={16} /> Download CSV template</Button><FormField label="Choose verified CSV"><Input type="file" accept=".csv,text/csv" onChange={e => void chooseImport(e.target.files?.[0])} /></FormField></div>
      {!!importErrors.length && <div className="notice notice-error import-errors" role="alert"><ul>{importErrors.slice(0,10).map((error,i) => <li key={i}>{error}</li>)}</ul>{importErrors.length > 10 && <span>Plus {importErrors.length - 10} more errors</span>}</div>}
      {!!importRows.length && !importErrors.length && <div className="import-preview"><strong>{importRows.length} rows ready for review</strong><div className="table-scroll"><table><thead><tr><th>Item code</th><th>Category</th><th>Specification</th><th>Unit</th><th>Opening</th></tr></thead><tbody>{importRows.map((row,i) => <tr key={`${row.item_code}-${i}`}><td className="code-cell">{row.item_code}</td><td>{row.category}</td><td className="spec-cell">{row.specification}</td><td>{row.unit}</td><td className="quantity-cell">{row.opening_stock_qty}</td></tr>)}</tbody></table></div></div>}
      <div className="form-actions"><Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={confirmImport} disabled={!importRows.length || !!importErrors.length || importing}>{importing ? 'Importing…' : `Confirm import${importRows.length ? ` (${importRows.length})` : ''}`}</Button></div>
    </Modal>
  </>;
}
