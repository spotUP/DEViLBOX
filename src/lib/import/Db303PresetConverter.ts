/**
 * DB303 Preset Converter
 * Utilities for importing/exporting db303.pages.dev XML presets
 * All parameters use 0-1 normalized ranges to match source truth.
 */

import type { TB303Config } from '@typedefs/instrument';

/**
 * Parse db303 XML preset string into TB303Config
 */
export function parseDb303Preset(xmlString: string): Partial<TB303Config> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parsing errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid XML: ' + parserError.textContent);
  }

  const config: Partial<TB303Config> = {};

  // Helper to get float value from XML
  const getFloat = (selector: string, fallback: number = 0): number => {
    const el = doc.querySelector(selector);
    if (!el) return fallback;
    const val = parseFloat(el.textContent || '');
    return isNaN(val) ? fallback : val;
  };

  // Helper to get int value from XML
  const getInt = (selector: string, fallback: number = 0): number => {
    const el = doc.querySelector(selector);
    if (!el) return fallback;
    const val = parseInt(el.textContent || '');
    return isNaN(val) ? fallback : val;
  };

  // Parse oscillator section
  const oscNode = doc.querySelector('oscillator');
  if (oscNode) {
    // DB303 waveform: 0.0 = pure sawtooth, 1.0 = pure square, values between = morph
    const waveformValue = getFloat('oscillator waveform', 0);
    config.oscillator = {
      type: waveformValue >= 0.5 ? 'square' : 'sawtooth',
      waveformBlend: waveformValue, // Store actual blend value
      pulseWidth: getFloat('oscillator pulseWidth', 0),
      subOscGain: getFloat('oscillator subOscGain', 0),
      subOscBlend: getFloat('oscillator subOscBlend', 1),
    };
    console.log('[Db303PresetConverter] Parsed oscillator:', { waveformValue, waveformBlend: waveformValue, type: config.oscillator.type });
  }

  // Parse filter section
  const filterNode = doc.querySelector('filter');
  if (filterNode) {
    config.filter = {
      cutoff: getFloat('filter cutoff', 0.5),
      resonance: getFloat('filter resonance', 0.5),
    };

    config.filterEnvelope = {
      envMod: getFloat('filter envMod', 0.5),
      decay: getFloat('filter decay', 0.5),
    };

    config.accent = {
      amount: getFloat('filter accent', 0.5),
    };
    
    console.log('[Db303PresetConverter] Parsed filter:', config.filter, 'envMod:', config.filterEnvelope.envMod);
  }

  // Parse devilfish section
  const dfNode = doc.querySelector('devilfish');
  if (dfNode) {
    // filterSelect: 255 means "default" in DB303, map to 0 (default filter)
    // The web app's engine initializes with filterSelect=0 before loading presets.
    // Invalid values (>5) are ignored by the WASM, keeping the previous value (0).
    let filterSelect = getInt('devilfish filterSelect', 0);
    if (filterSelect < 0 || filterSelect > 5) {
      filterSelect = 0; // Default filter (matches web app behavior)
    }
    
    config.devilFish = {
      enabled: true,
      normalDecay: getFloat('devilfish normalDecay', 0.5),
      accentDecay: getFloat('devilfish accentDecay', 0.5),
      softAttack: getFloat('devilfish softAttack', 0),
      accentSoftAttack: getFloat('devilfish accentSoftAttack', 0.5),
      passbandCompensation: getFloat('devilfish passbandCompensation', 0.9),
      resTracking: 1 - getFloat('devilfish resTracking', 0.3), // XML stores inverted value (db303 format); app default knob=0.7
      filterInputDrive: getFloat('devilfish filterInputDrive', 0),
      filterSelect,
      diodeCharacter: getFloat('devilfish diodeCharacter', 0),
      duffingAmount: getFloat('devilfish duffingAmount', 0),
      filterFmDepth: getFloat('devilfish filterFmDepth', 0),
      lpBpMix: getFloat('devilfish lpBpMix', 0),
      filterTracking: getFloat('devilfish filterTracking', 0),
      stageNLAmount: getFloat('devilfish stageNLAmount', 0),
      ensembleAmount: getFloat('devilfish ensembleAmount', 0),
      oversamplingOrder: getInt('devilfish oversamplingOrder', 2) as 0 | 1 | 2 | 3 | 4,
      accentSweepEnabled: true,
      sweepSpeed: 'normal',
      highResonance: config.filter?.resonance ? config.filter.resonance > 0.85 : false,
      muffler: 'off',
      vegDecay: 0.5,
      vegSustain: 0,
    };

    config.slide = {
      time: getFloat('devilfish slideTime', 0.17),
      mode: 'exponential',
    };
  }

  // Parse LFO section
  const lfoNode = doc.querySelector('lfo');
  if (lfoNode) {
    config.lfo = {
      waveform: getInt('lfo waveform', 0),
      rate: getFloat('lfo rate', 0.5),
      contour: getFloat('lfo contour', 0),
      pitchDepth: getFloat('lfo pitchDepth', 0),
      pwmDepth: getFloat('lfo pwmDepth', 0),
      filterDepth: getFloat('lfo filterDepth', 0),
      stiffDepth: getFloat('lfo stiffDepth', 0),
    };
  }

  // Parse chorus section
  const chorusNode = doc.querySelector('chorus');
  if (chorusNode) {
    const mix = getFloat('chorus mix', 0.5);
    const mode = getInt('chorus mode', 0);
    config.chorus = {
      enabled: mode > 0, // Mode 0 = Off, regardless of mix value
      mode: mode as 0 | 1 | 2 | 3 | 4,
      mix: mode > 0 ? mix : 0, // If mode is Off, mix should be 0
    };
  }

  // Parse phaser section
  const phaserNode = doc.querySelector('phaser');
  if (phaserNode) {
    const mix = getFloat('phaser mix', 0);
    config.phaser = {
      enabled: mix > 0.01,
      rate: getFloat('phaser rate', 0.5),
      depth: getFloat('phaser width', 0.7),
      feedback: getFloat('phaser feedback', 0),
      mix: mix,
    };
  }

  // Parse delay section
  const delayNode = doc.querySelector('delay');
  if (delayNode) {
    const mix = getFloat('delay mix', 0);
    // DB303 delay time is raw 0-16 (16th note subdivisions) — store as-is
    const timeSixteenths = getFloat('delay time', 4);
    config.delay = {
      enabled: mix > 0.01,
      time: timeSixteenths, // Raw 0-16 value passed directly to WASM
      feedback: getFloat('delay feedback', 0.3),
      tone: getFloat('delay tone', 0.5),
      mix: mix,
      stereo: getFloat('delay spread', 0.5),
    };
  }

  return config;
}

