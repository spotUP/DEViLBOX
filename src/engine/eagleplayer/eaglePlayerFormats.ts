/**
 * The formats the generic eagleplayer runner plays - data, not code.
 *
 * eagleplayer-wasm runs UADE's own sound core (`score`) on the shared Musashi
 * host (musashi-host/), and score drives any eagleplayer through the
 * DeliTracker/EaglePlayer ABI exactly as UADE does. So a format is an entry
 * here: the eagleplayer binary (copied from third-party/uade-3.05/players to
 * public/eagleplayer/players/), the prefixes UADE's eagleplayer.conf gives it,
 * and the measured agreement with UADE that let it leave UADE.
 *
 * Add one with tools/eagleplayer/scaffold-format.ts (entry, player copy,
 * route, render + UADE comparison test). Ledger:
 * thoughts/shared/plans/2026-10-05-musashi-replayer-host.md
 */

export interface EaglePlayerFormat {
  /** Stable key stored on the song (`TrackerSong.eaglePlayerId`). */
  id: string;
  /** Shown in logs and the instrument info view. */
  label: string;
  /** File name under public/eagleplayer/players/ (= third-party/uade-3.05/players/). */
  player: string;
  /** Prefixes / extensions (eagleplayer.conf `prefixes=`), lower case. The first names the module for the player. */
  prefixes: string[];
  /** Paula voices the player drives. */
  voices: number;
  /** eagleplayer.conf options passed as `eagleoptions` (rare). */
  options?: string;
  /** A corpus song: the render test and the UADE comparison play it. */
  corpus: string;
  /**
   * 100 ms loudness-envelope correlation with UADE (mono sum - UADE renders
   * with panning 1.0), 30 s or to the player's song end, when it was switched.
   */
  uadeEnvelopeCorrelation: number;
  /**
   * True when the format's default load plays here (its route carries
   * `eaglePlayerFileData`). False keeps the entry measurable without taking
   * the format from the engine that plays it now - see `heldBecause`.
   */
  isDefault: boolean;
  heldBecause?: string;
}

export const EAGLE_PLAYER_FORMATS: Readonly<Record<string, EaglePlayerFormat>> = {
  Anders0land: {
    id: 'Anders0land', label: 'Anders 0land', player: 'Anders_0land', prefixes: ['hot'], voices: 4,
    corpus: 'public/data/songs/anders-oland/primemover 07.hot', uadeEnvelopeCorrelation: 0.9956, isDefault: true,
  },
  BenDaglish: {
    id: 'BenDaglish', label: 'Ben Daglish', player: 'BenDaglish', prefixes: ['bd'], voices: 4,
    corpus: 'public/data/songs/ben-daglish/motorhead-titleandingame.bd', uadeEnvelopeCorrelation: 0.9982,
    isDefault: false,
    heldBecause: 'BdEngine (bd-wasm, a C port) plays Ben Daglish today with live instrument editing; it measures 0.948 / 0.984 against UADE, this runner 0.999 / 0.998. Moving trades the editing for fidelity - the owner decides.',
  },
  CoreDesign: {
    id: 'CoreDesign', label: 'Core Design', player: 'CoreDesign', prefixes: ['core'], voices: 4,
    corpus: 'public/data/songs/core-design/dynamite dux.core', uadeEnvelopeCorrelation: 0.9969, isDefault: true,
  },
  DaveLowe: {
    id: 'DaveLowe', label: 'Dave Lowe', player: 'DaveLowe', prefixes: ['dl'], voices: 4,
    corpus: 'public/data/songs/dave-lowe/incredibleshrinkingsphere.dl', uadeEnvelopeCorrelation: 0.9948, isDefault: true,
  },
  DaveLoweNew: {
    id: 'DaveLoweNew', label: 'Dave Lowe New', player: 'DaveLoweNew', prefixes: ['dln'], voices: 4,
    corpus: 'public/data/songs/dave-lowe-new/m-bison.dln', uadeEnvelopeCorrelation: 0.9909, isDefault: true,
  },
  WallyBeben: {
    id: 'WallyBeben', label: 'Wally Beben', player: 'WallyBeben', prefixes: ['wb'], voices: 4,
    corpus: 'public/data/songs/wally-beben/wicked.wb', uadeEnvelopeCorrelation: 0.9845, isDefault: true,
  },
};

export function eaglePlayerFormat(id: string | undefined | null): EaglePlayerFormat | null {
  return (id && EAGLE_PLAYER_FORMATS[id]) || null;
}

/**
 * The name the player sees for the module: `<prefix>.<tune>`, the Amiga
 * convention UADE's players expect (dtg_PathArrayPtr, and the file a
 * LoadSeg()-ing player like Core Design or Dave Lowe opens). A file named
 * `<tune>.<ext>` is turned round; one already prefixed is kept.
 */
export function eaglePlayerModuleName(fmt: EaglePlayerFormat, fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || fileName;
  const lower = base.toLowerCase();
  for (const p of fmt.prefixes) {
    if (lower.startsWith(`${p}.`)) return base;
  }
  for (const p of fmt.prefixes) {
    if (lower.endsWith(`.${p}`)) return `${fmt.prefixes[0]}.${base.slice(0, -(p.length + 1))}`;
  }
  return `${fmt.prefixes[0]}.${base}`;
}

/** Where the engine fetches a player binary (served from public/). */
export function eaglePlayerUrl(fmt: EaglePlayerFormat, baseUrl = '/'): string {
  return `${baseUrl}eagleplayer/players/${encodeURIComponent(fmt.player)}`;
}
