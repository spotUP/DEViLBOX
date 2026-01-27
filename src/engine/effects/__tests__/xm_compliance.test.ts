import { describe, it, expect, beforeEach } from 'vitest';
import { XMHandler } from '../XMHandler';
import { runRow, mockConfig } from './harness';

describe('XM Compliance (OpenMPT Wiki)', () => {
  let handler: XMHandler;

  beforeEach(() => {
    handler = new XMHandler();
    handler.init({ ...mockConfig, format: 'XM', linearSlides: true });
  });

  describe('Dxx - Pattern Break', () => {
    it('should use hex conversion (D10 = row 16)', () => {
      const { results } = runRow(handler, 0, { effect: 'D10' }, 1);
      expect(results[0].patternBreak).toBe(16);
    });
  });

  describe('Volume Column', () => {
    it('should handle fine volume slides correctly', () => {
      // 8x: Fine volume down
      const { state, results } = runRow(handler, 0, { volume: 0x81 }, 1, { volume: 32 });
      expect(state.volume).toBe(31);
      expect(results[0].setVolume).toBe(31);
    });

    it('should handle tone portamento in volume column', () => {
      // Fx: Tone portamento with speed x*16
      const { state } = runRow(handler, 0, { note: 'C-4', volume: 0xF1 }, 1);
      expect(state.portamentoTarget).toBeDefined();
      expect(state.portamentoTarget).toBeGreaterThan(0);
    });
  });
});