/**
 * Convert TB303Config to db303 XML preset string
 */
export function convertToDb303Preset(config: TB303Config): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<db303-preset version="1.0">');

  // Oscillator section
  lines.push('  <oscillator>');
  lines.push(`    <waveform>${config.oscillator.type === 'square' ? 1 : 0}</waveform>`);
  lines.push(`    <pulseWidth>${(config.oscillator.pulseWidth ?? 0).toFixed(3)}</pulseWidth>`);
  lines.push(`    <subOscGain>${(config.oscillator.subOscGain ?? 0).toFixed(3)}</subOscGain>`);
  lines.push(`    <subOscBlend>${(config.oscillator.subOscBlend ?? 1).toFixed(3)}</subOscBlend>`);
  lines.push('  </oscillator>');

  // Filter section
  lines.push('  <filter>');
  lines.push(`    <cutoff>${(config.filter.cutoff ?? 0.5).toFixed(3)}</cutoff>`);
  lines.push(`    <resonance>${(config.filter.resonance ?? 0.5).toFixed(3)}</resonance>`);
  lines.push(`    <envMod>${(config.filterEnvelope.envMod ?? 0.5).toFixed(3)}</envMod>`);
  lines.push(`    <decay>${(config.filterEnvelope.decay ?? 0.5).toFixed(3)}</decay>`);
  lines.push(`    <accent>${(config.accent.amount ?? 0.5).toFixed(3)}</accent>`);
  lines.push('  </filter>');

  // Devil Fish section
  const df = config.devilFish;
  if (df) {
    lines.push('  <devilfish>');
    lines.push(`    <normalDecay>${(df.normalDecay ?? 0.5).toFixed(3)}</normalDecay>`);
    lines.push(`    <accentDecay>${(df.accentDecay ?? 0.5).toFixed(3)}</accentDecay>`);
    lines.push(`    <softAttack>${(df.softAttack ?? 0).toFixed(3)}</softAttack>`);
    lines.push(`    <accentSoftAttack>${(df.accentSoftAttack ?? 0.5).toFixed(3)}</accentSoftAttack>`);
    lines.push(`    <passbandCompensation>${(df.passbandCompensation ?? 0.9).toFixed(3)}</passbandCompensation>`);
    lines.push(`    <resTracking>${(1 - (df.resTracking ?? 0.7)).toFixed(3)}</resTracking>`);
    lines.push(`    <filterInputDrive>${(df.filterInputDrive ?? 0).toFixed(3)}</filterInputDrive>`);
    lines.push(`    <filterSelect>${df.filterSelect ?? 1}</filterSelect>`);
    lines.push(`    <diodeCharacter>${(df.diodeCharacter ?? 0).toFixed(3)}</diodeCharacter>`);
    lines.push(`    <duffingAmount>${(df.duffingAmount ?? 0).toFixed(3)}</duffingAmount>`);
    lines.push(`    <filterFmDepth>${(df.filterFmDepth ?? 0).toFixed(3)}</filterFmDepth>`);
    lines.push(`    <lpBpMix>${(df.lpBpMix ?? 0).toFixed(3)}</lpBpMix>`);
    lines.push(`    <stageNLAmount>${(df.stageNLAmount ?? 0).toFixed(3)}</stageNLAmount>`);
    lines.push(`    <ensembleAmount>${(df.ensembleAmount ?? 0).toFixed(3)}</ensembleAmount>`);
    lines.push(`    <oversamplingOrder>${df.oversamplingOrder ?? 2}</oversamplingOrder>`);
    lines.push(`    <filterTracking>${(df.filterTracking ?? 0).toFixed(3)}</filterTracking>`);
    lines.push(`    <slideTime>${(config.slide?.time ?? 0.17).toFixed(3)}</slideTime>`);
    lines.push('  </devilfish>');
  }

  // LFO section
  const lfo = config.lfo;
  if (lfo) {
    lines.push('  <lfo>');
    lines.push(`    <waveform>${lfo.waveform ?? 0}</waveform>`);
    lines.push(`    <rate>${(lfo.rate ?? 0.5).toFixed(3)}</rate>`);
    lines.push(`    <contour>${(lfo.contour ?? 0).toFixed(3)}</contour>`);
    lines.push(`    <pitchDepth>${(lfo.pitchDepth ?? 0).toFixed(3)}</pitchDepth>`);
    lines.push(`    <pwmDepth>${(lfo.pwmDepth ?? 0).toFixed(3)}</pwmDepth>`);
    lines.push(`    <filterDepth>${(lfo.filterDepth ?? 0).toFixed(3)}</filterDepth>`);
    lines.push(`    <stiffDepth>${(lfo.stiffDepth ?? 0).toFixed(3)}</stiffDepth>`);
    lines.push('  </lfo>');
  }

  // Chorus section
  const chorus = config.chorus;
  if (chorus) {
    lines.push('  <chorus>');
    lines.push(`    <mode>${chorus.mode ?? 0}</mode>`);
    lines.push(`    <mix>${(chorus.mix ?? 0.5).toFixed(3)}</mix>`);
    lines.push('  </chorus>');
  }

  // Phaser section
  const phaser = config.phaser;
  if (phaser) {
    lines.push('  <phaser>');
    lines.push(`    <rate>${(phaser.rate ?? 0.5).toFixed(3)}</rate>`);
    lines.push(`    <width>${(phaser.depth ?? 0.7).toFixed(3)}</width>`);
    lines.push(`    <feedback>${(phaser.feedback ?? 0).toFixed(3)}</feedback>`);
    lines.push(`    <mix>${(phaser.mix ?? 0).toFixed(3)}</mix>`);
    lines.push('  </phaser>');
  }

  // Delay section
  const delay = config.delay;
  if (delay) {
    lines.push('  <delay>');
    lines.push(`    <time>${(delay.time ?? 3).toFixed(3)}</time>`);
    lines.push(`    <feedback>${(delay.feedback ?? 0.3).toFixed(3)}</feedback>`);
    lines.push(`    <tone>${(delay.tone ?? 0.5).toFixed(3)}</tone>`);
    lines.push(`    <mix>${(delay.mix ?? 0).toFixed(3)}</mix>`);
    lines.push(`    <spread>${(delay.stereo ?? 0.5).toFixed(3)}</spread>`);
    lines.push('  </delay>');
  }

  lines.push('</db303-preset>');
  return lines.join('\n');
}