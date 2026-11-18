import { createClient } from '@supabase/supabase-js';

// Public, browser-safe values only (project URL + publishable key). The service-role
// key must never appear in this app. Access control is enforced by RLS in Postgres.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Fixed shared staff username -> this Auth email (public build-time value, NOT a secret).
// The password is never stored in code, env vars, or the build; staff type it at sign-in.
export const staffLoginEmail = ((import.meta.env.VITE_STAFF_LOGIN_EMAIL as string | undefined) ?? '').trim();

export const configured = Boolean(url && key && url.startsWith('https://'));

export const supabase = configured
  ? createClient(url as string, key as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
