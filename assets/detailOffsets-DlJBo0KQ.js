const FP_DETAIL_OFFSET = {
  volume: 8,
  attackRate: 18,
  attackPeak: 19,
  decayRate: 20,
  sustainLevel: 21,
  sustainRate: 22,
  sustainTarget: 23,
  releaseRate: 24,
  pitchMod1Shift: 30,
  pitchMod1Delay: 31,
  pitchMod1Mode: 32,
  pitchMod2Shift: 38,
  pitchMod2Delay: 39,
  pitchMod2Mode: 40,
  sampleMod1Shift: 46,
  sampleMod1Delay: 47,
  sampleMod1Mode: 48,
  sampleMod2Shift: 54,
  sampleMod2Delay: 55,
  sampleMod2Mode: 56
};
const FP_NEGATE_OFFSET = {
  pitchMod1Negate: 33,
  pitchMod2Negate: 41
};
export {
  FP_NEGATE_OFFSET as F,
  FP_DETAIL_OFFSET as a
};
