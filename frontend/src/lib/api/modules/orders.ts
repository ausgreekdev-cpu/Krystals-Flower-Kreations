import { req } from '../customClient';
export const ordersApi = {
  checkout: (body: any, idempotencyKey?: string) => req<any>('/api/orders/checkout', { method: 'POST', body: JSON.stringify(body), idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) } as any),
  customCreate: (body: any, token?: string, idempotencyKey?: string) => req<any>('/api/custom-orders', { method: 'POST', body: JSON.stringify(body), token, idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) } as any),
  customList: (token: string) => req<any[]>('/api/custom-orders', { token } as any),
  customMove: (id: string, state: string, token: string) => req<any>(`/api/custom-orders/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }), token } as any),
  get: (orderNumber: string) => req<any>(`/api/orders/${orderNumber}`),
};