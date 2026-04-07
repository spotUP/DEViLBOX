/**
 * Future Player — instrument "detail" struct byte offsets.
 *
 * Shared between the DOM editor (FuturePlayerControls.tsx) and the GL
 * editor (PixiFuturePlayerPanel.tsx) so both write paths stay in lock-step
 * with the parser's read offsets.
 *
 * Offsets come from FuturePlayer.c update_audio() — identical to the
 * ones the parser uses to READ these fields. The absolute write address
 * for any live edit is `detailPtr + offset`.
 */

import type { FuturePlayerConfig } from '@/types/instrument/exotic';

export const FP_DETAIL_OFFSET: Partial<Record<keyof FuturePlayerConfig, number>> = {
  volume:          0x08,
  attackRate:      0x12,
  attackPeak:      0x13,
  decayRate:       0x14,
  sustainLevel:    0x15,
  sustainRate:     0x16,
  sustainTarget:   0x17,
  releaseRate:     0x18,
  pitchMod1Shift:  0x1E,
  pitchMod1Delay:  0x1F,
  pitchMod1Mode:   0x20,
  pitchMod2Shift:  0x26,
  pitchMod2Delay:  0x27,
  pitchMod2Mode:   0x28,
  sampleMod1Shift: 0x2E,
  sampleMod1Delay: 0x2F,
  sampleMod1Mode:  0x30,
  sampleMod2Shift: 0x36,
  sampleMod2Delay: 0x37,
  sampleMod2Mode:  0x38,
};

/** Negate flag offsets — stored adjacent to the mode byte for each pitch mod. */
export const FP_NEGATE_OFFSET = {
  pitchMod1Negate: 0x21,
  pitchMod2Negate: 0x29,
} as const;
