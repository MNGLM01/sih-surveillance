/** Same-origin fetch - the Vite dev server proxies /cameras, /events,
 * /incidents, /evidence and /ws to the FastAPI backend on :8000 (see
 * vite.config.ts); in production both are served by the same FastAPI
 * process. A short timeout keeps a stopped backend from hanging the UI in a
 * loading state before it falls back to demo data. */
const LIVE_FETCH_TIMEOUT_MS = 2500

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(path, { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

/** Tries a real backend call; on any failure (backend not running, network
 * error, timeout) falls back to the given demo value. This is the one place
 * that decision is made, so every `api/*.ts` module stays a thin, honest
 * mapper instead of re-implementing the fallback. */
export async function withDemoFallback<T>(
  live: () => Promise<T>,
  demo: T,
): Promise<{ data: T; source: 'live' | 'demo' }> {
  try {
    return { data: await live(), source: 'live' }
  } catch {
    return { data: demo, source: 'demo' }
  }
}
