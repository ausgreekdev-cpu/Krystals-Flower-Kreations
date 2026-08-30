import { req } from '../customClient';
export const workshopsApi = {
  list: () => req<any[]>('/api/workshops'),
  get: (slug: string) => req<any>(`/api/workshops/${slug}`),
  book: (sessionId: string, body: any) => req<any>(`/api/workshops/sessions/${sessionId}/book`, { method: 'POST', body: JSON.stringify(body) }),
  checkIn: (qrPayload: string, token: string) => req<any>('/api/tickets/check-in', { method: 'POST', body: JSON.stringify({ qrPayload }), token } as any),
};
