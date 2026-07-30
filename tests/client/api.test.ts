import { describe, expect, it, vi } from 'vitest';
import { clientApi } from '../../src/client/api/clientApi';

const room = {
  schemaVersion: 1,
  id: 'room_123456',
  code: 'ABC123',
  status: 'lobby',
  hostSeatId: 'seat-1',
  seed: 42,
  maxSeats: 4,
  seats: [],
  chat: [],
} as const;

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(''),
  } as Response;
}

describe('client api payload mapping', () => {
  it('creates rooms with the server createRoom schema', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ room, seatId: 'seat-1', seatToken: 'token-1234567890123456' })));
    vi.stubGlobal('fetch', fetchMock);

    const session = await clientApi.createRoom({ hostName: '房主', maxSeats: 5, seed: 99 });

    expect(fetchMock).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ hostName: '房主', maxSeats: 5, seed: 99 }),
    }));
    expect(session.roomId).toBe(room.id);
    expect(session.code).toBe(room.code);
  });

  it('joins rooms by code and unwraps provider diagnostics', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ room, seatId: 'seat-2', seatToken: 'token-abcdefghijklmnop' }))
      .mockResolvedValueOnce(jsonResponse({ providers: [{ id: 'local-bot', label: '本地', status: 'available' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const session = await clientApi.joinRoom({ code: 'abc123', name: '访客' });
    const providers = await clientApi.providers();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/rooms/join', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: 'abc123', name: '访客' }),
    }));
    expect(session.seatId).toBe('seat-2');
    expect(providers).toEqual([{ id: 'local-bot', label: '本地', status: 'available' }]);
  });
});
