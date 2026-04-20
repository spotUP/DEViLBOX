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
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useUIStore } from '@/stores/useUIStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { bpmSyncedEchoRate, getActiveBpm } from '@/engine/dub/DubActions';
import { setDubBusForRouter, subscribeDubRouter, fire as fireDub } from '@/engine/dub/DubRouter';
import { startDubRecorder } from '@/engine/dub/DubRecorder';
import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { ensureDrumPadEngine } from '@hooks/drumpad/useMIDIPadRouting';
import { getChannelRoutedEffectsManager } from '@/engine/tone/ChannelRoutedEffects';
import { getToneEngine } from '@/engine/ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { Fader } from '@components/controls/Fader';
import { DubLaneTimeline } from './DubLaneTimeline';

// ─── Per-channel ops ────────────────────────────────────────────────────────
// Each channel strip shows these 4 buttons alongside the hold-toggle + send
// knob. Label/title/moveId tuple keeps the rendering loop tight.
const CHANNEL_OPS: Array<{ label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold' }> = [
  { label: 'M',  title: 'Mute — silence this channel while held',          moveId: 'channelMute',  color: 'accent-error',      kind: 'hold' },
  { label: 'T',  title: 'Throw — long echoThrow (4 beats + heavy tail)',   moveId: 'channelThrow', color: 'accent-primary/70', kind: 'trigger' },
  { label: 'E',  title: 'Echo Throw — open tap + feedback spike',          moveId: 'echoThrow',    color: 'accent-primary',    kind: 'trigger' },
  { label: '✦', title: 'Dub Stab — short-sharp echo kiss',                 moveId: 'dubStab',      color: 'accent-highlight',  kind: 'trigger' },
  { label: 'B', title: 'Build — ramp send up over 2 bars, mute dry, let echoes carry (offbeat-guitar gesture)', moveId: 'echoBuildUp', color: 'accent-warning', kind: 'trigger' },
];

