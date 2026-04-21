/**
 * DJ Program Presets — factory DrumProgram instances for DJ performance modes.
 */

import { createEmptyProgram } from '../types/drumpad';
import type { DrumProgram } from '../types/drumpad';
import type { DubActionId, DubBusSettings } from '../types/dub';
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
]);
// Delays and reverbs are routed through the shared Dub Bus via `dubSend`.
// Keeping 16 FeedbackDelay / PingPongDelay / SpringReverb / SpaceEcho
// instances per one-shot kit stacks the audio graph with delay lines +
// filter feedback loops — a measurable CPU hazard during a 2-hour set.
// The shared bus supplies their character globally, so per-pad copies
// are redundant as well as expensive.
const HEAVY_FX_TYPES = new Set([
  'SpringReverb', 'SpaceEcho', 'Reverb', 'JCReverb', 'FreeverbEffect',
  'FeedbackDelay', 'PingPongDelay',
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
      // Per-synth trigger note:
      //   - DubSiren  → 'C3' sentinel ("use preset frequency unchanged")
      //   - everything else → 'C4' (keyboard-middle); MonoSynth-based
      //     risers / FMSynth growls at C3 play an octave below their
      //     intended range, which bleeds into the bass and muddies.
      pad.instrumentNote = preset.synthType === 'DubSiren' ? 'C3' : 'C4';
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
    // DubSiren uses C3 as the "no pitch override" sentinel so the preset's
    // oscillator.frequency is honored; other synths get keyboard-middle C4.
    pad.instrumentNote = preset.synthType === 'DubSiren' ? 'C3' : 'C4';
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
        returnGain: 0.5,       // gig-fix 2026-04-18: was 0.85 — one-shot presets should stay well under the dry mix
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
    // right the instant it loads. Louder-than-subtle values: dub tail sits
    // within ~3 dB of the dry mix (how Tubby/Scientist cuts actually sound).
    // User can still tame via the Dub Bus panel.
    onApply: (store) => {
      store.setDubBus({
        enabled: true,
        returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
        hpfCutoff: 200,
        springWet: 0.55,
        echoIntensity: 0.62,
        echoWet: 0.7,
        echoRateMs: 280,
        sidechainAmount: 0.5,
        deckTapAmount: 0.6,
        throwBeats: 0.5,
        sirenFeedback: 0.85,
        filterDropHz: 220,
        // BPM-sync ON for the King Tubby kit — the whole point of dub
        // echoes is to lock to the groove. Dotted-eighth is the classic
        // reggae/dub skank delay. Throw quantize stays 'off' so pad
        // presses feel immediate; users can enable via the bus panel.
        echoSyncDivision: '1/8D',
        throwQuantize: 'off',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Sound-system / dub preset flavours — every kit uses the same 16-pad
  // Bank A/B layout as King Tubby Dub, but each one ships a different dub-bus
  // personality (HPF, springWet, echoWet/intensity/rate, sidechain, siren,
  // sync division) so loading a preset sounds immediately distinct. All use
  // auto-select moves so they work regardless of which deck is playing.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'scientist-dub',
    name: 'Scientist Dub',
    description: 'Heavy echo, deep HPF, long dotted-eighth repeats. Classic 70s roots dub — big, wet, hypnotic.',
    create: () => buildFullDubKit('D-07', 'Scientist Dub'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
      hpfCutoff: 240,          // roll off more bass → tail sits above the mix
      springWet: 0.45,
      echoIntensity: 0.78,     // long trails, many repeats
      echoWet: 0.85,
      echoRateMs: 340,         // free-run fallback
      echoSyncDivision: '1/8D',// dotted eighth — the roots skank
      sidechainAmount: 0.55,
      deckTapAmount: 0.6,
      throwBeats: 0.5,
      sirenFeedback: 0.88,
      filterDropHz: 180,
      throwQuantize: 'offbeat',// throws land on the "&"
    }),
  },
  {
    id: 'king-tubby-spring',
    name: 'King Tubby Spring',
    description: 'Spring-reverb dominant with tight short echo. Percussion slaps and sparse delays — the Waterhouse dub-plate sound.',
    create: () => buildFullDubKit('D-08', 'King Tubby Spring'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
      hpfCutoff: 160,
      springWet: 0.85,         // spring is the character
      echoIntensity: 0.40,
      echoWet: 0.45,
      echoRateMs: 200,
      echoSyncDivision: '1/8',
      sidechainAmount: 0.35,
      deckTapAmount: 0.9,
      throwBeats: 0.25,        // short chops
      sirenFeedback: 0.80,
      filterDropHz: 260,
      throwQuantize: '1/8',
    }),
  },
  {
    id: 'steppers-rub-a-dub',
    name: 'Steppers Rub-a-Dub',
    description: 'Tight 1/16 echoes, fast slaps, mild sidechain pump. Digital steppers / 80s dancehall feel.',
    create: () => buildFullDubKit('D-09', 'Steppers Rub-a-Dub'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.58,      // gig-fix 2026-04-18: was 0.95 — preset was roughly +4 dB hot
      hpfCutoff: 220,
      springWet: 0.30,
      echoIntensity: 0.58,
      echoWet: 0.65,
      echoRateMs: 180,
      echoSyncDivision: '1/16',// 16th stutter
      sidechainAmount: 0.70,   // strong pump
      deckTapAmount: 0.95,
      throwBeats: 0.125,       // slap-back accents
      sirenFeedback: 0.82,
      filterDropHz: 240,
      throwQuantize: '1/16',
    }),
  },
  {
    id: 'black-ark',
    name: 'Lee Perry Black Ark',
    description: 'Wild space echo with wow, screaming siren feedback, big filter drops. Experimental/psychedelic dub.',
    create: () => buildFullDubKit('D-10', 'Black Ark'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
      hpfCutoff: 120,           // keep low end — Black Ark is bassy
      springWet: 0.60,
      echoIntensity: 0.82,      // runaway tails
      echoWet: 0.90,
      echoRateMs: 420,
      echoSyncDivision: '1/4',  // long quarter-note repeats
      sidechainAmount: 0.30,    // less pump → more chaos
      deckTapAmount: 0.6,
      throwBeats: 1.0,          // full-beat grabs
      sirenFeedback: 0.95,      // nearly screaming
      filterDropHz: 120,        // very muffled drop
      throwQuantize: 'bar',     // bar-locked for maximum drama
    }),
  },
  {
    id: 'uk-soundsystem',
    name: 'UK Sound System',
    description: 'Sub-bass focus (low HPF), heavy echo, big throws. Channel One / Iration Steppas weight.',
    create: () => buildFullDubKit('D-11', 'UK Sound System'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
      hpfCutoff: 80,            // almost no HPF → sub weight stays
      springWet: 0.50,
      echoIntensity: 0.70,
      echoWet: 0.78,
      echoRateMs: 360,
      echoSyncDivision: '1/8D',
      sidechainAmount: 0.50,
      deckTapAmount: 0.6,
      throwBeats: 2.0,          // long 2-beat phrase grabs
      sirenFeedback: 0.85,
      filterDropHz: 160,
      throwQuantize: 'offbeat',
    }),
  },
  {
    id: 'digital-dub',
    name: 'Digital Dub',
    description: 'Crisp tight echoes, bright springs. Mad Professor / digital-era precision.',
    create: () => buildFullDubKit('D-12', 'Digital Dub'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.58,      // gig-fix 2026-04-18: was 0.95 — preset was roughly +4 dB hot
      hpfCutoff: 300,           // brighter bus — cuts through
      springWet: 0.40,
      echoIntensity: 0.50,
      echoWet: 0.60,
      echoRateMs: 220,
      echoSyncDivision: '1/8',
      sidechainAmount: 0.60,
      deckTapAmount: 0.90,
      throwBeats: 0.5,
      sirenFeedback: 0.80,
      filterDropHz: 280,
      throwQuantize: '1/8',
    }),
  },
  {
    id: 'ambient-dub',
    name: 'Ambient Dub',
    description: 'Long reverb, slow echo, spacious. Rhythm & Sound / Basic Channel atmosphere.',
    create: () => buildFullDubKit('D-13', 'Ambient Dub'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
      hpfCutoff: 200,
      springWet: 0.80,          // long spring tail
      echoIntensity: 0.65,
      echoWet: 0.55,
      echoRateMs: 520,          // slow
      echoSyncDivision: '1/2',  // half-note — very wide
      sidechainAmount: 0.25,    // minimal pump → floating
      deckTapAmount: 0.85,
      throwBeats: 1.0,
      sirenFeedback: 0.78,
      filterDropHz: 200,
      throwQuantize: 'bar',
    }),
  },
  {
    id: 'echo-chamber',
    name: 'Echo Chamber',
    description: 'Very long echo rates, low feedback — cavernous single-repeat slapbacks.',
    create: () => buildFullDubKit('D-14', 'Echo Chamber'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,       // gig-fix 2026-04-18: was 1.0 — dub tail sat on top of the mix
      hpfCutoff: 180,
      springWet: 0.25,
      echoIntensity: 0.35,       // only 1-2 repeats
      echoWet: 0.80,             // but very wet
      echoRateMs: 480,
      echoSyncDivision: 'off',   // free-running — detached from grid
      sidechainAmount: 0.40,
      deckTapAmount: 0.6,
      throwBeats: 0.5,
      sirenFeedback: 0.82,
      filterDropHz: 200,
      throwQuantize: 'off',
    }),
  },

  // ═══ New plate-specific dub kits (2026-04-20) ═══
  // Tuned to the new MadProfessorPlate / DattorroPlate character. They
  // use the same buildFullDubKit layout — the difference is entirely in
  // the bus personality (HPF position, spring vs echo balance, sync
  // division). Pair these with the matching plate in Master FX for the
  // full voicing; the pads work standalone too.

  {
    id: 'mad-professor-desk',
    name: 'Mad Professor Mix Desk',
    description: 'Long dark PCM-70 dub plate on the bus itself — heavy echo into a wide cathedral tail. Engages plateStage=madprofessor at 0.45 mix so the PCM-70 color is audible without needing a Master-FX preset too.',
    create: () => buildFullDubKit('D-15', 'Mad Professor Desk'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.6,
      hpfCutoff: 200,            // matches MadProfessorPlate pre-HPF
      springWet: 0.30,           // let the plate carry the tail
      echoIntensity: 0.72,       // long smoky repeats
      echoWet: 0.78,
      echoRateMs: 400,
      echoSyncDivision: '1/8D',  // the dotted-eighth roots skank
      sidechainAmount: 0.45,
      deckTapAmount: 0.7,
      throwBeats: 1.0,           // long throw into the plate
      sirenFeedback: 0.85,
      filterDropHz: 180,
      throwQuantize: 'offbeat',
      plateStage: 'madprofessor',
      plateStageMix: 0.45,
    }),
  },
  {
    id: 'dattorro-chamber',
    name: 'Dattorro Plate Lab',
    description: 'Metallic, resonant plate on the bus — Scientist-70s tank. Engages plateStage=dattorro at 0.45 mix so the metallic character is audible without a Master-FX preset.',
    create: () => buildFullDubKit('D-16', 'Dattorro Plate Lab'),
    onApply: (store) => store.setDubBus({
      enabled: true,
      returnGain: 0.58,
      hpfCutoff: 220,
      springWet: 0.55,           // metallic resonance character
      echoIntensity: 0.55,
      echoWet: 0.60,
      echoRateMs: 240,           // brighter, tighter
      echoSyncDivision: '1/8',
      sidechainAmount: 0.55,
      deckTapAmount: 0.85,
      throwBeats: 0.5,
      sirenFeedback: 0.80,
      filterDropHz: 220,
      throwQuantize: '1/8',
      plateStage: 'dattorro',
      plateStageMix: 0.45,
    }),
  },
];

