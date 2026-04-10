/**
 * AdPlugWasmExtractor.ts — Extract editable pattern/instrument data from AdPlug WASM
 *
 * Supports two extraction modes:
 *   1. Native extraction — for formats with grid-based pattern data (CmodPlayer,
 *      ChscPlayer, Cs3mPlayer, CpisPlayer, CldsPlayer, CxadbmfPlayer)
 *   2. OPL capture — for all other formats (MIDI, raw, event-based). Plays the
 *      song tick-by-tick, intercepts OPL register writes, and reconstructs
 *      patterns from detected note-on/note-off events.
 *
 * Total: 33 of 36 AdLib formats are extractable and editable.
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
    effects: [], volume: 64, pan: 0,
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
  o.op1Level = 63 - (regs[2] & 0x3F); // OPL TL is inverted: 0=loud, 63=quiet → convert to 63=loud
  o.op2KSL = (regs[3] >> 6) & 0x03;
  o.op2Level = 63 - (regs[3] & 0x3F);
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
  _adplug_add_companion(dataPtr: number, length: number, namePtr: number): void;
  _adplug_load(dataPtr: number, length: number, filenamePtr: number): number;
  _adplug_get_patterns(): number;
  _adplug_get_orders(): number;
  _adplug_get_rows(): number;
  _adplug_get_channels(): number;
  _adplug_get_speed(): number;
  _adplug_is_cmod_player(): number;
  _adplug_get_bpm_value(): number;
  _adplug_get_restart_pos(): number;
  _adplug_get_order_entry(idx: number): number;
  _adplug_get_note(pattern: number, row: number, channel: number): number;
  _adplug_get_instrument_regs(index: number, outPtr: number): number;
  _adplug_get_title(): number;
  _adplug_get_type(): number;
  _adplug_get_num_instruments(): number;
  _adplug_get_instrument_name(index: number): number;
  _adplug_get_player_type(): number;
  _adplug_get_refresh_rate(): number;
  _adplug_capture_song(): number;
  _adplug_capture_get_num_events(): number;
  _adplug_capture_get_num_instruments(): number;
  _adplug_capture_get_total_ticks(): number;
  _adplug_capture_get_refresh_rate(): number;
  _adplug_capture_get_ticks_per_row(): number;
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

/** Companion file to load alongside the main music file */
export interface CompanionFile {
  name: string;
  data: ArrayBuffer;
}

/**
 * Try to extract editable pattern data from an AdPlug-supported file.
 * Returns null if the format is not a CmodPlayer-based tracker (stream-only formats).
 * Pass companions for formats that need them (SCI needs patch.003, SNG needs .ins).
 */
