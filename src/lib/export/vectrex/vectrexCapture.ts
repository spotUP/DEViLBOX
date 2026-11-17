/** Record the playing Furnace AY song once and build the Vectrex cartridge from it (export dialog only: needs the audio worklet). */
import { useTransportStore, useTrackerStore } from '@stores';
import { ChipRecordingSession, parseRegisterLog } from '../ChipExporter';
import { VGM_SAMPLE_RATE } from '../dispatchRegCapture';
import type { RegisterWrite } from '../VGMExporter';
import type { Pattern } from '@/types/tracker';
import { buildVectrexCartridge, fetchVectrexPlayer, type VectrexCartridgeResult } from './vectrexCartridge';

const MAX_RECORD_MS = 10 * 60 * 1000;

const FX_SPEED = 0x0F, FX_TEMPO = 0xF0, FX_BREAK = 0x0D;

/** The (type, param) pairs of one row's cells, all effect slots (Furnace notation). */
function rowEffects(patterns: Pattern, row: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const ch of patterns.channels) {
    const c = ch.rows[row] as unknown as Record<string, number | undefined> | undefined;
    if (!c) continue;
    for (const k of ['', '2', '3', '4', '5', '6', '7', '8']) out.push([c['effTyp' + k] ?? 0, c['eff' + k] ?? 0]);
  }
  return out;
}

/**
 * Rows played and 50 Hz frames of one pass over the order list. Follows 0Fxx speed changes, F0xx tempo
 * changes (tick rate = value * 2 / 5 Hz) and 0Dxx pattern breaks; `speed` and `hz` are the song's start values.
 */
export function orderPassLength(patterns: readonly Pattern[], order: readonly number[], speed: number, hz = 50): { rows: number; frames: number } {
  let rows = 0, frames = 0;
  for (const idx of order) {
    const p = patterns[idx];
    if (!p) continue;
    for (let r = 0; r < p.length; r++) {
      const fx = rowEffects(p, r);
      for (const [t, v] of fx) {
        if (t === FX_SPEED && v > 0) speed = v;
        else if (t === FX_TEMPO) hz = Math.max(1, v * 2 / 5);
      }
      rows++;
      frames += speed * 50 / hz;
      if (fx.some(([t]) => t === FX_BREAK)) break;
    }
  }
  return { rows, frames: Math.ceil(frames) };
}

/** Writes of the first `frames` 50 Hz frames only (captureToFrames rounds a write to its nearest frame). */
export function cutToFrames(writes: readonly RegisterWrite[], frames: number, sampleRate: number): RegisterWrite[] {
  const origin = writes.reduce((m, w) => Math.min(m, w.timestamp), Infinity);
  return writes.filter((w) => (w.timestamp - origin) < (frames - 0.5) * sampleRate / 50);
}

export async function recordVectrexCartridge(title: string): Promise<VectrexCartridgeResult> {
  const transport = useTransportStore.getState();
  const wasPlaying = transport.isPlaying;
  const wasLooping = transport.isLooping;
  const { patterns, patternOrder } = useTrackerStore.getState();
  const pass = orderPassLength(patterns, patternOrder.length ? patternOrder : patterns.map((_, i) => i), transport.speed);
  const session = new ChipRecordingSession();
  transport.setIsLooping(false);
  session.startRecording();
  if (!wasPlaying) await transport.play();
  const t0 = Date.now();
  // The Furnace engine wraps the order list instead of ending: stop after one pass.
  while (useTransportStore.getState().isPlaying && useTransportStore.getState().continuousRow < pass.rows && Date.now() - t0 < MAX_RECORD_MS) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const log = await session.stopRecording();
  useTransportStore.getState().stop();
  useTransportStore.getState().setIsLooping(wasLooping);
  return buildVectrexCartridge(cutToFrames(parseRegisterLog(log), pass.frames, VGM_SAMPLE_RATE), VGM_SAMPLE_RATE, await fetchVectrexPlayer(), title);
}
