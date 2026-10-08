/**
 * The 'engine-swap' live-edit route (G24): a native worklet engine whose module is not a table of cells it can write
 * (David Whittaker: tracks of commands, edited by splitting and moving them) takes the whole edited module while it plays.
 *
 * The module is the one the next play would load (editedModuleForPlay: the native export of the stores, run through the
 * parse a reload runs), so what is heard live is what Stop and Play would give. The engine's `swapModule(module, ...loadArgs)`
 * runs it silently up to the position already played and plays on from there: the song is not restarted.
 *
 * Edits arrive cell by cell; building the module costs an export and a parse and the swap a catch-up render, so a burst is
 * answered once: the last call builds, the ones it replaced return without building.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { NativeEngineDescriptor } from './wasmEngineRegistry';
import { editedModuleForPlay } from './editedModuleForPlay';

interface SwappableEngine { swapModule?(module: ArrayBuffer, ...loadArgs: unknown[]): void }

let latest = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Hand the playing engine the edited module. False when nothing was sent (no running engine, no edit, a newer call took over). */
export function applyEditedModuleToEngine(song: TrackerSong, desc: NativeEngineDescriptor): Promise<boolean> {
  const mine = ++latest;
  const run = async (): Promise<boolean> => {
    if (mine !== latest) return false;
    const Engine = desc.staticRef ?? (desc.dynamicResolver ? await desc.dynamicResolver() : null);
    if (!Engine?.hasInstance()) return false;
    const bytes = await editedModuleForPlay(song, desc);
    if (!bytes || mine !== latest) return false;
    const instance = Engine.getInstance() as unknown as SwappableEngine;
    if (!instance.swapModule) return false;
    const copy = (bytes instanceof Uint8Array ? bytes.slice().buffer : bytes.slice(0)) as ArrayBuffer;
    instance.swapModule(copy, ...(desc.getLoadArgs?.(song) ?? []));
    return true;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}
