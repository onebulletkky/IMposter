import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, request } from './api';
import type { GameView, JoinResponse, Session } from './types';

const sessionKey = 'impostor.session.v1';

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
  const [serverOffset, setServerOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const versionRef = useRef(-1);

  const remember = useCallback((next: Session | null) => {
    if (sessionRef.current?.token !== next?.token) versionRef.current = -1;
    sessionRef.current = next;
    setSession(next);
    try {
      if (next) sessionStorage.setItem(sessionKey, JSON.stringify(next));
      else sessionStorage.removeItem(sessionKey);
    } catch { /* In-memory play still works when storage is disabled. */ }
  }, []);

  const acceptView = useCallback((next: GameView, activeSession: Session) => {
    if (sessionRef.current?.token !== activeSession.token) return;
    if (next.version < versionRef.current) return;
    versionRef.current = next.version;
    setView(next);
    setServerOffset(Date.parse(next.serverTime) - Date.now());
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const poll = async () => {
      try {
        const next = await request<GameView>(`/lobbies/${session.code}`, { signal: controller.signal }, session);
        if (!stopped) {
          acceptView(next, session);
          setConnectionError(null);
        }
      } catch (cause) {
        if (stopped) return;
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 404)) {
          remember(null);
          setView(null);
          setConnectionError(null);
          setError('This lobby session has ended. Create a new lobby or join your friends again.');
          stopped = true;
        } else {
          setConnectionError('Connection interrupted. Reconnecting automatically...');
        }
      } finally {
        if (!stopped) timer = setTimeout(poll, 1000);
      }
    };

    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
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
    if (!active || busyRef.current) return false;
    busyRef.current = true;
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

  return { session, view, serverOffset, busy, error, connectionError, connect, mutate, clearError: () => setError(null) };
}
