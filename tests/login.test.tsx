// @vitest-environment jsdom
// Targeted tests for the shared-username login. Uses a fake Supabase client.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach } from 'vitest';

const M = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../src/supabase', () => ({
  configured: true,
  staffLoginEmail: 'shared-staff@example.test',
  supabase: { auth: { signInWithPassword: M.signIn } },
}));

import { Login } from '../src/components/Login';
import { resolveLoginEmail } from '../src/logic';

const fill = (u: string, p: string) => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: u } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: p } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

beforeEach(() => M.signIn.mockReset());
afterEach(cleanup);

describe('resolveLoginEmail', () => {
  it('maps "thanksgiving" case-insensitively (trimmed) to the configured email', () => {
    for (const u of ['thanksgiving', 'Thanksgiving', 'THANKSGIVING', '  thanksgiving ']) {
      expect(resolveLoginEmail(u, 'a@b.test')).toBe('a@b.test');
    }
  });
  it('rejects any other username, and a missing email', () => {
    expect(resolveLoginEmail('admin', 'a@b.test')).toBeNull();
    expect(resolveLoginEmail('', 'a@b.test')).toBeNull();
    expect(resolveLoginEmail('thanksgiving2', 'a@b.test')).toBeNull();
    expect(resolveLoginEmail('thanksgiving', '')).toBeNull();
  });
});

describe('Login screen', () => {
  it('shows Username and Password fields (no email field)', () => {
    render(<Login />);
    expect(screen.getByLabelText('Username')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
  });

  it('signs in through email/password auth using the mapped email', async () => {
    M.signIn.mockResolvedValue({ error: null });
    render(<Login />);
    fill('ThanksGiving', 'correct horse');
    await waitFor(() => expect(M.signIn).toHaveBeenCalledTimes(1));
    expect(M.signIn).toHaveBeenCalledWith({ email: 'shared-staff@example.test', password: 'correct horse' });
  });

  it('wrong username: generic error and NO request is sent', async () => {
    render(<Login />);
    fill('someoneelse', 'whatever');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sign-in failed. Check your username and password.');
    expect(M.signIn).not.toHaveBeenCalled();
  });

  it('wrong password: the same generic error (never reveals which part was wrong)', async () => {
    M.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Login />);
    fill('thanksgiving', 'bad');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sign-in failed. Check your username and password.');
  });

  it('does not leak the email or Supabase error text on screen', async () => {
    M.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const { container } = render(<Login />);
    fill('thanksgiving', 'bad');
    await screen.findByRole('alert');
    expect(container.textContent).not.toContain('shared-staff@example.test');
    expect(container.textContent).not.toContain('Invalid login credentials');
  });

  it('cosmetic lockout after 5 failed tries stops sending requests', async () => {
    M.signIn.mockResolvedValue({ error: { message: 'x' } });
    render(<Login />);
    for (let i = 0; i < 5; i++) {
      fill('thanksgiving', 'bad' + i);
      await waitFor(() => expect(M.signIn).toHaveBeenCalledTimes(i + 1));
    }
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Too many attempts/));
    fill('thanksgiving', 'correct');
    await waitFor(() => expect(M.signIn).toHaveBeenCalledTimes(5)); // blocked, no 6th call
  });
});
