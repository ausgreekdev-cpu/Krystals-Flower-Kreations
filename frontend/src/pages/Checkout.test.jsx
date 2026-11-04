import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Checkout from './Checkout';

function renderWithRouter(ui) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('Checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it('renders checkout form fields', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ settings: { tax_gst_rate: '0.10', shipping_free_over: '150' } }),
    });
    renderWithRouter(<Checkout />);
    await waitFor(() => {
      expect(screen.getByText(/Checkout — Perth WA/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows empty cart message when no items', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ settings: {} }),
    });
    renderWithRouter(<Checkout />);
    await waitFor(() => {
      expect(screen.getByText(/empty|cart/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});