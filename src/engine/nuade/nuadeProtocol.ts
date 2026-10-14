/**
 * The message protocol between NuadeEngine (main thread) and public/nuade/Nuade.worklet.js (plan D4).
 *
 * The message names are the single list both sides and the tests read: `NUADE_IN_MESSAGES` is what the worklet must
 * handle, `NUADE_OUT_MESSAGES` is all it may post. `parseNuadeOut` is the one place a posted message is validated.
 */

/** A companion file a player opens beside the module (samples, instrument banks), by name. */
export interface NuadeCompanion { name: string; data: ArrayBuffer }

/** Capability bits of `nw_caps()`; at the pinned upstream only StateRead can be set. */
export const NuadeCap = { StateRead: 1, CellWrite: 2, InstrumentWrite: 4, ModuleWrite: 8 } as const;

export type NuadeIn =
  | { type: 'init'; wasmBinary: ArrayBuffer | null; jsCode: string | null; sampleRate?: number }
  | { type: 'loadModule'; bytes: ArrayBuffer; playerId: string; fileName: string; subsong: number | undefined; companions: NuadeCompanion[] }
  /** latencyFrames: output latency, so `position` is read at the frame being heard. */
  | { type: 'play'; latencyFrames?: number }
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'setSubsong'; index: number }
  /** Bit N set = voice N audible. */
  | { type: 'setMuteMask'; mask: number }
  /** Isolation slots and dub sends (worklets/channel-outputs.js). */
  | { type: 'addIsolation'; slotIndex: number; channelMask: number }
  | { type: 'removeIsolation'; slotIndex: number }
  | { type: 'dubChannelEnable'; channel: number }
  | { type: 'dubChannelDisable'; channel: number }
  | { type: 'dubChannelDisableAll' }
  /** The edited module while it plays: opened, sought to the frame already played, played on. */
  | { type: 'swapModule'; bytes: ArrayBuffer }
  | { type: 'seek'; frame: number }
  | { type: 'setStereoSeparation'; value: number }
  /** Read bytes of the player's typed state (answered with `state`). */
  | { type: 'requestState'; offset: number; len: number }
  /** Edit slot: forwarded to nw_cell_write / nw_instrument_write, which answer -ENOSYS until upstream publishes a write API. */
  | { type: 'cellWrite'; pattern: number; row: number; channel: number; values: number[] }
  | { type: 'instrumentWrite'; instrument: number; param: number; value: number };

export interface NuadeVoiceState { note: number; instrument: number; volume: number; pan: number; active: boolean }

export type NuadeOut =
  | { type: 'ready' }
  | {
      type: 'moduleLoaded';
      voices: number; subsongs: number; defaultSubsong: number;
      /** The subsong the load started (the asked one, else the default). */
      startedSubsong?: number;
      playerId: string; playerName: string;
      meta: Record<string, string>;
      instruments: { index: number; name: string }[];
      caps: number;
    }
  | { type: 'subsongStarted'; index: number }
  /** Once per tick snapshot that changed row, read at the frame being heard. */
  | { type: 'position'; frame: number; order: number; pattern: number; row: number; tick: number; speed: number; tempo: number; voices: NuadeVoiceState[] }
  /** Peak per voice, about 20 Hz. */
  | { type: 'vu'; levels: number[] }
  /** The shape EaglePlayer posts to useOscilloscopeStore.updateChannelData. */
  | { type: 'oscData'; channels: Int16Array[]; frame: number; sampleRate: number }
  | { type: 'songEnd' }
  | { type: 'swapDone'; ms: number }
  /** The answer to a cellWrite / instrumentWrite: 0 ok, negative errno (-52 = no write API). */
  | { type: 'writeResult'; op: 'cell' | 'instrument'; status: number }
  | { type: 'state'; offset: number; bytes: ArrayBuffer }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

/** Every message type the worklet handles itself (the isolation / dub kinds go through channel-outputs.js). */
export const NUADE_IN_MESSAGES = [
  'init', 'loadModule', 'play', 'stop', 'pause', 'setSubsong', 'setMuteMask',
  'swapModule', 'seek', 'setStereoSeparation', 'requestState', 'cellWrite', 'instrumentWrite',
] as const satisfies readonly NuadeIn['type'][];

/** The dub / isolation kinds handled by DevilboxChannelOutputs. */
export const NUADE_CHANNEL_OUTPUT_MESSAGES = [
  'addIsolation', 'removeIsolation', 'dubChannelEnable', 'dubChannelDisable', 'dubChannelDisableAll',
] as const satisfies readonly NuadeIn['type'][];

export const NUADE_OUT_MESSAGES = [
  'ready', 'moduleLoaded', 'subsongStarted', 'position', 'vu', 'oscData', 'songEnd', 'swapDone', 'writeResult', 'state', 'stopped', 'error',
] as const satisfies readonly NuadeOut['type'][];

/**
 * Voices the engine's AudioWorkletNode declares outputs for (dub sends are outputs 5..), at least the largest voice
 * count of any nuade player in the corpus (nuadeVoiceCount.test.ts measures it).
 */
export const NUADE_NODE_VOICES = 8;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Validate a message posted by the worklet; null for anything that is not one of NuadeOut. */
export function parseNuadeOut(data: unknown): NuadeOut | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  switch (d.type) {
    case 'ready': case 'songEnd': case 'stopped':
      return { type: d.type };
    case 'moduleLoaded':
      return isNum(d.voices) && isNum(d.subsongs) && isNum(d.defaultSubsong) && isStr(d.playerId) && isStr(d.playerName)
        && isNum(d.caps) && Array.isArray(d.instruments) && d.meta !== null && typeof d.meta === 'object'
        ? (d as unknown as NuadeOut) : null;
    case 'subsongStarted':
      return isNum(d.index) ? { type: 'subsongStarted', index: d.index } : null;
    case 'position':
      return ['frame', 'order', 'pattern', 'row', 'tick', 'speed', 'tempo'].every((k) => isNum(d[k])) && Array.isArray(d.voices)
        ? (d as unknown as NuadeOut) : null;
    case 'vu':
      return Array.isArray(d.levels) ? { type: 'vu', levels: d.levels as number[] } : null;
    case 'oscData':
      return Array.isArray(d.channels) && isNum(d.frame) && isNum(d.sampleRate) ? (d as unknown as NuadeOut) : null;
    case 'writeResult':
      return (d.op === 'cell' || d.op === 'instrument') && isNum(d.status) ? { type: 'writeResult', op: d.op, status: d.status } : null;
    case 'swapDone':
      return isNum(d.ms) ? { type: 'swapDone', ms: d.ms } : null;
    case 'state':
      return isNum(d.offset) && d.bytes instanceof ArrayBuffer ? { type: 'state', offset: d.offset, bytes: d.bytes } : null;
    case 'error':
      return isStr(d.message) ? { type: 'error', message: d.message } : null;
    default:
      return null;
  }
}
