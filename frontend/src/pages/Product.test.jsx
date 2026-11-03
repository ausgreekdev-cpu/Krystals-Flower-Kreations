import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import Product from './Product';

function renderWithRouter(ui) {
  return render(<MemoryRouter initialEntries={['/product/paper-rose']}>{ui}</MemoryRouter>);
}

describe('Product', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('shows loading then product details', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/products/fields')) {
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => [] });
      }
      return Promise.resolve({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ id: '1', title: 'Paper Rose', slug: 'paper-rose', price: 18, description: 'A beautiful paper rose', type: 'physical', stockMode: 'tracked', images: [], reviews: [] }),
      });
    });
    renderWithRouter(<Routes><Route path="/product/:slug" element={<Product />} /></Routes>);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Paper Rose/ })).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows not found on 404', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/products/fields')) {
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => [] });
      }
      return Promise.resolve({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({ error: 'Not found' }) });
    });
    renderWithRouter(<Routes><Route path="/product/:slug" element={<Product />} /></Routes>);
    await waitFor(() => {
      expect(screen.getByText(/not found|could not be found/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});