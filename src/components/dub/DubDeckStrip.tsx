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
import { startDubRecorder } from '@/engine/dub/DubRecorder';
import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { getSongTimeSec } from '@/engine/dub/songTime';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { getChannelRoutedEffectsManager } from '@/engine/tone/ChannelRoutedEffects';
import { getToneEngine } from '@/engine/ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { Fader } from '@components/controls/Fader';
import { DubLaneTimeline } from './DubLaneTimeline';
import { AutoDubPanel } from './AutoDubPanel';

// ─── Per-channel ops ────────────────────────────────────────────────────────
// Each channel strip shows these 4 buttons alongside the hold-toggle + send
// knob. Label/title/moveId tuple keeps the rendering loop tight.
const CHANNEL_OPS: Array<{ label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold' }> = [
  { label: 'Mute',  title: 'Mute — silence this channel while held',          moveId: 'channelMute',  color: 'accent-error',      kind: 'hold' },
  { label: 'Throw', title: 'Throw — long echoThrow (4 beats + heavy tail)',   moveId: 'channelThrow', color: 'accent-primary/70', kind: 'trigger' },
  { label: 'Echo',  title: 'Echo Throw — open tap + feedback spike',          moveId: 'echoThrow',    color: 'accent-primary',    kind: 'trigger' },
  { label: '✦',    title: 'Dub Stab — short-sharp echo kiss',                 moveId: 'dubStab',      color: 'accent-highlight',  kind: 'trigger' },
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
  group: 'click' | 'hold' | 'toggle';
  needsSend?: boolean;
}
const GLOBAL_MOVES: Array<GlobalMove> = [
  // ── CLICK — one-shot triggers ──
  { label: 'SLAM',   title: 'Spring Slam — instant splash of spring reverb',     moveId: 'springSlam',        color: 'accent-success',     kind: 'trigger', group: 'click' },
  { label: 'KICK',   title: 'Spring Kick — punchier shorter spring hit',         moveId: 'springKick',        color: 'accent-success/70',  kind: 'trigger', group: 'click' },
  { label: 'CRACK',  title: 'Snare Crack — bandpass noise burst',                moveId: 'snareCrack',        color: 'text-primary',       kind: 'trigger', group: 'click' },
  { label: 'PING',   title: 'Sonar Ping — 1 kHz sine through the echo',         moveId: 'sonarPing',         color: 'accent-primary/70',  kind: 'trigger', group: 'click' },
  { label: 'RADIO',  title: 'Radio Riser — pink noise sweep 200 Hz → 5 kHz',    moveId: 'radioRiser',        color: 'accent-warning/70',  kind: 'trigger', group: 'click' },
  { label: 'SUB',    title: 'Sub Swell — 55 Hz sine pulse to return',            moveId: 'subSwell',          color: 'accent-primary',     kind: 'trigger', group: 'click' },
  { label: 'STOP!',  title: 'Transport Tape Stop — hold to slow tempo+pitch to floor (LibOpenMPT), releases on let go', moveId: 'transportTapeStop', color: 'accent-error', kind: 'hold', group: 'hold' },
  { label: 'Reverse',  title: 'Reverse Echo — last 0.4 s of bus audio reversed and echoed',  moveId: 'reverseEcho',   color: 'accent-highlight/70', kind: 'trigger', group: 'click', needsSend: true },
  { label: 'Backward', title: 'Backward Reverb — last 0.8 s reversed through full bus chain', moveId: 'backwardReverb', color: 'accent-highlight',   kind: 'trigger', group: 'click', needsSend: true },
  { label: 'Throw',    title: 'Echo Throw — sweep echo delay time (pitch whoosh)',  moveId: 'delayTimeThrow',  color: 'accent-highlight/70', kind: 'trigger', group: 'click', needsSend: true },
  { label: '380ms',    title: 'Tubby 380 — snap echo rate to 380 ms',             moveId: 'delayPreset380',    color: 'accent-secondary/70', kind: 'trigger', group: 'click' },
  { label: 'Dotted',   title: 'Dotted — snap echo rate to dotted-8th (BPM-synced)', moveId: 'delayPresetDotted', color: 'accent-secondary/70', kind: 'trigger', group: 'click' },
  { label: '1/4',    title: 'Quarter — snap echo rate to quarter note (BPM-synced)', moveId: 'delayPresetQuarter', color: 'accent-secondary/70', kind: 'trigger', group: 'click' },
  { label: '1/8',    title: '8th — snap echo rate to 8th note (BPM-synced)',    moveId: 'delayPreset8th',    color: 'accent-secondary/70', kind: 'trigger', group: 'click' },
  { label: 'Triplet', title: 'Triplet — snap echo rate to triplet (BPM-synced)', moveId: 'delayPresetTriplet', color: 'accent-secondary/70', kind: 'trigger', group: 'click' },
  { label: '1/16',   title: '16th — snap echo rate to 16th note (BPM-synced)',  moveId: 'delayPreset16th',   color: 'accent-secondary/70', kind: 'trigger', group: 'click' },
  { label: 'x2',     title: 'Doubler — double the echo rate',                   moveId: 'delayPresetDoubler', color: 'accent-secondary/70', kind: 'trigger', group: 'click' },

  // ── HOLD — press and hold for precise duration, release to stop ──
  { label: 'Rise',       title: 'HPF Rise — Altec Big Knob: steps HPF up through positions, sweeps back on release', moveId: 'hpfRise',    color: 'accent-primary',     kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Filter',    title: 'Filter Drop — LPF sweeps down while held, opens on release',  moveId: 'filterDrop',  color: 'accent-secondary',   kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Tape Stop', title: 'Tape Stop — bus LPF + echo-rate collapses while held, restores on release', moveId: 'tapeStop', color: 'accent-secondary/70', kind: 'hold', group: 'hold', needsSend: true },
  { label: 'Drop',      title: 'Master Drop — mutes dry signal while held; echo+spring tail survives', moveId: 'masterDrop', color: 'accent-error/70', kind: 'hold', group: 'hold' },
  { label: 'Toast',     title: 'Toast — route DJ mic into bus while held (auto-starts mic)', moveId: 'toast', color: 'accent-success/70', kind: 'hold', group: 'hold' },
  { label: 'Siren',     title: 'Dub Siren — Rasta-box pitch-swept synth while held',           moveId: 'dubSiren',     color: 'accent-warning',  kind: 'hold', group: 'hold' },
  { label: 'Scream',    title: 'Tubby Scream — reverb self-feedback, rising metallic cry',      moveId: 'tubbyScream',  color: 'accent-error',    kind: 'hold', group: 'hold' },
  { label: 'Bass',      title: 'Osc Bass — self-oscillating LPF bass drone while held',         moveId: 'oscBass',      color: 'accent-primary',  kind: 'hold', group: 'hold' },
  { label: 'Crush Bass', title: 'Crush Bass — 3-bit quantize saw drone while held',             moveId: 'crushBass',    color: 'accent-error/70', kind: 'hold', group: 'hold' },

  // ── TOGGLE — click once to activate, click again to deactivate (hands-free) ──
  { label: 'Wide',       title: 'Stereo Doubler — 20ms cross-fed widening (toggle)',               moveId: 'stereoDoubler', color: 'accent-highlight',   kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Wobble',     title: 'Tape Wobble — LFO on echo rate (toggle)',                         moveId: 'tapeWobble',   color: 'accent-warning/70',  kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Ghost',      title: 'Ghost Reverb — extra reverb decay on channels (toggle)',          moveId: 'ghostReverb',  color: 'accent-secondary',   kind: 'hold', group: 'toggle', needsSend: true },
  { label: 'Sub Harm',   title: 'Sub Harmonic — env-follower sub pulse on every transient (toggle)', moveId: 'subHarmonic', color: 'accent-primary/70', kind: 'hold', group: 'toggle', needsSend: true },
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

  const busEnabled = useDrumPadStore(s => s.dubBus.enabled);
  const setDubBus = useDrumPadStore(s => s.setDubBus);
  const dubBusSettings = useDrumPadStore(s => s.dubBus);
  const dubBusStash = useDrumPadStore(s => s.dubBusStash);
  const swapDubBusStash = useDrumPadStore(s => s.swapDubBusStash);

  const channels = useMixerStore(s => s.channels);
  const setChannelDubSend = useMixerStore(s => s.setChannelDubSend);
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

  // Dub-hold state — sustained Echo Throw on a channel (one tap open for as
  // long as the toggle is on). Decoupled from the M/T/E/✦ row so the user
  // can leave a tap open while firing stabs.
  const [heldChannels, setHeldChannels] = useState<Set<number>>(new Set());
  const heldReleasers = useRef<Map<number, () => void>>(new Map());

  // Toggle state — click-once to activate, click-again to deactivate.
  // Separate from heldMoves (which are physical press-and-hold).
  const [toggledMoves, setToggledMoves] = useState<Set<string>>(new Set());
  const toggleDisposers = useRef<Map<string, () => void>>(new Map());

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
      mgr.setupDubBusWiring(bus.inputNode);
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
        const synced = bpmSyncedEchoRate(bpm, dubBusSettings.echoSyncDivision, dubBusSettings.echoRateMs);
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

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-dark-bgSecondary border-t border-dark-border font-mono">
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
          onClick={() => setArmed(!armed)}
          title={armed ? 'Recording — live moves capture to the lane' : 'Click to arm recording'}
          disabled={!busEnabled}
        >
          ● REC {armed ? 'armed' : 'off'}
        </button>
        {/* Character voicing — 4 engineer presets + custom. Loads a
            curated snapshot of EQ + spring + echo + saturator values. */}
        <span className="text-text-muted ml-2">VOICE</span>
        <select
          className="bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-1 text-text-primary text-xs font-mono focus:ring-1 focus:ring-accent-primary"
          value={dubBusSettings.characterPreset}
          onChange={(e) => setDubBus({ characterPreset: e.target.value as typeof dubBusSettings.characterPreset })}
          title="Engineer character preset — loads EQ curve + spring + echo + tape saturator values tuned to that engineer's signature. See research at thoughts/shared/research/2026-04-20_dub-sound-coloring.md"
          disabled={!busEnabled}
        >
          <option value="custom">Custom</option>
          <option value="tubby">King Tubby</option>
          <option value="scientist">Scientist</option>
          <option value="perry">Lee Perry</option>
          <option value="madProfessor">Mad Professor</option>
          <option value="gatedFlanger">Gated Flanger</option>
        </select>
        <span className="text-text-muted ml-2">ECHO</span>
        <select
          className="bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-1 text-text-primary text-xs font-mono focus:ring-1 focus:ring-accent-primary"
          value={dubBusSettings.echoEngine}
          onChange={(e) => setDubBus({ echoEngine: e.target.value as typeof dubBusSettings.echoEngine })}
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
        <AutoDubPanel busEnabled={busEnabled} />
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
            setDubBus({ chainOrder: next });
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
        <span className="flex-1" />
        <span className="text-text-muted">
          {pattern?.dubLane?.events.length ?? 0} events on this pattern
        </span>
        <button
          className="px-2.5 py-1 rounded bg-accent-error text-text-inverse font-semibold hover:bg-accent-error/80"
          onClick={() => window.dispatchEvent(new Event('dub-panic'))}
          title="Drain the bus + disarm recording"
        >
          KILL
        </button>
      </div>

      {!stripCollapsed && (
      <>
      {/* Hover info bar — always rendered to reserve space and prevent layout jitter */}
      <div className={`px-3 py-1 border rounded text-xs font-mono truncate ${hoverHint ? 'bg-dark-bg border-dark-borderLight text-text-secondary' : 'border-transparent text-transparent'}`}>
        {hoverHint || '\u00A0'}
      </div>

      {/* Master section — TONE EQ + global generators + global processors.
          Kept as full-width bands above the channel strips so the layout
          below reads like a real mixing desk: master up top, channels as
          vertical columns underneath. */}
      <div className="flex flex-col gap-1.5 pb-1.5 border-b border-dark-border">
        {/* Tone row — bass shelf + mid scoop + stereo width */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="w-16 shrink-0">TONE ▸</span>
          <div className="flex items-center gap-1.5">
            <span>BASS</span>
            <input
              type="range" min={-12} max={12} step={0.5}
              value={dubBusSettings.bassShelfGainDb}
              onChange={(e) => setDubBus({ bassShelfGainDb: Number(e.target.value), characterPreset: 'custom' })}
              className="w-20 accent-accent-primary"
              disabled={!busEnabled}
              title={`Bass shelf at ${dubBusSettings.bassShelfFreqHz}Hz · ${dubBusSettings.bassShelfGainDb > 0 ? '+' : ''}${dubBusSettings.bassShelfGainDb.toFixed(1)} dB · classic Tubby bass lift`}
            />
            <span className="w-12 text-text-secondary">{dubBusSettings.bassShelfGainDb > 0 ? '+' : ''}{dubBusSettings.bassShelfGainDb.toFixed(1)}dB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>MID</span>
            <input
              type="range" min={-12} max={6} step={0.5}
              value={dubBusSettings.midScoopGainDb}
              onChange={(e) => setDubBus({ midScoopGainDb: Number(e.target.value), characterPreset: 'custom' })}
              className="w-20 accent-accent-secondary"
              disabled={!busEnabled}
              title={`Mid peaking at ${dubBusSettings.midScoopFreqHz}Hz · ${dubBusSettings.midScoopGainDb > 0 ? '+' : ''}${dubBusSettings.midScoopGainDb.toFixed(1)} dB · the Scientist mid-scoop`}
            />
            <span className="w-12 text-text-secondary">{dubBusSettings.midScoopGainDb > 0 ? '+' : ''}{dubBusSettings.midScoopGainDb.toFixed(1)}dB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>WIDTH</span>
            <input
              type="range" min={0} max={2} step={0.05}
              value={dubBusSettings.stereoWidth}
              onChange={(e) => setDubBus({ stereoWidth: Number(e.target.value), characterPreset: 'custom' })}
              className="w-20 accent-accent-highlight"
              disabled={!busEnabled}
              title={`Stereo width ${dubBusSettings.stereoWidth.toFixed(2)}× · 0 = mono (Perry), 1 = neutral, 2 = wide (Mad Professor)`}
            />
            <span className="w-12 text-text-secondary">{dubBusSettings.stereoWidth.toFixed(2)}×</span>
          </div>
          <span className="flex-1" />
        </div>

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
                  onPointerDown={() => {
                    if (noSend) {
                      notify.warning('Raise a CH send first — drag a channel fader up on the right');
                      return;
                    }
                    holdStart(m.moveId);
                  }}
                  onPointerUp={() => holdEnd(m.moveId)}
                  onPointerLeave={() => { holdEnd(m.moveId); setHoverHint(null); }}
                  onPointerCancel={() => holdEnd(m.moveId)}
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
          {!anySend && busEnabled && (
            <span className="text-text-muted text-xs italic ml-1">some need CH send</span>
          )}
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
                onPointerDown={isHold ? () => {
                  for (let i = 0; i < visibleChannelCount; i++) holdStart(op.moveId, i);
                } : undefined}
                onPointerUp={isHold ? () => {
                  for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                } : undefined}
                onPointerLeave={isHold ? () => {
                  for (let i = 0; i < visibleChannelCount; i++) holdEnd(op.moveId, i);
                  setHoverHint(null);
                } : () => setHoverHint(null)}
                onPointerCancel={isHold ? () => {
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
              {CHANNEL_OPS.map((op) => {
                const key = `${op.moveId}:${i}`;
                const active = heldMoves.has(key) || activeFires.has(key);
                const isHold = op.kind === 'hold';
                return (
                  <button
                    key={op.moveId}
                    className={colorClasses(op.color, active) + ' w-full text-center'}
                    onClick={isHold ? undefined : () => fireTrigger(op.moveId, i)}
                    onPointerDown={isHold ? () => holdStart(op.moveId, i) : undefined}
                    onPointerUp={isHold ? () => holdEnd(op.moveId, i) : undefined}
                    onPointerLeave={isHold ? () => { holdEnd(op.moveId, i); setHoverHint(null); } : () => setHoverHint(null)}
                    onPointerCancel={isHold ? () => holdEnd(op.moveId, i) : undefined}
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

      {/* Lane timeline */}
      <DubLaneTimeline />
      </>
      )}
    </div>
  );
};
