/**
 * Headless DX7 firmware harness: the real public/dx7 WASM (VDX7: HD6303 firmware + EGS + OPS) and the stock DX7
 * v1.8 ROM under public/roms/dx7, driven through the real worklet. Lets tests read what the hardware EG did
 * (dx7GetEgsRegisters / dx7GetEnvelopeState) and render audio.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT, stereoOutputs, type WorkletProc } from '@/engine/__tests__/workletHarness';
import { packDX7Voice, toBulkSysex } from '../dx7sysex';

export interface DX7Rig {
  proc: WorkletProc & { module: { _malloc(n: number): number; _free(p: number): void; HEAPU8: Uint8Array; _dx7GetEgsRegisters(p: number): number; _dx7GetEnvelopeState(p: number): number } };
  send: (m: unknown) => Promise<void>;
  posted: Array<{ type?: string } & Record<string, unknown>>;
  /** Render `blocks` x 128 host frames (48 kHz); returns the left channel. */
  run(blocks: number): Float32Array;
  egsRegisters(): Uint8Array;
  envelopeState(): Array<Array<{ level: number; stage: number; keyoff: boolean }>>;
  /** Load a 156-byte VCED voice as voice 0 of a bulk dump and select it. */
  loadVoice(vced: Uint8Array): Promise<void>;
  /** Load up to 32 VCED voices as one bulk dump (voice i = vceds[i], missing ones repeat the last) and select program 0. */
  loadBank(vceds: readonly Uint8Array[]): Promise<void>;
  /** Select a program of the loaded bank and let the firmware process the change. */
  program(n: number): Promise<void>;
}

/** A neutral voice: every EG at 99/99/99/99 -> 99/99/99/0, only OP1 audible, ratio 1, algorithm 32, no LFO. */
export function initVoice(): Uint8Array {
  const v = new Uint8Array(156);
  for (let op = 0; op < 6; op++) v.set([99, 99, 99, 99, 99, 99, 99, 0, 39, 0, 0, 0, 0, 0, 0, 0, op === 5 ? 99 : 0, 0, 1, 0, 7], op * 21);
  v[134] = 31; v.set([99, 99, 99, 99, 50, 50, 50, 50], 126);
  for (let i = 0; i < 10; i++) v[145 + i] = 65 + i;
  v[144] = 24;
  return v;
}

const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** The stock DX7 v1.8 firmware ROM is copyrighted and gitignored (public/roms/.gitignore); tests that need it skip without it. */
export const HAS_DX7_ROM = existsSync(resolve(ROOT, 'public/roms/dx7/DX7-V1-8.OBJ'));

export async function startDX7(): Promise<DX7Rig> {
  const w = await startWorklet('dx7', 'DX7');
  const rom = readFileSync(resolve(ROOT, 'public/roms/dx7/DX7-V1-8.OBJ'));
  await w.send({ type: 'loadFirmware', data: ab(rom) });
  const proc = w.proc as DX7Rig['proc'];
  const run = (blocks: number): Float32Array => {
    const out = new Float32Array(blocks * 128);
    for (let i = 0; i < blocks; i++) {
      const o = stereoOutputs(1);
      proc.process([], o);
      out.set(o[0][0], i * 128);
    }
    return out;
  };
  const rig: DX7Rig = {
    proc, send: w.send, posted: w.posted as DX7Rig['posted'], run,
    egsRegisters() {
      const p = proc.module._malloc(256);
      proc.module._dx7GetEgsRegisters(p);
      const out = proc.module.HEAPU8.slice(p, p + 256);
      proc.module._free(p);
      return out;
    },
    envelopeState() {
      const p = proc.module._malloc(384);
      proc.module._dx7GetEnvelopeState(p);
      const raw = proc.module.HEAPU8.slice(p, p + 384);
      proc.module._free(p);
      const dv = new DataView(raw.buffer);
      return Array.from({ length: 16 }, (_, v) => Array.from({ length: 6 }, (_, o) => {
        const b = (v * 6 + o) * 4;
        return { level: dv.getUint16(b, true), stage: raw[b + 2], keyoff: (raw[b + 3] & 1) === 1 };
      }));
    },
    async loadVoice(vced: Uint8Array) {
      await rig.loadBank([vced]);
    },
    async loadBank(vceds: readonly Uint8Array[]) {
      const bank = new Uint8Array(4096);
      for (let i = 0; i < 32; i++) bank.set(packDX7Voice(vceds[Math.min(i, vceds.length - 1)]), i * 128);
      await w.send({ type: 'loadSysex', data: ab(toBulkSysex(bank)) });
      run(100);
      await w.send({ type: 'programChange', program: 0 });
      run(100);
    },
    async program(n: number) {
      await w.send({ type: 'programChange', program: n });
      run(60);
    },
  };
  return rig;
}
