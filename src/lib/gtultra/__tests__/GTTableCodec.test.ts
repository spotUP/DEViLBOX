import { describe, it, expect } from 'vitest';
import {
  decodeWaveSequence, encodeWaveSequence,
  decodePulseSequence, encodePulseSequence,
  decodeFilterSequence, encodeFilterSequence,
  decodeSpeedTable, encodeSpeedTable,
  waveformName, waveCommandLabel,
  type WaveStep, type PulseStep,
} from '../GTTableCodec';

// Helper: create a 255-byte table with given bytes at offset
function makeTable(bytes: number[], startAt: number = 0): Uint8Array {
  const arr = new Uint8Array(255);
  for (let i = 0; i < bytes.length; i++) arr[startAt + i] = bytes[i];
  return arr;
}

describe('GTTableCodec — Wave Table', () => {
  it('decodes a simple waveform sequence', () => {
    // SAW+gate, no note change, then PUL+gate, then end
    const left  = makeTable([0x21, 0x41, 0xFF]);
    const right = makeTable([0x80, 0x80, 0x00]);
    const steps = decodeWaveSequence(left, right, 1); // ptr=1 → index 0

    expect(steps).toHaveLength(2);
    expect(steps[0].waveform).toBe(0x20); // SAW
    expect(steps[0].gate).toBe(true);
    expect(steps[0].noteOffset).toBe(0x80);
    expect(steps[1].waveform).toBe(0x40); // PUL
    expect(steps[1].gate).toBe(true);
  });

  it('decodes delays', () => {
    // 3-frame delay, then SAW+gate, then end
    const left  = makeTable([0x03, 0x21, 0xFF]);
    const right = makeTable([0x00, 0x80, 0x00]);
    const steps = decodeWaveSequence(left, right, 1);

    expect(steps).toHaveLength(1);
    expect(steps[0].delay).toBe(3);
    expect(steps[0].waveform).toBe(0x20);
  });

  it('decodes commands (F0-FE)', () => {
    // Vibrato command, then end
    const left  = makeTable([0xF4, 0xFF]);
    const right = makeTable([0x20, 0x00]);
    const steps = decodeWaveSequence(left, right, 1);

    expect(steps).toHaveLength(1);
    expect(steps[0].isCommand).toBe(true);
    expect(steps[0].cmdByte).toBe(0xF4);
    expect(steps[0].cmdParam).toBe(0x20);
  });

  it('roundtrips a sequence', () => {
    const original: WaveStep[] = [
      { waveform: 0x20, gate: true, sync: false, ring: false, delay: 0, noteOffset: 0x80 },
      { waveform: 0x40, gate: true, sync: false, ring: false, delay: 5, noteOffset: 0x80 },
      { waveform: 0x10, gate: false, sync: true, ring: false, delay: 0, noteOffset: 3 },
    ];

    const { left, right } = encodeWaveSequence(original);
    const table_l = makeTable(left);
    const table_r = makeTable(right);
    const decoded = decodeWaveSequence(table_l, table_r, 1);

    expect(decoded).toHaveLength(3);
    expect(decoded[0].waveform).toBe(0x20);
    expect(decoded[0].gate).toBe(true);
    expect(decoded[1].delay).toBe(5);
    expect(decoded[1].waveform).toBe(0x40);
    expect(decoded[2].sync).toBe(true);
    expect(decoded[2].noteOffset).toBe(3);
  });

  it('handles empty pointer', () => {
    const left = new Uint8Array(255);
    const right = new Uint8Array(255);
    expect(decodeWaveSequence(left, right, 0)).toEqual([]);
  });

  it('encodes delays > 15 as multiple entries', () => {
    const steps: WaveStep[] = [
      { waveform: 0x20, gate: true, sync: false, ring: false, delay: 20, noteOffset: 0x80 },
    ];
    const { left } = encodeWaveSequence(steps);
    // 20 = 15 + 5
    expect(left[0]).toBe(15);
    expect(left[1]).toBe(5);
    expect(left[2]).toBe(0x21); // SAW+gate
  });
});

