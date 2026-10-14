/**
 * withNuade - a format whose sound comes from nuade (NuadeEngine; formats in src/engine/nuade/nuadeFormats.ts).
 *
 * The grid comes from the format's own route (its native parser, or UADE's scan when the parser finds nothing);
 * `playOnNuade` then puts the module and the player id on the song and takes UADE's playback fields and every engine
 * of ours that would outrank nuade off it, so the Nuade descriptor plays it. `applyNuadeChoice` is the one place the
 * choice is applied: parseModuleToSong calls it on the routed song, so the 84 + 30 routes stay untouched.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FormatEnginePreferences } from '@/types/formatEngine';
import { WASM_ENGINES } from '@/engine/replayer/wasmEngineRegistry';
import { NUADE_FORMATS } from '@/engine/nuade/nuadeFormats';
import { nuadeRowFor, type FormatEngineMap } from '@/engine/nuade/nuadeRouting';
import { nuadeVoiceCounter, type NuadeProbe } from '@/engine/nuade/nuadeProbe';

const UADE_SYNTHS = new Set(['UADESynth', 'UADEEditableSynth']);

/** Song fields of the engines that precede Nuade in the registry (they would play the song instead). */
function outrankingFields(): string[] {
  const at = WASM_ENGINES.findIndex((d) => d.key === 'Nuade');
  return WASM_ENGINES.slice(0, at).map((d) => d.fileDataKey as string);
}

function sameBytes(value: unknown, module: ArrayBuffer): boolean {
  if (!(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) return false;
  const a = value instanceof Uint8Array ? value : new Uint8Array(value);
  const b = new Uint8Array(module);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Hand `song` to NuadeEngine: the module bytes and the player id ride on it, UADE's playback fields come off, engines
 * that would outrank nuade (our own replayers of a dual row) lose their file data, and instruments that would start
 * UADE become plain samplers.
 */
export function playOnNuade(song: TrackerSong, playerId: string, module: ArrayBuffer, fileName: string, companions?: Map<string, ArrayBuffer>): TrackerSong {
  if (!NUADE_FORMATS[playerId]) throw new Error(`withNuade: unknown player ${playerId}`);
  const bag = song as unknown as Record<string, unknown>;
  // The fields that come off and held this module are named on the song: the native export puts the module back under
  // them, so the format's own exporter (which reads hippelFileData, uadeEditableFileData ...) still finds it.
  const held = [...outrankingFields(), 'uadeEditableFileData'].filter((f) => sameBytes(bag[f], module));
  if (held.length > 0) song.nuadeModuleFields = held;
  for (const field of outrankingFields()) delete bag[field];
  song.nuadeFileData = module.slice(0);
  song.nuadePlayerId = playerId;
  // The player opens the module (and its companions) by file name: the real one.
  song.nuadeFileName = fileName;
  if (companions && companions.size > 0) song.uadeCompanionFiles = companions;
  // A command-stream file's tune (lib/import/fileSubsongs) is the tune nuade starts: the player numbers its songs
  // from 0 like the file's table, and without it nuade would play its default beside a grid of another tune.
  if (song.fileSubsongs && song.nuadeSubsong === undefined) song.nuadeSubsong = song.fileSubsongs.current;
  delete song.uadeEditableFileData;
  delete song.uadeEditableFileName;
  // Subsongs are the engine's (it reports them on load); the UADE list would send the switch to UADE.
  delete (song as { uadeEditableSubsongs?: unknown }).uadeEditableSubsongs;
  for (const inst of song.instruments) {
    if (UADE_SYNTHS.has(inst.synthType)) {
      inst.synthType = 'Sampler';
      delete inst.uade;
    }
  }
  // A grid from UADE's scan is tagged 'UADE', and playback treats a 'UADE' song as UADE's opaque player.
  if (song.format === 'UADE') song.format = 'MOD';
  for (const p of song.patterns) {
    if (p.importMetadata?.sourceFormat === 'UADE') p.importMetadata.sourceFormat = 'MOD';
  }
  return song;
}

export interface NuadeChoiceContext {
  /** The FormatRegistry key the import router detected, when it did. */
  registryKey?: string | null;
  buffer: ArrayBuffer;
  fileName: string;
  companions?: Map<string, ArrayBuffer>;
  /** The settings store's explicit choices (resolution adds the table's defaults). */
  prefs: FormatEngineMap | FormatEnginePreferences;
  /** Which player recognises the bytes (default: nuade itself, loaded on first use). */
  probe?: NuadeProbe;
}

/** The routed `song`, played on nuade when its format's choice says so; unchanged otherwise. */
export async function applyNuadeChoice(song: TrackerSong, ctx: NuadeChoiceContext): Promise<TrackerSong> {
  const row = await nuadeRowFor(ctx.fileName, new Uint8Array(ctx.buffer), ctx.prefs, ctx.registryKey, ctx.probe);
  if (!row) return song;
  playOnNuade(song, row.id, ctx.buffer, ctx.fileName, ctx.companions);
  // The subsong control must show at import, not after the first play loads the engine: ask the player now.
  try {
    const info = await nuadeVoiceCounter()(new Uint8Array(ctx.buffer), ctx.fileName, row.id, ctx.companions);
    if (info && info.subsongs > 1) song.nuadeSubsongs = { count: info.subsongs, defaultSubsong: info.defaultSubsong };
  } catch { /* the engine reports its subsongs when it loads */ }
  return song;
}
