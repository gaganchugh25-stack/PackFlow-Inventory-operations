import type { Metadata } from 'next';
import { ClearLocalDemoData } from '@/components/clear-local-demo-data';
import './globals.css';

export const metadata: Metadata = { title: 'PackFlow ERP', description: 'Export packing raw material inventory' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body><ClearLocalDemoData />{children}</body></html>;
}
