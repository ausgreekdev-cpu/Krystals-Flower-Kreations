import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import OrderTracking from './OrderTracking';

function renderWithRouter(ui) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('OrderTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the tracking form', () => {
    renderWithRouter(<OrderTracking />);
    expect(screen.getByPlaceholderText(/order number/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /track/i })).toBeInTheDocument();
  });

  it('shows error when order not found', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ error: 'Order not found', code: 'not_found' }),
    });
    renderWithRouter(<OrderTracking />);
    fireEvent.change(screen.getByPlaceholderText(/order number/i), { target: { value: 'KFK-2026-0001' } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /track/i }));
    await waitFor(() => {
      expect(screen.getByText(/order not found/i)).toBeInTheDocument();
    });
  });

  it('displays order details when found', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        order: {
          orderNumber: 'KFK-2026-0001',
          status: 'shipped',
          total: '89.00',
          currency: 'AUD',
          trackingNumber: 'AU123456',
          trackingUrl: null,
          shippedAt: '2026-11-01T00:00:00Z',
          lines: [{ title: 'Paper Rose Bouquet', quantity: 1, unitPrice: '89.00', lineTotal: '89.00' }],
          history: [{ toStatus: 'paid', createdAt: '2026-10-31T00:00:00Z', note: null }],
        },
      }),
    });
    renderWithRouter(<OrderTracking />);
    fireEvent.change(screen.getByPlaceholderText(/order number/i), { target: { value: 'KFK-2026-0001' } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /track/i }));
    await waitFor(() => {
      expect(screen.getByText(/KFK-2026-0001/)).toBeInTheDocument();
      expect(screen.getByText(/shipped/i)).toBeInTheDocument();
      expect(screen.getByText(/Paper Rose Bouquet/)).toBeInTheDocument();
    });
  });
});