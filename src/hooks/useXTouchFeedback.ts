import { useEffect, useRef } from 'react';
import { getMIDIManager } from '../midi/MIDIManager';
import { getDJControllerMapper } from '../midi/DJControllerMapper';
import {
  buildXTouchFeedbackMessages,
  encodeCompactButtonLED,
  encodeCompactRingValue,
  COMPACT_OUTPUT_CHANNEL,
  recordFaderTouchRelease,
  resetFaderCache,
  type XTouchFeedbackState,
  type XTouchTouchedMap
} from '../midi/xTouchFeedback';
import { useDJStore } from '../stores/useDJStore';
import { useDrumPadStore } from '../stores/useDrumPadStore';
import { useMixerStore } from '../stores/useMixerStore';
import { subscribeToParamLiveValue } from '../midi/performance/parameterRouter';
import { DUB_BUS_PARAMS, readDubParameter } from '../midi/performance/parameterRouter';
import { subscribeDubRouter, subscribeDubRelease } from '../engine/dub/DubRouter';
import { notesOnActiveLayer } from '../midi/xtouchLayer';
import type { MIDIMessage } from '../midi/types';
import type { DJControllerPreset } from '../midi/djControllerPresets';

const XTOUCH_PRESET_IDS = new Set([
  'behringer-xtouch-compact',
  'behringer-xtouch',
  'behringer-xtouch-one',
]);

function matchesPresetName(name: string | undefined, preset: DJControllerPreset): boolean {
  if (!name || !preset.detectPatterns) return false;
  const lower = name.toLowerCase();
  return preset.detectPatterns.some(p => lower.includes(p.toLowerCase()));
}

/**
 * Which button lights for a move — read from the PRESET, never from a table
 * of its own.
 *
 * There used to be a second table here, and it had drifted completely out of
 * step with the preset that routes the presses: it lit note 16 for
 * `echoThrow` while the preset put `dub.stereoDoubler` on note 16, note 19 for
 * `tubbyScream` where the preset has `dub.combSweep`, and so on down the row.
 * Five moves were even written down as deliberately SHARING another move's
 * button. So pressing a button fired one move and lit a different button, and
 * which one depended on which move you had pressed — "when i push one button
 * in the big button bank another button also lights up, different buttons
 * light up on different button pushes" (2026-09-23).
 *
 * The preset already names every move's button once, for the press. The lamp
 * has to read the same line, or it is guessing. A move with no button on the
 * device now lights nothing, which is honest — lighting a neighbour is worse
 * than staying dark.
 */
function moveButtonNotes(
  preset: DJControllerPreset,
  moveId: string,
  channelId?: number,
): number[] {
  const wanted = `dub.${moveId}`;
  // A per-channel move has a button per channel strip — `dub.channelMute.ch0`
  // through `.ch7` — so matching on the move alone lit channel 0's lamp
  // whichever channel had fired.
  const exact = channelId === undefined ? null : `${wanted}.ch${channelId}`;
  const notes: number[] = [];
  const family: number[] = [];
  for (const mapping of preset.noteMappings) {
    if (!('param' in mapping) || typeof mapping.param !== 'string') continue;
    if (mapping.param === wanted || (exact !== null && mapping.param === exact)) {
      notes.push(mapping.note);
    } else if (mapping.param.replace(/\.ch\d+$/, '') === wanted) {
      family.push(mapping.note);
    }
  }
  // One move sits on two notes: Layer A and its Layer B mirror (`echoThrow` is
  // note 32 and note 72). The device reports its layer with a Program Change,
  // so the lamp goes to the layer on show — and to both while no layer has
  // been reported yet, which is the state at connection.
  if (notes.length > 0) return notesOnActiveLayer(notes);
  // Per-channel move fired for a channel with no button of its own.
  return family.slice(0, 1);
}

