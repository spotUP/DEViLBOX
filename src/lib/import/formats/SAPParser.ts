/**
 * SAPParser.ts — Atari 8-bit POKEY SAP format parser
 *
 * Parses the plain-ASCII header for metadata and runs 6502 CPU emulation
 * to intercept POKEY register writes for real note extraction.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';
import { makeRowClock, mainStepFromOnsets, makeOnsetPlacer, setNoteColumn } from './stepRowClock';
import { BD_FX } from './benDaglishEffectGlyphs';
import { Cpu6502, type MemoryMap } from '@/lib/import/cpu/Cpu6502';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

interface SAPMeta {
  name: string;
  author: string;
  songs: number;
  stereo: boolean;
  initAddr: number;
  playerAddr: number;
  musicAddr: number;
  type: string; // 'B', 'C', 'D', 'S'
  fastplay: number;
  dataOffset: number;
}

function parseSAPHeader(buf: Uint8Array): SAPMeta {
  const meta: SAPMeta = {
    name: '', author: '', songs: 1, stereo: false,
    initAddr: 0, playerAddr: 0, musicAddr: 0,
    type: 'B', fastplay: 312, dataOffset: 0,
  };

  let off = 0;
  while (off < buf.length - 1) {
    if (buf[off] === 0xFF && buf[off + 1] === 0xFF) {
      meta.dataOffset = off + 2;
      break;
    }
    let lineEnd = off;
    while (lineEnd < buf.length && buf[lineEnd] !== 0x0A) lineEnd++;
    const line = new TextDecoder('latin1')
      .decode(buf.subarray(off, lineEnd))
      .replace(/\r/g, '')
      .trim();

    if (line.startsWith('NAME '))     meta.name       = line.slice(5).replace(/^"|"$/g, '').trim();
    if (line.startsWith('AUTHOR '))   meta.author     = line.slice(7).replace(/^"|"$/g, '').trim();
    if (line.startsWith('SONGS '))    meta.songs      = parseInt(line.slice(6)) || 1;
    if (line === 'STEREO')            meta.stereo     = true;
    if (line.startsWith('TYPE '))     meta.type       = line.slice(5).trim();
    if (line.startsWith('INIT '))     meta.initAddr   = parseInt(line.slice(5), 16);
    if (line.startsWith('PLAYER '))   meta.playerAddr = parseInt(line.slice(7), 16);
    if (line.startsWith('MUSIC '))    meta.musicAddr  = parseInt(line.slice(6), 16);
    if (line.startsWith('FASTPLAY ')) meta.fastplay   = parseInt(line.slice(9)) || 312;

    off = lineEnd + 1;
  }

  return meta;
}

// POKEY frequency formula:
// For 64kHz base clock (AUDCTL bit 0 = 0):
//   freq = 63921 / (2 * (AUDF + 1))  for normal 8-bit mode
// For 1.79MHz base:
//   freq = 1789772.5 / (2 * (AUDF + 1))
// Simple approximation using 64kHz base:
function pokeyFreqToNote(audf: number): number {
  if (audf === 0 || audf >= 255) return 0;
  // 64kHz clock / (2 * (audf+1)) — standard Atari SAP playback rate
  const freq = 63921 / (2 * (audf + 1));
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

interface FrameNotes { notes: (number | null)[]; }

function runSAPEmulation(buf: Uint8Array, meta: SAPMeta, numCh: number): FrameNotes[] {
  const FRAMES = 900;

  const ram = new Uint8Array(0x10000);

  // SAP type B: data section is binary, first 2 bytes = start addr (LE), next 2 = end addr (LE)
  // Then code follows
  let codeLoadAddr = 0;
  if (meta.dataOffset + 3 < buf.length) {
    codeLoadAddr = buf[meta.dataOffset] | (buf[meta.dataOffset + 1] << 8);
    const codeEnd = buf[meta.dataOffset + 2] | (buf[meta.dataOffset + 3] << 8);
    const code = buf.subarray(meta.dataOffset + 4, meta.dataOffset + 4 + (codeEnd - codeLoadAddr + 1));
    ram.set(code.subarray(0, Math.min(code.length, 0x10000 - codeLoadAddr)), codeLoadAddr);
  }

  // POKEY register shadow at $D200
  const pokeyRegs = new Uint8Array(0x10);

  const mem: MemoryMap = {
    read(addr) {
      if (addr >= 0xD200 && addr < 0xD210) return pokeyRegs[addr - 0xD200];
      return ram[addr & 0xFFFF];
    },
    write(addr, val) {
      ram[addr & 0xFFFF] = val;
      if (addr >= 0xD200 && addr < 0xD210) pokeyRegs[addr - 0xD200] = val;
    },
  };

  const cpu = new Cpu6502(mem);
  const initAddr = meta.type === 'B' ? meta.initAddr : meta.musicAddr;
  // Do NOT fall back to initAddr when playerAddr is 0: init routines are not
  // designed to be called repeatedly and produce garbled output as a play routine.
  const playAddr = meta.playerAddr;

  if (initAddr === 0 || playAddr === 0) return [];

  cpu.reset(initAddr);
  cpu.setA(0);
  cpu.callSubroutine(initAddr);

  const frameStates: FrameNotes[] = [];

  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(playAddr);

    const notes: (number | null)[] = new Array(numCh).fill(null);

    // POKEY has 4 audio channels: AUDF0-3 at $D200-$D207, AUDC0-3 at $D201-$D207 (odd)
    // AUDF (freq) at even offsets: 0, 2, 4, 6
    // AUDC (control) at odd offsets: 1, 3, 5, 7
    for (let ch = 0; ch < Math.min(numCh, 4); ch++) {
      const audf = pokeyRegs[ch * 2];       // frequency divisor
      const audc = pokeyRegs[ch * 2 + 1];   // control: bits[3:0] = volume, bits[5:4] = waveform
      const vol  = audc & 0x0F;
      notes[ch] = vol > 0 ? pokeyFreqToNote(audf) : null;
    }

    frameStates.push({ notes });
  }

  return frameStates;
}

interface SapOnset { tick: number; note: number }

/** Each channel's note changes by frame: a new pitch is a note, silence after a note is a note-off (97). */
export function sapOnsets(frameStates: FrameNotes[], numCh: number): SapOnset[][] {
  const out: SapOnset[][] = Array.from({ length: numCh }, () => []);
  const lastNote = new Array(numCh).fill(0);
  frameStates.forEach((fs, tick) => {
    for (let ch = 0; ch < numCh && ch < fs.notes.length; ch++) {
      const n = fs.notes[ch];
      if (n !== null && n !== lastNote[ch]) { out[ch].push({ tick, note: n }); lastNote[ch] = n; }
      else if (n === null && lastNote[ch] > 0) { out[ch].push({ tick, note: 97 }); lastNote[ch] = 0; }
    }
  });
  return out;
}

