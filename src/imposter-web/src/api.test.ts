import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('Authenticated game requests', () => {
  it('sends the session credential in an authorization header with caching disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 3 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await request('/lobbies/AB12C', {}, { code: 'AB12C', playerId: 'one', token: 'private-token' });
    expect(fetchMock).toHaveBeenCalledWith('/api/lobbies/AB12C', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer private-token' }), cache: 'no-store',
    }));
  });

  it('retains the status and problem detail for recoverable game errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'Conflict', detail: 'That turn has already ended.' }), { status: 409 })));
    await expect(request('/lobbies/AB12C/turn', { method: 'POST' })).rejects.toEqual(new ApiError('That turn has already ended.', 409));
  });
});
