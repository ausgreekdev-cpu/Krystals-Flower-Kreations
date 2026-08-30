import { req } from '../customClient';
export const cartApi = {
  get: (cartId?: string) => req<any>(`/api/cart`, { headers: cartId ? { 'x-cart-id': cartId } : undefined } as any),
  add: (body: any) => req<{ cartId: string; cart: any }>('/api/cart/add', { method: 'POST', body: JSON.stringify(body) }),
  update: (body: { itemId: string; quantity: number }) => req('/api/cart/update', { method: 'POST', body: JSON.stringify(body) }),
};
