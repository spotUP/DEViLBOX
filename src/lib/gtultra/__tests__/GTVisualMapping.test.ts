/**
 * GTVisualMapping Tests — Bidirectional hex↔visual conversion functions
 */
import { describe, it, expect } from 'vitest';
import {
  decodeAD, encodeAD, decodeSR, encodeSR,
  attackLabel, decayLabel, sustainLabel,
  activeWaveforms, waveformName,
  isGateOn, isSyncOn, isRingModOn, isTestOn,
  decodeFilter, filterModeName,
  noteToString, stringToNote,
  getCommandInfo, commandLabel,
  ATTACK_MS, DECAY_MS, WAVEFORMS,
} from '../GTVisualMapping';

describe('GTVisualMapping', () => {
  describe('ADSR encoding/decoding', () => {
    it('decodes AD byte correctly', () => {
      expect(decodeAD(0x09)).toEqual({ attack: 0, decay: 9 });
      expect(decodeAD(0xA5)).toEqual({ attack: 10, decay: 5 });
      expect(decodeAD(0xFF)).toEqual({ attack: 15, decay: 15 });
      expect(decodeAD(0x00)).toEqual({ attack: 0, decay: 0 });
    });

    it('encodes AD byte correctly', () => {
      expect(encodeAD(0, 9)).toBe(0x09);
      expect(encodeAD(10, 5)).toBe(0xA5);
      expect(encodeAD(15, 15)).toBe(0xFF);
    });

    it('roundtrips AD correctly', () => {
      for (let i = 0; i < 256; i++) {
        const { attack, decay } = decodeAD(i);
        expect(encodeAD(attack, decay)).toBe(i);
      }
    });

    it('decodes SR byte correctly', () => {
      expect(decodeSR(0xF0)).toEqual({ sustain: 15, release: 0 });
      expect(decodeSR(0x8A)).toEqual({ sustain: 8, release: 10 });
    });

    it('roundtrips SR correctly', () => {
      for (let i = 0; i < 256; i++) {
        const { sustain, release } = decodeSR(i);
        expect(encodeSR(sustain, release)).toBe(i);
      }
    });
  });

  describe('ADSR timing labels', () => {
    it('returns correct attack times', () => {
      expect(attackLabel(0)).toBe('2ms');
      expect(attackLabel(8)).toBe('100ms');
      expect(attackLabel(12)).toBe('1.0s');
      expect(attackLabel(15)).toBe('8.0s');
    });

    it('returns correct decay/release times', () => {
      expect(decayLabel(0)).toBe('6ms');
      expect(decayLabel(8)).toBe('300ms');
      expect(decayLabel(12)).toBe('3.0s');
      expect(decayLabel(15)).toBe('24.0s');
    });

    it('sustain label shows percentage', () => {
      expect(sustainLabel(0)).toBe('0%');
      expect(sustainLabel(15)).toBe('100%');
      expect(sustainLabel(8)).toBe('53%');
    });

    it('ATTACK_MS has 16 entries', () => {
      expect(ATTACK_MS).toHaveLength(16);
    });

    it('DECAY_MS has 16 entries', () => {
      expect(DECAY_MS).toHaveLength(16);
    });
  });

  describe('Waveform helpers', () => {
    it('detects active waveforms', () => {
      expect(activeWaveforms(0x10)).toHaveLength(1);
      expect(activeWaveforms(0x10)[0].shortName).toBe('TRI');
      expect(activeWaveforms(0x60)).toHaveLength(2); // SAW+PUL
      expect(activeWaveforms(0xF0)).toHaveLength(4); // all
      expect(activeWaveforms(0x00)).toHaveLength(0);
    });

    it('formats waveform name', () => {
      expect(waveformName(0x10)).toBe('TRI');
      expect(waveformName(0x20)).toBe('SAW');
      expect(waveformName(0x40)).toBe('PUL');
      expect(waveformName(0x80)).toBe('NOI');
      expect(waveformName(0x60)).toBe('SAW+PUL');
      expect(waveformName(0x00)).toBe('None');
    });

    it('detects control register bits', () => {
      expect(isGateOn(0x11)).toBe(true);
      expect(isGateOn(0x10)).toBe(false);
      expect(isSyncOn(0x12)).toBe(true);
      expect(isSyncOn(0x10)).toBe(false);
      expect(isRingModOn(0x14)).toBe(true);
      expect(isRingModOn(0x10)).toBe(false);
      expect(isTestOn(0x18)).toBe(true);
      expect(isTestOn(0x10)).toBe(false);
    });

    it('WAVEFORMS has 4 entries', () => {
      expect(WAVEFORMS).toHaveLength(4);
    });
  });

  describe('Filter decoding', () => {
    it('decodes filter registers', () => {
      // Create mock SID register array (25 bytes)
      const regs = new Uint8Array(25);
      // Cutoff: lo=0x05 (3 bits), hi=0x80 → cutoff = (0x80 << 3) | 5 = 1029
      regs[0x15] = 0x05;
      regs[0x16] = 0x80;
      // Filter/res: resonance=0xA0 (top 4 bits = 10), voices = 0x07 (v1+v2+v3)
      regs[0x17] = 0xA7;
      // Mode/vol: LP=0x10, volume=0x0F → 0x1F
      regs[0x18] = 0x1F;

      const info = decodeFilter(regs);
      expect(info.cutoff).toBe(1029);
      expect(info.resonance).toBe(10);
      expect(info.filterVoice1).toBe(true);
      expect(info.filterVoice2).toBe(true);
      expect(info.filterVoice3).toBe(true);
      expect(info.filterExt).toBe(false);
      expect(info.lowPass).toBe(true);
      expect(info.bandPass).toBe(false);
      expect(info.highPass).toBe(false);
      expect(info.volume).toBe(15);
    });

    it('formats filter mode name', () => {
      expect(filterModeName({ lowPass: true, bandPass: false, highPass: false } as any)).toBe('LP');
      expect(filterModeName({ lowPass: true, bandPass: true, highPass: false } as any)).toBe('LP+BP');
      expect(filterModeName({ lowPass: false, bandPass: false, highPass: false } as any)).toBe('Off');
      expect(filterModeName({ lowPass: true, bandPass: true, highPass: true } as any)).toBe('LP+BP+HP');
    });
  });

  describe('Note conversion', () => {
    it('converts special values', () => {
      expect(noteToString(0)).toBe('...');
      expect(noteToString(0xBE)).toBe('===');
      expect(noteToString(0xBF)).toBe('+++');
    });

    it('converts note values to strings', () => {
      expect(noteToString(1)).toBe('C-0');
      expect(noteToString(13)).toBe('C-1');
      expect(noteToString(2)).toBe('C#0');
      expect(noteToString(25)).toBe('C-2');
    });

    it('converts strings back to note values', () => {
      expect(stringToNote('...')).toBe(0);
      expect(stringToNote('===')).toBe(0xBE);
      expect(stringToNote('+++')).toBe(0xBF);
      expect(stringToNote('C-0')).toBe(1);
      expect(stringToNote('C-1')).toBe(13);
    });

    it('roundtrips notes correctly', () => {
      for (let n = 1; n <= 95; n++) {
        const str = noteToString(n);
        expect(stringToNote(str)).toBe(n);
      }
    });
  });

  describe('Command helpers', () => {
    it('gets command info by hex', () => {
      expect(getCommandInfo(0x01).name).toBe('PrtUp');
      expect(getCommandInfo(0x04).description).toBe('Vibrato');
      expect(getCommandInfo(0x00).name).toBe('---');
    });

    it('returns default for unknown commands', () => {
      expect(getCommandInfo(0xFF).name).toBe('---');
    });

    it('formats command labels', () => {
      expect(commandLabel(0, 0)).toBe('--- --');
      expect(commandLabel(0x01, 0x20)).toBe('PrtUp 20');
      expect(commandLabel(0x0C, 0x0F)).toBe('Vol   0F');
    });
  });
});
