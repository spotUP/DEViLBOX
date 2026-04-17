import type { MappableParameter, KnobBankMode } from './types';
import type { SynthType } from '../types/instrument';

export interface KnobAssignment {
  cc: number;
  param: MappableParameter;
  label: string;
}

export interface JoystickAxisMapping {
  param: MappableParameter;
  min: number;
  max: number;
  curve: 'linear' | 'log';
}

export interface JoystickMapping {
  x: JoystickAxisMapping;
  y: JoystickAxisMapping;
}

export const KNOB_BANKS: Record<KnobBankMode, KnobAssignment[]> = {
  '303': [
    { cc: 70, param: 'cutoff', label: 'Cutoff' },
    { cc: 71, param: 'resonance', label: 'Resonance' },
    { cc: 72, param: 'envMod', label: 'Env Mod' },
    { cc: 73, param: 'decay', label: 'Decay' },
    { cc: 74, param: 'accent', label: 'Accent' },
    { cc: 75, param: 'overdrive', label: 'Drive' },
    { cc: 76, param: 'slideTime', label: 'Slide' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  'Siren': [
    { cc: 70, param: 'siren.osc.frequency', label: 'Osc Freq' },
    { cc: 71, param: 'siren.lfo.rate', label: 'LFO Rate' },
    { cc: 72, param: 'siren.lfo.depth', label: 'LFO Depth' },
    { cc: 73, param: 'siren.delay.time', label: 'Delay Time' },
    { cc: 74, param: 'siren.delay.feedback', label: 'Feedback' },
    { cc: 75, param: 'siren.delay.wet', label: 'Delay Mix' },
    { cc: 76, param: 'siren.filter.frequency', label: 'Filter' },
    { cc: 77, param: 'siren.reverb.wet', label: 'Reverb' },
  ],
  'Furnace': [
    { cc: 70, param: 'furnace.algorithm', label: 'Algorithm' },
    { cc: 71, param: 'furnace.feedback', label: 'Feedback' },
    { cc: 72, param: 'furnace.op1TL', label: 'Op1 TL' },
    { cc: 73, param: 'furnace.op1AR', label: 'Op1 AR' },
    { cc: 74, param: 'furnace.op1DR', label: 'Op1 DR' },
    { cc: 75, param: 'furnace.op1SL', label: 'Op1 SL' },
    { cc: 76, param: 'furnace.op1RR', label: 'Op1 RR' },
    { cc: 77, param: 'furnace.fms', label: 'FM Sens' },
  ],
  'V2': [
    { cc: 70, param: 'v2.osc1Level', label: 'Osc1 Lvl' },
    { cc: 71, param: 'v2.filter1Cutoff', label: 'Cutoff' },
    { cc: 72, param: 'v2.filter1Reso', label: 'Reso' },
    { cc: 73, param: 'v2.envAttack', label: 'Attack' },
    { cc: 74, param: 'v2.envDecay', label: 'Decay' },
    { cc: 75, param: 'v2.envSustain', label: 'Sustain' },
    { cc: 76, param: 'v2.envRelease', label: 'Release' },
    { cc: 77, param: 'v2.lfo1Depth', label: 'LFO Dep' },
  ],
  'Synare': [
    { cc: 70, param: 'synare.tune', label: 'Tune' },
    { cc: 71, param: 'synare.osc2Mix', label: 'Osc2 Mix' },
    { cc: 72, param: 'synare.filterCutoff', label: 'Cutoff' },
    { cc: 73, param: 'synare.filterReso', label: 'Reso' },
    { cc: 74, param: 'synare.filterEnvMod', label: 'Env Mod' },
    { cc: 75, param: 'synare.filterDecay', label: 'Flt Dcy' },
    { cc: 76, param: 'synare.sweepAmount', label: 'Sweep' },
    { cc: 77, param: 'synare.sweepTime', label: 'Swp Time' },
  ],
  'SpaceLaser': [
    { cc: 70, param: 'spacelaser.startFreq', label: 'Start Hz' },
    { cc: 71, param: 'spacelaser.endFreq', label: 'End Hz' },
    { cc: 72, param: 'spacelaser.sweepTime', label: 'Sweep' },
    { cc: 73, param: 'spacelaser.fmAmount', label: 'FM Amt' },
    { cc: 74, param: 'spacelaser.fmRatio', label: 'FM Ratio' },
    { cc: 75, param: 'spacelaser.filterCutoff', label: 'Cutoff' },
    { cc: 76, param: 'spacelaser.filterReso', label: 'Reso' },
    { cc: 77, param: 'spacelaser.delayWet', label: 'Delay' },
  ],
  'SAM': [
    { cc: 70, param: 'sam.pitch', label: 'Pitch' },
    { cc: 71, param: 'sam.speed', label: 'Speed' },
    { cc: 72, param: 'sam.mouth', label: 'Mouth' },
    { cc: 73, param: 'sam.throat', label: 'Throat' },
    { cc: 74, param: 'mixer.volume', label: 'Volume' },
    { cc: 75, param: 'mixer.volume', label: '-' },
    { cc: 76, param: 'mixer.volume', label: '-' },
    { cc: 77, param: 'mixer.volume', label: '-' },
  ],
  'Organ': [
    { cc: 70, param: 'organ.drawbar16', label: "16'" },
    { cc: 71, param: 'organ.drawbar8', label: "8'" },
    { cc: 72, param: 'organ.drawbar4', label: "4'" },
    { cc: 73, param: 'organ.percussion', label: 'Perc' },
    { cc: 74, param: 'organ.vibratoType', label: 'Vib Type' },
    { cc: 75, param: 'organ.vibratoDepth', label: 'Vib Dep' },
    { cc: 76, param: 'organ.overdrive', label: 'Drive' },
    { cc: 77, param: 'organ.volume', label: 'Volume' },
  ],
  'Melodica': [
    { cc: 70, param: 'melodica.breath', label: 'Breath' },
    { cc: 71, param: 'melodica.brightness', label: 'Bright' },
    { cc: 72, param: 'melodica.vibratoRate', label: 'Vib Rate' },
    { cc: 73, param: 'melodica.vibratoDepth', label: 'Vib Dep' },
    { cc: 74, param: 'melodica.detune', label: 'Detune' },
    { cc: 75, param: 'melodica.portamento', label: 'Porta' },
    { cc: 76, param: 'melodica.attack', label: 'Attack' },
    { cc: 77, param: 'melodica.volume', label: 'Volume' },
  ],
  'FX': [
    { cc: 70, param: 'echo.rate', label: 'Echo Rate' },
    { cc: 71, param: 'echo.intensity', label: 'Intensity' },
    { cc: 72, param: 'echo.echoVolume', label: 'Echo Vol' },
    { cc: 73, param: 'echo.reverbVolume', label: 'Rev Vol' },
    { cc: 74, param: 'echo.mode', label: 'Echo Mode' },
    { cc: 75, param: 'biphase.rateA', label: 'Phase A' },
    { cc: 76, param: 'biphase.feedback', label: 'Phase FB' },
    { cc: 77, param: 'biphase.routing', label: 'Routing' },
  ],
  'MasterFX': [
    { cc: 70, param: 'masterFx.slot0.wet', label: 'FX1 Wet' },
    { cc: 71, param: 'masterFx.slot0.param0', label: 'FX1 P1' },
    { cc: 72, param: 'masterFx.slot1.wet', label: 'FX2 Wet' },
    { cc: 73, param: 'masterFx.slot1.param0', label: 'FX2 P1' },
    { cc: 74, param: 'masterFx.slot2.wet', label: 'FX3 Wet' },
    { cc: 75, param: 'masterFx.slot2.param0', label: 'FX3 P1' },
    { cc: 76, param: 'masterFx.masterVolume', label: 'Master' },
    { cc: 77, param: 'masterFx.limiterCeiling', label: 'Limiter' },
  ],
  'Mixer': [
    { cc: 70, param: 'mixer.filterPosition', label: 'Filter' },
    { cc: 71, param: 'mixer.filterResonance', label: 'Reso' },
    { cc: 72, param: 'mixer.volume', label: 'Volume' },
    { cc: 73, param: 'mixer.pan', label: 'Pan' },
    { cc: 74, param: 'masterFx.slot0.wet', label: 'FX1 Wet' },
    { cc: 75, param: 'masterFx.slot1.wet', label: 'FX2 Wet' },
    { cc: 76, param: 'masterFx.slot2.wet', label: 'FX3 Wet' },
    { cc: 77, param: 'masterFx.masterVolume', label: 'Master' },
  ],
  // ── Hively / AHX ──────────────────────────────────────────────────────────
  'Hively': [
    { cc: 70, param: 'hively.filterSpeed', label: 'Flt Spd' },
    { cc: 71, param: 'hively.filterLower', label: 'Flt Low' },
    { cc: 72, param: 'hively.filterUpper', label: 'Flt Hi' },
    { cc: 73, param: 'hively.vibratoSpeed', label: 'Vib Spd' },
    { cc: 74, param: 'hively.vibratoDepth', label: 'Vib Dep' },
    { cc: 75, param: 'hively.squareSpeed', label: 'Sq Spd' },
    { cc: 76, param: 'mixer.pan', label: 'Pan' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── Klystrack ─────────────────────────────────────────────────────────────
  'Klystrack': [
    { cc: 70, param: 'klystrack.cutoff', label: 'Cutoff' },
    { cc: 71, param: 'klystrack.resonance', label: 'Reso' },
    { cc: 72, param: 'klystrack.attack', label: 'Attack' },
    { cc: 73, param: 'klystrack.decay', label: 'Decay' },
    { cc: 74, param: 'klystrack.sustain', label: 'Sustain' },
    { cc: 75, param: 'klystrack.release', label: 'Release' },
    { cc: 76, param: 'klystrack.pulseWidth', label: 'PW' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── DX7 / FM ──────────────────────────────────────────────────────────────
  'DX7': [
    { cc: 70, param: 'dx7.algorithm', label: 'Algo' },
    { cc: 71, param: 'dx7.feedback', label: 'Feedbk' },
    { cc: 72, param: 'dx7.op1Level', label: 'Op1 Lvl' },
    { cc: 73, param: 'dx7.op2Level', label: 'Op2 Lvl' },
    { cc: 74, param: 'dx7.op3Level', label: 'Op3 Lvl' },
    { cc: 75, param: 'dx7.lfoSpeed', label: 'LFO Spd' },
    { cc: 76, param: 'dx7.transpose', label: 'Trans' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── SidMon (C64) ──────────────────────────────────────────────────────────
  'SidMon': [
    { cc: 70, param: 'sidmon.filterCutoff', label: 'Cutoff' },
    { cc: 71, param: 'sidmon.filterResonance', label: 'Reso' },
    { cc: 72, param: 'sidmon.arpSpeed', label: 'Arp Spd' },
    { cc: 73, param: 'sidmon.vibSpeed', label: 'Vib Spd' },
    { cc: 74, param: 'sidmon.vibDepth', label: 'Vib Dep' },
    { cc: 75, param: 'sidmon.vibDelay', label: 'Vib Dly' },
    { cc: 76, param: 'mixer.pan', label: 'Pan' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── SidMon 1.0 ────────────────────────────────────────────────────────────
  'SidMon1': [
    { cc: 70, param: 'sidmon1.attackSpeed', label: 'Atk Spd' },
    { cc: 71, param: 'sidmon1.attackMax', label: 'Atk Max' },
    { cc: 72, param: 'sidmon1.decaySpeed', label: 'Dcy Spd' },
    { cc: 73, param: 'sidmon1.decayMin', label: 'Dcy Min' },
    { cc: 74, param: 'sidmon1.sustain', label: 'Sustain' },
    { cc: 75, param: 'sidmon1.releaseSpeed', label: 'Rel Spd' },
    { cc: 76, param: 'sidmon1.releaseMin', label: 'Rel Min' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── Sonic Arranger ────────────────────────────────────────────────────────
  'SonicArranger': [
    { cc: 70, param: 'sonicarranger.vibratoSpeed', label: 'Vib Spd' },
    { cc: 71, param: 'sonicarranger.vibratoLevel', label: 'Vib Lvl' },
    { cc: 72, param: 'sonicarranger.vibratoDelay', label: 'Vib Dly' },
    { cc: 73, param: 'sonicarranger.portamentoSpeed', label: 'Porta' },
    { cc: 74, param: 'sonicarranger.fineTuning', label: 'Tune' },
    { cc: 75, param: 'sonicarranger.effect', label: 'Effect' },
    { cc: 76, param: 'sonicarranger.effectArg1', label: 'Fx Arg' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── SoundMon (Brian Postma) ───────────────────────────────────────────────
  'SoundMon': [
    { cc: 70, param: 'soundmon.adsrControl', label: 'ADSR' },
    { cc: 71, param: 'soundmon.adsrSpeed', label: 'ADSR Spd' },
    { cc: 72, param: 'soundmon.egControl', label: 'EG Ctrl' },
    { cc: 73, param: 'soundmon.lfoSpeed', label: 'LFO Spd' },
    { cc: 74, param: 'soundmon.lfoDepth', label: 'LFO Dep' },
    { cc: 75, param: 'soundmon.lfoDelay', label: 'LFO Dly' },
    { cc: 76, param: 'soundmon.waveTable', label: 'WaveTbl' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── Hippel CoSo ───────────────────────────────────────────────────────────
  'HippelCoSo': [
    { cc: 70, param: 'hippelcoso.vibSpeed', label: 'Vib Spd' },
    { cc: 71, param: 'hippelcoso.vibDepth', label: 'Vib Dep' },
    { cc: 72, param: 'mixer.filterPosition', label: 'Filter' },
    { cc: 73, param: 'mixer.filterResonance', label: 'Reso' },
    { cc: 74, param: 'mixer.pan', label: 'Pan' },
    { cc: 75, param: 'mixer.volume', label: 'Volume' },
    { cc: 76, param: 'masterFx.masterVolume', label: 'Master' },
    { cc: 77, param: 'masterFx.masterVolume', label: '-' },
  ],
  // ── Future Composer ───────────────────────────────────────────────────────
  'FC': [
    { cc: 70, param: 'fc.synthSpeed', label: 'Synth' },
    { cc: 71, param: 'fc.vibSpeed', label: 'Vib Spd' },
    { cc: 72, param: 'fc.vibDepth', label: 'Vib Dep' },
    { cc: 73, param: 'fc.vibDelay', label: 'Vib Dly' },
    { cc: 74, param: 'mixer.filterPosition', label: 'Filter' },
    { cc: 75, param: 'mixer.pan', label: 'Pan' },
    { cc: 76, param: 'mixer.volume', label: 'Volume' },
    { cc: 77, param: 'masterFx.masterVolume', label: 'Master' },
  ],
  // ── Rob Hubbard ───────────────────────────────────────────────────────────
  'RobHubbard': [
    { cc: 70, param: 'robhubbard.divider', label: 'Divider' },
    { cc: 71, param: 'robhubbard.portaSpeed', label: 'Porta' },
    { cc: 72, param: 'mixer.filterPosition', label: 'Filter' },
    { cc: 73, param: 'mixer.filterResonance', label: 'Reso' },
    { cc: 74, param: 'mixer.pan', label: 'Pan' },
    { cc: 75, param: 'mixer.volume', label: 'Volume' },
    { cc: 76, param: 'masterFx.masterVolume', label: 'Master' },
    { cc: 77, param: 'masterFx.masterVolume', label: '-' },
  ],
  // ── GTUltra (Game Boy) ────────────────────────────────────────────────────
  'GTUltra': [
    { cc: 70, param: 'gtultra.attack', label: 'Attack' },
    { cc: 71, param: 'gtultra.decay', label: 'Decay' },
    { cc: 72, param: 'gtultra.sustain', label: 'Sustain' },
    { cc: 73, param: 'gtultra.release', label: 'Release' },
    { cc: 74, param: 'gtultra.firstwave', label: '1stWave' },
    { cc: 75, param: 'gtultra.gatetimer', label: 'Gate' },
    { cc: 76, param: 'gtultra.vibdelay', label: 'Vib Dly' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── Geonkick ──────────────────────────────────────────────────────────────
  'Geonkick': [
    { cc: 70, param: 'geonkick.osc0Freq', label: 'Osc0 Hz' },
    { cc: 71, param: 'geonkick.osc0Amp', label: 'Osc0 Amp' },
    { cc: 72, param: 'geonkick.osc1Freq', label: 'Osc1 Hz' },
    { cc: 73, param: 'geonkick.osc1Amp', label: 'Osc1 Amp' },
    { cc: 74, param: 'geonkick.filterCutoff', label: 'Cutoff' },
    { cc: 75, param: 'geonkick.filterQ', label: 'Q' },
    { cc: 76, param: 'geonkick.distDrive', label: 'Drive' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
  // ── CZ-101 (Casio) ───────────────────────────────────────────────────────
  'CZ101': [
    { cc: 70, param: 'cz101.waveform1', label: 'Wave1' },
    { cc: 71, param: 'cz101.waveform2', label: 'Wave2' },
    { cc: 72, param: 'cz101.dco_rate', label: 'DCO Rat' },
    { cc: 73, param: 'cz101.dco_depth', label: 'DCO Dep' },
    { cc: 74, param: 'cz101.dcw_rate', label: 'DCW Rat' },
    { cc: 75, param: 'cz101.dcw_depth', label: 'DCW Dep' },
    { cc: 76, param: 'cz101.dca_rate', label: 'DCA Rat' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
};

/**
 * 303 sub-pages — one per UI tab, plus oscillator page.
 * Page 0 = Main (cutoff, resonance, envMod, decay, accent, drive, slide, volume)
 * Page 1 = MOJO (filter character)
 * Page 2 = DevilFish (circuit mods)
 * Page 3 = Korg (ladder filter)
 * Page 4 = LFO
 * Page 5 = FX
 * Page 6 = Oscillator (tune, wave, pwm, sub)
 */
const KNOB_303_PAGES: KnobAssignment[][] = [
  // Page 0: Main
  KNOB_BANKS['303'],
  // Page 1: MOJO
  [
    { cc: 70, param: 'passbandCompensation', label: 'Bass' },
    { cc: 71, param: 'resTracking', label: 'Rez' },
    { cc: 72, param: 'filterInputDrive', label: 'Satur' },
    { cc: 73, param: 'diodeCharacter', label: 'Bite' },
    { cc: 74, param: 'duffingAmount', label: 'Tensn' },
    { cc: 75, param: 'filterFmDepth', label: 'F.FM' },
    { cc: 76, param: 'lpBpMix', label: 'LP/BP' },
    { cc: 77, param: 'filterTracking', label: 'K.Trk' },
  ],
  // Page 2: DevilFish
  [
    { cc: 70, param: 'normalDecay', label: 'N.Dec' },
    { cc: 71, param: 'accentDecay', label: 'A.Dec' },
    { cc: 72, param: 'softAttack', label: 'S.Atk' },
    { cc: 73, param: 'accentSoftAttack', label: 'A.Atk' },
    { cc: 74, param: 'slideTime', label: 'Slide' },
    { cc: 75, param: 'stageNLAmount', label: 'StgNL' },
    { cc: 76, param: 'ensembleAmount', label: 'Ensem' },
    { cc: 77, param: 'overdrive', label: 'Drive' },
  ],
  // Page 3: Korg
  [
    { cc: 70, param: 'korgBite', label: 'Bite' },
    { cc: 71, param: 'korgClip', label: 'Clip' },
    { cc: 72, param: 'korgCrossmod', label: 'XMod' },
    { cc: 73, param: 'korgQSag', label: 'Q.Sag' },
    { cc: 74, param: 'korgSharpness', label: 'Sharp' },
    { cc: 75, param: 'mixer.volume', label: '-' },
    { cc: 76, param: 'mixer.volume', label: '-' },
    { cc: 77, param: 'mixer.volume', label: '-' },
  ],
  // Page 4: LFO
  [
    { cc: 70, param: 'lfoRate', label: 'Rate' },
    { cc: 71, param: 'lfoContour', label: 'Contour' },
    { cc: 72, param: 'lfoPitchDepth', label: 'Pitch' },
    { cc: 73, param: 'lfoPwmDepth', label: 'PWM' },
    { cc: 74, param: 'lfoFilterDepth', label: 'Filter' },
    { cc: 75, param: 'lfoStiffDepth', label: 'Stiff' },
    { cc: 76, param: 'mixer.volume', label: '-' },
    { cc: 77, param: 'mixer.volume', label: '-' },
  ],
  // Page 5: FX
  [
    { cc: 70, param: 'chorusMix', label: 'Chorus' },
    { cc: 71, param: 'phaserRate', label: 'Ph.Rate' },
    { cc: 72, param: 'phaserFeedback', label: 'Ph.FB' },
    { cc: 73, param: 'phaserMix', label: 'Ph.Mix' },
    { cc: 74, param: 'delayTime', label: 'Dly.T' },
    { cc: 75, param: 'delayFeedback', label: 'Dly.FB' },
    { cc: 76, param: 'delayMix', label: 'Dly.Mix' },
    { cc: 77, param: 'delaySpread', label: 'Spread' },
  ],
  // Page 6: Oscillator
  [
    { cc: 70, param: 'tuning', label: 'Tune' },
    { cc: 71, param: 'waveform', label: 'Wave' },
    { cc: 72, param: 'pulseWidth', label: 'PWM' },
    { cc: 73, param: 'subOscGain', label: 'SubG' },
    { cc: 74, param: 'subOscBlend', label: 'SubB' },
    { cc: 75, param: 'pitchToPw', label: 'P→PW' },
    { cc: 76, param: 'mixer.volume', label: '-' },
    { cc: 77, param: 'mixer.volume', label: 'Volume' },
  ],
];

/** 303 tab names for LCD display (indexed by page number) */
const KNOB_303_PAGE_NAMES = ['303 Main', 'MOJO', 'DevilFish', 'Korg', 'LFO', 'FX', 'Oscillator'];

/**
 * Multi-page banks for Klystrack: 2 pages
 * Page 0 = Filter & Envelope (main sound shaping)
 * Page 1 = Modulation (vibrato, PWM, FM)
 */
const KNOB_KLYSTRACK_PAGES: KnobAssignment[][] = [
  KNOB_BANKS['Klystrack'],
  [
    { cc: 70, param: 'klystrack.cutoff', label: 'Cutoff' },
    { cc: 71, param: 'klystrack.resonance', label: 'Reso' },
    { cc: 72, param: 'mixer.filterPosition', label: 'Filter' },
    { cc: 73, param: 'mixer.filterResonance', label: 'Reso' },
    { cc: 74, param: 'mixer.pan', label: 'Pan' },
    { cc: 75, param: 'mixer.volume', label: 'Volume' },
    { cc: 76, param: 'masterFx.masterVolume', label: 'Master' },
    { cc: 77, param: 'masterFx.masterVolume', label: '-' },
  ],
];
const KNOB_KLYSTRACK_PAGE_NAMES = ['Synth', 'Mixer'];

/**
 * Multi-page banks for DX7: 2 pages
 * Page 0 = Main (algorithm, feedback, operators 1-3, LFO)
 * Page 1 = Operators 4-6 + mixer
 */
const KNOB_DX7_PAGES: KnobAssignment[][] = [
  KNOB_BANKS['DX7'],
  [
    { cc: 70, param: 'dx7.op1Level', label: 'Op1 Lvl' },
    { cc: 71, param: 'dx7.op2Level', label: 'Op2 Lvl' },
    { cc: 72, param: 'dx7.op3Level', label: 'Op3 Lvl' },
    { cc: 73, param: 'mixer.filterPosition', label: 'Filter' },
    { cc: 74, param: 'mixer.filterResonance', label: 'Reso' },
    { cc: 75, param: 'mixer.pan', label: 'Pan' },
    { cc: 76, param: 'mixer.volume', label: 'Volume' },
    { cc: 77, param: 'masterFx.masterVolume', label: 'Master' },
  ],
];
const KNOB_DX7_PAGE_NAMES = ['FM Main', 'Ops & Mix'];

/** Joystick axis mappings per bank (X = pitch bend, Y = CC1 mod wheel) */
export const JOYSTICK_MAP: Partial<Record<KnobBankMode, JoystickMapping>> = {
  '303': {
    x: { param: 'cutoff', min: 0, max: 1, curve: 'linear' },
    y: { param: 'resonance', min: 0, max: 1, curve: 'linear' },
  },
  'Siren': {
    x: { param: 'siren.osc.frequency', min: 60, max: 1500, curve: 'linear' },
    y: { param: 'siren.lfo.rate', min: 0.1, max: 20, curve: 'linear' },
  },
  'Furnace': {
    x: { param: 'furnace.fms', min: 0, max: 7, curve: 'linear' },
    y: { param: 'furnace.op1SL', min: 0, max: 15, curve: 'linear' },
  },
  'V2': {
    x: { param: 'v2.filter1Cutoff', min: 0, max: 127, curve: 'linear' },
    y: { param: 'v2.filter1Reso', min: 0, max: 127, curve: 'linear' },
  },
  'Synare': {
    x: { param: 'synare.filterCutoff', min: 20, max: 20000, curve: 'log' },
    y: { param: 'synare.filterEnvMod', min: 0, max: 100, curve: 'linear' },
  },
  'SpaceLaser': {
    x: { param: 'spacelaser.fmAmount', min: 0, max: 100, curve: 'linear' },
    y: { param: 'spacelaser.filterCutoff', min: 20, max: 20000, curve: 'log' },
  },
  'SAM': {
    x: { param: 'sam.pitch', min: 0, max: 255, curve: 'linear' },
    y: { param: 'sam.speed', min: 0, max: 255, curve: 'linear' },
  },
  'Organ': {
    x: { param: 'organ.vibratoDepth', min: 0, max: 1, curve: 'linear' },
    y: { param: 'organ.overdrive', min: 0, max: 1, curve: 'linear' },
  },
  'Melodica': {
    x: { param: 'melodica.vibratoRate', min: 0, max: 10, curve: 'linear' },
    y: { param: 'melodica.brightness', min: 0, max: 1, curve: 'linear' },
  },
};

/** Map a SynthType to the appropriate knob bank for auto-switching */
export function getKnobBankForSynth(synthType: SynthType): KnobBankMode | null {
  // TB-303 variants
  if (synthType === 'TB303' || synthType === 'Buzz3o3' || synthType === 'Buzz3o3DF') return '303';

  // DubSiren
  if (synthType === 'DubSiren') return 'Siren';

  // Furnace chips (all start with "Furnace")
  if (synthType.startsWith('Furnace')) return 'Furnace';

  // V2 variants
  if (synthType === 'V2' || synthType === 'V2Speech') return 'V2';

  // Synare percussion
  if (synthType === 'Synare') return 'Synare';

  // SpaceLaser
  if (synthType === 'SpaceLaser') return 'SpaceLaser';

  // SAM speech
  if (synthType === 'Sam') return 'SAM';

  // VSTBridge: TonewheelOrgan
  if (synthType === 'TonewheelOrgan') return 'Organ';

  // VSTBridge: Melodica
  if (synthType === 'Melodica') return 'Melodica';

  // Hively / AHX
  if (synthType === 'HivelySynth') return 'Hively';

  // Klystrack
  if (synthType === 'KlysSynth') return 'Klystrack';

  // DX7 / FM
  if (synthType === 'DX7') return 'DX7';

  // SidMon
  if (synthType === 'SidMonSynth') return 'SidMon';

  // SidMon 1.0
  if (synthType === 'SidMon1Synth') return 'SidMon1';

  // Sonic Arranger
  if (synthType === 'SonicArrangerSynth') return 'SonicArranger';

  // SoundMon
  if (synthType === 'SoundMonSynth') return 'SoundMon';

  // Hippel CoSo
  if (synthType === 'HippelCoSoSynth') return 'HippelCoSo';

  // Future Composer
  if (synthType === 'FCSynth' || synthType === 'FutureComposerWasmSynth') return 'FC';

  // Rob Hubbard
  if (synthType === 'RobHubbardSynth') return 'RobHubbard';

  // GTUltra (Game Boy)
  if (synthType === 'GTUltraSynth') return 'GTUltra';

  // Geonkick drum synth
  if (synthType === 'Geonkick') return 'Geonkick';

  // CZ-101
  if (synthType === 'CZ101') return 'CZ101';

  return null;
}

// ============================================================================
// NKS2-BASED KNOB BANK GENERATION
// Derives knob assignments from NKS2 performance profiles for any synth.
// Falls back to legacy KNOB_BANKS for synths with hardcoded banks.
// ============================================================================

import { getKnob8Params, getPerformanceParams } from './performance/synthParameterMaps';

/** CC numbers for the 8 knobs on Akai MPK Mini MK3 (CC 70-77) */
const KNOB_CC_START = 70;

/**
 * Generate a KnobAssignment array from NKS2 Performance mode params.
 * Returns 8 assignments mapped to CC 70-77.
 */
export function getKnobBankFromNKS2(synthType: SynthType): KnobAssignment[] {
  const nks2Params = getKnob8Params(synthType);

  return nks2Params.map((param, index) => ({
    cc: KNOB_CC_START + index,
    param: param.engineParam as MappableParameter,
    label: param.name.substring(0, 10), // Truncate for LCD display
  }));
}

/**
 * Get knob assignments for a synth, checking NKS2 first, legacy fallback second.
 * This is the unified entry point for the MIDI store.
 */
export function getKnobAssignmentsForSynth(synthType: SynthType): KnobAssignment[] {
  // 1. Check if there's a legacy knob bank for this synth
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank) {
    return KNOB_BANKS[legacyBank];
  }

  // 2. Fall back to NKS2-generated assignments
  const nks2Bank = getKnobBankFromNKS2(synthType);
  if (nks2Bank.length > 0) {
    return nks2Bank;
  }

  // 3. Last resort: master effects controls
  return KNOB_BANKS['MasterFX'];
}

/**
 * Get the display name for a synth's current knob page.
 * Used for LCD display on hardware controllers.
 */
export function getKnobPageName(synthType: SynthType, page?: number): string {
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank && page !== undefined) {
    const multi = getMultiPageBank(legacyBank);
    if (multi && page < multi.names.length) {
      return multi.names[page];
    }
  }
  if (legacyBank) return legacyBank;
  return synthType;
}

/**
 * Multi-page resolution helper — maps bank mode to its page array + names.
 */
function getMultiPageBank(legacyBank: KnobBankMode): { pages: KnobAssignment[][], names: string[] } | null {
  switch (legacyBank) {
    case '303': return { pages: KNOB_303_PAGES, names: KNOB_303_PAGE_NAMES };
    case 'Klystrack': return { pages: KNOB_KLYSTRACK_PAGES, names: KNOB_KLYSTRACK_PAGE_NAMES };
    case 'DX7': return { pages: KNOB_DX7_PAGES, names: KNOB_DX7_PAGE_NAMES };
    default: return null;
  }
}

/**
 * Get knob assignments for a specific page of an NKS2 profile.
 * page 0 = params [0..7], page 1 = params [8..15].
 * Falls back to legacy KNOB_BANKS (1 page only) or Mixer as last resort.
 * Multi-page synths (303, Klystrack, DX7) have dedicated page arrays.
 */
export function getKnobAssignmentsForPage(synthType: SynthType, page: number): KnobAssignment[] {
  const legacyBank = getKnobBankForSynth(synthType);

  // Multi-page legacy banks
  if (legacyBank) {
    const multi = getMultiPageBank(legacyBank);
    if (multi) {
      return page >= 0 && page < multi.pages.length ? multi.pages[page] : [];
    }
    // Single-page legacy bank
    return page === 0 ? KNOB_BANKS[legacyBank] : [];
  }

  // NKS2: get all performance params (up to 16), slice into 8-knob pages
  const allParams = getPerformanceParams(synthType);
  if (allParams.length === 0) {
    return page === 0 ? KNOB_BANKS['MasterFX'] : [];
  }

  const start = page * 8;
  const pageParams = allParams.slice(start, start + 8);
  return pageParams.map((param, index) => ({
    cc: KNOB_CC_START + index,
    param: param.engineParam as MappableParameter,
    label: param.name.substring(0, 10),
  }));
}

/**
 * Get total page count for a synth's NKS2 profile.
 * Legacy synths = 1 page (except multi-page banks). NKS2 synths = ceil(performanceParams / 8).
 */
export function getKnobPageCount(synthType: SynthType): number {
  const legacyBank = getKnobBankForSynth(synthType);
  if (legacyBank) {
    const multi = getMultiPageBank(legacyBank);
    return multi ? multi.pages.length : 1;
  }

  const allParams = getPerformanceParams(synthType);
  if (allParams.length === 0) return 1; // Mixer fallback = 1 page
  return Math.ceil(allParams.length / 8);
}
