/**
 * UADEFormatDebug.test.ts — Comprehensive debug dump for UADE / Amiga music formats
 *
 * Loads reference music files, runs the appropriate native parser, and prints
 * a full debug report to stdout for every instrument and song structure found.
 *
 * Output includes:
 *   - JSON instrument config dump
 *   - Decoded command tables (voltbl / wftbl / vseq / fseq / macros)
 *   - ASCII waveform visualizer
 *   - Hex dump of raw binary fields
 *   - All synth-writing-relevant parameters per format
 *
 * Usage:
 *   npx vitest run src/lib/import/__tests__/UADEFormatDebug.test.ts
 *
 * To test a specific format or file, set env vars:
 *   UADE_FORMAT=hipc   — only test files with this extension
 *   UADE_FILE=myfile   — only test files containing this substring in their name
 *   UADE_MAX=5         — limit to N files per format group (default 1)
 *   UADE_VERBOSE=1     — enable verbose hex dumps and extra output
 */

import { describe, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';

// ── Parser imports ────────────────────────────────────────────────────────────
import { isHippelCoSoFormat, parseHippelCoSoFile } from '../formats/HippelCoSoParser';
import { isRobHubbardFormat, parseRobHubbardFile } from '../formats/RobHubbardParser';
import { isTFMXFile, parseTFMXFile } from '../formats/TFMXParser';
import { isSoundMonFormat, parseSoundMonFile } from '../formats/SoundMonParser';
import { isSidMon1Format, parseSidMon1File } from '../formats/SidMon1Parser';
import { isSidMon2Format, parseSidMon2File } from '../formats/SidMon2Parser';
import { isDigitalMugicianFormat, parseDigitalMugicianFile } from '../formats/DigitalMugicianParser';
import { parseFCFile } from '../formats/FCParser';
import { isFredEditorFormat, parseFredEditorFile } from '../formats/FredEditorParser';
import { isJamCrackerFormat, parseJamCrackerFile } from '../formats/JamCrackerParser';
import { isSoundFXFormat, parseSoundFXFile } from '../formats/SoundFXParser';
import { parseMEDFile } from '../formats/MEDParser';

// ── Types ─────────────────────────────────────────────────────────────────────
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type {
  InstrumentConfig,
  HippelCoSoConfig,
  OctaMEDConfig,
  SoundMonConfig,
  SidMonConfig,
  DigMugConfig,
  FCConfig,
  FredConfig,
  TFMXConfig,
  RobHubbardConfig,
  SidMon1Config,
} from '@/types/instrument';

// ── Config from env vars ──────────────────────────────────────────────────────
const ENV_FORMAT  = process.env.UADE_FORMAT?.toLowerCase();
const ENV_FILE    = process.env.UADE_FILE?.toLowerCase();
const ENV_MAX     = parseInt(process.env.UADE_MAX ?? '1', 10);
const VERBOSE     = process.env.UADE_VERBOSE === '1';

const REFERENCE_DIR = join(process.cwd(), 'Reference Music');

// ── Debug helpers ─────────────────────────────────────────────────────────────

/** Render a waveform as an ASCII sparkline (default 64 chars wide) */
function waveformAscii(data: Int8Array | number[], width = 64): string {
  const BLOCKS = ' ▁▂▃▄▅▆▇█';
  const len = data.length;
  if (len === 0) return '(empty)';
  const step = Math.max(1, Math.floor(len / width));
  let out = '';
  for (let i = 0; i < Math.min(width, len); i++) {
    const s = Math.min(Math.max(Number(data[i * step] ?? 0), -128), 127);
    // Map -128..127 → 0..8
    const idx = Math.floor(((s + 128) / 256) * 8);
    out += BLOCKS[Math.max(0, Math.min(8, idx))];
  }
  return out;
}

/** Hex dump: N bytes formatted as 00 11 22 ... (with optional ASCII column) */
function hexDump(data: Uint8Array | number[], maxBytes = 32): string {
  const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
  const slice = arr.slice(0, maxBytes);
  const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const more = arr.length > maxBytes ? ` … (+${arr.length - maxBytes} more)` : '';
  return hex + more;
}

/**
 * Decode an OctaMED-style vol/wf command table into human-readable lines.
 * Stops at FF (END) or after 128 bytes.
 */
function decodeCommandTable(data: Uint8Array, tableType: 'vol' | 'wf'): string[] {
  const lines: string[] = [];
  const VOL_CMDS: Record<number, string> = {
    0x0: 'SET_SPEED', 0x1: 'WAIT', 0x2: 'SLIDE_DOWN', 0x3: 'SLIDE_UP',
    0x4: 'SET_ENV_WF', 0xA: 'JWS', 0xE: 'JMP', 0xF: 'END',
  };
  const WF_CMDS: Record<number, string> = {
    0x0: 'SET_SPEED', 0x1: 'WAIT', 0x2: 'SLIDE_DOWN', 0x3: 'SLIDE_UP',
    0x4: 'SET_VIB_DEPTH', 0x5: 'SET_VIB_SPEED', 0x7: 'SET_VIB_WF',
    0xA: 'JVS', 0xC: 'SET_ARP_BEGIN', 0xE: 'JMP', 0xF: 'END',
  };
  const cmds = tableType === 'vol' ? VOL_CMDS : WF_CMDS;

  let i = 0;
  while (i < Math.min(data.length, 128)) {
    const b = data[i];
    if (b < 0x80) {
      const label = tableType === 'vol' ? `VOL=${b}` : `WF_IDX=${b}`;
      lines.push(`[${i.toString().padStart(3)}] ${label}`);
      i++;
    } else {
      const nibble = b & 0x0F;
      const arg = data[i + 1] ?? 0;
      const name = cmds[nibble] ?? `CMD_${nibble.toString(16).toUpperCase()}`;
      lines.push(`[${i.toString().padStart(3)}] ${name}(${arg})`);
      if (nibble === 0xF) { lines.push(`[${i.toString().padStart(3)}] → loop/end`); break; }
      i += 2;
    }
  }
  return lines;
}

/** Decode a HippelCoSo-style vseq / fseq byte array */
function decodeCoSeq(data: number[]): string {
  return data.slice(0, 64).map((v, i) => {
    const s = `${i}:${v > 0 ? '+' : ''}${v}`;
    return s;
  }).join(' ');
}

/**
 * Decode a TFMX SndModSeq / VolModSeq blob.
 * Format: entries of variable length — a pair (cmd, args...) where the
 * structure is packed. For debug purposes we show raw 4-byte groups.
 * Stops at FF FF FF FF (null terminator) or data end.
 */
function decodeTFMXSeq(data: Uint8Array, maxEntries = 16): string[] {
  const lines: string[] = [];
  // Each entry is 4 bytes: [cmd, note/param1, param2, param3]
  const count = Math.min(Math.floor(data.length / 4), maxEntries);
  for (let i = 0; i < count; i++) {
    const off = i * 4;
    const cmd = data[off];
    const a   = data[off + 1];
    const b   = data[off + 2];
    const c   = data[off + 3];
    // FF FF FF FF = end of sequence
    if (cmd === 0xFF && a === 0xFF && b === 0xFF && c === 0xFF) break;
    let desc: string;
    if (cmd >= 0xF0) {
      // TFMX macro commands (0xF0=end, 0xF1=loop, 0xF2=addbegin, etc.)
      const MACRO_CMDS: Record<number, string> = {
        0xF0: 'END', 0xF1: 'LOOP_BEGIN', 0xF2: 'ADDBEGIN', 0xF3: 'ADDEND',
        0xF4: 'WAIT', 0xF5: 'JVIB', 0xF6: 'CONTSEQ', 0xF7: 'PLAY_SEQ',
        0xF8: 'VOLUME', 0xF9: 'ENVELOPE', 0xFA: 'PORTAMENTO', 0xFB: 'VIBRATO',
        0xFC: 'KEYON', 0xFD: 'KEYOFF', 0xFE: 'JUMP', 0xFF: 'NOP',
      };
      desc = `${MACRO_CMDS[cmd] ?? `CMD_${cmd.toString(16).toUpperCase()}`}(${a},${b},${c})`;
    } else {
      desc = `smp=0x${cmd.toString(16).padStart(2,'0')}  note=${a}  vol=${b}  dur=${c}`;
    }
    lines.push(`[${i}] ${desc}`);
  }
  return lines.length ? lines : ['(empty)'];
}

/** Print a separator line */
function sep(label: string) {
  const bar = '─'.repeat(Math.max(0, 70 - label.length - 2));
  console.log(`\n── ${label} ${bar}`);
}

/** Print instrument details for one InstrumentConfig */
function printInstrument(ic: InstrumentConfig, index: number) {
  console.log(`\n  [Instr ${index}] "${ic.name}" synthType=${ic.synthType}`);

  // ── OctaMEDSynth ─────────────────────────────────────────────────────────
  if (ic.synthType === 'OctaMEDSynth' && ic.octamed) {
    const c = ic.octamed as OctaMEDConfig;
    console.log(`    volume=${c.volume}  vibratoSpeed=${c.vibratoSpeed}  voltblSpeed=${c.voltblSpeed}  wfSpeed=${c.wfSpeed}`);
    console.log(`    loopStart=${c.loopStart}  loopLen=${c.loopLen}`);
    console.log(`    waveforms: ${c.waveforms.length}`);
    for (let w = 0; w < c.waveforms.length; w++) {
      console.log(`      wf[${w}]: ${waveformAscii(c.waveforms[w])}`);
      if (VERBOSE) console.log(`        hex: ${hexDump(new Uint8Array(c.waveforms[w].buffer), 32)}`);
    }
    console.log(`    voltbl decoded:`);
    decodeCommandTable(c.voltbl, 'vol').slice(0, 24).forEach(l => console.log(`      ${l}`));
    console.log(`    wftbl decoded:`);
    decodeCommandTable(c.wftbl, 'wf').slice(0, 24).forEach(l => console.log(`      ${l}`));
    if (VERBOSE) {
      console.log(`    voltbl hex: ${hexDump(c.voltbl)}`);
      console.log(`    wftbl  hex: ${hexDump(c.wftbl)}`);
    }
  }

  // ── HippelCoSoSynth ───────────────────────────────────────────────────────
  else if (ic.synthType === 'HippelCoSoSynth' && ic.hippelCoso) {
    const c = ic.hippelCoso as HippelCoSoConfig;
    console.log(`    volSpeed=${c.volSpeed}  vibSpeed=${c.vibSpeed}  vibDepth=${c.vibDepth}  vibDelay=${c.vibDelay}`);
    if (c.vseq?.length) {
      console.log(`    vseq(${c.vseq.length}): ${decodeCoSeq(c.vseq)}`);
      if (VERBOSE) console.log(`    vseq hex: ${hexDump(new Uint8Array(c.vseq.map(v => v & 0xFF)))}`);
    }
    if (c.fseq?.length) {
      console.log(`    fseq(${c.fseq.length}): ${decodeCoSeq(c.fseq)}`);
      if (VERBOSE) console.log(`    fseq hex: ${hexDump(new Uint8Array(c.fseq.map(v => v & 0xFF)))}`);
    }
  }

  // ── SoundMonSynth ─────────────────────────────────────────────────────────
  //   SoundMon II / Brian Postma: wavetable + ADSR + arpeggio + vibrato
  //   Key synthesis data: waveType selects from 16 built-in oscillator shapes;
  //   waveSpeed controls morph rate; ADSR drives amplitude; arpTable gives
  //   pitch sequence; portamento glides period toward target each tick.
  else if (ic.synthType === 'SoundMonSynth' && ic.soundMon) {
    const c = ic.soundMon as SoundMonConfig;
    console.log(`    type=${c.type}  waveType=${c.waveType}  waveSpeed=${c.waveSpeed}`);
    console.log(`    ADSR: atk(vol=${c.attackVolume} spd=${c.attackSpeed})` +
                ` dec(vol=${c.decayVolume} spd=${c.decaySpeed})` +
                ` sus(vol=${c.sustainVolume} len=${c.sustainLength})` +
                ` rel(vol=${c.releaseVolume} spd=${c.releaseSpeed})`);
    console.log(`    vib: delay=${c.vibratoDelay}  spd=${c.vibratoSpeed}  depth=${c.vibratoDepth}  portamento=${c.portamentoSpeed}`);
    console.log(`    arp(speed=${c.arpSpeed}): [${c.arpTable.join(', ')}]`);
    if (c.type === 'pcm' && c.pcmData) {
      const v8 = new Int8Array(c.pcmData.buffer, c.pcmData.byteOffset, c.pcmData.byteLength);
      console.log(`    pcm: ${c.pcmData.length}b  loop=${c.loopStart ?? 0}+${c.loopLength ?? 0}` +
                  `  fine=${c.finetune ?? 0}  vol=${c.volume ?? 64}  xpose=${c.transpose ?? 0}`);
      console.log(`    waveform: ${waveformAscii(v8)}`);
      if (VERBOSE) console.log(`    pcm hex: ${hexDump(c.pcmData)}`);
    }
  }

  // ── SidMonSynth ───────────────────────────────────────────────────────────
  //   SidMon II: 4 waveforms (triangle/saw/pulse/noise) + SID-style ADSR (4-bit)
  //   + 8-step arpeggio + resonant filter (LP/HP/BP) + vibrato.
  //   Key synthesis data: all ADSR values are 4-bit (0-15 SID encoding);
  //   filterCutoff 0-255 → frequency; pulseWidth 0-255 → duty cycle.
  else if (ic.synthType === 'SidMonSynth' && ic.sidMon) {
    const c = ic.sidMon as SidMonConfig;
    const WF_NAMES = ['triangle', 'sawtooth', 'pulse', 'noise'];
    const FILTER_MODES = ['LP', 'HP', 'BP'];
    console.log(`    type=${c.type}  waveform=${WF_NAMES[c.waveform] ?? c.waveform}(${c.waveform})  pulseWidth=${c.pulseWidth}`);
    console.log(`    ADSR(4-bit): atk=${c.attack}  dec=${c.decay}  sus=${c.sustain}  rel=${c.release}`);
    console.log(`    filter: cutoff=${c.filterCutoff}  resonance=${c.filterResonance}  mode=${FILTER_MODES[c.filterMode] ?? c.filterMode}`);
    console.log(`    vib: delay=${c.vibDelay}  spd=${c.vibSpeed}  depth=${c.vibDepth}`);
    console.log(`    arp(speed=${c.arpSpeed}): [${c.arpTable.join(', ')}]`);
    if (c.type === 'pcm' && c.pcmData) {
      const v8 = new Int8Array(c.pcmData.buffer, c.pcmData.byteOffset, c.pcmData.byteLength);
      console.log(`    pcm: ${c.pcmData.length}b  loop=${c.loopStart ?? 0}+${c.loopLength ?? 0}  fine=${c.finetune ?? 0}`);
      console.log(`    waveform: ${waveformAscii(v8)}`);
    }
  }

  // ── DigMugSynth ───────────────────────────────────────────────────────────
  //   Digital Mugician V1/V2: 4-waveform blend table (indices into 15 built-in
  //   waveforms), morphing controlled by waveBlend position + waveSpeed rate.
  //   Optional embedded waveformData (128 signed bytes) for custom waveform.
  //   Key synthesis data: wavetable[4] indices select which 4 shapes to blend;
  //   blend position cycles through them; vibrato uses separate period LFO.
  else if (ic.synthType === 'DigMugSynth' && ic.digMug) {
    const c = ic.digMug as DigMugConfig;
    console.log(`    wavetable: [${c.wavetable.join(', ')}]  blend=${c.waveBlend}  speed=${c.waveSpeed}  vol=${c.volume}`);
    console.log(`    vib: spd=${c.vibSpeed}  depth=${c.vibDepth}`);
    console.log(`    arp(speed=${c.arpSpeed}): [${c.arpTable.join(', ')}]`);
    if (c.waveformData) {
      const v8 = new Int8Array(c.waveformData.buffer, c.waveformData.byteOffset, c.waveformData.byteLength);
      console.log(`    waveformData(${c.waveformData.length}b): ${waveformAscii(v8)}`);
      if (VERBOSE) console.log(`    waveformData hex: ${hexDump(c.waveformData)}`);
    }
    if (c.pcmData) {
      const v8 = new Int8Array(c.pcmData.buffer, c.pcmData.byteOffset, c.pcmData.byteLength);
      console.log(`    pcm(V2): ${c.pcmData.length}b  loop=${c.loopStart ?? 0}+${c.loopLength ?? 0}`);
      console.log(`    pcm waveform: ${waveformAscii(v8)}`);
    }
  }

  // ── FCSynth ───────────────────────────────────────────────────────────────
  //   Future Composer 1.3/1.4: 47 built-in waveforms (0=saw, 1=sq, 2=tri,
  //   3=noise, 4-46=composite), 16-step synth macro sequencer (each step
  //   selects waveform + transposition + effect), ADSR amplitude envelope,
  //   vibrato, and 16-step pitch arpeggio.
  //   Key synthesis data: synthTable drives the oscillator waveform sequence;
  //   ADSR is in ticks not rates; atkVolume/decVolume are absolute not deltas.
  else if (ic.synthType === 'FCSynth' && ic.fc) {
    const c = ic.fc as FCConfig;
    console.log(`    waveNumber=${c.waveNumber}  synthSpeed=${c.synthSpeed}`);
    console.log(`    ADSR: atk(len=${c.atkLength} vol=${c.atkVolume})` +
                ` dec(len=${c.decLength} vol=${c.decVolume})` +
                ` sus(vol=${c.sustVolume})` +
                ` rel(len=${c.relLength})`);
    console.log(`    vib: delay=${c.vibDelay}  spd=${c.vibSpeed}  depth=${c.vibDepth}`);
    console.log(`    arp: [${c.arpTable.join(', ')}]`);
    // Synth macro table — only print non-trivial entries
    const nonTrivial = c.synthTable.filter(st => st.waveNum !== 0 || st.transposition !== 0 || st.effect !== 0);
    if (nonTrivial.length > 0) {
      console.log(`    synthTable(${c.synthTable.length} steps, speed=${c.synthSpeed}):`);
      c.synthTable.forEach((st, s) => {
        if (st.waveNum !== 0 || st.transposition !== 0 || st.effect !== 0) {
          console.log(`      [${s.toString().padStart(2)}] wave=${st.waveNum.toString().padStart(2)}  xpose=${(st.transposition >= 0 ? '+' : '') + st.transposition}  fx=${st.effect}`);
        }
      });
    } else {
      console.log(`    synthTable: all steps are wave=0 xpose=0 fx=0`);
    }
  }

  // ── FredSynth ─────────────────────────────────────────────────────────────
  //   Fred Editor type-1 (PWM synthesis): square wave with oscillating pulse
  //   width. PWM bounces between pulsePosL and pulsePosH at pulseSpeed rate
  //   using pulseRateNeg/Pos step sizes. Envelope is multi-segment (envVol →
  //   attackVol → decayVol → hold sustainTime → release to releaseVol).
  //   relative is a period multiplier / 1024 (1024 = A440, lower = higher pitch).
  else if (ic.synthType === 'FredSynth' && ic.fred) {
    const c = ic.fred as FredConfig;
    console.log(`    ADSR: env=${c.envelopeVol}` +
                `  atk(spd=${c.attackSpeed} vol=${c.attackVol})` +
                `  dec(spd=${c.decaySpeed} vol=${c.decayVol} sus=${c.sustainTime})` +
                `  rel(spd=${c.releaseSpeed} vol=${c.releaseVol})`);
    console.log(`    vib: delay=${c.vibratoDelay}  spd=${c.vibratoSpeed}  depth=${c.vibratoDepth}`);
    console.log(`    arp(lim=${c.arpeggioLimit} spd=${c.arpeggioSpeed}): [${c.arpeggio.join(', ')}]`);
    console.log(`    PWM: rateNeg=${c.pulseRateNeg}  ratePos=${c.pulseRatePos}  speed=${c.pulseSpeed}  posL=${c.pulsePosL}  posH=${c.pulsePosH}  delay=${c.pulseDelay}`);
    console.log(`    relative=${c.relative}  (period mult/1024; 1024=no shift, 512=+1oct, 2048=-1oct)`);
  }

  // ── TFMXSynth ─────────────────────────────────────────────────────────────
  //   TFMX (Jochen Hippel): SndModSeq (note trigger/sample/effects macro) +
  //   VolModSeq (volume modulation macro), each 64-byte packed command stream.
  //   The WASM synth executes these macros per-note to drive sample playback
  //   with envelopes, vibrato, portamento, and arpeggio.
  //   Key synthesis data: volModSeqData contains per-instrument volume envelope;
  //   sndModSeqData contains note/sample/effect sequences shared across instruments.
  else if (ic.synthType === 'TFMXSynth' && ic.tfmx) {
    const c = ic.tfmx as TFMXConfig;
    console.log(`    sndSeqsCount=${c.sndSeqsCount}  sampleCount=${c.sampleCount}`);
    console.log(`    volModSeqData(${c.volModSeqData.length}b):`);
    decodeTFMXSeq(c.volModSeqData).forEach(l => console.log(`      ${l}`));
    if (VERBOSE) console.log(`    volModSeq hex: ${hexDump(c.volModSeqData)}`);
    if (c.sndModSeqData.length >= 64) {
      console.log(`    sndModSeqData[0] of ${c.sndSeqsCount} sequences:`);
      decodeTFMXSeq(c.sndModSeqData.slice(0, 64)).forEach(l => console.log(`      ${l}`));
      if (VERBOSE && c.sndModSeqData.length >= 128) {
        console.log(`    sndModSeqData[1]:`);
        decodeTFMXSeq(c.sndModSeqData.slice(64, 128)).forEach(l => console.log(`      ${l}`));
      }
    }
    if (c.sampleCount > 0) {
      const perHeader = c.sampleCount > 0 ? Math.floor(c.sampleHeaders.length / c.sampleCount) : 0;
      console.log(`    sampleData=${c.sampleData.length}b  headers=${c.sampleHeaders.length}b (${c.sampleCount} × ${perHeader}b each)`);
      if (VERBOSE) console.log(`    sampleHeaders hex: ${hexDump(c.sampleHeaders, 60)}`);
    }
  }

  // ── RobHubbardSynth ───────────────────────────────────────────────────────
  //   Rob Hubbard's Amiga system: PCM sample playback + per-instrument relative
  //   tuning (period = relative * base_period) + vibrato from shared vibTable
  //   (indexed per-instrument, divided by divider for depth control) + wobble
  //   (bounces sample pointer between loPos and hiPos each tick, setting bytes
  //   to 60 to create AM-style waveform morphing).
  //   Key synthesis data: sampleData is the PCM waveform (signed int8);
  //   vibTable is the shared vibrato shape (usually a sine wave);
  //   hiPos/loPos define wobble range within the sample.
  else if (ic.synthType === 'RobHubbardSynth' && ic.robHubbard) {
    const c = ic.robHubbard as RobHubbardConfig;
    console.log(`    sampleLen=${c.sampleLen}  loopOffset=${c.loopOffset}  vol=${c.sampleVolume}  relative=${c.relative}`);
    console.log(`    vib: divider=${c.divider}  startIdx=${c.vibratoIdx}  vibTable(${c.vibTable.length}): [${c.vibTable.slice(0, 16).map(v => v.toString().padStart(4)).join(',')}${c.vibTable.length > 16 ? '...' : ''}]`);
    console.log(`    wobble: hiPos=${c.hiPos}  loPos=${c.loPos}`);
    if (c.sampleData.length > 0) {
      const v8 = Int8Array.from(c.sampleData);
      console.log(`    sampleData(${c.sampleData.length}b): ${waveformAscii(v8)}`);
      if (VERBOSE) console.log(`    sampleData hex: ${hexDump(new Uint8Array(v8.buffer))}`);
    }
    if (c.vibTable.length > 0 && VERBOSE) {
      const vt = new Uint8Array(Int8Array.from(c.vibTable).buffer);
      console.log(`    vibTable hex: ${hexDump(vt)}`);
    }
  }

  // ── SidMon1Synth ──────────────────────────────────────────────────────────
  //   SidMon 1.0: 32-byte mainWave PCM wavetable (looped at Amiga period) +
  //   optional 32-byte phaseWave (used as period LFO when phaseShift != 0) +
  //   16-step arpeggio (period table offsets, 0-255) + ADSR envelope (speed=
  //   ticks per volume step, max/min = target volumes) + finetune (raw period
  //   delta: finetune_0_15 * 67) + pitchFall (signed period delta/tick).
  //   Key synthesis data: mainWave is the audio waveform (like a 32-byte
  //   custom wavetable); phaseWave adds LFO wobble to the period each tick.
  else if (ic.synthType === 'SidMon1Synth' && ic.sidmon1) {
    const c = ic.sidmon1 as SidMon1Config;
    console.log(`    ADSR: atk(spd=${c.attackSpeed ?? 0} max=${c.attackMax ?? 64})` +
                `  dec(spd=${c.decaySpeed ?? 0} min=${c.decayMin ?? 0})` +
                `  sus=${c.sustain ?? 0}` +
                `  rel(spd=${c.releaseSpeed ?? 0} min=${c.releaseMin ?? 0})`);
    console.log(`    phase: shift=${c.phaseShift ?? 0}  speed=${c.phaseSpeed ?? 0}  finetune=${c.finetune ?? 0}  pitchFall=${c.pitchFall ?? 0}`);
    if (c.arpeggio?.length) {
      console.log(`    arp: [${c.arpeggio.join(', ')}]`);
    }
    if (c.mainWave?.length) {
      console.log(`    mainWave(${c.mainWave.length}b): ${waveformAscii(c.mainWave, 32)}`);
      if (VERBOSE) console.log(`    mainWave hex: ${hexDump(new Uint8Array(Int8Array.from(c.mainWave).buffer))}`);
    }
    if (c.phaseWave?.length && c.phaseWave.some(v => v !== 0)) {
      console.log(`    phaseWave(${c.phaseWave.length}b): ${waveformAscii(c.phaseWave, 32)}`);
      if (VERBOSE) console.log(`    phaseWave hex: ${hexDump(new Uint8Array(Int8Array.from(c.phaseWave).buffer))}`);
    }
  }

  // ── Sampler ───────────────────────────────────────────────────────────────
  else if (ic.synthType === 'Sampler' && ic.sample) {
    const s = ic.sample;
    const len = s.audioBuffer ? `${s.audioBuffer.byteLength}smp` : `${s.url ?? '?'}`;
    console.log(`    sampler: ${len}  loopStart=${s.loopStart ?? 0}  loopEnd=${s.loopEnd ?? 0}`);
    if (s.audioBuffer && s.audioBuffer.byteLength > 0) {
      const abuf = new Uint8Array(s.audioBuffer);
      const view = new Int8Array(abuf.length);
      for (let k = 0; k < view.length; k++) view[k] = (abuf[k] * 127) | 0;
      console.log(`    waveform: ${waveformAscii(view)}`);
    }
  }

  // ── Anything else: compact JSON of config fields ───────────────────────────
  else {
    const known = [
      'soundMon', 'sidMon', 'digMug', 'fc', 'fred', 'tfmx',
      'hippelCoso', 'robHubbard', 'sidmon1', 'octamed', 'hively', 'uade',
    ] as const;
    for (const key of known) {
      if ((ic as unknown as Record<string, unknown>)[key]) {
        const val = (ic as unknown as Record<string, unknown>)[key];
        const short = JSON.stringify(val, (_k, v) => {
          // Truncate large arrays in JSON output
          if (Array.isArray(v) && v.length > 16) return `[…${v.length} entries]`;
          if (v instanceof Uint8Array) return `Uint8Array(${v.length})`;
          if (v instanceof Int8Array)  return `Int8Array(${v.length})`;
          return v;
        }, 2);
        console.log(`    ${key}: ${short.slice(0, 600)}`);
        break;
      }
    }
  }
}

/** Print a full TrackerSong summary */
function printSong(song: TrackerSong, filename: string) {
  sep(filename);
  console.log(`  format=${song.format}  channels=${song.numChannels}  bpm=${song.initialBPM}  speed=${song.initialSpeed}`);
  console.log(`  patterns=${song.patterns.length}  instruments=${song.instruments.length}  songLen=${song.songLength}`);
  if (song.name) console.log(`  name="${song.name}"`);

  for (let i = 0; i < song.instruments.length; i++) {
    printInstrument(song.instruments[i], i + 1);
  }

  if (VERBOSE && song.patterns.length > 0) {
    const p = song.patterns[0];
    console.log(`\n  Pattern 0: rows=${p.length}  channels=${p.channels.length}`);
    const rows = Math.min(p.length, 8);
    for (let r = 0; r < rows; r++) {
      const row = p.channels.map(ch => {
        const cell = ch.rows[r];
        if (!cell || (!cell.note && !cell.instrument)) return '--- --';
        return `${cell.note.toString().padStart(3)} ${cell.instrument.toString().padStart(2)}`;
      }).join(' | ');
      console.log(`    r${r.toString().padStart(2)}: ${row}`);
    }
  }
}

// ── File discovery ─────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  name: string;
  ext: string;
}

