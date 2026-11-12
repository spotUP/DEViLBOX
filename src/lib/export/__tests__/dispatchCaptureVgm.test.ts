import { describe, it, expect } from 'vitest';
import { dispatchCaptureToLog } from '../dispatchRegCapture';
import { parseRegisterLog, exportToVGM } from '../VGMExporter';
import { FurnaceChipType } from '../../../engine/chips/FurnaceChipEngine';

const HEADER = 0x100;

describe('dispatch capture to VGM', () => {
  it('writes the YM2610 clock, ordered 0x58/0x59 commands, waits at 44100 and the end byte', () => {
    // Worklet at 48000 Hz: 960 samples = 882 VGM samples, 1920 = 1764.
    const cap = [
      { timestamp: 0, chipType: FurnaceChipType.OPNB, port: 0x28, data: 0xf1 },
      { timestamp: 0, chipType: FurnaceChipType.OPNB, port: 0x130, data: 0x7f },
      { timestamp: 960, chipType: FurnaceChipType.OPNB, port: 0x07, data: 0x38 },
    ];
    const vgm = exportToVGM(parseRegisterLog(dispatchCaptureToLog(cap, 48000)));
    const view = new DataView(vgm.buffer);
    expect(view.getUint32(0x4c, true)).toBe(8000000);
    expect(view.getUint32(0x18, true)).toBe(882);
    const body = Array.from(vgm.slice(HEADER, HEADER + 10));
    expect(body).toEqual([0x58, 0x28, 0xf1, 0x59, 0x30, 0x7f, 0x63, 0x58, 0x07, 0x38]);
    expect(vgm[HEADER + 10]).toBe(0x66);
  });
});
