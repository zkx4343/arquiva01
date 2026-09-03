'use client';

/* oxlint-disable react/react-compiler, next/no-img-element, jsx-a11y/media-has-caption, jsx-a11y/no-autofocus -- prévias autenticadas e mídia enviada pelo usuário não passam pelo otimizador nem possuem legendas geradas */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowUpDown,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  CloudOff,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderHeart,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Home,
  Image as ImageIcon,
  Info,
  List,
  LogOut,
  Menu,
  Monitor,
  Moon,
  MoreHorizontal,
  Move,
  Palette,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Toaster, toast } from '@/components/ui/toast';
import {
  apiFetch,
  openAuthenticatedResource,
  uploadFile,
  type AuthUser,
} from '@/lib/supabase-client';

type FolderItem = {
  id: string;
  name: string;
  color: 'mint' | 'peach' | 'lilac' | 'sky';
  count: number;
  totalSize: number;
  createdAt: number;
  updatedAt: number;
};

type StoredFile = {
  id: string;
  folderId: string | null;
  folderName: string | null;
  name: string;
  mimeType: string;
  size: number;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
  kind:
    | 'image'
    | 'pdf'
    | 'video'
    | 'audio'
    | 'text'
    | 'spreadsheet'
    | 'presentation'
    | 'archive'
    | 'document';
  contentUrl: string;
  downloadUrl: string;
};

type ThemeMode = 'light' | 'dark' | 'system';
type Accent = 'forest' | 'ocean' | 'grape';
type ViewMode = 'grid' | 'list';
type Density = 'comfortable' | 'compact';
type EditMode = 'rename' | 'move';
type Usage = {
  fileCount: number;
  managedBytes: number;
  usedBytes: number;
  limitBytes: number | null;
  availableBytes: number | null;
  driveBytes: number;
  trashBytes: number;
  updatedAt: number;
  unlimited: boolean;
};

const folderIcon = {
  mint: Folder,
  peach: FolderHeart,
  lilac: ImageIcon,
  sky: Archive,
} as const;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES = 256 * 1024;

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || 'Algo não saiu como esperado.');
  return data;
}

