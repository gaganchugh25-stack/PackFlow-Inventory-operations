'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { Button, FormField, Input, Modal, Select } from './ui';
import { supabase, type Material } from '@/lib/supabase';
import { issuedQty, orderSelect, todayIst, type Order } from '@/lib/phase4';

type DraftLine = { material_id: string; required_qty: string };
const blankLine = (): DraftLine => ({ material_id: '', required_qty: '' });
const qtyValid = (value: string) => /^\d+(\.\d{1,3})?$/.test(value) && Number(value) > 0;

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState(todayIst());
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<{ id: string; action: 'submit'|'cancel'; number: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const client = supabase();
    const [{ data: o, error: oe }, { data: m, error: me }, { data: { user } }] = await Promise.all([
      client.from('orders').select(orderSelect).order('created_at', { ascending: false }).limit(200),
      client.from('materials').select('id,item_code,specification,unit,status').eq('status','active').order('item_code'),
      client.auth.getUser(),
    ]);
    if (oe || me) setError(oe?.message || me?.message || 'Could not load orders');
    setOrders((o ?? []) as unknown as Order[]); setMaterials((m ?? []) as unknown as Material[]);
    if (user) {
      const { data: roles } = await client.from('user_roles').select('role_code').eq('user_id',user.id);
      setCanEdit((roles ?? []).some((r: {role_code: string}) => ['super_admin','inventory_manager','inventory_operator'].includes(r.role_code)));
    }
    setLoading(false);
  }, []);
  useEffect(() => {const requested=new URLSearchParams(window.location.search).get('status');if(['open','draft','pending','partially_fulfilled','completed','cancelled'].includes(requested??''))setFilter(requested!);void load();}, [load]);

  const visible = useMemo(() => orders.filter(order =>
    (filter === 'all' || (filter === 'open' ? ['pending','partially_fulfilled'].includes(order.status) : order.status === filter)) &&
    (!search.trim() || `${order.order_number} ${order.order_items.map(line => line.materials?.item_code ?? '').join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
  ), [orders, search, filter]);
  const selected = orders.find(order => order.id === selectedId);
  function start(order?: Order) {
    setEditingId(order?.id ?? null); setDate(order?.order_date ?? todayIst());
    setLines(order?.order_items?.length ? [...order.order_items].sort((a,b) => a.line_number-b.line_number).map(line => ({ material_id:line.material_id,required_qty:String(line.required_qty) })) : [blankLine()]);
    setFormError(''); setFormOpen(true);
  }
  function changeLine(index: number, change: Partial<DraftLine>) {
    setLines(current => current.map((line, i) => i === index ? {...line,...change} : line));
  }
  async function save() {
    setFormError('');
    if (!date || !lines.length || lines.some(line => !line.material_id || !qtyValid(line.required_qty))) {
      setFormError('Choose a date and enter a material and positive quantity (up to 3 decimals) for every line.'); return;
    }
    if (new Set(lines.map(line => line.material_id)).size !== lines.length) {
      setFormError('Each material may appear only once in an order.'); return;
    }
    setSaving(true);
    const { data, error: saveError } = await supabase().rpc('save_draft_order', {
      p_order_id: editingId, p_order_date: date,
      p_lines: lines.map(line => ({material_id:line.material_id,required_qty:Number(line.required_qty)})),
    });
    setSaving(false);
    if (saveError) { setFormError(saveError.message); return; }
    setFormOpen(false); setSelectedId(data as string); setSuccess(editingId ? 'Draft order updated.' : 'Draft order created. Submit it when ready for issue.'); await load();
  }
  async function changeStatus() {
    if (!statusAction) return;
    setActionBusy(true);
    const { error: statusError } = await supabase().rpc('change_order_status', {p_order_id:statusAction.id,p_action:statusAction.action});
    setActionBusy(false);
    if (statusError) { setError(statusError.message); setStatusAction(null); return; }
    setSuccess(statusAction.action === 'submit' ? `${statusAction.number} is ready for outward issue.` : `${statusAction.number} cancelled. Existing issue history remains recorded.`);
    setStatusAction(null); await load();
  }

  return <>
    <div className="page-heading"><div><p className="breadcrumb">Inventory / Orders</p><h1>Order Management</h1><p className="page-subtitle">Record demand, then issue stock against an approved order line.</p></div>{canEdit && <Button onClick={() => start()}><Plus size={18}/> New order</Button>}</div>
    <div className="summary-strip"><div><span>Total orders</span><strong>{orders.length}</strong></div><div><span>Pending</span><strong>{orders.filter(o => o.status === 'pending').length}</strong></div><div><span>Partly fulfilled</span><strong>{orders.filter(o => o.status === 'partially_fulfilled').length}</strong></div><div><span>Completed</span><strong>{orders.filter(o => o.status === 'completed').length}</strong></div></div>
    {success && <div className="notice notice-success" role="status">{success}</div>}
    <section className="data-panel"><div className="table-toolbar"><div className="search-box"><Search size={18}/><Input aria-label="Search orders" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order number or item code"/></div><Select aria-label="Order status filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="open">Open orders</option>{['draft','pending','partially_fulfilled','completed','cancelled'].map(s => <option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</Select></div>
      {error && <div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}
      {loading ? <div className="empty-state">Loading orders…</div> : visible.length ? <div className="table-scroll"><table><thead><tr><th>Order</th><th>Date</th><th>Lines</th><th>Fulfilment</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map(o => { const issued = o.order_items.reduce((n,l) => n + (issuedQty(l)>0 ? 1:0),0); return <tr key={o.id}><td className="code-cell"><button className="text-link" onClick={() => setSelectedId(o.id)}>{o.order_number}</button></td><td>{o.order_date}</td><td>{o.order_items.length}</td><td>{issued} of {o.order_items.length} lines issued</td><td><span className={`status-badge ${o.status === 'completed' ? 'status-healthy' : o.status === 'cancelled' ? 'status-neutral' : o.status === 'partially_fulfilled' ? 'status-warning' : 'status-neutral'}`}>{o.status.replaceAll('_',' ')}</span></td><td><button className="text-link" onClick={() => setSelectedId(o.id)}>View lines</button></td></tr>; })}</tbody></table></div> : <div className="empty-state"><ClipboardList size={30}/><h2>No orders found</h2><p>Orders need verified materials. Save demand as a draft, then submit it for outward issue.</p>{canEdit && <Button onClick={() => start()}><Plus size={17}/> New order</Button>}</div>}
      <div className="table-footer">{visible.length} of {orders.length} orders</div></section>

    <Modal open={Boolean(selected)} onOpenChange={open => {if(!open) setSelectedId(null);}} title={selected?.order_number ?? 'Order'} description={selected ? `${selected.order_date} · ${selected.status.replaceAll('_',' ')}` : ''}>
      {selected && <><div className="table-scroll"><table><thead><tr><th>Item code</th><th>Specification</th><th>Required</th><th>Issued</th><th>Remaining</th></tr></thead><tbody>{[...selected.order_items].sort((a,b) => a.line_number-b.line_number).map(line => { const issued = issuedQty(line); return <tr key={line.id}><td className="code-cell">{line.materials?.item_code ?? '—'}</td><td className="spec-cell">{line.materials?.specification ?? '—'}</td><td>{line.required_qty} {line.materials?.unit}</td><td>{issued} {line.materials?.unit}</td><td>{Number(line.required_qty)-issued} {line.materials?.unit}</td></tr>; })}</tbody></table></div><div className="form-actions">{canEdit && selected.status === 'draft' && <><Button variant="secondary" onClick={() => {setSelectedId(null);start(selected);}}>Edit draft</Button><Button onClick={() => {setSelectedId(null);setStatusAction({id:selected.id,action:'submit',number:selected.order_number});}}>Submit order</Button></>}{canEdit && ['draft','pending','partially_fulfilled'].includes(selected.status) && <Button variant="secondary" onClick={() => {setSelectedId(null);setStatusAction({id:selected.id,action:'cancel',number:selected.order_number});}}>Cancel order</Button>}{['pending','partially_fulfilled'].includes(selected.status) && <Link className="button button-primary" href="/inventory/outward">Post outward</Link>}</div></>}
    </Modal>
    <Modal open={formOpen} onOpenChange={setFormOpen} title={editingId ? 'Edit draft order' : 'New order'} description="Saving demand does not change stock. Submit the order before posting an issue."><div className="material-form"><FormField label="Order date"><Input type="date" value={date} onChange={e => setDate(e.target.value)}/></FormField><div className="order-line-list">{lines.map((line,index) => <div className="order-line" key={index}><FormField label={`Material ${index+1}`}><Select value={line.material_id} onChange={e => changeLine(index,{material_id:e.target.value})}><option value="">Choose item code</option>{materials.map(m => <option key={m.id} value={m.id}>{m.item_code} · {m.specification}</option>)}</Select></FormField><FormField label={`Required quantity${materials.find(m => m.id === line.material_id)?.unit ? ` (${materials.find(m => m.id === line.material_id)?.unit})` : ''}`}><Input inputMode="decimal" value={line.required_qty} onChange={e => changeLine(index,{required_qty:e.target.value})} placeholder="0"/></FormField><button className="text-link" aria-label={`Remove line ${index+1}`} disabled={lines.length===1} onClick={() => setLines(current => current.filter((_,i) => i!==index))}>Remove</button></div>)}</div><Button variant="secondary" onClick={() => setLines(current => [...current,blankLine()])}><Plus size={16}/> Add material</Button>{formError && <div className="notice notice-error" role="alert">{formError}</div>}<div className="form-actions"><Button variant="secondary" onClick={() => setFormOpen(false)}>Close</Button><Button disabled={saving || !materials.length} onClick={save}>{saving ? 'Saving…' : 'Save draft'}</Button></div></div></Modal>
    <Modal open={Boolean(statusAction)} onOpenChange={open => {if(!open) setStatusAction(null);}} title={statusAction?.action === 'cancel' ? 'Cancel order?' : 'Submit order?'} description={statusAction?.action === 'cancel' ? 'This stops further issues. Any stock already issued remains in the ledger.' : 'The order will become available for stock outward posting.'}><div className="form-actions"><Button variant="secondary" onClick={() => setStatusAction(null)}>Back</Button><Button disabled={actionBusy} onClick={changeStatus}>{actionBusy ? 'Updating…' : statusAction?.action === 'cancel' ? 'Cancel order' : 'Submit order'}</Button></div></Modal>
  </>;
}
