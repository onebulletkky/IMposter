import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './api';
import type { GameView } from './types';
import { useLobby } from './useLobby';

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), request: vi.fn() }));
const requestMock = vi.mocked(request);
const session = { code: 'AB12C', playerId: 'one', token: 'private-token' };

function gameView(overrides: Partial<GameView> = {}): GameView {
  return {
    code: session.code, hostId: 'one', phase: 'Lobby',
    settings: { impostorCount: 1, extraImpostorChancePercent: 0, roundCount: 3, turnSeconds: 30 },
    players: [{ id: 'one', nickname: 'Alex', isHost: true, hasVoted: false, isImpostor: null, voteCount: null }],
    self: { id: 'one', isImpostor: null, word: null, hasVoted: false },
    roundNumber: 0, turnNumber: 0, currentPlayerId: null, turnEndsAt: null,
    serverTime: new Date().toISOString(), votesCast: 0, isVoteTie: false, guessesRemaining: 0,
    guesses: [], revealedWord: null, winningTeam: null, version: 1,
    ...overrides,
  };
}

function visibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush() { await act(async () => {}); }
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  sessionStorage.setItem('impostor.session.v1', JSON.stringify(session));
  requestMock.mockReset();
  requestMock.mockResolvedValue(gameView());
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Lobby polling on sleeping hosts', () => {
  it('does not contact the server without a lobby session', async () => {
    sessionStorage.clear();
    renderHook(useLobby);
    await advance(60_000);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('pauses hidden tabs and refreshes immediately when the tab becomes visible', async () => {
    const { result } = renderHook(useLobby);
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(1);
    act(() => visibility('hidden'));
    await advance(60_000);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.current.pollingPaused).toBe(true);
    act(() => visibility('visible'));
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(result.current.pollingPaused).toBe(false);
    await advance(1000);
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  it('does not wake the server when restoring a session in an already hidden tab', async () => {
    visibility('hidden');
    renderHook(useLobby);
    await advance(60_000);
    expect(requestMock).not.toHaveBeenCalled();
    act(() => visibility('visible'));
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight hidden-tab read and ignores its late response', async () => {
    let finish!: (value: GameView) => void;
    requestMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useLobby);
    const signal = requestMock.mock.calls[0][1]?.signal;
    act(() => visibility('hidden'));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(gameView({ version: 99 })); });
    expect(result.current.view).toBeNull();
    await advance(10_000);
    expect(requestMock).toHaveBeenCalledTimes(1);
    act(() => visibility('visible'));
    await flush();
    expect(result.current.view?.version).toBe(1);
  });

  it('stops while offline and refreshes immediately on reconnect or focus', async () => {
    const { result } = renderHook(useLobby);
    await flush();
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    await advance(60_000);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.current.pollingPaused).toBe(true);
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(2);
    act(() => window.dispatchEvent(new Event('focus')));
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  it('backs off failed reads and returns to normal polling after recovery', async () => {
    requestMock.mockRejectedValueOnce(new ApiError('Starting', 503))
      .mockRejectedValueOnce(new TypeError('Network error'));
    const { result } = renderHook(useLobby);
    await flush();
    expect(result.current.connectionError).toBeTruthy();
    await advance(1999);
    expect(requestMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(requestMock).toHaveBeenCalledTimes(2);
    await advance(3999);
    expect(requestMock).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(requestMock).toHaveBeenCalledTimes(3);
    expect(result.current.connectionError).toBeNull();
    await advance(1000);
    expect(requestMock).toHaveBeenCalledTimes(4);
  });

  it.each(['Lobby', 'Finished'] as const)('pauses an abandoned visible %s after five minutes and resumes on interaction', async phase => {
    requestMock.mockResolvedValue(gameView({ phase }));
    const { result } = renderHook(useLobby);
    await flush();
    await advance(5 * 60_000);
    expect(result.current.pollingPaused).toBe(true);
    const calls = requestMock.mock.calls.length;
    await advance(60_000);
    expect(requestMock).toHaveBeenCalledTimes(calls);
    act(() => document.dispatchEvent(new Event('pointerdown')));
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(calls + 1);
    expect(result.current.pollingPaused).toBe(false);
  });

  it.each(['Playing', 'Voting', 'Guessing'] as const)('keeps a visible %s game current while players use Discord', async phase => {
    requestMock.mockResolvedValue(gameView({ phase }));
    const { result } = renderHook(useLobby);
    await flush();
    await advance(6 * 60_000);
    expect(result.current.pollingPaused).toBe(false);
    expect(requestMock.mock.calls.length).toBeGreaterThan(300);
  });

  it('blocks stale mutations while paused and until the resume refresh succeeds', async () => {
    const { result } = renderHook(useLobby);
    await flush();
    act(() => visibility('hidden'));
    await act(async () => { expect(await result.current.mutate('/start')).toBe(false); });
    let finish!: (value: GameView) => void;
    requestMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    act(() => visibility('visible'));
    expect(result.current.refreshing).toBe(true);
    await act(async () => { expect(await result.current.mutate('/start')).toBe(false); });
    expect(requestMock).toHaveBeenCalledTimes(2);
    await act(async () => { finish(gameView()); });
    expect(result.current.refreshing).toBe(false);
    await act(async () => { expect(await result.current.mutate('/start')).toBe(true); });
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  it('keeps resumed controls blocked when a delayed read is older than a completed mutation', async () => {
    const { result } = renderHook(useLobby);
    await flush();
    let finishMutation!: (value: GameView) => void;
    let finishRead!: (value: GameView) => void;
    requestMock.mockReturnValueOnce(new Promise(resolve => { finishMutation = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; }));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.mutate('/settings', { roundCount: 4 }, 'PUT'); });
    act(() => visibility('hidden'));
    act(() => visibility('visible'));
    await act(async () => { finishMutation(gameView({ version: 3 })); await mutation; });
    await act(async () => { finishRead(gameView({ version: 2 })); });
    expect(result.current.view?.version).toBe(3);
    expect(result.current.refreshing).toBe(true);
    await act(async () => { expect(await result.current.mutate('/start')).toBe(false); });
    requestMock.mockResolvedValue(gameView({ version: 3 }));
    await advance(1000);
    expect(result.current.refreshing).toBe(false);
  });
  it('does not replay failed create or game mutations', async () => {
    const { result } = renderHook(useLobby);
    await flush();
    requestMock.mockRejectedValueOnce(new ApiError('Starting', 503));
    await act(async () => { expect(await result.current.mutate('/votes', { targetId: 'two' })).toBe(false); });
    await advance(10_000);
    expect(requestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    requestMock.mockRejectedValueOnce(new TypeError('Network error'));
    await act(async () => { await result.current.connect('Alex'); });
    await advance(10_000);
    expect(requestMock.mock.calls.filter(([path]) => path === '/lobbies')).toHaveLength(1);
  });
});
