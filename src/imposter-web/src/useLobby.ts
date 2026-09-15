import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, request } from './api';
import type { GameView, JoinResponse, Session } from './types';

const sessionKey = 'impostor.session.v1';
const idleMilliseconds = 5 * 60_000;

function loadSession(): Session | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (value && typeof value === 'object' && 'code' in value && 'playerId' in value && 'token' in value
      && typeof value.code === 'string' && /^[A-Z0-9]{5}$/.test(value.code)
      && typeof value.playerId === 'string' && typeof value.token === 'string') {
      return { code: value.code, playerId: value.playerId, token: value.token };
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
  return null;
}

export function useLobby() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const sessionRef = useRef(session);
  const [view, setView] = useState<GameView | null>(null);
  const viewRef = useRef<GameView | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [refreshing, setRefreshing] = useState(Boolean(session));
  const controlsBlocked = useRef(Boolean(session));
  const resumeRef = useRef(() => {});
  const lastActivity = useRef(Date.now());
  const busyRef = useRef(false);
  const versionRef = useRef(-1);

  const remember = useCallback((next: Session | null) => {
    if (sessionRef.current?.token !== next?.token) {
      versionRef.current = -1;
      viewRef.current = null;
    }
    sessionRef.current = next;
    setSession(next);
    try {
      if (next) sessionStorage.setItem(sessionKey, JSON.stringify(next));
      else sessionStorage.removeItem(sessionKey);
    } catch { /* In-memory play still works when storage is disabled. */ }
  }, []);

  const acceptView = useCallback((next: GameView, activeSession: Session) => {
    if (sessionRef.current?.token !== activeSession.token) return false;
    if (next.version < versionRef.current) return false;
    if (next.phase !== viewRef.current?.phase) lastActivity.current = Date.now();
    versionRef.current = next.version;
    viewRef.current = next;
    setView(next);
    setServerOffset(Date.parse(next.serverTime) - Date.now());
    return true;
  }, []);

  useEffect(() => {
    if (!session) {
      setPollingPaused(false);
      setRefreshing(false);
      controlsBlocked.current = false;
      return;
    }
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let paused = false;
    let failures = 0;
    lastActivity.current = Date.now();

    const resting = () => viewRef.current?.phase === 'Lobby' || viewRef.current?.phase === 'Finished';
    const unavailable = () => document.visibilityState === 'hidden' || !navigator.onLine;
    const idle = () => resting() && Date.now() - lastActivity.current >= idleMilliseconds;
    const pause = () => {
      clearTimeout(timer);
      controller?.abort();
      controller = null;
      paused = true;
      controlsBlocked.current = true;
      setPollingPaused(true);
      setRefreshing(false);
    };

    const poll = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (unavailable() || idle()) { pause(); return; }
      if (controller) return;
      const activeController = new AbortController();
      controller = activeController;
      try {
        const next = await request<GameView>(`/lobbies/${session.code}`, { signal: activeController.signal }, session);
        if (!stopped && controller === activeController && !activeController.signal.aborted) {
          if (!acceptView(next, session)) return;
          failures = 0;
          controlsBlocked.current = false;
          setConnectionError(null);
          setRefreshing(false);
        }
      } catch (cause) {
        if (stopped || controller !== activeController || activeController.signal.aborted) return;
        controlsBlocked.current = true;
        setRefreshing(false);
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 404)) {
          remember(null);
          setView(null);
          setConnectionError(null);
          setError('This lobby session has ended. Create a new lobby or join your friends again.');
          stopped = true;
        } else {
          failures++;
          setConnectionError('Connection interrupted. Reconnecting automatically...');
        }
      } finally {
        // An aborted request must not schedule polls after a tab is hidden or resumed.
        if (controller === activeController) {
          controller = null;
          if (!stopped) {
            const retryDelay = failures ? Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)) : 1000;
            const remainingActivity = resting() ? Math.max(0, idleMilliseconds - (Date.now() - lastActivity.current)) : Infinity;
            timer = setTimeout(poll, Math.min(retryDelay, remainingActivity));
          }
        }
      }
    };

    const resume = () => {
      if (stopped) return;
      lastActivity.current = Date.now();
      if (unavailable()) { pause(); return; }
      paused = false;
      controlsBlocked.current = true;
      setPollingPaused(false);
      setRefreshing(true);
      void poll();
    };
    const activity = () => {
      lastActivity.current = Date.now();
      if (paused) resume();
    };
    const availabilityChanged = () => { if (unavailable()) pause(); else resume(); };
    resumeRef.current = resume;
    document.addEventListener('visibilitychange', availabilityChanged);
    window.addEventListener('focus', availabilityChanged);
    window.addEventListener('online', availabilityChanged);
    window.addEventListener('offline', availabilityChanged);
    document.addEventListener('pointerdown', activity);
    document.addEventListener('keydown', activity);
    resume();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(timer);
      resumeRef.current = () => {};
      document.removeEventListener('visibilitychange', availabilityChanged);
      window.removeEventListener('focus', availabilityChanged);
      window.removeEventListener('online', availabilityChanged);
      window.removeEventListener('offline', availabilityChanged);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
    };
  }, [session, acceptView, remember]);

  const connect = async (nickname: string, code?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await request<JoinResponse>(code ? `/lobbies/${code}/join` : '/lobbies', {
        method: 'POST', body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const next = { code: response.code, playerId: response.playerId, token: response.token };
      remember(next);
      setView(null);
      acceptView(response.view, next);
      setConnectionError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const mutate = async (path: string, body?: unknown, method = 'POST'): Promise<boolean> => {
    const active = sessionRef.current;
    if (!active || busyRef.current || controlsBlocked.current) return false;
    busyRef.current = true;
    lastActivity.current = Date.now();
    setBusy(true);
    setError(null);
    try {
      const next = await request<GameView>(`/lobbies/${active.code}${path}`, {
        method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }, active);
      if (next) acceptView(next, active);
      if (method === 'DELETE') {
        remember(null);
        setView(null);
        setConnectionError(null);
      }
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { session, view, serverOffset, busy, error, connectionError, pollingPaused, refreshing,
    resumePolling: () => resumeRef.current(), connect, mutate, clearError: () => setError(null) };
}
