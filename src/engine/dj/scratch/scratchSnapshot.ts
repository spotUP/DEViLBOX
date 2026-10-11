/**
 * What a scratch must give back (owner plan section 60; ledger SCR-P3.5): the
 * state a scratch touches, captured when the first scratch of a run starts
 * and restored when the last one ends. The 2026-09-30 regression (a scratch
 * exit forcing `suppressNotes` off and freezing the pattern view of a
 * WASM-played song) is why `suppressNotes` is part of the snapshot: it is
 * captured and verified, never forced.
 */

export interface ScratchSnapshot {
  /** The deck's playback rate (audio) or tempo multiplier (tracker). */
  rate: number;
  /** The deck's channel fader. */
  channelGain: number;
  /** The scratch ring's capture is frozen. */
  captureFrozen: boolean;
  /** The replayer's note suppression (WASM-played songs): captured, never forced. */
  suppressNotes: boolean;
  /** The mixer crossfader position. */
  crossfader: number;
  /** The scratch bus output level. */
  busLevel: number;
}

export interface ScratchStateProbe {
  capture(): ScratchSnapshot;
  restore(snapshot: ScratchSnapshot): void;
}

/** The deck part of the snapshot (`DeckEngine.captureScratchSnapshot`). */
export type DeckScratchSnapshot = Pick<ScratchSnapshot, 'rate' | 'channelGain' | 'captureFrozen' | 'suppressNotes'>;

const EPS = 1e-3;

/** Fields that differ between two snapshots (empty = equal). */
export function snapshotDiff(a: ScratchSnapshot, b: ScratchSnapshot): Array<keyof ScratchSnapshot> {
  const out: Array<keyof ScratchSnapshot> = [];
  if (Math.abs(a.rate - b.rate) > EPS) out.push('rate');
  if (Math.abs(a.channelGain - b.channelGain) > EPS) out.push('channelGain');
  if (a.captureFrozen !== b.captureFrozen) out.push('captureFrozen');
  if (a.suppressNotes !== b.suppressNotes) out.push('suppressNotes');
  if (Math.abs(a.crossfader - b.crossfader) > EPS) out.push('crossfader');
  if (Math.abs(a.busLevel - b.busLevel) > EPS) out.push('busLevel');
  return out;
}

/** The deck engine surface the probe needs. */
export interface SnapshotDeck {
  captureScratchSnapshot(): DeckScratchSnapshot;
  restoreScratchSnapshot(s: DeckScratchSnapshot): void;
}

export interface MixerSurface {
  getCrossfader(): number;
  setCrossfader(position: number): void;
}

export interface BusSurface {
  readonly level: Pick<AudioParam, 'value'>;
}

/** The real probe: a deck, the mixer's crossfader, the scratch bus level. */
export function createScratchStateProbe(deck: SnapshotDeck, mixer: MixerSurface, bus: BusSurface | null): ScratchStateProbe {
  return {
    capture: () => ({ ...deck.captureScratchSnapshot(), crossfader: mixer.getCrossfader(), busLevel: bus?.level.value ?? 1 }),
    restore: (s) => {
      deck.restoreScratchSnapshot(s);
      if (Math.abs(mixer.getCrossfader() - s.crossfader) > EPS) mixer.setCrossfader(s.crossfader);
      if (bus && Math.abs(bus.level.value - s.busLevel) > EPS) bus.level.value = s.busLevel;
    },
  };
}