function walkDir(dir: string, result: FileEntry[] = []): FileEntry[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return result; }
  for (const e of entries) {
    const full = join(dir, e);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walkDir(full, result);
      else {
        const ext = extname(e).slice(1).toLowerCase();
        if (ext) result.push({ path: full, name: e, ext });
      }
    } catch { /* skip */ }
  }
  return result;
}

function readBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// ── Format groups ─────────────────────────────────────────────────────────────

/** Each entry: display name, file extensions, optional detector fn, parser fn */
interface FormatGroup {
  name: string;
  exts: string[];
  detect?: (buf: ArrayBuffer) => boolean;
  parse: (buf: ArrayBuffer, filename: string) => Promise<TrackerSong> | TrackerSong;
}

const FORMAT_GROUPS: FormatGroup[] = [
  {
    name: 'Hippel CoSo',
    exts: ['hipc', 'soc', 'sog', 'hst'],
    detect: isHippelCoSoFormat,
    parse: (buf, name) => parseHippelCoSoFile(buf, name),
  },
  {
    name: 'Rob Hubbard / Hippel',
    exts: ['hip', 'hip7'],
    detect: isRobHubbardFormat,
    parse: (buf, name) => parseRobHubbardFile(buf, name),
  },
  {
    name: 'TFMX',
    exts: ['tfmx', 'mdat'],
    detect: isTFMXFile,
    parse: (buf, name) => parseTFMXFile(buf, name),
  },
  {
    name: 'SoundMon',
    exts: ['bp', 'bp3', 'soundmon'],
    detect: isSoundMonFormat,
    parse: (buf, name) => parseSoundMonFile(buf, name),
  },
  {
    name: 'SidMon 1',
    exts: ['sid1'],
    detect: isSidMon1Format,
    parse: (buf, name) => parseSidMon1File(buf, name),
  },
  {
    name: 'SidMon 2',
    exts: ['sid', 'sm'],
    detect: isSidMon2Format,
    parse: (buf, name) => parseSidMon2File(buf, name),
  },
  {
    name: 'Digital Mugician',
    exts: ['dm', 'dm2'],
    detect: isDigitalMugicianFormat,
    parse: (buf, name) => parseDigitalMugicianFile(buf, name),
  },
  {
    name: 'Future Composer',
    exts: ['fc', 'fc13', 'fc14'],
    parse: (buf, name) => parseFCFile(buf, name),
  },
  {
    name: 'Fred Editor',
    exts: ['fred'],
    detect: isFredEditorFormat,
    parse: (buf, name) => parseFredEditorFile(buf, name),
  },
  {
    name: 'JamCracker',
    exts: ['jam', 'jc'],
    detect: isJamCrackerFormat,
    parse: (buf, name) => parseJamCrackerFile(buf, name),
  },
  {
    name: 'SoundFX',
    exts: ['sfx', 'sfx13'],
    detect: isSoundFXFormat,
    parse: (buf, name) => parseSoundFXFile(buf, name),
  },
  {
    name: 'OctaMED / MED',
    exts: ['med', 'mmd0', 'mmd1', 'mmd2', 'mmd3'],
    parse: (buf, name) => parseMEDFile(buf, name),
  },
];

