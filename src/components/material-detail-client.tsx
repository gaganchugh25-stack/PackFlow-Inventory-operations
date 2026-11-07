'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Pencil, Upload } from 'lucide-react';
import { Button, FormField, Input, Modal } from './ui';
import { supabase, type Material } from '@/lib/supabase';
import { balanceOf } from '@/lib/phase4';
import { conditionLabel, stockConditions, type StockCondition } from '@/lib/stock-status';

type Movement={id:string;movement_type:string;signed_qty:number;before_qty:number;after_qty:number;business_date:string;posted_at:string};
type Alert={id:string;condition:StockCondition;opened_at:string;resolved_at:string|null};
type Levels={minimum_stock_level:string;reorder_level:string;reorder_quantity:string;maximum_stock_level:string};
type MaterialFile={name:string;created_at:string|null;metadata?:{size?:number}|null};
const fileBucket='packflow-material-files';
const fileTypes:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const displayFileName=(name:string)=>name.replace(/^[0-9a-f-]{36}--/i,'');
const optional=(value:string)=>value===''||/^\d+(\.\d{1,3})?$/.test(value);
const num=(value:string)=>value===''?null:Number(value);

export function MaterialDetailClient({id}:{id:string}){
  const [material,setMaterial]=useState<Material|null>(null);
  const [movements,setMovements]=useState<Movement[]>([]);
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [canEdit,setCanEdit]=useState(false);
  const [editOpen,setEditOpen]=useState(false);
  const [levels,setLevels]=useState<Levels>({minimum_stock_level:'',reorder_level:'',reorder_quantity:'',maximum_stock_level:''});
  const [saveError,setSaveError]=useState('');
  const [saving,setSaving]=useState(false);
  const [files,setFiles]=useState<MaterialFile[]>([]);
  const [fileError,setFileError]=useState('');
  const [uploading,setUploading]=useState(false);
  const loadFiles=useCallback(async()=>{
    const {data,error}=await supabase().storage.from(fileBucket).list(`materials/${id}`,{limit:100,sortBy:{column:'created_at',order:'desc'}});
    if(error){setFileError(error.message);return;}
    setFiles((data??[]) as MaterialFile[]);setFileError('');
  },[id]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');const client=supabase();
    const [{data:m,error:me},{data:move,error:moveError},{data:a,error:ae},{data:{user}}]=await Promise.all([
      client.from('materials').select('*,material_categories(name),suppliers(name),inventory_balances(current_qty)').eq('id',id).single(),
      client.from('inventory_movements').select('id,movement_type,signed_qty,before_qty,after_qty,business_date,posted_at').eq('material_id',id).order('posted_at',{ascending:false}).limit(100),
      client.from('inventory_alerts').select('id,condition,opened_at,resolved_at').eq('material_id',id).order('opened_at',{ascending:false}).limit(30),
      client.auth.getUser(),
    ]);
    if(me||moveError||ae)setError(me?.message||moveError?.message||ae?.message||'Could not load material');
    setMaterial((m??null) as unknown as Material|null);setMovements((move??[]) as Movement[]);setAlerts((a??[]) as Alert[]);
    if(user){const {data:roles}=await client.from('user_roles').select('role_code').eq('user_id',user.id);
      setCanEdit((roles??[]).some((r:{role_code:string})=>['super_admin','inventory_manager'].includes(r.role_code)));
    }
    setLoading(false);
  },[id]);
  useEffect(()=>{void load();void loadFiles();},[load,loadFiles]);
  async function uploadFile(file:File){
    const extension=file.name.split('.').pop()?.toLowerCase()??'';
    const contentType=fileTypes[extension];
    if(!contentType){setFileError('Choose a PDF, JPG, PNG, WebP, CSV or XLSX file.');return;}
    if(file.size>10*1024*1024){setFileError('The file must be 10 MB or smaller.');return;}
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
    const path=`materials/${id}/${crypto.randomUUID()}--${safeName}`;
    setUploading(true);setFileError('');
    const {error}=await supabase().storage.from(fileBucket).upload(path,file,{contentType,upsert:false});
    setUploading(false);
    if(error){setFileError(error.message);return;}
    setSuccess(`${file.name} attached to this material.`);await loadFiles();
  }
  async function downloadFile(name:string){
    setFileError('');
    const {data,error}=await supabase().storage.from(fileBucket).download(`materials/${id}/${name}`);
    if(error||!data){setFileError(error?.message??'The file could not be downloaded.');return;}
    const url=URL.createObjectURL(data);const link=document.createElement('a');
    link.href=url;link.download=displayFileName(name);document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function edit(){if(!material)return;setLevels({
    minimum_stock_level:material.minimum_stock_level?.toString()??'',
    reorder_level:material.reorder_level?.toString()??'',
    reorder_quantity:material.reorder_quantity?.toString()??'',
    maximum_stock_level:material.maximum_stock_level?.toString()??'',
  });setSaveError('');setEditOpen(true);}
  async function save(){
    if(!material)return;
    const values=Object.values(levels);
    if(values.some(v=>!optional(v))||(levels.reorder_quantity!==''&&Number(levels.reorder_quantity)<=0)){
      setSaveError('Enter non-negative values with up to 3 decimals. Preferred reorder quantity must be above zero.');return;
    }
    if(levels.minimum_stock_level!==''&&levels.reorder_level!==''&&Number(levels.minimum_stock_level)>Number(levels.reorder_level)){
      setSaveError('Minimum stock must be less than or equal to the reorder level.');return;
    }
    if(levels.maximum_stock_level!==''&&((levels.minimum_stock_level!==''&&Number(levels.maximum_stock_level)<Number(levels.minimum_stock_level))||(levels.reorder_level!==''&&Number(levels.maximum_stock_level)<Number(levels.reorder_level)))){
      setSaveError('Maximum stock must be at least the configured minimum and reorder levels.');return;
    }
    setSaving(true);setSaveError('');
    const {error:saveError}=await supabase().from('materials').update({
      minimum_stock_level:num(levels.minimum_stock_level),reorder_level:num(levels.reorder_level),
      reorder_quantity:num(levels.reorder_quantity),maximum_stock_level:num(levels.maximum_stock_level),
    }).eq('id',material.id);
    setSaving(false);
    if(saveError){setSaveError(saveError.message);return;}
    setEditOpen(false);setSuccess('Stock settings saved. Open alerts have been recalculated.');
    window.dispatchEvent(new Event('packflow:stock-updated'));await load();
  }
  const flags=material?stockConditions(material):[];
  return <>
    <div className="page-heading"><div><p className="breadcrumb"><Link href="/inventory/materials">Material Master</Link> / Material detail</p><h1>{material?.item_code??(loading?'Loading material…':'Material')}</h1><p className="page-subtitle">{material?.specification??'Material stock settings and movement history'}</p></div><div className="heading-actions"><Link className="button button-secondary" href="/inventory/reorder"><ArrowLeft size={17}/> Reorder list</Link>{canEdit&&material&&<Button onClick={edit}><Pencil size={17}/> Edit stock levels</Button>}</div></div>
    {error&&<div className="notice notice-error" role="alert">{error} <button onClick={load}>Retry</button></div>}{success&&<div className="notice notice-success" role="status">{success}</div>}
    {material&&<><div className="summary-strip"><div><span>Current stock</span><strong>{balanceOf(material)===null?'Pending':`${balanceOf(material)} ${material.unit}`}</strong></div><div><span>Minimum</span><strong>{material.minimum_stock_level===null?'Not configured':`${material.minimum_stock_level} ${material.unit}`}</strong></div><div><span>Reorder level</span><strong>{material.reorder_level===null?'Not configured':`${material.reorder_level} ${material.unit}`}</strong></div></div>
      <div className="material-detail-grid"><section className="data-panel"><div className="reorder-section-head"><h2>Material and stock settings</h2></div><div className="detail-list"><div><span>Category</span><strong>{material.material_categories?.name??'—'}</strong></div><div><span>Specification</span><strong>{material.specification}</strong></div><div><span>Unit</span><strong>{material.unit}</strong></div><div><span>Opening stock</span><strong>{material.opening_stock_qty===null?'Awaiting confirmation':`${material.opening_stock_qty} ${material.unit}`}</strong></div><div><span>Minimum stock</span><strong>{material.minimum_stock_level===null?'Not configured':`${material.minimum_stock_level} ${material.unit}`}</strong></div><div><span>Reorder level</span><strong>{material.reorder_level===null?'Not configured':`${material.reorder_level} ${material.unit}`}</strong></div><div><span>Suggested reorder quantity</span><strong>{material.reorder_quantity===null?'Not configured':`${material.reorder_quantity} ${material.unit}`}</strong></div><div><span>Maximum stock</span><strong>{material.maximum_stock_level===null?'Not configured':`${material.maximum_stock_level} ${material.unit}`}</strong></div></div></section>
      <section className="data-panel"><div className="reorder-section-head"><h2>Stock alerts</h2></div><div className="detail-alerts"><div className="badge-row">{flags.length?flags.map(flag=><span key={flag} className={`status-badge ${flag==='out_of_stock'?'status-critical':'status-warning'}`}>{conditionLabel[flag]}</span>):<span className="status-badge status-healthy">{balanceOf(material)===null?'Awaiting opening stock':'Healthy'}</span>}</div><p>{alerts.filter(a=>a.resolved_at===null).length} open alert condition{alerts.filter(a=>a.resolved_at===null).length===1?'':'s'}. A low-stock item may also require reorder.</p>{alerts.length>0&&<div className="reorder-alert-list">{alerts.slice(0,5).map(a=><div key={a.id}><span>{conditionLabel[a.condition]}</span><strong>{a.resolved_at?'Resolved':'Open'}</strong><span>{new Date(a.opened_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</span></div>)}</div>}</div></section></div>
      <section className="data-panel"><div className="reorder-section-head"><h2>Stock movement history</h2><span>Latest 100 movements</span></div>{movements.length?<div className="table-scroll"><table><thead><tr><th>Business date</th><th>Movement</th><th>Change</th><th>Before</th><th>After</th><th>Posted (IST)</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{m.business_date}</td><td>{m.movement_type}</td><td className="quantity-cell">{Number(m.signed_qty)>0?'+':''}{m.signed_qty} {material.unit}</td><td>{m.before_qty} {material.unit}</td><td>{m.after_qty} {material.unit}</td><td>{new Date(m.posted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table></div>:<div className="empty-state">No stock movements recorded yet.</div>}</section>
      <section className="data-panel material-files"><div className="reorder-section-head"><h2>Material files</h2><span>Private Supabase storage · latest 100</span></div>
        {canEdit&&<div className="material-file-upload"><Upload size={17}/><input aria-label="Attach material file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file);e.target.value='';}}/><span>{uploading?'Uploading…':'PDF, image, CSV or XLSX · up to 10 MB'}</span></div>}
        {fileError&&<div className="notice notice-error" role="alert">{fileError}</div>}
        {files.length?<div className="table-scroll"><table><thead><tr><th>File</th><th>Uploaded</th><th>Size</th><th></th></tr></thead><tbody>{files.map(file=><tr key={file.name}><td className="spec-cell">{displayFileName(file.name)}</td><td>{file.created_at?new Date(file.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'—'}</td><td>{typeof file.metadata?.size==='number'?`${(file.metadata.size/1024).toFixed(1)} KB`:'—'}</td><td><button className="text-link" onClick={()=>void downloadFile(file.name)}><Download size={16}/> Download</button></td></tr>)}</tbody></table></div>:<div className="empty-state">No files attached to this material.</div>}
      </section>
    </>}
    <Modal open={editOpen} onOpenChange={setEditOpen} title={`Stock levels · ${material?.item_code??''}`} description={`All quantities use ${material?.unit??'the material unit'}. Leave an optional level blank if it is not configured.`}><div className="material-form"><div className="form-grid"><FormField label={`Minimum stock (${material?.unit??''})`}><Input inputMode="decimal" value={levels.minimum_stock_level} onChange={e=>setLevels(v=>({...v,minimum_stock_level:e.target.value}))} placeholder="Optional"/></FormField><FormField label={`Reorder level (${material?.unit??''})`}><Input inputMode="decimal" value={levels.reorder_level} onChange={e=>setLevels(v=>({...v,reorder_level:e.target.value}))} placeholder="Optional"/></FormField><FormField label={`Preferred reorder quantity (${material?.unit??''})`}><Input inputMode="decimal" value={levels.reorder_quantity} onChange={e=>setLevels(v=>({...v,reorder_quantity:e.target.value}))} placeholder="Optional"/></FormField><FormField label={`Maximum stock (${material?.unit??''})`}><Input inputMode="decimal" value={levels.maximum_stock_level} onChange={e=>setLevels(v=>({...v,maximum_stock_level:e.target.value}))} placeholder="Optional"/></FormField></div>{saveError&&<div className="notice notice-error" role="alert">{saveError}</div>}<div className="form-actions"><Button variant="secondary" onClick={()=>setEditOpen(false)}>Cancel</Button><Button disabled={saving} onClick={save}>{saving?'Saving…':'Save levels'}</Button></div></div></Modal>
  </>;
}
