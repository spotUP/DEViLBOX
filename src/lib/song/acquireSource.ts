/**
 * acquireSource - read a song source (file, bytes, Modland path, URL) and the
 * partner files that travel with it. THE one place that fetches companions:
 * the Modland resolver (downloadUADECompanions) and the directory resolver
 * (gatherCompanions) are called from here and nowhere else in the open path,
 * so every way in hands the load the same set (plan 2026-10-07, U2.5). The
 * companions then travel WITH the load into the engine, which owns the set.
 */
import { directoryOfFile, gatherCompanions } from '@/lib/import/companionFetch';
import { setSongLoadPhase } from '@/stores/useSongLoadStore';
import type { SongSourceRef } from './openSong';

export type Companions = Map<string, ArrayBuffer>;

/** The partner files a Modland module needs, by the name UADE opens them under. */
export async function acquireModlandCompanions(path: string, bytes: ArrayBuffer): Promise<Companions | undefined> {
  const { downloadUADECompanions } = await import('@/lib/modlandApi');
  const found = await downloadUADECompanions(path, bytes);
  return found.length ? new Map(found.map((c) => [c.filename, c.buffer])) : undefined;
}

/** The partner files that sit beside a module in a directory the app can list (bundled songs, server folder). */
export async function acquireNeighbourCompanions(name: string, dir: string, bytes: ArrayBuffer): Promise<Companions | undefined> {
  const found = await gatherCompanions(name, dir, bytes);
  return found.size ? found : undefined;
}

/** `publishPhase` false for a deck open: it must not write into the editor's loading state. */
export async function acquire(src: SongSourceRef, publishPhase = true): Promise<{ file: File; companions?: Companions }> {
  const phase = (): void => { if (publishPhase) setSongLoadPhase('companions'); };
  switch (src.kind) {
    case 'prepared':
      return { file: src.file, companions: src.companions };
    case 'file':
      return { file: src.file, companions: src.companions };
    case 'bytes':
      return { file: new File([src.bytes], src.name, { type: 'application/octet-stream' }), companions: src.companions };
    case 'modland': {
      const { downloadModlandFile } = await import('@/lib/modlandApi');
      const bytes = await downloadModlandFile(src.path);
      phase();
      const name = src.path.split('/').pop() ?? 'song';
      return {
        file: new File([bytes], name, { type: 'application/octet-stream' }),
        companions: await acquireModlandCompanions(src.path, bytes),
      };
    }
    case 'url': {
      let bytes = src.bytes;
      if (!bytes) {
        const res = await fetch(src.url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.url}`);
        bytes = await res.arrayBuffer();
      }
      const name = src.name ?? src.url.split('/').pop() ?? 'song';
      phase();
      return {
        file: new File([bytes], name, { type: 'application/octet-stream' }),
        companions: await acquireNeighbourCompanions(name, directoryOfFile(src.url), bytes),
      };
    }
  }
}

/** Partner files in the shape the DJ render pipeline takes (DJPipeline.loadOrEnqueue, loadUADEToDeck). */
export function companionList(companions?: Companions): Array<{ filename: string; buffer: ArrayBuffer }> | undefined {
  return companions?.size ? Array.from(companions, ([filename, buffer]) => ({ filename, buffer })) : undefined;
}

/**
 * A deck load that renders from the bytes (the UADE pre-render path) needs the
 * file and its partner files but no parse here: loadUADEToDeck parses on a
 * cache miss, through the deck open. Same acquire, nothing written to the editor's load state.
 */
export async function acquireForDeck(src: SongSourceRef): Promise<{ name: string; bytes: ArrayBuffer; companions?: Array<{ filename: string; buffer: ArrayBuffer }> }> {
  const { file, companions } = await acquire(src, false);
  return { name: file.name, bytes: await file.arrayBuffer(), companions: companionList(companions) };
}
