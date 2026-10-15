/**
 * Klystrack instrument program instructions: the 63-row table of klystrack's command.c (word, mask, name,
 * mnemonic, argument range), with full English names, and the original program view's description of a step.
 *
 * A program word is 16 bits. Bit 15 is the "chain" flag (run the next step in the same tick, music.c), except in
 * the 0xFxxx group (end, nop, goto, begin, loop) where bit 15 is part of the instruction. The
 *  table is ported from klystrack's src/command.c instruction_desc[], the words from music.h (MUS_FX_*).
 */

export interface KlysProgramCommand {
  /** Instruction word with the argument bits zero. */
  word: number;
  /** Bits that identify the instruction; the rest is the argument. */
  mask: number;
  name: string;
  /** Short code as the original program view prints it. */
  mnemonic: string;
  min: number;
  max: number;
}

/** The argument bits of an instruction: everything the mask leaves free, without the chain flag unless bit 15 is part of the mask. */
const argMaskOf = (mask: number): number => ~mask & ((mask & 0x8000) !== 0 ? 0xFFFF : 0x7FFF);

const c = (word: number, mask: number, mnemonic: string, name: string, min = 0, max = argMaskOf(mask)): KlysProgramCommand =>
  ({ word, mask, name, mnemonic, min, max });

/** command.c instruction_desc[] in the original's order; first match wins. Without a range the argument is the whole mask remainder. */
export const KLYS_PROGRAM_COMMANDS: readonly KlysProgramCommand[] = [
  c(0xFFFF, 0xFFFF, 'PrgEnd', 'Program End', 0, 0),
  c(0xFFFE, 0xFFFF, 'Nop', 'No Operation', 0, 0),
  c(0xFF00, 0xFF00, 'Goto', 'Goto'),
  c(0xFD00, 0xFF00, 'Begin', 'Loop Begin', 0, 0),
  c(0xFE00, 0xFF00, 'Loop', 'Loop End'),
  c(0x0000, 0x7F00, 'Arp', 'Set Arpeggio Note'),
  c(0x4000, 0x7F00, 'AbsArp', 'Set Absolute Arpeggio Note', 0, 95),
  c(0x1000, 0x7F00, 'ExtArp', 'Set External Arpeggio Notes'),
  c(0x0100, 0x7F00, 'PortUp', 'Portamento Up'),
  c(0x0200, 0x7F00, 'PortDn', 'Portamento Down'),
  c(0x0500, 0x7F00, 'PortUpC', 'Portamento Up (curve)'),
  c(0x0600, 0x7F00, 'PortDnC', 'Portamento Down (curve)'),
  c(0x0ED0, 0x7FF0, 'Delay', 'Note Delay'),
  c(0x0400, 0x7F00, 'Vibrato', 'Vibrato'),
  c(0x0300, 0x7F00, 'Slide', 'Slide'),
  c(0x1100, 0x7F00, 'PortUpST', 'Portamento Up (semitones)'),
  c(0x1200, 0x7F00, 'PortDnST', 'Portamento Down (semitones)'),
  c(0x2100, 0x7F00, 'CutoffUp', 'Filter Cutoff Up'),
  c(0x2200, 0x7F00, 'CutoffDn', 'Filter Cutoff Down'),
  c(0x2900, 0x7F00, 'Cutoff', 'Set Filter Cutoff', 0, 0xff),
  c(0x2C00, 0x7F00, 'CutoffAHX', 'Set Combined Cutoff', 0, 0xff),
  c(0x2A00, 0x7F00, 'Resonance', 'Set Filter Resonance', 0, 3),
  c(0x2B00, 0x7F00, 'FltType', 'Set Filter Type', 0, 2),
  c(0x0700, 0x7F00, 'PWDn', 'Pulse Width Down'),
  c(0x0800, 0x7F00, 'PWUp', 'Pulse Width Up'),
  c(0x0900, 0x7F00, 'PW', 'Set Pulse Width'),
  c(0x0C00, 0x7F00, 'Volume', 'Set Volume', 0, 0xff),
  c(0x1A00, 0x7F00, 'GlobFade', 'Global Volume Fade'),
  c(0x1D00, 0x7F00, 'GlobVol', 'Set Global Volume', 0, 128),
  c(0x1C00, 0x7F00, 'ChnVol', 'Set Channel Volume', 0, 128),
  c(0x0B00, 0x7F00, 'Waveform', 'Set Waveform', 0, 0xff),
  c(0x3B00, 0x7F00, 'Wavetable', 'Set Wavetable Item', 0, 127),
  c(0x1B00, 0x7F00, 'SetFxBus', 'Set Effects Bus', 0, 7),
  c(0x7B00, 0x7F00, 'SetRingSrc', 'Set Ring Modulation Source (FF = Off)', 0, 0xff),
  c(0x7A00, 0x7F00, 'SetSyncSrc', 'Set Sync Source (FF = Off)', 0, 0xff),
  c(0x1E00, 0x7F00, 'SetDnSmp', 'Set Downsample', 0, 0xff),
  c(0x0F00, 0x7F00, 'Speed', 'Set Speed'),
  c(0x1F00, 0x7F00, 'Rate', 'Set Rate'),
  c(0x0D00, 0x7F00, 'PatLoop', 'Loop Pattern'),
  c(0x2D00, 0x7F00, 'PatSkip', 'Skip Pattern'),
  c(0x7C00, 0x7F00, 'Release', 'Trigger Release', 0, 0xff),
  c(0x7D00, 0x7F00, 'Restart', 'Restart Program', 0, 0),
  c(0x0A00, 0x7F00, 'VolFade', 'Fade Volume'),
  c(0x0EB0, 0x7FF0, 'VolUpFine', 'Fine Fade Volume In', 0, 0xf),
  c(0x0EA0, 0x7FF0, 'VolDnFine', 'Fine Fade Volume Out', 0, 0xf),
  c(0x0E10, 0x7FF0, 'PortUpFine', 'Fine Portamento Up', 0, 0xf),
  c(0x0E20, 0x7FF0, 'PortDnFine', 'Fine Portamento Down', 0, 0xf),
  c(0x0EC0, 0x7FF0, 'NoteCut', 'Note Cut', 0, 0xf),
  c(0x0E90, 0x7FF0, 'Retrig', 'Retrigger', 0, 0xf),
  c(0x5000, 0x7000, 'WaveOffs', 'Wavetable Offset', 0, 0xfff),
  c(0x1800, 0x7F00, 'SetPan', 'Set Panning'),
  c(0x1700, 0x7F00, 'PanLeft', 'Pan Left'),
  c(0x1900, 0x7F00, 'PanRight', 'Pan Right'),
  c(0x3100, 0x7F00, 'BuzzUp', 'Tune Buzz Up'),
  c(0x3200, 0x7F00, 'BuzzDn', 'Tune Buzz Down'),
  c(0x3F00, 0x7F00, 'BuzzShape', 'Set Buzz Shape', 0, 3),
  c(0x3900, 0x7F00, 'BuzzFine', 'Set Buzz Finetune'),
  c(0x6000, 0x7000, 'CutFine', 'Set Filter Cutoff (fine)', 0, 2047),
  c(0x3A00, 0x7F00, 'BuzzSemi', 'Set Buzz Semitone'),
  c(0x3300, 0x7F00, 'FMMod', 'Set FM Modulation', 0, 0x7f),
  c(0x3400, 0x7FF0, 'FMFB', 'Set FM Feedback', 0, 7),
  c(0x3500, 0x7F00, 'Mult', 'Set FM Multiplier', 0, 255),
  c(0x3600, 0x7F00, 'FMWave', 'Set FM Waveform', 0, 255),
];

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** Note index (0 = C-0) as the pattern view prints it; out of range prints '???'. */
export function klysNoteName(note: number): string {
  if (!Number.isInteger(note) || note < 0 || note > 95) return '???';
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12)}`;
}

/** Is bit 15 the chain flag for this word? Not in the 0xFxxx group, where it is part of the instruction. */
export function klysStepHasChainBit(word: number): boolean {
  return (word & 0xF000) !== 0xF000;
}

/** The instruction word without the chain flag. */
export function klysStepInstruction(word: number): number {
  return klysStepHasChainBit(word) ? word & 0x7FFF : word;
}

/** The table row a step word runs, or null for a word the original shows as unknown. */
export function klysCommandOf(word: number): KlysProgramCommand | null {
  const w = klysStepInstruction(word);
  return KLYS_PROGRAM_COMMANDS.find((cmd) => (w & cmd.mask) === cmd.word) ?? null;
}

const hexOf = (value: number, mask: number): string => {
  const digits = mask === 0 ? 0 : mask === 0xF ? 1 : mask === 0xFF ? 2 : 3;
  return value.toString(16).toUpperCase().padStart(digits, '0');
};

/**
 * What the original program view prints for a step. Arpeggio shows the note it plays (`baseNote` + offset, or
 * the absolute note); F0/F1 shows the external arpeggio; the rest is the instruction name with its argument.
 */
export function describeKlysStep(word: number, baseNote: number): string {
  if (word === 0xFFFE) return '';
  const w = klysStepInstruction(word);
  const cmd = klysCommandOf(word);
  if (!cmd) return `Unknown ${w.toString(16).toUpperCase().padStart(4, '0')}`;
  const argMask = argMaskOf(cmd.mask);
  const arg = w & argMask;
  if (cmd.word === 0x0000) {
    if ((arg & 0xFF) === 0xF0) return 'External Arpeggio 1';
    if ((arg & 0xFF) === 0xF1) return 'External Arpeggio 2';
    return klysNoteName(baseNote + (arg & 0xFF));
  }
  if (cmd.word === 0x4000) return klysNoteName(arg & 0xFF);
  return argMask === 0 || cmd.max === 0 ? cmd.name : `${cmd.name} ${hexOf(arg, argMask)}`;
}

/**
 * The program word for a mnemonic and argument (`klysStepWord('PortDn', 0x40)`), the one builder for programs that
 * are written in code (the preset bank). The argument is clamped to the instruction's range; `chain` sets bit 15 so
 * the next step runs in the same tick (not available for the 0xFxxx group, where bit 15 is part of the instruction).
 */
export function klysStepWord(mnemonic: string, arg = 0, chain = false): number {
  const cmd = KLYS_PROGRAM_COMMANDS.find((c) => c.mnemonic === mnemonic);
  if (!cmd) throw new Error(`Unknown klystrack program instruction ${mnemonic}`);
  const a = Math.min(cmd.max, Math.max(cmd.min, Math.round(arg)));
  const word = cmd.word | a;
  if (!chain) return word;
  if (!klysStepHasChainBit(word)) throw new Error(`${mnemonic} cannot be chained`);
  // The engine reads the 4-bit-group instructions (Wavetable Offset, fine cutoff) as `word & 0xF000`, chain bit included,
  // so a chained one never matches (measured in the preset bank).
  if ((cmd.mask & 0xFF00) === 0x7000) throw new Error(`${mnemonic} is ignored by the engine when chained`);
  return word | 0x8000;
}
