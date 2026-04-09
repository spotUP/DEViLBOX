/**
 * AdPlugWasmExtractor.ts — Extract editable pattern/instrument data from AdPlug WASM
 *
 * For CmodPlayer-based formats (A2M, AMD, CFF, DFM, DTM, MAD, MTR, SA2, SAT, XMS),
 * AdPlug parses the file and stores patterns/instruments in a uniform structure.
 * This module calls the WASM extraction API to read that data and build a TrackerSong
 * with OPL3Synth instruments — making these formats fully editable.
 *
 * For non-CmodPlayer formats (ADL, BAM, GOT, RIX, ROL, etc.), the WASM reports
 * patterns=0 / orders=0, so we fall back to WASM streaming audio.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import { DEFAULT_OPL3 } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, numCh: number, rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

function makeOPLInstrument(id: number, name: string): InstrumentConfig {
  return {
    id, name, type: 'synth', synthType: 'OPL3',
    opl3: { ...DEFAULT_OPL3 },
    effects: [], volume: 0, pan: 0,
  };
}

function applyOPLRegisters(inst: InstrumentConfig, regs: Uint8Array): void {
  const o = inst.opl3;
  if (!o) return;
  o.op1Tremolo = (regs[0] >> 7) & 1;
  o.op1Vibrato = (regs[0] >> 6) & 1;
  o.op1SustainHold = (regs[0] >> 5) & 1;
  o.op1KSR = (regs[0] >> 4) & 1;
  o.op1Multi = regs[0] & 0x0F;
  o.op2Tremolo = (regs[1] >> 7) & 1;
  o.op2Vibrato = (regs[1] >> 6) & 1;
  o.op2SustainHold = (regs[1] >> 5) & 1;
  o.op2KSR = (regs[1] >> 4) & 1;
  o.op2Multi = regs[1] & 0x0F;
  o.op1KSL = (regs[2] >> 6) & 0x03;
  o.op1Level = regs[2] & 0x3F;
  o.op2KSL = (regs[3] >> 6) & 0x03;
  o.op2Level = regs[3] & 0x3F;
  o.op1Attack = (regs[4] >> 4) & 0x0F;
  o.op1Decay = regs[4] & 0x0F;
  o.op2Attack = (regs[5] >> 4) & 0x0F;
  o.op2Decay = regs[5] & 0x0F;
  o.op1Sustain = (regs[6] >> 4) & 0x0F;
  o.op1Release = regs[6] & 0x0F;
  o.op2Sustain = (regs[7] >> 4) & 0x0F;
  o.op2Release = regs[7] & 0x0F;
  o.op1Waveform = regs[8] & 0x07;
  o.op2Waveform = regs[9] & 0x07;
  o.feedback = (regs[10] >> 1) & 0x07;
  o.connection = regs[10] & 0x01;
}

// ── CmodPlayer note → MIDI note mapping ───────────────────────────────────────
// CmodPlayer uses note values 1-127 where:
//   note = octave * 12 + semitone
// Our TrackerCell uses XM-style: 1-96 (C-0 to B-7), 97 = note off
function cmodNoteToXM(cmodNote: number): number {
  if (cmodNote === 0) return 0;
  if (cmodNote >= 127) return 97; // note off
  // CmodPlayer: note 1 = C-0... but most formats start at higher octaves
  // The raw value maps directly: octave * 12 + semitone
  // XM note 1 = C-0, 13 = C-1, 25 = C-2, etc.
  return Math.max(1, Math.min(96, cmodNote));
}

// ── CmodPlayer command → XM effect mapping ────────────────────────────────────
// CmodPlayer commands: 0=none, 1=slide up, 2=slide down, 3=tone portamento,
// 4=vibrato, 5=vol slide+porta, 6=vol slide+vib, 7=arpeggio, 8=special,
// 9=vol slide up, A=vol slide down, B=pattern break, C=order jump,
// D=set speed, E=tempo adjust, F=set volume
function cmodCmdToXM(cmd: number, param: number): [number, number] {
  switch (cmd) {
    case 0: return [0, 0]; // none
    case 1: return [1, param]; // portamento up
    case 2: return [2, param]; // portamento down
    case 3: return [3, param]; // tone portamento
    case 4: return [4, param]; // vibrato
    case 5: return [5, param]; // vol slide + tone porta
    case 6: return [6, param]; // vol slide + vibrato
    case 7: return [0, param]; // arpeggio → XM effect 0
    case 8: return [14, param]; // special → E-command
    case 9: return [10, param << 4]; // vol slide up → Ax0
    case 10: return [10, param & 0x0F]; // vol slide down → A0x
    case 11: return [13, param]; // pattern break → Dxx
    case 12: return [11, param]; // order jump → Bxx
    case 13: return [15, param]; // set speed → Fxx
    case 14: return [15, param]; // tempo → Fxx (speed + tempo share effect F in XM)
    case 15: return [12, param]; // set volume → Cxx
    default: return [0, 0];
  }
}

// ── WASM Module Interface ─────────────────────────────────────────────────────
interface AdPlugWasmModule {
  _adplug_init(sampleRate: number): number;
  _adplug_shutdown(): void;
  _adplug_load(dataPtr: number, length: number, filenamePtr: number): number;
  _adplug_get_patterns(): number;
  _adplug_get_orders(): number;
  _adplug_get_rows(): number;
  _adplug_get_channels(): number;
  _adplug_get_speed(): number;
  _adplug_get_bpm_value(): number;
  _adplug_get_restart_pos(): number;
  _adplug_get_order_entry(idx: number): number;
  _adplug_get_note(pattern: number, row: number, channel: number): number;
  _adplug_get_instrument_regs(index: number, outPtr: number): number;
  _adplug_get_title(): number;
  _adplug_get_type(): number;
  _adplug_get_num_instruments(): number;
  _adplug_get_instrument_name(index: number): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  UTF8ToString(ptr: number): string;
}

let wasmModule: AdPlugWasmModule | null = null;
let wasmLoading: Promise<AdPlugWasmModule> | null = null;

async function getModule(): Promise<AdPlugWasmModule> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;

  wasmLoading = (async () => {
    // Load via script tag (browser) — the worklet already uses this pattern
    const response = await fetch('/adplug/AdPlugPlayer.js');
    const jsText = await response.text();
    // eslint-disable-next-line no-new-func
    const factory = new Function(jsText + '; return createAdPlugPlayer;')() as
      (opts?: Record<string, unknown>) => Promise<AdPlugWasmModule>;
    const m = await factory({
      locateFile: (f: string) => `/adplug/${f}`,
    });
    m._adplug_init(48000);
    wasmModule = m;
    return m;
  })();
  return wasmLoading;
}

// ── Main Extraction Function ──────────────────────────────────────────────────

/**
 * Try to extract editable pattern data from an AdPlug-supported file.
 * Returns null if the format is not a CmodPlayer-based tracker (stream-only formats).
 */
