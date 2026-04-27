/**
 * useDubStore — Phase 1 of Tracker Dub Studio.
 *
 * Owns dub state that doesn't belong in useDrumPadStore:
 *   - armed: whether live move performances get captured into the current
 *     pattern's dubLane by DubRecorder.
 *   - lastCapturedAt: timestamp of the most recent capture, used by the REC
 *     indicator to flash on each successful write.
 *
 * Bus settings (enabled, echo intensity, spring wet, etc.) still live in
 * useDrumPadStore for now — both consumers read from there. A later phase
 * can unify when the tracker starts writing those too.
 *
 * Writes are rAF-batched via scheduleDubStoreSync so the recorder can
 * capture at audio-rate (dozens of events per second during rapid-fire
 * performance) without stampeding zustand updates.
 */

import { create } from 'zustand';

interface DubStore {
  /** When true, DubRecorder captures live router events into the current
   *  pattern's dubLane. Live performances always fire audio regardless. */
  armed: boolean;
  setArmed: (v: boolean) => void;

  /** Set to performance.now() by the recorder right after it writes an event.
   *  UI subscribes for a brief REC-indicator flash on every capture. */
  lastCapturedAt: number | null;
  markCaptured: () => void;

  /** DubDeckStrip body collapse. Default collapsed so the bottom strip
   *  is a thin header (Bus ON/OFF + expand chevron) — expand reveals
   *  TONE/GLOBAL/per-channel rows + lane timeline. Keeps the pattern
   *  editor from being pushed off-screen on compact layouts. */
  stripCollapsed: boolean;
  setStripCollapsed: (v: boolean) => void;
  toggleStripCollapsed: () => void;

  /** Ghost Bus — parallel -36 dB bleed from every visible channel into
   *  the dub bus so muted channels still "whisper" through the wet return.
   *  Research-quoted "masking-tape on the bottom of the fader" crosstalk
   *  simulation. When toggled on, DubDeckStrip auto-seeds every channel's
   *  dubSend to 0.015 (remembering the prior value) so the bleed is
   *  effectively always-on regardless of mute state. Off restores prior. */
  ghostBus: boolean;
  setGhostBus: (v: boolean) => void;

  /** Chorus-on-master finisher — stereo chorus on the whole output for
   *  a smooth trippy polish. Research-quoted "chorus on the finished
   *  track" Mad Professor-adjacent move. */
  masterChorus: boolean;
  setMasterChorus: (v: boolean) => void;

  /** Club Simulator — convolution reverb IR as a master insert so the
   *  producer can audition "how does this mix sound in a venue?" */
  clubSim: boolean;
  setClubSim: (v: boolean) => void;

  /** JA Press — vinyl-degradation level 0-10. 0 = factory-new pressing,
   *  10 = gutter-scraped Jamaican 7-inch: heavy surface noise, pops,
   *  wow/flutter, HF roll-off, sub rumble, L/R drift. Master-insert. */
  vinylLevel: number;
  setVinylLevel: (v: number) => void;

  /** Auto Dub — autonomous dub-move performer. Strictly opt-in, off by
   *  default. When on, the AutoDub singleton polls transport + fires moves
   *  through DubRouter in a persona-flavored rule table. Captures to
   *  dubLane automatically if `armed` is also true. */
  autoDubEnabled: boolean;
  setAutoDubEnabled: (v: boolean) => void;
  /** 0..1 — scales per-tick roll probability, per-bar move budget, and
   *  per-move wet params together. One knob. */
  autoDubIntensity: number;
  setAutoDubIntensity: (v: number) => void;
  /** Persona id — picks weight bias + intensity default + character preset.
   *  'custom' = no bias (flat weights). */
  autoDubPersona: AutoDubPersonaId;
  setAutoDubPersona: (v: AutoDubPersonaId) => void;
  /** Move ids the user never wants fired. UI is a chip row. */
  autoDubMoveBlacklist: string[];
  setAutoDubMoveBlacklist: (v: string[]) => void;
  /** EQ intelligence mode for Auto Dub. */
  autoDubEqMode: 'off' | 'collaborative' | 'improv' | 'both';
  setAutoDubEqMode: (mode: 'off' | 'collaborative' | 'improv' | 'both') => void;
  /** Scales the EQ depth applied by Auto Dub. 0–1. */
  autoDubEqDepthMult: number;
  setAutoDubEqDepthMult: (v: number) => void;

