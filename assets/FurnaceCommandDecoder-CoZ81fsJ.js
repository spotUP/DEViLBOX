const DIV_CMD_VOLUME = 5;
const DIV_CMD_PITCH = 9;
const DIV_CMD_PANNING = 10;
const DIV_CMD_FM_TL = 36;
const DIV_CMD_FM_AM = 37;
const DIV_CMD_FM_AR = 38;
const DIV_CMD_FM_DR = 39;
const DIV_CMD_FM_SL = 40;
const DIV_CMD_FM_D2R = 41;
const DIV_CMD_FM_RR = 42;
const DIV_CMD_FM_DT = 43;
const DIV_CMD_FM_RS = 45;
const DIV_CMD_FM_WS = 49;
const DIV_CMD_FM_SSG = 50;
const DIV_CMD_FM_FB = 53;
const DIV_CMD_FM_MULT = 54;
const DIV_CMD_C64_CUTOFF = 60;
const DIV_CMD_C64_RESONANCE = 61;
const DIV_CMD_C64_FILTER_MODE = 62;
const DIV_CMD_C64_FINE_DUTY = 68;
const DIV_CMD_C64_FINE_CUTOFF = 69;
const DIV_CMD_AY_ENVELOPE_SET = 70;
const DIV_CMD_AY_ENVELOPE_LOW = 71;
const DIV_CMD_AY_ENVELOPE_HIGH = 72;
const DIV_CMD_AY_NOISE_MASK_AND = 74;
const DIV_CMD_AY_NOISE_MASK_OR = 75;
const DIV_CMD_GB_SWEEP_TIME = 115;
const DIV_CMD_GB_SWEEP_DIR = 116;
const DIV_CMD_NES_SWEEP = 121;
const DIV_CMD_NES_DMC = 122;
const DIV_CMD_SNES_ECHO = 203;
const DIV_CMD_SNES_GAIN_MODE = 206;
const DIV_CMD_SNES_GAIN = 207;
const DIV_CMD_SNES_ECHO_DELAY = 209;
const DIV_CMD_SNES_ECHO_FEEDBACK = 212;
const DIV_CMD_C64_PW_SLIDE = 305;
const DIV_CMD_C64_CUTOFF_SLIDE = 306;
const DIV_CMD_FM_ALG = 317;
const DIV_CMD_FM_FMS = 318;
const DIV_CMD_FM_AMS = 319;
function decodeFurnaceCommand(cmd, channel, value1, value2) {
  const prefix = `fur.${channel}`;
  switch (cmd) {
    case DIV_CMD_VOLUME:
      return [{ paramId: `${prefix}.volume`, value: Math.min(1, Math.max(0, value1 / 127)) }];
    case DIV_CMD_PITCH:
      return [{ paramId: `${prefix}.pitch`, value: (value1 + 128) / 255 }];
    case DIV_CMD_PANNING:
      return [
        { paramId: `${prefix}.panL`, value: Math.min(1, value1 / 127) },
        { paramId: `${prefix}.panR`, value: Math.min(1, value2 / 127) }
      ];
    // FM operator commands — value1 is operator index
    case DIV_CMD_FM_TL:
      return [{ paramId: `${prefix}.op${value1}.tl`, value: Math.min(1, value2 / 127) }];
    case DIV_CMD_FM_AR:
      return [{ paramId: `${prefix}.op${value1}.ar`, value: Math.min(1, value2 / 31) }];
    case DIV_CMD_FM_DR:
      return [{ paramId: `${prefix}.op${value1}.dr`, value: Math.min(1, value2 / 31) }];
    case DIV_CMD_FM_SL:
      return [{ paramId: `${prefix}.op${value1}.sl`, value: Math.min(1, value2 / 15) }];
    case DIV_CMD_FM_D2R:
      return [{ paramId: `${prefix}.op${value1}.d2r`, value: Math.min(1, value2 / 31) }];
    case DIV_CMD_FM_RR:
      return [{ paramId: `${prefix}.op${value1}.rr`, value: Math.min(1, value2 / 15) }];
    case DIV_CMD_FM_DT:
      return [{ paramId: `${prefix}.op${value1}.dt`, value: Math.min(1, value2 / 7) }];
    case DIV_CMD_FM_MULT:
      return [{ paramId: `${prefix}.op${value1}.mult`, value: Math.min(1, value2 / 15) }];
    case DIV_CMD_FM_RS:
      return [{ paramId: `${prefix}.op${value1}.rs`, value: Math.min(1, value2 / 3) }];
    case DIV_CMD_FM_AM:
      return [{ paramId: `${prefix}.op${value1}.am`, value: value2 & 1 }];
    case DIV_CMD_FM_SSG:
      return [{ paramId: `${prefix}.op${value1}.ssg`, value: Math.min(1, value2 / 15) }];
    case DIV_CMD_FM_WS:
      return [{ paramId: `${prefix}.op${value1}.ws`, value: Math.min(1, value2 / 7) }];
    // FM channel-level
    case DIV_CMD_FM_FB:
      return [{ paramId: `${prefix}.fb`, value: Math.min(1, value1 / 7) }];
    case DIV_CMD_FM_ALG:
      return [{ paramId: `${prefix}.alg`, value: Math.min(1, value1 / 7) }];
    case DIV_CMD_FM_FMS:
      return [{ paramId: `${prefix}.fms`, value: Math.min(1, value1 / 7) }];
    case DIV_CMD_FM_AMS:
      return [{ paramId: `${prefix}.ams`, value: Math.min(1, value1 / 3) }];
    // C64 SID
    case DIV_CMD_C64_CUTOFF:
      return [{ paramId: `${prefix}.c64Cutoff`, value: Math.min(1, value1 / 2047) }];
    case DIV_CMD_C64_RESONANCE:
      return [{ paramId: `${prefix}.c64Reso`, value: Math.min(1, value1 / 15) }];
    case DIV_CMD_C64_FILTER_MODE:
      return [{ paramId: `${prefix}.c64FilterMode`, value: Math.min(1, value1 / 7) }];
    case DIV_CMD_C64_FINE_DUTY:
      return [{ paramId: `${prefix}.c64FineDuty`, value: Math.min(1, value1 / 4095) }];
    case DIV_CMD_C64_FINE_CUTOFF:
      return [{ paramId: `${prefix}.c64FineCutoff`, value: Math.min(1, value1 / 2047) }];
    case DIV_CMD_C64_PW_SLIDE:
      return [{ paramId: `${prefix}.c64PwSlide`, value: (value1 + 128) / 255 }];
    case DIV_CMD_C64_CUTOFF_SLIDE:
      return [{ paramId: `${prefix}.c64CutoffSlide`, value: (value1 + 128) / 255 }];
    // AY
    case DIV_CMD_AY_ENVELOPE_SET:
      return [{ paramId: `${prefix}.ayEnvShape`, value: Math.min(1, value1 / 15) }];
    case DIV_CMD_AY_ENVELOPE_LOW:
      return [{ paramId: `${prefix}.ayEnvLo`, value: Math.min(1, value1 / 255) }];
    case DIV_CMD_AY_ENVELOPE_HIGH:
      return [{ paramId: `${prefix}.ayEnvHi`, value: Math.min(1, value1 / 255) }];
    case DIV_CMD_AY_NOISE_MASK_AND:
      return [{ paramId: `${prefix}.ayNoiseMaskAnd`, value: Math.min(1, value1 / 31) }];
    case DIV_CMD_AY_NOISE_MASK_OR:
      return [{ paramId: `${prefix}.ayNoiseMaskOr`, value: Math.min(1, value1 / 31) }];
    // Game Boy
    case DIV_CMD_GB_SWEEP_TIME:
      return [{ paramId: `${prefix}.gbSweepTime`, value: Math.min(1, value1 / 7) }];
    case DIV_CMD_GB_SWEEP_DIR:
      return [{ paramId: `${prefix}.gbSweepDir`, value: value1 & 1 }];
    // NES
    case DIV_CMD_NES_SWEEP:
      return [{ paramId: `${prefix}.nesSweep`, value: Math.min(1, value1 / 255) }];
    case DIV_CMD_NES_DMC:
      return [{ paramId: `${prefix}.nesDmc`, value: Math.min(1, value1 / 127) }];
    // SNES
    case DIV_CMD_SNES_ECHO:
      return [{ paramId: `${prefix}.snesEcho`, value: value1 & 1 }];
    case DIV_CMD_SNES_GAIN_MODE:
      return [{ paramId: `${prefix}.snesGainMode`, value: Math.min(1, value1 / 7) }];
    case DIV_CMD_SNES_GAIN:
      return [{ paramId: `${prefix}.snesGain`, value: Math.min(1, value1 / 127) }];
    case DIV_CMD_SNES_ECHO_DELAY:
      return [{ paramId: `${prefix}.snesEchoDelay`, value: Math.min(1, value1 / 15) }];
    case DIV_CMD_SNES_ECHO_FEEDBACK:
      return [{ paramId: `${prefix}.snesEchoFeedback`, value: (value1 + 128) / 255 }];
    default:
      return [];
  }
}
export {
  decodeFurnaceCommand
};
