import { useEffect, useRef } from 'react';
import { getMIDIManager } from '../midi/MIDIManager';
import { getDJControllerMapper } from '../midi/DJControllerMapper';
import {
  buildXTouchFeedbackMessages,
  type XTouchFeedbackState,
  type XTouchTouchedMap
} from '../midi/xTouchFeedback';
import { useDJStore } from '../stores/useDJStore';
import { useDrumPadStore } from '../stores/useDrumPadStore';
import type { MIDIMessage } from '../midi/types';

const XTOUCH_PRESET_IDS = new Set([
  'behringer-xtouch-compact',
  'behringer-xtouch',
  'behringer-xtouch-one',
]);

export function useXTouchFeedback(): void {
  const frameRef = useRef<number | null>(null);
  const lastPayloadRef = useRef<string>('');
  const touchedRef = useRef<XTouchTouchedMap>({});

  useEffect(() => {
    const manager = getMIDIManager();
    const mapper = getDJControllerMapper();

    const flush = () => {
      frameRef.current = null;

      const preset = mapper.getPreset();
      if (!preset || !XTOUCH_PRESET_IDS.has(preset.id)) {
        lastPayloadRef.current = '';
        return;
      }

      const output = manager.getSelectedOutput();
      if (!output) return;

      const messages = buildXTouchFeedbackMessages(preset, getFeedbackState(), touchedRef.current);
      const payload = JSON.stringify(messages);
      if (payload === lastPayloadRef.current) return;
      lastPayloadRef.current = payload;

      for (const message of messages) {
        manager.sendRawToDevice(output.id, new Uint8Array(message));
      }
    };

    const scheduleFlush = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(flush);
    };

    const midiTouchHandler = (msg: MIDIMessage) => {
      const preset = mapper.getPreset();
      if (!preset || !XTOUCH_PRESET_IDS.has(preset.id)) return;

      let changed = false;
      if (preset.id === 'behringer-xtouch-compact') {
        changed = updateCompactTouchState(msg, touchedRef.current);
      } else {
        changed = updateMCUTouchState(msg, touchedRef.current);
      }

      if (changed) scheduleFlush();
    };

    const unsubscribeDJ = useDJStore.subscribe(scheduleFlush);
    const unsubscribeDub = useDrumPadStore.subscribe(scheduleFlush);
    const unsubscribeDevices = manager.onDeviceChange(scheduleFlush);
    manager.addMessageHandler(midiTouchHandler);
    scheduleFlush();

    return () => {
      unsubscribeDJ();
      unsubscribeDub();
      unsubscribeDevices();
      manager.removeMessageHandler(midiTouchHandler);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);
}

function getFeedbackState(): XTouchFeedbackState {
  const dj = useDJStore.getState();
  const dub = useDrumPadStore.getState().dubBus;

  return {
    crossfader: dj.crossfaderPosition,
    masterVolume: clamp01(dj.masterVolume / 2),
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

  const key = `cc:${msg.cc - 100}`;
  const next = msg.value > 0.5;
  if (touched[key] === next) return false;
  touched[key] = next;
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
