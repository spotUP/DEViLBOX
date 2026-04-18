/**
 * DJ Program Presets — factory DrumProgram instances for DJ performance modes.
 */

import { createEmptyProgram } from '../types/drumpad';
import type { DrumProgram, DubActionId, DubBusSettings } from '../types/drumpad';
import { DJ_ONE_SHOT_PRESETS } from './djOneShotPresets';
import { DEFAULT_DJFX_PADS, DEFAULT_ONESHOT_PADS, DEFAULT_SCRATCH_PADS } from './djPadModeDefaults';
import { PAD_INSTRUMENT_BASE } from '../types/drumpad';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DJPreset {
  id: string;
  name: string;
  description: string;
  create: () => DrumProgram;
  /**
   * Optional post-load side-effects: enable/patch the Dub Bus, flip global
   * drumpad settings, etc. Called by the UI after the program is saved.
   * Kept separate from create() so the program itself stays a pure factory.
   */
  onApply?: (store: {
    setDubBus: (patch: Partial<DubBusSettings>) => void;
  }) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyDjFxPads(program: DrumProgram, startPad: number, count: number): void {
  for (let i = 0; i < count && i < DEFAULT_DJFX_PADS.length; i++) {
    const mapping = DEFAULT_DJFX_PADS[i];
    const pad = program.pads[startPad + i];
    if (!pad) continue;
    pad.name = mapping.label;
    pad.color = mapping.color;
    pad.djFxAction = mapping.actionId;
    pad.playMode = 'sustain'; // Hold to engage
  }
}

// FX types that define the synth's SHAPE (filter sweeps, modulation, tone) —
// kept even in "lean" factory-kit mode because without them presets like the
// Noise Riser (AutoFilter does the filter sweep) become flat noise bursts.
// Heavyweight FX (SpringReverb WASM, SpaceEcho delay lines) are stripped and
// routed through the shared Dub Bus via dubSend — same flavor, 1/16 the cost.
const LIGHT_FX_TYPES = new Set([
  'AutoFilter', 'AutoWah', 'AutoPanner',
  'TapeSaturation', 'Distortion', 'Chebyshev',
  'Compressor', 'EQ3',
  'Chorus', 'Phaser', 'Vibrato', 'Tremolo',
  'FeedbackDelay', 'PingPongDelay',
]);
const HEAVY_FX_TYPES = new Set([
  'SpringReverb', 'SpaceEcho', 'Reverb', 'JCReverb', 'FreeverbEffect',
]);

function applyOneShotPads(program: DrumProgram, startPad: number, count: number): void {
  for (let i = 0; i < count && i < DEFAULT_ONESHOT_PADS.length; i++) {
    const mapping = DEFAULT_ONESHOT_PADS[i];
    const pad = program.pads[startPad + i];
    if (!pad) continue;
    pad.name = mapping.label;
    pad.color = mapping.color;
    const preset = DJ_ONE_SHOT_PRESETS[mapping.presetIndex];
    if (preset) {
      // Keep the SHAPE-defining FX (AutoFilter for riser sweeps, Compressor,
      // TapeSat for warmth) but strip the expensive WASM/reverb tails. The
      // dub bus supplies the reverb/echo character globally so we're not
      // paying 16× for identical tails. Prevents the "16 SpringReverb
      // instances crash the audio thread" issue while keeping presets like
      // Noise Riser, Tension Swell, Filter Sweep sounding like themselves.
      const rawFx = (preset as { effects?: Array<{ type: string }> }).effects ?? [];
      const keptFx = rawFx.filter((fx) =>
        LIGHT_FX_TYPES.has(fx.type) && !HEAVY_FX_TYPES.has(fx.type)
      );
      pad.synthConfig = {
        id: PAD_INSTRUMENT_BASE + pad.id,
        name: preset.name ?? mapping.label,
        type: preset.type ?? 'synth',
        synthType: preset.synthType ?? 'Synth',
        volume: preset.volume ?? 0,
        pan: preset.pan ?? 0,
        ...preset,
        effects: keptFx,
      } as import('../types/instrument/defaults').InstrumentConfig;
      pad.instrumentNote = 'C3';
      // Dub-bus send — adds shared echo + spring reverb character on top of
      // whatever the pad's own lightweight FX produce. Horns and impacts use
      // less; sirens more (tails benefit from long echo).
      pad.dubSend = mapping.category === 'Sirens' ? 0.55
                  : mapping.category === 'Impacts' || mapping.category === 'Noise' ? 0.25
                  : 0.40;
    }
  }
}

function applyScratchPads(program: DrumProgram, startPad: number, count: number): void {
  for (let i = 0; i < count && i < DEFAULT_SCRATCH_PADS.length; i++) {
    const mapping = DEFAULT_SCRATCH_PADS[i];
    const pad = program.pads[startPad + i];
    if (!pad) continue;
    pad.name = mapping.label;
    pad.color = mapping.color;
    pad.scratchAction = mapping.actionId;
  }
}

interface DubMapping {
  label: string;
  color: string;
  action: DubActionId;
  mode: 'oneshot' | 'sustain';
}

function applyDubActionPads(program: DrumProgram, startPad: number, pads: DubMapping[]): void {
  pads.forEach((m, i) => {
    const pad = program.pads[startPad + i];
    if (!pad) return;
    pad.name = m.label;
    pad.color = m.color;
    pad.dubAction = m.action;
    pad.playMode = m.mode;
  });
}

/**
 * Pad slot with an optional DJ one-shot preset — used to drop supporting
 * synth sounds (sirens, horns, risers) next to the dub-action pads in the
 * King Tubby kit. `presetName` is matched by name against DJ_ONE_SHOT_PRESETS.
 */
interface SynthMapping {
  label: string;
  color: string;
  presetName: string;
}

function applyOneShotByName(program: DrumProgram, startPad: number, pads: SynthMapping[]): void {
  pads.forEach((m, i) => {
    const pad = program.pads[startPad + i];
    if (!pad) return;
    const preset = DJ_ONE_SHOT_PRESETS.find((p) => p.name === m.presetName);
    if (!preset) {
      // Fall back to a plain named pad so the grid slot is still visible
      pad.name = m.label;
      pad.color = m.color;
      return;
    }
    pad.name = m.label;
    pad.color = m.color;
    pad.synthConfig = {
      id: PAD_INSTRUMENT_BASE + pad.id,
      name: preset.name ?? m.label,
      type: preset.type ?? 'synth',
      synthType: preset.synthType ?? 'Synth',
      effects: preset.effects ?? [],
      volume: preset.volume ?? 0,
      pan: preset.pan ?? 0,
      ...preset,
    } as import('../types/instrument/defaults').InstrumentConfig;
    pad.instrumentNote = 'C3';
  });
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export const DJ_PAD_PRESETS: DJPreset[] = [
  {
    id: 'djfx-essential',
    name: 'DJ FX',
    description: 'DJ FX pads — stutter, delay, filter, reverb, modulation',
    create: () => {
      const program = createEmptyProgram('D-01', 'DJ FX Essential');
      applyDjFxPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'oneshots-live',
    name: 'One-Shots',
    description: 'One-shot pads — horns, sirens, impacts, risers. Routes through the Dub Bus for shared reverb + echo character (ONE SpringReverb instance, not 16).',
    create: () => {
      const program = createEmptyProgram('D-02', 'One-Shots Live');
      applyOneShotPads(program, 0, 16);
      return program;
    },
    onApply: ({ setDubBus }) => {
      // Dub Bus must be enabled for the pads' dubSend to route anywhere.
      // Tame settings — the presets are one-shots, not sustained, so the
      // bus just adds ambience + tape character, not huge echo tails.
      setDubBus({
        enabled: true,
        hpfCutoff: 120,
        springWet: 0.45,
        echoWet: 0.30,
        echoIntensity: 0.35,
        returnGain: 0.85,
      });
    },
  },
  {
    id: 'scratch-master',
    name: 'Scratch',
    description: 'Scratch pads — baby, flare, crab, orbit, and more',
    create: () => {
      const program = createEmptyProgram('D-03', 'Scratch Master');
      applyScratchPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'dj-complete',
    name: 'DJ Complete',
    description: 'Bank A: FX — Bank B: scratch patterns',
    create: () => {
      const program = createEmptyProgram('D-04', 'DJ Complete Kit');
      applyDjFxPads(program, 0, 8);
      applyScratchPads(program, 8, 8);
      return program;
    },
  },
  {
    id: 'king-tubby-dub',
    name: 'King Tubby Dub Kit',
    description: 'Auto-deck dub moves. Bank A = primary gestures (one pad per move, follows crossfader); Bank B = explicit targeting + siren/air-horn/riser synths. Enables the Dub Bus automatically.',
    create: () => {
      const program = createEmptyProgram('D-05', 'King Tubby Dub Kit');

      // ── Bank A (pads 1–8): core single-deck moves + bus FX + length variants ──
      // Auto-select everywhere — each pad resolves the active deck at press
      // time based on crossfader position + channel volume. One pad per
      // gesture regardless of which deck is playing, exactly how real dub
      // engineers work: they know "which signal is loud" and throw/mute THAT,
      // not a named channel. Row 2 gives the classic FX (siren, filter drop)
      // and throw-length variants for different rhythmic feels.
      const bankA: DubMapping[] = [
        // Row 1: core single-deck moves — default throw length (0.5 beats)
        { label: 'Throw',       color: '#ef4444', action: 'dub_throw',       mode: 'oneshot' },
        { label: 'Hold',        color: '#f59e0b', action: 'dub_hold',        mode: 'sustain' },
        { label: 'Mute & Dub',  color: '#8b5cf6', action: 'dub_mute',        mode: 'sustain' },
        { label: 'Slap Back',   color: '#f43f5e', action: 'dub_slap_back',   mode: 'oneshot' },
        // Row 2: bus FX + throw-length variants — different musical feel
        { label: 'Siren',       color: '#06b6d4', action: 'dub_siren',       mode: 'sustain' },
        { label: 'Filter Drop', color: '#0891b2', action: 'dub_filter_drop', mode: 'sustain' },
        { label: 'Short Throw', color: '#f87171', action: 'dub_throw_short', mode: 'oneshot' },
        { label: 'Long Throw',  color: '#991b1b', action: 'dub_throw_long',  mode: 'oneshot' },
      ];
      applyDubActionPads(program, 0, bankA);

      // ── Bank B (pads 9–16): combos + broadcast variants + supporting synths
      // Combos bundle two gestures into one pad (e.g. "the drop" = mute + filter
      // drop together). Broadcasts hit EVERY playing deck at once — massive
      // full-mix moves. Synths are the classic sound-system one-shots.
      const bankBDub: DubMapping[] = [
        { label: 'Combo Drop',  color: '#a78bfa', action: 'dub_combo_drop', mode: 'sustain' },
        { label: 'Throw All',   color: '#7f1d1d', action: 'dub_throw_all',  mode: 'oneshot' },
        { label: 'Hold All',    color: '#b45309', action: 'dub_hold_all',   mode: 'sustain' },
        { label: 'Mute All',    color: '#6d28d9', action: 'dub_mute_all',   mode: 'sustain' },
      ];
      applyDubActionPads(program, 8, bankBDub);
      // Pads 9+4=13 intentionally left empty for user customization.

      // Pads 14–16: supporting one-shot synths — classic sound-system tools
      // that pair naturally with the dub moves.
      const bankBSynths: SynthMapping[] = [
        { label: 'Dub Siren',   color: '#fb923c', presetName: 'Dub Siren' },
        { label: 'Air Horn',    color: '#fbbf24', presetName: 'DJ Air Horn' },
        { label: 'Noise Riser', color: '#ec4899', presetName: 'Noise Riser' },
      ];
      applyOneShotByName(program, 13, bankBSynths);

      return program;
    },
    // Flip the bus on and dial in dub-flattering defaults so the kit sounds
    // right the instant it loads. User can still fiddle via the Dub Bus panel.
    onApply: (store) => {
      store.setDubBus({
        enabled: true,
        returnGain: 0.82,
        hpfCutoff: 200,
        springWet: 0.45,
        echoIntensity: 0.6,
        echoWet: 0.55,
        echoRateMs: 280,
        sidechainAmount: 0.5,
        deckTapAmount: 0.9,
        throwBeats: 0.5,
        sirenFeedback: 0.85,
        filterDropHz: 220,
      });
    },
  },
  {
    id: 'dub-moves-minimal',
    name: 'Dub Moves (Minimal)',
    description: 'Compact 8-pad layout with auto-deck moves. Fits any 8-pad controller.',
    create: () => {
      const program = createEmptyProgram('D-06', 'Dub Moves');
      // All auto-select variants — pads follow the active deck automatically,
      // so the whole kit works no matter which deck is playing.
      const moves: DubMapping[] = [
        { label: 'Throw',       color: '#ef4444', action: 'dub_throw',       mode: 'oneshot' },
        { label: 'Hold',        color: '#f59e0b', action: 'dub_hold',        mode: 'sustain' },
        { label: 'Mute & Dub',  color: '#8b5cf6', action: 'dub_mute',        mode: 'sustain' },
        { label: 'Slap Back',   color: '#f43f5e', action: 'dub_slap_back',   mode: 'oneshot' },
        { label: 'Siren',       color: '#06b6d4', action: 'dub_siren',       mode: 'sustain' },
        { label: 'Filter Drop', color: '#0891b2', action: 'dub_filter_drop', mode: 'sustain' },
        { label: 'Throw All',   color: '#991b1b', action: 'dub_throw_all',   mode: 'oneshot' },
        { label: 'Hold All',    color: '#b45309', action: 'dub_hold_all',    mode: 'sustain' },
      ];
      applyDubActionPads(program, 0, moves);
      return program;
    },
    onApply: (store) => {
      store.setDubBus({ enabled: true });
    },
  },
];
