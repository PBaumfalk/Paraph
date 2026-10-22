// API-Client der Oberfläche. Zustandsändernde Aufrufe senden das CSRF-Token der Sitzung.
let csrf = '';
export function setCsrf(token: string) {
  csrf = token;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
}

async function handle(res: Response) {
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (body as any)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Fehler ${res.status}`, e?.details);
  }
  return body;
}

export async function api<T = any>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const h: Record<string, string> = { ...headers };
  if (method !== 'GET' && csrf) h['x-csrf-token'] = csrf;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers: h, body: payload, credentials: 'same-origin' });
  return handle(res) as Promise<T>;
}

export const get = <T = any>(url: string) => api<T>('GET', url);
export const post = <T = any>(url: string, body?: unknown, headers?: Record<string, string>) => api<T>('POST', url, body ?? {}, headers);
export const put = <T = any>(url: string, body: unknown) => api<T>('PUT', url, body);
export const patch = <T = any>(url: string, body: unknown) => api<T>('PATCH', url, body);
export const del = <T = any>(url: string) => api<T>('DELETE', url);

export function upload<T = any>(url: string, file: File, onProgress?: (p: number) => void): Promise<T> {
  // XHR für Fortschrittsanzeige
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (csrf) xhr.setRequestHeader('x-csrf-token', csrf);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(xhr.status, body?.error?.code ?? 'error', body?.error?.message ?? `Fehler ${xhr.status}`, body?.error?.details));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Keine Verbindung zum Server.'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

/** Lädt eine Datei authentifiziert und bietet sie zum Speichern an. */
export async function download(url: string, headers: Record<string, string> = {}, fallbackName = 'download') {
  const res = await fetch(url, { headers, credentials: 'same-origin' });
  if (!res.ok) await handle(res);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function fetchBytes(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers, credentials: 'same-origin' });
  if (!res.ok) await handle(res);
  return new Uint8Array(await res.arrayBuffer());
}
