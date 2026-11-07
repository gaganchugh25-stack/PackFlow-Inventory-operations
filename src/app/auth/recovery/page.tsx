'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Boxes } from 'lucide-react';
import { Button, FormField, Input } from '@/components/ui';
import { recoveryEmailClient, supabase } from '@/lib/supabase';

export default function RecoveryPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    // Clear fragment tokens before creating the PKCE cookie client. It would
    // otherwise reject an implicit redirect before setSession can store it.
    if (accessToken && refreshToken) window.history.replaceState({}, '', url.pathname);
    const client = supabase();
    const { data: { subscription } } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (active && session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        setHasSession(true);
        setChecking(false);
      }
    });
    async function completeRedirect() {
      const linkError = url.searchParams.get('error') || fragment.get('error');
      if (linkError) {
        if (active) {
          setError('This email link has expired or was already used. Request a new password link when email sending is available.');
          setChecking(false);
        }
        window.history.replaceState({}, '', url.pathname);
        return;
      }
      let user = null;
      if (accessToken && refreshToken) {
        const result = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!result.error) user = result.data.user;
      }
      if (!user) ({ data: { user } } = await client.auth.getUser());
      if (!user && url.searchParams.has('code')) {
        const result = await client.auth.exchangeCodeForSession(url.searchParams.get('code')!);
        if (!result.error) user = result.data.user;
      }
      if (!active) return;
      if (user) {
        setHasSession(true);
        window.history.replaceState({}, '', url.pathname);
      } else if (url.searchParams.has('code') || accessToken) {
        setError('This sign-in link could not be verified. Request a new password link and open it only once.');
      }
      setChecking(false);
    }
    void completeRedirect();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function sendLink(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const { error } = await recoveryEmailClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/recovery`,
    });
    setBusy(false);
    if (error) {
      setError(error.status === 429 || error.code === 'over_email_send_rate_limit'
        ? 'Supabase has temporarily limited password emails. Please wait before requesting another link; repeated clicks will not help.'
        : 'The reset link could not be sent. Check the email address and try again.');
      return;
    }
    setMessage('If this address has a PackFlow account, a password link is on its way. Open the latest email on this computer.');
  }

  async function setNewPassword(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password.length < 12) { setError('Use at least 12 characters.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) { setError('The password could not be saved. Request a new link and try again.'); return; }
    setPassword(''); setConfirm(''); router.replace('/inventory/materials');
  }

  return <main className="recovery-page"><div className="login-brand"><span className="brand-symbol"><Boxes size={25} /></span><strong>PackFlow</strong></div><section className="recovery-panel">
    {checking ? <p>Checking your sign-in link…</p> : hasSession ? <form onSubmit={setNewPassword} className="recovery-form"><h1>Set your password</h1><p>Your email link has been verified. Choose a password to continue to PackFlow.</p><FormField label="New password"><Input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" /></FormField><FormField label="Confirm password"><Input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Enter it again" /></FormField>{error && <div className="notice notice-error" role="alert">{error}</div>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password and continue'}</Button></form> : <form onSubmit={sendLink} className="recovery-form"><h1>Get a password link</h1><p>If the invitation opened a blank page, request a fresh password link here. Use the same invited email address.</p><FormField label="Invited email address"><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" /></FormField>{error && <div className="notice notice-error" role="alert">{error}</div>}{message && <div className="notice notice-success" role="status">{message}</div>}<Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send password link'}</Button><Link className="text-link" href="/login">Back to sign in</Link></form>}
  </section></main>;
}
