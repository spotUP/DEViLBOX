import { FurnaceSynth } from '../FurnaceSynth';
import { FurnaceChipType } from '../chips/FurnaceChipEngine';

/**
 * Apply effect to FurnaceSynth (register-based).
 * Translates effects to register writes based on chip type.
 * Effect codes match FurnaceEffectRouter mappings.
 */
export function applyFurnaceSynthEffect(synth: FurnaceSynth, effect: number, param: number): void {
  const x = (param >> 4) & 0x0F;
  const y = param & 0x0F;
  const chipType = synth.getChipType();

  // Standard effects (all platforms)
  switch (effect) {
    case 0x08: // Panning
      synth.writePanRegister(param);
      return;
  }

  // Platform-specific effect routing
  if (isFMChip(chipType)) {
    applyFMEffect(synth, effect, param, x, y);
  } else if (isPSGChip(chipType)) {
    applyPSGEffect(synth, effect, param, chipType);
  } else if (isWavetableChip(chipType)) {
    applyWavetableEffect(synth, effect, param, chipType);
  } else if (isC64Chip(chipType)) {
    applyC64Effect(synth, effect, param);
  }
}

/** Check if chip is FM-based */
export function isFMChip(chipType: number): boolean {
  return ([
    FurnaceChipType.OPN2, FurnaceChipType.OPM, FurnaceChipType.OPL3,
    FurnaceChipType.OPLL, FurnaceChipType.OPNA, FurnaceChipType.OPNB,
    FurnaceChipType.OPZ, FurnaceChipType.Y8950, FurnaceChipType.OPL4,
    FurnaceChipType.OPN, FurnaceChipType.OPNB_B, FurnaceChipType.ESFM
  ] as number[]).includes(chipType);
}

/** Check if chip is PSG-based (square wave with duty/envelope) */
export function isPSGChip(chipType: number): boolean {
  return ([
    FurnaceChipType.NES, FurnaceChipType.GB, FurnaceChipType.PSG,
    FurnaceChipType.AY, FurnaceChipType.AY8930, FurnaceChipType.SAA,
    FurnaceChipType.VIC, FurnaceChipType.TED
  ] as number[]).includes(chipType);
}

/** Check if chip is wavetable-based */
export function isWavetableChip(chipType: number): boolean {
  return ([
    FurnaceChipType.PCE, FurnaceChipType.SCC, FurnaceChipType.SWAN,
    FurnaceChipType.N163, FurnaceChipType.NAMCO, FurnaceChipType.FDS,
    FurnaceChipType.BUBBLE, FurnaceChipType.X1_010, FurnaceChipType.SM8521
  ] as number[]).includes(chipType);
}

/** Check if chip is C64/SID-based */
export function isC64Chip(chipType: number): boolean {
  return ([
    FurnaceChipType.SID, FurnaceChipType.SID_6581, FurnaceChipType.SID_8580
  ] as number[]).includes(chipType);
}

/** Apply FM-specific effects */
export function applyFMEffect(synth: FurnaceSynth, effect: number, _param: number, x: number, y: number): void {
  switch (effect) {
    // 0x10 = LFO - not directly supported by FurnaceSynth register writes
    case 0x11: // 11xy - Set operator TL (x=op, y=value*8)
      synth.writeOperatorTL(x, y * 8);
      break;
    case 0x12: // 12xy - Set operator AR (x=op, y=value*2)
      synth.writeOperatorAR(x, y * 2);
      break;
    case 0x13: // 13xy - Set operator DR (x=op, y=value*2)
      synth.writeOperatorDR(x, y * 2);
      break;
    case 0x14: // 14xy - Set operator MULT (x=op, y=value)
      synth.writeOperatorMult(x, y);
      break;
    case 0x15: // 15xy - Set operator RR (x=op, y=value)
      synth.writeOperatorRR(x, y);
      break;
    case 0x16: // 16xy - Set operator SL (x=op, y=value)
      synth.writeOperatorSL(x, y);
      break;
    // 0x17 = DT, 0x18 = ALG/FB, 0x19 = FB - not directly supported
  }
}

/** Apply PSG-specific effects (NES, GB, AY, etc.) */
export function applyPSGEffect(synth: FurnaceSynth, effect: number, param: number, chipType: number): void {
  switch (chipType) {
    case FurnaceChipType.GB:
      // GB: 0x10 = sweep, 0x11 = wave select, 0x12 = length/duty
      if (effect === 0x11) {
        synth.writeWavetableSelect(param);
      } else if (effect === 0x12) {
        synth.writeDutyRegister(param & 0x03); // Lower 2 bits = duty
      }
      break;

    case FurnaceChipType.NES:
      // NES: 0x11 = length counter, 0x12 = duty/envelope
      if (effect === 0x12) {
        synth.writeDutyRegister((param >> 6) & 0x03); // Upper 2 bits = duty
      }
      break;

    case FurnaceChipType.AY:
    case FurnaceChipType.AY8930:
      // AY: 0x10 = envelope shape, 0x11-0x12 = envelope period
      // These are envelope effects, not duty - handled differently
      break;

    case FurnaceChipType.PSG:
      // SN76489: No programmable duty
      break;
  }
}

/** Apply wavetable-specific effects (PCE, SCC, N163, etc.) */
export function applyWavetableEffect(synth: FurnaceSynth, effect: number, param: number, chipType: number): void {
  switch (chipType) {
    case FurnaceChipType.PCE:
      // PCE: 0x10 = LFO mode, 0x11 = LFO speed, 0x12 = wave select
      if (effect === 0x12) {
        synth.writeWavetableSelect(param);
      }
      break;

    case FurnaceChipType.SCC:
      // SCC: 0x10 = wave select
      if (effect === 0x10) {
        synth.writeWavetableSelect(param);
      }
      break;

    case FurnaceChipType.N163:
      // N163: 0x10 = wave select, 0x11 = wave position, 0x12 = wave length
      if (effect === 0x10) {
        synth.writeWavetableSelect(param);
      }
      break;

    case FurnaceChipType.NAMCO:
      // Namco WSG: 0x10 = wave select
      if (effect === 0x10) {
        synth.writeWavetableSelect(param);
      }
      break;

    case FurnaceChipType.FDS:
      // FDS: 0x10-0x14 = modulation effects
      // Wave is set via instrument, not effects
      break;

    case FurnaceChipType.SWAN:
    case FurnaceChipType.SM8521:
    case FurnaceChipType.BUBBLE:
    case FurnaceChipType.X1_010:
      // Generic wavetable: 0x10 or 0x11 for wave select
      if (effect === 0x10 || effect === 0x11) {
        synth.writeWavetableSelect(param);
      }
      break;
  }
}

/** Apply C64/SID-specific effects */
export function applyC64Effect(synth: FurnaceSynth, effect: number, param: number): void {
  // C64: 0x10 = duty reset, 0x11 = cutoff, 0x12 = fine duty
  // Note: FurnaceSynth may not fully support C64 register writes
  // These would need specific register write methods in FurnaceSynth
  if (effect === 0x10 || effect === 0x12) {
    // Duty effects - would need C64-specific implementation
    synth.writeDutyRegister(param);
  }
}
