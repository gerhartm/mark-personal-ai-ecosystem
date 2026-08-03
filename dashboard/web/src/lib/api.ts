import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = '/api';

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail: any = null;
    try {
      detail = await res.json();
    } catch {
      /* empty body */
    }
    const err = new Error(detail?.message ?? `Request failed (${res.status})`);
    (err as any).status = res.status;
    (err as any).detail = detail;
    throw err;
  }
  return res.json() as Promise<T>;
}

interface QueryState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => void;
}

const cache = new Map<string, unknown>();

/**
 * Loading holds the previous render rather than blanking the layout, so
 * nothing jumps when data arrives and a fast refetch never flashes.
 */
export function useQuery<T = any>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(() => (path ? ((cache.get(path) as T) ?? null) : null));
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const cached = cache.get(path) as T | undefined;
    if (cached !== undefined) setData(cached);
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => {
        if (!alive.current) return;
        cache.set(path, d);
        setData(d);
      })
      .catch((e) => alive.current && setError(e as Error))
      .finally(() => alive.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const refetch = useCallback(() => {
    if (path) cache.delete(path);
    setNonce((n) => n + 1);
  }, [path]);

  return { data, error, loading, refetch };
}

export const invalidate = (prefix: string) => {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
};

export const qs = (params: Record<string, unknown>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};
