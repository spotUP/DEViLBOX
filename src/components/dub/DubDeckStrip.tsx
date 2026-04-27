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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@stores/useNotificationStore';
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useUIStore } from '@/stores/useUIStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { bpmSyncedEchoRate, getActiveBpm } from '@/engine/dub/DubActions';
import { subscribeDubRouter, subscribeDubRelease, fire as fireDub } from '@/engine/dub/DubRouter';
import { getAutoDubCurrentRoles } from '@/engine/dub/AutoDub';
import { startDubRecorder, clearDubCurvesForCurrentPattern } from '@/engine/dub/DubRecorder';
import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { getSongTimeSec } from '@/engine/dub/songTime';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { getChannelRoutedEffectsManager } from '@/engine/tone/ChannelRoutedEffects';
import { getToneEngine } from '@/engine/ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { Fader } from '@components/controls/Fader';
import { AutoDubPanel } from './AutoDubPanel';
import { Fil4EqPanel } from '@components/effects/Fil4EqPanel';
import { getActiveDubBus } from '@engine/dub/DubBus';

import { DUB_CHARACTER_PRESETS } from '@/types/dub';
import { getPersona } from '@/engine/dub/AutoDubPersonas';
import type { AutoDubPersonaId } from '@/stores/useDubStore';

// ── Unified Dub Style table ──────────────────────────────────────────────────
// Each style applies BOTH a bus character preset (engineer tone) AND an AutoDub
// persona (AI behavior). This eliminates the old VOICE/persona duplication.
const DUB_STYLES = [
  { id: 'custom',       label: 'Custom',              characterPreset: 'custom'       as const, personaId: 'custom'       as AutoDubPersonaId },
  { id: 'tubby',        label: 'King Tubby',          characterPreset: 'tubby'        as const, personaId: 'tubby'        as AutoDubPersonaId },
  { id: 'scientist',    label: 'Scientist',           characterPreset: 'scientist'    as const, personaId: 'scientist'    as AutoDubPersonaId },
  { id: 'perry',        label: 'Lee "Scratch" Perry', characterPreset: 'perry'        as const, personaId: 'perry'        as AutoDubPersonaId },
  { id: 'madProfessor', label: 'Mad Professor',       characterPreset: 'madProfessor' as const, personaId: 'madProfessor' as AutoDubPersonaId },
  { id: 'jammy',        label: 'Prince Jammy',        characterPreset: null           as null,  personaId: 'jammy'        as AutoDubPersonaId },
  { id: 'gatedFlanger', label: 'Gated Flanger',       characterPreset: 'gatedFlanger' as const, personaId: 'custom'       as AutoDubPersonaId },
];

// ─── Role inference ────────────────────────────────────────────────────────
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