function useAuthenticatedObjectUrl(url: string) {
  const [objectUrl, setObjectUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl = '';
    setObjectUrl('');
    setLoading(true);
    setFailed(false);
    apiFetch(url, { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar a prévia.');
        return response.blob();
      })
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  return { objectUrl, loading, failed };
}

function accountInitials(email: string) {
  const parts = email
    .split('@')[0]
    .split(/[._\-\s]+/)
    .filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`
      : parts[0]?.slice(0, 2) || 'AR'
  ).toUpperCase();
}

export default function ArquivaApp({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => Promise<void>;
}) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [usage, setUsage] = useState<Usage>({
    fileCount: 0,
    managedBytes: 0,
    usedBytes: 0,
    limitBytes: null,
    availableBytes: null,
    driveBytes: 0,
    trashBytes: 0,
    updatedAt: 0,
    unlimited: false,
  });
  const [storageRefreshing, setStorageRefreshing] = useState(false);
  const [active, setActive] = useState('home');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<ViewMode>('grid');
  const [density, setDensity] = useState<Density>('comfortable');
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [accent, setAccent] = useState<Accent>('forest');
  const [systemDark, setSystemDark] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [folderOpen, setFolderOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderItem | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState<FolderItem['color']>('mint');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);
  const [resumeUploadAfterFolder, setResumeUploadAfterFolder] = useState(false);
  const [previewFile, setPreviewFile] = useState<StoredFile | null>(null);
  const [editFile, setEditFile] = useState<StoredFile | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('rename');
  const [editName, setEditName] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [permanentDelete, setPermanentDelete] = useState<StoredFile | null>(
    null,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  const activeFolderId = active.startsWith('folder:') ? active.slice(7) : '';
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(media.matches);
    media.addEventListener('change', sync);
    const saved = window.localStorage.getItem('arquiva-preferences');
    if (saved) {
      try {
        const preferences = JSON.parse(saved) as Partial<{
          theme: ThemeMode;
          accent: Accent;
          view: ViewMode;
          density: Density;
          sort: string;
        }>;
        if (preferences.theme) setTheme(preferences.theme);
        if (preferences.accent) setAccent(preferences.accent);
        if (preferences.view) setView(preferences.view);
        if (preferences.density) setDensity(preferences.density);
        if (preferences.sort) setSort(preferences.sort);
      } catch {
        /* Preferências inválidas voltam ao padrão. */
      }
    }
    setPreferencesReady(true);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem(
      'arquiva-preferences',
      JSON.stringify({ theme, accent, view, density, sort }),
    );
  }, [theme, accent, view, density, sort, preferencesReady]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const loadFolders = useCallback(async () => {
    const data = await readJson<{ folders: FolderItem[] }>(
      await apiFetch('/api/folders', { cache: 'no-store' }),
    );
    setFolders(data.folders);
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams({ sort, type: typeFilter });
    if (query.trim()) params.set('q', query.trim());
    if (active === 'favorites') params.set('section', 'favorites');
    else if (active === 'trash') params.set('section', 'trash');
    else if (activeFolderId) params.set('folderId', activeFolderId);
    try {
      const data = await readJson<{ files: StoredFile[] }>(
        await apiFetch(`/api/files?${params}`, { cache: 'no-store' }),
      );
      setFiles(data.files);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os arquivos.',
      );
    } finally {
      setLoading(false);
    }
  }, [active, activeFolderId, query, sort, typeFilter]);

  const loadStorage = useCallback(async () => {
    setStorageRefreshing(true);
    try {
      const data = await readJson<{ storage: Usage }>(
        await apiFetch('/api/storage', { cache: 'no-store' }),
      );
      setUsage(data.storage);
    } finally {
      setStorageRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFolders().catch((error) =>
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as pastas.',
      ),
    );
  }, [loadFolders]);

  useEffect(() => {
    const timer = window.setTimeout(loadFiles, query ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [loadFiles, query]);

  useEffect(() => {
    void loadStorage().catch(() => undefined);
    const refreshWhenVisible = () => {
      if (!document.hidden) void loadStorage().catch(() => undefined);
    };
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadStorage]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadFolders(),
      loadFiles(),
      loadStorage().catch(() => undefined),
    ]);
  }, [loadFolders, loadFiles, loadStorage]);

  const navigate = (destination: string) => {
    setActive(destination);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openUploadDialog = () => {
    if (!uploadQueue.length) setUploadFolderId(activeFolderId);
    setUploadOpen(true);
  };

  const openFolderDialog = (
    folder?: FolderItem,
    options?: { resumeUpload?: boolean },
  ) => {
    setResumeUploadAfterFolder(Boolean(options?.resumeUpload));
    setEditingFolder(folder ?? null);
    setFolderName(folder?.name ?? '');
    setFolderColor(folder?.color ?? 'mint');
    setFolderOpen(true);
  };

  const createFolderFromUpload = () => {
    setUploadOpen(false);
    openFolderDialog(undefined, { resumeUpload: true });
  };

  const changeFolderDialogOpen = (open: boolean) => {
    setFolderOpen(open);
    if (!open && resumeUploadAfterFolder) {
      setResumeUploadAfterFolder(false);
      setUploadOpen(true);
    }
  };

  const saveFolder = async () => {
    if (!folderName.trim() || folderSaving) return;
    setFolderSaving(true);
    try {
      const response = await apiFetch(
        editingFolder ? `/api/folders/${editingFolder.id}` : '/api/folders',
        {
          method: editingFolder ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderName, color: folderColor }),
        },
      );
      const data = await readJson<{ folder: { id: string } }>(response);
      setFolderOpen(false);
      await refreshAll();
      if (!editingFolder && resumeUploadAfterFolder) {
        setUploadFolderId(data.folder.id);
        setResumeUploadAfterFolder(false);
        setUploadOpen(true);
      } else {
        setResumeUploadAfterFolder(false);
      }
      toast.add({
        title: editingFolder ? 'Pasta atualizada' : 'Pasta criada',
        description: `“${folderName.trim()}” já está pronta.`,
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
        priority: 'high',
      });
    } finally {
      setFolderSaving(false);
    }
  };

  const requestDeleteFolder = (folder: FolderItem) => {
    setFolderOpen(false);
    setResumeUploadAfterFolder(false);
    setFolderToDelete(folder);
  };

  const deleteFolder = async () => {
    if (!folderToDelete || folderDeleting) return;
    setFolderDeleting(true);
    try {
      await readJson(
        await apiFetch(`/api/folders/${folderToDelete.id}`, {
          method: 'DELETE',
        }),
      );
      if (active === `folder:${folderToDelete.id}`) setActive('home');
      setFolderToDelete(null);
      await refreshAll();
      toast.add({
        title: 'Pasta excluída',
        description: 'Os arquivos continuam disponíveis em Início.',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Não foi possível excluir',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    } finally {
      setFolderDeleting(false);
    }
  };

  const addToUploadQueue = (incoming: File[]) => {
    const valid = incoming.filter(
      (file) => file.size > 0 && file.size <= MAX_FILE_SIZE,
    );
    const rejected = incoming.length - valid.length;
    if (rejected)
      toast.add({
        title: `${rejected} arquivo${rejected > 1 ? 's foram ignorados' : ' foi ignorado'}`,
        description: 'Cada arquivo deve ter até 25 MB e não pode estar vazio.',
        type: 'warning',
      });
    setUploadQueue((current) => [...current, ...valid].slice(0, 10));
    setUploadOpen(true);
  };

  const sendUploads = async () => {
    if (!uploadQueue.length || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const uploaded: StoredFile[] = [];
      for (const [index, file] of uploadQueue.entries()) {
        const response = await uploadFile(file, uploadFolderId, (progress) =>
          setUploadProgress(
            Math.round(((index + progress / 100) / uploadQueue.length) * 100),
          ),
        );
        const data = await readJson<{ files: StoredFile[] }>(response);
        uploaded.push(...data.files);
      }
      const result = { files: uploaded };
      setUploadProgress(100);
      setUploadOpen(false);
      setUploadQueue([]);
      setUploadFolderId('');
      await refreshAll();
      toast.add({
        title: `${result.files.length} arquivo${result.files.length > 1 ? 's adicionados' : ' adicionado'}`,
        description: uploadFolderId
          ? 'Envio concluído para a pasta escolhida.'
          : 'Envio concluído.',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Falha no envio',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
        priority: 'high',
      });
    } finally {
      setUploading(false);
    }
  };

  const patchFile = async (
    file: StoredFile,
    updates: Partial<{
      name: string;
      folderId: string | null;
      favorite: boolean;
      trashed: boolean;
    }>,
  ) => {
    const data = await readJson<{ file: StoredFile }>(
      await apiFetch(`/api/files/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    );
    return data.file;
  };

  const toggleFavorite = async (file: StoredFile) => {
    try {
      await patchFile(file, { favorite: !file.favorite });
      await refreshAll();
      toast.add({
        title: file.favorite
          ? 'Removido dos favoritos'
          : 'Adicionado aos favoritos',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Não foi possível atualizar',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  const moveToTrash = async (file: StoredFile) => {
    try {
      await patchFile(file, { trashed: true });
      setPreviewFile(null);
      await refreshAll();
      toast.add({
        title: 'Movido para a Lixeira',
        description: file.name,
        type: 'success',
        timeout: 7000,
        actionProps: {
          children: 'Desfazer',
          onClick: async () => {
            await patchFile(file, { trashed: false });
            await refreshAll();
          },
        },
      });
    } catch (error) {
      toast.add({
        title: 'Não foi possível mover',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  const restoreFile = async (file: StoredFile) => {
    try {
      await patchFile(file, { trashed: false });
      await refreshAll();
      toast.add({
        title: 'Arquivo restaurado',
        description: 'Ele voltou para seus arquivos.',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Não foi possível restaurar',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  const openFileEdit = (file: StoredFile, mode: EditMode) => {
    setEditFile(file);
    setEditMode(mode);
    setEditName(file.name);
    setEditFolderId(file.folderId ?? '');
  };

  const saveFileEdit = async () => {
    if (!editFile) return;
    try {
      await patchFile(
        editFile,
        editMode === 'rename'
          ? { name: editName }
          : { folderId: editFolderId || null },
      );
      setEditFile(null);
      setPreviewFile(null);
      await refreshAll();
      toast.add({
        title: editMode === 'rename' ? 'Arquivo renomeado' : 'Arquivo movido',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  const deleteForever = async () => {
    if (!permanentDelete) return;
    try {
      await readJson(
        await apiFetch(`/api/files/${permanentDelete.id}`, {
          method: 'DELETE',
        }),
      );
      setPermanentDelete(null);
      await refreshAll();
      toast.add({ title: 'Arquivo excluído definitivamente', type: 'success' });
    } catch (error) {
      toast.add({
        title: 'Não foi possível excluir',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  const heading =
    active === 'favorites'
      ? 'Seus favoritos'
      : active === 'trash'
        ? 'Lixeira'
        : active === 'recent'
          ? 'Arquivos recentes'
          : activeFolder
            ? activeFolder.name
            : 'Seus arquivos, no lugar certo.';
  const subheading =
    active === 'favorites'
      ? 'O que importa, sempre à mão.'
      : active === 'trash'
        ? 'Restaure arquivos ou exclua-os definitivamente.'
        : active === 'recent'
          ? 'Tudo o que você abriu e adicionou por último.'
          : activeFolder
            ? `${activeFolder.count} arquivo${activeFolder.count === 1 ? '' : 's'} nesta pasta.`
            : 'Encontre, visualize e organize tudo sem perder tempo.';
  const emptyText = query
    ? 'Nenhum arquivo corresponde à sua busca.'
    : active === 'trash'
      ? 'A Lixeira está vazia.'
      : active === 'favorites'
        ? 'Você ainda não favoritou arquivos.'
        : activeFolder
          ? 'Esta pasta ainda está vazia.'
          : 'Seus arquivos vão aparecer aqui.';

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } catch (error) {
      setLoggingOut(false);
      toast.add({
        title: 'Não foi possível sair',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    }
  };

  return (
    <div className={isDark ? 'dark' : ''} data-accent={accent}>
      <main className="min-h-dvh bg-background text-foreground">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
          <NavigationPanel
            folders={folders}
            active={active}
            usage={usage}
            storageRefreshing={storageRefreshing}
            onRefreshStorage={() => void loadStorage().catch(() => undefined)}
            onNavigate={navigate}
            onUpload={openUploadDialog}
            onCreateFolder={() => openFolderDialog()}
            onEditFolder={(folder) => openFolderDialog(folder)}
            onDeleteFolder={requestDeleteFolder}
            onSettings={() => setSettingsOpen(true)}
          />
        </aside>

        <div className="lg:pl-[248px]">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/88 backdrop-blur-xl">
            <div className="mx-auto flex h-[72px] max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11 lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menu"
              >
                <Menu />
              </Button>
              <div className="relative mx-auto min-w-0 w-full max-w-[640px] lg:mx-0">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar arquivos..."
                  aria-label="Buscar documentos"
                  className="h-11 rounded-xl border-transparent bg-muted/80 pl-10 pr-12 shadow-none focus-visible:bg-background"
                />
                {query ? (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground sm:right-2 sm:size-8"
                    aria-label="Limpar busca"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">
                    ⌘ K
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11 sm:size-9"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                {isDark ? <Sun /> : <Moon />}
              </Button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="hidden size-9 place-items-center rounded-full bg-[linear-gradient(135deg,#f9b56a,#de6a5b)] text-sm font-semibold text-white shadow-sm sm:grid"
                aria-label="Abrir configurações"
              >
                {accountInitials(user.email)}
              </button>
            </div>
          </header>

          <div
            className={`mx-auto max-w-[1480px] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-7 sm:px-6 lg:px-8 lg:pb-12 lg:pt-9 ${density === 'compact' ? 'density-compact' : ''}`}
          >
            <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                {active === 'home' && (
                  <p className="mb-1 text-sm font-medium text-primary">
                    Seu espaço pessoal
                  </p>
                )}
                <h1 className="text-[clamp(1.8rem,3vw,2.45rem)] font-semibold tracking-[-0.045em]">
                  {heading}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {subheading}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {activeFolder && (
                  <>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => openFolderDialog(activeFolder)}
                      className="h-11 w-full rounded-xl px-4 min-[480px]:w-auto"
                    >
                      <Pencil /> Renomear pasta
                    </Button>
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={() => requestDeleteFolder(activeFolder)}
                      className="h-11 w-full rounded-xl px-4 min-[480px]:w-auto"
                    >
                      <Trash2 /> Excluir pasta
                    </Button>
                  </>
                )}
                <Button
                  size="lg"
                  onClick={openUploadDialog}
                  className="h-11 w-full rounded-xl px-4 min-[480px]:w-auto"
                >
                  <Upload /> Adicionar arquivos
                </Button>
              </div>
            </section>

            {active === 'home' && (
              <section className="mt-8" aria-labelledby="folders-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2
                    id="folders-title"
                    className="text-base font-semibold tracking-tight"
                  >
                    Suas pastas
                  </h2>
                  <Button
                    variant="outline"
                    onClick={() => openFolderDialog()}
                    className="rounded-xl"
                  >
                    <FolderPlus /> Nova pasta
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">
                  <CreateFolderCard onCreate={() => openFolderDialog()} />
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onOpen={() => navigate(`folder:${folder.id}`)}
                      onEdit={() => openFolderDialog(folder)}
                      onDelete={() => requestDeleteFolder(folder)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section
              className={active === 'home' ? 'mt-9' : 'mt-8'}
              aria-labelledby="files-title"
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="files-title"
                    className="text-base font-semibold tracking-tight"
                  >
                    {active === 'home' ? 'Arquivos recentes' : heading}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {loading
                      ? 'Atualizando…'
                      : `${files.length} resultado${files.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                  <NativeSelect
                    className="w-full sm:w-fit"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    aria-label="Filtrar por tipo"
                  >
                    <NativeSelectOption value="all">
                      Todos os tipos
                    </NativeSelectOption>
                    <NativeSelectOption value="image">
                      Imagens
                    </NativeSelectOption>
                    <NativeSelectOption value="pdf">PDFs</NativeSelectOption>
                    <NativeSelectOption value="audio">
                      Áudios
                    </NativeSelectOption>
                    <NativeSelectOption value="video">
                      Vídeos
                    </NativeSelectOption>
                    <NativeSelectOption value="document">
                      Documentos e outros
                    </NativeSelectOption>
                  </NativeSelect>
                  <NativeSelect
                    className="w-full sm:w-fit"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                    aria-label="Ordenar arquivos"
                  >
                    <NativeSelectOption value="recent">
                      Mais recentes
                    </NativeSelectOption>
                    <NativeSelectOption value="name">
                      Nome A–Z
                    </NativeSelectOption>
                    <NativeSelectOption value="size">
                      Maior tamanho
                    </NativeSelectOption>
                  </NativeSelect>
                  <div className="col-span-2 flex items-center justify-self-end rounded-lg border bg-card p-0.5 sm:col-auto">
                    <button
                      onClick={() => setView('grid')}
                      className={`grid size-8 place-items-center rounded-md transition ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      aria-label="Visualização em grade"
                      aria-pressed={view === 'grid'}
                    >
                      <Grid2X2 className="size-4" />
                    </button>
                    <button
                      onClick={() => setView('list')}
                      className={`grid size-8 place-items-center rounded-md transition ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      aria-label="Visualização em lista"
                      aria-pressed={view === 'list'}
                    >
                      <List className="size-4" />
                    </button>
                  </div>
                </div>
              </div>

              {loadError ? (
                <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-card/50 px-6 text-center">
                  <div>
                    <div className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
                      <CloudOff className="size-5" />
                    </div>
                    <p className="mt-3 font-semibold">
                      Não conseguimos carregar seus arquivos
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {loadError}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={refreshAll}
                    >
                      <RefreshCw /> Tentar novamente
                    </Button>
                  </div>
                </div>
              ) : loading && !files.length ? (
                <LoadingGrid />
              ) : files.length ? (
                <div
                  className={
                    view === 'grid'
                      ? 'file-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'
                      : 'grid gap-2'
                  }
                >
                  {files.map((file) => (
                    <DocumentCard
                      key={file.id}
                      file={file}
                      compact={view === 'list'}
                      onPreview={() => setPreviewFile(file)}
                      onFavorite={() => toggleFavorite(file)}
                      onRename={() => openFileEdit(file, 'rename')}
                      onMove={() => openFileEdit(file, 'move')}
                      onTrash={() => moveToTrash(file)}
                      onRestore={() => restoreFile(file)}
                      onDelete={() => setPermanentDelete(file)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={emptyText}
                  showUpload={active !== 'trash' && !query}
                  onUpload={openUploadDialog}
                  onClear={() => setQuery('')}
                  query={query}
                />
              )}
            </section>
          </div>
        </div>

        <nav
          className="mobile-bottom-nav fixed inset-x-3 z-30 grid grid-cols-5 rounded-2xl border bg-background/94 p-1.5 shadow-[0_14px_40px_rgb(20_26_24/16%)] backdrop-blur-xl lg:hidden"
          aria-label="Navegação móvel"
        >
          <MobileNavItem
            icon={Home}
            label="Início"
            active={active === 'home'}
            onClick={() => navigate('home')}
          />
          <MobileNavItem
            icon={Search}
            label="Buscar"
            active={Boolean(query)}
            onClick={() => searchRef.current?.focus()}
          />
          <button
            onClick={openUploadDialog}
            className="mx-auto grid size-12 -translate-y-3 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"
            aria-label="Adicionar arquivos"
          >
            <Plus className="size-5" />
          </button>
          <MobileNavItem
            icon={Star}
            label="Favoritos"
            active={active === 'favorites'}
            onClick={() => navigate('favorites')}
          />
          <MobileNavItem
            icon={Settings}
            label="Ajustes"
            active={false}
            onClick={() => setSettingsOpen(true)}
          />
        </nav>

        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent
            side="left"
            className="w-[min(86vw,340px)] overflow-y-auto bg-sidebar p-4"
            showCloseButton
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menu do Arquiva</SheetTitle>
              <SheetDescription>
                Navegue entre seus arquivos e pastas.
              </SheetDescription>
            </SheetHeader>
            <NavigationPanel
              folders={folders}
              active={active}
              usage={usage}
              storageRefreshing={storageRefreshing}
              onRefreshStorage={() => void loadStorage().catch(() => undefined)}
              onNavigate={navigate}
              onUpload={() => {
                setMobileMenuOpen(false);
                openUploadDialog();
              }}
              onCreateFolder={() => {
                setMobileMenuOpen(false);
                openFolderDialog();
              }}
              onEditFolder={(folder) => {
                setMobileMenuOpen(false);
                openFolderDialog(folder);
              }}
              onDeleteFolder={(folder) => {
                setMobileMenuOpen(false);
                requestDeleteFolder(folder);
              }}
              onSettings={() => {
                setMobileMenuOpen(false);
                setSettingsOpen(true);
              }}
            />
          </SheetContent>
        </Sheet>

        <UploadDialog
          open={uploadOpen}
          onOpenChange={(open) => !uploading && setUploadOpen(open)}
          queue={uploadQueue}
          setQueue={setUploadQueue}
          folders={folders}
          folderId={uploadFolderId}
          setFolderId={setUploadFolderId}
          uploading={uploading}
          progress={uploadProgress}
          onPick={() => fileInputRef.current?.click()}
          onCapturePhoto={() => cameraInputRef.current?.click()}
          onDrop={addToUploadQueue}
          onSend={sendUploads}
          onCreateFolder={createFolderFromUpload}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            addToUploadQueue(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            addToUploadQueue(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        <FolderDialog
          open={folderOpen}
          onOpenChange={changeFolderDialogOpen}
          editing={editingFolder}
          name={folderName}
          setName={setFolderName}
          color={folderColor}
          setColor={setFolderColor}
          onSave={saveFolder}
          onDelete={() => editingFolder && requestDeleteFolder(editingFolder)}
          saving={folderSaving}
        />
        <FolderDeleteDialog
          folder={folderToDelete}
          deleting={folderDeleting}
          onClose={() => !folderDeleting && setFolderToDelete(null)}
          onDelete={deleteFolder}
        />
        <PreviewDialog
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onFavorite={() => previewFile && toggleFavorite(previewFile)}
          onRename={() => previewFile && openFileEdit(previewFile, 'rename')}
          onMove={() => previewFile && openFileEdit(previewFile, 'move')}
          onTrash={() => previewFile && moveToTrash(previewFile)}
          onRestore={() => previewFile && restoreFile(previewFile)}
        />
        <FileEditDialog
          file={editFile}
          mode={editMode}
          onClose={() => setEditFile(null)}
          name={editName}
          setName={setEditName}
          folderId={editFolderId}
          setFolderId={setEditFolderId}
          folders={folders}
          onSave={saveFileEdit}
        />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          theme={theme}
          setTheme={setTheme}
          accent={accent}
          setAccent={setAccent}
          view={view}
          setView={setView}
          density={density}
          setDensity={setDensity}
          user={user}
          loggingOut={loggingOut}
          onLogout={logout}
        />
        <DeleteDialog
          file={permanentDelete}
          onClose={() => setPermanentDelete(null)}
          onDelete={deleteForever}
        />
        <Toaster />
      </main>
    </div>
  );
}

function NavigationPanel({
  folders,
  active,
  usage,
  storageRefreshing,
  onRefreshStorage,
  onNavigate,
  onUpload,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onSettings,
}: {
  folders: FolderItem[];
  active: string;
  usage: Usage;
  storageRefreshing: boolean;
  onRefreshStorage: () => void;
  onNavigate: (destination: string) => void;
  onUpload: () => void;
  onCreateFolder: () => void;
  onEditFolder: (folder: FolderItem) => void;
  onDeleteFolder: (folder: FolderItem) => void;
  onSettings: () => void;
}) {
  const usagePercent = usage.limitBytes
    ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100)
    : 0;
  return (
    <>
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Archive className="size-5" />
        </div>
        <div>
          <p className="text-[17px] font-semibold leading-none tracking-[-0.03em]">
            Arquiva
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Seu espaço organizado
          </p>
        </div>
      </div>
      <Button
        size="lg"
        className="h-11 justify-start gap-2.5 rounded-xl px-3 shadow-sm"
        onClick={onUpload}
      >
        <Plus className="size-[18px]" />
        Adicionar arquivos
      </Button>
      <nav className="mt-6 space-y-1" aria-label="Navegação principal">
        <SidebarItem
          icon={Home}
          label="Início"
          active={active === 'home'}
          onClick={() => onNavigate('home')}
        />
        <SidebarItem
          icon={Clock3}
          label="Recentes"
          active={active === 'recent'}
          onClick={() => onNavigate('recent')}
        />
        <SidebarItem
          icon={Star}
          label="Favoritos"
          active={active === 'favorites'}
          onClick={() => onNavigate('favorites')}
        />
      </nav>
      <div className="mt-7 flex items-center justify-between px-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          Pastas
        </p>
        <button
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-primary transition hover:bg-sidebar-accent"
          onClick={onCreateFolder}
        >
          <Plus className="size-3.5" /> Nova
        </button>
      </div>
      <nav
        className="mt-2 max-h-[32vh] space-y-1 overflow-y-auto"
        aria-label="Pastas"
      >
        {folders.map((folder) => (
          <SidebarFolderItem
            key={folder.id}
            folder={folder}
            active={active === `folder:${folder.id}`}
            onClick={() => onNavigate(`folder:${folder.id}`)}
            onEdit={() => onEditFolder(folder)}
            onDelete={() => onDeleteFolder(folder)}
          />
        ))}
      </nav>
      <div className="mt-auto space-y-1 pt-5">
        <SidebarItem
          icon={Trash2}
          label="Lixeira"
          active={active === 'trash'}
          onClick={() => onNavigate('trash')}
        />
        <SidebarItem
          icon={Settings}
          label="Configurações"
          onClick={onSettings}
        />
        <div className="mt-4 rounded-2xl border border-sidebar-border bg-background/70 p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <HardDrive className="size-3.5" /> Armazenamento
            </span>
            <button
              type="button"
              onClick={onRefreshStorage}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Atualizar espaço do Google Drive"
              title="Atualizar agora"
            >
              <RefreshCw
                className={`size-3.5 ${storageRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          <p className="mt-2 text-sm font-semibold" aria-live="polite">
            {usage.unlimited
              ? 'Espaço ilimitado'
              : usage.availableBytes === null
                ? 'Consultando o Drive…'
                : `${formatBytes(usage.availableBytes)} disponíveis`}
          </p>
          {usage.limitBytes !== null && (
            <>
              <Progress value={usagePercent} className="mt-2 gap-0" />
              <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                {formatBytes(usage.usedBytes)} usados de{' '}
                {formatBytes(usage.limitBytes)} na conta Google.
              </p>
            </>
          )}
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {formatBytes(usage.managedBytes)} em {usage.fileCount} arquivo
            {usage.fileCount === 1 ? '' : 's'} do Arquiva. Atualização
            automática a cada 15 segundos.
          </p>
        </div>
      </div>
    </>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-sm transition ${active ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}
    >
      <Icon className="size-[18px]" />
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

function SidebarFolderItem({
  folder,
  active,
  onClick,
  onEdit,
  onDelete,
}: {
  folder: FolderItem;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex h-10 items-center rounded-xl transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}
    >
      <button
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center gap-3 self-stretch px-2.5 text-sm ${active ? 'font-semibold' : ''}`}
      >
        <Folder className="size-[18px] shrink-0" />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {folder.count}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-1 shrink-0"
              aria-label={`Gerenciar pasta ${folder.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onClick={onClick}>
            <Folder /> Abrir pasta
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> Renomear e personalizar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Excluir pasta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CreateFolderCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      onClick={onCreate}
      className="group flex min-h-[116px] flex-col items-start justify-between rounded-2xl border border-dashed border-primary/35 bg-primary/[0.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/[0.07]"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        <FolderPlus className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold">Criar nova pasta</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Dê um nome e escolha uma cor
        </span>
      </span>
    </button>
  );
}

function FolderCard({
  folder,
  onOpen,
  onEdit,
  onDelete,
}: {
  folder: FolderItem;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = folderIcon[folder.color] ?? Folder;
  return (
    <article className="group relative flex min-h-[116px] flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_1px_rgb(20_26_24/3%)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_10px_30px_rgb(20_26_24/7%)]">
      <button
        onClick={onOpen}
        className="absolute inset-0 rounded-2xl"
        aria-label={`Abrir pasta ${folder.name}`}
      />
      <div className="relative z-[1] flex items-start justify-between pointer-events-none">
        <div className={`folder-icon folder-icon--${folder.color}`}>
          <Icon className="size-5" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="pointer-events-auto size-10 sm:size-7"
                aria-label={`Opções da pasta ${folder.name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={onOpen}>
              <Folder /> Abrir pasta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Renomear e personalizar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Excluir pasta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pointer-events-none relative z-[1] mt-auto flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{folder.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {folder.count} arquivo{folder.count === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
    </article>
  );
}

function DocumentCard({
  file,
  compact,
  onPreview,
  onFavorite,
  onRename,
  onMove,
  onTrash,
  onRestore,
  onDelete,
}: {
  file: StoredFile;
  compact: boolean;
  onPreview: () => void;
  onFavorite: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const Icon = iconForFile(file);
  const menu = (
    <FileMenu
      file={file}
      onPreview={onPreview}
      onFavorite={onFavorite}
      onRename={onRename}
      onMove={onMove}
      onTrash={onTrash}
      onRestore={onRestore}
      onDelete={onDelete}
    />
  );
  if (compact)
    return (
      <article className="group flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/25 hover:bg-muted/40">
        <button
          onClick={onPreview}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {kindLabel(file)} · {formatBytes(file.size)}
              {file.folderName ? ` · ${file.folderName}` : ''}
            </p>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">
            {formatDate(file.updatedAt)}
          </span>
        </button>
        {file.favorite && (
          <Star
            className="size-4 fill-current text-amber-500"
            aria-label="Favorito"
          />
        )}
        {menu}
      </article>
    );
  return (
    <article className="document-card group overflow-hidden rounded-2xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_34px_rgb(20_26_24/8%)]">
      <button
        onClick={onPreview}
        className="preview relative block aspect-[1.56/1] w-full overflow-hidden border-b text-left"
        aria-label={`Pré-visualizar ${file.name}`}
      >
        <FilePreview file={file} />
        <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
          {kindLabel(file)}
        </span>
        {file.favorite && (
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-background/85 text-amber-500 shadow-sm backdrop-blur">
            <Star className="size-3.5 fill-current" />
          </span>
        )}
      </button>
      <div className="flex gap-3 p-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <Icon className="size-[18px] text-primary" />
        </div>
        <button onClick={onPreview} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold" title={file.name}>
            {file.name}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatBytes(file.size)} · {formatDate(file.updatedAt)}
          </p>
        </button>
        {menu}
      </div>
    </article>
  );
}

function FileMenu({
  file,
  onPreview,
  onFavorite,
  onRename,
  onMove,
  onTrash,
  onRestore,
  onDelete,
}: {
  file: StoredFile;
  onPreview: () => void;
  onFavorite: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-10 shrink-0 opacity-100 sm:size-7 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Mais opções para ${file.name}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={onPreview}>
          <Search /> Pré-visualizar
        </DropdownMenuItem>
        {file.trashedAt ? (
          <>
            <DropdownMenuItem onClick={onRestore}>
              <RotateCcw /> Restaurar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Excluir definitivamente
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onFavorite}>
              <Star /> {file.favorite ? 'Remover dos favoritos' : 'Favoritar'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <Move /> Mover para pasta
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => openNewTab(file.downloadUrl, file.name)}
            >
              <Download /> Baixar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onTrash}>
              <Trash2 /> Mover para Lixeira
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilePreview({ file }: { file: StoredFile }) {
  if (file.kind === 'image') return <ImageThumbnail file={file} />;
  const Icon = iconForFile(file);
  if (file.kind === 'pdf')
    return (
      <div className="paper-preview paper-preview--proposal" aria-hidden="true">
        <span className="paper-kicker" />
        <span className="paper-title" />
        <span className="paper-line paper-line--wide" />
        <span className="paper-line" />
        <span className="paper-block" />
      </div>
    );
  return (
    <div className="generic-preview" aria-hidden="true">
      <Icon className="size-10" />
      <span>{kindLabel(file)}</span>
    </div>
  );
}

function ImageThumbnail({ file }: { file: StoredFile }) {
  const preview = useAuthenticatedObjectUrl(file.contentUrl);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => setDecodeFailed(false), [file.id]);
  if (preview.failed || decodeFailed)
    return (
      <div className="generic-preview" aria-hidden="true">
        <FileImage className="size-10" />
        <span>Imagem</span>
      </div>
    );
  if (preview.loading || !preview.objectUrl)
    return (
      <div className="generic-preview" aria-hidden="true">
        <RefreshCw className="size-6 animate-spin" />
        <span>Carregando</span>
      </div>
    );
  return (
    <img
      src={preview.objectUrl}
      alt=""
      className="absolute inset-0 size-full object-cover"
      loading="lazy"
      onError={() => setDecodeFailed(true)}
    />
  );
}

function UploadDialog({
  open,
  onOpenChange,
  queue,
  setQueue,
  folders,
  folderId,
  setFolderId,
  uploading,
  progress,
  onPick,
  onCapturePhoto,
  onDrop,
  onSend,
  onCreateFolder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: File[];
  setQueue: React.Dispatch<React.SetStateAction<File[]>>;
  folders: FolderItem[];
  folderId: string;
  setFolderId: (id: string) => void;
  uploading: boolean;
  progress: number;
  onPick: () => void;
  onCapturePhoto: () => void;
  onDrop: (files: File[]) => void;
  onSend: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar arquivos</DialogTitle>
          <DialogDescription>
            Escolha qualquer tipo de arquivo — até 25 MB por item. Imagens,
            PDFs, textos, áudios e vídeos compatíveis ganham prévia.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDrop(Array.from(event.dataTransfer.files));
          }}
          className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-primary/35 bg-primary/[0.045] p-6 text-center"
        >
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ArrowDownToLine className="size-5" />
            </div>
            <p className="mt-3 text-sm font-semibold">
              Arraste seus arquivos para cá
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ou escolha no seu dispositivo
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={onPick}
                disabled={uploading}
              >
                <Upload /> Escolher arquivos
              </Button>
              <Button
                variant="outline"
                className="h-11 sm:hidden"
                onClick={onCapturePhoto}
                disabled={uploading}
              >
                <Camera /> Tirar foto
              </Button>
            </div>
          </div>
        </div>
        {queue.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Selecionados ({queue.length})
              </p>
              {!uploading && (
                <button
                  onClick={() => setQueue([])}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {queue.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-lg bg-muted/65 p-2"
                >
                  <FileText className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  {!uploading && (
                    <button
                      onClick={() =>
                        setQueue((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={`Remover ${file.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="upload-folder" className="text-sm font-medium">
              Salvar na pasta
            </label>
            <button
              type="button"
              onClick={onCreateFolder}
              disabled={uploading}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              <FolderPlus className="size-3.5" /> Criar pasta
            </button>
          </div>
          <NativeSelect
            id="upload-folder"
            className="w-full"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            disabled={uploading}
          >
            <NativeSelectOption value="">Sem pasta</NativeSelectOption>
            {folders.map((folder) => (
              <NativeSelectOption key={folder.id} value={folder.id}>
                {folder.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {uploading && (
          <Progress value={progress}>
            <ProgressLabel>Enviando arquivos…</ProgressLabel>
            <ProgressValue>{() => `${progress}%`}</ProgressValue>
          </Progress>
        )}
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={uploading} />}
          >
            Cancelar
          </DialogClose>
          <Button onClick={onSend} disabled={!queue.length || uploading}>
            {uploading ? (
              <>
                <RefreshCw className="animate-spin" /> Enviando
              </>
            ) : (
              <>
                <Upload /> Enviar {queue.length || ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderDialog({
  open,
  onOpenChange,
  editing,
  name,
  setName,
  color,
  setColor,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FolderItem | null;
  name: string;
  setName: (name: string) => void;
  color: FolderItem['color'];
  setColor: (color: FolderItem['color']) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar pasta' : 'Criar nova pasta'}
          </DialogTitle>
          <DialogDescription>
            Dê um nome claro e escolha uma cor para reconhecê-la rapidamente.
          </DialogDescription>
        </DialogHeader>
        <label
          htmlFor="folder-name"
          className="grid gap-1.5 text-sm font-medium"
        >
          Nome
          <Input
            id="folder-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            maxLength={60}
            placeholder="Ex.: Projetos 2026"
            onKeyDown={(event) => event.key === 'Enter' && onSave()}
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Cor</legend>
          <div className="grid grid-cols-4 gap-2">
            {(['mint', 'peach', 'lilac', 'sky'] as const).map((tone) => (
              <button
                key={tone}
                onClick={() => setColor(tone)}
                disabled={saving}
                className={`relative grid h-11 place-items-center rounded-xl border-2 transition ${color === tone ? 'border-primary' : 'border-transparent bg-muted'}`}
                aria-label={`Usar cor ${tone}`}
                aria-pressed={color === tone}
              >
                <span className={`folder-icon folder-icon--${tone} !size-7`}>
                  <Folder className="size-4" />
                </span>
                {color === tone && (
                  <Check className="absolute right-1 top-1 size-3.5 text-primary" />
                )}
              </button>
            ))}
          </div>
        </fieldset>
        <DialogFooter>
          {editing && (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={saving}
              className="sm:mr-auto"
            >
              <Trash2 /> Excluir pasta
            </Button>
          )}
          <DialogClose render={<Button variant="outline" disabled={saving} />}>
            Cancelar
          </DialogClose>
          <Button onClick={onSave} disabled={!name.trim() || saving}>
            {saving ? (
              <>
                <RefreshCw className="animate-spin" /> Salvando
              </>
            ) : editing ? (
              'Salvar alterações'
            ) : (
              'Criar pasta'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderDeleteDialog({
  folder,
  deleting,
  onClose,
  onDelete,
}: {
  folder: FolderItem | null;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={Boolean(folder)} onOpenChange={(open) => !open && onClose()}>
      {folder && (
        <DialogContent>
          <DialogHeader>
            <div className="mb-1 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 />
            </div>
            <DialogTitle>Excluir “{folder.name}”?</DialogTitle>
            <DialogDescription>
              A pasta será removida. Seus {folder.count}{' '}
              {folder.count === 1
                ? 'arquivo continuará'
                : 'arquivos continuarão'}{' '}
              guardados e aparecerão em Início, sem pasta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={deleting} />}
            >
              Cancelar
            </DialogClose>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <RefreshCw className="animate-spin" /> Excluindo
                </>
              ) : (
                <>
                  <Trash2 /> Excluir pasta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function PreviewDialog({
  file,
  onClose,
  onFavorite,
  onRename,
  onMove,
  onTrash,
  onRestore,
}: {
  file: StoredFile | null;
  onClose: () => void;
  onFavorite: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrash: () => void;
  onRestore: () => void;
}) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      {file && (
        <DialogContent
          className="h-[min(90dvh,780px)] max-w-[min(94vw,1080px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0"
          showCloseButton
        >
          <DialogHeader className="border-b px-5 py-4 pr-14">
            <DialogTitle className="truncate">{file.name}</DialogTitle>
            <DialogDescription>
              {kindLabel(file)} · {formatBytes(file.size)} ·{' '}
              {formatDate(file.updatedAt)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 place-items-center overflow-hidden bg-muted/55 p-3 sm:p-6">
            <PreviewContent file={file} />
          </div>
          <div className="flex max-h-[34dvh] flex-wrap items-center gap-2 overflow-y-auto border-t bg-card px-4 py-3">
            <Button
              variant="outline"
              onClick={() => openNewTab(file.contentUrl)}
            >
              <ExternalLink /> Abrir original
            </Button>
            <Button
              variant="outline"
              onClick={() => openNewTab(file.downloadUrl, file.name)}
            >
              <Download /> Baixar
            </Button>
            {file.trashedAt ? (
              <>
                <Button variant="outline" onClick={onRestore}>
                  <RotateCcw /> Restaurar
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant={file.favorite ? 'secondary' : 'outline'}
                  onClick={onFavorite}
                >
                  <Star className={file.favorite ? 'fill-current' : ''} />{' '}
                  {file.favorite ? 'Favorito' : 'Favoritar'}
                </Button>
                <Button variant="outline" onClick={onRename}>
                  <Pencil /> Renomear
                </Button>
                <Button variant="outline" onClick={onMove}>
                  <Move /> Mover
                </Button>
                <Button
                  variant="destructive"
                  className="sm:ml-auto"
                  onClick={onTrash}
                >
                  <Trash2 /> Lixeira
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function PreviewContent({ file }: { file: StoredFile }) {
  if (file.kind === 'image') return <ImageViewer file={file} />;
  if (file.kind === 'pdf') return <PdfViewer file={file} />;
  if (file.kind === 'text') return <TextViewer file={file} />;
  if (file.kind === 'video') return <VideoViewer file={file} />;
  if (file.kind === 'audio') return <AudioViewer file={file} />;
  return <UnsupportedPreview file={file} />;
}

function PdfViewer({ file }: { file: StoredFile }) {
  const preview = useAuthenticatedObjectUrl(file.contentUrl);
  if (preview.failed)
    return (
      <UnsupportedPreview
        file={file}
        description="O PDF foi guardado, mas não foi possível carregar a prévia."
      />
    );
  if (preview.loading || !preview.objectUrl)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" /> Preparando PDF…
      </div>
    );
  return (
    <iframe
      src={preview.objectUrl}
      title={`Pré-visualização de ${file.name}`}
      sandbox=""
      className="size-full rounded-lg border bg-white"
    />
  );
}

function ImageViewer({ file }: { file: StoredFile }) {
  const preview = useAuthenticatedObjectUrl(file.contentUrl);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => setDecodeFailed(false), [file.id]);
  if (preview.failed || decodeFailed)
    return (
      <UnsupportedPreview
        file={file}
        description="A imagem foi guardada, mas este formato não pode ser exibido neste navegador."
      />
    );
  if (preview.loading || !preview.objectUrl)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" /> Preparando imagem…
      </div>
    );
  return (
    <img
      src={preview.objectUrl}
      alt={`Pré-visualização de ${file.name}`}
      className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
      onError={() => setDecodeFailed(true)}
    />
  );
}

function VideoViewer({ file }: { file: StoredFile }) {
  const preview = useAuthenticatedObjectUrl(file.contentUrl);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => setDecodeFailed(false), [file.id]);
  if (preview.failed || decodeFailed)
    return (
      <UnsupportedPreview
        file={file}
        description="O vídeo foi guardado, mas o codec não é compatível com este navegador."
      />
    );
  if (preview.loading || !preview.objectUrl)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" /> Preparando vídeo…
      </div>
    );
  return (
    <video
      src={preview.objectUrl}
      controls
      preload="metadata"
      className="max-h-full max-w-full rounded-lg"
      onError={() => setDecodeFailed(true)}
    />
  );
}

function AudioViewer({ file }: { file: StoredFile }) {
  const preview = useAuthenticatedObjectUrl(file.contentUrl);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => setDecodeFailed(false), [file.id]);
  if (preview.failed || decodeFailed)
    return (
      <UnsupportedPreview
        file={file}
        description="O áudio foi guardado, mas o codec não é compatível com este navegador."
      />
    );
  if (preview.loading || !preview.objectUrl)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" /> Preparando áudio…
      </div>
    );
  return (
    <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <FileAudio className="size-8" />
      </div>
      <p className="mt-4 truncate font-semibold">{file.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatBytes(file.size)} · pronto para ouvir
      </p>
      <audio
        src={preview.objectUrl}
        controls
        preload="metadata"
        className="mt-5 w-full"
        onError={() => setDecodeFailed(true)}
      />
    </div>
  );
}

function TextViewer({ file }: { file: StoredFile }) {
  const [content, setContent] = useState('');
  const [loadingText, setLoadingText] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setContent('');
    setFailed(false);
    setLoadingText(true);
    apiFetch(file.contentUrl, {
      headers: { Range: `bytes=0-${MAX_TEXT_PREVIEW_BYTES - 1}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao abrir texto');
        return response.text();
      })
      .then(setContent)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setFailed(true);
      })
      .finally(() => setLoadingText(false));
    return () => controller.abort();
  }, [file.contentUrl, file.id]);

  if (failed)
    return (
      <UnsupportedPreview
        file={file}
        description="O arquivo foi guardado, mas não foi possível carregar a prévia de texto."
      />
    );
  if (loadingText)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" /> Preparando prévia…
      </div>
    );
  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {file.size > MAX_TEXT_PREVIEW_BYTES && (
        <p className="border-b bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
          Mostrando o início do arquivo. Baixe para ver o conteúdo completo.
        </p>
      )}
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-foreground sm:text-sm">
        {content}
      </pre>
    </div>
  );
}

function FileEditDialog({
  file,
  mode,
  onClose,
  name,
  setName,
  folderId,
  setFolderId,
  folders,
  onSave,
}: {
  file: StoredFile | null;
  mode: EditMode;
  onClose: () => void;
  name: string;
  setName: (name: string) => void;
  folderId: string;
  setFolderId: (id: string) => void;
  folders: FolderItem[];
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      {file && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'rename' ? 'Renomear arquivo' : 'Mover para pasta'}
            </DialogTitle>
            <DialogDescription className="truncate">
              {file.name}
            </DialogDescription>
          </DialogHeader>
          {mode === 'rename' ? (
            <label
              htmlFor="file-name"
              className="grid gap-1.5 text-sm font-medium"
            >
              Novo nome
              <Input
                id="file-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                onKeyDown={(event) => event.key === 'Enter' && onSave()}
              />
            </label>
          ) : (
            <label
              htmlFor="file-folder"
              className="grid gap-1.5 text-sm font-medium"
            >
              Destino
              <NativeSelect
                id="file-folder"
                className="w-full"
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
              >
                <NativeSelectOption value="">Sem pasta</NativeSelectOption>
                {folders.map((folder) => (
                  <NativeSelectOption key={folder.id} value={folder.id}>
                    {folder.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              onClick={onSave}
              disabled={mode === 'rename' && !name.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  theme,
  setTheme,
  accent,
  setAccent,
  view,
  setView,
  density,
  setDensity,
  user,
  loggingOut,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  density: Density;
  setDensity: (density: Density) => void;
  user: AuthUser;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            Personalize o Arquiva neste dispositivo.
          </DialogDescription>
        </DialogHeader>
        <section className="rounded-2xl border bg-muted/45 p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {accountInitials(user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <ShieldCheck className="size-4 text-primary" /> Conta protegida
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              disabled={loggingOut}
            >
              <LogOut /> {loggingOut ? 'Saindo…' : 'Sair'}
            </Button>
          </div>
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sun className="size-4" /> Aparência
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'light', label: 'Claro', icon: Sun },
                { value: 'dark', label: 'Escuro', icon: Moon },
                { value: 'system', label: 'Sistema', icon: Monitor },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                onClick={() => setTheme(item.value)}
                className={`grid min-h-20 place-items-center rounded-xl border p-2 text-xs font-medium transition ${theme === item.value ? 'border-primary bg-primary/7 text-primary' : 'bg-card hover:bg-muted'}`}
              >
                <item.icon className="size-5" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Palette className="size-4" /> Cor principal
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'forest', label: 'Floresta', color: '#247a60' },
                { value: 'ocean', label: 'Oceano', color: '#2675a8' },
                { value: 'grape', label: 'Uva', color: '#7455a7' },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                onClick={() => setAccent(item.value)}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-medium transition ${accent === item.value ? 'border-primary bg-primary/7' : 'bg-card hover:bg-muted'}`}
              >
                <span
                  className="size-4 rounded-full"
                  style={{ background: item.color }}
                />
                {item.label}
                {accent === item.value && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Grid2X2 className="size-4" /> Organização
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <SettingChoice
              active={view === 'grid'}
              icon={Grid2X2}
              label="Grade"
              onClick={() => setView('grid')}
            />
            <SettingChoice
              active={view === 'list'}
              icon={List}
              label="Lista"
              onClick={() => setView('list')}
            />
            <SettingChoice
              active={density === 'comfortable'}
              icon={ArrowUpDown}
              label="Confortável"
              onClick={() => setDensity('comfortable')}
            />
            <SettingChoice
              active={density === 'compact'}
              icon={Archive}
              label="Compacto"
              onClick={() => setDensity('compact')}
            />
          </div>
        </section>
        <div className="rounded-xl border bg-muted/55 p-3 text-xs leading-5 text-muted-foreground">
          <Info className="mr-1 inline size-3.5" /> Suas preferências ficam
          salvas somente neste dispositivo. Arquivos e pastas ficam protegidos
          no Google Drive e separados por conta.
        </div>
        <DialogFooter>
          <DialogClose render={<Button />}>Concluir</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  file,
  onClose,
  onDelete,
}: {
  file: StoredFile | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      {file && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir definitivamente?</DialogTitle>
            <DialogDescription>
              “{file.name}” será apagado do armazenamento. Esta ação não pode
              ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 /> Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function SettingChoice({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Grid2X2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-medium transition ${active ? 'border-primary bg-primary/7 text-primary' : 'bg-card hover:bg-muted'}`}
    >
      <Icon className="size-4" />
      {label}
      {active && <Check className="size-3.5" />}
    </button>
  );
}

function MobileNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}
    >
      <Icon className="size-[19px]" />
      <span>{label}</span>
    </button>
  );
}

function LoadingGrid() {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Carregando arquivos"
    >
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="overflow-hidden rounded-2xl border bg-card">
          <div className="aspect-[1.56/1] animate-pulse bg-muted" />
          <div className="flex gap-3 p-3.5">
            <div className="size-9 animate-pulse rounded-lg bg-muted" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-2/5 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  showUpload,
  onUpload,
  onClear,
  query,
}: {
  title: string;
  showUpload: boolean;
  onUpload: () => void;
  onClear: () => void;
  query: string;
}) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed bg-card/45 px-6 text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/9 text-primary">
          {query ? (
            <Search className="size-5" />
          ) : (
            <FileArchive className="size-5" />
          )}
        </div>
        <p className="mt-3 font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
          {query
            ? 'Tente outro termo ou remova os filtros.'
            : showUpload
              ? 'Adicione fotos, PDFs e outros documentos para começar.'
              : 'Nada para fazer por aqui.'}
        </p>
        {query ? (
          <Button variant="outline" className="mt-4" onClick={onClear}>
            Limpar busca
          </Button>
        ) : (
          showUpload && (
            <Button className="mt-4" onClick={onUpload}>
              <Upload /> Adicionar primeiro arquivo
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function UnsupportedPreview({
  file,
  description = 'O arquivo está guardado, mas este formato não possui prévia neste navegador.',
}: {
  file: StoredFile;
  description?: string;
}) {
  const Icon = iconForFile(file);
  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-7 text-center shadow-sm">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" />
      </div>
      <p className="mt-4 truncate font-semibold">{file.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => openNewTab(file.contentUrl)}>
          <ExternalLink /> Abrir original
        </Button>
        <Button onClick={() => openNewTab(file.downloadUrl, file.name)}>
          <Download /> Baixar arquivo
        </Button>
      </div>
    </div>
  );
}

function iconForFile(file: StoredFile) {
  if (file.kind === 'image') return FileImage;
  if (file.kind === 'pdf' || file.kind === 'text') return FileText;
  if (file.kind === 'video') return FileVideo;
  if (file.kind === 'audio') return FileAudio;
  if (file.kind === 'spreadsheet') return FileSpreadsheet;
  if (file.kind === 'presentation') return Presentation;
  if (file.kind === 'archive') return FileArchive;
  return File;
}

function kindLabel(file: StoredFile) {
  if (file.kind === 'image') return 'Imagem';
  if (file.kind === 'pdf') return 'PDF';
  if (file.kind === 'video') return 'Vídeo';
  if (file.kind === 'audio') return 'Áudio';
  if (file.kind === 'text') return 'Texto';
  if (file.kind === 'spreadsheet') return 'Planilha';
  if (file.kind === 'presentation') return 'Apresentação';
  if (file.kind === 'archive') return 'Arquivo compactado';
  return 'Documento';
}

function openNewTab(url: string, downloadName?: string) {
  void openAuthenticatedResource(url, { downloadName }).catch((error) =>
    toast.add({
      title: downloadName
        ? 'Não foi possível baixar o arquivo'
        : 'Não foi possível abrir o arquivo',
      description: error instanceof Error ? error.message : undefined,
      type: 'error',
    }),
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit > 1 ? 1 : 0 }).format(bytes / 1024 ** unit)} ${units[unit]}`;
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString())
    return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return date
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');
}
