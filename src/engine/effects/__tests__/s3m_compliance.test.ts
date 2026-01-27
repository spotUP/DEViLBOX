import { describe, it, expect, beforeEach } from 'vitest';
import { S3MHandler } from '../S3MHandler';
import { runRow, mockConfig } from './harness';

describe('S3M Compliance (OpenMPT Wiki)', () => {
  let handler: S3MHandler;

  beforeEach(() => {
    handler = new S3MHandler();
    handler.init({ ...mockConfig, format: 'S3M' });
  });

  describe('Dxy - Volume Slide', () => {
    it('should give priority to up-slide (x) if both nibbles are non-zero', () => {
      // D11: In S3M, x takes priority over y.
      // Tick 1: vol += 1
      const { state, results } = runRow(handler, 0, { effect: 'D11' }, 2, { volume: 32 });
      expect(state.volume).toBe(33);
      expect(results[1].setVolume).toBe(33);
    });

    it('should handle fine volume slide up (D1F)', () => {
      // D1F: Fine slide up by 1 on tick 0
      const { state, results } = runRow(handler, 0, { effect: 'D1F' }, 1, { volume: 32 });
      expect(state.volume).toBe(33);
      expect(results[0].setVolume).toBe(33);
    });

    it('should handle fine volume slide down (DF1)', () => {
      // DF1: Fine slide down by 1 on tick 0
      const { state, results } = runRow(handler, 0, { effect: 'DF1' }, 1, { volume: 32 });
      expect(state.volume).toBe(31);
      expect(results[0].setVolume).toBe(31);
    });
  });

  describe('Sample Offset (Oxx + SAx)', () => {
    it('should use high offset from SAx', () => {
      const state = handler.getChannelState(0);
      
      // SAl: Set high offset to 1
      handler.processRowStart(0, null, null, null, 'SA1', state);
      
      // O01: Offset should be (1 << 16) + (1 << 8) = 65536 + 256 = 65792
      const result = handler.processRowStart(0, 'C-4', 1, null, 'O01', state);
      expect(result.sampleOffset).toBe(65792);
    });
  });
});