export async function extractAdPlugPatterns(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong | null> {
  const M = await getModule();
  const data = new Uint8Array(buffer);

  // Allocate and copy file data
  const dataPtr = M._malloc(data.length);
  M.HEAPU8.set(data, dataPtr);

  // Allocate filename string
  const fnameBytes = new TextEncoder().encode(filename);
  const fnamePtr = M._malloc(fnameBytes.length + 1);
  M.HEAPU8.set(fnameBytes, fnamePtr);
  M.HEAPU8[fnamePtr + fnameBytes.length] = 0;

  const loaded = M._adplug_load(dataPtr, data.length, fnamePtr);
  M._free(dataPtr);
  M._free(fnamePtr);

  if (loaded !== 0) return null;

  try {
    const numPatterns = M._adplug_get_patterns();
    const numOrders = M._adplug_get_orders();
    const numChannels = M._adplug_get_channels();
    const numRows = M._adplug_get_rows();
    const speed = M._adplug_get_speed();
    const bpm = M._adplug_get_bpm_value();
    const restartPos = M._adplug_get_restart_pos();
    const title = M.UTF8ToString(M._adplug_get_title());
    const type = M.UTF8ToString(M._adplug_get_type());

    // Must be a CmodPlayer with actual data
    if (numPatterns === 0 || numOrders === 0 || numChannels === 0 || numRows === 0) {
      return null;
    }
    if (numChannels > 18 || numRows > 256) return null;

    // ── Extract order list ──
    const songPositions: number[] = [];
    for (let i = 0; i < numOrders; i++) {
      songPositions.push(M._adplug_get_order_entry(i));
    }

    // ── Extract instruments ──
    const numInst = M._adplug_get_num_instruments();
    const instruments: InstrumentConfig[] = [];
    const regsPtr = M._malloc(11);

    for (let i = 0; i < Math.max(numInst, 1); i++) {
      const instName = numInst > 0 ? M.UTF8ToString(M._adplug_get_instrument_name(i)) : '';
      const inst = makeOPLInstrument(i + 1, instName || `Inst ${i + 1}`);

      if (M._adplug_get_instrument_regs(i, regsPtr)) {
        const regs = new Uint8Array(11);
        for (let j = 0; j < 11; j++) regs[j] = M.HEAPU8[regsPtr + j];
        applyOPLRegisters(inst, regs);
      }
      instruments.push(inst);
    }
    M._free(regsPtr);

    // ── Extract patterns ──
    const patterns: Pattern[] = [];
    let totalNotes = 0;

    for (let p = 0; p < numPatterns; p++) {
      const pat = emptyPattern(`p${p}`, `Pattern ${p}`, numChannels, numRows);

      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numChannels; c++) {
          const packed = M._adplug_get_note(p, r, c);
          if (packed === 0) continue;

          const cmodNote = packed & 0xFF;
          const cmodInst = (packed >> 8) & 0xFF;
          const cmodCmd = (packed >> 16) & 0xFF;
          const cmodParam = (packed >> 24) & 0xFF;

          const cell = pat.channels[c].rows[r];
          cell.note = cmodNoteToXM(cmodNote);
          cell.instrument = cmodInst > 0 ? cmodInst : 0;

          if (cmodCmd > 0) {
            const [effTyp, eff] = cmodCmdToXM(cmodCmd, cmodParam);
            cell.effTyp = effTyp;
            cell.eff = eff;
          }

          if (cell.note > 0 && cell.note < 97) totalNotes++;
        }
      }

      patterns.push(pat);
    }

    // If we got no actual notes, this format isn't useful for editing
    if (totalNotes === 0) return null;

    const songName = title || filename.replace(/\.[^.]+$/, '');

    return {
      name: `${songName} [${type}]`,
      format: 'AdPlug' as TrackerFormat,
      patterns,
      instruments,
      songPositions,
      songLength: songPositions.length,
      restartPosition: restartPos,
      numChannels,
      initialSpeed: speed || 6,
      initialBPM: bpm || 125,
    };
  } finally {
    M._adplug_shutdown();
    M._adplug_init(48000);
  }
}
