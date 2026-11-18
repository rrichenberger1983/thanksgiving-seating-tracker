import { useState } from 'react';
import { staffLoginEmail, supabase } from '../supabase';
import { resolveLoginEmail } from '../logic';

const GENERIC_ERROR = 'Sign-in failed. Check your username and password.';
const LOCK_MSG = 'Too many attempts. Wait 30 seconds and try again.';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fails, setFails] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const fail = () => {
    const n = fails + 1;
    if (n >= 5) {
      setLockUntil(Date.now() + 30_000);
      setFails(0);
      setMsg(LOCK_MSG);
    } else {
      setFails(n);
      setMsg(GENERIC_ERROR);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    if (Date.now() < lockUntil) {
      setMsg(LOCK_MSG);
      return;
    }
    setMsg('');
    // Wrong username: same generic error, and no request is sent.
    const email = resolveLoginEmail(username, staffLoginEmail);
    if (!email) {
      fail();
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) fail(); // same message for every failure (wrong password, rate limit, network)
  };

  return (
    <main className="center-card">
      <h1>Thanksgiving Seating</h1>
      <p>Staff sign-in</p>
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {msg && (
          <div className="banner banner-err" role="alert">
            {msg}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
