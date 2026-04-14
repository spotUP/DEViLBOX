/**
 * fxPresets.ts — Unified effect preset library.
 *
 * Single source of truth for ALL effect presets in DEViLBOX.
 * Any preset can be used on any bus (master, channel insert, send return, instrument).
 * The UI filters by tags to suggest relevant presets for the context.
 *
 * Previously split across: masterFxPresets.ts, channelFxPresets.ts,
 * instrumentFxPresets.ts, sendBusPresets.ts — now merged here.
 */

import type { EffectConfig } from '@typedefs/instrument';

// ── Types ────────────────────────────────────────────────────────────────────

export type FxTag =
  | 'Clean' | 'Warm' | 'Loud' | 'Wide' | 'Vinyl' | 'Genre' | 'DJ' | 'Neural'
  | 'Bass' | 'Drums' | 'Leads' | 'Pads' | 'Vocals'
  | 'Lo-Fi' | 'Creative' | 'Space' | 'Dub' | 'Grit' | 'Modulation' | 'Ambient' | 'Texture'
  | 'Amp' | 'Guitar'
  | 'Reverb' | 'Delay' | 'Compression'
  | 'Amiga' | 'C64';

export interface FxPreset {
  name: string;
  description: string;
  tags: FxTag[];
  effects: Omit<EffectConfig, 'id'>[];
}

// ── Presets ──────────────────────────────────────────────────────────────────

