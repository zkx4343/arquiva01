import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

export type AuthUser = {
  id: string;
  email: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl.startsWith('https://') && publishableKey,
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        // O Arquiva usa somente e-mail/senha. Não aceite sessões injetadas
        // por fragmentos de URL sem um fluxo PKCE iniciado neste navegador.
        detectSessionInUrl: false,
        persistSession: true,
      },
    })
  : null;

function apiUrl(input: RequestInfo | URL) {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (!raw.startsWith('/api/')) return raw;
  return `${supabaseUrl}/functions/v1/arquiva-api${raw.slice(4)}`;
}

async function currentSession(refresh = false): Promise<Session> {
  if (!supabase)
    throw new Error('A conexão com o Supabase não foi configurada.');
  const result = refresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  if (result.error || !result.data.session)
    throw new Error('Sua sessão expirou. Entre novamente.');
  return result.data.session;
}

async function authenticatedHeaders(initial?: HeadersInit, refresh = false) {
  const session = await currentSession(refresh);
  const headers = new Headers(initial);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('apikey', publishableKey);
  return headers;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const url = apiUrl(input);
  let response = await fetch(url, {
    ...init,
    headers: await authenticatedHeaders(init.headers),
  });
  if (response.status !== 401) return response;
  response = await fetch(url, {
    ...init,
    headers: await authenticatedHeaders(init.headers, true),
  });
  return response;
}

export async function uploadFile(
  file: File,
  folderId: string,
  onProgress: (percent: number) => void,
) {
  const session = await currentSession();
  const form = new FormData();
  form.append('files', file);
  if (folderId) form.append('folderId', folderId);

  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${supabaseUrl}/functions/v1/arquiva-api/files`);
    request.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    request.setRequestHeader('apikey', publishableKey);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new Error('A conexão foi interrompida durante o envio.'));
    request.onload = () =>
      resolve(
        new Response(request.responseText, {
          status: request.status,
          statusText: request.statusText,
          headers: {
            'Content-Type':
              request.getResponseHeader('Content-Type') || 'application/json',
          },
        }),
      );
    request.send(form);
  });
}

export async function openAuthenticatedResource(
  url: string,
  options: { downloadName?: string } = {},
) {
  const popup = options.downloadName
    ? null
    : window.open('about:blank', '_blank', 'noopener,noreferrer');
  try {
    const response = await apiFetch(url, { cache: 'no-store' });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(data?.error || 'Não foi possível abrir o arquivo.');
    }
    const received = await response.blob();
    const unsafeInline = new Set([
      'image/svg+xml',
      'text/html',
      'application/xhtml+xml',
      'application/xml',
      'text/xml',
    ]).has(received.type.split(';')[0].toLowerCase());
    const shouldDownload = Boolean(options.downloadName) || unsafeInline;
    const blobUrl = URL.createObjectURL(received);

    if (shouldDownload) {
      popup?.close();
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = options.downloadName || 'arquivo';
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    } else if (popup) {
      popup.location.replace(blobUrl);
    } else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.append(link);
      link.click();
      link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