// ─── Per-channel ops ────────────────────────────────────────────────────────
// Each channel strip shows these 4 buttons alongside the hold-toggle + send
// knob. Label/title/moveId tuple keeps the rendering loop tight.
const CHANNEL_OPS: Array<{ label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold' }> = [
  { label: 'Mute',  title: 'Mute — silence this channel while held',          moveId: 'channelMute',     color: 'accent-error',      kind: 'hold' },
  { label: 'Throw', title: 'Throw — long echoThrow (4 beats + heavy tail)',   moveId: 'channelThrow',    color: 'accent-primary/70', kind: 'trigger' },
  { label: 'Echo',  title: 'Echo Throw — open tap + feedback spike',          moveId: 'echoThrow',       color: 'accent-primary',    kind: 'trigger' },
  { label: 'Skank', title: 'Skank Echo — dotted-delay floating echo (1.5 × beat). The echo repeats at offset positions so it sounds like a lower tempo — the defining offbeat dub sound.', moveId: 'skankEchoThrow', color: 'accent-highlight/70', kind: 'hold' },
  { label: '✦',    title: 'Dub Stab — short-sharp echo kiss',                 moveId: 'dubStab',         color: 'accent-highlight',  kind: 'trigger' },
  { label: 'Build', title: 'Build — ramp send up over 2 bars, mute dry, let echoes carry (offbeat-guitar gesture)', moveId: 'echoBuildUp', color: 'accent-warning', kind: 'trigger' },
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
  { label: 'Toast',        title: 'Toast — route DJ mic into bus while held (auto-starts mic)', moveId: 'toast', color: 'accent-success/70', kind: 'hold', group: 'hold' },
  { label: 'Siren',     title: 'Dub Siren — Rasta-box pitch-swept synth while held',           moveId: 'dubSiren',     color: 'accent-warning',  kind: 'hold', group: 'hold' },
  { label: 'Scream',    title: 'Tubby Scream — reverb self-feedback, rising metallic cry',      moveId: 'tubbyScream',  color: 'accent-error',    kind: 'hold', group: 'hold' },
  { label: 'Bass',      title: 'Osc Bass — self-oscillating LPF bass drone while held',         moveId: 'oscBass',      color: 'accent-primary',  kind: 'hold', group: 'hold' },
  { label: 'Crush Bass', title: 'Crush Bass — 3-bit quantize saw drone while held',             moveId: 'crushBass',    color: 'accent-error/70', kind: 'hold', group: 'hold' },

  // ── TOGGLE — click once to activate, click again to deactivate (hands-free) ──
  { label: 'Wide',       title: 'Stereo Doubler — 20ms cross-fed widening (toggle)',               moveId: 'stereoDoubler', color: 'accent-highlight',   kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Wobble',     title: 'Tape Wobble — LFO on echo rate (toggle)',                         moveId: 'tapeWobble',   color: 'accent-warning/70',  kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Ghost',      title: 'Ghost Reverb — extra reverb decay on channels (toggle)',          moveId: 'ghostReverb',  color: 'accent-secondary',   kind: 'hold', group: 'toggle', needsSend: true },
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
const colorClasses = (token: string, active: boolean) => {
  const base = 'px-2.5 py-1 rounded border text-xs font-bold transition-all duration-150 ';
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
  const autoDubSettingsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Derive current style. For presets with unique characterPreset values
  // (tubby/scientist/perry/madProfessor/gatedFlanger) the characterPreset alone
  // identifies the style. For 'custom' characterPreset, multiple styles map
  // here (Custom and Prince Jammy both have null/custom preset) — use the
  // persona to disambiguate between them.
  const currentStyle = DUB_STYLES.find(s => {
    const effectivePreset = s.characterPreset ?? 'custom';
    if (effectivePreset !== (dubBusSettings.characterPreset || 'custom')) return false;
    // When the characterPreset is 'custom', use persona to pick the right entry
    if (effectivePreset === 'custom') return s.personaId === autoDubPersona;
    return true;
  }) ?? DUB_STYLES[0];

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
  const [hoverHint, setHoverHint] = useState<string | null>(null);
  useEffect(() => {
    if (flashedChannel === null) return;
    const t = setTimeout(() => setFlashedChannel(null), 400);
    return () => clearTimeout(t);
  }, [flashedChannel]);

  // Auto-detected channel roles — polled from AutoDub at 500ms so the UI
  // reflects what the classifier currently thinks even while it's running.
  const [autoRoles, setAutoRoles] = useState<readonly string[]>([]);
  useEffect(() => {
    const t = setInterval(() => setAutoRoles(getAutoDubCurrentRoles()), 500);
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
  const activeHolds = useRef<Map<string, () => void>>(new Map());

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

  const releaseAllHeld = useCallback(() => {
    for (const release of heldReleasers.current.values()) {
      try { release(); } catch { /* ok */ }
    }
    heldReleasers.current.clear();
    setHeldChannels(new Set());
    for (const release of activeHolds.current.values()) {
      try { release(); } catch { /* ok */ }
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
    const apply = () => setStripCollapsed(!busEnabled);
    if (isInitialMount) {
      // Defer one frame so initial layout paints first — avoids the
      // transient DJ/VJ view-switch flicker we saw when firing synchronously.
      const handle = requestAnimationFrame(apply);
      return () => cancelAnimationFrame(handle);
    }
    apply();
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
    // NOTE: DubRouter registration now happens inside DrumPadEngine's
    // constructor so every view — tracker, DJ, drumpad, VJ — can fire
    // dub moves without coupling to a specific UI mount. We intentionally
    // do NOT call setDubBusForRouter(null) on unmount: that would break
    // the DJ DUB tab + drumpad dub pads + MIDI dub routing the instant
    // the user left the tracker view. The engine owns the lifecycle.
    try {
      const mgr = getChannelRoutedEffectsManager(getToneEngine().masterEffectsInput);
      mgr.setupDubBusWiring(bus.inputNode, bus);
    } catch (e) {
      console.warn('[DubDeckStrip] setupDubBusWiring failed:', e);
    }
    // Lazy activation path — moves (Echo Throw, Dub Stab, etc) fired on a
    // channel whose fader is at 0 need a way to spin up the worklet dub
    // slot. openChannelTap calls this to drive setChannelDubSend.
    bus.setChannelActivationCallback((ch, amt) => {
      useMixerStore.getState().setChannelDubSend(ch, amt);
    });
    return () => {
      bus.setChannelActivationCallback(null);
    };
  }, []);

  // Master-insert TONE EQ — when the bus is ON we splice the bass shelf +
  // mid scoop + stereo width into the master signal path between
  // masterEffectsInput and blepInput. This is what makes BASS/MID/WIDTH
  // sliders shape the WHOLE mix (dry + wet together), matching real dub
  // engineering where the master bus is EQ'd, not just the return.
  useEffect(() => {
    if (!busEnabled) return;
    const engine = ensureDrumPadEngine();
    const bus = engine.getDubBus();
    const tone = getToneEngine();
    const sourceNative = getNativeAudioNode(tone.masterEffectsInput);
    const destNative   = getNativeAudioNode(tone.blepInput);
    if (!sourceNative || !destNative) {
      console.warn('[DubDeckStrip] master insert: native nodes unavailable');
      return;
    }
    try {
      bus.wireMasterInsert(sourceNative, destNative);
    } catch (e) {
      console.warn('[DubDeckStrip] wireMasterInsert failed:', e);
    }
    return () => {
      try { bus.unwireMasterInsert(); } catch { /* ok */ }
    };
  }, [busEnabled]);

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
  const transportBpm = useTransportStore((s) => s.bpm);

  useEffect(() => {
    // Debounce 100 ms — pitch-fader scrubbing in DJ view and rapid tempo
    // commands in tracker view can fire a dozen BPM updates in a few
    // hundred ms. Without debounce the engine churns setDubBusSettings
    // calls that ramp the delay line audibly.
    const h = setTimeout(() => {
      try {
        const bpm = getActiveBpm();
        const safeBpm = Math.max(30, Math.min(300, bpm || 120));
        const beatMs = 60000 / safeBpm;
        // When a RATE preset is active, treat division as 'off' so the preset
        // rate is preserved and doesn't drift with BPM changes.
        const effectiveDivision = activeRatePresetRef.current ? 'off' : dubBusSettings.echoSyncDivision;
        const synced = bpmSyncedEchoRate(bpm, effectiveDivision, dubBusSettings.echoRateMs);
        // Mad Professor ping-pong BPM sync — 3/8 note L, 1/2 note R.
        const patch: typeof dubBusSettings = { ...dubBusSettings, echoRateMs: synced };
        if (dubBusSettings.pingPongSyncToBpm) {
          patch.pingPongLMs = Math.round(beatMs * 0.75);  // 3/8 note (dotted 8th)
          patch.pingPongRMs = Math.round(beatMs * 1.0);   // 1/2 note (half of a beat)
        }
        ensureDrumPadEngine().setDubBusSettings(patch);
      } catch (e) {
        console.warn('[DubDeckStrip] setDubBusSettings failed:', e);
      }
    }, 100);
    return () => clearTimeout(h);
  }, [dubBusSettings, transportBpm]);

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
  // Whether ANY visible channel has a non-zero dub-send — processors
  // (bus-audio modifiers) can only make sound when at least one channel
  // is feeding the bus. Used to dim the processor row + show a hint.
  const anySend = channels.slice(0, visibleChannelCount).some(c => (c?.dubSend ?? 0) > 0);

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
  // 0.015 (~-36 dB) so it bleeds through the dub return even when the
  // main-mix mute is on. When disabled, floor is lifted; user's explicit
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
          setChannelDubSend(i, 0.015);
        }
      }
    } else {
      for (const [i, prior] of priorSendsBeforeGhost.current.entries()) {
        const cur = channels[i]?.dubSend ?? 0;
        // Only reset channels that are still at the ghost level (user hasn't
        // dragged them up manually)
        if (Math.abs(cur - 0.015) < 0.001) {
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
    const style = DUB_STYLES.find(s => s.id === styleId) ?? DUB_STYLES[0];
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
    fireDub(persona.signatureMove, undefined, persona.paramOverrides?.[persona.signatureMove] ?? {}, 'live');
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
      const name = mixerState.channels[i]?.name ?? '';
      const role = inferRoleFromName(name);

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
  }, [pattern, setChannelDubSend]);

  // Sustained-hold channel tap. HOLD must work regardless of the channel's
  // current dubSend fader position — including 0 (no send). We drive the
  // mixer's dubSend directly: HOLD pushes to 1.0 (activates the worklet
  // slot via setChannelDubSend's lazy activation); release restores the
  // prior fader value. Using bus.openChannelTap on top wouldn't help at
  // send=0 because the per-channel tap GainNode only gets registered with
  // DubBus *after* _activateDubChannel completes asynchronously — racey
  // and silent on a cold channel.
  const toggleHold = useCallback((channelId: number) => {
    if (!busEnabled) return;
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
  }, [busEnabled, setChannelDubSend]);

  // Trigger handler — single click fires one-shot.
  const fireTrigger = useCallback((moveId: string, channelId?: number) => {
    if (!busEnabled) return;
    fireDub(moveId, channelId);
  }, [busEnabled]);

  // Hold handlers — pointerdown starts the move, pointerup/pointercancel/
  // pointerleave releases it. Proper press-and-hold (not click-to-toggle),
  // matching physical instrument gesture.
  const holdStart = useCallback((moveId: string, channelId?: number) => {
    if (!busEnabled) { console.warn(`[DubDeck] holdStart ${moveId} ignored — bus disabled`); return; }
    const key = `${moveId}:${channelId ?? 'g'}`;
    if (activeHolds.current.has(key)) { console.warn(`[DubDeck] holdStart ${moveId} ignored — already active in map`); return; }
    const disp = fireDub(moveId, channelId);
    console.log(`[DubDeck] holdStart ${moveId} fired → disposer=${!!disp}`);
    if (disp) {
      activeHolds.current.set(key, () => disp.dispose());
      setHeldMoves(prev => new Set(prev).add(key));
    }
  }, [busEnabled]);

  const holdEnd = useCallback((moveId: string, channelId?: number) => {
    const key = `${moveId}:${channelId ?? 'g'}`;
    const release = activeHolds.current.get(key);
    if (!release) return;
    activeHolds.current.delete(key);
    setHeldMoves(prev => { const n = new Set(prev); n.delete(key); return n; });
    try { release(); } catch { /* ok */ }
  }, []);

  // Toggle handler — click once to activate, click again to deactivate.
  const handleToggle = useCallback((moveId: string) => {
    if (!busEnabled) return;
    if (toggleDisposers.current.has(moveId)) {
      // Currently active — deactivate
      const release = toggleDisposers.current.get(moveId)!;
      toggleDisposers.current.delete(moveId);
      setToggledMoves(prev => { const n = new Set(prev); n.delete(moveId); return n; });
      try { release(); } catch { /* ok */ }
    } else {
      // Not active — activate (fire as hold, store disposer)
      const disp = fireDub(moveId, undefined);
      if (disp) {
        toggleDisposers.current.set(moveId, () => disp.dispose());
        setToggledMoves(prev => new Set(prev).add(moveId));
      }
    }
  }, [busEnabled]);

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
    if (!busEnabled) return;
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
      const disp = fireDub(moveId, undefined);
      if (disp) {
        rateDisposer.current = () => disp.dispose();
        setActiveRatePreset(moveId);
      }
    }
  }, [busEnabled, activeRatePreset]);

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-dark-bgSecondary border-t border-dark-border font-mono overflow-y-auto max-h-[60vh]">
      {/* Header row */}
      <div className="flex items-center gap-2 text-xs">
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
          onClick={() => setDubBus({ enabled: !busEnabled })}
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
          disabled={!busEnabled}
          title={autoDubEnabled ? 'Auto Dub is ON — click to stop' : 'Auto Dub — click to enable autonomous dub performance'}
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
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted text-xs">JA</span>
          <input
            type="range" min={0} max={10} step={0.5}
            value={vinylLevel}
            onChange={(e) => setVinylLevel(Number(e.target.value))}
            className="w-20 accent-accent-warning"
            disabled={!busEnabled}
            title={`JA Press: ${vinylLevel.toFixed(1)} / 10 — vinyl wear (surface noise, clicks, wow/flutter, HF roll-off, rumble, L/R drift). 0 = factory new, 10 = gutter-scraped Jamaican 7-inch.`}
          />
          <span className="w-8 text-text-secondary text-xs">{vinylLevel.toFixed(1)}</span>
        </div>
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
            🎤 {micActive ? 'ON' : 'OFF'}
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
        <button
          className="px-2.5 py-1 rounded bg-accent-error text-white font-semibold hover:bg-accent-error/80 text-xs"
          onClick={() => window.dispatchEvent(new Event('dub-panic'))}
          title="Drain the bus + disarm recording"
        >
          KILL
        </button>
      </div>

      {/* FX Wet — quick returnGain fader, always visible when bus is on */}
      {busEnabled && (
        <div className="flex items-center gap-2 px-1 py-1 border-b border-dark-border">
          <span className="text-text-muted text-[9px] font-mono shrink-0 w-10 text-right">FX WET</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={dubBusSettings.returnGain}
            onChange={(e) => setDubBus({ returnGain: Number(e.target.value) })}
            className="flex-1 accent-accent-highlight cursor-pointer"
            title={`FX wet level: ${(dubBusSettings.returnGain * 100).toFixed(0)}%`}
          />
          <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
            {(dubBusSettings.returnGain * 100).toFixed(0)}%
          </span>
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
      {/* Hover info bar — always rendered to reserve space and prevent layout jitter */}
      <div className={`px-3 py-1 border rounded text-xs font-mono truncate ${hoverHint ? 'bg-dark-bg border-dark-borderLight text-text-secondary' : 'border-transparent text-transparent'}`}>
        {hoverHint || '\u00A0'}
      </div>

      <div className="flex flex-col gap-1.5 pb-1.5 border-b border-dark-border">
        {/* ── CLICK — one-shot triggers ── */}
        <div className="flex items-start gap-1.5 text-xs">
          <span
            className="text-text-muted w-16 shrink-0 pt-0.5 font-bold tracking-wide"
            title="Click to fire once — no hold needed"
          >CLICK ▸</span>
          <div className="flex gap-1.5 flex-wrap">
            {GLOBAL_MOVES.filter(m => m.group === 'click').map((m) => {
              const key = `${m.moveId}:g`;
              const active = activeFires.has(key);
              const noSend = !!m.needsSend && !anySend;
              return (
                <button
                  key={m.moveId}
                  className={colorClasses(m.color, active) + (noSend && busEnabled ? ' opacity-40' : '')}
                  onClick={() => {
                    if (noSend) {
                      notify.warning('Raise a CH send first — drag a channel fader up on the right');
                      return;
                    }
                    fireTrigger(m.moveId);
                  }}
                  onPointerLeave={() => setHoverHint(null)}
                  onMouseEnter={() => setHoverHint(`${m.label} — ${m.title}${noSend ? ' (needs CH send)' : ''}`)}
                  title={m.title + (noSend ? ' — raise a CH send to hear' : '')}
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
          <div className="flex gap-1.5 flex-wrap">
            {GLOBAL_MOVES.filter(m => m.group === 'rate').map((m) => {
              const isActive = activeRatePreset === m.moveId;
              return (
                <button
                  key={m.moveId}
                  className={
                    colorClasses(m.color, isActive) +
                    (isActive ? ' ring-2 ring-offset-1 ring-offset-dark-bgSecondary ring-white/70' : '')
                  }
                  onClick={() => handleRatePreset(m.moveId)}
                  onPointerLeave={() => setHoverHint(null)}
                  onMouseEnter={() => setHoverHint(`${m.label} — ${m.title}${isActive ? ' (active — click to restore)' : ''}`)}
                  title={m.title}
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
          <div className="flex gap-1.5 flex-wrap">
            {GLOBAL_MOVES.filter(m => m.group === 'hold').map((m) => {
              const key = `${m.moveId}:g`;
              const active = heldMoves.has(key) || activeFires.has(key);
              const noSend = !!m.needsSend && !anySend;
              return (
                <button
                  key={m.moveId}
                  className={colorClasses(m.color, active) + (noSend && busEnabled ? ' opacity-40' : '')}
                  onPointerDown={(e) => {
                    if (noSend) {
                      notify.warning('Raise a CH send first — drag a channel fader up on the right');
                      return;
                    }
                    e.currentTarget.setPointerCapture(e.pointerId);
                    holdStart(m.moveId);
                  }}
                  onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(m.moveId); }}
                  onPointerLeave={() => setHoverHint(null)}
                  onPointerCancel={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(m.moveId); }}
                  onMouseEnter={() => setHoverHint(`${m.label} — ${m.title}${noSend ? ' (needs CH send)' : ''}`)}
                  title={m.title + ' (press-and-hold)' + (noSend ? ' — raise a CH send to hear' : '')}
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
          <div className="flex gap-1.5 flex-wrap">
            {GLOBAL_MOVES.filter(m => m.group === 'toggle').map((m) => {
              const key = `${m.moveId}:g`;
              const toggled = toggledMoves.has(m.moveId);
              const active = toggled || heldMoves.has(key) || activeFires.has(key);
              const noSend = !!m.needsSend && !anySend;
              const dimmed = noSend && busEnabled && !toggled;
              return (
                <button
                  key={m.moveId}
                  className={
                    colorClasses(m.color, active) +
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
                  onPointerLeave={() => setHoverHint(null)}
                  onMouseEnter={() => setHoverHint(`${m.label} — ${m.title}${toggled ? ' (ON — click to stop)' : noSend ? ' (needs CH send)' : ' (click to toggle on)'}`)}
                  title={m.title + (toggled ? ' — ON, click to deactivate' : ' — click to toggle on/off') + (noSend && !toggled ? ' — raise a CH send to hear' : '')}
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
      <div className="flex items-stretch gap-2 overflow-x-auto pt-1.5">
        {/* Master send — scales all channel sends at once */}
        <div
          className={
            'flex flex-col items-center gap-1.5 px-2 py-1.5 rounded border min-w-[64px] shrink-0 ' +
            'bg-dark-bgSecondary border-accent-primary/40'
          }
        >
          {/* Top group: label + ops + hold — must match channel columns */}
          <div className="flex flex-col items-center gap-1.5 w-full">
          <span className="text-xs font-bold text-accent-primary leading-none">MASTER</span>
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
                onPointerDown={isHold ? (e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  for (let i = 0; i < visibleChannelCount; i++) holdStart(op.moveId, i);
                } : undefined}
                onPointerUp={isHold ? (e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                } : undefined}
                onPointerLeave={() => setHoverHint(null)}
                onPointerCancel={isHold ? (e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                } : undefined}
                onMouseEnter={() => setHoverHint(`ALL · ${op.label} — ${op.title}`)}
                title={`ALL channels · ${op.title}${isHold ? ' (press-and-hold)' : ''}`}
                disabled={!busEnabled}
              >
                {op.label}
              </button>
            );
          })}
          <button
            className={
              'px-2 py-1 rounded border w-full text-xs font-bold transition-all duration-150 ' +
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
          {/* Bottom group: ALL/NONE + fader — master-only controls */}
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
          <Fader
            value={masterSendValue}
            size="md"
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
          <span className="text-xs font-mono text-accent-primary leading-none">
            {Math.round(masterSendValue * 100)}%
          </span>
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
                'flex flex-col items-center gap-1.5 px-2 py-1.5 rounded border min-w-[64px] shrink-0 transition-colors ' +
                (channelFiring
                  ? 'bg-accent-highlight/15 border-accent-highlight'
                  : isHeld
                    ? 'bg-accent-primary/10 border-accent-primary'
                    : hasDubSend
                      ? 'bg-dark-bg border-dark-borderLight'
                      : 'bg-dark-bgTertiary border-dark-border')
              }
            >
              {/* Top group: label + ops + hold — matches master column */}
              <div className="flex flex-col items-center gap-1.5 w-full">
              <span
                className="text-xs font-bold text-text-secondary leading-none truncate max-w-[56px]"
                title={`Ch ${i + 1}${ch ? ' · ' + ch.name : ''}`}
              >
                CH {i + 1}
              </span>
              {/* Role override — dim = auto (classifier), amber = locked by user */}
              {(() => {
                const userRole = ch?.dubRole ?? null;
                const autoRole = autoRoles[i] ?? null;
                return (
                  <select
                    value={userRole ?? ''}
                    onChange={(e) => setChannelDubRole(i, e.target.value || null)}
                    className={
                      'w-full text-[8px] font-mono rounded border px-0.5 py-0.5 transition-colors ' +
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
              {/* Per-channel mini-bus: filter + reverb send + sweep */}
              {(() => {
                const filterMode = ch?.dubFilterMode ?? 'off';
                const filterHz = ch?.dubFilterHz ?? 200;
                const reverbSend = ch?.dubReverbSend ?? 0;
                const sweepAmt = ch?.dubSweepAmount ?? 0;
                return (
                  <>
                    <select
                      value={filterMode}
                      onChange={(e) => setChannelDubFilter(i, e.target.value as 'off' | 'hpf' | 'lpf')}
                      className={
                        'w-full text-[8px] font-mono rounded border px-0.5 py-0.5 transition-colors ' +
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
                    <div className="flex gap-1 w-full">
                      <div className="flex flex-col items-center flex-1">
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
                      <div className="flex flex-col items-center flex-1">
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
              {CHANNEL_OPS.map((op) => {
                const key = `${op.moveId}:${i}`;
                const active = heldMoves.has(key) || activeFires.has(key);
                const isHold = op.kind === 'hold';
                return (
                  <button
                    key={op.moveId}
                    className={colorClasses(op.color, active) + ' w-full text-center'}
                    onClick={isHold ? undefined : () => fireTrigger(op.moveId, i)}
                    onPointerDown={isHold ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); holdStart(op.moveId, i); } : undefined}
                    onPointerUp={isHold ? (e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(op.moveId, i); } : undefined}
                    onPointerLeave={() => setHoverHint(null)}
                    onPointerCancel={isHold ? (e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(op.moveId, i); } : undefined}
                    onMouseEnter={() => setHoverHint(`Ch ${i + 1} · ${op.label} — ${op.title}`)}
                    title={`Ch ${i + 1} · ${op.title}${isHold ? ' (press-and-hold)' : ''}`}
                    disabled={!busEnabled}
                  >
                    {op.label}
                  </button>
                );
              })}
              <button
                className={
                  'px-2 py-1 rounded border w-full text-xs font-bold transition-all duration-150 ' +
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
              {/* Bottom group: fader + readout */}
              <Fader
                value={dubSend}
                size="md"
                color={channelFiring ? 'accent-highlight' : 'accent-primary'}
                onChange={(v) => setChannelDubSend(i, v)}
                title={`Ch ${i + 1} dub send — ${Math.round(dubSend * 100)}%. Drag vertically; double-click for full send. Each real dub desk had faders on every channel — riding these is how Tubby mixed.`}
                disabled={!busEnabled}
                doubleClickValue={1}
                paramKey={`dub.channelSend.ch${i}`}
              />
              <span className="text-xs font-mono text-text-secondary leading-none">
                {Math.round(dubSend * 100)}%
              </span>
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
        <div className="flex flex-col gap-2 p-2 text-xs text-text-muted">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-16 shrink-0 font-bold text-text-secondary">BASS</span>
            <input type="range" min={-12} max={12} step={0.5}
              value={dubBusSettings.bassShelfGainDb}
              onChange={(e) => setDubBus({ bassShelfGainDb: Number(e.target.value), characterPreset: 'custom' })}
              className="w-32 accent-accent-primary" disabled={!busEnabled}
              title={`Bass shelf at ${dubBusSettings.bassShelfFreqHz}Hz · classic Tubby bass lift`}
            />
            <span className="w-12">{dubBusSettings.bassShelfGainDb > 0 ? '+' : ''}{dubBusSettings.bassShelfGainDb.toFixed(1)} dB</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-16 shrink-0 font-bold text-text-secondary">MID</span>
            <input type="range" min={-12} max={6} step={0.5}
              value={dubBusSettings.midScoopGainDb}
              onChange={(e) => setDubBus({ midScoopGainDb: Number(e.target.value), characterPreset: 'custom' })}
              className="w-32 accent-accent-secondary" disabled={!busEnabled}
              title={`Mid peaking at ${dubBusSettings.midScoopFreqHz}Hz · Scientist mid-scoop`}
            />
            <span className="w-12">{dubBusSettings.midScoopGainDb > 0 ? '+' : ''}{dubBusSettings.midScoopGainDb.toFixed(1)} dB</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-16 shrink-0 font-bold text-text-secondary">WIDTH</span>
            <input type="range" min={0} max={2} step={0.05}
              value={dubBusSettings.stereoWidth}
              onChange={(e) => setDubBus({ stereoWidth: Number(e.target.value), characterPreset: 'custom' })}
              className="w-32 accent-accent-highlight" disabled={!busEnabled}
              title={`Stereo width · 0=mono (Perry), 1=neutral, 2=wide (Mad Professor)`}
            />
            <span className="w-12">{dubBusSettings.stereoWidth.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors w-16 shrink-0 ${
                dubBusSettings.sweepMode === 'phaser'
                  ? 'bg-accent-secondary/20 border-accent-secondary text-accent-secondary'
                  : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted'
              }`}
              onClick={() => setDubBus({ sweepMode: dubBusSettings.sweepMode === 'phaser' ? 'comb' : 'phaser', characterPreset: 'custom' })}
              disabled={!busEnabled}
            >{dubBusSettings.sweepMode === 'phaser' ? 'Phaser' : 'Comb'}</button>
            <input type="range" min={0} max={1} step={0.01}
              value={dubBusSettings.sweepAmount}
              onChange={(e) => setDubBus({ sweepAmount: Number(e.target.value), characterPreset: 'custom' })}
              className="w-32 accent-accent-secondary" disabled={!busEnabled}
              title={`Sweep wet amount`}
            />
            <span className="w-12">{Math.round(dubBusSettings.sweepAmount * 100)}%</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-16 shrink-0 font-bold text-text-secondary">RATE</span>
            <input type="range" min={0.05} max={3} step={0.05}
              value={dubBusSettings.sweepRateHz}
              onChange={(e) => setDubBus({ sweepRateHz: Number(e.target.value), characterPreset: 'custom' })}
              className="w-32 accent-accent-secondary" disabled={!busEnabled || dubBusSettings.sweepAmount === 0}
              title={`Sweep LFO rate`}
            />
            <span className="w-12">{dubBusSettings.sweepRateHz.toFixed(2)} Hz</span>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
