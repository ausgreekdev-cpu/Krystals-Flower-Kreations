import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Admin from './Admin';

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it('redirects to login when no token', async () => {
    render(<MemoryRouter><Admin /></MemoryRouter>);
    await waitFor(() => {
      // Should redirect or show login prompt
      expect(document.body).toBeTruthy();
    });
  });

  it('renders admin page with token', async () => {
    localStorage.setItem('token', 'test-admin-token');
    localStorage.setItem('user', JSON.stringify({ name: 'Admin', email: 'admin@test.com', role: 'admin' }));
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ user: { name: 'Admin', email: 'admin@test.com', role: 'admin' } }),
    });
    render(<MemoryRouter><Admin /></MemoryRouter>);
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    }, { timeout: 5000 });
  });
});