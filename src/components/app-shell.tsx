'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Boxes, ClipboardList, LayoutDashboard, Menu, PackagePlus, RotateCcw, Bell, FileText, Settings, LogOut, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', phase: null },
  { label: 'Material Master', icon: Boxes, href: '/inventory/materials', phase: null },
  { label: 'Stock Inward', icon: PackagePlus, href: '/inventory/inward', phase: null },
  { label: 'Stock Outward', icon: RotateCcw, href: '/inventory/outward', phase: null },
  { label: 'Order Management', icon: ClipboardList, href: '/orders', phase: null },
  { label: 'Reconciliation', icon: RotateCcw, href: '/inventory/reconciliation', phase: null },
  { label: 'Reorder Management', icon: Bell, href: '/inventory/reorder', phase: null },
  { label: 'Reports', icon: FileText, href: '/reports', phase: null },
  { label: 'Settings', icon: Settings, href: '/admin/settings', phase: 'Later' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function check() {
      const client = supabase();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (!active) return;
      if (authError || !user) { router.replace('/login'); return; }
      const { data, error: roleError } = await client.from('user_roles').select('role_code').eq('user_id', user.id);
      if (!active) return;
      if (roleError) { setError(roleError.message); setReady(true); return; }
      if (!data?.length) { setError('Your account has no PackFlow role. Ask the Super Admin to grant access.'); setReady(true); return; }
      setEmail(user.email ?? '');
      setRole(data.map((r: { role_code: string }) => r.role_code).join(', '));
      setReady(true);
    }
    check();
    return () => { active = false; };
  }, [router]);

  async function signOut() { await supabase().auth.signOut(); router.replace('/login'); }

  if (!ready) return <div className="shell-loading">Opening PackFlow…</div>;
  if (error) return <main className="auth-block"><h1>Access unavailable</h1><p>{error}</p><button className="button button-secondary" onClick={signOut}>Sign out</button></main>;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-symbol"><Boxes size={22} strokeWidth={2.2} /></span><div><strong>PackFlow</strong><small>Inventory operations</small></div><button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <nav aria-label="Main navigation" className="nav-list">{nav.map(({ label, icon: Icon, href, phase }) => phase ? <div key={href} className="nav-item nav-disabled" title={`Available in ${phase}`}><Icon size={18} /><span>{label}</span><small>{phase}</small></div> : <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`nav-item ${path === href ? 'nav-active' : ''}`}><Icon size={18} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-foot"><div className="account-dot" aria-hidden="true">{email.slice(0,1).toUpperCase()}</div><div className="account-meta"><strong>{email}</strong><small>{role.replaceAll('_',' ')}</small></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={18} /></button></div>
    </aside>
    {menuOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <div className="main-area"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={22} /></button><span>Export packing raw materials</span><span className="topbar-right">PackFlow ERP</span></header><main className="page-content">{children}</main></div>
  </div>;
}
