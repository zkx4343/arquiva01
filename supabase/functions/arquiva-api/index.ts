import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.112.4';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const PAGE_SIZE = 1_000;
const FILE_SELECT =
  'id,user_id,folder_id,name,drive_file_id,drive_guard,mime_type,size_bytes,is_favorite,created_at,updated_at,trashed_at,folder:arquiva_folders(name)';

type FolderColor = 'mint' | 'peach' | 'lilac' | 'sky';
type DbFolder = {
  id: number;
  user_id: string;
  name: string;
  color: FolderColor;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
type DbFile = {
  id: number;
  user_id: string;
  folder_id: number | null;
  name: string;
  drive_file_id: string;
  drive_guard: string;
  mime_type: string;
  size_bytes: number;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  folder?: { name: string } | Array<{ name: string }> | null;
};
type DriveMetadata = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  trashed?: boolean;
  parents?: string[];
  appProperties?: Record<string, string>;
};
type DriveQuota = {
  limit: bigint | null;
  usage: bigint;
  usageInDrive: bigint;
  usageInDriveTrash: bigint;
  maxUploadSize: bigint | null;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  amr: 'audio/amr',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  yml: 'application/yaml',
  yaml: 'application/yaml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  jsx: 'text/jsx',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
};

const EXTENSIONS = {
  audio: new Set([
    'mp3',
    'wav',
    'wave',
    'ogg',
    'oga',
    'opus',
    'm4a',
    'aac',
    'flac',
    'aif',
    'aiff',
    'amr',
    'wma',
  ]),
  video: new Set(['mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv', '3gp', 'wmv']),
  image: new Set([
    'jpg',
    'jpeg',
    'jfif',
    'png',
    'gif',
    'webp',
    'avif',
    'bmp',
    'svg',
    'tif',
    'tiff',
    'heic',
    'heif',
    'ico',
    'dng',
    'raw',
    'cr2',
    'nef',
  ]),
  text: new Set([
    'txt',
    'md',
    'markdown',
    'csv',
    'tsv',
    'json',
    'xml',
    'yml',
    'yaml',
    'html',
    'htm',
    'css',
    'js',
    'jsx',
    'ts',
    'tsx',
    'log',
  ]),
  spreadsheet: new Set(['xls', 'xlsx', 'ods']),
  presentation: new Set(['ppt', 'pptx', 'odp']),
  archive: new Set(['zip', 'rar', '7z', 'tar', 'gz']),
};

function allowedOrigins() {
  const origins = new Set([
    'https://zkx4343.github.io',
    'http://localhost:3000',
    'http://localhost:4173',
    'http://localhost:5173',
  ]);
  for (const origin of (Deno.env.get('ALLOWED_ORIGINS') || '').split(',')) {
    const normalized = origin.trim().replace(/\/$/, '');
    if (normalized) origins.add(normalized);
  }
  return origins;
}

