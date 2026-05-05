import type { DJControllerPreset } from './djControllerPresets';

export type XTouchFeedbackState = {
  crossfader: number;
  masterVolume: number;
  deckA: {
    volume: number;
    eqHi: number;
    eqMid: number;
    eqLow: number;
    filter: number;
    filterQ: number;
    pitch: number;
    isPlaying: boolean;
    pfl: boolean;
    looping: boolean;
  };
  deckB: {
    volume: number;
    eqHi: number;
    eqMid: number;
    eqLow: number;
    filter: number;
    filterQ: number;
    pitch: number;
    isPlaying: boolean;
    pfl: boolean;
    looping: boolean;
  };
  dub: {
    echoWet: number;
    echoIntensity: number;
    echoRateMs: number;
    springWet: number;
    returnGain: number;
    hpfCutoff: number;
    sidechainAmount: number;
  };
};

export type XTouchTouchedMap = Partial<Record<string, boolean>>;

type MidiBytes = [number, number, number];

type CompactStatefulButton = {
  note: number;
  active: (state: XTouchFeedbackState) => boolean;
};

type MCUStatefulButton = {
  note: number;
  active: (state: XTouchFeedbackState) => boolean;
};

type RingMode = 'pan' | 'fan';

const COMPACT_BUTTON_LED_OFF = 0;
const COMPACT_BUTTON_LED_ON = 2;
const COMPACT_RING_MODE_CC_OFFSET = 32;
const COMPACT_GLOBAL_CHANNEL = 12;
const MCU_BUTTON_LED_OFF = 0;
const MCU_BUTTON_LED_ON = 127;

const COMPACT_RING_MODE_BY_CC = new Map<number, RingMode>([
  [10, 'pan'],
  [11, 'fan'],
  [12, 'pan'],
  [13, 'fan'],
  [14, 'pan'],
  [15, 'fan'],
  [16, 'pan'],
  [17, 'fan'],
  [18, 'pan'],
  [19, 'fan'],
  [20, 'fan'],
  [21, 'pan'],
  [22, 'fan'],
  [23, 'fan'],
  [24, 'pan'],
  [25, 'pan'],
]);

const COMPACT_BUTTONS: CompactStatefulButton[] = [
  { note: 16, active: (state) => state.deckA.isPlaying },
  { note: 17, active: (state) => state.deckA.pfl },
  { note: 18, active: (state) => state.deckA.looping },
  { note: 20, active: (state) => state.deckB.isPlaying },
  { note: 21, active: (state) => state.deckB.pfl },
  { note: 22, active: (state) => state.deckB.looping },
];

const MCU_BUTTONS: MCUStatefulButton[] = [
  { note: 0, active: (state) => state.deckA.isPlaying },
  { note: 8, active: (state) => state.deckA.pfl },
  { note: 16, active: (state) => state.deckA.looping },
  { note: 4, active: (state) => state.deckB.isPlaying },
  { note: 12, active: (state) => state.deckB.pfl },
  { note: 20, active: (state) => state.deckB.looping },
];

const X_TOUCH_ONE_BUTTONS: MCUStatefulButton[] = [
  { note: 84, active: () => false },
  { note: 85, active: () => false },
  { note: 86, active: () => false },
  { note: 87, active: () => false },
  { note: 91, active: () => false },
  { note: 92, active: () => false },
  { note: 93, active: (state) => state.deckA.looping },
  { note: 94, active: (state) => state.deckA.isPlaying },
  { note: 95, active: (state) => state.deckB.isPlaying },
];

export function encodeXTouchPitchBend(channel: number, normalized: number): MidiBytes {
  const clamped = clamp01(normalized);
  const value14 = Math.round(clamped * 16383);
  const lsb = value14 & 0x7f;
  const msb = (value14 >> 7) & 0x7f;
  return [0xe0 | (channel & 0x0f), lsb, msb];
}

export function encodeCompactFaderCC(channel: number, cc: number, normalized: number): MidiBytes {
  return [0xb0 | (channel & 0x0f), cc & 0x7f, Math.round(clamp01(normalized) * 127) & 0x7f];
}

export function encodeXTouchButtonLED(channel: number, note: number, lit: boolean): MidiBytes {
  return [0x90 | (channel & 0x0f), note & 0x7f, lit ? MCU_BUTTON_LED_ON : MCU_BUTTON_LED_OFF];
}

export function encodeCompactButtonLED(note: number, lit: boolean): MidiBytes {
  return [0x90 | COMPACT_GLOBAL_CHANNEL, note & 0x7f, lit ? COMPACT_BUTTON_LED_ON : COMPACT_BUTTON_LED_OFF];
}

export function encodeXTouchRing(channel: number, ring: number, normalized: number, mode: RingMode = 'pan'): MidiBytes {
  const value = mode === 'fan' ? encodeFanRingValue(normalized) : encodePanRingValue(normalized);
  return [0xb0 | (channel & 0x0f), ring & 0x7f, value];
}

export function encodeCompactRingMode(cc: number, mode: RingMode): MidiBytes {
  return [
    0xb0 | COMPACT_GLOBAL_CHANNEL,
    (cc + COMPACT_RING_MODE_CC_OFFSET) & 0x7f,
    mode === 'fan' ? 2 : 1,
  ];
}

