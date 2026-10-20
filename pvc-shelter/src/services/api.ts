import type { SaveEnvelope } from '../core/SaveFormat';

// Cliente de la API PHP (backend/public/index.php). Mismo origen: en desarrollo
// Vite redirige /api al servidor PHP (ver vite.config.ts), en producción el
// juego compilado se sirve desde el mismo dominio. La sesión va en una cookie
// HttpOnly; aquí solo se guarda en memoria el token CSRF.

export interface ApiUser {
  id: number;
  username: string;
}

export interface CloudSave {
  data: unknown;
  version: number;
  /** Segundos Unix (hora del servidor) del último guardado. */
  savedAt: number;
}

/** Error de la API con un mensaje apto para mostrar al jugador. status 0 = sin conexión. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const TIMEOUT_MS = 15_000;
let csrfToken = '';

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') return body.error;
  return `Error del servidor (${status}).`;
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null; // p. ej. una página de error HTML del servidor web
    }
    if (!res.ok) throw new ApiError(res.status, errorMessage(json, res.status), json);
    return json as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timer);
  }
}

interface SessionResponse {
  user: ApiUser | null;
  csrfToken: string;
}

function remember(res: SessionResponse): ApiUser | null {
  csrfToken = res.csrfToken;
  return res.user;
}

export const api = {
  /** Usuario actual (o null) y token CSRF para las siguientes peticiones. */
  session: async () => remember(await request<SessionResponse>('GET', '/session')),
  register: async (username: string, password: string) =>
    remember(await request<SessionResponse>('POST', '/register', { username, password })),
  login: async (username: string, password: string) =>
    remember(await request<SessionResponse>('POST', '/login', { username, password })),
  logout: async () => {
    await request<{ ok: boolean }>('POST', '/logout', {});
    csrfToken = '';
  },
  loadSave: () => request<{ save: CloudSave | null; serverNow: number }>('GET', '/save'),
  putSave: (data: SaveEnvelope, version: number | null) =>
    request<{ version: number; savedAt: number }>('PUT', '/save', { data, version }),
};