// ─── Global moves ──────────────────────────────────────────────────────────
// `category`: 'gen' self-generates audio (PING, RADIO, BASS, CRUSH, SUB, CRACK,
// SIREN, SLAM, SCREAM, DROP, STOP!, TOAST, SUB) — works without any channel
// sending into the bus. 'proc' processes the bus signal (WIDE, RVRSE, FILT,
// WOBBLE, BACK, STOP, 380, DOT, SUBH) — needs a channel dubSend > 0 to hear
// anything. Group shown separately in the strip with a tiny divider so the
// user knows why a processor is silent when the bus has no input.
interface GlobalMove { label: string; title: string; moveId: string; color: string; kind: 'trigger' | 'hold'; category: 'gen' | 'proc'; }
const GLOBAL_MOVES: Array<GlobalMove> = [
  // ── Generators (no channel send needed) ──
  { label: 'SLAM',   title: 'Spring Slam — instant splash of spring reverb [generator]', moveId: 'springSlam', color: 'accent-success', kind: 'trigger', category: 'gen' },
  { label: 'SIREN',  title: 'Dub Siren — Rasta-box pitch-swept synth through bus [generator]', moveId: 'dubSiren', color: 'accent-warning', kind: 'hold', category: 'gen' },
  { label: 'CRACK',  title: 'Snare Crack — bandpass noise burst [generator]', moveId: 'snareCrack', color: 'text-primary', kind: 'trigger', category: 'gen' },
  { label: 'DROP',   title: 'Master Drop — mute dry while held; bus tail survives [generator]', moveId: 'masterDrop', color: 'accent-error/70', kind: 'hold', category: 'gen' },
  { label: 'STOP!',  title: 'Transport Tape Stop — real tempo+pitch slowdown (LibOpenMPT only) [generator]', moveId: 'transportTapeStop', color: 'accent-error', kind: 'trigger', category: 'gen' },
  { label: 'TOAST',  title: 'Toast — route DJ mic into bus while held (needs DJ mic started)', moveId: 'toast', color: 'accent-success/70', kind: 'hold', category: 'gen' },
  { label: 'SCREAM', title: 'Tubby Scream — reverb self-feedback, rising metallic cry [generator]', moveId: 'tubbyScream', color: 'accent-error', kind: 'hold', category: 'gen' },
  { label: 'PING',   title: 'Sonar Ping — 1 kHz sine fed through the echo [generator]', moveId: 'sonarPing', color: 'accent-primary/70', kind: 'trigger', category: 'gen' },
  { label: 'RADIO',  title: 'Radio Riser — pink noise sweep 200 Hz → 5 kHz [generator]', moveId: 'radioRiser', color: 'accent-warning/70', kind: 'trigger', category: 'gen' },
  { label: 'SUB',    title: 'Sub Swell — 55 Hz sine pulse direct to return [generator]', moveId: 'subSwell', color: 'accent-primary', kind: 'trigger', category: 'gen' },
  { label: 'BASS',   title: 'Osc Bass — self-oscillating LPF as bass drone (hold) [generator]', moveId: 'oscBass', color: 'accent-primary', kind: 'hold', category: 'gen' },
  { label: 'CRUSH',  title: 'Crush Bass — 3-bit quantize saw drone (hold) [generator]', moveId: 'crushBass', color: 'accent-error/70', kind: 'hold', category: 'gen' },
  // ── Processors (need CH send > 0 to be audible) ──
  { label: 'FILT',   title: 'Filter Drop — LPF sweeps down while held [PROCESSOR — needs CH send]', moveId: 'filterDrop', color: 'accent-secondary', kind: 'hold', category: 'proc' },
  { label: 'WOBBLE', title: 'Tape Wobble — LFO on echo rate while held [PROCESSOR — needs CH send]', moveId: 'tapeWobble', color: 'accent-warning/70', kind: 'hold', category: 'proc' },
  { label: 'DELAY',  title: 'Delay-Time Throw — echo rate sweep (pitch whoosh) [PROCESSOR — needs CH send]', moveId: 'delayTimeThrow', color: 'accent-highlight/70', kind: 'trigger', category: 'proc' },
  { label: 'BACK',   title: 'Backward Reverb — last 0.8 s reversed through bus [PROCESSOR — needs CH send]', moveId: 'backwardReverb', color: 'accent-highlight', kind: 'trigger', category: 'proc' },
  { label: 'STOP',   title: 'Tape Stop — bus LPF + echo-rate collapse [PROCESSOR — needs CH send]', moveId: 'tapeStop', color: 'accent-secondary/70', kind: 'trigger', category: 'proc' },
  { label: 'WIDE',   title: 'Stereo Doubler — 20ms cross-fed widening (hold) [PROCESSOR — needs CH send]', moveId: 'stereoDoubler', color: 'accent-highlight', kind: 'hold', category: 'proc' },
  { label: 'RVRSE',  title: 'Reverse Echo — last 0.4s reversed through tape echo [PROCESSOR — needs CH send]', moveId: 'reverseEcho', color: 'accent-highlight/70', kind: 'trigger', category: 'proc' },
  { label: 'SUBH',   title: 'Sub Harmonic — env-follower sub pulse on every transient (hold) [PROCESSOR — needs CH send]', moveId: 'subHarmonic', color: 'accent-primary/70', kind: 'hold', category: 'proc' },
  { label: '380',    title: 'Tubby 380 — snap echo rate to 380 ms [PROCESSOR — needs CH send]', moveId: 'delayPreset380', color: 'accent-secondary/70', kind: 'trigger', category: 'proc' },
  { label: 'DOT',    title: 'Dotted — snap echo rate to dotted-8th (BPM-synced) [PROCESSOR — needs CH send]', moveId: 'delayPresetDotted', color: 'accent-secondary/70', kind: 'trigger', category: 'proc' },
];

