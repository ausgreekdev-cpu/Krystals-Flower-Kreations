import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Cart from './Cart';

function renderWithRouter(ui) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('Cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it('renders empty cart message', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ items: [] }),
    });
    renderWithRouter(<Cart />);
    await waitFor(() => {
      expect(screen.getByText(/empty|no items|your cart/i)).toBeInTheDocument();
    });
  });

  it('renders cart items', async () => {
    localStorage.setItem('cartId', 'test-cart-123');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        cart: { id: 'test-cart-123', items: [
          { id: '1', title: 'Paper Rose', quantity: 2, priceSnapshot: '18.00', product: { title: 'Paper Rose', images: [] } },
        ] },
      }),
    });
    renderWithRouter(<Cart />);
    await waitFor(() => {
      expect(screen.getByText(/Paper Rose/)).toBeInTheDocument();
    });
  });
});