  /** Quantize — when on, dub move fire/release events are snapped to the
   *  nearest row boundary for cleaner lane recordings. Audio fires
   *  immediately for feel, only the recorded row is quantized. */
  quantize: boolean;
  setQuantize: (v: boolean) => void;
}

/** Persona identifiers. Full definitions live in AutoDubPersonas.ts so the
 *  store stays dependency-free (otherwise we'd have a circular import with
 *  anything that reads useDubStore during module init). */
export type AutoDubPersonaId =
  | 'custom'
  | 'tubby'
  | 'scientist'
  | 'perry'
  | 'madProfessor'
  | 'jammy';

export const useDubStore = create<DubStore>((set) => ({
  armed: false,
  setArmed: (v) => set({ armed: v }),

  lastCapturedAt: null,
  markCaptured: () => set({ lastCapturedAt: performance.now() }),

  stripCollapsed: true,
  setStripCollapsed: (v) => set({ stripCollapsed: v }),
  toggleStripCollapsed: () => set((s) => ({ stripCollapsed: !s.stripCollapsed })),

  ghostBus: false,
  setGhostBus: (v) => set({ ghostBus: v }),

  masterChorus: false,
  setMasterChorus: (v) => set({ masterChorus: v }),

  clubSim: false,
  setClubSim: (v) => set({ clubSim: v }),

  vinylLevel: 0,
  setVinylLevel: (v) => set({ vinylLevel: Math.max(0, Math.min(10, v)) }),

  autoDubEnabled: false,
  setAutoDubEnabled: (v) => set({ autoDubEnabled: v }),
  autoDubIntensity: 0.5,
  setAutoDubIntensity: (v) => set({ autoDubIntensity: Math.max(0, Math.min(1, v)) }),
  autoDubPersona: 'custom',
  setAutoDubPersona: (v) => set({ autoDubPersona: v }),
  autoDubMoveBlacklist: [],
  setAutoDubMoveBlacklist: (v) => set({ autoDubMoveBlacklist: v }),
  autoDubEqMode: 'both',
  setAutoDubEqMode: (mode) => set({ autoDubEqMode: mode }),
  autoDubEqDepthMult: 1.0,
  setAutoDubEqDepthMult: (v) => set({ autoDubEqDepthMult: Math.max(0, Math.min(1, v)) }),
  quantize: true,
  setQuantize: (v) => set({ quantize: v }),
}));

/**
 * rAF-batched write helper — modeled on scheduleDJStoreSync (see
 * `CLAUDE.md` > "DJ param writes are rAF-batched"). Use this for any write
 * that might fire at audio-rate (e.g. recorder event writes during fast
 * performing). Callbacks run at most once per animation frame, grouped so
 * all zustand updates in the same frame flush together → single subscriber
 * broadcast per frame.
 */
let _pendingSync: ReturnType<typeof requestAnimationFrame> | null = null;
const _pendingCallbacks: Array<() => void> = [];

export function scheduleDubStoreSync(fn: () => void): void {
  _pendingCallbacks.push(fn);
  if (_pendingSync !== null) return;
  _pendingSync = requestAnimationFrame(() => {
    _pendingSync = null;
    const cbs = _pendingCallbacks.splice(0, _pendingCallbacks.length);
    for (const cb of cbs) {
      try {
        cb();
      } catch (err) {
        console.warn('[useDubStore] scheduled sync callback failed:', err);
      }
    }
  });
}
