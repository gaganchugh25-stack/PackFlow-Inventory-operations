import { AppShell } from '@/components/app-shell';
import { MaterialDetailClient } from '@/components/material-detail-client';

export default async function MaterialDetailPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <AppShell><MaterialDetailClient id={id}/></AppShell>;
}
