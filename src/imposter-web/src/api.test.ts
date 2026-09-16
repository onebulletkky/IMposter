import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

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

// Model browser request deadlines with fake time, so a cold start does not slow the suite.
function mockRequestDeadline() {
  vi.useFakeTimers();
  return vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
}

describe('Cold-start requests', () => {
  it('allows a one-minute wake-up without timing out or repeating a mutation', async () => {
    const deadline = mockRequestDeadline();
    const fetchMock = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      setTimeout(() => resolve(new Response(JSON.stringify({ code: 'AB12C' }), { status: 200 })), 60_000);
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = request('/lobbies', { method: 'POST', body: JSON.stringify({ nickname: 'Alex' }) });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toEqual({ code: 'AB12C' });
    expect(deadline).toHaveBeenCalledWith(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still honors immediate caller cancellation while waiting for a sleeping server', async () => {
    mockRequestDeadline();
    const fetchMock = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = request('/lobbies/AB12C', { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ends an unresponsive request after two minutes without retrying it', async () => {
    mockRequestDeadline();
    const fetchMock = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = request('/lobbies', { method: 'POST' });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(120_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it('uses the configured backend URL and removes its trailing slash', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://game.example.com/api/');
  vi.resetModules();
  try {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const configured = await import('./api');
    await configured.request('/lobbies');
    expect(fetchMock).toHaveBeenCalledWith('https://game.example.com/api/lobbies', expect.any(Object));
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