export function buildXTouchFeedbackMessages(
  preset: DJControllerPreset | null,
  state: XTouchFeedbackState,
  touched: XTouchTouchedMap = {}
): number[][] {
  if (!preset) return [];

  switch (preset.id) {
    case 'behringer-xtouch-compact':
      return buildCompactMessages(state, touched);
    case 'behringer-xtouch':
      return buildMCUMessages(state, touched, false);
    case 'behringer-xtouch-one':
      return buildMCUMessages(state, touched, true);
    default:
      return [];
  }
}

function buildCompactMessages(state: XTouchFeedbackState, touched: XTouchTouchedMap): number[][] {
  const messages: number[][] = [];

  const faders: Array<[number, number]> = [
    [1, state.deckA.volume],
    [2, state.deckA.eqHi],
    [3, state.deckA.eqMid],
    [4, state.deckA.eqLow],
    [5, state.deckB.volume],
    [6, state.deckB.eqHi],
    [7, state.deckB.eqMid],
    [8, state.deckB.eqLow],
    [9, state.crossfader],
  ];

  for (const [cc, value] of faders) {
    if (touched[`cc:${cc}`]) continue;
    messages.push(encodeCompactFaderCC(0, cc, value));
  }

  const rings: Array<[number, number]> = [
    [10, state.deckA.filter],
    [11, state.deckA.filterQ],
    [12, normalizePitch(state.deckA.pitch)],
    [13, state.dub.echoWet],
    [14, state.deckB.filter],
    [15, state.deckB.filterQ],
    [16, normalizePitch(state.deckB.pitch)],
    [17, state.dub.echoIntensity],
    [18, normalizeEchoRate(state.dub.echoRateMs)],
    [19, state.dub.springWet],
    [20, state.dub.returnGain],
    [21, normalizeDubHPF(state.dub.hpfCutoff)],
    [22, state.dub.sidechainAmount],
    [23, state.masterVolume],
    [24, state.deckA.filter],
    [25, state.deckB.filter],
  ];

  for (const [cc, value] of rings) {
    const mode = COMPACT_RING_MODE_BY_CC.get(cc) ?? 'pan';
    messages.push(encodeCompactRingMode(cc, mode));
    messages.push(encodeXTouchRing(0, cc, value, mode));
  }

  for (const button of COMPACT_BUTTONS) {
    messages.push(encodeCompactButtonLED(button.note, button.active(state)));
  }

  return messages;
}

function buildMCUMessages(state: XTouchFeedbackState, touched: XTouchTouchedMap, singleFader: boolean): number[][] {
  const messages: number[][] = [];

  const faders = singleFader
    ? [{ channel: 0, key: 'pitchbend:0', value: state.crossfader }]
    : [
        { channel: 0, key: 'pitchbend:0', value: state.deckA.volume },
        { channel: 1, key: 'pitchbend:1', value: state.deckA.eqHi },
        { channel: 2, key: 'pitchbend:2', value: state.deckA.eqMid },
        { channel: 3, key: 'pitchbend:3', value: state.deckA.eqLow },
        { channel: 4, key: 'pitchbend:4', value: state.deckB.volume },
        { channel: 5, key: 'pitchbend:5', value: state.deckB.eqHi },
        { channel: 6, key: 'pitchbend:6', value: state.deckB.eqMid },
        { channel: 7, key: 'pitchbend:7', value: state.deckB.eqLow },
        { channel: 8, key: 'pitchbend:8', value: state.crossfader },
      ];

  for (const fader of faders) {
    if (touched[fader.key]) continue;
    messages.push(encodeXTouchPitchBend(fader.channel, fader.value));
  }

  const rings = singleFader
    ? [{ ring: 48, value: state.masterVolume, mode: 'fan' as const }]
    : [
        { ring: 48, value: state.deckA.filter, mode: 'pan' as const },
        { ring: 49, value: state.deckA.filterQ, mode: 'fan' as const },
        { ring: 50, value: normalizePitch(state.deckA.pitch), mode: 'pan' as const },
        { ring: 51, value: state.dub.echoWet, mode: 'fan' as const },
        { ring: 52, value: state.deckB.filter, mode: 'pan' as const },
        { ring: 53, value: state.deckB.filterQ, mode: 'fan' as const },
        { ring: 54, value: normalizePitch(state.deckB.pitch), mode: 'pan' as const },
        { ring: 55, value: state.dub.echoIntensity, mode: 'fan' as const },
      ];

  for (const ring of rings) {
    messages.push(encodeXTouchRing(0, ring.ring, ring.value, ring.mode));
  }

  for (const button of singleFader ? X_TOUCH_ONE_BUTTONS : MCU_BUTTONS) {
    messages.push(encodeXTouchButtonLED(0, button.note, button.active(state)));
  }

  return messages;
}

function encodePanRingValue(normalized: number): number {
  return Math.round(clamp01(normalized) * 11) & 0x0f;
}

function encodeFanRingValue(normalized: number): number {
  return (0x10 | Math.round(clamp01(normalized) * 11)) & 0x1f;
}

function normalizePitch(semitones: number): number {
  const normalized = (semitones + 12) / 24;
  return clamp01(normalized);
}

function normalizeEchoRate(valueMs: number): number {
  return clamp01((valueMs - 80) / (1200 - 80));
}

function normalizeDubHPF(valueHz: number): number {
  return clamp01((valueHz - 20) / (1000 - 20));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
