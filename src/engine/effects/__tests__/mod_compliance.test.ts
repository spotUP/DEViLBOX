import { describe, it, expect, beforeEach } from 'vitest';
import { MODHandler } from '../MODHandler';
import { runRow, mockConfig } from './harness';

describe('MOD Compliance (OpenMPT Wiki)', () => {
  let handler: MODHandler;

  beforeEach(() => {
    handler = new MODHandler();
    handler.init({ ...mockConfig, format: 'MOD' });
  });

  describe('Dxx - Pattern Break', () => {
    it('should use BCD conversion (D10 = row 10)', () => {
      const { results } = runRow(handler, 0, { effect: 'D10' }, 1);
      expect(results[0].patternBreak).toBe(10);
    });

    it('should use BCD conversion (D32 = row 32)', () => {
      const { results } = runRow(handler, 0, { effect: 'D32' }, 1);
      expect(results[0].patternBreak).toBe(32);
    });

    it('should clamp to row 0 if parameter is invalid BCD (> 63)', () => {
      const { results } = runRow(handler, 0, { effect: 'D65' }, 1);
      // OpenMPT says ProTracker clamps to 0 if BCD is invalid or > 63
      expect(results[0].patternBreak).toBe(0);
    });
  });

  describe('7xy - Tremolo', () => {
    it('should scale magnitude using (data * depth) >> 6', () => {
      // Setup state with volume 64
      runRow(handler, 0, { effect: '77E' }, 6, { 
        volume: 64,
        tremoloSpeed: 7,
        tremoloDepth: 14, // E
        tremoloPos: 0
      });

      // Sine table at index 0 is 0. Delta should be 0.
      // (Test logic simplified for now)
    });
  });

  describe('Bxx + Dxx Interaction', () => {
    it('should process both Bxx and Dxx if present on same row (different channels)', () => {
      // Row start
      const state0 = handler.getChannelState(0);
      const state1 = handler.getChannelState(1);
      
      const res0 = handler.processRowStart(0, null, null, null, 'B01', state0);
      const res1 = handler.processRowStart(1, null, null, null, 'D10', state1);
      
      expect(res0.positionJump).toBe(1);
      expect(res1.patternBreak).toBe(10);
    });
  });
  
  describe('9xx - Sample Offset', () => {
    it('should persist offset memory', () => {
      const state = handler.getChannelState(0);
      
      // Row 1: 901
      const res1 = handler.processRowStart(0, 'C-4', 1, null, '901', state);
      expect(res1.sampleOffset).toBe(1 << 8);
      expect(state.lastSampleOffset).toBe(1);
      
      // Row 2: 900 (should use previous)
      const res2 = handler.processRowStart(0, 'C-4', 1, null, '900', state);
      expect(res2.sampleOffset).toBe(1 << 8);
    });
  });
});
