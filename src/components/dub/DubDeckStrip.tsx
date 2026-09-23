/**
 * DubDeckStrip — the tracker's edit-mode bottom strip for dub performance.
 *
 * Scope:
 * - Header: Bus ON/OFF, REC arm, event count, KILL
 * - Globals row: 10 chip buttons for song-wide moves
 * - Per-channel rows: [M T E ✦] op buttons + sustained dub-hold toggle + dub-send knob
 * - Lane timeline: recorded events as clickable bars
 *
 * Everything routes through DubRouter.fire → audio, and DubRecorder captures
 * into the current pattern's dubLane when armed. Keyboard bindings live with
 * Full-Screen Dub Mode (spec task) since every letter in edit mode has a
 * note-entry meaning.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@stores/useNotificationStore';
import { useHoverTooltip } from '@/components/ui';
import { useDubStore } from '@/stores/useDubStore';
import { anySendAudible, GHOST_SEND_FLOOR } from '@/lib/dub/sendAudibility';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resolveChannelNames } from '@/lib/tracker/channelNames';
import { useUIStore } from '@/stores/useUIStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { getActiveBpm } from '@/engine/dub/DubActions';
import { subscribeDubRouter, subscribeDubRelease, fire as fireDub } from '@/engine/dub/DubRouter';
import { beginGesture, endGesture, cancelGesture } from '@/engine/dub/GestureEngine';
import { getAutoDubCurrentRoles } from '@/engine/dub/AutoDub';
import { startDubRecorder, clearDubCurvesForCurrentPattern } from '@/engine/dub/DubRecorder';
import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { getSongTimeSec } from '@/engine/dub/songTime';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { getChannelRoutedEffectsManager } from '@/engine/tone/ChannelRoutedEffects';
import { getToneEngine } from '@/engine/ToneEngine';
import { Fader } from '@components/controls/Fader';
import { AutoDubPanel } from './AutoDubPanel';
import { Fil4EqPanel } from '@components/effects/Fil4EqPanel';
import { getActiveDubBus } from '@engine/dub/DubBus';

import { DUB_CHARACTER_PRESETS } from '@/types/dub';
import { getPersona } from '@/engine/dub/AutoDubPersonas';
import type { AutoDubPersonaId } from '@/stores/useDubStore';
import { useLiveDubParam } from '@/hooks/useLiveDubParam';
import { denormalizeSweepRate } from '@engine/dub/DubBus';

// ── Unified Dub Style table ──────────────────────────────────────────────────
// Each style applies BOTH a bus character preset (engineer tone) AND an AutoDub
// persona (AI behavior). This eliminates the old VOICE/persona duplication.
const DUB_STYLES = [
  { id: 'custom',       label: 'Custom',              characterPreset: 'custom'       as const, personaId: 'custom'       as AutoDubPersonaId },
  { id: 'tubby',        label: 'King Tubby',          characterPreset: 'tubby'        as const, personaId: 'tubby'        as AutoDubPersonaId },
  { id: 'scientist',    label: 'Scientist',           characterPreset: 'scientist'    as const, personaId: 'scientist'    as AutoDubPersonaId },
  { id: 'perry',        label: 'Lee "Scratch" Perry', characterPreset: 'perry'        as const, personaId: 'perry'        as AutoDubPersonaId },
  { id: 'madProfessor', label: 'Mad Professor',       characterPreset: 'madProfessor' as const, personaId: 'madProfessor' as AutoDubPersonaId },
  { id: 'jammy',        label: 'Prince Jammy',        characterPreset: 'jammy'        as const, personaId: 'jammy'        as AutoDubPersonaId },
];

const CUSTOM_DUB_STYLE = DUB_STYLES.find((style) => style.id === 'custom') ?? DUB_STYLES[0];

export function resolveCurrentDubStyle(
  characterPreset: string | null | undefined,
  autoDubPersona: AutoDubPersonaId,
) {
  const effectivePreset = characterPreset || 'custom';
  const exact = DUB_STYLES.find((style) => (
    (style.characterPreset ?? 'custom') === effectivePreset
      && style.personaId === autoDubPersona
  ));
  if (exact) return exact;
  if (effectivePreset === 'custom' && autoDubPersona !== 'custom') {
    return DUB_STYLES.find((style) => style.personaId === autoDubPersona) ?? CUSTOM_DUB_STYLE;
  }
  if (effectivePreset !== 'custom') {
    return DUB_STYLES.find((style) => (style.characterPreset ?? 'custom') === effectivePreset) ?? CUSTOM_DUB_STYLE;
  }
  return CUSTOM_DUB_STYLE;
}

// ─── Role inference ────────────────────────────────────────────────────────
/**
 * Last-resort role guess from a channel name.
 *
 * Only reached when the classifier has no opinion. It used to be the ONLY
 * source `applyCharacterPresetSends` consulted, and it was handed
 * `useMixerStore.channels[i].name` — which stays at the placeholder `CH 1` …
 * `CH 16` unless a user renames a channel by hand. So it returned null for
 * every channel of every song, every channel took the preset's `default` send,
 * and a style meant to open percussion wide and hold pads back opened
 * everything to the same level. Reported 2026-09-22 as AutoDub sounding like
 * "one big reverb wash", with all four faders sitting at 40%.
 */
function inferRoleFromName(name: string): 'percussion' | 'bass' | 'lead' | 'chord' | 'arpeggio' | 'pad' | null {
  const n = name.toLowerCase();
  if (/kick|snare|hat|clap|drum|perc|cymbal|rim/.test(n)) return 'percussion';
  if (/bass|sub/.test(n)) return 'bass';
  if (/chord|harm/.test(n)) return 'chord';
  if (/arp/.test(n)) return 'arpeggio';
  if (/pad|atmos|ambien|string|synth/.test(n)) return 'pad';
  if (/lead|melody|melodic|vocal|voice|horn|brass|flute|sax/.test(n)) return 'lead';
  return null;
}

/** Roles the preset table has a send level for. */
const PRESET_SEND_ROLES = new Set(['percussion', 'bass', 'lead', 'chord', 'arpeggio', 'pad']);

// ─── Per-channel ops ────────────────────────────────────────────────────────
// Strip space is scarce, so a control earns its place only if it is worth
// PLAYING — something you fire in time with the music. `echoBuildUp` is not:
// it runs a ~6 s timeline (ramp the send over 2 bars, mute the dry at the
// peak, restore) that you fire and then wait out, and its visible effect is
// the send fader moving on its own, which the fader already does under your
// hand. It stays in the registry — it is Scientist's signature move, AutoDub
// weights it, and keyboard / MIDI / MCP all still reach it — it just does not
// need a button here.
//
// Each channel strip shows these buttons alongside the hold-toggle + send
// knob. Label/title/moveId tuple keeps the rendering loop tight.
const CHANNEL_OPS: Array<{ label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold' }> = [
  { label: 'Mute',  title: 'Mute — silence this channel while held',          moveId: 'channelMute',     color: 'accent-error',      kind: 'hold' },
  { label: 'Throw', title: 'Throw — long echoThrow (4 beats + heavy tail)',   moveId: 'channelThrow',    color: 'accent-primary/70', kind: 'trigger' },
  { label: 'Echo',  title: 'Echo Throw — open tap + feedback spike',          moveId: 'echoThrow',       color: 'accent-primary',    kind: 'trigger' },
  { label: 'Skank', title: 'Skank Echo — catch ONE offbeat stab and throw it into a dotted-eighth echo (0.75 × beat), so the repeats land in the gaps before the next stab. The defining offbeat dub gesture.', moveId: 'skankEchoThrow', color: 'accent-highlight/70', kind: 'trigger' },
  { label: 'Float', title: 'Skank Float — same capture at a dotted quarter (1.5 × beat). The repeats drift 3:2 against the pulse so the echo floats at two-thirds tempo.', moveId: 'skankFloatThrow', color: 'accent-highlight/40', kind: 'trigger' },
  { label: '✦',    title: 'Dub Stab — short-sharp echo kiss',                 moveId: 'dubStab',         color: 'accent-highlight',  kind: 'trigger' },
  { label: 'Build', title: 'Echo Build Up — open this channel\'s dub send over two bars so the echoes pile up, then mute the dry source and let the delays carry alone.', moveId: 'echoBuildUp', color: 'accent-primary/50', kind: 'trigger' },
  { label: 'Emph',  title: 'Bass Emphasis — make the bass line already playing hit harder, rather than adding a new one.', moveId: 'bassEmphasis', color: 'accent-primary/40', kind: 'hold' },
];

