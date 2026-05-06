import type { DJControllerPreset } from './djControllerPresets';
import { recordMotorSend } from './DJControllerMapper';

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
  /** When dub bus is enabled, faders 1-8 reflect per-channel dub sends instead of DJ params */
  dubChannelSends?: number[];
  /** Channel mute state (up to 8 channels) */
  channelMutes: boolean[];
  /** Channel solo state (up to 8 channels) */
  channelSolos: boolean[];
  /** Notes of buttons currently lit by active dub moves */
  activeMoveNotes: Set<number>;
};

export type XTouchTouchedMap = Partial<Record<string, boolean>>;

type MidiBytes = [number, number, number];

type MCUStatefulButton = {
  note: number;
  active: (state: XTouchFeedbackState) => boolean;
};

type RingMode = 'pan' | 'fan';

const COMPACT_BUTTON_LED_OFF = 0;
const COMPACT_BUTTON_LED_ON = 2;
const COMPACT_OUTPUT_CHANNEL = 1; // X-Touch Compact Global Channel (factory default "2" = 0-indexed 1)
const MCU_BUTTON_LED_OFF = 0;
const MCU_BUTTON_LED_ON = 127;

// Ring LED feedback uses the SAME CC as the encoder turn value.
// Hardware testing (confirmed by cjcormack/lighting7) shows the firmware's ring RX
// is the turn CC, NOT the QSG-documented CC+16 range.
// Value 0-127 maps directly to ring LED position.

// Ring mode assignments kept for documentation — Standard mode firmware
// ignores separate mode commands; ring display style is set in the device preset.

// Compact buttons are generated dynamically in buildCompactMessages based on:
// - Row 1 (notes 16-23) + Encoder buttons (notes 0-7): active dub moves (from activeMoveNotes)
// - Row 2 (notes 24-31): channel mute state
// - Row 3 (notes 32-39): channel solo state

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
  return [0x90 | COMPACT_OUTPUT_CHANNEL, note & 0x7f, lit ? COMPACT_BUTTON_LED_ON : COMPACT_BUTTON_LED_OFF];
}

/** Record that a fader was just released from touch — starts grace period */
export function recordFaderTouchRelease(cc: number): void {
  _touchReleaseTime.set(cc, performance.now());
}

export function encodeCompactRingValue(channel: number, inputCC: number, normalized: number): MidiBytes {
  // Ring LED uses the SAME CC as the encoder turn (hardware-confirmed).
  // Value 0-127 maps to ring LED position.
  const value = Math.round(clamp01(normalized) * 127);
  return [0xb0 | (channel & 0x0f), inputCC & 0x7f, value];
}

export function encodeXTouchRing(channel: number, ring: number, normalized: number, mode: RingMode = 'pan'): MidiBytes {
  const value = mode === 'fan' ? encodeFanRingValue(normalized) : encodePanRingValue(normalized);
  return [0xb0 | (channel & 0x0f), ring & 0x7f, value];
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

// Track last-sent fader CC values to prevent motor jitter (feedback loop)
const _lastSentFaderCC = new Map<number, number>();
const FADER_DEADBAND = 2; // ignore changes smaller than 2 CC steps (~1.6%)

// Post-touch grace period — after user lifts finger, suppress motor for 200ms
// to prevent snap-back when a dub move releases during touch.
const _touchReleaseTime = new Map<number, number>();
const TOUCH_GRACE_MS = 200;

function buildCompactMessages(state: XTouchFeedbackState, touched: XTouchTouchedMap): number[][] {
  const messages: number[][] = [];

  // When dub bus is active, faders 1-8 reflect per-channel dub sends
  const dubSends = state.dubChannelSends;
  const faders: Array<[number, number]> = dubSends
    ? [
        [1, dubSends[0] ?? 0],
        [2, dubSends[1] ?? 0],
        [3, dubSends[2] ?? 0],
        [4, dubSends[3] ?? 0],
        [5, dubSends[4] ?? 0],
        [6, dubSends[5] ?? 0],
        [7, dubSends[6] ?? 0],
        [8, dubSends[7] ?? 0],
        [9, state.crossfader],
      ]
    : [
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
    // Post-touch grace period: suppress motor commands briefly after finger lift
    const releaseTime = _touchReleaseTime.get(cc);
    if (releaseTime && (performance.now() - releaseTime) < TOUCH_GRACE_MS) continue;
    const ccValue = Math.round(clamp01(value) * 127);
    const lastSent = _lastSentFaderCC.get(cc) ?? -999;
    if (Math.abs(ccValue - lastSent) < FADER_DEADBAND) continue;
    _lastSentFaderCC.set(cc, ccValue);
    recordMotorSend(cc);
    messages.push([0xb0 | (COMPACT_OUTPUT_CHANNEL & 0x0f), cc & 0x7f, ccValue & 0x7f]);
  }

  const rings: Array<[number, number]> = [
    // Top row (CC 10-17): dub params
    [10, state.dub.echoWet],
    [11, state.dub.echoIntensity],
    [12, normalizeEchoRate(state.dub.echoRateMs)],
    [13, state.dub.springWet],
    [14, state.dub.returnGain],
    [15, normalizeDubHPF(state.dub.hpfCutoff)],
    [16, state.dub.sidechainAmount],
    [17, state.masterVolume],
    // Right column (CC 18-25): deck filters + DJ
    [18, state.deckA.filter],
    [19, state.deckA.filterQ],
    [20, state.deckB.filter],
    [21, state.deckB.filterQ],
    [22, normalizePitch(state.deckA.pitch)],
    [23, normalizePitch(state.deckB.pitch)],
    [24, state.crossfader],
    [25, state.deckA.volume],
  ];

  for (const [cc, value] of rings) {
    messages.push(encodeCompactRingValue(COMPACT_OUTPUT_CHANNEL, cc, value));
  }

  // Button LEDs — dub moves (all button rows), mute (row 2), solo (row 3)
  // Row 1: notes 16-23 (dub hold moves)
  for (let i = 0; i < 8; i++) {
    const note = 16 + i;
    messages.push(encodeCompactButtonLED(note, state.activeMoveNotes.has(note)));
  }
  // Top encoder buttons: notes 0-7 (dub triggers)
  for (let i = 0; i < 8; i++) {
    messages.push(encodeCompactButtonLED(i, state.activeMoveNotes.has(i)));
  }
  // Right encoder buttons: notes 8-15 (more dub triggers)
  for (let i = 0; i < 8; i++) {
    messages.push(encodeCompactButtonLED(8 + i, state.activeMoveNotes.has(8 + i)));
  }
  // Row 2: notes 24-31 (channel mute)
  for (let i = 0; i < 8; i++) {
    messages.push(encodeCompactButtonLED(24 + i, state.channelMutes[i] ?? false));
  }
  // Row 3: notes 32-39 (channel solo)
  for (let i = 0; i < 8; i++) {
    messages.push(encodeCompactButtonLED(32 + i, state.channelSolos[i] ?? false));
  }
  // Select row: notes 40-48 (hold/toggle dub moves)
  for (let i = 0; i < 9; i++) {
    messages.push(encodeCompactButtonLED(40 + i, state.activeMoveNotes.has(40 + i)));
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