export function useXTouchFeedback(): void {
  const lastPayloadRef = useRef<string>('');
  const touchedRef = useRef<XTouchTouchedMap>({});
  // Live channel send values from DubBus (updated imperatively during moves)
  const liveSendsRef = useRef<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  // Active dub moves (invocationId → moveId)
  const activeMovesRef = useRef<Map<string, { moveId: string; channelId?: number }>>(new Map());
  /**
   * Encoder-ring positions waiting to go out, and what was last sent.
   *
   * The faders echoed the channel sends, but nothing echoed the BUS controls,
   * so an AutoDub ride on the return or the high-pass moved the audio and left
   * the encoder ring sitting where the hand had left it — "i have never seen
   * it twist a knob ... on the controller" (2026-09-23). Keyed by CC, because
   * that is what the device understands; the parameter behind it comes from
   * the preset.
   */
  const encoderPendingRef = useRef<Map<number, number>>(new Map());
  const encoderSentRef = useRef<Map<number, number>>(new Map());
  /** Which encoder CC carries which parameter, read from the preset. */
  const encoderCCFor = (param: string): number | null => {
    const preset = getDJControllerMapper().getPreset();
    if (!preset || !XTOUCH_PRESET_IDS.has(preset.id)) return null;
    return preset.ccMappings.find((m) => m.param === param)?.cc ?? null;
  };

  useEffect(() => {
    const manager = getMIDIManager();
    const mapper = getDJControllerMapper();
    let initializedOutput = false;

    const sendFaderInit = (outputId: string) => {
      // DON'T zero faders — the first flush() will send actual current values.
      // Zeroing here would fight restored mixer state from persistence.

      // But DO send faders on the wrong channel (0xb0) to zero position,
      // in case the device was left in a stale state from a different app.
      // The correct output channel is 0xb1 — 0xb0 is a no-op for motor control.

      // Seed every encoder ring from the value its parameter actually holds.
      //
      // Zeroing them was worse than doing nothing: the ring then showed 0
      // while the control underneath it sat wherever the user had left it, and
      // it stayed wrong until something moved that parameter.
      for (const param of Object.keys(DUB_BUS_PARAMS)) {
        const cc = encoderCCFor(param);
        if (cc === null) continue;
        const value = readDubParameter(param);
        if (value === null) continue;
        encoderPendingRef.current.set(cc, clamp01(value));
      }
      // Turn off all button LEDs (notes 0-54)
      for (let note = 0; note <= 54; note++) {
        manager.sendRawToDevice(outputId, new Uint8Array([0x91, note, 0]));
      }
    };

    const flush = () => {
      const preset = mapper.getPreset();
      if (!preset || !XTOUCH_PRESET_IDS.has(preset.id)) {
        lastPayloadRef.current = '';
        initializedOutput = false;
        return;
      }

      // Find X-Touch output by matching detect patterns, fall back to selected output
      let output = manager.getSelectedOutput();
      if (!output || !matchesPresetName(output.name, preset)) {
        const outputs = manager.getOutputDevices();
        const match = outputs.find(o => matchesPresetName(o.name, preset));
        if (match) output = match;
      }
      if (!output) return;

      // On first connection, init LEDs/rings and schedule a deferred flush
      // to catch persisted state that loads async from IndexedDB
      if (!initializedOutput) {
        initializedOutput = true;
        sendFaderInit(output.id);
        // Clear caches so the deferred flush re-sends all values
        // (catches persisted state that loads async from IndexedDB)
        setTimeout(() => {
          lastPayloadRef.current = '';
          resetFaderCache();
          scheduleFlush();
        }, 1500);
      }

      // Top every ring up from the STORE before sending.
      //
      // Announcements alone are not enough. A persona changing character calls
      // `setSettings` and moves six bus parameters in one go — echo intensity,
      // wet, spring, return, sidechain, high-pass — straight into the store,
      // announcing none of them. Driven by announcements only, the rings sat
      // still through all of it: "mad professor did A LOT of stuff that is not
      // visible on the controller" (2026-09-23).
      //
      // An announcement still wins where there is one, because a move
      // modulating the bus never touches the store at all. This is the
      // resting position underneath it.
      for (const param of Object.keys(DUB_BUS_PARAMS)) {
        const cc = encoderCCFor(param);
        if (cc === null || encoderPendingRef.current.has(cc)) continue;
        const value = readDubParameter(param);
        if (value === null) continue;
        encoderPendingRef.current.set(cc, clamp01(value));
      }

      // Rings go out before the payload comparison below: a ring moving while
      // the faders and LEDs hold still must not be dropped as "nothing
      // changed". The per-ring check just below is what keeps this quiet.
      if (encoderPendingRef.current.size > 0) {
        for (const [cc, normalized] of encoderPendingRef.current) {
          // Compare the BYTE that would go out, not the float behind it: a
          // value that wobbles in the sixth decimal is the same ring position,
          // and re-sending it is the noise that starved the fader motors.
          const step = Math.max(0, Math.min(127, Math.round(normalized * 127)));
          if (encoderSentRef.current.get(cc) === step) continue;
          encoderSentRef.current.set(cc, step);
          manager.sendRawToDevice(
            output.id,
            new Uint8Array(encodeCompactRingValue(COMPACT_OUTPUT_CHANNEL, cc, normalized)),
          );
        }
        encoderPendingRef.current.clear();
      }

      const messages = buildXTouchFeedbackMessages(preset, getFeedbackState(preset, liveSendsRef.current, activeMovesRef.current), touchedRef.current);
      const payload = JSON.stringify(messages);
      if (payload === lastPayloadRef.current) return;
      lastPayloadRef.current = payload;

      for (const message of messages) {
        manager.sendRawToDevice(output.id, new Uint8Array(message));
      }
    };

    // Throttle motor output to ~25Hz — motors have physical inertia and
    // jitter when driven at 60fps due to overshoot/oscillation.
    const MOTOR_INTERVAL_MS = 40;
    let lastFlushTime = 0;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleFlush = () => {
      if (throttleTimer !== null) return;
      const elapsed = performance.now() - lastFlushTime;
      if (elapsed >= MOTOR_INTERVAL_MS) {
        lastFlushTime = performance.now();
        flush();
      } else {
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          lastFlushTime = performance.now();
          flush();
        }, MOTOR_INTERVAL_MS - elapsed);
      }
    };

    // Subscribe to live channel send values from DubBus moves/auto-dub
    const liveUnsubs: Array<() => void> = [];
    for (let ch = 0; ch < 8; ch++) {
      const idx = ch;
      liveUnsubs.push(subscribeToParamLiveValue(`dub.channelSend.ch${ch}`, (value) => {
        liveSendsRef.current[idx] = value;
        scheduleFlush();
      }));
    }

    /**
     * Every continuous bus parameter, echoed to whichever encoder the preset
     * put it on.
     *
     * Driven from `DUB_BUS_PARAMS` rather than from the preset's mapping list
     * so the subscriptions do not depend on a preset being loaded at the
     * moment this effect runs; the CC is resolved when a value arrives, by
     * which time the preset is known.
     */
    for (const param of Object.keys(DUB_BUS_PARAMS)) {
      liveUnsubs.push(subscribeToParamLiveValue(param, (value) => {
        const cc = encoderCCFor(param);
        if (cc === null) return;
        encoderPendingRef.current.set(cc, clamp01(value));
        scheduleFlush();
      }));
    }

    // Subscribe to dub move fire/release for button LED feedback
    const triggerTimers = new Map<number, ReturnType<typeof setTimeout>>();
    const unsubFire = subscribeDubRouter((event) => {
      const preset = mapper.getPreset();
      const notes = preset ? moveButtonNotes(preset, event.moveId, event.channelId) : [];
      if (notes.length === 0) return;
      activeMovesRef.current.set(event.invocationId, { moveId: event.moveId, channelId: event.channelId });
      for (const note of notes) sendButtonLED(note, true);
      scheduleFlush();
    });
    const unsubRelease = subscribeDubRelease((event) => {
      const active = activeMovesRef.current.get(event.invocationId);
      if (!active) return;
      const { moveId, channelId } = active;
      activeMovesRef.current.delete(event.invocationId);
      // Only turn off if no other instance of this move is active
      const stillActive = [...activeMovesRef.current.values()]
        .some((a) => a.moveId === moveId && a.channelId === channelId);
      if (!stillActive) {
        const preset = mapper.getPreset();
        for (const note of preset ? moveButtonNotes(preset, moveId, channelId) : []) {
          sendButtonLED(note, false);
        }
      }
      scheduleFlush();
    });
    // For one-shot triggers (no release event), flash LED for 300ms
    const unsubFireFlash = subscribeDubRouter((event) => {
      if (event.isHold) return; // Hold moves get LED-off from release event
      const presetForFlash = mapper.getPreset();
      const notes = presetForFlash
        ? moveButtonNotes(presetForFlash, event.moveId, event.channelId)
        : [];
      if (notes.length === 0) return;
      const note = notes[0];
      const timer = setTimeout(() => {
        triggerTimers.delete(note);
        activeMovesRef.current.delete(event.invocationId);
        const stillActive = [...activeMovesRef.current.values()]
          .some((a) => a.moveId === event.moveId && a.channelId === event.channelId);
        if (!stillActive) for (const n of notes) sendButtonLED(n, false);
        scheduleFlush();
      }, 300);
      triggerTimers.set(note, timer);
    });

    function sendButtonLED(note: number, lit: boolean) {
      const preset = mapper.getPreset();
      if (!preset || preset.id !== 'behringer-xtouch-compact') return;
      let output = manager.getSelectedOutput();
      if (!output || !matchesPresetName(output.name, preset)) {
        const outputs = manager.getOutputDevices();
        const match = outputs.find(o => matchesPresetName(o.name, preset));
        if (match) output = match;
      }
      if (!output) return;
      manager.sendRawToDevice(output.id, new Uint8Array(encodeCompactButtonLED(note, lit)));
    }

    const midiTouchHandler = (msg: MIDIMessage) => {
      const preset = mapper.getPreset();
      if (!preset || !XTOUCH_PRESET_IDS.has(preset.id)) return;

      let changed = false;
      if (preset.id === 'behringer-xtouch-compact') {
        changed = updateCompactTouchState(msg, touchedRef.current);
        // On touch release, schedule a delayed flush after grace period
        // so the motor catches up to the current value
        if (changed && msg.type === 'cc' && msg.value !== undefined && msg.value <= 0.5) {
          setTimeout(scheduleFlush, 250);
        }
      } else {
        changed = updateMCUTouchState(msg, touchedRef.current);
      }

      if (changed) scheduleFlush();
    };

    const unsubscribeDJ = useDJStore.subscribe(scheduleFlush);
    const unsubscribeDub = useDrumPadStore.subscribe((state, prev) => {
      // When dub bus enable toggles, fader meanings change entirely
      // (DJ volumes ↔ dub sends) — clear motor cache to force re-send
      if (state.dubBus.enabled !== prev.dubBus.enabled) {
        resetFaderCache();
        lastPayloadRef.current = '';
      }
      scheduleFlush();
    });
    const unsubscribeMixer = useMixerStore.subscribe(scheduleFlush);
    const unsubscribeDevices = manager.onDeviceChange(scheduleFlush);
    manager.addMessageHandler(midiTouchHandler);
    scheduleFlush();

    // MIDI devices enumerate asynchronously — the first flush() likely
    // can't find an output yet. Retry a few times during startup to
    // catch the device once it appears.
    const initRetries = [300, 800, 1500, 3000];
    const initTimers = initRetries.map(delay => setTimeout(() => {
      if (!initializedOutput) scheduleFlush();
    }, delay));

    return () => {
      unsubscribeDJ();
      unsubscribeDub();
      unsubscribeMixer();
      unsubscribeDevices();
      manager.removeMessageHandler(midiTouchHandler);
      for (const unsub of liveUnsubs) unsub();
      unsubFire();
      unsubRelease();
      unsubFireFlash();
      for (const t of triggerTimers.values()) clearTimeout(t);
      for (const t of initTimers) clearTimeout(t);
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
    };
  }, []);
}

