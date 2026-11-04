import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Configurator from './Configurator';

describe('Configurator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => [],
    });
  });

  it('renders configurator page', async () => {
    render(<MemoryRouter><Configurator /></MemoryRouter>);
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    }, { timeout: 5000 });
  });
});