'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Boxes, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, FormField, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError('Sign-in failed. Check your email and password, then try again.'); return; }
    router.replace('/inventory/materials');
  }

  return <main className="login-page"><div className="login-brand"><span className="brand-symbol"><Boxes size={26} /></span><strong>PackFlow</strong></div><section className="login-panel"><div className="login-copy"><h1>Inventory, ready for dispatch.</h1><p>Manage packing materials, inward receipts and stock levels from one reliable workspace.</p><div className="login-rule"><span>01</span> Material master <span>02</span> Stock inward <span>03</span> Reorder levels</div></div><form className="login-form" onSubmit={signIn}><h2>Sign in</h2><p>Use your invited PackFlow account.</p><FormField label="Email address"><Input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" /></FormField><FormField label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" /></FormField>{error && <div className="notice notice-error" role="alert">{error}</div>}<Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></Button><Link className="login-help" href="/auth/recovery">Invitation link blank? Set or reset your password</Link><small>Accounts are created by invitation only.</small></form></section></main>;
}