function getFeedbackState(preset: DJControllerPreset, liveSends: number[], activeMoves: Map<string, { moveId: string; channelId?: number }>): XTouchFeedbackState {
  const dj = useDJStore.getState();
  const dub = useDrumPadStore.getState().dubBus;
  const mixer = useMixerStore.getState();

  // The faders ALWAYS reflect per-channel dub sends, whether or not the bus is
  // switched on.
  //
  // This used to be gated on `dub.enabled`, and when the bus was off the
  // feedback fell back to the DJ deck's volumes and EQs — which rest at unity
  // and centre, not at zero. So booting DEViLBOX with an empty song drove the
  // motor faders to the DJ defaults, and the surface showed a mix that did not
  // exist: "the controller faders knobs are not at zero when i start devilbox
  // with an empty song" (2026-09-23).
  //
  // The gate was a guess at which mode the user is in. It does not need
  // guessing: this preset's own CC mappings send `dub.channelSend.chN` from
  // these faders unconditionally, so that is what they must display. A surface
  // that shows one parameter and controls another is worse than one that shows
  // nothing.
  //
  // Higher of the store value and the live value, so an AutoDub ride moves the
  // motor fader too.
  const dubChannelSends = mixer.channels.slice(0, 8)
    .map((ch, i) => Math.max(ch?.dubSend ?? 0, liveSends[i] ?? 0));

  // Mute/solo state for 8 channels
  const channelMutes = mixer.channels.slice(0, 8).map(ch => ch?.muted ?? false);
  const channelSolos = mixer.channels.slice(0, 8).map(ch => ch?.soloed ?? false);

  // Collect active move button notes
  const activeMoveNotes = new Set<number>();
  for (const { moveId, channelId } of activeMoves.values()) {
    for (const note of moveButtonNotes(preset, moveId, channelId)) activeMoveNotes.add(note);
  }

  return {
    crossfader: dj.crossfaderPosition,
    masterVolume: clamp01(dj.masterVolume / 2),
    dubChannelSends,
    channelMutes,
    channelSolos,
    activeMoveNotes,
    deckA: {
      volume: dj.decks.A.volume,
      eqHi: normalizeEq(dj.decks.A.eqHigh),
      eqMid: normalizeEq(dj.decks.A.eqMid),
      eqLow: normalizeEq(dj.decks.A.eqLow),
      filter: normalizeFilter(dj.decks.A.filterPosition),
      filterQ: clamp01(dj.decks.A.filterResonance),
      pitch: dj.decks.A.pitchOffset,
      isPlaying: dj.decks.A.isPlaying,
      pfl: dj.decks.A.pflEnabled,
      looping: dj.decks.A.loopActive,
    },
    deckB: {
      volume: dj.decks.B.volume,
      eqHi: normalizeEq(dj.decks.B.eqHigh),
      eqMid: normalizeEq(dj.decks.B.eqMid),
      eqLow: normalizeEq(dj.decks.B.eqLow),
      filter: normalizeFilter(dj.decks.B.filterPosition),
      filterQ: clamp01(dj.decks.B.filterResonance),
      pitch: dj.decks.B.pitchOffset,
      isPlaying: dj.decks.B.isPlaying,
      pfl: dj.decks.B.pflEnabled,
      looping: dj.decks.B.loopActive,
    },
    dub: {
      echoWet: dub.echoWet,
      echoIntensity: dub.echoIntensity,
      echoRateMs: dub.echoRateMs,
      springWet: dub.springWet,
      returnGain: dub.returnGain,
      hpfCutoff: dub.hpfCutoff,
      sidechainAmount: dub.sidechainAmount,
    },
  };
}

function normalizeEq(value: number): number {
  return clamp01((value + 12) / 24);
}

function normalizeFilter(value: number): number {
  return clamp01((value + 1) / 2);
}

function updateCompactTouchState(msg: MIDIMessage, touched: XTouchTouchedMap): boolean {
  if (msg.type !== 'cc' || msg.cc === undefined || msg.value === undefined) return false;
  if (msg.cc < 101 || msg.cc > 109) return false;

  const faderCC = msg.cc - 100;
  const key = `cc:${faderCC}`;
  const next = msg.value > 0.5;
  if (touched[key] === next) return false;
  touched[key] = next;
  // On touch release, record timestamp so motor has a grace period before snapping
  if (!next) {
    recordFaderTouchRelease(faderCC);
  }
  return true;
}

function updateMCUTouchState(msg: MIDIMessage, touched: XTouchTouchedMap): boolean {
  if (msg.note === undefined || msg.note < 104 || msg.note > 112) return false;

  const key = `pitchbend:${msg.note - 104}`;
  const next = msg.type === 'noteOn' ? (msg.velocity ?? 0) > 0 : false;
  if (msg.type !== 'noteOn' && msg.type !== 'noteOff') return false;
  if (touched[key] === next) return false;
  touched[key] = next;
  return true;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