/**
 * Shared layout builder for sound-system / dub factory kits. Identical pad
 * arrangement to the King Tubby kit (Bank A = single-deck gestures + FX,
 * Bank B = combos + broadcast + synth one-shots), so users can swap presets
 * without having to re-learn their muscle memory — only the bus personality
 * changes between preset flavours.
 */
function buildFullDubKit(id: string, name: string): DrumProgram {
  const program = createEmptyProgram(id, name);

  const bankA: DubMapping[] = [
    { label: 'Throw',       color: '#ef4444', action: 'dub_throw',       mode: 'oneshot' },
    { label: 'Hold',        color: '#f59e0b', action: 'dub_hold',        mode: 'sustain' },
    { label: 'Mute & Dub',  color: '#8b5cf6', action: 'dub_mute',        mode: 'sustain' },
    { label: 'Slap Back',   color: '#f43f5e', action: 'dub_slap_back',   mode: 'oneshot' },
    { label: 'Siren',       color: '#06b6d4', action: 'dub_siren',       mode: 'sustain' },
    { label: 'Filter Drop', color: '#0891b2', action: 'dub_filter_drop', mode: 'sustain' },
    { label: 'Short Throw', color: '#f87171', action: 'dub_throw_short', mode: 'oneshot' },
    { label: 'Long Throw',  color: '#991b1b', action: 'dub_throw_long',  mode: 'oneshot' },
  ];
  applyDubActionPads(program, 0, bankA);

  const bankBDub: DubMapping[] = [
    { label: 'Combo Drop',  color: '#a78bfa', action: 'dub_combo_drop', mode: 'sustain' },
    { label: 'Throw All',   color: '#7f1d1d', action: 'dub_throw_all',  mode: 'oneshot' },
    { label: 'Hold All',    color: '#b45309', action: 'dub_hold_all',   mode: 'sustain' },
    { label: 'Mute All',    color: '#6d28d9', action: 'dub_mute_all',   mode: 'sustain' },
  ];
  applyDubActionPads(program, 8, bankBDub);

  const bankBSynths: SynthMapping[] = [
    { label: 'Dub Siren',   color: '#fb923c', presetName: 'Dub Siren' },
    { label: 'Air Horn',    color: '#fbbf24', presetName: 'DJ Air Horn' },
    { label: 'Noise Riser', color: '#ec4899', presetName: 'Noise Riser' },
  ];
  applyOneShotByName(program, 13, bankBSynths);

  return program;
}
