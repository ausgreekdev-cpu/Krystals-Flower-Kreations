// Scan API client — barcode/SKU lookup + quick-create for unknown codes.
import { req } from '../../lib/api/customClient';

export interface ScanStockLine {
  locationId: string;
  location: string;
  onHand: number;
  low: boolean;
}

export interface ScanItem {
  id: string;
  title?: string;
  name?: string; // raw materials use `name` instead of `title`
  slug?: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number;
  type?: string;
  stockMode?: string;
  isActive?: boolean;
  image?: string | null;
  unit?: string;
  onHand?: number;
  supplier?: string | null;
}

export interface ScanResult {
  found: boolean;
  kind?: 'product' | 'variant' | 'raw_material';
  item?: ScanItem;
  variant?: { id: string; title: string; sku?: string | null; barcode?: string | null } | null;
  stock?: ScanStockLine[];
  totalOnHand?: number;
  scanned?: string;
}

const TIMEOUT_MS = 5000;

/**
 * Async barcode lookup with a hard 5s timeout.
 * Resolves `{ found: false }` for unknown codes, throws for network/auth errors.
 */
export async function lookupScan(code: string, token: string): Promise<ScanResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await req<ScanResult>(`/api/inventory/scan/${encodeURIComponent(code)}`, { token, signal: ac.signal });
  } catch (e: any) {
    if (ac.signal.aborted || e?.name === 'AbortError') {
      throw new Error('Network timeout — check connection and retry');
    }
    if (e?.status === 404) return { found: false, scanned: code };
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Create a minimal product for an unknown barcode (Inventory surface only). */
export async function createQuickItem(
  input: { title: string; price: number; barcode: string },
  token: string,
): Promise<any> {
  const slug =
    input.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || `item-${Date.now()}`;
  return req<any>('/api/products', {
    method: 'POST',
    token,
    body: JSON.stringify({
      title: input.title.slice(0, 200),
      slug,
      price: input.price,
      barcode: input.barcode || null,
      type: 'physical',
      stockMode: 'tracked',
    }),
  });
}
