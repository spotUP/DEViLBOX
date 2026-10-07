/**
 * What the load dialog remembers between openings: the source tab, the folder,
 * the scroll position inside each folder, and the Online (Modland / HVSC)
 * search with its results. A per-viewer convenience: localStorage, every
 * access wrapped, and the dialog works the same without it (the in-memory copy
 * still serves the current page when storage is blocked).
 */

const KEY = 'dvbx_file_browser_memory_v1';
const MAX_REMEMBERED_RESULTS = 500;
const MAX_REMEMBERED_SCROLLS = 200;

export type RememberedFileSource = 'demo' | 'cloud' | 'online' | 'modland' | 'hvsc';

export interface OnlineMemory {
  query: string;
  source: 'all' | 'modland' | 'hvsc';
  format: string;
  results: unknown[];
  offset: number;
  hasMore: boolean;
}

export interface FileBrowserMemory {
  fileSource: RememberedFileSource;
  currentPath: string;
  electronDirectory: string | null;
  scroll: Record<string, number>;
  online: OnlineMemory | null;
}

const EMPTY: FileBrowserMemory = {
  fileSource: 'demo',
  currentPath: '',
  electronDirectory: null,
  scroll: {},
  online: null,
};

let fallback: FileBrowserMemory = { ...EMPTY, scroll: {} };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function readFileBrowserMemory(): FileBrowserMemory {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p: unknown = JSON.parse(raw);
    if (!isRecord(p)) return fallback;
    return {
      fileSource: typeof p.fileSource === 'string' ? (p.fileSource as RememberedFileSource) : 'demo',
      currentPath: typeof p.currentPath === 'string' ? p.currentPath : '',
      electronDirectory: typeof p.electronDirectory === 'string' ? p.electronDirectory : null,
      scroll: isRecord(p.scroll) ? (p.scroll as Record<string, number>) : {},
      online: isRecord(p.online) && Array.isArray(p.online.results) ? (p.online as unknown as OnlineMemory) : null,
    };
  } catch {
    return fallback;
  }
}

export function updateFileBrowserMemory(patch: Partial<FileBrowserMemory>): void {
  const next: FileBrowserMemory = { ...readFileBrowserMemory(), ...patch };
  const keys = Object.keys(next.scroll);
  if (keys.length > MAX_REMEMBERED_SCROLLS) {
    next.scroll = Object.fromEntries(keys.slice(-MAX_REMEMBERED_SCROLLS).map((k) => [k, next.scroll[k]]));
  }
  if (next.online && next.online.results.length > MAX_REMEMBERED_RESULTS) {
    next.online = { ...next.online, results: next.online.results.slice(0, MAX_REMEMBERED_RESULTS) };
  }
  fallback = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked or full: memory only */ }
}

export function scrollKey(fileSource: string, currentPath: string): string {
  return `${fileSource}:${currentPath}`;
}

export function rememberScroll(key: string, top: number): void {
  const mem = readFileBrowserMemory();
  if (mem.scroll[key] === top) return;
  updateFileBrowserMemory({ scroll: { ...mem.scroll, [key]: top } });
}

export function resetFileBrowserMemory(): void {
  fallback = { ...EMPTY, scroll: {} };
  try { localStorage.removeItem(KEY); } catch { /* ok */ }
}