// ── Main test ─────────────────────────────────────────────────────────────────

describe('UADE Format Debug', () => {
  const allFiles = walkDir(REFERENCE_DIR);

  if (allFiles.length === 0) {
    it('no reference files found — put files in Reference Music/', () => {
      console.log(`Reference Music directory not found or empty: ${REFERENCE_DIR}`);
      console.log('Download sample files from ftp.modland.com and place them under Reference Music/<FormatName>/');
      console.log('');
      console.log('Expected subdirectories:');
      FORMAT_GROUPS.forEach(g => {
        console.log(`  Reference Music/${g.name}/  [${g.exts.join(', ')}]`);
      });
    });
    return;
  }

  for (const group of FORMAT_GROUPS) {
    if (ENV_FORMAT && !group.exts.includes(ENV_FORMAT) && !group.name.toLowerCase().includes(ENV_FORMAT)) {
      continue;
    }

    // Find matching files for this format group
    const candidates = allFiles.filter(f => {
      if (!group.exts.includes(f.ext)) return false;
      if (ENV_FILE && !f.name.toLowerCase().includes(ENV_FILE)) return false;
      return true;
    });

    if (candidates.length === 0) continue;

    const limit = isNaN(ENV_MAX) ? 1 : Math.max(1, ENV_MAX);
    const toTest = candidates.slice(0, limit);

    describe(group.name, () => {
      for (const file of toTest) {
        it(`${file.name}`, async () => {
          const buf = readBuf(file.path);

          // Run detector if available
          if (group.detect) {
            const detected = group.detect(buf);
            console.log(`  detect(${file.name}) = ${detected}`);
            // Don't hard-fail on detection miss — still try parsing for debug output
          }

          let song: TrackerSong;
          try {
            song = await group.parse(buf, file.name);
          } catch (err) {
            console.error(`  PARSE ERROR: ${err}`);
            // Print hex header of the file to help diagnose
            console.log(`  file header hex: ${hexDump(new Uint8Array(buf, 0, 32))}`);
            throw err;
          }

          printSong(song, basename(file.path));

          // Basic sanity assertions
          if (song.instruments.length > 0) {
            const first = song.instruments[0];
            console.log(`\n  ✓ ${song.instruments.length} instruments, first="${first.name}" type=${first.synthType}`);
          }
          if (song.patterns.length > 0) {
            console.log(`  ✓ ${song.patterns.length} patterns`);
          }
        });
      }
    });
  }
});
