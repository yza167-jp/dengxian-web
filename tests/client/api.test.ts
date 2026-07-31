import { describe, expect, it, vi } from 'vitest';
import { clientApi, type RoomSnapshot } from '../../src/client/api/clientApi';

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

  it('fetches a fresh seat-scoped room snapshot for stale action recovery', async () => {
    const snapshot: RoomSnapshot = {
      room: { ...room, seats: [], chat: [] },
      view: null,
      stateHash: 'fresh-hash',
    };
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(snapshot)));
    vi.stubGlobal('fetch', fetchMock);

    await clientApi.snapshot({
      roomId: room.id,
      code: room.code,
      seatId: 'seat-1',
      seatToken: 'token-1234567890123456',
      snapshot,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/rooms/room_123456?seatId=seat-1&seatToken=token-1234567890123456');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('preserves JSON content type when authenticated Bot requests add custom headers', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ profile: { id: 'bot-1' } })));
    vi.stubGlobal('fetch', fetchMock);

    await clientApi.createBot('manager-token-that-is-long-enough-1234', { presetId: 'steady-altar-keeper' });

    expect(fetchMock).toHaveBeenCalledWith('/api/bots', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ presetId: 'steady-altar-keeper' }),
    }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-bot-manager-token': 'manager-token-that-is-long-enough-1234',
    });
  });

  it('runs a provider probe with an admin token and no custom game view', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({
      ok: true,
      requestedProvider: 'deepseek',
      requestedModel: 'deepseek-v4-flash',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      usedFallback: false,
      latencyMs: 321,
      retryCount: 0,
      requestMode: 'tool',
    })));
    vi.stubGlobal('fetch', fetchMock);

    await clientApi.providerTest('provider-admin-token', {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/provider-test', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      }),
    }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-provider-test-token': 'provider-admin-token',
    });
  });
});