export async function extractAdPlugPatterns(
  buffer: ArrayBuffer,
  filename: string,
  companions?: CompanionFile[],
): Promise<TrackerSong | null> {
  const M = await getModule();
  const data = new Uint8Array(buffer);

  // Load companion files first (before adplug_load)
  if (companions) {
    for (const comp of companions) {
      const compData = new Uint8Array(comp.data);
      const compPtr = M._malloc(compData.length);
      M.HEAPU8.set(compData, compPtr);
      const compNameBytes = new TextEncoder().encode(comp.name);
      const compNamePtr = M._malloc(compNameBytes.length + 1);
      M.HEAPU8.set(compNameBytes, compNamePtr);
      M.HEAPU8[compNamePtr + compNameBytes.length] = 0;
      M._adplug_add_companion(compPtr, compData.length, compNamePtr);
      M._free(compPtr);
      M._free(compNamePtr);
    }
  }

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
    let numPatterns = M._adplug_get_patterns();
    let numOrders = M._adplug_get_orders();
    let numChannels = M._adplug_get_channels();
    const numRows = M._adplug_get_rows();
    let rawSpeed = M._adplug_get_speed();
    let rawBpm = M._adplug_get_bpm_value();
    const restartPos = M._adplug_get_restart_pos();
    const title = M.UTF8ToString(M._adplug_get_title());
    const type = M.UTF8ToString(M._adplug_get_type());
    const playerRefresh = M._adplug_get_refresh_rate();
    const isCmodFormat = M._adplug_is_cmod_player() !== 0;
    let usedCapture = false;

    console.log(`[AdPlug] WASM returned: type="${type}" pat=${numPatterns} ord=${numOrders} ch=${numChannels} rows=${numRows} speed=${rawSpeed} bpm=${rawBpm}`);

    // If native extraction yields no patterns, try OPL capture
    if (numPatterns === 0 || numOrders === 0 || numChannels === 0) {
      const capturedEvents = M._adplug_capture_song();
      if (!capturedEvents || capturedEvents === 0) return null;

      // Re-query structural data (now populated from capture)
      numPatterns = M._adplug_get_patterns();
      numOrders = M._adplug_get_orders();
      numChannels = M._adplug_get_channels();
      usedCapture = true;

      if (numPatterns === 0 || numOrders === 0 || numChannels === 0) return null;
    }
    if (numChannels > 24 || numRows > 256) return null;

    // ── Compute BPM and speed from refresh rate ──
    // The tracker equation: tickRate = BPM * 2 / 5, rowRate = tickRate / speed
    // For OPL formats, the refresh rate IS the tick rate.
    // For capture: each row = ticksPerRow OPL ticks.
    // For native: use the player's speed, derive BPM from refresh.
    let finalSpeed: number;
    let finalBpm: number;

    const refresh = usedCapture
      ? M._adplug_capture_get_refresh_rate()
      : playerRefresh;

    if (usedCapture) {
      // Use the WASM-computed ticksPerRow from actual note spacing analysis
      const ticksPerRow = Math.max(1, M._adplug_capture_get_ticks_per_row());
      const rawRowRate = refresh / ticksPerRow;
      finalSpeed = 1;
      finalBpm = Math.round(rawRowRate * 5 / 2);
    } else {
      // Native format — use player speed if valid, compute BPM from refresh
      finalSpeed = (rawSpeed > 0 && rawSpeed <= 31) ? rawSpeed : 6;
      if (rawBpm > 0 && rawBpm <= 300) {
        // Player reports a valid BPM — use it
        finalBpm = rawBpm;
      } else if (refresh > 0) {
        // BPM = refresh * 5 / 2 (simplified from rowRate * speed * 5 / 2)
        finalBpm = Math.round(refresh * 5 / 2);
      } else {
        finalBpm = 125;
      }
    }

    // Clamp to tracker-friendly range, adjusting speed to compensate
    if (finalBpm > 300) {
      const factor = Math.ceil(finalBpm / 150);
      finalSpeed = Math.min(31, finalSpeed * factor);
      finalBpm = Math.round(finalBpm / factor);
    }
    if (finalBpm < 32) {
      finalBpm = 125;
      finalSpeed = 6;
    }
    finalBpm = Math.max(32, Math.min(300, finalBpm));
    finalSpeed = Math.max(1, Math.min(31, finalSpeed));

    const tprForLog = usedCapture ? M._adplug_capture_get_ticks_per_row() : 'N/A';
    console.log(`[AdPlug] Timing: refresh=${refresh}Hz usedCapture=${usedCapture} ticksPerRow=${tprForLog} → BPM=${finalBpm} speed=${finalSpeed} rowRate=${(finalBpm * 2 / (5 * finalSpeed)).toFixed(1)}/sec`);

    // ── Extract order list ──
    // Stop at first out-of-range or sentinel entry (0xFFFF = end, >= numPatterns = padding)
    const songPositions: number[] = [];
    for (let i = 0; i < numOrders; i++) {
      const entry = M._adplug_get_order_entry(i);
      if (entry === 0xFFFF || entry >= numPatterns) break;
      songPositions.push(entry);
    }
    if (songPositions.length === 0) return null;

    // ── Extract instruments ──
    // Extract all instruments but track which have non-zero register data
    const numInst = M._adplug_get_num_instruments();
    const instruments: InstrumentConfig[] = [];
    const regsPtr = M._malloc(11);

    for (let i = 0; i < Math.max(numInst, 1); i++) {
      const instName = numInst > 0 ? M.UTF8ToString(M._adplug_get_instrument_name(i)) : '';
      const inst = makeOPLInstrument(i + 1, instName.trim() || `Inst ${i + 1}`);

      if (M._adplug_get_instrument_regs(i, regsPtr)) {
        const regs = new Uint8Array(11);
        let sum = 0;
        for (let j = 0; j < 11; j++) { regs[j] = M.HEAPU8[regsPtr + j]; sum += regs[j]; }
        if (sum > 0) applyOPLRegisters(inst, regs);
      }
      instruments.push(inst);
    }
    M._free(regsPtr);

    // ── Extract patterns ──
    // Track the last active instrument per channel across the song (in playback order).
    // Many AdLib formats (HSC, CmodPlayer) set the instrument once and it persists
    // until changed. XM requires an explicit instrument on each note, so we fill
    // it in from the tracked state.
    const patterns: Pattern[] = [];
    let totalNotes = 0;
    const channelInst = new Uint8Array(numChannels);
    // HSC initializes each channel with instrument=channel_index (hsc.cpp line 253)
    const isHSC = type.toLowerCase().includes('hsc');
    if (isHSC) {
      for (let c = 0; c < numChannels; c++) {
        channelInst[c] = Math.min(c + 1, instruments.length); // 1-based
      }
    }

    // First pass: iterate patterns in song order to track instrument state,
    // then store per-cell. We need this because pattern N might be played
    // multiple times with different instrument state depending on song position.
    // For simplicity, do a single sequential pass over song positions.
    const patternInstruments = new Map<number, Uint8Array[]>(); // pattern → [row][channel] instrument

    for (let sp = 0; sp < songPositions.length; sp++) {
      const p = songPositions[sp];
      if (p >= numPatterns) continue;

      // Initialize per-row instrument tracking for this pattern visit
      if (!patternInstruments.has(p)) {
        patternInstruments.set(p, []);
      }
      const instRows = patternInstruments.get(p)!;

      for (let r = 0; r < numRows; r++) {
        if (!instRows[r]) instRows[r] = new Uint8Array(numChannels);
        for (let c = 0; c < numChannels; c++) {
          const packed = M._adplug_get_note(p, r, c);
          if (packed === 0) continue;

          const cmodInst = (packed >> 8) & 0xFF;
          if (cmodInst > 0) {
            channelInst[c] = cmodInst;
          }
          instRows[r][c] = channelInst[c];
        }
      }
    }

    // Second pass: build the actual Pattern objects
    for (let p = 0; p < numPatterns; p++) {
      const pat = emptyPattern(`p${p}`, `Pattern ${p}`, numChannels, numRows);
      const instRows = patternInstruments.get(p);

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

          // Use explicit instrument if present, otherwise use tracked state
          if (cmodInst > 0) {
            cell.instrument = cmodInst;
          } else if (instRows && instRows[r]) {
            cell.instrument = instRows[r][c] || 0;
          }

          if (cmodCmd > 0) {
            // CmodPlayer formats use a custom command numbering (0-15) that needs
            // mapping to XM effects. HSC, S3M, LDS and other formats already emit
            // XM-compatible or OPL-native effect codes (0x30+) from C++.
            if (isCmodFormat) {
              const [effTyp, eff] = cmodCmdToXM(cmodCmd, cmodParam);
              cell.effTyp = effTyp;
              cell.eff = eff;
            } else {
              cell.effTyp = cmodCmd;
              cell.eff = cmodParam;
            }
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
      initialSpeed: finalSpeed,
      initialBPM: finalBpm,
    };
  } finally {
    M._adplug_shutdown();
    M._adplug_init(48000);
  }
}
