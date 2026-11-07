import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { loadReportData } from '@/lib/report-data';
import { buildReport,emptyFilters,reportDefinitions,sortReport,type ReportKey } from '@/lib/reporting';
import { excelBuffer,pdfBuffer } from '@/lib/report-export';

export const runtime='nodejs';
const schema=z.object({
  key:z.string(),format:z.enum(['xlsx','pdf']),sort:z.object({key:z.string(),direction:z.enum(['asc','desc'])}),filters:z.object({
    from:z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/),to:z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/),
    categoryId:z.string(),materialId:z.string(),search:z.string().max(200),
  }),
});
export async function POST(request:Request){
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Cross-origin export is not allowed'},{status:403});
  const input=schema.safeParse(await request.json().catch(()=>null));
  if(!input.success||!reportDefinitions.some(r=>r.key===input.data.key))return Response.json({error:'Invalid report request'},{status:400});
  const {key,format,filters,sort}=input.data;
  if(filters.from&&filters.to&&filters.from>filters.to)return Response.json({error:'Date From must be before Date To'},{status:400});
  const cookieStore=await cookies();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!publishable)return Response.json({error:'Supabase is not configured'},{status:500});
  const client=createServerClient(url,publishable,{cookies:{
    getAll(){return cookieStore.getAll();},
    setAll(items){for(const item of items)cookieStore.set(item.name,item.value,item.options);},
  }});
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return Response.json({error:'Sign in to export reports'},{status:401});
  const {data:roles,error:roleError}=await client.from('user_roles').select('role_code').eq('user_id',user.id);
  if(roleError)return Response.json({error:'Could not verify export permission'},{status:403});
  if(!(roles??[]).some(r=>['super_admin','inventory_manager'].includes(r.role_code)))return Response.json({error:'Only a manager or Super Admin may export reports'},{status:403});
  try{
    const data=await loadReportData(client);
    const report=sortReport(buildReport(key as ReportKey,data,{...emptyFilters,...filters}),sort);
    const now=new Date();const bytes=format==='xlsx'?await excelBuffer(report,filters,key as ReportKey,data,now):await pdfBuffer(report,filters,key as ReportKey,data,now);
    const filename=`packflow-${key}-${now.toISOString().slice(0,10)}.${format}`;
    return new Response(new Uint8Array(bytes),{headers:{
      'Content-Type':format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',
      'Content-Disposition':`attachment; filename="${filename}"`,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    }});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not generate report'},{status:500});}
}