export const FX_PRESETS: FxPreset[] = [
  // ═══ CLEAN ═══
  { name: 'Clean Master', description: 'Gentle glue compression + tonal balance — transparent finishing', tags: ['Clean'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1, mid: 0, high: 0.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2.5, attack: 0.01, release: 0.2 } },
    ] },
  { name: 'Transparent', description: 'Barely-there bus compression — preserves full dynamics', tags: ['Clean'],
    effects: [
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 1.5, attack: 0.03, release: 0.3 } },
    ] },
  { name: 'Balanced', description: 'EQ sculpting + light compression + widening', tags: ['Clean', 'Wide'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1.5, mid: -0.5, high: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2, attack: 0.015, release: 0.25 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.55 } },
    ] },

  // ═══ WARM ═══
  { name: 'Analog Warmth', description: 'Tape saturation + compression — warm analog mix bus', tags: ['Warm'],
    effects: [
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 30, parameters: { drive: 35, tone: 10000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1.5, mid: 0, high: -0.5 } },
    ] },
  { name: 'Tape Machine', description: 'Tape simulator for subtle wow, saturation, head-bump warmth', tags: ['Warm', 'Lo-Fi'],
    effects: [
      { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 40, parameters: { drive: 25, character: 35, bias: 45, shame: 15, hiss: 5, speed: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Tube Console', description: 'Chebyshev harmonics + EQ — tube mixing desk vibe', tags: ['Warm'],
    effects: [
      { category: 'tonejs', type: 'Chebyshev', enabled: true, wet: 12, parameters: { order: 2 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0.5, high: -1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -15, ratio: 3, attack: 0.008, release: 0.18 } },
    ] },
  { name: 'Warm Bass', description: 'Tape saturation + gentle compression for bass', tags: ['Warm', 'Bass'],
    effects: [
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 40, tone: 8000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -20, ratio: 4, attack: 0.01, release: 0.15 } },
    ] },
  { name: 'Warm Overdrive', description: 'Tape saturation + filter — warm crunch without harshness', tags: ['Warm', 'Grit'],
    effects: [
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 55, tone: 9000 } },
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 10000, type: 'lowpass', Q: 0.7 } },
    ] },
  { name: 'Tube Screamer Glow', description: 'TS-9 style — warm mid-push without harshness', tags: ['Warm', 'Neural'],
    effects: [
      { category: 'wam', type: 'WAMTS9', enabled: true, wet: 40, parameters: {} },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1, mid: 2, high: -1 } },
    ] },
  { name: 'Rotary Warmth', description: 'Leslie + tape saturation — organic analog warmth', tags: ['Warm', 'Modulation'],
    effects: [
      { category: 'wasm', type: 'Leslie', enabled: true, wet: 30, parameters: { speed: 0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.5, drumDepth: 0.3, doppler: 0.4, width: 0.7, acceleration: 0.5 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 25, parameters: { drive: 30, tone: 10000 } },
    ] },

  // ═══ LOUD ═══
  { name: 'Club Ready', description: 'Punchy compression with sub boost — dancefloor-ready', tags: ['Loud', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 1.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.005, release: 0.12 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 18, parameters: { drive: 40, tone: 11000 } },
    ] },
  { name: 'Brick Wall', description: 'Hard limiting for maximum loudness', tags: ['Loud'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0, high: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 12, attack: 0.001, release: 0.05 } },
    ] },
  { name: 'Pumping', description: 'Aggressive sidechain-style compression — obvious pump for EDM', tags: ['Loud', 'Genre'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -1.0, high: 0.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.15 } },
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 10, parameters: { distortion: 0.1 } },
    ] },
  { name: 'Big Muff Wall', description: 'Big Muff Pi fuzz — thick wall of sustain', tags: ['Loud', 'Grit'],
    effects: [
      { category: 'wam', type: 'WAMBigMuff', enabled: true, wet: 50, parameters: {} },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 6, attack: 0.005, release: 0.15 } },
    ] },
  { name: 'Swedish Chainsaw', description: 'HM-2 + JCM800 — the legendary Swedish death metal tone', tags: ['Loud', 'Grit', 'Guitar'],
    effects: [
      { category: 'wasm', type: 'SwedishChainsaw', enabled: true, wet: 80, parameters: { tight: 1, pedalGain: 0.7, ampGain: 0.6, bass: 0.5, middle: 0.8, treble: 0.6, volume: 0.7 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.003, release: 0.1 } },
    ] },

  // ═══ WIDE ═══
  { name: 'Stereo Wide', description: 'Subtle stereo widening + glue compression', tags: ['Wide'],
    effects: [
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.7 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -15, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Room Glue', description: 'Short plate reverb to glue the mix in a shared space', tags: ['Wide', 'Reverb'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 15, parameters: { damping: 0.6, density: 0.5, bandwidth: 0.7, decay: 0.3, predelay: 0.0, size: 0.4, gain: 1.0, mix: 0.3, earlyMix: 0.7 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2.5, attack: 0.01, release: 0.2 } },
    ] },
  { name: 'Immersive', description: 'Plate reverb + widener + chorus — large immersive soundstage', tags: ['Wide', 'Ambient'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 10, parameters: { frequency: 0.2, depth: 0.15 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 12, parameters: { damping: 0.5, density: 0.6, bandwidth: 0.6, decay: 0.4, predelay: 0.01, size: 0.6, gain: 1.0, mix: 0.35, earlyMix: 0.6 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.6 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2, attack: 0.02, release: 0.25 } },
    ] },
  { name: 'Leslie Cabinet', description: 'Rotary speaker — classic organ cabinet swirl', tags: ['Wide', 'Modulation', 'Creative'],
    effects: [
      { category: 'wasm', type: 'Leslie', enabled: true, wet: 60, parameters: { speed: 1.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.6, width: 0.8, acceleration: 0.5 } },
    ] },
  { name: 'Hall Reverb', description: 'Large hall convolution reverb — lush ambient tail', tags: ['Wide', 'Reverb', 'Space'],
    effects: [
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 30, parameters: { decay: 5, preDelay: 0.04 } },
    ] },

  // ═══ VINYL / LO-FI ═══
  { name: 'Vinyl Press', description: 'ToneArm vinyl simulation — RIAA EQ, rolloff, crackle', tags: ['Vinyl', 'Lo-Fi'],
    effects: [
      { category: 'wasm', type: 'ToneArm', enabled: true, wet: 35, parameters: { wow: 8, coil: 40, flutter: 5, riaa: 60, stylus: 25, hiss: 10, pops: 8, rpm: 33.333 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Dusty Grooves', description: 'Vinyl noise + tape warmth — crate-digger character', tags: ['Vinyl', 'Lo-Fi'],
    effects: [
      { category: 'wasm', type: 'VinylNoise', enabled: true, wet: 25, parameters: { hiss: 30, dust: 40, age: 35, speed: 5.5, riaa: 45, stylusResonance: 40, wornStylus: 20, pinch: 25, innerGroove: 15, ghostEcho: 10, dropout: 5, warp: 5, eccentricity: 10 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 20, parameters: { drive: 30, tone: 9000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Lo-Fi Master', description: 'Tape sim + vinyl + rolloff — nostalgic warmth', tags: ['Vinyl', 'Lo-Fi', 'Warm'],
    effects: [
      { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 30, parameters: { drive: 20, character: 30, bias: 40, shame: 12, hiss: 8, speed: 1 } },
      { category: 'wasm', type: 'ToneArm', enabled: true, wet: 20, parameters: { wow: 10, coil: 35, flutter: 8, riaa: 55, stylus: 20, hiss: 5, pops: 3, rpm: 33.333 } },
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 12000, type: 'lowpass', Q: 0.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2.5, attack: 0.02, release: 0.3 } },
    ] },
  { name: 'VHS Tape', description: 'Wobbly vibrato + bit reduction + rolloff — old VHS audio', tags: ['Lo-Fi', 'Texture'],
    effects: [
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 25, parameters: { bits: 12 } },
      { category: 'tonejs', type: 'Vibrato', enabled: true, wet: 30, parameters: { frequency: 4, depth: 0.08 } },
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 6000, type: 'lowpass', Q: 0.5 } },
    ] },
  { name: 'Vinyl Record', description: 'Full vinyl simulation — crackle, dust, RIAA EQ', tags: ['Lo-Fi', 'Vinyl'],
    effects: [
      { category: 'wasm', type: 'VinylNoise', enabled: true, wet: 40, parameters: { hiss: 40, dust: 50, age: 40, speed: 5.5, riaa: 55, stylusResonance: 45, wornStylus: 30, pinch: 30, innerGroove: 20, ghostEcho: 15, dropout: 8, warp: 8, eccentricity: 15 } },
    ] },
  { name: 'Broken Sampler', description: 'Heavy bit-crush + distortion — 8-bit destruction', tags: ['Lo-Fi', 'Grit'],
    effects: [
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 55, parameters: { bits: 6 } },
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 30, parameters: { distortion: 0.4 } },
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 5000, type: 'lowpass', Q: 1.5 } },
    ] },
  { name: 'Cassette Dub', description: 'Tape sim + delay — dubbed-to-tape degradation', tags: ['Lo-Fi', 'Dub'],
    effects: [
      { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 50, parameters: { drive: 35, character: 50, bias: 50, shame: 30, hiss: 25, speed: 0 } },
      { category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 22, parameters: { delayTime: 0.3, feedback: 0.3 } },
    ] },
  { name: 'Cassette Deck', description: 'BitCrush + vibrato + saturation — worn cassette tape', tags: ['Lo-Fi', 'Vinyl'],
    effects: [
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 20, parameters: { bits: 12 } },
      { category: 'tonejs', type: 'Vibrato', enabled: true, wet: 30, parameters: { frequency: 2, depth: 0.15, type: 'sine', maxDelay: 0.005 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50, parameters: { drive: 40, tone: 9000 } },
    ] },
  { name: 'Lo-Fi Radio', description: 'Bit crusher + tremolo — old radio transmission', tags: ['Lo-Fi', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 60, parameters: { bits: 8 } },
      { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 40, parameters: { frequency: 4, depth: 0.6, type: 'sine' } },
    ] },
  { name: 'Lo-Fi Drums', description: 'BitCrusher + tape for crunchy beats', tags: ['Lo-Fi', 'Drums'],
    effects: [
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 60, parameters: { bits: 10 } },
      { category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 40, parameters: { wow: 15, flutter: 10, hiss: 0, dropouts: 0, saturation: 30, toneShift: 40 } },
    ] },
  { name: 'Lo-Fi Tape', description: 'Worn cassette degradation on the bus', tags: ['Lo-Fi', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 80, parameters: { wow: 35, flutter: 25, hiss: 20, dropouts: 5, saturation: 40, toneShift: 35 } },
    ] },
  { name: 'Turntable', description: 'ToneArm vinyl playback — wow, flutter, cartridge', tags: ['Lo-Fi', 'Vinyl'],
    effects: [
      { category: 'wasm', type: 'ToneArm', enabled: true, wet: 50, parameters: { wow: 25, coil: 55, flutter: 20, riaa: 60, stylus: 35, hiss: 15, pops: 12, rpm: 33.333 } },
    ] },

  // ═══ GENRE ═══
  { name: 'Techno', description: 'Hard-hitting sub boost + compression + grit', tags: ['Genre', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -1.0, high: 0.5 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 15, parameters: { drive: 40, tone: 11000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 5, attack: 0.003, release: 0.1 } },
    ] },
  { name: 'House', description: 'Warm low-end + smooth tops + glue comp', tags: ['Genre', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0.5, high: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3, attack: 0.008, release: 0.18 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.5 } },
    ] },
  { name: 'Drum & Bass', description: 'Tight transients + sub weight + air', tags: ['Genre', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 1.0 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 5, attack: 0.002, release: 0.08 } },
    ] },
  { name: 'Hip Hop', description: 'Fat low-end + warm saturation + controlled dynamics', tags: ['Genre'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.5, high: 0.0 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 20, parameters: { drive: 30, tone: 8000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3.5, attack: 0.01, release: 0.2 } },
    ] },
  { name: 'Dub / Reggae', description: 'Heavy subs + warm mids + spring tank', tags: ['Genre', 'Dub'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: -0.5 } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 10, parameters: { decay: 0.3, damping: 0.5, tension: 0.4, mix: 0.25, drip: 0.2, diffusion: 0.6 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.25 } },
    ] },
  { name: 'Ambient', description: 'Spacious plate + gentle compression — ethereal', tags: ['Genre', 'Ambient', 'Wide'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 20, parameters: { damping: 0.4, density: 0.7, bandwidth: 0.5, decay: 0.6, predelay: 0.04, size: 0.85, gain: 1.0, mix: 0.4, earlyMix: 0.4 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.6 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -20, ratio: 2, attack: 0.03, release: 0.4 } },
    ] },
  { name: 'Hardstyle', description: 'Maximum sub + hard limiting + grit', tags: ['Genre', 'Loud'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 1.0 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 20, parameters: { drive: 50, tone: 12000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -8, ratio: 8, attack: 0.002, release: 0.08 } },
    ] },
  { name: 'Psychedelic', description: 'Leslie + phaser + reverb — 60s psychedelia', tags: ['Genre', 'Wide'],
    effects: [
      { category: 'wasm', type: 'Leslie', enabled: true, wet: 50, parameters: { speed: 1.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.5, width: 0.8, acceleration: 0.5 } },
      { category: 'tonejs', type: 'Phaser', enabled: true, wet: 30, parameters: { frequency: 0.2, octaves: 4, stages: 8, Q: 4, baseFrequency: 300 } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 25, parameters: { decay: 3, preDelay: 0.02 } },
    ] },
  { name: 'Synthwave', description: 'Chorus + delay + compression — 80s retro', tags: ['Genre', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 1.5, delayTime: 3.5, depth: 0.7 } },
      { category: 'tonejs', type: 'Delay', enabled: true, wet: 25, parameters: { delayTime: 0.375, feedback: 0.3, maxDelay: 2 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 } },
    ] },
  { name: 'Shoegaze', description: 'Chorus + saturation + massive reverb — wall of sound', tags: ['Genre', 'Texture'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 0.8, depth: 0.7 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 50, tone: 8000 } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 60, parameters: { decay: 7, preDelay: 0.04 } },
    ] },
  { name: 'Acid House', description: 'Auto-filter + distortion — 303-inspired', tags: ['Genre', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 70, parameters: { frequency: 1, baseFrequency: 300, octaves: 3, type: 'sawtooth', depth: 0.9 } },
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 30, parameters: { distortion: 0.3 } },
    ] },
  { name: 'Garage / 2-Step', description: 'Tight compression + delay — punchy UK garage', tags: ['Genre', 'DJ'],
    effects: [
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.005, release: 0.15 } },
      { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 15, parameters: { delayTime: 0.25, feedback: 0.2, maxDelay: 1 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 1.5 } },
    ] },

  // ═══ DJ ═══
  { name: 'DJ Booth', description: 'Club-standard bus compression + EQ + tape warmth', tags: ['DJ', 'Clean'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0, high: 1 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 15, parameters: { drive: 30, tone: 11000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 3.5, attack: 0.005, release: 0.12 } },
    ] },
  { name: 'Dub Sirens Live', description: 'Space Echo + spring reverb — live dub FX', tags: ['DJ', 'Dub'],
    effects: [
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 300, intensity: 0.55, echoVolume: 0.75, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4' } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.5, damping: 0.4, tension: 0.45, mix: 0.3, drip: 0.5, diffusion: 0.6 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 0.0 } },
    ] },
  { name: 'Big Room', description: 'Plate reverb + wide stereo + comp — festival main stage', tags: ['DJ', 'Wide'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 12, parameters: { damping: 0.5, density: 0.6, bandwidth: 0.7, decay: 0.35, predelay: 0.0, size: 0.5, gain: 1.0, mix: 0.35, earlyMix: 0.7 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.6 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 4, attack: 0.005, release: 0.12 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 1.5 } },
    ] },
  { name: 'Vinyl DJ', description: 'ToneArm + warmth — vinyl turntable character', tags: ['DJ', 'Vinyl'],
    effects: [
      { category: 'wasm', type: 'ToneArm', enabled: true, wet: 30, parameters: { wow: 6, coil: 35, flutter: 4, riaa: 55, stylus: 20, hiss: 8, pops: 5, rpm: 33.333 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 15, parameters: { drive: 25, tone: 10000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 } },
    ] },
  { name: 'Echo Out', description: 'BPM-synced tape echo for transitions', tags: ['DJ', 'Delay'],
    effects: [
      { category: 'tonejs', type: 'RETapeEcho', enabled: true, wet: 40, parameters: { mode: 3, repeatRate: 0.5, intensity: 0.55, echoVolume: 0.8, wow: 0.15, flutter: 0.1, dirt: 0.1, inputBleed: 0.05, loopAmount: 0, playheadFilter: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 3, attack: 0.008, release: 0.15 } },
    ] },
  { name: 'Warehouse Rave', description: 'Gritty tape + hard compression — raw warehouse', tags: ['DJ', 'Grit'],
    effects: [
      { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 35, parameters: { drive: 40, character: 45, bias: 40, shame: 20, hiss: 10, speed: 1 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -1.0, high: 1.0 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.003, release: 0.1 } },
    ] },
  { name: 'Dub Echo', description: 'Ping-pong delay + reverb — classic dub bounce', tags: ['DJ', 'Dub', 'Delay'],
    effects: [
      { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 35, parameters: { delayTime: 0.375, feedback: 0.4, maxDelay: 2 } },
      { category: 'tonejs', type: 'JCReverb', enabled: true, wet: 20, parameters: { roomSize: 0.6 } },
    ] },
  { name: 'Filter Sweep', description: 'Auto-filter LFO — DJ build/breakdown tool', tags: ['DJ', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 80, parameters: { frequency: 0.5, baseFrequency: 200, octaves: 4, type: 'sine', depth: 0.8 } },
    ] },
  { name: 'Tape Stop', description: 'Pitch shift down — tape-stop effect', tags: ['DJ', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'PitchShift', enabled: true, wet: 100, parameters: { pitch: -2, windowSize: 0.1, delayTime: 0 } },
    ] },
  { name: 'Phaser Wash', description: 'Deep phaser sweep — psychedelic movement', tags: ['DJ', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'Phaser', enabled: true, wet: 60, parameters: { frequency: 0.3, octaves: 3, stages: 10, Q: 6, baseFrequency: 350 } },
    ] },
  { name: 'Auto-Pan', description: 'LFO panning — adds motion to static mixes', tags: ['DJ', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'AutoPanner', enabled: true, wet: 70, parameters: { frequency: 0.25, depth: 0.8, type: 'sine' } },
    ] },
  { name: 'Vibrato Wobble', description: 'Pitch wobble — tape warble / underwater', tags: ['DJ', 'Lo-Fi'],
    effects: [
      { category: 'tonejs', type: 'Vibrato', enabled: true, wet: 50, parameters: { frequency: 3, depth: 0.3, type: 'sine', maxDelay: 0.005 } },
    ] },
  { name: 'Frequency Shift', description: 'Subtle frequency shifting — metallic detuning', tags: ['DJ', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'FrequencyShifter', enabled: true, wet: 70, parameters: { frequency: 5 } },
    ] },
  { name: 'Feedback Loop', description: 'Self-oscillating delay — chaotic dub siren', tags: ['DJ', 'Dub', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 40, parameters: { delayTime: 0.25, feedback: 0.7, maxDelay: 2 } },
    ] },
  { name: 'Stone Phaser', description: 'WAM Stone — deep analog-modeled phase shifting', tags: ['DJ', 'Modulation'],
    effects: [
      { category: 'wam', type: 'WAMStonePhaser', enabled: true, wet: 60, parameters: {} },
    ] },
  { name: 'Vox Amp Crunch', description: 'Vox amplifier — British crunch for mix character', tags: ['DJ', 'Grit'],
    effects: [
      { category: 'wam', type: 'WAMVoxAmp', enabled: true, wet: 40, parameters: {} },
    ] },
  { name: 'Pitch Up +3', description: 'WAM pitch shifter +3 semi — build-ups', tags: ['DJ', 'Creative'],
    effects: [
      { category: 'wam', type: 'WAMPitchShifter', enabled: true, wet: 100, parameters: {} },
    ] },

  // ═══ SPACE ═══
  { name: 'Small Room', description: 'Tight early reflections — drums, percussion', tags: ['Space', 'Reverb'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 30, parameters: { damping: 0.7, density: 0.4, bandwidth: 0.8, decay: 0.2, predelay: 0.0, size: 0.25, gain: 1.0, mix: 0.4, earlyMix: 0.8 } },
    ] },
  { name: 'Plate Shimmer', description: 'Lush plate reverb — pads and vocals', tags: ['Space', 'Reverb'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 45, parameters: { damping: 0.3, density: 0.8, bandwidth: 0.6, decay: 0.75, predelay: 0.02, size: 0.9, gain: 1.0, mix: 0.5, earlyMix: 0.3 } },
    ] },
  { name: 'Cathedral', description: 'Massive reverb — epic, cavernous sound', tags: ['Space', 'Reverb'],
    effects: [
      { category: 'tonejs', type: 'JCReverb', enabled: true, wet: 55, parameters: { roomSize: 0.9 } },
      { category: 'tonejs', type: 'Delay', enabled: true, wet: 18, parameters: { delayTime: 0.25, feedback: 0.3 } },
    ] },
  { name: 'Spring Tank', description: 'Classic dub spring reverb — metallic drip', tags: ['Space', 'Dub', 'Reverb'],
    effects: [
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 50, parameters: { decay: 0.6, damping: 0.35, tension: 0.5, mix: 0.4, drip: 0.7, diffusion: 0.6 } },
    ] },
  { name: 'Ping Pong Hall', description: 'Stereo bouncing delay + reverb — big stereo', tags: ['Space', 'Delay', 'Wide'],
    effects: [
      { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 30, parameters: { delayTime: 0.3, feedback: 0.45, bpmSync: 1, syncDivision: '1/8' } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 35, parameters: { decay: 4, preDelay: 0.05 } },
    ] },
  { name: 'Shimmer Wash', description: 'Ethereal ascending reverb — *wave, ambient', tags: ['Space', 'Reverb', 'Ambient'],
    effects: [
      { category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 60, parameters: { decay: 80, shimmer: 60, pitch: 12, damping: 40, size: 75, predelay: 30, modRate: 25, modDepth: 15 } },
    ] },
  { name: 'Dark Plate', description: 'Dense, dark plate reverb — darkwave', tags: ['Space', 'Reverb'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 50, parameters: { damping: 0.8, density: 0.7, bandwidth: 0.3, decay: 0.85, predelay: 0.02, size: 0.9, gain: 1.0, mix: 1.0, earlyMix: 0.3 } },
    ] },
  { name: 'Tight Room', description: 'Short natural room — drums, percussion', tags: ['Space', 'Reverb', 'Drums'],
    effects: [
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 40, parameters: { damping: 0.6, density: 0.4, bandwidth: 0.7, decay: 0.3, predelay: 0.0, size: 0.3, gain: 1.0, mix: 1.0, earlyMix: 0.7 } },
    ] },
  { name: 'Spacey Delay', description: 'SpaceyDelayer multi-tap shimmer — celestial trails', tags: ['Space', 'Delay'],
    effects: [
      { category: 'tonejs', type: 'SpaceyDelayer', enabled: true, wet: 45, parameters: { time: 0.4, feedback: 0.55, tone: 0.6, modDepth: 0.3, modRate: 0.5, shimmer: 0.4, width: 0.7, mix: 0.5 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 20, parameters: { damping: 0.3, density: 0.7, bandwidth: 0.5, decay: 0.6, predelay: 0.04, size: 0.7, gain: 1.0, mix: 0.35, earlyMix: 0.3 } },
    ] },

  // ═══ DUB ═══
  { name: 'Dub Siren Echo', description: 'Space Echo + spring — classic dub siren', tags: ['Dub', 'Delay'],
    effects: [
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 50, parameters: { mode: 4, rate: 300, intensity: 0.65, echoVolume: 0.85, reverbVolume: 0.25, bpmSync: 1, syncDivision: '1/4' } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.4, tension: 0.45, mix: 0.35, drip: 0.6, diffusion: 0.7 } },
    ] },
  { name: 'King Tubby Filter', description: 'Resonant dub filter + echo — dramatic sweeps', tags: ['Dub', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'DubFilter', enabled: true, wet: 100, parameters: { cutoff: 30, resonance: 20, gain: 1.3 } },
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 35, parameters: { mode: 4, rate: 375, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.15, bpmSync: 1, syncDivision: '1/8d' } },
    ] },
  { name: 'Phaser Dub', description: 'Bi-Phase swirl + tape echo — spacey modulation', tags: ['Dub', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'BiPhase', enabled: true, wet: 35, parameters: { rateA: 0.3, depthA: 0.7, rateB: 3.0, depthB: 0.5, feedback: 0.4, routing: 0 } },
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 4, rate: 500, intensity: 0.6, echoVolume: 0.8, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4' } },
    ] },
  { name: 'Tape Echo Wash', description: 'RE Tape Echo with wow/flutter — degraded repeats', tags: ['Dub', 'Delay', 'Lo-Fi'],
    effects: [
      { category: 'tonejs', type: 'RETapeEcho', enabled: true, wet: 45, parameters: { mode: 3, repeatRate: 0.5, intensity: 0.6, echoVolume: 0.8, wow: 0.3, flutter: 0.2, dirt: 0.15, inputBleed: 0.05, loopAmount: 0, playheadFilter: 1 } },
    ] },
  { name: 'Dub Chamber', description: 'Spring reverb + tape echo — classic dub send', tags: ['Dub', 'Reverb', 'Delay'],
    effects: [
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 60, parameters: { decay: 0.65, damping: 0.45, tension: 0.5, mix: 1.0, drip: 0.5, diffusion: 0.65 } },
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 40, parameters: { mode: 2, rate: 300, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.2, bass: 0.6, treble: 0.4 } },
    ] },
  { name: 'Aelapse Dub', description: 'Tape delay + spring reverb combo — the Aelapse dub machine', tags: ['Dub', 'Delay', 'Creative'],
    effects: [
      { category: 'wasm', type: 'Aelapse', enabled: true, wet: 60, parameters: { delayActive: 1, delayDryWet: 0.5, delaySeconds: 0.375, delayFeedback: 0.55, delayCutLow: 200, delayCutHi: 4000, delaySaturation: 0.3, delayDrift: 0.2, delayMode: 0, springsActive: 1, springsDryWet: 0.4, springsWidth: 0.7, springsLength: 0.6, springsDecay: 0.5, springsDamp: 0.4, springsShape: 0.5, springsTone: 0.5, springsScatter: 0.3, springsChaos: 0.2 } },
    ] },

  // ═══ CHANNEL-ORIENTED ═══
  { name: 'Acid Bass', description: 'Filter + distortion for TB-303', tags: ['Bass', 'Grit'],
    effects: [
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { type: 'lowpass', frequency: 1200, rolloff: -24, Q: 8 } },
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 50, parameters: { drive: 0.6, oversample: '2x' } },
    ] },
  { name: 'Sub Bass', description: 'Low-pass filter + compressor for clean sub', tags: ['Bass'],
    effects: [
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { type: 'lowpass', frequency: 200, rolloff: -24, Q: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -15, ratio: 8, attack: 0.005, release: 0.1 } },
    ] },
  { name: 'Moog Acid', description: 'Moog ladder filter + Leslie — squelchy and swirling', tags: ['Bass', 'Grit', 'Texture'],
    effects: [
      { category: 'wasm', type: 'MoogFilter', enabled: true, wet: 100, parameters: { cutoff: 1500, resonance: 60, drive: 0.4, model: 0, filterMode: 0 } },
      { category: 'wasm', type: 'Leslie', enabled: true, wet: 30, parameters: { speed: 1.0, hornRate: 6.0, drumRate: 5.5, hornDepth: 0.5, drumDepth: 0.3, doppler: 0.4, width: 0.7, acceleration: 0.5 } },
    ] },
  { name: 'Acid Screamer', description: 'Moog filter + distortion — resonant acid squelch', tags: ['Bass', 'Grit'],
    effects: [
      { category: 'wasm', type: 'MoogFilter', enabled: true, wet: 100, parameters: { cutoff: 2000, resonance: 70, drive: 0.6, model: 0, filterMode: 0 } },
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 25, parameters: { distortion: 0.3 } },
    ] },
  { name: 'Punchy Drums', description: 'Compression + EQ boost for attack', tags: ['Drums', 'Compression'],
    effects: [
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -24, ratio: 6, attack: 0.002, release: 0.08 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1.5, mid: -0.5, high: 2.0, lowFrequency: 200, highFrequency: 4000 } },
    ] },
  { name: 'Gated Snare', description: '80s gated reverb snare', tags: ['Drums', 'Reverb'],
    effects: [
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 70, parameters: { decay: 0.8, preDelay: 0 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -35, ratio: 20, attack: 0.001, release: 0.05 } },
    ] },
  { name: 'Chorus Lead', description: 'Stereo chorus + width', tags: ['Leads', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 50, parameters: { frequency: 1.5, delayTime: 3.5, depth: 0.7 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.7 } },
    ] },
  { name: 'Phaser Lead', description: 'Classic phaser sweep', tags: ['Leads', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'Phaser', enabled: true, wet: 60, parameters: { frequency: 0.5, octaves: 3, baseFrequency: 1000 } },
    ] },
  { name: 'Shimmer Pad', description: 'Tape warmth + chorus for ethereal pads', tags: ['Pads', 'Ambient'],
    effects: [
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 30, parameters: { drive: 25, tone: 10000 } },
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 0.3, delayTime: 5, depth: 0.8 } },
    ] },
  { name: 'Dark Pad', description: 'Low-pass filter + tape degradation', tags: ['Pads', 'Lo-Fi'],
    effects: [
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { type: 'lowpass', frequency: 3000, rolloff: -12, Q: 1 } },
      { category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 50, parameters: { wow: 25, flutter: 15, hiss: 10, dropouts: 0, saturation: 20, toneShift: 30 } },
    ] },
  { name: 'Clean Vocal', description: 'Compression + EQ for clean vocal chain', tags: ['Vocals', 'Clean'],
    effects: [
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: -2.0, mid: 1.5, high: 0.5, lowFrequency: 300, highFrequency: 5000 } },
    ] },
  { name: 'Crystal Castles Vocal', description: 'BitCrush + tape — destroyed vocal', tags: ['Vocals', 'Lo-Fi', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 50, parameters: { bits: 8 } },
      { category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 40, parameters: { wow: 40, flutter: 30, hiss: 20, dropouts: 5, saturation: 25, toneShift: 25 } },
    ] },

  // ═══ MODULATION ═══
  { name: 'Thick Chorus', description: 'Deep chorus + widener — lush thickening', tags: ['Modulation', 'Wide'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 45, parameters: { frequency: 0.5, depth: 0.6 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.6 } },
    ] },
  { name: 'Phaser Jet', description: 'Deep bi-phase sweep — classic jet phaser', tags: ['Modulation'],
    effects: [
      { category: 'tonejs', type: 'BiPhase', enabled: true, wet: 50, parameters: { rateA: 0.2, depthA: 0.8, rateB: 0.15, depthB: 0.9, feedback: 0.6, routing: 1 } },
    ] },
  { name: 'Tremolo Gate', description: 'Fast tremolo + auto-panner — rhythmic gating', tags: ['Modulation', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 70, parameters: { frequency: 8, depth: 0.8 } },
      { category: 'tonejs', type: 'AutoPanner', enabled: true, wet: 40, parameters: { frequency: 2 } },
    ] },
  { name: 'Wah Sweep', description: 'Auto-wah + phaser — funky envelope filter', tags: ['Modulation', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'AutoWah', enabled: true, wet: 65, parameters: { baseFrequency: 300, octaves: 4, sensitivity: -20, Q: 4 } },
      { category: 'tonejs', type: 'Phaser', enabled: true, wet: 20, parameters: { frequency: 0.5, octaves: 3, baseFrequency: 500, Q: 4 } },
    ] },

  // ═══ AMBIENT ═══
  { name: 'Ambient Space', description: 'Long reverb + ping-pong — infinite soundscape', tags: ['Ambient', 'Space'],
    effects: [
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 50, parameters: { decay: 6, preDelay: 0.06 } },
      { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 30, parameters: { delayTime: 0.4, feedback: 0.5, bpmSync: 1, syncDivision: '1/4d' } },
    ] },
  { name: 'Dreamy Haze', description: 'Chorus + reverb + LP filter — soft and floaty', tags: ['Ambient', 'Space'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 35, parameters: { frequency: 0.3, depth: 0.5 } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 55, parameters: { decay: 6, preDelay: 0.08 } },
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 5000, type: 'lowpass', Q: 0.5 } },
    ] },
  { name: 'Underwater', description: 'Deep LP filter + chorus + reverb — submerged', tags: ['Ambient', 'Texture'],
    effects: [
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 1200, type: 'lowpass', Q: 2 } },
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 0.4, depth: 0.6 } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 50, parameters: { decay: 4, preDelay: 0.03 } },
    ] },
  { name: 'Frozen', description: 'Plate + pitch shift + delay — glacial, crystalline', tags: ['Ambient', 'Texture'],
    effects: [
      { category: 'tonejs', type: 'PitchShift', enabled: true, wet: 20, parameters: { pitch: 12, windowSize: 0.1, delayTime: 0, feedback: 0.1 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 60, parameters: { damping: 0.2, density: 0.9, bandwidth: 0.4, decay: 0.9, predelay: 0.05, size: 1.0, gain: 1.0, mix: 0.5, earlyMix: 0.2 } },
      { category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 25, parameters: { delayTime: 0.5, feedback: 0.55 } },
    ] },
  { name: '*Wave Landscape', description: 'Shimmer + ambient delay — complete *wave bus', tags: ['Ambient', 'Genre'],
    effects: [
      { category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 60, parameters: { decay: 78, shimmer: 55, pitch: 12, damping: 45, size: 75, predelay: 25, modRate: 25, modDepth: 15 } },
      { category: 'tonejs', type: 'AmbientDelay', enabled: true, wet: 30, parameters: { time: 500, feedback: 40, taps: 2, filterType: 'lowpass', filterFreq: 2000, filterQ: 1.2, modRate: 20, modDepth: 10, stereoSpread: 60, diffusion: 30 } },
    ] },
  { name: 'Crystal Castles Void', description: 'Shimmer + tape degradation — noisy, ethereal', tags: ['Ambient', 'Lo-Fi', 'Genre'],
    effects: [
      { category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 30, parameters: { decay: 70, shimmer: 35, pitch: 12, damping: 50, size: 70, predelay: 10, modRate: 35, modDepth: 25 } },
      { category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 30, parameters: { wow: 40, flutter: 30, hiss: 25, dropouts: 10, saturation: 20, toneShift: 25 } },
    ] },

  // ═══ TEXTURE ═══
  { name: 'Radiowave', description: 'Bandpass + bit-crush + tremolo — AM radio', tags: ['Texture', 'Lo-Fi'],
    effects: [
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 2000, type: 'bandpass', Q: 3 } },
      { category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 20, parameters: { bits: 10 } },
      { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 15, parameters: { frequency: 0.2, depth: 0.3 } },
    ] },
  { name: 'Haunted', description: 'Pitch shift down + spring + distortion — horror', tags: ['Texture', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'PitchShift', enabled: true, wet: 30, parameters: { pitch: -5, windowSize: 0.08, delayTime: 0.05, feedback: 0.2 } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 40, parameters: { decay: 0.7, damping: 0.3, tension: 0.6, mix: 0.4, drip: 0.8, diffusion: 0.5 } },
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 15, parameters: { distortion: 0.2 } },
    ] },
  { name: 'Cosmic', description: 'Frequency shifter + delay + reverb — alien', tags: ['Texture', 'Creative'],
    effects: [
      { category: 'tonejs', type: 'FrequencyShifter', enabled: true, wet: 35, parameters: { frequency: 50 } },
      { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 35, parameters: { delayTime: 0.3, feedback: 0.5 } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 40, parameters: { decay: 5, preDelay: 0.04 } },
    ] },
  { name: 'Rain Ambience', description: 'Tumult rain noise — subtle rain texture', tags: ['Texture', 'Ambient'],
    effects: [
      { category: 'wasm', type: 'Tumult', enabled: true, wet: 30, parameters: { noiseGain: -18, mix: 0.3, noiseMode: 0, sourceMode: 0, switchBranch: 0, duckThreshold: -25, duckAttack: 0, duckRelease: 20, followThreshold: -20, followAttack: 0, followRelease: 15, followAmount: 0.5, clipAmount: 0.3, hpEnable: 1, hpFreq: 400, hpQ: 0.7, peak1Enable: 0, peak1Type: 0, peak1Freq: 20, peak1Gain: 0, peak1Q: 0.7, peak2Enable: 0, peak2Freq: 600, peak2Gain: 0, peak2Q: 1, peak3Enable: 0, peak3Type: 1, peak3Freq: 2500, peak3Gain: 0, peak3Q: 1, lpEnable: 1, lpFreq: 6000, lpQ: 0.7, sampleIndex: 0, playerStart: 0, playerEnd: 1, playerFade: 0.01, playerGain: 0 } },
    ] },

  // ═══ GRIT ═══
  { name: 'Industrial', description: 'Harsh distortion + hard compression', tags: ['Grit', 'Loud'],
    effects: [
      { category: 'tonejs', type: 'Distortion', enabled: true, wet: 50, parameters: { distortion: 0.65 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.08 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1.5, mid: 1.0, high: 2.0 } },
    ] },
  { name: 'Fuzz Box', description: 'Chebyshev waveshaper — thick fuzzy harmonics', tags: ['Grit'],
    effects: [
      { category: 'tonejs', type: 'Chebyshev', enabled: true, wet: 55, parameters: { order: 6 } },
      { category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { frequency: 7000, type: 'lowpass', Q: 1 } },
    ] },

  // ═══ CREATIVE ═══
  { name: 'Frozen Texture', description: 'Granular freeze — capture a moment', tags: ['Creative', 'Ambient'],
    effects: [
      { category: 'wasm', type: 'GranularFreeze', enabled: true, wet: 100, parameters: { freeze: 0, grainSize: 80, density: 12, scatter: 40, pitch: 0, spray: 25, shimmer: 15, stereoWidth: 70, feedback: 0, captureLen: 500, attack: 5, release: 40, thru: 1 } },
    ] },
  { name: 'Granular Cloud', description: 'Freeze moments into evolving textures', tags: ['Creative', 'Ambient'],
    effects: [
      { category: 'wasm', type: 'GranularFreeze', enabled: true, wet: 100, parameters: { freeze: 0, grainSize: 80, density: 12, scatter: 40, pitch: 0, spray: 25, shimmer: 20, stereoWidth: 70, feedback: 10, captureLen: 600, attack: 5, release: 40, thru: 0 } },
    ] },
  { name: 'Tape Delay Machine', description: 'Full tape delay with saturation, wow, flutter', tags: ['Creative', 'Delay', 'Lo-Fi'],
    effects: [
      { category: 'wasm', type: 'TapeDelay', enabled: true, wet: 50, parameters: { delayTime: 0.375, feedback: 0.5, mix: 0.5, toneFreq: 3000, drive: 0.3, wowRate: 0.5, wowDepth: 0.15, flutterRate: 5, flutterDepth: 0.1 } },
    ] },

  // ═══ COMPRESSION ═══
  { name: 'Parallel Crush', description: 'Heavy parallel compression — drums, full mix', tags: ['Compression', 'Drums'],
    effects: [
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -30, ratio: 20, attack: 0.003, release: 0.1 } },
    ] },
  { name: 'Glue Bus', description: 'Gentle bus compression — cohesion', tags: ['Compression', 'Clean'],
    effects: [
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 4, attack: 0.01, release: 0.25 } },
    ] },

  // ═══ DELAY ═══
  { name: 'Ambient Echo', description: 'Filtered darkening delay — ambient, *wave', tags: ['Delay', 'Ambient'],
    effects: [
      { category: 'tonejs', type: 'AmbientDelay', enabled: true, wet: 60, parameters: { time: 375, feedback: 55, taps: 2, filterType: 'lowpass', filterFreq: 2500, filterQ: 1.5, modRate: 25, modDepth: 15, stereoSpread: 50, diffusion: 25 } },
    ] },
  { name: 'Tape Echo', description: 'Warm tape delay with wow/flutter — dub, lo-fi', tags: ['Delay', 'Dub', 'Lo-Fi'],
    effects: [
      { category: 'wasm', type: 'RETapeEcho', enabled: true, wet: 60, parameters: { mode: 3, repeatRate: 0.45, intensity: 0.55, echoVolume: 0.8, wow: 0.15, flutter: 0.1, dirt: 0.2, inputBleed: 0, loopAmount: 0, playheadFilter: 1 } },
    ] },
  { name: 'Stereo Ping Pong', description: 'Bouncing L/R delay — wide stereo', tags: ['Delay', 'Wide'],
    effects: [
      { category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 60, parameters: { delayTime: 0.25, feedback: 0.45, maxDelay: 2 } },
    ] },
  { name: 'Space Echo', description: 'Roland RE-201 multi-head — psychedelic, dub', tags: ['Delay', 'Dub', 'Space'],
    effects: [
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 60, parameters: { mode: 3, rate: 350, intensity: 0.55, echoVolume: 0.8, reverbVolume: 0.3, bass: 0.5, treble: 0.6 } },
    ] },

  // ═══ NEURAL ═══
  { name: 'Princeton Glow', description: 'Fender Princeton — shimmery tube warmth', tags: ['Neural', 'Warm', 'Amp'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 25, neuralModelIndex: 14, parameters: { drive: 20, level: 100, presence: 50 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Blackstar Clean', description: 'Blackstar HT40 clean — British tube console', tags: ['Neural', 'Warm', 'Amp'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 20, neuralModelIndex: 10, parameters: { drive: 15, level: 100, presence: 55 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1, mid: 0.5, high: 0.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Tube Screamer Glue', description: 'TS808 low gain — mid-hump saturation glue', tags: ['Neural', 'Warm'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 18, neuralModelIndex: 6, parameters: { drive: 20, tone: 55, level: 100 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -15, ratio: 3, attack: 0.01, release: 0.2 } },
    ] },
  { name: 'Sovtek Warmth', description: 'Sovtek 50 + tape — thick Russian tube harmonics', tags: ['Neural', 'Warm'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 22, neuralModelIndex: 25, parameters: { drive: 35, level: 100, presence: 45 } },
      { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 20, parameters: { drive: 20, character: 30, bias: 45, shame: 10, hiss: 3, speed: 1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Filmosound Master', description: 'Filmosound projector amp — unique vintage', tags: ['Neural', 'Vinyl'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 30, neuralModelIndex: 29, parameters: { drive: 25, level: 100, presence: 40 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 1, high: -1 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2, attack: 0.02, release: 0.3 } },
    ] },

  // ═══ AMP ═══
  { name: 'Clean Fender', description: 'Princeton clean — sparkling tube shimmer', tags: ['Amp', 'Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 80, neuralModelIndex: 14, parameters: { drive: 25, level: 100, presence: 55 } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.4, damping: 0.5, tension: 0.4, mix: 0.3, drip: 0.3, diffusion: 0.6 } },
    ] },
  { name: 'Crunch Marshall', description: 'Blackstar HT40 gain — British crunch', tags: ['Amp', 'Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 85, neuralModelIndex: 16, parameters: { drive: 55, level: 100, presence: 60 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 1, high: 2 } },
    ] },
  { name: 'High Gain Mesa', description: 'Mesa Mini Rectifier — tight modern high gain', tags: ['Amp', 'Guitar', 'Loud'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 90, neuralModelIndex: 11, parameters: { drive: 70, level: 100, presence: 55 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 4, attack: 0.003, release: 0.1 } },
    ] },
  { name: 'Dumble Lead', description: 'Dumble — smooth singing lead tones', tags: ['Amp', 'Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 85, neuralModelIndex: 15, parameters: { drive: 65, level: 100, presence: 50 } },
      { category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 20, parameters: { delayTime: 0.35, feedback: 0.3 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 20, parameters: { damping: 0.4, density: 0.6, bandwidth: 0.6, decay: 0.4, predelay: 0.02, size: 0.5, gain: 1.0, mix: 0.35, earlyMix: 0.5 } },
    ] },
  { name: 'Sovtek Doom', description: 'Sovtek 50 + DOD — massive Russian tube doom', tags: ['Amp', 'Guitar', 'Loud'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 90, neuralModelIndex: 27, parameters: { drive: 75, level: 100, presence: 40 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 1.0, high: -0.5 } },
    ] },
  { name: 'BadCat Jazz', description: 'BadCat 50 clean — warm round jazz tones', tags: ['Amp', 'Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 75, neuralModelIndex: 23, parameters: { drive: 15, level: 100, presence: 40 } },
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 15, parameters: { frequency: 0.3, depth: 0.2 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 30, parameters: { damping: 0.3, density: 0.7, bandwidth: 0.5, decay: 0.5, predelay: 0.03, size: 0.6, gain: 1.0, mix: 0.4, earlyMix: 0.4 } },
    ] },
  { name: 'El Coyote Blues', description: 'El Coyote crunch + spring + tremolo — desert blues', tags: ['Amp', 'Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 80, neuralModelIndex: 31, parameters: { drive: 45, level: 100, presence: 50 } },
      { category: 'tonejs', type: 'Tremolo', enabled: true, wet: 25, parameters: { frequency: 4, depth: 0.4 } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 25, parameters: { decay: 0.5, damping: 0.4, tension: 0.5, mix: 0.3, drip: 0.5, diffusion: 0.6 } },
    ] },

  // ═══ GUITAR ═══
  { name: 'ENGL Metal', description: 'ENGL E645 — tight European metal', tags: ['Guitar', 'Amp', 'Loud'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 90, neuralModelIndex: 28, parameters: { drive: 70, level: 100, presence: 65 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.002, release: 0.08 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 1.5, high: 2.0 } },
    ] },
  { name: 'TS9 + Spring', description: 'Tube Screamer + spring — blues/rock pedalboard', tags: ['Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 70, neuralModelIndex: 0, parameters: { drive: 50, tone: 55, level: 100 } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 30, parameters: { decay: 0.5, damping: 0.4, tension: 0.5, mix: 0.35, drip: 0.5, diffusion: 0.6 } },
    ] },
  { name: 'Big Muff Doom', description: 'Big Muff V6 + massive reverb — fuzzy doom', tags: ['Guitar', 'Loud'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 85, neuralModelIndex: 36, parameters: { drive: 70, tone: 40, level: 100 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.5, high: -0.5 } },
      { category: 'tonejs', type: 'Reverb', enabled: true, wet: 35, parameters: { decay: 5, preDelay: 0.04 } },
    ] },
  { name: 'RAT + Delay', description: 'ProCo RAT + delay — aggressive post-punk', tags: ['Guitar', 'Grit'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 80, neuralModelIndex: 4, parameters: { drive: 60, tone: 50, level: 100 } },
      { category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 30, parameters: { delayTime: 0.35, feedback: 0.45 } },
    ] },
  { name: 'Revv G3 Chug', description: 'Revv G3 — modern metal chug machine', tags: ['Guitar', 'Loud'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 90, neuralModelIndex: 7, parameters: { drive: 70, tone: 55, level: 100 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -10, ratio: 6, attack: 0.002, release: 0.08 } },
    ] },
  { name: 'Goat + Leslie', description: 'Goat fuzz + Leslie rotary — psychedelic swirl', tags: ['Guitar', 'Modulation'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 75, neuralModelIndex: 33, parameters: { drive: 55, tone: 50, level: 100 } },
      { category: 'wasm', type: 'Leslie', enabled: true, wet: 45, parameters: { speed: 1.0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.6, width: 0.8, acceleration: 0.5 } },
    ] },
  { name: 'Aguilar Bass Grit', description: 'Aguilar Agro + compressor — punchy bass', tags: ['Guitar', 'Bass'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 70, neuralModelIndex: 21, parameters: { drive: 45, tone: 55, level: 100 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.005, release: 0.12 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.5, high: 0.0 } },
    ] },

  // ═══ RETRO HARDWARE — AMIGA CLUB ═══
  { name: 'Paula Punchline', description: 'Ultimate Amiga club preset — bass lift, tape warmth, punchy glue', tags: ['Amiga', 'Loud', 'Bass'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: 1.0, lowFrequency: 120, highFrequency: 6000 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 25, parameters: { drive: 35, tone: 10000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.005, release: 0.12 } },
    ] },
  { name: 'Amiga Bass Cannon', description: 'Thunderous 8-bit bass — sub enhancement, saturation, heavy compression', tags: ['Amiga', 'Bass', 'Loud'],
    effects: [
      { category: 'wasm', type: 'BassEnhancer', enabled: true, wet: 100, parameters: { frequency: 80, amount: 0.7, drive: 0.3, mix: 0.6 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 40, parameters: { drive: 45, tone: 8000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 6, attack: 0.005, release: 0.1 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: -1.0, lowFrequency: 100, highFrequency: 5000 } },
    ] },
  { name: 'Tracker Dance Floor', description: 'ProTracker rave — aggressive compression, bass, hihat sizzle', tags: ['Amiga', 'DJ', 'Loud'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -0.5, high: -0.5, lowFrequency: 150, highFrequency: 8000 } },
      { category: 'wasm', type: 'Exciter', enabled: true, wet: 100, parameters: { frequency: 7500, amount: 0.25, blend: 0.25, ceil: 14000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.003, release: 0.1 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 10, parameters: { drive: 30, tone: 10000 } },
    ] },
  { name: "Paula's Revenge", description: 'Maximum energy — exciter, bass boost, hard limiting, tape grit', tags: ['Amiga', 'Loud', 'Grit'],
    effects: [
      { category: 'wasm', type: 'BassEnhancer', enabled: true, wet: 100, parameters: { frequency: 90, amount: 0.5, drive: 0.3, mix: 0.4 } },
      { category: 'wasm', type: 'Exciter', enabled: true, wet: 100, parameters: { frequency: 7000, amount: 0.3, blend: 0.3, ceil: 13000 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 15, parameters: { drive: 35, tone: 9000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 6, attack: 0.003, release: 0.1 } },
      { category: 'wasm', type: 'Limiter', enabled: true, wet: 100, parameters: { threshold: -2, ceiling: -0.3, attack: 0.001, release: 0.05, lookahead: 0.005, knee: 0 } },
    ] },
  { name: 'Amiga Tape Warmth', description: 'Vintage club warmth — tape sim, gentle compression, soft rolloff', tags: ['Amiga', 'Warm', 'Vinyl'],
    effects: [
      { category: 'wasm', type: 'TapeSimulator', enabled: true, wet: 40, parameters: { drive: 30, character: 40, bias: 50, shame: 15, hiss: 3, speed: 1 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0.5, high: -1.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2.5, attack: 0.015, release: 0.25 } },
    ] },
  { name: 'Paula Dub Sirens', description: 'Amiga dub — space echo, spring tank, heavy subs', tags: ['Amiga', 'Dub', 'Bass'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: -1.0, high: -0.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3.5, attack: 0.008, release: 0.18 } },
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 25, parameters: { mode: 4, rate: 300, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4' } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 15, parameters: { decay: 0.4, damping: 0.45, tension: 0.45, mix: 0.3, drip: 0.4, diffusion: 0.6 } },
    ] },
  { name: 'Amiga Multiband', description: 'Multiband control — tighten lows, scoop mids, open highs', tags: ['Amiga', 'Compression', 'Loud'],
    effects: [
      { category: 'wasm', type: 'MultibandComp', enabled: true, wet: 100, parameters: { lowCrossover: 200, highCrossover: 4000, lowThreshold: -18, midThreshold: -14, highThreshold: -12, lowRatio: 5, midRatio: 3, highRatio: 2.5, lowGain: 3, midGain: -1, highGain: 3.5 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 20, parameters: { drive: 30, tone: 12000 } },
    ] },

  // ═══ RETRO HARDWARE — AMIGA CHIPTUNE / EXOTIC ═══
  { name: 'Chipgold', description: 'Fat bass + harmonic sparkle — clean chip enhancement with sub weight', tags: ['Amiga', 'Clean', 'Bass'],
    effects: [
      { category: 'wasm', type: 'BassEnhancer', enabled: true, wet: 100, parameters: { frequency: 80, amount: 0.55, drive: 0.2, mix: 0.5 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 1, mid: 1.5, high: 0.5, lowFrequency: 200, highFrequency: 5000 } },
      { category: 'wasm', type: 'Exciter', enabled: true, wet: 100, parameters: { frequency: 6000, amount: 0.2, blend: 0.2, ceil: 13000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.25 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 10, parameters: { damping: 0.5, density: 0.5, bandwidth: 0.7, decay: 0.25, predelay: 0.0, size: 0.35, gain: 1.0, mix: 0.3, earlyMix: 0.7 } },
    ] },
  { name: 'Paula Sings', description: '8-bit made gorgeous — fat low end, air restoration, tape warmth, space', tags: ['Amiga', 'Warm', 'Bass'],
    effects: [
      { category: 'wasm', type: 'BassEnhancer', enabled: true, wet: 100, parameters: { frequency: 85, amount: 0.5, drive: 0.2, mix: 0.45 } },
      { category: 'wasm', type: 'Exciter', enabled: true, wet: 100, parameters: { frequency: 5500, amount: 0.2, blend: 0.2, ceil: 12000 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 18, parameters: { drive: 20, tone: 8000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2.5, attack: 0.01, release: 0.2 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 15, parameters: { damping: 0.4, density: 0.6, bandwidth: 0.6, decay: 0.35, predelay: 0.015, size: 0.45, gain: 1.0, mix: 0.35, earlyMix: 0.6 } },
    ] },
  { name: 'Retro Arcade', description: 'Bass-heavy punchy chip — transient snap, mid-presence, energetic', tags: ['Amiga', 'Loud', 'Bass'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.5, high: 0.5, lowFrequency: 200, highFrequency: 6000 } },
      { category: 'wasm', type: 'TransientDesigner', enabled: true, wet: 100, parameters: { attack: 0.4, sustain: -0.15, output: 0.85 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 4, attack: 0.003, release: 0.1 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 10, parameters: { drive: 20, tone: 11000 } },
    ] },
  { name: 'Exotic Shimmer', description: 'Fat bottom + ethereal ascending reverb — TFMX/FC/Hippel ambient', tags: ['Amiga', 'Ambient', 'Bass'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.0, high: 0.5 } },
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 15, parameters: { frequency: 0.3, depth: 0.2 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 2, attack: 0.02, release: 0.3 } },
      { category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 20, parameters: { decay: 60, shimmer: 40, pitch: 12, damping: 50, size: 65, predelay: 20, modRate: 15, modDepth: 10 } },
    ] },

  // ═══ RETRO HARDWARE — C64 SID ═══
  { name: 'SID Shredder', description: 'SID as guitar lead — Mesa high gain, compression, spring reverb', tags: ['C64', 'Amp', 'Guitar'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 45, neuralModelIndex: 11, parameters: { drive: 55, level: 100, presence: 60 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.003, release: 0.1 } },
      { category: 'wasm', type: 'SpringReverb', enabled: true, wet: 20, parameters: { decay: 0.45, damping: 0.4, tension: 0.5, mix: 0.3, drip: 0.4, diffusion: 0.6 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.5, high: 0.5 } },
    ] },
  { name: 'SID Stadium', description: 'Epic SID — massive plate reverb, wide stereo, arena compression', tags: ['C64', 'Wide', 'Space'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.5, high: 1.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3.5, attack: 0.008, release: 0.18 } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 20, parameters: { damping: 0.35, density: 0.7, bandwidth: 0.6, decay: 0.55, predelay: 0.03, size: 0.8, gain: 1.0, mix: 0.4, earlyMix: 0.4 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.65 } },
    ] },
  { name: 'SID Bass Machine', description: 'SID bass made to pound — sub enhancement, saturation, tight compression', tags: ['C64', 'Bass', 'Loud'],
    effects: [
      { category: 'wasm', type: 'BassEnhancer', enabled: true, wet: 100, parameters: { frequency: 70, amount: 0.75, drive: 0.35, mix: 0.65 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 35, parameters: { drive: 45, tone: 7000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 5, attack: 0.005, release: 0.1 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.0, high: -0.5 } },
    ] },
  { name: 'SID Acid Trip', description: 'Psychedelic SID — phaser swirl, tape echo, plate reverb', tags: ['C64', 'Creative', 'Modulation'],
    effects: [
      { category: 'tonejs', type: 'BiPhase', enabled: true, wet: 30, parameters: { rateA: 0.25, depthA: 0.7, rateB: 2.5, depthB: 0.5, feedback: 0.45, routing: 0 } },
      { category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30, parameters: { mode: 3, rate: 350, intensity: 0.5, echoVolume: 0.75, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4d' } },
      { category: 'wasm', type: 'MVerb', enabled: true, wet: 18, parameters: { damping: 0.35, density: 0.6, bandwidth: 0.5, decay: 0.5, predelay: 0.025, size: 0.65, gain: 1.0, mix: 0.35, earlyMix: 0.4 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: 0, high: 1 } },
    ] },
  { name: 'SID Raw Power', description: 'Minimal SID authority — bass boost, hard compression, no frills', tags: ['C64', 'Loud', 'Compression'],
    effects: [
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 0.0, high: 0.5, lowFrequency: 100, highFrequency: 6000 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -12, ratio: 6, attack: 0.003, release: 0.1 } },
      { category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 12, parameters: { drive: 30, tone: 11000 } },
    ] },
  { name: 'SID Crunch Box', description: 'Aggressive SID — Friedman BE-OD crunch, tight compression, presence', tags: ['C64', 'Grit', 'Amp'],
    effects: [
      { category: 'neural', type: 'Neural', enabled: true, wet: 35, neuralModelIndex: 9, parameters: { drive: 45, tone: 55, level: 100 } },
      { category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2.0, mid: 1.0, high: 1.5 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -14, ratio: 4, attack: 0.004, release: 0.12 } },
    ] },
  { name: 'SID Neon Nights', description: 'Synthwave SID — chorus thickening, tube warmth, delay, wide stereo', tags: ['C64', 'Modulation', 'Wide'],
    effects: [
      { category: 'tonejs', type: 'Chorus', enabled: true, wet: 25, parameters: { frequency: 1.2, delayTime: 3.5, depth: 0.5 } },
      { category: 'tonejs', type: 'Chebyshev', enabled: true, wet: 8, parameters: { order: 2 } },
      { category: 'tonejs', type: 'Delay', enabled: true, wet: 20, parameters: { delayTime: 0.375, feedback: 0.3, maxDelay: 2 } },
      { category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 } },
      { category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.6 } },
    ] },
];

