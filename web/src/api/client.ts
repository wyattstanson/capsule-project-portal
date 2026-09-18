const TOKEN_KEY = 'capsule.token';

// In dev, Vite proxies /api to the local server (empty base → relative).
// In production (e.g. Render static site), set VITE_API_URL to the API's URL.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — token lives only in memory for this session */
  }
}

/** Download a file from an authenticated endpoint and save it in the browser. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new Error('Can’t reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData; // browser sets multipart boundary
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
    });
  } catch {
    // fetch() only rejects on network-level failure (server unreachable, DNS,
    // CORS, offline) — never on an HTTP error status.
    throw new ApiError(0, 'network', 'Can’t reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();

  // Parse defensively: an unreachable API, a proxy error page, or a misconfigured
  // API URL returns HTML, not JSON. Blindly JSON.parse-ing that throws the cryptic
  // "Unexpected token '<' … is not valid JSON" — surface a real message instead.
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.status === 401) setToken(null);
      throw new ApiError(
        res.status || 502,
        'bad_response',
        res.ok
          ? 'The server sent an unexpected response. Is the API URL configured correctly?'
          : `Server error (${res.status}). The API may be starting up or unreachable — try again in a moment.`,
      );
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error ?? {};
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? 'Request failed', err.details);
  }
  return data as T;
}