// ─── Global moves ──────────────────────────────────────────────────────────
// Grouped by interaction type so performers can read the board at a glance:
//
//   CLICK  — tap once to fire (one-shot effect, no hold needed)
//   HOLD   — press + hold for exact duration, release to stop
//   TOGGLE — click once to activate, click again to deactivate (hands-free)
//
// `needsSend` marks moves that process bus audio; they're dimmed when no
// channel is sending into the bus (nothing to process).
interface GlobalMove {
  label: string;
  title: string;
  moveId: string;
  color: string;
  kind: 'trigger' | 'hold';
  group: 'click' | 'hold' | 'toggle' | 'rate';
  needsSend?: boolean;
}
const GLOBAL_MOVES: Array<GlobalMove> = [
  // ── CLICK — one-shot triggers ──
  { label: 'Slam',   title: 'Spring Slam — instant splash of spring reverb',     moveId: 'springSlam',        color: 'accent-success',     kind: 'trigger', group: 'click' },
  { label: 'Kick',   title: 'Spring Kick — punchier shorter spring hit',         moveId: 'springKick',        color: 'accent-success/70',  kind: 'trigger', group: 'click' },
  { label: 'Crack',  title: 'Snare Crack — bandpass noise burst',                moveId: 'snareCrack',        color: 'text-primary',       kind: 'trigger', group: 'click' },
  { label: 'Ping',   title: 'Sonar Ping — 1 kHz sine through the echo',         moveId: 'sonarPing',         color: 'accent-primary/70',  kind: 'trigger', group: 'click' },
  { label: 'Radio',  title: 'Radio Riser — pink noise sweep 200 Hz → 5 kHz',    moveId: 'radioRiser',        color: 'accent-warning/70',  kind: 'trigger', group: 'click' },
  { label: 'Sub',    title: 'Sub Swell — 55 Hz sine pulse to return',            moveId: 'subSwell',          color: 'accent-primary',     kind: 'trigger', group: 'click' },
  { label: 'STOP!',  title: 'Transport Tape Stop — hold to slow tempo+pitch to floor (LibOpenMPT), releases on let go', moveId: 'transportTapeStop', color: 'accent-error', kind: 'hold', group: 'hold' },
  { label: 'Reverse',  title: 'Reverse Echo — last 0.4 s of bus audio reversed and echoed',  moveId: 'reverseEcho',   color: 'accent-highlight/70', kind: 'trigger', group: 'click', needsSend: true },
  { label: 'Backward', title: 'Backward Reverb — last 0.8 s reversed through full bus chain', moveId: 'backwardReverb', color: 'accent-highlight',   kind: 'trigger', group: 'click', needsSend: true },
  { label: 'Throw',    title: 'Echo Throw — sweep echo delay time (pitch whoosh)',  moveId: 'delayTimeThrow',  color: 'accent-highlight/70', kind: 'trigger', group: 'click', needsSend: true },
  { label: '380ms',  title: 'Tubby 380 — snap echo rate to 380 ms (click again to restore)',              moveId: 'delayPreset380',    color: 'accent-secondary/70', kind: 'hold', group: 'rate' },
  { label: 'Dotted', title: 'Dotted — snap echo rate to dotted-8th, BPM-synced (click again to restore)', moveId: 'delayPresetDotted', color: 'accent-secondary/70', kind: 'hold', group: 'rate' },
  { label: '1/4',    title: '1/4 — snap echo rate to quarter note, BPM-synced (click again to restore)',  moveId: 'delayPresetQuarter', color: 'accent-secondary/70', kind: 'hold', group: 'rate' },
  { label: '1/8',    title: '1/8 — snap echo rate to 8th note, BPM-synced (click again to restore)',      moveId: 'delayPreset8th',    color: 'accent-secondary/70', kind: 'hold', group: 'rate' },
  { label: 'Triplet', title: 'Triplet — snap echo rate to triplet, BPM-synced (click again to restore)', moveId: 'delayPresetTriplet', color: 'accent-secondary/70', kind: 'hold', group: 'rate' },
  { label: '1/16',   title: '1/16 — snap echo rate to 16th note, BPM-synced (click again to restore)',   moveId: 'delayPreset16th',   color: 'accent-secondary/70', kind: 'hold', group: 'rate' },
  { label: 'x2',     title: 'Doubler — 25ms slapback echo (click again to restore)',                      moveId: 'delayPresetDoubler', color: 'accent-secondary/70', kind: 'hold', group: 'rate' },

  // ── HOLD — press and hold for precise duration, release to stop ──
  { label: 'Rise',       title: 'HPF Rise — Altec Big Knob: steps HPF up through positions, sweeps back on release', moveId: 'hpfRise',    color: 'accent-primary',     kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Filter',    title: 'Filter Drop — LPF sweeps down while held, opens on release',  moveId: 'filterDrop',  color: 'accent-secondary',   kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Tape Stop', title: 'Tape Stop — bus LPF + echo-rate collapses while held, restores on release', moveId: 'tapeStop', color: 'accent-secondary/70', kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Drop',         title: 'Master Drop — mutes dry signal while held; echo+spring tail survives', moveId: 'masterDrop',  color: 'accent-error/70', kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Version Drop', title: 'Version Drop — mute all melodic channels (lead/chord/pad); leave bass + drums. Classic dub breakdown.', moveId: 'versionDrop', color: 'accent-error',    kind: 'hold', group: 'hold' },
  { label: 'Riddim',       title: 'Riddim Section — drop to drums and bass, then the skank creeps back in soaked in echo on the next bar line. Keeps the lowest-register part even when role detection finds no bass.', moveId: 'riddimSection', color: 'accent-error/60', kind: 'hold', group: 'hold' },
  { label: 'Toast',        title: 'Toast — route DJ mic into bus while held (auto-starts mic)', moveId: 'toast', color: 'accent-success/70', kind: 'hold', group: 'hold' },
  { label: 'Siren',     title: 'Dub Siren — Rasta-box pitch-swept synth while held',           moveId: 'dubSiren',     color: 'accent-warning',  kind: 'hold', group: 'hold' },
  { label: 'Scream',    title: 'Tubby Scream — reverb self-feedback, rising metallic cry',      moveId: 'tubbyScream',  color: 'accent-error',    kind: 'hold', group: 'hold' },
  { label: 'Bass',      title: 'Osc Bass — self-oscillating LPF bass drone while held',         moveId: 'oscBass',      color: 'accent-primary',  kind: 'hold', group: 'hold' },
  { label: 'Crush Bass', title: 'Crush Bass — 3-bit quantize saw drone while held',             moveId: 'crushBass',    color: 'accent-error/70', kind: 'hold', group: 'hold' },
  // A hold, not a toggle: "ghost should no be a toggle it should be a hold"
  // (2026-09-22). The move was already `kind: 'hold'`; only the row it sat in
  // promised click-on / click-off.
  { label: 'Ghost',      title: 'Ghost Reverb — extra reverb decay on channels while held',     moveId: 'ghostReverb',  color: 'accent-secondary',   kind: 'hold', group: 'hold', needsSend: true },

  // ── TOGGLE — click once to activate, click again to deactivate (hands-free) ──
  { label: 'Wide',       title: 'Stereo Doubler — 20ms cross-fed widening (toggle)',               moveId: 'stereoDoubler', color: 'accent-highlight',   kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Wobble',     title: 'Tape Wobble — LFO on echo rate (toggle)',                         moveId: 'tapeWobble',   color: 'accent-warning/70',  kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Sub Harm',   title: 'Sub Harmonic — env-follower sub pulse on every transient (toggle)', moveId: 'subHarmonic', color: 'accent-primary/70', kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Liquid',     title: 'Liquid Sweep — comb filter / phaser swirl on the bus return (toggle)', moveId: 'combSweep', color: 'accent-secondary/80', kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Sweep',      title: 'EQ Sweep — resonant filter sweep (toggle)',                       moveId: 'eqSweep',      color: 'accent-highlight/70', kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Ring',       title: 'Ring Mod — metallic ring modulation (toggle)',                    moveId: 'ringMod',      color: 'accent-warning',     kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Starve',     title: 'Voltage Starve — bit-crush degradation (toggle)',                 moveId: 'voltageStarve', color: 'accent-error/70',   kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Ping-Pong', title: 'Mad Professor Ping-Pong — Ariwa SDE-3000 L/R asymmetric stereo delay (toggle)', moveId: 'madProfPingPong', color: 'accent-highlight/70', kind: 'hold', group: 'toggle', needsSend: true },
];

// Map color tokens to button class fragments. Keeps Tailwind's JIT happy —
// we can't build class names dynamically with string concatenation.
// text-text-inverse = #1a1a1a (near-black). Only works on bright/light accent
// backgrounds. For dark or semi-transparent accents use text-white instead.
/**
 * The move rows.
 *
 * They used to be `flex-wrap`, so every button was as wide as its own label and
 * nothing lined up between rows: Slam/Kick/Crack sat over 380ms/Dotted/1/4 at
 * three different pitches. Asked for on 2026-09-21 as equal columns.
 *
 * `auto-fill` + `1fr` gives every button the same width and, because all four
 * rows share the same track definition and the same container width, the same
 * COLUMN BOUNDARIES across rows. The 7rem floor is set by the longest label
 * ("Crush Bass", "Version Drop"); below that the row drops a column rather
 * than shrinking a button under its text.
 */
const MOVE_ROW_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1.5 flex-1 min-w-0';

const colorClasses = (token: string, active: boolean, size: 'md' | 'sm' = 'md') => {
  // nowrap: on the column grid a wrapped label would make one button taller
  // than its row.
  // 'sm' is the channel-card size: nine ops in a 3x3 grid beside the fader.
  // At 'md' the same nine stacked in one column ran ~600 px and the deck,
  // capped at 60 % of the viewport, clipped every card — "the sliders dont
  // fit not even in fullscreen" (2026-09-23, asked several times).
  const base = size === 'sm'
    ? 'px-1 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap transition-all duration-150 '
    : 'px-2.5 py-1 rounded border text-xs font-bold whitespace-nowrap transition-all duration-150 ';
  const idle = 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary ';
  switch (token) {
    // Bright opaque backgrounds — dark text has 9-12:1 contrast
    case 'accent-primary':      return base + (active ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-[0_0_6px_var(--color-accent-primary)]' : idle + 'hover:border-accent-primary hover:text-accent-primary');
    case 'accent-highlight':    return base + (active ? 'bg-accent-highlight text-text-inverse border-accent-highlight' : idle + 'hover:border-accent-highlight hover:text-accent-highlight');
    case 'accent-warning':      return base + (active ? 'bg-accent-warning text-text-inverse border-accent-warning' : idle + 'hover:border-accent-warning hover:text-accent-warning');
    case 'accent-success':      return base + (active ? 'bg-accent-success text-text-inverse border-accent-success' : idle + 'hover:border-accent-success hover:text-accent-success');
    // Dark or semi-transparent backgrounds — white text is required for visibility
    case 'accent-primary/70':   return base + (active ? 'bg-accent-primary/70 text-white border-accent-primary/70' : idle + 'hover:border-accent-primary/70 hover:text-accent-primary');
    case 'accent-secondary':    return base + (active ? 'bg-accent-secondary text-white border-accent-secondary' : idle + 'hover:border-accent-secondary hover:text-accent-secondary');
    case 'accent-secondary/70': return base + (active ? 'bg-accent-secondary/70 text-white border-accent-secondary/70' : idle + 'hover:border-accent-secondary/70 hover:text-accent-secondary');
    case 'accent-highlight/70': return base + (active ? 'bg-accent-highlight/70 text-white border-accent-highlight/70' : idle + 'hover:border-accent-highlight/70 hover:text-accent-highlight');
    case 'accent-warning/70':   return base + (active ? 'bg-accent-warning/70 text-white border-accent-warning/70' : idle + 'hover:border-accent-warning/70 hover:text-accent-warning');
    case 'accent-error':        return base + (active ? 'bg-accent-error text-white border-accent-error' : idle + 'hover:border-accent-error hover:text-accent-error');
    case 'accent-error/70':     return base + (active ? 'bg-accent-error/70 text-white border-accent-error/70' : idle + 'hover:border-accent-error/70 hover:text-accent-error');
    case 'accent-success/70':   return base + (active ? 'bg-accent-success/70 text-white border-accent-success/70' : idle + 'hover:border-accent-success/70 hover:text-accent-success');
    case 'text-primary':        return base + (active ? 'bg-text-primary text-dark-bg border-text-primary' : idle + 'hover:border-text-primary hover:text-text-primary');
    default:                    return base + idle;
  }
};

export const DubDeckStrip: React.FC = () => {
  const armed = useDubStore(s => s.armed);
  const setArmed = useDubStore(s => s.setArmed);
  const lastCapturedAt = useDubStore(s => s.lastCapturedAt);
  const stripCollapsed = useDubStore(s => s.stripCollapsed);
  const toggleStripCollapsed = useDubStore(s => s.toggleStripCollapsed);
  const setStripCollapsed = useDubStore(s => s.setStripCollapsed);
  const ghostBus = useDubStore(s => s.ghostBus);
  const setGhostBus = useDubStore(s => s.setGhostBus);
  const masterChorus = useDubStore(s => s.masterChorus);
  const setMasterChorus = useDubStore(s => s.setMasterChorus);
  const clubSim = useDubStore(s => s.clubSim);
  const setClubSim = useDubStore(s => s.setClubSim);
  const chainOrder = useDrumPadStore(s => s.dubBus.chainOrder ?? 'echoSpring');
  const vinylLevel = useDubStore(s => s.vinylLevel);
  const setVinylLevel = useDubStore(s => s.setVinylLevel);
  const quantize = useDubStore(s => s.quantize);
  const setQuantize = useDubStore(s => s.setQuantize);

  const autoDubEnabled = useDubStore(s => s.autoDubEnabled);
  const setAutoDubEnabled = useDubStore(s => s.setAutoDubEnabled);
  const autoDubPersona = useDubStore(s => s.autoDubPersona);
  const setAutoDubPersona = useDubStore(s => s.setAutoDubPersona);
  const setAutoDubIntensity = useDubStore(s => s.setAutoDubIntensity);
  const autoDubEqMode = useDubStore(s => s.autoDubEqMode ?? 'both');
  const autoDubIntensity = useDubStore(s => s.autoDubIntensity);
  const setAutoDubEqMode = useDubStore(s => s.setAutoDubEqMode);

  const busEnabled = useDrumPadStore(s => s.dubBus.enabled);
  const setDubBus = useDrumPadStore(s => s.setDubBus);
  const dubBusSettings = useDrumPadStore(s => s.dubBus);
  const dubBusStash = useDrumPadStore(s => s.dubBusStash);
  const swapDubBusStash = useDrumPadStore(s => s.swapDubBusStash);

  // Auto Dub settings panel (intensity + blacklist) — opened by ⚙ icon
  const [autoDubSettingsOpen, setAutoDubSettingsOpen] = useState(false);
  // Active tab — PERFORM is default; EQ / BUS / RECORD for deeper panels
  const [activeTab, setActiveTab] = useState<'perform' | 'eq' | 'bus'>('perform');

  /**
   * Deck faders that follow the PERFORMER, not only the user.
   *
   * Moves modulate the audio nodes directly and restore on release, so these
   * settings still hold what the user set — which is correct, and is also why
   * the faders sat still through a version drop. `DubBus.announceHeld`
   * publishes the performed value for as long as a move holds it; these read
   * that and fall back to the stored value once it lets go.
   *
   * Only the controls a move actually drives are wired. BASS, MID and WIDTH
   * are not modulated by any move — `startStereoDoubler` builds its own
   * parallel nodes rather than touching `stereoWidth` — so animating them
   * would be inventing motion the audio is not making.
   */
  const liveReturnGain = useLiveDubParam('dub.returnGain', dubBusSettings.returnGain);
  const liveSweepAmount = useLiveDubParam('dub.sweepAmount', dubBusSettings.sweepAmount);
  // Moves modulate echo feedback constantly (every throw), so this follows the
  // performer the same way FX WET does.
  const liveEchoIntensity = useLiveDubParam('dub.echoIntensity', dubBusSettings.echoIntensity);
  const liveSweepRateHz = useLiveDubParam(
    'dub.sweepRateHz', dubBusSettings.sweepRateHz, denormalizeSweepRate,
  );
  const autoDubSettingsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Derive current style. For presets with unique characterPreset values
  // (tubby/scientist/perry/madProfessor/jammy) the characterPreset alone
  // identifies the style. For 'custom' characterPreset, multiple styles map
  // here (Custom and Prince Jammy both have null/custom preset) — use the
  // persona to disambiguate between them.
  const currentStyle = resolveCurrentDubStyle(dubBusSettings.characterPreset, autoDubPersona);

  const channels = useMixerStore(s => s.channels);
  const setChannelDubSend = useMixerStore(s => s.setChannelDubSend);
  const setChannelDubRole = useMixerStore(s => s.setChannelDubRole);
  const setChannelDubFilter = useMixerStore(s => s.setChannelDubFilter);
  const setChannelDubReverbSend = useMixerStore(s => s.setChannelDubReverbSend);
  const setChannelDubSweepAmount = useMixerStore(s => s.setChannelDubSweepAmount);
  const patternIdx = useTrackerStore(s => s.currentPatternIndex);
  const pattern = useTrackerStore(s => s.patterns[patternIdx]);

  // Click-flash per channel (kept for visual feedback on Echo Throw fire).
  const [flashedChannel, setFlashedChannel] = useState<number | null>(null);
  // Tooltips instead of a reserved status line: the line held a row of
  // vertical space open at all times to describe one button occasionally.
  const { hoverProps, tooltip: moveTooltip, hide: hideTooltip } = useHoverTooltip();
  useEffect(() => {
    if (flashedChannel === null) return;
    const t = setTimeout(() => setFlashedChannel(null), 400);
    return () => clearTimeout(t);
  }, [flashedChannel]);

  // Auto-detected channel roles — polled from AutoDub at 500ms so the UI
  // reflects what the classifier currently thinks even while it's running.
  const [autoRoles, setAutoRoles] = useState<readonly string[]>([]);

  /**
   * What to call each channel strip.
   *
   * The label was hardcoded `CH {i + 1}` and the real name lived only in the
   * tooltip, so the deck showed placeholders even after the tracker had named
   * the channels `Kick`, `Bass 1` and `Chords`. The mixer keeps its own names
   * and leaves them at `CH n` unless a user types one, so neither store alone
   * is the answer — see `lib/tracker/channelNames.ts`.
   */
  const channelLabels = useMemo(
    () => resolveChannelNames(
      channels.map(c => c?.name ?? null),
      pattern?.channels?.map(c => c?.name ?? null) ?? [],
    ),
    [channels, pattern],
  );
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return; // no UI to update in a hidden tab
      setAutoRoles(getAutoDubCurrentRoles());
    }, 500);
    return () => clearInterval(t);
  }, []);

  // Dub-hold state — sustained Echo Throw on a channel (one tap open for as
  // long as the toggle is on). Decoupled from the M/T/E/✦ row so the user
  // can leave a tap open while firing stabs.
  const [heldChannels, setHeldChannels] = useState<Set<number>>(new Set());
  const heldReleasers = useRef<Map<number, () => void>>(new Map());

  // Toggle state — click-once to activate, click-again to deactivate.
  // Separate from heldMoves (which are physical press-and-hold).
  const [toggledMoves, setToggledMoves] = useState<Set<string>>(new Set());
  const toggleDisposers = useRef<Map<string, () => void>>(new Map());

  // Persistent mic routing — microphone input wired into the dub bus input.
  // Separate from the Toast hold move (which does momentary mic + music ducking).
  const [micActive, setMicActive] = useState(false);
  const [micGain, setMicGain] = useState(0.8);

  /**
   * Touching a dub control IS the intent to dub, so arm the bus rather than
   * swallowing the gesture.
   *
   * Every dub control used to open with `if (!busEnabled) return;`. Clicking a
   * pad, a move or AutoDub with the bus off did nothing and said nothing —
   * reported 2026-09-22 ("i cant turn autodub off if dubbus is disabled, and
   * why can it even be enabled when dub bus is disabled?"). Disabling the
   * controls instead is worse: it makes the deck look broken and leaves
   * AutoDub unreachable from the state it is stuck in.
   *
   * Arming is a store write, and the bus graph is spliced by an effect on the
   * next commit, so an action fired in the same tick would reach a bus that is
   * not wired yet. `run` therefore executes immediately when the bus is
   * already on, and otherwise waits for `getActiveDubBus()` to appear before
   * running — bounded, so a bus that never comes up drops the action instead
   * of leaving a callback alive for ever.
   *
   * Returns true when the action ran synchronously, so callers that need a
   * handle back (a hold's gesture id) can tell the two cases apart.
   */
  const runWithBus = useCallback((action: () => void): boolean => {
    if (busEnabled && getActiveDubBus()) { action(); return true; }
    setDubBus({ enabled: true, characterPreset: dubBusSettings.characterPreset });
    let framesLeft = 30; // ~0.5s at 60Hz; the splice lands in one or two.
    const waitForBus = () => {
      if (getActiveDubBus()) { action(); return; }
      if (framesLeft-- <= 0) {
        console.warn('[DubDeck] bus did not come up; dropping the queued action');
        return;
      }
      requestAnimationFrame(waitForBus);
    };
    requestAnimationFrame(waitForBus);
    return false;
  }, [busEnabled, setDubBus, dubBusSettings.characterPreset]);

  /**
   * Bus audition (X6) — the releaser, held for as long as the button is.
   *
   * A ref rather than state for the releaser itself: it is an engine handle,
   * not something the view renders. The boolean beside it is what the button
   * lights up from.
   */
  const auditionReleaseRef = useRef<(() => void) | null>(null);
  const [auditioning, setAuditioning] = useState(false);

  const beginBusAudition = useCallback(() => {
    if (auditionReleaseRef.current) return;
    // Arm the bus first, like every other dub control — the audition used to
    // light up and do nothing when the bus was off, because `beginAudition`
    // handed back a no-op releaser that read as success.
    runWithBus(() => {
      const release = getActiveDubBus()?.beginAudition();
      if (!release) {
        // The bus declined: either it still cannot act, or no colour stage is
        // engaged to solo away. Say so rather than lighting a dead button.
        notify.info('Audition: no colour stage is engaged — nothing to solo away');
        return;
      }
      auditionReleaseRef.current = release;
      setAuditioning(true);
    });
  }, [runWithBus]);

  const endBusAudition = useCallback(() => {
    const release = auditionReleaseRef.current;
    auditionReleaseRef.current = null;
    setAuditioning(false);
    if (release) { try { release(); } catch { /* ok */ } }
  }, []);

  // An unmount mid-hold must not leave the colour switched off with nothing
  // left to switch it back on.
  useEffect(() => endBusAudition, [endBusAudition]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTapRef = useRef<{ setGain(g: number): void; disconnect(): void } | null>(null);

  // Rate preset radio group — at most ONE rate preset active at a time.
  // Clicking a new rate deactivates the old one (restoring its saved rate)
  // before activating the new one. Clicking the active one turns it off.
  const [activeRatePreset, setActiveRatePreset] = useState<string | null>(null);
  const rateDisposer = useRef<(() => void) | null>(null);
  // Stable ref so the BPM-sync effect can read the current preset without
  // needing it in its dependency array (which would cause excessive re-runs).
  const activeRatePresetRef = useRef<string | null>(null);
  useEffect(() => { activeRatePresetRef.current = activeRatePreset; }, [activeRatePreset]);

  // Generic per-move "active hold" tracking — covers channel-scoped holds
  // (e.g. channelMute per channel) AND global holds (filterDrop, dubSiren,
  // tapeWobble, masterDrop, toast). Keyed by `${moveId}:${channelId ?? 'g'}`
  // so a single pointer press/release cycle maps cleanly to fire → dispose.
  /**
   * Held moves are owned by the GestureEngine, not by this component.
   *
   * These used to be disposer closures in a ref: when the component unmounted
   * or hot-reloaded, every releaser went with it and whatever was held — a
   * siren, a crush bass — kept sounding with nothing able to stop it. Reported
   * 2026-09-18 as "the siren and lots of other noise is lingering now", with
   * eight `holdStart dubSiren` in the log and no release.
   *
   * The engine outlives this component, so a transport stop, a panic, or the
   * unmount cleanup below can always let go. The map now holds gesture IDS.
   */
  const activeHolds = useRef<Map<string, string>>(new Map());
  /** Holds pressed while the bus was still arming, keyed like `activeHolds`. */
  const pendingHolds = useRef<Set<string>>(new Set());

  const [heldMoves, setHeldMoves] = useState<Set<string>>(new Set());

  // ── Active-fire animation state ───────────────────────────────────────────
  // Tracks ALL currently-firing moves (auto-dub, manual triggers, holds) so
  // buttons and faders animate while the move is alive. Keyed by
  // `moveId:channelId|g`. One-shots auto-expire after 400ms; held moves
  // clear on DubReleaseEvent.
  const [activeFires, setActiveFires] = useState<Set<string>>(new Set());
  const fireTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Map invocationId → moveKey so we can clear on release
  const invocationToKey = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const unsubFire = subscribeDubRouter((ev) => {
      const key = `${ev.moveId}:${ev.channelId ?? 'g'}`;
      setActiveFires(prev => new Set(prev).add(key));
      invocationToKey.current.set(ev.invocationId, key);

      // Clear any existing expiry timer for this key
      const existing = fireTimers.current.get(key);
      if (existing) clearTimeout(existing);

      // One-shots (triggers) auto-expire after 400ms visual flash.
      // Holds stay lit until the release event arrives.
      const t = setTimeout(() => {
        fireTimers.current.delete(key);
        setActiveFires(prev => { const n = new Set(prev); n.delete(key); return n; });
      }, 400);
      fireTimers.current.set(key, t);
    });
    const unsubRelease = subscribeDubRelease((ev) => {
      const key = invocationToKey.current.get(ev.invocationId);
      invocationToKey.current.delete(ev.invocationId);
      if (!key) return;
      // Clear the expiry timer and remove immediately
      const t = fireTimers.current.get(key);
      if (t) { clearTimeout(t); fireTimers.current.delete(key); }
      setActiveFires(prev => { const n = new Set(prev); n.delete(key); return n; });
    });
    return () => { unsubFire(); unsubRelease(); };
  }, []);

  /**
   * Is this move firing right now, on ANY channel?
   *
   * `activeFires` is keyed `moveId:channelId|g`, and the global move rows were
   * matching `moveId:g` only. AutoDub fires channel-scoped moves WITH a
   * channel — an `echoThrow` on channel 2 is `echoThrow:2` — so the performer
   * could work away and the buttons stayed dark, which read as "the AI is
   * doing nothing". Reported 2026-09-19 as "I see almost no action here".
   *
   * The button is the move, not the move-on-one-channel, so any channel counts.
   * (The per-channel grid below has always checked every channel; this is the
   * same idea for the rows that show one button per move.)
   */
  const isMoveFiring = useCallback((moveId: string): boolean => {
    const prefix = `${moveId}:`;
    for (const key of activeFires) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }, [activeFires]);

  const releaseAllHeld = useCallback(() => {
    for (const release of heldReleasers.current.values()) {
      try { release(); } catch { /* ok */ }
    }
    heldReleasers.current.clear();
    setHeldChannels(new Set());
    // Held moves are gesture IDs now — the engine owns their lifetime.
    for (const id of activeHolds.current.values()) {
      try { endGesture(id); } catch { /* ok */ }
    }
    activeHolds.current.clear();
    setHeldMoves(new Set());
    // Also release all toggled moves
    for (const release of toggleDisposers.current.values()) {
      try { release(); } catch { /* ok */ }
    }
    toggleDisposers.current.clear();
    setToggledMoves(new Set());
    // Release active rate preset
    if (rateDisposer.current) {
      try { rateDisposer.current(); } catch { /* ok */ }
      rateDisposer.current = null;
    }
    setActiveRatePreset(null);
    // Release persistent mic tap
    if (micTapRef.current) {
      try { micTapRef.current.disconnect(); } catch { /* ok */ }
      micTapRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setMicActive(false);
  }, []);

  useEffect(() => {
    // Tracker view is the only mount point for DubDeckStrip. PadGrid and
    // DJSamplerPanel also listen to `dub-panic` and call engine.dubPanic(),
    // but neither is mounted while the tracker is visible — so without this
    // handler the audio tail keeps running after KILL even though the
    // HOLD buttons visibly release.
    const handler = () => {
      releaseAllHeld();
      try { ensureDrumPadEngine().dubPanic(); } catch (e) { console.warn('[DubDeckStrip] dubPanic failed:', e); }
      // Do NOT disable the bus — KILL drains effects but keeps the deck open
      // so the performer can re-engage immediately without re-opening the strip.
      setArmed(false);
    };
    window.addEventListener('dub-panic', handler);
    return () => window.removeEventListener('dub-panic', handler);
  }, [releaseAllHeld, setArmed]);
  useEffect(() => {
    if (!busEnabled) releaseAllHeld();
  }, [busEnabled, releaseAllHeld]);
  useEffect(() => releaseAllHeld, [releaseAllHeld]);

  // Bus enable auto-expands the strip (enabling dub = showing the deck) but
  // no longer touches editor-fullscreen directly. Fullscreen follows the
  // strip-expanded state via the effect below, which means the user can also
  // get fullscreen by clicking DUB DECK without arming the bus.
  const prevBusEnabledRef = useRef<boolean | null>(null);
  useEffect(() => {
    const isInitialMount = prevBusEnabledRef.current === null;
    const changed = prevBusEnabledRef.current !== busEnabled;
    prevBusEnabledRef.current = busEnabled;
    if (!changed) return;
    // ARMING the bus expands the deck. Finding it already armed at boot is not
    // an arming action, so the initial mount only records the value and leaves
    // the deck at the store's default (collapsed). Before this, a session that
    // started with the bus enabled — which AutoDub and a restored project both
    // do — opened with the deck expanded every time.
    if (isInitialMount) return;
    setStripCollapsed(!busEnabled);
  }, [busEnabled, setStripCollapsed]);

  // Editor-fullscreen follows the strip-expanded state. Opening the Dub Deck
  // (DUB DECK ▾) drops the editor into fullscreen mode so the performer has
  // room to pattern + dub at once; collapsing it (DUB DECK ▸) restores the
  // normal split layout. Runs on mount too so a persisted-expanded session
  // reloads straight into fullscreen.
  const prevStripCollapsedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const isInitialMount = prevStripCollapsedRef.current === null;
    const changed = prevStripCollapsedRef.current !== stripCollapsed;
    prevStripCollapsedRef.current = stripCollapsed;
    if (!changed) return;
    const apply = () => useUIStore.getState().setEditorFullscreen(!stripCollapsed);
    if (isInitialMount) {
      const handle = requestAnimationFrame(apply);
      return () => cancelAnimationFrame(handle);
    }
    apply();
  }, [stripCollapsed]);

  useEffect(() => {
    const engine = ensureDrumPadEngine();
    const bus = engine.getDubBus();
    // NOTE: DubRouter registration, cold-channel activation ownership, and the
    // initial setupDubBusWiring bootstrap now happen inside DrumPadEngine so
    // formats still receive dub routing before this view mounts. Keep this
    // best-effort re-run because the bus can be recreated mid-session.
    try {
      const mgr = getChannelRoutedEffectsManager(getToneEngine().masterEffectsInput);
      mgr.setupDubBusWiring(bus.inputNode, bus);
    } catch (e) {
      console.warn('[DubDeckStrip] setupDubBusWiring failed:', e);
    }
  }, []);

  // Master-insert TONE EQ — the bass shelf + mid scoop + stereo width spliced
  // into the master signal path between masterEffectsInput and blepInput, so
  // the BASS/MID/WIDTH sliders shape the WHOLE mix (dry + wet together),
  // matching real dub engineering where the master bus is EQ'd, not just the
  // return.
  //
  // Deliberately NOT a useEffect here any more. This component used to wire it
  // on `busEnabled` and unwire it on teardown, which made the splice live and
  // die with the component: on 2026-09-22 a user opened dev tools, the window
  // crossed the 768 px breakpoint, TrackerView swapped to MobileTrackerView,
  // this strip unmounted, and `unwireMasterInsert` pulled the master EQ out of
  // the signal path while the bus was still enabled with return_ at 0.750 —
  // "i got a lot more reverb etc all of a sudden". A layout change must never
  // alter the audio graph.
  //
  // The splice now belongs to the bus, keyed on whether the bus is ENABLED:
  // DrumPadEngine registers the endpoints once at bootstrap
  // (registerMasterInsertPoint) and DubBus re-derives the graph from its own
  // `enabled` flag. Do not reintroduce a mount-scoped effect for this.

  useEffect(() => {
    try {
      const bus = ensureDrumPadEngine().getDubBus();
      bus.setMasterChorus(masterChorus);
    } catch (e) {
      console.warn('[DubDeckStrip] setMasterChorus failed:', e);
    }
  }, [masterChorus]);

  useEffect(() => {
    try {
      const bus = ensureDrumPadEngine().getDubBus();
      bus.setClubSim(clubSim);
    } catch (e) {
      console.warn('[DubDeckStrip] setClubSim failed:', e);
    }
  }, [clubSim]);

  useEffect(() => {
    try {
      const bus = ensureDrumPadEngine().getDubBus();
      bus.setVinylLevel(vinylLevel);
    } catch (e) {
      console.warn('[DubDeckStrip] setVinylLevel failed:', e);
    }
  }, [vinylLevel]);

  // Tracker transport BPM — when the song BPM changes (F-command, tempo
  // tool), any active echoSyncDivision should re-derive echoRateMs so the
  // delay stays locked to the grid. Before G12 the rate was frozen at
  // division-selection time.

  // The store -> engine settings mirror used to live here, as a 100 ms
  // debounced effect that computed the BPM-synced echo rate and pushed the
  // whole settings object.
  //
  // It now belongs to DrumPadEngine (`startDubSettingsMirror`), for the same
  // reason the master-insert splice moved to DubBus: engine state must not
  // depend on a component being rendered. With it here, any layout that does
  // not mount this strip — the mobile tracker tree is exactly that — left the
  // bus never learning `enabled`, so the master insert never wired and the
  // user's saved settings were never applied.
  //
  // Do not reintroduce it. The engine also owns the BPM arithmetic now, which
  // is where it belonged: the rate the user picks is a DIVISION of the tempo,
  // and whether to sync at all depends on `bus.isRateOverridden()`.

  // G13: sidechain source router. When sidechainSource flips between
  // 'bus' and 'channel' (or the channel index changes), re-wire the
  // isolation tap from ChannelRoutedEffects into the dub bus's sidechain
  // detector. 'bus' mode removes any active tap (bus self-detects).
  useEffect(() => {
    const source = dubBusSettings.sidechainSource;
    const channelIndex = dubBusSettings.sidechainChannelIndex;
    if (source !== 'channel') return;
    let scInputNode: AudioNode | null = null;
    let activeChannel: number | null = null;
    (async () => {
      try {
        const bus = ensureDrumPadEngine().getDubBus();
        scInputNode = bus.getSidechainInput();
        const mgr = getChannelRoutedEffectsManager();
        const ok = await mgr.addSidechainTap(channelIndex, scInputNode);
        if (ok) activeChannel = channelIndex;
      } catch (e) {
        console.warn('[DubDeckStrip] sidechain tap failed:', e);
      }
    })();
    return () => {
      if (activeChannel !== null && scInputNode) {
        try {
          getChannelRoutedEffectsManager().removeSidechainTap(activeChannel, scInputNode);
        } catch { /* ok */ }
      }
    };
  }, [dubBusSettings.sidechainSource, dubBusSettings.sidechainChannelIndex]);

  useEffect(() => {
    return startDubRecorder();
  }, []);

  useEffect(() => {
    return subscribeDubRouter((ev) => {
      if (ev.channelId === undefined) return;
      setFlashedChannel(ev.channelId);
    });
  }, []);

  useEffect(() => {
    dubLanePlayer.setLane(pattern?.dubLane ?? null);
  }, [pattern]);

  // Time-mode rAF driver — row-mode lanes are driven by the tracker tick
  // loop in useTransportStore, but time-mode lanes (raw SID / SC68) have no
  // row tick. Poll song-time at rAF rate and forward to onTimeTick while the
  // active lane is time-indexed.
  useEffect(() => {
    if (pattern?.dubLane?.kind !== 'time') return;
    let rafId = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      dubLanePlayer.onTimeTick(getSongTimeSec());
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pattern]);

  const visibleChannelCount = pattern?.channels.length ?? 4;
  // Whether ANY visible channel has a non-zero dub-send. This drives the
  // ALL / NONE button and the echo drain when the last send closes — for
  // those, any non-zero value is a send, the BLEED floor included.
  const anySend = channels.slice(0, visibleChannelCount).some(c => (c?.dubSend ?? 0) > 0);
  // Whether the bus is fed enough for a RETURN PROCESSOR to be heard. This is
  // the one that dims Wide / Ring / Liquid and shows "raise a CH send to
  // hear", and for it the BLEED floor is not a send: with BLEED on and
  // nothing raised, `anySend` was true, the hint never showed, and the moves
  // ran on near-silence (busInput 0.0077, 2026-09-23) and were reported dead.
  const anyAudibleSend = anySendAudible(channels.slice(0, visibleChannelCount).map(c => c?.dubSend));

  // Master send value — the max of all visible channel sends. Used as
  // the display/control value for the master fader.
  const masterSendValue = Math.max(
    0,
    ...channels.slice(0, visibleChannelCount).map(c => c?.dubSend ?? 0),
  );
  // Drain echo feedback when all channel sends go to 0 — prevents the
  // Space Echo (and other delay engines) from sustaining or growing
  // indefinitely via their feedback loops when there's no input signal.
  const prevAnySendRef = useRef(anySend);
  useEffect(() => {
    const wasActive = prevAnySendRef.current;
    prevAnySendRef.current = anySend;
    if (wasActive && !anySend && busEnabled) {
      try { ensureDrumPadEngine().getDubBus().drainEchoContent(); } catch { /* ok */ }
    }
  }, [anySend, busEnabled]);

  // Previously auto-seeded every channel's dubSend to 0.4 on bus-enable
  // for instant gratification. Removed — it turned "enable bus" into
  // "everything gets bathed in echo+spring" which drowned master insert
  // effects like JA Press. Bus now starts silent; user dials sends up
  // explicitly or uses HOLD / moves to open channel taps momentarily.

  // Ghost Bus — when enabled, any channel whose send is 0 gets floored to
  // GHOST_SEND_FLOOR (~-36 dB) so it bleeds through the dub return even when
  // the main-mix mute is on. When disabled, floor is lifted; user's explicit
  // non-zero sends are NEVER touched.
  const priorSendsBeforeGhost = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    if (!busEnabled) return;
    if (ghostBus) {
      // Record prior zeros so we can restore on toggle-off
      for (let i = 0; i < visibleChannelCount; i++) {
        const cur = channels[i]?.dubSend ?? 0;
        if (cur === 0) {
          priorSendsBeforeGhost.current.set(i, 0);
          setChannelDubSend(i, GHOST_SEND_FLOOR);
        }
      }
    } else {
      for (const [i, prior] of priorSendsBeforeGhost.current.entries()) {
        const cur = channels[i]?.dubSend ?? 0;
        // Only reset channels that are still at the ghost level (user hasn't
        // dragged them up manually)
        if (Math.abs(cur - GHOST_SEND_FLOOR) < 0.001) {
          setChannelDubSend(i, prior);
        }
      }
      priorSendsBeforeGhost.current.clear();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostBus, busEnabled, visibleChannelCount]);

  const capturedRecently = lastCapturedAt !== null && (performance.now() - lastCapturedAt) < 300;

  // Apply a unified dub style — sets the bus character preset (sound) and AutoDub persona.
  // Does NOT auto-apply per-channel sends/FX — those are applied explicitly via ▶ audition
  // or the "Apply Sends" action. Auto-applying sends immediately on style change caused
  // the comb-sweep per-channel FX (sweepAmount 0.75, feedback 0.70) to start running on
  // all percussion channels instantly, sustaining tones from any existing echo tails.
  const applyStyle = useCallback((styleId: string) => {
    const style = DUB_STYLES.find(s => s.id === styleId) ?? CUSTOM_DUB_STYLE;
    // setDubBus with characterPreset applies all bus overrides (EQ, echo, spring, etc.)
    setDubBus({ characterPreset: style.characterPreset ?? 'custom' });
    setAutoDubPersona(style.personaId);
    setAutoDubIntensity(getPersona(style.personaId).intensityDefault);
  }, [setDubBus, setAutoDubPersona, setAutoDubIntensity]);

  // AutoDub toggle — enables/disables autonomous performer. Bus auto-enables.
  // Preserve characterPreset when enabling so the preset dropdown doesn't flip to Custom.
  const handleAutoDubToggle = useCallback(() => {
    if (!autoDubEnabled && !busEnabled) {
      setDubBus({ enabled: true, characterPreset: dubBusSettings.characterPreset });
    }
    setAutoDubEnabled(!autoDubEnabled);
  }, [autoDubEnabled, busEnabled, setDubBus, setAutoDubEnabled, dubBusSettings.characterPreset]);

  // Audition the current style — applies channel sends (deferred from applyStyle to avoid
  // immediately triggering comb sweeps) THEN fires the signature move once.
  const auditionCurrentStyle = useCallback(() => {
    if (!busEnabled) setDubBus({ enabled: true, characterPreset: dubBusSettings.characterPreset });
    // Apply sends now that the user explicitly asked to hear this style
    if (currentStyle.characterPreset && currentStyle.characterPreset !== 'custom') {
      applyCharacterPresetSends(currentStyle.characterPreset);
    }
    const persona = getPersona(currentStyle.personaId);
    const disposer = fireDub(persona.signatureMove, undefined, persona.paramOverrides?.[persona.signatureMove] ?? {}, 'live');
    // Auto-dispose hold moves after 2 bars so the audition doesn't leave
    // channels permanently muted (ghostReverb mutes and never restores if
    // the disposer is thrown away).
    if (disposer) {
      const bpm = useTransportStore.getState().bpm || 120;
      const twoBarMs = (60000 / bpm) * 8;
      setTimeout(() => { try { disposer.dispose(); } catch { /* ok */ } }, twoBarMs);
    }
  }, [busEnabled, setDubBus, dubBusSettings.characterPreset, currentStyle]);

  // Apply default channel send levels for a named character preset. Called
  // when the user switches the STYLE selector — gives the bus signal to
  // process immediately without manual fader riding.
  const applyCharacterPresetSends = useCallback((presetKey: string) => {
    const preset = DUB_CHARACTER_PRESETS[presetKey as keyof typeof DUB_CHARACTER_PRESETS];
    if (!preset) return;
    const visible = pattern?.channels.length ?? 8;
    const mixerState = useMixerStore.getState();
    for (let i = 0; i < visible; i++) {
      // The classifier first, the name only as a fallback. The classifier is
      // what every other part of the dub system targets on, and it works on
      // formats where the name slot holds the musician's greetings.
      const classified = autoRoles[i];
      const role = (classified && PRESET_SEND_ROLES.has(classified))
        ? classified
        : inferRoleFromName(channelLabels[i] ?? mixerState.channels[i]?.name ?? '');

      // Apply channel send level
      if (preset.defaultSendsByRole) {
        const sends = preset.defaultSendsByRole;
        const level = role != null ? (sends[role as keyof typeof sends] ?? sends.default) : sends.default;
        setChannelDubSend(i, level);
      }

      // Apply per-channel FX config (filter, reverb, sweep)
      if (preset.perChannelFxByRole) {
        const fxMap = preset.perChannelFxByRole;
        const cfg = (role != null ? fxMap[role as keyof typeof fxMap] : null) ?? fxMap.default;
        if (cfg) mixerState.applyChannelFxConfig(i, cfg);
      }
    }
  }, [pattern, setChannelDubSend, autoRoles, channelLabels]);

  // Sustained-hold channel tap. HOLD must work regardless of the channel's
  // current dubSend fader position — including 0 (no send). We drive the
  // mixer's dubSend directly: HOLD pushes to 1.0 (activates the worklet
  // slot via setChannelDubSend's lazy activation); release restores the
  // prior fader value. Using bus.openChannelTap on top wouldn't help at
  // send=0 because the per-channel tap GainNode only gets registered with
  // DubBus *after* _activateDubChannel completes asynchronously — racey
  // and silent on a cold channel.

  const toggleHold = useCallback((channelId: number) => {
    const isHeld = heldReleasers.current.has(channelId);
    if (isHeld) {
      const release = heldReleasers.current.get(channelId);
      heldReleasers.current.delete(channelId);
      setHeldChannels(prev => { const n = new Set(prev); n.delete(channelId); return n; });
      try { release?.(); } catch { /* ok */ }
    } else {
      const priorSend = useMixerStore.getState().channels[channelId]?.dubSend ?? 0;
      setChannelDubSend(channelId, 1.0);
      heldReleasers.current.set(channelId, () => {
        // Restore the user's prior fader value on release.
        setChannelDubSend(channelId, priorSend);
      });
      setHeldChannels(prev => new Set(prev).add(channelId));
    }
  }, [setChannelDubSend]);

  // Trigger handler — single click fires one-shot.
  const fireTrigger = useCallback((moveId: string, channelId?: number) => {
    runWithBus(() => { fireDub(moveId, channelId); });
  }, [runWithBus]);

  // Hold handlers — pointerdown starts the move, pointerup/pointercancel/
  // pointerleave releases it. Proper press-and-hold (not click-to-toggle),
  // matching physical instrument gesture.
  const holdStart = useCallback((moveId: string, channelId?: number) => {
    const key = `${moveId}:${channelId ?? 'g'}`;
    if (activeHolds.current.has(key)) { console.warn(`[DubDeck] holdStart ${moveId} ignored — already active in map`); return; }
    // The button lights up now, even when the bus still has to come up, so a
    // press never looks ignored. `pendingHolds` is what lets a pointerup that
    // arrives first cancel a start that has not happened yet — without it, a
    // quick tap on a cold bus would begin a gesture with nothing left to end
    // it, which is a move held for ever.
    pendingHolds.current.add(key);
    setHeldMoves(prev => new Set(prev).add(key));
    runWithBus(() => {
      if (!pendingHolds.current.delete(key)) return; // released before it started
      // holdMs 0 = held until released. The engine keeps it in flight and it
      // shows up in `activeGestures()`, so a panic or a transport stop can reach
      // it — which a disposer closed over in this component never could.
      const id = beginGesture({
        moveId,
        channelId,
        holdMs: 0,
        bpm: getActiveBpm(),
        source: 'live',
      });
      console.log(`[DubDeck] holdStart ${moveId} → gesture ${id}`);
      activeHolds.current.set(key, id);
    });
  }, [runWithBus]);

  const holdEnd = useCallback((moveId: string, channelId?: number) => {
    const key = `${moveId}:${channelId ?? 'g'}`;
    // Cancel a start still waiting on the bus, so the release is never lost
    // between the press and the bus coming up.
    const wasPending = pendingHolds.current.delete(key);
    const id = activeHolds.current.get(key);
    if (!id) {
      if (wasPending) setHeldMoves(prev => { const n = new Set(prev); n.delete(key); return n; });
      return;
    }
    activeHolds.current.delete(key);
    setHeldMoves(prev => { const n = new Set(prev); n.delete(key); return n; });
    try { endGesture(id); } catch { /* ok */ }
  }, []);

  /**
   * Pointer props for a press-and-hold move button.
   *
   * Every hold site used to inline this, and each one called
   * `releasePointerCapture` UNGUARDED before `holdEnd`:
   *
   *     onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(id); }}
   *
   * `releasePointerCapture` throws `NotFoundError` when the capture is already
   * gone, and that exception skipped `holdEnd` — so the move stayed held with
   * nothing left to release it. Reported 2026-09-21 as crushBass sticking on
   * from a single click; it can bite any hold button.
   *
   * So: release defensively, end the hold unconditionally, and treat
   * `lostpointercapture` as a release too — that is the one event that fires
   * when the capture disappears without a pointerup, which is exactly the case
   * the old code could not survive.
   *
   * One implementation for all four call sites, because the same fault was
   * copied into each of them.
   */
  const holdButtonProps = useCallback((moveId: string, channelId?: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture optional */ }
      holdStart(moveId, channelId);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      holdEnd(moveId, channelId);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      holdEnd(moveId, channelId);
    },
    onLostPointerCapture: () => holdEnd(moveId, channelId),
  }), [holdStart, holdEnd]);

  // Nothing this deck is holding may outlive the deck. Without this, a view
  // change or a hot reload left the held move sounding for ever.
  useEffect(() => {
    const held = activeHolds.current;
    return () => {
      for (const id of held.values()) {
        try { cancelGesture(id, 'cancelled'); } catch { /* ok */ }
      }
      held.clear();
    };
  }, []);

  // Toggle handler — click once to activate, click again to deactivate.
  const handleToggle = useCallback((moveId: string) => {
    if (toggleDisposers.current.has(moveId)) {
      // Currently active — deactivate. Never gated on the bus: a move that is
      // already running must always be stoppable, whatever the bus is doing.
      const release = toggleDisposers.current.get(moveId)!;
      toggleDisposers.current.delete(moveId);
      setToggledMoves(prev => { const n = new Set(prev); n.delete(moveId); return n; });
      try { release(); } catch { /* ok */ }
    } else {
      // Not active — activate (fire as hold, store disposer), arming the bus
      // if it is off.
      runWithBus(() => {
        const disp = fireDub(moveId, undefined);
        if (disp) {
          toggleDisposers.current.set(moveId, () => disp.dispose());
          setToggledMoves(prev => new Set(prev).add(moveId));
        }
      });
    }
  }, [runWithBus]);

  // Persistent mic toggle — connects mic into the dub bus input until toggled off.
  const toggleMic = useCallback(async () => {
    if (micActive) {
      micTapRef.current?.disconnect();
      micTapRef.current = null;
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      setMicActive(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error('Mic not supported in this browser');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
    } catch {
      notify.error('Mic permission denied — allow mic access and try again');
      return;
    }
    try {
      const bus = ensureDrumPadEngine().getDubBus();
      const ctx = bus.inputNode.context as AudioContext;
      const src = ctx.createMediaStreamSource(stream);
      micStreamRef.current = stream;
      micTapRef.current = bus.connectMicInput(src, micGain);
      setMicActive(true);
    } catch (e) {
      stream.getTracks().forEach(t => t.stop());
      notify.error('Failed to connect mic to dub bus');
      console.warn('[DubDeckStrip] mic tap failed:', e);
    }
  }, [micActive, micGain]);

  // Rate preset radio handler — mutual exclusion: only one active at a time.
  const handleRatePreset = useCallback((moveId: string) => {
    if (activeRatePreset === moveId) {
      // Same preset — deactivate (restores previous rate)
      rateDisposer.current?.();
      rateDisposer.current = null;
      setActiveRatePreset(null);
    } else {
      // Different preset — deactivate current first, then activate new one
      if (rateDisposer.current) {
        try { rateDisposer.current(); } catch { /* ok */ }
        rateDisposer.current = null;
      }
      runWithBus(() => {
        const disp = fireDub(moveId, undefined);
        if (disp) {
          rateDisposer.current = () => disp.dispose();
          setActiveRatePreset(moveId);
        }
      });
    }
  }, [runWithBus, activeRatePreset]);

  return (
    /* Sized by its content, never squeezed.
     *
     * The deck is a flex child of the tracker's editor column, and a flex
     * child shrinks below its content by default — so as the editor claimed
     * space the deck was squashed and its own rows were cut off. `shrink-0`
     * makes it take the height it needs and the editor above absorb the rest.
     * Same defect the FT2 toolbar had in `688aacfd2`.
     *
     * The cap is the LAST resort, for a deck taller than the window: it reads
     * `--app-vh`, so on iOS it is a share of the viewport that is really
     * visible rather than the one `vh` imagines. Three quarters, not 60 %:
     * the owner would rather have full-size buttons on the channel cards
     * than a taller pattern editor while the deck is open (2026-09-23). */
    <div className="shrink-0 flex flex-col gap-1.5 px-2 py-1.5 bg-dark-bgSecondary border-t border-dark-border font-mono overflow-y-auto max-h-[calc(var(--app-vh)*0.75)]">
      {/* Header row */}
      {/* The header row.
          It had no `flex-wrap`, and its parent scrolls vertically only, so on a
          narrower window the controls past DLY-VRB were simply clipped at the
          right edge — reported 2026-09-21 with the next control cut in half.
          Wrapping rather than a horizontal scrollbar: a control that has moved
          to a second line is still there to be hit, where one hidden behind a
          scrollbar has to be found first, which is the wrong trade live. The
          order already runs most-used first, so what wraps is what is reached
          for least. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <button
          className="px-2.5 py-1 rounded border border-dark-borderLight text-text-secondary hover:text-text-primary hover:border-accent-primary transition-colors"
          onClick={toggleStripCollapsed}
          title={stripCollapsed ? 'Expand Dub Deck (tone / globals / per-channel / lane)' : 'Collapse Dub Deck — keep only the header'}
        >
          DUB DECK {stripCollapsed ? '▸' : '▾'}
        </button>
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (busEnabled
              ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => {
            const next = !busEnabled;
            // A performer with no bus is not a performer. Leaving AutoDub
            // running here is what let it go on muting channels after the bus
            // was switched off, and its own toggle was disabled at the time.
            if (!next && autoDubEnabled) setAutoDubEnabled(false);
            setDubBus({ enabled: next });
          }}
          title={busEnabled ? 'Dub Bus ON — click to disable' : 'Dub Bus OFF — click to enable'}
        >
          Bus {busEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (armed
              ? `bg-accent-error/20 border-accent-error text-accent-error ${capturedRecently ? 'animate-pulse' : ''}`
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => {
            if (!armed) {
              clearDubCurvesForCurrentPattern();
            }
            setArmed(!armed);
          }}
          title={armed ? 'Recording armed — click to stop' : 'Arm recording (clears previous dub curves)'}
          disabled={!busEnabled}
        >
          ● REC {armed ? 'armed' : 'off'}
        </button>
        {/* Unified style — sets both engineer bus character AND AutoDub persona. */}
        <span className="text-text-muted ml-2">STYLE</span>
        <select
          className="bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-1 text-text-primary text-xs font-mono focus:ring-1 focus:ring-accent-primary"
          value={currentStyle.id}
          onChange={(e) => applyStyle(e.target.value)}
          title="Dub style — sets the engineer sound coloring (bus EQ, echo, spring) AND the AutoDub performance persona simultaneously."
          disabled={!busEnabled}
        >
          {DUB_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button
          className="px-2 py-1 rounded border bg-dark-bgTertiary border-dark-border text-text-muted hover:text-accent-highlight hover:border-accent-highlight transition-colors disabled:opacity-40"
          onClick={auditionCurrentStyle}
          disabled={!busEnabled}
          title={`Audition ${currentStyle.label} — apply channel sends + fire the signature move`}
        >▶</button>
        <span className="text-text-muted ml-2">ECHO</span>
        <select
          className="bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-1 text-text-primary text-xs font-mono focus:ring-1 focus:ring-accent-primary"
          value={dubBusSettings.echoEngine}
          onChange={(e) => setDubBus({ echoEngine: e.target.value as typeof dubBusSettings.echoEngine, characterPreset: dubBusSettings.characterPreset })}
          title="Echo engine — swaps the delay effect in the dub bus chain"
          disabled={!busEnabled}
        >
          <option value="spaceEcho">Space Echo</option>
          <option value="re201">RE-201 Tape</option>
          <option value="anotherDelay">AnotherDelay</option>
          <option value="reTapeEcho">BBD Echo</option>
        </select>
        {/* A/B compare — swaps live settings with the snapshot captured
            the last time a character preset was loaded. Disabled until
            the first preset load. Like a hardware desk compare button. */}
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (dubBusStash
              ? 'bg-dark-bgTertiary border-dark-border text-text-primary hover:bg-dark-bgHover'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted opacity-50 cursor-not-allowed')
          }
          onClick={() => swapDubBusStash()}
          disabled={!busEnabled || !dubBusStash}
          title={dubBusStash
            ? `A/B — swap with stash (${dubBusStash.characterPreset})`
            : 'A/B — load a character preset first to enable compare'}
        >
          A/B
        </button>
        {/* Auto Dub — direct toggle + gear for settings */}
        <button
          className={`px-2.5 py-1 rounded border transition-colors text-xs font-mono ${
            autoDubEnabled
              ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
          onClick={handleAutoDubToggle}
          /* Never disabled.
           *
           * It was `disabled={!busEnabled}`, which left AutoDub running with
           * its only stop button greyed out when the bus was switched off —
           * `channelMute` and `riddimSection` mute MIXER channels and need no
           * bus, so channels stayed muted with no way to stop whatever was
           * muting them. Narrowing it to `!busEnabled && !autoDubEnabled` fixed
           * the stop case and left the start case just as dead: with the bus
           * off the button was unclickable and said so in a tooltip nobody
           * asked for. Reported 2026-09-22 — "if i click auto dub when the dub
           * bus is off the dub bus should activate so autodub can activate".
           *
           * `handleAutoDubToggle` arms the bus, so there is no state this
           * button cannot act from. */
          title={autoDubEnabled
            ? 'Auto Dub is ON — click to stop'
            : busEnabled
              ? 'Auto Dub — click to enable autonomous dub performance'
              : 'Auto Dub — click to switch the dub bus on and start'}
        >
          {autoDubEnabled ? '● AUTO DUB' : '○ AUTO DUB'}
        </button>
        <button
          ref={autoDubSettingsBtnRef}
          className="px-1.5 py-1 rounded border bg-dark-bgTertiary border-dark-borderLight text-text-muted hover:text-accent-highlight hover:border-accent-highlight transition-colors text-xs disabled:opacity-40"
          onClick={() => setAutoDubSettingsOpen(v => !v)}
          disabled={!busEnabled}
          title="Auto Dub settings — intensity and move blacklist"
        >⚙</button>
        {/* EQ mode — cycle Off → Sweeps → Improv → Both. Visible so user can find it. */}
        <button
          className={`px-1.5 py-1 rounded border transition-colors text-[9px] font-mono disabled:opacity-40 ${
            autoDubEqMode !== 'off'
              ? 'border-accent-secondary bg-accent-secondary/10 text-accent-secondary'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted hover:text-text-primary'
          }`}
          onClick={() => {
            const cycle: typeof autoDubEqMode[] = ['off', 'collaborative', 'improv', 'both'];
            const next = cycle[(cycle.indexOf(autoDubEqMode) + 1) % cycle.length];
            setAutoDubEqMode(next);
          }}
          disabled={!busEnabled}
          title={`Auto Dub EQ: ${autoDubEqMode} — click to cycle Off → Sweeps → Improv → Both`}
        >
          EQ:{autoDubEqMode === 'off' ? 'Off' : autoDubEqMode === 'collaborative' ? 'Sweeps' : autoDubEqMode === 'improv' ? 'Improv' : '★Both'}
        </button>
        <AutoDubPanel busEnabled={busEnabled} open={autoDubSettingsOpen} onClose={() => setAutoDubSettingsOpen(false)} anchorRef={autoDubSettingsBtnRef} />
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (ghostBus
              ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => setGhostBus(!ghostBus)}
          title={ghostBus ? 'Bus Bleed ON — every channel bleeds through the dub return at -36 dB, even when muted in main' : 'Bus Bleed — parallel -36 dB bleed so muted channels stay faintly audible through the dub return'}
          disabled={!busEnabled}
        >
          BLEED {ghostBus ? 'ON' : 'OFF'}
        </button>
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (masterChorus
              ? 'bg-accent-secondary/20 border-accent-secondary text-accent-secondary'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => setMasterChorus(!masterChorus)}
          title={masterChorus ? 'Master Chorus ON — dub finisher smear on the whole output' : 'Master Chorus OFF — enable for a smooth trippy polish on the full mix'}
          disabled={!busEnabled}
        >
          CHORUS
        </button>
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (clubSim
              ? 'bg-accent-warning/20 border-accent-warning text-accent-warning'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => setClubSim(!clubSim)}
          title={clubSim ? 'Club Simulator ON — 350 ms convolution IR on the master (audition how the mix lands in a venue)' : 'Club Simulator — add a small-room impulse response as master insert for venue-check'}
          disabled={!busEnabled}
        >
          CLUB
        </button>
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (quantize
              ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => setQuantize(!quantize)}
          title={quantize ? 'Quantize ON — dub move timings snap to nearest row for cleaner lane recordings' : 'Quantize OFF — moves record at exact timing (free-form)'}
          disabled={!busEnabled}
        >
          QUANTIZE
        </button>
        <button
          className={
            'px-2.5 py-1 rounded border transition-colors ' +
            (chainOrder !== 'echoSpring'
              ? 'bg-accent-secondary/20 border-accent-secondary text-accent-secondary'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
          }
          onClick={() => {
            const next = chainOrder === 'echoSpring' ? 'springEcho' : chainOrder === 'springEcho' ? 'parallel' : 'echoSpring';
            setDubBus({ chainOrder: next, characterPreset: dubBusSettings.characterPreset });
          }}
          title={
            chainOrder === 'echoSpring' ? 'Signal order: ECHO → SPRING (default). Click to cycle chain order.'
            : chainOrder === 'springEcho' ? 'Signal order: SPRING → ECHO (reverb-first). Click to cycle to parallel.'
            : 'Signal order: PARALLEL (echo + spring independent). Click to cycle to default.'
          }
          disabled={!busEnabled}
        >
          {chainOrder === 'echoSpring' ? 'DLY→VRB' : chainOrder === 'springEcho' ? 'VRB→DLY' : 'PARALLEL'}
        </button>
        {/* ── Mic controls ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 ml-2">
          <button
            className={
              'px-2.5 py-1 rounded border transition-colors text-xs font-bold ' +
              (micActive
                ? 'bg-accent-error/20 border-accent-error text-accent-error animate-pulse'
                : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary hover:border-accent-primary')
            }
            onClick={() => void toggleMic()}
            title={micActive ? 'Mic ON — routing to dub bus. Click to stop.' : 'Mic OFF — click to route microphone into dub bus (for MC vocals, dub siren, Toast)'}
            disabled={!busEnabled}
          >
            MIC {micActive ? 'ON' : 'OFF'}
          </button>
          {micActive && (
            <input
              type="range" min={0} max={1.5} step={0.05}
              value={micGain}
              onChange={(e) => {
                const g = Number(e.target.value);
                setMicGain(g);
                micTapRef.current?.setGain(g);
              }}
              className="w-16 accent-accent-error"
              title={`Mic gain: ${micGain.toFixed(2)}×`}
            />
          )}
        </div>
        <span className="flex-1" />
        {/*
          Audition — a solo button for the send.
          Momentary, like every other solo on a desk: held, not latched, so the
          comparison happens in the ear rather than in the memory of what the
          bus sounded like a minute ago. Pointer capture so a finger that
          slides off the button still hands the colour back.
        */}
        <button
          className={`px-2.5 py-1 rounded font-semibold text-xs ${
            auditioning
              ? 'bg-accent-highlight text-text-inverse'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
          }`}
          disabled={!busEnabled}
          onPointerDown={(e) => {
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture optional */ }
            beginBusAudition();
          }}
          onPointerUp={endBusAudition}
          onPointerCancel={endBusAudition}
          // Without this a lost capture leaves the audition latched on, with
          // the bus's colour stages bypassed and no pointerup coming to undo
          // it. Same gap as the move holds (X26).
          onLostPointerCapture={endBusAudition}
          title="Hold to hear the send without its colour stages — plate, ring modulator, lo-fi, sweep and external feedback"
        >
          Audition
        </button>
        <button
          className="px-2.5 py-1 rounded bg-accent-error text-white font-semibold hover:bg-accent-error/80 text-xs"
          onClick={() => { hideTooltip(); window.dispatchEvent(new Event('dub-panic')); }}
          title="Drain the bus + disarm recording"
        >
          KILL
        </button>
      </div>

      {/* The always-visible live row.
          FX WET used to sit here alone across the full width, while the
          controls a performer reaches for most often were behind a small
          settings cog. The row had the space; the cog is for what you set
          once and leave. Each control keeps its own minimum width and the
          row wraps, so a narrow deck stacks them instead of squashing all
          three into unusable stubs. */}
      {busEnabled && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1 border-b border-dark-border">
          <div className="flex items-center gap-2 flex-1 min-w-[11rem]">
            <span className="text-text-muted text-[9px] font-mono shrink-0">FX WET</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={liveReturnGain}
              onChange={(e) => setDubBus({ returnGain: Number(e.target.value) })}
              className="flex-1 min-w-0 accent-accent-highlight cursor-pointer"
              title={`FX wet level: ${(liveReturnGain * 100).toFixed(0)}%`}
            />
            <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
              {(liveReturnGain * 100).toFixed(0)}%
            </span>
          </div>

          {/* How busy the performer is: the one control that decides whether a
              section breathes or drives. */}
          <div className="flex items-center gap-2 flex-1 min-w-[11rem]">
            <span className="text-text-muted text-[9px] font-mono shrink-0">INTENSITY</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={autoDubIntensity}
              onChange={(e) => setAutoDubIntensity(Number(e.target.value))}
              className="flex-1 min-w-0 accent-accent-primary cursor-pointer disabled:opacity-40"
              disabled={!autoDubEnabled}
              title={autoDubEnabled
                ? `Auto Dub intensity: ${(autoDubIntensity * 100).toFixed(0)}% — how often the performer fires`
                : 'Auto Dub intensity — switch AUTO DUB on to use'}
            />
            <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
              {(autoDubIntensity * 100).toFixed(0)}%
            </span>
          </div>

          {/* Vinyl wear. Moved down here from the toolbar row and renamed from
              "JA" — asked for 2026-09-22. It belongs with the other three
              because it is the same KIND of control: a continuous amount that
              colours the whole bus.

              Note the scale differs. vinylLevel is 0-10 with a 0.5 step, not
              the 0-1 the others use, so the readout stays one decimal out of
              ten rather than a percentage. Showing "450%" here would be worse
              than the inconsistency. */}
          <div className="flex items-center gap-2 flex-1 min-w-[11rem]">
            <span className="text-text-muted text-[9px] font-mono shrink-0">VINYL</span>
            <input
              type="range" min={0} max={10} step={0.5}
              value={vinylLevel}
              onChange={(e) => setVinylLevel(Number(e.target.value))}
              className="flex-1 min-w-0 accent-accent-warning cursor-pointer"
              title={`Vinyl wear: ${vinylLevel.toFixed(1)} / 10 — surface noise, clicks, wow and flutter, high-frequency roll-off, rumble, left/right drift. 0 = factory new, 10 = gutter-scraped Jamaican 7-inch.`}
            />
            <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
              {vinylLevel.toFixed(1)}
            </span>
          </div>

          {/* Echo feedback: how long the repeats hang on. The other hand on a
              dub desk, and it was behind a tab. */}
          <div className="flex items-center gap-2 flex-1 min-w-[11rem]">
            <span className="text-text-muted text-[9px] font-mono shrink-0">FEEDBACK</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={liveEchoIntensity}
              onChange={(e) => setDubBus({ echoIntensity: Number(e.target.value) })}
              className="flex-1 min-w-0 accent-accent-secondary cursor-pointer"
              title={`Echo feedback: ${(liveEchoIntensity * 100).toFixed(0)}% — how long the repeats last`}
            />
            <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
              {(liveEchoIntensity * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Tab bar — only when strip is expanded */}
      {!stripCollapsed && (
        <div className="flex gap-0.5 border-b border-dark-border text-[10px] font-mono">
          {(['perform', 'eq', 'bus'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 transition-colors uppercase tracking-wide ${
                activeTab === tab
                  ? 'text-accent-highlight border-b-2 border-accent-highlight bg-dark-bgTertiary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {!stripCollapsed && (
      <>
      {/* ── PERFORM tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'perform' && (<>
      {moveTooltip}

      <div className="flex flex-col gap-1.5 pb-1.5 border-b border-dark-border">
        {/* ── CLICK — one-shot triggers ── */}
        <div className="flex items-start gap-1.5 text-xs">
          <span
            className="text-text-muted w-16 shrink-0 pt-0.5 font-bold tracking-wide"
            title="Click to fire once — no hold needed"
          >CLICK ▸</span>
          <div className={MOVE_ROW_GRID}>
            {GLOBAL_MOVES.filter(m => m.group === 'click').map((m) => {
              const active = isMoveFiring(m.moveId);
              const noSend = !!m.needsSend && !anyAudibleSend;
              return (
                <button
                  key={m.moveId}
                  className={colorClasses(m.color, active) + ' w-full text-center' + (noSend && busEnabled ? ' opacity-40' : '')}
                  onClick={() => {
                    if (noSend) {
                      notify.warning('Raise a CH send first — drag a channel fader up on the right');
                      return;
                    }
                    fireTrigger(m.moveId);
                  }}
                  {...hoverProps(`${m.label} — ${m.title}${noSend ? ' — raise a CH send to hear' : ''}`)}
                  disabled={!busEnabled}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RATE — echo rate radio group: click to set, click again to restore ── */}
        <div className="flex items-start gap-1.5 text-xs">
          <span
            className="text-accent-secondary/60 w-16 shrink-0 pt-0.5 font-bold tracking-wide"
            title="Echo rate presets — click to activate, click again to restore previous rate. Only one active at a time."
          >RATE ▸</span>
          <div className={MOVE_ROW_GRID}>
            {GLOBAL_MOVES.filter(m => m.group === 'rate').map((m) => {
              const isActive = activeRatePreset === m.moveId;
              return (
                <button
                  key={m.moveId}
                  className={
                    colorClasses(m.color, isActive) + ' w-full text-center' +
                    (isActive ? ' ring-2 ring-offset-1 ring-offset-dark-bgSecondary ring-white/70' : '')
                  }
                  onClick={() => handleRatePreset(m.moveId)}
                  {...hoverProps(`${m.label} — ${m.title}${isActive ? ' (active — click to restore)' : ''}`)}
                  disabled={!busEnabled}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── HOLD — press and hold for exact duration ── */}
        <div className="flex items-start gap-1.5 text-xs">
          <span
            className="text-accent-warning/60 w-16 shrink-0 pt-0.5 font-bold tracking-wide"
            title="Press and hold — releases when you let go"
          >HOLD ▸</span>
          <div className={MOVE_ROW_GRID}>
            {GLOBAL_MOVES.filter(m => m.group === 'hold').map((m) => {
              const key = `${m.moveId}:g`;
              const active = heldMoves.has(key) || isMoveFiring(m.moveId);
              const noSend = !!m.needsSend && !anyAudibleSend;
              return (
                <button
                  key={m.moveId}
                  className={colorClasses(m.color, active) + ' w-full text-center' + (noSend && busEnabled ? ' opacity-40' : '')}
                  {...(() => {
                    const props = holdButtonProps(m.moveId);
                    return {
                      ...props,
                      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
                        if (noSend) {
                          notify.warning('Raise a CH send first — drag a channel fader up on the right');
                          return;
                        }
                        props.onPointerDown(e);
                      },
                    };
                  })()}
                  {...hoverProps(`${m.label} — ${m.title} (press-and-hold)${noSend ? ' — raise a CH send to hear' : ''}`)}
                  disabled={!busEnabled}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── TOGGLE — click once on, click again off (hands-free) ── */}
        <div className="flex items-start gap-1.5 text-xs">
          <span
            className="text-accent-highlight/60 w-16 shrink-0 pt-0.5 font-bold tracking-wide"
            title="Click to activate, click again to deactivate — stays on hands-free"
          >TOGGLE ▸</span>
          <div className={MOVE_ROW_GRID}>
            {GLOBAL_MOVES.filter(m => m.group === 'toggle').map((m) => {
              const key = `${m.moveId}:g`;
              const toggled = toggledMoves.has(m.moveId);
              const active = toggled || heldMoves.has(key) || isMoveFiring(m.moveId);
              const noSend = !!m.needsSend && !anyAudibleSend;
              const dimmed = noSend && busEnabled && !toggled;
              return (
                <button
                  key={m.moveId}
                  className={
                    colorClasses(m.color, active) + ' w-full text-center' +
                    (dimmed ? ' opacity-40' : '') +
                    (toggled ? ' ring-2 ring-offset-1 ring-offset-dark-bgSecondary ring-white/70' : '')
                  }
                  onClick={() => {
                    if (noSend && !toggled) {
                      notify.warning('Raise a CH send first — drag a channel fader up on the right');
                      return;
                    }
                    handleToggle(m.moveId);
                  }}
                  {...hoverProps(`${m.label} — ${m.title}${toggled ? ' (ON — click to stop)' : noSend ? ' (needs CH send)' : ' (click to toggle on)'}`)}
                  disabled={!busEnabled}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Channel strips — classic mixer-desk layout. Each channel is a
          vertical column: label → op buttons stacked → HOLD → vertical
          fader → send % readout. Horizontal scroll if the pattern has
          more channels than fit. */}
      {/* items-start, not items-stretch: stretching forced every card to the
          row's height, which was shorter than the button stack needed, so HOLD
          rendered outside the card's own border. Cards size to their content;
          the fader still fills the card because the CARD stretches its two
          columns. */}
      <div className="flex items-start gap-2 overflow-x-auto pt-1.5">
        {/* Master send — scales all channel sends at once */}
        <div
          className={
            'flex flex-row items-stretch gap-2.5 px-2 py-1.5 rounded border w-56 shrink-0 ' +
            'bg-dark-bgSecondary border-accent-primary/40'
          }
        >
          {/* Left column: label + ops + hold — must match channel columns */}
          <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-bold text-accent-primary leading-none">MASTER</span>
          {/* Same skeleton as a channel card: where a channel has its role
              and filter selects, the master has ALL / NONE. The fader column
              on the right is then identical to a channel's. */}
          <button
            className={
              'px-2 py-1 rounded border w-full text-[9px] font-bold transition-all duration-150 ' +
              (anySend
                ? 'bg-accent-primary/20 border-accent-primary text-accent-primary hover:bg-accent-error/20 hover:border-accent-error hover:text-accent-error'
                : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary hover:border-accent-primary')
            }
            onClick={() => {
              if (anySend) {
                for (let i = 0; i < visibleChannelCount; i++) setChannelDubSend(i, 0);
              } else {
                for (let i = 0; i < visibleChannelCount; i++) setChannelDubSend(i, 1.0);
              }
            }}
            title={anySend ? 'Zero all channel sends' : 'Set all channel sends to 100%'}
            disabled={!busEnabled}
          >
            {anySend ? 'NONE' : 'ALL'}
          </button>
          {/* The Rvb / Swp row a channel card has here, as an invisible copy
              of the same markup: the master's grid then lands on exactly the
              channels' line and the card is exactly their height. A margin
              guessed at that row's height left a gap under the master card
              (2026-09-23). */}
          <div className="flex gap-1 w-full invisible" aria-hidden="true">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <span className="text-[7px] text-text-muted">Rvb</span>
              <input type="range" className="w-full" tabIndex={-1} readOnly value={0} />
            </div>
            <div className="flex flex-col items-center flex-1 min-w-0">
              <span className="text-[7px] text-text-muted">Swp</span>
              <input type="range" className="w-full" tabIndex={-1} readOnly value={0} />
            </div>
          </div>
          {/* 3x3: eight ops + HOLD. A column of nine full-size buttons was
              the whole reason the deck did not fit — see colorClasses. */}
          <div className="grid grid-cols-3 gap-1 w-full">
          {CHANNEL_OPS.map((op) => {
            const masterKey = `${op.moveId}:master`;
            const active = heldMoves.has(masterKey) || CHANNEL_OPS.some(
              () => Array.from({ length: visibleChannelCount }, (_, i) => `${op.moveId}:${i}`).some(k => activeFires.has(k))
            );
            const isHold = op.kind === 'hold';
            return (
              <button
                key={op.moveId}
                className={colorClasses(op.color, active) + ' w-full text-center'}
                onClick={isHold ? undefined : () => {
                  for (let i = 0; i < visibleChannelCount; i++) fireTrigger(op.moveId, i);
                }}
                {...(isHold ? {
                  // Master fires the move on every channel, so release the
                  // capture once and end each channel's hold unconditionally.
                  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ }
                    for (let i = 0; i < visibleChannelCount; i++) holdStart(op.moveId, i);
                  },
                  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
                    for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                  },
                  onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
                    for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                  },
                  onLostPointerCapture: () => {
                    for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                  },
                } : {})}
                {...hoverProps(`ALL · ${op.label} — ${op.title}${isHold ? ' (press-and-hold)' : ''}`)}
                disabled={!busEnabled}
              >
                {op.label}
              </button>
            );
          })}
          <button
            className={
              'px-2.5 py-1 rounded border w-full text-xs font-bold transition-all duration-150 ' +
              'bg-dark-bgTertiary border-dark-borderLight text-text-primary hover:border-accent-primary'
            }
            onClick={() => {
              for (let i = 0; i < visibleChannelCount; i++) toggleHold(i);
            }}
            title="HOLD all channels — sustained dubbing on every channel (restores prior sends when released)"
            disabled={!busEnabled}
          >
            HOLD
          </button>
          </div>
          </div>
          {/* Right column: fader fills the card's height, readout under it —
              the same column a channel card has. */}
          <div className="flex flex-col items-center gap-1 shrink-0 min-h-0">
          <div className="flex-1 min-h-0 flex items-stretch">
          <Fader
            value={masterSendValue}
            size="md"
            fillHeight
            color="accent-primary"
            onChange={(v) => {
              for (let i = 0; i < visibleChannelCount; i++) {
                setChannelDubSend(i, v);
              }
            }}
            title={`Master dub send — ${Math.round(masterSendValue * 100)}%. Sets all channel sends simultaneously.`}
            disabled={!busEnabled}
            doubleClickValue={1}
          />
          </div>
          {/* Fixed width, or "100%" is wider than "15%" and the fader column
              grows at full send, squeezing the op grid beside it — "when the
              channel sliders reach 100% the component shrinks sideways". */}
          <span className="w-7 text-center tabular-nums text-[9px] font-mono text-accent-primary leading-none">
            {Math.round(masterSendValue * 100)}%
          </span>
          </div>
        </div>
        {/* Separator */}
        <div className="w-px h-32 bg-dark-border shrink-0 self-center" />
        {Array.from({ length: visibleChannelCount }, (_, i) => {
          const ch = channels[i];
          const dubSend = ch?.dubSend ?? 0;
          const hasDubSend = dubSend > 0;
          const isHeld = heldChannels.has(i);
          const isFlashed = i === flashedChannel;
          const channelFiring = CHANNEL_OPS.some(op => activeFires.has(`${op.moveId}:${i}`));
          return (
            <div
              key={i}
              className={
                // w-24 rather than min-w-[64px]: the card was content-sized, so the widest
                // child set its width. The Rvb/Swp row's two range inputs have an
                // intrinsic ~129px each, which made every channel card 280px and pushed
                // the instrument list off screen. A fixed width lets the sliders shrink
                // (with min-w-0 on their columns) and keeps all channels uniform.
                // Row, not column: the fader sits BESIDE the button stack rather than
                // under it, which gives back the fader's 80px plus its readout on every
                // channel. w-56: three full-size op buttons across plus the 16px
                // fader. Nine ops in one column ran ~600px tall and the deck
                // clipped every card; a 3x3 grid is three rows.
                'flex flex-row items-stretch gap-2.5 px-2 py-1.5 rounded border w-56 shrink-0 transition-colors ' +
                (channelFiring
                  ? 'bg-accent-highlight/15 border-accent-highlight'
                  : isHeld
                    ? 'bg-accent-primary/10 border-accent-primary'
                    : hasDubSend
                      ? 'bg-dark-bg border-dark-borderLight'
                      : 'bg-dark-bgTertiary border-dark-border')
              }
            >
              {/* Left column: label + ops + hold — matches master column */}
              <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <span
                className="text-xs font-bold text-text-secondary leading-none truncate max-w-[56px]"
                title={`Ch ${i + 1}${channelLabels[i] !== `CH ${i + 1}` ? ' · ' + channelLabels[i] : ''}`}
              >
                {channelLabels[i]}
              </span>
              {/* Role and filter share a row — one row fewer in the card. */}
              <div className="flex gap-1 w-full">
              {/* Role override — dim = auto (classifier), amber = locked by user */}
              {(() => {
                const userRole = ch?.dubRole ?? null;
                const autoRole = autoRoles[i] ?? null;
                return (
                  <select
                    value={userRole ?? ''}
                    onChange={(e) => setChannelDubRole(i, e.target.value || null)}
                    className={
                      'flex-1 min-w-0 text-[8px] font-mono rounded border px-0.5 py-0.5 transition-colors ' +
                      (userRole === 'empty'
                        ? 'bg-accent-error/20 border-accent-error text-accent-error'
                        : userRole
                          ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
                          : 'bg-dark-bgTertiary border-dark-border text-text-muted')
                    }
                    title={
                      userRole === 'empty'
                        ? `Ch ${i + 1} — excluded from AutoDub (no moves will target this channel)`
                        : `Ch ${i + 1} role — classifier says "${autoRole ?? '?'}". Override locks AutoDub targeting.`
                    }
                    disabled={!busEnabled}
                  >
                    <option value="">{autoRole ?? '—'}</option>
                    <option value="percussion">Drums</option>
                    <option value="bass">Bass</option>
                    <option value="lead">Lead</option>
                    <option value="skank">Skank</option>
                    <option value="pad">Pad</option>
                    <option value="empty">Exclude</option>
                  </select>
                );
              })()}
              {/* Per-channel mini-bus: filter mode */}
              {(() => {
                const filterMode = ch?.dubFilterMode ?? 'off';
                return (
                  <>
                    <select
                      value={filterMode}
                      onChange={(e) => setChannelDubFilter(i, e.target.value as 'off' | 'hpf' | 'lpf')}
                      className={
                        'flex-1 min-w-0 text-[8px] font-mono rounded border px-0.5 py-0.5 transition-colors ' +
                        (filterMode !== 'off'
                          ? 'bg-accent-warning/20 border-accent-warning text-accent-warning'
                          : 'bg-dark-bgTertiary border-dark-border text-text-muted')
                      }
                      title={`Ch ${i + 1} filter — Off / High Pass / Low Pass. Shapes the audio before it enters the dub bus mix.`}
                      disabled={!busEnabled}
                    >
                      <option value="off">Filter off</option>
                      <option value="hpf">High Pass</option>
                      <option value="lpf">Low Pass</option>
                    </select>
                  </>
                );
              })()}
              </div>
              {/* Filter cutoff (when a filter is on) + reverb send + sweep */}
              {(() => {
                const filterMode = ch?.dubFilterMode ?? 'off';
                const filterHz = ch?.dubFilterHz ?? 200;
                const reverbSend = ch?.dubReverbSend ?? 0;
                const sweepAmt = ch?.dubSweepAmount ?? 0;
                return (
                  <>
                    {filterMode !== 'off' && (
                      <input
                        type="range" min={40} max={8000} step={10}
                        value={filterHz}
                        onChange={(e) => setChannelDubFilter(i, filterMode, Number(e.target.value))}
                        className="w-full accent-accent-warning"
                        disabled={!busEnabled}
                        title={`Filter cutoff ${filterHz} Hz`}
                      />
                    )}
                    {/* min-w-0 on both columns: a flex child defaults to
                        min-width:auto, so the range inputs' intrinsic ~129px
                        each became the floor for this row and set the whole
                        channel card to 280px. Every other control in the card
                        is 74px or less. */}
                    <div className="flex gap-1 w-full">
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <span className="text-[7px] text-text-muted">Rvb</span>
                        <input
                          type="range" min={0} max={1} step={0.01}
                          value={reverbSend}
                          onChange={(e) => setChannelDubReverbSend(i, Number(e.target.value))}
                          className="w-full accent-accent-secondary"
                          disabled={!busEnabled}
                          title={`Ch ${i + 1} dry spring reverb send ${Math.round(reverbSend * 100)}% — bypasses echo, feeds spring directly`}
                        />
                      </div>
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <span className="text-[7px] text-text-muted">Swp</span>
                        <input
                          type="range" min={0} max={1} step={0.01}
                          value={sweepAmt}
                          onChange={(e) => setChannelDubSweepAmount(i, Number(e.target.value))}
                          className="w-full accent-accent-secondary"
                          disabled={!busEnabled}
                          title={`Ch ${i + 1} per-channel comb sweep ${Math.round(sweepAmt * 100)}%`}
                        />
                      </div>
                    </div>
                  </>
                );
              })()}
              {/* 3x3: eight ops + HOLD, three rows instead of nine. */}
              <div className="grid grid-cols-3 gap-1 w-full">
              {CHANNEL_OPS.map((op) => {
                const key = `${op.moveId}:${i}`;
                const active = heldMoves.has(key) || activeFires.has(key);
                const isHold = op.kind === 'hold';
                return (
                  <button
                    key={op.moveId}
                    className={colorClasses(op.color, active) + ' w-full text-center'}
                    onClick={isHold ? undefined : () => fireTrigger(op.moveId, i)}
                    {...(isHold ? holdButtonProps(op.moveId, i) : {})}
                    {...hoverProps(`Ch ${i + 1} · ${op.label} — ${op.title}${isHold ? ' (press-and-hold)' : ''}`)}
                    disabled={!busEnabled}
                  >
                    {op.label}
                  </button>
                );
              })}
              <button
                className={
                  'px-2.5 py-1 rounded border w-full text-xs font-bold transition-all duration-150 ' +
                  (isHeld
                    ? 'bg-accent-primary border-accent-primary text-text-inverse shadow-[0_0_8px_var(--color-accent-primary)]'
                    : isFlashed
                      ? 'bg-accent-highlight/30 border-accent-highlight text-accent-highlight'
                      : hasDubSend
                        ? 'bg-dark-bgTertiary border-dark-borderLight text-text-primary hover:border-accent-primary'
                        : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:text-text-primary')
                }
                onClick={() => toggleHold(i)}
                title={`Ch ${i + 1}${ch ? ' · ' + ch.name : ''} — click to ${isHeld ? 'STOP' : 'START'} sustained dubbing. Multiple channels can dub simultaneously.`}
                disabled={!busEnabled}
              >
                HOLD
              </button>
              </div>
              </div>
              {/* Right column: fader fills the stack's height, readout under it */}
              <div className="flex flex-col items-center gap-1 shrink-0 min-h-0">
              {/* flex-1 min-h-0 box: the fader is a flex child, so without a
                  growing box to fill it shrinks to nothing instead of matching
                  the button stack. */}
              <div className="flex-1 min-h-0 flex items-stretch">
              <Fader
                value={dubSend}
                size="md"
                fillHeight
                color={channelFiring ? 'accent-highlight' : 'accent-primary'}
                onChange={(v) => setChannelDubSend(i, v)}
                title={`Ch ${i + 1} dub send — ${Math.round(dubSend * 100)}%. Drag vertically; double-click for full send. Each real dub desk had faders on every channel — riding these is how Tubby mixed.`}
                disabled={!busEnabled}
                doubleClickValue={1}
                paramKey={`dub.channelSend.ch${i}`}
              />
              </div>
              <span className="w-7 text-center tabular-nums text-[9px] font-mono text-text-secondary leading-none">
                {Math.round(dubSend * 100)}%
              </span>
              </div>
            </div>
          );
        })}
      </div>


      </>)}

      {/* ── EQ tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'eq' && (
        busEnabled
          ? (() => {
              const eq = getActiveDubBus()?.getReturnEQ();
              return eq
                ? <Fil4EqPanel effect={eq} />
                : <div className="py-4 text-center text-text-muted text-xs font-mono">Return EQ not available</div>;
            })()
          : <div className="py-4 text-center text-text-muted text-xs font-mono">Enable bus to use the return EQ</div>
      )}

      {/* ── BUS tab — TONE shaping controls ────────────────────────────────── */}
      {activeTab === 'bus' && (
        /* One row of faders, two labelled groups. These were five full-width
           horizontal sliders stacked one per row: a slider the width of the
           deck gives coarse control and five rows made the tab scroll — "put
           more sliders side by side and make the page less tall"
           (2026-09-22). `<Fader>` is the design-system control the channel
           cards already use; its width comes from `size` alone, so the row
           cannot resize under the hand (3fc982a76). */
        <div className="flex items-start gap-6 p-2 text-xs text-text-muted flex-wrap">
          {/* Two groups, because they act on two different signals. BASS,
              MID and WIDTH sit in the master insert and shape the WHOLE mix
              the moment the bus is on. The sweep is on the wet bus and is
              inaudible until something is sent — "i am testing many of the
              click buttons ... but i dont hear most of them" (2026-09-22). */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] font-mono uppercase tracking-wide text-text-muted border-b border-dark-borderLight pb-0.5">
              Master — shapes the whole mix
            </div>
            <div className="flex items-end gap-4 px-1">
              <Fader
                label="BASS" size="md" color="accent-primary"
                min={-12} max={12}
                value={dubBusSettings.bassShelfGainDb}
                onChange={(v) => setDubBus({ bassShelfGainDb: Math.round(v * 2) / 2, characterPreset: 'custom' })}
                formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`}
                disabled={!busEnabled}
                title={`Bass shelf at ${dubBusSettings.bassShelfFreqHz}Hz · classic Tubby bass lift`}
                doubleClickValue={0}
              />
              <Fader
                label="MID" size="md" color="accent-secondary"
                min={-12} max={6}
                value={dubBusSettings.midScoopGainDb}
                onChange={(v) => setDubBus({ midScoopGainDb: Math.round(v * 2) / 2, characterPreset: 'custom' })}
                formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`}
                disabled={!busEnabled}
                title={`Mid peaking at ${dubBusSettings.midScoopFreqHz}Hz · Scientist mid-scoop`}
                doubleClickValue={0}
              />
              <Fader
                label="WIDTH" size="md" color="accent-highlight"
                min={0} max={2}
                value={dubBusSettings.stereoWidth}
                onChange={(v) => setDubBus({ stereoWidth: Math.round(v * 20) / 20, characterPreset: 'custom' })}
                formatValue={(v) => `${v.toFixed(2)}×`}
                disabled={!busEnabled}
                title="Stereo width · 0=mono (Perry), 1=neutral, 2=wide (Mad Professor)"
                doubleClickValue={1}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] font-mono uppercase tracking-wide text-text-muted border-b border-dark-borderLight pb-0.5">
              Wet bus — echo and spring return only; needs a send or Auto Dub
            </div>
            <div className="flex items-end gap-4 px-1">
              <Fader
                label="SWEEP" size="md" color="accent-secondary"
                min={0} max={1}
                value={liveSweepAmount}
                onChange={(v) => setDubBus({ sweepAmount: Math.round(v * 100) / 100, characterPreset: 'custom' })}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                disabled={!busEnabled}
                title="Sweep wet amount"
              />
              <Fader
                label="RATE" size="md" color="accent-secondary"
                min={0.05} max={3}
                value={liveSweepRateHz}
                onChange={(v) => setDubBus({ sweepRateHz: Math.round(v * 20) / 20, characterPreset: 'custom' })}
                formatValue={(v) => `${v.toFixed(2)} Hz`}
                disabled={!busEnabled || liveSweepAmount === 0}
                title="Sweep LFO rate"
              />
              <button
                className={`self-center px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors w-16 shrink-0 ${
                  dubBusSettings.sweepMode === 'phaser'
                    ? 'bg-accent-secondary/20 border-accent-secondary text-accent-secondary'
                    : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted'
                }`}
                onClick={() => setDubBus({ sweepMode: dubBusSettings.sweepMode === 'phaser' ? 'comb' : 'phaser', characterPreset: 'custom' })}
                disabled={!busEnabled}
                title="Sweep mode — Phaser or Comb"
              >{dubBusSettings.sweepMode === 'phaser' ? 'Phaser' : 'Comb'}</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