// ── Compatibility re-exports ────────────────────────────────────────────────

let _compatId = 0;
function withIds(effects: Omit<EffectConfig, 'id'>[]): EffectConfig[] {
  return effects.map(e => ({ ...e, id: `fxp-${_compatId++}` }) as EffectConfig);
}

/** @deprecated Use FxPreset and FX_PRESETS instead */
export type MasterFxPreset = { name: string; description: string; category: string; effects: Omit<EffectConfig, 'id'>[] };
/** @deprecated Use FX_PRESETS instead */
export const MASTER_FX_PRESETS: MasterFxPreset[] = FX_PRESETS.map(p => ({ name: p.name, description: p.description, category: p.tags[0], effects: p.effects }));

/** @deprecated */ export type InstrumentFxCategory = string;
/** @deprecated */ export type InstrumentFxPreset = { name: string; description: string; category: string; effects: Omit<EffectConfig, 'id'>[] };
/** @deprecated */ export const INSTRUMENT_FX_PRESETS: InstrumentFxPreset[] = FX_PRESETS.map(p => ({ name: p.name, description: p.description, category: p.tags[0], effects: p.effects }));

/** @deprecated */ export type ChannelFxPreset = { name: string; description: string; category: string; effects: EffectConfig[] };
/** @deprecated */ export const CHANNEL_FX_PRESETS: ChannelFxPreset[] = FX_PRESETS.map(p => ({ name: p.name, description: p.description, category: p.tags[0], effects: withIds(p.effects) }));

