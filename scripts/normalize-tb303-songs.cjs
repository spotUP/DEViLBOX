#!/usr/bin/env node
/**
 * Normalize TB303 parameters in all .dbox song files
 * Converts old Hz/ms/% format to normalized 0-1 format
 */

const fs = require('fs');
const path = require('path');

// Normalization functions
const norm = (v, min, max) => {
  if (v >= 0 && v <= 1) return v;
  return Math.log(v / min) / Math.log(max / min);
};

const normPercent = (v) => {
  if (v >= 0 && v <= 1) return v;
  return v / 100;
};

const CUTOFF_MIN = 314, CUTOFF_MAX = 2394;
const DECAY_MIN = 200, DECAY_MAX = 2000;
const SLIDE_MIN = 2, SLIDE_MAX = 360;

// Find all .dbox files
const songsDir = path.join(__dirname, '../public/data/songs');
const files = fs.readdirSync(songsDir).filter(f => f.endsWith('.dbox'));

let fixedCount = 0;

files.forEach(file => {
  const filepath = path.join(songsDir, file);
  const content = fs.readFileSync(filepath, 'utf8');
  const data = JSON.parse(content);
  let modified = false;
  
  if (data.instruments) {
    data.instruments.forEach(inst => {
      if ((inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3') && inst.tb303) {
        const tb = inst.tb303;
        
        // Fix filter
        if (tb.filter?.cutoff > 1) { tb.filter.cutoff = norm(tb.filter.cutoff, CUTOFF_MIN, CUTOFF_MAX); modified = true; }
        if (tb.filter?.resonance > 1) { tb.filter.resonance = normPercent(tb.filter.resonance); modified = true; }
        
        // Fix envelope
        if (tb.filterEnvelope?.envMod > 1) { tb.filterEnvelope.envMod = normPercent(tb.filterEnvelope.envMod); modified = true; }
        if (tb.filterEnvelope?.decay > 1) { tb.filterEnvelope.decay = norm(tb.filterEnvelope.decay, DECAY_MIN, DECAY_MAX); modified = true; }
        
        // Fix accent
        if (tb.accent?.amount > 1) { tb.accent.amount = normPercent(tb.accent.amount); modified = true; }
        
        // Fix slide
        if (tb.slide?.time > 1) { tb.slide.time = norm(tb.slide.time, SLIDE_MIN, SLIDE_MAX); modified = true; }
        
        // Fix oscillator
        if (tb.oscillator?.pulseWidth > 1) { tb.oscillator.pulseWidth = normPercent(tb.oscillator.pulseWidth); modified = true; }
        if (tb.oscillator?.subOscGain > 1) { tb.oscillator.subOscGain = normPercent(tb.oscillator.subOscGain); modified = true; }
        if (tb.oscillator?.subOscBlend > 1) { tb.oscillator.subOscBlend = normPercent(tb.oscillator.subOscBlend); modified = true; }
        
        // Fix overdrive
        if (tb.overdrive?.amount > 1) { tb.overdrive.amount = normPercent(tb.overdrive.amount); modified = true; }
        
        // Fix Devil Fish
        if (tb.devilFish) {
          const df = tb.devilFish;
          if (df.normalDecay > 1) { df.normalDecay = normPercent(df.normalDecay); modified = true; }
          if (df.accentDecay > 1) { df.accentDecay = normPercent(df.accentDecay); modified = true; }
          if (df.softAttack > 1) { df.softAttack = normPercent(df.softAttack); modified = true; }
          if (df.accentSoftAttack > 1) { df.accentSoftAttack = normPercent(df.accentSoftAttack); modified = true; }
          if (df.passbandCompensation > 1) { df.passbandCompensation = normPercent(df.passbandCompensation); modified = true; }
          if (df.resTracking > 1) { df.resTracking = normPercent(df.resTracking); modified = true; }
          if (df.duffingAmount > 1) { df.duffingAmount = normPercent(df.duffingAmount); modified = true; }
          if (df.lpBpMix > 1) { df.lpBpMix = normPercent(df.lpBpMix); modified = true; }
          if (df.stageNLAmount > 1) { df.stageNLAmount = normPercent(df.stageNLAmount); modified = true; }
          if (df.ensembleAmount > 1) { df.ensembleAmount = normPercent(df.ensembleAmount); modified = true; }
          if (df.filterTracking > 1) { df.filterTracking = normPercent(df.filterTracking); modified = true; }
          if (df.filterFmDepth > 1) { df.filterFmDepth = normPercent(df.filterFmDepth); modified = true; }
          if (df.diodeCharacter > 1) { df.diodeCharacter = normPercent(df.diodeCharacter); modified = true; }
          if (df.vegSustain > 1) { df.vegSustain = normPercent(df.vegSustain); modified = true; }
          if (df.vegDecay > 1) { df.vegDecay = norm(df.vegDecay, DECAY_MIN, DECAY_MAX); modified = true; }
        }
        
        // Fix LFO
        if (tb.lfo) {
          if (tb.lfo.rate > 1) { tb.lfo.rate = normPercent(tb.lfo.rate); modified = true; }
          if (tb.lfo.contour > 1) { tb.lfo.contour = normPercent(tb.lfo.contour); modified = true; }
          if (tb.lfo.pitchDepth > 1) { tb.lfo.pitchDepth = normPercent(tb.lfo.pitchDepth); modified = true; }
          if (tb.lfo.pwmDepth > 1) { tb.lfo.pwmDepth = normPercent(tb.lfo.pwmDepth); modified = true; }
          if (tb.lfo.filterDepth > 1) { tb.lfo.filterDepth = normPercent(tb.lfo.filterDepth); modified = true; }
        }
        
        // Fix effects
        if (tb.chorus?.mix > 1) { tb.chorus.mix = normPercent(tb.chorus.mix); modified = true; }
        if (tb.phaser) {
          if (tb.phaser.rate > 1) { tb.phaser.rate = normPercent(tb.phaser.rate); modified = true; }
          if (tb.phaser.depth > 1) { tb.phaser.depth = normPercent(tb.phaser.depth); modified = true; }
          if (tb.phaser.feedback > 1) { tb.phaser.feedback = normPercent(tb.phaser.feedback); modified = true; }
          if (tb.phaser.mix > 1) { tb.phaser.mix = normPercent(tb.phaser.mix); modified = true; }
        }
        if (tb.delay) {
          if (tb.delay.feedback > 1) { tb.delay.feedback = normPercent(tb.delay.feedback); modified = true; }
          if (tb.delay.tone > 1) { tb.delay.tone = normPercent(tb.delay.tone); modified = true; }
          if (tb.delay.mix > 1) { tb.delay.mix = normPercent(tb.delay.mix); modified = true; }
          if (tb.delay.stereo > 1) { tb.delay.stereo = normPercent(tb.delay.stereo); modified = true; }
        }
      }
    });
  }
  
  if (modified) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log('✓ Fixed: ' + file);
    fixedCount++;
  }
});

console.log(`\n✓ Fixed ${fixedCount} of ${files.length} files`);