// Map color tokens to button class fragments. Keeps Tailwind's JIT happy —
// we can't build class names dynamically with string concatenation.
const colorClasses = (token: string, active: boolean) => {
  const base = 'px-1.5 py-0.5 rounded border text-[9px] font-bold transition-all duration-150 ';
  switch (token) {
    case 'accent-primary':      return base + (active ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-[0_0_6px_var(--color-accent-primary)]' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-primary hover:text-accent-primary');
    case 'accent-primary/70':   return base + (active ? 'bg-accent-primary/70 text-text-inverse border-accent-primary/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-primary/70 hover:text-accent-primary');
    case 'accent-secondary':    return base + (active ? 'bg-accent-secondary text-text-inverse border-accent-secondary' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-secondary hover:text-accent-secondary');
    case 'accent-secondary/70': return base + (active ? 'bg-accent-secondary/70 text-text-inverse border-accent-secondary/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-secondary/70 hover:text-accent-secondary');
    case 'accent-highlight':    return base + (active ? 'bg-accent-highlight text-text-inverse border-accent-highlight' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-highlight hover:text-accent-highlight');
    case 'accent-highlight/70': return base + (active ? 'bg-accent-highlight/70 text-text-inverse border-accent-highlight/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-highlight/70 hover:text-accent-highlight');
    case 'accent-warning':      return base + (active ? 'bg-accent-warning text-text-inverse border-accent-warning' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-warning hover:text-accent-warning');
    case 'accent-warning/70':   return base + (active ? 'bg-accent-warning/70 text-text-inverse border-accent-warning/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-warning/70 hover:text-accent-warning');
    case 'accent-error':        return base + (active ? 'bg-accent-error text-text-inverse border-accent-error' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-error hover:text-accent-error');
    case 'accent-error/70':     return base + (active ? 'bg-accent-error/70 text-text-inverse border-accent-error/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-error/70 hover:text-accent-error');
    case 'accent-success':      return base + (active ? 'bg-accent-success text-text-inverse border-accent-success' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-success hover:text-accent-success');
    case 'accent-success/70':   return base + (active ? 'bg-accent-success/70 text-text-inverse border-accent-success/70' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-accent-success/70 hover:text-accent-success');
    case 'text-primary':        return base + (active ? 'bg-text-primary text-dark-bg border-text-primary' : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:border-text-primary hover:text-text-primary');
    default:                    return base + 'bg-dark-bgTertiary border-dark-border text-text-muted';
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
  const reverseChainOrder = useDubStore(s => s.reverseChainOrder);
  const setReverseChainOrder = useDubStore(s => s.setReverseChainOrder);
  const vinylLevel = useDubStore(s => s.vinylLevel);
  const setVinylLevel = useDubStore(s => s.setVinylLevel);

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

  // Generic per-move "active hold" tracking — covers channel-scoped holds
  // (e.g. channelMute per channel) AND global holds (filterDrop, dubSiren,
  // tapeWobble, masterDrop, toast). Keyed by `${moveId}:${channelId ?? 'g'}`
  // so a single pointer press/release cycle maps cleanly to fire → dispose.
  const activeHolds = useRef<Map<string, () => void>>(new Map());

  const [heldMoves, setHeldMoves] = useState<Set<string>>(new Set());

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
      useDrumPadStore.getState().setDubBus({ enabled: false });
      setArmed(false);
    };
    window.addEventListener('dub-panic', handler);
    return () => window.removeEventListener('dub-panic', handler);
  }, [releaseAllHeld, setArmed]);
  useEffect(() => {
    if (!busEnabled) releaseAllHeld();
  }, [busEnabled, releaseAllHeld]);
  useEffect(() => releaseAllHeld, [releaseAllHeld]);

  // Auto-layout when bus toggles ON↔OFF (transitions only; never on mount
  // — firing on mount cycled view-switching code when the bus was persisted
  // as enabled from a prior session, briefly showing DJ/VJ views as the
  // layout re-flowed). Fire only when the user actively flips the bus.
  const prevBusEnabledRef = useRef(busEnabled);
  useEffect(() => {
    if (prevBusEnabledRef.current === busEnabled) return;
    prevBusEnabledRef.current = busEnabled;
    if (busEnabled) {
      setStripCollapsed(false);
      useUIStore.getState().setEditorFullscreen(true);
    } else {
      setStripCollapsed(true);
      useUIStore.getState().setEditorFullscreen(false);
    }
  }, [busEnabled, setStripCollapsed]);

  useEffect(() => {
    const engine = ensureDrumPadEngine();
    const bus = engine.getDubBus();
    setDubBusForRouter(bus);
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
      setDubBusForRouter(null);
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
      bus.setReverseChainOrder(reverseChainOrder);
    } catch (e) {
      console.warn('[DubDeckStrip] setReverseChainOrder failed:', e);
    }
  }, [reverseChainOrder]);

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
        const synced = bpmSyncedEchoRate(bpm, dubBusSettings.echoSyncDivision, dubBusSettings.echoRateMs);
        ensureDrumPadEngine().setDubBusSettings({ ...dubBusSettings, echoRateMs: synced });
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
      if (ev.moveId !== 'echoThrow') return;
      if (ev.source !== 'live') return;
      if (ev.channelId === undefined) return;
      setFlashedChannel(ev.channelId);
    });
  }, []);

  useEffect(() => {
    dubLanePlayer.setLane(pattern?.dubLane ?? null);
  }, [pattern]);

  const visibleChannelCount = pattern?.channels.length ?? 4;
  // Whether ANY visible channel has a non-zero dub-send — processors
  // (bus-audio modifiers) can only make sound when at least one channel
  // is feeding the bus. Used to dim the processor row + show a hint.
  const anySend = channels.slice(0, visibleChannelCount).some(c => (c?.dubSend ?? 0) > 0);
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

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-dark-bgSecondary border-t border-dark-border font-mono">
      {/* Header row */}
      <div className="flex items-center gap-2 text-[10px]">
        <button
          className="px-2 py-0.5 rounded border border-dark-borderLight text-text-secondary hover:text-text-primary hover:border-accent-primary transition-colors"
          onClick={toggleStripCollapsed}
          title={stripCollapsed ? 'Expand Dub Deck (tone / globals / per-channel / lane)' : 'Collapse Dub Deck — keep only the header'}
        >
          DUB DECK {stripCollapsed ? '▸' : '▾'}
        </button>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (busEnabled
              ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setDubBus({ enabled: !busEnabled })}
          title={busEnabled ? 'Dub Bus ON — click to disable' : 'Dub Bus OFF — click to enable'}
        >
          Bus {busEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (armed
              ? `bg-accent-error/20 border-accent-error text-accent-error ${capturedRecently ? 'animate-pulse' : ''}`
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
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
          className="bg-dark-bgTertiary border border-dark-border rounded px-1 py-0.5 text-text-primary text-[10px] font-mono focus:ring-1 focus:ring-accent-primary"
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
        {/* A/B compare — swaps live settings with the snapshot captured
            the last time a character preset was loaded. Disabled until
            the first preset load. Like a hardware desk compare button. */}
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors text-[10px] font-mono ' +
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
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (ghostBus
              ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setGhostBus(!ghostBus)}
          title={ghostBus ? 'Ghost Bus ON — every channel bleeds through the dub return at -36 dB, even when muted in main' : 'Ghost Bus — parallel -36 dB bleed so muted channels stay faintly audible through the dub return'}
          disabled={!busEnabled}
        >
          GHOST {ghostBus ? 'ON' : 'OFF'}
        </button>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (masterChorus
              ? 'bg-accent-secondary/20 border-accent-secondary text-accent-secondary'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setMasterChorus(!masterChorus)}
          title={masterChorus ? 'Master Chorus ON — dub finisher smear on the whole output' : 'Master Chorus OFF — enable for a smooth trippy polish on the full mix'}
          disabled={!busEnabled}
        >
          CHORUS
        </button>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (clubSim
              ? 'bg-accent-warning/20 border-accent-warning text-accent-warning'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setClubSim(!clubSim)}
          title={clubSim ? 'Club Simulator ON — 350 ms convolution IR on the master (audition how the mix lands in a venue)' : 'Club Simulator — add a small-room impulse response as master insert for venue-check'}
          disabled={!busEnabled}
        >
          CLUB
        </button>
        <button
          className={
            'px-2 py-0.5 rounded border transition-colors ' +
            (reverseChainOrder
              ? 'bg-accent-secondary/20 border-accent-secondary text-accent-secondary'
              : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
          }
          onClick={() => setReverseChainOrder(!reverseChainOrder)}
          title={reverseChainOrder ? 'Signal order: SPRING → ECHO (reverb-first, "whole room repeated")' : 'Signal order: ECHO → SPRING (default). Click to swap order to spring-first for reverberant echoes'}
          disabled={!busEnabled}
        >
          {reverseChainOrder ? 'VRB→DLY' : 'DLY→VRB'}
        </button>
        <div className="flex items-center gap-1">
          <span className="text-text-muted text-[10px]">JA</span>
          <input
            type="range" min={0} max={10} step={0.5}
            value={vinylLevel}
            onChange={(e) => setVinylLevel(Number(e.target.value))}
            className="w-16 accent-accent-warning"
            disabled={!busEnabled}
            title={`JA Press: ${vinylLevel.toFixed(1)} / 10 — vinyl wear (surface noise, clicks, wow/flutter, HF roll-off, rumble, L/R drift). 0 = factory new, 10 = gutter-scraped Jamaican 7-inch.`}
          />
          <span className="w-6 text-text-secondary text-[10px]">{vinylLevel.toFixed(1)}</span>
        </div>
        <span className="flex-1" />
        <span className="text-text-muted">
          {pattern?.dubLane?.events.length ?? 0} events on this pattern
        </span>
        <button
          className="px-2 py-0.5 rounded bg-accent-error text-text-inverse font-semibold hover:bg-accent-error/80"
          onClick={() => window.dispatchEvent(new Event('dub-panic'))}
          title="Drain the bus + disarm recording"
        >
          KILL
        </button>
      </div>

      {!stripCollapsed && (
      <>
      {/* Master section — TONE EQ + global generators + global processors.
          Kept as full-width bands above the channel strips so the layout
          below reads like a real mixing desk: master up top, channels as
          vertical columns underneath. */}
      <div className="flex flex-col gap-1 pb-1 border-b border-dark-border">
        {/* Tone row — bass shelf + mid scoop + stereo width */}
        <div className="flex items-center gap-2 text-[9px] text-text-muted">
          <span className="w-14 shrink-0">TONE ▸</span>
          <div className="flex items-center gap-1">
            <span>BASS</span>
            <input
              type="range" min={-18} max={18} step={0.5}
              value={dubBusSettings.bassShelfGainDb}
              onChange={(e) => setDubBus({ bassShelfGainDb: Number(e.target.value), characterPreset: 'custom' })}
              className="w-16 accent-accent-primary"
              disabled={!busEnabled}
              title={`Bass shelf at ${dubBusSettings.bassShelfFreqHz}Hz · ${dubBusSettings.bassShelfGainDb > 0 ? '+' : ''}${dubBusSettings.bassShelfGainDb.toFixed(1)} dB · classic Tubby bass lift`}
            />
            <span className="w-10 text-text-secondary">{dubBusSettings.bassShelfGainDb > 0 ? '+' : ''}{dubBusSettings.bassShelfGainDb.toFixed(1)}dB</span>
          </div>
          <div className="flex items-center gap-1">
            <span>MID</span>
            <input
              type="range" min={-12} max={6} step={0.5}
              value={dubBusSettings.midScoopGainDb}
              onChange={(e) => setDubBus({ midScoopGainDb: Number(e.target.value), characterPreset: 'custom' })}
              className="w-16 accent-accent-secondary"
              disabled={!busEnabled}
              title={`Mid peaking at ${dubBusSettings.midScoopFreqHz}Hz · ${dubBusSettings.midScoopGainDb > 0 ? '+' : ''}${dubBusSettings.midScoopGainDb.toFixed(1)} dB · the Scientist mid-scoop`}
            />
            <span className="w-10 text-text-secondary">{dubBusSettings.midScoopGainDb > 0 ? '+' : ''}{dubBusSettings.midScoopGainDb.toFixed(1)}dB</span>
          </div>
          <div className="flex items-center gap-1">
            <span>WIDTH</span>
            <input
              type="range" min={0} max={2} step={0.05}
              value={dubBusSettings.stereoWidth}
              onChange={(e) => setDubBus({ stereoWidth: Number(e.target.value), characterPreset: 'custom' })}
              className="w-16 accent-accent-highlight"
              disabled={!busEnabled}
              title={`Stereo width ${dubBusSettings.stereoWidth.toFixed(2)}× · 0 = mono (Perry), 1 = neutral, 2 = wide (Mad Professor)`}
            />
            <span className="w-10 text-text-secondary">{dubBusSettings.stereoWidth.toFixed(2)}×</span>
          </div>
          <span className="flex-1" />
        </div>

        {/* Generators — self-generating moves (no channel send needed) */}
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-text-muted w-14 shrink-0" title="Instruments (self-generating — no channel send needed)">INSTR ▸</span>
          <div className="flex gap-1 flex-wrap">
            {GLOBAL_MOVES.filter(m => m.category === 'gen').map((m) => {
              const key = `${m.moveId}:g`;
              const active = heldMoves.has(key);
              const isHold = m.kind === 'hold';
              return (
                <button
                  key={m.moveId}
                  className={colorClasses(m.color, active)}
                  onClick={isHold ? undefined : () => fireTrigger(m.moveId)}
                  onPointerDown={isHold ? () => holdStart(m.moveId) : undefined}
                  onPointerUp={isHold ? () => holdEnd(m.moveId) : undefined}
                  onPointerLeave={isHold ? () => holdEnd(m.moveId) : undefined}
                  onPointerCancel={isHold ? () => holdEnd(m.moveId) : undefined}
                  title={m.title + (isHold ? ' (press-and-hold)' : '')}
                  disabled={!busEnabled}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Processors — modify bus content, need channel send > 0 to be
            audible. Dimmed when no channel is sending. */}
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-text-muted w-14 shrink-0" title="Processors (need channel send > 0 to hear)">PROC ▸</span>
          <div className="flex gap-1 flex-wrap">
            {GLOBAL_MOVES.filter(m => m.category === 'proc').map((m) => {
              const key = `${m.moveId}:g`;
              const active = heldMoves.has(key);
              const isHold = m.kind === 'hold';
              const disabled = !busEnabled || !anySend;
              return (
                <button
                  key={m.moveId}
                  className={colorClasses(m.color, active) + (disabled && busEnabled ? ' opacity-40' : '')}
                  onClick={isHold ? undefined : () => fireTrigger(m.moveId)}
                  onPointerDown={isHold ? () => holdStart(m.moveId) : undefined}
                  onPointerUp={isHold ? () => holdEnd(m.moveId) : undefined}
                  onPointerLeave={isHold ? () => holdEnd(m.moveId) : undefined}
                  onPointerCancel={isHold ? () => holdEnd(m.moveId) : undefined}
                  title={m.title + (isHold ? ' (press-and-hold)' : '') + (!anySend ? ' — RAISE A CHANNEL SEND TO HEAR' : '')}
                  disabled={!busEnabled}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          {!anySend && busEnabled && (
            <span className="text-text-muted text-[9px] italic">raise a CH send to hear processors</span>
          )}
        </div>
      </div>

      {/* Channel strips — classic mixer-desk layout. Each channel is a
          vertical column: label → op buttons stacked → HOLD → vertical
          fader → send % readout. Horizontal scroll if the pattern has
          more channels than fit. */}
      <div className="flex items-end gap-1.5 overflow-x-auto pt-1">
        {Array.from({ length: visibleChannelCount }, (_, i) => {
          const ch = channels[i];
          const dubSend = ch?.dubSend ?? 0;
          const hasDubSend = dubSend > 0;
          const isHeld = heldChannels.has(i);
          const isFlashed = i === flashedChannel;
          return (
            <div
              key={i}
              className={
                'flex flex-col items-center gap-1 px-1.5 py-1 rounded border min-w-[52px] shrink-0 transition-colors ' +
                (isHeld
                  ? 'bg-accent-primary/10 border-accent-primary'
                  : hasDubSend
                    ? 'bg-dark-bg border-dark-borderLight'
                    : 'bg-dark-bgTertiary border-dark-border')
              }
            >
              <span
                className="text-[9px] font-bold text-text-secondary leading-none truncate max-w-[48px]"
                title={`Ch ${i + 1}${ch ? ' · ' + ch.name : ''}`}
              >
                CH {i + 1}
              </span>
              {CHANNEL_OPS.map((op) => {
                const key = `${op.moveId}:${i}`;
                const active = heldMoves.has(key);
                const isHold = op.kind === 'hold';
                return (
                  <button
                    key={op.moveId}
                    className={colorClasses(op.color, active) + ' w-full text-center'}
                    onClick={isHold ? undefined : () => fireTrigger(op.moveId, i)}
                    onPointerDown={isHold ? () => holdStart(op.moveId, i) : undefined}
                    onPointerUp={isHold ? () => holdEnd(op.moveId, i) : undefined}
                    onPointerLeave={isHold ? () => holdEnd(op.moveId, i) : undefined}
                    onPointerCancel={isHold ? () => holdEnd(op.moveId, i) : undefined}
                    title={`Ch ${i + 1} · ${op.title}${isHold ? ' (press-and-hold)' : ''}`}
                    disabled={!busEnabled}
                  >
                    {op.label}
                  </button>
                );
              })}
              <button
                className={
                  'px-1.5 py-0.5 rounded border w-full text-[9px] font-bold transition-all duration-150 ' +
                  (isHeld
                    ? 'bg-accent-primary border-accent-primary text-text-inverse shadow-[0_0_8px_var(--color-accent-primary)]'
                    : isFlashed
                      ? 'bg-accent-highlight/30 border-accent-highlight text-accent-highlight'
                      : hasDubSend
                        ? 'bg-dark-bgTertiary border-dark-borderLight text-text-primary hover:border-accent-primary'
                        : 'bg-dark-bgTertiary border-dark-border text-text-muted hover:text-text-primary')
                }
                onClick={() => toggleHold(i)}
                title={`Ch ${i + 1}${ch ? ' · ' + ch.name : ''} — click to ${isHeld ? 'STOP' : 'START'} sustained dubbing. Multiple channels can dub simultaneously.`}
                disabled={!busEnabled}
              >
                HOLD
              </button>
              <Fader
                value={dubSend}
                size="md"
                color="accent-primary"
                onChange={(v) => setChannelDubSend(i, v)}
                title={`Ch ${i + 1} dub send — ${Math.round(dubSend * 100)}%. Drag vertically; double-click for full send. Each real dub desk had faders on every channel — riding these is how Tubby mixed.`}
                disabled={!busEnabled}
                doubleClickValue={1}
                paramKey={`dub.channelSend.ch${i}`}
              />
              <span className="text-[9px] font-mono text-text-secondary leading-none">
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