describe('GTTableCodec — Pulse Table', () => {
  it('decodes absolute pulse width set', () => {
    // Set PW to 2048 = 0x800 → left = 0x88, right = 0x00
    const left  = makeTable([0x88, 0xFF]);
    const right = makeTable([0x00, 0x00]);
    const steps = decodePulseSequence(left, right, 1);

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('set');
    expect(steps[0].value).toBe(0x800);
  });

  it('decodes modulation', () => {
    // Modulate for 10 frames at speed 4
    const left  = makeTable([0x0A, 0xFF]);
    const right = makeTable([0x04, 0x00]);
    const steps = decodePulseSequence(left, right, 1);

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('mod');
    expect(steps[0].value).toBe(10);
    expect(steps[0].speed).toBe(4);
  });

  it('roundtrips pulse sequence', () => {
    const original: PulseStep[] = [
      { type: 'set', value: 2048, speed: 0 },
      { type: 'mod', value: 16, speed: 3 },
      { type: 'mod', value: 16, speed: 0xFD }, // negative speed
    ];

    const { left, right } = encodePulseSequence(original);
    const table_l = makeTable(left);
    const table_r = makeTable(right);
    const decoded = decodePulseSequence(table_l, table_r, 1);

    expect(decoded).toHaveLength(3);
    expect(decoded[0].type).toBe('set');
    expect(decoded[0].value).toBe(2048);
    expect(decoded[1].type).toBe('mod');
    expect(decoded[1].speed).toBe(3);
    expect(decoded[2].speed).toBe(0xFD);
  });
});

describe('GTTableCodec — Filter Table', () => {
  it('decodes filter set and modulation', () => {
    const left  = makeTable([0x90, 0x08, 0xFF]);
    const right = makeTable([0x40, 0x02, 0x00]);
    const steps = decodeFilterSequence(left, right, 1);

    expect(steps).toHaveLength(2);
    expect(steps[0].type).toBe('set');
    expect(steps[0].value).toBe(0x90);
    expect(steps[0].param).toBe(0x40);
    expect(steps[1].type).toBe('mod');
    expect(steps[1].value).toBe(8);
    expect(steps[1].param).toBe(2);
  });

  it('roundtrips filter sequence', () => {
    const original = [
      { type: 'set' as const, value: 0x90, param: 0x60 },
      { type: 'mod' as const, value: 16, param: 0xFE },
    ];

    const { left, right } = encodeFilterSequence(original);
    const table_l = makeTable(left);
    const table_r = makeTable(right);
    const decoded = decodeFilterSequence(table_l, table_r, 1);

    expect(decoded).toHaveLength(2);
    expect(decoded[0].value).toBe(0x90);
    expect(decoded[0].param).toBe(0x60);
    expect(decoded[1].value).toBe(16);
    expect(decoded[1].param).toBe(0xFE);
  });
});

describe('GTTableCodec — Speed Table', () => {
  it('decodes speed entries', () => {
    const left  = makeTable([0x00, 0x40, 0xFF]);
    const right = makeTable([0x10, 0x20, 0x00]);
    const entries = decodeSpeedTable(left, right, 1, 10);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ left: 0x00, right: 0x10 });
    expect(entries[1]).toEqual({ left: 0x40, right: 0x20 });
  });

  it('roundtrips speed table', () => {
    const original = [
      { left: 0x00, right: 0x10 },
      { left: 0x80, right: 0x30 },
    ];
    const { left, right } = encodeSpeedTable(original);
    const table_l = makeTable(left);
    const table_r = makeTable(right);
    const decoded = decodeSpeedTable(table_l, table_r, 1, 2);

    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toEqual(original[0]);
    expect(decoded[1]).toEqual(original[1]);
  });
});

describe('GTTableCodec — Helpers', () => {
  it('waveformName returns correct labels', () => {
    expect(waveformName(0x10)).toBe('TRI');
    expect(waveformName(0x20)).toBe('SAW');
    expect(waveformName(0x40)).toBe('PUL');
    expect(waveformName(0x80)).toBe('NOI');
    expect(waveformName(0x60)).toBe('SAW+PUL');
    expect(waveformName(0x00)).toBe('OFF');
  });

  it('waveCommandLabel returns known labels', () => {
    expect(waveCommandLabel(0xF4)).toBe('Vibrato');
    expect(waveCommandLabel(0xF1)).toBe('Porta Up');
    expect(waveCommandLabel(0xFF)).toBe('CMD $FF');
  });
});