function corsHeaders(request: Request) {
  const headers = new Headers({
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, range, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers':
      'accept-ranges, content-disposition, content-length, content-range',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  const origin = request.headers.get('Origin')?.replace(/\/$/, '');
  if (origin && allowedOrigins().has(origin))
    headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function originAllowed(request: Request) {
  const origin = request.headers.get('Origin')?.replace(/\/$/, '');
  return !origin || allowedOrigins().has(origin);
}

function json(
  request: Request,
  value: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
) {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  for (const [key, headerValue] of new Headers(extraHeaders))
    headers.set(key, headerValue);
  return new Response(JSON.stringify(value), { status, headers });
}

function errorResponse(request: Request, error: unknown) {
  if (error instanceof HttpError)
    return json(request, { error: error.message }, error.status);
  console.error(
    'arquiva-api',
    error instanceof Error ? error.message : 'erro desconhecido',
  );
  return json(
    request,
    { error: 'Não foi possível concluir esta ação agora.' },
    500,
  );
}

function publishableKey() {
  const configured = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (configured) {
    try {
      const keys = JSON.parse(configured) as Record<string, string>;
      const first = keys.default || Object.values(keys)[0];
      if (first) return first;
    } catch {
      throw new HttpError('Configuração interna do Supabase inválida.', 503);
    }
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  throw new HttpError('A função ainda não foi configurada no Supabase.', 503);
}

async function authenticatedClient(request: Request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer '))
    throw new HttpError('Entre novamente para continuar.', 401);
  const projectUrl = Deno.env.get('SUPABASE_URL');
  if (!projectUrl)
    throw new HttpError('A função ainda não foi configurada no Supabase.', 503);
  const client = createClient(projectUrl, publishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const token = authorization.slice('Bearer '.length);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError('Sua sessão expirou.', 401);
  return { client, userId: data.user.id };
}

function databaseError(
  error: { code?: string; message?: string },
  fallback: string,
) {
  if (error.code === '23505')
    throw new HttpError('Já existe um item com esse nome.', 409);
  if (error.code === '23503')
    throw new HttpError('A pasta escolhida não está disponível.', 400);
  if (error.code === '23514')
    throw new HttpError('Os dados enviados não são válidos.', 400);
  console.error('database', error.code || 'unknown', error.message || fallback);
  throw new HttpError(fallback, 500);
}

function parseId(value: string | null | undefined, label = 'item') {
  if (!value || !/^[1-9]\d*$/.test(value))
    throw new HttpError(`Identificador de ${label} inválido.`);
  return value;
}

function fileExtension(name: string) {
  const extension = name.toLowerCase().split('.').pop();
  return extension && extension !== name.toLowerCase() ? extension : '';
}

function cleanFileName(name: string) {
  return (
    name
      .replace(/\p{Cc}/gu, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .trim()
      .slice(0, 160) || 'arquivo'
  );
}

function cleanFolderName(value: unknown) {
  if (typeof value !== 'string')
    throw new HttpError('Informe o nome da pasta.');
  const name = value
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 60);
  if (!name) throw new HttpError('Informe o nome da pasta.');
  return name;
}

function folderColor(value: unknown): FolderColor {
  return value === 'peach' || value === 'lilac' || value === 'sky'
    ? value
    : 'mint';
}

function inferMimeType(name: string, declaredType?: string | null) {
  const normalized = declaredType?.split(';')[0]?.trim().toLowerCase();
  if (normalized && normalized !== 'application/octet-stream')
    return normalized;
  return (
    MIME_BY_EXTENSION[fileExtension(name)] ||
    normalized ||
    'application/octet-stream'
  );
}

function fileKind(mimeType: string, name = '') {
  const normalized = inferMimeType(name, mimeType);
  const extension = fileExtension(name);
  if (normalized.startsWith('image/') || EXTENSIONS.image.has(extension))
    return 'image';
  if (normalized === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (normalized.startsWith('video/') || EXTENSIONS.video.has(extension))
    return 'video';
  if (normalized.startsWith('audio/') || EXTENSIONS.audio.has(extension))
    return 'audio';
  if (
    normalized.startsWith('text/') ||
    normalized === 'application/json' ||
    normalized === 'application/xml' ||
    normalized === 'application/yaml' ||
    normalized === 'application/javascript' ||
    EXTENSIONS.text.has(extension)
  )
    return 'text';
  if (
    normalized.includes('spreadsheet') ||
    normalized === 'application/vnd.ms-excel' ||
    EXTENSIONS.spreadsheet.has(extension)
  )
    return 'spreadsheet';
  if (
    normalized.includes('presentation') ||
    normalized === 'application/vnd.ms-powerpoint' ||
    EXTENSIONS.presentation.has(extension)
  )
    return 'presentation';
  if (
    normalized.includes('zip') ||
    normalized.includes('compressed') ||
    normalized.includes('archive') ||
    normalized === 'application/vnd.rar' ||
    EXTENSIONS.archive.has(extension)
  )
    return 'archive';
  return 'document';
}

function relationName(folder: DbFile['folder']) {
  if (Array.isArray(folder)) return folder[0]?.name || null;
  return folder?.name || null;
}

function serializeFile(row: DbFile) {
  return {
    id: String(row.id),
    folderId: row.folder_id === null ? null : String(row.folder_id),
    folderName: relationName(row.folder),
    name: row.name,
    mimeType: row.mime_type,
    size: Number(row.size_bytes),
    favorite: row.is_favorite,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    trashedAt: row.trashed_at ? Date.parse(row.trashed_at) : null,
    kind: fileKind(row.mime_type, row.name),
    contentUrl: `/api/files/${row.id}/content?preview=1`,
    downloadUrl: `/api/files/${row.id}/content?download=1`,
  };
}

async function requestBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError('O conteúdo enviado não é válido.');
  }
}

async function ensureFolder(client: SupabaseClient, folderId: string | null) {
  if (!folderId) return null;
  const id = parseId(folderId, 'pasta');
  const { data, error } = await client
    .from('arquiva_folders')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) databaseError(error, 'Não foi possível validar a pasta.');
  if (!data) throw new HttpError('A pasta escolhida não foi encontrada.', 404);
  return id;
}

async function ensureDefaultFolders(client: SupabaseClient, userId: string) {
  const { count, error } = await client
    .from('arquiva_folders')
    .select('id', { count: 'exact', head: true });
  if (error) databaseError(error, 'Não foi possível preparar as pastas.');
  if ((count || 0) > 0) return;
  const defaults = [
    { name: 'Trabalho', color: 'mint', sort_order: 0 },
    { name: 'Pessoal', color: 'peach', sort_order: 1 },
    { name: 'Viagens', color: 'lilac', sort_order: 2 },
    { name: 'Finanças', color: 'sky', sort_order: 3 },
  ];
  const { error: insertError } = await client
    .from('arquiva_folders')
    .insert(defaults.map((folder) => ({ ...folder, user_id: userId })));
  if (insertError && insertError.code !== '23505')
    databaseError(insertError, 'Não foi possível preparar as pastas.');
}

async function allFileStats(client: SupabaseClient, onlyActive: boolean) {
  const rows: Array<{ folder_id: number | null; size_bytes: number }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client
      .from('arquiva_files')
      .select('folder_id,size_bytes')
      .range(from, from + PAGE_SIZE - 1);
    if (onlyActive) query = query.is('trashed_at', null);
    const { data, error } = await query;
    if (error)
      databaseError(error, 'Não foi possível calcular o armazenamento.');
    const page = (data || []) as Array<{
      folder_id: number | null;
      size_bytes: number;
    }>;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listFolders(client: SupabaseClient, userId: string) {
  await ensureDefaultFolders(client, userId);
  const [{ data, error }, stats] = await Promise.all([
    client
      .from('arquiva_folders')
      .select('*')
      .order('sort_order')
      .order('name'),
    allFileStats(client, true),
  ]);
  if (error) databaseError(error, 'Não foi possível carregar as pastas.');
  const totals = new Map<string, { count: number; size: number }>();
  for (const file of stats) {
    if (file.folder_id === null) continue;
    const id = String(file.folder_id);
    const current = totals.get(id) || { count: 0, size: 0 };
    current.count += 1;
    current.size += Number(file.size_bytes);
    totals.set(id, current);
  }
  return ((data || []) as DbFolder[]).map((folder) => ({
    id: String(folder.id),
    name: folder.name,
    color: folder.color,
    count: totals.get(String(folder.id))?.count || 0,
    totalSize: totals.get(String(folder.id))?.size || 0,
    createdAt: Date.parse(folder.created_at),
    updatedAt: Date.parse(folder.updated_at),
  }));
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;
let cachedRootFolderId = '';

function driveConfig() {
  return {
    clientId: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '',
    clientSecret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') || '',
    refreshToken: Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN') || '',
    rootFolderId: Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID') || '',
  };
}

async function requestAccessToken() {
  const config = driveConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken)
    throw new HttpError(
      'A conexão OAuth com o Google Drive ainda não foi concluída.',
      503,
    );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!response.ok || !data?.access_token)
    throw new HttpError('Não foi possível autenticar no Google Drive.', 502);
  cachedToken = {
    value: data.access_token,
    expiresAt:
      Date.now() + Math.max(60, (data.expires_in || 3_600) - 120) * 1_000,
  };
  return data.access_token;
}

async function accessToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now())
    return cachedToken.value;
  if (forceRefresh) cachedToken = null;
  if (!tokenRequest) tokenRequest = requestAccessToken();
  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

async function driveFetch(
  url: string,
  init: RequestInit = {},
  retryAuth = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await accessToken()}`);
  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal || AbortSignal.timeout(120_000),
  });
  if (response.status === 401 && retryAuth) {
    await accessToken(true);
    return driveFetch(url, init, false);
  }
  return response;
}

async function driveFailure(response: Response, fallback: string) {
  console.error('google-drive', response.status, fallback);
  if (response.status === 404)
    return new HttpError('Arquivo não encontrado.', 404);
  if (response.status === 429)
    return new HttpError('O Google Drive está ocupado. Tente novamente.', 429);
  return new HttpError(fallback, response.status >= 500 ? 502 : 400);
}

function bytes(value?: string) {
  try {
    return value ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
}

function displayBytes(value: bigint) {
  return Number(value);
}

async function driveQuota(): Promise<DriveQuota> {
  const url = new URL('https://www.googleapis.com/drive/v3/about');
  url.searchParams.set(
    'fields',
    'storageQuota(limit,usage,usageInDrive,usageInDriveTrash),maxUploadSize',
  );
  const response = await driveFetch(url.toString());
  if (!response.ok)
    throw await driveFailure(
      response,
      'Não foi possível consultar o espaço do Google Drive.',
    );
  const data = (await response.json()) as {
    maxUploadSize?: string;
    storageQuota?: {
      limit?: string;
      usage?: string;
      usageInDrive?: string;
      usageInDriveTrash?: string;
    };
  };
  return {
    limit: data.storageQuota?.limit ? bytes(data.storageQuota.limit) : null,
    usage: bytes(data.storageQuota?.usage),
    usageInDrive: bytes(data.storageQuota?.usageInDrive),
    usageInDriveTrash: bytes(data.storageQuota?.usageInDriveTrash),
    maxUploadSize: data.maxUploadSize ? bytes(data.maxUploadSize) : null,
  };
}

async function rootFolderId() {
  const configured = driveConfig().rootFolderId;
  if (configured) return configured;
  if (cachedRootFolderId) return cachedRootFolderId;

  const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
  listUrl.searchParams.set('spaces', 'drive');
  listUrl.searchParams.set('pageSize', '10');
  listUrl.searchParams.set('fields', 'files(id,name)');
  listUrl.searchParams.set(
    'q',
    "mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='managedBy' and value='arquiva-root' }",
  );
  const listed = await driveFetch(listUrl.toString());
  if (!listed.ok)
    throw await driveFailure(
      listed,
      'Não foi possível localizar a pasta do Arquiva no Drive.',
    );
  const listData = (await listed.json()) as {
    files?: Array<{ id?: string }>;
  };
  const existing = listData.files?.find((folder) => folder.id)?.id;
  if (existing) {
    cachedRootFolderId = existing;
    return existing;
  }

  const createUrl = new URL('https://www.googleapis.com/drive/v3/files');
  createUrl.searchParams.set('fields', 'id');
  const created = await driveFetch(createUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: 'ARQUIVA_DOCUMENTOS',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { managedBy: 'arquiva-root' },
    }),
  });
  if (!created.ok)
    throw await driveFailure(
      created,
      'Não foi possível criar a pasta do Arquiva no Drive.',
    );
  const createData = (await created.json()) as { id?: string };
  if (!createData.id)
    throw new HttpError('O Google Drive não retornou a pasta criada.', 502);
  cachedRootFolderId = createData.id;
  return createData.id;
}

async function uploadDriveFile(file: File, ownerId: string, guard: string) {
  const parentId = await rootFolderId();
  const name = cleanFileName(file.name);
  const mimeType = inferMimeType(name, file.type);
  const createUrl = new URL('https://www.googleapis.com/upload/drive/v3/files');
  createUrl.searchParams.set('uploadType', 'resumable');
  createUrl.searchParams.set('supportsAllDrives', 'true');
  createUrl.searchParams.set('fields', 'id,name,mimeType,size,appProperties');
  const start = await driveFetch(createUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({
      name,
      mimeType,
      parents: [parentId],
      appProperties: {
        managedBy: 'arquiva',
        ownerId,
        guard,
      },
    }),
  });
  if (!start.ok)
    throw await driveFailure(
      start,
      'Não foi possível preparar o envio ao Drive.',
    );
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl)
    throw new HttpError('O Google Drive não iniciou o envio.', 502);
  const uploaded = await driveFetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(file.size),
    },
    body: await file.arrayBuffer(),
  });
  if (!uploaded.ok)
    throw await driveFailure(
      uploaded,
      'Não foi possível enviar o arquivo ao Drive.',
    );
  const metadata = (await uploaded.json()) as DriveMetadata;
  if (!metadata.id)
    throw new HttpError('O Google Drive não retornou o arquivo enviado.', 502);
  return { id: metadata.id, name, mimeType };
}

async function driveMetadata(fileId: string) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set(
    'fields',
    'id,name,mimeType,size,trashed,parents,appProperties',
  );
  const response = await driveFetch(url.toString());
  if (!response.ok)
    throw await driveFailure(
      response,
      'Não foi possível localizar o arquivo no Drive.',
    );
  return (await response.json()) as DriveMetadata;
}

function assertManagedFile(
  metadata: DriveMetadata,
  row: DbFile,
  userId: string,
) {
  if (
    metadata.appProperties?.managedBy !== 'arquiva' ||
    metadata.appProperties?.ownerId !== userId ||
    metadata.appProperties?.guard !== row.drive_guard
  )
    throw new HttpError('Este arquivo não pertence ao Arquiva.', 403);
  if (metadata.trashed)
    throw new HttpError('O arquivo está na lixeira do Google Drive.', 410);
}

async function renameDriveFile(fileId: string, name: string) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,name');
  const response = await driveFetch(url.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok)
    throw await driveFailure(response, 'Não foi possível renomear no Drive.');
}

async function deleteDriveFile(fileId: string) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await driveFetch(url.toString(), { method: 'DELETE' });
  if (!response.ok && response.status !== 404)
    throw await driveFailure(response, 'Não foi possível excluir do Drive.');
}

async function driveContent(fileId: string, range?: string | null) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  const validRange = range && /^bytes=\d*-\d*$/.test(range) ? range : null;
  return driveFetch(url.toString(), {
    headers: validRange ? { Range: validRange } : undefined,
  });
}

async function fileRow(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from('arquiva_files')
    .select(FILE_SELECT)
    .eq('id', parseId(id, 'arquivo'))
    .maybeSingle();
  if (error) databaseError(error, 'Não foi possível carregar o arquivo.');
  if (!data) throw new HttpError('Arquivo não encontrado.', 404);
  return data as unknown as DbFile;
}

async function handleFolders(
  request: Request,
  client: SupabaseClient,
  userId: string,
  route: string,
) {
  if (route === '/folders' && request.method === 'GET')
    return json(request, { folders: await listFolders(client, userId) });

  if (route === '/folders' && request.method === 'POST') {
    const body = await requestBody(request);
    const now = new Date().toISOString();
    const { data, error } = await client
      .from('arquiva_folders')
      .insert({
        user_id: userId,
        name: cleanFolderName(body.name),
        color: folderColor(body.color),
        updated_at: now,
      })
      .select('*')
      .single();
    if (error) databaseError(error, 'Não foi possível criar a pasta.');
    const folder = data as DbFolder;
    return json(
      request,
      {
        folder: {
          id: String(folder.id),
          name: folder.name,
          color: folder.color,
          count: 0,
          totalSize: 0,
          createdAt: Date.parse(folder.created_at),
          updatedAt: Date.parse(folder.updated_at),
        },
      },
      201,
    );
  }

  const match = route.match(/^\/folders\/(\d+)$/);
  if (!match) return null;
  const id = parseId(match[1], 'pasta');

  if (request.method === 'PATCH') {
    const body = await requestBody(request);
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ('name' in body) updates.name = cleanFolderName(body.name);
    if ('color' in body) updates.color = folderColor(body.color);
    const { data, error } = await client
      .from('arquiva_folders')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) databaseError(error, 'Não foi possível atualizar a pasta.');
    if (!data) throw new HttpError('Pasta não encontrada.', 404);
    const folder = data as DbFolder;
    return json(request, {
      folder: {
        id: String(folder.id),
        name: folder.name,
        color: folder.color,
        count: 0,
        totalSize: 0,
        createdAt: Date.parse(folder.created_at),
        updatedAt: Date.parse(folder.updated_at),
      },
    });
  }

  if (request.method === 'DELETE') {
    const { data, error } = await client
      .from('arquiva_folders')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) databaseError(error, 'Não foi possível excluir a pasta.');
    if (!data) throw new HttpError('Pasta não encontrada.', 404);
    return json(request, { success: true });
  }
  return null;
}

async function handleFileList(request: Request, client: SupabaseClient) {
  const url = new URL(request.url);
  const section = url.searchParams.get('section') || 'all';
  const folderId = url.searchParams.get('folderId');
  const search = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const sort = url.searchParams.get('sort') || 'recent';
  const type = url.searchParams.get('type') || 'all';
  let query = client.from('arquiva_files').select(FILE_SELECT);

  if (section === 'trash') query = query.not('trashed_at', 'is', null);
  else query = query.is('trashed_at', null);
  if (section === 'favorites') query = query.eq('is_favorite', true);
  if (folderId) query = query.eq('folder_id', parseId(folderId, 'pasta'));
  if (search)
    query = query.ilike('name', `%${search.replace(/[%_]/g, '\\$&')}%`);
  if (sort === 'name') query = query.order('name');
  else if (sort === 'size')
    query = query.order('size_bytes', { ascending: false });
  else if (sort === 'oldest') query = query.order('created_at');
  else query = query.order('updated_at', { ascending: false });

  const { data, error } = await query.limit(500);
  if (error) databaseError(error, 'Não foi possível carregar os arquivos.');
  let files = ((data || []) as unknown as DbFile[]).map(serializeFile);
  if (type !== 'all') files = files.filter((file) => file.kind === type);
  return json(request, { files });
}

async function handleUpload(
  request: Request,
  client: SupabaseClient,
  userId: string,
) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError('O envio não pôde ser lido.');
  }
  const files = form
    .getAll('files')
    .filter((value): value is File => value instanceof File);
  if (!files.length) throw new HttpError('Escolha ao menos um arquivo.');
  if (files.length > MAX_FILES_PER_REQUEST)
    throw new HttpError(
      `Envie no máximo ${MAX_FILES_PER_REQUEST} arquivos por vez.`,
    );
  for (const file of files) {
    if (!file.size || file.size > MAX_FILE_SIZE)
      throw new HttpError('Cada arquivo deve ter entre 1 byte e 25 MB.');
  }
  const folderId = await ensureFolder(
    client,
    typeof form.get('folderId') === 'string'
      ? (form.get('folderId') as string)
      : null,
  );
  const quota = await driveQuota();
  const total = files.reduce((sum, file) => sum + BigInt(file.size), 0n);
  if (quota.limit !== null && quota.limit - quota.usage < total)
    throw new HttpError('Não há espaço suficiente no Google Drive.', 413);

  const uploaded: ReturnType<typeof serializeFile>[] = [];
  for (const file of files) {
    const guard = crypto.randomUUID();
    const driveFile = await uploadDriveFile(file, userId, guard);
    const { data, error } = await client
      .from('arquiva_files')
      .insert({
        user_id: userId,
        folder_id: folderId,
        name: driveFile.name,
        drive_file_id: driveFile.id,
        drive_guard: guard,
        mime_type: driveFile.mimeType,
        size_bytes: file.size,
      })
      .select(FILE_SELECT)
      .single();
    if (error) {
      await deleteDriveFile(driveFile.id).catch(() => undefined);
      databaseError(error, 'Não foi possível registrar o arquivo.');
    }
    uploaded.push(serializeFile(data as unknown as DbFile));
  }
  return json(request, { files: uploaded }, 201);
}

async function handleFilePatch(
  request: Request,
  client: SupabaseClient,
  userId: string,
  id: string,
) {
  const current = await fileRow(client, id);
  const body = await requestBody(request);
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let renamed = false;
  let newName = current.name;

  if ('name' in body) {
    if (typeof body.name !== 'string') throw new HttpError('Nome inválido.');
    newName = cleanFileName(body.name);
    if (newName !== current.name) {
      const metadata = await driveMetadata(current.drive_file_id);
      assertManagedFile(metadata, current, userId);
      await renameDriveFile(current.drive_file_id, newName);
      renamed = true;
      updates.name = newName;
    }
  }
  if ('folderId' in body) {
    const folderId =
      body.folderId === null || body.folderId === ''
        ? null
        : typeof body.folderId === 'string'
          ? body.folderId
          : String(body.folderId);
    updates.folder_id = await ensureFolder(client, folderId);
  }
  if ('favorite' in body) {
    if (typeof body.favorite !== 'boolean')
      throw new HttpError('Valor de favorito inválido.');
    updates.is_favorite = body.favorite;
  }
  if ('trashed' in body) {
    if (typeof body.trashed !== 'boolean')
      throw new HttpError('Valor de lixeira inválido.');
    updates.trashed_at = body.trashed ? new Date().toISOString() : null;
  }

  const { data, error } = await client
    .from('arquiva_files')
    .update(updates)
    .eq('id', parseId(id, 'arquivo'))
    .select(FILE_SELECT)
    .maybeSingle();
  if (error) {
    if (renamed)
      await renameDriveFile(current.drive_file_id, current.name).catch(
        () => undefined,
      );
    databaseError(error, 'Não foi possível atualizar o arquivo.');
  }
  if (!data) throw new HttpError('Arquivo não encontrado.', 404);
  return json(request, { file: serializeFile(data as unknown as DbFile) });
}

async function handleFileDelete(
  request: Request,
  client: SupabaseClient,
  userId: string,
  id: string,
) {
  const current = await fileRow(client, id);
  try {
    const metadata = await driveMetadata(current.drive_file_id);
    assertManagedFile(metadata, current, userId);
    await deleteDriveFile(current.drive_file_id);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  const { error } = await client
    .from('arquiva_files')
    .delete()
    .eq('id', parseId(id, 'arquivo'));
  if (error) databaseError(error, 'Não foi possível excluir o registro.');
  return json(request, { success: true });
}

function contentDisposition(name: string, download: boolean) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function handleFileContent(
  request: Request,
  client: SupabaseClient,
  userId: string,
  id: string,
) {
  const current = await fileRow(client, id);
  const metadata = await driveMetadata(current.drive_file_id);
  assertManagedFile(metadata, current, userId);
  const upstream = await driveContent(
    current.drive_file_id,
    request.headers.get('Range'),
  );
  if (!upstream.ok && upstream.status !== 206)
    throw await driveFailure(upstream, 'Não foi possível abrir o arquivo.');
  const url = new URL(request.url);
  const preview = url.searchParams.get('preview') === '1';
  const kind = fileKind(current.mime_type, current.name);
  const previewable = new Set(['image', 'pdf', 'video', 'audio', 'text']).has(
    kind,
  );
  const download =
    url.searchParams.get('download') === '1' || !preview || !previewable;
  const headers = corsHeaders(request);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, no-store');
  headers.set(
    'Content-Disposition',
    contentDisposition(current.name, download),
  );
  headers.set(
    'Content-Type',
    preview && kind === 'text'
      ? 'text/plain; charset=utf-8'
      : current.mime_type || 'application/octet-stream',
  );
  headers.set('Content-Security-Policy', 'sandbox');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  for (const name of ['Content-Length', 'Content-Range']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function handleStorage(request: Request, client: SupabaseClient) {
  const [quota, stats] = await Promise.all([
    driveQuota(),
    allFileStats(client, false),
  ]);
  const managedBytes = stats.reduce(
    (sum, file) => sum + Number(file.size_bytes),
    0,
  );
  const available =
    quota.limit === null
      ? null
      : quota.limit > quota.usage
        ? quota.limit - quota.usage
        : 0n;
  return json(request, {
    storage: {
      fileCount: stats.length,
      managedBytes,
      usedBytes: displayBytes(quota.usage),
      limitBytes: quota.limit === null ? null : displayBytes(quota.limit),
      availableBytes: available === null ? null : displayBytes(available),
      driveBytes: displayBytes(quota.usageInDrive),
      trashBytes: displayBytes(quota.usageInDriveTrash),
      maxUploadBytes:
        quota.maxUploadSize === null ? null : displayBytes(quota.maxUploadSize),
      updatedAt: Date.now(),
      unlimited: quota.limit === null,
    },
  });
}

async function routeRequest(request: Request) {
  if (!originAllowed(request))
    throw new HttpError('Origem não autorizada.', 403);
  const { client, userId } = await authenticatedClient(request);
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  const marker = '/arquiva-api';
  const markerIndex = pathname.indexOf(marker);
  const route =
    markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) || '/' : '/';

  if (route.startsWith('/folders')) {
    const response = await handleFolders(request, client, userId, route);
    if (response) return response;
  }
  if (route === '/files' && request.method === 'GET')
    return handleFileList(request, client);
  if (route === '/files' && request.method === 'POST')
    return handleUpload(request, client, userId);
  if (route === '/storage' && request.method === 'GET')
    return handleStorage(request, client);

  const contentMatch = route.match(/^\/files\/(\d+)\/content$/);
  if (contentMatch && request.method === 'GET')
    return handleFileContent(request, client, userId, contentMatch[1]);

  const fileMatch = route.match(/^\/files\/(\d+)$/);
  if (fileMatch && request.method === 'GET')
    return json(request, {
      file: serializeFile(await fileRow(client, fileMatch[1])),
    });
  if (fileMatch && request.method === 'PATCH')
    return handleFilePatch(request, client, userId, fileMatch[1]);
  if (fileMatch && request.method === 'DELETE')
    return handleFileDelete(request, client, userId, fileMatch[1]);

  throw new HttpError('Rota não encontrada.', 404);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    if (!originAllowed(request))
      return errorResponse(
        request,
        new HttpError('Origem não autorizada.', 403),
      );
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  try {
    return await routeRequest(request);
  } catch (error) {
    return errorResponse(request, error);
  }
});
