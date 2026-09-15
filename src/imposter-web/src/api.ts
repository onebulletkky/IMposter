import type { Session } from './types';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, options: RequestInit = {}, session?: Session): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as { detail?: string; title?: string };
    throw new ApiError(problem.detail || problem.title || 'The request could not be completed.', response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Cannot reach the game server. Check your connection and try again.';
}