/** The onsets the importer places for a SAP file, by frame (the importer's own emulation; used by the reachability test). */
export function sapOnsetsOf(buffer: ArrayBuffer): SapOnset[][] {
  const buf = new Uint8Array(buffer);
  const meta = parseSAPHeader(buf);
  const numCh = meta.stereo ? 8 : 4;
  return sapOnsets(runSAPEmulation(buf, meta, numCh), numCh);
}

/**
 * One row is one song step: the main step of the note onsets in frames (plan R6/R7, as Tim Follin). An onset off the
 * step keeps its exact frame as a row offset, and note columns grow through the shared placer: no onset is dropped.
 */
function framesToPattern(frameStates: FrameNotes[], instruments: InstrumentConfig[], numCh: number): { pattern: Pattern; step: number } {
  const onsets = sapOnsets(frameStates, numCh);
  const step = mainStepFromOnsets(onsets.map((o) => o.map((x) => x.tick)));
  const clock = makeRowClock([{ tick: 0, speed: step }]);
  const rows = Math.max(1, clock.rowsForTicks(frameStates.length));

  const channels: ChannelData[] = Array.from({ length: numCh }, (_, i): ChannelData => ({
    id: `ch${i}`, name: instruments[i]?.name || `POKEY ${i + 1}`,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: null, color: null,
    rows: Array.from({ length: rows }, emptyCell),
  }));

  const place = makeOnsetPlacer(clock);
  onsets.forEach((list, ch) => {
    for (const o of list) {
      const pl = place(ch, o.tick);
      const cell = channels[ch].rows[pl.row];
      const instrument = o.note === 97 ? 0 : ch + 1;
      if (pl.col === 0) {
        cell.note = o.note;
        cell.instrument = instrument;
        if (pl.offset > 0) { cell.effTyp = BD_FX.rowOffset; cell.eff = pl.offset; }
      } else {
        setNoteColumn(cell, pl.col, o.note, instrument, pl.offset);
      }
    }
    channels[ch].channelMeta = { importedFromMOD: false, effectCols: 2, noteCols: place.columnsOf(ch), noteColDelay: true };
  });

  return { pattern: { id: 'p0', name: 'Pattern 1', length: rows, channels }, step };
}

export function isSAPFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 3 && b[0] === 0x53 && b[1] === 0x41 && b[2] === 0x50;
}

export async function parseSAPFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isSAPFormat(buffer)) throw new Error('Not a valid SAP file');
  const buf = new Uint8Array(buffer);
  const meta = parseSAPHeader(buf);

  const numCh = meta.stereo ? 8 : 4;

  const instruments: InstrumentConfig[] = Array.from({ length: numCh }, (_, i) => ({
    id: i + 1,
    name: `POKEY ${i + 1}`,
    type: 'synth' as const,
    synthType: 'AsapSynth' as const,
    furnace: { ...DEFAULT_FURNACE, chipType: 20, ops: 2 },
    effects: [] as [],
    volume: 0,
    pan: 0,
  }));

  let pattern: Pattern;
  let step = 1;
  if (meta.dataOffset > 0 && meta.initAddr > 0 && meta.playerAddr > 0) {
    try {
      const frameStates = runSAPEmulation(buf, meta, numCh);
      const built = frameStates.length > 0 ? framesToPattern(frameStates, instruments, numCh) : null;
      if (built) step = built.step;
      pattern = built ? built.pattern : {
            id: 'p0', name: 'Pattern 1', length: 16,
            channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
              id: `ch${i}`, name: `POKEY ${i + 1}`,
              muted: false, solo: false, collapsed: false,
              volume: 100, pan: 0, instrumentId: null, color: null,
              rows: Array.from({ length: 16 }, emptyCell),
            })),
          };
    } catch {
      pattern = {
        id: 'p0', name: 'Pattern 1', length: 16,
        channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
          id: `ch${i}`, name: `POKEY ${i + 1}`,
          muted: false, solo: false, collapsed: false,
          volume: 100, pan: 0, instrumentId: null, color: null,
          rows: Array.from({ length: 16 }, emptyCell),
        })),
      };
    }
  } else {
    pattern = {
      id: 'p0', name: 'Pattern 1', length: 16,
      channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
        id: `ch${i}`, name: `POKEY ${i + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length: 16 }, emptyCell),
      })),
    };
  }

  return {
    name: (meta.name || filename.replace(/\.sap$/i, '')) + (meta.author ? ` — ${meta.author}` : ''),
    format: 'ASAP' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: meta.songs,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: step,
    initialBPM: 125,
    asapFileData: buffer.slice(0),
    asapFilename: filename,
  };
}