/** @deprecated */ export type SendBusPreset = { name: string; description: string; category: string; effects: EffectConfig[] };
/** @deprecated */ export const SEND_BUS_PRESETS: SendBusPreset[] = FX_PRESETS.map(p => ({ name: p.name, description: p.description, category: p.tags[0], effects: withIds(p.effects) }));

// ── Utility functions ───────────────────────────────────────────────────────

export function getPresetsByTag(tag: FxTag): FxPreset[] { return FX_PRESETS.filter(p => p.tags.includes(tag)); }

export function getPresetsByCategory(): Record<string, FxPreset[]> {
  const g: Record<string, FxPreset[]> = {};
  for (const p of FX_PRESETS) { const c = p.tags[0]; if (!g[c]) g[c] = []; g[c].push(p); }
  return g;
}

/** @deprecated */ export function getChannelFxPresetsByCategory(): Record<string, ChannelFxPreset[]> {
  const g: Record<string, ChannelFxPreset[]> = {};
  for (const p of CHANNEL_FX_PRESETS) { if (!g[p.category]) g[p.category] = []; g[p.category].push(p); }
  return g;
}

/** @deprecated */ export function getSendBusPresetsByCategory(): Record<string, SendBusPreset[]> {
  const g: Record<string, SendBusPreset[]> = {};
  for (const p of SEND_BUS_PRESETS) { if (!g[p.category]) g[p.category] = []; g[p.category].push(p); }
  return g;
}

export function getAllTags(): FxTag[] {
  const tags = new Set<FxTag>();
  for (const p of FX_PRESETS) for (const t of p.tags) tags.add(t);
  return Array.from(tags);
}
