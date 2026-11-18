import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './supabase';
import { useData, type DataApi } from './useData';
import { GuestsView } from './components/GuestsView';
import { MapsView } from './components/MapsView';
import { GuestForm } from './components/GuestForm';

type Tab = 'guests' | 'maps' | 'add';

export default function App() {
  if (!configured) {
    return (
      <main className="center-card">
        <h1>Setup needed</h1>
        <p>This site is not connected to its database yet. The event admin needs to set the Supabase URL and key, then redeploy.</p>
      </main>
    );
  }
  return <AuthGate />;
}

function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="center-card"><p>Loading…</p></main>;
  if (!session) return <Login />;
  return <StaffCheck session={session} />;
}

function StaffCheck({ session }: { session: Session }) {
  const [state, setState] = useState<'checking' | 'ok' | 'denied' | 'error'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    setState('checking');
    void supabase
      .from('staff')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setState(error ? 'error' : data ? 'ok' : 'denied');
      });
    return () => {
      alive = false;
    };
  }, [session.user.id, attempt]);

  if (state === 'checking') return <main className="center-card"><p>Checking access…</p></main>;
  if (state === 'error')
    return (
      <main className="center-card">
        <h1>Can’t reach the server</h1>
        <p>Check Wi-Fi, then try again.</p>
        <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        <button className="btn" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </main>
    );
  if (state === 'denied')
    return (
      <main className="center-card">
        <h1>Not authorized</h1>
        <p>This account is not on the event staff list. Ask the event admin to add you.</p>
        <button className="btn btn-primary" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </main>
    );
  return <Main />;
}

function Main() {
  const data = useData(true);
  const [tab, setTab] = useState<Tab>('guests');
  return (
    <div className="app">
      <Header data={data} />
      <main className="content">
        {data.loadError && (
          <div className="banner banner-err" role="alert">
            {data.loadError}{' '}
            <button className="btn btn-small" onClick={() => void data.refresh()}>Retry</button>
          </div>
        )}
        {tab === 'guests' && <GuestsView data={data} />}
        {tab === 'maps' && <MapsView data={data} />}
        {tab === 'add' && (
          <section>
            <h2>Add guest</h2>
            {data.loaded ? <GuestForm data={data} /> : <p className="empty">Loading…</p>}
          </section>
        )}
      </main>
      <nav className="tabs" aria-label="Main">
        <button className={tab === 'guests' ? 'on' : ''} onClick={() => setTab('guests')} aria-current={tab === 'guests'}>
          <span aria-hidden="true">👥</span>Guests
        </button>
        <button className={tab === 'maps' ? 'on' : ''} onClick={() => setTab('maps')} aria-current={tab === 'maps'}>
          <span aria-hidden="true">🗺️</span>Dining Maps
        </button>
        <button className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')} aria-current={tab === 'add'}>
          <span aria-hidden="true">➕</span>Add Guest
        </button>
      </nav>
    </div>
  );
}

function Header({ data }: { data: DataApi }) {
  const label = data.conn === 'live' ? 'Live' : data.conn === 'connecting' ? 'Connecting…' : 'Offline — retrying';
  const time = data.lastSync?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <header className="top">
      <strong>Thanksgiving Seating</strong>
      <div className="top-right">
        <span className={`pill pill-${data.conn}`} role="status">● {label}</span>
        {time && <small>Updated {time}</small>}
        <button className="btn btn-small" onClick={() => void data.refresh()}>Refresh</button>
        <button className="btn-link" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </div>
    </header>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fails, setFails] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    if (Date.now() < lockUntil) {
      setMsg('Too many attempts. Wait 30 seconds and try again.');
      return;
    }
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const n = fails + 1;
      setFails(n);
      if (n >= 5) {
        setLockUntil(Date.now() + 30_000);
        setFails(0);
        setMsg('Too many attempts. Wait 30 seconds and try again.');
      } else setMsg('Sign-in failed. Check your email and password.');
    }
  };

  return (
    <main className="center-card">
      <h1>Thanksgiving Seating</h1>
      <p>Staff sign-in</p>
      <form className="form" onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {msg && <div className="banner banner-err" role="alert">{msg}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
