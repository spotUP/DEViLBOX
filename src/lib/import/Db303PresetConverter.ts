/**
 * DB303 Preset Converter
 * Utilities for importing/exporting db303.pages.dev XML presets
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

  // Parse oscillator section
  const oscNode = doc.querySelector('oscillator');
  if (oscNode) {
    const waveform = parseInt(oscNode.querySelector('waveform')?.textContent || '0');
    const pulseWidth = parseFloat(oscNode.querySelector('pulseWidth')?.textContent || '0.5');
    const subOscGain = parseFloat(oscNode.querySelector('subOscGain')?.textContent || '0');
    const subOscBlend = parseFloat(oscNode.querySelector('subOscBlend')?.textContent || '0');

    config.oscillator = {
      type: waveform === 0 ? 'sawtooth' : 'square',
      pulseWidth: pulseWidth * 100,      // 0-1 → 0-100
      subOscGain: subOscGain * 100,      // 0-1 → 0-100
      subOscBlend: subOscBlend * 100,    // 0-1 → 0-100
    };
  }

  // Parse filter section
  const filterNode = doc.querySelector('filter');
  if (filterNode) {
    const cutoff = parseFloat(filterNode.querySelector('cutoff')?.textContent || '0.5');
    const resonance = parseFloat(filterNode.querySelector('resonance')?.textContent || '0.5');
    const envMod = parseFloat(filterNode.querySelector('envMod')?.textContent || '0.5');
    const decay = parseFloat(filterNode.querySelector('decay')?.textContent || '0.5');
    const accent = parseFloat(filterNode.querySelector('accent')?.textContent || '0.5');

    // Convert normalized values to actual ranges
    // Cutoff: 0-1 → 200-5000 Hz (logarithmic mapping)
    const minCutoff = 200;
    const maxCutoff = 5000;
    const cutoffHz = minCutoff * Math.pow(maxCutoff / minCutoff, cutoff);

    // Decay: 0-1 → 30-3000 ms (logarithmic mapping for Devil Fish range)
    const minDecay = 30;
    const maxDecay = 3000;
    const decayMs = minDecay * Math.pow(maxDecay / minDecay, decay);

    config.filter = {
      cutoff: Math.round(cutoffHz),
      resonance: resonance * 100,
    };

    config.filterEnvelope = {
      envMod: envMod * 100,
      decay: Math.round(decayMs),
    };

    config.accent = {
      amount: accent * 100,
    };
  }

  // Parse devilfish section
  const dfNode = doc.querySelector('devilfish');
  if (dfNode) {
    const normalDecay = parseFloat(dfNode.querySelector('normalDecay')?.textContent || '0.164');
    const accentDecay = parseFloat(dfNode.querySelector('accentDecay')?.textContent || '0.006');
    const softAttack = parseFloat(dfNode.querySelector('softAttack')?.textContent || '0');
    const accentSoftAttack = parseFloat(dfNode.querySelector('accentSoftAttack')?.textContent || '0.1');
    const passbandComp = parseFloat(dfNode.querySelector('passbandCompensation')?.textContent || '0.09');
    const resTracking = parseFloat(dfNode.querySelector('resTracking')?.textContent || '0.743');
    // filterInputDrive not currently mapped to TB303Config
    const filterSelect = parseInt(dfNode.querySelector('filterSelect')?.textContent || '255');
    const diodeChar = parseFloat(dfNode.querySelector('diodeCharacter')?.textContent || '1');
    const duffing = parseFloat(dfNode.querySelector('duffingAmount')?.textContent || '0.03');
    const filterFm = parseFloat(dfNode.querySelector('filterFmDepth')?.textContent || '0');
    const lpBpMix = parseFloat(dfNode.querySelector('lpBpMix')?.textContent || '0');
    const stageNL = parseFloat(dfNode.querySelector('stageNLAmount')?.textContent || '0');
    const ensemble = parseFloat(dfNode.querySelector('ensembleAmount')?.textContent || '0');
    const oversampling = parseInt(dfNode.querySelector('oversamplingOrder')?.textContent || '2');
    const filterTracking = parseFloat(dfNode.querySelector('filterTracking')?.textContent || '0');
    const slideTime = parseFloat(dfNode.querySelector('slideTime')?.textContent || '0.17');

    // Slide time: 0-1 → 2-360 ms
    const minSlide = 2;
    const maxSlide = 360;
    const slideMs = minSlide + slideTime * (maxSlide - minSlide);

    config.slide = {
      time: Math.round(slideMs),
      mode: 'exponential',
    };

    config.devilFish = {
      enabled: true,
      // From XML
      normalDecay: normalDecay * 100,
      accentDecay: accentDecay * 100,
      accentSoftAttack: accentSoftAttack * 100,
      passbandCompensation: passbandComp * 100,
      resTracking: resTracking * 100,
      duffingAmount: duffing * 100,
      lpBpMix: lpBpMix * 100,
      stageNLAmount: stageNL * 100,
      filterSelect: filterSelect,
      diodeCharacter: diodeChar * 100,
      ensembleAmount: ensemble * 100,
      oversamplingOrder: oversampling as 0 | 1 | 2 | 3 | 4,
      filterTracking: filterTracking * 100,
      filterFM: filterFm * 100,
      // Required fields not in XML - use defaults
      vegDecay: 1230,            // rosic default
      vegSustain: 0,             // 0% = decay to silence (tracker-style)
      softAttack: softAttack * 100,
      sweepSpeed: 'normal',
      accentSweepEnabled: true,
      highResonance: false,
      muffler: 'soft',
    };
  }

  // Parse LFO section
  const lfoNode = doc.querySelector('lfo');
  if (lfoNode) {
    const waveform = parseInt(lfoNode.querySelector('waveform')?.textContent || '0');
    const rate = parseFloat(lfoNode.querySelector('rate')?.textContent || '0');
    const contour = parseFloat(lfoNode.querySelector('contour')?.textContent || '0');
    const pitchDepth = parseFloat(lfoNode.querySelector('pitchDepth')?.textContent || '0');
    const pwmDepth = parseFloat(lfoNode.querySelector('pwmDepth')?.textContent || '0');
    const filterDepth = parseFloat(lfoNode.querySelector('filterDepth')?.textContent || '0');

    config.lfo = {
      waveform: waveform as 0 | 1 | 2,
      rate: rate * 100,
      contour: contour * 100,
      pitchDepth: pitchDepth * 100,
      pwmDepth: pwmDepth * 100,
      filterDepth: filterDepth * 100,
    };
  }

  // Parse chorus section
  const chorusNode = doc.querySelector('chorus');
  if (chorusNode) {
    const mode = parseInt(chorusNode.querySelector('mode')?.textContent || '0');
    const mix = parseFloat(chorusNode.querySelector('mix')?.textContent || '0.5');

    config.chorus = {
      enabled: mix > 0.01,  // Enable if mix > 1%
      mode: mode as 0 | 1 | 2,
      mix: mix * 100,
    };
  }

  // Parse phaser section
  const phaserNode = doc.querySelector('phaser');
  if (phaserNode) {
    const rate = parseFloat(phaserNode.querySelector('rate')?.textContent || '0.5');
    const width = parseFloat(phaserNode.querySelector('width')?.textContent || '0.7');
    const feedback = parseFloat(phaserNode.querySelector('feedback')?.textContent || '0');
    const mix = parseFloat(phaserNode.querySelector('mix')?.textContent || '0');

    config.phaser = {
      enabled: mix > 0.01,  // Enable if mix > 1%
      rate: rate * 100,
      depth: width * 100,  // width → depth
      feedback: feedback * 100,
      mix: mix * 100,
    };
  }

  // Parse delay section
  const delayNode = doc.querySelector('delay');
  if (delayNode) {
    const time = parseFloat(delayNode.querySelector('time')?.textContent || '3');
    const feedback = parseFloat(delayNode.querySelector('feedback')?.textContent || '0.3');
    const tone = parseFloat(delayNode.querySelector('tone')?.textContent || '0.5');
    const mix = parseFloat(delayNode.querySelector('mix')?.textContent || '0');
    const spread = parseFloat(delayNode.querySelector('spread')?.textContent || '0.5');

    // Convert time from beats to ms (assuming 120 BPM = 500ms per beat)
    const timeMs = time * 500;

    config.delay = {
      enabled: mix > 0.01,  // Enable if mix > 1%
      time: Math.round(timeMs),
      feedback: feedback * 100,
      tone: tone * 100,
      mix: mix * 100,
      stereo: spread * 100,
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
  lines.push(`    <pulseWidth>${((config.oscillator.pulseWidth ?? 50) / 100).toFixed(3)}</pulseWidth>`);
  lines.push(`    <subOscGain>${((config.oscillator.subOscGain ?? 0) / 100).toFixed(3)}</subOscGain>`);
  lines.push(`    <subOscBlend>${((config.oscillator.subOscBlend ?? 0) / 100).toFixed(3)}</subOscBlend>`);
  lines.push('  </oscillator>');

  // Filter section
  lines.push('  <filter>');
  // Convert cutoff from Hz to 0-1 (inverse logarithmic)
  const cutoffNorm = Math.log(config.filter.cutoff / 200) / Math.log(5000 / 200);
  lines.push(`    <cutoff>${cutoffNorm.toFixed(3)}</cutoff>`);
  lines.push(`    <resonance>${(config.filter.resonance / 100).toFixed(3)}</resonance>`);
  lines.push(`    <envMod>${(config.filterEnvelope.envMod / 100).toFixed(3)}</envMod>`);
  // Convert decay from ms to 0-1 (inverse logarithmic)
  const decayNorm = Math.log(config.filterEnvelope.decay / 30) / Math.log(3000 / 30);
  lines.push(`    <decay>${decayNorm.toFixed(3)}</decay>`);
  lines.push(`    <accent>${(config.accent.amount / 100).toFixed(3)}</accent>`);
  lines.push('  </filter>');

  // Devil Fish section
  const df = config.devilFish;
  if (df) {
    lines.push('  <devilfish>');
    lines.push(`    <normalDecay>${((df.normalDecay ?? 0) / 100).toFixed(3)}</normalDecay>`);
    lines.push(`    <accentDecay>${((df.accentDecay ?? 0) / 100).toFixed(3)}</accentDecay>`);
    lines.push(`    <softAttack>0</softAttack>`);
    lines.push(`    <accentSoftAttack>${((df.accentSoftAttack ?? 0) / 100).toFixed(3)}</accentSoftAttack>`);
    lines.push(`    <passbandCompensation>${((df.passbandCompensation ?? 9) / 100).toFixed(3)}</passbandCompensation>`);
    lines.push(`    <resTracking>${((df.resTracking ?? 74.3) / 100).toFixed(3)}</resTracking>`);
    lines.push(`    <filterInputDrive>0.169</filterInputDrive>`);
    lines.push(`    <filterSelect>${df.filterSelect ?? 255}</filterSelect>`);
    lines.push(`    <diodeCharacter>${((df.diodeCharacter ?? 100) / 100).toFixed(3)}</diodeCharacter>`);
    lines.push(`    <duffingAmount>${((df.duffingAmount ?? 3) / 100).toFixed(3)}</duffingAmount>`);
    lines.push(`    <filterFmDepth>${((df.filterFM ?? 0) / 100).toFixed(3)}</filterFmDepth>`);
    lines.push(`    <lpBpMix>${((df.lpBpMix ?? 0) / 100).toFixed(3)}</lpBpMix>`);
    lines.push(`    <stageNLAmount>${((df.stageNLAmount ?? 0) / 100).toFixed(3)}</stageNLAmount>`);
    lines.push(`    <ensembleAmount>${((df.ensembleAmount ?? 0) / 100).toFixed(3)}</ensembleAmount>`);
    lines.push(`    <oversamplingOrder>${df.oversamplingOrder ?? 2}</oversamplingOrder>`);
    lines.push(`    <filterTracking>${((df.filterTracking ?? 0) / 100).toFixed(3)}</filterTracking>`);
    // Convert slide time from ms to 0-1
    const slideNorm = ((config.slide?.time ?? 60) - 2) / (360 - 2);
    lines.push(`    <slideTime>${slideNorm.toFixed(3)}</slideTime>`);
    lines.push('  </devilfish>');
  }

  // LFO section
  const lfo = config.lfo;
  if (lfo) {
    lines.push('  <lfo>');
    lines.push(`    <waveform>${lfo.waveform ?? 0}</waveform>`);
    lines.push(`    <rate>${((lfo.rate ?? 0) / 100).toFixed(3)}</rate>`);
    lines.push(`    <contour>${((lfo.contour ?? 0) / 100).toFixed(3)}</contour>`);
    lines.push(`    <pitchDepth>${((lfo.pitchDepth ?? 0) / 100).toFixed(3)}</pitchDepth>`);
    lines.push(`    <pwmDepth>${((lfo.pwmDepth ?? 0) / 100).toFixed(3)}</pwmDepth>`);
    lines.push(`    <filterDepth>${((lfo.filterDepth ?? 0) / 100).toFixed(3)}</filterDepth>`);
    lines.push('  </lfo>');
  }

  // Chorus section
  const chorus = config.chorus;
  if (chorus) {
    lines.push('  <chorus>');
    lines.push(`    <mode>${chorus.mode ?? 1}</mode>`);
    lines.push(`    <mix>${((chorus.mix ?? 30) / 100).toFixed(3)}</mix>`);
    lines.push('  </chorus>');
  }

  // Phaser section
  const phaser = config.phaser;
  if (phaser) {
    lines.push('  <phaser>');
    lines.push(`    <rate>${((phaser.rate ?? 50) / 100).toFixed(3)}</rate>`);
    lines.push(`    <width>${((phaser.depth ?? 50) / 100).toFixed(3)}</width>`);
    lines.push(`    <feedback>${((phaser.feedback ?? 30) / 100).toFixed(3)}</feedback>`);
    lines.push(`    <mix>${((phaser.mix ?? 30) / 100).toFixed(3)}</mix>`);
    lines.push('  </phaser>');
  }

  // Delay section
  const delay = config.delay;
  if (delay) {
    lines.push('  <delay>');
    // Convert time from ms to beats (500ms per beat at 120 BPM)
    const timeBeats = (delay.time ?? 250) / 500;
    lines.push(`    <time>${timeBeats.toFixed(3)}</time>`);
    lines.push(`    <feedback>${((delay.feedback ?? 30) / 100).toFixed(3)}</feedback>`);
    lines.push(`    <tone>${((delay.tone ?? 70) / 100).toFixed(3)}</tone>`);
    lines.push(`    <mix>${((delay.mix ?? 25) / 100).toFixed(3)}</mix>`);
    lines.push(`    <spread>${((delay.stereo ?? 50) / 100).toFixed(3)}</spread>`);
    lines.push('  </delay>');
  }

  lines.push('</db303-preset>');
  return lines.join('\n');
}
