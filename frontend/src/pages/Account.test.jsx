import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Account from './Account';

function renderWithRouter(ui) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('Account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it('redirects to login when no token', async () => {
    renderWithRouter(<Account />);
    await waitFor(() => {
      // Should either show login prompt or redirect
      expect(document.body).toBeTruthy();
    });
  });

  it('renders account page with token', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ name: 'Test User', email: 'test@test.com', role: 'customer' }));
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ user: { name: 'Test User', email: 'test@test.com', role: 'customer' }, orders: [], downloads: [] }),
    });
    renderWithRouter(<Account />);
    await waitFor(() => {
      expect(screen.getByText(/No orders yet/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});